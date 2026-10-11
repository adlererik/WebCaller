import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {randomUUID,createHmac} from 'node:crypto';
import {WebSocket} from 'ws';
import webpush from 'web-push';
import {createApp} from '../server/index.mjs';
import {newIdentity,seal,open,fingerprint} from '../public/crypto.js';
import {newAttachment,attachmentKey,encryptChunk,decryptChunk,CHUNK_SIZE,MAX_FILE_SIZE} from '../public/attachments.js';

async function fixture(push=false,extra={}){
  const origin='https://example.com';
  const vapid=push?webpush.generateVAPIDKeys():{};
  const app=createApp({dataDir:':memory:',env:{PUBLIC_URL:origin+'/calls',BOOTSTRAP_TOKEN:'test-owner-code',VAPID_PUBLIC_KEY:vapid.publicKey||'',VAPID_PRIVATE_KEY:vapid.privateKey||'',CF_TURN_KEY_ID:'',CF_TURN_API_TOKEN:'',TURN_SECRET:'test-turn-secret',TURN_URLS:'turn:relay.test:3478?transport=udp',...extra}});
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
