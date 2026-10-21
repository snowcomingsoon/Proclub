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
  const {plan,level,tier,next,missions}=evolution;
  return <section className={`evo-panel evo-${tier.key} ${compact?'evo-compact':''}`} aria-label={`Obiettivi di ${name}`}>
    <header><div><span className="evo-kicker">EVOLUZIONE PERSONALE · {ROLE_NAMES[plan.role]}</span><h2>{next?`Destinazione ${next.name}.`:'Singolarità raggiunta.'}</h2><p>{next?`Completa tutti e tre gli obiettivi di ${name} per trasformare la carta.`:'Hai completato tutti i traguardi di questa campagna.'}</p></div><span className="evo-insignia" aria-label={`Rarità evoluzione: ${tier.name}`}>✦<small>{tier.name}</small></span></header>
    <ol className="evo-ladder">{EVOLUTION_TIERS.slice(1).map((t,i)=><li key={t.key} className={`evo-${t.key} ${level>i?'unlocked':''}`}><span aria-hidden="true">{level>i?'✦':'◇'}</span><b>{t.name}</b><small>{level>i?'Sbloccata':level===i?'Prossima evoluzione':'Da sbloccare'}</small></li>)}</ol>
    <div className="evo-missions">{missions.map(m=><div key={m.label} className={m.done?'done':''}><div><b>{m.label}</b><span>{Math.min(m.value,m.target)} / {m.target} {m.done?'✓':''}</span></div><progress max={m.target} value={Math.min(m.value,m.target)} aria-label={m.label}/></div>)}</div>
    <p className="evo-foot">Contano solo le nuove gare da {ROLE_NAMES[plan.role]} dopo il {new Date(plan.start*1000).toLocaleString('it-IT',{timeZone:'Europe/Rome',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}. Nessuna scadenza: i progressi si accumulano alle sincronizzazioni EA.</p>
    {!compact&&<details><summary>Come evolve la carta</summary><p>Obiettivi fissati all’attivazione sulle ultime cinque presenze disponibili, usando i dati del ruolo più recente. Astrale richiede 3 presenze, {plan.target} {missions[1].label} e 2 gare con voto almeno {plan.vote.toFixed(1)}. Supernova richiede il doppio dei totali; Singolarità quattro volte. Le stesse gare contribuiscono ai traguardi cumulativi. Le gare in altri ruoli non avanzano questo percorso.</p><p>Astrale sblocca un’aura ciano; Supernova un alone solare e particelle; Singolarità un’aura viola con anelli orbitali. Sono rarità del sito, aggiunte alla carta: l’overall EA resta quello reale. Campagna condivisa tra dispositivi, ricostruita dallo storico archiviato; nessun completamento manuale.</p></details>}
    {compact&&<a href={`#/pro/${encodeURIComponent(name)}`}>Apri carta e obiettivi ↗</a>}
  </section>;
}
