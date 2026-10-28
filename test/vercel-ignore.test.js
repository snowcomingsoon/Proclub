// ignoreCommand di Vercel: salta il build solo se l'ultimo commit tocca soltanto data/.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, '..', 'app', 'tools', 'vercel-ignore.sh');
const vercel = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));

function git(dir, ...args) {
  const r = spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
    cwd: dir,
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}
function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ignore-'));
  git(dir, 'init', '-q');
  return dir;
}
function commit(dir, files, msg = 'c') {
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content);
  }
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', msg);
}
const run = (dir) => spawnSync('bash', [SCRIPT], { cwd: dir, encoding: 'utf8' }).status;

test('vercel.json usa lo script e un exit finale 1 in caso di errore', () => {
  assert.match(vercel.ignoreCommand, /app\/tools\/vercel-ignore\.sh/);
  assert.match(vercel.ignoreCommand, /\|\| exit 1$/);
});

test('solo file in data/ => salta (exit 0)', () => {
  const dir = repo();
  commit(dir, { 'app/a.js': '1' });
  commit(dir, { 'data/data.json': '{}', 'data/public/summary.json': '{}', 'data/nights/x.json': '{}' });
  assert.equal(run(dir), 0);
});

test('un file fuori da data/ => builda (exit 1)', () => {
  const dir = repo();
  commit(dir, { 'app/a.js': '1' });
  commit(dir, { 'data/data.json': '{}', 'app/a.js': '2' });
  assert.equal(run(dir), 1);
});

test('prefisso ingannevole (data-extra/, database.js) => builda', () => {
  const dir = repo();
  commit(dir, { 'x': '1' });
  commit(dir, { 'data-extra/a.json': '{}' });
  assert.equal(run(dir), 1);
  commit(dir, { 'database.js': '1' });
  assert.equal(run(dir), 1);
});

test('primo commit (nessun HEAD^) => builda', () => {
  const dir = repo();
  commit(dir, { 'data/data.json': '{}' });
  assert.equal(run(dir), 1);
});

test('commit senza file cambiati => builda', () => {
  const dir = repo();
  commit(dir, { a: '1' });
  git(dir, 'commit', '-q', '--allow-empty', '-m', 'vuoto');
  assert.equal(run(dir), 1);
});

test('non è un repository git (errore del comando) => builda', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nogit-'));
  assert.equal(run(dir), 1);
});

test('nomi di file con spazi in data/ => salta', () => {
  const dir = repo();
  commit(dir, { a: '1' });
  commit(dir, { 'data/con spazio.json': '{}' });
  assert.equal(run(dir), 0);
});

const runWith = (dir, env) => spawnSync('bash', [SCRIPT], { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env } }).status;

test('un commit di codice soppiantato da commit di soli dati si pubblica comunque (confronto con l\'ultimo commit pubblicato)', () => {
  const dir = repo();
  commit(dir, { 'app/a.js': '1' });
  const published = git(dir, 'rev-parse', 'HEAD').trim();
  commit(dir, { 'app/a.js': '2' }, 'codice mai pubblicato');
  commit(dir, { 'data/data.json': '1' }, 'dati 1');
  commit(dir, { 'data/data.json': '2' }, 'dati 2');
  assert.equal(run(dir), 0, 'senza riferimento: solo l\'ultimo commit (dati) => salta: il bug di prima');
  assert.equal(runWith(dir, { VERCEL_GIT_PREVIOUS_SHA: published }), 1, 'con l\'ultimo pubblicato: il codice cambiato => builda');
});

test('con l\'ultimo pubblicato e soli dati cambiati => salta; riferimento sconosciuto => builda', () => {
  const dir = repo();
  commit(dir, { 'app/a.js': '1' });
  const published = git(dir, 'rev-parse', 'HEAD').trim();
  commit(dir, { 'data/data.json': '1' });
  commit(dir, { 'data/data.json': '2' });
  assert.equal(runWith(dir, { VERCEL_GIT_PREVIOUS_SHA: published }), 0);
  assert.equal(runWith(dir, { VERCEL_GIT_PREVIOUS_SHA: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef' }), 1);
});
