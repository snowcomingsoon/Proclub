'use strict';
// Verify delivery, independently of EA collection. No writes to the archive.
const fs = require('node:fs');
const path = require('node:path');
function compare(expected, actual, now = Date.now()) {
  const issues = [];
  if (!actual?.club?.[0] || !Array.isArray(actual.matchHistory)) return ['Risposta pubblica non valida'];
  if (!Number.isFinite(Date.parse(actual.capturedAt)) || Date.parse(actual.capturedAt) < Date.parse(expected.capturedAt)) issues.push(`Versione vecchia: ${actual.capturedAt}, attesa almeno ${expected.capturedAt}`);
  if (!Number.isFinite(Date.parse(actual.capturedAt)) || now - Date.parse(actual.capturedAt) > 90 * 60000) issues.push('Raccolta ferma: dati più vecchi di 90 minuti');
  const ids = new Set(actual.matchHistory.map(m => String(m.matchId)));
  const missing = (expected.matchHistory || []).filter(m => !ids.has(String(m.matchId))).map(m => String(m.matchId));
  if (missing.length) issues.push(`Tabellini salvati ma non pubblicati: ${missing.join(', ')}`);
  return issues;
}
async function check({expected, base, fetchFn = fetch, wait = ms => new Promise(r => setTimeout(r, ms)), attempts = 4, delay = 60000, now = Date.now}) {
  const observations = [];
  for (let attempt = 0; attempt < attempts; attempt++) {
    // Check the exact URL used by visitors; then force a new edge request to recover a stale cache.
    for (const recovery of [false, true]) {
      const url = new URL('/api/data', base);
      if (recovery) url.searchParams.set('deliveryCheck', String(Date.now()));
      let issues;
      try {
        const response = await fetchFn(url, {cache: 'no-store', signal: AbortSignal.timeout(20000)});
        if (!response.ok) throw Error(`HTTP ${response.status}`);
        issues = compare(expected, await response.json(), now());
      } catch (e) { issues = [e.message]; }
      observations.push({at: new Date().toISOString(), attempt: attempt + 1, recovery, issues});
      // A cache-busted success is useful recovery evidence, but cannot certify the ordinary URL.
      if (!recovery && !issues.length) return {healthy: true, observations};
    }
    if (attempt + 1 < attempts) await wait(delay);
  }
  return {healthy: false, observations};
}
async function main() {
  const expected = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/data.json'), 'utf8'));
  const report = await check({expected, base: 'https://billocchi-club-omega.vercel.app/'});
  fs.writeFileSync('public-delivery-report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  if (!report.healthy) process.exitCode = 1;
}
if (require.main === module) main().catch(e => {console.error(e); process.exitCode = 1;});
module.exports = {compare, check};
