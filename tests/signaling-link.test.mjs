import test from 'node:test';
import assert from 'node:assert/strict';
import {signalingLink} from '../public/signaling-link.js';
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(){
  let time=0,serial=0,enabled=true,active=true;const timers=new Map(),sockets=[],events=[],tickets=[];
  class Socket{
    readyState=0;sent=[];
    constructor(url){this.url=url;sockets.push(this);}
    send(data){this.sent.push(JSON.parse(data));}
    close(){this.readyState=3;this.onclose?.();}
    open(){this.readyState=1;this.onopen?.();}
    packet(data){this.onmessage?.({data:JSON.stringify(data)});}
  }
  const link=signalingLink({clientId:'synthetic-tab',ticket:async signal=>{tickets.push(signal);return {ticket:'synthetic-ticket'};},url:()=> 'wss://example.com/com/ws',enabled:()=>enabled,active:()=>active,Socket,now:()=>time,random:()=>0,schedule:(fn,ms)=>{timers.set(++serial,{fn,at:time+ms});return serial;},cancel:id=>timers.delete(id),onState:state=>events.push(['state',state]),onReady:()=>events.push(['ready']),onPacket:packet=>events.push(['packet',packet]),onError:error=>events.push(['error',error.message])});
  async function advance(ms){const end=time+ms;for(let i=0;i<100;i++){const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;time=next[1].at;timers.delete(next[0]);next[1].fn();await tick();}time=end;}
  return {link,sockets,events,tickets,timers,advance,async ready(){await link.connect();const s=sockets.at(-1);s.open();s.packet({type:'ready'});await tick();return s;},pong(s){s.packet({type:'pong',nonce:s.sent.at(-1).nonce});},disable(){enabled=false;},idle(){active=false;}};
}
test('an OPEN but dead TCP socket is replaced, retaining this page identity',async()=>{
 const f=fixture(),old=await f.ready();assert.equal(old.sent[0].clientId,'synthetic-tab');
 await f.advance(8000);assert.equal(old.readyState,3);assert.equal(f.link.ready,false);await f.advance(500);
 const fresh=f.sockets.at(-1);assert.notEqual(fresh,old);fresh.open();assert.equal(fresh.sent[0].clientId,old.sent[0].clientId);
 fresh.packet({type:'ready'});await tick();f.pong(fresh);assert.equal(f.link.ready,true);f.link.stop();assert.equal(f.timers.size,0);
});
test('radio changes replace a known changed route immediately and ignored old callbacks cannot poison it',async()=>{
 const f=fixture(),old=await f.ready(),late=old.onmessage;f.link.networkChanged(true);await tick();const fresh=f.sockets.at(-1);
 late({data:JSON.stringify({type:'call-ended',callId:'synthetic'})});fresh.open();fresh.packet({type:'ready'});await tick();f.pong(fresh);
 assert.equal(f.link.ready,true);assert.ok(!f.events.some(e=>e[0]==='packet'));assert.ok(f.tickets[0].aborted);f.link.stop();
});
test('a network estimate change can validate a healthy socket without replacing it',async()=>{
 const f=fixture(),s=await f.ready();f.pong(s);f.link.networkChanged(false);f.pong(s);await f.advance(2900);assert.equal(f.sockets.length,1);assert.equal(f.link.ready,true);f.link.stop();
});
test('missing authentication and hung opens are bounded; explicit stop cancels future reconnects',async()=>{
 const f=fixture();await f.link.connect();await f.advance(12000);assert.equal(f.sockets[0].readyState,3);await f.advance(500);assert.equal(f.sockets.length,2);f.link.stop();await f.advance(100000);assert.equal(f.sockets.length,2);
});
test('heartbeat acknowledgements are generation bound and unrelated packets do not acknowledge them',async()=>{
 const f=fixture(),s=await f.ready();s.packet({type:'pong',nonce:'old'});s.packet({type:'contacts'});await tick();await f.advance(8000);assert.equal(s.readyState,3);f.link.stop();
});
