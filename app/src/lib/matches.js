import { getActiveClubId } from './constants.js';
import { toFiniteNumber, toNumber } from './stats.js';
import { isWasmReady, wasmInvoke } from './wasm-engine.js';

/** Prestazioni dei Pro del club attivo in una gara EA. */
export const getClubPlayers = (match, clubId = getActiveClubId()) =>
  Object.values(match.players?.[clubId] || {}).filter((player) => !!player);

/** Nome dell'avversario in una gara EA. */
export const getOpponentName = (match, clubId = getActiveClubId()) =>
  Object.entries(match.clubs || {}).find(([cid]) => cid !== clubId)?.[1]
    ?.details?.name || 'Avversario';

/** Data (YYYY-MM-DD) di un timestamp in secondi, nel fuso di Roma. */
function getRomeDate(timestamp) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(toNumber(timestamp) * 1e3));
  return ['year', 'month', 'day']
    .map((partType) => parts.find((part) => part.type === partType)?.value)
    .join('-');
}

/** Giorno della "serata": le gare tra mezzanotte e le 06:00 italiane contano per il giorno prima. */
function getSessionDay(timestamp) {
  const date = new Date(toNumber(timestamp) * 1e3);
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Rome',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(date),
  );
  const romeDate = getRomeDate(timestamp);
  if (hour >= 6) return romeDate;
  const previousDay = new Date(romeDate + 'T12:00:00Z');
  previousDay.setUTCDate(previousDay.getUTCDate() - 1);
  return previousDay.toISOString().slice(0, 10);
}

/** Raggruppa le gare per serata, dalla più recente; dentro ogni serata dalla prima all'ultima. */
export function groupByNight(matches, clubId = getActiveClubId()) {
  const matchesById = new Map(
    matches
      .filter((match) => match.clubs?.[clubId] && match.matchId)
      .map((match) => [String(match.matchId), match]),
  );
  const nights = new Map();
  for (const match of matchesById.values()) {
    const day = getSessionDay(match.timestamp);
    nights.set(day, [...(nights.get(day) || []), match]);
  }
  return [...nights.entries()]
    .sort(([dayA], [dayB]) => dayB.localeCompare(dayA))
    .map(([day, games]) => ({
      day,
      games: games.sort(
        (a, b) => toNumber(a.timestamp) - toNumber(b.timestamp),
      ),
    }));
}

/**
 * Aggrega le prestazioni dei Pro su un insieme di gare (via motore Rust WASM quando attivo):
 * totali per giocatore, miglior media EA (`winners`), record e gol del club.
 */
export function summarizeNight(matches, clubId = getActiveClubId()) {
  if (isWasmReady()) {
    const res = wasmInvoke({ op: 'summarize_night', matches: matches || [], clubId });
    if (res && Array.isArray(res.players)) return res;
  }
  const byPlayer = new Map();
  for (const match of matches)
    for (const [playerId, appearance] of Object.entries(
      match.players?.[clubId] || {},
    )) {
      if (!appearance) continue;
      const record = byPlayer.get(playerId) || {
        id: playerId,
        name: appearance.playername,
        appearances: [],
      };
      record.name = appearance.playername;
      record.appearances.push(appearance);
      byPlayer.set(playerId, record);
    }
  const players = [...byPlayer.values()]
    .map((record) => {
      const sumOf = (key) =>
        record.appearances.reduce(
          (total, appearance) => total + toNumber(appearance[key]),
          0,
        );
      const ratedAppearances = record.appearances.filter(
        (appearance) =>
          Number.isFinite(Number(appearance.rating)) &&
          toNumber(appearance.rating) > 0,
      );
      const goals = sumOf('goals');
      const assists = sumOf('assists');
      const shots = sumOf('shots');
      const passes = sumOf('passesmade');
      const passAttempts = sumOf('passattempts');
      const tackles = sumOf('tacklesmade');
      const tackleAttempts = sumOf('tackleattempts');
      const saves = sumOf('saves');
      const reds = sumOf('redcards');
      const mvps = sumOf('mom');
      return {
        ...record,
        games: record.appearances.length,
        rating: ratedAppearances.length
          ? ratedAppearances.reduce(
              (total, ratedAppearance) =>
                total + toNumber(ratedAppearance.rating),
              0,
            ) / ratedAppearances.length
          : null,
        ratedGames: ratedAppearances.length,
        goals,
        assists,
        shots,
        passes,
        passAttempts,
        tackles,
        tackleAttempts,
        saves,
        reds,
        mvp: mvps,
        roles: [
          ...new Set(record.appearances.map((appearance) => appearance.pos)),
        ],
        roleCounts: record.appearances.reduce((counts, appearance) => {
          counts[appearance.pos] = (counts[appearance.pos] || 0) + 1;
          return counts;
        }, {}),
        passPct: passAttempts
          ? Math.round((passes / passAttempts) * 100)
          : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const required = Math.ceil(matches.length / 2);
  let qualified = players.filter(
    (player) => player.games >= required && player.ratedGames === player.games,
  );
  let fallback = false;
  if (!qualified.length) {
    fallback = true;
    const rated = players.filter(
      (player) => player.ratedGames === player.games && player.rating !== null,
    );
    const maxGames = Math.max(0, ...rated.map((player) => player.games));
    qualified = rated.filter((player) => player.games === maxGames);
  }
  const bestRating = Math.max(
    -1,
    ...qualified.map((player) => player.rating ?? -1),
  );
  const winners = qualified.filter(
    (player) => Math.abs((player.rating ?? -1) - bestRating) < 1e-6,
  );
  const results = matches.map((match) => ({
    match,
    own: match.clubs?.[clubId] || {},
  }));
  return {
    players,
    winners,
    required,
    fallback,
    wins: results.filter(
      (result) =>
        toNumber(result.own.goals) > toNumber(result.own.goalsAgainst),
    ).length,
    draws: results.filter(
      (result) =>
        toNumber(result.own.goals) === toNumber(result.own.goalsAgainst),
    ).length,
    losses: results.filter(
      (result) =>
        toNumber(result.own.goals) < toNumber(result.own.goalsAgainst),
    ).length,
    goals: results.reduce(
      (total, result) => total + toNumber(result.own.goals),
      0,
    ),
    against: results.reduce(
      (total, result) => total + toNumber(result.own.goalsAgainst),
      0,
    ),
  };
}

/** Esito per il club: V (vittoria), P (pareggio), S (sconfitta). */
export const getResultLetter = (match, clubId = getActiveClubId()) => {
  const own = match.clubs?.[clubId] || {};
  return toFiniteNumber(own.goals) > toFiniteNumber(own.goalsAgainst)
    ? 'V'
    : toFiniteNumber(own.goals) < toFiniteNumber(own.goalsAgainst)
      ? 'S'
      : 'P';
};
