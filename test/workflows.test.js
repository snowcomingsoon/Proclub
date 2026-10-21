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

test('cadenza update-data: sera ogni 20 minuti (17:00-01:59 UTC), altrove una volta all\'ora al minuto 17', () => {
  const lines = crons(wf('update-data.yml'));
  assert.equal(lines.length, 2);
  const runs = runsPerDay(lines);
  assert.equal(new Set(runs).size, runs.length, 'nessun orario duplicato');
  const evening = new Set([17, 18, 19, 20, 21, 22, 23, 0, 1]);
  for (let h = 0; h < 24; h++) {
    const inHour = runs.filter((r) => Math.floor(r / 60) === h).map((r) => r % 60);
    assert.deepEqual(inHour, evening.has(h) ? [0, 20, 40] : [17], `ora UTC ${h}`);
  }
  assert.equal(runs.length, 9 * 3 + 15);
  // 19-03 italiane in estate (CEST = UTC+2) e 18-02 in inverno (CET = UTC+1) sono coperte dalla finestra serale
  for (const [offset, from, to] of [[2, 19, 3], [1, 18, 2]]) for (let local = from; local !== (to + 1) % 24; local = (local + 1) % 24) assert.ok(evening.has((local - offset + 24) % 24), `ora locale ${local} (UTC+${offset})`);
});
test('update-data: concurrency invariata, push con retry, artifact, azioni senza Node 20', () => {
  const t = wf('update-data.yml');
  assert.match(t, /concurrency:\n  group: update-data\n  cancel-in-progress: false/);
  assert.match(t, /for attempt in 1 2 3/); assert.match(t, /upload-artifact@/); assert.match(t, /workflow_dispatch/);
  for (const name of fs.readdirSync(path.join(ROOT, '.github', 'workflows'))) {
    for (const [, action, v] of wf(name).matchAll(/uses:\s*actions\/([\w-]+)@v(\d+)/g)) assert.ok(Number(v) >= 6, `${name}: actions/${action}@v${v} usa Node 20`);
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
