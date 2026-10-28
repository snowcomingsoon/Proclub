const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const {buildHealth, failuresOf, crashHealth} = require('../scripts/health');
const {data, collect, tmpRoot, read} = require('./harness');

const ok = {complete: true, endpointFailures: {}, stale: {}, issues: [], lostClubMatches: 0, writtenOff: []};
const bad = {...ok, complete: false, endpointFailures: {leagueMatch: 'EA unavailable'}};

test('failuresOf: endpoint + discrepanze non transitorie, non quelle in attesa', () => {
  const f = failuresOf({endpointFailures: {club: 'x'}, issues: [{key: 'club-reset', kind: 'counter_regression', name: 'Club'}, {key: 'player:1', kind: 'missing_appearances', pending: true}]});
  assert.deepEqual(Object.keys(f).sort(), ['club', 'integrity:club-reset']);
});
test('buildHealth: contratto, contatore di fallimenti consecutivi e azzeramento', () => {
  const t = (n) => `2026-10-21T0${n}:00:00.000Z`;
  const h1 = buildHealth({status: bad, data, now: t(1)});
  assert.deepEqual(Object.keys(h1).slice(0, 12), ['version', 'checkedAt', 'capturedAt', 'complete', 'failures', 'stale', 'lostClubMatches', 'writtenOff', 'pendingMissing', 'season', 'consecutiveFailures', 'failingSince']);
  assert.equal(h1.version, 1); assert.equal(h1.complete, false); assert.equal(h1.consecutiveFailures, 1); assert.equal(h1.failingSince, t(1)); assert.deepEqual(h1.engine, {ok: true});
  const h2 = buildHealth({status: bad, data, previous: h1, now: t(2)});
  assert.equal(h2.consecutiveFailures, 2); assert.equal(h2.failingSince, t(1));
  const h3 = buildHealth({status: ok, data, previous: h2, now: t(3)});
  assert.equal(h3.consecutiveFailures, 0); assert.equal(h3.failingSince, null); assert.equal(h3.complete, true); assert.equal(h3.lastSuccessAt, t(3));
});
test('buildHealth: advance=false (ricostruzione offline) non conta come esecuzione', () => {
  const prev = buildHealth({status: bad, data, now: 't1'});
  const h = buildHealth({status: ok, data, previous: prev, now: 't2', advance: false});
  assert.equal(h.consecutiveFailures, 1);
});
test('buildHealth: writtenOff limitato agli ultimi 20 ed errore del motore registrato', () => {
  const writtenOff = Array.from({length: 30}, (_, i) => ({count: i}));
  const h = buildHealth({status: {...ok, writtenOff, lostClubMatches: 4}, data, now: 't', engine: {ok: false, error: 'boom'}});
  assert.equal(h.writtenOff.length, 20); assert.equal(h.writtenOff[19].count, 29); assert.equal(h.lostClubMatches, 4); assert.deepEqual(h.engine, {ok: false, error: 'boom'});
});
test('crashHealth incrementa i fallimenti mantenendo i dati precedenti', () => {
  const prev = buildHealth({status: ok, data: {...data, season: {id: '2026-27'}}, now: 't1'});
  const h = crashHealth({previous: prev, now: 't2', error: new Error('rotto')});
  assert.equal(h.consecutiveFailures, 1); assert.equal(h.failures.crash, 'rotto'); assert.equal(h.season.id, prev.season.id);
});

test('esecuzioni consecutive fallite: health.json le conta e si azzera alla prima sana', async () => {
  const root = tmpRoot();
  const at = (m) => () => new Date(Date.UTC(2026, 9, 21, 18, m)).toISOString();
  let h = (await collect({root, fail: ['leagueMatch'], now: at(0)})).health; assert.equal(h.consecutiveFailures, 1);
  h = (await collect({root, fail: ['leagueMatch'], now: at(20)})).health; assert.equal(h.consecutiveFailures, 2); assert.match(h.failures.leagueMatch, /unavailable/);
  h = (await collect({root, fail: ['leagueMatch'], now: at(40)})).health; assert.equal(h.consecutiveFailures, 3); assert.equal(h.failingSince, at(0)());
  h = (await collect({root, now: at(50)})).health; assert.equal(h.consecutiveFailures, 0); assert.equal(h.complete, true); assert.equal(h.failingSince, null);
});

test('nessun file riscritto quando non cambia nulla di significativo; heartbeat dopo un\'ora', async () => {
  const root = tmpRoot();
  const at = (m) => new Date(Date.UTC(2026, 9, 21, 18, m)).toISOString();
  await collect({root, now: at(0)});            // prima esecuzione: scrive tutto (stagione, ledger, pubblico)
  await collect({root, now: at(1)});            // si assorbe il nuovo stato stabile
  const files = ['data.json', 'sync-status.json', 'collection-ledger.json', 'public/health.json', 'public/insights.json', 'public/summary.json'];
  const snap = () => Object.fromEntries(files.map((f) => [f, fs.readFileSync(path.join(root, 'data', f), 'utf8')]));
  const before = snap();
  await collect({root, now: at(21)});
  const changed = Object.keys(snap()).filter((f) => snap()[f] !== before[f]);
  assert.deepEqual(changed, [], 'a 20 minuti di distanza e senza novita\' non cambia nessun file');
  await collect({root, now: at(61)});
  const after = snap();
  assert.notEqual(after['data.json'], before['data.json'], 'il timestamp di cattura si aggiorna al massimo ogni ora');
  assert.notEqual(after['public/health.json'], before['public/health.json']);
  assert.equal(read(root, 'public', 'health.json').capturedAt, read(root, 'data.json').capturedAt);
});
