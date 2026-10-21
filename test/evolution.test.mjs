import test from 'node:test';
import assert from 'node:assert/strict';
import {makeEvolutionPlan,evolutionFor,buildEvolutions} from '../shared/evolution.mjs';
const plan=makeEvolutionPlan('a','Alpha',[{pos:'defender',tacklesmade:2,rating:7.5}],100);
const match=(id,timestamp,extra={})=>({id:String(id),timestamp,players:[{id:'a',pos:'defender',tacklesmade:2,rating:8,...extra}]});
test('personal targets are frozen from latest role and same-role recent evidence',()=>{
 assert.equal(plan.target,6);assert.equal(plan.vote,7.7);
 const mixed=makeEvolutionPlan('a','Alpha',[{pos:'forward',rating:10,tacklesmade:999},{pos:'defender',rating:7.5,tacklesmade:2}],100);
 assert.deepEqual(mixed,plan);
});
test('old games, other roles and absent data cannot unlock evolution',()=>{
 const state=evolutionFor(plan,[match(0,99),match(1,100),match(2,101,{pos:'forward',goals:10}),match(3,102,{tacklesmade:undefined,rating:undefined})]);
 assert.equal(state.level,0);assert.deepEqual(state.missions.map(m=>m.value),[1,0,0]);
});
test('all missions must be complete, with cumulative three-stage rarities',()=>{
 const games=Array.from({length:12},(_,i)=>match(i,101+i));
 assert.equal(evolutionFor(plan,games.slice(0,2)).level,0);
 assert.equal(evolutionFor(plan,games.slice(0,3)).tier.name,'Astrale');
 assert.equal(evolutionFor(plan,games.slice(0,6)).tier.name,'Supernova');
 assert.equal(evolutionFor(plan,games).tier.name,'Singolarità');
 assert.equal(evolutionFor(plan,games).next,null);
 assert.equal(evolutionFor(plan,games.map(m=>({...m,players:m.players.map(p=>({...p,rating:6}))}))).level,0);
});
test('same EA ID survives renaming and duplicate data does not double progress',()=>{
 const games=Array.from({length:3},(_,i)=>({matchId:String(i),timestamp:101+i,clubs:{70375:{goals:1,goalsAgainst:0}},players:{70375:{a:{playername:'NewName',pos:'defender',tacklesmade:2,rating:8}}}}));
 const data={matches:games,matchHistory:games,members:{members:[]}};
 const result=buildEvolutions(data,{activatedAt:100,players:{a:plan}});
 assert.equal(result.newname.level,1);assert.equal(result.newname.missions[0].value,3);
});
test('new players start after first future appearance instead of receiving retroactive rewards',()=>{
 const games=[101,102].map((timestamp,i)=>({matchId:String(i),timestamp,clubs:{70375:{goals:1,goalsAgainst:0}},players:{70375:{a:{playername:'NewName',pos:'defender',tacklesmade:2,rating:8}}}}));
 const result=buildEvolutions({matches:games,members:{members:[]}},{activatedAt:100,players:{}});
 assert.equal(result.newname.plan.start,101);assert.equal(result.newname.missions[0].value,1);
});
