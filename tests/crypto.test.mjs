import test from 'node:test';
import assert from 'node:assert/strict';
import {newIdentity,seal,open,fingerprint,safetyNumber} from '../public/crypto.js';
test('authenticated encryption is readable only by the two device identities',async()=>{
  const a=await newIdentity(),b=await newIdentity(),c=await newIdentity();
  const contact={id:'b',keys:b.keys};const e=await seal(a,'a',contact,{kind:'text',text:'Private hello'},30);
  assert.equal((await open(b,'b',{id:'a',keys:a.keys},e)).text,'Private hello');
  assert.equal((await open(a,'a',contact,e)).text,'Private hello');
  assert.ok(!JSON.stringify(e).includes('Private hello'));
  await assert.rejects(open(c,'b',{id:'a',keys:a.keys},e));
  assert.equal(a.dh.extractable,false);assert.equal(a.sign.extractable,false);
});
test('ciphertext, sender, expiry and signaling metadata cannot be substituted',async()=>{
  const a=await newIdentity(),b=await newIdentity();
  const e=await seal(a,'a',{id:'b',keys:b.keys},{kind:'offer',callId:'one',description:{type:'offer',sdp:'private'}},60);
  for(const patch of [{ciphertext:e.ciphertext.slice(0,-3)+'ABC'},{expiresAt:e.expiresAt+1000},{from:'attacker'},{selfCiphertext:'AAAA'}])await assert.rejects(open(b,'b',{id:'a',keys:a.keys},{...e,...patch}));
  await assert.rejects(open(b,'b',{id:'a',keys:a.keys},{...e,expiresAt:Date.now()-1}),/Expired/);
  assert.equal(await safetyNumber(a.keys,b.keys),await safetyNumber(b.keys,a.keys));
  assert.match(await fingerprint(a.keys),/^[a-f0-9]{64}$/);
});
