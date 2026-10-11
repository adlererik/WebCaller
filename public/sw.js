import {vault} from './crypto.js';
// No asset cache or message history. Push contains only generic alert text.
const home=()=>new URL('./',self.registration.scope).href;
async function closeCall(callId){
  for(const n of await self.registration.getNotifications())if(n.data?.callId===callId)n.close();
}
async function callState(callId){
  try{
    const device=await vault('get');if(!device?.token)return null;
    const result=await fetch(new URL(`api/calls/${callId}`,home()),{headers:{Authorization:'Bearer '+device.token},cache:'no-store',signal:AbortSignal.timeout(1800)});
    return result.ok?(await result.json()).state:null;
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
  if(call){state=await callState(data.callId);stale ||= state==='ended'||state==='answered';await closeCall(data.callId);}
  const silent=stale||(call&&await alreadyRinging(data.callId));
  const url=new URL(home());if(test)url.hash='alert-test='+data.testId;
  // A visible, silent result for stale pushes respects Apple's userVisibleOnly rule.
  const title=stale?(call?'Call ended':test?'Alert test expired':'Message expired'):call?'Incoming call':test?'Call alert test':'New private message';
  await self.registration.showNotification(title,{
    body:stale?'Open your phone to check.':call?'Tap to open your phone and answer.':test?'Tap here if you heard this alert.':'Open your phone to read it.',
    tag:call?`call-${data.callId}-${Number(data.revision)||0}`:test?`test-${data.testId}`:'private-message',
    renotify:call&&!silent,silent,...(!silent?{vibrate:call?[400,180,400]:[300]}:{}),
    data:{url:url.href,callId:data.callId,testId:data.testId,expiresAt:data.callExpiresAt||data.expiresAt},
    icon:new URL('./icon-192.png',home()).href
  });
}
self.addEventListener('push',event=>event.waitUntil((async()=>{let data;try{data=event.data?.json();}catch{return;}await handlePush(data);})()));
self.addEventListener('notificationclick',event=>{
  event.notification.close();event.waitUntil((async()=>{
    let url;try{url=new URL(event.notification.data?.url||home());}catch{url=new URL(home());}
    if(url.origin!==new URL(home()).origin||!url.href.startsWith(home()))url=new URL(home());
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const existing=windows.find(c=>c.url.startsWith(home()));
    if(existing){await existing.focus();existing.postMessage({type:'alert-opened',testId:event.notification.data?.testId});return;}
    await self.clients.openWindow(url.href);
  })());
});
self.addEventListener('message',event=>{
  if(event.source?.url?.startsWith(home())&&event.data?.type==='call-ended'&&/^[a-f0-9-]{36}$/.test(event.data.callId||''))event.waitUntil(closeCall(event.data.callId));
});
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
