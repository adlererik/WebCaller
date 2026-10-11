import { newIdentity, fingerprint, safetyNumber, seal, open, vault } from './crypto.js';
import { Phone, testRelay } from './media.js';
import { readEntryFragment, clearEntryFragment } from './onboarding.js';
import {newAttachment,validAttachment,attachmentKey,encryptChunk,decryptChunk,CHUNK_SIZE,mediaKind,fileSize} from './attachments.js';
import {drawMessages,emojiPicker} from './chat-ui.js';
import {chatCapture} from './chat-capture.js';
import {callSetup,phonePlatform,registerAlerts} from './call-setup.js';
const $=id=>document.getElementById(id);
const icons={
  smile:'<circle cx="12" cy="12" r="9"/><path d="M8 14a4 4 0 0 0 8 0M8 9h.01M16 9h.01"/>',camera:'<path d="m8 5 2-3h4l2 3h4v16H4V5Z"/><circle cx="12" cy="13" r="4"/>',download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
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
  bell:'<path d="M18 8a6 6 0 0 0-12 0v6l-3 3h18l-3-3ZM9 21h6"/>',activity:'<path d="M2 12h4l3-8 6 16 3-8h4"/>',mic:'<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>',
  image:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/>',file:'<path d="M14 2H5v20h14V7Z M14 2v5h5M8 12h8M8 16h6"/>',flip:'<rect x="5" y="7" width="14" height="11" rx="2"/><path d="m9 7 1-3h4l1 3M2 10V5h5M22 15v5h-5M2 5a11 11 0 0 1 17-2M22 20a11 11 0 0 1-17 2"/><circle cx="12" cy="12.5" r="2.5"/>'
};
document.querySelectorAll('[data-icon]').forEach(e=>{e.innerHTML=`<svg aria-hidden="true" viewBox="0 0 24 24">${icons[e.dataset.icon]||''}</svg>`;});
const base=location.pathname.replace(/\/$/,'');
const entry=readEntryFragment(location.hash);let invitation=entry.invitation;
const alertTestEntry=new URLSearchParams(location.hash.slice(1)).get('alert-test');
let ownerSetup=entry.setupCode;
const ownerName=entry.name;entry.setupCode=null;
// Retain only an iPhone invitation fragment for its Home Screen handoff; never an owner code.
clearEntryFragment(location,history,!!invitation&&phonePlatform().needsHomeScreen);
let device,config,selected,ws,wsReady=false,connecting=false,reconnectTimer,reconnectAttempt=0,heartbeat,phone,call,callTicker,wakeLock,soundContext,ringTimer,toastTimer;let ringNodes=new Set();
let deletedMessages=new Map(),typingPeers=new Map(),typingSeen=new Map(),typingTimer,typingSent=0,typingPeerId,typingChain=Promise.resolve(),chosenMessage,viewerMessage,draft;
let messages=new Map(),unread=new Map(),seenSignals=new Set(),pendingCandidates=new Map(),settings={timers:{}},transfer;
try{settings={...settings,...JSON.parse(localStorage.getItem('webcaller-settings')||'{}')};}catch{}
delete settings.mode; // Retire saved manual modes; connection management is always Automatic.
const preference=()=> 'auto';
const timerFor=id=>Number(settings.timers[id]||86400);
const duration=s=>s<60?`${Math.ceil(s)} seconds`:s<3600?`${Math.ceil(s/60)} minutes`:s<86400?`${Math.ceil(s/3600)} hour${Math.ceil(s/3600)===1?'':'s'}`:s===86400?'24 hours':'7 days';
const initials=name=>name.trim().split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase();
function toast(text){$('toast').textContent=text;$('toast').classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),6000);}
function saveSettings(){localStorage.setItem('webcaller-settings',JSON.stringify(settings));if(selected)$('expiry-label').textContent=`Your messages disappear after ${duration(timerFor(selected.id))}`;}
async function api(path,method='GET',data,signal){
  const headers={};if(device?.token)headers.Authorization=`Bearer ${device.token}`;if(data)headers['Content-Type']='application/json';
  const timeout=AbortSignal.timeout(20000);
  const r=await fetch(`${base}/api${path}`,{method,headers,body:data?JSON.stringify(data):undefined,cache:'no-store',signal:signal?AbortSignal.any([timeout,signal]):timeout});
  const b=await r.json();if(!r.ok)throw new Error(b.error||'Request failed');return b;
}
const alerts=callSetup({api,config:()=>config,device:()=>device,save:()=>vault('put',device),toast});
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
  stopTyping();closeViewer();captures.close();$('draft-dialog').close();$('message-input').value='';updateComposer();selected=c;unread.delete(c.id);renderContacts();$('empty').classList.add('hidden');$('conversation').classList.remove('hidden');document.querySelector('.app').classList.add('chat-open');
  $('peer-name').textContent=c.name;$('peer-avatar').textContent=initials(c.name);$('expiry-label').textContent=`Your messages disappear after ${duration(timerFor(c.id))}`;renderMessages();
}
function renderMessages(){
  if(!selected)return;
  const list=[...messages.values()].filter(m=>m.expiresAt>Date.now()&&[m.from,m.to].includes(selected.id)).sort((a,b)=>a.createdAt-b.createdAt);
  drawMessages({container:$('messages'),list,self:device.user.id,options:messageOptions,openMedia:openViewer,load:loadAttachment,save:saveAttachment});
  renderTyping();queueMicrotask(pumpMedia);
}
function messageOptions(m){if(m.expiresAt<=Date.now())return;chosenMessage=m;$('message-dialog').showModal();}
function rememberDeletion(id,expires){
  if(typeof id!=='string'||!Number.isSafeInteger(expires))return;
  deletedMessages.set(id,expires);const m=messages.get(id);
  if(transfer?.messageId===id)transfer.controller.abort();if(viewerMessage?.id===id)closeViewer();
  if(m){clearMessage(m);messages.delete(id);if(selected)renderMessages();}
}
function renderTyping(){
  const active=selected&&document.visibilityState==='visible'&&typingPeers.get(selected.id)>Date.now();
  $('typing-status').classList.toggle('hidden',!active);$('typing-label').textContent=active?`${selected.name} is typing`:'';
}
async function sendTyping(peer,active){
  typingChain=typingChain.then(async()=>{
    if(!peer||!device||!wsReady||ws?.readyState!==1)return;
    const envelope=await seal(device.identity,device.user.id,peer,{kind:'typing',active},8);if(wsReady&&ws?.readyState===1)ws.send(JSON.stringify({type:'typing',envelope}));
  }).catch(()=>{});return typingChain;
}
function stopTyping(){
  clearTimeout(typingTimer);if(typingPeerId){const peer=device?.contacts?.find(c=>c.id===typingPeerId);void sendTyping(peer,false);}typingPeerId=null;typingSent=0;
}
function inputTyping(){
  updateComposer();if(!selected||!$('message-input').value.trim())return stopTyping();
  const now=Date.now();if(typingPeerId!==selected.id||now-typingSent>=3000){typingPeerId=selected.id;typingSent=now;void sendTyping(selected,true);}
  clearTimeout(typingTimer);typingTimer=setTimeout(stopTyping,4500);
}
async function receiveTyping(envelope){
  if(envelope.expiresAt<=Date.now()||typingSeen.has(envelope.id))return;
  const peer=device.contacts.find(c=>c.id===envelope.from);if(!peer)return;
  const payload=await open(device.identity,device.user.id,peer,envelope);
  if(payload.kind!=='typing'||typeof payload.active!=='boolean')return;
  typingSeen.set(envelope.id,envelope.expiresAt);
  if(payload.active)typingPeers.set(peer.id,Math.min(envelope.expiresAt,Date.now()+8000));else typingPeers.delete(peer.id);renderTyping();
}
function updateComposer(){
  const hasText=!!$('message-input').value.trim();$('send').classList.toggle('hidden',!hasText);$('attach').classList.toggle('hidden',hasText);
  const input=$('message-input');input.style.height='auto';input.style.height=Math.max(42,Math.min(132,input.scrollHeight))+'px';input.style.overflowY=input.scrollHeight>132?'auto':'hidden';
}
function pumpMedia(){
  if(!device||!selected||call||transfer||document.visibilityState!=='visible')return;
  const bounds=$('messages').getBoundingClientRect();
  if(bounds.height<=0)return;
  const m=[...messages.values()].find(m=>{
    if(!m.attachment||mediaKind(m.attachment.type)==='file'||![m.from,m.to].includes(selected.id)||m.expiresAt<=Date.now()||m.blobURL||m.loading||m.loadError)return false;
    const row=[...$('messages').children].find(e=>e.dataset.key===m.id),rect=row?.getBoundingClientRect();
    return rect&&rect.bottom>=bounds.top-150&&rect.top<=bounds.bottom+150;
  });
  if(m)void loadAttachment(m,true);
}
async function acceptMessage(envelope,hydrating=false){
  if(document.visibilityState==='hidden')return; // Resync ciphertext when visible; do not rebuild hidden plaintext.
  if(messages.has(envelope.id)||deletedMessages.has(envelope.id)||envelope.expiresAt<=Date.now())return;
  const peerId=envelope.from===device.user.id?envelope.to:envelope.from;
  let peer=device.contacts.find(c=>c.id===peerId);
  if(!peer&&!hydrating){await pinContacts((await api('/me')).contacts);peer=device.contacts.find(c=>c.id===peerId);}if(!peer)return;
  const payload=await open(device.identity,device.user.id,peer,envelope);
  if(payload.kind==='text'&&(typeof payload.text!=='string'||payload.text.length>4000))return;
  if(payload.kind==='attachment'&&(!validAttachment(payload.attachment)||(payload.text!==undefined&&(typeof payload.text!=='string'||payload.text.length>4000))))return;
  if(!['text','attachment'].includes(payload.kind))return;
  if(deletedMessages.has(envelope.id)||messages.has(envelope.id)||envelope.expiresAt<=Date.now())return;
  messages.set(envelope.id,{id:envelope.id,from:envelope.from,to:envelope.to,createdAt:envelope.createdAt,expiresAt:envelope.expiresAt,text:payload.text||'',attachment:payload.attachment});
  if(!hydrating&&envelope.from!==device.user.id&&selected?.id!==peer.id)unread.set(peer.id,(unread.get(peer.id)||0)+1);
  if(selected?.id===peer.id)renderMessages();renderContacts();
}
function beginTransfer(label,automatic=false){
  if(call){if(!automatic)toast('Send or open files after the call to keep your audio clear.');return null;}
  if(transfer){if(!automatic)toast('Wait for the current file transfer to finish.');return null;}
  const state={controller:new AbortController(),label};transfer=state;$('attach').disabled=true;$('attachment-progress').classList.remove('hidden');$('attachment-progress').textContent=label;return state;
}
function transferProgress(state,index,total){if(transfer===state)$('attachment-progress').textContent=`${state.label} · ${Math.round(index/total*100)}%`;}
function endTransfer(state){if(transfer===state){transfer=null;$('attach').disabled=false;$('attachment-progress').classList.add('hidden');queueMicrotask(pumpMedia);}}
function stopTransferForCall(){if(transfer){transfer.controller.abort();toast('File transfer stopped to keep your call clear. Try again after the call.');}}
async function chunkRequest(path,method,state,data){
  const res=await fetch(`${base}/api${path}`,{method,headers:{Authorization:`Bearer ${device.token}`,...(data?{'Content-Type':'application/octet-stream'}:{})},body:data,cache:'no-store',signal:AbortSignal.any([state.controller.signal,AbortSignal.timeout(120000)])});
  if(!res.ok){const error=await res.json();throw new Error(error.error||'File transfer failed');}return res;
}
async function sendFile(file,text=''){
  if(!file||!selected)return;const peer=selected;
  let a;try{a=newAttachment(file);}catch(e){return toast(e.message);}
  const state=beginTransfer(`Sending ${a.name} to ${peer.name}`);if(!state)return;
  let committed=false;
  try{
    const envelope=await seal(device.identity,device.user.id,peer,{kind:'attachment',attachment:a,text},timerFor(peer.id)),key=await attachmentKey(a);state.messageId=envelope.id;
    await api('/attachments','POST',{id:a.id,size:a.size,envelope},state.controller.signal);
    for(let index=0;index<a.chunks;index++){
      state.controller.signal.throwIfAborted();
      const bytes=new Uint8Array(await file.slice(index*CHUNK_SIZE,(index+1)*CHUNK_SIZE).arrayBuffer());
      const cipher=await encryptChunk(key,a,index,envelope.expiresAt,bytes);bytes.fill(0);
      await chunkRequest(`/attachments/${a.id}/chunks/${index}`,'PUT',state,cipher);transferProgress(state,index+1,a.chunks);
    }
    await api('/messages','POST',envelope,state.controller.signal);committed=true;
    await acceptMessage(envelope);const m=messages.get(envelope.id);
    if(m&&document.visibilityState==='visible'&&!state.controller.signal.aborted){m.blobURL=URL.createObjectURL(file);if(selected?.id===peer.id)renderMessages();}
    toast('File sent. It uses this chat’s disappearing timer.');
  }catch(e){if(e.name!=='AbortError')toast(e.message);}
  finally{if(!committed)void api(`/attachments/${a.id}`,'DELETE').catch(()=>{});endTransfer(state);}
}
function saveAttachment(m){
  if(!m.attachment||m.expiresAt<=Date.now()||!m.blobURL)return toast('This file has expired.');
  const link=document.createElement('a');link.href=m.blobURL;link.download=m.attachment.name.replace(/[\/\\\x00-\x1f]/g,'_');link.click();
}
async function loadAttachment(m,automatic=false){
  if(!m.attachment||m.expiresAt<=Date.now()||messages.get(m.id)!==m)return;
  if(m.blobURL)return mediaKind(m.attachment.type)==='file'?saveAttachment(m):openViewer(m);
  const a=m.attachment,state=beginTransfer(`Loading ${a.name}`,automatic);if(!state)return;
  state.messageId=m.id;m.loading=true;m.loadError=null;renderMessages();const pieces=[];
  try{
    const key=await attachmentKey(a);
    for(let index=0;index<a.chunks;index++){
      const response=await chunkRequest(`/attachments/${a.id}/chunks/${index}`,'GET',state);
      pieces.push(new Uint8Array(await decryptChunk(key,a,index,m.expiresAt,await response.arrayBuffer())));transferProgress(state,index+1,a.chunks);
    }
    state.controller.signal.throwIfAborted();
    if(m.expiresAt<=Date.now()||messages.get(m.id)!==m)throw new Error('This file has expired or was deleted.');
    const blob=new Blob(pieces,{type:mediaKind(a.type)==='file'?'application/octet-stream':a.type});m.blobURL=URL.createObjectURL(blob);
    if(!automatic){if(mediaKind(a.type)==='file')saveAttachment(m);else openViewer(m);}
  }catch(e){if(e.name!=='AbortError'){m.loadError=e.message;if(!automatic)toast(e.message);}}
  finally{for(const piece of pieces)piece.fill(0);m.loading=false;endTransfer(state);if(selected&&[m.from,m.to].includes(selected.id))renderMessages();}
}
function closeViewer(){
  for(const media of $('media-content').querySelectorAll('audio,video')){media.pause();media.removeAttribute('src');media.load();}
  $('media-content').replaceChildren();viewerMessage=null;if($('media-viewer').open)$('media-viewer').close();
}
function openViewer(m){
  if(!m.blobURL||!m.attachment||m.expiresAt<=Date.now()||messages.get(m.id)!==m)return;
  closeViewer();viewerMessage=m;const kind=mediaKind(m.attachment.type),media=document.createElement(kind==='image'?'img':kind==='video'?'video':'audio');
  media.src=m.blobURL;if(kind==='image')media.alt=m.attachment.name;else{media.controls=true;media.playsInline=true;}
  media.onerror=()=>{$('media-error').textContent='This browser cannot play this format. Use Save media to open a copy.';};
  $('media-title').textContent=m.attachment.name;$('media-error').textContent='';$('media-content').append(media);$('media-viewer').showModal();
  if(kind!=='image')void media.play().catch(()=>{});
}
function clearDraft(){
  if(draft?.url)URL.revokeObjectURL(draft.url);draft=null;
  for(const media of $('draft-preview').querySelectorAll('audio,video')){media.pause();media.removeAttribute('src');media.load();}
  $('draft-preview').replaceChildren();$('draft-caption').value='';
}
function previewFile(file){
  if(!file||!selected)return;
  if(call||transfer)return toast('Finish the call or file transfer first.');
  try{newAttachment(file);}catch(e){return toast(e.message);}
  clearDraft();draft={file,peer:selected.id,url:URL.createObjectURL(file)};const kind=mediaKind(file.type);
  if(kind!=='file'){const media=document.createElement(kind==='image'?'img':kind==='video'?'video':'audio');media.src=draft.url;if(kind==='image')media.alt=file.name;else{media.controls=true;media.playsInline=true;}$('draft-preview').append(media);}
  $('draft-name').textContent=`${file.name} · ${fileSize(file.size)}`;$('draft-dialog').showModal();
}
const captures=chatCapture({busy:()=>!!(call||transfer),onFile:previewFile,toast});
$('close-media').onclick=closeViewer;$('media-viewer').addEventListener('close',closeViewer);$('save-media').onclick=()=>viewerMessage&&saveAttachment(viewerMessage);
$('draft-dialog').addEventListener('close',clearDraft);
$('draft-form').onsubmit=e=>{e.preventDefault();if(!draft||draft.peer!==selected?.id)return;const file=draft.file,text=$('draft-caption').value.trim();clearDraft();$('draft-dialog').close();void sendFile(file,text);};
$('delete-message').onclick=async()=>{
  const m=chosenMessage;if(!m)return;$('delete-message').disabled=true;
  try{await api(`/messages/${m.id}`,'DELETE');rememberDeletion(m.id,m.expiresAt);$('message-dialog').close();}catch(e){toast(e.message);}finally{$('delete-message').disabled=false;chosenMessage=null;}
};
async function sync(){
  const me=await api('/me');await pinContacts(me.contacts);
  for(const d of await api('/message-deletions'))rememberDeletion(d.id,d.expires);
  const saved=await api('/messages');
  for(const e of saved)try{await acceptMessage(e,true);}catch{toast('An encrypted message could not be verified.');}
  if(selected)renderMessages();
}
async function connect(){
  clearTimeout(reconnectTimer);if(!device?.token||connecting||ws?.readyState===0||ws?.readyState===1)return;connecting=true;
  try{
    const ticket=await api('/ticket','POST',{});
    ws=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}${base}/ws`);
    ws.onopen=()=>ws.send(JSON.stringify({type:'auth',ticket:ticket.ticket}));
    ws.onmessage=async event=>{try{
      const b=JSON.parse(event.data);
      if(b.type==='ready'){connected(true);reconnectAttempt=0;await sync();if(phone)await phone.restart();clearInterval(heartbeat);heartbeat=setInterval(()=>{if(wsReady&&ws.readyState===1)ws.send(JSON.stringify({type:'ping'}));},25000);}
      else if(b.type==='message')await acceptMessage(b.envelope);
      else if(b.type==='message-deleted')rememberDeletion(b.id,b.expires);
      else if(b.type==='typing')await receiveTyping(b.envelope);
      else if(b.type==='contacts')await sync();
      else if(b.type==='signal')await receiveSignal(b);
      else if(b.type==='busy'&&b.callId===call?.id)finishCall('They’re on another call. Try again later.');
      else if(b.type==='call-ended'&&b.callId===call?.id)finishCall(b.reason||'Call ended');
      else if(b.type==='call-expired'&&b.callId===call?.id)finishCall('No answer. Try again later.');
      else if(b.type==='error')toast(b.error);
    }catch(e){if(e.message!=='Expired')toast('A private update could not be verified.');}};
    ws.onerror=()=>{};ws.onclose=()=>{connected(false);clearInterval(heartbeat);scheduleReconnect();};
  }catch{connected(false);scheduleReconnect();}finally{connecting=false;}
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
  try{
    soundContext ||= new AC();
    const status=()=>{$('ringing-status').textContent=soundContext.state==='running'?'Ringing is on while this page is active.':'Ringing is on. Tap anywhere to activate browser sound.';};
    soundContext.onstatechange=status;void soundContext.resume().then(status).catch(status);status();
  }catch{}
}
function ring(){
  stopRing();const burst=()=>{
    const audible=soundContext?.state==='running';$('hear-ringing').classList.toggle('hidden',audible);
    if(!audible)return;
    // Two smooth, dual-tone bursts followed by a pause: a recognisable phone cadence.
    for(const delay of [0,.65])for(const frequency of [440,480]){
      const oscillator=soundContext.createOscillator(),gain=soundContext.createGain(),start=soundContext.currentTime+delay;
      oscillator.frequency.value=frequency;gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.07,start+.025);gain.gain.setValueAtTime(.07,start+.4);gain.gain.linearRampToValueAtTime(0,start+.45);
      oscillator.connect(gain).connect(soundContext.destination);ringNodes.add(oscillator);oscillator.onended=()=>{ringNodes.delete(oscillator);oscillator.disconnect();gain.disconnect();};oscillator.start(start);oscillator.stop(start+.46);
    }
    if(document.visibilityState==='visible')navigator.vibrate?.([450,200,450]);
  };burst();ringTimer=setInterval(burst,3000);
}
function stopRing(){for(const oscillator of ringNodes){try{oscillator.stop();}catch{}}ringNodes.clear();clearInterval(ringTimer);ringTimer=null;$('hear-ringing').classList.add('hidden');navigator.vibrate?.(0);}
function showCall(incoming=false){
  alerts.close();$('settings-dialog').close();stopTransferForCall();stopTyping();captures.close();closeViewer();$('draft-dialog').close();$('emoji-dialog').close();
  $('call-screen').classList.remove('hidden');$('call-screen').classList.remove('has-video');$('call-name').textContent=call.peer.name;$('call-avatar').textContent=initials(call.peer.name);
  $('call-screen').classList.remove('call-connected','has-remote-video');$('call-peer-top').textContent=call.peer.name;$('switch-camera').classList.add('hidden');
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
  if(update.state)$('call-screen').classList.toggle('call-connected',update.state==='connected');
  if(update.connected)$('call-screen').classList.add('call-connected');
  if(update.remoteVideo!==undefined)call.remoteVideo=update.remoteVideo;
  if(update.localVideo!==undefined||update.remoteVideo!==undefined)videoLayout();
  if(update.cameraFacing){$('local-media').dataset.facing=update.cameraFacing;$('switch-camera').ariaLabel=update.cameraFacing==='environment'?'Switch to front camera':'Switch to back camera';}
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
  else if(b.kind==='video'){call.remoteVideo=!!payload.enabled;videoLayout();}
}
async function answerCall(){
  unlockSound();if(!call||!call.offer)return;stopRing();$('incoming-actions').classList.add('hidden');$('active-actions').classList.remove('hidden');$('call-status').textContent='Connecting…';
  const id=call.id;
  try{await createPhone(call.video,false);if(call?.id!==id)return;await phone.receive(call.offer);await signal('answer',{description:await phone.description('answer')});navigator.serviceWorker?.controller?.postMessage({type:'call-ended',callId:id});await phone.replayCandidates();clearTimeout(call.timeout);}
  catch(e){if(call?.id===id)await endCall(e.name==='NotAllowedError'?'Allow microphone access to answer.':e.message);}
}
function finishCall(reason='Call ended'){
  if(call){clearTimeout(call.timeout);navigator.serviceWorker?.controller?.postMessage({type:'call-ended',callId:call.id});}stopRing();clearInterval(callTicker);phone?.close();phone=null;call=null;pendingCandidates.clear();wakeLock?.release().catch(()=>{});wakeLock=null;
  $('call-screen').classList.add('hidden');queueMicrotask(pumpMedia);if(reason)toast(reason);
}
async function endCall(reason='Call ended'){try{await signal('hangup',{reason});}catch{}finishCall(reason);}
function invite(){
  if(!device)return;$('invite-name').value='';$('invite-result').classList.add('hidden');$('invite-form').classList.remove('hidden');$('invite-dialog').showModal();$('invite-name').focus();
}
$('invite-form').onsubmit=async event=>{
  event.preventDefault();$('create-invite').disabled=true;
  try{const result=await api('/invite','POST',{name:$('invite-name').value.trim()});$('invite-link').value=result.url;$('invite-form').classList.add('hidden');$('invite-result').classList.remove('hidden');}
  catch(e){toast(e.message);}finally{$('create-invite').disabled=false;}
};
async function settingsDialog(){
  $('message-timer').value=timerFor(selected?.id||'default');$('message-timer').disabled=!selected;
  $('settings-dialog').showModal();
}
async function boot(){
  try{
    if(!window.isSecureContext||!crypto.subtle)throw new Error('Open this phone over HTTPS to use secure calls.');
    [config,device]=await Promise.all([api('/config'),vault('get')]);
    if(device)ownerSetup=null;
    if(invitation&&(device?.homeInviteStamp===await fingerprint(invitation)||device?.acceptedInvites?.includes(await fingerprint(invitation)))){invitation=null;clearEntryFragment(location,history);}
    if(invitation||!device){
      if(invitation){
        const [token,fp]=invitation.split('.');
        $('setup-label').classList.add('hidden');$('join-button').firstChild.textContent='Accept invitation';
        $('welcome-title').textContent='You’re invited. Say hello.';
        try{const info=await api('/invite-info','POST',{invite:token,fingerprint:fp});$('welcome-title').textContent=info.from+' invited you';$('name-input').value=info.name||'';}catch(e){$('welcome-error').textContent=e.message;$('join-button').disabled=true;}
        $('welcome-text').textContent='Accept to connect, then we’ll help your phone make a sound when someone calls. Your name is optional.';
        if(phonePlatform().needsHomeScreen){$('join-button').firstChild.textContent='Continue';$('welcome-text').textContent='One small setup step will let your iPhone hear call alerts when it is closed. Tap Continue and we’ll guide you.';}
      }
      else if(!config.bootstrap){ownerSetup=null;$('welcome-title').textContent='A place for your people.';$('welcome-text').textContent='Open an invitation from someone you know. If you just added this phone to your Home Screen, paste that invitation here.';$('name-label').classList.add('hidden');$('setup-label').classList.add('hidden');$('join-button').classList.add('hidden');$('paste-invitation').classList.remove('hidden');}
      else if(ownerSetup){$('name-input').value=ownerName;$('setup-code').value=ownerSetup;$('setup-label').classList.add('hidden');$('welcome-text').textContent='Your private setup link is ready. Choose your name and set up this phone.';$('join-button').firstChild.textContent='Set up this phone';}
      $('welcome-dialog').showModal();
      if(!device)return;
    }
    await ready();if(!invitation)alerts.resume(alertTestEntry);
  }catch(e){toast(e.message);$('connection').textContent='Unable to connect';}
}
async function ready(){
  $('self-name').textContent=device.user.name;$('self-avatar').textContent=initials(device.user.name);renderContacts();await connect();
  if(navigator.serviceWorker&&(!phonePlatform().ios||phonePlatform().standalone))void registerAlerts().catch(()=>{});
}
$('welcome-form').onsubmit=async event=>{
  event.preventDefault();unlockSound();if(invitation&&phonePlatform().needsHomeScreen){await alerts.show();return;}$('join-button').disabled=true;$('welcome-error').textContent='';
  try{
    if(!invitation&&!$('setup-code').value.trim())throw new Error('Use your private setup QR code or paste the owner setup code first.');
    const identity=device?.identity||await newIdentity();const name=$('name-input').value.trim()||'Guest';
    let result;
    if(invitation){
      const [token,fp]=invitation.split('.');result=await api('/join','POST',{name,keys:identity.keys,invite:token,fingerprint:fp});
      if(!result.contact||await fingerprint(result.contact.keys)!==fp)throw new Error('The invitation identity changed. Ask for a new link through a trusted channel.');
    }
    else result=await api('/register','POST',{name,keys:identity.keys,setupCode:$('setup-code').value.trim()});
    const acceptedInvites=[...(device?.acceptedInvites||[])];if(invitation)acceptedInvites.push(await fingerprint(invitation));
    const wasInvitation=!!invitation,homeInviteStamp=device?.homeInviteStamp||(!device&&phonePlatform().standalone&&invitation?await fingerprint(invitation):null);device={...device,identity,token:result.token||device?.token,user:result.user,contacts:result.contacts,pins:device?.pins||{},acceptedInvites:acceptedInvites.slice(-20),homeInviteStamp};await pinContacts(result.contacts);ownerSetup=null;invitation=null;clearEntryFragment(location,history);$('setup-code').value='';$('welcome-dialog').close();await ready();if(result.contact)selectContact(result.contact);if(wasInvitation)await alerts.show();
  }catch(e){$('welcome-error').textContent=e.message;}finally{$('join-button').disabled=false;}
};
$('welcome-dialog').addEventListener('cancel',e=>e.preventDefault());
$('invite').onclick=invite;$('empty-invite').onclick=invite;$('settings').onclick=settingsDialog;$('chat-settings').onclick=settingsDialog;
$('call-settings').onclick=settingsDialog;
$('search').oninput=renderContacts;
$('back').onclick=()=>{stopTyping();closeViewer();captures.close();document.querySelector('.app').classList.remove('chat-open');};
document.querySelectorAll('[data-close]').forEach(e=>e.onclick=()=>e.closest('dialog').close());
$('copy-invite').onclick=async()=>{try{await navigator.clipboard.writeText($('invite-link').value);toast('Invitation copied.');}catch{$('invite-link').select();toast('Select and copy the invitation link.');}};
$('share-invite').onclick=async()=>{try{if(navigator.share)await navigator.share({title:'Talk with me on WebCaller',url:$('invite-link').value});else $('copy-invite').click();}catch(e){if(e.name!=='AbortError')toast(e.message);}};
$('composer').onsubmit=async event=>{
  event.preventDefault();unlockSound();const input=$('message-input'),text=input.value.trim();if(!text||!selected)return;const peer=selected,original=input.value;stopTyping();$('send').disabled=true;
  try{const envelope=await seal(device.identity,device.user.id,peer,{kind:'text',text},timerFor(peer.id));await api('/messages','POST',envelope);await acceptMessage(envelope);if(input.value===original)input.value='';updateComposer();$('messages').scrollTop=$('messages').scrollHeight;}catch(e){toast(e.message);}finally{$('send').disabled=false;}
};
$('attach').onclick=()=>{if(selected&&!call)$('attachment-dialog').showModal();else if(call)toast('Send files after the call to keep your audio clear.');};
for(const [button,input]of [['choose-photo','photo-input'],['choose-file','file-input']]){
  $(button).onclick=()=>{$('attachment-dialog').close();$(input).click();};
  $(input).onchange=()=>{const file=$(input).files[0];$(input).value='';previewFile(file);};
}
$('camera-input').onchange=()=>{const file=$('camera-input').files[0];$('camera-input').value='';previewFile(file);};
$('chat-camera').onclick=captures.camera;$('record-voice').onclick=captures.voice;
$('emoji').onclick=emojiPicker({input:$('message-input'),changed:inputTyping,toast});
$('message-input').oninput=inputTyping;$('message-input').onblur=stopTyping;
$('messages').addEventListener('scroll',()=>queueMicrotask(pumpMedia),{passive:true});
$('message-input').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('composer').requestSubmit();}};
$('message-timer').onchange=()=>{if(selected){settings.timers[selected.id]=Number($('message-timer').value);saveSettings();}};
$('peer-details').onclick=async()=>{if(!selected)return;$('safety-number').textContent=await safetyNumber(device.identity.keys,selected.keys);$('safety-dialog').showModal();};
$('voice').onclick=()=>startCall(false);$('video').onclick=()=>startCall(true);$('answer').onclick=answerCall;$('decline').onclick=()=>endCall('Call declined');$('end-call').onclick=()=>endCall();
$('mute').onclick=()=>{if(phone){const muted=phone.mute();$('mute').classList.toggle('selected',muted);$('mute').ariaLabel=muted?'Unmute microphone':'Mute microphone';}};
function videoLayout(){
  const local=!!phone?.videoWanted,remote=!!call?.remoteVideo;
  $('call-screen').classList.toggle('has-video',local||remote);$('call-screen').classList.toggle('has-remote-video',remote);
  $('toggle-video').classList.toggle('selected',local);$('switch-camera').classList.toggle('hidden',!local);
}
$('toggle-video').onclick=async()=>{if(!phone)return;try{await phone.toggleVideo();videoLayout();}catch(e){toast(e.name==='NotAllowedError'?'Allow camera access to use video.':e.message);}};
$('switch-camera').onclick=async()=>{if(!phone)return;$('switch-camera').disabled=true;try{await phone.switchCamera();}catch(e){toast(e.name==='OverconstrainedError'?'No other camera is available.':e.name==='NotAllowedError'?'Allow camera access to switch cameras.':e.message);}finally{$('switch-camera').disabled=false;videoLayout();}};
$('remote-media').addEventListener('resize',()=>{if(call&&$('remote-media').videoWidth>0){call.remoteVideo=$('remote-media').srcObject?.getVideoTracks().some(t=>!t.muted&&t.readyState==='live');videoLayout();}});
$('play-audio').onclick=()=>{$('remote-media').play().then(()=>$('play-audio').classList.add('hidden')).catch(()=>toast('Audio playback is blocked by your browser.'));};
document.addEventListener('pointerdown',unlockSound,{capture:true,passive:true});document.addEventListener('keydown',unlockSound,{capture:true});
$('enable-notifications').onclick=()=>{$('settings-dialog').close();void alerts.show();};
$('hear-ringing').onclick=()=>{unlockSound();setTimeout(()=>{if(call?.offer&&!call.started)ring();},50);};
navigator.serviceWorker?.addEventListener('message',event=>{
  if(event.data?.type==='ringing-query')event.ports[0]?.postMessage({ringing:call?.id===event.data.callId&&!call.caller&&!call.started&&!!ringTimer&&soundContext?.state==='running'&&document.visibilityState==='visible'});
  if(event.data?.type==='alert-opened'){if(event.data.testId)alerts.resume(event.data.testId);if(device&&!wsReady)void connect();}
});
function openPastedInvitation(value){
  try{const url=new URL(value.trim()),params=new URLSearchParams(url.hash.slice(1)),raw=params.get('invite');
    if(url.origin!==location.origin||url.pathname.replace(/\/$/,'')!==base||!raw||!/^[A-Za-z0-9_-]{43}\.[a-f0-9]{64}$/.test(raw))throw new Error();
    location.href=url.href;
  }catch{$('welcome-error').textContent='Paste the full invitation link sent by the person you want to talk to.';}
}
$('paste-invite').onclick=async()=>{
  $('paste-link-label').classList.remove('hidden');$('open-pasted-invite').classList.remove('hidden');
  try{const text=await navigator.clipboard.readText();$('paste-link').value=text;if(text)openPastedInvitation(text);}catch{$('paste-link').focus();}
};
$('open-pasted-invite').onclick=()=>openPastedInvitation($('paste-link').value);
$('diagnostics').onclick=async()=>{
  $('diagnostics').disabled=true;$('diagnostic-result').textContent='Checking the relay…';
  try{const ice=await api('/ice');const result=await testRelay(ice);$('diagnostic-result').textContent=result.text;}catch(e){$('diagnostic-result').textContent=e.message;}finally{$('diagnostics').disabled=false;}
};
$('forget-device').onclick=()=>{$('settings-dialog').close();$('forget-dialog').showModal();};
$('confirm-forget').onclick=async()=>{
  try{await api('/device','DELETE');if(ws){ws.onclose=null;ws.close();}clearTimeout(reconnectTimer);clearInterval(heartbeat);finishCall('');await vault('delete');transfer?.controller.abort();for(const m of messages.values())clearMessage(m);messages.clear();localStorage.removeItem('webcaller-settings');device=null;location.reload();}catch(e){toast(e.message);}
};
function clearMessage(m){if(viewerMessage?.id===m.id)closeViewer();if(m.blobURL)URL.revokeObjectURL(m.blobURL);m.blobURL=null;m.text='';m.attachment=null;}
setInterval(()=>{for(const [id,expiry]of deletedMessages)if(expiry<=Date.now())deletedMessages.delete(id);for(const [id,expiry]of typingSeen)if(expiry<=Date.now())typingSeen.delete(id);renderTyping();let changed=false;for(const [id,m]of messages)if(m.expiresAt<=Date.now()){clearMessage(m);messages.delete(id);changed=true;}if(changed&&selected)renderMessages();},1000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&device){unlockSound();if(!wsReady)connect();else sync().catch(()=>{});if(call?.started)navigator.wakeLock?.request('screen').then(lock=>wakeLock=lock).catch(()=>{});}if(document.visibilityState==='hidden'){stopTyping();typingPeers.clear();renderTyping();captures.close();closeViewer();clearDraft();$('draft-dialog').close();$('emoji-dialog').close();transfer?.controller.abort();for(const m of messages.values())clearMessage(m);messages.clear();$('messages').replaceChildren();}});
window.addEventListener('online',()=>{if(device&&!wsReady)connect();});
navigator.connection?.addEventListener('change',()=>{if(phone)void phone.sample();});
window.addEventListener('pagehide',()=>{stopTyping();captures.close();closeViewer();clearDraft();phone?.close();transfer?.controller.abort();for(const m of messages.values())clearMessage(m);messages.clear();});
unlockSound();
void boot();
