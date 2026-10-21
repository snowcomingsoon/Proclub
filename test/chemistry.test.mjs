import {chemistryDetails,replayRoster} from '../shared/chemistry.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { roleContribution, constellationPairs, replayMatches } from '../shared/constellation.mjs';
const pro=(id,rating=8)=>({id,playername:id,pos:'defender',rating,passesmade:19,passattempts:20,tacklesmade:4,tackleattempts:5,cleansheetsdef:1});
const games=(count=20,rating=8)=>Array.from({length:count},(_,i)=>({id:String(i),timestamp:i+100,result:'V',gf:2,ga:0,players:[pro('a',rating),pro('b',rating)]}));
const pairOf=ms=>constellationPairs(ms,'a')[0];
test('evidence shrinks small samples toward neutral and final score stays bounded',()=>{
 const long=chemistryDetails(pairOf(games(20))),short=chemistryDetails(pairOf(games(2)));
 assert.ok(long.score>short.score);assert.ok(short.score>=50);assert.ok(long.score<100);assert.ok(short.confidence<long.confidence);
 const missing=games(3).map(m=>({...m,players:m.players.map(p=>({id:p.id,playername:p.playername,pos:'unknown'}))}));
 const analysis=chemistryDetails(pairOf(missing));assert.equal(analysis.components.find(c=>c.key==='performance').score,null);assert.ok(analysis.confidence<short.confidence);
});
test('same-role solo baseline distinguishes positive and negative associations',()=>{
 const shared=games(15,8),solo=r=>Array.from({length:8},(_,i)=>({id:'solo'+i,timestamp:i,result:'V',gf:1,ga:0,players:[pro(i%2?'a':'b',r)]}));
 const positive=chemistryDetails(pairOf(shared),[...shared,...solo(6)]),negative=chemistryDetails(pairOf(shared),[...shared,...solo(9)]);
 assert.equal(positive.lift,2);assert.equal(negative.lift,-1);assert.ok(positive.score>negative.score);
 const otherRole=solo(6).map(m=>({...m,players:m.players.map(p=>({...p,pos:'forward'}))}));
 assert.equal(chemistryDetails(pairOf(shared),[...shared,...otherRole]).lift,null);
});
test('trend compares separate blocks and a single player cannot supply the missing partner rating',()=>{
 const ms=games(10).map((m,i)=>({...m,players:[pro('a',i<5?6:8),pro('b',i<5?6:8)]}));
 assert.ok(Math.abs(chemistryDetails(pairOf(ms)).trend-2)<1e-9);
 const missing=ms.map(m=>({...m,players:[m.players[0],{...m.players[1],rating:undefined}]}));
 assert.equal(chemistryDetails(pairOf(missing)).validRatings,0);
});
test('replay roster excludes absent IDs and returns nobody for a missing frame',()=>{
 const roster=[{id:'a'},{id:'b'},{id:'c'}];assert.deepEqual(replayRoster(roster,{players:[{id:'b'}]}),[{id:'b'}]);assert.deepEqual(replayRoster(roster,undefined),[]);
});
test('missing role fields are excluded, with no division by zero',()=>{
 assert.equal(roleContribution({pos:'defender'}),null);
 assert.equal(roleContribution({pos:'defender',passesmade:0,passattempts:0,tacklesmade:0,tackleattempts:0}),null);
 assert.equal(roleContribution({pos:'midfielder',passesmade:9,passattempts:10}),.9);
});
test('defenders and keepers can earn full role contribution without attacking returns',()=>{
 assert.equal(roleContribution({pos:'defender',goals:0,assists:0,passesmade:20,passattempts:20,tacklesmade:4,tackleattempts:4,cleansheetsdef:1}),1);
 assert.equal(roleContribution({pos:'goalkeeper',goals:0,assists:0,saves:5,goalsconceded:0,cleansheetsgk:1}),1);
 assert.equal(roleContribution({pos:'goalkeeper',saves:0,goalsconceded:0,cleansheetsgk:1}),1);
});
test('each appearance uses its actual role including role switches',()=>{
 const rows=[{id:'a',playername:'A',pos:'forward',goals:0,assists:0,passesmade:0,passattempts:10},{id:'a',playername:'A',pos:'defender',passesmade:10,passattempts:10,tacklesmade:4,tackleattempts:4,cleansheetsdef:1}];
 const matches=rows.map((p,i)=>({id:String(i),result:'V',gf:1,ga:0,players:[p,{id:'b',playername:'B',pos:'midfielder'}]}));
 const p=constellationPairs(matches,'a')[0];assert.equal(p.a.contribution,.5);assert.equal(p.a.contributionGames,2);assert.deepEqual(p.a.roles,{forward:1,defender:1});
});
test('replay includes its selected match and excludes every future result',()=>{
 const matches=[{id:'old'},{id:'first'},{id:'last'}];
 assert.deepEqual(replayMatches(matches,'first'),matches.slice(0,2));
 assert.deepEqual(replayMatches(matches,'last'),matches);
 assert.deepEqual(replayMatches(matches,'missing'),[]);
 assert.equal(matches.length,3);
});
