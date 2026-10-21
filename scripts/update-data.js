const fs = require('node:fs');
const path = require('node:path');
const {mergeHistory,archiveMatches} = require('./lib');
const {initialize,reconcile} = require('./integrity');
const BASE='https://proclubs.ea.com/api/fc';
const PLATFORM=process.env.EA_PLATFORM||'common-gen5',CLUB_ID=process.env.EA_CLUB_ID||'70375';
const ROOT=path.join(__dirname,'..'),FILE=path.join(ROOT,'data','data.json'),LEDGER=path.join(ROOT,'data','collection-ledger.json');
const headers={Accept:'application/json','User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',Referer:'https://www.ea.com/'};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const validNumber=v=>v!==''&&v!=null&&Number.isFinite(Number(v))&&Number(v)>=0;
async function ea(endpoint,params,validate){
 const url=new URL(`${BASE}/${endpoint}`);for(const [k,v]of Object.entries(params))url.searchParams.set(k,v);
 let last;for(let i=0;i<3;i++){
  try{const res=await fetch(url,{headers,signal:AbortSignal.timeout(20000)});if(!res.ok)throw Error(`EA ${endpoint} HTTP ${res.status}`);const data=await res.json();if(!validate(data))throw Error(`EA ${endpoint}: risposta non valida`);return data;}
  catch(e){last=e;if(i<2)await wait(2000*(i+1));}
 }throw last;
}
function atomic(file,data){const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(data));fs.renameSync(temp,file);}
(async()=>{
 const old=JSON.parse(fs.readFileSync(FILE,'utf8')),now=new Date().toISOString();
 const saved=fs.existsSync(LEDGER)?JSON.parse(fs.readFileSync(LEDGER,'utf8')):null;
 // A ledger from an older version, or none, is rebuilt from the FIRST fresh and consistent read of this run:
 // anchoring it on stored counters that can lag behind the stored matches creates a deficit that never heals.
 let original=saved&&saved.version===2?saved:null;
 const norm=s=>String(s||'').trim().toLowerCase(),stale={};
 let next={...old},failures={},summary,state=null,attempts=0;const fetched=new Map();
 const modes=['leagueMatch','friendlyMatch','playoffMatch'];
 for(let round=0;round<2;round++){
  attempts++;
  const specs=[
   ['club','clubs/overallStats',{platform:PLATFORM,clubIds:CLUB_ID},d=>Array.isArray(d)&&String(d[0]?.clubId)===CLUB_ID&&validNumber(d[0]?.gamesPlayed)],
   ['members','members/stats',{platform:PLATFORM,clubId:CLUB_ID},d=>Array.isArray(d?.members)&&d.members.length>0&&d.members.every(m=>m.name&&validNumber(m.gamesPlayed))],
   ...modes.map(mode=>[mode,'clubs/matches',{platform:PLATFORM,clubIds:CLUB_ID,matchType:mode,maxResultCount:10},d=>Array.isArray(d)&&d.every(m=>m?.matchId&&validNumber(m.timestamp)&&m.clubs?.[CLUB_ID]&&validNumber(m.clubs[CLUB_ID].goals)&&validNumber(m.clubs[CLUB_ID].goalsAgainst))]),
  ];
  const results=await Promise.allSettled(specs.map(([,endpoint,params,validate])=>ea(endpoint,params,validate)));
  const collected=[];
  results.forEach((result,i)=>{
   const key=specs[i][0];
   if(result.status==='rejected'){failures[key]=String(result.reason.message||result.reason);return;}
   delete failures[key];
   // EA sometimes answers with a stale, lower counter: never overwrite newer stored stats with it.
   if(key==='club'&&Number(result.value[0].gamesPlayed)<Math.max(Number(old.club?.[0]?.gamesPlayed)||0,original?.club?.highWater||0)){stale.club='contatore del club arretrato';return;}
   if(key==='members'){const floor=new Map((old.members?.members||[]).map(m=>[norm(m.name),Number(m.gamesPlayed)||0]));for(const [id,p]of Object.entries(original?.players||{}))floor.set(norm(p.name),Math.max(floor.get(norm(p.name))||0,p.highWater));if(result.value.members.some(m=>Number(m.gamesPlayed)<(floor.get(norm(m.name))||0))){stale.members='contatori dei giocatori arretrati';return;}}
   delete stale[key];fetched.set(key,true);
   if(key==='club'||key==='members')next[key]=result.value;
   else collected.push(...result.value.map(m=>({...m,sourceMatchType:key})));
  });
  const merged=mergeHistory(next.matchHistory||[],collected);next.matchHistory=merged.history;
  // Preserve recent results from a temporarily unavailable competition too.
  next.matches=mergeHistory(next.matches||[],collected).history.slice(0,30);
  if(!original&&fetched.has('club')&&fetched.has('members')&&!stale.club&&!stale.members)original=initialize(next,CLUB_ID,new Date().toISOString());
  if(original){delete failures.ledger;({state,summary}=reconcile(original,next,CLUB_ID,new Date().toISOString()));}
  else{failures.ledger='riferimento iniziale non disponibile: letture EA mancanti o arretrate';const at=new Date().toISOString();summary={startedAt:at,checkedAt:at,issues:[],players:[],healthy:true};}
  // Save every successful response BEFORE a recovery attempt or eventual failure.
  if(fetched.size)next.capturedAt=new Date().toISOString();
  next.collectionStatus={...summary,endpointFailures:{...failures},stale:{...stale},attempts,complete:!Object.keys(failures).length&&summary.healthy};
  atomic(FILE,next);if(state)atomic(LEDGER,state);atomic(path.join(ROOT,'data','sync-status.json'),{checkedAt:summary.checkedAt,complete:next.collectionStatus.complete,failures:{...failures},stale:{...stale},integrity:summary,attempts});
  archiveMatches(path.join(ROOT,'data','archive'),next.matchHistory,CLUB_ID);
  if(next.collectionStatus.complete)break;
  if(round===0){console.warn('Raccolta incompleta: nuovo tentativo tra 15 secondi.');await wait(15000);}
 }
 if(Object.keys(stale).length)console.warn('Letture EA arretrate ignorate:',JSON.stringify(stale));
 console.log(JSON.stringify({attempts,failures,stale,issues:summary.issues,newMatches:next.matchHistory.length-(old.matchHistory||[]).length}));
 if(Object.keys(failures).length||summary.issues.length)process.exitCode=1;
})().catch(e=>{console.error(e.message);process.exitCode=1;});
