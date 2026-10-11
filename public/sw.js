import {vault} from './crypto.js';
import {callIntents} from './call-intents.js';
const intents=callIntents();
// No asset cache or message history. Push contains only generic alert text.
const home=()=>new URL('./',self.registration.scope).href;
async function closeCall(callId){
  for(const n of await self.registration.getNotifications())if(n.data?.callId===callId)n.close();
}
async function callDetails(callId){
  try{
    const device=await vault('get');if(!device?.token)return null;
    const result=await fetch(new URL(`api/calls/${callId}`,home()),{headers:{Authorization:'Bearer '+device.token},cache:'no-store',signal:AbortSignal.timeout(1800)});
    return result.ok?await result.json():null;
  }catch{return null;}
}
async function alreadyRinging(callId){
  const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const visible=clients.filter(c=>c.url.startsWith(home())&&c.visibilityState==='visible');
  const replies=await Promise.all(visible.map(c=>new Promise(resolve=>{
    const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();resolve(false);},250);
    channel.port1.onmessage=e=>{clearTimeout(timer);channel.port1.close();resolve(e.data?.ringing===true);};
    c.postMessage({type:'ringing-query',callId},[channel.port2]);
  })));
  return replies.some(Boolean);
}
export async function handlePush(data){
  if(!data||!['call','test','message'].includes(data.type)||!Number.isSafeInteger(data.expiresAt))return;
  const call=data.type==='call',test=data.type==='test';
  if((call&&!/^[a-f0-9-]{36}$/.test(data.callId||''))||(test&&!/^[a-f0-9-]{36}$/.test(data.testId||'')))return;
  let stale=data.expiresAt<=Date.now(),state=null;
  if(call){state=(await callDetails(data.callId))?.state;stale ||= state==='ended'||state==='answered';await closeCall(data.callId);}
  const silent=stale||(call&&await alreadyRinging(data.callId));
  const actions=call&&!stale?[{action:'answer',title:'Answer'},{action:'decline',title:'Decline'}].slice(0,globalThis.Notification?.maxActions??2):[];
  const url=new URL(home());if(test)url.hash='alert-test='+data.testId;
  // A visible, silent result for stale pushes respects Apple's userVisibleOnly rule.
  const title=stale?(call?'Call ended':test?'Alert test expired':'Message expired'):call?'Incoming call':test?'Call alert test':'New private message';
  await self.registration.showNotification(title,{
    body:stale?'Open your phone to check.':call?(actions.length?'Answer this call or tap to open your phone.':'Tap to open your phone and answer.'):test?'Tap here if you heard this alert.':'Open your phone to read it.',
    tag:call?`call-${data.callId}-${Number(data.revision)||0}`:test?`test-${data.testId}`:'private-message',
    actions,requireInteraction:call&&!stale,renotify:call&&!silent,silent,...(!silent?{vibrate:call?[400,180,400]:[300]}:{}),
    data:{url:url.href,callId:data.callId,testId:data.testId,expiresAt:data.callExpiresAt||data.expiresAt},
    icon:new URL('./icon-192.png',home()).href,badge:new URL('./icon-192.png',home()).href
  });
}
self.addEventListener('push',event=>event.waitUntil((async()=>{let data;try{data=event.data?.json();}catch{return;}await handlePush(data);})()));
export async function handleNotificationClick(notification,action=''){
  notification.close();const data=notification.data||{};
  let url;try{url=new URL(data.url||home());}catch{url=new URL(home());}
  if(url.origin!==new URL(home()).origin||!url.href.startsWith(home()))url=new URL(home());
  const validCall=/^[a-f0-9-]{36}$/.test(data.callId||'')&&Number.isSafeInteger(data.expiresAt)&&data.expiresAt>Date.now();
  if(validCall&&action==='decline'){
    try{
      const device=await vault('get');if(!device?.token)throw new Error('Device unavailable');
      const response=await fetch(new URL(`api/calls/${data.callId}/decline`,home()),{method:'POST',headers:{Authorization:'Bearer '+device.token},cache:'no-store',signal:AbortSignal.timeout(5000)});
      if(!response.ok)throw new Error('Call could not be declined');await intents.clear();await closeCall(data.callId);return;
    }catch{
      // Keep a reachable fallback; never display a successful decline on network failure.
      await self.registration.showNotification('Open to decline the call',{body:'Could not reach your phone server. Tap here, then press Decline.',tag:`call-${data.callId}-decline`,silent:true,data:{url:home(),callId:data.callId,expiresAt:data.expiresAt},icon:new URL('./icon-192.png',home()).href});
    }
  }
  if(validCall&&action==='answer'){
    const details=await callDetails(data.callId),device=await vault('get').catch(()=>null);
    if(details?.state==='ringing'&&details.canAnswer===true&&device?.user?.id)await intents.put(device.user.id,data.callId,Math.min(data.expiresAt,details.expiresAt));
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
