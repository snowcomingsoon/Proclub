'use strict';
// Controllo settimanale del formato delle risposte EA contro config/ea-shape.json.
//   node scripts/check-ea-shape.js              confronta e apre/aggiorna/chiude l'issue "Formato EA cambiato"
//   node scripts/check-ea-shape.js --update     riscrive lo schema dalle risposte EA attuali
//   node scripts/check-ea-shape.js --from-data  (ri)crea lo schema dai dati già salvati in data/data.json
const path = require('node:path');
const {readJson, writeJson} = require('./fsx');
const {loadConfig, ROOT} = require('./config');
const {createEaClient} = require('./ea-client');
const {shapeOf, compareShape, hasDifference} = require('./ea-shape');
const {createGithubApi, syncIssue, shapeBody, SHAPE_TITLE, SHAPE_MARKER} = require('./issues');

const SCHEMA = path.join(ROOT, 'config', 'ea-shape.json');
const KINDS = ['club', 'members', 'leagueMatch', 'playoffMatch'];

async function fetchLive(cfg, fetchImpl = fetch) {
  const client = createEaClient({fetchImpl, platform: cfg.platform, clubId: cfg.clubId});
  const specs = client.specs();
  const results = await Promise.allSettled(specs.map(([, endpoint, params]) => client.ea(endpoint, params)));
  const live = {}, errors = {};
  results.forEach((r, i) => { if (r.status === 'fulfilled') live[specs[i][0]] = r.value; else errors[specs[i][0]] = String(r.reason.message || r.reason); });
  return {live, errors};
}

/** Differenze per modalità: le liste partite vuote non sono verificabili e vengono saltate. */
function diffAll(saved, live) {
  const diffs = {}, skipped = [];
  for (const kind of KINDS) {
    if (!(kind in live) || (Array.isArray(live[kind]) && !live[kind].length && kind.endsWith('Match'))) { skipped.push(kind); continue; }
    diffs[kind] = compareShape(saved.shapes?.[kind] || {}, shapeOf(live[kind]));
  }
  return {diffs, skipped};
}

function shapesFromData(data) {
  const league = (data.matchHistory || []).filter((m) => m.sourceMatchType === 'leagueMatch');
  const playoff = (data.matchHistory || []).filter((m) => m.sourceMatchType === 'playoffMatch');
  const shapes = {club: shapeOf(data.club), members: shapeOf(data.members), leagueMatch: shapeOf(league)};
  if (playoff.length) shapes.playoffMatch = shapeOf(playoff);
  return shapes;
}

async function main(argv = process.argv.slice(2), env = process.env) {
  const cfg = loadConfig(env);
  if (argv.includes('--from-data')) {
    const shapes = shapesFromData(readJson(path.join(ROOT, 'data', 'data.json')));
    writeJson(SCHEMA, {version: 1, source: 'data/data.json', shapes});
    return console.log('config/ea-shape.json creato da data/data.json');
  }
  const {live, errors} = await fetchLive(cfg);
  if (Object.keys(errors).length) { console.error('Letture EA fallite (nessuna issue toccata):', JSON.stringify(errors)); process.exitCode = 1; if (!Object.keys(live).length) return; }
  if (argv.includes('--update')) {
    const saved = readJson(SCHEMA, {shapes: {}});
    const shapes = {...saved.shapes};
    for (const kind of KINDS) if (kind in live && !(kind.endsWith('Match') && !live[kind].length)) shapes[kind] = shapeOf(live[kind]);
    writeJson(SCHEMA, {version: 1, source: 'EA', updatedAt: new Date().toISOString(), shapes});
    return console.log('config/ea-shape.json aggiornato dalle risposte EA');
  }
  const saved = readJson(SCHEMA);
  const {diffs, skipped} = diffAll(saved, live);
  for (const [kind, d] of Object.entries(diffs)) if (d.added.length) console.log(`${kind}: campi nuovi (informativo): ${d.added.slice(0, 20).join(', ')}`);
  if (skipped.length) console.log(`Non verificati (vuoti o non letti): ${skipped.join(', ')}`);
  const different = hasDifference(diffs);
  console.log(different ? 'Formato EA DIVERSO dallo schema.' : 'Formato EA invariato.');
  // Con letture mancanti non si chiude l'issue: l'assenza di prove non è un ritorno alla normalità.
  if (Object.keys(errors).length && !different) return;
  if (!env.GITHUB_TOKEN) return;
  const runUrl = env.GITHUB_SERVER_URL && env.GITHUB_RUN_ID ? `${env.GITHUB_SERVER_URL}/${cfg.repo}/actions/runs/${env.GITHUB_RUN_ID}` : undefined;
  const plan = await syncIssue(createGithubApi({token: env.GITHUB_TOKEN}), {
    repo: cfg.repo, title: SHAPE_TITLE, marker: SHAPE_MARKER, want: different ? 'open' : 'close',
    body: shapeBody(diffs, {runUrl}), closeComment: 'Il formato EA è tornato uguale allo schema: chiudo l\'issue.', minGapMs: 24 * 3600 * 1000,
  });
  console.log(`Issue "${SHAPE_TITLE}": ${plan.action}`);
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exitCode = 1; });

module.exports = {diffAll, shapesFromData, fetchLive, KINDS};
