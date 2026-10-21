const GRACE_MS=12*3600*1000;
const expired=(first,now)=>!!first&&Date.parse(now)-Date.parse(first)>=GRACE_MS;
const norm=s=>String(s||'').trim().toLowerCase();
const count=v=>v!==''&&v!=null&&Number.isFinite(Number(v))&&Number(v)>=0?Number(v):null;
const validPlayer=p=>p&&p.playername&&p.pos&&['goals','assists','rating'].every(k=>count(p[k])!=null);
function identities(history,clubId){const names=new Map();for(const m of [...history].sort((a,b)=>a.timestamp-b.timestamp))for(const [id,p]of Object.entries(m.players?.[clubId]||{}))if(p.playername)names.set(norm(p.playername),String(id));return names;}
function presence(history,id,clubId,cutoff=-Infinity){return history.filter(m=>Number(m.timestamp)>cutoff&&validPlayer(m.players?.[clubId]?.[id])).length;}
function initialize(data,clubId,now){
 const history=data.matchHistory||[],names=identities(history,clubId),cutoff=Math.max(0,...history.map(m=>Number(m.timestamp)||0));
 const unmapped={};
 const players={};for(const m of data.members?.members||[]){const id=names.get(norm(m.name)),games=count(m.gamesPlayed);if(id&&games!=null)players[id]={id,name:m.name,anchor:games,highWater:games,cutoff,historicalMissing:Math.max(0,games-presence(history,id,clubId)),initialKnown:presence(history,id,clubId)};else if(games!=null)unmapped[norm(m.name)]={name:m.name,anchor:games,highWater:games,cutoff,historicalMissing:games,initialKnown:0};}
 const games=count(data.club?.[0]?.gamesPlayed);
 return {version:2,startedAt:now,players,unmapped,club:{anchor:games,highWater:games,cutoff},issues:[]};
}
/** Anchors never advance on a successful-looking poll: unresolved deficits survive future runs. */
function reconcile(previous,data,clubId,now){
 const state=JSON.parse(JSON.stringify(previous));const history=data.matchHistory||[],names=identities(history,clubId),issues=[],players=[];
 state.writtenOff=state.writtenOff||[];
 const prior=new Map((state.issues||[]).map(x=>[x.key,x]));
 const issue=(key,kind,detail)=>issues.push({key,kind,...detail,firstSeen:prior.get(key)?.firstSeen||now,lastSeen:now});
 for(const m of data.members?.members||[]){
   const id=names.get(norm(m.name)),games=count(m.gamesPlayed);
   if(games==null){issue('counter:'+norm(m.name),'invalid_counter',{name:m.name});continue;}
   if(!id){const pending=state.unmapped[norm(m.name)]||{name:m.name,anchor:0,highWater:0,cutoff:state.club.cutoff,historicalMissing:0,initialKnown:0};pending.highWater=Math.max(pending.highWater,games);state.unmapped[norm(m.name)]=pending;if(pending.highWater>pending.anchor)issue('identity:'+norm(m.name),'unverified_player',{name:m.name});continue;}
   if(!state.players[id]&&state.unmapped[norm(m.name)]){state.players[id]={...state.unmapped[norm(m.name)],id};delete state.unmapped[norm(m.name)];}
   if(!state.players[id]){state.players[id]={id,name:m.name,anchor:0,highWater:0,cutoff:state.club.cutoff,historicalMissing:0,initialKnown:0};}
   const p=state.players[id];p.name=m.name;
   if(games<p.highWater){issue('reset:'+id,'counter_regression',{name:m.name,previous:p.highWater,current:games});}
   p.highWater=Math.max(p.highWater,games);
 }
 for(const p of Object.values(state.players)){
   const expected=p.highWater-p.anchor,observed=presence(history,p.id,clubId,p.cutoff);let missing=Math.max(0,expected-observed);
   if(missing){
     // EA keeps only its last 10 matches per mode: after a grace period an unlisted appearance is lost on EA's side, not ours.
     const first=prior.get('player:'+p.id)?.firstSeen;
     if(expired(first,now)){p.anchor+=missing;p.writtenOff=(p.writtenOff||0)+missing;state.writtenOff.push({at:now,scope:'player',id:p.id,name:p.name,count:missing,since:first});missing=0;}
     else issue('player:'+p.id,'missing_appearances',{name:p.name,missing,expected,observed,pending:true});
   }
   players.push({id:p.id,name:p.name,expected,observed,missing,historicalMissing:Math.max(0,p.historicalMissing-(presence(history,p.id,clubId)-observed-p.initialKnown))});
 }
 const current=count(data.club?.[0]?.gamesPlayed);
 if(current!=null&&state.club.anchor!=null){
   if(current<state.club.highWater)issue('club-reset','counter_regression',{name:'Club',previous:state.club.highWater,current});
   state.club.highWater=Math.max(state.club.highWater,current);
   const expected=state.club.highWater-state.club.anchor,observed=history.filter(m=>Number(m.timestamp)>state.club.cutoff&&m.clubs?.[clubId]&&Object.keys(m.players?.[clubId]||{}).length).length;
   if(expected>observed){
     const missing=expected-observed,first=prior.get('club-matches')?.firstSeen;
     if(expired(first,now)){state.club.anchor+=missing;state.club.writtenOff=(state.club.writtenOff||0)+missing;state.writtenOff.push({at:now,scope:'club',name:'Club',count:missing,since:first});}
     else issue('club-matches','missing_matches',{name:'Club',missing,expected,observed,pending:true});
   }
 }
 const partial=history.filter(m=>Number(m.timestamp)>state.club.cutoff&&(!Object.keys(m.players?.[clubId]||{}).length||Object.values(m.players?.[clubId]||{}).some(p=>!validPlayer(p))));
 if(partial.length)issue('partial-matches','incomplete_match_details',{count:partial.length,matchIds:partial.map(m=>String(m.matchId))});
 state.writtenOff=state.writtenOff.slice(-200);state.issues=issues;state.checkedAt=now;
 return {state,summary:{startedAt:state.startedAt,checkedAt:now,issues,players,writtenOff:state.writtenOff.slice(-20),lostClubMatches:state.club.writtenOff||0,healthy:issues.length===0}};
}
module.exports={initialize,reconcile,validPlayer};
