'use strict';
// Lint leggero: `node --check` su tutti gli script, il motore condiviso, le API e i test (nessuna dipendenza).
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const DIRS = ['scripts', 'shared', 'api', 'test'];
const files = DIRS.flatMap((d) => (fs.existsSync(path.join(ROOT, d)) ? fs.readdirSync(path.join(ROOT, d)).filter((f) => /\.(c|m)?js$/.test(f)).map((f) => path.join(ROOT, d, f)) : []));
let failed = 0;
for (const file of files) {
  const r = spawnSync(process.execPath, ['--check', file], {encoding: 'utf8'});
  if (r.status !== 0) { failed++; console.error(`${path.relative(ROOT, file)}\n${r.stderr}`); }
}
console.log(`lint: ${files.length} file controllati, ${failed} con errori`);
process.exitCode = failed ? 1 : 0;
