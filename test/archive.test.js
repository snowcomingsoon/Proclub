const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), zlib = require('node:zlib');
const {fillMissing, writeMatchFiles, updateIndex, monthlyBackup, monthOf} = require('../scripts/archive');
const {data, collect, read, exists} = require('./harness');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'arch-'));
const match = (id, extra = {}) => ({matchId: String(id), timestamp: 1000 + Number(id), clubs: {70375: {goals: 1, goalsAgainst: 0, details: {name: 'X'}}, 9: {goals: 0, goalsAgainst: 1}}, players: {70375: {1: {playername: 'a', goals: '1'}}}, ...extra});

test('writeMatchFiles: un file per partita, senza riscrivere se identica', () => {
  const dir = tmp();
  const r1 = writeMatchFiles(dir, [match(1), match(2)]);
  assert.deepEqual(r1.created, ['1', '2']);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, '1.json'), 'utf8')), match(1));
  const mtime = fs.statSync(path.join(dir, '1.json')).mtimeMs;
  const r2 = writeMatchFiles(dir, [match(1), match(2)]);
  assert.deepEqual([r2.created, r2.updated], [[], []]); assert.equal(fs.statSync(path.join(dir, '1.json')).mtimeMs, mtime);
});
test('writeMatchFiles: non sovrascrive i valori archiviati e non perde campi se la nuova versione ne ha meno', () => {
  const dir = tmp();
  writeMatchFiles(dir, [match(1)]);
  const poorer = match(1); delete poorer.players; poorer.clubs[70375].goals = 99; poorer.clubs[70375].details = null;
  const r = writeMatchFiles(dir, [poorer]);
  assert.deepEqual(r.updated, []);
  const saved = JSON.parse(fs.readFileSync(path.join(dir, '1.json'), 'utf8'));
  assert.equal(saved.clubs[70375].goals, 1); assert.deepEqual(saved.players, match(1).players); assert.equal(saved.clubs[70375].details.name, 'X');
});
test('writeMatchFiles: aggiunge i campi mancanti (anche annidati) senza toccare gli altri', () => {
  const dir = tmp();
  const thin = match(1); delete thin.players[70375][1].goals; delete thin.clubs[9];
  writeMatchFiles(dir, [thin]);
  const r = writeMatchFiles(dir, [match(1, {extra: 'nuovo'})]);
  assert.deepEqual(r.updated, ['1']);
  const saved = JSON.parse(fs.readFileSync(path.join(dir, '1.json'), 'utf8'));
  assert.equal(saved.players[70375][1].goals, '1'); assert.ok(saved.clubs[9]); assert.equal(saved.extra, 'nuovo');
});
test('fillMissing: valori vuoti sostituiti, valori presenti mantenuti', () => {
  assert.deepEqual(fillMissing({a: 1, b: '', c: null}, {a: 2, b: 3, c: 4, d: 5}), {a: 1, b: 3, c: 4, d: 5});
});
test('updateIndex: accumula tra stagioni, ordine stabile dalla piu\' recente', () => {
  const dir = tmp(), file = path.join(dir, 'index.json');
  updateIndex(file, [match(1), match(2)], '70375');
  const index = updateIndex(file, [match(3), match(2)], '70375');   // 1 non e' piu' nello snapshot ma resta nell'indice
  assert.deepEqual(index.map((e) => e.matchId), ['3', '2', '1']);
  assert.equal(index[0].opponent, null); assert.equal(index[0].goalsFor, 1); assert.deepEqual(Object.keys(index[0]), ['matchId', 'timestamp', 'month', 'opponent', 'goalsFor', 'goalsAgainst', 'result']);
});
test('monthlyBackup: un backup compresso al mese, al primo run, con dimensione controllata', () => {
  const dir = tmp(), dataFile = path.join(dir, 'data.json'), backups = path.join(dir, 'backups');
  fs.writeFileSync(dataFile, JSON.stringify(data));
  const a = monthlyBackup({dir: backups, dataFile, now: '2026-10-01T05:00:00Z'});
  assert.ok(a.created); assert.equal(path.basename(a.file), '2026-10.json.gz');
  assert.deepEqual(JSON.parse(zlib.gunzipSync(fs.readFileSync(a.file))), data);
  assert.ok(fs.statSync(a.file).size < fs.statSync(dataFile).size / 3);
  fs.writeFileSync(dataFile, '{"changed":true}');
  assert.equal(monthlyBackup({dir: backups, dataFile, now: '2026-10-20T05:00:00Z'}).created, false);
  assert.deepEqual(JSON.parse(zlib.gunzipSync(fs.readFileSync(a.file))), data, 'il backup del mese non viene sovrascritto');
  assert.equal(monthlyBackup({dir: backups, dataFile, now: '2026-11-01T05:00:00Z'}).created, true);
  assert.equal(monthlyBackup({dir: backups, dataFile, now: '2026-11-02T05:00:00Z', warnBytes: 10}).warnings.length, 1);
});
test('monthOf usa il fuso del club', () => {
  assert.equal(monthOf('2026-10-31T23:30:00Z', 'Europe/Rome'), '2026-11');
  assert.equal(monthOf('2026-10-31T23:30:00Z', 'UTC'), '2026-10');
});
test('raccolta: archivio per partita, indice e backup mensile a ogni esecuzione', async () => {
  const r = await collect();
  for (const m of r.next.matchHistory) assert.ok(exists(r.root, 'matches', `${m.matchId}.json`), m.matchId);
  assert.equal(read(r.root, 'archive', 'index.json').length, r.next.matchHistory.length);
  assert.ok(exists(r.root, 'backups', '2026-10.json.gz'));
  const copy = read(r.root, 'matches', 'collector-new-match.json');
  assert.equal(copy.matchId, 'collector-new-match'); assert.ok(copy.players && copy.clubs);
});
