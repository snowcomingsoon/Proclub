import {
  coverEditorial,
  turningPointsEditorial,
} from '../../../shared/editorial.mjs';
import { CLUB_ID } from './constants.js';
import {
  formatLongDate,
  formatMatchTime,
  formatRating,
} from './format.js';
import { buildGradeComments } from './grades.js';
import { POSITION_ABBREVIATIONS } from './positions.js';
import { mean, toFiniteNumber } from './stats.js';

/** Somma dei codici carattere: seme deterministico per scegliere i testi. */
const charCodeSum = (text) =>
  [...text].reduce((total, char) => total + char.charCodeAt(0), 0);

/**
 * Copertina critica della serata (titolo, sommario, chiusura, premio). Usa il motore
 * condiviso: `ctx` = { metricsByName, club } da `buildAll` / `analyzeClub`.
 */
export function buildCover(nightStats, gameCount, day = '', ctx = {}) {
  if (!nightStats.players.length)
    return {
      name: 'BILLOCCHI CLUB',
      title: 'La prossima storia aspetta il fischio d’inizio.',
      deck: 'Le prime gare registrate apriranno la prima pagina del club.',
      closing: '',
      balance: '',
      note: '',
      awardLabel: 'IL MIGLIORE DELLA SERATA',
    };
  return coverEditorial({
    day,
    record: {
      wins: nightStats.wins,
      draws: nightStats.draws,
      losses: nightStats.losses,
      goals: nightStats.goals,
      against: nightStats.against,
      games: gameCount,
    },
    winners: nightStats.winners,
    players: nightStats.players,
    metricsByName: ctx.metricsByName,
    club: ctx.club,
  });
}

/** Fino a tre svolte della serata, con testi critici basati sui dati EA delle gare. */
export function buildTurningPoints(games, ctx = {}) {
  return turningPointsEditorial(games, {
    clubId: CLUB_ID,
    metricsByName: ctx.metricsByName,
    fmtTime: formatMatchTime,
  });
}

/** Titolo del fascicolo, dal giudizio del motore e dalla media stagionale (non dai gol). */
export function buildTrialTitle(verdict, metrics) {
  const byTier = {
    elite: 'livello alto, da confermare.',
    buono: 'buono, con spazio per crescere.',
    medio: 'nella media, margine per incidere.',
    rimandato: 'da migliorare.',
    bocciato: 'stagione sotto le attese.',
  };
  if (!verdict || !byTier[verdict.tier]) return 'Campione troppo corto per giudicare.';
  const role = verdict.nightRoleText
    ? ` · ${verdict.nightRoleText}`
    : metrics?.proPosLabel
      ? ` · ${metrics.proPosLabel}`
      : '';
  return `Stagione ${formatRating(metrics?.rating ?? null)}${role}: ${byTier[verdict.tier]}`;
}

/**
 * Elogio (solo oltre l'8 di media), rilievo, prova e verdetto per un Pro.
 * È il testo di riserva, usato quando il motore non ha metriche per quel nome: tono misurato,
 * un solo rilievo e una direzione di lavoro.
 */
export function buildTrial(
  player,
  salt,
  seed = charCodeSum(player.name + salt),
) {
  const comments = buildGradeComments(player, seed);
  const goalsPerGame = player.goals / Math.max(1, player.games);
  const missedPasses = Math.max(0, player.passAttempts - player.passes);
  const missedTackles = Math.max(0, player.tackleAttempts - player.tackles);
  const forwardOnly =
    player.roles?.length && player.roles.every((role) => role === 'forward');
  const passMin = forwardOnly ? 65 : 75;
  let charge;
  let proof;
  let verdict;
  const pick = (options) => options[seed % options.length];
  player.reds
    ? ((charge = `${player.reds} ${player.reds === 1 ? 'rosso' : 'rossi'}: la disciplina è l’aspetto su cui lavorare.`),
      (proof = `${player.reds} espulsioni in ${player.games} presenze.`),
      (verdict =
        'La qualità resta, gli interventi in ritardo vanno evitati nelle prossime gare.'))
    : player.shots >= 5 &&
        player.goals / player.shots < 0.3 &&
        !(player.roles?.length && player.roles.every((role) => role === 'defender' || role === 'goalkeeper'))
      ? ((charge = pick([
          'Il volume al tiro c’è: la conversione può crescere con conclusioni scelte meglio.',
          'Tante conclusioni e poche reti: la finalizzazione è l’aspetto da affinare.',
          'Davanti la porta è stata cercata spesso; manca ancora la rete che chiude il discorso.',
          'Le occasioni non mancano, la precisione sotto porta può migliorare.',
          'La conclusione è da rifinire: più lucidità nella scelta del tiro.',
          'Il lavoro al tiro è visibile, ora si tratta di trasformarlo in reti.',
        ])),
        (proof = `${player.goals} gol su ${player.shots} tiri: conversione ${Math.round((player.goals / player.shots) * 100)}%. Non distingue tiri fuori, parati o bloccati.`),
        (verdict =
          player.assists >= 2
            ? `La rifinitura aiuta (${player.assists} assist). Nelle prossime gare l’obiettivo è la finalizzazione.`
            : 'Il volume è agli atti. Nelle prossime gare l’obiettivo è più reti per ogni tentativo.'))
      : player.passAttempts >= 10 &&
          player.passPct !== null &&
          player.passPct < passMin - 3
        ? ((charge = pick([
            'Nel fraseggio la precisione può crescere: qualche appoggio più semplice aiuta il possesso.',
            'Il palleggio ha margine: scelte più sicure nei passaggi aiuterebbero la squadra.',
            'La visione di gioco c’è; l’esecuzione dei passaggi può diventare più pulita.',
            'La precisione al passaggio è l’aspetto da curare, con appoggi più semplici.',
            'Qualche pallone perso di troppo: il lavoro è sulla pulizia della circolazione.',
            'Nella circolazione c’è margine: meno rischio nei passaggi, più possesso.',
          ])),
          (proof = `${missedPasses} passaggi non riusciti su ${player.passAttempts}; precisione ${player.passPct}%.`),
          (verdict =
            player.goals + player.assists
              ? `I ${player.goals + player.assists} tra gol e assist sono un buon punto di partenza. Nelle prossime gare l’obiettivo è la precisione.`
              : 'La partecipazione alla manovra è registrata. Nelle prossime gare l’obiettivo è ripulire l’esecuzione.'))
        : player.tackleAttempts >= 8 &&
            player.tackles / player.tackleAttempts < 0.5
          ? ((charge = pick([
              'L’impegno nei duelli è evidente; l’efficacia del contrasto può crescere.',
              'Tanti duelli cercati: il passo successivo è recuperare il pallone più spesso.',
              'Si entra con decisione nel contrasto, con tempi di intervento da affinare.',
              'Il lavoro nei duelli c’è, la riuscita può migliorare con più posizione.',
            ])),
            (proof = `${player.tackles} contrasti riusciti su ${player.tackleAttempts}; ${missedTackles} tentativi non riusciti.`),
            (verdict =
              'La voglia di intervenire è agli atti. Nelle prossime gare l’obiettivo è un duello più efficace.'))
          : ((charge = pick([
              'Nelle cifre della serata non emerge un aspetto da correggere in modo netto.',
              'I numeri della serata non indicano criticità evidenti.',
              'Nessun rilievo particolare nei dati di questa serata.',
              'Serata senza aspetti critici nei numeri: il compito è ripeterla.',
              'Il quadro dei numeri è ordinato, senza rilievi da segnalare.',
              'Le cifre non segnalano nulla di particolare da correggere.',
            ])),
            (proof = `Media EA ${formatRating(player.rating)}, ${player.games} presenze, ${player.goals} gol e ${player.assists} assist.`),
            (verdict =
              'Serata senza rilievi sulle cifre. La continuità si dimostra nelle prossime presenze.'));
  return {
    title: player.saves
      ? 'Il custode del risultato.'
      : player.assists > player.goals && player.assists
        ? 'Il servizio ai compagni.'
        : goalsPerGame >= 1
          ? 'Il tabellino lo conosce.'
          : player.goals
            ? 'La firma davanti.'
            : player.tackles
              ? 'Il lavoro nei duelli.'
              : 'La manovra passa anche qui.',
    // elogio solo oltre l'8 di media EA
    praise: player.rating > 8 ? comments.positive : '',
    charge,
    proof,
    verdict,
  };
}

/** Un "processo" per ciascun Pro, evitando accuse identiche. */
export function buildTrials(players, salt) {
  const usedCharges = new Set();
  return players.map((player) => {
    let trial = buildTrial(player, salt);
    let attempt = 0;
    for (; usedCharges.has(trial.charge) && attempt < 12; ) {
      attempt++;
      trial = buildTrial(
        player,
        salt,
        charCodeSum(player.name + salt) + attempt,
      );
    }
    usedCharges.has(trial.charge) &&
      (trial = {
        ...trial,
        charge: `Il fascicolo di ${player.name}: ${trial.proof} La prossima partita è l’occasione per confermare o migliorare il quadro.`,
      });
    usedCharges.add(trial.charge);
    return {
      player,
      trial,
    };
  });
}

/** Andamento dei voti EA di un Pro nell'ultimo reparto giocato (ultime 12 gare con voto). */
export function buildRoleTrend(playerName, matches) {
  const appearances = [
    ...new Map(
      matches
        .filter((match) => match.clubs?.[CLUB_ID])
        .map((match) => [String(match.matchId), match]),
    ).values(),
  ]
    .sort((a, b) => a.timestamp - b.timestamp)
    .flatMap((match) =>
      Object.values(match.players?.[CLUB_ID] || {})
        .filter(
          (player) =>
            player &&
            player.playername.toLowerCase() === playerName.toLowerCase(),
        )
        .map((appearance) => ({
          appearance,
          match,
        })),
    );
  const role = appearances.at(-1)?.appearance.pos;
  const points = appearances
    .filter((entry) => entry.appearance.pos === role)
    .slice(-12)
    .filter((entry) => toFiniteNumber(entry.appearance.rating) > 0)
    .map((entry) => ({
      rating: toFiniteNumber(entry.appearance.rating),
      date: entry.match.timestamp,
      matchId: entry.match.matchId,
    }));
  if (points.length < 4)
    return {
      role: POSITION_ABBREVIATIONS[role || ''] || '—',
      points,
      previous: null,
      recent: null,
      previousCount: 0,
      recentCount: points.length,
      delta: null,
    };
  const half = Math.floor(points.length / 2);
  const previous = mean(points.slice(0, half).map((point) => point.rating));
  const recent = mean(points.slice(half).map((point) => point.rating));
  return {
    role: POSITION_ABBREVIATIONS[role || ''] || role || '—',
    points,
    previous,
    recent,
    previousCount: half,
    recentCount: points.length - half,
    delta: recent - previous,
  };
}

/** Testo da copiare per condividere l'edizione della serata nella chat del club. */
export function buildShareText({ night, nightStats, cover, trials }) {
  if (!night) return '';
  const { winners } = nightStats;
  const bestOfNight = winners.length
    ? `${cover.awardLabel}: ${winners.map((winner) => winner.name).join(' + ')} · media EA ${formatRating(winners[0].rating)}.\n`
    : '';
  const verdicts = trials
    .map(
      ({ player, trial }) =>
        `\n${player.name} · ${formatRating(player.rating)} EA\n${trial.praise ? `A favore: ${trial.praise}\n` : ''}Accusa: ${trial.charge}\nProva: ${trial.proof}\nVerdetto: ${trial.verdict}`,
    )
    .join('\n');
  return `BILLOCCHI · IL GIORNO DOPO\nSerata del ${formatLongDate(night.day)}\n${cover.title}\n${cover.deck}\n${cover.closing ? cover.closing + '\n' : ''}${night.games.length} gare: ${nightStats.wins}V ${nightStats.draws}P ${nightStats.losses}S · ${nightStats.goals} gol fatti, ${nightStats.against} subiti.\n${bestOfNight}${verdicts}\nhttps://billocchi-club.kr3n.chatgpt.site/`;
}
