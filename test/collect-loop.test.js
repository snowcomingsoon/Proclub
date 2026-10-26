const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
for (const hour of ['12','20']) test(`collection hands off at hour ${hour}, including push starts`, () => {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ea-loop-'));
 try {
  for(const [name,body] of Object.entries({date:`echo ${hour}`,node:'exit 0',git:'exit 0'})) fs.writeFileSync(path.join(dir,name),'#!/bin/sh\n'+body+'\n',{mode:0o755});
  const output=path.join(dir,'output');
  const r=spawnSync('bash',['scripts/collect-loop.sh'],{cwd:path.join(__dirname,'..'),encoding:'utf8',env:{...process.env,PATH:dir+':'+process.env.PATH,GITHUB_EVENT_NAME:'push',GITHUB_OUTPUT:output,LOOP_SECONDS:'1'}});
  assert.equal(r.status,0,r.stderr);
  assert.match(fs.readFileSync(output,'utf8'),/chain=1/);
  assert.match(r.stdout,/Giri di raccolta: 1/);
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
