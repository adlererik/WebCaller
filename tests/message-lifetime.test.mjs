import test from 'node:test';
import assert from 'node:assert/strict';
import {NO_EXPIRY,MAX_MESSAGE_SECONDS,DEFAULT_MESSAGE_SECONDS,timerValue,timerLabel,messageExpiry,validLifetime,expiryAlarm} from '../public/message-lifetime.js';
import {customSeconds,splitTimer} from '../public/message-timer.js';
import {remainingTime} from '../public/message-expiry.js';
import {secureMessaging} from '../public/secure-messaging.js';
import {newAttachment,attachmentKey,encryptChunk,decryptChunk} from '../public/attachments.js';
import {fixture} from './helpers/ratchet-fixture.mjs';
const DAY=86400000;
test('Off is retained as zero and invalid saved timer choices cannot become permanent',()=>{
  assert.equal(timerValue(0),0);assert.equal(timerValue('0'),0);assert.equal(timerValue(MAX_MESSAGE_SECONDS),MAX_MESSAGE_SECONDS);
  assert.equal(DEFAULT_MESSAGE_SECONDS,3600);
  for(const value of [null,undefined,false,true,NaN,-1,Infinity,'',{},'wat',MAX_MESSAGE_SECONDS+1,1.5])assert.equal(timerValue(value),3600);
  for(const saved of [30,3600,86400,604800,MAX_MESSAGE_SECONDS])assert.equal(timerValue(saved),saved);
  assert.equal(timerLabel(0),'Off');assert.equal(timerLabel(MAX_MESSAGE_SECONDS),'4 weeks');assert.equal(timerLabel(120),'2 minutes');assert.equal(timerLabel(3600),'1 hour');assert.equal(remainingTime(NO_EXPIRY),'');
});
test('custom wheel units cover seconds through four weeks without exceeding the chosen unit',()=>{
  for(const [n,unit,result] of [[59,'seconds',59],[1,'minutes',60],[23,'hours',82800],[6,'days',518400],[4,'weeks',2419200]]){assert.equal(customSeconds(n,unit),result);assert.deepEqual(splitTimer(result),{count:n,unit});}
  for(const [n,unit]of [[0,'seconds'],[60,'seconds'],[24,'hours'],[7,'days'],[5,'weeks'],[1,'years'],[1.1,'minutes']])assert.throws(()=>customSeconds(n,unit));
});
test('signed lifetimes allow Off only in persistent v2 lanes and retain the legacy seven-day bound',()=>{
  const base={v:2,createdAt:100000,expiresAt:NO_EXPIRY};
  for(const lane of ['chat','events','files']){assert.ok(validLifetime({...base,ratchet:{lane}}));assert.equal(messageExpiry(base.createdAt,0,lane),NO_EXPIRY);}
  for(const lane of ['signal','typing','transfer']){assert.equal(validLifetime({...base,ratchet:{lane}}),false);assert.throws(()=>messageExpiry(base.createdAt,0,lane));}
  const finite={...base,ratchet:{lane:'chat'},expiresAt:base.createdAt+28*DAY};assert.ok(validLifetime(finite));assert.equal(validLifetime({...finite,expiresAt:finite.expiresAt+1}),false);assert.equal(validLifetime(finite,true),false);
  assert.ok(validLifetime({...finite,v:1,expiresAt:base.createdAt+7*DAY}));assert.equal(validLifetime({...finite,v:1}),false);assert.equal(validLifetime({...base,v:1}),false);
  assert.equal(messageExpiry(1000,1.234,'events'),2234);assert.throws(()=>messageExpiry(0,MAX_MESSAGE_SECONDS+1));
});
test('four-week transfer expiry uses safe timer chunks; Off and cancellation arm no expiring callback',()=>{
  let time=0,timers=[],expired=0;const schedule=(fn,delay)=>{timers.push({fn,delay});return timers.length;};let cancelled;
  const stop=expiryAlarm(28*DAY,()=>expired++,{now:()=>time,schedule,cancel:id=>cancelled=id});assert.equal(timers[0].delay,2147483647);
  time=2147483647;timers[0].fn();assert.equal(timers[1].delay,28*DAY-time);time=28*DAY;timers[1].fn();assert.equal(expired,1);stop();assert.equal(cancelled,2);
  timers=[];expiryAlarm(NO_EXPIRY,()=>expired++,{now:()=>time,schedule});assert.equal(timers.length,0);
  const cancel=expiryAlarm(time+1000,()=>expired++,{now:()=>time,schedule,cancel:()=>{}});cancel();time+=2000;timers[0].fn();assert.equal(expired,1);
});
test('Off and four-week texts, edits and read receipts survive encryption, reload and server validation',async t=>{
  const time=Date.now(),f=await fixture(t,{clock:()=>time});
  for(const ttl of [0,MAX_MESSAGE_SECONDS]){
    const e=await f.sendA('Lifetime '+ttl,ttl);await f.apiA('/messages','POST',e);assert.equal(e.expiresAt,ttl===0?NO_EXPIRY:e.createdAt+28*DAY);assert.equal((await f.openB(e)).text,'Lifetime '+ttl);
    const edit=await f.a.seal(f.alice.identity,f.alice.user.id,f.bob.user,{kind:'message-edit',target:e.id,text:'Changed'},ttl===0?0:MAX_MESSAGE_SECONDS-1);
    await f.apiA('/message-events','POST',{events:[{target:e.id,kind:'edit',envelope:edit}]});assert.equal((await f.openB(edit)).text,'Changed');
    const wrong=await f.b.seal(f.bob.identity,f.bob.user.id,f.alice.user,{kind:'message-edit',target:e.id,text:'Forbidden'},ttl===0?0:MAX_MESSAGE_SECONDS-1);
    await assert.rejects(f.apiB('/message-events','POST',{events:[{target:e.id,kind:'edit',envelope:wrong}]}),e=>e.status===403);
    const receipt=await f.b.seal(f.bob.identity,f.bob.user.id,f.alice.user,{kind:'message-read',target:e.id,at:Date.now()},ttl===0?0:MAX_MESSAGE_SECONDS-1);
    await f.apiB('/message-events','POST',{events:[{target:e.id,kind:'read',envelope:receipt}]});assert.equal((await f.openA(receipt)).kind,'message-read');
    const reloaded=secureMessaging(f.optionsB);await reloaded.initialize(f.bob);assert.equal((await reloaded.open(f.bob.identity,f.bob.user.id,f.alice.user,e)).text,'Lifetime '+ttl);
    await f.apiB('/messages/'+e.id,'DELETE');assert.equal((await f.apiA('/messages')).some(m=>m.id===e.id),false);await assert.rejects(f.apiA('/messages','POST',e),error=>error.status===410);
  }
});
test('current chat and update ratchets survive long offline intervals without retaining expired history',async t=>{
  let time=Date.now();const f=await fixture(t,{clock:()=>time});const first=await f.sendA('Short lived',30);await f.openB(first);
  const off=await f.sendA('Offline for more than four weeks',0);time+=35*DAY;await f.a.purge();await f.b.purge();
  assert.equal((await f.openB(off)).text,'Offline for more than four weeks');await assert.rejects(f.openB(first),/Expired/);
  const reload=secureMessaging(f.optionsB);await reload.initialize(f.bob);const reply=await reload.seal(f.bob.identity,f.bob.user.id,f.alice.user,{kind:'text',text:'Still here'},0);assert.equal((await f.openA(reply)).text,'Still here');
});
test('existing unexpired ratchets migrate their sealed storage lifetime without replacing sessions',async t=>{
  let time=Date.now();const f=await fixture(t,{clock:()=>time}),e=await f.sendA('Establish');await f.openB(e);
  await f.b.store.lock(f.bob.user.id,async db=>{const puts=[];for(const row of await db.list())if(['session','preferred'].includes(row.kind)){const suffix=row.id.slice(f.bob.user.id.length+1),value=await db.read(suffix);puts.push(await db.record(suffix,value,{kind:row.kind,peer:row.peer,expiresAt:time+7*DAY}));}await db.commit(puts);});
  const upgraded=secureMessaging(f.optionsB);await upgraded.initialize(f.bob);const rows=await upgraded.store.lock(f.bob.user.id,db=>db.list());assert.ok(rows.filter(r=>['session','preferred'].includes(r.kind)).every(r=>r.expiresAt===NO_EXPIRY));
  const off=await f.sendA('Delayed',0);time+=29*DAY;await upgraded.purge();assert.equal((await upgraded.open(f.bob.identity,f.bob.user.id,f.alice.user,off)).text,'Delayed');
});
test('Off attachments use bounded upload reservations then keep ciphertext until either participant deletes it',async t=>{
  const f=await fixture(t),file=new File(['Synthetic forever media'],'sample.txt',{type:'text/plain'}),a=newAttachment(file);
  const e=await f.a.seal(f.alice.identity,f.alice.user.id,f.bob.user,{kind:'attachment',attachment:a},0),key=await attachmentKey(a),cipher=await encryptChunk(key,a,0,e.expiresAt,await file.arrayBuffer());
  await f.apiA('/attachments','POST',{id:a.id,size:a.size,envelope:e});const reserved=f.app.store.get('SELECT * FROM attachments WHERE id=?',a.id);assert.ok(reserved.expires<=Date.now()+DAY);assert.equal(reserved.committed,0);
  const address='http://127.0.0.1:'+f.app.server.address().port+'/calls/api/attachments/'+a.id+'/chunks/0';
  assert.equal((await fetch(address,{method:'PUT',headers:{Origin:'https://example.com',Authorization:'Bearer '+f.alice.token},body:cipher})).status,201);
  await f.apiA('/messages','POST',e);const stored=f.app.store.get('SELECT * FROM attachments WHERE id=?',a.id);assert.equal(stored.expires,NO_EXPIRY);assert.equal(stored.committed,1);
  const result=await fetch(address,{headers:{Authorization:'Bearer '+f.bob.token}});assert.equal(result.status,200);assert.equal(new TextDecoder().decode(await decryptChunk(key,a,0,e.expiresAt,await result.arrayBuffer())),await file.text());
  await f.apiB('/messages/'+e.id,'DELETE');assert.equal(f.app.store.get('SELECT * FROM attachments WHERE id=?',a.id),undefined);assert.equal((await fetch(address,{headers:{Authorization:'Bearer '+f.alice.token}})).status,404);
});
test('migration does not revive already expired ratchet records',async t=>{
  let time=Date.now();const f=await fixture(t,{clock:()=>time}),first=await f.sendA('Old session',30);await f.openB(first);
  await f.b.store.lock(f.bob.user.id,async db=>{const puts=[];for(const row of await db.list())if(['session','preferred'].includes(row.kind)){const suffix=row.id.slice(f.bob.user.id.length+1),value=await db.read(suffix);puts.push(await db.record(suffix,value,{kind:row.kind,peer:row.peer,expiresAt:time+1000}));}await db.commit(puts);});
  const off=await f.sendA('Too late',0);time+=2000;const upgraded=secureMessaging(f.optionsB);await upgraded.initialize(f.bob);
  const rows=await upgraded.store.lock(f.bob.user.id,db=>db.list());assert.equal(rows.some(r=>['session','preferred'].includes(r.kind)),false);
  await assert.rejects(upgraded.open(f.bob.identity,f.bob.user.id,f.alice.user,off));
});
