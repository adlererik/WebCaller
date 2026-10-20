import {dialEntry} from './dial-code.js';
export function phonePlatform(nav=navigator,win=window){
  const ios=/iPhone|iPad|iPod/.test(nav.userAgent)||(/Mac/.test(nav.platform)&&nav.maxTouchPoints>1);
  const standalone=win.matchMedia('(display-mode: standalone)').matches||nav.standalone===true;
  return {ios,standalone,needsHomeScreen:ios&&!standalone};
}

export function callSetup({api,config,device,save,toast}){
  const $=id=>document.getElementById(id),dialog=$('alerts-dialog');let testId=null;
  const platform=()=>phonePlatform();
  const button=(text,action)=>{$('alerts-primary').textContent=text;$('alerts-primary').onclick=action;};
  function page(title,text){$('alerts-title').textContent=title;$('alerts-text').textContent=text;$('alerts-help').classList.add('hidden');$('alerts-status').textContent='';$('alerts-confirm').classList.add('hidden');$('alerts-no-sound').classList.add('hidden');$('alerts-primary').classList.remove('hidden');}
  function homeScreen(){
    page('Keep your phone ready','On iPhone and iPad, save this phone to your Home Screen to hear call alerts when it is closed.');
    $('alerts-help').classList.remove('hidden');$('alerts-help').innerHTML='<ol><li>Tap your browser’s <strong>Share</strong> button.</li><li>Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>. Keep <strong>Open as Web App</strong> on if shown.</li><li>Open the new phone icon and finish this invitation.</li></ol>';
    const code=dialEntry(location.hash);
    if(code){
      $('alerts-help').innerHTML='<ol><li>Tap your browser’s <strong>Share</strong> button.</li><li>Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>. Keep <strong>Open as Web App</strong> on.</li><li>Open the new phone icon and enter calling code <strong>'+code+'</strong>.</li></ol>';
      $('alerts-status').textContent='Do this once. Keep using that icon so your conversations stay together.';
      button('Copy calling link for setup',async()=>{try{await navigator.clipboard.writeText(location.href);$('alerts-status').textContent='Copied. Add this page to your Home Screen, then open the new icon and dial '+code+'.';}catch{$('alerts-status').textContent='After adding the icon, open it and dial '+code+'.';}});return;
    }
    if(!new URLSearchParams(location.hash.slice(1)).has('invite')){
      $('alerts-status').textContent='This Home Screen phone keeps a separate identity from an existing browser profile. Ask your contact for a fresh invitation for the new icon; your current conversations stay in this browser.';button('Got it',()=>dialog.close());return;
    }
    button('Copy invitation for setup',async()=>{try{await navigator.clipboard.writeText(location.href);$('alerts-status').textContent='Copied. Now follow the three steps above. If the new icon asks for an invitation, tap Paste invitation.';}catch{$('alerts-status').textContent='If you need help, ask the person who invited you to help add the icon.';}});
  }
  async function show(){
    if(!dialog.open)dialog.showModal();
    if(platform().needsHomeScreen){homeScreen();return;}
    if(!config().vapidPublicKey){page('Calls while this page is open','The person running this phone needs to enable background alerts on the server. You can still call and message here.');$('alerts-primary').classList.add('hidden');return;}
    if(!('Notification'in window)||!('PushManager'in window)||!navigator.serviceWorker){page('Use a supported browser','Open your invitation in Chrome on Android, or save it to the Home Screen on iPhone. Call alerts are unavailable in this browser.');$('alerts-primary').classList.add('hidden');return;}
    if(Notification.permission==='denied'){help();return;}
    page('Hear incoming calls','Tap below, then allow notifications so this phone can alert you even when the page is closed.');
    button('Enable call alerts',enable);
    if(Notification.permission==='granted'){
      try{const reg=await registerAlerts(config());const sub=await reg.pushManager.getSubscription();const state=await api('/push/status','POST',{endpoint:sub?.endpoint});if(state.subscribed){page(state.confirmed?'Your call alerts are set up':'Let’s check the sound',state.confirmed?'You have confirmed an alert on this phone. You can send another test any time.':'We’ll send a test alert. Your phone’s notification sound needs to be on.');button('Send test alert',test);}}catch{}
    }
  }
  async function enable(){
    $('alerts-primary').disabled=true;
    try{
      // Permission must be requested directly from this deliberate tap.
      const permission=await Notification.requestPermission();if(permission!=='granted'){help();return;}
      const registration=await registerAlerts(config());
      const raw=config().vapidPublicKey.replace(/-/g,'+').replace(/_/g,'/');
      const key=Uint8Array.from(atob(raw),c=>c.charCodeAt(0));
      const subscription=await registration.pushManager.getSubscription()||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
      await api('/push','POST',subscription.toJSON());
      page('Let’s check the sound','Next, we’ll send a test alert. This checks your phone, not just its permission setting.');button('Send test alert',test);
    }catch(e){$('alerts-status').textContent='We couldn’t enable alerts. '+e.message;}finally{$('alerts-primary').disabled=false;}
  }
  async function test(){
    $('alerts-primary').disabled=true;
    try{
      const reg=await registerAlerts(config()),sub=await reg.pushManager.getSubscription();
      if(!sub){await enable();return;}
      const result=await api('/push/test','POST',{endpoint:sub.endpoint});testId=result.testId;
      device().alertTest={id:testId,expiresAt:result.expiresAt};await save();
      page('Now lock your phone','Close this page and lock your phone. A test alert should arrive in about 8 seconds. Tap that alert to come back here.');
      $('alerts-primary').classList.add('hidden');$('alerts-confirm').classList.remove('hidden');$('alerts-no-sound').classList.remove('hidden');
      $('alerts-status').textContent='Only press “I heard it” after the alert actually makes a sound.';
    }catch(e){$('alerts-status').textContent=e.message;}finally{$('alerts-primary').disabled=false;}
  }
  async function confirm(){
    $('alerts-confirm').disabled=true;
    try{await api('/push/test-result','POST',{testId,heard:true});device().alertsConfirmedAt=Date.now();delete device().alertTest;await save();
      page('You’re ready to talk','Call alerts are set up on this phone. When one arrives, press Answer if shown, or tap it and press Answer on this page. Keep notification sounds on.');button('Start talking',()=>dialog.close());toast('Call alert sound confirmed.');
    }catch(e){$('alerts-status').textContent=e.message;button('Send another test',test);}finally{$('alerts-confirm').disabled=false;}
  }
  function help(){
    page('Let’s turn the sound on','Your phone controls notification sounds. The website cannot turn them on for you.');
    $('alerts-help').classList.remove('hidden');$('alerts-help').innerHTML=platform().ios?'<ol><li>Open <strong>Settings → Notifications</strong> on your phone.</li><li>Choose this phone’s Home Screen app. Turn on <strong>Allow Notifications</strong> and <strong>Sounds</strong>.</li><li>Check that Silent mode and Focus are not silencing it. Return here for another test.</li></ol>':'<ol><li>Open your phone’s <strong>Settings → Notifications</strong>.</li><li>Allow notifications and sound for your browser and this website. Enable pop-up / banner notifications if offered.</li><li>Check Do Not Disturb and notification volume. Return here for another test.</li></ol>';
    button('Try again',show);
  }
  function resume(id){
    const saved=device()?.alertTest;if(!saved||saved.expiresAt<=Date.now()||(id&&saved.id!==id))return;
    testId=saved.id;page('Did you hear the alert?','If the test made a sound while your phone was locked, confirm below.');$('alerts-primary').classList.add('hidden');$('alerts-confirm').classList.remove('hidden');$('alerts-no-sound').classList.remove('hidden');if(!dialog.open)dialog.showModal();
  }
  $('alerts-confirm').onclick=confirm;$('alerts-no-sound').onclick=help;$('alerts-later').onclick=()=>dialog.close();
  return {show,resume,close:()=>dialog.close(),platform};
}

// A path migration must reuse a working subscription instead of making this
// phone ring twice. Only reuse this app's exact same-origin worker/scope pairs.
export async function registerAlerts(config={}, {worker=navigator.serviceWorker, href=location.href}={}) {
  const current=new URL('./',href);
  const scopes=[current,...(config.appPaths||[]).filter(path=>/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(path)).map(path=>new URL(path+'/',current.origin))];
  const allowed=new Set(scopes.map(url=>url.href));
  const registrations=await worker.getRegistrations();
  const candidates=registrations.filter(reg=>{
    const script=reg.active?.scriptURL||reg.waiting?.scriptURL||reg.installing?.scriptURL;
    return allowed.has(reg.scope)&&script===new URL('sw.js',reg.scope).href;
  }).sort((a,b)=>Number(b.scope===current.href)-Number(a.scope===current.href));
  let existing;
  for(const reg of candidates)if(await reg.pushManager.getSubscription()){existing=reg;break;}
  existing ||= candidates[0];
  const scope=existing?.scope||current.href;
  const registration=await worker.register(new URL('sw.js',scope).pathname,{scope:new URL(scope).pathname,type:'module',updateViaCache:'none'});
  if(registration.active)return registration;
  // serviceWorker.ready waits for a worker controlling the *current* path;
  // the reused legacy worker may deliberately have a different scope.
  await new Promise((resolve,reject)=>{
    const installing=registration.installing||registration.waiting;
    let timeout;
    const finish=error=>{clearTimeout(timeout);installing?.removeEventListener('statechange',changed);error?reject(error):resolve();};
    const changed=()=>{
      if(registration.active||installing?.state==='activated')finish();
      else if(!installing||installing.state==='redundant')finish(new Error('Call alerts could not start. Please try again.'));
    };
    timeout=setTimeout(()=>finish(new Error('Call alerts took too long to start. Please try again.')),10000);
    installing?.addEventListener('statechange',changed);changed();
  });
  return registration;
}
