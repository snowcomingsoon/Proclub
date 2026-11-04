'use strict';
// Usage: node scripts/data-delta.js <worktree>
// Exit 0 se le modifiche in stage del worktree toccano solo campi "di orologio" (controlli, tentativi, orari di cattura):
// niente di nuovo da pubblicare. Exit 1 se c'è una novità reale (o un file aggiunto/rimosso/non JSON).
const {execFileSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const VOLATILE = new Set(['capturedAt', 'checkedAt', 'builtAt', 'lastSeen', 'lastSuccessAt', 'attempts', 'timeAgo']);
const strip = (v) => {
  if (Array.isArray(v)) return v.map(strip);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).filter((k) => !VOLATILE.has(k)).map((k) => [k, strip(v[k])]));
  return v;
};
const same = (a, b) => JSON.stringify(strip(a)) === JSON.stringify(strip(b));

function onlyVolatile(dir) {
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], {encoding: 'utf8', maxBuffer: 1 << 28});
  const rows = git('diff', '--cached', '--name-status').split('\n').filter(Boolean).map((l) => l.split('\t'));
  if (!rows.length) return true;
  for (const [status, file] of rows) {
    if (status !== 'M' || !file.endsWith('.json')) return false;
    try {
      if (!same(JSON.parse(git('show', `HEAD:${file}`)), JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')))) return false;
    } catch { return false; }
  }
  return true;
}

if (require.main === module) process.exit(onlyVolatile(process.argv[2] || '.') ? 0 : 1);
module.exports = {onlyVolatile, strip};
