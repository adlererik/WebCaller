import test from 'node:test';
import assert from 'node:assert/strict';
import {callOutbox,orderedTasks,callRinger} from '../public/call-signaling.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(caller=true){
  let current={id:'synthetic-call',caller},ready=true;
  const wire=[],sealed=[],errors=[],gates=new Map();
  const signal=callOutbox({current:()=>current,ready:()=>ready,
    seal:async(call,kind,payload)=>{sealed.push(kind);await gates.get(kind)?.promise;return {kind,payload,owner:call.id};},
    send:packet=>wire.push(packet),onError:error=>errors.push(error.message)});
  return {signal,wire,sealed,errors,gates,get current(){return current;},set current(value){current=value;},set ready(value){ready=value;}};
}
for(const caller of [true,false])test(`${caller?'caller':'recipient'} publishes initial SDP before early ICE, SAS and sharing updates`,async()=>{
  const f=fixture(caller),first=caller?'offer':'answer';f.gates.set(first,deferred());
  await f.signal('ice',{candidate:'gathered inside setLocalDescription'});await f.signal('sas',{frame:'connected before answer encryption completes'});await f.signal('sharing',{active:true});
  assert.deepEqual(f.wire,[]);assert.deepEqual(f.sealed,[]);
  const initial=f.signal(first,{description:{type:first}});await tick();
  await f.signal('ice',{candidate:'arrived during encryption'});assert.deepEqual(f.sealed,[first]);
  f.gates.get(first).resolve();await initial;await tick();
  assert.deepEqual(f.wire.map(p=>p.kind),[first,'ice','sas','sharing','ice']);
  assert.ok(f.wire.every(p=>p.callId==='synthetic-call'));
});
test('slow encryption preserves send order and an individual failure does not poison the queue',async()=>{
  const f=fixture();await f.signal('offer',{});f.gates.set('ice',deferred());
  const ice=f.signal('ice',{}),video=f.signal('video',{});await tick();assert.deepEqual(f.sealed,['offer','ice']);
  f.gates.get('ice').reject(new Error('Synthetic failure'));await assert.rejects(ice,/Synthetic failure/);await video;
  assert.deepEqual(f.wire.map(p=>p.kind),['offer','video']);
});
test('ending a call discards queued media updates, sends hangup and never leaks into the next call',async()=>{
  const f=fixture();await f.signal('offer',{});f.gates.set('ice',deferred());const ice=f.signal('ice',{});await tick();
  const video=f.signal('video',{});f.current.ending=true;const hangup=f.signal('hangup',{});f.gates.get('ice').resolve();await Promise.all([ice,video,hangup]);
  assert.deepEqual(f.wire.map(p=>p.kind),['offer','hangup']);
  f.current={id:'next-call',caller:true};f.gates.set('offer',deferred());const old=f.signal('offer',{});await tick();f.current={id:'third-call',caller:true};f.gates.get('offer').resolve();await old;
  assert.ok(!f.wire.some(p=>p.callId==='next-call'));
});
test('cancel before publishing an outgoing offer stays local; incoming decline can still reach the caller',async()=>{
  const f=fixture();await f.signal('ice',{});f.current.ending=true;await f.signal('hangup',{});assert.equal(f.wire.length,0);
  const incoming=fixture(false);incoming.current.ending=true;await incoming.signal('hangup',{});assert.deepEqual(incoming.wire.map(p=>p.kind),['hangup']);
});
test('transport failure rejects the initial offer instead of silently claiming it was sent',async()=>{
  const f=fixture();await f.signal('ice',{});f.ready=false;await assert.rejects(f.signal('offer',{}),/Waiting for the connection/);assert.equal(f.wire.length,0);assert.equal(f.sealed.length,0);
});
test('duplicate offer deliveries wait for decrypt/dedup; one failed update does not block later call events',async()=>{
  const queue=orderedTasks(),gate=deferred(),seen=new Set(),events=[];
  const receive=()=>queue(async()=>{if(seen.has('offer'))return;await gate.promise;seen.add('offer');events.push('ring');});
  const first=receive(),duplicate=receive(),end=queue(()=>events.push('ended'));gate.resolve();await Promise.all([first,duplicate,end]);assert.deepEqual(events,['ring','ended']);
  await assert.rejects(queue(()=>{throw new Error('Bad authenticated frame');}));await queue(()=>events.push('next call'));assert.equal(events.at(-1),'next call');
});
test('ringing stops on answer, connection or end and delayed callbacks cannot restart it',()=>{
  let current,bursts=0,silences=0;const callbacks=[],cancelled=[];
  const ringer=callRinger({current:()=>current,burst:()=>bursts++,silence:()=>silences++,setInterval:callback=>{callbacks.push(callback);return callbacks.length;},clearInterval:id=>cancelled.push(id)});
  current={offer:{},caller:false};ringer.start();assert.equal(bursts,1);const first=callbacks[0];
  current.answering=true;first();assert.equal(bursts,1);assert.ok(cancelled.includes(1));ringer.start();assert.equal(callbacks.length,1);
  current={offer:{},caller:false};ringer.start();assert.equal(bursts,2);first();assert.equal(bursts,2);callbacks[1]();assert.equal(bursts,3);
  current.started=Date.now();callbacks[1]();assert.equal(bursts,3);
  current={offer:{},caller:false};ringer.start();assert.equal(bursts,4);current=null;callbacks[2]();assert.equal(bursts,4);assert.ok(silences>=5);
});
