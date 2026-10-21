import test from 'node:test';
import assert from 'node:assert/strict';
import { pairChemistry, roleContribution, constellationPairs, replayMatches } from '../shared/constellation.mjs';
const pair={n:20,ppg:2,a:{rating:8,rated:20,contribution:.8},b:{rating:8,rated:20,contribution:.8}};
test('chemistry rewards role contributions, attenuates small samples and stays bounded',()=>{
 assert.ok(pairChemistry(pair)>pairChemistry({...pair,a:{...pair.a,contribution:0},b:{...pair.b,contribution:0}}));
 assert.ok(pairChemistry(pair)>pairChemistry({...pair,n:2}));
 assert.equal(pairChemistry({...pair,ppg:3,a:{rating:10,rated:20,contribution:1},b:{rating:10,rated:20,contribution:1}}),100);
});
test('missing ratings and role data are excluded instead of fabricated',()=>{
 assert.equal(roleContribution({pos:'defender'}),null);
 assert.equal(roleContribution({pos:'defender',passesmade:0,passattempts:0,tacklesmade:0,tackleattempts:0}),null);
 assert.equal(roleContribution({pos:'midfielder',passesmade:9,passattempts:10}),.9);
 assert.equal(pairChemistry({...pair,ppg:3,a:{rating:null,rated:0},b:{rating:null,rated:0}}),100);
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
