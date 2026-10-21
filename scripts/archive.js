'use strict';
// Archivio immutabile: una partita per file (data/matches/<id>.json), indice, backup mensile compresso.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const {atomicWrite, readJson} = require('./fsx');
const {seasonKey} = require('./lib');

const empty = (v) => v == null || v === '';
const safeId = (id) => String(id).replace(/[^\w.-]/g, '_');

/** Completa `existing` con i campi di `incoming` che mancano: i valori già archiviati non vengono mai sovrascritti. */
function fillMissing(existing, incoming) {
  if (empty(existing)) return incoming;
  if (existing && typeof existing === 'object' && !Array.isArray(existing) && incoming && typeof incoming === 'object' && !Array.isArray(incoming)) {
    const out = {...existing};
    for (const [key, value] of Object.entries(incoming)) out[key] = fillMissing(existing[key], value);
    return out;
  }
  return existing;
}

/** Scrive/aggiorna data/matches/<matchId>.json solo se la partita aggiunge campi. Ritorna gli id creati/aggiornati. */
function writeMatchFiles(dir, history) {
  const created = [], updated = [];
  fs.mkdirSync(dir, {recursive: true});
  for (const match of history) {
    if (!match?.matchId) continue;
    const file = path.join(dir, `${safeId(match.matchId)}.json`);
    const existing = readJson(file, null);
    if (!existing) { atomicWrite(file, JSON.stringify(match) + '\n'); created.push(String(match.matchId)); continue; }
    const merged = fillMissing(existing, match);
    if (JSON.stringify(merged) !== JSON.stringify(existing)) { atomicWrite(file, JSON.stringify(merged) + '\n'); updated.push(String(match.matchId)); }
  }
  return {created, updated};
}

function indexEntry(m, clubId) {
  const c = m.clubs?.[clubId];
  const opp = Object.entries(m.clubs || {}).find(([id]) => id !== String(clubId));
  return {
    matchId: String(m.matchId), timestamp: m.timestamp, month: seasonKey(m.timestamp),
    opponent: opp?.[1]?.details?.name ?? null,
    goalsFor: Number(c?.goals ?? 0), goalsAgainst: Number(c?.goalsAgainst ?? 0), result: String(c?.result ?? ''),
  };
}

/** data/archive/index.json: tutte le partite mai archiviate (anche di stagioni precedenti), dalla più recente. */
function updateIndex(file, history, clubId) {
  const byId = new Map((readJson(file, []) || []).map((e) => [String(e.matchId), e]));
  for (const m of history) if (m?.matchId) byId.set(String(m.matchId), indexEntry(m, clubId));
  const index = [...byId.values()].sort((a, b) => b.timestamp - a.timestamp || String(a.matchId).localeCompare(String(b.matchId)));
  const text = JSON.stringify(index);
  let same = false;
  try { same = fs.readFileSync(file, 'utf8') === text; } catch { /* primo giro */ }
  if (!same) atomicWrite(file, text);
  return index;
}

/** Mese (YYYY-MM) di `now` nel fuso del club. */
function monthOf(now, tz) {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone: tz, year: 'numeric', month: '2-digit'}).formatToParts(new Date(now));
  return `${parts.find((p) => p.type === 'year').value}-${parts.find((p) => p.type === 'month').value}`;
}

/** Backup compresso dello snapshot completo, una volta al mese (al primo run del mese). */
function monthlyBackup({dir, dataFile, now, tz = 'Europe/Rome', warnBytes = 25 * 1024 * 1024}) {
  const file = path.join(dir, `${monthOf(now, tz)}.json.gz`);
  const warnings = [];
  let created = false;
  if (!fs.existsSync(file) && fs.existsSync(dataFile)) {
    fs.mkdirSync(dir, {recursive: true});
    atomicWrite(file, zlib.gzipSync(fs.readFileSync(dataFile), {level: 9}));
    created = true;
  }
  const total = fs.existsSync(dir) ? fs.readdirSync(dir).reduce((s, f) => s + fs.statSync(path.join(dir, f)).size, 0) : 0;
  if (total > warnBytes) warnings.push(`backup: ${(total / 1048576).toFixed(1)} MB in ${dir} (soglia ${(warnBytes / 1048576).toFixed(0)} MB)`);
  return {file, created, totalBytes: total, warnings};
}

module.exports = {fillMissing, writeMatchFiles, updateIndex, monthlyBackup, monthOf, indexEntry};
