// Funzioni Vercel api/*.js: fetch simulato (GitHub raw), fallback sui file del deploy, ETag/304, validazione.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const FIXTURES = path.join(__dirname, 'fixtures', 'public');
const realFetch = global.fetch;

function fakeRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(k, v) {
      res.headers[k.toLowerCase()] = v;
    },
    end(b) {
      res.body = b;
    },
  };
  return res;
}
const call = async (name, url, headers = {}, method = 'GET') => {
  const handler = require(path.join(ROOT, 'api', `${name}.js`));
  const res = fakeRes();
  await handler({ method, url, headers }, res);
  return res;
};

/** Cartella "deploy" con data/public (fixture) e, se richiesto, solo il monolite. */
function deployDir({ publicFiles = true, monolith = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-test-'));
  fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
  if (publicFiles) fs.cpSync(FIXTURES, path.join(dir, 'data', 'public'), { recursive: true });
  if (monolith) fs.copyFileSync(path.join(ROOT, 'data', 'data.json'), path.join(dir, 'data', 'data.json'));
  return dir;
}

function mockFetch(handler) {
  const calls = [];
  global.fetch = async (url, opts) => {
    calls.push(String(url));
    return handler(String(url), opts);
  };
  return calls;
}
const jsonResponse = (obj, status = 200) =>
  new Response(typeof obj === 'string' ? obj : JSON.stringify(obj), { status });

test.afterEach(() => {
  global.fetch = realFetch;
  delete process.env.DATA_ROOT;
  delete process.env.DATA_REPO;
});

test('summary: legge da GitHub raw con repo di default e imposta le intestazioni', async () => {
  process.env.DATA_ROOT = deployDir({ publicFiles: false, monolith: false });
  const calls = mockFetch(() => jsonResponse({ version: 2, capturedAt: 'x' }));
  const res = await call('summary', '/api/summary');
  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls, [
    'https://raw.githubusercontent.com/snowcomingsoon/Proclub/main/data/public/summary.json',
  ]);
  assert.equal(res.headers['content-type'], 'application/json; charset=utf-8');
  assert.equal(res.headers['cache-control'], 'public, s-maxage=60, stale-while-revalidate=600');
  assert.match(res.headers.etag, /^"[A-Za-z0-9_-]+"$/);
  assert.equal(res.headers['x-data-source'], 'github');
  assert.deepEqual(JSON.parse(res.body), { version: 2, capturedAt: 'x' });
});

test('DATA_REPO cambia il repository', async () => {
  process.env.DATA_ROOT = deployDir();
  process.env.DATA_REPO = 'org/altro';
  const calls = mockFetch(() => jsonResponse({}));
  await call('history', '/api/history');
  assert.match(calls[0], /raw\.githubusercontent\.com\/org\/altro\/main\/data\/public\/history\.json$/);
});

test('health: s-maxage 30', async () => {
  process.env.DATA_ROOT = deployDir();
  mockFetch(() => jsonResponse({ version: 1 }));
  const res = await call('health', '/api/health');
  assert.equal(res.headers['cache-control'], 'public, s-maxage=30, stale-while-revalidate=600');
});

test('If-None-Match: 304 senza corpo, anche con W/ e liste; HEAD senza corpo', async () => {
  process.env.DATA_ROOT = deployDir();
  mockFetch(() => jsonResponse({ a: 1 }));
  const first = await call('insights', '/api/insights');
  const etag = first.headers.etag;
  for (const header of [etag, `W/${etag}`, `"zzz", ${etag}`, '*']) {
    const res = await call('insights', '/api/insights', { 'if-none-match': header });
    assert.equal(res.statusCode, 304, header);
    assert.equal(res.body, undefined);
    assert.equal(res.headers.etag, etag);
  }
  const other = await call('insights', '/api/insights', { 'if-none-match': '"altro"' });
  assert.equal(other.statusCode, 200);
  const head = await call('insights', '/api/insights', {}, 'HEAD');
  assert.equal(head.statusCode, 200);
  assert.equal(head.body, undefined);
});

test('ETag cambia al cambiare del contenuto', async () => {
  process.env.DATA_ROOT = deployDir();
  mockFetch(() => jsonResponse({ a: 1 }));
  const a = await call('summary', '/api/summary');
  mockFetch(() => jsonResponse({ a: 2 }));
  const b = await call('summary', '/api/summary');
  assert.notEqual(a.headers.etag, b.headers.etag);
});

for (const [name, status] of [
  ['rete', null],
  ['500', 500],
  ['JSON non valido', 'invalid'],
]) {
  test(`errore remoto (${name}): ricade sul file del deploy`, async () => {
    process.env.DATA_ROOT = deployDir();
    mockFetch(() => {
      if (status === null) throw new Error('ECONNRESET');
      if (status === 'invalid') return jsonResponse('<html>non json');
      return jsonResponse({}, status);
    });
    const res = await call('summary', '/api/summary');
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['x-data-source'], 'bundle');
    assert.equal(
      res.body,
      fs.readFileSync(path.join(FIXTURES, 'summary.json'), 'utf8'),
    );
  });
}

test('timeout: fetch che non risponde viene interrotto e ricade sul deploy', async () => {
  process.env.DATA_ROOT = deployDir();
  mockFetch(
    (url, opts) =>
      new Promise((resolve, reject) => {
        opts.signal.addEventListener('abort', () => reject(new Error('aborted')));
      }),
  );
  const t0 = Date.now();
  const res = await call('health', '/api/health');
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['x-data-source'], 'bundle');
  assert.ok(Date.now() - t0 < 6000);
});

test('senza data/public ricostruisce dal monolite data/data.json', async () => {
  process.env.DATA_ROOT = deployDir({ publicFiles: false });
  mockFetch(() => {
    throw new Error('offline');
  });
  const summary = await call('summary', '/api/summary');
  assert.equal(summary.headers['x-data-source'], 'monolith');
  const body = JSON.parse(summary.body);
  assert.ok(body.club[0] && body.members.members.length);
  assert.ok(body.matches.length <= 30 && body.nights.length > 0);
  const day = body.nights[0].day;
  const night = JSON.parse((await call('night', `/api/night?day=${day}`)).body);
  assert.equal(night.day, day);
  assert.equal(night.matches.length, body.nights[0].games);
  const history = JSON.parse((await call('history', '/api/history')).body);
  assert.equal(history.matchHistory.length, body.matchCount);
  const health = JSON.parse((await call('health', '/api/health')).body);
  assert.equal(health.capturedAt, body.capturedAt);
  // insights non si ricostruiscono e sono facoltativi: 204 (nessun errore nella console del browser)
  const insights = await call('insights', '/api/insights');
  assert.equal(insights.statusCode, 204);
  assert.equal(insights.body, undefined);
  // le risorse obbligatorie, se non ci sono proprio, rispondono con errore JSON
  process.env.DATA_ROOT = deployDir({ publicFiles: false, monolith: false });
  const gone = await call('summary', '/api/summary');
  assert.equal(gone.statusCode, 503);
  assert.deepEqual(JSON.parse(gone.body), { error: 'unavailable' });
});

test('night: giorno valido, 404 se la serata non esiste', async () => {
  process.env.DATA_ROOT = deployDir();
  const calls = mockFetch((url) => jsonResponse({ day: url.match(/(\d{4}-\d{2}-\d{2})\.json/)[1], matches: [] }));
  const ok = await call('night', '/api/night?day=2026-10-20');
  assert.equal(ok.statusCode, 200);
  assert.match(calls[0], /data\/public\/nights\/2026-10-20\.json$/);
  mockFetch(() => jsonResponse({}, 404));
  const missing = await call('night', '/api/night?day=2020-01-01');
  assert.equal(missing.statusCode, 404);
  assert.deepEqual(JSON.parse(missing.body), { error: 'not_found' });
  assert.equal(missing.headers['cache-control'], 'no-store');
});

test('night: validazione input e niente path traversal', async () => {
  process.env.DATA_ROOT = deployDir();
  const calls = mockFetch(() => jsonResponse({}));
  for (const q of [
    '',
    '?day=',
    '?day=2026-10-2',
    '?day=2026-13-01',
    '?day=2026-02-31',
    '?day=../../data/data',
    '?day=..%2F..%2Fdata%2Fdata.json',
    '?day=2026-10-20/../../x',
    '?day=2026-10-20%00',
    '?day=2026-10-20&day=../x',
  ]) {
    const res = await call('night', `/api/night${q}`);
    assert.equal(res.statusCode, 400, q);
    assert.deepEqual(JSON.parse(res.body), { error: 'invalid_day' });
  }
  assert.equal(calls.length, 0, 'nessuna richiesta verso GitHub per input non valido');
});

test('metodi diversi da GET/HEAD: 405 JSON', async () => {
  process.env.DATA_ROOT = deployDir();
  mockFetch(() => jsonResponse({}));
  const res = await call('summary', '/api/summary', {}, 'POST');
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, 'GET, HEAD');
  assert.deepEqual(JSON.parse(res.body), { error: 'method_not_allowed' });
});

test('archive e data (compatibilità) funzionano', async () => {
  process.env.DATA_ROOT = deployDir();
  fs.mkdirSync(path.join(process.env.DATA_ROOT, 'data', 'archive'));
  fs.writeFileSync(path.join(process.env.DATA_ROOT, 'data', 'archive', 'index.json'), '[1]');
  mockFetch(() => {
    throw new Error('offline');
  });
  const archive = await call('archive', '/api/archive');
  assert.equal(archive.body, '[1]');
  // api/data.js: stesso contenuto di prima, ora con lettura remota e ripiego sul deploy
  fs.writeFileSync(path.join(process.env.DATA_ROOT, 'data', 'data.json'), JSON.stringify({ club: [{ clubId: '70375' }], members: { members: [] } }));
  const data = await call('data', '/api/data');
  assert.equal(data.statusCode, 200);
  assert.ok(JSON.parse(data.body).club);
});
