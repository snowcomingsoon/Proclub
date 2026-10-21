import { buildAll, analyzeClub } from '../../../shared/metrics.mjs';
import { metricsIndex } from '../../../shared/editorial.mjs';

const cache = new WeakMap();

/**
 * Metriche per Pro, indice per nome e analisi di squadra, calcolati una volta per snapshot di dati
 * (e solo quando servono). L'analisi di squadra arriva già pronta da `data.insights` quando
 * il backend l'ha precalcolata con lo stesso motore; altrimenti si ricalcola qui.
 */
export function getEditorialContext(data) {
  let ctx = cache.get(data);
  if (!ctx) {
    let all;
    let byName;
    let club;
    ctx = {
      get all() {
        return (all ??= buildAll(data));
      },
      get metricsByName() {
        return (byName ??= metricsIndex(this.all));
      },
      get club() {
        return (club ??= data.insights?.club ?? analyzeClub(data, undefined, this.all));
      },
    };
    cache.set(data, ctx);
  }
  return ctx;
}
