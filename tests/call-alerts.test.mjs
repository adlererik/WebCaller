import test from 'node:test';
import assert from 'node:assert/strict';
import {createCallAlerts,notificationPayload} from '../server/call-alerts.mjs';
import {phonePlatform} from '../public/call-setup.js';
import {clearEntryFragment} from '../public/onboarding.js';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function clock(){let now=1000,next=0;const tasks=new Map();return {now:()=>now,setTimer:(fn,ms)=>{const id=++next;tasks.set(id,{fn,at:now+ms});return id;},clearTimer:id=>tasks.delete(id),advance:async ms=>{now+=ms;for(const [id,t]of tasks)if(t.at<=now){tasks.delete(id);t.fn();}await flush();},tasks};}
test('call alerts are bounded, have short deadlines, and cancellation clears reminders',async()=>{
  const time=clock(),deliveries=[];let waiting=true;
  const alerts=createCallAlerts({...time,send:(...args)=>deliveries.push(args),isWaiting:()=>waiting});
  alerts.start({id:'call',expiresAt:91000});await flush();assert.equal(deliveries.length,1);assert.equal(deliveries[0][2],21000);
  await time.advance(15000);assert.equal(deliveries[1][1],1);
  await time.advance(20000);assert.equal(deliveries[2][1],2);
  await time.advance(40000);assert.equal(deliveries.length,3);
  alerts.start({id:'call',expiresAt:91000});await flush();alerts.stop('call');await time.advance(40000);assert.equal(deliveries.length,4);assert.equal(time.tasks.size,0);
  waiting=false;alerts.start({id:'answered',expiresAt:200000});await flush();await time.advance(40000);assert.equal(deliveries.length,4);alerts.close();
});
test('expired calls do not send alerts; failed deliveries do not stop later attempts',async()=>{
  const time=clock();let attempts=0;
  const alerts=createCallAlerts({...time,isWaiting:()=>true,send:()=>{attempts++;throw Error('push service unavailable');}});
  alerts.start({id:'expired',expiresAt:999});await flush();assert.equal(attempts,0);
  alerts.start({id:'waiting',expiresAt:18000});await flush();await time.advance(15000);assert.equal(attempts,2);assert.equal(time.tasks.size,0);alerts.close();
});
test('Apple declarative fallback is visible, mutable, generic and contains no call secrets',()=>{
  const p=notificationPayload({type:'call',callId:'example',revision:1,url:'https://phone.example/calls/',expiresAt:9000,callExpiresAt:91000});
  assert.equal(p.web_push,8030);assert.equal(p.mutable,true);assert.equal(p.notification.silent,false);assert.equal(p.notification.navigate,'https://phone.example/calls/');assert.equal(p.notification.tag,'call-example-1');assert.notEqual(notificationPayload({type:'call',callId:'example',revision:2,url:'https://phone.example/calls/',expiresAt:9000,callExpiresAt:91000}).notification.tag,p.notification.tag);
  assert.equal(notificationPayload({type:'test',testId:'test',url:'https://phone.example/calls/',expiresAt:99}).notification.navigate,'https://phone.example/calls/#alert-test=test');
});
test('iPhone and touch-enabled iPad need Home Screen; Android proceeds directly',()=>{
  const win={matchMedia:()=>({matches:false})};
  assert.equal(phonePlatform({userAgent:'iPhone',platform:'iPhone',maxTouchPoints:1},win).needsHomeScreen,true);
  assert.equal(phonePlatform({userAgent:'Safari',platform:'MacIntel',maxTouchPoints:5},win).ios,true);
  assert.equal(phonePlatform({userAgent:'Android Chrome',platform:'Linux',maxTouchPoints:5},win).needsHomeScreen,false);
  assert.equal(phonePlatform({userAgent:'iPhone',standalone:true},win).needsHomeScreen,false);
  assert.equal(phonePlatform({userAgent:'iPhone'},{matchMedia:()=>({matches:true})}).needsHomeScreen,false);
});
test('Home Screen handoff retains only invitation fragment; owner and test fragments clear',()=>{
  const urls=[],history={replaceState:(_,__,url)=>urls.push(url)},location={pathname:'/calls/',search:'',hash:'#invite=abc.def&setup=private-owner&name=Private'};
  clearEntryFragment(location,history,true);assert.deepEqual(urls,['/calls/#invite=abc.def']);
  clearEntryFragment(location,history);assert.equal(urls[1],'/calls/');
  clearEntryFragment({...location,hash:'#alert-test=uuid'},history,true);assert.equal(urls[2],'/calls/');
});
test('message push text is neutral; metadata routes the chat without putting IDs into the app URL',()=>{
 const p=notificationPayload({type:'message',messageId:'id',peerId:'peer',recipientId:'recipient',url:'https://phone.example/calls/',expiresAt:9000});assert.equal(p.notification.title,'New message');assert.equal(p.notification.tag,'message-alert');assert.equal(p.notification.navigate,'https://phone.example/calls/');assert.equal(p.notification.data.messageId,'id');assert.equal(p.peerId,'peer');assert.ok(!p.notification.body.includes('Private'));
});
