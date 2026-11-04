const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execSync} = require('node:child_process');

test('publish-data: i dati vanno nel branch data senza toccare main, restore li riporta', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ea-pub-'));
  try {
    const sh = (cmd, cwd) => execSync(cmd, {cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
    const script = path.join(__dirname, '..', 'scripts', 'publish-data.sh');
    const bare = path.join(dir, 'remote.git');
    sh('git init -q --bare remote.git', dir);
    sh('git clone -q remote.git work', dir);
    const w = path.join(dir, 'work');
    sh('git config user.email a@b.c && git config user.name t && git checkout -q -b main', w);
    fs.mkdirSync(path.join(w, 'data'));
    fs.writeFileSync(path.join(w, 'data', 'a.json'), '{"v":1}');
    fs.writeFileSync(path.join(w, 'vercel.json'), '{"git":{}}');
    sh('git add -A && git commit -q -m init && git push -q origin main', w);
    sh(`bash ${script} publish`, w);
    assert.match(sh('git ls-tree -r --name-only data', bare), /data\/a\.json/);
    assert.match(sh('git ls-tree -r --name-only data', bare), /vercel\.json/);
    fs.writeFileSync(path.join(w, 'data', 'a.json'), '{"v":2}');
    sh(`bash ${script} publish`, w);
    assert.equal(sh('git show data:data/a.json', bare), '{"v":2}');
    assert.equal(sh('git log --format=%s main', bare).trim(), 'init');
    sh(`bash ${script} publish`, w);
    assert.equal(sh('git rev-list --count data', bare).trim(), '2');
    fs.writeFileSync(path.join(w, 'data', 'a.json'), '{"v":0}');
    sh(`bash ${script} restore`, w);
    assert.equal(fs.readFileSync(path.join(w, 'data', 'a.json'), 'utf8'), '{"v":2}');
    // solo orari che cambiano: niente commit prima dell heartbeat, commit con heartbeat scaduto
    fs.writeFileSync(path.join(w, 'data', 'a.json'), '{"v":2,"checkedAt":"2026-01-01T00:00:00Z"}');
    sh(`bash ${script} publish`, w);
    assert.equal(sh('git rev-list --count data', bare).trim(), '2', 'solo orologio: niente commit');
    fs.writeFileSync(path.join(w, 'data', 'a.json'), '{"v":3,"checkedAt":"2026-01-01T00:20:00Z"}');
    sh(`bash ${script} publish`, w);
    assert.equal(sh('git rev-list --count data', bare).trim(), '3', 'novità reale: commit subito');
    fs.writeFileSync(path.join(w, 'data', 'a.json'), '{"v":3,"checkedAt":"2026-01-01T00:30:00Z"}');
    execSync(`DATA_HEARTBEAT=0 bash ${script} publish`, {cwd: w});
    assert.equal(sh('git rev-list --count data', bare).trim(), '4', 'heartbeat scaduto: commit');
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});
