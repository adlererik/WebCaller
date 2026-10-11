import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,copyFileSync,readFileSync,writeFileSync,statSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const script=fileURLToPath(new URL('../scripts/setup.mjs',import.meta.url));
const example=fileURLToPath(new URL('../.env.example',import.meta.url));
function fixture(t){const cwd=mkdtempSync(join(tmpdir(),'webcaller-setup-'));t.after(()=>rmSync(cwd,{recursive:true,force:true}));copyFileSync(example,join(cwd,'.env.example'));return cwd;}
test('setup generates private secrets once and preserves them on rerun',t=>{
  const cwd=fixture(t);const run=()=>spawnSync(process.execPath,[script],{cwd,encoding:'utf8'});
  assert.equal(run().status,0);const text=readFileSync(join(cwd,'.env'),'utf8');
  assert.match(text,/^BOOTSTRAP_TOKEN=[A-Za-z0-9_-]{32}$/m);assert.match(text,/^TURN_SECRET=[a-f0-9]{64}$/m);
  assert.match(text,/^VAPID_PRIVATE_KEY=[A-Za-z0-9_-]+$/m);assert.equal(statSync(join(cwd,'.env')).mode&0o777,0o600);
  assert.equal(run().status,0);assert.equal(readFileSync(join(cwd,'.env'),'utf8'),text);
});
test('setup refuses a half-configured VAPID identity without overwriting it',t=>{
  const cwd=fixture(t);const text=readFileSync(example,'utf8').replace('VAPID_PUBLIC_KEY=','VAPID_PUBLIC_KEY=fixture');writeFileSync(join(cwd,'.env'),text);
  assert.notEqual(spawnSync(process.execPath,[script],{cwd}).status,0);assert.equal(readFileSync(join(cwd,'.env'),'utf8'),text);
});
