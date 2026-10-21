import test from 'node:test';
import assert from 'node:assert/strict';
import {constellationMatches, constellationRoster, constellationPairs, pairTitle} from '../shared/constellation.mjs';
const player=(name,extra={})=>({playername:name,pos:'forward',rating:'8',goals:'1',assists:'0',...extra});
const match=(id,players,gf=2,ga=0)=>({matchId:String(id),timestamp:1000+id,players:{'70375':players},clubs:{'70375':{goals:String(gf),goalsAgainst:String(ga)},other:{details:{name:'Opponent'}}}});
test('deduplicates match IDs, rejects missing results and joins renamed players by EA ID',()=>{
 const first=match(1,{a:player('Alpha'),b:player('Beta')});
 const second=match(2,{a:player('Alpha NEW'),b:player('Beta')},0,1);
 const data={matches:[first],matchHistory:[first,second,{...match(3,{a:player('Alpha')}),clubs:{'70375':{goals:null,goalsAgainst:0}}}],members:{members:[{name:'Alpha NEW'},{name:'Beta'},{name:'Reserve'}]}};
 const ms=constellationMatches(data);assert.equal(ms.length,2);
 const roster=constellationRoster(data,ms);assert.equal(roster.length,3);assert.equal(roster.find(p=>p.id==='a').name,'Alpha NEW');
 const [pair]=constellationPairs(ms,'a');assert.equal(pair.n,2);assert.equal(pair.wins,1);assert.equal(pair.losses,1);assert.equal(pair.winPct,50);assert.equal(pair.ppg,1.5);assert.equal(pair.goals,4);
});
test('role filter uses protagonist appearance and never pulls unrelated seasonal stats',()=>{
 const ms=constellationMatches({matchHistory:[match(1,{a:player('A',{pos:'defender',goals:0}),b:player('B',{goals:2})}),match(2,{a:player('A',{goals:3}),b:player('B')})]});
 const [pair]=constellationPairs(ms,'a','defender');assert.equal(pair.n,1);assert.equal(pair.a.goals,0);assert.equal(pair.b.goals,2);assert.deepEqual(pair.a.roles,{defender:1});assert.deepEqual(pair.b.roles,{forward:1});
 assert.equal(constellationPairs(ms,'absent').length,0);
});
test('missing ratings excluded from mean; no shared goal/assist double-count label',()=>{
 const ms=constellationMatches({matchHistory:[match(1,{a:player('A',{rating:0,goals:2}),b:player('B',{assists:2})}),match(2,{a:player('A',{rating:9,goals:0}),b:player('B',{rating:null})})]});
 const [p]=constellationPairs(ms,'a');assert.equal(p.a.rating,9);assert.equal(p.a.rated,1);assert.equal(p.b.rated,1);assert.equal(p.assists,2);assert.equal(p.goals,4);assert.equal(pairTitle(p),'PRIMO CONTATTO');
});
test('empty history retains roster without fabricating connections',()=>{
 const d={members:{members:[{name:'Reserve',goals:999}]}};const ms=constellationMatches(d);const roster=constellationRoster(d,ms);assert.equal(roster[0].games,0);assert.equal(constellationPairs(ms,roster[0].id).length,0);
});
