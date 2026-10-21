const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const lib=require('../scripts/lib'),integrity=require('../scripts/integrity');
const data=require('./fixtures/data-current.json');
const source=fs.readFileSync(path.join(__dirname,'../scripts/update-data.js'),'utf8');
async function collect({fail=[],recover=false,ledger,stored=data,club=data.club,members=data.members,leagueList}={}){
 const files=new Map([['/repo/data/data.json',JSON.stringify(stored)]]),counts={};
 if(ledger)files.set('/repo/data/collection-ledger.json',JSON.stringify(ledger));
 const incoming={...data.matches[0],matchId:'collector-new-match'};
 const proc={env:{},exitCode:0};
 const fakeFs={readFileSync:f=>files.get(f),writeFileSync:(f,c)=>files.set(f,c),existsSync:f=>files.has(f),renameSync:(a,b)=>{files.set(b,files.get(a));files.delete(a);}};
 await vm.runInNewContext(source,{require:n=>n==='node:fs'?fakeFs:n==='node:path'?path:n==='./integrity'?integrity:{...lib,archiveMatches:()=>{}},__dirname:'/repo/scripts',process:proc,console:{log(){},warn(){},error(){}},URL,AbortSignal,setTimeout:fn=>fn(),fetch:async raw=>{
  const url=new URL(raw),key=url.pathname.endsWith('/overallStats')?'club':url.pathname.endsWith('/stats')?'members':url.searchParams.get('matchType');counts[key]=(counts[key]||0)+1;
  if(fail.includes(key)&&(!recover||counts[key]<=3))throw Error('EA unavailable');
  return {ok:true,json:async()=>key==='club'?club:key==='members'?members:key==='leagueMatch'?(leagueList||[incoming]):[]};
 }});
 return {next:JSON.parse(files.get('/repo/data/data.json')),status:JSON.parse(files.get('/repo/data/sync-status.json')),exitCode:proc.exitCode,counts,ledger:files.has('/repo/data/collection-ledger.json')?JSON.parse(files.get('/repo/data/collection-ledger.json')):null};
}
test('collector saves new matches once and retains the entire history',async()=>{const {next,status,exitCode}=await collect();assert.equal(exitCode,0);assert.equal(status.complete,true);for(const m of data.matchHistory)assert.ok(next.matchHistory.some(n=>n.matchId===m.matchId));assert.equal(next.matchHistory.filter(m=>m.matchId==='collector-new-match').length,1);});
test('failed league endpoint does not discard successful sources or old history',async()=>{const {next,status,exitCode}=await collect({fail:['leagueMatch']});assert.equal(exitCode,1);assert.equal(status.complete,false);assert.match(status.failures.leagueMatch,/unavailable/);assert.equal(next.matchHistory.length,data.matchHistory.length);});
test('failed aggregate endpoint cannot discard successfully collected match details',async()=>{const {next,status,exitCode}=await collect({fail:['members']});assert.equal(exitCode,1);assert.ok(next.matchHistory.some(m=>m.matchId==='collector-new-match'));assert.deepEqual(next.members,data.members);assert.equal(status.attempts,2);});
test('recovery round clears transient failures only after successful response',async()=>{const {status,exitCode}=await collect({fail:['playoffMatch'],recover:true});assert.equal(exitCode,0);assert.equal(status.complete,true);assert.equal(status.attempts,2);});

const withGames=n=>[{...data.club[0],gamesPlayed:String(n)}];
test('a legacy ledger anchored on a lagging counter is rebuilt from the fresh read and stays healthy',async()=>{
 const games=Number(data.club[0].gamesPlayed);
 const legacy={version:1,startedAt:'old',players:{},unmapped:{},club:{anchor:games-9,highWater:games,cutoff:Math.max(...data.matchHistory.map(m=>m.timestamp))},issues:[]};
 const {status,exitCode,ledger}=await collect({ledger:legacy});
 assert.equal(exitCode,0);assert.equal(status.integrity.issues.length,0);assert.equal(ledger.version,2);assert.equal(ledger.club.anchor,ledger.club.highWater);
});
test('a stale lower club counter from EA never overwrites newer stored stats',async()=>{
 const games=Number(data.club[0].gamesPlayed);
 const {next,status,exitCode}=await collect({club:withGames(games-9),ledger:integrity.initialize(data,'70375','t')});
 assert.equal(next.club[0].gamesPlayed,data.club[0].gamesPlayed);assert.ok(status.stale.club);assert.equal(exitCode,0);
});
test('stale lower member counters never overwrite newer stored stats',async()=>{
 const members={...data.members,members:data.members.members.map((m,i)=>i===0?{...m,gamesPlayed:String(Number(m.gamesPlayed)-3)}:m)};
 const {next,status}=await collect({members,ledger:integrity.initialize(data,'70375','t')});
 assert.deepEqual(next.members,data.members);assert.ok(status.stale.members);
});
test('without a consistent first read the baseline is not created and the run reports it',async()=>{
 const games=Number(data.club[0].gamesPlayed);
 const {status,exitCode,counts,ledger}=await collect({club:withGames(games-9)});
 assert.ok(status.stale.club);assert.match(status.failures.ledger,/riferimento iniziale/);assert.equal(counts.club,2);assert.equal(exitCode,1);assert.equal(ledger,null);
});

test('a full EA list that shares nothing with the archive is reported as a possible loss',async()=>{
 const fullList=Array.from({length:10},(_,i)=>({...data.matches[0],matchId:'unseen-'+i,timestamp:Number(data.matches[0].timestamp)+i}));
 const stored={...data,matchHistory:data.matchHistory};
 const {status,exitCode}=await collect({stored,leagueList:fullList});
 assert.equal(exitCode,1);assert.match(status.failures.leagueMatchOverflow,/possibili partite perse/);
});
test('a full EA list that overlaps the archive is accepted',async()=>{
 const list=Array.from({length:10},(_,i)=>i===0?data.matchHistory[0]:{...data.matches[0],matchId:'seen-'+i,timestamp:Number(data.matches[0].timestamp)+i});
 const {status}=await collect({leagueList:list});
 assert.equal(status.failures.leagueMatchOverflow,undefined);
});
