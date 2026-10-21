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
    elite: 'livello alto, con riserva.',
    buono: 'buono, ma non basta.',
    medio: 'utile, mai decisivo.',
    rimandato: 'rimandato dai numeri.',
    bocciato: 'bocciato dai numeri.',
  };
  if (!verdict || !byTier[verdict.tier]) return 'Campione troppo corto per giudicare.';
  const role = verdict.nightRoleText
    ? ` · ${verdict.nightRoleText}`
    : metrics?.proPosLabel
      ? ` · ${metrics.proPosLabel}`
      : '';
  return `Stagione ${formatRating(metrics?.rating ?? null)}${role}: ${byTier[verdict.tier]}`;
}

/** Elogio, accusa, prova e verdetto ironico per un Pro. */
export function buildTrial(
  player,
  salt,
  seed = charCodeSum(player.name + salt),
) {
  const comments = buildGradeComments(player, seed);
  const goalsPerGame = player.goals / Math.max(1, player.games);
  const missedPasses = Math.max(0, player.passAttempts - player.passes);
  const missedTackles = Math.max(0, player.tackleAttempts - player.tackles);
  let charge;
  let proof;
  let verdict;
  const pick = (options) => options[seed % options.length];
  player.reds
    ? ((charge = `${player.reds} rossi. Ha prenotato la doccia prima degli altri.`),
      (proof = `${player.reds} espulsioni in ${player.games} presenze.`),
      (verdict =
        'La qualità va lasciata in campo. Il prossimo colpo di genio può risparmiarsi il cartellino.'))
    : player.shots >= 3 &&
        player.goals / player.shots < 0.3 &&
        !(player.roles?.length && player.roles.every((role) => role === 'defender' || role === 'goalkeeper'))
      ? ((charge = pick([
          'Il portiere avversario sta valutando di mandargli un biglietto di ringraziamento.',
          'Tanta produzione al tiro. Il tabellino, però, non accetta preventivi.',
          'La porta è un obiettivo, non un suggerimento geografico.',
          'Il pallone vuole la rete. Lui, ogni tanto, gli concede un anno sabbatico.',
          'Le conclusioni ci sono. Il killer instinct ha chiesto un permesso retribuito.',
          'Il tabellino non assegna gol per entusiasmo: serve il colpo che chiude il discorso.',
        ])),
        (proof = `${player.goals} gol su ${player.shots} tiri: conversione ${Math.round((player.goals / player.shots) * 100)}%. Non distingue tiri fuori, parati o bloccati.`),
        (verdict =
          player.assists >= 2
            ? `La rifinitura lo difende (${player.assists} assist). La finalizzazione resta il prossimo esame.`
            : 'Il volume è agli atti. Ora servono più reti per ogni tentativo.'))
      : player.passAttempts >= 10 &&
          player.passPct !== null &&
          player.passPct < 85
        ? ((charge = pick([
            'Il compagno chiede un pallone, non una promessa elettorale.',
            'Il possesso non è una raccolta fondi per gli avversari.',
            'La visione di gioco c’è. Ogni tanto i piedi leggono un altro copione.',
            'Prima del passaggio della vita, facciamo riuscire quello della serata.',
            'Nel fraseggio serve meno improvvisazione: il compagno non è un investigatore privato.',
            'Il pallone non scotta. Si può tenere abbastanza a lungo da passarlo bene.',
          ])),
          (proof = `${missedPasses} passaggi non riusciti su ${player.passAttempts}; precisione ${player.passPct}%.`),
          (verdict =
            player.goals + player.assists
              ? `I ${player.goals + player.assists} gol + assist gli danno argomenti. La precisione deve raggiungere l’ambizione.`
              : 'La partecipazione alla manovra è registrata. L’esecuzione va ripulita.'))
        : player.tackleAttempts >= 4 &&
            player.tackles / player.tackleAttempts < 0.5
          ? ((charge = pick([
              'La garra si sente. Il recupero del pallone, un po’ meno.',
              'Ha presentato domanda per ogni duello. Troppi colloqui senza assunzione.',
              'L’aggressività fa rumore; il pallone si riprende con un intervento riuscito.',
              'Entrare nel contrasto è il primo capitolo. Uscirne col pallone sarebbe il finale preferito.',
            ])),
            (proof = `${player.tackles} contrasti riusciti su ${player.tackleAttempts}; ${missedTackles} tentativi non riusciti.`),
            (verdict =
              'La voglia di intervenire è agli atti. Il duello deve diventare più efficace, oltre che più rumoroso.'))
          : ((charge = pick([
              'L’accusa non trova un difetto netto. Non è il momento di farsi costruire una statua.',
              'Le cifre lo difendono. Il contratto da fenomeno resta da rinnovare alla prossima gara.',
              'Per questa volta il tribunale resta senza munizioni. Il parcheggio dello stadio conserva il vecchio nome.',
              'Nessuna criticità evidente da inchiodare ai numeri. La prossima partita riapre comunque il fascicolo.',
              'Il tabellino non offre un bersaglio serio. Nessun difetto netto nei numeri.',
              'Oggi niente condanna statistica. Il posto nell’Olimpo si conferma col prossimo pallone.',
            ])),
            (proof = `Media EA ${formatRating(player.rating)}, ${player.games} presenze, ${player.goals} gol e ${player.assists} assist.`),
            (verdict =
              'Assolto sulle cifre di questa serata. La continuità si dimostra nelle prossime presenze.'));
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
    praise: comments.positive,
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
        charge: `Il fascicolo di ${player.name}: ${trial.proof} La prossima partita può migliorare la risposta; per ora la statua resta in magazzino.`,
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
