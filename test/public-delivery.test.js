const {test} = require('node:test');
const assert = require('node:assert/strict');
const {compare, check} = require('../scripts/check-public-data');
const expected = {capturedAt:'2026-10-25T16:29:00Z', club:[{}], matchHistory:[{matchId:'1'},{matchId:'2'}]};
test('detects a missing match even with a fresh timestamp', () => {
  assert.match(compare(expected, {...expected, matchHistory:[{matchId:'1'}]}, Date.parse(expected.capturedAt))[0], /2/);
  assert.equal(compare(expected, expected, Date.parse(expected.capturedAt)).length, 0);
});
test('does not mark healthy when only cache-busted requests work', async () => {
  const report = await check({expected, now:()=>Date.parse(expected.capturedAt), base:'https://example.com', attempts:2, wait:async()=>{}, fetchFn:async url=>({ok:true,json:async()=>url.search ? expected : {...expected,matchHistory:[]}})});
  assert.equal(report.healthy, false);
  assert.equal(report.observations.length, 4);
});
test('confirms recovery only when ordinary visitor URL catches up', async () => {
  let calls=0;
  const report = await check({expected, now:()=>Date.parse(expected.capturedAt), base:'https://example.com', wait:async()=>{}, fetchFn:async()=>({ok:true,json:async()=>++calls < 3 ? {...expected,capturedAt:'2026-10-24T00:00:00Z'} : expected})});
  assert.equal(report.healthy, true);
  assert.equal(report.observations.length, 3);
});

test('identical archive and public data are unhealthy when both are stale', () => {
  assert.match(compare(expected, expected, Date.parse(expected.capturedAt) + 91 * 60000).join(' '), /Raccolta ferma/);
});
