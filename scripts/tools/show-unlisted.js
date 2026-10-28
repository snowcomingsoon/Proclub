'use strict';
// Applica la riconciliazione a data/data.json + data/collection-ledger.json (+ seed) SENZA scrivere nulla e stampa la ricostruzione.
// Uso: node scripts/tools/show-unlisted.js [ISO-adesso]
const path = require('node:path');
const {readJson} = require('../fsx');
const {loadConfig, ROOT} = require('../config');
const {reconcile} = require('../integrity');
const {validateSeed} = require('../unlisted');

const cfg = loadConfig();
const data = readJson(path.join(ROOT, 'data', 'data.json'));
const ledger = readJson(path.join(ROOT, 'data', 'collection-ledger.json'));
const seed = readJson(path.join(ROOT, 'config', 'unlisted-seed.json'), null);
const now = process.argv[2] || data.capturedAt;
console.log('seed:', seed ? JSON.stringify(validateSeed(seed, data, cfg.clubId)) : 'assente', '| unlisted nel ledger:', !!ledger.unlisted);
const {summary} = reconcile(ledger, data, cfg.clubId, now, {seed});
console.log(JSON.stringify(summary.unlisted, null, 1));
