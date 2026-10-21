import {ROLE_INFO, roleFor, reliabilityFor, posLabel, nightRoles, metricsForRole, OFF_METRIC_ROLES, PRO_POS_LABEL} from './metrics.mjs';

/* ---------------------------------------------------------------------------
 * Tono: da allenatore serio e onesto sui dati, ma equilibrato. Il commento indica
 * al massimo DUE aspetti da migliorare (i piu` rilevanti per gravita` e solidita`
 * del campione); gli altri restano solo come dati "agli atti". Scostamenti
 * borderline o campioni piccoli producono al piu` una nota lieve (`soft`).
 * Si giudica la prestazione, mai la persona, senza spiegare criteri o soglie.
 * ------------------------------------------------------------------------- */

const f1 = v => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(1));
const f2 = v => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(2));
const r0 = v => (v == null || !Number.isFinite(v) ? '—' : Math.round(v));
const hash = s => [...String(s || '')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const pick = (m, variants) => variants[hash(m.name) % variants.length];
const lcFirst = s => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/** Numero massimo di aspetti critici nel testo di accusa. */
export const MAX_CHARGES = 2;
/** Gravita` fino a cui un rilievo e` solo una nota lieve. */
export const SOFT_MAX = 4;

/* Ruolo e soglie: se il Pro e` stato costruito a mano (test) si ricava dal campo `position`. */
function roleOf(m) {
  const role = m.role || roleFor(m.playedPos || m.position, m.proPos);
  return {role, ...ROLE_INFO[role], label: m.roleLabel || ROLE_INFO[role].label};
}

/* Soglie di lavoro sul contributo offensivo (gol+assist a partita, stagionale), per ruolo. */
export const GA_MIN = {ATT: 0.8, TRQ: 0.5, MEZ_OFF: 0.5, ESTERNO: 0.4, CC: 0.3};

/* Aree che raccontano lo stesso concetto: nel testo se ne usa una sola. */
const CONCEPT = {pass2: 'pass', involve: 'pass', peers: 'rating', overall: 'rating', streak: 'output', context2: 'context', form: 'trend', consistency: 'trend', onoff: 'team', defense: 'team'};
const conceptOf = area => CONCEPT[area] || area;

function uniqueByArea(list, k) {
  const seen = new Set(), out = [];
  for (const x of list) { if (seen.has(x.area)) continue; seen.add(x.area); out.push(x); if (out.length >= k) break; }
  return out;
}
function uniqueByConcept(list, k) {
  const seen = new Set(), out = [];
  for (const x of list) { const c = conceptOf(x.area); if (seen.has(c)) continue; seen.add(c); out.push(x); if (out.length >= k) break; }
  return out;
}

/** Cosa lavorare, con articolo, in base all'area del primo rilievo (usato nei verdetti). */
const FOCUS = {
  pass: 'la pulizia nei passaggi', pass2: 'la pulizia nei passaggi', involve: 'la partecipazione alla manovra', tackle: 'l’efficacia nei contrasti',
  finish: 'la scelta della conclusione', output: 'l’incidenza in zona gol', streak: 'l’incidenza in zona gol', balance: 'il servizio ai compagni',
  consistency: 'la continuità', form: 'la continuità', context: 'il rendimento nelle gare più equilibrate', context2: 'il rendimento nelle gare più aperte',
  defense: 'la copertura davanti alla difesa', onoff: 'la continuità', rating: 'la continuità', peers: 'la continuità', overall: 'la continuità',
  discipline: 'la disciplina', gk: 'la posizione e le uscite',
};
function focusOf(R, items) {
  const list = items || [];
  const first = list.find(x => x.area !== 'rating' && x.area !== 'peers') || list[0];
  if (first && FOCUS[first.area]) return FOCUS[first.area];
  return R.group === 'cons' ? 'la solidità' : 'l’incidenza';
}

function negatives(m) {
  const n = [];
  const R = roleOf(m);
  const g = m.games || 0;
  const stable = (m.sample || 0) >= 6 && (m.ratedGames || 0) >= 6; // dettaglio per gara sufficiente
  const solid = g >= 10;
  // costanza, forma e contesto: critica netta solo con un numero adeguato di gare con voto
  const firm = stable && (m.ratedGames || 0) >= 8;
  if (g < 3) return n;
  // sev <= SOFT_MAX = nota lieve. Campione piccolo (< 10 presenze): mai oltre la nota lieve, salvo voto e disciplina.
  const add = (sev, area, text, proof, coach) => {
    const keep = area === 'rating' || area === 'discipline';
    const s = !solid && !keep ? Math.min(sev, SOFT_MAX) : sev;
    n.push({sev: s, soft: s <= SOFT_MAX, area, text, proof, coach: coach || ''});
  };
  const rl = R.label;
  const cons = R.group === 'cons';
  // Pro polivalente: le medie stagionali EA sono miste di ruoli, le accuse di ruolo nascono solo dal campione recente nel ruolo
  const mixed = !!m.mixed;
  const scope = mixed && m.roleScope ? m.roleScope : '';
  const roleN = m.roleSample || 0;
  const offN = m.offSample != null ? m.offSample : (m.sample || 0);
  const titolare = mixed ? 'titolare' : `${rl} titolare`;

  // --- Voto
  if (m.rating) {
    if (m.rating < 6.5) add(10, 'rating', pick(m, [
      `Media EA ${f2(m.rating)} in ${g} presenze: sotto il livello atteso per un ${titolare}, con ampio margine per risalire.`,
      `${f2(m.rating)} di media EA: stagione sotto le attese per un ${mixed ? 'titolare' : rl}, la strada è recuperare gara dopo gara.`]), `Media EA ${f2(m.rating)} in ${g} presenze`,
      `ripartire dai fondamentali e dalla continuità di rendimento (media EA ${f2(m.rating)})`);
    else if (m.rating < 7) add(6, 'rating', `Media EA ${f2(m.rating)}: rendimento da consolidare. ${mixed ? 'Per un titolare' : `Da ${rl}`} serve più continuità per incidere sulle partite.`, `Media EA ${f2(m.rating)}`,
      `costruire continuità partendo dai fondamentali (media EA ${f2(m.rating)})`);
    else if (m.rating < 7.5) add(4, 'rating', m.peers && !mixed && m.peers.ratingRank
      ? `Media EA ${f2(m.rating)}: ${m.peers.ratingRank}° su ${m.peers.n} del reparto (mediana ${f2(m.peers.medianRating)}). Rendimento nella norma per un ${rl}, con spazio per incidere di più.`
      : `Media EA ${f2(m.rating)} in ${g} presenze${mixed ? ' tra ruoli diversi' : ` da ${rl}`}: rendimento nella norma, con spazio per crescere${m.ratingVsClubMedian != null ? ` (${m.ratingVsClubMedian >= 0 ? '+' : ''}${f2(m.ratingVsClubMedian)} sulla mediana del club)` : ''}.`,
      m.peers && !mixed && m.peers.ratingRank ? `${m.peers.ratingRank}° su ${m.peers.n} pari reparto per media (${f2(m.rating)})` : `Media EA ${f2(m.rating)}`);
  }
  if (m.peers && !mixed && m.peers.ratingRank === m.peers.n && g >= 8) add(4, 'peers', `Ultimo dei ${m.peers.n} del reparto per media EA (${f2(m.rating)} contro mediana ${f2(m.peers.medianRating)}): il confronto interno indica margine di crescita.`, `Ultimo su ${m.peers.n} pari reparto per media (${f2(m.rating)}, mediana ${f2(m.peers.medianRating)})`,
    `avvicinarsi al livello del reparto con più continuità nei fondamentali (media EA ${f2(m.rating)}, mediana ${f2(m.peers.medianRating)})`);
  else if (m.ratingVsClubMedian != null && m.ratingVsClubMedian <= -0.4 && g >= 8) add(5, 'peers', `${f1(Math.abs(m.ratingVsClubMedian))} punti sotto la mediana dei titolari del club: c'è spazio per avvicinarsi al gruppo.`, `${f2(m.ratingVsClubMedian)} dalla mediana del club`,
    `avvicinarsi al livello del gruppo con più continuità nei fondamentali (${f2(m.ratingVsClubMedian)} dalla mediana del club)`);

  // --- Passaggi: parametro dipendente dal ruolo
  // polivalente: percentuale dal solo campione nel ruolo (almeno 3 gare e 30 passaggi); la media stagionale non vale per il ruolo
  const roleOk = mixed && roleN >= 3 && (m.rolePassAtt || 0) >= 30 && m.recentPassPct != null;
  const pp = mixed ? (roleOk ? m.recentPassPct : null) : m.passPct;
  if (pp != null) {
    const failed = mixed ? m.recentPassFailedPerGame : m.passFailedPerGame, att = mixed ? m.recentPassAttPerGame : m.passAttPerGame;
    const vol = (mixed ? ` ${scope}` : '') + (att != null ? ` su circa ${r0(att)} tentati a gara` : '');
    const proofP = `${r0(pp)}% passaggi${failed != null ? `, ~${f1(failed)} sbagliati a gara` : ''}`;
    const today = `oggi ${r0(pp)}%${failed != null ? `, ~${f1(failed)} errori a gara` : ''}`;
    const passSolid = mixed ? roleN >= 6 : solid;
    const gap = R.passMin - pp;
    if (cons && pp < R.passMin) {
      // vicino alla soglia (o campione corto): nota lieve, non accusa
      const soft = gap < 3 || (!passSolid && gap < 6);
      const coachByRole = {
        DIF: `appoggio sul compagno più vicino nella costruzione, senza lanci forzati (${today})`,
        MED: `primo passaggio dopo il recupero corto e sicuro, verso il centrocampista libero (${today})`,
        POR: `rimessa e rinvio sul compagno libero, evitando i lanci a caso (${today})`,
        CC: `uscita dal pressing con passaggi semplici e a un tocco (${today})`,
      };
      add(soft ? 3 : pp < 70 ? 10 : 8, 'pass', soft
        ? `Passaggi al ${r0(pp)}%${vol}: appena sotto il livello atteso per un ${rl}, un margine di pulizia da guadagnare.`
        : pick(m, [
          `Passaggi al ${r0(pp)}%${vol}: per un ${rl}, che gioca i passaggi più semplici del campo, la precisione può crescere.`,
          `${r0(pp)}% di passaggi riusciti ${mixed ? scope : `da ${rl}`}${failed != null ? `, ~${f1(failed)} errori a gara` : ''}: perde qualche pallone di troppo e qui c'è margine di miglioramento.`]), proofP, coachByRole[R.role] || coachByRole.CC);
    } else if (!cons && pp < R.passMin) {
      const soft = gap < 4 || (!passSolid && gap < 8);
      const coachOff = R.role === 'ATT'
        ? `scarico di prima su chi inserisce quando si riceve spalle alla porta, senza forzare il filtrante (${today})`
        : `nell’ultimo terzo scegliere il passaggio che mantiene il possesso (${today})`;
      add(soft ? 3 : R.role === 'ATT' ? 7 : 8, 'pass', soft
        ? `Passaggi al ${r0(pp)}%${vol}: in linea con le difficoltà del ruolo di ${rl}, con un piccolo margine di pulizia.`
        : `Passaggi al ${r0(pp)}%${vol}: anche tenendo conto delle difficoltà del ruolo di ${rl}, la precisione può migliorare.`, proofP, coachOff);
    } else if (cons && pp < 80 && att != null && att >= 25) {
      add(4, 'pass', `${r0(pp)}% di passaggi su ~${r0(att)} a gara: il volume c'è, la pulizia è nella norma per un ${rl} e può crescere ancora.`, `${r0(pp)}% su ~${r0(att)} passaggi a gara`,
        `scegliere meglio il compagno, per togliere un paio di passaggi sbagliati a gara sui ~${r0(att)} tentati (${today})`);
    }
    if (!mixed && m.recentPassPct != null && pp - m.recentPassPct >= 5 && (m.sample || 0) >= 6 && !(cons && pp < R.passMin)) add(5, 'pass2', `Precisione in calo: ${r0(m.recentPassPct)}% nelle ultime ${m.sample} gare contro ${r0(pp)}% di stagione.`, `Ultime ${m.sample} gare ${r0(m.recentPassPct)}% contro stagione ${r0(pp)}%`, `ritrovare la pulizia di inizio stagione (${r0(m.recentPassPct)}% nelle ultime ${m.sample} contro ${r0(pp)}%)`);
    if (m.worstPassPct != null && m.worstPassPct < (cons ? 60 : 50) && (mixed ? roleN >= 4 : (m.sample || 0) >= 6)) add(4, 'pass2', `Una serata complicata al passaggio: ${r0(m.worstPassPct)}% nella gara peggiore.`, `Peggior gara ${r0(m.worstPassPct)}% passaggi`);
  }
  const attInv = mixed ? (roleOk ? m.recentPassAttPerGame : null) : m.passAttPerGame;
  if (cons && (R.role === 'CC' || R.role === 'MED') && (mixed ? roleN >= 4 : g >= 8) && attInv != null && attInv < 20) add(4, 'involve', `Circa ${r0(attInv)} passaggi a gara${mixed ? ` ${scope}` : ''} per un ${rl}: può partecipare di più alla manovra.`, `~${r0(attInv)} passaggi tentati a gara`, `offrirsi di più al portatore per collegare i reparti (oggi ~${r0(attInv)} passaggi a gara)`);

  // --- Contrasti / filtro (solo ruoli di filtro, confrontati col club: il tasso EA e` basso per tutti)
  const tkOk = mixed ? roleN >= 4 && (m.roleTackAtt || 0) >= 12 : g >= 8;
  const tkPct = mixed ? m.recentTackPct : m.tackPct, tkAtt = mixed ? m.roleTackAttPerGame : m.tackAttPerGame, tkFail = mixed ? m.roleTackFailedPerGame : m.tackFailedPerGame;
  if ((R.role === 'CC' || R.role === 'MED' || R.role === 'DIF') && tkOk && tkPct != null && m.clubMedianTackPct != null && tkAtt >= 4 && tkPct <= m.clubMedianTackPct - 8) {
    // scarto netto (almeno 14 punti) su campione solido: rilievo pieno; altrimenti nota lieve
    const clear = tkPct <= m.clubMedianTackPct - 14 && (mixed ? roleN >= 6 : g >= 12);
    add(clear ? 5 : 3, 'tackle', clear
      ? `Contrasti riusciti${mixed ? ` ${scope}` : ''}: ${r0(tkPct)}% contro una mediana di club del ${r0(m.clubMedianTackPct)}%, con ${f1(tkAtt)} tentativi a gara: l'efficacia nel duello può crescere.`
      : `Contrasti riusciti${mixed ? ` ${scope}` : ''} al ${r0(tkPct)}%, un po' sotto la mediana di club (${r0(m.clubMedianTackPct)}%).`, `${r0(tkPct)}% contrasti (mediana club ${r0(m.clubMedianTackPct)}%), ${f1(tkFail)} falliti a gara`,
      `chiudere la linea di passaggio prima di entrare, con meno scivolate (${f1(tkFail)} contrasti falliti a gara)`);
  }
  if ((R.role === 'MED' || R.role === 'DIF') && tkOk && tkAtt != null && tkAtt < 2.5) add(3, 'tackle', `Circa ${f1(tkAtt)} contrasti tentati a gara${mixed ? ` ${scope}` : ''} per un ${rl}: il lavoro di filtro può essere più presente.`, `${f1(tkAtt)} contrasti tentati a gara`);

  // --- Fase offensiva
  // metriche offensive: mai su presenze da difensore, mediano o portiere (m.offSample le limita al ruolo offensivo/di centrocampo)
  const offRole = OFF_METRIC_ROLES.has(R.role);
  const sampleGoals = m.offGoals != null ? m.offGoals : m.goalsSample;
  if (offRole && m.shotsTotal >= 8 && m.conversionPct != null && m.conversionPct < 20) {
    const t = sampleGoals ? `${m.shotsTotal} tiri nelle ultime ${offN} gare${mixed ? ` ${scope}` : ''}, ${sampleGoals} gol: conversione ${r0(m.conversionPct)}%, ${f1(m.shotsPerGoal)} conclusioni per una rete. La finalizzazione può crescere.` : `${m.shotsTotal} tiri nelle ultime ${offN} gare${mixed ? ` ${scope}` : ''} senza segnare: la finalizzazione è da affinare.`;
    const clear = m.shotsTotal >= 12;
    add(clear ? (R.role === 'ATT' ? 7 : 6) : 3, 'finish', t, `${r0(m.conversionPct)}% conversione su ${m.shotsTotal} tiri`,
      `scegliere meglio la conclusione (${m.shotsTotal} tiri per ${sampleGoals || 0} gol), limitando il tiro dalla distanza o in pressione`);
  }
  if (R.role === 'ATT' && offN >= 6 && m.shotsPerGame != null && m.shotsPerGame < 2.5) add(4, 'finish', `${f1(m.shotsPerGame)} tiri a gara per un attaccante: la conclusione può essere cercata con più continuità.`, `${f1(m.shotsPerGame)} tiri a gara`, `attaccare l'area con più continuità (oggi ${f1(m.shotsPerGame)} tiri a gara)`);
  const gaMin = GA_MIN[R.role];
  if (mixed) {
    // media G+A stagionale mista di ruoli: si usa solo il campione recente nel ruolo offensivo
    if (gaMin && offRole && offN >= 6 && m.roleGaPerGame != null && m.roleGaPerGame < gaMin) add(m.roleGaPerGame >= gaMin * 0.85 ? 3 : 6, 'output', `Gol più assist: ${f2(m.roleGaPerGame)} a gara ${scope}: per un ${rl} il contributo offensivo può crescere.`, `${f2(m.roleGaPerGame)} G+A a gara ${scope}`);
  } else if (gaMin && g >= 8 && m.gaPerGame != null && m.gaPerGame < gaMin) {
    const near = m.gaPerGame >= gaMin * 0.85;
    add(near ? 3 : 6, 'output', near
      ? `Gol più assist: ${f2(m.gaPerGame)} a gara, di poco sotto il livello atteso per un ${rl}.`
      : pick(m, [
        `Gol più assist: ${f2(m.gaPerGame)} a gara. Per un ${rl} il contributo offensivo può crescere.`,
        `${m.goals} gol e ${m.assists} assist in ${g} gare (${f2(m.gaPerGame)} a gara): per il peso offensivo del ruolo c'è margine di crescita.`]), `${f2(m.gaPerGame)} G+A a gara`,
      `cercare più presenza tra le linee e inserimenti senza palla (${m.goals} gol e ${m.assists} assist in ${g} gare)`);
  }
  if (R.group === 'off' && offRole && m.dryStreak >= 3) add(m.dryStreak >= 5 ? 5 : 3, 'streak', `${m.dryStreak} gare consecutive senza gol né assist${mixed ? ` ${scope}` : ''}: un periodo da sbloccare.`, `${m.dryStreak} gare a secco`,
    `sbloccarsi con inserimenti e conclusioni più frequenti (${m.dryStreak} gare senza gol né assist)`);
  if (R.group === 'off' && offRole && m.blankShare != null && m.blankShare >= 60 && offN >= 6) add(m.blankShare >= 70 && offN >= 8 ? 5 : 3, 'streak', `Nel ${r0(m.blankShare)}% delle ultime ${offN} gare${mixed ? ` ${scope}` : ''} non arrivano né gol né assist.`, `${r0(m.blankShare)}% gare senza G/A`,
    `cercare più inserimenti e conclusioni (${r0(m.blankShare)}% delle ultime ${offN} gare senza G/A)`);
  if (R.role === 'ATT' && !mixed && g >= 15 && m.assistsPerGame != null && m.assistsPerGame < 0.15) add(3, 'balance', `${m.assists} assist in ${g} gare: il contributo è soprattutto sotto porta, c'è margine nel servire i compagni.`, `${m.assists} assist in ${g} gare`, `quando la difesa si chiude sul tiro, cercare anche l'ultimo passaggio (${m.assists} assist in ${g} gare)`);

  // --- Costanza e forma
  if (firm && m.ratingStd != null && m.ratingStd >= 0.8) add(m.ratingStd >= 1.0 ? 5 : 3, 'consistency', `Rendimento un po' discontinuo: deviazione ${f2(m.ratingStd)} sul voto, tra ${f1(m.ratingMin)} e ${f1(m.ratingMax)} nelle gare con almeno 45'.`, `Voto tra ${f1(m.ratingMin)} e ${f1(m.ratingMax)}, dev. ${f2(m.ratingStd)}`,
    `rendere più regolare il livello da gara a gara (voti tra ${f1(m.ratingMin)} e ${f1(m.ratingMax)})`);
  if (firm && m.below65Share != null && m.below65Share >= 25) add(m.below65Share >= 35 ? 6 : 4, 'consistency', `${m.below65} partite su ${m.ratedGames} chiuse con un voto sotto il livello atteso: da ridurre con più continuità.`, `${m.below65}/${m.ratedGames} gare sotto il livello atteso`,
    `ridurre le serate sotto tono con più continuità (${m.below65} su ${m.ratedGames} gare)`);
  if (firm && m.form5 != null && m.formBefore != null && m.form5 <= m.formBefore - 0.4) add(m.form5 <= m.formBefore - 0.6 ? 6 : 4, 'form', `Forma in calo: ${f2(m.form5)} nelle ultime 5 contro ${f2(m.formBefore)} prima.`, `Ultime 5: ${f2(m.form5)} contro ${f2(m.formBefore)}`,
    `ritrovare il livello di inizio stagione (${f2(m.form5)} nelle ultime 5 contro ${f2(m.formBefore)} prima)`);
  else if (firm && m.formVsSeason != null && m.formVsSeason <= -0.5) add(5, 'form', `Ultime 5 gare a ${f2(m.form5)}, sotto il proprio livello di stagione (${f2(m.rating)}).`, `Ultime 5: ${f2(m.form5)} contro stagione ${f2(m.rating)}`);
  else if (firm && m.trend != null && m.trend < -0.1) add(3, 'form', `La curva dei voti scende di ${f2(Math.abs(m.trend))} a partita nelle ultime ${m.ratedGames} gare.`, `Pendenza voti ${f2(m.trend)}`);

  // --- Contesto partita
  if (firm && m.nWins >= 3 && m.nNotWin >= 3 && m.ratingNotWin != null && m.ratingInWins != null && m.ratingNotWin <= m.ratingInWins - 0.7) add(m.ratingNotWin <= m.ratingInWins - 1.0 ? 5 : 4, 'context', `Rende di più quando la squadra vince: ${f2(m.ratingNotWin)} in ${m.nNotWin} gare senza vittoria contro ${f2(m.ratingInWins)} in ${m.nWins} vittorie.`, `Voto ${f2(m.ratingNotWin)} senza vittoria (${m.nNotWin}), ${f2(m.ratingInWins)} con vittoria (${m.nWins})`,
    `prendersi qualche responsabilità in più nelle gare bloccate (${f2(m.ratingNotWin)} di voto senza vittoria, ${f2(m.ratingInWins)} nelle vittorie)`);
  else if (firm && m.nBigWin >= 2 && m.nClose >= 3 && m.ratingBigWin != null && m.ratingClose != null && m.ratingBigWin - m.ratingClose >= 0.8) add(m.ratingBigWin - m.ratingClose >= 1.1 ? 5 : 4, 'context', `Rende di più quando la partita è già decisa: ${f2(m.ratingBigWin)} nelle vittorie larghe (${m.nBigWin}) contro ${f2(m.ratingClose)} nelle gare in bilico (${m.nClose}).`, `Voto ${f2(m.ratingBigWin)} in vittorie larghe, ${f2(m.ratingClose)} nelle gare in bilico`,
    `mantenere lo stesso livello quando il risultato è in bilico (${f2(m.ratingClose)} nelle ${m.nClose} gare decise da un gol, ${f2(m.ratingBigWin)} nelle vittorie larghe)`);
  if (firm && cons && !mixed && m.nLeaky >= 3 && m.ratingLeaky != null && m.ratingMean != null && m.ratingLeaky <= m.ratingMean - 0.5) add(4, 'context2', `Nelle ${m.nLeaky} gare con 3 o più gol subiti il voto scende a ${f2(m.ratingLeaky)} contro ${f2(m.ratingMean)} di media: quando la gara si apre c'è da stringere.`, `Voto ${f2(m.ratingLeaky)} nelle ${m.nLeaky} gare con 3+ gol subiti`);

  // --- Rendimento di squadra col Pro in campo (correlazione, non causa)
  if (m.nOff >= 3 && m.nOn >= 6 && m.concededPerGameOn != null && m.concededPerGameOff != null && m.concededPerGameOn >= m.concededPerGameOff + 0.7)
    add(cons && !mixed ? 7 : 3, 'defense', `Con lui in campo il club subisce ${f2(m.concededPerGameOn)} gol a gara contro ${f2(m.concededPerGameOff)} nelle ${m.nOff} gare senza di lui.`, `Gol subiti ${f2(m.concededPerGameOn)} a gara con lui, ${f2(m.concededPerGameOff)} senza (${m.nOff} gare)`,
      cons && !mixed ? `curare la copertura davanti alla linea (${f2(m.concededPerGameOn)} gol subiti a gara con lui in campo, ${f2(m.concededPerGameOff)} senza)` : '');
  if (m.nOff >= 3 && m.nOn >= 6 && m.pointsPerGame != null && m.pointsPerGameOff != null && m.pointsPerGame <= m.pointsPerGameOff - 0.7) add(5, 'onoff', `Il club fa ${f2(m.pointsPerGame)} punti a gara con lui e ${f2(m.pointsPerGameOff)} senza (${m.nOff} gare).`, `Punti a gara ${f2(m.pointsPerGame)} con, ${f2(m.pointsPerGameOff)} senza`);

  // --- Avatar vs rendimento, disciplina, portieri
  if (m.ratingVsOverall != null && m.ratingVsOverall <= -1.2 && g >= 8) add(5, 'overall', `Overall ${m.overall}, rendimento ${f2(m.rating)}: finora il rendimento resta sotto quanto l'avatar farebbe pensare.`, `Overall ${m.overall} contro media ${f2(m.rating)}`);
  if (m.redCards >= 1) add(m.redCards >= 2 ? 9 : 8, 'discipline', `${m.redCards} ${m.redCards === 1 ? 'espulsione' : 'espulsioni'} in ${g} presenze: la disciplina è un aspetto da curare.`, `${m.redCards} ${m.redCards === 1 ? 'rosso' : 'rossi'} in ${g} gare`, `evitare gli interventi in ritardo (${m.redCards} ${m.redCards === 1 ? 'rosso' : 'rossi'} in ${g} gare)`);
  if (R.role === 'POR' && m.savePct != null && m.savesTotal > 0 && m.savePct < 65) add(7, 'gk', `Parate sul ${r0(m.savePct)}% dei tiri nello specchio: tra i pali c'è margine per crescere.`, `${r0(m.savePct)}% parate (${m.savesTotal})`, `curare la posizione sul primo palo e le uscite (${r0(m.savePct)}% di parate)`);
  return n.sort((a, b) => b.sev - a.sev);
}

function positives(m) {
  const p = [];
  const add = (sev, area, text, proof) => p.push({sev, area, text, proof});
  const R = roleOf(m);
  const g = m.games || 0;
  const stable = (m.sample || 0) >= 6;
  const mixed = !!m.mixed;
  if (m.rating > 8) add(9, 'rating', `Media EA ${f2(m.rating)} su ${g} presenze${mixed ? ' tra ruoli diversi' : ` da ${R.label}`}: rendimento da riferimento tecnico del club, non un exploit.`, `Media EA ${f2(m.rating)} in ${g} presenze`);
  if (m.peers && !mixed && m.peers.ratingRank === 1) add(6, 'peers', `Primo dei ${m.peers.n} del reparto per media EA (mediana ${f2(m.peers.medianRating)}).`, `1° su ${m.peers.n} pari reparto per media`);
  if (m.gaPerGame != null && m.gaPerGame >= 1.2) add(8, 'output', `${f2(m.gaPerGame)} tra gol e assist a gara (${m.goals} reti, ${m.assists} assist): incide su più di una rete a partita.`, `${f2(m.gaPerGame)} G+A a gara`);
  if (m.shareOfClubGA != null && m.shareOfClubGA >= 30) add(7, 'share', `Pesa il ${r0(m.shareOfClubGA)}% dei gol del club tra reti e assist.`, `${r0(m.shareOfClubGA)}% G+A del club`);
  const rOk = mixed ? (m.roleSample || 0) >= 3 && (m.rolePassAtt || 0) >= 30 && m.recentPassPct != null : m.passPct != null;
  const ppos = mixed ? m.recentPassPct : m.passPct, attpos = mixed ? m.recentPassAttPerGame : m.passAttPerGame, where = mixed ? ` ${m.roleScope}` : '';
  if (rOk) {
    if (R.group === 'cons' && ppos >= 85 && attpos >= 25) add(8, 'pass', `${r0(ppos)}% di passaggi${where} con ~${r0(attpos)} tentativi a gara: per un ${R.label} volume e pulizia insieme sono rari.`, `${r0(ppos)}% su ~${r0(attpos)} a gara`);
    else if (R.group === 'off' && ppos >= 82 && attpos >= 18) add(7, 'pass', `${r0(ppos)}% di passaggi da ${R.label}${mixed ? ` (${m.roleScope})` : ''}, un ruolo che rischia più degli altri: buona qualità in zone strette.`, `${r0(ppos)}% passaggi da ${R.label}`);
  }
  if (m.motmRate >= 20) add(6, 'mom', `${m.motm} premi uomo partita in ${g} gare (${r0(m.motmRate)}%).`, `${m.motm} MVP in ${g} gare`);
  if (stable && m.ratingStd != null && m.ratingStd <= 0.6 && (m.ratedGames || 0) >= 6) add(5, 'consistency', `Costanza: deviazione ${f2(m.ratingStd)} sul voto, peggior gara a ${f1(m.ratingMin)}.`, `Deviazione voti ${f2(m.ratingStd)}, minimo ${f1(m.ratingMin)}`);
  if (m.above8 != null && (m.ratedGames || 0) >= 6 && m.above8 / m.ratedGames >= 0.5) add(5, 'consistency', `${m.above8} gare su ${m.ratedGames} a 8 o più.`, `${m.above8}/${m.ratedGames} gare da 8+`);
  if (stable && m.nClose >= 4 && m.ratingClose != null && m.ratingClose >= 7.5) add(5, 'context', `Regge nelle gare in bilico: ${f2(m.ratingClose)} di media in ${m.nClose} gare decise da un gol o pari.`, `Voto ${f2(m.ratingClose)} in ${m.nClose} gare in bilico`);
  if (m.nOff >= 3 && m.nOn >= 6 && m.concededPerGameOn != null && m.concededPerGameOff != null && m.concededPerGameOn <= m.concededPerGameOff - 0.4) add(5, 'defense', `Con lui in campo il club subisce ${f2(m.concededPerGameOn)} gol a gara, ${f2(m.concededPerGameOff)} senza (${m.nOff} gare).`, `Gol subiti ${f2(m.concededPerGameOn)} con, ${f2(m.concededPerGameOff)} senza`);
  if (stable && m.formVsSeason != null && m.formVsSeason >= 0.4) add(5, 'form', `In crescita: ${f2(m.form5)} nelle ultime 5 contro ${f2(m.rating)} di media stagionale.`, `Ultime 5: ${f2(m.form5)}`);
  if (OFF_METRIC_ROLES.has(R.role) && m.conversionPct >= 35 && m.shotsTotal >= 8) add(6, 'finish', `Conversione al ${r0(m.conversionPct)}% su ${m.shotsTotal} tiri${mixed ? ` ${m.roleScope}` : ''}: cinico sotto porta.`, `${r0(m.conversionPct)}% conversione su ${m.shotsTotal} tiri`);
  return p.sort((a, b) => b.sev - a.sev);
}

/* L'aspetto con piu` margine quando l'elenco dei rilievi e` vuoto (anche i migliori ne hanno uno). */
function weakestSpot(m) {
  const R = roleOf(m);
  const c = [];
  const mixed = !!m.mixed;
  if (m.ratingMin != null && m.ratedGames >= 4) c.push({text: `Il margine di crescita è nella continuità: nella gara peggiore il voto è sceso a ${f1(m.ratingMin)}.`, proof: `Peggior gara ${f1(m.ratingMin)}`, coach: `ridurre i cali di rendimento (peggiore gara recente a ${f1(m.ratingMin)}, contro una media di ${f2(m.rating)})`});
  if (!mixed && m.passFailedPerGame != null) c.push({text: R.group === 'off'
      ? `Nessuna lacuna evidente nei numeri; il margine di lavoro è nel palleggio: ${r0(m.passPct)}% (~${f1(m.passFailedPerGame)} errori a gara), nella norma per un ${R.label} e migliorabile.`
      : `Il margine tecnico è nella pulizia del palleggio: ~${f1(m.passFailedPerGame)} passaggi sbagliati a gara (${r0(m.passPct)}% di precisione).`, proof: `~${f1(m.passFailedPerGame)} passaggi sbagliati a gara`,
    coach: R.group === 'off' ? `perdere meno palloni in zona avanzata (${r0(m.passPct)}% al passaggio, ~${f1(m.passFailedPerGame)} errori a gara)` : `togliere qualche passaggio sbagliato a gara (oggi ~${f1(m.passFailedPerGame)}, con ${r0(m.passPct)}% di precisione)`});
  if (!mixed && m.tackPct != null) c.push({text: `Il fondamentale con più margine è il contrasto: riuscito al ${r0(m.tackPct)}%.`, proof: `${r0(m.tackPct)}% contrasti`, coach: `lavorare sul tempo di intervento (contrasti riusciti al ${r0(m.tackPct)}%)`});
  c.push({text: `Il margine di crescita è nella fase che i numeri EA non mostrano, perché passaggi progressivi e posizione media non sono disponibili.`, proof: `Dati EA assenti: passaggi progressivi, posizione`, coach: mixed ? `verificare a video il lavoro senza palla ${m.roleScope || 'nel ruolo attuale'}: i dati EA non lo misurano` : `verificare a video il lavoro senza palla del ${R.label}: i dati EA non lo misurano`});
  return c[0];
}

function caveatsFor(m) {
  const c = [];
  const g = m.games || 0;
  if (g < 3) c.push(g === 0 ? 'Nessuna presenza: nessun giudizio tecnico.' : `Solo ${g} ${g === 1 ? 'presenza' : 'presenze'}: nessun giudizio tecnico.`);
  else if (g < 10) c.push(`Campione ridotto (${g} presenze): lettura provvisoria.`);
  if (g >= 3 && (m.sample || 0) < 6) c.push((m.sample || 0) === 0 ? 'Nessuna gara nello storico dettagliato: costanza, forma e contesto-gara non valutati.' : `Dettaglio per gara su ${m.sample} sole partite: costanza, forma e contesto-gara non valutati.`);
  if (m.cameos > 0) c.push(`${m.cameos} ${m.cameos === 1 ? 'presenza' : 'presenze'} sotto i 45' escluse dalle metriche di costanza e contesto.`);
  if (m.roleInferred && g >= 1) c.push('Ruolo dedotto dal codice avatar (nessuna gara nello storico dettagliato).');
  if (m.mixed) c.push(`Ruoli diversi nelle ultime gare (${(m.roleMix || []).map(x => `${x.n} da ${x.label}`).join(', ')}): le medie EA di stagione sono miste di ruoli e i giudizi di ruolo nascono solo dalle gare ${m.roleScope || 'nel ruolo attuale'}.`);
  else if (m.roleMismatch) c.push(`Schierato da ${m.playedPos} ma avatar ${m.position}${m.proPosLabel ? ` (${m.proPosLabel})` : ''}: valutato come ${m.roleLabel || roleOf(m).label}.`);
  if (m.rating && m.rating < 7 && m.nOff >= 3 && m.nOn >= 6 && m.pointsPerGame != null && m.pointsPerGameOff != null && m.pointsPerGame >= m.pointsPerGameOff + 0.5)
    c.push(`Attenuante di contesto: il club fa ${f2(m.pointsPerGame)} punti a gara con lui e ${f2(m.pointsPerGameOff)} senza (${m.nOff} gare); correlazione su campione piccolo, non cancella il dato tecnico.`);
  return c;
}

/** Nota di coach: una frase concreta e propositiva su cosa fare nelle prossime gare. */
function coachSentence(core, elite) {
  const c = String(core || '').trim().replace(/[.\s]+$/, '');
  return elite ? `Per restare a questo livello, nelle prossime gare: ${lcFirst(c)}.` : `Nelle prossime gare: ${lcFirst(c)}.`;
}

/** Sceglie gli aspetti da citare nel testo: al massimo MAX_CHARGES rilievi netti; se non ce ne sono, una sola nota lieve. */
function pickCharges(list) {
  const hard = uniqueByConcept(list.filter(x => !x.soft), MAX_CHARGES);
  if (hard.length) return hard;
  // la nota lieve preferita e` un aspetto concreto, non la sola descrizione della media
  const soft = list.filter(x => x.soft);
  return uniqueByConcept([...soft.filter(x => x.area !== 'rating'), ...soft.filter(x => x.area === 'rating')], 1);
}

export function commentFor(m) {
  const R = roleOf(m);
  const g = m.games || 0;
  const caveats = caveatsFor(m);
  const confidence = m.reliability || reliabilityFor(g);
  if (g < 3 || !m.rating) {
    return {
      tier: 'campione_insufficiente', praise: null,
      charge: g === 0 ? 'Nessuna presenza nelle statistiche EA: nulla da valutare.' : `Solo ${g} ${g === 1 ? 'presenza' : 'presenze'} nelle statistiche EA${m.rating ? ` (media ${f2(m.rating)})` : ''}: campione troppo breve per un giudizio tecnico.`,
      proof: [`${g} ${g === 1 ? 'presenza' : 'presenze'}, media EA ${m.rating ? f2(m.rating) : 'non disponibile'}`],
      verdict: 'Nessun verdetto: servono almeno 3 presenze, meglio 10, prima di valutarlo.',
      negatives: [], positives: [], chargeItems: [], coachNote: `Nessuna istruzione tattica: ${g === 0 ? 'zero presenze' : g + (g === 1 ? ' presenza' : ' presenze')} non bastano a distinguere un limite dal caso. Si rivaluta dopo altre gare da ${R.label}.`,
      confidence, role: R.role, caveats,
    };
  }
  const neg = negatives(m), pos = positives(m);
  const elite = m.rating > 8;
  const uniq = uniqueByArea(neg, 6);
  let chargeItems, charge, proofs;
  if (elite) {
    // media alta: un solo aspetto da curare (il piu` rilevante), altrimenti il margine piu` ampio
    const top = neg[0];
    const limit = top || weakestSpot(m);
    chargeItems = top ? [top] : [];
    charge = limit.text;
    proofs = [...pos.slice(0, 2).map(x => x.proof), ...uniq.slice(0, 2).map(x => x.proof)];
    if (!uniq.length) proofs.push(limit.proof);
  } else {
    chargeItems = pickCharges(neg);
    // senza alcun rilievo si indica comunque il margine piu` ampio, in forma di nota
    const extra = chargeItems.length ? null : weakestSpot(m);
    charge = (chargeItems.length ? chargeItems.map(x => x.text) : [extra.text]).join(' ');
    proofs = [...uniq.slice(0, 4).map(x => x.proof), ...(extra ? [extra.proof] : [])];
  }
  const praise = elite && pos.length ? uniqueByArea(pos, 2).map(x => x.text).join(' ') : null;

  // coachNote: una frase concreta sul rilievo principale che ha un'indicazione tattica
  const coachable = chargeItems.find(x => x.coach && x.area !== 'rating') || chargeItems.find(x => x.coach) || uniq.find(x => x.coach);
  const coachNote0 = coachSentence((coachable || weakestSpot(m)).coach || weakestSpot(m).coach, elite);
  const coachNote = confidence === 'ridotta' ? `${coachNote0} (Indicazione provvisoria su ${g} presenze.)` : coachNote0;

  // verdetto: 5 gradazioni sobrie, sempre con l'indicazione di cosa migliorare
  const np = focusOf(R, chargeItems.length ? chargeItems : uniq);
  const r = f2(m.rating);
  let verdict;
  if (m.rating < 6.5) verdict = `Stagione sotto le attese (${r}): il punto di partenza è ${np}, con margine per risalire.`;
  else if (m.rating < 7) verdict = `Da migliorare (${r}): il punto di partenza è ${np}.`;
  else if (m.rating < 7.5) verdict = `Nella media (${r}): contributo utile, il margine di crescita riguarda ${np}.`;
  else if (m.rating <= 8) verdict = `Buono (${r}): rendimento solido, il passo successivo è ${np}.`;
  else verdict = `Livello alto (${r}): da confermare gara dopo gara, il lavoro riguarda ${np}.`;
  if (confidence === 'ridotta') verdict += ` Lettura provvisoria: ${g} presenze.`;

  const tier = m.rating > 8 ? 'elite' : m.rating >= 7.5 ? 'buono' : m.rating >= 7 ? 'medio' : m.rating >= 6.5 ? 'rimandato' : 'bocciato';
  return {tier, praise, charge, proof: proofs, verdict, negatives: neg, positives: pos, chargeItems, coachNote, confidence, role: R.role, caveats};
}

/* ---------------------------------------------------------------------------
 * Fascicolo di serata: il Pro e` giudicato per il ruolo (o i ruoli) giocato in quella
 * serata, con le attese di quel ruolo. `nightApps` = presenze della serata normalizzate
 * (`appearancesFor(gareDellaSerata, nome)`). Chi gioca da difensore/mediano non viene mai
 * giudicato per gol e incisivita`; le medie EA di stagione (miste di ruoli) restano solo
 * come cornice del voto.
 * ------------------------------------------------------------------------- */
const gare = n => `${n} ${n === 1 ? 'gara' : 'gare'}`;
const listIt = a => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} e ${a[a.length - 1]}`);
const mean0 = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const joinText = (...parts) => parts.map(p => (p ? String(p).trim() : '')).filter(Boolean).join(' ');

function nightItems(m, pos, pa, multiple, offensiveOk) {
  const role = roleFor(pos, m.proPos), info = ROLE_INFO[role], label = posLabel(pos, m.proPos);
  const out = [];
  const n = pa.length;
  const ctx = multiple ? `da ${label} in ${gare(n)}` : `da ${label} in serata`;
  const add = (sev, area, text, proof, coach) => out.push({sev, soft: sev <= SOFT_MAX, area, text, proof, coach: coach || '', role, label, n});
  const passAtt = pa.reduce((s, x) => s + x.passAtt, 0), passOk = pa.reduce((s, x) => s + x.passOk, 0);
  const pp = passAtt ? Math.round(passOk / passAtt * 100) : null;
  if (passAtt >= 15 && pp < info.passMin) {
    // vicino alla soglia o poche giocate: solo una nota lieve
    const gap = info.passMin - pp, soft = gap < 4 || passAtt < 20;
    add(soft ? 3 : info.group === 'cons' ? 8 : 6, 'pass', soft
      ? `Passaggi al ${pp}% ${ctx} (${passAtt - passOk} sbagliati su ${passAtt}): poco sotto il livello atteso per questo ruolo.`
      : `Passaggi al ${pp}% ${ctx} (${passAtt - passOk} sbagliati su ${passAtt}): per questo ruolo la precisione può crescere.`, `${pp}% passaggi ${ctx}`,
    info.group === 'cons' ? `primo passaggio sicuro da ${label}: appoggio corto, senza verticali forzate (${pp}% in serata)` : `nell’ultimo terzo scegliere il passaggio che tiene il possesso (${pp}% in serata)`);
  }
  const tkAtt = pa.reduce((s, x) => s + x.tackAtt, 0), tkOk = pa.reduce((s, x) => s + x.tackOk, 0);
  if (tkAtt >= 4 && tkOk / tkAtt < 0.5) add(tkAtt >= 8 && info.group === 'cons' ? 6 : 3, 'tackle', `${tkOk} contrasti riusciti su ${tkAtt} ${ctx}: l'efficacia nel duello può crescere.`, `${tkOk}/${tkAtt} contrasti ${ctx}`, `chiudere la linea di passaggio prima di entrare, con meno scivolate (${tkOk}/${tkAtt} in serata)`);
  if (info.group === 'cons' && n >= 2) {
    const conc = mean0(pa.map(x => x.ga)), cs = pa.filter(x => x.ga === 0).length;
    if (conc >= 3) add(n >= 3 ? 7 : 3, 'defense', `Con lui in campo ${ctx} il club ha subito ${f1(conc)} gol a gara (${n} gare, ${cs} a porta inviolata).`, `${f1(conc)} gol subiti a gara con lui ${ctx}, ${cs} porte inviolate su ${n}`, `curare la copertura davanti alla linea (${f1(conc)} gol subiti a gara con lui in campo in serata)`);
  }
  const rated = pa.map(x => x.rating).filter(Boolean);
  const rm = mean0(rated);
  if (rated.length && rm < 6.5) add(8, 'rating', `Voto medio ${f2(rm)} ${ctx}: serata sotto le attese.`, `Voto medio ${f2(rm)} ${ctx}`, `ripartire dai fondamentali: voto medio ${f2(rm)} in serata`);
  if (rated.length >= 3 && Math.max(...rated) - Math.min(...rated) >= 1.5) add(3, 'consistency', `Voti tra ${f1(Math.min(...rated))} e ${f1(Math.max(...rated))} ${ctx}: serata discontinua.`, `Voti tra ${f1(Math.min(...rated))} e ${f1(Math.max(...rated))} ${ctx}`, `tenere un livello più regolare da una gara all'altra (voti tra ${f1(Math.min(...rated))} e ${f1(Math.max(...rated))})`);
  const reds = pa.reduce((s, x) => s + (x.red || 0), 0);
  if (reds) add(9, 'discipline', `${reds} ${reds === 1 ? 'espulsione' : 'espulsioni'} ${ctx}: la squadra ha giocato in inferiorità.`, `${reds} rossi ${ctx}`);
  // gol e incisivita`: solo per i ruoli offensivi (mai per difensore, mediano, portiere)
  if (offensiveOk && ['ATT', 'TRQ', 'MEZ_OFF', 'ESTERNO'].includes(role)) {
    const shots = pa.reduce((s, x) => s + x.shots, 0), goals = pa.reduce((s, x) => s + x.goals, 0), ga = goals + pa.reduce((s, x) => s + x.assists, 0);
    if (shots >= 3 && goals / shots < 0.3) add(shots >= 5 ? 5 : 3, 'finish', `${goals} gol su ${shots} tiri ${ctx}: la conclusione può essere più precisa.`, `${goals} gol su ${shots} tiri ${ctx}`, `scegliere meglio il momento della conclusione (${goals} gol su ${shots} tiri in serata)`);
    if (n >= 3 && !ga) add(n >= 4 ? 5 : 3, 'streak', `Nessun gol né assist nelle ${gare(n)} ${ctx}.`, `${n} gare senza G/A ${ctx}`, `cercare più inserimenti e conclusioni (${n} gare senza G/A in serata)`);
  }
  const facts = [`${gare(n)} da ${label}`];
  if (passAtt) facts.push(`passaggi ${pp}% (${passOk}/${passAtt})`);
  if (tkAtt) facts.push(`contrasti ${tkOk}/${tkAtt}`);
  if (rm != null) facts.push(`voto medio ${f2(rm)}`);
  if (info.group === 'cons') { const cs = pa.filter(x => x.ga === 0).length; facts.push(`${f1(mean0(pa.map(x => x.ga)))} gol subiti a gara con lui in campo, ${cs} ${cs === 1 ? 'porta inviolata' : 'porte inviolate'}`); }
  return {items: out, fact: facts.join(', '), role, label, n};
}

export function commentForNight(m, nightApps) {
  const apps = (nightApps || []).filter(Boolean);
  if (!m) return null;
  if (!apps.length) return commentFor(m);
  const nr = nightRoles(m, apps);
  const upTo = Math.max(...apps.map(x => x.timestamp || 0));
  const mm = metricsForRole(m, nr.primary, upTo || undefined);
  const base = commentFor(mm);
  const nightRole = {pos: nr.primary, label: nr.label, mix: nr.mix, habitual: nr.habitual, habitualLabel: nr.habitualLabel, changed: nr.changed, multiple: nr.multiple};
  const nightRoleText = nr.multiple
    ? `serata tra ${listIt(nr.mix.map(x => x.label))}`
    : nr.changed ? `serata da ${nr.label}` : '';
  if (base.tier === 'campione_insufficiente') return {...base, nightRole, nightRoleText, nightMetrics: mm};

  // gol e incisivita` si giudicano solo se il ruolo prevalente della serata e` offensivo, e solo sulle gare in quel ruolo
  const offensiveNight = ['ATT', 'TRQ', 'MEZ_OFF', 'ESTERNO'].includes(roleFor(nr.primary, m.proPos));
  const groups = nr.mix.map(x => nightItems(mm, x.pos, apps.filter(a => a.pos === x.pos), nr.multiple, offensiveNight && (x.pos === nr.primary || x.n >= 2)));
  const items = groups.flatMap(g => g.items).sort((a, b) => b.sev - a.sev);
  const worthy = new Set(['pass', 'tackle', 'defense', 'rating']);
  let lead = '';
  if (nr.multiple) lead = `In serata ha cambiato ruolo: ${listIt(nr.mix.map(x => `${gare(x.n)} da ${x.label}`))}${nr.habitualLabel ? ` (ruolo abituale: ${nr.habitualLabel})` : ''}.`;
  else if (nr.changed) lead = `In serata ha giocato da ${nr.label} (${gare(nr.mix[0].n)}), non nel suo ruolo abituale da ${nr.habitualLabel}.`;
  const pc = Number(m.proPos);
  if (nr.primary === 'defender' && m.proPos != null && m.proPos !== '' && pc >= 9 && pc <= 19 && items.some(x => x.role === 'DIF' && worthy.has(x.area)))
    lead = joinText(lead, `Adattato da difensore con un avatar da centrocampista (${PRO_POS_LABEL[pc]}): in serata i dati di ruolo vanno letti con cautela.`);

  // al massimo due aspetti da migliorare, tra serata e stagione, ciascuno per un concetto diverso (la serata ha la precedenza)
  const nightFirst = [...items.map(x => ({...x, src: 'night'})), ...base.negatives.map(x => ({...x, src: 'season'}))];
  const ranked = nightFirst.sort((a, b) => b.sev - a.sev);
  let chargeItems;
  if (base.tier === 'elite') {
    const top = items.find(x => !x.soft);
    chargeItems = top ? [top] : (base.chargeItems || []).slice(0, 1);
  } else {
    chargeItems = pickCharges(ranked);
  }
  const charge = joinText(lead, chargeItems.length ? chargeItems.map(x => x.text).join(' ') : base.charge);
  // agli atti: dati della serata e delle aree non citate, in forma neutra
  const seen = new Set();
  const proof = [...groups.map(g => `Serata: ${g.fact}`), ...chargeItems.map(x => x.proof), ...base.proof.slice(0, 2)].filter(p => p && !seen.has(p) && seen.add(p));
  const coachable = chargeItems.find(x => x.coach && x.area !== 'rating') || chargeItems.find(x => x.coach);
  const elite = base.tier === 'elite';
  const coachNote = coachable ? coachSentence(coachable.coach, elite) : base.coachNote;
  return {...base, charge: charge.trim(), proof, chargeItems, coachNote, nightRole, nightRoleText, nightMetrics: mm, nightItems: items};
}
