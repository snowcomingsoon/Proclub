const test = require('node:test'), assert = require('node:assert/strict');
const {healthWanted, healthBody, shapeBody, planIssue, syncIssue, HEALTH_TITLE, HEALTH_MARKER, SHAPE_TITLE, SHAPE_MARKER} = require('../scripts/issues');
const {shapeOf, compareShape, hasDifference} = require('../scripts/ea-shape');
const {diffAll, shapesFromData} = require('../scripts/check-ea-shape');
const {data} = require('./harness');

const NOW = '2026-10-21T20:00:00.000Z';
const h = (o) => ({consecutiveFailures: 0, complete: true, failures: {}, failingSince: null, ...o});

test('healthWanted: apre dopo 3 fallimenti consecutivi o fallimenti ripetuti da oltre 2 ore', () => {
  assert.equal(healthWanted(h({consecutiveFailures: 2, complete: false, failingSince: '2026-10-21T19:50:00Z'}), {now: NOW}), 'keep');
  assert.equal(healthWanted(h({consecutiveFailures: 3, complete: false, failingSince: '2026-10-21T19:20:00Z'}), {now: NOW}), 'open');
  assert.equal(healthWanted(h({consecutiveFailures: 2, complete: false, failingSince: '2026-10-21T17:00:00Z'}), {now: NOW}), 'open');
  assert.equal(healthWanted(h({consecutiveFailures: 1, complete: false, failingSince: '2026-10-21T10:00:00Z'}), {now: NOW}), 'keep');
});
test('healthWanted: chiude alla prima esecuzione sana, non su un fallimento recente', () => {
  assert.equal(healthWanted(h({}), {now: NOW, conclusion: 'success'}), 'close');
  assert.equal(healthWanted(h({}), {now: NOW, conclusion: 'failure'}), 'keep');
  assert.equal(healthWanted(h({complete: false}), {now: NOW}), 'keep');
});
test('planIssue: crea, commenta al massimo una volta all\'ora, chiude', () => {
  const args = {title: 'T', body: 'B', commentBody: 'C', closeComment: 'ok'};
  assert.deepEqual(planIssue({...args, want: 'open', issue: null}), {action: 'create', title: 'T', body: 'B'});
  assert.deepEqual(planIssue({...args, want: 'open', issue: {number: 5}, recentActivity: true}), {action: 'none'});
  assert.deepEqual(planIssue({...args, want: 'open', issue: {number: 5}}), {action: 'comment', number: 5, body: 'C'});
  assert.deepEqual(planIssue({...args, want: 'close', issue: {number: 5}}), {action: 'close', number: 5, comment: 'ok'});
  assert.deepEqual(planIssue({...args, want: 'close', issue: null}), {action: 'none'});
  assert.deepEqual(planIssue({...args, want: 'keep', issue: {number: 5}}), {action: 'none'});
});

function mockApi({issues = [], comments = []} = {}) {
  const calls = [];
  return {calls, async request(method, path, body) {
    calls.push([method, path, body]);
    if (method === 'GET' && path.includes('/comments')) return comments;
    if (method === 'GET') return issues;
    return {};
  }};
}
const base = {repo: 'o/r', title: HEALTH_TITLE, marker: HEALTH_MARKER, body: `${HEALTH_MARKER}\nmotivo`, now: NOW};

test('syncIssue (API GitHub simulata): apre l\'issue se non esiste', async () => {
  const api = mockApi();
  const plan = await syncIssue(api, {...base, want: 'open'});
  assert.equal(plan.action, 'create');
  assert.deepEqual(api.calls.at(-1), ['POST', '/repos/o/r/issues', {title: HEALTH_TITLE, body: base.body}]);
});
test('syncIssue: ignora pull request e issue con altro titolo, non crea duplicati', async () => {
  const api = mockApi({issues: [{number: 1, title: HEALTH_TITLE, pull_request: {}, body: HEALTH_MARKER}, {number: 2, title: 'altro', body: HEALTH_MARKER}, {number: 3, title: HEALTH_TITLE, body: HEALTH_MARKER, created_at: '2026-10-21T10:00:00Z'}]});
  const plan = await syncIssue(api, {...base, want: 'open', commentBody: 'nuovo fallimento'});
  assert.equal(plan.action, 'comment'); assert.equal(plan.number, 3);
  assert.ok(!api.calls.some(([m, p]) => m === 'POST' && p === '/repos/o/r/issues'));
});
test('syncIssue: nessun commento se l\'issue o un commento e\' piu\' recente di un\'ora', async () => {
  const fresh = mockApi({issues: [{number: 3, title: HEALTH_TITLE, body: HEALTH_MARKER, created_at: '2026-10-21T19:30:00Z'}]});
  assert.equal((await syncIssue(fresh, {...base, want: 'open'})).action, 'none');
  const commented = mockApi({issues: [{number: 3, title: HEALTH_TITLE, body: HEALTH_MARKER, created_at: '2026-10-20T10:00:00Z'}], comments: [{id: 1}]});
  assert.equal((await syncIssue(commented, {...base, want: 'open'})).action, 'none');
  assert.ok(commented.calls.some(([m, p]) => m === 'GET' && p.includes('since=')));
});
test('syncIssue: chiude da sola con un commento alla prima esecuzione sana, e non fa nulla se non c\'e\' issue', async () => {
  const api = mockApi({issues: [{number: 3, title: HEALTH_TITLE, body: HEALTH_MARKER, created_at: '2026-10-20T10:00:00Z'}]});
  await syncIssue(api, {...base, want: 'close', closeComment: 'tornata sana'});
  assert.deepEqual(api.calls.slice(-2), [['POST', '/repos/o/r/issues/3/comments', {body: 'tornata sana'}], ['PATCH', '/repos/o/r/issues/3', {state: 'closed', state_reason: 'completed'}]]);
  const none = mockApi();
  assert.equal((await syncIssue(none, {...base, want: 'close'})).action, 'none'); assert.equal(none.calls.length, 1);
});
test('healthBody e shapeBody contengono il motivo e il marcatore', () => {
  const body = healthBody(h({consecutiveFailures: 3, failures: {leagueMatch: 'EA 403'}, failingSince: 'x', lastSuccessAt: 'y'}), {runUrl: 'http://run'});
  assert.ok(body.includes(HEALTH_MARKER) && body.includes('EA 403') && body.includes('http://run') && body.includes('3 volte'));
  const s = shapeBody({club: {missing: ['[].gamesPlayed'], typeChanged: [{path: 'a', was: 'string', now: 'number'}], added: []}});
  assert.ok(s.includes(SHAPE_MARKER) && s.includes('[].gamesPlayed') && s.includes('string → number'));
});

test('ea-shape: forma, id numerici normalizzati, campi nostri ignorati', () => {
  const s = shapeOf([{matchId: '1', sourceMatchType: 'leagueMatch', clubs: {70375: {goals: '1', details: {name: 'x'}}, 99: {goals: '0'}}, players: {70375: {5: {playername: 'a'}}}}]);
  assert.equal(s['[].matchId'], 'string'); assert.equal(s['[].clubs.*.goals'], 'string'); assert.equal(s['[].players.*.*.playername'], 'string');
  assert.ok(!('[].sourceMatchType' in s));
});
test('ea-shape: campi mancanti e tipi cambiati sono differenze, i campi nuovi no', () => {
  const saved = shapeOf({a: '1', b: {c: 1}, d: 'x'});
  const same = compareShape(saved, shapeOf({a: '2', b: {c: 5}, d: 'y'}));
  assert.deepEqual([same.missing, same.typeChanged, same.added], [[], [], []]);
  const diff = compareShape(saved, shapeOf({a: 2, b: {}, e: 1}));
  assert.deepEqual(diff.missing.sort(), ['b.c', 'd']); assert.deepEqual(diff.typeChanged, [{path: 'a', was: 'string', now: 'number'}]); assert.deepEqual(diff.added, ['e']);
  assert.equal(hasDifference({x: diff}), true); assert.equal(hasDifference({x: same}), false);
  assert.equal(compareShape({a: 'null'}, {a: 'string'}).typeChanged.length, 0, 'null non conta come tipo');
});
test('check-ea-shape: lo schema salvato coincide con i dati reali, le liste vuote non si verificano', () => {
  const schema = require('../config/ea-shape.json');
  const shapes = shapesFromData(data);
  const live = {club: data.club, members: data.members, leagueMatch: data.matchHistory.filter((m) => m.sourceMatchType === 'leagueMatch'), playoffMatch: []};
  const {diffs, skipped} = diffAll({shapes}, live);
  assert.equal(hasDifference(diffs), false); assert.deepEqual(skipped, ['playoffMatch']);
  assert.ok(schema.version === 1 && schema.shapes.club && schema.shapes.members && schema.shapes.leagueMatch);
  const {gamesPlayed, ...rest} = data.club[0];
  const broken = {...live, club: [rest]};
  const bad = diffAll({shapes}, broken);
  assert.deepEqual(bad.diffs.club.missing, ['[].gamesPlayed']);
});
