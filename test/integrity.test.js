const test=require('node:test'),assert=require('node:assert/strict');
const {initialize,reconcile}=require('../scripts/integrity');const {mergeHistory}=require('../scripts/lib');
const player={playername:'A',pos:'forward',goals:'1',assists:'0',rating:'8'};
const match=(id,timestamp=Number(id))=>({matchId:String(id),timestamp,clubs:{70375:{goals:1,goalsAgainst:0}},players:{70375:{a:{...player}}}});
const data=(games,history)=>({club:[{clubId:'70375',gamesPlayed:games}],members:{members:[{name:'A',gamesPlayed:games}]},matchHistory:history});
test('historical gaps are baselined; new gaps persist across unchanged successful polls',()=>{
 const baseline=initialize(data(10,[match(1)]),'70375','start');
 const first=reconcile(baseline,data(12,[match(2),match(1)]),'70375','one');
 assert.equal(first.summary.players[0].missing,1);assert.equal(first.summary.players[0].historicalMissing,9);
 const second=reconcile(first.state,data(12,[match(2),match(1)]),'70375','two');
 assert.equal(second.summary.players[0].missing,1);assert.equal(second.summary.issues.find(i=>i.kind==='missing_appearances').firstSeen,'one');
 const healed=reconcile(second.state,data(12,[match(3),match(2),match(1)]),'70375','three');assert.equal(healed.summary.healthy,true);
});
test('recovering an old match cannot hide a new missing appearance',()=>{const baseline=initialize(data(10,[match(10)]),'70375','start');const next=reconcile(baseline,data(11,[match(9),match(10)]),'70375','now');assert.equal(next.summary.players[0].missing,1);assert.equal(next.summary.players[0].historicalMissing,8);});
test('counter regressions and partial match payloads remain visible',()=>{const base=initialize(data(10,[match(1)]),'70375','start');const incomplete=match(2);delete incomplete.players[70375].a.assists;const r=reconcile(base,data(11,[match(1),incomplete]),'70375','now');assert.ok(r.summary.issues.some(i=>i.kind==='incomplete_match_details'));assert.equal(r.summary.players[0].missing,1);assert.ok(reconcile(r.state,data(5,[match(1),incomplete]),'70375','later').summary.issues.some(i=>i.kind==='counter_regression'));});
test('refreshing known matches fills missing fields without deleting existing players or values',()=>{const old=match(1);delete old.players[70375].a.assists;old.players[70375].b={...player,playername:'B'};const fresh=match(1);fresh.players[70375].a.goals=null;const result=mergeHistory([old],[fresh,fresh]);assert.equal(result.history.length,1);assert.equal(result.fresh.length,0);assert.equal(result.history[0].players[70375].a.assists,'0');assert.equal(result.history[0].players[70375].a.goals,'1');assert.ok(result.history[0].players[70375].b);});
test('known members without archived identities are baselined and later matched by EA ID',()=>{const d=data(10,[]);const base=initialize(d,'70375','start');assert.equal(reconcile(base,d,'70375','now').summary.healthy,true);const next=reconcile(base,data(11,[match(1)]),'70375','later');assert.equal(next.summary.players[0].expected,1);assert.equal(next.summary.players[0].observed,1);assert.equal(next.summary.healthy,true);});

test('a deficit stays pending for 12 hours and is then written off as lost on EA side',()=>{
 const t=h=>new Date(Date.UTC(2026,9,21,0,0)+h*3600000).toISOString();
 const base=initialize(data(10,[match(1)]),'70375',t(0));
 const first=reconcile(base,data(12,[match(2),match(1)]),'70375',t(1));
 assert.ok(first.summary.issues.length>0);assert.ok(first.summary.issues.every(i=>i.pending));assert.equal(first.summary.healthy,false);
 const early=reconcile(first.state,data(12,[match(2),match(1)]),'70375',t(12));
 assert.ok(early.summary.issues.every(i=>i.pending),'11 hours after first seen is still within the grace period');
 const late=reconcile(early.state,data(12,[match(2),match(1)]),'70375',t(14));
 assert.equal(late.summary.healthy,true);assert.equal(late.summary.lostClubMatches,1);assert.ok(late.summary.writtenOff.some(w=>w.scope==='club'&&w.count===1));
 const next=reconcile(late.state,data(12,[match(2),match(1)]),'70375',t(15));
 assert.equal(next.summary.healthy,true);
 const afterRecovery=reconcile(next.state,data(12,[match(3),match(2),match(1)]),'70375',t(16));
 assert.equal(afterRecovery.summary.healthy,true);
});
test('only genuine problems are blocking: counter regressions are not pending',()=>{
 const base=initialize(data(10,[match(1)]),'70375','start');
 const r=reconcile(base,data(9,[match(1)]),'70375','now');
 assert.ok(r.summary.issues.some(i=>i.kind==='counter_regression'&&!i.pending));
});
