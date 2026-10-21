import { EvolutionPanel } from './Evolution.jsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { constellationMatches, constellationRoster, constellationPairs, pairTitle, pairChemistry, replayMatches, ROLE_NAMES } from '../../../shared/constellation.mjs';
import { groupByNight } from '../lib/matches.js';
import './constellation.css';

const initials = name => name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase();
const f = (n, digits = 1) => n == null ? '—' : n.toLocaleString('it-IT', {maximumFractionDigits: digits, minimumFractionDigits: digits});
const date = t => new Date(t * 1000).toLocaleDateString('it-IT', {day: '2-digit', month: 'short', timeZone: 'Europe/Rome'});
const color = p => p.n < 5 ? '#8b9ba9' : p.chemistry >= 70 ? '#ffd084' : p.chemistry >= 50 ? '#cefc70' : '#8da7e7';
const energetic = p => p && p.n >= 5 && p.chemistry >= 65;
function Sparks() { return <span className="cx-sparks" aria-hidden="true">{Array.from({length:12},(_,i)=><i key={i} style={{'--sx':`${Math.cos(i*Math.PI/6)*(35+i%3*12)}px`,'--sy':`${Math.sin(i*Math.PI/6)*(35+i%3*12)}px`,'--sd':`${-i*.19}s`}}/>)}</span>; }
function RoleTags({ roles }) { return <div className="cx-roles">{Object.entries(roles).map(([role,n]) => <span key={role}>{ROLE_NAMES[role] || 'N/D'} · {n}</span>)}</div>; }
function PairPanel({ pair, focus, onFocus }) {
  if (!pair) return <aside className="cx-panel cx-empty"><span className="cx-kicker">NESSUN LEGAME NEL PERIODO</span><h2>Un’orbita da costruire.</h2><p>Non abbiamo presenze condivise per questo giocatore e questi filtri. Prova un altro periodo o reparto.</p></aside>;
  return <aside className={`cx-panel ${energetic(pair)?'cx-hot-panel':''}`} aria-label="Dettagli della coppia">
    <div className="cx-panel-top"><span className="cx-kicker">CONNESSIONE SELEZIONATA</span><span className="cx-dot" /></div>
    <div className="cx-emblem" aria-hidden="true"><span>{initials(focus.name)}</span><i>✦</i><span>{initials(pair.name)}</span>{energetic(pair)&&<Sparks/>}</div>
    <h2>{pairTitle(pair)}</h2><p className="cx-pair-names">{focus.name}<span> × </span>{pair.name}</p>
    <div className="cx-sample">{pair.n} gare insieme · {pair.reliability}</div>
    <div className="cx-score"><strong>{pair.chemistry}<small>/100</small></strong><div>intesa stimata<br/><b>{f(pair.winPct,0)}% vittorie · {pair.wins}V {pair.draws}P {pair.losses}S</b></div></div>
    <div className="cx-result-bar" aria-label={`${pair.wins} vittorie, ${pair.draws} pareggi, ${pair.losses} sconfitte`}><i style={{flex:pair.wins}}/><i style={{flex:pair.draws}}/><i style={{flex:pair.losses}}/></div>
    <div className="cx-stats"><div><strong>{f(pair.ppg,2)}</strong><span>Punti / gara</span></div><div><strong>{pair.goals}</strong><span>Gol dei due Pro</span></div><div><strong>{pair.assists}</strong><span>Assist dei due Pro</span></div></div>
    <div className="cx-player-stats">{[[focus.name,pair.a],[pair.name,pair.b]].map(([name,p]) => <div key={name}><b>{name}</b><strong>{f(p.rating,2)}<small> voto EA · {p.rated}/{pair.n} gare</small></strong><span>{p.goals} gol · {p.assists} assist</span><span>{p.passes}/{p.passAttempts} passaggi · {p.tackles}/{p.tackleAttempts} contrasti{p.roles.goalkeeper ? ` · ${p.saves} parate` : ''}</span><small className="cx-role-score">Contributo nel ruolo: {p.contribution==null?'N/D':`${f(p.contribution*100,0)}/100`} · {p.contributionGames}/{pair.n} gare</small><RoleTags roles={p.roles}/></div>)}</div>
    <div className="cx-form"><span className="cx-kicker">ULTIME GARE INSIEME</span><div>{pair.games.slice(-8).map(m=><span key={m.id} className={`cx-result cx-${m.result}`} title={`${date(m.timestamp)} · ${m.opponent} · ${m.gf}–${m.ga}`} aria-label={`${date(m.timestamp)}, ${m.opponent}, ${m.gf} a ${m.ga}`}><b>{m.result}</b><small>{m.gf}–{m.ga}</small></span>)}</div></div>
    <p className="cx-note">Il club ha segnato {pair.gf} gol e ne ha subiti {pair.ga} nelle gare condivise. Gol e assist sopra sono dei due Pro, non necessariamente azioni tra loro.</p>
    <button className="cx-explore" onClick={()=>onFocus(pair.id)}>Esplora l’orbita di {pair.name} <span>↗</span></button>
  </aside>;
}
export function Constellation({ data }) {
  const [center,setCenter] = useState({x:50,y:50});
  const drag = useRef(null);
  const [dragging,setDragging] = useState(false);
  const moveCenter = e => { if (!drag.current) return; const r=drag.current.rect; setCenter({x:Math.max(42,Math.min(58,drag.current.x+(e.clientX-drag.current.px)/r.width*100)),y:Math.max(42,Math.min(58,drag.current.y+(e.clientY-drag.current.py)/r.height*100))}); };
  const stopDrag = () => {drag.current=null;setDragging(false);};
  const matches = useMemo(()=>constellationMatches(data),[data]);
  const roster = useMemo(()=>constellationRoster(data,matches),[data,matches]);
  const [focusId,setFocusId] = useState(null), [partnerId,setPartnerId] = useState(null);
  const [period,setPeriod] = useState('all'), [role,setRole] = useState('all'), [paused,setPaused] = useState(false);
  const [replay,setReplay] = useState(false), [playing,setPlaying] = useState(false), [nightDay,setNightDay] = useState(''), [frame,setFrame] = useState(0);
  const [small,setSmall] = useState(()=>window.matchMedia('(max-width: 600px)').matches);
  useEffect(()=>{const q=window.matchMedia('(max-width: 600px)');const update=()=>setSmall(q.matches);q.addEventListener('change',update);return()=>q.removeEventListener('change',update);},[]);
  const focus = roster.find(p=>p.id===focusId) || roster[0];
  const nights = useMemo(()=>{
    const valid=new Set(matches.map(m=>m.id));
    return groupByNight([...(data.matches||[]),...(data.matchHistory||[])].filter(m=>valid.has(String(m.matchId))));
  },[data,matches]);
  const night=nights.find(n=>n.day===nightDay)||nights[0];
  const currentFrame=Math.min(frame,Math.max(0,(night?.games.length||0)-1));
  const currentMatch=matches.find(m=>m.id===String(night?.games[currentFrame]?.matchId));
  useEffect(()=>{
    if(!replay||!playing||paused) return;
    if(currentFrame>=(night?.games.length||0)-1){setPlaying(false);return;}
    const timer=setTimeout(()=>setFrame(f=>f+1),3500);
    return ()=>clearTimeout(timer);
  },[replay,playing,paused,currentFrame,night?.day,night?.games.length]);
  const scoped = useMemo(()=>{
    if(replay) return replayMatches(matches,currentMatch?.id);
    if(period==='15') return matches.slice(-15);
    if(period==='night') {
      const ids=new Set((nights[0]?.games || []).map(m=>String(m.matchId)));
      return matches.filter(m=>ids.has(m.id));
    }
    return matches;
  },[matches,period,nights,replay,currentMatch]);
  const pairs = useMemo(()=>constellationPairs(scoped,focus?.id,role).map(p=>({...p,chemistry:pairChemistry(p)})).sort((a,b)=>b.chemistry-a.chemistry||b.n-a.n),[scoped,focus,role]);
  const pair = pairs.find(p=>p.id===partnerId) || pairs[0];
  let visible = pairs.slice(0,small ? 6 : 12);
  if(pair && !visible.includes(pair)) visible=[...visible.slice(0,-1),pair];
  const focusGames = scoped.filter(m=>m.players.some(p=>p.id===focus?.id && (role==='all'||p.pos===role))).length;
  const setFocus=id=>{setFocusId(id);setPartnerId(null);};
  const satellites=visible.map((p,i)=>{
    const stable=visible.slice().sort((a,b)=>a.id.localeCompare(b.id));
    const angle=-Math.PI/2 + (2*Math.PI*stable.findIndex(v=>v.id===p.id))/visible.length;
    const radius=36-16*p.chemistry/100;
    return {...p,x:center.x+radius*Math.cos(angle),y:center.y+radius*Math.sin(angle)};
  });
  return <div className={`cx-page ${paused?'cx-paused':''} ${dragging?'cx-dragging':''} ${replay?'cx-replaying':''}`}>
    <header className="cx-heading"><div><span className="cx-kicker">BILLOCCHI LAB / 01</span><h1>COSTELLAZIONE<span>DEL CLUB<span className="cx-star">✦</span></span></h1><p>Nessuno brilla da solo. Scopri chi entra nella tua orbita.</p></div><a href="#rosa" className="cx-back">↙ Torna al club</a></header>
    <div className="cx-toolbar"><label>IL TUO CENTRO DI GRAVITÀ<select value={focus?.id || ''} onChange={e=>setFocus(e.target.value)}>{roster.map(p=><option key={p.id} value={p.id}>{p.name}{p.games?'':' · senza storico'}</option>)}</select></label><label>PERIODO<select disabled={replay} value={period} onChange={e=>setPeriod(e.target.value)}><option value="all">Tutto lo storico disponibile</option><option value="15">Ultime 15 gare del club</option><option value="night">Ultima serata</option></select></label><label>REPARTO DEL PROTAGONISTA<select value={role} onChange={e=>setRole(e.target.value)}><option value="all">Tutti i reparti</option>{Object.entries(ROLE_NAMES).map(([key,name])=><option key={key} value={key}>{name}</option>)}</select></label><button className="cx-motion" aria-pressed={paused} onClick={()=>setPaused(p=>!p)}>{paused?'▶ Animazioni':'Ⅱ Pausa'}</button></div>
    <section className="cx-replay" aria-label="Replay della serata">
      <div className="cx-replay-heading"><div><span className="cx-kicker">LA NOTTE IN CUI CI SIAMO ACCESI</span><h2>Rivivi la serata.</h2><p>{replay?'L’intesa usa lo storico disponibile fino alla gara mostrata.':'Guarda i legami evolvere, una partita alla volta.'}</p></div><button disabled={!nights.length} className="cx-explore" onClick={()=>{setReplay(r=>!r);setPlaying(false);setFrame(0);}}>{replay?'↙ Esci dal replay':'✦ Apri replay'}</button></div>
      {replay&&night&&<div className="cx-replay-controls">
        <label>SERATA<select value={night.day} onChange={e=>{setNightDay(e.target.value);setFrame(0);setPlaying(false);}}>{nights.map(n=><option key={n.day} value={n.day}>{new Date(n.day+'T12:00:00').toLocaleDateString('it-IT',{day:'numeric',month:'long'})} · {n.games.length} gare</option>)}</select></label>
        <div className="cx-playback"><button aria-label="Gara precedente" disabled={currentFrame===0} onClick={()=>{setFrame(currentFrame-1);setPlaying(false);}}>←</button><button disabled={night.games.length<2} onClick={()=>{if(currentFrame===night.games.length-1)setFrame(0);setPlaying(p=>!p);setPaused(false);}}>{playing?'Ⅱ Pausa replay':currentFrame===night.games.length-1?'↻ Rivedi':'▶ Riproduci'}</button><button aria-label="Gara successiva" disabled={currentFrame===night.games.length-1} onClick={()=>{setFrame(currentFrame+1);setPlaying(false);}}>→</button></div>
        <label className="cx-timeline">GARA {currentFrame+1} / {night.games.length}<input type="range" aria-label="Gara del replay" min="0" max={night.games.length-1} value={currentFrame} onChange={e=>{setFrame(Number(e.target.value));setPlaying(false);}}/></label>
        {currentMatch&&<div className={`cx-replay-match cx-match-${currentMatch.result}`} key={currentMatch.id} aria-live="polite"><span>{date(currentMatch.timestamp)} · {new Date(currentMatch.timestamp*1000).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Rome'})}</span><strong>BILLOCCHI <b>{currentMatch.gf}–{currentMatch.ga}</b> {currentMatch.opponent}</strong><small>{currentMatch.result==='V'?'VITTORIA':currentMatch.result==='P'?'PAREGGIO':'SCONFITTA'} · {currentFrame===night.games.length-1?'Fine serata':'Intesa aggiornata a questa gara'}</small></div>}
      </div>}
    </section>
    <div className="cx-workspace"><div className="cx-left"><section className="cx-universe" aria-label="Mappa delle presenze condivise">
      {replay&&currentMatch&&<div key={currentMatch.id} className={`cx-shockwave cx-shock-${currentMatch.result}`} aria-hidden="true"/>}
      <div className="cx-nebula" aria-hidden="true"/><div className="cx-dust" aria-hidden="true">{Array.from({length:45},(_,i)=><i key={i} style={{left:`${(i*37+13)%100}%`,top:`${(i*53+7)%100}%`,animationDelay:`-${i%7}s`,opacity:.2+(i%5)/8}}/>)}</div>
      <div className="cx-map-meta"><span>ORBITAL VIEW</span><span>{String(pairs.length).padStart(2,'0')} CONNESSIONI</span></div>
      <svg className="cx-web" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><ellipse cx={center.x} cy={center.y} rx="29" ry="28" className="cx-orbit"/><ellipse cx={center.x} cy={center.y} rx="19" ry="22" className="cx-orbit cx-inner"/>{satellites.map(p=><g key={p.id} style={{'--link':color(p)}} className={`cx-link ${pair?.id===p.id?'selected':''} ${energetic(p)?'cx-hot-link':''}`}><path d={`M${center.x} ${center.y} Q${center.x+(p.x-center.x)*.7} ${center.y+(p.y-center.y)*.2} ${p.x} ${p.y}`} className="cx-beam" style={{strokeWidth:.15+.65*p.chemistry/100}}/><path d={`M${center.x} ${center.y} Q${center.x+(p.x-center.x)*.7} ${center.y+(p.y-center.y)*.2} ${p.x} ${p.y}`} className="cx-stream" style={{animationDelay:`-${p.n%5}s`}}/></g>)}</svg>
      {focus && <div className="cx-core" style={{left:`${center.x}%`,top:`${center.y}%`}} role="button" tabIndex={0} aria-label="Centro di gravità: trascina o usa le frecce per spostare la costellazione" onPointerDown={e=>{if(e.button!==0)return; e.currentTarget.setPointerCapture(e.pointerId);drag.current={rect:e.currentTarget.closest('.cx-universe').getBoundingClientRect(),px:e.clientX,py:e.clientY,...center};setDragging(true);}} onPointerMove={moveCenter} onPointerUp={stopDrag} onPointerCancel={stopDrag} onLostPointerCapture={stopDrag} onKeyDown={e=>{const d={ArrowLeft:[-2,0],ArrowRight:[2,0],ArrowUp:[0,-2],ArrowDown:[0,2]}[e.key];if(d){e.preventDefault();setCenter(c=>({x:Math.max(42,Math.min(58,c.x+d[0])),y:Math.max(42,Math.min(58,c.y+d[1]))}));}}}><div className="cx-core-ring"/><div className="cx-core-icon"><small>CENTRO ORBITALE</small><b>{initials(focus.name)}</b><span>✦ ✦ ✦</span></div>{energetic(pair)&&<Sparks/>}<strong>{focus.name}</strong><small>{focusGames} presenze nel filtro</small></div>}
      {satellites.map((p,i)=><button key={p.id} className={`cx-node ${pair?.id===p.id?'selected':''} ${energetic(p)?'cx-hot-node':''}`} style={{left:`${p.x}%`,top:`${p.y}%`,'--node':color(p),'--delay':`${i*.055}s`}} aria-pressed={pair?.id===p.id} aria-label={`${p.name}, ${p.n} gare insieme. Mostra dettagli`} onClick={()=>setPartnerId(p.id)}><span className="cx-node-body"><small>PRO</small><b>{initials(p.name)}</b><i>{p.n}</i></span>{energetic(p)&&<Sparks/>}<strong>{p.name}</strong><small>{p.chemistry}/100 intesa</small></button>)}
      {!pairs.length && <p className="cx-map-empty">Nessuna connessione in questo filtro</p>}
      <div className="cx-map-bottom"><span><i/> Più vicini = intesa stimata più alta</span><span>{visible.length < pairs.length ? `${visible.length} orbite visibili · tutte le coppie sotto` : 'Trascina il centro · tocca un Pro'}</span></div>
    </section><div className="cx-legend"><span><i style={{background:'#ffd084'}}/> Intesa ≥70</span><span><i style={{background:'#cefc70'}}/> Intesa 50–69</span><span><i style={{background:'#8da7e7'}}/> Intesa &lt;50</span><span><i style={{background:'#8b9ba9'}}/> &lt;5 gare</span></div>
    <section className="cx-connections"><div className="cx-list-heading"><h2>Tutte le connessioni</h2><span>Ordinate per intesa stimata</span></div><div className="cx-pair-list">{pairs.map((p,i)=><button key={p.id} className={pair?.id===p.id?'selected':''} aria-pressed={pair?.id===p.id} onClick={()=>setPartnerId(p.id)}><span className="cx-list-rank">{String(i+1).padStart(2,'0')}</span><span className="cx-list-name">{p.name}<small>{p.n} gare · {p.reliability}</small></span><b>{p.chemistry}<small>intesa / 100</small></b><span aria-hidden="true">↗</span></button>)}</div></section>{focus&&<EvolutionPanel name={focus.name} compact/>}</div>
    <div aria-live="polite" aria-atomic="true"><PairPanel key={`${focus?.id}-${pair?.id}-${period}-${role}`} pair={pair} focus={focus} onFocus={setFocus}/></div></div>
    <footer className="cx-method"><div><span className="cx-kicker">I NUMERI DI QUESTA MAPPA</span><p>{scoped.length} gare dettagliate disponibili{scoped.length ? ` · ${date(scoped[0].timestamp)} — ${date(scoped.at(-1).timestamp)}` : ''}. Il filtro reparto riguarda {focus?.name || 'il protagonista'}; i reparti di entrambi sono indicati nella scheda.</p></div><details><summary>Come leggere i legami</summary><p>Ogni collegamento indica che i due Pro risultano presenti nello stesso tabellino EA, anche per una parte della gara. Intesa stimata (0–100): 50% voto medio EA dei due Pro (scala 5–9), 30% contributo nel ruolo effettivo di ogni gara, 20% punti del club per gara (scala 0–3). Il contributo è calcolato per ogni presenza e poi mediato per ciascun giocatore: ATT = 80% (gol + 0,7 × assist)/1,5 e 20% precisione passaggi; CEN = 50% precisione passaggi, 30% assist (massimo a 1), 20% contrasti riusciti/tentati; DIF = 50% contrasti riusciti/tentati, 25% precisione passaggi, 25% porta inviolata EA; POR = 75% parate/(parate + gol subiti), 25% porta inviolata EA. I due contributi medi hanno lo stesso peso. I componenti sono limitati tra 0 e 1; dati mancanti e rapporti senza tentativi sono esclusi e i pesi disponibili vengono rinormalizzati. Il risultato è moltiplicato per 0,5 + 0,5 × min(gare/20, 1), per attenuare campioni piccoli. Distanza, spessore e colore seguono questo indice; le scintille partono da 65 con almeno 5 gare. Le soglie e i pesi sono scelte del sito, non un modello validato: confronta anche i dati della scheda. Nel replay lo storico si ferma alla partita mostrata; nessuna gara successiva entra nel calcolo. Sotto 5 gare il colore resta neutro. I voti medi usano solo valori EA presenti e maggiori di zero.</p><p>I risultati descrivono ciò che è successo con la coppia presente: non dimostrano che sia stata la coppia a causarlo. Non sono disponibili passaggi diretti tra compagni, minuti di compresenza o intesa ufficiale EA. I soprannomi sono etichette del sito, non valutazioni EA; i totali si riferiscono soltanto allo storico dettagliato archiviato.</p></details></footer>
  </div>;
}
