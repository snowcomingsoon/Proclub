export const CLUB_ID = '70375';
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const std = a => { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };
const pct = (a, b) => (b > 0 ? (a / b) * 100 : null);
const per = (a, b, k = 1) => (b > 0 ? (a / b) * k : null);
const pts = r => (r === 'V' ? 3 : r === 'P' ? 1 : 0);

export function slope(values) {
  const n = values.length;
  if (n < 3) return null;
  const mx = (n - 1) / 2, my = mean(values);
  let c = 0, v = 0;
  values.forEach((y, i) => { c += (i - mx) * (y - my); v += (i - mx) ** 2; });
  return c / v;
}

/* ---------------------------------------------------------------------------
 * Ruoli.
 * `pos` delle partite e` solo midfielder/forward/defender/goalkeeper.
 * `members[].proPos` e` un codice posizione EA: ASSUNZIONE, mappatura classica
 * degli ID posizione di EA FC / FIFA (confermata dai dati: 14 = CM nei Pro che
 * giocano 'midfielder', 25 = ST in quelli che giocano 'forward'):
 *  0 GK | 1 SW, 2 RWB, 3 RB, 4 RCB, 5 CB, 6 LCB, 7 LB, 8 LWB | 9 RDM, 10 CDM, 11 LDM
 *  12 RM, 16 LM | 13 RCM, 14 CM, 15 LCM | 17 RAM, 18 CAM, 19 LAM | 20 RF, 21 CF, 22 LF,
 *  23 RW, 24 RS, 25 ST, 26 LS.
 * Il ruolo usato e` quello REALMENTE giocato (`pos` piu` frequente nelle partite),
 * raffinato dal codice dell'avatar solo all'interno dello stesso reparto.
 * Un avatar da punta (codice >= 20) schierato a centrocampo e` trattato come
 * centrocampista offensivo (assunzione dichiarata).
 * ------------------------------------------------------------------------- */
export const ROLE_INFO = {
  POR: {label: 'portiere', group: 'cons', family: 'por', passMin: 75},
  DIF: {label: 'difensore', group: 'cons', family: 'dif', passMin: 75},
  MED: {label: 'mediano', group: 'cons', family: 'mid', passMin: 75},
  CC: {label: 'centrocampista centrale', group: 'cons', family: 'mid', passMin: 75},
  ESTERNO: {label: 'esterno di centrocampo', group: 'off', family: 'mid', passMin: 70},
  TRQ: {label: 'trequartista', group: 'off', family: 'mid', passMin: 70},
  MEZ_OFF: {label: 'centrocampista offensivo', group: 'off', family: 'mid', passMin: 70},
  ATT: {label: 'attaccante', group: 'off', family: 'att', passMin: 65},
};
export const PRO_POS_LABEL = {0: 'GK', 1: 'SW', 2: 'RWB', 3: 'RB', 4: 'RCB', 5: 'CB', 6: 'LCB', 7: 'LB', 8: 'LWB', 9: 'RDM', 10: 'CDM', 11: 'LDM', 12: 'RM', 13: 'RCM', 14: 'CM', 15: 'LCM', 16: 'LM', 17: 'RAM', 18: 'CAM', 19: 'LAM', 20: 'RF', 21: 'CF', 22: 'LF', 23: 'RW', 24: 'RS', 25: 'ST', 26: 'LS'};

export function roleFor(playedPos, proPos) {
  const code = proPos !== '' && proPos != null && Number.isFinite(Number(proPos)) ? Number(proPos) : null;
  if (playedPos === 'goalkeeper') return 'POR';
  if (playedPos === 'defender') return 'DIF';
  if (playedPos === 'forward') return 'ATT';
  if (playedPos === 'midfielder' || !playedPos) {
    if (!playedPos && code === 0) return 'POR';
    if (!playedPos && code >= 1 && code <= 8) return 'DIF';
    if (!playedPos && code >= 20) return 'ATT';
    if (code >= 9 && code <= 11) return 'MED';
    if (code === 12 || code === 16) return 'ESTERNO';
    if (code >= 17 && code <= 19) return 'TRQ';
    if (code >= 20) return 'MEZ_OFF';
    if (code >= 1 && code <= 8) return 'MED';
    return 'CC';
  }
  return 'CC';
}


/* ---------------------------------------------------------------------------
 * Ruolo di ogni presenza e giudizio per ruolo.
 * Ogni presenza porta il proprio ruolo (`pos` EA -> `role`). Il giudizio e` riferito
 * al ruolo GIOCATO di recente: serie corrente (>= 3 gare uguali) oppure `pos` piu`
 * frequente nelle ultime RECENT_WINDOW presenze. Le metriche offensive si calcolano
 * solo sulle presenze in ruoli offensivi o di centrocampo, quelle difensive sul ruolo
 * giocato. Se il ruolo giudicato pesa meno del 70% dello storico dettagliato il Pro e`
 * `mixed`: le medie stagionali EA (miste di ruoli) non reggono accuse da ruolo specifico
 * e il giudizio usa solo il campione recente nel ruolo.
 * ------------------------------------------------------------------------- */
export const RECENT_WINDOW = 10;
export const ROLE_SHARE_MIN = 0.7;
/* Ruoli sui quali ha senso misurare tiri, gol e assist (per ciascuno valgono le sue soglie). */
export const OFF_METRIC_ROLES = new Set(['ATT', 'TRQ', 'MEZ_OFF', 'ESTERNO', 'CC']);
const codeOf = proPos => (proPos !== '' && proPos != null && Number.isFinite(Number(proPos)) ? Number(proPos) : null);

/** Etichetta del ruolo realmente giocato (`pos` EA + codice avatar). */
export function posLabel(pos, proPos) {
  if (pos === 'goalkeeper') return 'portiere';
  if (pos === 'forward') return 'attaccante';
  if (pos === 'defender') return [2, 3, 7, 8].includes(codeOf(proPos)) ? 'terzino' : 'difensore centrale';
  return ROLE_INFO[roleFor('midfielder', proPos)].label;
}

/** Ruolo da giudicare: serie corrente di almeno 3 gare, altrimenti il piu` frequente nella finestra recente. */
export function judgedPosOf(a) {
  if (!a.length) return null;
  const last = a[a.length - 1].pos;
  let run = 0;
  for (let i = a.length - 1; i >= 0 && a[i].pos === last; i--) run++;
  if (run >= 3) return last;
  const win = a.slice(-RECENT_WINDOW), cnt = {};
  win.forEach(x => { cnt[x.pos] = (cnt[x.pos] || 0) + 1; });
  const top = Math.max(...Object.values(cnt));
  for (let i = win.length - 1; i >= 0; i--) if (cnt[win[i].pos] === top) return win[i].pos;
  return last;
}

/** Campi che dipendono dal ruolo giudicato `pos`, calcolati sulle sole presenze in quel ruolo. */
export function roleView(a, pos, proPos) {
  const role = roleFor(pos, proPos), info = ROLE_INFO[role];
  const win = a.slice(-RECENT_WINDOW);
  const inPos = a.filter(x => x.pos === pos);
  const share = a.length ? inPos.length / a.length : 1;
  const mixed = a.length >= 3 && share < ROLE_SHARE_MIN;
  const ra = mixed ? win.filter(x => x.pos === pos) : inPos;
  let run = 0;
  for (let i = a.length - 1; i >= 0 && a[i].pos === pos; i--) run++;
  const cnt = {};
  win.forEach(x => { cnt[x.pos] = (cnt[x.pos] || 0) + 1; });
  const roleMix = Object.entries(cnt).sort((x, y) => y[1] - x[1]).map(([p, n]) => ({pos: p, n, label: posLabel(p, proPos)}));
  const label = posLabel(pos, proPos);
  const roleScope = !mixed ? '' : run >= 2 ? `da ${label} nelle ultime ${run} gare` : `da ${label} in ${ra.length} delle ultime ${win.length} gare`;
  const off = OFF_METRIC_ROLES.has(role) ? ra : [];
  const blanks = off.filter(x => !x.goals && !x.assists).length;
  let dry = 0;
  if (off.length) for (let i = a.length - 1; i >= 0 && a[i].pos === pos && !a[i].goals && !a[i].assists; i--) dry++;
  const full = ra.filter(x => x.minutes >= 45);
  const passAtt = sum(ra, x => x.passAtt), passOk = sum(ra, x => x.passOk);
  const tackAtt = sum(ra, x => x.tackAtt), tackOk = sum(ra, x => x.tackOk);
  return {
    playedPos: pos, role, roleLabel: label, roleGroup: info.group, roleFamily: info.family,
    mixed, roleShare: share, roleSample: ra.length, roleRun: run, roleMix, roleScope,
    offSample: off.length, offGoals: sum(off, x => x.goals), offAssists: sum(off, x => x.assists),
    shotsTotal: sum(off, x => x.shots), shotsPerGame: off.length ? mean(off.map(x => x.shots)) : null,
    conversionPct: pct(sum(off, x => x.goals), sum(off, x => x.shots)),
    shotsPerGoal: per(sum(off, x => x.shots), sum(off, x => x.goals)),
    roleGaPerGame: off.length ? mean(off.map(x => x.goals + x.assists)) : null,
    blankGames: off.length ? blanks : 0, blankShare: off.length ? pct(blanks, off.length) : null, dryStreak: dry,
    recentPassPct: pct(passOk, passAtt), rolePassAtt: passAtt,
    recentPassAttPerGame: mean(ra.map(x => x.passAtt)), recentPassFailedPerGame: mean(ra.map(x => x.passAtt - x.passOk)),
    worstPassPct: Math.min(...ra.filter(x => x.passAtt >= 12).map(x => pct(x.passOk, x.passAtt)), 100),
    recentTackPct: pct(tackOk, tackAtt), roleTackAtt: tackAtt, roleTackAttPerGame: mean(ra.map(x => x.tackAtt)),
    roleTackFailedPerGame: mean(ra.map(x => x.tackAtt - x.tackOk)),
    roleConcededPerGame: mean(full.map(x => x.ga)), roleCleanSheets: full.filter(x => x.ga === 0).length, roleFull: full.length,
    roleRating: mean(ra.map(x => x.rating).filter(Boolean)),
  };
}

/** Metriche del Pro riferite a un ruolo diverso da quello giudicato (stessa stagione, stesso storico). */
export function metricsForRole(m, pos, upTo) {
  if (!m || !m.apps || !m.apps.length || !pos) return m;
  const a = upTo != null ? m.apps.filter(x => x.timestamp <= upTo) : m.apps;
  if (!a.length || pos === m.playedPos && upTo == null) return m;
  return {...m, ...roleView(a, pos, m.proPos)};
}

/** Sintesi dei ruoli giocati in una serata (presenze normalizzate da `appearancesFor`). */
export function nightRoles(m, nightApps) {
  const cnt = {};
  nightApps.forEach(x => { cnt[x.pos] = (cnt[x.pos] || 0) + 1; });
  const proPos = m ? m.proPos : null;
  const mix = Object.entries(cnt).sort((x, y) => y[1] - x[1]).map(([pos, n]) => ({pos, n, label: posLabel(pos, proPos)}));
  const top = Math.max(...mix.map(x => x.n));
  let primary = mix[0].pos;
  for (let i = nightApps.length - 1; i >= 0; i--) if (cnt[nightApps[i].pos] === top) { primary = nightApps[i].pos; break; }
  const habitual = m && m.seasonPos ? m.seasonPos : null;
  return {mix, primary, label: posLabel(primary, proPos), habitual, habitualLabel: habitual ? posLabel(habitual, proPos) : null,
    changed: !!habitual && (mix.length > 1 || primary !== habitual), multiple: mix.length > 1};
}

export function appearancesFor(history, name, clubId = CLUB_ID) {
  const out = [];
  for (const m of [...history].sort((a, b) => a.timestamp - b.timestamp)) {
    const players = Object.values(m.players?.[clubId] || {});
    const row = players.find(p => p.playername === name);
    if (!row) continue;
    const c = m.clubs?.[clubId] || {};
    const oppEntry = Object.entries(m.clubs || {}).find(([id]) => id !== String(clubId));
    const gf = num(c.goals), ga = num(c.goalsAgainst);
    // minuti: quota di gara giocata (secondsPlayed / gameTime). `realtimegame` non e` affidabile
    // (contiene valori incoerenti tra gare) e non viene usato.
    const gt = num(row.gameTime), sp = num(row.secondsPlayed);
    const minutes = gt > 0 ? Math.min(90, Math.round(90 * sp / gt)) : 90;
    out.push({
      matchId: String(m.matchId), timestamp: m.timestamp, pos: row.pos,
      opponent: oppEntry?.[1]?.details?.name ?? null,
      rating: num(row.rating), goals: num(row.goals), assists: num(row.assists), shots: num(row.shots),
      passAtt: num(row.passattempts), passOk: num(row.passesmade),
      tackAtt: num(row.tackleattempts), tackOk: num(row.tacklesmade),
      saves: num(row.saves), conceded: num(row.goalsconceded),
      // i campi cleansheets* di EA risultano 0 anche nelle gare chiuse a rete inviolata: si usa gol subiti = 0
      cleanSheet: ga === 0,
      mom: num(row.mom) > 0, red: num(row.redcards),
      minutes, mates: players.filter(p => p.playername !== name).map(p => p.playername), teamSize: players.length,
      gf, ga, result: gf > ga ? 'V' : gf < ga ? 'S' : 'P',
    });
  }
  return out;
}

function clubMatches(history, clubId) {
  return [...history].sort((a, b) => a.timestamp - b.timestamp).map(m => {
    const c = m.clubs?.[clubId] || {};
    const gf = num(c.goals), ga = num(c.goalsAgainst);
    const rows = Object.values(m.players?.[clubId] || {});
    const status = {};
    rows.forEach(p => {
      const gt = num(p.gameTime), sp = num(p.secondsPlayed);
      const minutes = gt > 0 ? Math.min(90, Math.round(90 * sp / gt)) : 90;
      status[p.playername] = num(p.redcards) > 0 ? 'red' : minutes >= 45 ? 'full' : 'part';
    });
    return {matchId: String(m.matchId), timestamp: m.timestamp, gf, ga, result: gf > ga ? 'V' : gf < ga ? 'S' : 'P',
      names: rows.map(p => p.playername), status};
  });
}

export const MIN_ONOFF = 10;

export function reliabilityFor(games) {
  return games >= 25 ? 'solida' : games >= 10 ? 'discreta' : games >= 3 ? 'ridotta' : 'insufficiente';
}

export function computeMetrics(member, appearances, ctx = {}) {
  const g = num(member.gamesPlayed), goals = num(member.goals), assists = num(member.assists);
  const rating = num(member.ratingAve);
  const passPct = num(member.passSuccessRate), passMade = num(member.passesMade);
  const passAtt = passPct ? Math.round(passMade / (passPct / 100)) : 0;
  const tackOk = num(member.tacklesMade), tackPct = num(member.tackleSuccessRate);
  const tackAtt = tackPct ? Math.round(tackOk / (tackPct / 100)) : 0;
  const proPos = member.proPos !== undefined && member.proPos !== '' ? Number(member.proPos) : null;
  const a = appearances.map(x => ({...x, role: roleFor(x.pos, proPos)}));
  const posCount = {};
  a.forEach(x => { posCount[x.pos] = (posCount[x.pos] || 0) + 1; });
  const seasonPos = a.length ? Object.entries(posCount).sort((x, y) => y[1] - x[1])[0][0] : null;
  const judgedPos = judgedPosOf(a);
  const view = a.length ? roleView(a, judgedPos, proPos) : null;
  const playedPos = judgedPos;
  const role = view ? view.role : roleFor(member.favoritePosition, proPos);
  const info = ROLE_INFO[role];
  const seasonRole = roleFor(seasonPos || member.favoritePosition, proPos);
  const m = {
    name: member.name, games: g, goals, assists, ga: goals + assists, rating, overall: num(member.proOverall),
    position: member.favoritePosition || '', proPos, proPosLabel: PRO_POS_LABEL[proPos] || null,
    playedPos, role, roleLabel: view ? view.roleLabel : info.label, roleGroup: info.group, family: ROLE_INFO[seasonRole].family, roleFamily: info.family,
    seasonPos, seasonRole, seasonRoleLabel: seasonPos ? posLabel(seasonPos, proPos) : ROLE_INFO[seasonRole].label, mixed: false, roleSample: 0, apps: a,
    roleInferred: !playedPos, roleMismatch: !!(playedPos && member.favoritePosition && playedPos !== member.favoritePosition),
    reliability: reliabilityFor(g), nOff: 0,
    presenceRate: ctx.clubGames ? pct(g, ctx.clubGames) : null,
    goalsPerGame: per(goals, g), assistsPerGame: per(assists, g), gaPerGame: per(goals + assists, g),
    assistGoalRatio: goals ? assists / goals : null,
    passPct: passPct || null, passAttSeason: passAtt, passAttPerGame: per(passAtt, g), passFailedPerGame: per(passAtt - passMade, g),
    passFailedTotal: Math.max(0, passAtt - passMade),
    tackPct: tackPct || null, tackAttPerGame: per(tackAtt, g), tackFailedPerGame: per(tackAtt - tackOk, g),
    shotSuccessPct: num(member.shotSuccessRate) || null,
    motmRate: pct(num(member.manOfTheMatch), g), motm: num(member.manOfTheMatch),
    redCards: num(member.redCards), redPerGame: per(num(member.redCards), g),
    winPct: num(member.winRate) || null,
    cleanSheets: num(member.cleanSheetsDef) + num(member.cleanSheetsGK),
    shareOfClubGoals: ctx.clubGoals ? pct(goals, ctx.clubGoals) : null,
    shareOfClubGA: ctx.clubGoals ? pct(goals + assists, ctx.clubGoals) : null,
    ratingVsClubMedian: ctx.medianRating != null && rating ? rating - ctx.medianRating : null,
    clubMedianTackPct: ctx.medianTackPct ?? null,
    ratingVsOverall: member.proOverall && rating ? rating - num(member.proOverall) / 10 : null,
  };
  const prev = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => num(member[i ? `prevGoals${i}` : 'prevGoals']));
  m.recentGoalsLast5 = sum(prev.slice(0, 5), x => x);
  m.sample = a.length;
  if (!a.length) return m;

  const full = a.filter(x => x.minutes >= 45);
  const ratings = full.map(x => x.rating).filter(Boolean);
  const mins = sum(a, x => x.minutes);
  const wins = full.filter(x => x.result === 'V'), draws = full.filter(x => x.result === 'P'), losses = full.filter(x => x.result === 'S');
  const rOf = arr => mean(arr.map(x => x.rating).filter(Boolean));
  const close = full.filter(x => Math.abs(x.gf - x.ga) <= 1), big = full.filter(x => x.gf - x.ga >= 3), leaky = full.filter(x => x.ga >= 3);
  Object.assign(m, {
    minutes: mins, cameos: a.length - full.length, fullGames: full.length,
    goalsPer90: per(sum(a, x => x.goals), mins, 90), assistsPer90: per(sum(a, x => x.assists), mins, 90),
    gaPer90: per(sum(a, x => x.goals + x.assists), mins, 90),
    shotsPer90: per(sum(a, x => x.shots), mins, 90),
    goalsSample: sum(a, x => x.goals), assistsSample: sum(a, x => x.assists),
    ratingMean: mean(ratings), ratingMedian: median(ratings), ratingStd: std(ratings),
    ratingMin: ratings.length ? Math.min(...ratings) : null, ratingMax: ratings.length ? Math.max(...ratings) : null,
    below65: ratings.filter(r => r < 6.5).length, below7: ratings.filter(r => r < 7).length, above8: ratings.filter(r => r >= 8).length,
    ratedGames: ratings.length,
    below65Share: pct(ratings.filter(r => r < 6.5).length, ratings.length),
    trend: slope(ratings),
    form5: mean(ratings.slice(-5)), formBefore: ratings.length > 5 ? mean(ratings.slice(0, -5)) : null,
    ratingInWins: rOf(wins), ratingInDraws: rOf(draws), ratingInLosses: rOf(losses),
    ratingNotWin: rOf([...draws, ...losses]), nWins: wins.length, nNotWin: draws.length + losses.length, nLosses: losses.length,
    ratingClose: rOf(close), nClose: close.length, ratingBigWin: rOf(big), nBigWin: big.length,
    ratingLeaky: rOf(leaky), nLeaky: leaky.length,
    concededPerGameOn: mean(full.map(x => x.ga)), cleanSheetGames: full.filter(x => x.ga === 0).length, nOn: full.length,
    pointsPerGame: per(sum(full, x => pts(x.result)), full.length),
    clubWinPctWith: pct(wins.length, full.length),
    savesTotal: sum(a, x => x.saves),
    savePct: pct(sum(a, x => x.saves), sum(a, x => x.saves) + sum(a, x => x.conceded)),
    momRecent: a.filter(x => x.mom).length,
  });
  m.formVsSeason = m.form5 != null && rating ? m.form5 - rating : null;
  // on/off: club con e senza il Pro (stessa finestra di partite)
  // Confronto con/senza: solo con campione sufficiente (>= MIN_ONOFF gare per gruppo, almeno 45' e senza
  // espulsione del Pro per il gruppo "con"; gare con espulsione o spezzoni escluse), scarto di almeno 0.5 punti
  // a gara e coerente con i gol subiti. Altrimenti nessun dato: niente testi, niente numeri.
  m.nOff = 0; m.concededPerGameOff = null; m.pointsPerGameOff = null; m.onOffExcluded = a.filter(x => x.red > 0 || x.minutes < 45).length;
  if (ctx.matches) {
    const playedIds = new Set(a.map(x => x.matchId));
    const onIds = new Set(full.filter(x => !x.red).map(x => x.matchId));
    const on = ctx.matches.filter(x => onIds.has(x.matchId));
    const off = ctx.matches.filter(x => !playedIds.has(x.matchId));
    if (on.length >= MIN_ONOFF && off.length >= MIN_ONOFF) {
      const ppgOn = mean(on.map(x => pts(x.result))), ppgOff = mean(off.map(x => pts(x.result)));
      const gaOn = mean(on.map(x => x.ga)), gaOff = mean(off.map(x => x.ga));
      const d = ppgOn - ppgOff;
      if (Math.abs(d) >= 0.5 && (d > 0 ? gaOn < gaOff : gaOn > gaOff)) {
        Object.assign(m, {nOn: on.length, nOff: off.length, pointsPerGame: ppgOn, pointsPerGameOff: ppgOff,
          concededPerGameOn: gaOn, concededPerGameOff: gaOff, cleanSheetGamesOff: off.filter(x => x.ga === 0).length});
      }
    }
  }
  // metriche per ruolo: offensive solo sulle presenze offensive/di centrocampo, difensive sul ruolo giocato
  Object.assign(m, view);
  m.clubGaPerGame = ctx.matches && ctx.matches.length ? mean(ctx.matches.map(x => x.ga)) : null;
  m.passFailedSeasonTotal = m.passFailedTotal;
  return m;
}

/* Classifiche nel club tra pari ruolo (stessa famiglia: att / mid / dif / por),
 * solo con almeno 5 presenze e almeno 3 pari ruolo. */
function addPeers(all) {
  const fam = {};
  all.forEach(m => { if (m.games >= 5 && m.rating) (fam[m.family] = fam[m.family] || []).push(m); });
  for (const m of all) {
    const peers = fam[m.family];
    if (!peers || peers.length < 3 || m.games < 5) continue;
    const rank = key => {
      const vals = peers.map(p => p[key]).filter(v => v != null);
      if (m[key] == null || vals.length < 3) return null;
      return 1 + vals.filter(v => v > m[key]).length;
    };
    m.peers = {
      n: peers.length, family: m.family,
      ratingRank: rank('rating'), gaRank: rank('gaPerGame'), passRank: rank('passPct'),
      medianRating: median(peers.map(p => p.rating)), medianPass: median(peers.map(p => p.passPct).filter(Boolean)),
    };
  }
}

function ctxFor(data, clubId) {
  const members = data.members.members;
  const club = data.club[0];
  const regulars = members.filter(x => num(x.gamesPlayed) >= 10);
  return {
    clubGoals: num(club.goals), clubGames: num(club.gamesPlayed),
    medianRating: median(regulars.map(x => num(x.ratingAve)).filter(Boolean)),
    medianTackPct: median(regulars.map(x => num(x.tackleSuccessRate)).filter(Boolean)),
    matches: clubMatches(data.matchHistory || [], clubId),
  };
}

export function buildAll(data, clubId = CLUB_ID) {
  const members = data.members.members;
  const ctx = ctxFor(data, clubId);
  const all = members.map(mem => computeMetrics(mem, appearancesFor(data.matchHistory || [], mem.name, clubId), ctx));
  addPeers(all);
  return all;
}

/* ---------------------------------------------------------------------------
 * Analisi di squadra: record, coppie, reparti, dipendenza dal capocannoniere, serie.
 * ------------------------------------------------------------------------- */
export function analyzeClub(data, clubId = CLUB_ID, precomputed) {
  const ctx = ctxFor(data, clubId);
  const players = precomputed || buildAll(data, clubId);
  const ms = ctx.matches;
  const club = data.club[0];
  const n = ms.length;
  const record = {
    n, w: ms.filter(x => x.result === 'V').length, d: ms.filter(x => x.result === 'P').length, l: ms.filter(x => x.result === 'S').length,
    gf: sum(ms, x => x.gf), ga: sum(ms, x => x.ga),
  };
  record.ppg = per(sum(ms, x => pts(x.result)), n);
  record.gfPerGame = per(record.gf, n); record.gaPerGame = per(record.ga, n);
  record.cleanSheets = ms.filter(x => x.ga === 0).length;
  record.conceded3plus = ms.filter(x => x.ga >= 3).length;
  record.close = ms.filter(x => Math.abs(x.gf - x.ga) <= 1).length;
  const season = {
    games: num(club.gamesPlayed), w: num(club.wins), d: num(club.ties), l: num(club.losses),
    gf: num(club.goals), ga: num(club.goalsAgainst),
    gfPerGame: per(num(club.goals), num(club.gamesPlayed)), gaPerGame: per(num(club.goalsAgainst), num(club.gamesPlayed)),
    winStreak: num(club.wstreak), unbeatenStreak: num(club.unbeatenstreak),
  };

  // serie nella finestra di partite disponibile (dalla piu' recente)
  const rev = [...ms].reverse();
  const run = pred => { let k = 0; for (const x of rev) { if (!pred(x)) break; k++; } return k; };
  const streaks = {
    winning: run(x => x.result === 'V'), unbeaten: run(x => x.result !== 'S'),
    cleanSheetRun: run(x => x.ga === 0), concedingRun: run(x => x.ga > 0),
  };

  // coppie: partite insieme, risultato del club insieme vs resto
  const names = [...new Set(ms.flatMap(x => x.names))];
  const pairs = [];
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    const A = names[i], B = names[j];
    // insieme = entrambi almeno 45' e nessuno espulso; senza la coppia = almeno uno dei due assente;
    // gare con spezzoni o espulsioni escluse da entrambi i gruppi.
    const together = ms.filter(x => x.status[A] === 'full' && x.status[B] === 'full');
    if (together.length < 4) continue;
    const rest = ms.filter(x => !x.status[A] || !x.status[B]);
    const ppg = mean(together.map(x => pts(x.result))), gaPG = mean(together.map(x => x.ga));
    const ppgR = rest.length ? mean(rest.map(x => pts(x.result))) : null, gaR = rest.length ? mean(rest.map(x => x.ga)) : null;
    const valid = together.length >= MIN_ONOFF && rest.length >= MIN_ONOFF && Math.abs(ppg - ppgR) >= 0.5 && (ppg > ppgR ? gaPG < gaR : gaPG > gaR);
    pairs.push({
      a: A, b: B, n: together.length, w: together.filter(x => x.result === 'V').length, d: together.filter(x => x.result === 'P').length,
      l: together.filter(x => x.result === 'S').length,
      ppg, gfPerGame: mean(together.map(x => x.gf)), gaPerGame: gaPG,
      ppgRest: valid ? ppgR : null, gaRest: valid ? gaR : null, nRest: rest.length,
    });
  }
  pairs.forEach(p => { p.delta = p.ppgRest != null ? p.ppg - p.ppgRest : null; });
  const ranked = pairs.filter(p => p.delta != null).sort((x, y) => y.delta - x.delta);
  const bestPairs = ranked.slice(0, 3).filter(p => p.delta > 0);
  const worstPairs = ranked.slice(-3).reverse().filter(p => p.delta < 0);

  // reparti (stagionali, pesati per presenze, solo Pro con >=3 presenze)
  const units = {};
  for (const p of players) {
    if (p.games < 3 || !p.rating) continue;
    const u = units[p.family] = units[p.family] || {family: p.family, players: [], games: 0, ratingW: 0, passW: 0, passG: 0};
    u.players.push(p.name); u.games += p.games; u.ratingW += p.rating * p.games;
    if (p.passPct) { u.passW += p.passPct * p.games; u.passG += p.games; }
  }
  const unitList = Object.values(units).map(u => ({family: u.family, players: u.players, rating: u.ratingW / u.games, passPct: u.passG ? u.passW / u.passG : null}));
  const regulars = players.filter(p => p.games >= 8 && p.rating).sort((x, y) => x.rating - y.rating);
  const weakestPlayer = regulars[0] || null;
  const weakestUnit = [...unitList].sort((x, y) => x.rating - y.rating)[0] || null;
  const missingFamilies = ['dif', 'por'].filter(f => !players.some(p => p.sample && p.family === f));

  // dipendenza dal capocannoniere (stagionale e sulle gare disponibili)
  const scorers = [...players].sort((x, y) => y.goals - x.goals);
  const top = scorers[0];
  const sampleGoals = sum(players, p => p.goalsSample || 0);
  const topSample = [...players].sort((x, y) => (y.goalsSample || 0) - (x.goalsSample || 0))[0];
  const dependence = top ? {
    name: top.name, goals: top.goals, share: pct(top.goals, season.gf),
    sampleName: topSample?.name, sampleShare: sampleGoals ? pct(topSample.goalsSample || 0, sampleGoals) : null,
  } : null;

  const dif = f => (f === 'att' ? 'attacco' : f === 'mid' ? 'centrocampo' : f === 'dif' ? 'difesa' : 'porta');
  const lines = [];
  if (n) lines.push(`Ultime ${n} gare: ${record.w}V ${record.d}P ${record.l}S, ${record.gf}-${record.ga} (${record.ppg.toFixed(2)} punti a gara); ${record.cleanSheets} porte inviolate e ${record.conceded3plus} gare con 3 o più gol subiti.`);
  if (season.games) lines.push(`Stagione EA: ${season.gfPerGame.toFixed(2)} gol fatti e ${season.gaPerGame.toFixed(2)} subiti a gara in ${season.games} partite.`);
  if (weakestUnit) lines.push(`Reparto con la media più bassa: ${dif(weakestUnit.family)} (${weakestUnit.rating.toFixed(2)} di media pesata sulle presenze).`);
  if (weakestPlayer) lines.push(`Anello debole tra i titolari (≥8 presenze): ${weakestPlayer.name}, media ${weakestPlayer.rating.toFixed(1)}.`);
  if (bestPairs[0]) lines.push(`Con ${bestPairs[0].a} e ${bestPairs[0].b} insieme il club ha totalizzato ${bestPairs[0].ppg.toFixed(2)} punti a gara in ${bestPairs[0].n} gare, ${bestPairs[0].ppgRest.toFixed(2)} nelle ${bestPairs[0].nRest} senza la coppia.`);
  if (worstPairs[0]) lines.push(`Con ${worstPairs[0].a} e ${worstPairs[0].b} insieme il club ha totalizzato ${worstPairs[0].ppg.toFixed(2)} punti a gara in ${worstPairs[0].n} gare, ${worstPairs[0].ppgRest.toFixed(2)} nelle ${worstPairs[0].nRest} senza la coppia.`);
  if (dependence && dependence.share != null) lines.push(`Dipendenza dal capocannoniere: ${dependence.name} ha il ${Math.round(dependence.share)}% dei gol stagionali del club (${dependence.goals} su ${season.gf}).`);
  if (streaks.winning >= 3) lines.push(`Serie aperta: ${streaks.winning} vittorie consecutive.`);
  else if (streaks.unbeaten >= 4) lines.push(`Serie aperta: ${streaks.unbeaten} gare senza sconfitte.`);

  const dataLimits = [
    `Storico partite disponibile: solo ${n} gare con statistiche individuali; le medie stagionali EA coprono più partite ma senza dettaglio per gara.`,
    'match_event_aggregate_0..3: codici evento EA non documentati, non decodificabili con certezza; ignorati.',
    'Passaggi progressivi, passaggi chiave, xG, posizione media e minuti esatti: non presenti nei dati EA, non stimati.',
    'Campi cleansheets* sempre 0 anche nelle gare a rete inviolata: le porte inviolate sono ricavate dai gol subiti del club.',
    'realtimegame ha valori incoerenti tra gare: i minuti sono ricavati da secondsPlayed / gameTime.',
    'Precisione passaggi stagionale arrotondata all\'intero da EA: i passaggi tentati stagionali sono una stima (passesMade / %).',
    'I confronti con/senza un Pro o una coppia compaiono solo con almeno 10 gare per gruppo (minimo 45\', gare con espulsioni escluse) e sono correlazioni, non cause.',
  ];
  return {clubId, record, season, streaks, pairs, bestPairs, worstPairs, units: unitList, weakestUnit, weakestPlayer, missingFamilies, dependence, lines, dataLimits, players};
}
