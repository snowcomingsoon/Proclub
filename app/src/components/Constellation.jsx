import { useEffect, useMemo, useState } from 'react';
import { constellationMatches, constellationRoster, constellationPairs, pairTitle, ROLE_NAMES } from '../../../shared/constellation.mjs';
import { groupByNight } from '../lib/matches.js';
import './constellation.css';

const initials = name => name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase();
const f = (n, digits = 1) => n == null ? '—' : n.toLocaleString('it-IT', {maximumFractionDigits: digits, minimumFractionDigits: digits});
const date = t => new Date(t * 1000).toLocaleDateString('it-IT', {day: '2-digit', month: 'short', timeZone: 'Europe/Rome'});
const color = p => p.n < 5 ? '#8b9ba9' : p.winPct >= 60 ? '#cefc70' : p.winPct >= 40 ? '#76d9eb' : '#bba5fc';
function RoleTags({ roles }) { return <div className="cx-roles">{Object.entries(roles).map(([role,n]) => <span key={role}>{ROLE_NAMES[role] || 'N/D'} · {n}</span>)}</div>; }
function PairPanel({ pair, focus, onFocus }) {
  if (!pair) return <aside className="cx-panel cx-empty"><span className="cx-kicker">NESSUN LEGAME NEL PERIODO</span><h2>Un’orbita da costruire.</h2><p>Non abbiamo presenze condivise per questo giocatore e questi filtri. Prova un altro periodo o reparto.</p></aside>;
  return <aside className="cx-panel" aria-label="Dettagli della coppia">
    <div className="cx-panel-top"><span className="cx-kicker">CONNESSIONE SELEZIONATA</span><span className="cx-dot" /></div>
    <div className="cx-emblem" aria-hidden="true"><span>{initials(focus.name)}</span><i>✦</i><span>{initials(pair.name)}</span></div>
    <h2>{pairTitle(pair)}</h2><p className="cx-pair-names">{focus.name}<span> × </span>{pair.name}</p>
    <div className="cx-sample">{pair.n} gare insieme · {pair.reliability}</div>
    <div className="cx-score"><strong>{f(pair.winPct, 0)}<small>%</small></strong><div>vittorie del club<br/><b>{pair.wins}V · {pair.draws}P · {pair.losses}S</b></div></div>
    <div className="cx-result-bar" aria-label={`${pair.wins} vittorie, ${pair.draws} pareggi, ${pair.losses} sconfitte`}><i style={{flex:pair.wins}}/><i style={{flex:pair.draws}}/><i style={{flex:pair.losses}}/></div>
    <div className="cx-stats"><div><strong>{f(pair.ppg,2)}</strong><span>Punti / gara</span></div><div><strong>{pair.goals}</strong><span>Gol dei due Pro</span></div><div><strong>{pair.assists}</strong><span>Assist dei due Pro</span></div></div>
    <div className="cx-player-stats">{[[focus.name,pair.a],[pair.name,pair.b]].map(([name,p]) => <div key={name}><b>{name}</b><strong>{f(p.rating,2)}<small> voto EA · {p.rated}/{pair.n} gare</small></strong><span>{p.goals} gol · {p.assists} assist</span><RoleTags roles={p.roles}/></div>)}</div>
    <div className="cx-form"><span className="cx-kicker">ULTIME GARE INSIEME</span><div>{pair.games.slice(-8).map(m=><span key={m.id} className={`cx-result cx-${m.result}`} title={`${date(m.timestamp)} · ${m.opponent} · ${m.gf}–${m.ga}`} aria-label={`${date(m.timestamp)}, ${m.opponent}, ${m.gf} a ${m.ga}`}><b>{m.result}</b><small>{m.gf}–{m.ga}</small></span>)}</div></div>
    <p className="cx-note">Il club ha segnato {pair.gf} gol e ne ha subiti {pair.ga} nelle gare condivise. Gol e assist sopra sono dei due Pro, non necessariamente azioni tra loro.</p>
    <button className="cx-explore" onClick={()=>onFocus(pair.id)}>Esplora l’orbita di {pair.name} <span>↗</span></button>
  </aside>;
}
export function Constellation({ data }) {
  const matches = useMemo(()=>constellationMatches(data),[data]);
  const roster = useMemo(()=>constellationRoster(data,matches),[data,matches]);
  const [focusId,setFocusId] = useState(null), [partnerId,setPartnerId] = useState(null);
  const [period,setPeriod] = useState('all'), [role,setRole] = useState('all'), [paused,setPaused] = useState(false);
  const [small,setSmall] = useState(()=>window.matchMedia('(max-width: 600px)').matches);
  useEffect(()=>{const q=window.matchMedia('(max-width: 600px)');const update=()=>setSmall(q.matches);q.addEventListener('change',update);return()=>q.removeEventListener('change',update);},[]);
  const focus = roster.find(p=>p.id===focusId) || roster[0];
  const scoped = useMemo(()=>{
    if(period==='15') return matches.slice(-15);
    if(period==='night') {
      const nights=groupByNight((data.matchHistory || data.matches || []));
      const ids=new Set((nights[0]?.games || []).map(m=>String(m.matchId)));
      return matches.filter(m=>ids.has(m.id));
    }
    return matches;
  },[matches,period,data]);
  const pairs = useMemo(()=>constellationPairs(scoped,focus?.id,role),[scoped,focus,role]);
  const pair = pairs.find(p=>p.id===partnerId) || pairs[0];
  let visible = pairs.slice(0,small ? 6 : 12);
  if(pair && !visible.includes(pair)) visible=[...visible.slice(0,-1),pair];
  const focusGames = scoped.filter(m=>m.players.some(p=>p.id===focus?.id && (role==='all'||p.pos===role))).length;
  const setFocus=id=>{setFocusId(id);setPartnerId(null);};
  const satellites=visible.map((p,i)=>{
    const angle=-Math.PI/2 + (2*Math.PI*i)/visible.length;
    return {...p,x:50+35*Math.cos(angle),y:50+34*Math.sin(angle)};
  });
  return <div className={`cx-page ${paused?'cx-paused':''}`}>
    <header className="cx-heading"><div><span className="cx-kicker">BILLOCCHI LAB / 01</span><h1>COSTELLAZIONE<span>DEL CLUB<span className="cx-star">✦</span></span></h1><p>Nessuno brilla da solo. Scopri chi entra nella tua orbita.</p></div><a href="#rosa" className="cx-back">↙ Torna al club</a></header>
    <div className="cx-toolbar"><label>IL TUO CENTRO DI GRAVITÀ<select value={focus?.id || ''} onChange={e=>setFocus(e.target.value)}>{roster.map(p=><option key={p.id} value={p.id}>{p.name}{p.games?'':' · senza storico'}</option>)}</select></label><label>PERIODO<select value={period} onChange={e=>setPeriod(e.target.value)}><option value="all">Tutto lo storico disponibile</option><option value="15">Ultime 15 gare del club</option><option value="night">Ultima serata</option></select></label><label>REPARTO DEL PROTAGONISTA<select value={role} onChange={e=>setRole(e.target.value)}><option value="all">Tutti i reparti</option>{Object.entries(ROLE_NAMES).map(([key,name])=><option key={key} value={key}>{name}</option>)}</select></label><button className="cx-motion" aria-pressed={paused} onClick={()=>setPaused(p=>!p)}>{paused?'▶ Animazioni':'Ⅱ Pausa'}</button></div>
    <div className="cx-workspace"><div className="cx-left"><section className="cx-universe" aria-label="Mappa delle presenze condivise">
      <div className="cx-nebula" aria-hidden="true"/><div className="cx-dust" aria-hidden="true">{Array.from({length:45},(_,i)=><i key={i} style={{left:`${(i*37+13)%100}%`,top:`${(i*53+7)%100}%`,animationDelay:`-${i%7}s`,opacity:.2+(i%5)/8}}/>)}</div>
      <div className="cx-map-meta"><span>ORBITAL VIEW</span><span>{String(pairs.length).padStart(2,'0')} CONNESSIONI</span></div>
      <svg className="cx-web" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><ellipse cx="50" cy="50" rx="35" ry="34" className="cx-orbit"/><ellipse cx="50" cy="50" rx="23" ry="22" className="cx-orbit cx-inner"/>{satellites.map(p=><g key={p.id} style={{'--link':color(p)}} className={pair?.id===p.id?'cx-link selected':'cx-link'}><path d={`M50 50 Q${50+(p.x-50)*.7} ${50+(p.y-50)*.2} ${p.x} ${p.y}`} className="cx-beam" style={{strokeWidth:.15+.5*p.n/(pairs[0]?.n||1)}}/><path d={`M50 50 Q${50+(p.x-50)*.7} ${50+(p.y-50)*.2} ${p.x} ${p.y}`} className="cx-stream" style={{animationDelay:`-${p.n%5}s`}}/></g>)}</svg>
      {focus && <div className="cx-core"><div className="cx-core-ring"/><div className="cx-core-icon">{initials(focus.name)}</div><strong>{focus.name}</strong><small>{focusGames} presenze nel filtro</small></div>}
      {satellites.map((p,i)=><button key={p.id} className={`cx-node ${pair?.id===p.id?'selected':''}`} style={{left:`${p.x}%`,top:`${p.y}%`,'--node':color(p),'--delay':`${i*.055}s`}} aria-pressed={pair?.id===p.id} aria-label={`${p.name}, ${p.n} gare insieme. Mostra dettagli`} onClick={()=>setPartnerId(p.id)}><span className="cx-node-body">{initials(p.name)}<i>{p.n}</i></span><strong>{p.name}</strong><small>{f(p.winPct,0)}% vittorie</small></button>)}
      {!pairs.length && <p className="cx-map-empty">Nessuna connessione in questo filtro</p>}
      <div className="cx-map-bottom"><span><i/> Più gare insieme, legame più spesso</span><span>{visible.length < pairs.length ? `${visible.length} orbite visibili · tutte le coppie sotto` : 'Tocca un Pro per aprire il legame'}</span></div>
    </section><div className="cx-legend"><span><i style={{background:'#cefc70'}}/> ≥60% vittorie</span><span><i style={{background:'#76d9eb'}}/> 40–59%</span><span><i style={{background:'#bba5fc'}}/> &lt;40%</span><span><i style={{background:'#8b9ba9'}}/> &lt;5 gare</span></div>
    <section className="cx-connections"><div className="cx-list-heading"><h2>Tutte le connessioni</h2><span>Ordinate per gare insieme</span></div><div className="cx-pair-list">{pairs.map((p,i)=><button key={p.id} className={pair?.id===p.id?'selected':''} aria-pressed={pair?.id===p.id} onClick={()=>setPartnerId(p.id)}><span className="cx-list-rank">{String(i+1).padStart(2,'0')}</span><span className="cx-list-name">{p.name}<small>{p.n} gare · {p.reliability}</small></span><b>{f(p.winPct,0)}%<small>vittorie</small></b><span aria-hidden="true">↗</span></button>)}</div></section></div>
    <div aria-live="polite" aria-atomic="true"><PairPanel key={`${focus?.id}-${pair?.id}-${period}-${role}`} pair={pair} focus={focus} onFocus={setFocus}/></div></div>
    <footer className="cx-method"><div><span className="cx-kicker">I NUMERI DI QUESTA MAPPA</span><p>{scoped.length} gare dettagliate disponibili{scoped.length ? ` · ${date(scoped[0].timestamp)} — ${date(scoped.at(-1).timestamp)}` : ''}. Il filtro reparto riguarda {focus?.name || 'il protagonista'}; i reparti di entrambi sono indicati nella scheda.</p></div><details><summary>Come leggere i legami</summary><p>Ogni collegamento indica che i due Pro risultano presenti nello stesso tabellino EA, anche per una parte della gara. Spessore = partite condivise; colore = percentuale di vittorie del club in quelle gare. Sotto 5 gare il colore resta neutro. I voti medi usano solo valori EA presenti e maggiori di zero.</p><p>I risultati descrivono ciò che è successo con la coppia presente: non dimostrano che sia stata la coppia a causarlo. Non sono disponibili passaggi diretti tra compagni, minuti di compresenza o intesa ufficiale EA. I soprannomi sono etichette del sito, non valutazioni EA; i totali si riferiscono soltanto allo storico dettagliato archiviato.</p></details></footer>
  </div>;
}
