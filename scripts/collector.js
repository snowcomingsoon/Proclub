'use strict';
// Raccolta EA: legge club/membri/partite, valida, riconosce il cambio stagione, aggiorna data/ e genera il contratto pubblico.
const fs = require('node:fs');
const path = require('node:path');
const {mergeHistory, notify} = require('./lib');
const {initialize, reconcile} = require('./integrity');
const {createEaClient} = require('./ea-client');
const {loadConfig, ROOT} = require('./config');
const {readJson, writeJson, sleep} = require('./fsx');
const {classifyCounters, observeSeason, changeSeason, currentSeason} = require('./season');
const {writeMatchFiles, updateIndex, monthlyBackup} = require('./archive');
const {failuresOf, crashHealth} = require('./health');
const {buildPublic, writePublic, HEARTBEAT_MS} = require('./build-public');

const norm = (s) => String(s || '').trim().toLowerCase();
// Campi che cambiano a ogni lettura senza che i dati cambino: non giustificano da soli un nuovo commit.
const VOLATILE_KEYS = new Set(['capturedAt', 'checkedAt', 'lastSeen', 'attempts', 'timeAgo']);
const sigOf = (value) => JSON.stringify(value, (key, v) => (VOLATILE_KEYS.has(key) ? undefined : v));
const clone = (value) => JSON.parse(JSON.stringify(value));

function pathsFor(root) {
  const d = (...p) => path.join(root, 'data', ...p);
  return {
    data: d('data.json'), ledger: d('collection-ledger.json'), sync: d('sync-status.json'), candidate: d('season-candidate.json'),
    seasons: d('seasons'), matches: d('matches'), archiveIndex: d('archive', 'index.json'), backups: d('backups'), publicDir: d('public'),
  };
}

/**
 * Esegue una raccolta. Dipendenze iniettabili per i test: {root, fetch, wait, now, config, engine, log}.
 * Ritorna {exitCode, failures, stale, ...}: non lancia mai (gli errori finiscono in health.json).
 */
async function run(opts = {}) {
  const cfg = opts.config || loadConfig(opts.env || process.env);
  const root = opts.root || ROOT, log = opts.log || console, nowFn = opts.now || (() => new Date().toISOString());
  const P = pathsFor(root);
  const previousHealth = readJson(path.join(P.publicDir, 'health.json'), null);
  try {
    return await collect({cfg, root, log, nowFn, P, previousHealth, fetchImpl: opts.fetch || fetch, wait: opts.wait || sleep, engine: opts.engine});
  } catch (e) {
    log.error(e.message);
    try { writeJson(path.join(P.publicDir, 'health.json'), crashHealth({previous: previousHealth, now: nowFn(), error: e})); } catch { /* niente da fare */ }
    return {exitCode: 1, error: e.message, failures: {crash: e.message}, stale: {}};
  }
}

async function collect({cfg, log, nowFn, P, previousHealth, fetchImpl, wait, engine}) {
  const CLUB_ID = cfg.clubId;
  const client = createEaClient({fetchImpl, wait, platform: cfg.platform, clubId: CLUB_ID});
  let stored = readJson(P.data);              // ultimo snapshot su disco
  let old = stored;                           // riferimento per le letture arretrate (si rinnova a un cambio stagione)
  const savedLedger = readJson(P.ledger, null);
  let storedLedgerSig = savedLedger ? sigOf(savedLedger) : null;
  // Un ledger di versione precedente, o assente, si ricostruisce dalla PRIMA lettura fresca e coerente di questa esecuzione.
  let original = savedLedger && savedLedger.version === 2 ? savedLedger : null;
  // I giri ripetuti (e il secondo tentativo dopo una raccolta incompleta) cambiano solo orari e numero di tentativi: non sono novità.
  const syncSigOf = (o) => JSON.stringify(o, (k, v) => (k === 'checkedAt' || k === 'lastSeen' || k === 'attempts' ? undefined : v));
  const savedSync = readJson(P.sync, null);
  let storedSyncSig = savedSync ? syncSigOf(savedSync) : null;
  let pending = readJson(P.candidate, null);  // candidato cambio stagione in attesa di conferma
  const stale = {};
  const failures = {};
  const freshById = new Map();
  const fetched = new Map();
  let next = {...stored}, summary, state = null, attempts = 0, seasonEvent = null, cutoffTs = null;
  next.season = currentSeason(stored, nowFn());

  let syncWritten = false;
  const persist = () => {
    const now = nowFn();
    const due = Date.parse(now) - Date.parse(stored.capturedAt || 0) >= HEARTBEAT_MS;
    const ledgerSig = state ? sigOf(state) : null;
    const wrote = sigOf(next) !== sigOf(stored) || due || !!seasonEvent;
    if (wrote) {
      writeJson(P.data, next);
      stored = clone(next);
      if (state) { writeJson(P.ledger, state); storedLedgerSig = ledgerSig; }
    } else if (state && ledgerSig !== storedLedgerSig) { writeJson(P.ledger, state); storedLedgerSig = ledgerSig; }
    const syncObj = {checkedAt: summary.checkedAt, complete: next.collectionStatus.complete, failures: {...failures}, stale: {...stale}, integrity: summary, attempts};
    // Il numero di tentativi conta solo se in questa esecuzione il file è già stato riscritto (così riflette l'ultimo giro).
    const syncSig = syncSigOf(syncObj) + (syncWritten ? `|a${attempts}` : '');
    if (wrote || syncSig !== storedSyncSig) { writeJson(P.sync, syncObj); storedSyncSig = syncSigOf(syncObj) + `|a${attempts}`; syncWritten = true; }
    if (pending) writeJson(P.candidate, pending); else if (fs.existsSync(P.candidate)) fs.unlinkSync(P.candidate);
  };

  for (let round = 0; round < 2; round++) {
    attempts++;
    const specs = client.specs();
    const results = await Promise.allSettled(specs.map(([, endpoint, params, validate]) => client.ea(endpoint, params, validate)));
    let seasonHold = false;

    // Cambio stagione: contatori di club e Pro tornati insieme quasi a zero, confermati da 2 letture consecutive.
    if (results[0].status === 'fulfilled' && results[1].status === 'fulfilled') {
      const cls = classifyCounters({old, ledger: original, club: results[0].value, members: results[1].value});
      const obs = observeSeason(pending, cls.kind, cls.games, nowFn());
      pending = obs.pending;
      if (obs.confirmed) {
        const change = changeSeason({old: stored, ledger: original, club: results[0].value, members: results[1].value, now: nowFn(), seasonsDir: P.seasons});
        // Le partite della stagione conclusa restano per sempre nell'archivio per partita.
        writeMatchFiles(P.matches, stored.matchHistory || []); updateIndex(P.archiveIndex, stored.matchHistory || [], CLUB_ID);
        seasonEvent = change; cutoffTs = change.endedAt;
        next = {...change.data}; old = {...next}; original = null; state = null; pending = null;
        fetched.clear(); for (const k of Object.keys(failures)) delete failures[k]; for (const k of Object.keys(stale)) delete stale[k];
        log.warn(`Cambio stagione EA riconosciuto: archiviata ${change.archivedId}, nuova ${change.season.id}.`);
      } else if (cls.kind === 'reset') seasonHold = true;
    }

    const collected = [];
    results.forEach((result, i) => {
      const key = specs[i][0];
      if (result.status === 'rejected') { failures[key] = String(result.reason.message || result.reason); return; }
      delete failures[key];
      // EA a volte risponde con un contatore arretrato: mai sovrascrivere dati più recenti con esso.
      if (key === 'club' && Number(result.value[0].gamesPlayed) < Math.max(Number(old.club?.[0]?.gamesPlayed) || 0, original?.club?.highWater || 0)) { stale.club = seasonHold ? 'possibile cambio stagione: in attesa di conferma' : 'contatore del club arretrato'; return; }
      if (key === 'members') {
        const floor = new Map((old.members?.members || []).map((m) => [norm(m.name), Number(m.gamesPlayed) || 0]));
        for (const p of Object.values(original?.players || {})) floor.set(norm(p.name), Math.max(floor.get(norm(p.name)) || 0, p.highWater));
        if (result.value.members.some((m) => Number(m.gamesPlayed) < (floor.get(norm(m.name)) || 0))) { stale.members = seasonHold ? 'possibile cambio stagione: in attesa di conferma' : 'contatori dei giocatori arretrati'; return; }
      }
      delete stale[key]; fetched.set(key, true);
      if (key === 'club' || key === 'members') next[key] = result.value;
      else {
        // EA elenca solo le ultime 10 partite per modalità: una lista piena che non condivide nulla con l'archivio indica possibili buchi.
        const known = new Set((old.matchHistory || []).map((m) => String(m.matchId)));
        if (result.value.length >= 10 && known.size && !result.value.some((m) => known.has(String(m.matchId)))) failures[key + 'Overflow'] = 'lista EA piena senza partite già note: possibili partite perse'; else delete failures[key + 'Overflow'];
        // Con un cambio stagione in attesa di conferma le partite non vengono ancora unite: potrebbero appartenere alla nuova stagione.
        if (!seasonHold) collected.push(...result.value.filter((m) => cutoffTs == null || Number(m.timestamp) > cutoffTs).map((m) => ({...m, sourceMatchType: key})));
      }
    });
    const merged = mergeHistory(next.matchHistory || [], collected);
    next.matchHistory = merged.history;
    for (const m of merged.fresh) freshById.set(String(m.matchId), m);
    // Conserva i risultati recenti anche di una competizione temporaneamente non disponibile.
    next.matches = mergeHistory(next.matches || [], collected).history.slice(0, 30);
    if (!original && fetched.has('club') && fetched.has('members') && !stale.club && !stale.members) original = initialize(next, CLUB_ID, nowFn());
    if (original) { delete failures.ledger; ({state, summary} = reconcile(original, next, CLUB_ID, nowFn())); }
    else { failures.ledger = 'riferimento iniziale non disponibile: letture EA mancanti o arretrate'; const at = nowFn(); summary = {startedAt: at, checkedAt: at, issues: [], players: [], healthy: true}; }
    if (fetched.size) next.capturedAt = nowFn();
    next.collectionStatus = {...summary, endpointFailures: {...failures}, stale: {...stale}, attempts, complete: !Object.keys(failures).length && summary.healthy};
    persist();
    if (next.collectionStatus.complete && !seasonHold) break;
    if (round === 0) { log.warn('Raccolta incompleta o in verifica: nuovo tentativo tra 15 secondi.'); await wait(15000); }
  }
  if (Object.keys(stale).length) log.warn('Letture EA arretrate ignorate:', JSON.stringify(stale));

  // Archivio e backup (non bloccano la pubblicazione: l'errore finisce in health.json).
  const status = next.collectionStatus, warnings = [];
  try {
    writeMatchFiles(P.matches, stored.matchHistory || []);
    updateIndex(P.archiveIndex, stored.matchHistory || [], CLUB_ID);
    warnings.push(...monthlyBackup({dir: P.backups, dataFile: P.data, now: nowFn(), tz: cfg.timezone}).warnings);
  } catch (e) { status.endpointFailures = {...status.endpointFailures, archive: `archivio: ${e.message}`}; }
  try {
    const {files, engine: engineState} = await buildPublic(stored, nowFn(), {status, previousHealth, advance: true, clubId: CLUB_ID, tz: cfg.timezone, nightEndsAtHour: cfg.nightEndsAtHour, engine});
    writePublic(P.publicDir, files, {now: nowFn()});
    if (!engineState.ok) log.warn('Motore insights in errore (raccolta non bloccata):', engineState.error);
  } catch (e) { status.endpointFailures = {...status.endpointFailures, public: `dati pubblici: ${e.message}`}; }
  try { await notify([...freshById.values()], CLUB_ID); } catch { /* notifiche opzionali */ }

  const allFailures = failuresOf(status);
  for (const w of warnings) log.warn(w);
  log.log(JSON.stringify({attempts, failures: allFailures, stale, issues: summary.issues, newMatches: freshById.size, season: next.season?.id, seasonChange: seasonEvent ? seasonEvent.archivedId : undefined}));
  return {exitCode: Object.keys(allFailures).length ? 1 : 0, failures: allFailures, stale, attempts, status, season: next.season, seasonChange: seasonEvent ? {from: seasonEvent.archivedId, to: seasonEvent.season.id} : null, warnings};
}

module.exports = {run, sigOf, pathsFor};
