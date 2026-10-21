const RAI_NEWS_URL =
  'https://www.rainews.it/articoli/2022/12/il-dio-del-calcio-si-chiama-messi-non-solo-per-gli-argentini-4adbf32b-7698-49a9-97f8-d51671071449.html';

const FANPAGE_URL =
  'https://www.fanpage.it/sport/calcio/adani-posseduto-in-telecronaca-messi-e-dentro-di-lui-e-gli-appare-maradona-cosa-abbiamo-visto/';

const UNSHOW_URL = 'https://www.unshow.it/lele-adani-tormentoni';

const REPUBBLICA_URL =
  'https://www.repubblica.it/sport/calcio/2022/11/26/news/adani_esultanza_messi_argentina-376333822/';

const ADANI_QUOTES = [
  {
    id: 'facciamo',
    text: 'Facciamo calcio',
    url: 'https://www.goal.com/it/liste/adani-canzone-testo-significato-citazioni/blt60072252ea0bbab2',
    source: 'GOAL',
    context: 'Il tormentone diventato anche un brano nel 2024.',
    categories: ['quality', 'welcome', 'roast'],
  },
  {
    id: 'garra',
    text: 'La garra charrúa!',
    url: 'https://www.ilgiorno.it/cultura/adani-lascia-sky-a5d4ccda',
    source: 'Il Giorno',
    context: 'Inter–Tottenham, 18 settembre 2018: il gol di Vecino.',
    categories: ['duel', 'quality'],
  },
  {
    id: 'questo',
    text: 'Questo è il calcio!',
    url: 'https://www.ilgiorno.it/cultura/adani-lascia-sky-a5d4ccda',
    source: 'Il Giorno',
    context:
      'Uno dei suoi tormentoni in telecronaca, ricordato l’8 luglio 2021.',
    categories: ['goal', 'quality'],
  },
  {
    id: 'cammelli',
    text: 'Dribbla tutti, anche i cammelli del deserto',
    url: RAI_NEWS_URL,
    source: 'Rai News',
    context:
      'Messi in Argentina–Croazia, 13 dicembre 2022. Qui è una citazione, non una descrizione dei dribbling EA.',
    categories: ['goal', 'quality'],
  },
  {
    id: 'impensato',
    text: 'La dinamica dell’impensato è il football',
    url: RAI_NEWS_URL,
    source: 'Rai News',
    context:
      'Argentina–Croazia, 13 dicembre 2022: l’azione di Messi per il terzo gol.',
    categories: ['assist', 'quality'],
  },
  {
    id: 'alzatevi',
    text: 'Alzatevi in piedi',
    url: RAI_NEWS_URL,
    source: 'Rai News',
    context:
      'Argentina–Croazia, 13 dicembre 2022: l’esaltazione della giocata di Messi.',
    categories: ['goal', 'quality'],
  },
  {
    id: 'palla',
    text: 'Ma che palla ha dato Messi?',
    url: FANPAGE_URL,
    source: 'Fanpage',
    context: 'Argentina–Paesi Bassi, 9 dicembre 2022: l’assist per Molina.',
    categories: ['assist'],
  },
  {
    id: 'piugol',
    text: 'Questo vale più di un gol',
    url: FANPAGE_URL,
    source: 'Fanpage',
    context:
      'Argentina–Paesi Bassi, 9 dicembre 2022: il commento all’assist di Messi.',
    categories: ['assist', 'duel'],
  },
  {
    id: 'viva',
    text: 'Viva el Fútbol',
    url: FANPAGE_URL,
    source: 'Fanpage',
    context:
      'Argentina–Paesi Bassi, 9 dicembre 2022: l’invito a celebrare il calcio.',
    categories: ['assist', 'quality', 'welcome'],
  },
  {
    id: 'allena',
    text: 'Allena di più e parla di meno',
    url: 'https://www.tuttosport.com/news/calcio/2020/02/01-66274654/adani_ancora_contro_allegri_e_bravo_quando_allena_ma_non_quando_parla_',
    source: 'Tuttosport',
    context: 'La frecciata ad Allegri, riportata il 1º febbraio 2020. Una battuta d’archivio, non un giudizio sul Pro.',
    categories: ['welcome'],
  },
  {
    id: 'zitto',
    text: 'Stai zitto lo dici a tuo fratello',
    url: 'https://www.gazzetta.it/Calcio/Serie-A/Juventus/storie/17-02-2023/sfuriate-allegri-bordo-campo-tv-adani-giacca-buttata-460272755247/duello-filosofico-lele-adani.shtml',
    source: 'Gazzetta',
    context:
      'Il confronto televisivo con Allegri: una battuta d’archivio, non un giudizio sul Pro.',
    categories: ['duel'],
  },
  {
    id: 'pranzo',
    text: 'In area di rigore c’è il pranzo al sacco!',
    url: UNSHOW_URL,
    source: 'UnShow',
    context:
      'Israele–Italia, settembre 2025: il finale pieno di gol e disattenzioni difensive.',
    categories: ['goal'],
  },
  {
    id: 'analizza',
    text: 'Nessuno analizza il calcio più di me',
    url: UNSHOW_URL,
    source: 'UnShow',
    context:
      'La rivendicazione sulla Bobo TV, ricordata nella raccolta dei tormentoni.',
    categories: ['quality', 'welcome'],
  },
  {
    id: 'effe',
    text: 'Il calcio con la Effe',
    url: UNSHOW_URL,
    source: 'UnShow',
    context: 'Uno dei tormentoni della Bobo TV.',
    categories: ['quality', 'welcome', 'roast'],
  },
  {
    id: 'complesso',
    text: 'Il calcio non è semplice',
    url: 'https://www.pianetamilan.it/news-milan/interviste/milan-feyenoord-adani-il-calcio-non-e-semplice-se-lo-fosse-stato-i-rossoneri-19-02-2025/',
    source: 'Pianeta Milan',
    context: 'Il commento su Milan–Feyenoord, 19 febbraio 2025.',
    categories: ['roast', 'welcome', 'duel'],
  },
  {
    id: 'spirito',
    text: 'Non c’è posto per i deboli di spirito',
    url: 'https://it.wikiquote.org/wiki/Daniele_Adani',
    source: 'Wikiquote',
    context: 'Brasile–Corea del Sud, 5 dicembre 2022.',
    categories: ['welcome'],
  },
  {
    id: 'sinistro',
    text: 'Il sinistro migliore del Mondo!',
    url: REPUBBLICA_URL,
    source: 'Repubblica',
    context:
      'Messi in Argentina–Messico, 26 novembre 2022. Il piede dei Pro non è deducibile dai dati.',
    categories: ['goal'],
  },
  {
    id: 'rispetto',
    text: 'Rispetto per il numero uno',
    url: REPUBBLICA_URL,
    source: 'Repubblica',
    context: 'Argentina–Messico, 26 novembre 2022: l’omaggio a Messi.',
    categories: ['quality', 'goal'],
  },
];

/** Hash deterministico (stesso testo, stesso ordine) usato per distribuire le citazioni. */
const hashString = (text) =>
  [...text].reduce((total, char) => (total * 31 + char.charCodeAt(0)) >>> 0, 7);

/** Serata giocata soprattutto da difensore o portiere (ruolo prevalente dalle presenze della serata). */
function isDefensiveNight(profile) {
  const counts = profile.roleCounts;
  if (!counts || !Object.keys(counts).length) return false;
  const top = Math.max(...Object.values(counts));
  const primary = Object.keys(counts).filter((pos) => counts[pos] === top);
  return primary.every((pos) => pos === 'defender' || pos === 'goalkeeper');
}

/** Categoria di citazione adatta al profilo: roast, assist, goal, duel, quality o welcome. */
export function classifyProfile(profile) {
  // chi gioca in difesa non è letto per gol e incisività
  if (profile.games && isDefensiveNight(profile)) {
    return (profile.rating !== null && profile.rating < 6.5) ||
      (profile.passPct !== null &&
        profile.passPct !== undefined &&
        profile.passPct < 70)
      ? 'roast'
      : (profile.tackles || 0) > 0 || (profile.saves || 0) > 0
        ? 'duel'
        : 'quality';
  }
  return profile.games
    ? (profile.rating !== null && profile.rating < 6.5) ||
      (profile.passPct !== null &&
        profile.passPct !== undefined &&
        profile.passPct < 70)
      ? 'roast'
      : profile.assists > profile.goals && profile.assists
        ? 'assist'
        : profile.goals >= profile.games * 0.7
          ? 'goal'
          : (profile.tackles || 0) > profile.goals + profile.assists ||
              (profile.saves || 0) > 0
            ? 'duel'
            : 'quality'
    : 'welcome';
}

/** Abbina una citazione a ciascun Pro (senza ripetizioni finché possibile); `salt` varia l'ordine. */
export function assignQuotes(players, salt) {
  const usedIds = new Set();
  return new Map(
    players.map((player) => {
      const category = classifyProfile(player);
      const ranked = [...ADANI_QUOTES].sort(
        (a, b) =>
          Number(b.categories.includes(category)) -
            Number(a.categories.includes(category)) ||
          hashString(player.name + salt + a.id) -
            hashString(player.name + salt + b.id),
      );
      const quote =
        ranked.find((candidate) => !usedIds.has(candidate.id)) || ranked[0];
      usedIds.add(quote.id);
      return [player.name, quote];
    }),
  );
}

/** Riduce un membro EA ai soli campi usati per scegliere la citazione. */
export function toQuotePlayer(member) {
  const count = (value) => Number(value) || 0;
  return {
    name: member.name,
    games: count(member.gamesPlayed),
    goals: count(member.goals),
    assists: count(member.assists),
    rating: count(member.gamesPlayed) ? count(member.ratingAve) : null,
    // Assente/0 = dato mancante: non deve far passare per "roast" un Pro che gioca.
    passPct: count(member.passSuccessRate) || null,
    tackles: count(member.tacklesMade),
  };
}

/**
 * Commento della redazione sotto la citazione: critico ma misurato, basato sui dati del Pro
 * (gol, assist, voto, passaggi), senza spiegare criteri e senza elogi dove i numeri non li reggono.
 * Giudica la prestazione, non la persona, e indica sempre una direzione di lavoro.
 */
export function adaniNote(player) {
  if (!player.games)
    return 'Nessuna presenza: nulla da giudicare, per ora la citazione resta sola.';
  const pick = (options) => options[hashString(player.name) % options.length];
  const { name, goals, assists, games } = player;
  const r = player.rating === null ? null : player.rating.toFixed(2);
  const high = player.rating !== null && player.rating > 8;
  const line = `${name}: ${goals} gol e ${assists} assist in ${games} ${games === 1 ? 'presenza' : 'presenze'}${r ? `, media EA ${r}` : ''}.`;
  const pass =
    player.passPct && player.passPct > 0 ? `${player.passPct}% di passaggi` : '';
  switch (classifyProfile(player)) {
    case 'roast':
      return `${line} ${pick([
        `I numeri chiedono un passo avanti${pass ? `: ${pass}` : ''}, a partire dalla precisione con il pallone.`,
        `Il rendimento è sotto le attese${pass ? ` (${pass})` : ''}: la strada è ritrovare continuità gara dopo gara.`,
        `C’è margine di crescita${pass ? `: ${pass}` : ''}; il lavoro riparte dai fondamentali.`,
      ])}`;
    case 'assist':
      return `${line} ${pick(
        high
          ? [
              'Il servizio ai compagni è di livello alto; resta da limare la costanza.',
              'La rifinitura regge il confronto, ma una citazione di Adani non copre i cali.',
            ]
          : [
              'Serve i compagni; il resto del rendimento è nella norma e può crescere.',
              'La regia c’è a tratti: il voto medio dice che c’è spazio per pesare di più.',
              'Gli assist sono il suo contributo, da far crescere ancora sulle partite.',
            ],
      )}`;
    case 'goal':
      return `${line} ${pick(
        high
          ? [
              'La porta la trova con continuità e il voto lo conferma, con qualche limite fuori dall’area.',
              'Il gol è il suo mestiere e il rendimento regge, ma la citazione è più alta dei suoi difetti.',
            ]
          : [
              'La porta la trova; fuori dall’area può farsi vedere di più.',
              'Il gol è un buon punto di partenza: il voto medio dice che il resto del lavoro può crescere.',
              'Segna, e la media indica margine nel resto del lavoro.',
            ],
      )}`;
    case 'duel':
      if (isDefensiveNight(player))
        return `${line} ${pick([
          'Il lavoro è dietro, tra contrasti e posizione: il voto medio dice quanto ha tenuto.',
          'Un ruolo di tenuta si giudica da come regge la linea, non dal tabellino.',
        ])}`;
      return `${line} ${pick([
        'Più lavoro che incisività: il sacrificio è visibile, il contributo in zona gol può crescere.',
        'Corre e contrasta, il tabellino non lo premia ancora: la strada è la continuità.',
      ])}`;
    default:
      return `${line} ${pick(
        high
          ? [
              'Rendimento alto, con difetti che restano da correggere.',
              'Numeri solidi, ma una citazione non sostituisce la continuità.',
            ]
          : [
              'Rendimento senza picchi: c’è spazio per far salire i numeri.',
              'Dati nella norma: il contributo è utile e può diventare più incisivo.',
              'Il voto medio racconta un contributo regolare, con margine per pesare di più.',
            ],
      )}`;
  }
}
