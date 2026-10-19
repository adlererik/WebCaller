import test from 'node:test';
import assert from 'node:assert/strict';
import {ntfyAlerts,ntfyConfig} from '../server/ntfy.mjs';
import {createStore} from '../server/store.mjs';
import {ntfyEntry} from '../public/ntfy-setup.js';
import {clearEntryFragment} from '../public/onboarding.js';
import {createCallAlerts} from '../server/call-alerts.mjs';
const owner='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',callId='cccccccc-cccc-4ccc-cccc-cccccccccccc';
const env={NTFY_PUBLIC_URL:'https://notify.example.com',NTFY_PUBLISH_URL:'http://127.0.0.1:8094',NTFY_PUBLISH_TOKEN:'tk_synthetic_notification_only_token',NTFY_IOS_UPSTREAM:'true'};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture(t,fetcher=async()=>new Response('{}')){
  const store=createStore(':memory:');for(const id of [owner,other])store.run('INSERT INTO users VALUES(?,?,?,?)',id,id,'{}',id);
  const sends=[];const alerts=ntfyAlerts({env,publicURL:'https://example.com/calls',store,body:async r=>r.body||{},fail:(status,message)=>{throw Object.assign(new Error(message),{status});},rate:()=>{},fetcher:async(...args)=>{sends.push(args);return fetcher(...args);},testDelay:0});
  const route=async(path,method='GET',body={},id=owner)=>{let result;assert.equal(await alerts.routes({method,body},path,{id},(status,value)=>result={status,...value}),true);return result;};
  t.after(()=>{alerts.close();store.close();});
  return {store,sends,alerts,route,setup:()=>route('/ntfy','POST')};
}
test('ntfy config requires isolated HTTPS public origin and trusted fixed publisher; partial configuration fails closed',()=>{
  assert.equal(ntfyConfig({},'https://example.com'),null);assert.equal(ntfyConfig(env,'https://example.com').iosInstant,true);
  for(const override of [{NTFY_PUBLIC_URL:'https://example.com'},{NTFY_PUBLIC_URL:'https://notify.example.com/path'},{NTFY_PUBLIC_URL:'https://user:pass@notify.example.com'},{NTFY_PUBLISH_URL:'http://192.168.1.1'},{NTFY_PUBLISH_URL:'http://localhost:8094/path'},{NTFY_PUBLISH_TOKEN:''}])assert.throws(()=>ntfyConfig({...env,...override},'https://example.com'));
});
test('device setup is idempotent, separated by authenticated owner, and has only a read capability',async t=>{
  const f=await fixture(t),a=await f.setup(),again=await f.setup(),b=await f.route('/ntfy','POST',{},other);
  assert.match(a.topic,/^wc_[\w-]{43}$/);assert.equal(again.topic,a.topic);assert.notEqual(a.topic,b.topic);
  assert.equal(a.confirmed,false);assert.equal(a.link,`ntfy://notify.example.com/${a.topic}?display=Incoming%20calls`);
  assert.ok(!JSON.stringify(a).includes(env.NTFY_PUBLISH_TOKEN));assert.equal(await f.alerts.call({to:owner,id:callId},0,Date.now()+1000),false);
  await f.route('/ntfy','DELETE');assert.equal((await f.route('/ntfy')).connected,false);assert.equal((await f.route('/ntfy','GET',{},other)).topic,b.topic);
  assert.notEqual((await f.setup()).topic,a.topic);
});
test('sound test requires actual successful delivery, matching browser opening, and explicit heard confirmation',async t=>{
  const f=await fixture(t);await f.setup();const test=await f.route('/ntfy/test','POST');
  await assert.rejects(f.route('/ntfy/test-result','POST',{testId:test.testId,heard:true}),{status:409});
  await assert.rejects(f.route('/ntfy/test-open','POST',{testId:test.testId},other),{status:410});
  await new Promise(resolve=>setTimeout(resolve,20));
  await assert.rejects(f.route('/ntfy/test-result','POST',{testId:test.testId,heard:true}),{status:409});
  await f.route('/ntfy/test-open','POST',{testId:test.testId});
  await assert.rejects(f.route('/ntfy/test-result','POST',{testId:test.testId,heard:false}),{status:409});
  assert.equal((await f.route('/ntfy/test-result','POST',{testId:test.testId,heard:true})).ok,true);assert.equal((await f.route('/ntfy')).confirmed,true);
  await assert.rejects(f.route('/ntfy/test-result','POST',{testId:test.testId,heard:true}),{status:410});
});
test('native payload stays generic and no encryption/authentication material or contact name reaches ntfy',async t=>{
  const f=await fixture(t);await f.setup();f.store.run('UPDATE ntfy_devices SET confirmed=1');
  await f.alerts.call({id:callId,to:owner,from:other,name:'Do not send me',envelope:{secret:'signed encrypted SDP'}},1,Date.now()+20000);
  const [url,opts]=f.sends[0],payload=JSON.parse(opts.body);
  assert.equal(url,env.NTFY_PUBLISH_URL);assert.equal(opts.headers.Authorization,'Bearer '+env.NTFY_PUBLISH_TOKEN);assert.equal(opts.redirect,'error');assert.equal(payload.priority,5);
  assert.deepEqual(ntfyEntry(new URL(payload.click).hash),{owner,callId});
  assert.equal(payload.actions[0].action,'view');assert.equal(payload.actions[0].label,'Open call');
  for(const value of ['Do not send me','signed encrypted SDP','keys','token','SAS','envelope'])assert.ok(!opts.body.includes(value));
  assert.equal(f.sends.length,1);assert.equal(await f.alerts.call({id:callId,to:owner},2,Date.now()-1),false);
});
test('ending call or disconnecting extra ringing aborts outstanding publishes and invalidates tests',async t=>{
  const f=await fixture(t,(_,o)=>new Promise((resolve,reject)=>o.signal.addEventListener('abort',()=>reject(o.signal.reason),{once:true})));await f.setup();f.store.run('UPDATE ntfy_devices SET confirmed=1');
  const pending=f.alerts.call({id:callId,to:owner},0,Date.now()+10000);await flush();f.alerts.stop(callId);assert.equal(await pending,false);
  const pending2=f.alerts.call({id:callId,to:owner},0,Date.now()+10000);await flush();const queued=await f.route('/ntfy/test','POST');await f.route('/ntfy','DELETE');assert.equal(await pending2,false);
  await assert.rejects(f.route('/ntfy/test-open','POST',{testId:queued.testId}),{status:410});
});
test('publish errors never escape into calling; scheduler cancellation hooks stop pending native requests',async t=>{
  const f=await fixture(t,async()=>{throw Error('unreachable');});await f.setup();f.store.run('UPDATE ntfy_devices SET confirmed=1');assert.equal(await f.alerts.call({id:callId,to:owner},0,Date.now()+2000),false);
  const stopped=[],sent=[];const alerts=createCallAlerts({send:c=>sent.push(c.id),isWaiting:()=>true,onStop:id=>stopped.push(id),delays:[]});alerts.start({id:callId,expiresAt:Date.now()+1000});await flush();alerts.stop(callId);assert.deepEqual(stopped,[callId]);assert.deepEqual(sent,[callId]);alerts.close();
});
test('notification links cannot supply answer intent; remove alert references before navigation or requests',()=>{
  const hash=`#incoming-call=${callId}&receiver=${owner}`;assert.deepEqual(ntfyEntry(hash),{owner,callId});assert.equal(ntfyEntry(hash+'&ntfy-test='+callId),null);assert.equal(ntfyEntry('#incoming-call=bad&receiver='+owner),null);
  let replaced;clearEntryFragment({hash,pathname:'/calls/',search:''},{replaceState:(_,__,v)=>replaced=v});assert.equal(replaced,'/calls/');
  const parsed=ntfyEntry(hash+'&answer=true&token=untrusted');assert.equal(parsed.answer,undefined);assert.equal(parsed.token,undefined);
});
test('removing a device cascades its optional notification capability without touching peers',async t=>{
  const f=await fixture(t);await f.setup();await f.route('/ntfy','POST',{},other);f.store.run('DELETE FROM users WHERE id=?',owner);assert.equal((await f.route('/ntfy')).connected,false);assert.equal((await f.route('/ntfy','GET',{},other)).connected,true);
});

test('a heard test may use an explicit phone-icon fallback without asserting direct-link verification',async t=>{
  const f=await fixture(t);await f.setup();const test=await f.route('/ntfy/test','POST');await new Promise(r=>setTimeout(r,20));
  const state=await f.route('/ntfy');assert.equal(state.pendingTest.testId,test.testId);assert.equal(state.pendingTest.opened,false);
  await assert.rejects(f.route('/ntfy/test-result','POST',{testId:test.testId,heard:true}),{status:409});
  assert.equal((await f.route('/ntfy/test-result','POST',{testId:test.testId,heard:true,usePhoneIcon:true})).ok,true);assert.equal((await f.route('/ntfy')).pendingTest,undefined);
});

test('call alert preference is owner-scoped, requires a sound test, and keeps the subscription',async t=>{
  const f=await fixture(t),a=await f.setup(),b=await f.route('/ntfy','POST',{},other);
  await assert.rejects(f.route('/ntfy/preference','POST',{useNtfy:true}),{status:409});
  await assert.rejects(f.route('/ntfy/preference','POST',{useNtfy:'true'}),{status:400});
  f.store.run('UPDATE ntfy_devices SET confirmed=123 WHERE owner=?',owner);
  assert.equal((await f.route('/ntfy/preference','POST',{useNtfy:false,owner:other})).preferred,false);
  const paused=await f.route('/ntfy');assert.equal(paused.topic,a.topic);assert.equal(paused.confirmed,true);
  assert.equal((await f.route('/ntfy','GET',{},other)).preferred,true);assert.equal((await f.route('/ntfy','GET',{},other)).topic,b.topic);
  assert.equal(await f.alerts.call({id:callId,to:owner},0,Date.now()+20000),false);assert.equal(f.sends.length,0);
  assert.equal((await f.route('/ntfy/preference','POST',{useNtfy:true})).preferred,true);
  assert.equal(await f.alerts.call({id:callId,to:owner},0,Date.now()+20000),true);assert.equal(f.sends.length,1);
  assert.equal((await f.route('/ntfy')).topic,a.topic);
});

test('switching to browser alerts aborts only that device call publish and preserves confirmation',async t=>{
  const f=await fixture(t,(_,o)=>new Promise((resolve,reject)=>o.signal.addEventListener('abort',()=>reject(o.signal.reason),{once:true})));
  await f.setup();f.store.run('UPDATE ntfy_devices SET confirmed=456 WHERE owner=?',owner);
  const pending=f.alerts.call({id:callId,to:owner},0,Date.now()+20000);await flush();
  await f.route('/ntfy/preference','POST',{useNtfy:false});assert.equal(await pending,false);
  const saved=f.store.get('SELECT * FROM ntfy_devices WHERE owner=?',owner);assert.equal(saved.confirmed,456);assert.equal(saved.preferred,0);
});

test('additive preference migration preserves existing users, topics, confirmation and ratchet identities',async t=>{
  const {DatabaseSync}=await import('node:sqlite'),{mkdtempSync,rmSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
  const dir=mkdtempSync(join(tmpdir(),'webcaller-ntfy-preference-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const db=new DatabaseSync(join(dir,'calls.sqlite'));
  db.exec('CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT NOT NULL,keys TEXT NOT NULL,token_hash TEXT UNIQUE NOT NULL); CREATE TABLE ntfy_devices(owner TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,topic TEXT UNIQUE NOT NULL,created INTEGER NOT NULL,confirmed INTEGER NOT NULL DEFAULT 0); CREATE TABLE ratchet_accounts(owner TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,identity TEXT NOT NULL,signature TEXT NOT NULL)');
  db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(owner,'Synthetic user','{"synthetic":true}','synthetic-token-hash');
  db.prepare('INSERT INTO ntfy_devices VALUES(?,?,?,?)').run(owner,'wc_synthetic_preserved_subscription',10,20);
  db.prepare('INSERT INTO ratchet_accounts VALUES(?,?,?)').run(owner,'synthetic-preserved-identity','synthetic-signature');db.close();
  let store=createStore(dir);const before=store.get('SELECT * FROM ntfy_devices WHERE owner=?',owner);
  assert.equal(before.preferred,1);assert.equal(before.confirmed,20);assert.equal(before.topic,'wc_synthetic_preserved_subscription');
  store.run('UPDATE ntfy_devices SET preferred=0 WHERE owner=?',owner);store.close();store=createStore(dir);
  assert.equal(store.get('SELECT * FROM ntfy_devices WHERE owner=?',owner).preferred,0);
  assert.equal(store.get('SELECT * FROM users WHERE id=?',owner).token_hash,'synthetic-token-hash');
  assert.equal(store.get('SELECT * FROM ratchet_accounts WHERE owner=?',owner).identity,'synthetic-preserved-identity');store.close();
});
test('Docker publishing is an exact opt-in; secret-file errors never reveal credentials',async t=>{
  const {mkdtempSync,writeFileSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
  const dir=mkdtempSync(join(tmpdir(),'webcaller-ntfy-secret-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const file=join(dir,'publisher.token');writeFileSync(file,env.NTFY_PUBLISH_TOKEN+'\n',{mode:0o400});
  const docker={...env,NTFY_PUBLISH_TOKEN:undefined,NTFY_PUBLISH_TOKEN_FILE:file,NTFY_PUBLISH_URL:'http://ntfy:8094',NTFY_ALLOW_DOCKER_HTTP:'true'};
  assert.equal(ntfyConfig(docker,'https://example.com').token,env.NTFY_PUBLISH_TOKEN);
  for(const override of [{NTFY_ALLOW_DOCKER_HTTP:'false'},{NTFY_PUBLISH_URL:'http://ntfy:80'},{NTFY_PUBLISH_URL:'http://other:8094'},{NTFY_PUBLISH_URL:'http://192.168.1.1:8094'},{NTFY_PUBLISH_TOKEN:env.NTFY_PUBLISH_TOKEN}])assert.throws(()=>ntfyConfig({...docker,...override},'https://example.com'));
  assert.throws(()=>ntfyConfig({...docker,NTFY_PUBLISH_TOKEN_FILE:join(dir,'missing')},'https://example.com'),/^Error: Cannot read the ntfy publisher secret file\.$/);
});
