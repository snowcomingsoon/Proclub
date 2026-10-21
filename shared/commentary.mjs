import {ROLE_INFO, roleFor, reliabilityFor, posLabel, nightRoles, metricsForRole, OFF_METRIC_ROLES, PRO_POS_LABEL} from './metrics.mjs';

const f1 = v => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(1));
const f2 = v => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(2));
const r0 = v => (v == null || !Number.isFinite(v) ? '—' : Math.round(v));
const hash = s => [...String(s || '')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const pick = (m, variants) => variants[hash(m.name) % variants.length];

/* Ruolo e soglie: se il Pro e` stato costruito a mano (test) si ricava dal campo `position`. */
function roleOf(m) {
  const role = m.role || roleFor(m.playedPos || m.position, m.proPos);
  return {role, ...ROLE_INFO[role], label: m.roleLabel || ROLE_INFO[role].label};
}

/* Soglie di lavoro sul contributo offensivo (gol+assist a partita, stagionale), per ruolo. */
export const GA_MIN = {ATT: 0.8, TRQ: 0.5, MEZ_OFF: 0.5, ESTERNO: 0.4, CC: 0.3};

function negatives(m) {
  const n = [];
  const add = (sev, area, text, proof, coach) => n.push({sev, area, text, proof, coach: coach || ''});
  const R = roleOf(m);
  const g = m.games || 0;
  const stable = (m.sample || 0) >= 6 && (m.ratedGames || 0) >= 6; // dettaglio per gara sufficiente
  const solid = g >= 10;
  if (g < 3) return n;
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
      `Media EA ${f2(m.rating)} in ${g} presenze: insufficiente. Per un ${titolare} è un rendimento sotto il minimo accettabile.`,
      `${f2(m.rating)} di media EA: bocciatura netta. Un ${mixed ? 'titolare' : rl} fermo a questi livelli non sta sostenendo la squadra.`]), `Media EA ${f2(m.rating)} in ${g} presenze`);
    else if (m.rating < 7) add(7, 'rating', `Media EA ${f2(m.rating)}: appena oltre la sufficienza. ${mixed ? 'Per un titolare' : `Da ${rl}`} significa tenere il posto senza mai spostare l'inerzia della gara.`, `Media EA ${f2(m.rating)}`);
    else if (m.rating < 7.5) add(4, 'rating', m.peers && !mixed && m.peers.ratingRank
      ? `Media EA ${f2(m.rating)}: ${m.peers.ratingRank}° su ${m.peers.n} del reparto (mediana ${f2(m.peers.medianRating)}). Rendimento ordinario per un ${rl}, utile ma non determinante.`
      : `Media EA ${f2(m.rating)} in ${g} presenze${mixed ? ' tra ruoli diversi' : ` da ${rl}`}: rendimento ordinario, lontano dalla fascia alta${m.ratingVsClubMedian != null ? ` (${m.ratingVsClubMedian >= 0 ? '+' : ''}${f2(m.ratingVsClubMedian)} sulla mediana del club)` : ''}.`,
      m.peers && !mixed && m.peers.ratingRank ? `${m.peers.ratingRank}° su ${m.peers.n} pari reparto per media (${f2(m.rating)})` : `Media EA ${f2(m.rating)}`);
  }
  if (m.peers && !mixed && m.peers.ratingRank === m.peers.n && g >= 8) add(7, 'peers', `Ultimo dei ${m.peers.n} del reparto per media EA (${f2(m.rating)} contro mediana ${f2(m.peers.medianRating)}): a pari ruolo il club ha alternative migliori.`, `Ultimo su ${m.peers.n} pari reparto per media (${f2(m.rating)}, mediana ${f2(m.peers.medianRating)})`);
  else if (m.ratingVsClubMedian != null && m.ratingVsClubMedian <= -0.4 && g >= 8) add(7, 'peers', `${f1(Math.abs(m.ratingVsClubMedian))} punti sotto la mediana dei titolari del club: qualcuno, a parità di impiego, rende di più.`, `${f2(m.ratingVsClubMedian)} dalla mediana del club`);

  // --- Passaggi: parametro dipendente dal ruolo
  // polivalente: percentuale dal solo campione nel ruolo (almeno 3 gare e 30 passaggi); la media stagionale non vale per il ruolo
  const roleOk = mixed && roleN >= 3 && (m.rolePassAtt || 0) >= 30 && m.recentPassPct != null;
  const pp = mixed ? (roleOk ? m.recentPassPct : null) : m.passPct;
  if (pp != null) {
    const failed = mixed ? m.recentPassFailedPerGame : m.passFailedPerGame, att = mixed ? m.recentPassAttPerGame : m.passAttPerGame;
    const vol = (mixed ? ` ${scope}` : '') + (att != null ? ` su circa ${r0(att)} tentati a gara` : '');
    const proofP = `${r0(pp)}% passaggi${failed != null ? `, ~${f1(failed)} sbagliati a gara` : ''}`;
    if (cons && pp < R.passMin) {
      const coachByRole = {
        DIF: `Costruzione dal basso: appoggio sul compagno più vicino e nessun lancio forzato finché i possessi persi non calano (oggi ${r0(pp)}%, ~${f1(failed)} possessi persi a gara).`,
        MED: `Da mediano il primo passaggio dopo il recupero deve essere sicuro: gioca corto verso il centrocampista libero, il dato di oggi è ${r0(pp)}%.`,
        POR: `Rimessa e rinvio sul compagno libero, niente lanci a caso: ${r0(pp)}% non basta al portiere.`,
        CC: `Da centrale uscita dal pressing con passaggi semplici e a un tocco, senza verticali forzate: ${r0(pp)}% oggi, ~${f1(failed)} palloni regalati a gara.`,
      };
      add(pp < 70 ? 10 : 9, 'pass', pick(m, [
        `Passaggi al ${r0(pp)}%${vol}: per un ${rl}, che gioca i passaggi più semplici del campo, è un dato troppo basso. Non è un alibi di ruolo, è un limite tecnico.`,
        `${r0(pp)}% di passaggi riusciti ${mixed ? scope : `da ${rl}`}: un dato che non può permettersi: i suoi passaggi sono di norma meno rischiosi di quelli di chi gioca tra le linee. Regala possesso${failed != null ? ` (~${f1(failed)} errori a gara)` : ''}.`]), proofP, coachByRole[R.role] || coachByRole.CC);
    } else if (!cons && pp < R.passMin) {
      const coachOff = R.role === 'ATT'
        ? `Quando ricevi spalle alla porta scarica di prima su chi inserisce, non forzare il filtrante: ${r0(pp)}% è troppo basso anche per una punta.`
        : `Nell'ultimo terzo scegli il passaggio che mantiene il possesso: ${r0(pp)}% è troppo basso persino per chi gioca tra le linee.`;
      add(R.role === 'ATT' ? 7 : 8, 'pass', `Passaggi al ${r0(pp)}%${vol}: anche con la tolleranza dovuta a un ${rl} (passaggi in area e tra linee strette) il dato resta comunque basso.`, proofP, coachOff);
    } else if (cons && pp < 80 && att != null && att >= 25) {
      add(4, 'pass', `${r0(pp)}% di passaggi su ~${r0(att)} a gara: il volume c'è, la pulizia è solo sufficiente per un ${rl}.`, `${r0(pp)}% su ~${r0(att)} passaggi a gara`,
        `Con ~${r0(att)} passaggi a gara il margine è nella scelta: ~${f1(Math.max(0.1, failed - att * 0.2))} errori in meno a partita migliorerebbero sensibilmente il ${r0(pp)}% attuale.`);
    }
    if (!mixed && m.recentPassPct != null && pp - m.recentPassPct >= 5 && (m.sample || 0) >= 6 && !(cons && pp < R.passMin)) add(5, 'pass2', `Precisione in calo: ${r0(m.recentPassPct)}% nelle ultime ${m.sample} gare contro ${r0(pp)}% di stagione.`, `Ultime ${m.sample} gare ${r0(m.recentPassPct)}% contro stagione ${r0(pp)}%`, `Ritrovare la pulizia di inizio stagione: ${r0(m.recentPassPct)}% nelle ultime ${m.sample} contro ${r0(pp)}%.`);
    if (m.worstPassPct != null && m.worstPassPct < (cons ? 60 : 50) && (mixed ? roleN >= 4 : (m.sample || 0) >= 6)) add(4, 'pass2', `Una serata nera al passaggio: ${r0(m.worstPassPct)}% nella peggiore gara, il segno di quando perde il filo.`, `Peggior gara ${r0(m.worstPassPct)}% passaggi`);
  }
  const attInv = mixed ? (roleOk ? m.recentPassAttPerGame : null) : m.passAttPerGame;
  if (cons && (R.role === 'CC' || R.role === 'MED') && (mixed ? roleN >= 4 : g >= 8) && attInv != null && attInv < 20) add(4, 'involve', `Solo ~${r0(attInv)} passaggi a gara${mixed ? ` ${scope}` : ''} per un ${rl}: partecipa poco alla manovra.`, `~${r0(attInv)} passaggi tentati a gara`, `Offriti di più al portatore: ~${r0(attInv)} passaggi a gara sono pochi per chi deve collegare i reparti.`);

  // --- Contrasti / filtro (solo ruoli di filtro, confrontati col club: il tasso EA e` basso per tutti)
  const tkOk = mixed ? roleN >= 4 && (m.roleTackAtt || 0) >= 12 : g >= 8;
  const tkPct = mixed ? m.recentTackPct : m.tackPct, tkAtt = mixed ? m.roleTackAttPerGame : m.tackAttPerGame, tkFail = mixed ? m.roleTackFailedPerGame : m.tackFailedPerGame;
  if ((R.role === 'CC' || R.role === 'MED' || R.role === 'DIF') && tkOk && tkPct != null && m.clubMedianTackPct != null && tkAtt >= 4 && tkPct <= m.clubMedianTackPct - 8) {
    add(5, 'tackle', `Contrasti riusciti${mixed ? ` ${scope}` : ''}: ${r0(tkPct)}% contro una mediana di club del ${r0(m.clubMedianTackPct)}%, con ${f1(tkAtt)} tentativi a gara: entra spesso e spesso male.`, `${r0(tkPct)}% contrasti (mediana club ${r0(m.clubMedianTackPct)}%), ${f1(tkFail)} falliti a gara`,
      `Meno scivolate e più posizione: chiudi la linea di passaggio prima di entrare. ${f1(tkFail)} contrasti falliti a gara sono avversari che saltano il primo filtro.`);
  }
  if ((R.role === 'MED' || R.role === 'DIF') && tkOk && tkAtt != null && tkAtt < 2.5) add(5, 'tackle', `Solo ${f1(tkAtt)} contrasti tentati a gara${mixed ? ` ${scope}` : ''} per un ${rl}: il filtro davanti alla difesa non c'è.`, `${f1(tkAtt)} contrasti tentati a gara`);

  // --- Fase offensiva
  // metriche offensive: mai su presenze da difensore, mediano o portiere (m.offSample le limita al ruolo offensivo/di centrocampo)
  const offRole = OFF_METRIC_ROLES.has(R.role);
  const sampleGoals = m.offGoals != null ? m.offGoals : m.goalsSample;
  if (offRole && m.shotsTotal >= 8 && m.conversionPct != null && m.conversionPct < 20) {
    const t = sampleGoals ? `${m.shotsTotal} tiri nelle ultime ${offN} gare${mixed ? ` ${scope}` : ''}, ${sampleGoals} gol: conversione ${r0(m.conversionPct)}%, ${f1(m.shotsPerGoal)} conclusioni per una rete.` : `${m.shotsTotal} tiri nelle ultime ${offN} gare${mixed ? ` ${scope}` : ''} senza segnare.`;
    add(R.role === 'ATT' ? 7 : 6, 'finish', t, `${r0(m.conversionPct)}% conversione su ${m.shotsTotal} tiri`,
      `Scegli meglio la conclusione: ${m.shotsTotal} tiri per ${sampleGoals} gol dicono che il tiro dalla distanza o in pressione va tolto dal repertorio.`);
  }
  if (R.role === 'ATT' && offN >= 6 && m.shotsPerGame != null && m.shotsPerGame < 2.5) add(5, 'finish', `${f1(m.shotsPerGame)} tiri a gara per un attaccante: non si prende la conclusione.`, `${f1(m.shotsPerGame)} tiri a gara`, `Attacca l'area con più continuità: ${f1(m.shotsPerGame)} tiri a gara sono pochi per la punta.`);
  const gaMin = GA_MIN[R.role];
  if (mixed) {
    // media G+A stagionale mista di ruoli: si usa solo il campione recente nel ruolo offensivo
    if (gaMin && offRole && offN >= 6 && m.roleGaPerGame != null && m.roleGaPerGame < gaMin) add(6, 'output', `Gol più assist: ${f2(m.roleGaPerGame)} a gara ${scope}: per un ${rl} è un'incidenza offensiva insufficiente.`, `${f2(m.roleGaPerGame)} G+A a gara ${scope}`);
  } else if (gaMin && g >= 8 && m.gaPerGame != null && m.gaPerGame < gaMin) add(6, 'output', pick(m, [
    `Gol più assist: ${f2(m.gaPerGame)} a gara. Per un ${rl} è un'incidenza offensiva insufficiente.`,
    `${m.goals} gol e ${m.assists} assist in ${g} gare (${f2(m.gaPerGame)} a gara): troppo poco per il peso offensivo che il ruolo richiede.`]), `${f2(m.gaPerGame)} G+A a gara`,
    `Più presenza tra le linee e inserimenti senza palla: ${m.goals} gol e ${m.assists} assist in ${g} gare non bastano per un ${rl}.`);
  if (R.group === 'off' && offRole && m.dryStreak >= 3) add(6, 'streak', `${m.dryStreak} gare consecutive senza incidere nel tabellino${mixed ? ` ${scope}` : ''}.`, `${m.dryStreak} gare a secco`);
  if (R.group === 'off' && offRole && m.blankShare != null && m.blankShare >= 60 && offN >= 6) add(5, 'streak', `Nel ${r0(m.blankShare)}% delle ultime ${offN} gare${mixed ? ` ${scope}` : ''} non fa né gol né assist.`, `${r0(m.blankShare)}% gare senza G/A`);
  if (R.role === 'ATT' && !mixed && g >= 15 && m.assistsPerGame != null && m.assistsPerGame < 0.15) add(3, 'balance', `${m.assists} assist in ${g} gare: finalizza ma non fa giocare i compagni.`, `${m.assists} assist in ${g} gare`, `Quando la difesa si chiude sul tuo tiro serve l'ultimo passaggio: ${m.assists} assist in ${g} gare è un solo canale di gioco.`);

  // --- Costanza e forma
  if (stable && m.ratingStd != null && m.ratingStd >= 0.8) add(5, 'consistency', `Rendimento altalenante: deviazione ${f2(m.ratingStd)} sul voto, tra ${f1(m.ratingMin)} e ${f1(m.ratingMax)} nelle gare con almeno 45'.`, `Voto tra ${f1(m.ratingMin)} e ${f1(m.ratingMax)}, dev. ${f2(m.ratingStd)}`);
  if (stable && m.below65Share != null && m.below65Share >= 25) add(7, 'consistency', `${m.below65} partite su ${m.ratedGames} chiuse con voto insufficiente: non è un incidente isolato.`, `${m.below65}/${m.ratedGames} gare insufficienti`);
  if (stable && m.ratedGames >= 8 && m.form5 != null && m.formBefore != null && m.form5 <= m.formBefore - 0.4) add(6, 'form', `Forma in discesa: ${f2(m.form5)} nelle ultime 5 contro ${f2(m.formBefore)} prima.`, `Ultime 5: ${f2(m.form5)} contro ${f2(m.formBefore)}`);
  else if (stable && m.formVsSeason != null && m.formVsSeason <= -0.5) add(5, 'form', `Sotto il proprio livello: ${f2(m.form5)} nelle ultime 5 contro ${f2(m.rating)} di media stagionale.`, `Ultime 5: ${f2(m.form5)} contro stagione ${f2(m.rating)}`);
  else if (stable && m.ratedGames >= 8 && m.trend != null && m.trend < -0.1) add(4, 'form', `La curva dei voti scende di ${f2(Math.abs(m.trend))} a partita nelle ultime ${m.ratedGames} gare.`, `Pendenza voti ${f2(m.trend)}`);

  // --- Contesto partita
  if (stable && m.nWins >= 3 && m.nNotWin >= 3 && m.ratingNotWin != null && m.ratingInWins != null && m.ratingNotWin <= m.ratingInWins - 0.7) add(5, 'context', `Cala quando non si vince: ${f2(m.ratingNotWin)} in ${m.nNotWin} gare senza vittoria contro ${f2(m.ratingInWins)} in ${m.nWins} vittorie. Segue la squadra invece di trascinarla.`, `Voto ${f2(m.ratingNotWin)} senza vittoria (${m.nNotWin}), ${f2(m.ratingInWins)} con vittoria (${m.nWins})`,
    `Nelle gare bloccate prenditi responsabilità: ${f2(m.ratingNotWin)} di voto senza vittoria contro ${f2(m.ratingInWins)} quando si vince.`);
  else if (stable && m.nBigWin >= 2 && m.nClose >= 3 && m.ratingBigWin != null && m.ratingClose != null && m.ratingBigWin - m.ratingClose >= 0.8) add(5, 'context', `Rende quando la partita è già decisa: ${f2(m.ratingBigWin)} nelle vittorie larghe (${m.nBigWin}) contro ${f2(m.ratingClose)} nelle gare in bilico (${m.nClose}).`, `Voto ${f2(m.ratingBigWin)} in vittorie larghe, ${f2(m.ratingClose)} nelle gare in bilico`,
    `Pretendi lo stesso livello quando il risultato è in bilico: ${f2(m.ratingClose)} nelle ${m.nClose} gare decise da un gol, contro ${f2(m.ratingBigWin)} nelle vittorie larghe.`);
  if (stable && cons && !mixed && m.nLeaky >= 3 && m.ratingLeaky != null && m.ratingMean != null && m.ratingLeaky <= m.ratingMean - 0.5) add(5, 'context2', `Quando l'avversario segna 3 o più gol (${m.nLeaky} gare) il suo voto scende a ${f2(m.ratingLeaky)} contro ${f2(m.ratingMean)} di media: va in difficoltà quando la gara si apre.`, `Voto ${f2(m.ratingLeaky)} nelle ${m.nLeaky} gare con 3+ gol subiti`);

  // --- Rendimento di squadra col Pro in campo (correlazione, non causa)
  if (m.nOff >= 3 && m.nOn >= 6 && m.concededPerGameOn != null && m.concededPerGameOff != null && m.concededPerGameOn >= m.concededPerGameOff + 0.7)
    add(cons && !mixed ? 7 : 3, 'defense', `Con lui in campo il club subisce ${f2(m.concededPerGameOn)} gol a gara contro ${f2(m.concededPerGameOff)} nelle ${m.nOff} gare senza di lui${cons && !mixed ? ': per un ' + rl + ' è un dato che pesa' : ''}.`, `Gol subiti ${f2(m.concededPerGameOn)} a gara con lui, ${f2(m.concededPerGameOff)} senza (${m.nOff} gare)`,
      cons && !mixed ? `Copri di più lo spazio davanti alla linea: ${f2(m.concededPerGameOn)} gol subiti a gara con te in campo contro ${f2(m.concededPerGameOff)} senza.` : '');
  if (m.nOff >= 3 && m.nOn >= 6 && m.pointsPerGame != null && m.pointsPerGameOff != null && m.pointsPerGame <= m.pointsPerGameOff - 0.7) add(5, 'onoff', `Il club fa ${f2(m.pointsPerGame)} punti a gara con lui e ${f2(m.pointsPerGameOff)} senza (${m.nOff} gare): il risultato non gli dà ragione.`, `Punti a gara ${f2(m.pointsPerGame)} con, ${f2(m.pointsPerGameOff)} senza`);

  // --- Avatar vs rendimento, disciplina, portieri
  if (m.ratingVsOverall != null && m.ratingVsOverall <= -1.2 && g >= 8) add(7, 'overall', `Overall ${m.overall}, rendimento ${f2(m.rating)}: l'avatar vale più di quanto il giocatore produca.`, `Overall ${m.overall} contro media ${f2(m.rating)}`);
  if (m.redCards >= 1) add(m.redCards >= 2 ? 9 : 8, 'discipline', `${m.redCards} ${m.redCards === 1 ? 'espulsione' : 'espulsioni'} in ${g} presenze: lascia la squadra in inferiorità.`, `${m.redCards} ${m.redCards === 1 ? 'rosso' : 'rossi'} in ${g} gare`, `Disciplina: ${m.redCards} ${m.redCards === 1 ? 'rosso' : 'rossi'} in ${g} gare, gli interventi in ritardo vanno eliminati.`);
  if (R.role === 'POR' && m.savePct != null && m.savesTotal > 0 && m.savePct < 65) add(7, 'gk', `Parate sul ${r0(m.savePct)}% dei tiri nello specchio: da portiere deve dare di più.`, `${r0(m.savePct)}% parate (${m.savesTotal})`, `Posizione sul primo palo e uscite più decise: ${r0(m.savePct)}% di parate.`);
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

/* Un limite tecnico reale quando l'elenco dei difetti e` vuoto (anche i migliori ne hanno uno). */
function weakestSpot(m) {
  const R = roleOf(m);
  const c = [];
  const mixed = !!m.mixed;
  if (m.ratingMin != null && m.ratedGames >= 4) c.push({text: `Il limite resta la continuità: nella peggiore gara il voto è sceso a ${f1(m.ratingMin)}.`, proof: `Peggior gara ${f1(m.ratingMin)}`, coach: `Evitare i cali: la peggiore gara recente è a ${f1(m.ratingMin)}, contro una media di ${f2(m.rating)}.`});
  if (!mixed && m.passFailedPerGame != null) c.push({text: R.group === 'off'
      ? `Nessuna lacuna conclamata nei numeri; il margine di lavoro è nel palleggio: ${r0(m.passPct)}% (~${f1(m.passFailedPerGame)} errori a gara), accettabile per un ${R.label} ma migliorabile.`
      : `Il limite tecnico sono ancora ~${f1(m.passFailedPerGame)} passaggi sbagliati a gara (${r0(m.passPct)}% di precisione).`, proof: `~${f1(m.passFailedPerGame)} passaggi sbagliati a gara`,
    coach: R.group === 'off' ? `Meno palloni persi in zona avanzata: ${r0(m.passPct)}% al passaggio, ~${f1(m.passFailedPerGame)} errori a gara.` : `Ridurre i ~${f1(m.passFailedPerGame)} passaggi persi a gara: a questo livello il margine di crescita è nella pulizia.`});
  if (!mixed && m.tackPct != null) c.push({text: `Il fondamentale meno solido è il contrasto: riuscito al ${r0(m.tackPct)}%.`, proof: `${r0(m.tackPct)}% contrasti`, coach: `Lavorare sul tempo di intervento: contrasti riusciti al ${r0(m.tackPct)}%.`});
  c.push({text: `Il margine di crescita resta nella fase che non emerge dai numeri EA, perché passaggi progressivi e posizione media non sono disponibili.`, proof: `Dati EA assenti: passaggi progressivi, posizione`, coach: mixed ? `Verificare a video il lavoro senza palla ${m.roleScope || 'nel ruolo attuale'}: i dati EA non lo misurano.` : `Verificare a video il lavoro senza palla del ${R.label}: i dati EA non lo misurano.`});
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

function uniqueByArea(list, k) {
  const seen = new Set(), out = [];
  for (const x of list) { if (seen.has(x.area)) continue; seen.add(x.area); out.push(x); if (out.length >= k) break; }
  return out;
}

export function commentFor(m) {
  const R = roleOf(m);
  const g = m.games || 0;
  const caveats = caveatsFor(m);
  const confidence = m.reliability || reliabilityFor(g);
  if (g < 3 || !m.rating) {
    return {
      tier: 'campione_insufficiente', praise: null,
      charge: g === 0 ? 'Nessuna presenza nelle statistiche EA: nulla da valutare.' : `Solo ${g} ${g === 1 ? 'presenza' : 'presenze'} nelle statistiche EA${m.rating ? ` (media ${f2(m.rating)})` : ''}: campione insufficiente per un giudizio tecnico.`,
      proof: [`${g} ${g === 1 ? 'presenza' : 'presenze'}, media EA ${m.rating ? f2(m.rating) : 'non disponibile'}`],
      verdict: 'Nessun verdetto: servono almeno 3 presenze, meglio 10, prima di valutarlo.',
      negatives: [], positives: [], coachNote: `Nessuna istruzione tattica: ${g === 0 ? 'zero presenze' : g + (g === 1 ? ' presenza' : ' presenze')} non bastano a distinguere un limite dal caso. Si rivaluta dopo altre gare da ${R.label}.`,
      confidence, role: R.role, caveats,
    };
  }
  const neg = negatives(m), pos = positives(m);
  const elite = m.rating > 8;
  const uniq = uniqueByArea(neg, 6);
  let limit = null;
  let charge, proofs;
  if (elite) {
    limit = uniq[0] || weakestSpot(m);
    charge = limit.text;
    proofs = [...pos.slice(0, 2).map(x => x.proof), ...uniq.slice(0, 2).map(x => x.proof)];
    if (!uniq.length) proofs.push(limit.proof);
  } else {
    const top = uniq.slice(0, 3);
    const extra = top.length < 2 ? weakestSpot(m) : null; // con pochi difetti si indica comunque il dato più debole
    charge = [...top.map(x => x.text), ...(extra ? [extra.text] : [])].join(' ');
    proofs = [...uniq.slice(0, 4).map(x => x.proof), ...(extra ? [extra.proof] : [])];
    if (extra && !uniq.some(x => x.coach)) limit = extra;
  }
  const praise = elite && pos.length ? uniqueByArea(pos, 2).map(x => x.text).join(' ') : null;

  // coachNote: istruzioni di lavoro concrete dai difetti con indicazione tattica (max 2, aree diverse)
  const coachable = uniq.filter(x => x.coach);
  let coachNote;
  if (coachable.length) coachNote = coachable.slice(0, 2).map(x => x.coach).join(' ');
  else if (limit && limit.coach) coachNote = limit.coach;
  else {
    const w = weakestSpot(m);
    coachNote = w.coach;
  }
  if (elite) coachNote = `Per restare a questo livello: ${coachNote.charAt(0).toLowerCase()}${coachNote.slice(1)}`;
  if (confidence === 'ridotta') coachNote += ` (Indicazione provvisoria su ${g} presenze.)`;

  let verdict;
  if (m.rating < 6.5) verdict = 'Bocciato: oggi non è all\'altezza del livello richiesto dal club.';
  else if (m.rating < 7) verdict = `Rimandato: la sufficienza non basta, servono precisione e ${R.group === 'cons' ? 'solidità' : 'incidenza'}.`;
  else if (m.rating < 7.5) verdict = 'Nella media: utile, mai decisivo. Migliorare è l\'unica strada.';
  else if (m.rating <= 8) verdict = 'Buono, ma ancora lontano dai migliori: manca il salto di qualità.';
  else verdict = 'Promosso: livello alto, da confermare partita dopo partita.';
  if (confidence === 'ridotta') verdict += ` Lettura provvisoria: ${g} presenze.`;

  const tier = m.rating > 8 ? 'elite' : m.rating >= 7.5 ? 'buono' : m.rating >= 7 ? 'medio' : m.rating >= 6.5 ? 'rimandato' : 'bocciato';
  return {tier, praise, charge, proof: proofs, verdict, negatives: neg, positives: pos, coachNote, confidence, role: R.role, caveats};
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
  const add = (sev, area, text, proof, coach) => out.push({sev, area, text, proof, coach: coach || '', role, label, n});
  const passAtt = pa.reduce((s, x) => s + x.passAtt, 0), passOk = pa.reduce((s, x) => s + x.passOk, 0);
  const pp = passAtt ? Math.round(passOk / passAtt * 100) : null;
  if (passAtt >= 15 && pp < info.passMin) add(info.group === 'cons' ? 8 : 6, 'pass', `Passaggi al ${pp}% ${ctx} (${passAtt - passOk} sbagliati su ${passAtt}): per questo ruolo la pulizia non c'è stata.`, `${pp}% passaggi ${ctx}`,
    info.group === 'cons' ? `Da ${label} il primo passaggio deve essere sicuro: appoggio corto, niente verticali forzate (${pp}% in serata).` : `Nell'ultimo terzo scegli il passaggio che tiene il possesso: ${pp}% in serata.`);
  const tkAtt = pa.reduce((s, x) => s + x.tackAtt, 0), tkOk = pa.reduce((s, x) => s + x.tackOk, 0);
  if (tkAtt >= 4 && tkOk / tkAtt < 0.5) add(info.group === 'cons' ? 6 : 4, 'tackle', `${tkOk} contrasti riusciti su ${tkAtt} ${ctx}: entra spesso e il pallone resta all'avversario.`, `${tkOk}/${tkAtt} contrasti ${ctx}`, `Meno scivolate e più posizione: chiudi la linea di passaggio prima di entrare (${tkOk}/${tkAtt} in serata).`);
  if (info.group === 'cons' && n >= 2) {
    const conc = mean0(pa.map(x => x.ga)), cs = pa.filter(x => x.ga === 0).length;
    if (conc >= 3) add(7, 'defense', `Con lui in campo ${ctx} il club ha subito ${f1(conc)} gol a gara (${n} gare, ${cs} a porta inviolata).`, `${f1(conc)} gol subiti a gara con lui ${ctx}, ${cs} porte inviolate su ${n}`, `Copri di più lo spazio davanti alla linea: ${f1(conc)} gol subiti a gara con te in campo in serata.`);
  }
  const rated = pa.map(x => x.rating).filter(Boolean);
  const rm = mean0(rated);
  if (rated.length && rm < 6.5) add(8, 'rating', `Voto medio ${f2(rm)} ${ctx}: serata insufficiente.`, `Voto medio ${f2(rm)} ${ctx}`);
  if (rated.length >= 3 && Math.max(...rated) - Math.min(...rated) >= 1.5) add(5, 'consistency', `Voti tra ${f1(Math.min(...rated))} e ${f1(Math.max(...rated))} ${ctx}: serata instabile.`, `Voti tra ${f1(Math.min(...rated))} e ${f1(Math.max(...rated))} ${ctx}`);
  const reds = pa.reduce((s, x) => s + (x.red || 0), 0);
  if (reds) add(9, 'discipline', `${reds} ${reds === 1 ? 'espulsione' : 'espulsioni'} ${ctx}: lascia la squadra in inferiorità.`, `${reds} rossi ${ctx}`);
  // gol e incisivita`: solo per i ruoli offensivi (mai per difensore, mediano, portiere)
  if (offensiveOk && ['ATT', 'TRQ', 'MEZ_OFF', 'ESTERNO'].includes(role)) {
    const shots = pa.reduce((s, x) => s + x.shots, 0), goals = pa.reduce((s, x) => s + x.goals, 0), ga = goals + pa.reduce((s, x) => s + x.assists, 0);
    if (shots >= 3 && goals / shots < 0.3) add(6, 'finish', `${goals} gol su ${shots} tiri ${ctx}: conclusioni sprecate.`, `${goals} gol su ${shots} tiri ${ctx}`);
    if (n >= 3 && !ga) add(6, 'streak', `Nessun gol né assist nelle ${gare(n)} ${ctx}.`, `${n} gare senza G/A ${ctx}`);
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
    lead = joinText(lead, `Adattato da difensore con un avatar da centrocampista (${PRO_POS_LABEL[pc]}): in serata i dati di ruolo non reggono.`);

  const nightTexts = items.slice(0, 2).map(x => x.text);
  const seasonNeg = uniqueByArea(base.negatives, 3);
  let charge;
  if (base.tier === 'elite') charge = joinText(lead, nightTexts[0], base.charge);
  else charge = joinText(lead, nightTexts.join(' '), seasonNeg.slice(0, nightTexts.length ? 1 : 2).map(x => x.text).join(' ') || (!nightTexts.length ? base.charge : ''));
  const proof = [...groups.map(g => `Serata: ${g.fact}`), ...items.slice(0, 2).map(x => x.proof), ...base.proof.slice(0, 2)];
  const coachable = items.find(x => x.coach);
  const coachNote = coachable ? (base.tier === 'elite' ? `Per restare a questo livello: ${coachable.coach.charAt(0).toLowerCase()}${coachable.coach.slice(1)}` : coachable.coach) : base.coachNote;
  return {...base, charge: charge.trim(), proof, coachNote, nightRole, nightRoleText, nightMetrics: mm, nightItems: items};
}
