'use strict';
// Forma (percorsi dei campi → tipi) delle risposte EA, per accorgersi quando EA cambia formato.

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
// Le chiavi puramente numeriche (id club/giocatore) diventano '*'; i campi aggiunti da noi non fanno parte del contratto EA.
const OURS = new Set(['sourceMatchType']);

/** Percorsi `a.b[].c` → tipi osservati (uniti su tutti gli elementi). */
function flatten(value, prefix = '', out = {}, depth = 0) {
  const add = (p, t) => { (out[p] ||= new Set()).add(t); };
  if (Array.isArray(value)) {
    add(prefix || '[]', 'array');
    if (depth < 6) for (const item of value) flatten(item, `${prefix}[]`, out, depth + 1);
  } else if (value && typeof value === 'object') {
    if (prefix) add(prefix, 'object');
    if (depth < 6) for (const [k, v] of Object.entries(value)) {
      if (OURS.has(k)) continue;
      flatten(v, `${prefix}${prefix ? '.' : ''}${/^\d+$/.test(k) ? '*' : k}`, out, depth + 1);
    }
  } else add(prefix, typeOf(value));
  return out;
}

/** Forma serializzabile: {percorso: 'tipo1|tipo2'} con chiavi ordinate. */
function shapeOf(json) {
  const flat = flatten(json);
  return Object.fromEntries(Object.keys(flat).sort().map((p) => [p, [...flat[p]].sort().join('|')]));
}

/** Confronta lo schema salvato con quello osservato: mancanti e tipi cambiati sono differenze; i campi nuovi sono solo informativi. */
function compareShape(saved, live) {
  const missing = [], typeChanged = [], added = [];
  for (const [p, t] of Object.entries(saved)) {
    if (!(p in live)) { missing.push(p); continue; }
    const was = t.split('|').filter((x) => x !== 'null'), now = live[p].split('|').filter((x) => x !== 'null');
    if (was.length && now.length && !was.some((x) => now.includes(x))) typeChanged.push({path: p, was: t, now: live[p]});
  }
  for (const p of Object.keys(live)) if (!(p in saved)) added.push(p);
  return {missing, typeChanged, added};
}

const hasDifference = (diffs) => Object.values(diffs).some((d) => d.missing.length || d.typeChanged.length);

module.exports = {flatten, shapeOf, compareShape, hasDifference};
