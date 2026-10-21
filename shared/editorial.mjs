/* ---------------------------------------------------------------------------
 * Testi editoriali critici (copertina, svolte, romanzo, annotazioni, panoramica,
 * match studio). Solo dati EA reali; giudizio dal motore di commentary.mjs:
 *  - tono critico, giudizio dal motore (commentary.mjs), parametri di ruolo da ROLE_INFO;
 *  - i testi non spiegano mai il criterio: giudicano con i dati.
 * Niente xG, passaggi chiave o altri dati che EA non fornisce.
 * ------------------------------------------------------------------------- */
import {ROLE_INFO, roleFor, CLUB_ID, MIN_ONOFF, OFF_METRIC_ROLES, posLabel, metricsForRole} from './metrics.mjs';
import {commentFor, GA_MIN} from './commentary.mjs';

const fin = v => v != null && Number.isFinite(v);
const f1 = v => (fin(v) ? v.toFixed(1) : '—');
const f2 = v => (fin(v) ? v.toFixed(2) : '—');
const r0 = v => (fin(v) ? Math.round(v) : '—');
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const hash = s => [...String(s || '')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const choose = (seed, list) => list[seed % list.length];
const sign = v => (v >= 0 ? '+' : '');
const lc = s => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const sentence = s => { const t = String(s || '').trim(); return !t ? '' : /[.!?]$/.test(t) ? t : t + '.'; };
const join = (...parts) => parts.map(p => (p ? String(p).trim() : '')).filter(Boolean).join(' ');
const ilp = p => (/^(8|11|18)/.test(String(r0(p))) ? `l'${r0(p)}%` : `il ${r0(p)}%`);
const alp = p => (/^(8|11|18)/.test(String(r0(p))) ? `all'${r0(p)}%` : `al ${r0(p)}%`);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Mappa nome minuscolo -> metriche, da `buildAll`. */
export function metricsIndex(all) {
  return new Map(all.map(m => [String(m.name).toLowerCase(), m]));
}
const metricOf = (idx, name) => (idx && name ? idx.get(String(name).toLowerCase()) : undefined);

/** Dati di una presenza EA grezza nella stessa forma dei totali di serata. */
export function normalizeRaw(p) {
  const passes = num(p.passesmade), passAttempts = num(p.passattempts);
  return {
    name: p.playername, games: 1, rating: num(p.rating) > 0 ? num(p.rating) : null, ratedGames: num(p.rating) > 0 ? 1 : 0,
    goals: num(p.goals), assists: num(p.assists), shots: num(p.shots), passes, passAttempts,
    tackles: num(p.tacklesmade), tackleAttempts: num(p.tackleattempts), saves: num(p.saves), reds: num(p.redcards),
    mvp: num(p.mom), roles: [p.pos], roleCounts: {[p.pos]: 1}, passPct: passAttempts ? Math.round(passes / passAttempts * 100) : null,
  };
}

/** Ruolo prevalente giocato nella serata (da `roleCounts`, altrimenti dai reparti elencati). */
function nightPos(p, m) {
  const rc = p.roleCounts && Object.keys(p.roleCounts).length ? p.roleCounts : null;
  if (rc) {
    const top = Math.max(...Object.values(rc));
    const tied = Object.keys(rc).filter(k => rc[k] === top);
    return tied.includes(m && m.playedPos) ? m.playedPos : tied[0];
  }
  return p.roles && p.roles.length ? p.roles[0] : (m && m.playedPos) || null;
}

function nightRole(p, m) {
  const pos = nightPos(p, m);
  const role = pos ? roleFor(pos, m ? m.proPos : null) : (m && m.role) || 'CC';
  return {role, pos, ...ROLE_INFO[role], label: pos ? posLabel(pos, m ? m.proPos : null) : ROLE_INFO[role].label};
}

/** Ruolo/i della serata rispetto a quello abituale: {pos, label, changed, multiple, habitualLabel, mix}. */
function nightRoleInfo(p, m) {
  const R = nightRole(p, m);
  const rc = p.roleCounts && Object.keys(p.roleCounts).length ? p.roleCounts : Object.fromEntries((p.roles || []).map(x => [x, 1]));
  const mix = Object.entries(rc).sort((a, b) => b[1] - a[1]).map(([pos, n]) => ({pos, n, label: posLabel(pos, m ? m.proPos : null)}));
  const habitual = m && m.seasonPos ? m.seasonPos : null;
  const multiple = mix.length > 1;
  return {...R, mix, multiple, habitual, habitualLabel: habitual ? posLabel(habitual, m ? m.proPos : null) : null, changed: !!habitual && (multiple || R.pos !== habitual)};
}
const listIt = a => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} e ${a[a.length - 1]}`);
/** Frase sul ruolo giocato in serata, solo se diverso da quello abituale. */
function nightRoleNote(ri) {
  if (!ri || !ri.changed) return '';
  if (ri.multiple) return `In serata ha cambiato ruolo: ${listIt(ri.mix.map(x => `${x.n} ${x.n === 1 ? 'gara' : 'gare'} da ${x.label}`))}${ri.habitualLabel ? ` (ruolo abituale: ${ri.habitualLabel})` : ''}.`;
  return `In serata ha giocato da ${ri.label}${ri.habitualLabel ? `, non nel suo ruolo abituale da ${ri.habitualLabel}` : ''}.`;
}

/** Passaggi imprecisi per il ruolo (almeno 10 tentativi), altrimenti null. */
function passFlag(p, m) {
  if (!p.passAttempts || p.passAttempts < 10 || p.passPct == null) return null;
  const R = nightRole(p, m);
  if (p.passPct >= R.passMin) return null;
  return {pct: p.passPct, min: R.passMin, label: R.label, failed: p.passAttempts - p.passes};
}

function nightLimits(p, m) {
  const L = [];
  if (p.reds) L.push(`${p.reds} ${p.reds === 1 ? 'rosso' : 'rossi'}`);
  const pf = passFlag(p, m);
  if (pf) L.push(`${pf.pct}% di passaggi (${pf.failed} sbagliati su ${p.passAttempts})`);
  if (p.shots >= 3 && p.goals / p.shots < 0.3 && OFF_METRIC_ROLES.has(nightRole(p, m).role) && nightRole(p, m).role !== 'CC') L.push(`${p.goals} gol su ${p.shots} tiri`);
  if (p.tackleAttempts >= 4 && p.tackles / p.tackleAttempts < 0.5) L.push(`${plural(p.tackles, 'contrasto riuscito', 'contrasti riusciti')} su ${p.tackleAttempts}`);
  return L;
}

/** Limite tecnico di un Pro: prima i dati della serata, poi il difetto principale della stagione. */
function limitSentence(p, m) {
  const L = nightLimits(p, m);
  if (L.length) return `Limiti della serata: ${L.slice(0, 2).join('; ')}.`;
  if (!m || m.games < 3 || !m.rating) return '';
  const c = commentFor(metricsForRole(m, nightRole(p, m).pos));
  if (m.rating > 8) return sentence(c.charge);
  return c.negatives[0] ? sentence(c.negatives[0].text) : '';
}

const tierOf = r => (r > 8 ? 'elite' : r >= 7.5 ? 'buono' : r >= 7 ? 'medio' : r >= 6.5 ? 'rimandato' : 'bocciato');

/* ============================== COPERTINA =============================== */

function teamPasses(players) {
  const passes = players.reduce((s, p) => s + p.passes, 0), att = players.reduce((s, p) => s + p.passAttempts, 0);
  return {passes, att, pct: att ? Math.round(passes / att * 100) : null, failed: att - passes};
}

/** In cosa e` stato piu` bravo il protagonista della serata. */
function craftOf(p) {
  if (p.saves >= 3) return 'save';
  if (p.assists >= 3 && p.assists > p.goals) return 'assist';
  if (p.goals >= 2 || (p.goals > 0 && p.goals >= p.assists)) return 'goal';
  if (p.assists > 0) return 'assist';
  return 'overall';
}

const COVER_TITLES = {
  goal: {
    warm: n => [`${n}: il gol è il suo mestiere.`, `${n} fa la differenza dove si decide, in area.`, `${n} firma la serata con i gol.`, `${n} e la porta, un rapporto che non tradisce.`],
    sober: n => [`${n} segna, il resto della serata è un’altra storia.`, `${n} tiene a galla la serata con i gol.`, `Il gol ha la firma di ${n}, quasi nient’altro.`, `${n} timbra il cartellino davanti, poi la serata si ferma.`],
  },
  goalAway: {
    warm: n => [`${n} segna da dove non te lo aspetti.`, `${n} firma la serata partendo da dietro.`, `${n} trova la porta fuori dal copione.`],
    sober: n => [`${n} segna, ma il suo compito era un altro.`, `Il gol è di ${n}, il resto della serata non fa notizia.`, `${n} timbra la rete, non la serata.`],
  },
  assist: {
    warm: n => [`${n} è l’ultimo passaggio della serata.`, `${n} serve i compagni e la partita gira.`, `${n} apparecchia, la squadra incassa.`, `${n} rifinisce, e si vede.`],
    sober: n => [`${n} mette i compagni davanti alla porta, poco altro.`, `Gli assist sono di ${n}: il resto è ordinaria amministrazione.`, `${n} rifinisce, ma la serata chiede di più.`, `${n} serve bene, non basta a fare la serata.`],
  },
  save: {
    warm: n => [`${n} tiene in piedi la porta.`, `${n}, le mani giuste nel momento giusto.`, `${n} para e il risultato resta in piedi.`, `${n} è il muro della serata.`],
    sober: n => [`${n} para, ma la porta resta sotto pressione.`, `${n} salva quel che può davanti a una difesa distratta.`, `${n} lavora tanto, segno che dietro si soffre.`, `${n} tra i pali fa il suo, la squadra meno.`],
  },
  overall: {
    warm: n => [`${n} guida la serata.`, `${n} prende per mano la squadra.`, `${n} è il più continuo della notte.`, `${n} comanda la partita, a modo suo.`],
    sober: n => [`${n} emerge in una serata senza padroni.`, `${n} si salva dove gli altri si perdono.`, `${n} fa meglio degli altri, senza far rumore.`, `${n} è il meno peggio di una serata incolore.`],
  },
};

function coverDeck(p, craft, rec, seasonRating, seed, ri) {
  const n = rec.games, res = `${rec.wins}V ${rec.draws}P ${rec.losses}S`;
  const nums = craft === 'assist' ? plural(p.assists, 'assist', 'assist') : craft === 'save' ? plural(p.saves, 'parata', 'parate') : craft === 'goal' ? `${plural(p.goals, 'gol', 'gol')}${p.assists ? ` e ${plural(p.assists, 'assist', 'assist')}` : ''}` : `${p.goals} gol e ${p.assists} assist`;
  const hook = {
    goalAway: choose(seed, [`${p.name} trova la porta partendo da ${ri ? ri.label : 'dietro'}: ${nums}`, `Non è il suo reparto, ma ${p.name} firma ${nums}`]),
    goal: choose(seed, [`${p.name} è l’uomo che la porta la trova: ${nums} in ${plural(n, 'gara', 'gare')}`, `Davanti ha l’istinto che manca a molti: ${nums} firmati da ${p.name}`, `${p.name} cerca la porta e spesso la trova: ${nums}`]),
    assist: choose(seed, [`${p.name} ha la visione per mandare gli altri in porta: ${nums}`, `Il lavoro di rifinitura è di ${p.name}: ${nums}`, `${p.name} pensa il gioco prima degli altri: ${nums}`]),
    save: choose(seed, [`${p.name} chiude la porta quando serve: ${nums}`, `Tra i pali ${p.name} fa il suo mestiere: ${nums}`, `${p.name} risponde presente nei momenti caldi: ${nums}`]),
    overall: choose(seed, [`${p.name} è il più convincente di una serata che lo ha messo davanti agli altri`, `${p.name} chiude con il voto più alto del gruppo, in una notte senza fuoriclasse`, `${p.name} è il nome da segnare, per una volta, in una serata senza copione`]),
  }[craft];
  const tone = !seasonRating ? '' : seasonRating > 8 ? choose(seed, ['Non è un caso: lo fa da tutta la stagione.', 'La continuità, in lui, c’è.']) : seasonRating < 6.5 ? choose(seed, ['Una serata, però, non cambia il giudizio sulla sua stagione.', 'Resta da vedere se sa ripeterlo: finora la stagione dice altro.']) : choose(seed, ['Ma una serata non fa una stagione.', 'Il resto del suo rendimento è più ordinario di questa notte.', 'Da confermare: la stagione non racconta lo stesso giocatore.']);
  return join(`${hook}.`, nightRoleNote(ri), tone, `Serata chiusa sul ${res}.`);
}

function coverClosing(rec, tp, seed) {
  const n = rec.games, concedes = rec.against >= n * 1.5;
  if (rec.wins > rec.losses) {
    if (concedes) return choose(seed, ['Si vince, ma la difesa continua a concedere troppo.', 'Il risultato c’è, la tenuta no: dietro si balla.', 'Tre punti che nascondono una difesa ancora fragile.']);
    if (tp.att >= 30 && tp.pct != null && tp.pct < 80) return choose(seed, ['Si vince, ma si regalano troppi palloni.', 'Il risultato c’è, la pulizia nel palleggio no.']);
    return choose(seed, ['Un bilancio in ordine: ora serve ripeterlo.', 'Serata a posto sul campo, da confermare alla prossima.']);
  }
  if (rec.losses > rec.wins) return choose(seed, ['Serata negativa: il bilancio non lascia alibi.', 'Il bilancio punisce e non c’è molto da discutere.', 'Si perde più di quanto si vince: lavoro da fare.']);
  return choose(seed, ['Un equilibrio che non soddisfa nessuno.', 'Né vincitori né vinti, ma poche idee chiare.']);
}

export function awardLabel(rating, multiple) {
  return multiple ? 'I MIGLIORI DELLE GARE REGISTRATE' : 'IL MIGLIORE DELLE GARE REGISTRATE';
}

/**
 * Copertina narrativa: protagonista per cio' che sa fare meglio, pochi numeri forti.
 * `record` = {wins, draws, losses, goals, against, games}; `players` = totali di serata;
 * `metricsByName` = metricsIndex(buildAll).
 */
export function coverEditorial({day = '', record, winners = [], players = [], metricsByName}) {
  const n = record.games, seed = hash(day + (winners[0] ? winners[0].name : ''));
  const tp = teamPasses(players);
  const leader = winners[0] || [...players].filter(p => p.rating != null).sort((a, b) => b.rating - a.rating)[0];
  const lm = leader ? metricOf(metricsByName, leader.name) : undefined;
  const sr = lm && lm.games >= 3 ? lm.rating : null;
  const warm = !!(sr && sr > 8 && leader.rating >= 8);
  const ri = leader ? nightRoleInfo(leader, lm) : null;
  let craft = leader ? craftOf(leader) : 'overall';
  if (craft === 'goal' && ri && !OFF_METRIC_ROLES.has(ri.role)) craft = 'goalAway';
  let title, deck;
  if (winners.length > 1) {
    const names = winners.map(w => w.name).join(' e ');
    title = choose(seed, ['La serata ha più firme.', 'Nessun nome basta da solo.', 'Il titolo si divide.']);
    deck = join(`${names} chiudono alla pari: nessuno fa il vuoto.`, `Serata chiusa sul ${record.wins}V ${record.draws}P ${record.losses}S.`);
  } else if (leader) {
    title = choose(seed, COVER_TITLES[craft][warm ? 'warm' : 'sober'](leader.name));
    deck = coverDeck(leader, craft, record, sr, seed, ri);
  } else {
    title = 'La serata non ha un protagonista.';
    deck = `${plural(n, 'gara registrata', 'gare registrate')}, ${record.goals} gol fatti.`;
  }
  const diff = record.goals - record.against;
  const balance = join(
    `${plural(record.wins, 'vittoria', 'vittorie')}, ${plural(record.draws, 'pareggio', 'pareggi')} e ${plural(record.losses, 'sconfitta', 'sconfitte')}; ${record.goals} reti segnate e ${record.against} subite, saldo ${sign(diff)}${diff}.`,
    diff > 0 && record.against / Math.max(1, n) >= 1.5 ? 'Il saldo copre un difetto: dietro si subisce troppo.' : diff < 0 ? 'Attacco e tenuta vanno riviste insieme.' : '');
  return {
    name: winners.length ? winners.map(w => w.name).join(' + ') : leader ? leader.name : 'BILLOCCHI CLUB',
    title, deck, closing: coverClosing(record, tp, seed), balance, note: '',
    awardLabel: awardLabel(leader ? leader.rating : null, winners.length > 1),
  };
}

/* ======================= ANNOTAZIONI A MARGINE ========================== */

export function notebookEditorial({players, metricsByName, record}) {
  const rated = players.filter(p => p.rating != null);
  if (!players.length) return 'Nessun Pro in campo in questa edizione.';
  const out = [];
  if (rated.length >= 2) {
    const sorted = [...rated].sort((a, b) => b.rating - a.rating);
    const top = sorted[0], low = sorted[sorted.length - 1];
    out.push(`Media EA più alta ${top.name} (${f2(top.rating)}), più bassa ${low.name} (${f2(low.rating)}): ${f2(top.rating - low.rating)} punti di distanza dentro la stessa squadra.`);
    if (low.rating < 6.5) out.push(`${low.name} chiude ultimo: serata da bocciatura.`);
  }
  const flagged = players.map(p => ({p, f: passFlag(p, metricOf(metricsByName, p.name))})).filter(x => x.f);
  if (flagged.length) out.push(`Passaggi da rivedere: ${flagged.map(x => `${x.p.name} ${x.f.pct}%`).join(', ')}.`);
  else out.push('Sui passaggi nessuno ha sbagliato in modo vistoso.');
  const shooter = players.filter(p => p.shots >= 3 && OFF_METRIC_ROLES.has(nightRole(p, metricOf(metricsByName, p.name)).role)).sort((a, b) => b.shots - a.shots)[0];
  if (shooter) out.push(`${shooter.name}: ${shooter.goals} gol su ${shooter.shots} tiri${shooter.goals / shooter.shots < 0.3 ? ', conversione da migliorare' : ''}.`);
  const reds = players.filter(p => p.reds);
  if (reds.length) out.push(`Cartellini rossi: ${reds.map(p => `${p.name} (${p.reds})`).join(', ')}.`);
  if (record && record.against / Math.max(1, record.games) >= 1.5) out.push(`${record.against} gol subiti in ${plural(record.games, 'gara', 'gare')}: il lavoro è dietro.`);
  return out.slice(0, 4).join(' ');
}

/* ============================ SVOLTE DELLA NOTTE ======================== */

function gameFacts(match, clubId, idx) {
  const own = (match.clubs || {})[clubId] || {};
  const oppEntry = Object.entries(match.clubs || {}).find(([id]) => id !== String(clubId));
  const gf = num(own.goals), ga = num(own.goalsAgainst);
  const players = Object.values((match.players || {})[clubId] || {}).filter(Boolean).map(normalizeRaw);
  const tp = teamPasses(players);
  const rated = players.filter(p => p.rating != null).sort((a, b) => b.rating - a.rating);
  return {match, gf, ga, opp: (oppEntry && oppEntry[1] && oppEntry[1].details && oppEntry[1].details.name) || 'Avversario', players, tp, best: rated[0], worst: rated.length > 1 ? rated[rated.length - 1] : null, idx};
}
const passText = f => (f.tp.att >= 20 ? `Passaggi dei Pro ${alp(f.tp.pct)} (${f.tp.failed} sbagliati su ${f.tp.att}).` : '');
function bestText(f) {
  const b = f.best;
  if (!b) return '';
  const m = metricOf(f.idx, b.name);
  if (b.rating < 8) return `Miglior voto ${b.name} (${f2(b.rating)}) in una gara senza protagonisti.`;
  return m && m.rating && m.rating <= 8
    ? `Miglior voto ${b.name} (${f2(b.rating)}), ma la sua media stagionale è ${f2(m.rating)}: una gara, non un livello.`
    : join(`Miglior voto ${b.name} (${f2(b.rating)}), e la stagione lo conferma.`, limitSentence(b, m));
}
const worstText = f => (f.worst && f.worst.rating < 6.5 ? `Voto più basso ${f.worst.name} (${f2(f.worst.rating)}), bocciato.` : f.worst ? `Voto più basso ${f.worst.name} (${f2(f.worst.rating)}).` : '');

const defaultTime = match => new Date(match.timestamp * 1e3).toLocaleTimeString('it-IT', {timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit'});

/**
 * Fino a tre svolte. `fmtTime(match)` formatta l'ora; `games` = partite grezze EA della serata.
 * Restituisce {tag, title, text, games}.
 */
export function turningPointsEditorial(games, {clubId = CLUB_ID, metricsByName, fmtTime = defaultTime} = {}) {
  const sorted = [...games].sort((a, b) => a.timestamp - b.timestamp);
  const facts = sorted.map(g => gameFacts(g, clubId, metricsByName));
  const res = f => (f.gf > f.ga ? 'V' : f.gf < f.ga ? 'S' : 'P');
  const score = f => `${f.gf}–${f.ga}`;
  const points = [];
  const win = facts.filter(f => res(f) === 'V').sort((a, b) => (b.gf - b.ga) - (a.gf - a.ga))[0];
  if (win) {
    points.push({
      tag: 'LA VITTORIA PIÙ LARGA',
      title: win.ga ? `${score(win)}: larga, non pulita.` : `${score(win)}: larga e a porta inviolata.`,
      text: join(`Contro ${win.opp}, alle ${fmtTime(win.match)}: margine di ${plural(win.gf - win.ga, 'gol', 'gol')}, il più ampio della serata.`,
        win.ga ? `Si incassano comunque ${plural(win.ga, 'gol', 'gol')}.` : 'Nessun gol subito.', passText(win), bestText(win)),
      games: [win.match],
    });
  }
  const ri = facts.findIndex((f, i) => i > 0 && res(f) === 'V' && res(facts[i - 1]) === 'S');
  if (ri > 0) {
    const a = facts[ri - 1], b = facts[ri];
    points.push({
      tag: 'LA RISPOSTA',
      title: `Dal ${score(a)} al ${score(b)}.`,
      text: join(`Dopo il ${score(a)} contro ${a.opp} (${a.ga} gol subiti${a.tp.att >= 20 ? `, passaggi ${alp(a.tp.pct)}` : ''}) arriva il ${score(b)} contro ${b.opp}.`,
        b.ga >= a.ga ? `La fase difensiva non migliora: ${b.ga} gol incassati anche nella gara di reazione.` : b.ga ? `Si incassa ancora ${plural(b.ga, 'gol', 'gol')}, meno della gara precedente.` : 'Stavolta porta inviolata.',
        b.tp.att >= 20 ? `Passaggi ${alp(b.tp.pct)}.` : '', 'Una vittoria non cancella gli errori della gara precedente: vanno verificati.'),
      games: [a.match, b.match],
    });
  }
  let cur = [], best = [];
  for (const f of facts) { if (res(f) === 'S') cur = []; else { cur.push(f); if (cur.length > best.length) best = [...cur]; } }
  if (best.length >= 3) {
    const ga = best.reduce((s, f) => s + f.ga, 0), v = best.filter(f => res(f) === 'V').length, d = best.length - v;
    const cs = best.filter(f => f.ga === 0).length, leaky = best.filter(f => f.ga >= 2).length;
    const tp = teamPasses(best.flatMap(f => f.players));
    points.push({
      tag: 'LA SERIE POSITIVA',
      title: `${best.length} gare senza ko, ${ga} gol subiti.`,
      text: join(`${plural(v, 'vittoria', 'vittorie')} e ${plural(d, 'pareggio', 'pareggi')} consecutivi: ${ga} gol incassati in ${best.length} gare (${f2(ga / best.length)} a gara), ${cs} a porta inviolata.`,
        leaky ? `In ${plural(leaky, 'gara', 'gare')} i gol subiti sono almeno 2: la serie c’è, la solidità meno.` : 'Mai più di un gol subito per gara: la serie regge anche dietro.',
        tp.att >= 20 ? `Passaggi dei Pro ${alp(tp.pct)} nel periodo.` : ''),
      games: best.map(f => f.match),
    });
  }
  const close = facts.filter(f => Math.abs(f.gf - f.ga) <= 1).sort((a, b) => (b.gf + b.ga) - (a.gf + a.ga))[0];
  if (close) {
    const r = res(close);
    points.push({
      tag: 'IL RISULTATO IN BILICO',
      title: `${score(close)}: si decide per un episodio.`,
      text: join(`${close.opp}, alle ${fmtTime(close.match)}: ${r === 'P' ? 'un pareggio' : r === 'V' ? 'una vittoria di misura' : 'una sconfitta di misura'} con ${close.gf + close.ga} gol complessivi.`,
        close.ga ? `Il club ne incassa ${close.ga}: in una gara così ogni errore dietro pesa.` : 'Porta inviolata, ma con un solo gol di margine.',
        passText(close), worstText(close)),
      games: [close.match],
    });
  }
  if (!points.length && facts.length) {
    const ga = facts.reduce((s, f) => s + f.ga, 0), gf = facts.reduce((s, f) => s + f.gf, 0);
    points.push({tag: 'IL BILANCIO', title: 'Una serata senza svolte nette.', text: `${plural(facts.length, 'gara registrata', 'gare registrate')}: ${gf} gol fatti, ${ga} subiti. Nei tabellini si vede chi ha inciso e chi no.`, games: sorted});
  }
  return points.slice(0, 3);
}

/* ============================ ROMANZO DEI PRO =========================== */

/** Verdetto sintetico variato per Pro, coerente con il giudizio del motore. */
export function verdictFor(m, cm = commentFor(m)) {
  const tier = tierOf(m.rating), seed = hash(m.name), label = m.roleLabel, g = m.games;
  const who = m.mixed ? 'titolare' : `${label} titolare`;
  const cons = (ROLE_INFO[m.role] || {}).group === 'cons';
  const r = f2(m.rating), gap = f2(8 - m.rating);
  if (g < 3 || !m.rating) return cm.verdict;
  const verdicts = {
    elite: [cm.verdict],
    buono: [`Buono, ma ancora lontano dai migliori: manca il salto di qualità.`, `${r} di media vale la fiducia del club: titolare affidabile, non trascinatore.`, `Rendimento da titolare, senza i numeri del fuoriclasse.`],
    medio: [`Utile ma non decisivo: ${r} è una media da buon gregario.`, `Rendimento ordinario: ${r} basta per giocare, non per spostare le partite.`, `Né bocciato né promosso: ${r} è una media da comprimario.`],
    rimandato: [`Rimandato: ${r} sfiora appena la sufficienza e non basta a un ${who}.`, `Sufficienza risicata (${r}): servono precisione e ${cons ? 'solidità' : 'incidenza'}.`, `${r} di media: il posto da titolare va riguadagnato partita per partita.`],
    bocciato: [`Bocciato: ${r} è un rendimento insufficiente per un ${who}.`, `Bocciatura netta: ${r} non sostiene il ruolo di ${who}.`, `${r} in ${g} presenze: rendimento insufficiente.`],
  };
  return join(choose(seed, verdicts[tier]), g < 10 ? `Lettura provvisoria: ${g} presenze.` : '');
}

/**
 * Ritratto stagionale critico. `member` = riga EA grezza, `m` = metriche (buildAll),
 * `club` = analyzeClub. Restituisce {title, intro, sections:[{label,text}], caveats}.
 */
export function novelEditorial(member, m, club) {
  const g = m.games, name = m.name, label = m.roleLabel;
  const cm = commentFor(m);
  const seed = hash(name);
  const tier = tierOf(m.rating);
  if (g < 3 || !m.rating) {
    return {
      title: 'Campione troppo corto per giudicare.',
      intro: `${name}: ${plural(g, 'presenza', 'presenze')}, ${m.goals} gol e ${m.assists} assist${m.rating ? `, media EA ${f2(m.rating)}` : ''}. ${cm.verdict}`,
      sections: [{label: 'IL TABELLINO', text: `${m.goals} gol e ${m.assists} assist in ${plural(g, 'gara', 'gare')}. Con così poche presenze il giudizio resta sospeso.`}],
      caveats: cm.caveats,
    };
  }
  const r = f2(m.rating);
  const mixed = !!m.mixed;
  const asLabel = mixed ? '' : ` da ${label}`;
  const titles = {
    elite: [`${r}: livello alto, ma non senza limiti.`, `${r}${asLabel}: riferimento tecnico con un difetto da correggere.`, `Livello alto${asLabel} (${r}), margine ancora aperto.`],
    buono: [`${r}: buono, ma non basta.`, `Titolare solido${asLabel} (${r}), a un passo dai migliori.`, `Affidabile a ${r}, ancora lontano dall’eccellenza.`],
    medio: [`${r}: utile, mai decisivo.`, `Rendimento ordinario${asLabel} (${r}).`, `Nella media del club (${r}), senza incidere sul risultato.`],
    rimandato: [`${r}: appena sufficiente.`, `Rimandato dai numeri (${r}).`, mixed ? `A ${r} tiene il posto, non la squadra.` : `Un ${label} a ${r} che tiene il posto, non la squadra.`],
    bocciato: [`${r}: bocciato dai numeri.`, mixed ? `Sotto il minimo per un titolare (${r}).` : `Sotto il minimo per un ${label} titolare (${r}).`, `${r} di media: il rendimento non regge il ruolo.`],
  };
  const title = choose(seed, titles[tier]);
  const verdictLine = verdictFor(m, cm);
  const R = ROLE_INFO[m.role];
  const mixLine = mixed && m.roleMix && m.roleMix.length ? `nelle ultime ${m.roleMix.reduce((s, x) => s + x.n, 0)} gare ${listIt(m.roleMix.map(x => `${x.n} da ${x.label}`))}` : '';
  const intro = join(
    `${name}, ${mixed ? `ruoli diversi${mixLine ? ` (${mixLine})` : ''}${m.proPosLabel ? `, avatar ${m.proPosLabel}` : ''}` : `${label}${m.proPosLabel ? ` (avatar ${m.proPosLabel})` : ''}`}: ${plural(g, 'presenza', 'presenze')}, ${m.goals} gol e ${m.assists} assist, media EA ${f2(m.rating)}.`,
    verdictLine, cm.praise, cm.praise ? `Limite: ${lc(sentence(cm.charge))}` : cm.proof[0] ? `Dato più pesante: ${lc(cm.proof[0])}.` : '');
  const sections = [];

  // IL TABELLINO
  const gaMin = GA_MIN[m.role];
  const tab = [`${f2(m.goalsPerGame)} gol e ${f2(m.assistsPerGame)} assist a gara (${plural(m.goals, 'rete', 'reti')}, ${plural(m.assists, 'assist', 'assist')} in ${g} presenze).`];
  if (fin(m.shareOfClubGA)) tab.push(`Tra reti e assist pesa ${ilp(m.shareOfClubGA)} dei gol del club (${ilp(m.shareOfClubGoals)} contando solo le reti).`);
  if (mixed) {
    // medie stagionali miste di ruoli: il giudizio offensivo vale solo sul campione recente nel ruolo offensivo
    if (gaMin && (m.offSample || 0) >= 6 && fin(m.roleGaPerGame)) tab.push(m.roleGaPerGame >= gaMin
      ? `${m.roleScope.charAt(0).toUpperCase()}${m.roleScope.slice(1)}: ${f2(m.roleGaPerGame)} G+A a gara, incidenza adeguata al ruolo.`
      : `${m.roleScope.charAt(0).toUpperCase()}${m.roleScope.slice(1)}: ${f2(m.roleGaPerGame)} G+A a gara, incidenza insufficiente per un ${label}.`);
    else tab.push(`I totali stagionali sono di ruoli diversi: nelle gare ${m.roleScope || 'recenti'} il contributo offensivo non è il metro del giudizio.`);
  } else if (gaMin) tab.push(m.gaPerGame >= gaMin
    ? `Con ${f2(m.gaPerGame)} G+A a gara l'incidenza offensiva è adeguata al ruolo di ${label}${tier === 'elite' ? ', con margine' : ': nulla di più'}.`
    : `Con ${f2(m.gaPerGame)} G+A a gara l'incidenza offensiva è insufficiente per un ${label}.`);
  else tab.push(`Da ${label} il contributo offensivo non è il metro principale del giudizio.`);
  if (club && club.dependence && club.dependence.name === name && fin(club.dependence.share)) tab.push(`È il capocannoniere del club: ${ilp(club.dependence.share)} dei gol stagionali (${club.dependence.goals} su ${club.season.gf}).`);
  if (m.shotsTotal >= 8 && fin(m.conversionPct)) tab.push(`Nelle ultime ${m.offSample ?? m.sample} gare${mixed ? ` ${m.roleScope}` : ''}: ${m.offGoals ?? m.goalsSample} gol su ${m.shotsTotal} tiri, conversione ${r0(m.conversionPct)}%.`);
  if (m.dryStreak >= 3 && R.group === 'off') tab.push(`Attualmente ${m.dryStreak} gare consecutive senza gol né assist${mixed ? ` ${m.roleScope}` : ''}.`);
  sections.push({label: 'IL TABELLINO', text: tab.join(' ')});

  // IL PALLONE TRA I PIEDI
  if (m.passPct != null) {
    const pass = [`${r0(num(member.passesMade))} passaggi riusciti (${f1(num(member.passesMade) / g)} a gara), ${r0(m.passPct)}% secondo EA, circa ${f1(m.passFailedPerGame)} sbagliati a gara.`];
    if (mixed) {
      if ((m.roleSample || 0) >= 3 && (m.rolePassAtt || 0) >= 30 && fin(m.recentPassPct)) pass.push(`Nelle gare ${m.roleScope}: ${r0(m.recentPassPct)}% di passaggi su ~${r0(m.recentPassAttPerGame)} a gara, ${m.recentPassPct < R.passMin ? `un dato troppo basso per un ${label}` : `nella norma per un ${label}`}.`);
      else pass.push('La media stagionale è di ruoli diversi: nessun giudizio di ruolo sui passaggi finché il campione nel ruolo attuale è corto.');
    } else pass.push(m.passPct < R.passMin
      ? `Per un ${label} è un dato troppo basso: il possesso regalato pesa.`
      : `Per un ${label} il dato è nella norma, senza altro da segnalare.`);
    if (!mixed && fin(m.recentPassPct) && (m.sample || 0) >= 6) pass.push(`Nelle ultime ${m.sample} gare il dato è ${r0(m.recentPassPct)}%${m.worstPassPct < 100 ? `, con un minimo del ${r0(m.worstPassPct)}% nella gara peggiore` : ''}.`);
    if (m.tackPct != null && m.tackAttPerGame >= 1) pass.push(`Contrasti riusciti ${alp(m.tackPct)}${fin(m.clubMedianTackPct) ? ` (mediana del club ${r0(m.clubMedianTackPct)}%)` : ''}, ${f1(m.tackAttPerGame)} tentativi a gara.`);
    sections.push({label: 'IL PALLONE TRA I PIEDI', text: pass.join(' ')});
  }

  // RENDIMENTO E RICONOSCIMENTI
  if (g >= 5) {
    const rend = [`Media EA ${f2(m.rating)} in ${g} presenze; ${plural(m.motm, 'premio uomo partita', 'premi uomo partita')} (${r0(m.motmRate)}% delle gare).`];
    if (m.motm && m.rating < 7) rend.push('I premi non compensano una media così bassa.');
    if (m.peers && !mixed && m.peers.ratingRank) rend.push(`Nel reparto: ${m.peers.ratingRank}° su ${m.peers.n} per media (mediana ${f2(m.peers.medianRating)}).`);
    else if (fin(m.ratingVsClubMedian)) rend.push(`${sign(m.ratingVsClubMedian)}${f2(m.ratingVsClubMedian)} rispetto alla mediana dei titolari del club.`);
    if (fin(m.ratingVsOverall) && m.overall) rend.push(m.ratingVsOverall <= -0.8
      ? `Overall ${m.overall}, rendimento ${f2(m.rating)}: l'avatar vale più di quanto il giocatore produca.`
      : m.ratingVsOverall >= 0.3 ? `Overall ${m.overall}, rendimento ${f2(m.rating)}: rende più di quanto dica l'avatar.` : `Overall ${m.overall} e rendimento ${f2(m.rating)} sono allineati.`);
    if ((m.ratedGames || 0) >= 6) rend.push(`Voti tra ${f1(m.ratingMin)} e ${f1(m.ratingMax)}${m.below65 ? `, ${plural(m.below65, 'gara', 'gare')} su ${m.ratedGames} chiuse con voto insufficiente` : ''}.`);
    rend.push(m.redCards ? `${plural(m.redCards, 'espulsione', 'espulsioni')} in ${g} presenze: la disciplina entra nel conto.` : 'Nessuna espulsione.');
    sections.push({label: 'RENDIMENTO E RICONOSCIMENTI', text: rend.join(' ')});
  }

  // CON E SENZA DI LUI
  const wo = [];
  if (m.nOff >= MIN_ONOFF && m.nOn >= MIN_ONOFF && fin(m.pointsPerGame) && fin(m.pointsPerGameOff)) {
    wo.push(`Il club ha totalizzato ${f2(m.pointsPerGame)} punti a gara con lui in campo (${m.nOn} gare) e ${f2(m.pointsPerGameOff)} senza (${m.nOff} gare); gol subiti a gara ${f2(m.concededPerGameOn)} contro ${f2(m.concededPerGameOff)}.`);
  }
  const mine = (club ? club.pairs : []).filter(p => (p.a === name || p.b === name) && p.delta != null);
  if (mine.length) {
    const pt = p => `Con ${p.a === name ? p.b : p.a} in campo insieme il club ha totalizzato ${f2(p.ppg)} punti a gara in ${p.n} gare, ${f2(p.ppgRest)} nelle ${p.nRest} senza la coppia.`;
    for (const p of mine.slice(0, 2)) wo.push(pt(p));
  }
  if (wo.length) sections.push({label: 'CON E SENZA DI LUI', text: wo.join(' ')});

  // FORMA E CONTESTO
  const fc = [];
  if ((m.sample || 0) >= 6 && fin(m.form5)) fc.push(`Ultime 5 gare a ${f2(m.form5)} contro ${f2(m.rating)} di stagione${m.formVsSeason <= -0.4 ? ': forma sotto il proprio livello' : m.formVsSeason >= 0.4 ? ': forma sopra la propria media' : ': in linea'}.`);
  if ((m.sample || 0) >= 6 && m.nWins >= 3 && m.nNotWin >= 3 && fin(m.ratingNotWin)) fc.push(`Voto ${f2(m.ratingInWins)} nelle ${m.nWins} vittorie, ${f2(m.ratingNotWin)} nelle ${m.nNotWin} gare senza vittoria.`);
  if ((m.sample || 0) >= 6 && m.nBigWin >= 2 && m.nClose >= 3 && fin(m.ratingBigWin)) fc.push(`${f2(m.ratingBigWin)} nelle vittorie larghe, ${f2(m.ratingClose)} nelle ${m.nClose} gare in bilico.`);
  if (mixed && m.roleMix && m.roleMix.length) fc.push(`Ruoli nelle ultime ${m.roleMix.reduce((s, x) => s + x.n, 0)} gare: ${listIt(m.roleMix.map(x => `${x.n} da ${x.label}`))}. I giudizi di ruolo si riferiscono al campione ${m.roleScope}, non alle medie di stagione.`);
  else if (m.roleMismatch) fc.push(`Schierato da ${m.playedPos} con avatar ${m.position}${m.proPosLabel ? ` (${m.proPosLabel})` : ''}: giudicato come ${label}.`);
  if (fc.length) sections.push({label: 'FORMA E CONTESTO', text: fc.join(' ')});

  // LA PROSSIMA PAGINA
  if (g >= 10) {
    const targets = [];
    if (!mixed && m.passPct != null && m.passPct < R.passMin) targets.push(`Obiettivo misurabile: portare i passaggi dal ${r0(m.passPct)}% al ${R.passMin}% richiesto da un ${label}.`);
    if (!mixed && gaMin && m.gaPerGame < gaMin) targets.push(`Obiettivo: arrivare a ${gaMin} G+A a gara (oggi ${f2(m.gaPerGame)}).`);
    sections.push({label: 'LA PROSSIMA PAGINA', text: join(cm.coachNote, targets.join(' '))});
  }
  return {title, intro, sections, caveats: cm.caveats};
}

/* ======================= PANORAMICA E LENTE SUI NUMERI ================== */

export function clubReading(club) {
  const s = club.season, r = club.record;
  const record = join(`${s.games ? Math.round(s.w / s.games * 100) : 0}% di vittorie su ${s.games} partite.`,
    s.w > s.l
      ? `Il bilancio è positivo, ma ${f2(s.gaPerGame)} gol subiti a gara in stagione e ${r.conceded3plus} gare su ${r.n} con 3 o più gol incassati tra le ultime disponibili dicono che la tenuta è il problema.`
      : `Il bilancio non è positivo: servono meno gol subiti (${f2(s.gaPerGame)} a gara) per cambiare il segno.`);
  const quick = [];
  quick.push(s.gaPerGame > 2 ? `Con ${f2(s.gaPerGame)} gol subiti a gara il club vive dei gol che segna.` : `${f2(s.gaPerGame)} gol subiti a gara: accettabile, ma lontano da una difesa che chiude le partite.`);
  if (club.dependence && fin(club.dependence.share)) quick.push(`${club.dependence.name} firma ${ilp(club.dependence.share)} dei gol stagionali (${club.dependence.goals} su ${s.gf}): una quota molto alta sul totale.`);
  if (club.weakestPlayer) quick.push(`L'anello debole tra i titolari è ${club.weakestPlayer.name} (media ${f2(club.weakestPlayer.rating)}).`);
  return {record, quick: quick.join(' ')};
}

export function signalsEditorial(club, names) {
  const byName = metricsIndex(club.players);
  const sc = metricOf(byName, names.scorer), as = metricOf(byName, names.assister), ps = metricOf(byName, names.passer);
  const out = {};
  if (sc) {
    const share = club.season.gf ? sc.goals / club.season.gf * 100 : 0;
    out.scorer = join(`${sc.goals} gol · ${r0(share)}% dei gol del club: quota ${share >= 40 ? 'molto alta' : share >= 30 ? 'alta' : 'nella norma'}.`,
      sc.shotsTotal >= 8 ? `Conversione ${r0(sc.conversionPct)}% su ${sc.shotsTotal} tiri nelle ultime ${sc.sample} gare.` : `Media EA ${f2(sc.rating)}.`);
  }
  if (as) {
    const R = ROLE_INFO[as.role];
    out.assister = join(`${as.assists} assist in ${as.games} gare · ${f2(as.assistsPerGame)} a partita.`,
      `Media EA ${f2(as.rating)}${as.passPct != null ? `, passaggi ${alp(as.passPct)}` : ''}.`);
  }
  if (ps) {
    const R = ROLE_INFO[ps.role];
    out.passer = join(`${r0(ps.passPct)}% di passaggi riusciti, ~${r0(ps.passAttPerGame)} tentati a gara, tra chi ha almeno 10 presenze.`,
      ps.mixed ? 'Totali di ruoli diversi: la precisione non misura il rischio preso.' : `${ps.roleLabel.charAt(0).toUpperCase() + ps.roleLabel.slice(1)}: ${ps.passPct >= R.passMin ? 'precisione alta, ma il dato non misura il rischio preso' : 'precisione bassa persino per il migliore'}.`);
  }
  return out;
}

/* ============================== MATCH STUDIO ============================ */

const shortPos = {goalkeeper: 'Portiere', defender: 'Difensore', midfielder: 'Centrocampista', forward: 'Attaccante'};

export function matchStudioEditorial({own, players, metricsByName}) {
  const gf = num(own.goals), ga = num(own.goalsAgainst);
  const ps = players.map(normalizeRaw);
  const tp = teamPasses(ps);
  const rated = ps.filter(p => p.rating != null).sort((a, b) => b.rating - a.rating);
  const top = rated[0];
  const seed = hash(`${gf}-${ga}-${top ? top.name : ''}`);
  const sloppy = tp.att >= 30 && tp.pct != null && tp.pct < 80;
  let headline;
  if (gf > ga) {
    headline = ga === 0
      ? (sloppy ? choose(seed, ['Porta chiusa, passaggi da rivedere.', 'A rete inviolata, ma con troppi palloni persi.']) : choose(seed, ['Porta chiusa: la difesa regge, ora serve ripeterlo.', 'Rete inviolata: da confermare, non da celebrare.']))
      : (ga >= 2 || sloppy ? choose(seed, ['Vittoria con riserva.', `Si vince, ma con ${ga} gol subiti.`, 'Il risultato regge, i numeri meno.']) : choose(seed, ['Vittoria in ordine, con un gol incassato.', 'Risultato giusto, tenuta ancora da verificare.']));
  } else if (gf < ga) headline = choose(seed, [`Sconfitta: ${ga} gol subiti, ${gf} fatti.`, 'Serata negativa, i numeri non offrono alibi.', 'Si perde: da rivedere dietro e davanti.']);
  else headline = choose(seed, ['Pareggio: nessuno ha deciso la gara.', 'Equilibrio sul campo, ma poca incisività.']);
  const parts = [];
  if (top) {
    const m = metricOf(metricsByName, top.name);
    const lim = limitSentence(top, m);
    if (top.rating >= 8) parts.push(m && m.rating > 8
      ? join(`${top.name} ha il miglior voto tra i Pro (${f2(top.rating)}) e porta ${f2(m.rating)} di media stagionale.`, lim)
      : join(`${top.name} ha il miglior voto (${f2(top.rating)}), ma la media stagionale è ${m && m.rating ? f2(m.rating) : 'non disponibile'}: una gara, non un livello.`, lim));
    else parts.push(join(`${top.name} ha il miglior voto tra i Pro (${f2(top.rating)}): il migliore di una gara senza protagonisti.`, lim));
  }
  const shots = ps.reduce((s, p) => s + p.shots, 0), goals = ps.reduce((s, p) => s + p.goals, 0);
  if (shots) parts.push(`${goals} gol su ${shots} tiri dei Pro: conversione ${Math.round(goals / shots * 100)}%${goals / shots < 0.3 ? ', troppe occasioni sprecate' : ''}.`);
  if (tp.att) parts.push(`${tp.failed} passaggi non riusciti su ${tp.att} (${tp.pct}% di precisione dei Pro)${sloppy ? ": troppi palloni regalati" : ''}.`);
  const flagged = ps.map(p => ({p, f: passFlag(p, metricOf(metricsByName, p.name))})).filter(x => x.f);
  if (flagged.length) parts.push(`Passaggi da rivedere: ${flagged.map(x => `${x.p.name} ${x.f.pct}%`).join(', ')}.`);
  const reds = ps.filter(p => p.reds);
  if (reds.length) parts.push(`Espulsioni: ${reds.map(p => p.name).join(', ')}.`);
  return {headline, text: parts.join(' ')};
}

export function awardEditorial(kind, raw, metricsByName) {
  const p = normalizeRaw(raw), m = metricOf(metricsByName, p.name);
  const role = shortPos[raw.pos] || 'Ruolo EA';
  const pf = passFlag(p, m);
  if (kind === 'rated') {
    if (p.rating >= 8) {
      return m && m.rating > 8
        ? join(`Voto ${f2(p.rating)} · ${role}.`, `Anche la stagione lo conferma (${f2(m.rating)}). ${limitSentence(p, m) || 'Limite: continuità da dimostrare.'}`)
        : join(`Voto ${f2(p.rating)} · ${role}.`, `Ma la media stagionale è ${m && m.rating ? f2(m.rating) : 'non disponibile'}: gara isolata.`);
    }
    return join(`Voto ${f2(p.rating)} · ${role}. Il migliore di una gara senza protagonisti.`, pf ? `Passaggi ${alp(pf.pct)}: da rivedere.` : '');
  }
  if (kind === 'assist') return join(`${p.assists} assist · voto ${f2(p.rating)}.`, pf ? `Ma passaggi ${alp(pf.pct)} : ${pf.failed} errori.` : p.rating < 7 ? 'Il voto resta sotto il 7: l’assist non basta a fare la gara.' : '');
  if (kind === 'tackle') {
    const pct = p.tackleAttempts ? Math.round(p.tackles / p.tackleAttempts * 100) : 0;
    return `${p.tackles} contrasti riusciti su ${p.tackleAttempts} (${pct}%)${pct < 50 ? ': tanti tentativi, resa bassa' : ''}. Il dato EA non distingue il contrasto utile da quello di routine.`;
  }
  if (kind === 'pass') return join(`${p.passes}/${p.passAttempts} passaggi (${p.passPct}%). Almeno 10 tentativi per il premio.`,
    pf ? `È il migliore dei tentativi, ma il dato resta basso per un ${pf.label}.` : 'La precisione non misura il rischio preso.');
  return '';
}
