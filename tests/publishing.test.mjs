import test from 'node:test';
import assert from 'node:assert/strict';
import {problems} from '../scripts/audit-source.mjs';
test('publishing guard excludes runtime, certificates, databases and private env',()=>{
  for (const path of ['.env','.env.production','data/messages.db','.runtime/file','certs/privkey.pem','deploy/backups/server.mjs','docker/config/app.env','docker/.updates/v1/file','app.env','docker/.setup-fixture/tunnel-token','tunnel-token']) assert.ok(problems(path,Buffer.from('')).length,path);
  assert.deepEqual(problems('.env.example',Buffer.from('TURN_SECRET=\nBOOTSTRAP_TOKEN=\n')),[]);
  assert.deepEqual(problems('server/index.mjs',Buffer.from('const secret=env.TURN_SECRET;')),[]);
});
test('publishing guard catches embedded credentials without echoing them',()=>{
  for (const text of ['BOOTSTRAP_TOKEN=fixture-private-value','NTFY_PUBLISH_TOKEN=fixture-notification-value','-----BEGIN '+'PRIVATE KEY-----','https://example.com/calls#setup='+'x'.repeat(32),'ghp_'+'x'.repeat(40)]) assert.ok(problems('source.txt',Buffer.from(text)).length);
});
test('publishing guard catches native alert credentials in prose and URLs',()=>{
  const topic='wc_'+'x'.repeat(42)+'-';
  for (const text of ['https://ntfy.example.com/'+topic, 'Subscription topic: '+topic, 'Bearer tk_'+'x'.repeat(29)]) assert.ok(problems('guide.md',Buffer.from(text)).length);
  assert.deepEqual(problems('guide.md',Buffer.from('Copy your wc_ topic from this phone. NTFY_PUBLISH_TOKEN stays on the server.')),[]);
});
