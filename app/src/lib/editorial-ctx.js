import { buildAll, analyzeClub } from '../../../shared/metrics.mjs';
import { metricsIndex } from '../../../shared/editorial.mjs';

const cache = new WeakMap();

/** Metriche per Pro, indice per nome e analisi di squadra, calcolati una volta per snapshot di dati. */
export function getEditorialContext(data) {
  let ctx = cache.get(data);
  if (!ctx) {
    const all = buildAll(data);
    ctx = {
      all,
      metricsByName: metricsIndex(all),
      club: analyzeClub(data, undefined, all),
    };
    cache.set(data, ctx);
  }
  return ctx;
}
