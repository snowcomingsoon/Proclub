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
 const original=fs.existsSync(LEDGER)?JSON.parse(fs.readFileSync(LEDGER,'utf8')):initialize(old,CLUB_ID,now);
 let next={...old},failures={},summary,state=original,attempts=0;const fetched=new Map();
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
   delete failures[key];fetched.set(key,true);
   if(key==='club'||key==='members')next[key]=result.value;
   else collected.push(...result.value.map(m=>({...m,sourceMatchType:key})));
  });
  const merged=mergeHistory(next.matchHistory||[],collected);next.matchHistory=merged.history;
  // Preserve recent results from a temporarily unavailable competition too.
  next.matches=mergeHistory(next.matches||[],collected).history.slice(0,30);
  ({state,summary}=reconcile(original,next,CLUB_ID,new Date().toISOString()));
  // Save every successful response BEFORE a recovery attempt or eventual failure.
  if(fetched.size)next.capturedAt=new Date().toISOString();
  next.collectionStatus={...summary,endpointFailures:{...failures},attempts,complete:!Object.keys(failures).length&&summary.healthy};
  atomic(FILE,next);atomic(LEDGER,state);atomic(path.join(ROOT,'data','sync-status.json'),{checkedAt:summary.checkedAt,complete:next.collectionStatus.complete,failures:{...failures},integrity:summary,attempts});
  archiveMatches(path.join(ROOT,'data','archive'),next.matchHistory,CLUB_ID);
  if(next.collectionStatus.complete)break;
  if(round===0){console.warn('Raccolta incompleta: nuovo tentativo tra 15 secondi.');await wait(15000);}
 }
 console.log(JSON.stringify({attempts,failures,issues:summary.issues,newMatches:next.matchHistory.length-(old.matchHistory||[]).length}));
 if(Object.keys(failures).length||summary.issues.length)process.exitCode=1;
})().catch(e=>{console.error(e.message);process.exitCode=1;});
