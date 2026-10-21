'use strict';
// Il motore di metriche/commenti è ESM (shared/*.mjs): lo carichiamo con import() dagli script CommonJS.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const SHARED = path.join(__dirname, '..', 'shared');
let cached;

async function loadEngine() {
  cached ||= (async () => {
    const metrics = await import('../shared/metrics.mjs');
    const commentary = await import('../shared/commentary.mjs');
    return {buildAll: metrics.buildAll, analyzeClub: metrics.analyzeClub, commentFor: commentary.commentFor};
  })();
  return cached;
}

const loadSession = () => import('../shared/session.mjs');

/** "Versione" del motore: hash dei sorgenti di shared/ (cambia quando cambia la logica). */
function engineVersion(dir = SHARED) {
  const hash = crypto.createHash('sha1');
  for (const name of fs.readdirSync(dir).sort()) hash.update(name).update(fs.readFileSync(path.join(dir, name)));
  return hash.digest('hex').slice(0, 12);
}

module.exports = {loadEngine, loadSession, engineVersion};
