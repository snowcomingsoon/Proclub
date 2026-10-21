import test from 'node:test';
import assert from 'node:assert/strict';
import { pairChemistry } from '../shared/constellation.mjs';
const pair = {n:20,goals:40,assists:20,ppg:2,a:{rating:8,rated:20},b:{rating:8,rated:20}};
test('shared performance rewards productive pairs, attenuates small samples and stays bounded',()=>{
 assert.ok(pairChemistry(pair)>pairChemistry({...pair,goals:0,assists:0}));
 assert.ok(pairChemistry(pair)>pairChemistry({...pair,n:2,goals:4,assists:2}));
 assert.equal(pairChemistry({...pair,goals:999,ppg:3,a:{rating:10,rated:20},b:{rating:10,rated:20}}),100);
});
test('missing ratings are excluded instead of treated as zero performance',()=>{
 const score=pairChemistry({...pair,a:{rating:null,rated:0},b:{rating:null,rated:0}});
 assert.ok(Number.isFinite(score)&&score>0&&score<=100);
});
