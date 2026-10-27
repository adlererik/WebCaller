import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as pause} from 'node:timers/promises';
import {stickerChannels,STICKER_FRAME} from '../public/sticker-channel.js';
class Channel {
 constructor(){this.label=this.protocol='webcaller-stickers-v1';this.readyState='connecting';this.bufferedAmount=0;this.frames=[];}
 send(value){if(this.readyState!=='open')throw Error('closed');const data=typeof value==='string'?value:value instanceof ArrayBuffer?value.slice(0):value.buffer.slice(value.byteOffset,value.byteOffset+value.byteLength);this.frames.push(data);queueMicrotask(()=>{if(this.other.readyState==='open')this.other.onmessage?.({data});});}
 close(){if(this.readyState==='closed')return;this.readyState='closed';this.onclose?.();if(this.other?.readyState!=='closed')this.other?.close();}
}
class RTC {
 static peers=new Map();
 constructor(config){this.config=config;this.id=crypto.randomUUID();RTC.peers.set(this.id,this);this.signalingState='stable';this.connectionState='new';}
 createDataChannel(){return this.channel=new Channel();}
 async createOffer(){return {type:'offer',sdp:this.id};}
 async createAnswer(){return {type:'answer',sdp:this.id};}
 async setLocalDescription(d){this.localDescription={...d,toJSON:()=>d};this.signalingState=d.type==='offer'?'have-local-offer':'stable';this.onicecandidate?.({candidate:{toJSON:()=>({candidate:'synthetic ICE'})}});}
 async setRemoteDescription(d){
  this.remoteDescription=d;
  if(d.type==='offer'){this.other=RTC.peers.get(d.sdp);this.channel=new Channel();this.channel.other=this.other.channel;this.other.channel.other=this.channel;this.ondatachannel?.({channel:this.channel});}
  else{this.signalingState='stable';for(const c of [this.channel,this.channel.other]){c.readyState='open';c.onopen?.();}}
 }
 async addIceCandidate(){assert.ok(this.remoteDescription,'candidate must wait for remote SDP');}
 close(){if(this.connectionState==='closed')return;this.connectionState='closed';this.channel?.close();this.onconnectionstatechange?.();RTC.peers.delete(this.id);}
}
async function pair(t){
 const a={id:crypto.randomUUID()},b={id:crypto.randomUUID()},errors=[],received=[],order=[];let A,B;
 A=stickerChannels({self:()=>a.id,peer:id=>id===b.id?b:null,RTC,ice:async()=>({iceServers:[]}),onError:e=>errors.push(e.message),signal:async(_,p)=>{order.push('A:'+p.action);await B.accept(a,p);},receive:async()=>true});
 B=stickerChannels({self:()=>b.id,peer:id=>id===a.id?a:null,RTC,ice:async()=>({iceServers:[]}),onError:e=>errors.push(e.message),signal:async(_,p)=>{order.push('B:'+p.action);await A.accept(b,p);},receive:async(_,envelope,chunks)=>{received.push({envelope,chunks:chunks.map(c=>c.slice())});return true;}});
 t.after(()=>{A.reset();B.reset();});const link=await A.prepare(b);assert.ok(link);return {a,b,A,B,link,errors,received,order,envelope:{id:crypto.randomUUID(),from:a.id,to:b.id,expiresAt:Date.now()+60000}};
}
test('data channels frame bounded ciphertext, acknowledge only accepted cache writes, and order SDP before ICE',async t=>{
 const f=await pair(t),bytes=crypto.getRandomValues(new Uint8Array(65536)),chunk=new Uint8Array(65552);chunk.set(bytes);
 assert.equal(await f.A.send(f.b,f.envelope,[chunk],new AbortController().signal),true);assert.equal(f.received.length,1);assert.deepEqual(f.received[0].chunks[0],chunk);
 assert.ok(f.link.channel.frames.filter(v=>v instanceof ArrayBuffer).every(v=>v.byteLength<=STICKER_FRAME));assert.equal(f.order[0],'A:offer');assert.ok(f.order.indexOf('B:answer')<f.order.indexOf('B:ice'));assert.deepEqual(f.errors,[]);
});
test('oversized/wrong-recipient data channel headers are rejected without delivering an image',async t=>{
 for(const bad of ['oversized','recipient']){
  const f=await pair(t);f.link.channel.send(JSON.stringify({type:'start',envelope:{...f.envelope,...(bad==='recipient'?{to:crypto.randomUUID()}:{})},sizes:bad==='oversized'?Array(9).fill(65552):[32]}));await pause(10);assert.equal(f.received.length,0);assert.equal(f.link.channel.readyState,'closed');assert.ok(f.errors.includes('Invalid sticker transfer'));
 }
});
test('a duplicate data-channel message cannot replay the receive callback',async t=>{
 const f=await pair(t),chunk=new Uint8Array(32);assert.equal(await f.A.send(f.b,f.envelope,[chunk],new AbortController().signal),true);
 f.link.channel.send(JSON.stringify({type:'start',envelope:f.envelope,sizes:[32]}));await pause(10);assert.equal(f.received.length,1);assert.equal(f.link.channel.readyState,'closed');
});
test('suspension during ICE credential fetch cannot recreate a stale connection',async()=>{
 let resolve;const contact={id:crypto.randomUUID()},channels=stickerChannels({self:()=>crypto.randomUUID(),peer:()=>contact,RTC,ice:()=>new Promise(r=>resolve=r),signal:async()=>{},receive:async()=>false});
 const pending=channels.prepare(contact);channels.reset();resolve({iceServers:[]});assert.equal(await pending,null);assert.equal(channels.incoming(crypto.randomUUID()),false);
});
test('unavailable data-channel support returns the encrypted attachment fallback without camera or ICE work',async()=>{
 let attempted=false;const c=stickerChannels({self:()=>crypto.randomUUID(),peer:()=>({}),RTC:null,ice:async()=>{attempted=true;throw Error('Unexpected ICE request');},signal:async()=>{},receive:async()=>false});
 assert.equal(await c.send({id:crypto.randomUUID()},{},[],new AbortController().signal),false);assert.equal(attempted,false);c.reset();
});
