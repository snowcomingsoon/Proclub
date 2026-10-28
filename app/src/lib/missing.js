import { sessionDay } from '../../../shared/session.mjs';

const TZ = 'Europe/Rome';

/**
 * Partite che il contatore del club di EA conta in più di quelle restituite, per serata.
 * Fonti: `health.pendingMissing` (in attesa) e `writtenOff` (già considerate perse da EA); in mancanza
 * dello stato di salute, il blocco `collectionStatus` del monolite (problemi `missing_matches`).
 * La serata è quella in cui il buco è stato visto per la prima volta.
 */
export function missingByNight(health, data) {
  const out = new Map();
  const add = (since, count) => {
    const time = Date.parse(since);
    const n = Number(count);
    if (!Number.isFinite(time) || !(n > 0)) return;
    const day = sessionDay(time / 1000, TZ);
    out.set(day, (out.get(day) || 0) + n);
  };
  const status = data?.collectionStatus;
  const pending = health?.pendingMissing
    ? health.pendingMissing
    : (status?.issues || [])
        .filter((issue) => issue.kind === 'missing_matches')
        .map((issue) => ({ since: issue.firstSeen, count: issue.missing }));
  for (const entry of pending) add(entry.since, entry.count);
  const written = health?.writtenOff || status?.writtenOff || [];
  for (const entry of written) if (entry.scope === 'club') add(entry.since, entry.count);
  return out;
}

export const missingNote = (count) =>
  `EA ha contato ${count === 1 ? 'una partita in più' : `${count} partite in più`} di quelle restituite per questa serata: ${count === 1 ? 'non compare' : 'non compaiono'} nei numeri.`;
