// Adattatore dati del front-end, insight precalcolati e salute della raccolta (app/src/lib).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { computeEngineId } from '../app/tools/engine-id.mjs';
import {
  buildLiveData,
  collectionStatusOf,
  isValidHealth,
  isValidSummary,
  normalizeMatches,
  usableInsights,
  withPlayingMembers,
} from '../app/src/lib/adapter.js';
import { buildCoachComments, buildNightComments } from '../app/src/lib/coach.js';
import { getEditorialContext } from '../app/src/lib/editorial-ctx.js';
import { groupByNight } from '../app/src/lib/matches.js';
import { lostMatchesNote, stallNotice } from '../app/src/lib/health.js';

const fx = (rel) => JSON.parse(readFileSync(new URL(`./fixtures/public/${rel}`, import.meta.url), 'utf8'));
const monolith = JSON.parse(readFileSync(new URL('./fixtures/monolith.json', import.meta.url), 'utf8'));
const summary = fx('summary.json');
const history = fx('history.json');
const insights = fx('insights.json');
const health = fx('health.json');
const ENGINE = computeEngineId();

test('fixture coerenti col contratto', () => {
  assert.ok(isValidSummary(summary));
  assert.ok(isValidHealth(health));
  assert.equal(summary.version, 2);
  assert.equal(summary.matchCount, history.matchHistory.length);
  assert.ok(summary.matches.length <= 30);
  assert.equal(insights.engine, ENGINE);
  const nightFiles = readdirSync(new URL('./fixtures/public/nights/', import.meta.url));
  assert.equal(nightFiles.length, summary.nights.length);
  for (const night of summary.nights) {
    const body = fx(`nights/${night.day}.json`);
    assert.equal(body.matches.length, night.games);
  }
});

test('adattatore: stessa forma e stessi dati del monolite', () => {
  const data = buildLiveData({ summary, history, insights: null, engineId: ENGINE });
  assert.deepEqual(Object.keys(data).sort(), ['capturedAt', 'club', 'fresh', 'matchHistory', 'matches', 'members']);
  assert.deepEqual(data.club, monolith.club);
  assert.deepEqual(data.members, monolith.members);
  assert.deepEqual(data.matches, monolith.matches);
  assert.deepEqual(data.matchHistory, monolith.matchHistory);
  assert.equal(data.capturedAt, monolith.capturedAt);
  assert.deepEqual(data.fresh, monolith.fresh);
});

test('adattatore: ordine/doppioni dell\'input non cambiano il risultato', () => {
  const shuffled = {
    matchHistory: [...history.matchHistory].reverse().concat(history.matchHistory.slice(0, 5)),
  };
  const a = buildLiveData({ summary, history, engineId: ENGINE });
  const b = buildLiveData({ summary: { ...summary, matches: [...summary.matches].reverse() }, history: shuffled, engineId: ENGINE });
  assert.deepEqual(a.matchHistory, b.matchHistory);
  assert.deepEqual(a.matches, b.matches);
  assert.deepEqual(normalizeMatches([{ matchId: 'x' }, null]), []);
});

test('le serate derivano uguali da history e dal summary', () => {
  const data = buildLiveData({ summary, history, engineId: ENGINE });
  const nights = groupByNight(data.matchHistory);
  assert.deepEqual(
    nights.map((n) => ({ day: n.day, games: n.games.length })),
    summary.nights.map((n) => ({ day: n.day, games: n.games })),
  );
});

test('insights: usati solo se motore, forma e freschezza coincidono', () => {
  const at = summary.capturedAt;
  assert.ok(usableInsights(insights, at, ENGINE));
  assert.equal(usableInsights(insights, at, 'altro-motore'), null);
  assert.equal(usableInsights(insights, at, null), null);
  assert.equal(usableInsights({ ...insights, engine: 'x' }, at, ENGINE), null);
  assert.equal(usableInsights({ ...insights, coach: null }, at, ENGINE), null);
  assert.equal(usableInsights({ ...insights, club: [] }, at, ENGINE), null);
  assert.equal(usableInsights({ ...insights, builtAt: 'ieri' }, at, ENGINE), null);
  // costruiti prima di una rilevazione più recente: scartati
  const later = new Date(Date.parse(at) + 10 * 60e3).toISOString();
  assert.equal(usableInsights(insights, later, ENGINE), null);
  assert.equal(usableInsights(null, at, ENGINE), null);
  // elenco Pro diverso da quello del sito (profili a zero presenze inclusi): scartati
  assert.ok(usableInsights(insights, at, ENGINE, insights.club.players.length));
  assert.equal(usableInsights(insights, at, ENGINE, insights.club.players.length + 5), null);
  const data = buildLiveData({ summary, history, insights, engineId: ENGINE });
  assert.ok(data.insights);
  assert.equal(buildLiveData({ summary, history, insights, engineId: 'altro' }).insights, undefined);
});

// Stessa versione del sito: i dati passano da withPlayingMembers come in useClubData.
const local = withPlayingMembers(buildLiveData({ summary, history, insights: null, engineId: ENGINE }));
const precomputed = withPlayingMembers(buildLiveData({ summary, history, insights, engineId: ENGINE }));

test('equivalenza: commenti da allenatore, precalcolati = locali', () => {
  assert.ok(precomputed.insights && !local.insights);
  const a = buildCoachComments(precomputed);
  const b = buildCoachComments(local);
  assert.ok(b.size > 0);
  assert.deepEqual([...a.entries()].sort(), [...b.entries()].sort().map(([k, v]) => [k, JSON.parse(JSON.stringify(v))]));
});

test('equivalenza: analisi di squadra, precalcolata = locale', () => {
  const a = getEditorialContext(precomputed).club;
  const b = JSON.parse(JSON.stringify(getEditorialContext(local).club));
  assert.deepEqual(a, b);
});

test('equivalenza: commenti di serata (con e senza partite della serata)', () => {
  const norm = (m) => JSON.parse(JSON.stringify([...m.entries()].sort()));
  const day = summary.nights[0].day;
  const games = groupByNight(local.matchHistory).find((n) => n.day === day).games;
  const allLocal = getEditorialContext(local).all;
  assert.deepEqual(
    norm(buildNightComments(precomputed, games, getEditorialContext(precomputed).all)),
    norm(buildNightComments(local, games, allLocal)),
  );
  // senza partite: percorso interamente precalcolato, nessun ricalcolo di `all`
  assert.deepEqual(norm(buildNightComments(precomputed, [])), norm(buildNightComments(local, [], allLocal)));
});

test('contesto editoriale: all/metricsByName sono pigri', () => {
  const ctx = getEditorialContext({ ...precomputed });
  assert.ok(ctx.club);
  assert.ok(ctx.metricsByName.size > 0);
});

test('stato del controllo archivio: da health, altrimenti dal monolite', () => {
  const s = collectionStatusOf({ ...health, complete: false }, monolith);
  assert.equal(s.complete, false);
  assert.equal(s.checkedAt, health.checkedAt);
  assert.equal(collectionStatusOf(null, monolith), monolith.collectionStatus);
  assert.equal(collectionStatusOf(null, {}), null);
});

// Salute: 19:00–03:00 ora italiana => soglia 3 h; altrove 12 h. Ottobre = CEST (UTC+2).
const at = (iso) => Date.parse(iso);
const checkedAt = '2026-10-20T14:20:00Z'; // 16:20 italiane
test('stallNotice: sera, ferma da più di 3 ore', () => {
  const msg = stallNotice({ checkedAt }, at('2026-10-20T17:30:00Z')); // 19:30 italiane, ferma da 3h10
  assert.equal(msg, 'La raccolta dati non risponde dalle 16:20: i numeri potrebbero non essere aggiornati.');
});
test('stallNotice: sera, sotto 3 ore non avvisa', () => {
  assert.equal(stallNotice({ checkedAt }, at('2026-10-20T17:10:00Z')), null); // 2h50
});
test('stallNotice: di giorno la soglia è 12 ore', () => {
  const c = '2026-10-20T04:00:00Z'; // 06:00 italiane
  assert.equal(stallNotice({ checkedAt: c }, at('2026-10-20T13:00:00Z')), null); // 15:00, 9 h
  assert.ok(stallNotice({ checkedAt: c }, at('2026-10-20T16:30:00Z'))); // 18:30 (non sera), 12h30 > 12 h
});
test('stallNotice: dopo le 12 ore anche di giorno avvisa', () => {
  const c = '2026-10-20T02:00:00Z'; // 04:00 italiane
  assert.ok(stallNotice({ checkedAt: c }, at('2026-10-20T15:00:00Z'))); // 17:00, 13 h
});
test('stallNotice: confini della fascia serale (19:00 incluso, 03:00 escluso)', () => {
  const c = '2026-10-20T10:00:00Z'; // 12:00 italiane
  // 18:59 italiane (16:59Z): fuori fascia, 6h59 < 12h
  assert.equal(stallNotice({ checkedAt: c }, at('2026-10-20T16:59:00Z')), null);
  // 19:00 italiane (17:00Z): in fascia, 7h > 3h
  assert.ok(stallNotice({ checkedAt: c }, at('2026-10-20T17:00:00Z')));
  const d = '2026-10-20T22:00:00Z'; // 00:00 italiane del 21
  // 02:59 italiane (00:59Z): in fascia, 3h > 3h? 2h59: no
  assert.equal(stallNotice({ checkedAt: d }, at('2026-10-21T00:59:00Z')), null);
  // 03:00 italiane (01:00Z): fuori fascia, soglia 12 h
  assert.equal(stallNotice({ checkedAt: '2026-10-20T21:00:00Z' }, at('2026-10-21T01:00:00Z')), null);
});
test('stallNotice: dati mancanti o non validi non avvisano; il testo non cita regole interne', () => {
  assert.equal(stallNotice(null), null);
  assert.equal(stallNotice({}), null);
  assert.equal(stallNotice({ checkedAt: 'boh' }), null);
  const msg = stallNotice({ checkedAt }, at('2026-10-20T22:00:00Z'));
  assert.doesNotMatch(msg, /soglia|ore|errore|fallit|allarme|!/i);
});
test('lostMatchesNote: solo se > 0, singolare/plurale', () => {
  assert.equal(lostMatchesNote({ lostClubMatches: 0 }), null);
  assert.equal(lostMatchesNote(null), null);
  assert.equal(lostMatchesNote({ lostClubMatches: 'x' }), null);
  assert.match(lostMatchesNote({ lostClubMatches: 1 }), /^Una partita/);
  assert.match(lostMatchesNote({ lostClubMatches: 3 }), /^3 partite/);
});
