import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {IDBFactory} from 'fake-indexeddb';import {vault} from '../public/crypto.js';import {callIntents} from '../public/call-intents.js';
async function fixture(t){
 const prior=Object.fromEntries(['self','indexedDB','fetch','Notification'].map(k=>[k,globalThis[k]]));t.after(()=>{for(const [k,v]of Object.entries(prior))if(v===undefined)delete globalThis[k];else globalThis[k]=v;});
 const handlers={},shown=[],closed=[],opened=[],owner=randomUUID();let state='ringing',clients=[],canAnswer=true,declines=0,declineStatus=200;
 globalThis.indexedDB=new IDBFactory();globalThis.Notification={maxActions:2};await vault('put',{token:'test-device-token',user:{id:owner}});
 globalThis.fetch=async(url,options)=>{assert.equal(new URL(url).origin,'https://phone.example');assert.equal(options.headers.Authorization,'Bearer test-device-token');assert.equal(options.cache,'no-store');
  if(new URL(url).pathname.endsWith('/decline')){assert.equal(options.method,'POST');declines++;return {ok:declineStatus===200};}
  return {ok:true,json:async()=>({state,canAnswer,expiresAt:Date.now()+90000})};
 };
 globalThis.self={registration:{scope:'https://phone.example/calls/',getNotifications:async()=>shown.map(({options})=>({data:options.data,close:()=>closed.push(options.tag)})),showNotification:async(title,options)=>shown.push({title,options})},clients:{matchAll:async()=>clients,openWindow:async url=>opened.push(url)},addEventListener:(n,h)=>handlers[n]=h};
 const worker=await import('../public/sw.js?test='+randomUUID()),intents=callIntents();
 return {worker,intents,handlers,shown,closed,opened,owner,setState:v=>state=v,setClients:v=>clients=v,setCanAnswer:v=>canAnswer=v,setDeclineStatus:v=>declineStatus=v,get declines(){return declines;}};
}
test('push worker requests call actions/sound, suppresses stale/duplicate sounds and opens only its own phone',async t=>{
 const f=await fixture(t),id=randomUUID(),live={type:'call',callId:id,expiresAt:Date.now()+20000,callExpiresAt:Date.now()+90000,revision:0};
 await f.worker.handlePush(live);assert.equal(f.shown.at(-1).title,'Incoming call');assert.equal(f.shown.at(-1).options.silent,false);assert.equal(f.shown.at(-1).options.requireInteraction,true);assert.deepEqual(f.shown.at(-1).options.actions.map(a=>a.action),['answer','decline']);
 f.setState('answered');await f.worker.handlePush({...live,revision:1});assert.equal(f.shown.at(-1).title,'Call ended');assert.equal(f.shown.at(-1).options.silent,true);assert.ok(f.closed.length);assert.equal('vibrate'in f.shown.at(-1).options,false);assert.deepEqual(f.shown.at(-1).options.actions,[]);
 f.setState('ringing');f.setClients([{url:'https://phone.example/calls/',visibilityState:'visible',postMessage:(data,ports)=>{assert.equal(data.type,'ringing-query');ports[0].postMessage({ringing:true});ports[0].close();}}]);
 await f.worker.handlePush({...live,revision:2});assert.equal(f.shown.at(-1).options.silent,true);assert.equal(f.shown.at(-1).options.renotify,false);
 f.setClients([]);await f.worker.handlePush({...live,expiresAt:Date.now()-1});assert.equal(f.shown.at(-1).options.silent,true);
 const count=f.shown.length;await f.worker.handlePush({type:'call',callId:'invalid',expiresAt:Date.now()+9999});assert.equal(f.shown.length,count);
 const testId=randomUUID();await f.worker.handlePush({type:'test',testId,expiresAt:Date.now()+15000});assert.equal(f.shown.at(-1).options.data.url,'https://phone.example/calls/#alert-test='+testId);assert.equal(f.shown.at(-1).options.requireInteraction,false);
 await f.worker.handleNotificationClick({data:{url:'https://evil.example/'},close(){}});assert.deepEqual(f.opened,['https://phone.example/calls/']);assert.equal(await f.intents.take(f.owner),null);
 globalThis.Notification.maxActions=0;await f.worker.handlePush(live);assert.deepEqual(f.shown.at(-1).options.actions,[]);assert.match(f.shown.at(-1).options.body,/Tap/);
});
test('notification actions bind one-time answering to the verified recipient; decline is authenticated with a failure fallback',async t=>{
 const f=await fixture(t),id=randomUUID(),notice={data:{callId:id,expiresAt:Date.now()+90000,url:'https://phone.example/calls/'},close(){}};
 // Push itself and a body tap are not consent to open the microphone.
 await f.worker.handlePush({type:'call',callId:id,expiresAt:Date.now()+20000,callExpiresAt:notice.data.expiresAt});assert.equal(await f.intents.take(f.owner),null);
 await f.worker.handleNotificationClick(notice);assert.equal(await f.intents.take(f.owner),null);
 await f.worker.handleNotificationClick(notice,'answer');assert.equal((await f.intents.take(f.owner)).callId,id);assert.equal(await f.intents.take(f.owner),null);
 f.setCanAnswer(false);await f.worker.handleNotificationClick(notice,'answer');assert.equal(await f.intents.take(f.owner),null);
 f.setCanAnswer(true);f.setState('answered');await f.worker.handleNotificationClick(notice,'answer');assert.equal(await f.intents.take(f.owner),null);
 f.setState('ringing');await f.worker.handleNotificationClick({...notice,data:{...notice.data,expiresAt:Date.now()-1}},'answer');assert.equal(await f.intents.take(f.owner),null);
 const focus=[];f.setClients([{url:'https://phone.example/calls/',focus:async()=>focus.push(true),postMessage:d=>focus.push(d.type)}]);await f.worker.handleNotificationClick(notice,'answer');assert.deepEqual(focus,[true,'alert-opened']);assert.equal((await f.intents.take(f.owner)).callId,id);
 const before=f.opened.length;await f.worker.handleNotificationClick(notice,'decline');assert.equal(f.declines,1);assert.equal(f.opened.length,before);assert.equal(await f.intents.take(f.owner),null);
 f.setDeclineStatus(503);await f.worker.handleNotificationClick(notice,'decline');assert.equal(f.shown.at(-1).title,'Open to decline the call');assert.equal(f.shown.at(-1).options.silent,true);assert.equal(await f.intents.take(f.owner),null);
});
