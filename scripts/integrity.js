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
 return {version:1,startedAt:now,players,unmapped,club:{anchor:games,highWater:games,cutoff},issues:[]};
}
/** Anchors never advance on a successful-looking poll: unresolved deficits survive future runs. */
function reconcile(previous,data,clubId,now){
 const state=JSON.parse(JSON.stringify(previous));const history=data.matchHistory||[],names=identities(history,clubId),issues=[],players=[];
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
   const expected=p.highWater-p.anchor,observed=presence(history,p.id,clubId,p.cutoff),missing=Math.max(0,expected-observed);
   if(missing)issue('player:'+p.id,'missing_appearances',{name:p.name,missing,expected,observed});
   players.push({id:p.id,name:p.name,expected,observed,missing,historicalMissing:Math.max(0,p.historicalMissing-(presence(history,p.id,clubId)-observed-p.initialKnown))});
 }
 const current=count(data.club?.[0]?.gamesPlayed);
 if(current!=null&&state.club.anchor!=null){
   if(current<state.club.highWater)issue('club-reset','counter_regression',{name:'Club',previous:state.club.highWater,current});
   state.club.highWater=Math.max(state.club.highWater,current);
   const expected=state.club.highWater-state.club.anchor,observed=history.filter(m=>Number(m.timestamp)>state.club.cutoff&&m.clubs?.[clubId]&&Object.keys(m.players?.[clubId]||{}).length).length;
   if(expected>observed)issue('club-matches','missing_matches',{name:'Club',missing:expected-observed,expected,observed});
 }
 const partial=history.filter(m=>Number(m.timestamp)>state.club.cutoff&&(!Object.keys(m.players?.[clubId]||{}).length||Object.values(m.players?.[clubId]||{}).some(p=>!validPlayer(p))));
 if(partial.length)issue('partial-matches','incomplete_match_details',{count:partial.length,matchIds:partial.map(m=>String(m.matchId))});
 state.issues=issues;state.checkedAt=now;
 return {state,summary:{startedAt:state.startedAt,checkedAt:now,issues,players,healthy:issues.length===0}};
}
module.exports={initialize,reconcile,validPlayer};
