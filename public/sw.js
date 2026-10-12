import {vault} from './crypto.js';
import {callIntents} from './call-intents.js';
import {messageIntents} from './message-intents.js';
const intents=callIntents(),chatIntents=messageIntents();
// No asset cache or message history. Push contains only generic alert text.
const home=()=>new URL('./',self.registration.scope).href;
// Background storage/network checks must not hold a sound alert indefinitely.
async function bounded(task,ms,fallback=null){
  let timer;
  try{return await Promise.race([Promise.resolve().then(task),new Promise(resolve=>{timer=setTimeout(()=>resolve(fallback),ms);})]);}
  catch{return fallback;}finally{clearTimeout(timer);}
}
const readDevice=()=>bounded(()=>vault('get'),1500);
async function closeCall(callId,keepTag=null){
  await bounded(async()=>{
    for(const n of await self.registration.getNotifications())if(n.data?.callId===callId&&n.tag!==keepTag)n.close();
  },600);
}
async function callDetails(callId){
  const controller=new AbortController();
  try{return await bounded(async()=>{
    const device=await vault('get');if(!device?.token||controller.signal.aborted)return null;
    const result=await fetch(new URL(`api/calls/${callId}`,home()),{headers:{Authorization:'Bearer '+device.token},cache:'no-store',signal:controller.signal});
    return result.ok?await result.json():null;
  },1500);}finally{controller.abort();}
}
export async function handlePush(data){
  if(!data||!['call','test','message'].includes(data.type)||!Number.isSafeInteger(data.expiresAt))return;
  const call=data.type==='call',test=data.type==='test';
  if((call&&!/^[a-f0-9-]{36}$/.test(data.callId||''))||(test&&!/^[a-f0-9-]{36}$/.test(data.testId||'')))return;
  // The provider queue deadline is shorter than the original waiting call.
  // A worker waking late can still ring until that call's original deadline.
  const deadline=call&&Number.isSafeInteger(data.callExpiresAt)?Math.min(data.callExpiresAt,data.expiresAt+90000):data.expiresAt;
  const details=call&&deadline>Date.now()?await callDetails(data.callId):null;
  const stale=deadline<=Date.now()||details?.state==='ended'||details?.state==='answered';
  // Page visibility and AudioContext flags cannot prove a locked phone is audible.
  // Every live reminder requests its notification sound independently of the page.
  const silent=stale;
  const canRenotify=!!globalThis.Notification?.prototype&&'renotify'in Notification.prototype;
  const tag=call?`call-${data.callId}${canRenotify?'':'-'+(Number(data.revision)||0)}`:test?`test-${data.testId}`:'message-alert';
  if(call&&stale)await closeCall(data.callId);
  const actions=call&&!stale?[{action:'answer',title:'Answer'},{action:'decline',title:'Decline'}].slice(0,globalThis.Notification?.maxActions??2):[];
  const url=new URL(home());if(test)url.hash='alert-test='+data.testId;
  // A visible, silent result for stale pushes respects Apple's userVisibleOnly rule.
  const title=stale?(call?'Call ended':test?'Alert test expired':'Message expired'):call?'Incoming call':test?'Call alert test':'New message';
  await self.registration.showNotification(title,{
    body:stale?'Open your phone to check.':call?(actions.length?'Answer this call or tap to open your phone.':'Tap to open your phone and answer.'):test?'Tap here if you heard this alert.':'Open your phone to read it.',
    tag,
    actions,requireInteraction:call&&!stale,renotify:call&&!silent,silent,...(!silent?{vibrate:call?[400,180,400]:[300]}:{}),
    data:{url:url.href,type:data.type,messageId:data.messageId,peerId:data.peerId,recipientId:data.recipientId,callId:data.callId,testId:data.testId,expiresAt:deadline},
    icon:new URL('./icon-192.png',home()).href,badge:new URL('./icon-192.png',home()).href
  });
  // Engines without renotify need a fresh tag. Cleanup follows display, never blocks it.
  if(call&&!stale&&!canRenotify)await closeCall(data.callId,tag);
}
self.addEventListener('push',event=>event.waitUntil((async()=>{let data;try{data=event.data?.json();}catch{return;}await handlePush(data);})()));
export async function handleNotificationClick(notification,action=''){
  notification.close();const data=notification.data||{};
  let url;try{url=new URL(data.url||home());}catch{url=new URL(home());}
  if(url.origin!==new URL(home()).origin||!url.href.startsWith(home()))url=new URL(home());
  const validCall=/^[a-f0-9-]{36}$/.test(data.callId||'')&&Number.isSafeInteger(data.expiresAt)&&data.expiresAt>Date.now();
  if(validCall&&action==='decline'){
    try{
      const device=await readDevice();if(!device?.token)throw new Error('Device unavailable');
      const response=await fetch(new URL(`api/calls/${data.callId}/decline`,home()),{method:'POST',headers:{Authorization:'Bearer '+device.token},cache:'no-store',signal:AbortSignal.timeout(5000)});
      if(!response.ok)throw new Error('Call could not be declined');await intents.clear();await closeCall(data.callId);return;
    }catch{
      // Keep a reachable fallback; never display a successful decline on network failure.
      await self.registration.showNotification('Open to decline the call',{body:'Could not reach your phone server. Tap here, then press Decline.',tag:`call-${data.callId}-decline`,silent:true,data:{url:home(),callId:data.callId,expiresAt:data.expiresAt},icon:new URL('./icon-192.png',home()).href});
    }
  }
  if(validCall&&action==='answer'){
    const details=await callDetails(data.callId),device=await readDevice();
    if(details?.state==='ringing'&&details.canAnswer===true&&device?.user?.id)await intents.put(device.user.id,data.callId,Math.min(data.expiresAt,details.expiresAt));
  }
  if(data.type==='message'&&/^[a-f0-9-]{36}$/.test(data.messageId||'')&&/^[a-f0-9-]{36}$/.test(data.peerId||'')){
    const device=await readDevice();
    if(device?.user?.id===data.recipientId)await chatIntents.put(device.user.id,data.messageId,data.peerId,Date.now()+120000);
  }
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const existing=windows.find(c=>c.url.startsWith(home()));
  if(existing){await existing.focus();existing.postMessage({type:'alert-opened',testId:data.testId});return;}
  await self.clients.openWindow(url.href);
}
self.addEventListener('notificationclick',event=>event.waitUntil(handleNotificationClick(event.notification,event.action)));
self.addEventListener('message',event=>{
  if(event.source?.url?.startsWith(home())&&event.data?.type==='call-ended'&&/^[a-f0-9-]{36}$/.test(event.data.callId||''))event.waitUntil(closeCall(event.data.callId));
});
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
