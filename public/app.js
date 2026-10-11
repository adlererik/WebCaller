import {TRANSFER_PART_SIZE,transferPacer} from './transfer-policy.js';
import {contactPress} from './contact-press.js';
import { newIdentity, fingerprint, safetyNumber, seal, open, vault } from './crypto.js';
import { Phone, testRelay } from './media.js';
import {formatRate} from './call-metrics.js';
import {mediaCache} from './media-cache.js';
import {validLocation,mapsURL,locationText,locationSharing} from './location.js';
import {AudioOutput} from './audio-output.js';
import { readEntryFragment, clearEntryFragment } from './onboarding.js';
import {newAttachment,validAttachment,attachmentKey,encryptChunk,decryptChunk,CHUNK_SIZE,mediaKind,fileSize} from './attachments.js';
import {messageActions} from './message-actions.js';
import {applyMessageEvent,validMessageId} from './message-state.js';
import {drawMessages,emojiPicker} from './chat-ui.js';
import {chatCapture} from './chat-capture.js';
import {callSetup,phonePlatform,registerAlerts} from './call-setup.js';
const cachedMedia=mediaCache();let cacheWarning=false;
void cachedMedia.purge();setInterval(()=>void cachedMedia.purge(),60000);
async function keepMedia(owner,m,a,chunks){
  if(!await cachedMedia.put(owner,m,a,chunks)&&cachedMedia.lastError&&!cacheWarning){cacheWarning=true;toast('Your browser could not keep this file. Reopening may download it again.');}
}
const $=id=>document.getElementById(id);
const icons={
  reply:'<path d="m9 4-7 7 7 7v-5c6 0 10 2 13 7v-4C22 8 17 7 9 7Z"/>',edit:'<path d="m3 17 14-14 4 4-14 14-5 1ZM14 6l4 4"/>',forward:'<path d="m15 4 7 7-7 7v-5C9 13 5 15 2 20v-4c0-8 5-9 13-9Z"/>',check:'<circle cx="12" cy="12" r="9"/><path d="m7 12 3 3 7-7"/>',pin:'<path d="m15 3 6 6-4 1-3 5 1 3-3-1-4-4-1-3 3 1 5-3ZM10 14l-7 7"/>',trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  gallery:'<rect x="3" y="6" width="17" height="15" rx="3"/><path d="m6 6-1-3 15-1 2 15-2 1M3 17l5-5 4 4 3-3 5 5"/><circle cx="8" cy="10" r="1"/>',location:'<circle cx="12" cy="12" r="9"/><path d="m7 11 11-5-5 11-2-4Z"/>',speaker:'<path d="M3 9h4l5-5v16l-5-5H3ZM16 8a6 6 0 0 1 0 8M19 5a10 10 0 0 1 0 14"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 10v7M12 7h.01"/>',videoOff:'<path d="M3 3l18 18M3 7v12h12v-4M9 5h6v4l6-3v12l-3-1"/>',

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
let deletedMessages=new Map(),typingPeers=new Map(),typingSeen=new Map(),typingTimer,typingSent=0,typingPeerId,typingChain=Promise.resolve(),viewerMessage,draft;
let messages=new Map(),unread=new Map(),seenSignals=new Set(),pendingCandidates=new Map(),settings={timers:{}},transfer,contactToRemove,contactPressCleanup=[];
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
  const b=await r.json();if(!r.ok)throw Object.assign(new Error(b.error||'Request failed'),{status:r.status});return b;
}
const alerts=callSetup({api,config:()=>config,device:()=>device,save:()=>vault('put',device),toast});
function connected(ready){wsReady=ready;$('connection').textContent=ready?'Ready for conversations':'Reconnecting…';$('connection').classList.toggle('online',ready);}
async function pinContacts(contacts){
  const removed=(device.contacts||[]).filter(c=>!contacts.some(next=>next.id===c.id));
  for(const c of removed)clearContactHistory(c.id);
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
  contactPressCleanup.splice(0).forEach(dispose=>dispose());
  const el=$('contacts');el.replaceChildren();$('contact-count').textContent=device?.contacts?.length||0;
  const contacts=(device?.contacts||[]).filter(c=>c.name.toLowerCase().includes($('search').value.toLowerCase()));
  for(const c of contacts){
    const button=document.createElement('button');button.className='contact'+(selected?.id===c.id?' selected':'');button.dataset.contact=c.id;
    const avatar=document.createElement('div');avatar.className='avatar';avatar.textContent=initials(c.name);
    const text=document.createElement('div');text.className='contact-text';const name=document.createElement('strong');name.textContent=c.name;
    const preview=document.createElement('span');preview.textContent='Private conversation';text.append(name,preview);button.append(avatar,text);
    if(unread.get(c.id)){const badge=document.createElement('span');badge.className='unread';badge.textContent=unread.get(c.id);button.append(badge);}
    button.setAttribute('aria-haspopup','dialog');button.title='Press and hold, or right-click, for contact options';
    contactPressCleanup.push(contactPress(button,{activate:()=>selectContact(c),open:()=>showContactOptions(c)}));el.append(button);
  }
  if(!contacts.length){const p=document.createElement('p');p.className='no-contacts';p.textContent=$('search').value?'No people found.':'Your people will appear here.\nStart with an invitation.';el.append(p);}
}
function showContactOptions(c){
  if(!device.contacts.some(peer=>peer.id===c.id))return;
  contactToRemove=c;$('remove-contact-title').textContent=`Remove ${c.name}?`;$('remove-contact-error').textContent='';
  $('confirm-remove-contact').disabled=false;if(!$('remove-contact-dialog').open)$('remove-contact-dialog').showModal();
}
function clearContactHistory(id){
  if(transfer?.peerId===id)transfer.controller.abort();
  if(selected?.id===id){
    actions.reset();stopTyping();locationShare.close();$('attachment-dialog').close();closeViewer();captures.close();clearDraft();$('draft-dialog').close();$('emoji-dialog').close();
    $('message-input').value='';updateComposer();$('messages').replaceChildren();$('pinned-message').textContent='';$('pinned-message').onclick=null;$('pinned-message').classList.add('hidden');
    selected=null;$('conversation').classList.add('hidden');$('empty').classList.remove('hidden');document.querySelector('.app').classList.remove('chat-open');
  }
  if(call?.peer.id===id)finishCall('Contact removed.');
  for(const m of [...messages.values()])if([m.from,m.to].includes(id))rememberDeletion(m.id,m.expiresAt);
  unread.delete(id);typingPeers.delete(id);delete settings.timers[id];delete device.pins?.[id];saveSettings();
  if(contactToRemove?.id===id){contactToRemove=null;$('remove-contact-dialog').close();}
}
function selectContact(c){
  actions.reset();stopTyping();locationShare.close();$('attachment-dialog').close();closeViewer();captures.close();$('draft-dialog').close();$('message-input').value='';updateComposer();selected=c;unread.delete(c.id);renderContacts();$('empty').classList.add('hidden');$('conversation').classList.remove('hidden');document.querySelector('.app').classList.add('chat-open');
  $('peer-name').textContent=c.name;$('peer-avatar').textContent=initials(c.name);$('expiry-label').textContent=`Your messages disappear after ${duration(timerFor(c.id))}`;renderMessages();
}
function renderMessages(){
  if(!selected)return;
  const list=[...messages.values()].filter(m=>m.expiresAt>Date.now()&&[m.from,m.to].includes(selected.id)).sort((a,b)=>a.createdAt-b.createdAt);
  actions.changed();
  drawMessages({container:$('messages'),list,self:device.user.id,options:messageOptions,openMedia:openViewer,load:loadAttachment,save:saveAttachment,selection:actions.selection,select:actions.select,jump:jumpMessage});
  const pinned=list.filter(m=>m.pinned).sort((a,b)=>(b.pinVersion?.createdAt||0)-(a.pinVersion?.createdAt||0))[0];$('pinned-message').classList.toggle('hidden',!pinned);$('pinned-message').textContent=pinned?'📌 '+(pinned.text||pinned.attachment?.name||'Message'): "";$('pinned-message').onclick=()=>pinned&&jumpMessage(pinned.id);
  renderTyping();if($('attachment-dialog').open)renderRecent();queueMicrotask(pumpMedia);queueReceipts();
}
function messageOptions(m){actions.show(m);}
function jumpMessage(id){const row=[...$('messages').children].find(e=>e.dataset.key===id);if(row){row.scrollIntoView({block:'center',behavior:'smooth'});row.querySelector('.message')?.focus({preventScroll:true});}else toast('The original message has expired or was deleted.');}
function rememberDeletion(id,expires){
  if(typeof id!=='string'||!Number.isSafeInteger(expires))return;
  void cachedMedia.remove(device?.user.id,id,expires);deletedMessages.set(id,expires);receiptWanted.delete(id);visibleSince.delete(id);pendingMessageEvents.delete(id);const m=messages.get(id);
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
  if(!device||!selected||transfer||document.visibilityState!=='visible')return;
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
  if(payload.location!==undefined&&(payload.kind!=='attachment'||mediaKind(payload.attachment.type)!=='image'||!validLocation(payload.location)))return;
  if(document.visibilityState!=='visible'||!device.contacts.some(c=>c.id===peerId)||deletedMessages.has(envelope.id)||messages.has(envelope.id)||envelope.expiresAt<=Date.now())return;
  if(payload.replyTo!==undefined&&!validMessageId(payload.replyTo))return;
  messages.set(envelope.id,{id:envelope.id,from:envelope.from,to:envelope.to,createdAt:envelope.createdAt,expiresAt:envelope.expiresAt,text:payload.text||'',attachment:payload.attachment,location:payload.location,replyTo:payload.replyTo,forwarded:payload.forwarded===true,receivedLocally:envelope.from!==device.user.id?Math.max(envelope.createdAt,Date.now()):undefined});
  for(const update of pendingMessageEvents.get(envelope.id)||[])await acceptMessageEvent(update);pendingMessageEvents.delete(envelope.id);
  if(!hydrating&&envelope.from!==device.user.id&&selected?.id!==peer.id)unread.set(peer.id,(unread.get(peer.id)||0)+1);
  if(selected?.id===peer.id)renderMessages();renderContacts();
}
function beginTransfer(label,automatic=false){
  if(transfer){if(!automatic)toast('Wait for the current file transfer to finish.');return null;}
  const state={controller:new AbortController(),label};transfer=state;$('attach').disabled=true;$('attachment-progress').classList.remove('hidden');$('attachment-progress').textContent=label;return state;
}
function transferProgress(state,index,total){if(transfer===state)$('attachment-progress').textContent=`${state.label} · ${Math.round(index/total*100)}%`;}
function endTransfer(state){clearTimeout(state.expiryTimer);if(transfer===state){transfer=null;$('attach').disabled=false;$('attachment-progress').classList.add('hidden');queueMicrotask(pumpMedia);}}
const paceTransfer=transferPacer(()=>phone?{state:phone.pc?.connectionState,profile:phone.profile,mode:phone.mode(),stats:phone.stats}:call?{state:'connecting'}:null,waiting=>{
  if(transfer&&waiting)$('attachment-progress').textContent=transfer.label+' · Waiting for connection · voice first';
});
function transferExpiry(state,expires){state.expiryTimer=setTimeout(()=>state.controller.abort(new DOMException('This file has expired.','AbortError')),Math.max(1,expires-Date.now()));}
async function retryTransfer(state,request){
  for(let attempt=0;;attempt++){
    state.controller.signal.throwIfAborted();
    try{return await request();}catch(error){
      if(state.controller.signal.aborted||attempt>=7||error.status&&!([408,429,500,502,503,504].includes(error.status)))throw error;
      if(transfer===state)$('attachment-progress').textContent=state.label+' · Reconnecting…';
      await new Promise((resolve,reject)=>{
        const signal=state.controller.signal,done=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);},abort=()=>{done();reject(signal.reason);};
        const timer=setTimeout(()=>{done();resolve();},Math.min(16000,1000*2**attempt));signal.addEventListener('abort',abort,{once:true});
      });
    }
  }
}
async function chunkRequest(path,method,state,data){
  return retryTransfer(state,async()=>{
    const size=data?.byteLength||TRANSFER_PART_SIZE;await paceTransfer(size,state.controller.signal);
    const res=await fetch(`${base}/api${path}`,{method,priority:'low',headers:{Authorization:`Bearer ${device.token}`,...(data?{'Content-Type':'application/octet-stream'}:{})},body:data,cache:'no-store',signal:AbortSignal.any([state.controller.signal,AbortSignal.timeout(30000)])});
    if(!res.ok){const body=await res.json().catch(()=>({}));throw Object.assign(new Error(body.error||'File transfer failed'),{status:res.status});}
    // Finish receiving the body before starting another burst.
    return method==='GET'?new Uint8Array(await res.arrayBuffer()):await res.json();
  });
}
async function transferChunk(a,index,state,cipher){
  const path=`/attachments/${a.id}/chunks/${index}`,method=cipher?'PUT':'GET';
  if(!call){const result=await chunkRequest(path,method,state,cipher);return cipher?result:result.buffer;}
  const length=Math.min(CHUNK_SIZE,a.size-index*CHUNK_SIZE)+16,result=cipher?null:new Uint8Array(length),bytes=cipher?new Uint8Array(cipher):null;
  for(let offset=0;offset<length;offset+=TRANSFER_PART_SIZE){
    const part=Math.floor(offset/TRANSFER_PART_SIZE),data=bytes?.subarray(offset,offset+TRANSFER_PART_SIZE);
    const received=await chunkRequest(path+'/parts/'+part,method,state,data);
    if(result){if(received.length!==Math.min(TRANSFER_PART_SIZE,length-offset))throw new Error('Incomplete encrypted file part');result.set(received,offset);}
  }
  return result?.buffer;
}
async function sendFile(file,text='',sharedLocation,recipient=selected){
  if(sharedLocation&&!validLocation(sharedLocation))return toast('Invalid location.');
  if(!file||!recipient)return false;const peer=recipient;
  let a;try{a=newAttachment(file);}catch(e){return toast(e.message);}
  const state=beginTransfer(`Sending ${a.name} to ${peer.name}`);if(!state)return;state.peerId=peer.id;
  let committed=false;const chunks=[],owner=device.user.id;
  try{
    const envelope=await seal(device.identity,device.user.id,peer,{kind:'attachment',attachment:a,text,...(sharedLocation?{location:sharedLocation}:{})},timerFor(peer.id)),key=await attachmentKey(a);state.messageId=envelope.id;transferExpiry(state,envelope.expiresAt);
    await retryTransfer(state,()=>api('/attachments','POST',{id:a.id,size:a.size,envelope},state.controller.signal));
    for(let index=0;index<a.chunks;index++){
      state.controller.signal.throwIfAborted();
      const bytes=new Uint8Array(await file.slice(index*CHUNK_SIZE,(index+1)*CHUNK_SIZE).arrayBuffer());
      const cipher=await encryptChunk(key,a,index,envelope.expiresAt,bytes);bytes.fill(0);
      await transferChunk(a,index,state,cipher);chunks.push(cipher);transferProgress(state,index+1,a.chunks);
    }
    await retryTransfer(state,()=>api('/messages','POST',envelope,state.controller.signal));committed=true;
    if(!state.controller.signal.aborted)await keepMedia(owner,envelope,a,chunks);
    await acceptMessage(envelope);const m=messages.get(envelope.id);
    if(m&&document.visibilityState==='visible'&&!state.controller.signal.aborted){m.blob=file;m.blobURL=URL.createObjectURL(file);if(selected?.id===peer.id)renderMessages();}
    toast('File sent. It uses this chat’s disappearing timer.');return true;
  }catch(e){if(e.name!=='AbortError')toast(e.message);}
  finally{if(!committed)void api(`/attachments/${a.id}`,'DELETE').catch(()=>{});endTransfer(state);}
}
function saveAttachment(m){
  if(!m.attachment||m.expiresAt<=Date.now()||!m.blobURL)return toast('This file has expired.');
  const link=document.createElement('a');link.href=m.blobURL;link.download=m.attachment.name.replace(/[\/\\\x00-\x1f]/g,'_');link.click();
}
async function loadAttachment(m,automatic=false){
  if(!m.attachment||m.expiresAt<=Date.now()||messages.get(m.id)!==m)return;
  if(m.blobURL)return automatic?undefined:mediaKind(m.attachment.type)==='file'?saveAttachment(m):openViewer(m);
  const a=m.attachment,state=beginTransfer(`Loading ${a.name}`,automatic);if(!state)return;
  state.peerId=m.from===device.user.id?m.to:m.from;state.messageId=m.id;transferExpiry(state,m.expiresAt);m.loading=true;m.loadError=null;renderMessages();const pieces=[];
  try{
    const key=await attachmentKey(a),owner=device.user.id;
    let chunks=await cachedMedia.get(owner,m,a),local=!!chunks;
    // A damaged cache is authenticated before display, then fetched again once.
    for(let attempt=0;attempt<2;attempt++){
      const downloaded=[];
      try{
        for(let index=0;index<a.chunks;index++){
          state.controller.signal.throwIfAborted();
          const cipher=local?chunks[index]:await transferChunk(a,index,state);
          pieces.push(new Uint8Array(await decryptChunk(key,a,index,m.expiresAt,cipher)));downloaded.push(cipher);transferProgress(state,index+1,a.chunks);
        }
        state.controller.signal.throwIfAborted();
        if(messages.get(m.id)!==m||deletedMessages.has(m.id)||m.expiresAt<=Date.now())throw new Error('This file has expired or was deleted.');
        if(!local)await keepMedia(owner,m,a,downloaded);break;
      }catch(error){
        if(!local||error.name==='AbortError'||m.expiresAt<=Date.now()||messages.get(m.id)!==m)throw error;
        for(const piece of pieces)piece.fill(0);pieces.length=0;await cachedMedia.evict(owner,m.id);chunks=null;local=false;
      }
    }
    state.controller.signal.throwIfAborted();
    if(m.expiresAt<=Date.now()||messages.get(m.id)!==m)throw new Error('This file has expired or was deleted.');
    const blob=new Blob(pieces,{type:mediaKind(a.type)==='file'?'application/octet-stream':a.type});m.blob=blob;m.blobURL=URL.createObjectURL(blob);
    if(!automatic){if(mediaKind(a.type)==='file')saveAttachment(m);else openViewer(m);}
  }catch(e){if(e.name!=='AbortError'){m.loadError=e.message;if(!automatic)toast(e.message);}}
  finally{for(const piece of pieces)piece.fill(0);m.loading=false;endTransfer(state);if(selected&&[m.from,m.to].includes(selected.id))renderMessages();}
}
function closeViewer(){
  for(const media of $('media-content').querySelectorAll('audio,video')){media.pause();media.removeAttribute('src');media.load();}
  $('media-content').replaceChildren();$('media-error').replaceChildren();viewerMessage=null;if($('media-viewer').open)$('media-viewer').close();
}
function openViewer(m){
  if(!m.blobURL||!m.attachment||m.expiresAt<=Date.now()||messages.get(m.id)!==m)return;
  closeViewer();viewerMessage=m;const kind=mediaKind(m.attachment.type),media=document.createElement(kind==='image'?'img':kind==='video'?'video':'audio');
  media.src=m.blobURL;if(kind==='image')media.alt=m.attachment.name;else{media.controls=true;media.playsInline=true;}
  media.onerror=()=>{$('media-error').textContent='This browser cannot play this format. Use Save media to open a copy.';};
  $('media-title').textContent=m.location?(m.location.label||'Current location'):m.attachment.name;$('media-error').textContent='';$('media-content').append(media);if(m.location){const link=document.createElement('a');link.href=mapsURL(m.location);link.textContent='Open in Maps';link.target='_blank';link.rel='noopener noreferrer';$('media-error').append(link);}$('media-viewer').showModal();
  if(kind!=='image')void media.play().catch(()=>{});
}
function clearDraft(){
  if(draft?.url)URL.revokeObjectURL(draft.url);draft=null;
  for(const media of $('draft-preview').querySelectorAll('audio,video')){media.pause();media.removeAttribute('src');media.load();}
  $('draft-preview').replaceChildren();$('draft-caption').value='';
}
function previewFile(file){
  if(!file||!selected)return;
  if(transfer)return toast('Finish the current file transfer first.');
  try{newAttachment(file);}catch(e){return toast(e.message);}
  clearDraft();draft={file,peer:selected.id,url:URL.createObjectURL(file)};const kind=mediaKind(file.type);
  if(kind!=='file'){const media=document.createElement(kind==='image'?'img':kind==='video'?'video':'audio');media.src=draft.url;if(kind==='image')media.alt=file.name;else{media.controls=true;media.playsInline=true;}$('draft-preview').append(media);}
  $('draft-name').textContent=`${file.name} · ${fileSize(file.size)}`;$('draft-dialog').showModal();
}
const locationShare=locationSharing({peer:()=>selected,busy:()=>!!transfer,config:()=>config,onSend:(file,p)=>void sendFile(file,locationText(p),p)});
const captures=chatCapture({busy:()=>!!transfer,callStream:()=>phone?.stream,onFile:previewFile,toast});
$('close-media').onclick=closeViewer;$('media-viewer').addEventListener('close',closeViewer);$('save-media').onclick=()=>viewerMessage&&saveAttachment(viewerMessage);
$('draft-dialog').addEventListener('close',clearDraft);
$('draft-form').onsubmit=e=>{e.preventDefault();if(!draft||draft.peer!==selected?.id)return;const file=draft.file,text=$('draft-caption').value.trim();clearDraft();$('draft-dialog').close();void sendFile(file,text);};
const chooseEmoji=emojiPicker({input:$('message-input'),changed:inputTyping,toast});
const actions=messageActions({messages:()=>messages,self:()=>device?.user.id,contacts:()=>device?.contacts||[],peer:()=>selected,render:renderMessages,event:sendMessageEvent,sendText:sendTextTo,sendFile,load:loadAttachment,remove:async m=>{await api(`/messages/${m.id}`,'DELETE');rememberDeletion(m.id,m.expiresAt);},toast,emoji:chooseEmoji});
let eventChain=Promise.resolve(),receiptWanted=new Map(),visibleSince=new Map(),pendingMessageEvents=new Map(),receiptTimer,receiptsBusy=false,hydratingMessages=false;
async function acceptMessageEvent(update){
  if(document.visibilityState!=='visible'||!update?.envelope||!validMessageId(update.target))return;
  const m=messages.get(update.target);if(!m){if(!deletedMessages.has(update.target)&&update.envelope.expiresAt>Date.now()&&pendingMessageEvents.size<500){const pending=pendingMessageEvents.get(update.target)||[];if(pending.length<8)pending.push(update);pendingMessageEvents.set(update.target,pending);}return;}
  const e=update.envelope,peerId=e.from===device.user.id?e.to:e.from,peer=device.contacts.find(c=>c.id===peerId);if(!peer)return;
  const payload=await open(device.identity,device.user.id,peer,e);
  if(document.visibilityState!=='visible'||messages.get(m.id)!==m)return;
  if(applyMessageEvent(m,update,payload)){if(selected&&[m.from,m.to].includes(selected.id))renderMessages();}
}
async function eventEnvelope(m,kind,data){
  if(messages.get(m.id)!==m||m.expiresAt-Date.now()<300)throw new Error('Message expired or was deleted');
  const peer=device.contacts.find(c=>c.id===(m.from===device.user.id?m.to:m.from));if(!peer)throw new Error('Contact unavailable');
  const ttl=Math.floor((m.expiresAt-Date.now()-100)/1000*1000)/1000;
  const envelope=await seal(device.identity,device.user.id,peer,{kind:`message-${kind}`,target:m.id,...data},ttl);
  if(envelope.expiresAt>m.expiresAt)throw new Error('Try the update again');return {target:m.id,kind,envelope};
}
function sendMessageEvent(m,kind,data){
  const task=eventChain.catch(()=>{}).then(async()=>{const update=await eventEnvelope(m,kind,data);await api('/message-events','POST',{events:[update]});await acceptMessageEvent(update);});eventChain=task;return task;
}
function queueReceipts(){if(!hydratingMessages&&!receiptTimer&&document.visibilityState==='visible')receiptTimer=setTimeout(()=>{receiptTimer=null;void pumpReceipts();},350);}
async function pumpReceipts(){
  if(receiptsBusy||hydratingMessages||!device||document.visibilityState!=='visible')return;
  const now=Date.now(),bounds=$('messages').getBoundingClientRect(),openChat=selected&&!$('conversation').classList.contains('hidden')&&bounds.height>0&&$('call-screen').classList.contains('hidden')&&!document.querySelector('dialog[open]');
  const rows=new Map([...$('messages').children].map(e=>[e.dataset.key,e]));
  for(const m of messages.values()){
    if(m.from===device.user.id||m.expiresAt-now<300)continue;
    const wanted=receiptWanted.get(m.id)||{deliveredAt:m.receipt?.deliveredAt||m.receivedLocally||Math.max(m.createdAt,now)};
    const rect=rows.get(m.id)?.querySelector('.message')?.getBoundingClientRect(),visible=openChat&&m.from===selected.id&&rect&&Math.min(rect.bottom,bounds.bottom)>Math.max(rect.top,bounds.top)&&rect.right>bounds.left&&rect.left<bounds.right;
    if(visible){if(!visibleSince.has(m.id))visibleSince.set(m.id,now);if(now-visibleSince.get(m.id)>=300&&!m.receipt?.readAt)wanted.readAt ||=Math.max(wanted.deliveredAt,now);}else visibleSince.delete(m.id);
    if(!m.receipt?.deliveredAt||wanted.readAt&&!m.receipt.readAt)receiptWanted.set(m.id,wanted);else receiptWanted.delete(m.id);
  }
  receiptsBusy=true;const updates=[];for(const [id,wanted]of receiptWanted){const m=messages.get(id);if(!m||m.expiresAt-now<300){receiptWanted.delete(id);continue;}if(updates.length===20)break;try{updates.push(await eventEnvelope(m,wanted.readAt?'read':'receipt',wanted));}catch{receiptWanted.delete(id);}}
  if(!updates.length){receiptsBusy=false;return;}
  let failed=false;
  try{await api('/message-events','POST',{events:updates});for(const update of updates)await acceptMessageEvent(update);}catch{failed=true;}finally{receiptsBusy=false;}
  if(failed&&!receiptTimer&&document.visibilityState==='visible')receiptTimer=setTimeout(()=>{receiptTimer=null;void pumpReceipts();},3000);else queueReceipts();
}
async function sendTextTo(peer,text,extra={}){const envelope=await seal(device.identity,device.user.id,peer,{kind:'text',text,...extra},timerFor(peer.id));await api('/messages','POST',envelope);await acceptMessage(envelope);}
async function sync(){
  const me=await api('/me');await pinContacts(me.contacts);
  for(const d of await api('/message-deletions'))rememberDeletion(d.id,d.expires);
  hydratingMessages=true;
  try{const saved=await api('/messages');
  for(const e of saved)try{await acceptMessage(e,true);}catch{toast('An encrypted message could not be verified.');}
  for(const update of await api('/message-events'))try{await acceptMessageEvent(update);}catch{toast('A message update could not be verified.');}
  }finally{hydratingMessages=false;}
  if(selected)renderMessages();queueReceipts();
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
      else if(b.type==='message-event')await acceptMessageEvent(b);
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
  actions.reset();alerts.close();locationShare.close();$('attachment-dialog').close();$('audio-output-dialog').close();$('return-call').classList.add('hidden');$('settings-dialog').close();stopTyping();captures.close();closeViewer();$('draft-dialog').close();$('emoji-dialog').close();
  $('call-screen').classList.remove('hidden');$('call-screen').classList.remove('has-video');$('call-name').textContent=call.peer.name;$('call-avatar').textContent=initials(call.peer.name);
  $('call-screen').classList.remove('call-connected','has-remote-video');$('call-peer-top').textContent=call.peer.name;$('switch-camera').classList.add('hidden');
  $('call-status').textContent=incoming?(call.video?'Incoming video call':'Incoming voice call'):'Calling…';$('call-duration').textContent='';for(const id of ['call-rate','call-audio-codec','call-video-codec']){$(id).textContent='';$(id).classList.add('hidden');} $('call-quality').textContent='Voice first';$('call-warning').textContent='';
  $('incoming-actions').classList.toggle('hidden',!incoming);$('active-actions').classList.toggle('hidden',incoming);$('mute').classList.remove('selected');$('speaker').classList.remove('selected');$('speaker').setAttribute('aria-pressed','false');$('speaker').classList.toggle('hidden',call.video);cameraButton(call.video);$('mute').ariaLabel='Mute microphone';$('play-audio').classList.add('hidden');
}
async function createPhone(video,caller){
  const id=call.id;
  const ice=await api('/ice');
  if(call?.id!==id)throw new Error('Call cancelled');
  if(!ice.turn)$('call-warning').textContent='Relay is not configured. Calls across some networks may fail.';
  phone=new Phone({signal,update:updateCall,remote:$('remote-media'),local:$('local-media'),ended:endCall,preference});phone.refreshIce=()=>api('/ice');
  phone.remoteCodecs=call.codecs;phone.remoteMode=call.mode;await phone.prepare(ice,video,caller);
  if(call?.id!==id)return;void output.start(video).catch(()=>{});
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
  if(update.warning!==undefined)$('call-warning').textContent=update.warning;
  if(update.needsPlayback)$('play-audio').classList.remove('hidden');
  if(update.stats){const s=update.stats;call.stats=s;renderCallMetrics();$('call-stats').textContent='Adapts to your connection';if($('settings-dialog').open)$('diagnostic-result').textContent=`${formatRate(s.kbps)||'Measuring…'} media · ${Math.round(s.rtt*1000)} ms · ${Math.round(s.loss*100)}% loss${s.relay?' · relayed':' · direct'}`;}
}
function renderCallMetrics(){
  const s=call?.stats||{},video=!!(phone?.videoWanted||call?.remoteVideo);
  $('call-rate').classList.add('hidden');
  for(const [kind,visible]of [['audio',true],['video',video]]){
    const node=$('call-'+kind+'-codec'),codec=s[kind+'Codec'],rate=formatRate(s[kind+'Kbps']);
    node.textContent=codec?`${kind==='audio'?'Voice':'Video'} · ${codec}${rate?' · '+rate:''}`:'';node.classList.toggle('hidden',!visible||!codec);
    node.title=`Send ${formatRate(s[kind+'UploadKbps'])||'—'} · Receive ${formatRate(s[kind+'DownloadKbps'])||'—'}; codec payload including retransmissions, excludes network headers, TURN overhead and file transfers`;
  }
}
async function startCall(video=false){
  unlockSound();if(!selected||call)return;if(!wsReady)return toast('Wait for the connection to return.');
  const id=crypto.randomUUID();call={id,peer:selected,video,caller:true};showCall();
  try{await createPhone(video,true);if(call?.id!==id)return;const description=await phone.description('offer');await signal('offer',{description,video,codecs:phone.codecSummary,mode:phone.localMode()});call.timeout=setTimeout(()=>{if(call?.id===id&&!call.started)void endCall('No answer. Try again later.');},90000);}
  catch(e){if(call?.id===id)finishCall(e.name==='NotAllowedError'?'Allow microphone access to make calls.':e.message);}
}
async function receiveSignal(b){
  if(seenSignals.has(b.envelope.id))return;
  let peer=device.contacts.find(c=>c.id===b.envelope.from);
  if(!peer){await pinContacts((await api('/me')).contacts);peer=device.contacts.find(c=>c.id===b.envelope.from);}if(!peer)return;
  const payload=await open(device.identity,device.user.id,peer,b.envelope);
  if(!device.contacts.some(c=>c.id===peer.id)||payload.kind!==b.kind||payload.callId!==b.callId)return;
  seenSignals.add(b.envelope.id);if(seenSignals.size>2000)seenSignals.delete(seenSignals.values().next().value);
  if(b.kind==='offer'){
    if(call?.id===b.callId)return;if(call)return;
    call={id:b.callId,peer,video:!!payload.video,caller:false,offer:payload.description,codecs:payload.codecs,mode:payload.mode};showCall(true);ring();
    call.timeout=setTimeout(()=>{if(call?.id===b.callId&&!call.started)finishCall('Missed call');},Math.max(1,b.envelope.expiresAt-Date.now()));return;
  }
  if(b.kind==='ice'){
    if(phone&&call?.id===b.callId)await phone.candidate(payload.candidate);
    else{if(pendingCandidates.size>10)pendingCandidates.clear();const list=pendingCandidates.get(b.callId)||[];if(list.length<80)list.push(payload.candidate);pendingCandidates.set(b.callId,list);}return;
  }
  if(call?.id!==b.callId)return;
  if(b.kind==='answer'){clearTimeout(call.timeout);phone?.setRemoteMode(payload.mode);const changed=phone?.setVideoPreferences(payload.codecs);await phone?.receive(payload.description);await phone?.replayCandidates();if(changed)void phone?.restart();}
  else if(b.kind==='hangup')finishCall(payload.reason||'Call ended');
  else if(b.kind==='restart'){
    if(payload.request)await phone?.restart();
    else if(payload.description){phone?.setRemoteMode(payload.mode);phone?.setVideoPreferences(payload.codecs);await phone?.receive(payload.description);if(payload.description.type==='offer')await signal('restart',{description:await phone.description('answer'),codecs:phone.codecSummary,mode:phone.localMode()});await phone?.replayCandidates();}
  }
  else if(b.kind==='video'){phone?.setRemoteMode(payload.mode);call.remoteVideo=!!payload.enabled;videoLayout();}
}
async function answerCall(){
  unlockSound();if(!call||!call.offer)return;stopRing();$('incoming-actions').classList.add('hidden');$('active-actions').classList.remove('hidden');$('call-status').textContent='Connecting…';
  const id=call.id;
  try{await createPhone(call.video,false);if(call?.id!==id)return;await phone.receive(call.offer);await signal('answer',{description:await phone.description('answer'),codecs:phone.codecSummary,mode:phone.localMode()});navigator.serviceWorker?.controller?.postMessage({type:'call-ended',callId:id});await phone.replayCandidates();clearTimeout(call.timeout);}
  catch(e){if(call?.id===id)await endCall(e.name==='NotAllowedError'?'Allow microphone access to answer.':e.message);}
}
function finishCall(reason='Call ended'){
  if(call){clearTimeout(call.timeout);navigator.serviceWorker?.controller?.postMessage({type:'call-ended',callId:call.id});}stopRing();clearInterval(callTicker);phone?.close();phone=null;call=null;pendingCandidates.clear();wakeLock?.release().catch(()=>{});wakeLock=null;
  output.stop();$('audio-output-dialog').close();$('return-call').classList.add('hidden');$('call-screen').classList.add('hidden');queueMicrotask(pumpMedia);if(reason)toast(reason);
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
$('call-settings').onclick=settingsDialog;$('call-more').onclick=settingsDialog;
$('call-back').onclick=()=>{$('call-screen').classList.add('hidden');$('return-call').classList.remove('hidden');selectContact(call.peer);};
$('return-call').onclick=()=>{if(call){$('call-screen').classList.remove('hidden');$('return-call').classList.add('hidden');}};
$('search').oninput=renderContacts;
$('back').onclick=()=>{actions.reset();stopTyping();closeViewer();captures.close();document.querySelector('.app').classList.remove('chat-open');};
document.querySelectorAll('[data-close]').forEach(e=>e.onclick=()=>e.closest('dialog').close());
$('copy-invite').onclick=async()=>{try{await navigator.clipboard.writeText($('invite-link').value);toast('Invitation copied.');}catch{$('invite-link').select();toast('Select and copy the invitation link.');}};
$('share-invite').onclick=async()=>{try{if(navigator.share)await navigator.share({title:'Talk with me on WebCaller',url:$('invite-link').value});else $('copy-invite').click();}catch(e){if(e.name!=='AbortError')toast(e.message);}};
$('composer').onsubmit=async event=>{
  event.preventDefault();unlockSound();const input=$('message-input'),text=input.value.trim();if(!text||!selected)return;const peer=selected,original=input.value;stopTyping();$('send').disabled=true;
  try{await sendTextTo(peer,text,actions.reply()?{replyTo:actions.reply()}:{});if(input.value===original&&selected?.id===peer.id){input.value='';actions.clearReply();}updateComposer();$('messages').scrollTop=$('messages').scrollHeight;}catch(e){toast(e.message);}finally{$('send').disabled=false;}
};
function renderRecent(){
  const strip=$('recent-media');strip.replaceChildren();
  const recent=[...messages.values()].filter(m=>selected&&m.expiresAt>Date.now()&&[m.from,m.to].includes(selected.id)&&m.blob&&m.blobURL&&!m.location&&['image','video'].includes(mediaKind(m.attachment?.type))).sort((a,b)=>b.createdAt-a.createdAt).slice(0,10);
  $('recent-heading').textContent=recent.length?'Recent in this chat':'Photos and videos';
  if(!recent.length){const p=document.createElement('p');p.className='recent-empty';p.textContent='Choose a photo or video from Gallery.';strip.append(p);}
  for(const m of recent){const b=document.createElement('button');b.type='button';b.className='recent-item';b.ariaLabel=`Send ${m.attachment.name} again`;const media=document.createElement(mediaKind(m.attachment.type)==='video'?'video':'img');media.src=m.blobURL;media.alt=m.attachment.name;media.muted=true;media.playsInline=true;media.preload='metadata';b.append(media);if(media.tagName==='VIDEO'){const play=document.createElement('span');play.className='recent-video';play.textContent='▶';b.append(play);}b.onclick=()=>{if(m.expiresAt<=Date.now()||!m.blob||messages.get(m.id)!==m)return;const file=new File([m.blob],m.attachment.name,{type:m.attachment.type});$('attachment-dialog').close();previewFile(file);};strip.append(b);}
}
$('attachment-dialog').addEventListener('close',()=>{$('recent-media').replaceChildren();});
$('attach').onclick=()=>{if(selected){renderRecent();$('attachment-dialog').showModal();}};
$('choose-location').onclick=()=>{$('attachment-dialog').close();locationShare.show();};
for(const [button,input]of [['choose-photo','photo-input'],['choose-file','file-input']]){
  $(button).onclick=()=>{$('attachment-dialog').close();$(input).click();};
  $(input).onchange=()=>{const file=$(input).files[0];$(input).value='';previewFile(file);};
}
$('camera-input').onchange=()=>{const file=$('camera-input').files[0];$('camera-input').value='';previewFile(file);};
$('chat-camera').onclick=captures.camera;$('record-voice').onclick=captures.voice;
$('emoji').onclick=()=>void chooseEmoji();
$('message-input').oninput=inputTyping;$('message-input').onblur=stopTyping;
$('messages').addEventListener('scroll',()=>{queueMicrotask(pumpMedia);queueReceipts();},{passive:true});
$('message-input').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('composer').requestSubmit();}};
$('message-timer').onchange=()=>{if(selected){settings.timers[selected.id]=Number($('message-timer').value);saveSettings();}};
$('peer-details').onclick=async()=>{if(!selected)return;$('safety-number').textContent=await safetyNumber(device.identity.keys,selected.keys);$('safety-dialog').showModal();};
$('voice').onclick=()=>startCall(false);$('video').onclick=()=>startCall(true);$('answer').onclick=answerCall;$('decline').onclick=()=>endCall('Call declined');$('end-call').onclick=()=>endCall();
$('mute').onclick=()=>{if(phone){const muted=phone.mute();$('mute').classList.toggle('selected',muted);$('mute').ariaLabel=muted?'Unmute microphone':'Mute microphone';}};
function cameraButton(enabled){const button=$('toggle-video');button.classList.toggle('selected',!enabled);button.classList.toggle('camera-off',!enabled);button.ariaLabel=enabled?'Turn camera off':'Turn camera on';button.innerHTML=`<svg aria-hidden="true" viewBox="0 0 24 24">${icons[enabled?'video':'videoOff']}</svg>`;}
function renderOutput(){
  $('speaker').classList.toggle('selected',output.isSpeaker);$('speaker').setAttribute('aria-pressed',String(output.isSpeaker));
  if(!$('audio-output-dialog').open)return;
  const list=$('audio-output-list');list.replaceChildren();
  $('audio-output-status').textContent=output.supported&&output.items.some(d=>d.deviceId!=='default')?'Choose where you hear this call.':'This browser lets your phone choose the call audio.';
  const help=phonePlatform().ios?'On iPhone, use the phone’s audio output controls in Control Center to choose an available speaker or headset. Safari may not offer an earpiece/speaker switch.':'Use your phone’s audio output controls to choose an available speaker or headset. If the built-in speaker is not listed, this browser cannot switch it.';
  $('audio-output-help').textContent=help;$('choose-output').classList.toggle('hidden',!output.supported||!navigator.mediaDevices?.selectAudioOutput);
  if(output.supported)for(const d of [{deviceId:'',label:'Phone / system default'},...output.items.filter(d=>d.deviceId!=='default'&&d.deviceId)]){const b=document.createElement('button');b.className='secondary full';b.textContent=d.label||'Audio device';b.setAttribute('aria-pressed',String(output.sink===d.deviceId));b.onclick=async()=>{try{if(await output.route(d.deviceId))$('audio-output-dialog').close();}catch{toast('The browser could not switch audio. Use your phone’s audio controls.');}};list.append(b);}
}
const output=new AudioOutput($('remote-media'),navigator.mediaDevices,renderOutput);
$('speaker').onclick=async()=>{if(!phone)return;try{await output.refresh();if(output.speaker){if(await output.toggle())return;}}catch{}$('audio-output-dialog').showModal();renderOutput();};
$('choose-output').onclick=async()=>{try{if(await output.choose())$('audio-output-dialog').close();}catch(e){if(e.name!=='NotAllowedError')toast('Could not switch audio. Use your phone’s audio controls.');}};
function videoLayout(){
  renderCallMetrics();
  const local=!!phone?.videoWanted,remote=!!call?.remoteVideo;
  $('call-screen').classList.toggle('has-video',local||remote);$('call-screen').classList.toggle('has-remote-video',remote);
  cameraButton(local);$('switch-camera').classList.toggle('hidden',!local);$('speaker').classList.toggle('hidden',local||remote);void output.setVideo(local||remote).catch(()=>{});
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
$('remove-contact-dialog').addEventListener('close',()=>{contactToRemove=null;});
$('confirm-remove-contact').onclick=async()=>{
  const c=contactToRemove;if(!c)return;$('confirm-remove-contact').disabled=true;
  try{
    const result=await api(`/contacts/${c.id}`,'DELETE');
    for(const m of result.deleted)rememberDeletion(m.id,m.expires);
    clearContactHistory(c.id);await pinContacts(result.contacts);$('remove-contact-dialog').close();toast('Contact and shared history deleted.');
  }catch(e){if(contactToRemove?.id===c.id){$('remove-contact-error').textContent=e.message;$('confirm-remove-contact').disabled=false;}else toast(e.message);}
};
$('confirm-forget').onclick=async()=>{
  try{await api('/device','DELETE');if(ws){ws.onclose=null;ws.close();}clearTimeout(reconnectTimer);clearInterval(heartbeat);finishCall('');transfer?.controller.abort();for(const m of messages.values())clearMessage(m);messages.clear();await cachedMedia.clear();await vault('delete');localStorage.removeItem('webcaller-settings');device=null;location.reload();}catch(e){toast(e.message);}
};
function clearMessage(m){m.reactions=null;m.receipt=null;m.versions=null;m.pinVersion=null;m.replyTo=null;if(viewerMessage?.id===m.id)closeViewer();if(m.blobURL)URL.revokeObjectURL(m.blobURL);m.blobURL=null;m.blob=null;m.location=null;m.text='';m.attachment=null;}
setInterval(()=>{for(const [id,updates]of pendingMessageEvents)if(!updates.some(e=>e.envelope.expiresAt>Date.now()))pendingMessageEvents.delete(id);queueReceipts();for(const [id,expiry]of deletedMessages)if(expiry<=Date.now())deletedMessages.delete(id);for(const [id,expiry]of typingSeen)if(expiry<=Date.now())typingSeen.delete(id);renderTyping();let changed=false;for(const [id,m]of messages)if(m.expiresAt<=Date.now()){void cachedMedia.remove(device?.user.id,id,m.expiresAt);clearMessage(m);messages.delete(id);receiptWanted.delete(id);visibleSince.delete(id);changed=true;}if(changed&&selected)renderMessages();},1000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&device){void cachedMedia.purge();unlockSound();if(!wsReady)connect();else sync().catch(()=>{});if(call?.started)navigator.wakeLock?.request('screen').then(lock=>wakeLock=lock).catch(()=>{});}if(document.visibilityState==='hidden'){actions.reset();clearTimeout(receiptTimer);receiptTimer=null;receiptWanted.clear();visibleSince.clear();pendingMessageEvents.clear();locationShare.close();$('attachment-dialog').close();stopTyping();typingPeers.clear();renderTyping();captures.close();closeViewer();clearDraft();$('draft-dialog').close();$('emoji-dialog').close();transfer?.controller.abort();for(const m of messages.values())clearMessage(m);messages.clear();$('messages').replaceChildren();$('pinned-message').textContent='';$('pinned-message').onclick=null;$('pinned-message').classList.add('hidden');}});
window.addEventListener('online',()=>{if(device&&!wsReady)connect();if(phone)void phone.networkChanged();});
navigator.connection?.addEventListener('change',()=>{if(phone)void phone.networkChanged();});
window.addEventListener('pagehide',()=>{actions.reset();clearTimeout(receiptTimer);receiptWanted.clear();visibleSince.clear();pendingMessageEvents.clear();locationShare.close();output.stop();stopTyping();captures.close();closeViewer();clearDraft();phone?.close();transfer?.controller.abort();for(const m of messages.values())clearMessage(m);messages.clear();});
unlockSound();
void boot();

document.addEventListener('close',queueReceipts,true);
