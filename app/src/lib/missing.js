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

const plural = (n, one, many) => (n === 1 ? `${n} ${one}` : `${n} ${many}`);

/**
 * Partite non restituite da EA e ricostruite dai contatori, per serata (`health.unlisted`, altrimenti
 * `collectionStatus.unlisted` del monolite). La serata è quella di `since`; le voci definitive e quella in attesa
 * della stessa serata si sommano (Pro uniti per nome).
 */
export function reconstructedByNight(health, data) {
  const source = health?.unlisted || data?.collectionStatus?.unlisted;
  const out = new Map();
  const entries = [...(source?.final || []), ...(source?.pending ? [source.pending] : [])];
  for (const entry of entries) {
    const time = Date.parse(entry?.since);
    const games = Number(entry?.games);
    if (!Number.isFinite(time) || !(games > 0)) continue;
    const day = sessionDay(time / 1000, TZ);
    const sum = out.get(day) || { games: 0, wins: 0, ties: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, players: [] };
    sum.games += games;
    for (const key of ['wins', 'ties', 'losses', 'goalsFor', 'goalsAgainst']) sum[key] += Number(entry[key]) || 0;
    for (const p of entry.players || []) {
      const row = sum.players.find((x) => x.name.toLowerCase() === String(p.name).toLowerCase());
      if (row) {
        row.games += Number(p.games) || 0;
        row.goals += Number(p.goals) || 0;
        row.assists += Number(p.assists) || 0;
      } else sum.players.push({ name: String(p.name), games: Number(p.games) || 0, goals: Number(p.goals) || 0, assists: Number(p.assists) || 0 });
    }
    out.set(day, sum);
  }
  for (const sum of out.values()) sum.players.sort((a, b) => b.games - a.games || b.goals - a.goals || a.name.localeCompare(b.name));
  return out;
}

/** Nota sobria con la ricostruzione dai contatori di EA. */
export function reconstructedNote(r) {
  const n = r.games;
  const present = r.players.map((p) => `${p.name} (${plural(p.games, 'partita', 'partite')}, ${plural(p.goals, 'gol', 'gol')}, ${p.assists} assist)`);
  return `EA non ha restituito ${n === 1 ? 'una partita' : `${n} partite`} di questa serata: dai contatori ${n === 1 ? 'risulta' : 'risultano'} ${r.wins}V ${r.ties}P ${r.losses}S, gol ${r.goalsFor}–${r.goalsAgainst}${present.length ? `; ${present.length === 1 ? 'presente' : 'presenti'}: ${present.join(', ')}` : ''}. ${n === 1 ? 'Non compare' : 'Non compaiono'} nel dettaglio per partita.`;
}

/**
 * Note da mostrare per una serata: la ricostruzione (se c'è) e, solo per le partite in più contate da EA che la
 * ricostruzione non copre, la nota di conteggio. Nessun doppio conteggio.
 */
export function nightNotes(missing, rebuilt) {
  const notes = [];
  if (rebuilt) notes.push(reconstructedNote(rebuilt));
  const rest = Math.max(0, (Number(missing) || 0) - (rebuilt?.games || 0));
  if (rest > 0) notes.push(missingNote(rest));
  return notes;
}
