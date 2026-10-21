'use strict';
// Logica (pura, testabile) per aprire/aggiornare/chiudere issue GitHub; l'API è iniettata.
const HOUR = 3600 * 1000;
const HEALTH_TITLE = 'Raccolta EA in errore';
const SHAPE_TITLE = 'Formato EA cambiato';
const HEALTH_MARKER = '<!-- billocchi:health -->';
const SHAPE_MARKER = '<!-- billocchi:ea-shape -->';
const FAILURE_THRESHOLD = 3;       // esecuzioni consecutive fallite
const FAILURE_WINDOW_MS = 2 * HOUR; // oppure fallimenti ripetuti da oltre 2 ore

/** 'open' se la raccolta è in errore da abbastanza tempo, 'close' alla prima esecuzione sana, altrimenti 'keep'. */
function healthWanted(health, {conclusion = 'success', now = new Date().toISOString()} = {}) {
  const count = health?.consecutiveFailures || 0;
  const since = health?.failingSince ? Date.parse(health.failingSince) : null;
  if (count >= FAILURE_THRESHOLD || (count >= 2 && since != null && Date.parse(now) - since > FAILURE_WINDOW_MS)) return 'open';
  if (conclusion !== 'failure' && count === 0 && health?.complete) return 'close';
  return 'keep';
}

function healthBody(health, {runUrl} = {}) {
  const failures = Object.entries(health?.failures || {});
  const lines = [
    HEALTH_MARKER,
    `La raccolta dati EA è fallita **${health?.consecutiveFailures || 0} volte di fila**${health?.failingSince ? ` (dal ${health.failingSince})` : ''}.`,
    '',
    failures.length ? 'Motivo:' : 'Motivo: non indicato in `data/public/health.json`.',
    ...failures.map(([k, v]) => `- \`${k}\`: ${v}`),
    '',
    `Ultima raccolta riuscita: ${health?.lastSuccessAt || 'sconosciuta'}. Ultimo controllo: ${health?.checkedAt || '?'}.`,
  ];
  if (runUrl) lines.push(`Esecuzione: ${runUrl}`);
  lines.push('', 'Cosa fare: vedi il runbook nel README ("Se la raccolta si ferma"). L\'issue si chiude da sola alla prima esecuzione sana.');
  return lines.join('\n');
}

function shapeBody(diff, {runUrl} = {}) {
  const lines = [SHAPE_MARKER, 'Il controllo settimanale ha trovato differenze tra le risposte EA e `config/ea-shape.json`.', ''];
  for (const [kind, d] of Object.entries(diff)) {
    if (!d.missing.length && !d.typeChanged.length) continue;
    lines.push(`**${kind}**`);
    for (const p of d.missing) lines.push(`- campo mancante: \`${p}\``);
    for (const t of d.typeChanged) lines.push(`- tipo cambiato: \`${t.path}\` (${t.was} → ${t.now})`);
    lines.push('');
  }
  if (runUrl) lines.push(`Esecuzione: ${runUrl}`);
  lines.push('Cosa fare: vedi il runbook nel README ("Se EA cambia formato"). L\'issue si chiude da sola quando le risposte tornano uguali allo schema.');
  return lines.join('\n');
}

/**
 * Decide l'azione su una issue. `want`: 'open' | 'close' | 'keep'. `issue`: issue aperta esistente o null.
 * `recentActivity`: true se l'issue o un suo commento è più recente di `minGapMs` (limita i commenti a uno all'ora).
 */
function planIssue({want, issue, recentActivity = false, title, body, commentBody, closeComment}) {
  if (want === 'open') {
    if (!issue) return {action: 'create', title, body};
    if (recentActivity) return {action: 'none'};
    return {action: 'comment', number: issue.number, body: commentBody || body};
  }
  if (want === 'close' && issue) return {action: 'close', number: issue.number, comment: closeComment};
  return {action: 'none'};
}

/** Client GitHub minimo (solo GITHUB_TOKEN): request(method, path, body) → JSON. */
function createGithubApi({token, fetchImpl = fetch, base = 'https://api.github.com'}) {
  return {
    async request(method, path, body) {
      const res = await fetchImpl(base + path, {
        method, headers: {Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json'},
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) throw new Error(`GitHub ${method} ${path} → HTTP ${res.status}`);
      return res.status === 204 ? null : res.json();
    },
  };
}

/** Applica `planIssue` tramite l'API (mockabile). Ritorna l'azione eseguita. */
async function syncIssue(api, {repo, title, marker, want, body, commentBody, closeComment, now = new Date().toISOString(), minGapMs = HOUR}) {
  const open = await api.request('GET', `/repos/${repo}/issues?state=open&per_page=100`);
  const issue = (open || []).find((i) => !i.pull_request && i.title === title && (!marker || String(i.body || '').includes(marker))) || null;
  let recentActivity = false;
  if (issue) {
    const since = new Date(Date.parse(now) - minGapMs).toISOString();
    recentActivity = Date.parse(issue.created_at) > Date.parse(since);
    if (!recentActivity) recentActivity = ((await api.request('GET', `/repos/${repo}/issues/${issue.number}/comments?per_page=1&since=${encodeURIComponent(since)}`)) || []).length > 0;
  }
  const plan = planIssue({want, issue, recentActivity, title, body, commentBody, closeComment});
  if (plan.action === 'create') await api.request('POST', `/repos/${repo}/issues`, {title: plan.title, body: plan.body});
  if (plan.action === 'comment') await api.request('POST', `/repos/${repo}/issues/${plan.number}/comments`, {body: plan.body});
  if (plan.action === 'close') {
    if (plan.comment) await api.request('POST', `/repos/${repo}/issues/${plan.number}/comments`, {body: plan.comment});
    await api.request('PATCH', `/repos/${repo}/issues/${plan.number}`, {state: 'closed', state_reason: 'completed'});
  }
  return plan;
}

module.exports = {HEALTH_TITLE, SHAPE_TITLE, HEALTH_MARKER, SHAPE_MARKER, healthWanted, healthBody, shapeBody, planIssue, createGithubApi, syncIssue, FAILURE_THRESHOLD};
