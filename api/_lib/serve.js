'use strict';
// Servizio locale/test dei file pubblici dei dati (in produzione Vercel esegue api/*.rs in Rust).
// Legge GitHub raw con timeout; in caso di errore ricade sui file del deploy e sul monolite del club.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const derive = require('./derive.js');

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const FETCH_TIMEOUT_MS = 4000;

const CLUBS = {
  billocchi: { key: 'billocchi', clubId: '70375', dataDir: 'data' },
  faida: { key: 'faida', clubId: '2039010', dataDir: 'data/clubs/faida' },
};

function resolveClub(param) {
  if (param == null || param === '' || param === 'billocchi') return CLUBS.billocchi;
  if (param === 'faida') return CLUBS.faida;
  return null;
}

const rootDir = () => process.env.DATA_ROOT || process.cwd();
const repo = () => process.env.DATA_REPO || 'snowcomingsoon/Proclub';
const branch = () => process.env.DATA_BRANCH || 'data';

/** Data valida nel formato YYYY-MM-DD (niente 2026-02-31). */
function validDay(day) {
  if (typeof day !== 'string' || !DAY_RE.test(day)) return false;
  const d = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === day;
}

/** Legge JSON da GitHub raw. Ritorna {status:'ok',text} | {status:'missing'} | {status:'error'}. */
async function fromRemote(rel) {
  if (process.env.DATA_LOCAL_ONLY === '1') return { status: 'error' };
  const url = `https://raw.githubusercontent.com/${repo()}/${branch()}/${rel}?refresh=${Math.floor(Date.now() / 60000)}`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: ctl.signal, redirect: 'follow', cache: 'no-store' });
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
function monolith(club = CLUBS.billocchi) {
  const text = readLocal(`${club.dataDir}/data.json`);
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

function makeHandler({ file, derive: deriveFn, sMaxAge = 60, validate, optional = false }) {
  return async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      return sendError(req, res, 405, 'method_not_allowed');
    }
    const query = parseQuery(req.url);
    const club = resolveClub(query.club);
    if (!club) return sendError(req, res, 400, 'invalid_club');
    const invalid = validate ? validate(query, club) : null;
    if (invalid) return sendError(req, res, 400, invalid);
    const rel = file(query, club);

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
        const data = monolith(club);
        const derived = data ? deriveFn(data, query, club) : null;
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
      'Cache-Control': source === 'github' ? `public, s-maxage=${sMaxAge}, must-revalidate` : 'no-store',
      ETag: etag,
      'X-Data-Source': source,
      'X-Club': club.key,
    };
    if (matchesEtag(req.headers?.['if-none-match'], etag))
      return send(req, res, 304, undefined, headers);
    headers['Content-Length'] = Buffer.byteLength(text);
    return send(req, res, 200, text, headers);
  };
}

module.exports = { makeHandler, validDay, derive, etagOf, matchesEtag, parseQuery, resolveClub, CLUBS };
