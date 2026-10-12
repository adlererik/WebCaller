import test from 'node:test';
import assert from 'node:assert/strict';
import {callSas,callSasContext,mediaFingerprints,sasWords} from '../public/call-sas.js';
import {SAS_WORDS} from '../public/sas-words.js';
import {loadOlm} from '../public/vendor/vodozemac/load.js';
import {newIdentity} from '../public/crypto.js';

const cert=(byte='AA')=>'a=fingerprint:sha-256 '+Array(32).fill(byte).join(':')+'\r\n';
function pair(t,{context='synthetic call and media identity',aContext=context,bContext=context,retry=10000,timeout=45000,sendError=false}={}){
  const pending=[],events={a:[],b:[]};
  const send=(from,to)=>async frame=>{if(sendError)throw new Error('Synthetic signaling outage');pending.push({from,to,frame:structuredClone(frame)});};
  const a=callSas({context:aContext,initiator:true,send:send('a','b'),update:s=>events.a.push(s),retry,timeout});
  const b=callSas({context:bContext,initiator:false,send:send('b','a'),update:s=>events.b.push(s),retry,timeout});
  t.after(()=>{a.close();b.close();});
  const peers={a,b};
  async function deliver(item=pending.shift()){if(item)await peers[item.to].receive(item.frame);return item;}
  async function drain(){for(let i=0;pending.length&&i<50;i++)await deliver();assert.equal(pending.length,0);}
  return {a,b,pending,events,deliver,drain,start:async()=>{await b.start();await a.start();}};
}
test('four words encode 44 bits, with a complete, unique 2048-word local alphabet',()=>{
  assert.equal(SAS_WORDS.length,2048);assert.equal(new Set(SAS_WORDS).size,2048);assert.ok(SAS_WORDS.every(w=>/^[a-z]+$/.test(w)));
  assert.equal(sasWords(Buffer.alloc(32).toString('base64').replace(/=+$/,'')),Array(4).fill(SAS_WORDS[0]).join(' '));
  assert.equal(sasWords(Buffer.alloc(32,255).toString('base64').replace(/=+$/,'')),Array(4).fill(SAS_WORDS[2047]).join(' '));
  const bytes=Buffer.alloc(32);bytes[5]=16;assert.notEqual(sasWords(bytes.toString('base64').replace(/=+$/,'')),Array(4).fill(SAS_WORDS[0]).join(' '));
});
test('call context agrees in opposite roles and binds identities and actual media fingerprints',async()=>{
  const a={id:'synthetic-a',keys:(await newIdentity()).keys},b={id:'synthetic-b',keys:(await newIdentity()).keys};
  const context=await callSasContext({callId:'synthetic-call',caller:true,local:a,remote:b,localSdp:cert(),remoteSdp:cert('BB')});
  assert.equal(context,await callSasContext({callId:'synthetic-call',caller:false,local:b,remote:a,localSdp:cert('BB'),remoteSdp:cert()}));
  assert.equal(context,await callSasContext({callId:'synthetic-call',caller:true,local:a,remote:b,localSdp:cert()+cert().toLowerCase()+'a=ice-ufrag:new-network\r\na=rtpmap:96 VP9/90000\r\n',remoteSdp:cert('BB')}));
  assert.notEqual(context,await callSasContext({callId:'synthetic-call',caller:true,local:a,remote:b,localSdp:cert(),remoteSdp:cert('CC')}));
  assert.notEqual(context,await callSasContext({callId:'other-call',caller:true,local:a,remote:b,localSdp:cert(),remoteSdp:cert('BB')}));
  assert.notEqual(context,await callSasContext({callId:'synthetic-call',caller:true,local:a,remote:{...b,keys:(await newIdentity()).keys},localSdp:cert(),remoteSdp:cert('BB')}));
  assert.throws(()=>mediaFingerprints('a=fingerprint:sha-1 00:00\r\n'));assert.throws(()=>mediaFingerprints('a=fingerprint:sha-256 00:00\r\n'));
});
test('commit/reveal and role-specific key confirmations produce matching words without user confirmation',async t=>{
  const f=pair(t);await f.start();assert.equal(f.pending[0].frame.step,'commit');assert.equal(f.pending[0].frame.key,undefined);assert.equal(f.pending[0].frame.nonce,undefined);
  await f.deliver();assert.equal(f.pending[0].frame.step,'key');await f.deliver();assert.equal(f.pending[0].frame.step,'reveal');
  assert.equal(f.events.a.at(-1).words,'');assert.equal(f.events.b.at(-1).words,'');await f.drain();
  assert.equal(f.a.state,'ready');assert.equal(f.b.state,'ready');assert.equal(f.events.a.at(-1).words,f.events.b.at(-1).words);assert.equal(f.events.a.at(-1).words.split(' ').length,4);
  assert.ok(!f.events.a.some(s=>s.state==='verified'));
});
test('fresh calls have independent contributions even with identical device/media identities',async t=>{
  const first=pair(t);await first.start();const commit=first.pending[0].frame.round;await first.drain();
  const second=pair(t);await second.start();assert.notEqual(second.pending[0].frame.round,commit);await second.drain();assert.equal(second.a.state,'ready');
});
test('duplicate messages and a dropped final confirmation recover without changing words',async t=>{
  const f=pair(t);await f.start();const commit=await f.deliver();await f.deliver(commit);
  const key=await f.deliver();await f.deliver(key);const reveal=f.pending.find(p=>p.frame.step==='reveal');
  await f.deliver(reveal);f.pending.length=0;const words=f.events.b.at(-1).words;
  await f.deliver(reveal);await f.drain();assert.equal(f.events.b.at(-1).words,words);assert.equal(f.events.a.at(-1).words,words);assert.equal(f.a.state,'ready');
});
test('changing a revealed contribution fails the commitment instead of showing false words',async t=>{
  const f=pair(t);await f.start();await f.deliver();await f.deliver();const reveal=f.pending.shift();reveal.frame.nonce=Buffer.alloc(32,9).toString('base64url');await f.deliver(reveal);
  assert.equal(f.b.state,'unavailable');assert.ok(f.events.b.every(s=>!s.words));
});
test('invalid key confirmations cannot display an authenticated SAS',async t=>{
  const f=pair(t);await f.start();await f.deliver();await f.deliver();await f.deliver();const confirm=f.pending.shift();confirm.frame.mac=Buffer.alloc(32,9).toString('base64').replace(/=+$/,'');await f.deliver(confirm);
  assert.equal(f.a.state,'unavailable');assert.ok(f.events.a.every(s=>!s.words));
});
test('low-order Curve25519 keys are rejected without affecting the call transport',async t=>{
  const f=pair(t);await f.start();await f.deliver();const key=f.pending.shift();key.frame.key='A'.repeat(43);await f.deliver(key);assert.equal(f.a.state,'unavailable');assert.ok(f.events.a.every(s=>!s.words));
});
test('a substituted media context and stale packets cannot produce a matching display',async t=>{
  const f=pair(t,{aContext:'caller actual certificate',bContext:'substituted certificate'});await f.start();await f.drain();assert.equal(f.a.state,'await-key');assert.equal(f.b.state,'await-commit');assert.ok(f.events.a.every(s=>!s.words));assert.ok(f.events.b.every(s=>!s.words));
});
test('signaling failure times out only the optional check, with bounded retries',async t=>{
  const f=pair(t,{sendError:true,retry:5,timeout:45});await f.start();await new Promise(r=>setTimeout(r,80));assert.equal(f.a.state,'unavailable');assert.equal(f.b.state,'unavailable');
});
test('lost initial packets retry and finish the same exchange',async t=>{
  const f=pair(t,{retry:15,timeout:1000});await f.start();const lost=f.pending.shift();await new Promise(r=>setTimeout(r,35));assert.equal(f.pending[0].frame.round,lost.frame.round);await f.drain();assert.equal(f.a.state,'ready');assert.equal(f.b.state,'ready');
});
test('ending a call cancels deferred crypto and prevents late words from reappearing',async()=>{
  const O=await loadOlm();let resolve;const gate=new Promise(r=>resolve=r),events=[],frames=[];
  const check=callSas({context:'synthetic context',initiator:true,olm:()=>gate,send:async f=>frames.push(f),update:s=>events.push(s)});
  const starting=check.start();await new Promise(r=>setTimeout(r,5));check.close();resolve(O);await starting;assert.equal(check.state,'closed');assert.equal(frames.length,0);assert.ok(events.every(s=>!s.words));await check.receive({step:'commit'});assert.equal(check.state,'closed');
});
