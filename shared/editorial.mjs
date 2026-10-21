/* ---------------------------------------------------------------------------
 * Testi editoriali (copertina, svolte, romanzo, annotazioni, panoramica,
 * match studio). Solo dati EA reali; giudizio dal motore di commentary.mjs:
 *  - tono critico ma misurato: da allenatore serio, onesto sui dati, rispettoso; si giudica
 *    la prestazione e non la persona, con al massimo due rilievi per Pro e una direzione di lavoro;
 *  - parametri di ruolo da ROLE_INFO;
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

/** Passaggi nettamente sotto il livello atteso per il ruolo (scarto chiaro su un campione adeguato), altrimenti null. */
function passFlag(p, m) {
  if (!p.passAttempts || p.passAttempts < 10 || p.passPct == null) return null;
  const R = nightRole(p, m);
  const gap = R.passMin - p.passPct;
  if (gap < 4 || (p.passAttempts < 15 && gap < 10)) return null;
  return {pct: p.passPct, min: R.passMin, label: R.label, failed: p.passAttempts - p.passes};
}

function nightLimits(p, m) {
  const L = [];
  if (p.reds) L.push(`${p.reds} ${p.reds === 1 ? 'rosso' : 'rossi'}`);
  const pf = passFlag(p, m);
  if (pf) L.push(`${pf.pct}% di passaggi (${pf.failed} sbagliati su ${p.passAttempts})`);
  if (p.shots >= 5 && p.goals / p.shots < 0.3 && OFF_METRIC_ROLES.has(nightRole(p, m).role) && nightRole(p, m).role !== 'CC') L.push(`${p.goals} gol su ${p.shots} tiri`);
  if (p.tackleAttempts >= 8 && p.tackles / p.tackleAttempts < 0.5) L.push(`${plural(p.tackles, 'contrasto riuscito', 'contrasti riusciti')} su ${p.tackleAttempts}`);
  return L;
}

/** Aspetto da curare di un Pro: prima i dati della serata (al massimo due), poi il rilievo principale della stagione. */
function limitSentence(p, m) {
  const L = nightLimits(p, m);
  if (L.length) return `Da curare nella serata: ${L.slice(0, 2).join('; ')}.`;
  if (!m || m.games < 3 || !m.rating) return '';
  const c = commentFor(metricsForRole(m, nightRole(p, m).pos));
  if (m.rating > 8) return sentence(c.charge);
  const first = c.chargeItems && c.chargeItems[0];
  return first && !first.soft ? sentence(first.text) : '';
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
    sober: n => [`${n} segna, e la serata può dare ancora di più.`, `${n} tiene a galla la serata con i gol.`, `Il gol porta la firma di ${n}, il resto può crescere.`, `${n} timbra il cartellino davanti, la serata cerca il resto.`],
  },
  goalAway: {
    warm: n => [`${n} segna da dove non te lo aspetti.`, `${n} firma la serata partendo da dietro.`, `${n} trova la porta fuori dal copione.`],
    sober: n => [`${n} segna, anche se il suo compito era un altro.`, `Il gol è di ${n}, il resto della serata è ordinaria amministrazione.`, `${n} trova la rete in una serata senza grandi picchi.`],
  },
  assist: {
    warm: n => [`${n} è l’ultimo passaggio della serata.`, `${n} serve i compagni e la partita gira.`, `${n} apparecchia, la squadra incassa.`, `${n} rifinisce, e si vede.`],
    sober: n => [`${n} mette i compagni davanti alla porta, il resto è da costruire.`, `Gli assist sono di ${n}: il resto è nella norma.`, `${n} rifinisce, e la serata può chiedere ancora di più.`, `${n} serve bene: la squadra può fare ancora meglio.`],
  },
  save: {
    warm: n => [`${n} tiene in piedi la porta.`, `${n}, le mani giuste nel momento giusto.`, `${n} para e il risultato resta in piedi.`, `${n} è il muro della serata.`],
    sober: n => [`${n} para, ma la porta resta sotto pressione.`, `${n} salva più di un tiro in una serata che dietro chiede attenzione.`, `${n} lavora tanto, segno che dietro c'è da registrare qualcosa.`, `${n} tra i pali fa la sua parte, il reparto può dare di più.`],
  },
  overall: {
    warm: n => [`${n} guida la serata.`, `${n} prende per mano la squadra.`, `${n} è il più continuo della notte.`, `${n} comanda la partita, a modo suo.`],
    sober: n => [`${n} emerge in una serata senza padroni.`, `${n} emerge dove la squadra fatica.`, `${n} fa meglio degli altri, senza far rumore.`, `${n} è il riferimento di una serata senza picchi.`],
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
  const tone = !seasonRating ? '' : seasonRating > 8 ? choose(seed, ['Non è un caso: lo fa da tutta la stagione.', 'La continuità, in lui, c’è.']) : seasonRating < 6.5 ? choose(seed, ['Una serata, però, non cambia il quadro della sua stagione.', 'Resta da vedere se sa ripeterlo: finora la stagione racconta un rendimento diverso.']) : choose(seed, ['Ma una serata non fa una stagione.', 'Il resto del suo rendimento è più ordinario di questa notte.', 'Da confermare: la media di stagione è più contenuta.']);
  return join(`${hook}.`, nightRoleNote(ri), tone, `Serata chiusa sul ${res}.`);
}

function coverClosing(rec, tp, seed) {
  const n = rec.games, concedes = rec.against >= n * 1.5;
  if (rec.wins > rec.losses) {
    if (concedes) return choose(seed, ['Si vince, e dietro c’è ancora qualcosa da registrare.', 'Il risultato c’è, la tenuta può crescere.', 'Tre punti che lasciano comunque lavoro da fare in difesa.']);
    if (tp.att >= 30 && tp.pct != null && tp.pct < 80) return choose(seed, ['Si vince, e nel palleggio c’è margine per perdere meno palloni.', 'Il risultato c’è, la pulizia nel palleggio può crescere.']);
    return choose(seed, ['Un bilancio in ordine: ora l’obiettivo è ripeterlo.', 'Serata a posto sul campo, da confermare alla prossima.']);
  }
  if (rec.losses > rec.wins) return choose(seed, ['Serata sotto le attese: il bilancio indica dove lavorare.', 'Il bilancio è in negativo: si riparte dai dati.', 'Si perde più di quanto si vince: il lavoro riparte da qui.']);
  return choose(seed, ['Un equilibrio: manca lo spunto per spostarlo.', 'Né vincitori né vinti: serve un episodio in più a favore.']);
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
    diff > 0 && record.against / Math.max(1, n) >= 1.5 ? 'Il saldo è positivo; dietro c’è margine per subire meno.' : diff < 0 ? 'Attacco e tenuta possono crescere insieme.' : '');
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
  const named = new Set();
  if (rated.length >= 2) {
    const sorted = [...rated].sort((a, b) => b.rating - a.rating);
    const top = sorted[0], low = sorted[sorted.length - 1];
    out.push(`Media EA più alta ${top.name} (${f2(top.rating)}), più bassa ${low.name} (${f2(low.rating)}): ${f2(top.rating - low.rating)} punti di distanza dentro la stessa squadra.`);
    if (low.rating < 6.5) { out.push(`${low.name} chiude con il voto più basso: serata sotto le attese.`); named.add(low.name); }
  }
  // ogni Pro compare in un solo rilievo critico: gli altri dati restano neutri
  const flagged = players.map(p => ({p, f: passFlag(p, metricOf(metricsByName, p.name))})).filter(x => x.f && !named.has(x.p.name)).slice(0, 3);
  if (flagged.length) { out.push(`Passaggi da curare: ${flagged.map(x => `${x.p.name} ${x.f.pct}%`).join(', ')}.`); flagged.forEach(x => named.add(x.p.name)); }
  else out.push('Sui passaggi nessuno ha sbagliato in modo vistoso.');
  const shooter = players.filter(p => p.shots >= 3 && OFF_METRIC_ROLES.has(nightRole(p, metricOf(metricsByName, p.name)).role)).sort((a, b) => b.shots - a.shots)[0];
  if (shooter) out.push(`${shooter.name}: ${shooter.goals} gol su ${shooter.shots} tiri${shooter.shots >= 5 && shooter.goals / shooter.shots < 0.3 && !named.has(shooter.name) ? ', conversione da migliorare' : ''}.`);
  const reds = players.filter(p => p.reds);
  if (reds.length) out.push(`Cartellini rossi: ${reds.map(p => `${p.name} (${p.reds})`).join(', ')}.`);
  if (record && record.against / Math.max(1, record.games) >= 1.5) out.push(`${record.against} gol subiti in ${plural(record.games, 'gara', 'gare')}: il margine di lavoro è dietro.`);
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
    ? `Miglior voto ${b.name} (${f2(b.rating)}); la media stagionale è ${f2(m.rating)}, la gara è da confermare.`
    : join(`Miglior voto ${b.name} (${f2(b.rating)}), e la stagione lo conferma.`, limitSentence(b, m));
}
const worstText = f => (f.worst && f.worst.rating < 6.5 ? `Voto più basso ${f.worst.name} (${f2(f.worst.rating)}): gara sotto le attese.` : f.worst ? `Voto più basso ${f.worst.name} (${f2(f.worst.rating)}).` : '');

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
      title: win.ga ? `${score(win)}: larga, con un margine in difesa.` : `${score(win)}: larga e a porta inviolata.`,
      text: join(`Contro ${win.opp}, alle ${fmtTime(win.match)}: margine di ${plural(win.gf - win.ga, 'gol', 'gol')}, il più ampio della serata.`,
        win.ga ? `Il club incassa ${plural(win.ga, 'gol', 'gol')}.` : 'Nessun gol subito.', passText(win), bestText(win)),
      games: [win.match],
    });
  }
  const ri = facts.findIndex((f, i) => i > 0 && res(f) === 'V' && res(facts[i - 1]) === 'S');
  if (ri > 0) {
    const a = facts[ri - 1], b = facts[ri];
    points.push({
      tag: 'LA RISPOSTA',
      title: `Dal ${score(a)} al ${score(b)}.`,
      text: join(`Dopo il ${score(a)} contro ${a.opp} (${plural(a.ga, 'gol subito', 'gol subiti')}${a.tp.att >= 20 ? `, passaggi ${alp(a.tp.pct)}` : ''}) arriva il ${score(b)} contro ${b.opp}.`,
        b.ga >= a.ga ? `In difesa i gol incassati restano ${b.ga} anche nella gara di reazione.` : b.ga ? `Si incassa ancora ${plural(b.ga, 'gol', 'gol')}, meno della gara precedente.` : 'Stavolta porta inviolata.',
        b.tp.att >= 20 ? `Passaggi ${alp(b.tp.pct)}.` : '', 'Conviene rivedere con calma i gol subiti nella gara precedente.'),
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
        leaky ? `In ${plural(leaky, 'gara', 'gare')} i gol subiti sono almeno 2: la serie c’è, la solidità può crescere.` : 'Mai più di un gol subito per gara: la serie regge anche dietro.',
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
        close.ga ? `Il club ne incassa ${close.ga}: in gare così contano i dettagli difensivi.` : 'Porta inviolata, ma con un solo gol di margine.',
        passText(close), worstText(close)),
      games: [close.match],
    });
  }
  if (!points.length && facts.length) {
    const ga = facts.reduce((s, f) => s + f.ga, 0), gf = facts.reduce((s, f) => s + f.gf, 0);
    points.push({tag: 'IL BILANCIO', title: 'Una serata senza svolte nette.', text: `${plural(facts.length, 'gara registrata', 'gare registrate')}: ${gf} gol fatti, ${ga} subiti. Nei tabellini si legge il contributo di ciascuno.`, games: sorted});
  }
  return points.slice(0, 3);
}

/* ============================ ROMANZO DEI PRO =========================== */

/** Verdetto sintetico per Pro, coerente con il giudizio del motore (5 gradazioni sobrie, sempre con la direzione di lavoro). */
export function verdictFor(m, cm = commentFor(m)) {
  return cm.verdict;
}

/**
 * Ritratto stagionale, critico ma misurato. `member` = riga EA grezza, `m` = metriche (buildAll),
 * `club` = analyzeClub. Restituisce {title, intro, sections:[{label,text}], caveats}.
 * Il giudizio esplicito riguarda solo le aree scelte dal motore (al massimo due): il resto e` dato neutro.
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
  // aree su cui il motore ha formulato un rilievo: solo lì il ritratto esprime un giudizio
  const focusAreas = new Set((cm.chargeItems || []).map(x => x.area));
  const has = (...a) => a.some(x => focusAreas.has(x));
  const titles = {
    elite: [`${r}: livello alto, con un aspetto ancora da curare.`, `${r}${asLabel}: riferimento tecnico, con un margine da sfruttare.`, `Livello alto${asLabel} (${r}), margine ancora aperto.`],
    buono: [`${r}: buono, con spazio per crescere.`, `Titolare solido${asLabel} (${r}), vicino ai migliori.`, `Rendimento solido a ${r}, a un passo dall’eccellenza.`],
    medio: [`${r}: un contributo utile, margine per incidere di più.`, `Rendimento nella norma${asLabel} (${r}).`, `In linea con il club (${r}), con spazio per pesare di più.`],
    rimandato: [`${r}: da migliorare.`, `Rendimento da consolidare${asLabel} (${r}).`, mixed ? `A ${r} il posto da titolare c’è: il passo è la continuità.` : `Un ${label} a ${r}: il passo ora è la continuità.`],
    bocciato: [`${r}: un rendimento da riportare in alto.`, mixed ? `${r} da titolare: c’è ampio margine di crescita.` : `${r}${asLabel}: c’è ampio margine di crescita.`, `${r} di media: il rendimento può risalire.`],
  };
  const title = choose(seed, titles[tier]);
  const R = ROLE_INFO[m.role];
  const mixLine = mixed && m.roleMix && m.roleMix.length ? `nelle ultime ${m.roleMix.reduce((s, x) => s + x.n, 0)} gare ${listIt(m.roleMix.map(x => `${x.n} da ${x.label}`))}` : '';
  const intro = join(
    `${name}, ${mixed ? `ruoli diversi${mixLine ? ` (${mixLine})` : ''}${m.proPosLabel ? `, avatar ${m.proPosLabel}` : ''}` : `${label}${m.proPosLabel ? ` (avatar ${m.proPosLabel})` : ''}`}: ${plural(g, 'presenza', 'presenze')}, ${m.goals} gol e ${m.assists} assist, media EA ${f2(m.rating)}.`,
    verdictFor(m, cm), cm.praise, cm.praise ? `Da limare: ${lc(sentence(cm.charge))}` : '');
  const sections = [];

  // IL TABELLINO
  const gaMin = GA_MIN[m.role];
  const tab = [`${f2(m.goalsPerGame)} gol e ${f2(m.assistsPerGame)} assist a gara (${plural(m.goals, 'rete', 'reti')}, ${plural(m.assists, 'assist', 'assist')} in ${g} presenze).`];
  if (fin(m.shareOfClubGA)) tab.push(`Tra reti e assist pesa ${ilp(m.shareOfClubGA)} dei gol del club (${ilp(m.shareOfClubGoals)} contando solo le reti).`);
  const cap = x => `${x.charAt(0).toUpperCase()}${x.slice(1)}`;
  if (mixed) {
    // medie stagionali miste di ruoli: il giudizio offensivo vale solo sul campione recente nel ruolo offensivo
    if (gaMin && (m.offSample || 0) >= 6 && fin(m.roleGaPerGame)) tab.push(m.roleGaPerGame >= gaMin
      ? `${cap(m.roleScope)}: ${f2(m.roleGaPerGame)} G+A a gara, incidenza adeguata al ruolo.`
      : has('output') ? `${cap(m.roleScope)}: ${f2(m.roleGaPerGame)} G+A a gara, un contributo offensivo che può crescere per un ${label}.` : `${cap(m.roleScope)}: ${f2(m.roleGaPerGame)} G+A a gara.`);
    else tab.push(`I totali stagionali sono di ruoli diversi: nelle gare ${m.roleScope || 'recenti'} il contributo offensivo non è il metro del giudizio.`);
  } else if (gaMin) tab.push(m.gaPerGame >= gaMin
    ? `Con ${f2(m.gaPerGame)} G+A a gara l'incidenza offensiva è adeguata al ruolo di ${label}${tier === 'elite' ? ', con margine' : ''}.`
    : has('output') ? `Con ${f2(m.gaPerGame)} G+A a gara il contributo offensivo può crescere per un ${label}.` : `Con ${f2(m.gaPerGame)} G+A a gara.`);
  else tab.push(`Da ${label} il contributo offensivo non è il metro principale del giudizio.`);
  if (club && club.dependence && club.dependence.name === name && fin(club.dependence.share)) tab.push(`È il capocannoniere del club: ${ilp(club.dependence.share)} dei gol stagionali (${club.dependence.goals} su ${club.season.gf}).`);
  if (m.shotsTotal >= 8 && fin(m.conversionPct)) tab.push(`Nelle ultime ${m.offSample ?? m.sample} gare${mixed ? ` ${m.roleScope}` : ''}: ${m.offGoals ?? m.goalsSample} gol su ${m.shotsTotal} tiri, conversione ${r0(m.conversionPct)}%.`);
  if (m.dryStreak >= 3 && R.group === 'off') tab.push(`Attualmente ${m.dryStreak} gare consecutive senza gol né assist${mixed ? ` ${m.roleScope}` : ''}.`);
  sections.push({label: 'IL TABELLINO', text: tab.join(' ')});

  // IL PALLONE TRA I PIEDI
  if (m.passPct != null) {
    const evalPass = has('pass', 'involve');
    const pass = [`${r0(num(member.passesMade))} passaggi riusciti (${f1(num(member.passesMade) / g)} a gara), ${r0(m.passPct)}% secondo EA, circa ${f1(m.passFailedPerGame)} sbagliati a gara.`];
    if (mixed) {
      if ((m.roleSample || 0) >= 3 && (m.rolePassAtt || 0) >= 30 && fin(m.recentPassPct)) pass.push(`Nelle gare ${m.roleScope}: ${r0(m.recentPassPct)}% di passaggi su ~${r0(m.recentPassAttPerGame)} a gara${m.recentPassPct < R.passMin ? (evalPass ? `, un dato su cui lavorare per un ${label}` : '') : `, nella norma per un ${label}`}.`);
      else pass.push('La media stagionale è di ruoli diversi: nessun giudizio di ruolo sui passaggi finché il campione nel ruolo attuale è corto.');
    } else pass.push(m.passPct < R.passMin
      ? (evalPass ? `Per un ${label} la precisione può crescere.` : '')
      : `Per un ${label} il dato è nella norma, senza altro da segnalare.`);
    if (!mixed && fin(m.recentPassPct) && (m.sample || 0) >= 6) pass.push(`Nelle ultime ${m.sample} gare il dato è ${r0(m.recentPassPct)}%${m.worstPassPct < 100 ? `, con un minimo del ${r0(m.worstPassPct)}% nella gara peggiore` : ''}.`);
    if (m.tackPct != null && m.tackAttPerGame >= 1) pass.push(`Contrasti riusciti ${alp(m.tackPct)}${fin(m.clubMedianTackPct) ? ` (mediana del club ${r0(m.clubMedianTackPct)}%)` : ''}, ${f1(m.tackAttPerGame)} tentativi a gara.`);
    sections.push({label: 'IL PALLONE TRA I PIEDI', text: pass.filter(Boolean).join(' ')});
  }

  // RENDIMENTO E RICONOSCIMENTI
  if (g >= 5) {
    const rend = [`Media EA ${f2(m.rating)} in ${g} presenze; ${plural(m.motm, 'premio uomo partita', 'premi uomo partita')} (${r0(m.motmRate)}% delle gare).`];
    if (m.peers && !mixed && m.peers.ratingRank) rend.push(`Nel reparto: ${m.peers.ratingRank}° su ${m.peers.n} per media (mediana ${f2(m.peers.medianRating)}).`);
    else if (fin(m.ratingVsClubMedian)) rend.push(`${sign(m.ratingVsClubMedian)}${f2(m.ratingVsClubMedian)} rispetto alla mediana dei titolari del club.`);
    if (fin(m.ratingVsOverall) && m.overall) rend.push(m.ratingVsOverall <= -0.8 && has('overall')
      ? `Overall ${m.overall}, rendimento ${f2(m.rating)}: finora il rendimento resta sotto quanto l'avatar farebbe pensare.`
      : m.ratingVsOverall >= 0.3 ? `Overall ${m.overall}, rendimento ${f2(m.rating)}: rende più di quanto dica l'avatar.` : `Overall ${m.overall} e rendimento ${f2(m.rating)}.`);
    if ((m.ratedGames || 0) >= 6) rend.push(`Voti tra ${f1(m.ratingMin)} e ${f1(m.ratingMax)}${m.below65 && has('consistency') ? `, ${plural(m.below65, 'gara', 'gare')} su ${m.ratedGames} sotto il livello atteso` : ''}.`);
    rend.push(m.redCards ? `${plural(m.redCards, 'espulsione', 'espulsioni')} in ${g} presenze${has('discipline') ? ': la disciplina entra nel conto' : ''}.` : 'Nessuna espulsione.');
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
  if ((m.sample || 0) >= 6 && fin(m.form5)) fc.push(`Ultime 5 gare a ${f2(m.form5)} contro ${f2(m.rating)} di stagione${m.formVsSeason <= -0.4 ? (has('form', 'consistency') ? ': forma sotto il proprio livello' : '') : m.formVsSeason >= 0.4 ? ': forma sopra la propria media' : ': in linea'}.`);
  if ((m.sample || 0) >= 6 && m.nWins >= 3 && m.nNotWin >= 3 && fin(m.ratingNotWin)) fc.push(`Voto ${f2(m.ratingInWins)} nelle ${m.nWins} vittorie, ${f2(m.ratingNotWin)} nelle ${m.nNotWin} gare senza vittoria.`);
  if ((m.sample || 0) >= 6 && m.nBigWin >= 2 && m.nClose >= 3 && fin(m.ratingBigWin)) fc.push(`${f2(m.ratingBigWin)} nelle vittorie larghe, ${f2(m.ratingClose)} nelle ${m.nClose} gare in bilico.`);
  if (mixed && m.roleMix && m.roleMix.length) fc.push(`Ruoli nelle ultime ${m.roleMix.reduce((s, x) => s + x.n, 0)} gare: ${listIt(m.roleMix.map(x => `${x.n} da ${x.label}`))}. I giudizi di ruolo si riferiscono al campione ${m.roleScope}, non alle medie di stagione.`);
  else if (m.roleMismatch) fc.push(`Schierato da ${m.playedPos} con avatar ${m.position}${m.proPosLabel ? ` (${m.proPosLabel})` : ''}: giudicato come ${label}.`);
  if (fc.length) sections.push({label: 'FORMA E CONTESTO', text: fc.join(' ')});

  // LA PROSSIMA PAGINA: una sola indicazione concreta, senza soglie
  if (g >= 10) sections.push({label: 'LA PROSSIMA PAGINA', text: cm.coachNote});
  return {title, intro, sections, caveats: cm.caveats};
}

/* ======================= PANORAMICA E LENTE SUI NUMERI ================== */

export function clubReading(club) {
  const s = club.season, r = club.record;
  const record = join(`${s.games ? Math.round(s.w / s.games * 100) : 0}% di vittorie su ${s.games} partite.`,
    s.w > s.l
      ? `Il bilancio è positivo, ma ${f2(s.gaPerGame)} gol subiti a gara in stagione e ${r.conceded3plus} gare su ${r.n} con 3 o più gol incassati tra le ultime disponibili indicano nella tenuta il fronte su cui lavorare.`
      : `Il bilancio è ancora da migliorare: ridurre i gol subiti (${f2(s.gaPerGame)} a gara) può cambiare il segno.`);
  const quick = [];
  quick.push(s.gaPerGame > 2 ? `Con ${f2(s.gaPerGame)} gol subiti a gara il club si affida soprattutto ai gol che segna.` : `${f2(s.gaPerGame)} gol subiti a gara: accettabile, con margine per chiudere meglio le partite.`);
  if (club.dependence && fin(club.dependence.share)) quick.push(`${club.dependence.name} firma ${ilp(club.dependence.share)} dei gol stagionali (${club.dependence.goals} su ${s.gf}): una quota molto alta sul totale.`);
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
      ps.mixed ? 'Totali di ruoli diversi: la precisione non misura il rischio preso.' : `${ps.roleLabel.charAt(0).toUpperCase() + ps.roleLabel.slice(1)}: ${ps.passPct >= R.passMin ? 'precisione alta, ma il dato non misura il rischio preso' : 'precisione ancora migliorabile anche per il migliore'}.`);
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
      ? (sloppy ? choose(seed, ['Porta chiusa, con margine nel palleggio.', 'A rete inviolata, qualche pallone perso di troppo.']) : choose(seed, ['Porta chiusa: la difesa regge, ora l’obiettivo è ripeterlo.', 'Rete inviolata: da confermare nelle prossime gare.']))
      : (ga >= 2 || sloppy ? choose(seed, ['Vittoria con qualche riserva.', `Si vince, ma con ${ga} gol subiti.`, 'Il risultato c’è, i numeri possono migliorare.']) : choose(seed, ['Vittoria in ordine, con un gol incassato.', 'Risultato giusto, tenuta ancora da verificare.']));
  } else if (gf < ga) headline = choose(seed, [`Sconfitta: ${ga} gol subiti, ${gf} fatti.`, 'Serata sotto le attese: i numeri indicano dove lavorare.', 'Si perde: c’è da rivedere qualcosa dietro e davanti.']);
  else headline = choose(seed, ['Pareggio: nessuno ha deciso la gara.', 'Equilibrio sul campo: manca un po’ di incisività.']);
  const parts = [];
  // l'aspetto da curare del migliore e` nella sua scheda premio: qui non si ripete
  if (top) {
    const m = metricOf(metricsByName, top.name);
    if (top.rating >= 8) parts.push(m && m.rating > 8
      ? `${top.name} ha il miglior voto tra i Pro (${f2(top.rating)}) e porta ${f2(m.rating)} di media stagionale.`
      : `${top.name} ha il miglior voto (${f2(top.rating)}); la media stagionale è ${m && m.rating ? f2(m.rating) : 'non disponibile'}, la gara è da confermare.`);
    else parts.push(`${top.name} ha il miglior voto tra i Pro (${f2(top.rating)}): il migliore di una gara senza protagonisti.`);
  }
  const shots = ps.reduce((s, p) => s + p.shots, 0), goals = ps.reduce((s, p) => s + p.goals, 0);
  if (shots) parts.push(`${goals} gol su ${shots} tiri dei Pro: conversione ${Math.round(goals / shots * 100)}%${shots >= 6 && goals / shots < 0.3 ? ': la finalizzazione può crescere' : ''}.`);
  if (tp.att) parts.push(`${tp.failed} passaggi non riusciti su ${tp.att} (${tp.pct}% di precisione dei Pro)${sloppy ? ': qualche pallone perso di troppo' : ''}.`);
  // il migliore e` gia` trattato nella sua scheda premio: non si ripete
  const flagged = ps.map(p => ({p, f: passFlag(p, metricOf(metricsByName, p.name))})).filter(x => x.f && !(top && x.p.name === top.name)).slice(0, 3);
  if (flagged.length) parts.push(`Passaggi da curare: ${flagged.map(x => `${x.p.name} ${x.f.pct}%`).join(', ')}.`);
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
        : join(`Voto ${f2(p.rating)} · ${role}.`, `La media stagionale è ${m && m.rating ? f2(m.rating) : 'non disponibile'}: la gara è da confermare.`);
    }
    return join(`Voto ${f2(p.rating)} · ${role}. Il migliore di una gara senza protagonisti.`, pf ? `Passaggi ${alp(pf.pct)}: margine di pulizia.` : '');
  }
  if (kind === 'assist') return join(`${p.assists} assist · voto ${f2(p.rating)}.`, pf ? `Passaggi ${alp(pf.pct)}, con ${pf.failed} errori da ridurre.` : '');
  if (kind === 'tackle') {
    const pct = p.tackleAttempts ? Math.round(p.tackles / p.tackleAttempts * 100) : 0;
    return `${p.tackles} contrasti riusciti su ${p.tackleAttempts} (${pct}%). Il dato EA non distingue il contrasto utile da quello di routine.`;
  }
  if (kind === 'pass') return join(`${p.passes}/${p.passAttempts} passaggi (${p.passPct}%). Almeno 10 tentativi per il premio.`,
    pf ? `È il migliore dei tentativi, ma per un ${pf.label} la precisione può crescere.` : 'La precisione non misura il rischio preso.');
  return '';
}
