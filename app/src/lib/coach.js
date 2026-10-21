import { appearancesFor, buildAll } from '../../../shared/metrics.mjs';
import { commentFor, commentForNight } from '../../../shared/commentary.mjs';

/** Commenti da allenatore per nome Pro, calcolati su stagione e storico partite. */
export function buildCoachComments(data) {
  const out = new Map();
  for (const metrics of buildAll(data)) {
    if (metrics.games > 0) out.set(metrics.name.toLowerCase(), commentFor(metrics));
  }
  return out;
}

/**
 * Fascicoli di una serata: ogni Pro è giudicato per il ruolo (o i ruoli) giocato
 * in quella serata. `nightGames` = partite grezze della serata scelta.
 */
export function buildNightComments(data, nightGames = [], all = buildAll(data)) {
  const out = new Map();
  for (const metrics of all) {
    if (metrics.games <= 0) continue;
    const apps = appearancesFor(nightGames, metrics.name);
    out.set(
      metrics.name.toLowerCase(),
      apps.length ? commentForNight(metrics, apps) : commentFor(metrics),
    );
  }
  return out;
}
