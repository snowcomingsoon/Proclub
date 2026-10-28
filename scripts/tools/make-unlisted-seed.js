'use strict';
// Genera config/unlisted-seed.json: snapshot di riferimento (totali di club e Pro + cutoff) da un commit di data/data.json.
// Uso: node scripts/tools/make-unlisted-seed.js <commit> [file-di-uscita]
const {execFileSync} = require('node:child_process');
const path = require('node:path');
const {atomicWrite} = require('../fsx');
const {snapshotOf} = require('../unlisted');

const ROOT = path.join(__dirname, '..', '..');
const commit = process.argv[2];
if (!commit) { console.error('Uso: node scripts/tools/make-unlisted-seed.js <commit> [uscita]'); process.exit(2); }
const out = path.resolve(process.argv[3] || path.join(ROOT, 'config', 'unlisted-seed.json'));
const data = JSON.parse(execFileSync('git', ['show', `${commit}:data/data.json`], {cwd: ROOT, maxBuffer: 256 * 1024 * 1024, encoding: 'utf8'}));
const snap = snapshotOf(data);
if (!snap) { console.error('Contatori del club non validi nello snapshot'); process.exit(1); }
const seed = {version: 1, source: {commit, capturedAt: data.capturedAt || null}, ...snap};
atomicWrite(out, JSON.stringify(seed, null, 1) + '\n');
console.log(`${path.relative(ROOT, out)}: ${Object.keys(snap.players).length} Pro, ${snap.club.gamesPlayed} partite, cutoff ${snap.cutoff}`);
