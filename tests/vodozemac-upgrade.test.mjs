import test from 'node:test';
import assert from 'node:assert/strict';
import * as legacy from 'vodozemac-legacy-test';
import {loadOlm} from '../public/vendor/vodozemac/load.js';
import {secureMessaging} from '../public/secure-messaging.js';
import {newAttachment,attachmentKey,encryptChunk,decryptChunk} from '../public/attachments.js';
import {olmFraming} from '../public/olm-wire.js';
import {callSas} from '../public/call-sas.js';
import {fixture} from './helpers/ratchet-fixture.mjs';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

// The pinned 0.9.0 engine is a development-only compatibility oracle. All
// accounts, keys, messages and browser databases below are freshly synthetic.
const loadLegacy=async()=>{await legacy.initAsync();return legacy;};

test('upgrade tests use the exact previous WASM engine and the recorded current core',async()=>{
  const old=await readFile(new URL('./pkg/vodozemac_bg.wasm',import.meta.resolve('vodozemac-legacy-test')));
  assert.equal(createHash('sha256').update(old).digest('hex'),'5b3a606864bbcfe31f4e91f12e73b659c494f6d13c36cb6e1ec94dce992410fd');
  const manifest=JSON.parse(await readFile(new URL('../public/vendor/vodozemac/provenance.json',import.meta.url),'utf8'));
  assert.equal(manifest.core,'vodozemac 0.11.1');assert.ok(Object.keys(manifest.sourceFiles).length>=10);
});

// Replace one public protobuf key in an otherwise real synthetic Olm packet.
function replaceKey(bytes,wanted,key){
  bytes=new Uint8Array(bytes);let offset=1;
  const number=()=>{let value=0,shift=0;for(;;){const byte=bytes[offset++];value+=(byte&127)*2**shift;if(!(byte&128))return value;shift+=7;assert.ok(shift<35);}};
  while(offset<bytes.length){const tag=number(),field=tag>>3,wire=tag&7;if(wire===0){number();continue;}assert.equal(wire,2);const size=number();if(field===wanted){assert.equal(size,32);bytes.set(key,offset);return bytes;}offset+=size;}
  assert.fail('Synthetic packet field missing');
}

for(const older of ['sender','recipient'])test(`0.9.0 and 0.11.1 exchange full-authentication messages with the old ${older}`,async t=>{
  const f=await fixture(t,{olmA:older==='sender'?loadLegacy:loadOlm,olmB:older==='recipient'?loadLegacy:loadOlm});
  const first=await f.sendA('Mixed-version first message');olmFraming(first.ratchet);
  assert.equal((await f.openB(first)).text,'Mixed-version first message');
  for(let i=0;i<4;i++){
    const reply=await f.sendB('Mixed reply '+i);assert.equal(reply.ratchet.sessionId,first.ratchet.sessionId);
    assert.equal((await f.openA(reply)).text,'Mixed reply '+i);
    const next=await f.sendA('Mixed next '+i);assert.equal((await f.openB(next)).text,'Mixed next '+i);
  }
});

test('upgrading saved 0.9.0 accounts, sessions, unread prekeys and sealed history preserves identity and attachment keys',async t=>{
  const f=await fixture(t,{olmA:loadLegacy,olmB:loadLegacy});
  const sent=await f.sendA('Saved before upgrade');await f.openB(sent);
  await f.openA(await f.sendB('Old ratchet reply'));
  const delayed=await f.sendA('Unread on established session');
  const callId=crypto.randomUUID(),offer=await f.a.seal(f.alice.identity,f.alice.user.id,f.bob.user,{kind:'offer',callId},90);
  const file=new File(['Synthetic attachment surviving the upgrade'],'synthetic.txt',{type:'text/plain'}),attachment=newAttachment(file);
  const media=await f.a.seal(f.alice.identity,f.alice.user.id,f.bob.user,{kind:'attachment',attachment},3600);
  await f.openB(media);
  const encrypted=await encryptChunk(await attachmentKey(attachment),attachment,0,media.expiresAt,new Uint8Array(await file.arrayBuffer()));
  const before=await Promise.all([f.apiA('/ratchet/status'),f.apiB('/ratchet/status')]);
  const identityA=f.alice.identity,identityB=f.bob.identity,pinsA=structuredClone(f.alice.pins),pinsB=structuredClone(f.bob.pins);
  const a=secureMessaging({...f.optionsA,olm:loadOlm}),b=secureMessaging({...f.optionsB,olm:loadOlm});
  await a.initialize(f.alice);await b.initialize(f.bob);
  const openA=e=>a.open(identityA,f.alice.user.id,f.bob.user,e),openB=e=>b.open(identityB,f.bob.user.id,f.alice.user,e);
  assert.equal(f.alice.identity,identityA);assert.equal(f.bob.identity,identityB);
  assert.deepEqual(f.alice.pins,pinsA);assert.deepEqual(f.bob.pins,pinsB);
  assert.deepEqual(await Promise.all([f.apiA('/ratchet/status'),f.apiB('/ratchet/status')]),before);
  assert.equal((await openA(sent)).text,'Saved before upgrade');assert.equal((await openB(sent)).text,'Saved before upgrade');
  assert.equal((await openB(delayed)).text,'Unread on established session');
  assert.equal((await openB(offer)).callId,callId); // Previously unconsumed account prekey.
  const restored=(await openB(media)).attachment;assert.deepEqual(restored,attachment);
  assert.equal(new TextDecoder().decode(await decryptChunk(await attachmentKey(restored),restored,0,media.expiresAt,encrypted)),await file.text());
  const next=await a.seal(identityA,f.alice.user.id,f.bob.user,{kind:'text',text:'Same session after upgrade'},3600);
  assert.equal(next.ratchet.sessionId,sent.ratchet.sessionId);assert.equal((await openB(next)).text,'Same session after upgrade');
  // A still-open old tab must also read the newly written account/session pickles.
  assert.equal((await f.openA(await b.seal(identityB,f.bob.user.id,f.alice.user,{kind:'text',text:'Reply to old tab'},3600))).text,'Reply to old tab');
  assert.equal((await openB(await f.sendA('Old tab continues'))).text,'Old tab continues');
});

test('new binding rejects non-contributory identity/prekeys without losing the account or trapping WASM',async()=>{
  const O=await loadOlm(),a=new O.Account(),b=new O.Account();
  try{
    b.generate_one_time_keys(1);const key=[...b.one_time_keys.values()][0],identity=a.curve25519_key;
    for(const bytes of [Buffer.alloc(32),Buffer.from([1,...Array(31).fill(0)])]){
      const low=bytes.toString('base64').replace(/=+$/,'');
      assert.throws(()=>a.create_outbound_session(low,key,O.SessionConfigVersion.V2),/contributory/i);
      assert.throws(()=>a.create_outbound_session(b.curve25519_key,low,O.SessionConfigVersion.V2),/contributory/i);
    }
    assert.equal(a.curve25519_key,identity);
    const s=a.create_outbound_session(b.curve25519_key,key,O.SessionConfigVersion.V2),m=s.encrypt('Valid after invalid keys');
    const result=b.create_inbound_session(identity,m),r=result.session;
    try{assert.equal(result.plaintext,'Valid after invalid keys');const reply=r.encrypt('Still alive');try{assert.equal(s.decrypt(reply),'Still alive');}finally{reply.free();}}
    finally{r.free();result.free();m.free();s.free();}
  }finally{a.free();b.free();}
});

test('binding itself refuses truncated-authentication sessions and leaves the one-time key usable',async()=>{
  const old=await loadLegacy(),O=await loadOlm(),a=new old.Account(),b=new O.Account();
  let weak,strong,wm,sm,result,r;
  try{
    b.generate_one_time_keys(1);const key=[...b.one_time_keys.values()][0];
    weak=a.create_outbound_session(b.curve25519_key,key,old.SessionConfigVersion.V1);wm=weak.encrypt('Rejected v1');
    const incoming=new O.OlmMessage(wm.message_type,wm.ciphertext);
    try{assert.throws(()=>b.create_inbound_session(a.curve25519_key,incoming),/config|version/i);}finally{incoming.free();}
    assert.equal(b.one_time_keys.size,1);
    strong=a.create_outbound_session(b.curve25519_key,key,old.SessionConfigVersion.V2);sm=strong.encrypt('Accepted v2');
    const valid=new O.OlmMessage(sm.message_type,sm.ciphertext);
    try{result=b.create_inbound_session(a.curve25519_key,valid);r=result.session;assert.equal(result.plaintext,'Accepted v2');}finally{valid.free();}
  }finally{r?.free();result?.free();sm?.free();wm?.free();strong?.free();weak?.free();a.free();b.free();}
});

test('non-contributory inbound identity/base keys are rejected without consuming the recipient prekey',async()=>{
  const O=await loadOlm(),a=new O.Account(),b=new O.Account();let s,m,result,r;
  try{
    b.generate_one_time_keys(1);s=a.create_outbound_session(b.curve25519_key,[...b.one_time_keys.values()][0],O.SessionConfigVersion.V2);m=s.encrypt('Valid prekey packet');
    for(const field of [2,3]){
      const low=new Uint8Array(32),bad=new O.OlmMessage(m.message_type,replaceKey(m.ciphertext,field,low));
      try{assert.throws(()=>b.create_inbound_session(field===3?'A'.repeat(43):a.curve25519_key,bad),/contributory/i);}finally{bad.free();}
      assert.equal(b.one_time_keys.size,1);
    }
    result=b.create_inbound_session(a.curve25519_key,m);r=result.session;assert.equal(result.plaintext,'Valid prekey packet');
  }finally{r?.free();result?.free();m?.free();s?.free();a.free();b.free();}
});

test('a non-contributory DH ratchet step fails without preventing the authentic next packet',async()=>{
  const O=await loadOlm(),a=new O.Account(),b=new O.Account();let s,m,result,r,reply,next,bad;
  try{
    b.generate_one_time_keys(1);s=a.create_outbound_session(b.curve25519_key,[...b.one_time_keys.values()][0],O.SessionConfigVersion.V2);m=s.encrypt('First');
    result=b.create_inbound_session(a.curve25519_key,m);r=result.session;reply=r.encrypt('DH reply');s.decrypt(reply);next=s.encrypt('Fresh DH step');assert.equal(next.message_type,1);
    bad=new O.OlmMessage(1,replaceKey(next.ciphertext,1,new Uint8Array(32)));
    assert.throws(()=>r.decrypt(bad),/contributory/i);assert.equal(r.decrypt(next),'Fresh DH step');
  }finally{bad?.free();next?.free();reply?.free();r?.free();result?.free();m?.free();s?.free();a.free();b.free();}
});

for(const oldCaller of [true,false])test(`four-word SAS stays compatible with a 0.9.0 ${oldCaller?'caller':'callee'}`,async t=>{
  const pending=[],states={};
  const a=callSas({context:'Synthetic mixed-version media-bound call',initiator:true,olm:oldCaller?loadLegacy:loadOlm,send:async frame=>pending.push({to:'b',frame}),update:s=>states.a=s});
  const b=callSas({context:'Synthetic mixed-version media-bound call',initiator:false,olm:oldCaller?loadOlm:loadLegacy,send:async frame=>pending.push({to:'a',frame}),update:s=>states.b=s});
  t.after(()=>{a.close();b.close();});await b.start();await a.start();
  for(let i=0;pending.length&&i<20;i++){const {to,frame}=pending.shift();await (to==='a'?a:b).receive(frame);}
  assert.equal(a.state,'ready');assert.equal(b.state,'ready');assert.equal(states.a.words,states.b.words);assert.equal(states.a.words.split(' ').length,4);
});
