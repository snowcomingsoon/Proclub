import { CLUB_ID } from './constants.js';

/**
 * Adattatore tra il contratto dati pubblico (summary / history / insights / health) e la forma
 * che i calcoli di `lib/` conoscono da sempre: `{club, members, matches, matchHistory, capturedAt, fresh}`.
 * Funzioni pure: nessun accesso a rete o DOM.
 */

/** Toglie dal sito i profili EA senza presenze. */
export function withPlayingMembers(data) {
  const members = data.members?.members;
  if (!Array.isArray(members)) return data;
  return {
    ...data,
    members: {
      ...data.members,
      members: members.filter((member) => Number(member.gamesPlayed) > 0),
    },
  };
}

/** Tolleranza tra `capturedAt` e `builtAt` degli insight (la costruzione segue la raccolta). */
const INSIGHTS_SKEW_MS = 2 * 60 * 1000;

const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const time = (iso) => Date.parse(iso);

/** Partita completa del BILLOCCHI CLUB (stessa regola di `groupByNight`). */
const isClubMatch = (match) => !!(match && match.matchId && match.clubs?.[CLUB_ID]);

/** `summary.json` utilizzabile? */
export function isValidSummary(summary) {
  return (
    isObject(summary) &&
    Array.isArray(summary.club) &&
    !!summary.club[0] &&
    Array.isArray(summary.members?.members) &&
    Array.isArray(summary.matches) &&
    typeof summary.capturedAt === 'string'
  );
}

/** `history.json` utilizzabile? */
export const isValidHistory = (history) =>
  isObject(history) && Array.isArray(history.matchHistory);

/** `health.json` utilizzabile? */
export const isValidHealth = (health) =>
  isObject(health) && typeof health.checkedAt === 'string' && !Number.isNaN(time(health.checkedAt));

/**
 * Gli insight precalcolati valgono solo se: forma attesa, stessa versione del motore
 * incorporato, stesso elenco di Pro del sito e costruiti dopo (o subito prima, entro la tolleranza) l'ultima rilevazione.
 * @returns {{coach: object, club: object} | null}
 */
export function usableInsights(insights, capturedAt, engineId, playerCount) {
  if (!engineId || !isObject(insights)) return null;
  if (insights.engine !== engineId) return null;
  if (!isObject(insights.coach) || !isObject(insights.club)) return null;
  const built = time(insights.builtAt);
  const captured = time(capturedAt);
  if (Number.isNaN(built) || Number.isNaN(captured)) return null;
  if (built < captured - INSIGHTS_SKEW_MS) return null;
  // Calcolati su un elenco di Pro diverso da quello del sito (es. con profili a zero presenze): testo diverso.
  if (
    playerCount != null &&
    Array.isArray(insights.club.players) &&
    insights.club.players.length !== playerCount
  )
    return null;
  return { coach: insights.coach, club: insights.club };
}

/** Più recente prima, senza doppioni e solo partite del club (ordine del monolite). */
export function normalizeMatches(matches) {
  const byId = new Map();
  for (const match of matches || []) if (isClubMatch(match)) byId.set(String(match.matchId), match);
  return [...byId.values()].sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
}

/**
 * Compone i dati del sito dalle risorse modulari.
 * `fresh` resta quello del summary se c'è (lettura diretta EA): la salute della raccolta
 * vive in `health`, separata, così il polling non invalida i calcoli.
 */
export function buildLiveData({ summary, history, insights, engineId }) {
  // Lo storico vince sui doppioni (record completi); le partite del summary mancanti
  // (storico in ritardo rispetto al summary) si aggiungono.
  const matchHistory = normalizeMatches([...summary.matches, ...(history?.matchHistory || [])]);
  const data = {
    club: summary.club,
    members: summary.members,
    matches: [...summary.matches].sort((a, b) => Number(b.timestamp) - Number(a.timestamp)),
    matchHistory,
    capturedAt: summary.capturedAt,
    fresh: Array.isArray(summary.fresh) ? summary.fresh : [],
  };
  const playerCount = summary.members.members.filter(
    (member) => Number(member.gamesPlayed) > 0,
  ).length;
  const precomputed = usableInsights(insights, summary.capturedAt, engineId, playerCount);
  if (precomputed) data.insights = precomputed;
  return data;
}

/** Blocco "controllo archivio" del footer: da health, altrimenti dal monolite. */
export function collectionStatusOf(health, data) {
  if (health)
    return {
      complete: health.complete !== false,
      checkedAt: health.checkedAt,
      startedAt: health.season?.startedAt,
      issues: [],
    };
  return data?.collectionStatus || null;
}
