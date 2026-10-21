// Ricava le fixture del contratto dati pubblico (test/fixtures/public/*) da data/data.json.
// Uso: node app/tools/make-fixtures.mjs [percorso/data.json] [cartella-uscita]
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { analyzeClub, buildAll } from '../../shared/metrics.mjs';
import { commentFor } from '../../shared/commentary.mjs';
import { computeEngineId } from './engine-id.mjs';

const require = createRequire(import.meta.url);
const derive = require('../../api/_lib/derive.js');

const input =
  process.argv[2] || fileURLToPath(new URL('../../data/data.json', import.meta.url));
const out =
  process.argv[3] || fileURLToPath(new URL('../../test/fixtures/public/', import.meta.url));
const data = JSON.parse(readFileSync(input, 'utf8'));
const history = derive.historyFrom(data);

rmSync(out, { recursive: true, force: true });
mkdirSync(`${out}/nights`, { recursive: true });
const put = (name, value) => writeFileSync(`${out}/${name}`, JSON.stringify(value));

const summary = derive.summaryFrom(data);
put('summary.json', summary);
put('history.json', history);
put('health.json', {
  ...derive.healthFrom(data),
  season: {
    id: 'fc27',
    startedAt: data.collectionStatus?.startedAt,
    lastChange: data.capturedAt,
  },
});
for (const night of summary.nights)
  put(`nights/${night.day}.json`, derive.nightFrom(data, night.day));

// insights: stessi calcoli del backend (shared/), sullo stesso snapshot. IMPORTANTE: sui soli
// Pro con presenze (gamesPlayed > 0), come fa il sito (withPlayingMembers): altrimenti
// analyzeClub include anche i profili a zero presenze e il testo cambierebbe.
const full = {
  ...data,
  members: {
    ...data.members,
    members: data.members.members.filter((m) => Number(m.gamesPlayed) > 0),
  },
  matchHistory: history.matchHistory,
};
const all = buildAll(full);
const coach = {};
for (const metrics of all)
  if (metrics.games > 0) coach[metrics.name.toLowerCase()] = commentFor(metrics);
put('insights.json', {
  version: 1,
  builtAt: new Date(Date.parse(data.capturedAt) + 1000).toISOString(),
  engine: computeEngineId(),
  coach,
  club: analyzeClub(full, undefined, all),
});
console.log(`fixture scritte in ${out}`);
