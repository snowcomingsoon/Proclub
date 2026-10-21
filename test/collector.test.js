const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const lib=require('../scripts/lib'),integrity=require('../scripts/integrity');
const data=require('./fixtures/data-current.json');
const source=fs.readFileSync(path.join(__dirname,'../scripts/update-data.js'),'utf8');
async function collect({fail=[],recover=false}={}){
 const files=new Map([['/repo/data/data.json',JSON.stringify(data)]]),counts={};
 const incoming={...data.matches[0],matchId:'collector-new-match'};
 const proc={env:{},exitCode:0};
 const fakeFs={readFileSync:f=>files.get(f),writeFileSync:(f,c)=>files.set(f,c),existsSync:f=>files.has(f),renameSync:(a,b)=>{files.set(b,files.get(a));files.delete(a);}};
 await vm.runInNewContext(source,{require:n=>n==='node:fs'?fakeFs:n==='node:path'?path:n==='./integrity'?integrity:{...lib,archiveMatches:()=>{}},__dirname:'/repo/scripts',process:proc,console:{log(){},warn(){},error(){}},URL,AbortSignal,setTimeout:fn=>fn(),fetch:async raw=>{
  const url=new URL(raw),key=url.pathname.endsWith('/overallStats')?'club':url.pathname.endsWith('/stats')?'members':url.searchParams.get('matchType');counts[key]=(counts[key]||0)+1;
  if(fail.includes(key)&&(!recover||counts[key]<=3))throw Error('EA unavailable');
  return {ok:true,json:async()=>key==='club'?data.club:key==='members'?data.members:key==='leagueMatch'?[incoming]:[]};
 }});
 return {next:JSON.parse(files.get('/repo/data/data.json')),status:JSON.parse(files.get('/repo/data/sync-status.json')),exitCode:proc.exitCode,counts,ledger:JSON.parse(files.get('/repo/data/collection-ledger.json'))};
}
test('collector saves new matches once and retains the entire history',async()=>{const {next,status,exitCode}=await collect();assert.equal(exitCode,0);assert.equal(status.complete,true);for(const m of data.matchHistory)assert.ok(next.matchHistory.some(n=>n.matchId===m.matchId));assert.equal(next.matchHistory.filter(m=>m.matchId==='collector-new-match').length,1);});
test('failed league endpoint does not discard successful sources or old history',async()=>{const {next,status,exitCode}=await collect({fail:['leagueMatch']});assert.equal(exitCode,1);assert.equal(status.complete,false);assert.match(status.failures.leagueMatch,/unavailable/);assert.equal(next.matchHistory.length,data.matchHistory.length);});
test('failed aggregate endpoint cannot discard successfully collected match details',async()=>{const {next,status,exitCode}=await collect({fail:['members']});assert.equal(exitCode,1);assert.ok(next.matchHistory.some(m=>m.matchId==='collector-new-match'));assert.deepEqual(next.members,data.members);assert.equal(status.attempts,2);});
test('recovery round clears transient failures only after successful response',async()=>{const {status,exitCode}=await collect({fail:['playoffMatch'],recover:true});assert.equal(exitCode,0);assert.equal(status.complete,true);assert.equal(status.attempts,2);});
