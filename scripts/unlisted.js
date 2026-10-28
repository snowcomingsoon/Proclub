'use strict';
// Partite giocate ma NON restituite da EA nelle liste `clubs/matches`: si ricostruiscono dai contatori cumulativi.
// Totali correnti - totali di riferimento (base) - contributo esatto delle partite ARCHIVIATE dopo il cutoff = partite non listate.
// Funzioni pure: nessun accesso a file o orologio.

const GRACE_MS = 12 * 3600 * 1000;               // stessa tolleranza del write-off del club in integrity.js
const CLUB_KEYS = ['gamesPlayed', 'wins', 'ties', 'losses', 'goals', 'goalsAgainst'];
const PLAYER_KEYS = ['gamesPlayed', 'goals', 'assists', 'manOfTheMatch', 'redCards'];
const FINALS_CAP = 200, FINALS_PUBLIC = 20;

const norm = (s) => String(s || '').trim().toLowerCase();
const num = (v) => (v !== '' && v != null && Number.isFinite(Number(v)) ? Number(v) : null);
const clone = (v) => JSON.parse(JSON.stringify(v));
const expired = (first, now) => !!first && Date.parse(now) - Date.parse(first) >= GRACE_MS;
const maxTimestamp = (history) => Math.max(0, ...(history || []).map((m) => Number(m.timestamp) || 0));

/** Totali del club (null se un contatore manca o non è numerico). */
function clubTotals(club) {
  const out = {};
  for (const k of CLUB_KEYS) { const v = num(club?.[k]); if (v == null || v < 0) return null; out[k] = v; }
  return out;
}
/** Totali per Pro, chiave = nome minuscolo. I Pro con gamesPlayed non valido sono esclusi. */
function playerTotals(members) {
  const out = {};
  for (const m of members?.members || []) {
    if (!m?.name || num(m.gamesPlayed) == null) continue;
    const row = {};
    for (const k of PLAYER_KEYS) row[k] = Math.max(0, num(m[k]) ?? 0);
    out[norm(m.name)] = row;
  }
  return out;
}

/** Snapshot di riferimento dai dati correnti: totali + cutoff = timestamp massimo delle partite archiviate. */
function snapshotOf(data, cutoff = maxTimestamp(data?.matchHistory)) {
  const club = clubTotals(data?.club?.[0]);
  return club ? {club, players: playerTotals(data.members), cutoff} : null;
}

/** Esito di una partita dal blocco del club (wins/ties/losses, altrimenti dal punteggio). */
function outcome(block) {
  const goals = num(block.goals), against = num(block.goalsAgainst);
  let w = num(block.wins), t = num(block.ties), l = num(block.losses);
  if (w == null || t == null || l == null) {
    if (goals == null || against == null) return null;
    w = goals > against ? 1 : 0; t = goals === against ? 1 : 0; l = goals < against ? 1 : 0;
  }
  return {wins: w, ties: t, losses: l, goals: goals ?? 0, goalsAgainst: against ?? 0};
}

/** Contributo esatto delle partite archiviate con timestamp > cutoff (esito dal blocco clubs, presenze dal blocco players). */
function archivedAfter(history, clubId, cutoff) {
  const club = {gamesPlayed: 0, wins: 0, ties: 0, losses: 0, goals: 0, goalsAgainst: 0};
  const players = {};
  for (const m of history || []) {
    if (!(Number(m.timestamp) > cutoff)) continue;
    const block = m.clubs?.[clubId], o = block && outcome(block);
    if (!o) continue;
    club.gamesPlayed++; club.wins += o.wins; club.ties += o.ties; club.losses += o.losses; club.goals += o.goals; club.goalsAgainst += o.goalsAgainst;
    for (const p of Object.values(m.players?.[clubId] || {})) {
      if (!p?.playername) continue;
      const row = players[norm(p.playername)] ||= {gamesPlayed: 0, goals: 0, assists: 0, manOfTheMatch: 0, redCards: 0};
      row.gamesPlayed++; row.goals += num(p.goals) || 0; row.assists += num(p.assists) || 0; row.manOfTheMatch += num(p.mom) || 0; row.redCards += num(p.redcards) || 0;
    }
  }
  return {club, players};
}

/**
 * Deficit attuale = correnti - base - archiviate dopo il cutoff.
 * Ritorna {ok:true, pending:null|{games,wins,ties,losses,goalsFor,goalsAgainst,players[]}} oppure {ok:false, reason}
 * quando i contatori sono incoerenti (lettura arretrata, partite non ancora sommate dai contatori...): in quel caso non si deduce nulla.
 */
function deficit(base, data, clubId) {
  const now = clubTotals(data?.club?.[0]);
  if (!base?.club || !now) return {ok: false, reason: 'contatori del club non disponibili'};
  const arch = archivedAfter(data.matchHistory, clubId, Number(base.cutoff) || 0);
  const d = {};
  for (const k of CLUB_KEYS) d[k] = now[k] - base.club[k] - arch.club[k];
  const bad = CLUB_KEYS.filter((k) => d[k] < 0);
  if (bad.length) return {ok: false, reason: `deficit negativo (${bad.join(', ')}): contatori incoerenti o lettura arretrata`};
  if (d.wins + d.ties + d.losses !== d.gamesPlayed) return {ok: false, reason: 'vittorie, pareggi e sconfitte non tornano con le partite'};
  const current = playerTotals(data.members), players = [];
  for (const [key, cur] of Object.entries(current)) {
    const prev = base.players?.[key] || {}, got = arch.players[key] || {};
    const row = {};
    for (const k of PLAYER_KEYS) row[k] = cur[k] - (prev[k] || 0) - (got[k] || 0);
    const negative = PLAYER_KEYS.filter((k) => row[k] < 0);
    if (negative.length) return {ok: false, reason: `deficit negativo per ${key} (${negative.join(', ')})`};
    if (row.gamesPlayed || row.goals || row.assists || row.manOfTheMatch || row.redCards) {
      const name = (data.members.members.find((m) => norm(m.name) === key) || {}).name || key;
      players.push({name, games: row.gamesPlayed, goals: row.goals, assists: row.assists, motm: row.manOfTheMatch, reds: row.redCards});
    }
  }
  if (!d.gamesPlayed) return {ok: true, pending: null};
  players.sort((a, b) => b.games - a.games || b.goals - a.goals || b.assists - a.assists || a.name.localeCompare(b.name));
  return {ok: true, pending: {games: d.gamesPlayed, wins: d.wins, ties: d.ties, losses: d.losses, goalsFor: d.goals, goalsAgainst: d.goalsAgainst, players}};
}

/** Stato iniziale (da una lettura corrente, o da un seed già validato). */
function initialize(data, {seed = null, clubId} = {}) {
  const usable = seed && validateSeed(seed, data, clubId).ok;
  const base = usable ? {club: clone(seed.club), players: clone(seed.players), cutoff: seed.cutoff} : snapshotOf(data);
  return base ? {base, since: null, invalidSince: null, finals: []} : null;
}

/** Il seed vale solo se coerente con lo storico e con i contatori attuali. */
function validateSeed(seed, data, clubId) {
  if (!seed?.club || !seed?.players || !Number.isFinite(Number(seed.cutoff))) return {ok: false, reason: 'seed incompleto'};
  const base = {club: seed.club, players: seed.players, cutoff: Number(seed.cutoff)};
  if (!clubTotals(base.club)) return {ok: false, reason: 'seed: contatori del club non validi'};
  for (const row of Object.values(base.players)) if (PLAYER_KEYS.some((k) => num(row?.[k]) == null || row[k] < 0)) return {ok: false, reason: 'seed: contatori dei Pro non validi'};
  if (base.cutoff > maxTimestamp(data?.matchHistory)) return {ok: false, reason: 'seed successivo allo storico'};
  const now = clubTotals(data?.club?.[0]);
  if (!now || base.club.gamesPlayed > now.gamesPlayed) return {ok: false, reason: 'seed con più partite dei contatori attuali'};
  const d = deficit(base, data, clubId);
  return d.ok ? {ok: true} : {ok: false, reason: d.reason};
}

/**
 * Un passo di riconciliazione. `previous`: stato `unlisted` del ledger (o null → inizializza/seed).
 * `hint`: primo avvistamento del deficit già noto da altre fonti (es. problema club-matches), usato come `since`.
 * Ritorna {state, summary:{pending, final[], warning?}}.
 */
function step(previous, data, clubId, now, {seed = null, hint = null} = {}) {
  let state = previous ? clone(previous) : initialize(data, {seed, clubId});
  if (!state) return {state: null, summary: {pending: null, final: [], warning: 'contatori del club non disponibili'}};
  state.finals ||= [];
  const result = deficit(state.base, data, clubId);
  let pending = null, warning;
  if (!result.ok) {
    warning = result.reason;
    state.invalidSince ||= now;
    // Un riferimento che resta incoerente non si recupera da solo: dopo la tolleranza si ricomincia dai contatori attuali.
    if (expired(state.invalidSince, now)) {
      const fresh = snapshotOf(data);
      if (fresh) { state.base = fresh; state.invalidSince = null; state.since = null; warning = undefined; }
    }
  } else {
    state.invalidSince = null;
    pending = result.pending;
    if (!pending) state.since = null;
    else {
      state.since ||= hint && Date.parse(hint) < Date.parse(now) ? hint : now;
      if (expired(state.since, now)) {
        state.finals.push({at: now, since: state.since, ...pending});
        state.finals = state.finals.slice(-FINALS_CAP);
        state.base = snapshotOf(data);
        state.since = null;
        pending = null;
      }
    }
  }
  const summary = {pending: pending ? {since: state.since, ...pending} : null, final: state.finals.slice(-FINALS_PUBLIC)};
  if (warning) summary.warning = warning;
  return {state, summary};
}

module.exports = {GRACE_MS, CLUB_KEYS, PLAYER_KEYS, snapshotOf, archivedAfter, deficit, initialize, validateSeed, step};
