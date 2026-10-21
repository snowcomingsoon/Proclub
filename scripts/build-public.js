'use strict';
// Genera data/public/*: contratto dati pubblico derivato SOLO da data/data.json + motore shared/.
const fs = require('node:fs');
const path = require('node:path');
const {atomicWrite, readJson} = require('./fsx');
const {loadConfig, ROOT} = require('./config');
const {loadEngine, loadSession, engineVersion} = require('./engine');
const {buildHealth} = require('./health');
const {currentSeason} = require('./season');

const HEARTBEAT_MS = 50 * 60 * 1000;   // un file "vivo" viene riscritto al massimo una volta all'ora
const VOLATILE = new Set(['builtAt', 'checkedAt', 'lastSuccessAt']);

const byTimeDesc = (a, b) => Number(b.timestamp) - Number(a.timestamp) || String(a.matchId).localeCompare(String(b.matchId));
const byTimeAsc = (a, b) => Number(a.timestamp) - Number(b.timestamp) || String(a.matchId).localeCompare(String(b.matchId));

/** Serate: giorno (regola del sito, ora italiana, notte fino alle 06:00 nella serata precedente) → partite. */
function groupNights(history, sessionDay, tz, nightEndsAtHour) {
  const nights = new Map();
  for (const m of history) {
    const day = sessionDay(m.timestamp, tz, nightEndsAtHour);
    if (!nights.has(day)) nights.set(day, []);
    nights.get(day).push(m);
  }
  return [...nights.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([day, matches]) => ({day, matches: matches.sort(byTimeAsc)}));
}

/** Commenti da allenatore per ogni Pro attivo + analisi di squadra (senza il peso dei dati per-giocatore già in data). */
function buildInsights(data, now, engine, clubId, version) {
  const all = engine.buildAll(data, clubId);
  const coach = {};
  for (const metrics of all.filter((m) => m.games > 0).sort((a, b) => a.name.localeCompare(b.name))) coach[metrics.name.toLowerCase()] = engine.commentFor(metrics);
  const {players, weakestPlayer, ...club} = engine.analyzeClub(data, clubId, all);
  club.weakestPlayer = weakestPlayer ? {name: weakestPlayer.name, games: weakestPlayer.games, rating: weakestPlayer.rating} : null;
  return {version: 1, builtAt: now, engine: version, coach, club};
}

/**
 * Funzione pura (a parte il caricamento del motore): ritorna {files, engine} con i JSON del contratto.
 * opts: {status, previousHealth, advance, clubId, tz, nightEndsAtHour, engine (iniezione per test), engineVersion}.
 */
async function buildPublic(data, now, opts = {}) {
  const cfg = loadConfig();
  const clubId = opts.clubId || cfg.clubId, tz = opts.tz || cfg.timezone, nightEndsAtHour = opts.nightEndsAtHour ?? cfg.nightEndsAtHour;
  let engine = opts.engine, engineState = {ok: true};
  try { engine ||= await loadEngine(); } catch (e) { engineState = {ok: false, error: `caricamento motore: ${e.message}`}; }
  const sessionDay = (await loadSession()).sessionDay;
  const history = [...(data.matchHistory || [])].sort(byTimeDesc);
  const season = currentSeason(data, now);
  const nights = groupNights(history, sessionDay, tz, nightEndsAtHour);
  const files = {};

  files['summary.json'] = {
    version: 2, capturedAt: data.capturedAt || null, club: data.club || [], members: {members: data.members?.members || []},
    matches: [...(data.matches || [])].sort(byTimeDesc).slice(0, 30),
    nights: nights.map(({day, matches}) => ({day, games: matches.length, from: Number(matches[0].timestamp), to: Number(matches[matches.length - 1].timestamp)})),
    matchCount: history.length, season,
  };
  for (const {day, matches} of nights) files[`nights/${day}.json`] = {day, matches};
  files['history.json'] = {version: 1, matchHistory: history};

  if (engineState.ok) {
    try { files['insights.json'] = buildInsights(data, now, engine, clubId, opts.engineVersion || (() => { try { return engineVersion(); } catch { return 'unknown'; } })()); }
    catch (e) { engineState = {ok: false, error: String(e.message || e)}; }
  }
  const status = opts.status || data.collectionStatus || {};
  files['health.json'] = buildHealth({status, data, previous: opts.previousHealth, now, engine: engineState, advance: !!opts.advance, season});
  return {files, engine: engineState};
}

const sameContent = (a, b) => {
  const strip = (o) => JSON.stringify(Object.fromEntries(Object.entries(o).filter(([k]) => !VOLATILE.has(k))));
  return strip(a) === strip(b);
};

/**
 * Scrive i file in `dir` in modo atomico. Salta i file invariati (ignorando builtAt/checkedAt) a meno che il timestamp
 * non sia più vecchio di un'ora (heartbeat), così il repository non riceve commit inutili. Rimuove le serate non più presenti.
 */
function writePublic(dir, files, {now = new Date().toISOString(), heartbeatMs = HEARTBEAT_MS} = {}) {
  const written = [], unchanged = [], removed = [];
  for (const [rel, value] of Object.entries(files)) {
    const file = path.join(dir, rel);
    const existing = readJson(file, null);
    const stamp = existing && (existing.checkedAt || existing.builtAt);
    const stale = stamp && Date.parse(now) - Date.parse(stamp) >= heartbeatMs;
    if (existing && sameContent(existing, value) && !stale) { unchanged.push(rel); continue; }
    atomicWrite(file, JSON.stringify(value) + '\n');
    written.push(rel);
  }
  const nightsDir = path.join(dir, 'nights');
  if (fs.existsSync(nightsDir)) {
    for (const name of fs.readdirSync(nightsDir)) {
      if (name.endsWith('.json') && !(`nights/${name}` in files)) { fs.unlinkSync(path.join(nightsDir, name)); removed.push(`nights/${name}`); }
    }
  }
  return {written, unchanged, removed};
}

/** `npm run build:data`: rigenera data/public da data/data.json senza contare come una nuova esecuzione. */
async function main() {
  const dataFile = path.join(ROOT, 'data', 'data.json'), dir = path.join(ROOT, 'data', 'public');
  const data = readJson(dataFile);
  const now = new Date().toISOString();
  const {files, engine} = await buildPublic(data, now, {previousHealth: readJson(path.join(dir, 'health.json'), null), advance: false});
  const result = writePublic(dir, files, {now});
  if (!engine.ok) console.warn('Motore insights in errore:', engine.error);
  console.log(JSON.stringify({written: result.written.length, unchanged: result.unchanged.length, removed: result.removed.length}));
}

if (require.main === module) main().catch((e) => { console.error(e); process.exitCode = 1; });

module.exports = {buildPublic, writePublic, groupNights, buildInsights, HEARTBEAT_MS};
