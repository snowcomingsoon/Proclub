import { toNumber } from './stats.js';

const MIN_BASE_GAMES = 5;

/**
 * Presenze da difensore dalle partite archiviate e punteggio di classifica "pesato":
 * le gare giocate in difesa sostituiscono i loro gol + assist con la media che il Pro
 * fa nelle altre gare (solo con almeno 5 gare fuori dalla difesa).
 */
export function defenseProfile(matchHistory, member, clubId) {
  const total = toNumber(member.goals) + toNumber(member.assists);
  let defGames = 0, defGA = 0, baseGames = 0, baseGA = 0;
  for (const match of matchHistory || []) {
    const players = Object.values((match.players || {})[clubId] || {});
    const row = players.find((p) => p.playername === member.name);
    if (!row) continue;
    const ga = toNumber(row.goals) + toNumber(row.assists);
    if (row.pos === 'defender') { defGames += 1; defGA += ga; }
    else { baseGames += 1; baseGA += ga; }
  }
  const weighted = defGames && baseGames >= MIN_BASE_GAMES
    ? Math.max(total - defGA + defGames * (baseGA / baseGames), 0)
    : total;
  return { defGames, defGA, baseGames, total, weighted, adjusted: weighted !== total };
}

/** Rosa con `defense` per ciascun Pro, ordinata per punteggio pesato, poi gol + assist reali, gol, presenze, nome. */
export function rankMembers(members, matchHistory, clubId) {
  return members
    .map((member) => ({ ...member, defense: defenseProfile(matchHistory, member, clubId) }))
    .sort(
      (a, b) =>
        b.defense.weighted - a.defense.weighted ||
        b.defense.total - a.defense.total ||
        toNumber(b.goals) - toNumber(a.goals) ||
        toNumber(b.gamesPlayed) - toNumber(a.gamesPlayed) ||
        a.name.localeCompare(b.name),
    );
}
