const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const {seasonIdFor, classifyCounters, observeSeason, currentSeason} = require('../scripts/season');
const integrity = require('../scripts/integrity');
const {data, collect, read, exists, tmpRoot} = require('./harness');

const lastTs = Math.max(...data.matchHistory.map((m) => m.timestamp));
const resetClub = (games = 2) => [{...data.club[0], gamesPlayed: String(games), wins: '1', ties: '0', losses: String(games - 1), goals: '3', goalsAgainst: '2'}];
const resetMembers = (games = 1) => ({...data.members, members: data.members.members.map((m, i) => ({...m, gamesPlayed: String(i < 3 ? games : 0)}))});
const ledger = () => integrity.initialize(data, '70375', '2026-10-01T00:00:00.000Z');
const newMatch = (id, offset = 100) => ({...data.matches[0], matchId: id, timestamp: lastTs + offset});

test('seasonIdFor: le stagioni partono in autunno', () => {
  assert.equal(seasonIdFor('2026-10-21T00:00:00Z'), '2026-27');
  assert.equal(seasonIdFor('2027-03-01T00:00:00Z'), '2026-27');
  assert.equal(seasonIdFor('2027-09-20T00:00:00Z'), '2027-28');
  assert.equal(seasonIdFor(lastTs), '2026-27');
});
test('currentSeason: dedotta dalla prima partita se il dato non la registra', () => {
  const s = currentSeason(data, 'x');
  assert.equal(s.id, '2026-27'); assert.equal(s.lastChange, null);
  assert.equal(currentSeason({season: {id: '2025-26', startedAt: 'a'}}, 'x').id, '2025-26');
});

test('classifyCounters: nessuna regressione', () => {
  assert.equal(classifyCounters({old: data, ledger: ledger(), club: data.club, members: data.members}).kind, 'none');
});
test('classifyCounters: lettura arretrata transitoria (club -9, o un solo Pro) NON e\' un cambio stagione', () => {
  const games = Number(data.club[0].gamesPlayed);
  assert.equal(classifyCounters({old: data, ledger: ledger(), club: [{...data.club[0], gamesPlayed: String(games - 9)}], members: data.members}).kind, 'stale');
  const one = {...data.members, members: data.members.members.map((m, i) => (i === 0 ? {...m, gamesPlayed: '0'} : m))};
  assert.equal(classifyCounters({old: data, ledger: ledger(), club: data.club, members: one}).kind, 'stale');
  // club a zero ma Pro invariati: incoerente, resta una lettura sospetta
  assert.equal(classifyCounters({old: data, ledger: ledger(), club: resetClub(0), members: data.members}).kind, 'stale');
});
test('classifyCounters: reset simultaneo di club e Pro', () => {
  assert.equal(classifyCounters({old: data, ledger: ledger(), club: resetClub(), members: resetMembers()}).kind, 'reset');
  assert.equal(classifyCounters({old: data, ledger: ledger(), club: resetClub(0), members: resetMembers(0)}).kind, 'reset');
});
test('observeSeason: serve una seconda lettura coerente; una lettura normale azzera la conferma', () => {
  const a = observeSeason(null, 'reset', 2, 't1');
  assert.equal(a.confirmed, false); assert.equal(a.pending.reads, 1);
  const b = observeSeason(a.pending, 'reset', 2, 't2');
  assert.equal(b.confirmed, true);
  assert.equal(observeSeason(a.pending, 'none', 71, 't2').pending, null);
  assert.equal(observeSeason(a.pending, 'reset', 1, 't2').confirmed, false, 'contatore sceso ancora: non coerente');
});

test('cambio stagione reale: archivia lo snapshot, ricrea il ledger, registra l\'evento, non fallisce', async () => {
  const r = await collect({club: resetClub(), members: resetMembers(), ledger: ledger(), leagueList: [newMatch('s2-1')], now: '2027-09-20T18:00:00.000Z'});
  assert.equal(r.exitCode, 0, JSON.stringify(r.result.failures));
  const archived = read(r.root, 'seasons', '2026-27.json');
  assert.equal(archived.id, '2026-27'); assert.equal(archived.data.matchHistory.length, data.matchHistory.length);
  assert.equal(archived.data.club[0].gamesPlayed, data.club[0].gamesPlayed);
  assert.equal(r.next.season.id, '2027-28'); assert.equal(r.next.season.previous, '2026-27'); assert.equal(r.next.season.lastChange, '2027-09-20T18:00:00.000Z');
  assert.equal(r.next.club[0].gamesPlayed, '2');
  assert.deepEqual(r.next.matchHistory.map((m) => m.matchId), ['s2-1']);
  assert.equal(r.ledger.club.anchor, 2); assert.equal(r.ledger.startedAt, '2027-09-20T18:00:00.000Z');
  assert.deepEqual(r.health.season, r.next.season); assert.equal(r.health.consecutiveFailures, 0); assert.equal(r.health.complete, true);
  assert.ok(!exists(r.root, 'season-candidate.json'));
  // le partite della stagione conclusa restano nell'archivio per partita e nell'indice
  assert.ok(exists(r.root, 'matches', `${data.matchHistory[0].matchId}.json`));
  assert.ok(read(r.root, 'archive', 'index.json').length >= data.matchHistory.length + 1);
  assert.equal(read(r.root, 'public', 'summary.json').matchCount, 1);
});
test('cambio stagione: le partite elencate da EA ma della stagione vecchia non entrano nella nuova', async () => {
  const r = await collect({club: resetClub(0), members: resetMembers(0), ledger: ledger(), leagueList: [data.matchHistory[0]], now: '2027-09-20T18:00:00.000Z'});
  assert.equal(r.exitCode, 0); assert.equal(r.next.matchHistory.length, 0);
});
test('cambio stagione nello stesso anno-stagione: id con suffisso, nessuna sovrascrittura', async () => {
  const r = await collect({club: resetClub(), members: resetMembers(), ledger: ledger(), now: '2026-10-22T18:00:00.000Z', leagueList: [newMatch('s2-1')]});
  assert.equal(r.next.season.id, '2026-27-2'); assert.ok(exists(r.root, 'seasons', '2026-27.json'));
});
test('lettura arretrata transitoria: nessun archivio di stagione, dati invariati', async () => {
  const games = Number(data.club[0].gamesPlayed);
  const r = await collect({club: [{...data.club[0], gamesPlayed: String(games - 9)}], ledger: ledger()});
  assert.ok(!exists(r.root, 'seasons')); assert.equal(r.next.club[0].gamesPlayed, data.club[0].gamesPlayed); assert.equal(r.next.season.lastChange, null);
});
test('un reset visto UNA volta sola e poi smentito (cache EA) non cambia stagione', async () => {
  const r = await collect({clubSeq: [resetClub(), data.club], membersSeq: [resetMembers(), data.members], ledger: ledger()});
  assert.ok(!exists(r.root, 'seasons')); assert.equal(r.next.club[0].gamesPlayed, data.club[0].gamesPlayed); assert.equal(r.exitCode, 0);
  assert.ok(!exists(r.root, 'season-candidate.json'), 'il candidato viene azzerato dalla lettura normale');
});
test('un reset confermato su DUE esecuzioni distinte cambia stagione', async () => {
  const root = tmpRoot({ledger: ledger()});
  // prima esecuzione: la seconda lettura (secondo giro) fallisce, resta solo il candidato
  const first = await collect({root, club: resetClub(), members: resetMembers(), fail: ['members'], recover: false, now: '2027-09-20T18:00:00.000Z'});
  assert.ok(!exists(root, 'seasons'));
  assert.equal(first.next.club[0].gamesPlayed, data.club[0].gamesPlayed);
  const second = await collect({root, club: resetClub(), members: resetMembers(), now: '2027-09-20T18:20:00.000Z'});
  assert.equal(second.exitCode, 0); assert.ok(exists(root, 'seasons', '2026-27.json')); assert.equal(second.next.season.id, '2027-28');
});
test('un archivio di stagione gia\' scritto per lo stesso snapshot non viene duplicato', async () => {
  const {changeSeason} = require('../scripts/season');
  const root = tmpRoot();
  const dir = path.join(root, 'data', 'seasons');
  const a = changeSeason({old: data, ledger: null, club: resetClub(), members: resetMembers(), now: '2027-09-20T18:00:00.000Z', seasonsDir: dir});
  const b = changeSeason({old: data, ledger: null, club: resetClub(), members: resetMembers(), now: '2027-09-20T18:00:15.000Z', seasonsDir: dir});
  assert.equal(a.archivedId, b.archivedId); assert.equal(fs.readdirSync(dir).length, 1);
});
