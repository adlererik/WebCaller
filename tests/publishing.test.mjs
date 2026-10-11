import test from 'node:test';
import assert from 'node:assert/strict';
import {problems} from '../scripts/audit-source.mjs';
test('publishing guard excludes runtime, certificates, databases and private env',()=>{
  for (const path of ['.env','.env.production','data/messages.db','.runtime/file','certs/privkey.pem','deploy/backups/server.mjs']) assert.ok(problems(path,Buffer.from('')).length,path);
  assert.deepEqual(problems('.env.example',Buffer.from('TURN_SECRET=\nBOOTSTRAP_TOKEN=\n')),[]);
  assert.deepEqual(problems('server/index.mjs',Buffer.from('const secret=env.TURN_SECRET;')),[]);
});
test('publishing guard catches embedded credentials without echoing them',()=>{
  for (const text of ['BOOTSTRAP_TOKEN=fixture-private-value','-----BEGIN '+'PRIVATE KEY-----','https://example.com/calls#setup='+'x'.repeat(32),'ghp_'+'x'.repeat(40)]) assert.ok(problems('source.txt',Buffer.from(text)).length);
});
