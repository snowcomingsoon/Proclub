'use strict';
const fs = require('node:fs');
const path = require('node:path');

/** Legge un JSON; se il file non esiste ritorna `fallback` (default null). */
function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return fallback; throw e; }
}
/** Scrittura atomica: file temporaneo + rename. */
function atomicWrite(file, content) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, content);
  fs.renameSync(temp, file);
}
const writeJson = (file, value) => atomicWrite(file, JSON.stringify(value) + '\n');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = {readJson, atomicWrite, writeJson, sleep};
