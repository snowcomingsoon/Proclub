'use strict';
// Servizio dei file pubblici dei dati: GitHub raw (repo pubblica, nessun token)
// con timeout; in caso di errore, i file inclusi nel deploy (data/public/**, data/data.json).
// Usa solo l'API nativa di Node (statusCode/setHeader/end) così gira anche nel dev server Vite.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const derive = require('./derive.js');

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const FETCH_TIMEOUT_MS = 4000;

const rootDir = () => process.env.DATA_ROOT || process.cwd();
const repo = () => process.env.DATA_REPO || 'snowcomingsoon/Proclub';

/** Data valida nel formato YYYY-MM-DD (niente 2026-02-31). */
function validDay(day) {
  if (typeof day !== 'string' || !DAY_RE.test(day)) return false;
  const d = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === day;
}

/** Legge JSON da GitHub raw. Ritorna {status:'ok',text} | {status:'missing'} | {status:'error'}. */
async function fromRemote(rel) {
  if (process.env.DATA_LOCAL_ONLY === '1') return { status: 'error' };
  const url = `https://raw.githubusercontent.com/${repo()}/main/${rel}`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: ctl.signal, redirect: 'follow' });
    if (response.status === 404) return { status: 'missing' };
    if (!response.ok) return { status: 'error' };
    const text = await response.text();
    JSON.parse(text);
    return { status: 'ok', text };
  } catch {
    return { status: 'error' };
  } finally {
    clearTimeout(timer);
  }
}

function readLocal(rel) {
  try {
    return fs.readFileSync(path.join(rootDir(), rel), 'utf8');
  } catch {
    return null;
  }
}

/** Il monolite incluso nel deploy, già parsato (o null). */
function monolith() {
  const text = readLocal('data/data.json');
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function send(req, res, status, body, headers = {}) {
  res.statusCode = status;
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  res.end(req.method === 'HEAD' ? undefined : body);
}

function sendError(req, res, status, error) {
  send(req, res, status, JSON.stringify({ error }), {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
}

const etagOf = (text) =>
  `"${crypto.createHash('sha1').update(text).digest('base64url').slice(0, 27)}"`;

/** If-None-Match: lista di tag (anche W/ e *). */
function matchesEtag(header, etag) {
  if (!header) return false;
  if (header.trim() === '*') return true;
  return header
    .split(',')
    .map((tag) => tag.trim().replace(/^W\//, ''))
    .includes(etag);
}

function parseQuery(url = '') {
  const i = url.indexOf('?');
  return Object.fromEntries(new URLSearchParams(i < 0 ? '' : url.slice(i + 1)));
}

/**
 * Crea un handler Vercel.
 * @param {object} opts
 * @param {(query:object) => string} opts.file  percorso relativo alla radice del repo
 * @param {(data:object, query:object) => object|null} [opts.derive]  ricostruzione dal monolite se il file manca
 * @param {(query:object) => string|null} [opts.validate]  codice d'errore se l'input non è valido
 * @param {number} [opts.sMaxAge]
 * @param {boolean} [opts.optional]  risorsa facoltativa: se manca risponde 204 (niente errore nella console del browser)
 */
function makeHandler({ file, derive: deriveFn, sMaxAge = 60, validate, optional = false }) {
  return async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      return sendError(req, res, 405, 'method_not_allowed');
    }
    const query = parseQuery(req.url);
    const invalid = validate ? validate(query) : null;
    if (invalid) return sendError(req, res, 400, invalid);
    const rel = file(query);

    let text = null;
    let source = 'github';
    let definitiveMissing = false;
    const remote = await fromRemote(rel);
    if (remote.status === 'ok') text = remote.text;
    else {
      definitiveMissing = remote.status === 'missing';
      source = 'bundle';
      text = readLocal(rel);
      if (text) {
        try {
          JSON.parse(text);
        } catch {
          text = null;
        }
      }
      if (!text && deriveFn) {
        const data = monolith();
        const derived = data ? deriveFn(data, query) : null;
        if (derived) {
          text = JSON.stringify(derived);
          source = 'monolith';
        }
      }
    }
    if (!text && optional) {
      return send(req, res, 204, undefined, {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
      });
    }
    if (!text) {
      return sendError(
        req,
        res,
        definitiveMissing ? 404 : 503,
        definitiveMissing ? 'not_found' : 'unavailable',
      );
    }
    const etag = etagOf(text);
    const headers = {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, s-maxage=${sMaxAge}, stale-while-revalidate=600`,
      ETag: etag,
      'X-Data-Source': source,
    };
    if (matchesEtag(req.headers?.['if-none-match'], etag))
      return send(req, res, 304, undefined, headers);
    headers['Content-Length'] = Buffer.byteLength(text);
    return send(req, res, 200, text, headers);
  };
}

module.exports = { makeHandler, validDay, derive, etagOf, matchesEtag, parseQuery };
