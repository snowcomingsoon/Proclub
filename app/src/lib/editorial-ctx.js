import { buildAll, analyzeClub } from '../../../shared/metrics.mjs';
import { metricsIndex } from '../../../shared/editorial.mjs';
import { getActiveClubId } from './constants.js';

const cache = new WeakMap();

/**
 * Metriche per Pro, indice per nome e analisi di squadra, calcolati una volta per snapshot di dati
 * (e solo quando servono). L'analisi di squadra arriva già pronta da `data.insights` quando
 * il backend l'ha precalcolata con lo stesso motore; altrimenti si ricalcola qui.
 */
export function getEditorialContext(data, clubId = getActiveClubId()) {
  let byClub = cache.get(data);
  if (!byClub) {
    byClub = new Map();
    cache.set(data, byClub);
  }
  let ctx = byClub.get(clubId);
  if (!ctx) {
    let all;
    let byName;
    let club;
    ctx = {
      get all() {
        return (all ??= buildAll(data, clubId));
      },
      get metricsByName() {
        return (byName ??= metricsIndex(this.all));
      },
      get club() {
        return (club ??= data.insights?.club ?? analyzeClub(data, clubId, this.all));
      },
    };
    byClub.set(clubId, ctx);
  }
  return ctx;
}
