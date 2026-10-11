import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {randomUUID,createHmac} from 'node:crypto';
import {WebSocket} from 'ws';
import webpush from 'web-push';
import {createApp} from '../server/index.mjs';
import {newIdentity,seal,open,fingerprint} from '../public/crypto.js';
import {newAttachment,attachmentKey,encryptChunk,decryptChunk,CHUNK_SIZE,MAX_FILE_SIZE} from '../public/attachments.js';

async function fixture(push=false,extra={},options={}){
  const origin='https://example.com';
  const vapid=push?webpush.generateVAPIDKeys():{};
  const app=createApp({...options,dataDir:':memory:',env:{PUBLIC_URL:origin+'/calls',BOOTSTRAP_TOKEN:'test-owner-code',VAPID_PUBLIC_KEY:vapid.publicKey||'',VAPID_PRIVATE_KEY:vapid.privateKey||'',CF_TURN_KEY_ID:'',CF_TURN_API_TOKEN:'',TURN_SECRET:'test-turn-secret',TURN_URLS:'turn:relay.test:3478?transport=udp',...extra}});
  app.server.listen(0,'127.0.0.1');await once(app.server,'listening');
  const url=`http://127.0.0.1:${app.server.address().port}`;
  async function request(path,{method='GET',body,token,requestOrigin=origin}={}){
    const res=await fetch(url+'/calls/api'+path,{method,headers:{Origin:requestOrigin,...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});
    return {status:res.status,body:await res.json()};
  }
  const a=await newIdentity();const registered=await request('/register',{method:'POST',body:{name:'Alice',keys:a.keys,setupCode:'test-owner-code'}});
  assert.equal(registered.status,201);const alice={...registered.body,identity:a};
  async function pair(){
    const invitation=(await request('/invite',{method:'POST',body:{},token:alice.token})).body;
    const [invite,fp]=new URL(invitation.url).hash.slice(8).split('.');
    const b=await newIdentity();const joined=await request('/join',{method:'POST',body:{name:'Bob',keys:b.keys,invite,fingerprint:fp}});
    assert.equal(joined.status,201);return {bob:{...joined.body,identity:b},invite,fp};
  }
  async function socket(user){
    const {body:{ticket}}=await request('/ticket',{method:'POST',body:{},token:user.token});
    const socket=new WebSocket(url.replace('http','ws')+'/calls/ws',{origin});await once(socket,'open');
    const ready=once(socket,'message');socket.send(JSON.stringify({type:'auth',ticket}));assert.equal(JSON.parse((await ready)[0]).type,'ready');return socket;
  }
  return {app,request,alice,pair,socket,url,origin};
}
test('enrollment, fragment identity verification, single-use invites and authorization',async t=>{
  const f=await fixture();t.after(()=>f.app.close());const {bob,invite,fp}=await f.pair();
  assert.equal((await f.request('/join',{method:'POST',body:{name:'Other',keys:bob.identity.keys,invite,fingerprint:fp}})).status,410);
  assert.equal((await f.request('/me')).status,401);
  assert.equal((await f.request('/invite',{method:'POST',body:{},token:f.alice.token,requestOrigin:'https://evil.test'})).status,403);
  const bad=(await f.request('/invite',{method:'POST',body:{},token:f.alice.token})).body;
  assert.equal((await f.request('/join',{method:'POST',body:{name:'Other',keys:bob.identity.keys,invite:new URL(bad.url).hash.slice(8).split('.')[0],fingerprint:'wrong'}})).status,403);
  const me=await f.request('/me',{token:bob.token});assert.equal(me.body.contacts[0].id,f.alice.user.id);
});
test('encrypted mailbox is idempotent, isolated, expires unread and deletes device state',async t=>{
  const f=await fixture();t.after(()=>f.app.close());const {bob}=await f.pair();
  const peer={id:bob.user.id,keys:bob.identity.keys};
  const e=await seal(f.alice.identity,f.alice.user.id,peer,{kind:'text',text:'Not on the server'},30);
  assert.equal((await f.request('/messages',{method:'POST',body:e,token:f.alice.token})).status,201);
  assert.equal((await f.request('/messages',{method:'POST',body:e,token:f.alice.token})).status,200);
  assert.equal((await f.request('/messages',{method:'POST',body:{...e,to:f.alice.user.id},token:bob.token})).status,400);
  const inbox=(await f.request('/messages',{token:bob.token})).body;assert.equal(inbox.length,1);
  assert.equal((await open(bob.identity,bob.user.id,{id:f.alice.user.id,keys:f.alice.identity.keys},inbox[0])).text,'Not on the server');
  assert.ok(!f.app.store.get('SELECT envelope FROM messages').envelope.includes('Not on the server'));
  f.app.store.purge(e.expiresAt+1);assert.equal((await f.request('/messages',{token:bob.token})).body.length,0);
  assert.equal((await f.request('/device',{method:'DELETE',token:bob.token})).status,200);
  assert.equal((await f.request('/me',{token:bob.token})).status,401);
  assert.equal(f.app.store.get('SELECT COUNT(*) AS n FROM contacts').n,0);
});
test('TURN credentials use time-limited HMAC; push endpoints reject SSRF',async t=>{
  const f=await fixture(true);t.after(()=>f.app.close());const result=await f.request('/ice',{token:f.alice.token});
  assert.equal(result.body.turn,true);const relay=result.body.iceServers[1];
  assert.equal(relay.credential,createHmac('sha1','test-turn-secret').update(relay.username).digest('base64'));
  assert.ok(Number(relay.username.split(':')[0])>Date.now()/1000);
  assert.equal((await f.request('/push',{method:'POST',token:f.alice.token,body:{endpoint:'http://127.0.0.1:22',keys:{auth:'a',p256dh:'b'}}})).status,400);
});
test('WebSocket routes encrypted calls and replays invitations after reconnect',async t=>{
  const f=await fixture();t.after(()=>f.app.close());const {bob}=await f.pair();
  const a=await f.socket(f.alice);const callId=randomUUID();
  const envelope=await seal(f.alice.identity,f.alice.user.id,{id:bob.user.id,keys:bob.identity.keys},{kind:'offer',callId,description:{type:'offer',sdp:'encrypted SDP'}},90);
  a.send(JSON.stringify({type:'signal',kind:'offer',callId,envelope}));
  await new Promise(r=>setTimeout(r,30));
  const ticket=(await f.request('/ticket',{method:'POST',token:bob.token,body:{}})).body.ticket;
  const b=new WebSocket(f.url.replace('http','ws')+'/calls/ws',{origin:f.origin});await once(b,'open');
  const events=[];const signal=new Promise(resolve=>b.on('message',raw=>{const v=JSON.parse(raw);events.push(v);if(v.type==='signal')resolve(v);}));
  b.send(JSON.stringify({type:'auth',ticket}));const received=await signal;
  assert.equal(received.callId,callId);assert.equal(received.envelope.ciphertext,envelope.ciphertext);
  const response=await seal(bob.identity,bob.user.id,{id:f.alice.user.id,keys:f.alice.identity.keys},{kind:'answer',callId,description:{type:'answer',sdp:'answer'}},120);
  const delivered=once(a,'message');b.send(JSON.stringify({type:'signal',kind:'answer',callId,envelope:response}));
  assert.equal(JSON.parse((await delivered)[0]).kind,'answer');a.close();b.close();
});
test('encrypted attachments require complete upload, stay private and disappear with device/expiry',async t=>{
 const f=await fixture();t.after(()=>f.app.close());const {bob}=await f.pair(),{bob:other}=await f.pair();
 const file=new File([new Uint8Array(CHUNK_SIZE+3).fill(83)],'hidden-filename.txt',{type:'text/plain'}),a=newAttachment(file);
 const envelope=await seal(f.alice.identity,f.alice.user.id,{id:bob.user.id,keys:bob.identity.keys},{kind:'attachment',attachment:a},60),key=await attachmentKey(a);
 const init={id:a.id,size:a.size,envelope};
 assert.equal((await f.request('/attachments',{method:'POST',token:f.alice.token,body:init})).status,201);
 assert.equal((await f.request('/attachments',{method:'POST',token:f.alice.token,body:init})).status,200);
 assert.equal((await f.request('/messages',{method:'POST',token:f.alice.token,body:envelope})).status,409);
 const path='/attachments/'+a.id+'/chunks/0';
 assert.equal((await f.request(path)).status,401);
 assert.equal((await f.request(path,{token:other.token})).status,404);
 assert.equal((await f.request(path,{token:bob.token})).status,404);
 const raw=async(method,index,token,bytes)=>fetch(f.url+'/calls/api/attachments/'+a.id+'/chunks/'+index,{method,headers:{Origin:f.origin,Authorization:'Bearer '+token,'Content-Type':'application/octet-stream'},body:bytes});
 const ciphers=[];
 for(let i=0;i<a.chunks;i++){
  ciphers.push(await encryptChunk(key,a,i,envelope.expiresAt,await file.slice(i*CHUNK_SIZE,(i+1)*CHUNK_SIZE).arrayBuffer()));
  assert.equal((await raw('PUT',i,bob.token,ciphers[i])).status,403);
  assert.equal((await raw('PUT',i,f.alice.token,new Uint8Array(1))).status,400);
  assert.equal((await raw('PUT',i,f.alice.token,ciphers[i])).status,201);
 }
 assert.equal((await raw('PUT',0,f.alice.token,new Uint8Array(ciphers[0].byteLength))).status,409);
 assert.equal((await f.request('/messages',{method:'POST',token:f.alice.token,body:envelope})).status,201);
 const download=await raw('GET',0,bob.token);assert.equal(download.status,200);assert.equal(download.headers.get('cache-control'),'no-store');
 assert.deepEqual(new Uint8Array(await decryptChunk(key,a,0,envelope.expiresAt,await download.arrayBuffer())),new Uint8Array(CHUNK_SIZE).fill(83));
 assert.ok(!f.app.store.get('SELECT envelope FROM attachments').envelope.includes(file.name));
 assert.equal((await raw('PUT',0,f.alice.token,ciphers[0])).status,403);
 assert.equal((await f.request('/device',{method:'DELETE',token:bob.token})).status,200);
 assert.equal(f.app.store.get('SELECT COUNT(*) AS n FROM attachment_chunks').n,0);
 assert.equal(f.app.store.get('SELECT COUNT(*) AS n FROM attachments').n,0);
 const pending=await seal(f.alice.identity,f.alice.user.id,{id:other.user.id,keys:other.identity.keys},{kind:'attachment',attachment:a},60);
 assert.equal((await f.request('/attachments',{method:'POST',token:f.alice.token,body:{id:a.id,size:a.size,envelope:pending}})).status,201);
 f.app.store.purge(pending.expiresAt+1);assert.equal(f.app.store.get('SELECT COUNT(*) AS n FROM attachments').n,0);
});
test('attachment size and storage quotas prevent unbounded uploads',async t=>{
 const f=await fixture(false,{ATTACHMENT_USER_QUOTA_MB:'10',ATTACHMENT_GLOBAL_QUOTA_MB:'10'});t.after(()=>f.app.close());const {bob}=await f.pair();
 const make=()=>seal(f.alice.identity,f.alice.user.id,{id:bob.user.id,keys:bob.identity.keys},{kind:'attachment'},60);
 const first={id:randomUUID(),size:MAX_FILE_SIZE,envelope:await make()};
 assert.equal((await f.request('/attachments',{method:'POST',token:f.alice.token,body:{...first,size:MAX_FILE_SIZE+1}})).status,400);
 assert.equal((await f.request('/attachments',{method:'POST',token:f.alice.token,body:first})).status,201);
 assert.equal((await f.request('/attachments',{method:'POST',token:f.alice.token,body:{id:randomUUID(),size:1,envelope:await make()}})).status,413);
 assert.equal((await f.request('/attachments/'+first.id,{method:'DELETE',token:bob.token})).status,403);
 assert.equal((await f.request('/attachments/'+first.id,{method:'DELETE',token:f.alice.token})).status,200);
 assert.equal(f.app.store.get('SELECT COUNT(*) AS n FROM attachments').n,0);
});
test('either participant deletes messages for both, reconnect learns deletions and replays stay deleted', {timeout:10000},async t=>{
  const f=await fixture();t.after(()=>f.app.close());const {bob}=await f.pair(),{bob:other}=await f.pair();
  const peer={id:bob.user.id,keys:bob.identity.keys},a=await f.socket(f.alice),b=await f.socket(bob);
  const envelope=await seal(f.alice.identity,f.alice.user.id,peer,{kind:'text',text:'remove from both'},60);
  await f.request('/messages',{method:'POST',token:f.alice.token,body:envelope});
  assert.equal((await f.request('/messages/'+envelope.id,{method:'DELETE',token:other.token})).status,404);
  const received=new Promise(resolve=>a.on('message',raw=>{const event=JSON.parse(raw);if(event.type==='message-deleted')resolve(event);}));
  assert.equal((await f.request('/messages/'+envelope.id,{method:'DELETE',token:bob.token})).status,200);
  assert.equal((await received).id,envelope.id);
  for(const user of [f.alice,bob]){
    assert.deepEqual((await f.request('/messages',{token:user.token})).body,[]);
    assert.equal((await f.request('/message-deletions',{token:user.token})).body[0].id,envelope.id);
  }
  assert.deepEqual((await f.request('/message-deletions',{token:other.token})).body,[]);
  assert.equal((await f.request('/messages',{method:'POST',token:f.alice.token,body:envelope})).status,410);
  assert.equal((await f.request('/messages/'+envelope.id,{method:'DELETE',token:f.alice.token})).status,200);
  const second=await seal(f.alice.identity,f.alice.user.id,peer,{kind:'text',text:'sender removes this'},60);
  await f.request('/messages',{method:'POST',token:f.alice.token,body:second});
  assert.equal((await f.request('/messages/'+second.id,{method:'DELETE',token:f.alice.token})).status,200);
  f.app.store.purge(Math.max(second.expiresAt,envelope.expiresAt)+1);assert.equal(f.app.store.get('SELECT COUNT(*) AS n FROM message_deletions').n,0);
  a.close();b.close();
});
test('deleting media removes encrypted chunks and prevents attachment resurrection',async t=>{
  const f=await fixture();t.after(()=>f.app.close());const {bob}=await f.pair();
  const file=new File(['synthetic media bytes'],'clip.webm',{type:'video/webm'}),attachment=newAttachment(file),key=await attachmentKey(attachment);
  const envelope=await seal(f.alice.identity,f.alice.user.id,{id:bob.user.id,keys:bob.identity.keys},{kind:'attachment',attachment,text:'caption'},3600);
  await f.request('/attachments',{method:'POST',token:f.alice.token,body:{id:attachment.id,size:attachment.size,envelope}});
  const cipher=await encryptChunk(key,attachment,0,envelope.expiresAt,await file.arrayBuffer());
  const upload=await fetch(f.url+'/calls/api/attachments/'+attachment.id+'/chunks/0',{method:'PUT',headers:{Origin:f.origin,Authorization:'Bearer '+f.alice.token},body:cipher});assert.equal(upload.status,201);
  const realNow=Date.now();t.mock.method(Date,'now',()=>realNow+360000); // Slow reserved upload, over five minutes.
  assert.equal((await f.request('/messages',{method:'POST',token:f.alice.token,body:envelope})).status,201);
  t.mock.restoreAll();
  assert.equal((await f.request('/messages/'+envelope.id,{method:'DELETE',token:bob.token})).status,200);
  assert.equal(f.app.store.get('SELECT COUNT(*) AS n FROM attachment_chunks').n,0);
  assert.equal(f.app.store.get('SELECT COUNT(*) AS n FROM attachments').n,0);
  assert.equal((await f.request('/attachments/'+attachment.id+'/chunks/0',{token:f.alice.token})).status,404);
  assert.equal((await f.request('/attachments',{method:'POST',token:f.alice.token,body:{id:attachment.id,size:attachment.size,envelope}})).status,410);
  assert.equal((await f.request('/device',{method:'DELETE',token:bob.token})).status,200);
  assert.equal(f.app.store.get('SELECT COUNT(*) AS n FROM message_deletions').n,0);
});
test('typing updates are encrypted, short-lived, contact-only and never stored or replayed', {timeout:10000},async t=>{
  const f=await fixture();t.after(()=>f.app.close());const {bob}=await f.pair(),{bob:other}=await f.pair();
  const a=await f.socket(f.alice),b=await f.socket(bob);
  const peer={id:bob.user.id,keys:bob.identity.keys};
  const envelope=await seal(f.alice.identity,f.alice.user.id,peer,{kind:'typing',active:true},8);
  const delivered=once(b,'message');a.send(JSON.stringify({type:'typing',envelope}));
  const event=JSON.parse((await delivered)[0]);assert.equal(event.type,'typing');assert.ok(!JSON.stringify(event).includes('active'));
  assert.deepEqual(await open(bob.identity,bob.user.id,{id:f.alice.user.id,keys:f.alice.identity.keys},event.envelope),{kind:'typing',active:true});
  assert.equal(f.app.store.get('SELECT COUNT(*) AS n FROM messages').n,0);
  const error=once(b,'message');b.send(JSON.stringify({type:'typing',envelope:await seal(bob.identity,bob.user.id,{id:other.user.id,keys:other.identity.keys},{kind:'typing',active:true},8)}));
  assert.equal(JSON.parse((await error)[0]).type,'error');
  const late=once(a,'message');a.send(JSON.stringify({type:'typing',envelope:await seal(f.alice.identity,f.alice.user.id,peer,{kind:'typing',active:true},30)}));
  assert.equal(JSON.parse((await late)[0]).type,'error');
  b.close();const reconnected=await f.socket(bob);assert.equal(f.app.store.get('SELECT COUNT(*) AS n FROM messages').n,0);reconnected.close();a.close();
});

// Real HTTP/WebSocket enrollment with a fake push transport; no third-party traffic.
test('named invite preview verifies the inviter without consuming the invitation',async t=>{
  const f=await fixture();t.after(()=>f.app.close());
  const created=await f.request('/invite',{method:'POST',token:f.alice.token,body:{name:'Grandma'}});
  const [invite,fp]=new URL(created.body.url).hash.slice(8).split('.');
  const preview=()=>f.request('/invite-info',{method:'POST',body:{invite,fingerprint:fp}});
  assert.deepEqual((await preview()).body.name,'Grandma');assert.equal((await preview()).body.from,'Alice');
  assert.equal((await f.request('/invite-info',{method:'POST',body:{invite,fingerprint:'wrong'}})).status,403);
  const identity=await newIdentity();assert.equal((await f.request('/join',{method:'POST',body:{invite,fingerprint:fp,name:'Grandma',keys:identity.keys}})).status,201);
  assert.equal((await preview()).status,410);
});
test('sound tests target this subscription, require its owner and never infer audible success',async t=>{
  const deliveries=[],f=await fixture(true,{}, {testAlertDelay:10,sendPush:async(subscription,payload,options)=>deliveries.push({subscription,payload:JSON.parse(payload),options})});t.after(()=>f.app.close());const {bob}=await f.pair();
  const endpoint='https://fcm.googleapis.com/test/one',other='https://fcm.googleapis.com/test/two',keys={auth:'fake-auth',p256dh:'fake-key'};
  for(const ep of [endpoint,other])assert.equal((await f.request('/push',{method:'POST',token:f.alice.token,body:{endpoint:ep,keys}})).status,200);
  const status=()=>f.request('/push/status',{method:'POST',token:f.alice.token,body:{endpoint}});
  assert.equal((await status()).body.confirmed,false);
  assert.equal((await f.request('/push/test',{method:'POST',token:bob.token,body:{endpoint}})).status,409);
  const test=await f.request('/push/test',{method:'POST',token:f.alice.token,body:{endpoint}});assert.equal(test.status,202);
  await new Promise(r=>setTimeout(r,30));assert.equal(deliveries.length,1);assert.equal(deliveries[0].subscription.endpoint,endpoint);assert.equal(deliveries[0].payload.type,'test');assert.equal(deliveries[0].options.TTL,15);
  assert.equal((await status()).body.confirmed,false);
  assert.equal((await f.request('/push/test-result',{method:'POST',token:bob.token,body:{testId:test.body.testId,heard:true}})).status,410);
  assert.equal((await f.request('/push/test-result',{method:'POST',token:f.alice.token,body:{testId:test.body.testId,heard:false}})).status,400);
  assert.equal((await f.request('/push/test-result',{method:'POST',token:f.alice.token,body:{testId:test.body.testId,heard:true}})).status,200);
  assert.equal((await status()).body.confirmed,true);assert.equal(f.app.store.get('SELECT confirmed FROM push WHERE endpoint=?',other).confirmed,0);
  assert.equal((await f.request('/push',{method:'POST',token:f.alice.token,body:{endpoint,expirationTime:null,keys}})).status,200);assert.equal((await status()).body.confirmed,true);
  assert.equal((await f.request('/push/test-result',{method:'POST',token:f.alice.token,body:{testId:test.body.testId,heard:true}})).status,410);
});
test('answered and cancelled calls stop real server reminders; call status is participant-only',async t=>{
  const deliveries=[],f=await fixture(true,{}, {alertTiming:{delays:[80,160]},sendPush:async(sub,payload,options)=>deliveries.push({payload:JSON.parse(payload),options})});t.after(()=>f.app.close());const {bob}=await f.pair(),{bob:outsider}=await f.pair();
  await f.request('/push',{method:'POST',token:bob.token,body:{endpoint:'https://fcm.googleapis.com/test/calls',keys:{auth:'a',p256dh:'b'}}});
  const a=await f.socket(f.alice),b=await f.socket(bob);t.after(()=>{a.close();b.close();});
  async function signal(socket,from,to,kind,callId){const envelope=await seal(from.identity,from.user.id,{id:to.user.id,keys:to.identity.keys},{kind,callId},90);socket.send(JSON.stringify({type:'signal',kind,callId,envelope}));}
  const id=randomUUID(),incoming=once(b,'message');await signal(a,f.alice,bob,'offer',id);await incoming;
  assert.equal((await f.request('/calls/'+id,{token:bob.token})).body.state,'ringing');assert.equal((await f.request('/calls/'+id,{token:outsider.token})).status,404);
  const answered=once(a,'message');await signal(b,bob,f.alice,'answer',id);await answered;await new Promise(r=>setTimeout(r,200));
  assert.equal(deliveries.length,1);assert.ok(deliveries[0].options.TTL<=8);assert.equal(deliveries[0].options.urgency,'high');assert.equal(deliveries[0].payload.mutable,true);assert.equal((await f.request('/calls/'+id,{token:bob.token})).body.state,'answered');
  const ended=once(b,'message');await signal(a,f.alice,bob,'hangup',id);await ended;
  assert.equal((await f.request('/calls/'+id,{token:bob.token})).body.state,'ended');
  const next=randomUUID(),again=once(b,'message');await signal(a,f.alice,bob,'offer',next);await again;const cancel=once(b,'message');await signal(a,f.alice,bob,'hangup',next);await cancel;await new Promise(r=>setTimeout(r,200));
  assert.equal(deliveries.length,2);
});
test('location preview and coordinates are encrypted for both phones and deleted together',async t=>{
 const f=await fixture();t.after(()=>f.app.close());const {bob}=await f.pair();
 const location={lat:0,lon:0,accuracy:15,capturedAt:Date.now(),label:'Synthetic meeting point',preview:'pin'};
 const file=new File([new Uint8Array([137,80,78,71,1,2,3])],'location.png',{type:'image/png'}),attachment=newAttachment(file),key=await attachmentKey(attachment);
 const payload={kind:'attachment',attachment,location,text:'Synthetic meeting point'};
 const envelope=await seal(f.alice.identity,f.alice.user.id,{id:bob.user.id,keys:bob.identity.keys},payload,60);
 await f.request('/attachments',{method:'POST',token:f.alice.token,body:{id:attachment.id,size:file.size,envelope}});
 const cipher=await encryptChunk(key,attachment,0,envelope.expiresAt,await file.arrayBuffer());
 const path=f.url+'/calls/api/attachments/'+attachment.id+'/chunks/0';
 assert.equal((await fetch(path,{method:'PUT',headers:{Origin:f.origin,Authorization:'Bearer '+f.alice.token},body:cipher})).status,201);
 assert.equal((await f.request('/messages',{method:'POST',token:f.alice.token,body:envelope})).status,201);
 for(const [self,other]of [[f.alice,bob],[bob,f.alice]]){
  const saved=(await f.request('/messages',{token:self.token})).body[0];
  const decrypted=await open(self.identity,self.user.id,{id:other.user.id,keys:other.identity.keys},saved);assert.deepEqual(decrypted.location,location);
  const download=await fetch(path,{headers:{Authorization:'Bearer '+self.token}});assert.equal(download.status,200);
  assert.deepEqual(new Uint8Array(await decryptChunk(key,attachment,0,envelope.expiresAt,await download.arrayBuffer())),new Uint8Array(await file.arrayBuffer()));
 }
 const stored=f.app.store.get('SELECT envelope FROM messages').envelope;assert.ok(!stored.includes('Synthetic meeting point'));assert.ok(!stored.includes('capturedAt'));
 assert.equal((await f.request('/messages/'+envelope.id,{method:'DELETE',token:bob.token})).status,200);
 assert.equal(f.app.store.get('SELECT COUNT(*) AS n FROM attachment_chunks').n,0);
 assert.deepEqual((await f.request('/messages',{token:f.alice.token})).body,[]);
});
test('location permission and tile CSP allow only the configured map origin',async t=>{
 const f=await fixture();t.after(()=>f.app.close());const res=await fetch(f.url+'/calls/');
 assert.match(res.headers.get('permissions-policy'),/geolocation=\(self\)/);assert.match(res.headers.get('permissions-policy'),/speaker-selection=\(self\)/);
 assert.match(res.headers.get('content-security-policy'),/img-src 'self' data: blob: https:\/\/tile.openstreetmap.org/);
 assert.equal(res.headers.get('referrer-policy'),'no-referrer');
 assert.equal((await f.request('/config')).body.mapTileURL,'https://tile.openstreetmap.org/{z}/{x}/{y}.png');
 assert.throws(()=>createApp({dataDir:':memory:',env:{PUBLIC_URL:'https://example.com/calls',MAP_TILE_URL:'http://evil.test/{z}/{x}/{y}.png'}}),/MAP_TILE_URL/);
});
