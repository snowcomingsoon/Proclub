'use strict';
// Riconoscimento del cambio stagione EA: reset simultaneo dei contatori di club e Pro (distinto da una lettura arretrata transitoria).
const fs = require('node:fs');
const path = require('node:path');

const norm = (s) => String(s || '').trim().toLowerCase();
const num = (v) => (v !== '' && v != null && Number.isFinite(Number(v)) ? Number(v) : null);
const MIN_OLD_GAMES = 10;      // sotto questa soglia un calo non è distinguibile da rumore
const CLUB_RATIO = 0.25;       // il club deve ripartire da meno di un quarto delle partite precedenti
const MEMBER_SHARE = 0.8;      // quota dei Pro (con >=3 presenze prima) che devono essere tornati indietro
const CONFIRM_READS = 2;       // letture consecutive necessarie

/** Id stagione 'YYYY-YY' dalla data: le stagioni FC partono in autunno (da luglio in poi appartengono all'anno che inizia). */
function seasonIdFor(when) {
  const d = new Date(typeof when === 'number' && when < 1e11 ? when * 1000 : when);
  const start = d.getUTCMonth() + 1 >= 7 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** Stagione registrata nel dato; se manca, dedotta dalla prima partita in archivio (o da `fallbackNow`). */
function currentSeason(data, fallbackNow) {
  if (data?.season?.id) return {id: data.season.id, startedAt: data.season.startedAt || null, lastChange: data.season.lastChange || null, ...(data.season.previous ? {previous: data.season.previous} : {})};
  const stamps = (data?.matchHistory || []).map((m) => Number(m.timestamp)).filter(Boolean);
  const first = stamps.length ? Math.min(...stamps) : null;
  const startedAt = first ? new Date(first * 1000).toISOString() : fallbackNow;
  return {id: seasonIdFor(startedAt), startedAt, lastChange: null};
}

/** Confronta la lettura EA con lo stato noto: 'none' | 'stale' (lettura arretrata) | 'reset' (candidato cambio stagione). */
function classifyCounters({old, ledger, club, members}) {
  const oldGames = Math.max(num(old?.club?.[0]?.gamesPlayed) || 0, ledger?.club?.highWater || 0);
  const games = num(club?.[0]?.gamesPlayed);
  if (games == null) return {kind: 'none'};
  const floor = new Map((old?.members?.members || []).map((m) => [norm(m.name), num(m.gamesPlayed) || 0]));
  for (const p of Object.values(ledger?.players || {})) floor.set(norm(p.name), Math.max(floor.get(norm(p.name)) || 0, p.highWater || 0));
  const list = members?.members || [];
  const regressed = list.filter((m) => (num(m.gamesPlayed) ?? 0) < (floor.get(norm(m.name)) || 0));
  const clubRegressed = games < oldGames;
  if (!clubRegressed && !regressed.length) return {kind: 'none'};
  const known = list.filter((m) => (floor.get(norm(m.name)) || 0) >= 3);
  const regressedKnown = known.filter((m) => (num(m.gamesPlayed) ?? 0) < floor.get(norm(m.name)));
  const bounded = list.every((m) => (num(m.gamesPlayed) ?? 0) <= Math.max(games, 3));
  const reset = clubRegressed && oldGames >= MIN_OLD_GAMES && games <= Math.max(3, Math.floor(oldGames * CLUB_RATIO))
    && known.length > 0 && regressedKnown.length / known.length >= MEMBER_SHARE && bounded;
  return {kind: reset ? 'reset' : 'stale', games, oldGames};
}

/** Registra l'osservazione: il cambio è confermato solo dopo 2 letture consecutive coerenti. */
function observeSeason(pending, kind, games, now) {
  if (kind !== 'reset') return {pending: null, confirmed: false};
  const continues = pending && games >= (pending.clubGames ?? 0);
  const next = continues
    ? {...pending, reads: pending.reads + 1, lastSeen: now, clubGames: games}
    : {firstSeen: now, lastSeen: now, reads: 1, clubGames: games};
  return {pending: next, confirmed: next.reads >= CONFIRM_READS};
}

const safeId = (id) => String(id).replace(/[^\w.-]/g, '_');

/**
 * Archivia lo snapshot della stagione conclusa in <seasonsDir>/<id>.json (idempotente) e ritorna il nuovo stato.
 * `old` è lo snapshot corrente completo (data.json); `club`/`members` le prime letture della nuova stagione.
 */
function changeSeason({old, ledger, club, members, now, seasonsDir}) {
  const ended = currentSeason(old, now);
  const endedAt = Math.max(0, ...(old.matchHistory || []).map((m) => Number(m.timestamp) || 0)) || null;
  const nextBase = seasonIdFor(now);
  fs.mkdirSync(seasonsDir, {recursive: true});
  const archive = {version: 1, id: ended.id, startedAt: ended.startedAt, endedAt: endedAt ? new Date(endedAt * 1000).toISOString() : old.capturedAt || now, archivedAt: now, data: old, ledger: ledger || null};
  let file = path.join(seasonsDir, `${safeId(ended.id)}.json`);
  if (fs.existsSync(file)) {
    const existing = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (existing.data?.capturedAt !== old.capturedAt) {
      let n = 2;
      while (fs.existsSync(path.join(seasonsDir, `${safeId(ended.id)}-${n}.json`))) {
        const other = JSON.parse(fs.readFileSync(path.join(seasonsDir, `${safeId(ended.id)}-${n}.json`), 'utf8'));
        if (other.data?.capturedAt === old.capturedAt) break;
        n++;
      }
      archive.id = `${ended.id}-${n}`;
      file = path.join(seasonsDir, `${safeId(archive.id)}.json`);
    }
  }
  if (!fs.existsSync(file)) {
    const temp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(archive));
    fs.renameSync(temp, file);
  }
  // Id nuova stagione: se coincide con quella archiviata (reset a stagione "uguale") aggiunge un suffisso.
  let newId = nextBase;
  for (let n = 2; newId === ended.id || newId === archive.id || fs.existsSync(path.join(seasonsDir, `${safeId(newId)}.json`)); n++) newId = `${nextBase}-${n}`;
  const season = {id: newId, startedAt: now, lastChange: now, previous: archive.id};
  return {archivedId: archive.id, archiveFile: file, endedAt, season, data: {club, members, matches: [], matchHistory: [], season, capturedAt: now}};
}

module.exports = {seasonIdFor, currentSeason, classifyCounters, observeSeason, changeSeason, CONFIRM_READS};
