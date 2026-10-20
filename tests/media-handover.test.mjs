import test from 'node:test';
import assert from 'node:assert/strict';
import {Phone,candidateMatches} from '../public/media.js';
function fixture(caller=true){
 const signals=[],operations=[];const phone=new Phone({signal:async(kind,payload)=>signals.push({kind,...payload}),update(){},remote:{},local:{},preference:()=> 'auto'});phone.caller=caller;
 phone.applyProfile=async()=>{};phone.queueRestart=()=>{};
 const pc={signalingState:'stable',connectionState:'connected',localDescription:{type:caller?'offer':'answer',sdp:'a=ice-ufrag:initial\r\n'},remoteDescription:{type:caller?'answer':'offer',sdp:'a=ice-ufrag:remote\r\n'},
  createOffer:async()=>({type:'offer',sdp:'a=ice-ufrag:fresh\r\n'}),
  setLocalDescription:async d=>{operations.push(d.type);if(d.type==='rollback')pc.signalingState='stable';else{pc.localDescription=d;pc.signalingState=d.type==='offer'?'have-local-offer':'stable';}},
  setRemoteDescription:async d=>{operations.push('remote-'+d.type);pc.remoteDescription=d;pc.signalingState=d.type==='offer'?'have-remote-offer':'stable';},addIceCandidate:async c=>operations.push(c.usernameFragment),getTransceivers:()=>[],close(){}};
 phone.pc=pc;return {phone,pc,signals,operations};
}
test('a second radio change abandons the unanswerable old ICE generation, preserving the call media',async()=>{
 const f=fixture();f.pc.signalingState='have-local-offer';f.phone.offerEpoch=0;f.phone.networkEpoch=1;f.phone.offerAt=Date.now();
 await f.phone.restart();assert.equal(f.operations[0],'rollback');assert.equal(f.signals[0].kind,'restart');assert.equal(f.signals[0].description.sdp,'a=ice-ufrag:fresh\r\n');assert.equal(f.phone.offerEpoch,1);assert.ok(f.signals[0].restartId);assert.equal(f.phone.pc,f.pc);
});
test('late answers to an abandoned offer are ignored, and a retry answer does not start an endless restart loop',async()=>{
 const f=fixture();f.pc.signalingState='have-local-offer';f.phone.restartId='current';f.phone.restartPending=true;
 assert.equal(await f.phone.receiveRestart({description:{type:'answer',sdp:'a=ice-ufrag:stale\r\n'},replyTo:'old'}),false);assert.deepEqual(f.operations,[]);
 assert.equal(await f.phone.receiveRestart({description:{type:'answer',sdp:'a=ice-ufrag:new\r\n'},replyTo:'current'}),true);assert.equal(f.phone.restartPending,false);assert.equal(f.signals.length,0);assert.equal(f.pc.signalingState,'stable');
});
test('repeated authenticated offers resend the cached answer rather than renegotiating video again',async()=>{
 const f=fixture(false),sdp=f.pc.remoteDescription.sdp;await f.phone.receiveRestart({description:{type:'offer',sdp},restartId:'retry'});
 assert.deepEqual(f.operations,[]);assert.equal(f.signals[0].replyTo,'retry');assert.deepEqual(f.signals[0].description,f.pc.localDescription);
});
test('candidate replay filters exact ICE generations, including prefixes and old late candidates',async()=>{
 const f=fixture();f.pc.localDescription.sdp='a=ice-ufrag:newer\r\n';f.phone.localCandidates=[{usernameFragment:'new'},{usernameFragment:'newer'},{candidate:'candidate:1 ufrag old'}];
 assert.equal(candidateMatches(f.pc.localDescription,{usernameFragment:'new'}),false);await f.phone.replayCandidates();assert.deepEqual(f.signals.map(s=>s.candidate.usernameFragment),['newer']);
});
