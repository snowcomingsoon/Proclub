const test = require('node:test'), assert = require('node:assert/strict');
const U = require('../scripts/unlisted');
const integrity = require('../scripts/integrity');
const {buildHealth} = require('../scripts/health');
const {collect, read} = require('./harness');
const fixture = require('./fixtures/unlisted-2710.json');

const CLUB = '70375';
const clone = (v) => JSON.parse(JSON.stringify(v));
const real = () => clone(fixture.data);
const seed = () => clone(fixture.seed);
const base = () => ({club: seed().club, players: seed().players, cutoff: seed().cutoff});
const t = (h) => new Date(Date.UTC(2026, 9, 27, 21, 41) + h * 3600000).toISOString();
const pro = (data, name) => data.members.members.find((m) => m.name === name);
const byName = (pending) => Object.fromEntries(pending.players.map((p) => [p.name, p]));
// Una partita non listata che poi compare in lista: 4-1, vinta, giocata da garrus92 (0 gol, 2 assist).
const lateMatch = (ts, id = 'late-1') => ({matchId: id, timestamp: ts, clubs: {[CLUB]: {wins: '1', ties: '0', losses: '0', goals: '4', goalsAgainst: '1'}}, players: {[CLUB]: {354389768: {playername: 'garrus92', pos: 'forward', goals: '0', assists: '2', rating: '8.0', mom: '0', redcards: '0'}}}});

test('caso reale 27/10: dai contatori risultano 2 partite (2V, gol 8-2) con i Pro che le hanno giocate', () => {
  const data = real();
  const r = U.deficit(base(), data, CLUB);
  assert.equal(r.ok, true);
  const p = r.pending;
  assert.deepEqual([p.games, p.wins, p.ties, p.losses, p.goalsFor, p.goalsAgainst], [2, 2, 0, 0, 8, 2]);
  const who = byName(p);
  const row = (n) => [who[n].games, who[n].goals, who[n].assists];
  assert.deepEqual(row('garrus92'), [2, 0, 6]);
  assert.deepEqual(row('rghhgbvggg'), [2, 0, 1]);
  assert.deepEqual(row('We_Belen'), [2, 2, 0]);
  assert.deepEqual(row('scemo897'), [2, 3, 0]);
  assert.deepEqual(row('naji_3'), [2, 2, 0]);
  assert.deepEqual(row('Nyveex'), [2, 1, 1]);
  assert.deepEqual(row('H2K_simoID'), [1, 0, 0]);
  assert.equal(Object.keys(who).length, 7, 'i Pro senza partite non unlisted non compaiono');
  assert.equal(who.scemo897.motm, 1);
});

test('il seed vale solo se coerente: ok sul caso reale, scartato altrimenti', () => {
  const data = real();
  assert.equal(U.validateSeed(seed(), data, CLUB).ok, true);
  const later = {...seed(), cutoff: seed().cutoff + 1e6};
  assert.equal(U.validateSeed(later, data, CLUB).ok, false, 'cutoff dopo lo storico');
  const more = seed(); more.club.gamesPlayed = 999;
  assert.equal(U.validateSeed(more, data, CLUB).ok, false, 'più partite dei contatori attuali');
  const negative = seed(); negative.club.goals = 9999;
  assert.equal(U.validateSeed(negative, data, CLUB).ok, false, 'delta negativo');
  assert.equal(U.validateSeed({club: seed().club}, data, CLUB).ok, false);
  // seed scartato: si inizializza dalla lettura corrente, senza deficit
  const s = U.step(null, data, CLUB, t(0), {seed: negative});
  assert.equal(s.summary.pending, null); assert.equal(s.state.base.club.gamesPlayed, 98);
  // seed valido: usato
  const ok = U.step(null, data, CLUB, t(0), {seed: seed(), hint: t(0)});
  assert.equal(ok.summary.pending.games, 2); assert.equal(ok.state.base.club.gamesPlayed, 92);
});

test('nessuna partita mancante: nessun deficit', () => {
  const data = real();
  const s = U.step(null, data, CLUB, t(0));
  assert.equal(s.summary.pending, null); assert.deepEqual(s.summary.final, []); assert.equal(s.state.since, null);
  const again = U.step(s.state, data, CLUB, t(5));
  assert.equal(again.summary.pending, null);
  assert.deepEqual(again.state, s.state, 'nulla da riscrivere');
});

test('il deficit si riduce da solo quando la partita compare in lista', () => {
  const data = real();
  const s1 = U.step(null, data, CLUB, t(0), {seed: seed(), hint: t(0)});
  assert.equal(s1.summary.pending.games, 2);
  const ts = fixture.data.matchHistory.at(-1).timestamp + 60;
  data.matchHistory.push(lateMatch(ts));
  const s2 = U.step(s1.state, data, CLUB, t(2));
  const p = s2.summary.pending;
  assert.deepEqual([p.games, p.wins, p.goalsFor, p.goalsAgainst], [1, 1, 4, 1]);
  assert.equal(p.since, t(0), 'since resta il primo avvistamento');
  const g = byName(p).garrus92;
  assert.deepEqual([g.games, g.goals, g.assists], [1, 0, 4]);
  // la seconda partita (4-1 senza tabellino dei Pro): il deficit del club si chiude, since si azzera
  data.matchHistory.push({...lateMatch(ts + 60, 'late-2'), players: {[CLUB]: {}}});
  const s3 = U.step(s2.state, data, CLUB, t(3));
  assert.equal(s3.summary.pending, null); assert.equal(s3.state.since, null);
});

test('deficit con una componente negativa: ignorato con un avviso non bloccante', () => {
  const data = real();
  data.club[0].goals = String(Number(data.club[0].goals) - 100);
  const r = U.deficit(base(), data, CLUB);
  assert.equal(r.ok, false); assert.match(r.reason, /negativo/);
  const s = U.step(U.initialize(real(), {seed: seed(), clubId: CLUB}), data, CLUB, t(0));
  assert.equal(s.summary.pending, null); assert.match(s.summary.warning, /negativo/);
  // un Pro con contatore più basso del riferimento
  const low = real(); pro(low, 'garrus92').assists = '0';
  assert.equal(U.deficit(base(), low, CLUB).ok, false);
  // vittorie+pareggi+sconfitte che non tornano con le partite
  const odd = real(); odd.club[0].wins = String(Number(odd.club[0].wins) + 1);
  assert.match(U.deficit(base(), odd, CLUB).reason, /non tornano/);
  // un riferimento che resta incoerente per 12 ore si ricostruisce dai contatori attuali
  const s1 = U.step(U.initialize(real(), {seed: seed(), clubId: CLUB}), data, CLUB, t(0));
  const s2 = U.step(s1.state, data, CLUB, t(11));
  assert.ok(s2.summary.warning);
  const s3 = U.step(s2.state, data, CLUB, t(13));
  assert.equal(s3.summary.warning, undefined); assert.equal(s3.state.base.club.gamesPlayed, 98); assert.equal(s3.state.finals.length, 0);
});

test('dopo 12 ore il deficit viene finalizzato e il riferimento ribasato', () => {
  const data = real();
  const s1 = U.step(null, data, CLUB, t(0), {seed: seed(), hint: t(0)});
  assert.equal(s1.summary.pending.since, t(0));
  const s2 = U.step(s1.state, data, CLUB, t(11.9));
  assert.ok(s2.summary.pending, 'ancora entro la tolleranza');
  const s3 = U.step(s2.state, data, CLUB, t(12));
  assert.equal(s3.summary.pending, null);
  assert.equal(s3.summary.final.length, 1);
  const f = s3.summary.final[0];
  assert.deepEqual([f.games, f.wins, f.goalsFor, f.goalsAgainst, f.since, f.at], [2, 2, 8, 2, t(0), t(12)]);
  assert.equal(f.players.length, 7);
  assert.equal(s3.state.base.club.gamesPlayed, 98); assert.equal(s3.state.base.cutoff, Math.max(...data.matchHistory.map((m) => m.timestamp)));
  // la partita che arriva tardi in lista (ts anteriore al cutoff) non crea un doppio conteggio né un deficit negativo
  data.matchHistory.push(lateMatch(s3.state.base.cutoff - 100));
  const s4 = U.step(s3.state, data, CLUB, t(20));
  assert.equal(s4.summary.pending, null); assert.equal(s4.summary.warning, undefined); assert.equal(s4.summary.final.length, 1);
  // un nuovo buco dopo il ribasamento riparte da capo
  data.club[0].gamesPlayed = '99'; data.club[0].losses = String(Number(data.club[0].losses) + 1); data.club[0].goals = String(Number(data.club[0].goals) + 1); data.club[0].goalsAgainst = String(Number(data.club[0].goalsAgainst) + 3);
  pro(data, 'garrus92').gamesPlayed = String(Number(pro(data, 'garrus92').gamesPlayed) + 1);
  const s5 = U.step(s4.state, data, CLUB, t(21));
  assert.deepEqual([s5.summary.pending.games, s5.summary.pending.losses, s5.summary.pending.since], [1, 1, t(21)]);
  assert.equal(s5.summary.final.length, 1);
});

test('le voci definitive sono limitate: 200 nello stato, 20 nel riepilogo', () => {
  let state = U.initialize(real(), {clubId: CLUB});
  state.finals = Array.from({length: 205}, (_, i) => ({at: t(i), since: t(i), games: 1, wins: 1, ties: 0, losses: 0, goalsFor: 1, goalsAgainst: 0, players: []}));
  state.base = base();
  const s = U.step(state, real(), CLUB, t(300), {hint: t(0)});
  assert.equal(s.state.finals.length, 200); assert.equal(s.summary.final.length, 20);
});

test('integrity: initialize crea unlisted, reconcile lo espone nel riepilogo e health.json', () => {
  const data = real();
  const ledger = integrity.initialize(data, CLUB, t(0));
  assert.ok(ledger.unlisted); assert.equal(ledger.unlisted.base.club.gamesPlayed, 98);
  const r = integrity.reconcile(ledger, data, CLUB, t(1));
  assert.deepEqual(r.summary.unlisted, {pending: null, final: []});
  assert.equal(r.summary.healthy, true, 'l\'unlisted non blocca la salute');
  // ledger v2 senza unlisted: seed una tantum, since dal problema club-matches già aperto
  const legacy = clone(ledger); delete legacy.unlisted;
  legacy.club.anchor = 92; legacy.club.highWater = 92;
  legacy.issues = [{key: 'club-matches', kind: 'missing_matches', missing: 2, firstSeen: t(0), pending: true}];
  const seeded = integrity.reconcile(legacy, data, CLUB, t(1), {seed: seed()});
  assert.equal(seeded.summary.unlisted.pending.games, 2); assert.equal(seeded.summary.unlisted.pending.since, t(0));
  assert.equal(seeded.state.unlisted.base.club.gamesPlayed, 92);
  // senza seed: dalla lettura corrente
  const plain = integrity.reconcile(legacy, data, CLUB, t(1));
  assert.equal(plain.summary.unlisted.pending, null);
  const health = buildHealth({status: {...seeded.summary, complete: false}, data, previous: null, now: t(1)});
  assert.equal(health.unlisted.pending.games, 2); assert.ok(Array.isArray(health.pendingMissing), 'pendingMissing resta per compatibilità');
  assert.deepEqual(buildHealth({status: {}, data, previous: null, now: t(1)}).unlisted, {pending: null, final: []});
  // il write-off 'perse da EA' del club resta com'è e coincide con la finalizzazione (stessa scadenza)
  const late = integrity.reconcile(seeded.state, data, CLUB, t(12));
  assert.equal(late.summary.lostClubMatches > 0, true); assert.equal(late.summary.unlisted.final.length, 1); assert.equal(late.summary.unlisted.pending, null);
});

const stored = () => ({...real(), matches: [], season: undefined});
const asEa = () => ({club: real().club, members: real().members});
async function run(extra) {
  const {club, members} = asEa();
  return collect({stored: stored(), club, members, leagueList: [], files: {'config/unlisted-seed.json': fixture.seed}, ...extra});
}
test('collector: ledger v2 esistente senza unlisted -> seed, ricostruzione pubblicata, finalizzazione dopo 12h, giri ripetuti senza riscritture', async () => {
  const data = stored();
  const legacy = integrity.initialize(data, CLUB, t(-1));
  delete legacy.unlisted;
  const first = await run({ledger: legacy, now: t(0)});
  assert.equal(first.ledger.unlisted.base.club.gamesPlayed, 92);
  assert.equal(first.status.integrity.unlisted.pending.games, 2);
  assert.equal(first.health.unlisted.pending.games, 2); assert.equal(first.health.unlisted.pending.since, t(0));
  assert.equal(first.next.collectionStatus.unlisted.pending.wins, 2);
  assert.equal(first.health.complete, true, 'la ricostruzione non è un fallimento');
  // giro ripetuto: nessun file cambia
  const fs = require('node:fs'), path = require('node:path');
  const snap = () => ['data.json', 'collection-ledger.json', 'sync-status.json', 'public/health.json'].map((f) => fs.readFileSync(path.join(first.root, 'data', f), 'utf8'));
  const before = snap();
  await run({root: first.root, now: t(0.2)});
  assert.deepEqual(snap(), before);
  // dopo 12 ore: definitiva e ribasata
  const after = await run({root: first.root, now: t(13)});
  assert.equal(after.health.unlisted.pending, null); assert.equal(after.health.unlisted.final.length, 1);
  assert.equal(after.health.unlisted.final[0].games, 2); assert.equal(after.ledger.unlisted.base.club.gamesPlayed, 98);
  assert.equal(after.next.collectionStatus.unlisted.final.length, 1);
});
test('collector: senza seed il ledger nasce dalla lettura corrente, senza deficit', async () => {
  const data = stored();
  const legacy = integrity.initialize(data, CLUB, t(-1)); delete legacy.unlisted;
  const r = await run({ledger: legacy, now: t(0), files: {}});
  assert.equal(r.ledger.unlisted.base.club.gamesPlayed, 98); assert.equal(r.health.unlisted.pending, null);
});
test('cambio stagione: unlisted viene ricreato insieme al ledger', async () => {
  const data = stored();
  const club = [{...data.club[0], gamesPlayed: '2', wins: '1', ties: '0', losses: '1', goals: '3', goalsAgainst: '2'}];
  const members = {members: data.members.members.map((m, i) => ({...m, gamesPlayed: String(i < 3 ? 1 : 0), goals: '0', assists: '0', manOfTheMatch: '0', redCards: '0'}))};
  const ledger = integrity.initialize(data, CLUB, t(-1));
  const r = await collect({stored: data, ledger, club, members, leagueList: [], now: '2027-09-20T18:00:00.000Z'});
  assert.equal(r.next.season.previous, '2026-27');
  assert.equal(r.ledger.unlisted.base.club.gamesPlayed, 2);
  assert.deepEqual(r.ledger.unlisted.finals, []);
  assert.ok(read(r.root, 'seasons', '2026-27.json').ledger.unlisted, 'l\'unlisted della stagione conclusa resta nell\'archivio');
  assert.equal(r.health.unlisted.pending, null);
});
