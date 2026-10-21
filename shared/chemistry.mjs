import { roleContribution } from './constellation.mjs';
const clamp=x=>Math.max(0,Math.min(1,x));
const avg=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
const rating=p=>p?.rating!==''&&p?.rating!=null&&Number.isFinite(Number(p.rating))&&Number(p.rating)>0?Number(p.rating):null;
const weighted=rows=>{const valid=rows.filter(r=>r.value!=null);const sum=valid.reduce((s,r)=>s+r.weight,0);return sum?valid.reduce((s,r)=>s+r.value*r.weight,0)/sum:null;};
const combined=(a,b)=>a==null||b==null?null:.7*(a+b)/2+.3*Math.min(a,b);

/** Compare each player's shared appearances with same-role appearances without the partner.
 * Requires 3 valid solo appearances per matched role. No causal interpretation. */
function baselineFor(games,context,id,partner) {
  const solo=context.filter(m=>!m.players.some(p=>p.id===partner)).flatMap(m=>m.players.filter(p=>p.id===id&&rating(p)!=null));
  const roles=new Map();
  for(const p of solo)roles.set(p.pos,[...(roles.get(p.pos)||[]),rating(p)]);
  const differences=[];const used=new Set();
  for(const m of games){const p=m.players.find(p=>p.id===id);const r=rating(p);const refs=roles.get(p?.pos);if(r!=null&&refs?.length>=3){differences.push(r-avg(refs));used.add(p.pos);}}
  return {delta:avg(differences),shared:differences.length,solo:solo.filter(p=>used.has(p.pos)).length,roles:[...used]};
}

export function chemistryDetails(pair,context=pair.games||[]) {
  const games=[...(pair.games||[])].sort((a,b)=>a.timestamp-b.timestamp||a.id.localeCompare(b.id));
  const count=games.length;
  const rows=games.map((m,i)=>{
    const a=m.players.find(p=>p.id===pair.focusId),b=m.players.find(p=>p.id===pair.id);
    const ra=rating(a),rb=rating(b);
    const ca=a?roleContribution(a):null,cb=b?roleContribution(b):null;
    return {weight:2**(-(count-1-i)/15),performance:combined(ra,rb),role:combined(ca,cb),steady:ra==null||rb==null?null:Number(ra>=7&&rb>=7),points:m.result==='V'?1:m.result==='P'?1/3:0};
  });
  const measure=key=>weighted(rows.map(r=>({weight:r.weight,value:r[key]})));
  const performance=measure('performance'), role=measure('role');
  const a=baselineFor(games,context,pair.focusId,pair.id),b=baselineFor(games,context,pair.id,pair.focusId);
  const lift=a.shared>=3&&b.shared>=3?avg([a.delta,b.delta]):null;
  const latest=rows.slice(-5).map(r=>r.performance).filter(v=>v!=null),previous=rows.slice(-10,-5).map(r=>r.performance).filter(v=>v!=null);
  const trend=latest.length>=3&&previous.length>=3?avg(latest)-avg(previous):null;
  const validRatings=rows.filter(r=>r.performance!=null).length,validRoles=rows.filter(r=>r.role!=null).length;
  const components=[
    {key:'performance',label:'Rendimento a due',weight:30,value:performance==null?null:clamp((performance-5)/4),detail:'70% media dei due voti + 30% voto più basso: conta che rendano entrambi.'},
    {key:'role',label:'Contributo nei ruoli',weight:20,value:role,detail:'Passaggi, azioni offensive, contrasti e parate secondo il ruolo di ogni presenza; 70% media + 30% contributo più basso.'},
    {key:'lift',label:'Con / senza compagno',weight:20,value:lift==null?null:clamp(.5+lift/4),detail:lift==null?'Servono almeno 3 gare valutate insieme e 3 senza il compagno negli stessi ruoli, per entrambi.':`Differenza media di voto: ${lift>=0?'+':''}${lift.toFixed(2)}. Confronto descrittivo, non effetto causale.`},
    {key:'results',label:'Risultati del club',weight:10,value:count?measure('points'):null,detail:'Punti per gara divisi per 3 nelle presenze condivise.'},
    {key:'consistency',label:'Continuità della coppia',weight:10,value:validRatings>=3?measure('steady'):null,detail:'Frequenza delle gare in cui entrambi hanno un voto EA di almeno 7; minimo 3 gare con entrambi i voti.'},
    {key:'trend',label:'Direzione recente',weight:10,value:trend==null?null:clamp(.5+trend/4),detail:trend==null?'Servono almeno 3 gare con entrambi i voti in ciascuno degli ultimi due blocchi da 5 gare.':`Ultime 5 contro le 5 precedenti: ${trend>=0?'+':''}${trend.toFixed(2)} nel rendimento a due.`},
  ];
  const available=components.filter(c=>c.value!=null),weightSum=available.reduce((s,c)=>s+c.weight,0);
  const raw=weighted(available.map(c=>({value:c.value,weight:c.weight})))??.5;
  const coverage=count?(validRatings+validRoles)/(2*count):0;
  const confidence=(count/(count+8))*(weightSum/100)*(.5+.5*coverage);
  const score=Math.round(50+confidence*(raw*100-50));
  return {score,raw:Math.round(raw*100),confidence:Math.round(confidence*100),coverage:Math.round(coverage*100),count,
    confidenceLabel:confidence>=.65?'Solida':confidence>=.4?'Intermedia':'Provvisoria',
    components:components.map(c=>({...c,score:c.value==null?null:Math.round(c.value*100),effectiveWeight:c.value==null?0:Math.round(c.weight/weightSum*100)})),
    baseline:{a,b},trend,lift,validRatings,validRoles};
}
export const pairChemistry=(pair,context)=>chemistryDetails(pair,context).score;
/** Only current-match EA identities are selectable or visible during replay. */
export function replayRoster(roster,match){const ids=new Set((match?.players||[]).map(p=>p.id));return roster.filter(p=>ids.has(p.id));}
