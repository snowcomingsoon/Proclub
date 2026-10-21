import { groupByNight, summarizeNight } from './matches.js';
import { toNumber } from './stats.js';

/** Frasi "cosa ha portato" / "dove serve qualità" per un Pro, scelte in modo deterministico da `variant`. */
export function buildGradeComments(stats, variant = 0) {
  const pick = (options) => options[variant % options.length];
  const praise = [];
  const criticism = [];
  const goalsPerGame = stats.goals / Math.max(1, stats.games);
  const assistsPerGame = stats.assists / Math.max(1, stats.games);
  stats.assists > stats.goals &&
    stats.assists > 0 &&
    praise.push(
      pick([
        `La rifinitura è il suo territorio: ${stats.assists} assist in ${stats.games} gare. Il suo ultimo passaggio ha prodotto gol, non soltanto possesso.`,
        `Fa segnare gli altri: ${stats.assists} assist. La sua qualità pesa soprattutto nella preparazione della conclusione; il contributo è quello di un rifinitore decisivo.`,
        `${stats.assists} assist: mette sostanza nel servizio ai compagni. La prestazione vive nel passaggio che precede il gol.`,
        `L’impronta è nella rifinitura, con ${assistsPerGame.toFixed(2)} assist per gara. La giocata non finisce nei suoi piedi: diventa il gol di un compagno.`,
      ]),
    );
  stats.goals &&
    praise.push(
      pick([
        `${stats.goals} gol: presenza concreta in finalizzazione${goalsPerGame >= 1 ? ', con almeno una rete per presenza di media' : ''}. Ha portato peso al tabellino.`,
        `Davanti lascia il segno: ${stats.goals} reti in ${stats.games} presenze. La produzione offensiva ha un risultato concreto.`,
        `Il contributo sotto porta è di ${stats.goals} gol. Non soltanto partecipazione: conclusioni trasformate in reti.`,
        `${goalsPerGame.toFixed(2)} gol per gara: la sua parte di attacco si misura nell’efficacia realizzativa.`,
      ]),
    );
  stats.assists &&
    stats.assists <= stats.goals &&
    praise.push(
      `Ai gol affianca ${stats.assists} assist: sa contribuire anche alla conclusione degli altri.`,
    );
  stats.passPct !== null &&
    stats.passPct >= 85 &&
    stats.passAttempts >= 10 &&
    praise.push(
      pick([
        `Pulizia nella distribuzione: ${stats.passPct}% nei passaggi (${stats.passes}/${stats.passAttempts}). La trasmissione del pallone è una base affidabile.`,
        `Precisione tecnica all’${stats.passPct}% su ${stats.passAttempts} passaggi: il dato premia l’esecuzione nella circolazione.`,
        `${stats.passes} passaggi riusciti e ${stats.passPct}% di precisione: una prova ordinata con il pallone.`,
        `Nel fraseggio mantiene un’alta precisione: ${stats.passPct}% di passaggi riusciti. La qualità è nella continuità dell’esecuzione.`,
      ]),
    );
  stats.tackles &&
    praise.length < 2 &&
    praise.push(
      `${stats.tackles} contrasti riusciti su ${stats.tackleAttempts}: aggiunge sostanza nei duelli e nel recupero del pallone.`,
    );
  stats.saves &&
    praise.unshift(
      `${stats.saves} parate: la sua prestazione trova peso negli interventi a protezione della porta.`,
    );
  praise.length ||
    praise.push(
      `${stats.games} presenze, ${stats.passes} passaggi riusciti e ${stats.tackles} contrasti. Il lavoro registrato è soprattutto nella partecipazione alla manovra e nei duelli; il contributo diretto al gol è ancora da costruire.`,
    );
  const missedPasses = Math.max(0, stats.passAttempts - stats.passes);
  const missedTackles = Math.max(0, stats.tackleAttempts - stats.tackles);
  stats.reds &&
    criticism.push(
      `${stats.reds} espulsioni: la disciplina è l’aspetto su cui lavorare. Il contributo va cercato col pallone, evitando gli interventi in ritardo.`,
    );
  stats.shots >= 5 &&
    stats.goals / stats.shots < 0.3 &&
    criticism.push(
      pick([
        `${stats.goals} gol su ${stats.shots} tiri: la finalizzazione può crescere. Il lavoro al tiro c’è, ora si tratta di trasformarlo in reti.`,
        `La conversione è ${Math.round((stats.goals / stats.shots) * 100)}%: ${stats.shots - stats.goals} tiri senza rete. Il volume è buono, la scelta della conclusione può migliorare.`,
        `${stats.shots} conclusioni per ${stats.goals} gol: la produzione al tiro può diventare più concreta con un po’ più di lucidità.`,
        `Sotto porta c’è margine: ${stats.goals}/${stats.shots}. Il volume c’è, manca ancora qualche rete in più per tentativo.`,
      ]),
    );
  missedPasses &&
    stats.passAttempts >= 10 &&
    stats.passPct !== null &&
    stats.passPct < 72 &&
    criticism.push(
      pick([
        `La trasmissione può diventare più pulita: ${missedPasses} passaggi non riusciti, precisione ${stats.passPct}%. Qualche appoggio più semplice aiuta il possesso.`,
        `${stats.passPct}% nei passaggi: ${missedPasses} errori su ${stats.passAttempts} tentativi. Il fraseggio ha margine di miglioramento nell’esecuzione.`,
        `Con ${missedPasses} passaggi non riusciti, la pulizia tecnica è il punto da curare: scelte più sicure, un tocco in meno.`,
        `Distribuzione al ${stats.passPct}%: c’è margine nei passaggi. L’idea di gioco c’è, l’esecuzione può accompagnarla meglio.`,
        `${missedPasses}/${stats.passAttempts} passaggi non arrivano: l’obiettivo è la precisione nell’esecuzione.`,
        `Il ${stats.passPct}% nei passaggi lascia spazio per migliorare il fraseggio: ${missedPasses} tentativi non riusciti da trasformare in possesso.`,
      ]),
    );
  missedTackles >= 4 &&
    stats.tackleAttempts >= 8 &&
    stats.tackles / stats.tackleAttempts < 0.5 &&
    criticism.push(
      pick([
        `Nei contrasti riesce in ${stats.tackles} tentativi su ${stats.tackleAttempts}: l’efficacia del duello può crescere con più posizione.`,
        `${missedTackles} contrasti non riusciti: il dato indica margine nell’intervento, con tempi da affinare.`,
        `Il bilancio dei duelli è ${stats.tackles}/${stats.tackleAttempts}: c’è da migliorare la riuscita del contrasto.`,
        `Molti tentativi di contrasto senza recupero (${missedTackles}): l’impegno c’è, può diventare più efficace.`,
      ]),
    );
  criticism.length ||
    criticism.push(
      pick([
        'Non emerge un aspetto da correggere in modo netto nelle cifre della serata. Ora l’obiettivo è confermarsi.',
        'I numeri non isolano criticità evidenti. Il prossimo passo è ripetere la prova.',
        'Nessuna sbavatura significativa nelle cifre. La continuità si dimostra nella prossima partita.',
        'La prova non offre rilievi statistici concreti: si guarda alla prossima gara.',
      ]),
    );
  return {
    positive: praise.slice(0, 2).join(' '),
    negative: criticism.slice(0, 2).join(' '),
  };
}

/** Voti EA per Pro: stagione, ultima serata e ultime 15 gare in archivio. */
export function buildGradeRows(members, matches) {
  const uniqueMatches = [
    ...new Map(matches.map((match) => [match.matchId, match])).values(),
  ].sort((a, b) => b.timestamp - a.timestamp);
  const recentMatches = uniqueMatches.slice(0, 15);
  const latestNight = groupByNight(uniqueMatches)[0];
  const recentPlayers = summarizeNight(recentMatches).players;
  const nightPlayers = summarizeNight(latestNight?.games || []).players;
  const names = [
    ...new Set([
      ...members.map((member) => member.name),
      ...recentPlayers.map((player) => player.name),
    ]),
  ];
  return {
    windowSize: recentMatches.length,
    nightGames: latestNight?.games.length || 0,
    nightDate: latestNight?.day,
    rows: names
      .map((name) => {
        const seasonRow = members.find(
          (member) => member.name.toLowerCase() === name.toLowerCase(),
        );
        const recentRow = recentPlayers.find(
          (player) => player.name.toLowerCase() === name.toLowerCase(),
        );
        const eveningRow = nightPlayers.find(
          (player) => player.name.toLowerCase() === name.toLowerCase(),
        );
        return {
          name,
          season:
            toNumber(seasonRow?.gamesPlayed) > 0 &&
            toNumber(seasonRow?.ratingAve) > 0
              ? toNumber(seasonRow?.ratingAve)
              : null,
          seasonGames: toNumber(seasonRow?.gamesPlayed),
          recent: recentRow?.rating ?? null,
          recentGames: recentRow?.ratedGames || 0,
          evening: eveningRow?.rating ?? null,
          eveningGames: eveningRow?.ratedGames || 0,
          session: eveningRow,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
