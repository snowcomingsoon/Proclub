import { appearancesFor, buildAll } from '../../../shared/metrics.mjs';
import { commentFor, commentForNight } from '../../../shared/commentary.mjs';

/**
 * Commenti da allenatore per nome Pro, calcolati su stagione e storico partite.
 * Se il backend li ha precalcolati con lo stesso motore (`data.insights.coach`) si usano quelli.
 */
export function buildCoachComments(data) {
  const out = new Map();
  if (data.insights?.coach) {
    for (const [name, comment] of Object.entries(data.insights.coach)) out.set(name, comment);
    return out;
  }
  for (const metrics of buildAll(data)) {
    if (metrics.games > 0) out.set(metrics.name.toLowerCase(), commentFor(metrics));
  }
  return out;
}

/**
 * Fascicoli di una serata: ogni Pro è giudicato per il ruolo (o i ruoli) giocato
 * in quella serata. `nightGames` = partite grezze della serata scelta.
 * Senza partite nella serata (o senza ruoli giocati) vale il commento stagionale:
 * precalcolato se disponibile, e in quel caso `all` non serve.
 */
export function buildNightComments(data, nightGames = [], all) {
  const precomputed = data.insights?.coach;
  if (precomputed && !nightGames.length) return buildCoachComments(data);
  const out = new Map();
  for (const metrics of all || buildAll(data)) {
    if (metrics.games <= 0) continue;
    const key = metrics.name.toLowerCase();
    const apps = appearancesFor(nightGames, metrics.name);
    out.set(
      key,
      apps.length
        ? commentForNight(metrics, apps)
        : (precomputed?.[key] ?? commentFor(metrics)),
    );
  }
  return out;
}
