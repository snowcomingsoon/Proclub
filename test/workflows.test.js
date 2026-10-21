const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const {loadConfig} = require('../scripts/config');

const ROOT = path.join(__dirname, '..');
const wf = (name) => fs.readFileSync(path.join(ROOT, '.github', 'workflows', name), 'utf8');
const crons = (text) => [...text.matchAll(/^\s*-\s*cron:\s*'([^']+)'/gm)].map((m) => m[1]);

function field(spec, min, max) {
  const out = new Set();
  for (const part of spec.split(',')) {
    const [range, step] = part.split('/');
    const [a, b] = range === '*' ? [min, max] : range.includes('-') ? range.split('-').map(Number) : [Number(range), Number(range)];
    for (let v = a; v <= b; v += Number(step || 1)) out.add(v);
  }
  return out;
}
/** Tutti gli orari (ora*60+minuto, UTC) di un giorno in cui scatta almeno un cron. */
function runsPerDay(cronLines) {
  const runs = [];
  for (const line of cronLines) {
    const [min, hour] = line.split(/\s+/);
    for (const h of field(hour, 0, 23)) for (const m of field(min, 0, 59)) runs.push(h * 60 + m);
  }
  return runs.sort((a, b) => a - b);
}

test('cadenza update-data: avvio orario, rete di sicurezza serale e giro ripetuto fino al successivo', () => {
  const t = wf('update-data.yml');
  const lines = crons(t);
  assert.deepEqual(lines, ['17 * * * *', '47 17-23,0,1 * * *']);
  const runs = runsPerDay(lines);
  assert.equal(new Set(runs).size, runs.length, 'nessun orario duplicato');
  assert.equal(runs.length, 24 + 9);
  assert.match(t, /timeout-minutes: 75/);
  assert.match(t, /actions: write/);
  assert.match(t, /gh workflow run update-data\.yml/);
  assert.match(t, /steps\.collect\.outputs\.chain == '1'/);
  const sh = fs.readFileSync(path.join(ROOT, 'scripts', 'collect-loop.sh'), 'utf8');
  // finestra serale 17:00-01:59 UTC = 19-03 italiane in estate (CEST) e 18-02 in inverno (CET)
  assert.match(sh, /\[ "\$hour" -ge 17 \] \|\| \[ "\$hour" -le 1 \]/);
  assert.match(sh, /duration=3000/);
  assert.match(sh, /INTERVAL="\$\{LOOP_INTERVAL:-180\}"/);
  assert.match(sh, /schedule/);
});
test('update-data: concurrency invariata, push con retry, artifact, azioni senza Node 20', () => {
  const t = wf('update-data.yml');
  assert.match(t, /concurrency:\n  group: update-data\n  cancel-in-progress: false/);
  assert.match(t, /for attempt in 1 2 3/); assert.match(t, /upload-artifact@/); assert.match(t, /workflow_dispatch/);
  for (const name of fs.readdirSync(path.join(ROOT, '.github', 'workflows'))) {
    for (const [, action, v] of wf(name).matchAll(/uses:\s*actions\/([\w-]+)@v(\d+)/g)) assert.ok(Number(v) >= 4, `${name}: actions/${action}@v${v} non è una versione verificata`);
  }
});
test('workflow issue salute: permessi minimi (issues: write), nessun segreto aggiuntivo, parte dopo la raccolta', () => {
  const t = wf('health-issue.yml');
  assert.match(t, /issues: write/); assert.match(t, /workflow_run:[\s\S]*Aggiorna dati EA/);
  assert.ok(!/secrets\.(?!GITHUB_TOKEN)/.test(t), 'solo GITHUB_TOKEN');
  assert.match(t, /continue-on-error: true/);
});
test('controllo formato EA: settimanale, issue write, probe manuale rimosso', () => {
  const t = wf('ea-shape.yml');
  const [c] = crons(t); const [, , dom, mon, dow] = c.split(/\s+/);
  assert.deepEqual([dom, mon, dow], ['*', '*', '1']); assert.equal(crons(t).length, 1);
  assert.match(t, /issues: write/);
  assert.ok(!fs.existsSync(path.join(ROOT, '.github', 'workflows', 'probe-ea.yml')));
  assert.ok(!fs.existsSync(path.join(ROOT, 'scripts', 'probe-ea.js')));
});
test('CI: lint, test e build del front-end', () => {
  const t = wf('ci.yml');
  for (const cmd of ['npm run lint', 'npm test', 'npm run build:data', 'npm run build']) assert.ok(t.includes(cmd), cmd);
});

test('config/club.json: valori del club e override da variabili d\'ambiente', () => {
  const cfg = require('../config/club.json');
  assert.deepEqual(cfg, {clubId: '70375', platform: 'common-gen5', name: 'BILLOCCHI CLUB', repo: 'snowcomingsoon/Proclub', timezone: 'Europe/Rome', nightEndsAtHour: 6});
  assert.deepEqual(loadConfig({}), cfg);
  const over = loadConfig({EA_CLUB_ID: '1', EA_PLATFORM: 'ps5', GITHUB_REPOSITORY: 'a/b', CLUB_NIGHT_ENDS_AT_HOUR: '4', CLUB_TIMEZONE: 'UTC'});
  assert.equal(over.clubId, '1'); assert.equal(over.platform, 'ps5'); assert.equal(over.repo, 'a/b'); assert.equal(over.nightEndsAtHour, 4); assert.equal(over.timezone, 'UTC');
});
test('package.json: script utili presenti', () => {
  const {scripts} = require('../package.json');
  for (const s of ['test', 'update', 'build:data', 'lint', 'check:ea-shape']) assert.ok(scripts[s], s);
});
