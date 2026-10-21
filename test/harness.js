'use strict';
// Utilità condivise dai test della raccolta: cartella temporanea + EA simulato (nessuna chiamata di rete).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {run} = require('../scripts/collector');
const {loadConfig} = require('../scripts/config');

const data = require('./fixtures/data-current.json');
const quiet = {log() {}, warn() {}, error() {}};
const read = (root, ...p) => JSON.parse(fs.readFileSync(path.join(root, 'data', ...p), 'utf8'));
const exists = (root, ...p) => fs.existsSync(path.join(root, 'data', ...p));

function tmpRoot({stored = data, ledger, files = {}} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'billocchi-'));
  fs.mkdirSync(path.join(root, 'data'), {recursive: true});
  fs.writeFileSync(path.join(root, 'data', 'data.json'), JSON.stringify(stored));
  if (ledger) fs.writeFileSync(path.join(root, 'data', 'collection-ledger.json'), JSON.stringify(ledger));
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), {recursive: true});
    fs.writeFileSync(path.join(root, rel), typeof content === 'string' ? content : JSON.stringify(content));
  }
  return root;
}

/**
 * Una raccolta con EA simulato. `fail`: chiavi (club, members, leagueMatch, playoffMatch) che lanciano errore;
 * `recover`: l'errore sparisce dopo 3 tentativi; `clubSeq`/`membersSeq`: letture diverse per ogni chiamata successiva.
 */
async function collect({root, fail = [], recover = false, club = data.club, members = data.members, clubSeq, membersSeq, leagueList, playoffList, now = '2026-10-21T18:00:00.000Z', engine, stored, ledger, files} = {}) {
  root ||= tmpRoot({stored, ledger, files});
  const counts = {};
  const nowFn = typeof now === 'function' ? now : () => now;
  const incoming = {...data.matches[0], matchId: 'collector-new-match'};
  const fetch = async (raw) => {
    const url = new URL(raw);
    const key = url.pathname.endsWith('/overallStats') ? 'club' : url.pathname.endsWith('/stats') ? 'members' : url.searchParams.get('matchType');
    counts[key] = (counts[key] || 0) + 1;
    if (fail.includes(key) && (!recover || counts[key] <= 3)) throw Error('EA unavailable');
    const pick = (seq, fallback) => (seq ? seq[Math.min(Math.floor((counts[key] - 1) / 1), seq.length - 1)] : fallback);
    const body = key === 'club' ? pick(clubSeq, club) : key === 'members' ? pick(membersSeq, members) : key === 'leagueMatch' ? (leagueList || [incoming]) : (playoffList || []);
    return {ok: true, json: async () => body};
  };
  const result = await run({root, fetch, wait: async () => {}, now: nowFn, config: {...loadConfig({}), clubId: '70375'}, log: quiet, engine});
  const sync = exists(root, 'sync-status.json') ? read(root, 'sync-status.json') : null;
  return {
    root, result, counts, exitCode: result.exitCode, status: sync, next: read(root, 'data.json'),
    ledger: exists(root, 'collection-ledger.json') ? read(root, 'collection-ledger.json') : null,
    health: exists(root, 'public', 'health.json') ? read(root, 'public', 'health.json') : null,
  };
}

module.exports = {data, quiet, tmpRoot, collect, read, exists};
