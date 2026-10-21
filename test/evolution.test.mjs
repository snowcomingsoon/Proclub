import test from 'node:test';
import assert from 'node:assert/strict';
import {makeEvolutionPlan,evolutionFor,buildEvolutions} from '../shared/evolution.mjs';
const plan=makeEvolutionPlan('a','Alpha',[{pos:'defender',tacklesmade:2,rating:7.5,passesmade:18,passattempts:20}],100);
const match=(id,timestamp,extra={})=>({id:String(id),timestamp,players:[{id:'a',pos:'defender',tacklesmade:3,rating:8,passesmade:20,passattempts:20,...extra}]});
test('targets exceed personal baseline and ignore other-role evidence',()=>{
 assert.equal(plan.requirements.impact,12);assert.equal(plan.requirements.rating,7.8);assert.equal(plan.requirements.accuracy,95);
 const mixed=makeEvolutionPlan('a','Alpha',[{pos:'forward',rating:10,tacklesmade:999},...plan.history],100);
 assert.deepEqual(mixed,plan);
 const stronger=makeEvolutionPlan('a','Strong',[{pos:'defender',tacklesmade:6,rating:8.5,passesmade:19,passattempts:20}],100);
 assert.ok(stronger.requirements.impact>plan.requirements.impact);assert.ok(stronger.requirements.rating>plan.requirements.rating);
});
test('old matches, other roles and missing fields cannot unlock rewards',()=>{
 const state=evolutionFor(plan,[match(0,99),match(1,100),match(2,101,{pos:'forward'}),...Array.from({length:5},(_,i)=>match(i+3,102+i,{tacklesmade:undefined,rating:undefined}))]);
 assert.equal(state.level,0);assert.equal(state.missions[0].value,0);assert.equal(state.windowCount,5);
});
test('all missions must pass in the same five appearances and awarded games cannot be reused',()=>{
 const good=Array.from({length:5},(_,i)=>match(i,101+i));
 assert.equal(evolutionFor(plan,good.slice(0,4)).level,0);
 const one=evolutionFor(plan,good);assert.equal(one.tier.name,'Astrale');assert.equal(one.windowCount,0);
 assert.ok(one.requirements.impact>plan.requirements.impact);assert.ok(one.requirements.rating>plan.requirements.rating);
 const bad=good.map(m=>({...m,players:m.players.map(p=>({...p,passesmade:1,passattempts:1}))}));assert.equal(evolutionFor(plan,bad).level,0);
 const two=[...good,...Array.from({length:5},(_,i)=>match(i+5,106+i,{tacklesmade:6,rating:9}))];
 assert.equal(evolutionFor(plan,two).level,2);
 const three=[...two,...Array.from({length:5},(_,i)=>match(i+10,111+i,{tacklesmade:12,rating:10}))];
 const end=evolutionFor(plan,three);assert.equal(end.level,3);assert.equal(end.next,null);assert.equal(end.earned.length,3);
});
test('a failed rolling window can recover on subsequent performances',()=>{
 const bad=Array.from({length:5},(_,i)=>match(i,101+i,{rating:6}));const good=Array.from({length:5},(_,i)=>match(i+5,106+i));
 assert.equal(evolutionFor(plan,bad).level,0);assert.equal(evolutionFor(plan,[...bad,...good]).level,1);
});
test('EA ID survives renaming; repeated snapshots do not double progress',()=>{
 const games=Array.from({length:5},(_,i)=>({matchId:String(i),timestamp:101+i,clubs:{70375:{goals:1,goalsAgainst:0}},players:{70375:{a:{playername:'NewName',pos:'defender',tacklesmade:3,rating:8,passesmade:20,passattempts:20}}}}));
 const result=buildEvolutions({matches:games,matchHistory:games,members:{members:[]}},{activatedAt:100,players:{a:plan}});
 assert.equal(result.newname.level,1);assert.equal(result.newname.earned.length,1);
});
test('new players enroll after first future appearance',()=>{
 const games=[101,102].map((timestamp,i)=>({matchId:String(i),timestamp,clubs:{70375:{goals:1,goalsAgainst:0}},players:{70375:{a:{playername:'NewName',pos:'defender',tacklesmade:2,rating:8}}}}));
 const result=buildEvolutions({matches:games,members:{members:[]}},{activatedAt:100,players:{}});
 assert.equal(result.newname.plan.start,101);assert.equal(result.newname.windowCount,1);
});
