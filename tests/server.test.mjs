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
test('contact removal clears both histories, events and complete/partial media, with durable replay protection',async t=>{
  const f=await fixture();t.after(()=>f.app.close());const {bob}=await f.pair(),{bob:other}=await f.pair();
  const peer={id:bob.user.id,keys:bob.identity.keys};
  const text=await seal(f.alice.identity,f.alice.user.id,peer,{kind:'text',text:'Only this conversation'},3600);
  await f.request('/messages',{method:'POST',token:f.alice.token,body:text});
  const reply=await seal(bob.identity,bob.user.id,{id:f.alice.user.id,keys:f.alice.identity.keys},{kind:'text',text:'Reply'},3600);
  await f.request('/messages',{method:'POST',token:bob.token,body:reply});
  f.app.store.run('INSERT INTO message_events VALUES(?,?,?,?,?,?,?)',text.id,f.alice.user.id,'reaction',text.createdAt,text.expiresAt,randomUUID(),JSON.stringify(text));
  const preserved=await seal(f.alice.identity,f.alice.user.id,{id:other.user.id,keys:other.identity.keys},{kind:'text',text:'Keep this other conversation'},3600);
  await f.request('/messages',{method:'POST',token:f.alice.token,body:preserved});
  const attachments=[];
  for(const complete of [true,false]){
    const file=new File([new Uint8Array(complete?5:10000)],'synthetic.bin',{type:'application/octet-stream'}),a=newAttachment(file);
    const envelope=await seal(f.alice.identity,f.alice.user.id,peer,{kind:'attachment',attachment:a},3600),key=await attachmentKey(a);
    assert.equal((await f.request('/attachments',{method:'POST',token:f.alice.token,body:{id:a.id,size:a.size,envelope}})).status,201);
    const cipher=await encryptChunk(key,a,0,envelope.expiresAt,await file.arrayBuffer());
    const uploaded=await fetch(f.url+'/calls/api/attachments/'+a.id+'/chunks/0'+(complete?'':'/parts/0'),{method:'PUT',headers:{Origin:f.origin,Authorization:'Bearer '+f.alice.token},body:complete?cipher:cipher.slice(0,4096)});
    assert.equal(uploaded.status,201);if(complete)assert.equal((await f.request('/messages',{method:'POST',token:f.alice.token,body:envelope})).status,201);
    attachments.push({a,envelope});
  }
  assert.equal((await f.request('/contacts/'+bob.user.id,{method:'DELETE'})).status,401);
  assert.equal((await f.request('/contacts/'+bob.user.id,{method:'DELETE',token:f.alice.token,requestOrigin:'https://evil.test'})).status,403);
  const foreign=await f.request('/contacts/'+bob.user.id,{method:'DELETE',token:other.token});assert.deepEqual(foreign.body.deleted,[]);
  assert.equal(f.app.store.get('SELECT COUNT(*) n FROM messages').n,4);
  const removed=await f.request('/contacts/'+bob.user.id,{method:'DELETE',token:f.alice.token});assert.equal(removed.status,200);
  const ids=[text.id,reply.id,...attachments.map(v=>v.envelope.id)].sort();assert.deepEqual(removed.body.deleted.map(d=>d.id).sort(),ids);
  assert.deepEqual(removed.body.contacts.map(c=>c.id),[other.user.id]);
  assert.deepEqual((await f.request('/me',{token:bob.token})).body.contacts,[]);
  assert.deepEqual((await f.request('/messages',{token:bob.token})).body,[]);
  assert.deepEqual((await f.request('/messages',{token:f.alice.token})).body.map(e=>e.id),[preserved.id]);
  for(const table of ['message_events','attachments','attachment_chunks','attachment_parts'])assert.equal(f.app.store.get('SELECT COUNT(*) n FROM '+table).n,0);
  // A closed recipient learns every deleted ID on reconnect, including unfinished files.
  assert.deepEqual((await f.request('/message-deletions',{token:bob.token})).body.map(d=>d.id).sort(),ids);
  assert.deepEqual((await f.request('/message-deletions',{token:other.token})).body,[]);
  assert.equal((await f.request('/contacts/'+bob.user.id,{method:'DELETE',token:f.alice.token})).status,200);
  assert.equal((await f.request('/messages',{method:'POST',token:f.alice.token,body:text})).status,410);
  const late=await seal(f.alice.identity,f.alice.user.id,peer,{kind:'text',text:'Cannot send without an invitation'},60);
  assert.equal((await f.request('/messages',{method:'POST',token:f.alice.token,body:late})).status,403);
  const invitation=(await f.request('/invite',{method:'POST',token:f.alice.token,body:{}})).body,[invite,fp]=new URL(invitation.url).hash.slice(8).split('.');
  assert.equal((await f.request('/join',{method:'POST',token:bob.token,body:{name:'Bob',keys:bob.identity.keys,invite,fingerprint:fp}})).status,201);
  for(const {a,envelope}of attachments){
    assert.equal((await f.request('/attachments/'+a.id+'/chunks/0',{token:bob.token})).status,404);
    assert.equal((await f.request('/attachments',{method:'POST',token:f.alice.token,body:{id:a.id,size:a.size,envelope}})).status,410);
    assert.equal((await f.request('/messages',{method:'POST',token:f.alice.token,body:envelope})).status,410);
  }
  assert.equal((await f.request('/messages',{method:'POST',token:f.alice.token,body:await seal(f.alice.identity,f.alice.user.id,peer,{kind:'text',text:'New conversation'},60)})).status,201);
});
for(const answered of [false,true])test(`contact removal ends ${answered?'answered':'ringing'} calls and frees both participants`,{timeout:10000},async t=>{
  const f=await fixture();t.after(()=>f.app.close());const {bob}=await f.pair(),{bob:other}=await f.pair();
  const a=await f.socket(f.alice),b=await f.socket(bob),callId=randomUUID(),peer={id:bob.user.id,keys:bob.identity.keys};
  const offer=await seal(f.alice.identity,f.alice.user.id,peer,{kind:'offer',callId},90),arrived=once(b,'message');
  a.send(JSON.stringify({type:'signal',kind:'offer',callId,envelope:offer}));assert.equal(JSON.parse((await arrived)[0]).kind,'offer');
  if(answered){const delivered=once(a,'message');b.send(JSON.stringify({type:'signal',kind:'answer',callId,envelope:await seal(bob.identity,bob.user.id,{id:f.alice.user.id,keys:f.alice.identity.keys},{kind:'answer',callId},90)}));assert.equal(JSON.parse((await delivered)[0]).kind,'answer');}
  // Removing an unrelated contact cannot end this call.
  const events=[];a.on('message',raw=>events.push(JSON.parse(raw)));
  await f.request('/contacts/'+other.user.id,{method:'DELETE',token:f.alice.token});assert.ok(!events.some(e=>e.type==='call-ended'));
  const endA=once(a,'message'),endB=once(b,'message');await f.request('/contacts/'+bob.user.id,{method:'DELETE',token:f.alice.token});
  for(const promise of [endA,endB]){const event=JSON.parse((await promise)[0]);assert.equal(event.type,'call-ended');assert.equal(event.callId,callId);}
  const newCall=randomUUID(),rejection=new Promise(resolve=>b.on('message',raw=>{const e=JSON.parse(raw);if(e.type==='error')resolve(e);}));
  b.send(JSON.stringify({type:'signal',kind:'offer',callId:newCall,envelope:await seal(bob.identity,bob.user.id,{id:f.alice.user.id,keys:f.alice.identity.keys},{kind:'offer',callId:newCall},90)}));
  // The deleted connection cannot ring either phone.
  assert.equal((await rejection).error,'Unknown contact');
  const invitation=(await f.request('/invite',{method:'POST',token:f.alice.token,body:{}})).body,[invite,fp]=new URL(invitation.url).hash.slice(8).split('.');
  assert.equal((await f.request('/join',{method:'POST',token:bob.token,body:{name:'Bob',keys:bob.identity.keys,invite,fingerprint:fp}})).status,201);
  // After an explicit new invitation, both can call again rather than remaining busy.
  const nextId=randomUUID(),incoming=new Promise(resolve=>a.on('message',raw=>{const e=JSON.parse(raw);if(e.type==='signal')resolve(e);}));
  b.send(JSON.stringify({type:'signal',kind:'offer',callId:nextId,envelope:await seal(bob.identity,bob.user.id,{id:f.alice.user.id,keys:f.alice.identity.keys},{kind:'offer',callId:nextId},90)}));
  assert.equal((await incoming).callId,nextId);a.close();b.close();
});
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
test('answering silences sibling tabs and a second tab cannot replace the accepted answer',{timeout:10000},async t=>{
 const f=await fixture();t.after(()=>f.app.close());const {bob}=await f.pair();
 const a=await f.socket(f.alice),b=await f.socket(bob),sibling=await f.socket(bob);const callId=randomUUID();
 const peer={id:bob.user.id,keys:bob.identity.keys},sender={id:f.alice.user.id,keys:f.alice.identity.keys};
 const offer=await seal(f.alice.identity,f.alice.user.id,peer,{kind:'offer',callId},90);
 const arrived=Promise.all([once(b,'message'),once(sibling,'message')]);a.send(JSON.stringify({type:'signal',kind:'offer',callId,envelope:offer}));await arrived;
 const answer=await seal(bob.identity,bob.user.id,sender,{kind:'answer',callId},120),accepted=once(a,'message'),silenced=once(sibling,'message');
 b.send(JSON.stringify({type:'signal',kind:'answer',callId,envelope:answer}));assert.equal(JSON.parse((await accepted)[0]).kind,'answer');assert.deepEqual(JSON.parse((await silenced)[0]),{type:'call-answered',callId});
 let answers=0;a.on('message',raw=>{if(JSON.parse(raw).kind==='answer')answers++;});
 const duplicate=once(sibling,'message');sibling.send(JSON.stringify({type:'signal',kind:'answer',callId,envelope:await seal(bob.identity,bob.user.id,sender,{kind:'answer',callId},120)}));assert.equal(JSON.parse((await duplicate)[0]).type,'call-answered');
 const pong=once(b,'message');b.send(JSON.stringify({type:'ping'}));assert.equal(JSON.parse((await pong)[0]).type,'pong');assert.equal(answers,0);
 assert.equal((await f.request('/calls/'+callId,{token:bob.token})).body.state,'answered');
 const blocked=once(sibling,'message');sibling.send(JSON.stringify({type:'signal',kind:'hangup',callId,envelope:await seal(bob.identity,bob.user.id,sender,{kind:'hangup',callId},120)}));assert.equal(JSON.parse((await blocked)[0]).type,'call-answered');
 assert.equal((await f.request('/calls/'+callId,{token:bob.token})).body.state,'answered');
 const ended=Promise.all([once(a,'message'),once(b,'message'),once(sibling,'message')]);b.send(JSON.stringify({type:'signal',kind:'hangup',callId,envelope:await seal(bob.identity,bob.user.id,sender,{kind:'hangup',callId},120)}));
 const final=(await ended).map(([raw])=>JSON.parse(raw));assert.equal(final[0].kind,'hangup');assert.equal(final[1].type,'call-ended');assert.equal(final[2].type,'call-ended');
 a.close();b.close();sibling.close();
});
test('late and unauthorized call errors identify the request without accepting an unknown call',{timeout:10000},async t=>{
 const f=await fixture();t.after(()=>f.app.close());const {bob}=await f.pair(),a=await f.socket(f.alice),callId=randomUUID();
 const envelope=await seal(f.alice.identity,f.alice.user.id,{id:bob.user.id,keys:bob.identity.keys},{kind:'ice',callId},90),error=once(a,'message');
 a.send(JSON.stringify({type:'signal',kind:'ice',callId,envelope}));assert.deepEqual(JSON.parse((await error)[0]),{type:'error',error:'Unknown call',callId,kind:'ice'});
 assert.equal((await f.request('/calls/'+callId,{token:f.alice.token})).body.state,'ended');a.close();
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
 const f=await fixture(false,{ATTACHMENT_USER_QUOTA_MB:'200',ATTACHMENT_GLOBAL_QUOTA_MB:'200'});t.after(()=>f.app.close());const {bob}=await f.pair();
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
  const answered=once(a,'message');await signal(b,bob,f.alice,'answer',id);await answered;const answeredCount=deliveries.length;await new Promise(r=>setTimeout(r,200));
  assert.ok(answeredCount>=1);assert.equal(deliveries.length,answeredCount);assert.ok(deliveries[0].options.TTL<=20);assert.equal(deliveries[0].options.urgency,'high');assert.equal(deliveries[0].payload.mutable,true);assert.equal((await f.request('/calls/'+id,{token:bob.token})).body.state,'answered');
  const ended=once(b,'message');await signal(a,f.alice,bob,'hangup',id);await ended;
  assert.equal((await f.request('/calls/'+id,{token:bob.token})).body.state,'ended');
  const next=randomUUID(),again=once(b,'message');await signal(a,f.alice,bob,'offer',next);await again;const cancel=once(b,'message');await signal(a,f.alice,bob,'hangup',next);await cancel;const cancelledCount=deliveries.length;await new Promise(r=>setTimeout(r,200));
  assert.ok(cancelledCount>answeredCount);assert.equal(deliveries.length,cancelledCount);
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

test('encrypted message updates enforce roles, stay isolated, replace old state and cascade on removal',async t=>{
 const f=await fixture();t.after(()=>f.app.close());const {bob}=await f.pair(),{bob:other}=await f.pair();
 const a=f.alice,peer={id:bob.user.id,keys:bob.identity.keys};
 const m=await seal(a.identity,a.user.id,peer,{kind:'text',text:'Original private text'},60);
 await f.request('/messages',{method:'POST',token:a.token,body:m});
 const update=async(user,kind,data={},target=m.id)=>({target,kind,envelope:await seal(user.identity,user.user.id,user===a?peer:{id:a.user.id,keys:a.identity.keys},{kind:'message-'+kind,target,...data},30)});
 const post=(user,events)=>f.request('/message-events',{method:'POST',token:user.token,body:{events}});
 assert.equal((await post(bob,[await update(bob,'edit',{text:'forged edit'})])).status,403);
 assert.equal((await post(a,[await update(a,'receipt',{deliveredAt:Date.now()})])).status,403);
 assert.equal((await post(other,[await update(other,'reaction',{emoji:'👍'})])).status,404);
 const edit=await update(a,'edit',{text:'New private text'});assert.equal((await post(a,[edit])).status,200);
 assert.equal((await post(a,[edit])).status,200);
 assert.equal((await post(a,[{...edit,envelope:{...edit.envelope,ciphertext:'different'}}])).status,409);
 const later=await update(a,'edit',{text:'Final private text'});assert.equal((await post(a,[later])).status,200);assert.equal((await post(a,[edit])).status,200);
 const read=await update(bob,'read',{deliveredAt:Date.now(),readAt:Date.now()});assert.equal((await post(bob,[read])).status,200);
 const receipt=await update(bob,'receipt',{deliveredAt:Date.now()});assert.equal((await post(bob,[receipt])).status,200);
 const reaction=await update(bob,'reaction',{emoji:'👍'});assert.equal((await post(bob,[reaction])).status,200);
 const seen=(await f.request('/message-events',{token:bob.token})).body;
 assert.equal(seen.length,4);assert.equal((await open(bob.identity,bob.user.id,{id:a.user.id,keys:a.identity.keys},seen.find(e=>e.kind==='edit').envelope)).text,'Final private text');
 assert.deepEqual((await f.request('/message-events',{token:other.token})).body,[]);
 assert.ok(!JSON.stringify(f.app.store.all('SELECT * FROM message_events')).includes('private text'));
 const wrongPeer={...reaction,envelope:{...reaction.envelope,to:other.user.id}};assert.equal((await post(bob,[wrongPeer])).status,400);
 const tooLong={...reaction,envelope:{...reaction.envelope,expiresAt:m.expiresAt+1}};assert.equal((await post(bob,[tooLong])).status,400);
 assert.equal((await post(bob,[await update(bob,'pin',{pinned:true}),await update(bob,'edit',{text:'denied'})])).status,403);
 assert.equal(f.app.store.get("SELECT COUNT(*) AS n FROM message_events WHERE kind='pin'").n,0,'batch is atomic');
 const socket=await f.socket(a),notification=new Promise(resolve=>socket.on('message',raw=>{const e=JSON.parse(raw);if(e.type==='message-event')resolve(e);}));
 await post(bob,[await update(bob,'reaction',{emoji:'❤️'})]);assert.equal((await notification).target,m.id);socket.close();
 assert.equal((await f.request('/messages/'+m.id,{method:'DELETE',token:bob.token})).status,200);assert.equal(f.app.store.get('SELECT COUNT(*) AS n FROM message_events').n,0);
 assert.equal((await post(a,[later])).status,404);
 const next=await seal(a.identity,a.user.id,peer,{kind:'text',text:'Expires'},60);await f.request('/messages',{method:'POST',token:a.token,body:next});
 await post(a,[await update(a,'pin',{pinned:true},next.id)]);f.app.store.purge(next.expiresAt+1);assert.equal(f.app.store.get('SELECT COUNT(*) AS n FROM message_events').n,0);
 const last=await seal(a.identity,a.user.id,peer,{kind:'text',text:'Device removal'},60);await f.request('/messages',{method:'POST',token:a.token,body:last});await post(a,[await update(a,'pin',{pinned:true},last.id)]);
 assert.equal((await f.request('/device',{method:'DELETE',token:bob.token})).status,200);assert.equal(f.app.store.get('SELECT COUNT(*) AS n FROM message_events').n,0);
});
test('paced encrypted parts authenticate, reject replacement, assemble legacy chunks, and delete all partial state',async t=>{
 const f=await fixture();t.after(()=>f.app.close());const {bob}=await f.pair(),{bob:other}=await f.pair();
 const file=new File([new Uint8Array(CHUNK_SIZE).fill(31)],'encrypted.dat'),a=newAttachment(file),key=await attachmentKey(a);
 const envelope=await seal(f.alice.identity,f.alice.user.id,{id:bob.user.id,keys:bob.identity.keys},{kind:'attachment',attachment:a},60);
 await f.request('/attachments',{method:'POST',body:{id:a.id,size:a.size,envelope},token:f.alice.token});
 const cipher=new Uint8Array(await encryptChunk(key,a,0,envelope.expiresAt,await file.arrayBuffer())),path='/attachments/'+a.id+'/chunks/0';
 const raw=(suffix,method='PUT',token=f.alice.token,body)=>fetch(f.url+'/calls/api'+path+suffix,{method,headers:{Origin:f.origin,Authorization:'Bearer '+token},body});
 assert.equal((await raw('/parts/0','PUT',other.token,cipher.slice(0,4096))).status,404);
 assert.equal((await raw('/parts/0','PUT',bob.token,cipher.slice(0,4096))).status,403);
 assert.equal((await raw('/parts/17','PUT',f.alice.token,new Uint8Array(1))).status,404);
 assert.equal((await raw('/parts/0','PUT',f.alice.token,new Uint8Array(4097))).status,413);
 assert.equal((await raw('/parts/0','PUT',f.alice.token,cipher.slice(0,4096))).status,201);
 assert.equal((await raw('/parts/0','PUT',f.alice.token,cipher.slice(0,4096))).status,200);
 assert.equal((await raw('/parts/0','PUT',f.alice.token,new Uint8Array(4096))).status,409);
 assert.equal((await f.request('/messages',{method:'POST',body:envelope,token:f.alice.token})).status,409);
 for(let i=1;i<Math.ceil(cipher.length/4096);i++)assert.equal((await raw('/parts/'+i,'PUT',f.alice.token,cipher.slice(i*4096,(i+1)*4096))).status,201);
 assert.equal(f.app.store.get('SELECT COUNT(*) AS n FROM attachment_parts').n,0);
 assert.equal((await raw('/parts/16','PUT',f.alice.token,cipher.slice(65536))).status,200);
 assert.equal((await f.request('/messages',{method:'POST',body:envelope,token:f.alice.token})).status,201);
 assert.equal((await raw('/parts/0','PUT',f.alice.token,cipher.slice(0,4096))).status,403);
 const pieces=[];for(let i=0;i<17;i++){const r=await raw('/parts/'+i,'GET',bob.token);assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');pieces.push(new Uint8Array(await r.arrayBuffer()));}
 assert.deepEqual(Buffer.concat(pieces),Buffer.from(cipher));assert.deepEqual(new Uint8Array(await decryptChunk(key,a,0,envelope.expiresAt,Buffer.concat(pieces))),new Uint8Array(CHUNK_SIZE).fill(31));
 await f.request('/messages/'+envelope.id,{method:'DELETE',token:bob.token});assert.equal((await raw('/parts/0','GET',bob.token)).status,404);
 const e2=await seal(f.alice.identity,f.alice.user.id,{id:bob.user.id,keys:bob.identity.keys},{kind:'attachment',attachment:a},60);await f.request('/attachments',{method:'POST',body:{id:a.id,size:a.size,envelope:e2},token:f.alice.token});await raw('/parts/0','PUT',f.alice.token,cipher.slice(0,4096));assert.equal(f.app.store.get('SELECT COUNT(*) AS n FROM attachment_parts').n,1);
 f.app.store.purge(e2.expiresAt+1);assert.equal(f.app.store.get('SELECT COUNT(*) AS n FROM attachment_parts').n,0);
});
test('answered call survives a signaling reconnection and stale disconnect timers are cancelled',{timeout:10000},async t=>{
 const f=await fixture(false,{}, {disconnectGraceMs:250});t.after(()=>f.app.close());const {bob}=await f.pair();
 const a=await f.socket(f.alice),b=await f.socket(bob),id=randomUUID(),signal=async(socket,user,peer,kind)=>{
  const envelope=await seal(user.identity,user.user.id,{id:peer.user.id,keys:peer.identity.keys},{kind,callId:id,description:{type:kind,sdp:'fixture'}},90);socket.send(JSON.stringify({type:'signal',kind,callId:id,envelope}));
 };
 let pending=once(b,'message');await signal(a,f.alice,bob,'offer');await pending;pending=once(a,'message');await signal(b,bob,f.alice,'answer');await pending;
 const expired=[];a.on('message',raw=>{if(JSON.parse(raw).type==='call-expired')expired.push(true);});b.close();await once(b,'close');
 await new Promise(r=>setTimeout(r,50));const restored=await f.socket(bob);await new Promise(r=>setTimeout(r,280));assert.equal(expired.length,0);
 pending=once(a,'message');await signal(restored,bob,f.alice,'restart');assert.equal(JSON.parse((await pending)[0]).kind,'restart');a.close();restored.close();
});
test('background notification decline is recipient-only, origin checked, idempotent and cannot end an answered call',async t=>{
 const f=await fixture();t.after(()=>f.app.close());const {bob}=await f.pair(),{bob:other}=await f.pair(),a=await f.socket(f.alice),b=await f.socket(bob);t.after(()=>{a.close();b.close();});
 const peer={id:bob.user.id,keys:bob.identity.keys},reverse={id:f.alice.user.id,keys:f.alice.identity.keys};
 async function offer(){const id=randomUUID(),incoming=once(b,'message');a.send(JSON.stringify({type:'signal',kind:'offer',callId:id,envelope:await seal(f.alice.identity,f.alice.user.id,peer,{kind:'offer',callId:id},90)}));await incoming;return id;}
 const id=await offer(),path='/calls/'+id+'/decline';
 assert.equal((await f.request('/calls/'+id,{token:bob.token})).body.canAnswer,true);assert.equal((await f.request('/calls/'+id,{token:f.alice.token})).body.canAnswer,false);
 assert.equal((await f.request(path,{method:'POST'})).status,401);assert.equal((await f.request(path,{method:'POST',token:bob.token,requestOrigin:'https://evil.test'})).status,403);
 for(const token of [f.alice.token,other.token])assert.equal((await f.request(path,{method:'POST',token})).status,404);
 const endedA=once(a,'message'),endedB=once(b,'message');assert.equal((await f.request(path,{method:'POST',token:bob.token})).status,200);
 for(const pending of [endedA,endedB]){const event=JSON.parse((await pending)[0]);assert.equal(event.type,'call-ended');assert.equal(event.callId,id);}
 assert.equal((await f.request('/calls/'+id,{token:bob.token})).body.state,'ended');assert.equal((await f.request(path,{method:'POST',token:bob.token})).status,200);
 const next=await offer(),answer=once(a,'message');b.send(JSON.stringify({type:'signal',kind:'answer',callId:next,envelope:await seal(bob.identity,bob.user.id,reverse,{kind:'answer',callId:next},90)}));await answer;
 assert.equal((await f.request('/calls/'+next+'/decline',{method:'POST',token:bob.token})).status,409);assert.equal((await f.request('/calls/'+next,{token:bob.token})).body.state,'answered');
 const sharing=once(b,'message');a.send(JSON.stringify({type:'signal',kind:'sharing',callId:next,envelope:await seal(f.alice.identity,f.alice.user.id,peer,{kind:'sharing',callId:next,active:true},120)}));const routed=JSON.parse((await sharing)[0]);assert.equal(routed.kind,'sharing');assert.equal((await open(bob.identity,bob.user.id,reverse,routed.envelope)).active,true);
 const error=once(a,'message');a.send(JSON.stringify({type:'signal',kind:'sharing',callId:randomUUID(),envelope:await seal(f.alice.identity,f.alice.user.id,peer,{kind:'sharing'},120)}));assert.equal(JSON.parse((await error)[0]).error,'Unknown call');
});
test('upload progress is participant-bound, transient, encrypted and cancelled on a discarded reservation',async t=>{
 const f=await fixture();t.after(()=>f.app.close());const {bob}=await f.pair(),{bob:outsider}=await f.pair(),a=await f.socket(f.alice),b=await f.socket(bob),x=await f.socket(outsider);t.after(()=>{a.close();b.close();x.close();});
 const peer={id:bob.user.id,keys:bob.identity.keys},file=new File([new Uint8Array(5000)],'Example.bin'),attachment=newAttachment(file),original=await seal(f.alice.identity,f.alice.user.id,peer,{kind:'attachment',attachment},60);
 await f.request('/attachments',{method:'POST',token:f.alice.token,body:{id:attachment.id,size:attachment.size,envelope:original}});
 const payload={kind:'transfer',target:original.id,createdAt:original.createdAt,expiresAt:original.expiresAt,percent:42,attachment:{id:attachment.id,name:attachment.name,size:attachment.size,type:attachment.type}},encrypted=await seal(f.alice.identity,f.alice.user.id,peer,payload,20);
 const incoming=once(b,'message');a.send(JSON.stringify({type:'transfer',messageId:original.id,envelope:encrypted}));const event=JSON.parse((await incoming)[0]);assert.equal(event.type,'transfer');assert.equal(event.messageId,original.id);assert.equal((await open(bob.identity,bob.user.id,{id:f.alice.user.id,keys:f.alice.identity.keys},event.envelope)).percent,42);
 assert.equal(f.app.store.get('SELECT COUNT(*) n FROM messages').n,0);assert.equal(f.app.store.get('SELECT COUNT(*) n FROM message_events').n,0);assert.ok(!JSON.stringify(event).includes('Example.bin'));
 const error=once(x,'message');x.send(JSON.stringify({type:'transfer',messageId:original.id,envelope:await seal(outsider.identity,outsider.user.id,peer,payload,20)}));assert.equal(JSON.parse((await error)[0]).error,'Unknown transfer');
 const long=once(a,'message');a.send(JSON.stringify({type:'transfer',messageId:original.id,envelope:await seal(f.alice.identity,f.alice.user.id,peer,payload,30)}));assert.equal(JSON.parse((await long)[0]).error,'Transfer update expires too late');
 const endA=once(a,'message'),endB=once(b,'message');await f.request('/attachments/'+attachment.id,{method:'DELETE',token:f.alice.token});for(const end of [endA,endB]){const e=JSON.parse((await end)[0]);assert.equal(e.type,'transfer-ended');assert.equal(e.id,original.id);}
 const late=once(a,'message');a.send(JSON.stringify({type:'transfer',messageId:original.id,envelope:encrypted}));assert.equal(JSON.parse((await late)[0]).error,'Unknown transfer');
});
test('message push opens the correct sender conversation without plaintext names, content or routing IDs in its URL',async t=>{
 const deliveries=[],f=await fixture(true,{}, {sendPush:async(sub,payload)=>deliveries.push(JSON.parse(payload))});t.after(()=>f.app.close());const {bob}=await f.pair();
 await f.request('/push',{method:'POST',token:bob.token,body:{endpoint:'https://fcm.googleapis.com/test/message',keys:{auth:'test',p256dh:'test'}}});
 const e=await seal(f.alice.identity,f.alice.user.id,{id:bob.user.id,keys:bob.identity.keys},{kind:'text',text:'Synthetic secret text'},60);await f.request('/messages',{method:'POST',token:f.alice.token,body:e});await new Promise(r=>setImmediate(r));
 const p=deliveries[0];assert.equal(p.messageId,e.id);assert.equal(p.peerId,f.alice.user.id);assert.equal(p.recipientId,bob.user.id);assert.equal(p.notification.title,'New message');assert.equal(p.notification.navigate,'https://example.com/calls/');assert.ok(!JSON.stringify(p).includes('Synthetic secret text'));assert.ok(!JSON.stringify(p).includes('Alice'));assert.ok(!JSON.stringify(p).includes('Private'));
});

test('confirmed ntfy suppresses duplicate browser call pushes and stops reminders on decline',async t=>{
  const native=[],pushes=[];
  const f=await fixture(true,{NTFY_PUBLIC_URL:'https://notify.example.com',NTFY_PUBLISH_URL:'http://127.0.0.1:8094',NTFY_PUBLISH_TOKEN:'tk_synthetic_publisher_token',NTFY_IOS_UPSTREAM:'true'},
    {ntfyFetch:async(url,opts)=>{native.push({url,...JSON.parse(opts.body)});return new Response('{}');},sendPush:async(...a)=>pushes.push(a),alertTiming:{delays:[120,240]}});
  t.after(()=>f.app.close());const {bob}=await f.pair();
  assert.equal((await f.request('/config')).body.ntfyAvailable,true);
  assert.equal((await f.request('/ntfy')).status,401);
  assert.equal((await f.request('/ntfy',{method:'POST',token:bob.token,requestOrigin:'https://evil.test',body:{}})).status,403);
  const linked=(await f.request('/ntfy',{method:'POST',token:bob.token,body:{topic:'hijack',url:'http://127.0.0.1:22',token:f.alice.token}})).body;
  assert.notEqual(linked.topic,'hijack');assert.equal(linked.server,'https://notify.example.com');
  assert.equal((await f.request('/ntfy',{token:f.alice.token})).body.connected,false);
  f.app.store.run('UPDATE ntfy_devices SET confirmed=1 WHERE owner=?',bob.user.id);
  f.app.store.run('INSERT INTO push(owner,endpoint,subscription,confirmed) VALUES(?,?,?,1)',bob.user.id,'https://fcm.googleapis.com/extra-test',JSON.stringify({endpoint:'https://fcm.googleapis.com/extra-test',keys:{auth:'synthetic',p256dh:'synthetic'}}));
  const a=await f.socket(f.alice),callId=randomUUID(),envelope=await seal(f.alice.identity,f.alice.user.id,{id:bob.user.id,keys:bob.identity.keys},{kind:'offer',callId,description:{sdp:'Never send SDP to ntfy'}},90);
  a.send(JSON.stringify({type:'signal',kind:'offer',callId,envelope}));
  for(let n=0;n<50&&native.length<1;n++)await new Promise(r=>setTimeout(r,2));
  assert.equal(native.length,1);assert.equal(native[0].topic,linked.topic);assert.equal(pushes.length,0);assert.ok(!JSON.stringify(native).includes('Never send SDP'));
  assert.equal((await f.request('/calls/'+callId+'/decline',{method:'POST',token:bob.token,body:{}})).status,200);
  await new Promise(r=>setTimeout(r,280));assert.equal(native.length,1);assert.equal(pushes.length,0);
  assert.equal((await f.request('/ntfy',{method:'DELETE',token:bob.token})).status,200);assert.equal(f.app.store.get('SELECT COUNT(*) n FROM push').n,1);a.close();
});

async function alertPair(t,{publish=async()=>new Response('{}'),delays=[]}={}){
 const native=[],pushes=[];
 const f=await fixture(true,{NTFY_PUBLIC_URL:'https://notify.example.com',NTFY_PUBLISH_URL:'http://127.0.0.1:8094',NTFY_PUBLISH_TOKEN:'tk_synthetic_publisher_token'},
  {ntfyFetch:async(...args)=>{native.push(JSON.parse(args[1].body));return publish(...args);},sendPush:async(subscription,payload)=>pushes.push(JSON.parse(payload)),alertTiming:{delays}});
 t.after(()=>f.app.close());const {bob}=await f.pair(),a=await f.socket(f.alice);t.after(()=>a.close());
 f.app.store.run('INSERT INTO push(owner,endpoint,subscription,confirmed) VALUES(?,?,?,1)',bob.user.id,'https://fcm.googleapis.com/synthetic-routing',JSON.stringify({endpoint:'https://fcm.googleapis.com/synthetic-routing',keys:{auth:'synthetic',p256dh:'synthetic'}}));
 async function link(confirmed=true){await f.request('/ntfy',{method:'POST',token:bob.token,body:{}});if(confirmed)f.app.store.run('UPDATE ntfy_devices SET confirmed=123 WHERE owner=?',bob.user.id);}
 async function offer(){const id=randomUUID(),envelope=await seal(f.alice.identity,f.alice.user.id,{id:bob.user.id,keys:bob.identity.keys},{kind:'offer',callId:id,description:{type:'offer',sdp:'Synthetic encrypted SDP'}},90);a.send(JSON.stringify({type:'signal',kind:'offer',callId:id,envelope}));return {id,envelope};}
 async function decline(id){assert.equal((await f.request('/calls/'+id+'/decline',{method:'POST',token:bob.token,body:{}})).status,200);}
 return {...f,bob,native,pushes,offer,decline,link,callerSocket:a};
}
const waitAlerts=async predicate=>{for(let n=0;n<600&&!predicate();n++)await new Promise(r=>setTimeout(r,10));assert.ok(predicate(),'Expected notification delivery did not finish');};

for(const mode of ['absent','unconfirmed','browser preference'])test(`browser call alerts remain available with ntfy ${mode}`,async t=>{
 const f=await alertPair(t);
 if(mode!=='absent')await f.link(mode==='browser preference');
 if(mode==='browser preference')assert.equal((await f.request('/ntfy/preference',{method:'POST',token:f.bob.token,body:{useNtfy:false}})).status,200);
 await f.offer();await waitAlerts(()=>f.pushes.length===1);assert.equal(f.native.length,0);assert.equal(f.pushes[0].type,'call');
});

for(const mode of ['rejected','network failure','timeout'])test(`ntfy ${mode} falls back to browser call alerts`,{timeout:10000},async t=>{
 const publish=mode==='rejected'?async()=>new Response('{}',{status:503}):mode==='network failure'?async()=>{throw Error('Synthetic offline relay');}:async(_,o)=>new Promise((resolve,reject)=>o.signal.addEventListener('abort',()=>reject(o.signal.reason),{once:true}));
 const f=await alertPair(t,{publish});await f.link();await f.offer();await waitAlerts(()=>f.pushes.length===1);
 assert.equal(f.native.length,1);assert.equal(f.pushes[0].type,'call');
});

test('a failed ntfy call stays on browser reminders; a new call tries ntfy again',async t=>{
 let fail=true;const f=await alertPair(t,{delays:[50,100],publish:async()=>new Response('{}',{status:fail?503:200})});await f.link();
 const first=await f.offer();await waitAlerts(()=>f.pushes.length===3);assert.equal(f.native.length,1);await f.decline(first.id);
 fail=false;const next=await f.offer();await waitAlerts(()=>f.native.length===4);assert.equal(f.pushes.length,3);await f.decline(next.id);
});

for(const action of ['decline','answer','hangup'])test(`${action} during a pending ntfy publish prevents a late browser fallback`,async t=>{
 const f=await alertPair(t,{publish:async(_,o)=>new Promise((resolve,reject)=>o.signal.addEventListener('abort',()=>reject(o.signal.reason),{once:true}))});await f.link();
 const first=await f.offer();await waitAlerts(()=>f.native.length===1);
 if(action==='decline')await f.decline(first.id);
 else{
  const user=action==='answer'?f.bob:f.alice,peer=action==='answer'?f.alice:f.bob,socket=action==='answer'?await f.socket(f.bob):f.callerSocket;
  if(action==='answer')t.after(()=>socket.close());
  const envelope=await seal(user.identity,user.user.id,{id:peer.user.id,keys:peer.identity.keys},{kind:action,callId:first.id},90);
  socket.send(JSON.stringify({type:'signal',kind:action,callId:first.id,envelope}));
 }
 let state;
 for(let i=0;i<30;i++){state=(await f.request('/calls/'+first.id,{token:f.bob.token})).body.state;if(state===(action==='answer'?'answered':'ended'))break;await new Promise(r=>setTimeout(r,5));}
 assert.equal(state,action==='answer'?'answered':'ended');await new Promise(r=>setTimeout(r,30));assert.equal(f.pushes.length,0);
});

test('a caller ntfy subscription cannot suppress another recipient browser alerts',async t=>{
 const f=await alertPair(t);await f.request('/ntfy',{method:'POST',token:f.alice.token,body:{}});
 f.app.store.run('UPDATE ntfy_devices SET confirmed=1 WHERE owner=?',f.alice.user.id);
 await f.offer();await waitAlerts(()=>f.pushes.length===1);assert.equal(f.native.length,0);
});

test('ntfy preferences are authenticated and origin checked, while text message pushes remain on',async t=>{
 const f=await alertPair(t);await f.link();
 assert.equal((await f.request('/ntfy/preference',{method:'POST',body:{useNtfy:false}})).status,401);
 assert.equal((await f.request('/ntfy/preference',{method:'POST',token:f.bob.token,requestOrigin:'https://evil.test',body:{useNtfy:false}})).status,403);
 const e=await seal(f.alice.identity,f.alice.user.id,{id:f.bob.user.id,keys:f.bob.identity.keys},{kind:'text',text:'Synthetic text with ntfy enabled'},60);
 assert.equal((await f.request('/messages',{method:'POST',token:f.alice.token,body:e})).status,201);await waitAlerts(()=>f.pushes.length===1);
 assert.equal(f.pushes[0].type,'message');assert.equal(f.native.length,0);assert.equal(f.app.store.get('SELECT preferred FROM ntfy_devices WHERE owner=?',f.bob.user.id).preferred,1);
});

test('notification call opening returns only the waiting recipient encrypted offer and never answers it',async t=>{
 const f=await alertPair(t),{bob:outsider}=await f.pair();const c=await f.offer();await waitAlerts(()=>f.pushes.length===1);
 const path='/calls/'+c.id+'?offer=1';assert.equal((await f.request(path)).status,401);
 assert.equal((await f.request(path,{token:outsider.token})).status,404);
 assert.equal((await f.request(path,{token:f.alice.token})).body.offer,undefined);
 assert.equal((await f.request('/calls/'+c.id,{token:f.bob.token})).body.offer,undefined);
 const info=(await f.request(path,{token:f.bob.token})).body;
 assert.equal(info.state,'ringing');assert.equal(info.canAnswer,true);assert.deepEqual(info.offer,{kind:'offer',callId:c.id,envelope:c.envelope});
 assert.equal((await open(f.bob.identity,f.bob.user.id,{id:f.alice.user.id,keys:f.alice.identity.keys},info.offer.envelope)).description.sdp,'Synthetic encrypted SDP');
 await f.decline(c.id);const ended=(await f.request(path,{token:f.bob.token})).body;assert.equal(ended.canAnswer,false);assert.equal(ended.offer,undefined);
});
