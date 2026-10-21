import { constellationMatches, constellationRoster, ROLE_NAMES } from './constellation.mjs';
export const EVOLUTION_TIERS = [
  {name:'Origine',key:'origin'}, {name:'Astrale',key:'astral'},
  {name:'Supernova',key:'supernova'}, {name:'Singolarità',key:'singularity'},
];
const number=v=>v!==''&&v!=null&&Number.isFinite(Number(v))?Math.max(0,Number(v)):null;
const average=values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
const validValues=(rows,key)=>rows.map(p=>number(p[key])).filter(v=>v!=null);
function benchmark(rows,role) {
  const same=rows.filter(p=>p.pos===role), recent=same.slice(-10);
  const metric={forward:'goals',midfielder:'assists',defender:'tacklesmade',goalkeeper:'saves'}[role];
  const metricAvg=Math.max(average(validValues(same,metric))??0,average(validValues(recent,metric))??0);
  const allRatings=validValues(same,'rating').filter(v=>v>0),recentRatings=validValues(recent,'rating').filter(v=>v>0);
  const rating=Math.max(average(allRatings)??0,average(recentRatings)??0);
  const accuracyRows=recent.filter(p=>role==='goalkeeper'?number(p.saves)!=null&&number(p.goalsconceded)!=null:number(p.passesmade)!=null&&number(p.passattempts)!=null);
  const attempts=accuracyRows.reduce((sum,p)=>sum+(role==='goalkeeper'?number(p.saves)+number(p.goalsconceded):number(p.passattempts)),0);
  const made=accuracyRows.reduce((sum,p)=>sum+number(p[role==='goalkeeper'?'saves':'passesmade']),0);
  return {sample:same.length,metricPerGame:metricAvg,rating,accuracy:attempts?made/attempts:null,attemptsPerGame:accuracyRows.length?attempts/accuracyRows.length:0};
}
function requirements(base,role,previous) {
  const minimum=role==='forward'||role==='midfielder'?3:10;
  return {
    impact:Math.max(minimum,Math.ceil(base.metricPerGame*5*1.2),previous?Math.ceil(previous.impact*1.1):0),
    rating:Math.min(10,Math.max(7.5,Math.ceil((base.rating+.3)*10)/10,previous?Math.round((previous.rating+.1)*10)/10:0)),
    accuracy:Math.min(100,Math.max(role==='goalkeeper'?75:80,Math.ceil((base.accuracy??.7)*100)+(role==='goalkeeper'?8:5),previous?previous.accuracy+2:0)),
    attempts:Math.max(role==='goalkeeper'?10:50,Math.ceil(base.attemptsPerGame*5*.8)),
  };
}
export function makeEvolutionPlan(id,name,rows,start) {
  const role=rows.at(-1)?.pos;
  if(!ROLE_NAMES[role]) return null;
  const metric={forward:'goals',midfielder:'assists',defender:'tacklesmade',goalkeeper:'saves'}[role];
  const baseline=benchmark(rows,role);
  const history=rows.filter(p=>p.pos===role).map(p=>Object.fromEntries(['pos','rating',metric,'passesmade','passattempts','saves','goalsconceded'].map(k=>[k,p[k]])));
  return {id,name,role,metric,start,baseline,requirements:requirements(baseline,role),history};
}
function assess(window,plan,target) {
  const impactValues=validValues(window,plan.metric),ratings=validValues(window,'rating').filter(v=>v>0);
  const accuracyRows=window.filter(p=>plan.role==='goalkeeper'?number(p.saves)!=null&&number(p.goalsconceded)!=null:number(p.passesmade)!=null&&number(p.passattempts)!=null);
  const attempts=accuracyRows.reduce((s,p)=>s+(plan.role==='goalkeeper'?number(p.saves)+number(p.goalsconceded):number(p.passattempts)),0);
  const made=accuracyRows.reduce((s,p)=>s+number(p[plan.role==='goalkeeper'?'saves':'passesmade']),0);
  const metricLabel={goals:'gol',assists:'assist',tacklesmade:'contrasti riusciti',saves:'parate'}[plan.metric];
  const full=window.length===5;
  const accuracy=attempts?made/attempts*100:null;
  return [
    {label:metricLabel,value:impactValues.reduce((a,b)=>a+b,0),target:target.impact,unit:'',done:full&&impactValues.length===5&&impactValues.reduce((a,b)=>a+b,0)>=target.impact},
    {label:'Voto medio EA',value:average(ratings),target:target.rating,unit:'',digits:2,done:full&&ratings.length===5&&average(ratings)+1e-9>=target.rating},
    {label:plan.role==='goalkeeper'?'Percentuale di parate':'Precisione passaggi',value:accuracy,target:target.accuracy,unit:'%',digits:1,detail:`${attempts} / ${target.attempts} ${plan.role==='goalkeeper'?'tiri affrontati':'passaggi tentati'} minimi`,done:full&&accuracyRows.length===5&&attempts>=target.attempts&&accuracy+1e-9>=target.accuracy},
  ];
}
export function evolutionFor(plan,matches) {
  const events=matches.filter(m=>m.timestamp>plan.start).flatMap(m=>m.players.filter(p=>p.id===plan.id&&p.pos===plan.role).map(p=>({p,timestamp:m.timestamp,id:m.id}))).sort((a,b)=>a.timestamp-b.timestamp||a.id.localeCompare(b.id));
  let level=0,start=0,target=plan.requirements,baseline=plan.baseline;
  const earned=[];
  for(let i=4;i<events.length&&level<3;i++) {
    if(i-start<4)continue;
    const missions=assess(events.slice(i-4,i+1).map(e=>e.p),plan,target);
    if(missions.every(m=>m.done)) {
      level++;earned.push({name:EVOLUTION_TIERS[level].name,timestamp:events[i].timestamp,matchId:events[i].id,requirements:target});start=i+1;
      if(level<3){baseline=benchmark([...plan.history,...events.slice(0,i+1).map(e=>e.p)],plan.role);target=requirements(baseline,plan.role,target);}
    }
  }
  const window=level===3?events.slice(start-5,start):events.slice(Math.max(start,events.length-5));
  return {plan,level,tier:EVOLUTION_TIERS[level],next:EVOLUTION_TIERS[level+1]||null,baseline,requirements:target,windowCount:window.length,
    missions:assess(window.map(e=>e.p),plan,target),earned,attempted:level===3?5:events.length-start};
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
