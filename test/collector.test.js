const test = require('node:test'), assert = require('node:assert/strict');
const integrity = require('../scripts/integrity');
const {data, collect} = require('./harness');

test('collector saves new matches once and retains the entire history', async () => {
  const {next, status, exitCode} = await collect();
  assert.equal(exitCode, 0); assert.equal(status.complete, true);
  for (const m of data.matchHistory) assert.ok(next.matchHistory.some((n) => n.matchId === m.matchId));
  assert.equal(next.matchHistory.filter((m) => m.matchId === 'collector-new-match').length, 1);
});
test('failed league endpoint does not discard successful sources or old history', async () => {
  const {next, status, exitCode} = await collect({fail: ['leagueMatch']});
  assert.equal(exitCode, 1); assert.equal(status.complete, false); assert.match(status.failures.leagueMatch, /unavailable/);
  assert.equal(next.matchHistory.length, data.matchHistory.length);
});
test('failed aggregate endpoint cannot discard successfully collected match details', async () => {
  const {next, status, exitCode} = await collect({fail: ['members']});
  assert.equal(exitCode, 1); assert.ok(next.matchHistory.some((m) => m.matchId === 'collector-new-match'));
  assert.deepEqual(next.members, data.members); assert.equal(status.attempts, 2);
});
test('recovery round clears transient failures only after successful response', async () => {
  const {status, exitCode} = await collect({fail: ['playoffMatch'], recover: true});
  assert.equal(exitCode, 0); assert.equal(status.complete, true); assert.equal(status.attempts, 2);
});

const withGames = (n) => [{...data.club[0], gamesPlayed: String(n)}];
test('a legacy ledger anchored on a lagging counter is rebuilt from the fresh read and stays healthy', async () => {
  const games = Number(data.club[0].gamesPlayed);
  const legacy = {version: 1, startedAt: 'old', players: {}, unmapped: {}, club: {anchor: games - 9, highWater: games, cutoff: Math.max(...data.matchHistory.map((m) => m.timestamp))}, issues: []};
  const {status, exitCode, ledger} = await collect({ledger: legacy});
  assert.equal(exitCode, 0); assert.equal(status.integrity.issues.length, 0); assert.equal(ledger.version, 2); assert.equal(ledger.club.anchor, ledger.club.highWater);
});
test('a stale lower club counter from EA never overwrites newer stored stats', async () => {
  const games = Number(data.club[0].gamesPlayed);
  const {next, status, exitCode} = await collect({club: withGames(games - 9), ledger: integrity.initialize(data, '70375', 't')});
  assert.equal(next.club[0].gamesPlayed, data.club[0].gamesPlayed); assert.ok(status.stale.club); assert.equal(exitCode, 0);
});
test('stale lower member counters never overwrite newer stored stats', async () => {
  const members = {...data.members, members: data.members.members.map((m, i) => (i === 0 ? {...m, gamesPlayed: String(Number(m.gamesPlayed) - 3)} : m))};
  const {next, status} = await collect({members, ledger: integrity.initialize(data, '70375', 't')});
  assert.deepEqual(next.members, data.members); assert.ok(status.stale.members);
});
test('without a consistent first read the baseline is not created and the run reports it', async () => {
  const games = Number(data.club[0].gamesPlayed);
  const {status, exitCode, counts, ledger} = await collect({club: withGames(games - 9)});
  assert.ok(status.stale.club); assert.match(status.failures.ledger, /riferimento iniziale/); assert.equal(counts.club, 2); assert.equal(exitCode, 1); assert.equal(ledger, null);
});

test('a full EA list that shares nothing with the archive is reported as a possible loss', async () => {
  const fullList = Array.from({length: 10}, (_, i) => ({...data.matches[0], matchId: 'unseen-' + i, timestamp: Number(data.matches[0].timestamp) + i}));
  const {status, exitCode} = await collect({leagueList: fullList});
  assert.equal(exitCode, 1); assert.match(status.failures.leagueMatchOverflow, /possibili partite perse/);
});
test('a full EA list that overlaps the archive is accepted', async () => {
  const list = Array.from({length: 10}, (_, i) => (i === 0 ? data.matchHistory[0] : {...data.matches[0], matchId: 'seen-' + i, timestamp: Number(data.matches[0].timestamp) + i}));
  const {status} = await collect({leagueList: list});
  assert.equal(status.failures.leagueMatchOverflow, undefined);
});
test('only league and playoff are requested from EA (friendlyMatch is always empty)', async () => {
  const {counts} = await collect();
  assert.equal(counts.friendlyMatch, undefined); assert.ok(counts.leagueMatch && counts.playoffMatch);
});
test('a collector crash is recorded in health.json instead of being thrown', async () => {
  const {tmpRoot} = require('./harness');
  const root = tmpRoot();
  require('node:fs').writeFileSync(require('node:path').join(root, 'data', 'data.json'), '{rotto');
  const {run} = require('../scripts/collector');
  const result = await run({root, fetch: async () => { throw Error('x'); }, wait: async () => {}, log: {log() {}, warn() {}, error() {}}});
  assert.equal(result.exitCode, 1);
  const health = JSON.parse(require('node:fs').readFileSync(require('node:path').join(root, 'data', 'public', 'health.json'), 'utf8'));
  assert.equal(health.consecutiveFailures, 1); assert.ok(health.failures.crash);
});
