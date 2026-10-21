import { constellationMatches, constellationRoster, ROLE_NAMES } from './constellation.mjs';
export const EVOLUTION_TIERS = [
  {name:'Origine',key:'origin'}, {name:'Astrale',key:'astral'},
  {name:'Supernova',key:'supernova'}, {name:'Singolarità',key:'singularity'},
];
const number=v=>v!==''&&v!=null&&Number.isFinite(Number(v))?Math.max(0,Number(v)):null;
export function makeEvolutionPlan(id,name,rows,start) {
  const recent=rows.slice(-5), role=recent.at(-1)?.pos;
  if(!ROLE_NAMES[role]) return null;
  const same=recent.filter(p=>p.pos===role);
  const metric={forward:'goals',midfielder:'assists',defender:'tacklesmade',goalkeeper:'saves'}[role];
  const values=same.map(p=>number(p[metric])).filter(v=>v!=null);
  const ratings=same.map(p=>number(p.rating)).filter(v=>v>0);
  const base=role==='forward'||role==='midfielder'?2:6;
  const target=Math.max(base,Math.min(base*5,Math.ceil((values.length?values.reduce((a,b)=>a+b,0)/values.length:base/3)*3)));
  const vote=Math.min(8.5,Math.max(7.2,Math.round(((ratings.length?ratings.reduce((a,b)=>a+b,0)/ratings.length:7)+.2)*10)/10));
  return {id,name,role,metric,target,vote,start};
}
export function evolutionFor(plan,matches) {
  const rows=matches.filter(m=>m.timestamp>plan.start).flatMap(m=>m.players.filter(p=>p.id===plan.id&&p.pos===plan.role));
  const total=rows.reduce((s,p)=>s+(number(p[plan.metric])??0),0);
  const rated=rows.filter(p=>(number(p.rating)??0)>=plan.vote).length;
  const values=[rows.length,total,rated];
  const targets=mult=>[3*mult,plan.target*mult,2*mult];
  let level=0;
  for(const mult of [1,2,4]) if(values.every((v,i)=>v>=targets(mult)[i]))level++;else break;
  const mult=[1,2,4][Math.min(level,2)];
  const metricLabel={goals:'gol',assists:'assist',tacklesmade:'contrasti riusciti',saves:'parate'}[plan.metric];
  const labels=[`Presenze da ${ROLE_NAMES[plan.role]}`,metricLabel,`Gare con voto EA ≥ ${plan.vote.toFixed(1)}`];
  return {plan,level,tier:EVOLUTION_TIERS[level],next:EVOLUTION_TIERS[level+1]||null,
    missions:targets(mult).map((target,i)=>({label:labels[i],value:values[i],target,done:values[i]>=target})),
    earned:[1,2,4].map((m,i)=>({name:EVOLUTION_TIERS[i+1].name,unlocked:level>i,targets:targets(m)}))};
}
export function buildEvolutions(data,campaign) {
  const matches=constellationMatches(data),roster=constellationRoster(data,matches);
  const byName={};
  for(const player of roster) {
    let plan=campaign.players[player.id];
    if(!plan) {
      const first=matches.find(m=>m.timestamp>campaign.activatedAt&&m.players.some(p=>p.id===player.id&&ROLE_NAMES[p.pos]));
      const row=first?.players.find(p=>p.id===player.id);
      if(row) plan=makeEvolutionPlan(player.id,player.name,[row],first.timestamp);
    }
    if(plan)byName[player.name.toLowerCase()]=evolutionFor(plan,matches);
  }
  return byName;
}
