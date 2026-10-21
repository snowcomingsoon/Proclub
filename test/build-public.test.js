const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {buildPublic, writePublic} = require('../scripts/build-public');
const {data, read} = require('./harness');

const NOW = '2026-10-21T18:00:00.000Z';

test('buildPublic: file del contratto, derivati dal monolite', async () => {
  const {files, engine} = await buildPublic(data, NOW, {});
  assert.deepEqual(engine, {ok: true});
  assert.ok(['summary.json', 'history.json', 'insights.json', 'health.json'].every((f) => f in files));
  const s = files['summary.json'];
  assert.equal(s.version, 2); assert.equal(s.capturedAt, data.capturedAt); assert.deepEqual(s.club, data.club);
  assert.deepEqual(s.members.members, data.members.members);
  assert.equal(s.matchCount, data.matchHistory.length);
  assert.ok(s.matches.length <= 30);
  assert.deepEqual(s.matches.map((m) => m.matchId), [...s.matches].sort((a, b) => b.timestamp - a.timestamp).map((m) => m.matchId));
  assert.equal(files['history.json'].version, 1); assert.equal(files['history.json'].matchHistory.length, data.matchHistory.length);
  assert.equal(files['health.json'].version, 1);
});
test('buildPublic: serate ordinate dalla piu\' recente, coerenti con le partite, file nights/<giorno>.json', async () => {
  const {files} = await buildPublic(data, NOW, {});
  const {nights} = files['summary.json'];
  assert.deepEqual(nights.map((n) => n.day), [...nights.map((n) => n.day)].sort().reverse());
  assert.equal(nights.reduce((s, n) => s + n.games, 0), data.matchHistory.length, 'ogni partita sta in una sola serata');
  for (const n of nights) {
    const f = files[`nights/${n.day}.json`];
    assert.equal(f.day, n.day); assert.equal(f.matches.length, n.games);
    assert.equal(n.from, f.matches[0].timestamp); assert.equal(n.to, f.matches[f.matches.length - 1].timestamp);
    assert.deepEqual(f.matches.map((m) => m.timestamp), f.matches.map((m) => m.timestamp).slice().sort((a, b) => a - b));
  }
});
test('buildPublic: le gare dopo mezzanotte appartengono alla serata precedente', async () => {
  const at = (iso) => ({matchId: iso, timestamp: Date.parse(iso) / 1000, clubs: {}, players: {}});
  const mk = {...data, matchHistory: [at('2026-10-20T22:30:00Z'), at('2026-10-20T23:30:00Z'), at('2026-10-21T03:30:00Z')], matches: []};
  const {files} = await buildPublic(mk, NOW, {});
  // 22:30Z=00:30 italiane del 21 -> serata del 20; 23:30Z=01:30 del 21 -> 20; 03:30Z=05:30 -> 20
  assert.deepEqual(files['summary.json'].nights.map((n) => [n.day, n.games]), [['2026-10-20', 3]]);
});
test('buildPublic: insights con un commento per ogni Pro attivo e analisi di squadra', async () => {
  const {files} = await buildPublic(data, NOW, {engineVersion: 'abc'});
  const i = files['insights.json'];
  assert.equal(i.version, 1); assert.equal(i.builtAt, NOW); assert.equal(i.engine, 'abc');
  const active = data.members.members.filter((m) => Number(m.gamesPlayed) > 0 && data.matchHistory.some((x) => Object.values(x.players['70375'] || {}).some((p) => p.playername?.toLowerCase() === m.name.toLowerCase())));
  for (const m of active) assert.ok(i.coach[m.name.toLowerCase()], m.name);
  assert.ok(Object.keys(i.coach).every((k) => k === k.toLowerCase()));
  assert.ok(i.club.record && i.club.season && Array.isArray(i.club.lines)); assert.equal(i.club.players, undefined);
  assert.ok(JSON.stringify(i).length < 200000);
});
test('buildPublic: se il motore va in errore salta insights e lo registra in health, senza lanciare', async () => {
  const engine = {buildAll() { throw new Error('motore rotto'); }, analyzeClub() {}, commentFor() {}};
  const {files, engine: state} = await buildPublic(data, NOW, {engine});
  assert.equal(state.ok, false); assert.match(state.error, /motore rotto/);
  assert.ok(!('insights.json' in files)); assert.ok('summary.json' in files);
  assert.deepEqual(files['health.json'].engine, {ok: false, error: 'motore rotto'});
});
test('buildPublic: output deterministico (stesso input, stesso JSON)', async () => {
  const a = await buildPublic(data, NOW, {}), b = await buildPublic(data, NOW, {});
  assert.equal(JSON.stringify(a.files), JSON.stringify(b.files));
});
test('writePublic: atomico, salta i file invariati, heartbeat orario, rimuove serate scomparse', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pub-'));
  const {files} = await buildPublic(data, NOW, {});
  const first = writePublic(dir, files, {now: NOW});
  assert.equal(first.written.length, Object.keys(files).length);
  assert.ok(!fs.readdirSync(dir).some((f) => f.endsWith('.tmp')));
  const later = (await buildPublic(data, '2026-10-21T18:20:00.000Z', {})).files;
  const second = writePublic(dir, later, {now: '2026-10-21T18:20:00.000Z'});
  assert.deepEqual(second.written, [], 'solo builtAt/checkedAt cambiati: niente scritture');
  const hourly = (await buildPublic(data, '2026-10-21T19:05:00.000Z', {})).files;
  assert.deepEqual(writePublic(dir, hourly, {now: '2026-10-21T19:05:00.000Z'}).written.sort(), ['health.json', 'insights.json']);
  const fewer = {...hourly}; const gone = Object.keys(fewer).find((k) => k.startsWith('nights/')); delete fewer[gone];
  assert.deepEqual(writePublic(dir, fewer, {now: '2026-10-21T19:05:00.000Z'}).removed, [gone]);
});
test('raccolta: i file pubblici sono coerenti con data.json', async () => {
  const {collect} = require('./harness');
  const r = await collect();
  const summary = read(r.root, 'public', 'summary.json');
  assert.equal(summary.matchCount, r.next.matchHistory.length);
  assert.equal(read(r.root, 'public', 'history.json').matchHistory.length, r.next.matchHistory.length);
  assert.equal(summary.capturedAt, r.next.capturedAt);
  assert.equal(read(r.root, 'public', 'health.json').capturedAt, r.next.capturedAt);
  const nightMatches = fs.readdirSync(path.join(r.root, 'data', 'public', 'nights')).flatMap((f) => read(r.root, 'public', 'nights', f).matches);
  assert.equal(nightMatches.length, r.next.matchHistory.length);
});
