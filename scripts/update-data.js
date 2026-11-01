'use strict';
// Entry point della raccolta (GitHub Actions: update-data.yml) per tutti i club registrati in config/clubs.json.
// Se il binario Rust compilato (`collector`) è presente ed è abilitato, esegue il collector nativo in Rust;
// altrimenti usa il collector multi-club JS (con riconciliazione ledger completa).
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {ROOT} = require('./config');
const {runAll} = require('./collector');

const rustBin = [
  path.join(ROOT, 'target', 'release', 'collector'),
  path.join(ROOT, 'target', 'release', 'collector.exe'),
].find((p) => fs.existsSync(p));

if (rustBin && process.env.PROCLUB_FORCE_JS_COLLECTOR !== '1') {
  const res = spawnSync(rustBin, [], {stdio: 'inherit', cwd: ROOT, env: process.env});
  process.exitCode = res.status ?? 1;
} else {
  runAll()
    .then((result) => { process.exitCode = result.exitCode; })
    .catch((e) => { console.error(e.message); process.exitCode = 1; });
}
