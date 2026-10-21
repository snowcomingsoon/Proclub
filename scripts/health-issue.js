'use strict';
// Apre/aggiorna/chiude l'issue "Raccolta EA in errore" in base a data/public/health.json.
// Non fa mai fallire il workflow: ogni errore viene solo registrato.
const path = require('node:path');
const {readJson} = require('./fsx');
const {loadConfig, ROOT} = require('./config');
const {healthWanted, healthBody, createGithubApi, syncIssue, HEALTH_TITLE, HEALTH_MARKER} = require('./issues');

async function main(env = process.env) {
  const cfg = loadConfig(env);
  const health = readJson(path.join(ROOT, 'data', 'public', 'health.json'), null);
  if (!health) { console.log('health.json assente: niente da fare.'); return null; }
  const now = new Date().toISOString();
  const want = healthWanted(health, {conclusion: env.WORKFLOW_CONCLUSION || 'success', now});
  const runUrl = env.RUN_URL || (env.GITHUB_SERVER_URL && env.RUN_ID ? `${env.GITHUB_SERVER_URL}/${cfg.repo}/actions/runs/${env.RUN_ID}` : undefined);
  if (!env.GITHUB_TOKEN) { console.log(`Nessun GITHUB_TOKEN: decisione = ${want}.`); return {action: 'none', want}; }
  const api = createGithubApi({token: env.GITHUB_TOKEN});
  const plan = await syncIssue(api, {
    repo: cfg.repo, title: HEALTH_TITLE, marker: HEALTH_MARKER, want, now,
    body: healthBody(health, {runUrl}), commentBody: `Nuovo fallimento (${health.consecutiveFailures} di fila).\n\n${healthBody(health, {runUrl})}`,
    closeComment: 'Raccolta tornata sana: chiudo l\'issue.',
  });
  console.log(`Raccolta: stato richiesto = ${want}, azione = ${plan.action}.`);
  return plan;
}

if (require.main === module) main().catch((e) => console.error('health-issue:', e.message)).finally(() => { process.exitCode = 0; });

module.exports = {main};
