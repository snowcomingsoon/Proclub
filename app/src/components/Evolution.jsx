import {createContext,useContext,useMemo} from 'react';
import {buildEvolutions,EVOLUTION_TIERS} from '../../../shared/evolution.mjs';
import {ROLE_NAMES} from '../../../shared/constellation.mjs';
import campaign from '../../../shared/evolution-campaign.json';
import './evolution.css';
const EvolutionContext=createContext({});
export function EvolutionProvider({data,children}) {
  const evolutions=useMemo(()=>buildEvolutions(data,campaign),[data]);
  return <EvolutionContext.Provider value={evolutions}>{children}</EvolutionContext.Provider>;
}
export const useEvolution=name=>useContext(EvolutionContext)[String(name||'').toLowerCase()];
export function EvolutionPanel({name,compact=false}) {
  const evolution=useEvolution(name);
  if(!evolution)return <section className="evo-panel"><span className="evo-kicker">EVOLUZIONE PERSONALE</span><h2>Il tuo percorso sta per iniziare.</h2><p>La prima nuova presenza con un ruolo EA riconosciuto attiverà gli obiettivi di {name}. Il progresso partirà dalla gara successiva.</p></section>;
  const {plan,level,tier,next,missions,baseline,requirements,windowCount,attempted}=evolution;
  const fmt=(n,d=0)=>n==null?'—':n.toLocaleString('it-IT',{maximumFractionDigits:d,minimumFractionDigits:d});
  return <section className={`evo-panel evo-${tier.key} ${compact?'evo-compact':''}`} aria-label={`Obiettivi di ${name}`}>
    <header><div><span className="evo-kicker">EVOLUZIONE PERSONALE · {ROLE_NAMES[plan.role]}</span><h2>{next?`Destinazione ${next.name}.`:'Singolarità raggiunta.'}</h2><p>{next?`Supera tutti e tre gli obiettivi nella stessa finestra di 5 presenze da ${ROLE_NAMES[plan.role]}.`:'Hai completato tutti i traguardi di questa campagna.'}</p></div><span className="evo-insignia" aria-label={`Rarità evoluzione: ${tier.name}`}>✦<small>{tier.name}</small></span></header>
    <ol className="evo-ladder">{EVOLUTION_TIERS.slice(1).map((t,i)=><li key={t.key} className={`evo-${t.key} ${level>i?'unlocked':''}`}><span aria-hidden="true">{level>i?'✦':'◇'}</span><b>{t.name}</b><small>{level>i?'Sbloccata':level===i?'Prossima evoluzione':'Da sbloccare'}</small></li>)}</ol>
    <p className="evo-window"><b>{windowCount}/5 presenze nella finestra</b> · {attempted>5?'Scorrono le ultime cinque gare del percorso':'La verifica avviene alla quinta presenza'}</p>
    <p className="evo-reference">La tua base: {baseline.sample} gare nel ruolo · {fmt(baseline.metricPerGame,2)} {missions[0].label}/gara · voto {fmt(baseline.rating,2)} · precisione {baseline.accuracy==null?'N/D':fmt(baseline.accuracy*100,1)+'%'}. La soglia sale rispetto alla tua base.</p>
    <div className="evo-missions">{missions.map(m=><div key={m.label} className={m.done?'done':''}><div><b>{m.label}</b><span>{fmt(m.value,m.digits||0)}{m.unit} / {fmt(m.target,m.digits||0)}{m.unit} {m.done?'✓':''}</span></div><progress max={m.target} value={Math.min(m.value??0,m.target)} aria-label={m.label}/>{m.detail&&<small className="evo-mission-detail">{m.detail}</small>}</div>)}</div>
    <p className="evo-foot">Contano solo le nuove gare da {ROLE_NAMES[plan.role]} dopo il {new Date(plan.start*1000).toLocaleString('it-IT',{timeZone:'Europe/Rome',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}. Se la prova fallisce, alla gara successiva si riprova sulle ultime cinque. Le evoluzioni sbloccate restano acquisite nello storico.</p>
    {!compact&&<details><summary>Come evolve la carta</summary><p>Ogni evoluzione richiede tre risultati nella stessa finestra di cinque nuove presenze nel ruolo. Impatto: almeno il 20% sopra il rendimento per gara più alto tra storico e ultime dieci presenze, riportato su cinque gare (minimo 3 gol/assist o 10 contrasti/parate). Voto: almeno +0,3 sopra la media migliore tra storico e ultime dieci, minimo 7,5. Precisione: +5 punti percentuali sui passaggi, oppure +8 sulle parate, con un volume minimo dell’80% del tuo volume recente su cinque gare (almeno 50 passaggi o 10 tiri affrontati).</p><p>Dopo ogni sblocco ricalcoliamo la base includendo solo le prestazioni raggiunte fino a quel momento. Il livello successivo richiede almeno +10% impatto, +0,1 voto e +2 punti di precisione rispetto alla sfida precedente. Voto e precisione hanno i massimi naturali di 10 e 100%. La finestra riparte: le cinque gare premiate non vengono riutilizzate per l’evoluzione successiva. Dati mancanti impediscono la verifica del relativo obiettivo.</p><p>Astrale sblocca un’aura ciano; Supernova un alone solare e particelle; Singolarità un’aura viola con anelli orbitali. Sono rarità del sito; l’overall EA resta quello reale. Progressi condivisi tra dispositivi e ricostruiti dallo storico archiviato.</p></details>}
    {evolution.earned.length>0&&<p className="evo-foot">Sbloccate: {evolution.earned.map(e=>`${e.name} (${new Date(e.timestamp*1000).toLocaleDateString('it-IT',{timeZone:'Europe/Rome'})})`).join(' · ')}</p>}
    {compact&&<a href={`#/pro/${encodeURIComponent(name)}`}>Apri carta e obiettivi ↗</a>}
  </section>;
}
