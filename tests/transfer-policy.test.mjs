import test from 'node:test';import assert from 'node:assert/strict';
import {transferBudget,transferPacer,transferPool,TRANSFER_PART_SIZE} from '../public/transfer-policy.js';
const good={id:'synthetic-call',state:'connected',profile:'saver',mode:'saver',stats:{loss:0,rtt:.06,jitter:.005,bandwidth:5000000,uploadKbps:220,downloadKbps:230}};
test('healthy unknown connections can probe fast transfers without pretending to be Wi-Fi',()=>{
 assert.equal(TRANSFER_PART_SIZE,4096);assert.equal(transferBudget(null),Infinity);
 assert.equal(transferBudget(good),1000000);assert.equal(transferBudget({...good,transferRate:20000000}),20000000);
 assert.equal(transferBudget({...good,metered:true,transferRate:20000000}),2000000);
 assert.equal(transferBudget({...good,stats:{...good.stats,bandwidth:Infinity}}),512000);
 for(const change of [{profile:'weak'},{profile:'critical'},{state:'disconnected'},{preparing:true},{stats:null},{stats:{...good.stats,loss:.04}},{stats:{...good.stats,rtt:.6}},{stats:{...good.stats,jitter:.05}},{stats:{...good.stats,sampledAt:1000}}])assert.equal(transferBudget({...good,...change},10000),0);
});
test('a 4 MiB file on a healthy link ramps in seconds even when the browser cannot report Wi-Fi',async()=>{
 let time=0;const call={...good,stats:{...good.stats}};
 const pace=transferPacer(()=>call,()=>{},{now:()=>time,wall:()=>time,sleep:async ms=>{time+=ms;}});
 for(let index=0;index<64;index++){
  call.stats.sampledAt=Math.floor(time/1000)*1000;
  await pace(65536,new AbortController().signal);time+=60;pace.observe(65536,60);
 }
 assert.ok(time<12000,'4 MiB should not take minutes: '+time+' ms');assert.ok(pace.check().rate>64000);
});
test('audio degradation pauses immediately, recovery probes slowly and a handover resets the rate',async()=>{
 let time=0,call={...good,network:'wifi',stats:{...good.stats,sampledAt:0}};const opts={now:()=>time,wall:()=>time,sleep:async ms=>{time+=ms;}};
 const pace=transferPacer(()=>call,()=>{},opts);pace.check();
 for(let i=1;i<=5;i++){time=i*1000;call.stats.sampledAt=time;pace.check();}assert.ok(pace.check().rate>1000000);
 call.stats.loss=.1;assert.equal(pace.check().paused,true);assert.equal(pace.check().rate,0);
 call.stats.loss=0;time+=1000;call.stats.sampledAt=time;assert.equal(pace.check().paused,true);
 time+=1000;call.stats.sampledAt=time;assert.equal(pace.check().paused,false);assert.equal(pace.check().small,true);
 call.network='cellular';call.metered=true;const handover=pace.check();assert.equal(handover.networkChanged,true);assert.ok(handover.rate<=2000000);
 call=null;assert.equal(pace.check().rate,Infinity);
});
test('waiting transfers resume when a call ends and cancel promptly without leaking abort handlers',async()=>{
 let call={...good,state:'disconnected'},waiting=false;const controller=new AbortController(),pace=transferPacer(()=>call,v=>waiting=v);
 const pending=pace(4096,controller.signal);assert.equal(waiting,true);call=null;await pending;assert.equal(waiting,false);
 call={...good,profile:'weak'};const next=pace(4096,controller.signal);controller.abort();await assert.rejects(next,{name:'AbortError'});
});
test('preparing the video reduction pauses requests without imposing a congestion recovery delay',()=>{
 let time=0,call={...good,preparing:true,stats:{...good.stats,sampledAt:0}};
 const pace=transferPacer(()=>call,()=>{},{now:()=>time,wall:()=>time});assert.equal(pace.check().paused,true);
 time=500;call.preparing=false;const ready=pace.check();assert.equal(ready.paused,false);assert.ok(ready.rate>=512000);
 assert.equal(ready.small,true);pace.observe(4096,10);assert.equal(pace.check().small,false);
 const rate=ready.rate;call.preparing=true;assert.equal(pace.check().paused,true);call.preparing=false;assert.ok(pace.check().rate>=rate);
});
test('parallel transfer workers are bounded, join before failure and cancel sibling work',async()=>{
 let active=0,peak=0,done=0;
 await transferPool(40,async()=>{active++;peak=Math.max(peak,active);await new Promise(r=>setImmediate(r));active--;done++;},new AbortController().signal);
 assert.equal(done,40);assert.equal(peak,4);
 let siblingStopped=false;
 await assert.rejects(transferPool(8,async(index,signal)=>{
  if(index===0){await new Promise(resolve=>setImmediate(resolve));throw new Error('Synthetic integrity failure');}
  try{await new Promise((resolve,reject)=>{if(signal.aborted)return reject(signal.reason);signal.addEventListener('abort',()=>reject(signal.reason),{once:true});});}catch(e){siblingStopped=true;throw e;}
 },new AbortController().signal),/integrity/);
 assert.equal(siblingStopped,true);
});
