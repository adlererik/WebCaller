// Notifications only: no asset cache, message body cache, or offline history.
self.addEventListener('push',event=>event.waitUntil((async()=>{
  let data;try{data=event.data?.json();}catch{return;}
  if(!data||data.expiresAt<=Date.now())return;
  const call=data.type==='call';
  await self.registration.showNotification(call?'Incoming call':'New private message',{
    body:call?'Open WebCaller to answer.':'Open WebCaller to read it.',
    tag:call?'ellie-call':'ellie-message',renotify:call,
    data:{url:new URL('./',self.registration.scope).href,expiresAt:data.expiresAt},
    icon:new URL('./icon.svg',self.registration.scope).href
  });
})()));
self.addEventListener('notificationclick',event=>{
  event.notification.close();event.waitUntil((async()=>{
    const url=new URL('./',self.registration.scope).href;
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const existing=windows.find(c=>c.url.startsWith(url));if(existing)return existing.focus();
    return self.clients.openWindow(url);
  })());
});
self.addEventListener('activate',event=>event.waitUntil((async()=>{await self.clients.claim();})()));
