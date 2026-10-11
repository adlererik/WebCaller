import { newIdentity, fingerprint, safetyNumber, seal, open, vault, unb64 } from './crypto.js';
import { Phone, testRelay } from './media.js';
import { readEntryFragment, clearEntryFragment } from './onboarding.js';
const $=id=>document.getElementById(id);
const icons={
  chat:'<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H7l-5 3 1.5-5.5A8.5 8.5 0 1 1 21 11.5Z"/><path d="M7 11h.01M12 11h.01M17 11h.01"/>',
  phone:'<path d="m7 3 3 5-3 2c1.7 3.5 3.5 5.3 7 7l2-3 5 3v3c0 1-1 2-2 2C9 22 2 15 2 5c0-1 1-2 2-2Z"/>',
  hangup:'<path d="M3 15v-4c5-5 13-5 18 0v4h-5v-4a14 14 0 0 0-8 0v4Z"/>',
  video:'<rect x="3" y="5" width="12" height="14" rx="3"/><path d="m15 9 6-3v12l-6-3"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',back:'<path d="m15 5-7 7 7 7"/>',
  settings:'<path d="m9 3 1-1h4l1 3 3 1 3-1 2 4-2 2v3l2 2-2 4-3-1-3 1-1 3h-4l-1-3-3-1-3 1-2-4 2-2v-3L1 9l2-4 3 1Z"/><circle cx="12" cy="12" r="3"/>',
  search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',lock:'<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 15v2"/>',
  more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',send:'<path d="m3 3 19 9-19 9 4-9-4-9ZM7 12h15"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>',invite:'<circle cx="9" cy="7" r="4"/><path d="M2 21v-2a7 7 0 0 1 14 0M19 8v8M15 12h8"/>',
  share:'<path d="M12 16V2m-4 4 4-4 4 4M5 10v10h14V10"/>',copy:'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V3H3v13h5"/>',
  bell:'<path d="M18 8a6 6 0 0 0-12 0v6l-3 3h18l-3-3ZM9 21h6"/>',activity:'<path d="M2 12h4l3-8 6 16 3-8h4"/>',mic:'<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>'
};
document.querySelectorAll('[data-icon]').forEach(e=>{e.innerHTML=`<svg aria-hidden="true" viewBox="0 0 24 24">${icons[e.dataset.icon]||''}</svg>`;});
const base=location.pathname.replace(/\/$/,'');
const entry=readEntryFragment(location.hash),invitation=entry.invitation;
let ownerSetup=entry.setupCode;
const ownerName=entry.name;entry.setupCode=null;
clearEntryFragment(location,history); // Never send invitation/setup secrets in HTTP URLs or referrers.
let device,config,selected,ws,wsReady=false,reconnectTimer,reconnectAttempt=0,heartbeat,phone,call,callTicker,wakeLock,soundContext,ringTimer,toastTimer;
let messages=new Map(),unread=new Map(),seenSignals=new Set(),pendingCandidates=new Map(),settings={mode:'auto',timers:{}};
try{settings={...settings,...JSON.parse(localStorage.getItem('webcaller-settings')||'{}')};}catch{}
const preference=()=>settings.mode;
const timerFor=id=>Number(settings.timers[id]||86400);
const duration=s=>s<60?`${Math.ceil(s)} seconds`:s<3600?`${Math.ceil(s/60)} minutes`:s<86400?`${Math.ceil(s/3600)} hour${Math.ceil(s/3600)===1?'':'s'}`:s===86400?'24 hours':'7 days';
const initials=name=>name.trim().split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase();
function toast(text){$('toast').textContent=text;$('toast').classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),6000);}
function saveSettings(){localStorage.setItem('webcaller-settings',JSON.stringify(settings));if(selected)$('expiry-label').textContent=`Your messages disappear after ${duration(timerFor(selected.id))}`;}
async function api(path,method='GET',data){
  const headers={};if(device?.token)headers.Authorization=`Bearer ${device.token}`;if(data)headers['Content-Type']='application/json';
  const r=await fetch(`${base}/api${path}`,{method,headers,body:data?JSON.stringify(data):undefined,cache:'no-store',signal:AbortSignal.timeout(20000)});
  const b=await r.json();if(!r.ok)throw new Error(b.error||'Request failed');return b;
}
function connected(ready){wsReady=ready;$('connection').textContent=ready?'Ready for conversations':'Reconnecting…';$('connection').classList.toggle('online',ready);}
async function pinContacts(contacts){
  device.pins ||= {};const safe=[];
  for(const contact of contacts){
    const next=await fingerprint(contact.keys),prior=device.pins[contact.id];
    if(prior&&await fingerprint(prior.keys)!==next){toast(`Device keys changed for ${contact.name}. Contact them through a trusted channel.`);continue;}
    device.pins[contact.id]=contact;safe.push(contact);
  }
  device.contacts=safe;await vault('put',device);renderContacts();
  if(selected){selected=safe.find(c=>c.id===selected.id);if(!selected){$('conversation').classList.add('hidden');$('empty').classList.remove('hidden');document.querySelector('.app').classList.remove('chat-open');}}
}
function renderContacts(){
  const el=$('contacts');el.replaceChildren();$('contact-count').textContent=device?.contacts?.length||0;
  const contacts=(device?.contacts||[]).filter(c=>c.name.toLowerCase().includes($('search').value.toLowerCase()));
  for(const c of contacts){
    const button=document.createElement('button');button.className='contact'+(selected?.id===c.id?' selected':'');button.dataset.contact=c.id;
    const avatar=document.createElement('div');avatar.className='avatar';avatar.textContent=initials(c.name);
    const text=document.createElement('div');text.className='contact-text';const name=document.createElement('strong');name.textContent=c.name;
    const preview=document.createElement('span');preview.textContent='Private conversation';text.append(name,preview);button.append(avatar,text);
    if(unread.get(c.id)){const badge=document.createElement('span');badge.className='unread';badge.textContent=unread.get(c.id);button.append(badge);}
    button.onclick=()=>selectContact(c);el.append(button);
  }
  if(!contacts.length){const p=document.createElement('p');p.className='no-contacts';p.textContent=$('search').value?'No people found.':'Your people will appear here.\nStart with an invitation.';el.append(p);}
}
function selectContact(c){
  selected=c;unread.delete(c.id);renderContacts();$('empty').classList.add('hidden');$('conversation').classList.remove('hidden');document.querySelector('.app').classList.add('chat-open');
  $('peer-name').textContent=c.name;$('peer-avatar').textContent=initials(c.name);$('expiry-label').textContent=`Your messages disappear after ${duration(timerFor(c.id))}`;renderMessages();
}
function renderMessages(){
  const el=$('messages');const nearBottom=el.scrollHeight-el.scrollTop-el.clientHeight<100;el.replaceChildren();
  const list=[...messages.values()].filter(m=>m.expiresAt>Date.now()&&[m.from,m.to].includes(selected?.id)).sort((a,b)=>a.createdAt-b.createdAt);
  for(const m of list){
    const bubble=document.createElement('div');bubble.className='message'+(m.from===device.user.id?' outgoing':'');
    const text=document.createElement('span');text.textContent=m.text;const meta=document.createElement('span');meta.className='message-meta';
    const time=new Date(m.createdAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});meta.textContent=time+' · '+duration(Math.max(1,Math.ceil((m.expiresAt-Date.now())/1000))).replace(/\d+ seconds/,'expires soon');
    bubble.append(text,meta);el.append(bubble);
  }
  if(!list.length){const p=document.createElement('p');p.className='chat-empty';p.textContent='A conversation just for you two.\nSay hello, or give them a call.';el.append(p);}
  if(nearBottom||list.length<4)el.scrollTop=el.scrollHeight;
}
async function acceptMessage(envelope,hydrating=false){
  if(messages.has(envelope.id)||envelope.expiresAt<=Date.now())return;
  const peerId=envelope.from===device.user.id?envelope.to:envelope.from;
  let peer=device.contacts.find(c=>c.id===peerId);
  if(!peer&&!hydrating){await pinContacts((await api('/me')).contacts);peer=device.contacts.find(c=>c.id===peerId);}if(!peer)return;
  const payload=await open(device.identity,device.user.id,peer,envelope);
  if(payload.kind!=='text'||typeof payload.text!=='string'||payload.text.length>4000)return;
  messages.set(envelope.id,{id:envelope.id,from:envelope.from,to:envelope.to,createdAt:envelope.createdAt,expiresAt:envelope.expiresAt,text:payload.text});
  if(!hydrating&&envelope.from!==device.user.id&&selected?.id!==peer.id)unread.set(peer.id,(unread.get(peer.id)||0)+1);
  if(selected?.id===peer.id)renderMessages();renderContacts();
}
async function sync(){
  const me=await api('/me');await pinContacts(me.contacts);
  const saved=await api('/messages');
  for(const e of saved)try{await acceptMessage(e,true);}catch{toast('An encrypted message could not be verified.');}
  if(selected)renderMessages();
}
async function connect(){
  clearTimeout(reconnectTimer);if(!device?.token)return;
  try{
    const ticket=await api('/ticket','POST',{});
    ws=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}${base}/ws`);
    ws.onopen=()=>ws.send(JSON.stringify({type:'auth',ticket:ticket.ticket}));
    ws.onmessage=async event=>{try{
      const b=JSON.parse(event.data);
      if(b.type==='ready'){connected(true);reconnectAttempt=0;await sync();if(phone)await phone.restart();clearInterval(heartbeat);heartbeat=setInterval(()=>{if(wsReady&&ws.readyState===1)ws.send(JSON.stringify({type:'ping'}));},25000);}
      else if(b.type==='message')await acceptMessage(b.envelope);
      else if(b.type==='contacts')await sync();
      else if(b.type==='signal')await receiveSignal(b);
      else if(b.type==='busy'&&b.callId===call?.id)finishCall('They’re on another call. Try again later.');
      else if(b.type==='call-expired'&&b.callId===call?.id)finishCall('No answer. Try again later.');
      else if(b.type==='error')toast(b.error);
    }catch(e){if(e.message!=='Expired')toast('A private update could not be verified.');}};
    ws.onerror=()=>{};ws.onclose=()=>{connected(false);clearInterval(heartbeat);scheduleReconnect();};
  }catch{connected(false);scheduleReconnect();}
}
function scheduleReconnect(){clearTimeout(reconnectTimer);if(!device)return;reconnectTimer=setTimeout(connect,Math.min(20000,1000*2**Math.min(5,reconnectAttempt++))+Math.random()*400);}
async function signal(kind,payload){
  if(!call)return;
  const current=call;
  if(!wsReady||ws?.readyState!==1)throw new Error('Waiting for the connection to return');
  const envelope=await seal(device.identity,device.user.id,current.peer,{kind,callId:current.id,...payload},kind==='offer'?90:120);
  if(call?.id!==current.id||!wsReady)return;
  ws.send(JSON.stringify({type:'signal',kind,callId:current.id,envelope}));
}
function unlockSound(){
  const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
  soundContext ||= new AC();void soundContext.resume();
}
function ring(){
  stopRing();const ding=()=>{
    if(soundContext?.state!=='running')return;
    for(const [freq,delay] of [[440,0],[550,.22]]){
      const oscillator=soundContext.createOscillator(),gain=soundContext.createGain();oscillator.frequency.value=freq;
      gain.gain.setValueAtTime(0,soundContext.currentTime+delay);gain.gain.linearRampToValueAtTime(.06,soundContext.currentTime+delay+.02);gain.gain.linearRampToValueAtTime(0,soundContext.currentTime+delay+.18);
      oscillator.connect(gain).connect(soundContext.destination);oscillator.start(soundContext.currentTime+delay);oscillator.stop(soundContext.currentTime+delay+.2);
    }
  };ding();ringTimer=setInterval(ding,1600);
}
function stopRing(){clearInterval(ringTimer);}
function showCall(incoming=false){
  $('call-screen').classList.remove('hidden');$('call-screen').classList.remove('has-video');$('call-name').textContent=call.peer.name;$('call-avatar').textContent=initials(call.peer.name);
  $('call-status').textContent=incoming?(call.video?'Incoming video call':'Incoming voice call'):'Calling…';$('call-duration').textContent='';$('call-quality').textContent='Voice first';$('call-warning').textContent='';
  $('incoming-actions').classList.toggle('hidden',!incoming);$('active-actions').classList.toggle('hidden',incoming);$('mute').classList.remove('selected');$('toggle-video').classList.toggle('selected',call.video);$('play-audio').classList.add('hidden');
}
async function createPhone(video,caller){
  const id=call.id;
  const ice=await api('/ice');
  if(call?.id!==id)throw new Error('Call cancelled');
  if(!ice.turn)$('call-warning').textContent='Relay is not configured. Calls across some networks may fail.';
  phone=new Phone({signal,update:updateCall,remote:$('remote-media'),local:$('local-media'),ended:endCall,preference});phone.refreshIce=()=>api('/ice');
  await phone.prepare(ice,video,caller);
  for(const c of pendingCandidates.get(call.id)||[])await phone.candidate(c);pendingCandidates.delete(call.id);
}
function updateCall(update){
  if(!call)return;
  if(update.state)$('call-status').textContent={new:'Connecting…',connecting:'Connecting…',connected:'Connected',disconnected:'Reconnecting…',failed:'Reconnecting…'}[update.state]||update.state;
  if(update.connected&&!call.started){
    call.started=Date.now();clearInterval(callTicker);callTicker=setInterval(()=>{if(!call)return;const sec=Math.floor((Date.now()-call.started)/1000);$('call-duration').textContent=`${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`;},1000);
    navigator.wakeLock?.request('screen').then(lock=>wakeLock=lock).catch(()=>{});
  }
  if(update.label)$('call-quality').textContent=update.label;
  if(update.videoPaused)$('call-quality').textContent='Connection weak · camera paused';
  if(update.warning)$('call-warning').textContent=update.warning;
  if(update.needsPlayback)$('play-audio').classList.remove('hidden');
  if(update.stats){const s=update.stats;call.stats=s;$('call-stats').textContent='Adapts to your connection';if($('settings-dialog').open)$('diagnostic-result').textContent=`${Math.round(s.kbps)} kb/s media · ${Math.round(s.rtt*1000)} ms · ${Math.round(s.loss*100)}% loss${s.relay?' · relayed':' · direct'}`;}
}
async function startCall(video=false){
  unlockSound();if(!selected||call)return;if(!wsReady)return toast('Wait for the connection to return.');
  const id=crypto.randomUUID();call={id,peer:selected,video,caller:true};showCall();
  try{await createPhone(video,true);if(call?.id!==id)return;const description=await phone.description('offer');await signal('offer',{description,video});call.timeout=setTimeout(()=>{if(call?.id===id&&!call.started)void endCall('No answer. Try again later.');},90000);}
  catch(e){if(call?.id===id)finishCall(e.name==='NotAllowedError'?'Allow microphone access to make calls.':e.message);}
}
async function receiveSignal(b){
  if(seenSignals.has(b.envelope.id))return;
  let peer=device.contacts.find(c=>c.id===b.envelope.from);
  if(!peer){await pinContacts((await api('/me')).contacts);peer=device.contacts.find(c=>c.id===b.envelope.from);}if(!peer)return;
  const payload=await open(device.identity,device.user.id,peer,b.envelope);
  if(payload.kind!==b.kind||payload.callId!==b.callId)return;
  seenSignals.add(b.envelope.id);if(seenSignals.size>2000)seenSignals.delete(seenSignals.values().next().value);
  if(b.kind==='offer'){
    if(call?.id===b.callId)return;if(call)return;
    call={id:b.callId,peer,video:!!payload.video,caller:false,offer:payload.description};showCall(true);ring();
    call.timeout=setTimeout(()=>{if(call?.id===b.callId&&!call.started)finishCall('Missed call');},Math.max(1,b.envelope.expiresAt-Date.now()));return;
  }
  if(b.kind==='ice'){
    if(phone&&call?.id===b.callId)await phone.candidate(payload.candidate);
    else{if(pendingCandidates.size>10)pendingCandidates.clear();const list=pendingCandidates.get(b.callId)||[];if(list.length<80)list.push(payload.candidate);pendingCandidates.set(b.callId,list);}return;
  }
  if(call?.id!==b.callId)return;
  if(b.kind==='answer'){clearTimeout(call.timeout);await phone?.receive(payload.description);await phone?.replayCandidates();}
  else if(b.kind==='hangup')finishCall(payload.reason||'Call ended');
  else if(b.kind==='restart'){
    if(payload.request)await phone?.restart();
    else if(payload.description){await phone?.receive(payload.description);if(payload.description.type==='offer')await signal('restart',{description:await phone.description('answer')});await phone?.replayCandidates();}
  }
  else if(b.kind==='video')$('call-screen').classList.toggle('has-video',payload.enabled||phone?.videoWanted);
}
async function answerCall(){
  unlockSound();if(!call||!call.offer)return;stopRing();$('incoming-actions').classList.add('hidden');$('active-actions').classList.remove('hidden');$('call-status').textContent='Connecting…';
  const id=call.id;
  try{await createPhone(call.video,false);if(call?.id!==id)return;await phone.receive(call.offer);await signal('answer',{description:await phone.description('answer')});await phone.replayCandidates();clearTimeout(call.timeout);}
  catch(e){if(call?.id===id)await endCall(e.name==='NotAllowedError'?'Allow microphone access to answer.':e.message);}
}
function finishCall(reason='Call ended'){
  if(call)clearTimeout(call.timeout);stopRing();clearInterval(callTicker);phone?.close();phone=null;call=null;pendingCandidates.clear();wakeLock?.release().catch(()=>{});wakeLock=null;
  $('call-screen').classList.add('hidden');if(reason)toast(reason);
}
async function endCall(reason='Call ended'){try{await signal('hangup',{reason});}catch{}finishCall(reason);}
async function invite(){
  if(!device)return;$('invite').disabled=true;
  try{const result=await api('/invite','POST',{});$('invite-link').value=result.url;$('invite-dialog').showModal();}catch(e){toast(e.message);}finally{$('invite').disabled=false;}
}
async function settingsDialog(){
  $('network-mode').value=settings.mode;$('message-timer').value=timerFor(selected?.id||'default');$('message-timer').disabled=!selected;
  $('settings-dialog').showModal();
}
async function boot(){
  try{
    if(!window.isSecureContext||!crypto.subtle)throw new Error('Open this phone over HTTPS to use secure calls.');
    [config,device]=await Promise.all([api('/config'),vault('get')]);
    if(device)ownerSetup=null;
    if(invitation||!device){
      if(invitation){$('welcome-title').textContent='You’re invited. Say hello.';$('welcome-text').textContent='Accept the invitation to call and message privately. Your name is optional.';$('setup-label').classList.add('hidden');$('join-button').firstChild.textContent='Accept invitation';}
      else if(!config.bootstrap){ownerSetup=null;$('welcome-title').textContent='A place for your people.';$('welcome-text').textContent='Ask someone you know for an invitation. Open their link to connect.';$('welcome-form').querySelectorAll('label,button').forEach(e=>e.classList.add('hidden'));}
      else if(ownerSetup){$('name-input').value=ownerName;$('setup-code').value=ownerSetup;$('setup-label').classList.add('hidden');$('welcome-text').textContent='Your private setup link is ready. Choose your name and set up this phone.';$('join-button').firstChild.textContent='Set up this phone';}
      $('welcome-dialog').showModal();
      if(!device)return;
    }
    await ready();
  }catch(e){toast(e.message);$('connection').textContent='Unable to connect';}
}
async function ready(){
  $('self-name').textContent=device.user.name;$('self-avatar').textContent=initials(device.user.name);renderContacts();await connect();
}
$('welcome-form').onsubmit=async event=>{
  event.preventDefault();unlockSound();$('join-button').disabled=true;$('welcome-error').textContent='';
  try{
    if(!invitation&&!$('setup-code').value.trim())throw new Error('Use your private setup QR code or paste the owner setup code first.');
    const identity=device?.identity||await newIdentity();const name=$('name-input').value.trim()||'Guest';
    let result;
    if(invitation){
      const [token,fp]=invitation.split('.');result=await api('/join','POST',{name,keys:identity.keys,invite:token,fingerprint:fp});
      if(!result.contact||await fingerprint(result.contact.keys)!==fp)throw new Error('The invitation identity changed. Ask for a new link through a trusted channel.');
    }
    else result=await api('/register','POST',{name,keys:identity.keys,setupCode:$('setup-code').value.trim()});
    device={identity,token:result.token||device?.token,user:result.user,contacts:result.contacts,pins:device?.pins||{}};await pinContacts(result.contacts);ownerSetup=null;$('setup-code').value='';$('welcome-dialog').close();await ready();if(result.contact)selectContact(result.contact);
  }catch(e){$('welcome-error').textContent=e.message;}finally{$('join-button').disabled=false;}
};
$('welcome-dialog').addEventListener('cancel',e=>e.preventDefault());
$('invite').onclick=invite;$('empty-invite').onclick=invite;$('settings').onclick=settingsDialog;$('chat-settings').onclick=settingsDialog;
$('call-settings').onclick=settingsDialog;
$('search').oninput=renderContacts;
$('back').onclick=()=>document.querySelector('.app').classList.remove('chat-open');
document.querySelectorAll('[data-close]').forEach(e=>e.onclick=()=>e.closest('dialog').close());
$('copy-invite').onclick=async()=>{try{await navigator.clipboard.writeText($('invite-link').value);toast('Invitation copied.');}catch{$('invite-link').select();toast('Select and copy the invitation link.');}};
$('share-invite').onclick=async()=>{try{if(navigator.share)await navigator.share({title:'Talk with me on WebCaller',url:$('invite-link').value});else $('copy-invite').click();}catch(e){if(e.name!=='AbortError')toast(e.message);}};
$('composer').onsubmit=async event=>{
  event.preventDefault();unlockSound();const input=$('message-input'),text=input.value.trim();if(!text||!selected)return;const peer=selected;$('send').disabled=true;
  try{const envelope=await seal(device.identity,device.user.id,peer,{kind:'text',text},timerFor(peer.id));await api('/messages','POST',envelope);await acceptMessage(envelope);input.value='';$('messages').scrollTop=$('messages').scrollHeight;}catch(e){toast(e.message);}finally{$('send').disabled=false;}
};
$('message-input').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('composer').requestSubmit();}};
$('network-mode').onchange=async()=>{settings.mode=$('network-mode').value;saveSettings();if(phone){phone.profile=settings.mode==='wifi'?'wifi':'saver';await phone.applyProfile();await phone.restart();}};
$('message-timer').onchange=()=>{if(selected){settings.timers[selected.id]=Number($('message-timer').value);saveSettings();}};
$('peer-details').onclick=async()=>{if(!selected)return;$('safety-number').textContent=await safetyNumber(device.identity.keys,selected.keys);$('safety-dialog').showModal();};
$('voice').onclick=()=>startCall(false);$('video').onclick=()=>startCall(true);$('answer').onclick=answerCall;$('decline').onclick=()=>endCall('Call declined');$('end-call').onclick=()=>endCall();
$('mute').onclick=()=>{if(phone){const muted=phone.mute();$('mute').classList.toggle('selected',muted);$('mute').ariaLabel=muted?'Unmute microphone':'Mute microphone';}};
$('toggle-video').onclick=async()=>{if(!phone)return;try{const enabled=await phone.toggleVideo();$('toggle-video').classList.toggle('selected',enabled);$('call-screen').classList.toggle('has-video',enabled||$('remote-media').srcObject?.getVideoTracks().some(t=>!t.muted));}catch(e){toast(e.name==='NotAllowedError'?'Allow camera access to use video.':e.message);}};
$('remote-media').addEventListener('resize',()=>$('call-screen').classList.toggle('has-video',$('remote-media').videoWidth>0||phone?.videoWanted));
$('play-audio').onclick=()=>{$('remote-media').play().then(()=>$('play-audio').classList.add('hidden')).catch(()=>toast('Audio playback is blocked by your browser.'));};
$('enable-sound').onclick=()=>{unlockSound();toast('Ringing enabled while this page stays active.');};
$('enable-notifications').onclick=async()=>{
  try{
    if(!('Notification'in window)||!('PushManager'in window))return toast('This browser cannot receive background notifications without an installation. Keep the page open.');
    if(!config.vapidPublicKey)return toast('Server notifications are not configured.');
    const permission=await Notification.requestPermission();if(permission!=='granted')return toast('Notifications were not allowed.');
    const registration=await navigator.serviceWorker.register(`${base}/sw.js`,{scope:`${base}/`});await navigator.serviceWorker.ready;
    const subscription=await registration.pushManager.getSubscription()||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:unb64(config.vapidPublicKey)});
    await api('/push','POST',subscription.toJSON());toast('Notifications enabled. Delivery still depends on your browser and device settings.');
  }catch(e){toast(e.message);}
};
$('diagnostics').onclick=async()=>{
  $('diagnostics').disabled=true;$('diagnostic-result').textContent='Checking the relay…';
  try{const ice=await api('/ice');const result=await testRelay(ice);$('diagnostic-result').textContent=result.text;}catch(e){$('diagnostic-result').textContent=e.message;}finally{$('diagnostics').disabled=false;}
};
$('forget-device').onclick=()=>{$('settings-dialog').close();$('forget-dialog').showModal();};
$('confirm-forget').onclick=async()=>{
  try{await api('/device','DELETE');if(ws){ws.onclose=null;ws.close();}clearTimeout(reconnectTimer);clearInterval(heartbeat);finishCall('');await vault('delete');messages.clear();localStorage.removeItem('webcaller-settings');device=null;location.reload();}catch(e){toast(e.message);}
};
setInterval(()=>{let changed=false;for(const [id,m]of messages)if(m.expiresAt<=Date.now()){m.text='';messages.delete(id);changed=true;}if(changed&&selected)renderMessages();},1000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&device){if(!wsReady)connect();else sync().catch(()=>{});if(call?.started)navigator.wakeLock?.request('screen').then(lock=>wakeLock=lock).catch(()=>{});}if(document.visibilityState==='hidden'){for(const m of messages.values())m.text='';messages.clear();$('messages').replaceChildren();}});
window.addEventListener('online',()=>{if(device&&!wsReady)connect();});
navigator.connection?.addEventListener('change',()=>{if(phone)void phone.sample();});
window.addEventListener('pagehide',()=>{phone?.close();messages.clear();});
void boot();
