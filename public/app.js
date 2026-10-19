import {timerValue,timerLabel,timerDescription,isPermanent,expiryAlarm} from './message-lifetime.js';
import {messageTimer} from './message-timer.js';
import {TRANSFER_PART_SIZE,transferPacer,transferPool,transferPaused} from './transfer-policy.js';
import {messageIntents,resolveMessageIntent} from './message-intents.js';
import {acceptTransfer,purgeTransfers} from './transfer-state.js';
import {updateCountdowns} from './message-expiry.js';
const chatNotificationIntents=messageIntents();let pendingMessageNotice=null;const pendingTransfers=new Map();
import {callIntents} from './call-intents.js';
const notificationIntents=callIntents();let pendingAnswer=null;
import {contactPress} from './contact-press.js';
import {contactName,renameContact} from './contact-names.js';
import { newIdentity, fingerprint, safetyNumber, vault } from './crypto.js';
import {secureMessaging} from './secure-messaging.js';
import {checkContactTrust} from './contact-trust.js';
import {orderedEnvelopes} from './signal-wire.js';
const messenger=secureMessaging({api});
const seal=(...args)=>messenger.seal(...args),open=(...args)=>messenger.open(...args);
import { Phone, testRelay } from './media.js';
import {callOutbox,orderedTasks,callRinger,waitingForAnswer} from './call-signaling.js';
import {dialEntry,dialLink,checkDialTarget} from './dial-code.js';
import {dialingUI,dialIdentity} from './dialing.js';
import {formatRate} from './call-metrics.js';
import {callSas,callSasContext,mediaFingerprints} from './call-sas.js';
import {mediaCache} from './media-cache.js';
import {validLocation,mapsURL,locationText,locationSharing} from './location.js';
import {AudioOutput} from './audio-output.js';
import { readEntryFragment, clearEntryFragment } from './onboarding.js';
import {newAttachment,validAttachment,attachmentKey,encryptChunk,decryptChunk,CHUNK_SIZE,mediaKind,fileSize} from './attachments.js';
import {messageActions} from './message-actions.js';
import {applyMessageEvent,validMessageId} from './message-state.js';
import {drawMessages,emojiPicker} from './chat-ui.js';
import {chatCapture} from './chat-capture.js';
import {ntfySetup,ntfyEntry} from './ntfy-setup.js';
import {callSetup,phonePlatform,registerAlerts} from './call-setup.js';
const cachedMedia=mediaCache();let cacheWarning=false;
void cachedMedia.purge();setInterval(()=>{void cachedMedia.purge();if(device)void messenger.purge().catch(()=>{});},60000);
function cacheNotice(ok){
  if(!ok&&cachedMedia.lastError&&!cacheWarning){cacheWarning=true;toast('Your browser could not keep this file. Reopening may download it again.');}
}
const $=id=>document.getElementById(id);
const startupStatus=(state,message='')=>window.dispatchEvent(new CustomEvent('webcaller-startup',{detail:{state,message}}));
const icons={
  theme:'<circle cx="12" cy="12" r="9"/><path d="M12 3v18a9 9 0 0 0 0-18Z"/>',timer:'<circle cx="12" cy="13" r="8"/><path d="M9 2h6M12 5V2M12 9v5l3 2M18 5l2 2"/>',
  reply:'<path d="m9 4-7 7 7 7v-5c6 0 10 2 13 7v-4C22 8 17 7 9 7Z"/>',edit:'<path d="m3 17 14-14 4 4-14 14-5 1ZM14 6l4 4"/>',forward:'<path d="m15 4 7 7-7 7v-5C9 13 5 15 2 20v-4c0-8 5-9 13-9Z"/>',check:'<circle cx="12" cy="12" r="9"/><path d="m7 12 3 3 7-7"/>',pin:'<path d="m15 3 6 6-4 1-3 5 1 3-3-1-4-4-1-3 3 1 5-3ZM10 14l-7 7"/>',trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  gallery:'<rect x="3" y="6" width="17" height="15" rx="3"/><path d="m6 6-1-3 15-1 2 15-2 1M3 17l5-5 4 4 3-3 5 5"/><circle cx="8" cy="10" r="1"/>',location:'<circle cx="12" cy="12" r="9"/><path d="m7 11 11-5-5 11-2-4Z"/>',speaker:'<path d="M3 9h4l5-5v16l-5-5H3ZM16 8a6 6 0 0 1 0 8M19 5a10 10 0 0 1 0 14"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 10v7M12 7h.01"/>',videoOff:'<path d="M3 3l18 18M3 7v12h12v-4M9 5h6v4l6-3v12l-3-1"/>',

  smile:'<circle cx="12" cy="12" r="9"/><path d="M8 14a4 4 0 0 0 8 0M8 9h.01M16 9h.01"/>',camera:'<path d="m8 5 2-3h4l2 3h4v16H4V5Z"/><circle cx="12" cy="13" r="4"/>',download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  chat:'<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H7l-5 3 1.5-5.5A8.5 8.5 0 1 1 21 11.5Z"/><path d="M7 11h.01M12 11h.01M17 11h.01"/>',
  keypad:'<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M7 16h10"/>',
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
const initialDialCode=dialEntry(location.hash);
const extraAlertEntry=ntfyEntry(location.hash);
const alertTestEntry=new URLSearchParams(location.hash.slice(1)).get('alert-test');
let ownerSetup=entry.setupCode;
const ownerName=entry.name;entry.setupCode=null;
// Retain only an iPhone invitation fragment for its Home Screen handoff; never an owner code.
clearEntryFragment(location,history,!!invitation&&phonePlatform().needsHomeScreen,!!initialDialCode&&phonePlatform().needsHomeScreen);
let device,config,selected,ws,wsReady=false,connecting=false,reconnectTimer,reconnectAttempt=0,heartbeat,phone,call,callTicker,wakeLock,soundContext,toastTimer;let ringNodes=new Set(),phoneInitialized=false;
const callInbox=orderedTasks();
const sendCallSignal=callOutbox({current:()=>call,ready:()=>wsReady&&ws?.readyState===1,
  seal:(current,kind,payload)=>seal(device.identity,device.user.id,current.peer,{kind,callId:current.id,...payload},kind==='offer'?90:120),
  send:packet=>ws.send(JSON.stringify(packet)),onError:()=>updateCall({warning:'Waiting for signaling…'})});
const ringer=callRinger({current:()=>call,burst:ringBurst,silence:silenceRing});
let deletedMessages=new Map(),typingPeers=new Map(),typingSeen=new Map(),typingTimer,typingSent=0,typingPeerId,typingChain=Promise.resolve(),viewerMessage,draft;
let messages=new Map(),unread=new Map(),seenSignals=new Set(),pendingCandidates=new Map(),settings={timers:{}},transfer,contactToRemove,contactToRename,contactPressCleanup=[];
try{settings={...settings,...JSON.parse(localStorage.getItem('ellie-settings')||'{}')};}catch{}
delete settings.mode; // Retire saved manual modes; connection management is always Automatic.
const preference=()=> 'auto';
const timerFor=id=>timerValue(settings.timers?.[id]);
const initials=name=>name.trim().split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase();
function toast(text){$('toast').textContent=text;$('toast').classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),6000);}
function saveSettings(){localStorage.setItem('ellie-settings',JSON.stringify(settings));if(selected)$('expiry-label').textContent=timerDescription(timerFor(selected.id));}
async function api(path,method='GET',data,signal){
  const headers={};if(device?.token&&(device.user||path==='/dial/connect'))headers.Authorization=`Bearer ${device.token}`;if(data)headers['Content-Type']='application/json';
  const timeout=AbortSignal.timeout(20000);
  const r=await fetch(`${base}/api${path}`,{method,headers,body:data?JSON.stringify(data):undefined,cache:'no-store',signal:signal?AbortSignal.any([timeout,signal]):timeout});
  const b=await r.json();if(!r.ok)throw Object.assign(new Error(b.error||'Request failed'),{status:r.status});return b;
}
const extraRinging=ntfySetup({api,config:()=>config,device:()=>device?.user?device:null,toast,entry:extraAlertEntry,openCall:openNotifiedCall});
const alerts=callSetup({api,config:()=>config,device:()=>device?.user?device:null,save:()=>vault('put',device),toast});
const dialUi=dialingUI({api,device:()=>device,config:()=>config,toast,connect:connectByCode,
  before:async code=>{
    if(!device?.user&&phonePlatform().needsHomeScreen){history.replaceState(null,'',dialLink(location.href,code));await alerts.show();return false;}
    return true;
  },action:async(peer,mode)=>{
    if($('welcome-dialog').open)$('welcome-dialog').close();selectContact(peer);
    if(mode==='message'){if(call){$('call-screen').classList.add('hidden');$('return-call').classList.remove('hidden');}$('message-input').focus();return;}
    if(call)throw new Error('Finish the current call before starting another one.');
    await waitForSignaling();await startCall(mode==='video');
  }});
async function connectByCode(code,name){
  if(!device?.user){device=await dialIdentity({load:()=>vault('get'),save:value=>vault('create',value),newIdentity});if(!device.user)device.enrollmentName=name||device.enrollmentName||'Guest';}
  const fresh=!device.user;
  const result=await api('/dial/connect','POST',{code,...(settings.codePeers?.[code]?{expectedPeer:settings.codePeers[code]}:{}),...(fresh?{keys:device.identity.keys,name:device.enrollmentName}:{})});
  checkDialTarget(settings.codePeers?.[code],result.contact);
  if(fresh&&(!validMessageId(result.user?.id)||await fingerprint(result.user?.keys)!==await fingerprint(device.identity.keys)))throw new Error('Device setup could not be verified. Keep this browser and try again.');
  if(fresh){device={...device,user:result.user};delete device.dialEnrollment;device.needsDialAlerts=true;await vault('put',device);}
  if(!phoneInitialized)await messenger.initialize(device);
  await pinContacts((await api('/me')).contacts);
  const peer=device.contacts.find(c=>c.id===result.contact.id);if(!peer)throw new Error('This contact could not be verified.');
  settings.codePeers={...settings.codePeers,[code]:peer.id};const remembered=Object.entries(settings.codePeers);if(remembered.length>100)settings.codePeers=Object.fromEntries(remembered.slice(-100));saveSettings();
  if(!phoneInitialized){await ready();clearEntryFragment(location,history);}
  return peer;
}
async function waitForSignaling(){
  if(!wsReady)void connect();const deadline=Date.now()+15000;
  while(!wsReady){if(Date.now()>deadline)throw new Error('Waiting for the connection. Please try Call again.');await new Promise(resolve=>setTimeout(resolve,50));}
}
async function acceptContact(peer){
  if(peer?.request!=='incoming')return;
  await api('/contacts/'+peer.id+'/accept','POST',{});await pinContacts((await api('/me')).contacts);renderRequest();queueReceipts();
}
function renderRequest(){
  const state=selected?.request;$('contact-request').classList.toggle('hidden',!state);$('accept-contact').classList.toggle('hidden',state!=='incoming');
  $('contact-request-text').textContent=state==='incoming'?'New contact request. Accept, reply or answer their call to connect.':state==='outgoing'?'Waiting for their first reply or answer. You can call or send up to five text messages.':'';
}
window.addEventListener('hashchange',()=>{const incoming=ntfyEntry(location.hash);if(incoming){clearEntryFragment(location,history);void extraRinging.resume(incoming);}});
function connected(ready){wsReady=ready;$('answer').disabled=!ready;$('connection').textContent=ready?'Ready to call':'Reconnecting…';$('connection').classList.toggle('online',ready);document.querySelectorAll('.home-call').forEach(button=>button.disabled=!ready);}
async function pinContacts(contacts){
  const removed=(device.contacts||[]).filter(c=>!contacts.some(next=>next.id===c.id));
  for(const c of removed){await checkContactTrust(messenger.store,device.user.id,c,device.pins?.[c.id]);await clearContactHistory(c.id);}
  device.pins ||= {};const safe=[];
  for(const contact of contacts){
    try{await checkContactTrust(messenger.store,device.user.id,contact,device.pins[contact.id]);}
    catch(error){toast(error.message);continue;}
    device.pins[contact.id]=contact;safe.push(contact);
  }
  device.contacts=safe;await vault('put',device);renderContacts();
  if(selected){selected=safe.find(c=>c.id===selected.id);if(!selected){$('conversation').classList.add('hidden');$('empty').classList.remove('hidden');document.querySelector('.app').classList.remove('chat-open');}renderRequest();}
}
function renderContacts(){
  contactPressCleanup.splice(0).forEach(dispose=>dispose());
  const el=$('contacts');el.replaceChildren();$('contact-count').textContent=device?.contacts?.length||0;
  const contacts=(device?.contacts||[]).filter(c=>[contactName(device,c),c.name].some(name=>name.toLowerCase().includes($('search').value.toLowerCase())));
  for(const c of contacts){
    const label=contactName(device,c),row=document.createElement('div');row.className='person-row';
    const button=document.createElement('button');button.type='button';button.className='contact'+(selected?.id===c.id?' selected':'');button.dataset.contact=c.id;button.setAttribute('aria-label','Chat with '+label);
    const avatar=document.createElement('div');avatar.className='avatar';avatar.textContent=initials(label);avatar.dataset.tone=String([...c.id].reduce((sum,char)=>sum+char.charCodeAt(0),0)%5);
    const text=document.createElement('div');text.className='contact-text';const name=document.createElement('strong');name.textContent=label;text.append(name);
    if(c.request){const preview=document.createElement('span');preview.textContent=c.request==='incoming'?'New contact request':'Waiting to connect';text.append(preview);}
    button.append(avatar,text);
    if(unread.get(c.id)){const badge=document.createElement('span');badge.className='unread';badge.textContent=unread.get(c.id);button.append(badge);}
    const actions=document.createElement('div');actions.className='person-actions';
    const video=document.createElement('button');video.type='button';video.className='home-call';video.disabled=!wsReady;video.setAttribute('aria-label','Video call '+label);video.title='Video call';video.innerHTML=`<svg aria-hidden="true" viewBox="0 0 24 24">${icons.video}</svg>`;
    video.onclick=()=>{if(call)return toast('Finish the current call before starting another one.');selectContact(c);void startCall(true);};
    const options=document.createElement('button');options.type='button';options.className='home-contact-options';options.setAttribute('aria-label','Contact options for '+label);options.setAttribute('aria-haspopup','dialog');options.title='Contact options';options.innerHTML=`<svg aria-hidden="true" viewBox="0 0 24 24">${icons.more}</svg>`;options.onclick=()=>editContactName(c);
    actions.append(video,options);row.append(button,actions);el.append(row);
    contactPressCleanup.push(contactPress(button,{activate:()=>selectContact(c),open:()=>editContactName(c)}));
  }
  if(!contacts.length){const p=document.createElement('p');p.className='no-contacts';p.textContent=$('search').value?'No people found.':config?.dialCodes?'Your people will appear here.\nDial a code or invite someone.':'Your people will appear here.\nStart with an invitation.';el.append(p);}
}
function editContactName(c){
  if(!device.contacts.some(peer=>peer.id===c.id))return;
  contactToRename=c;$('contact-name').value=contactName(device,c);$('contact-name').placeholder=c.name;$('contact-name-error').textContent='';$('save-contact-name').disabled=false;
  $('settings-dialog').close();$('contact-options-dialog').showModal();$('contact-name').focus();$('contact-name').select();
}
function refreshContactNames(){
  renderContacts();if(selected){$('peer-name').textContent=contactName(device,selected);$('peer-avatar').textContent=initials(contactName(device,selected));}renderTyping();
  if(call){const name=contactName(device,call.peer);$('call-name').textContent=name;$('call-peer-top').textContent=name;$('call-avatar').textContent=initials(name);}
}
let blockRemoval=false;
function showContactOptions(c,block=false){
  if(!device.contacts.some(peer=>peer.id===c.id))return;
  contactToRemove=c;blockRemoval=block;$('remove-contact-title').textContent=block?`Block ${contactName(device,c)}?`:`Remove ${contactName(device,c)}?`;$('remove-contact-error').textContent='';
  $('confirm-remove-contact').textContent=block?'Block and delete history':'Delete contact and history';
  $('remove-contact-description').textContent=block?'This blocks this device from calling or messaging you, ends any active call, and deletes your shared conversation and media for both people. Unblocking later permits a new request but does not restore history. Saved or forwarded copies cannot be recalled.':'This removes your connection, ends any active call, and deletes your shared conversation and media for both people. Use a calling code or a new invitation to reconnect. Saved or forwarded copies cannot be recalled.';
  $('confirm-remove-contact').disabled=false;if(!$('remove-contact-dialog').open)$('remove-contact-dialog').showModal();
}
async function clearContactHistory(id){
  for(const [key,m]of pendingTransfers)if([m.from,m.to].includes(id))pendingTransfers.delete(key);if(pendingMessageNotice?.peerId===id)pendingMessageNotice=null;
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
  if(contactToRename?.id===id)$('contact-options-dialog').close();
  if(device.contactNames)delete device.contactNames[id];
  await messenger.forgetPeer(id); // The separate identity fingerprint survives history deletion.
}
function selectContact(c){
  actions.reset();stopTyping();locationShare.close();$('attachment-dialog').close();closeViewer();captures.close();$('draft-dialog').close();$('message-input').value='';updateComposer();selected=c;unread.delete(c.id);renderContacts();$('empty').classList.add('hidden');$('conversation').classList.remove('hidden');document.querySelector('.app').classList.add('chat-open');
  $('peer-name').textContent=contactName(device,c);$('peer-avatar').textContent=initials(contactName(device,c));$('expiry-label').textContent=timerDescription(timerFor(c.id));renderMessages();
  renderRequest();
}
function renderMessages(){
  if(!selected)return;
  const list=[...messages.values(),...pendingTransfers.values()].filter(m=>m.expiresAt>Date.now()&&[m.from,m.to].includes(selected.id)).sort((a,b)=>a.createdAt-b.createdAt);
  actions.changed();
  drawMessages({container:$('messages'),list,self:device.user.id,options:messageOptions,openMedia:openViewer,load:loadAttachment,save:saveAttachment,selection:actions.selection,select:actions.select,jump:jumpMessage});
  const pinned=list.filter(m=>m.pinned).sort((a,b)=>(b.pinVersion?.createdAt||0)-(a.pinVersion?.createdAt||0))[0];$('pinned-message').classList.toggle('hidden',!pinned);$('pinned-message').textContent=pinned?'📌 '+(pinned.text||pinned.attachment?.name||'Message'): "";$('pinned-message').onclick=()=>pinned&&jumpMessage(pinned.id);
  renderTyping();if($('attachment-dialog').open)renderRecent();queueMicrotask(pumpMedia);queueReceipts();
}
async function messageOptions(m){await markMessageViewed(m);if(messages.get(m.id)===m&&m.expiresAt>Date.now())actions.show(m);}
function jumpMessage(id){const row=[...$('messages').children].find(e=>e.dataset.key===id);if(row){row.scrollIntoView({block:'center',behavior:'smooth'});row.querySelector('.message')?.focus({preventScroll:true});}else toast('The original message has expired or was deleted.');}
function rememberDeletion(id,expires){
  if(typeof id!=='string'||!Number.isSafeInteger(expires))return;
  if(device)void messenger.remove(id,expires).catch(error=>toast(error.message));
  pendingTransfers.delete(id);void cachedMedia.remove(device?.user.id,id,expires);deletedMessages.set(id,expires);receiptWanted.delete(id);visibleSince.delete(id);pendingMessageEvents.delete(id);const m=messages.get(id);
  if(transfer?.messageId===id)transfer.controller.abort();if(viewerMessage?.id===id)closeViewer();
  if(m){clearMessage(m);messages.delete(id);if(selected)renderMessages();}
}
function renderTyping(){
  const active=selected&&document.visibilityState==='visible'&&typingPeers.get(selected.id)>Date.now();
  $('typing-status').classList.toggle('hidden',!active);$('typing-label').textContent=active?`${contactName(device,selected)} is typing`:'';
}
async function sendTyping(peer,active){
  typingChain=typingChain.then(async()=>{
    if(!peer||peer.request||!device?.user||!wsReady||ws?.readyState!==1)return;
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
  // Advance and seal transport state while hidden, without rebuilding the UI's plaintext.
  if(messages.has(envelope.id)||deletedMessages.has(envelope.id)||envelope.expiresAt<=Date.now())return;
  const localState=await messenger.messageState(envelope);if(localState.expiresAt<=Date.now())return;
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
  pendingTransfers.delete(envelope.id);messages.set(envelope.id,{id:envelope.id,from:envelope.from,to:envelope.to,createdAt:envelope.createdAt,expiresAt:localState.expiresAt,wireExpiresAt:envelope.expiresAt,lifetime:localState.lifetime,viewedAt:localState.viewedAt,text:payload.text||'',attachment:payload.attachment,location:payload.location,replyTo:payload.replyTo,forwarded:payload.forwarded===true,receivedLocally:envelope.from!==device.user.id?(localState.deliveredAt||Math.max(envelope.createdAt,Date.now())):undefined});
  for(const update of pendingMessageEvents.get(envelope.id)||[])await acceptMessageEvent(update);pendingMessageEvents.delete(envelope.id);
  if(!hydrating&&envelope.from!==device.user.id&&selected?.id!==peer.id)unread.set(peer.id,(unread.get(peer.id)||0)+1);
  if(selected?.id===peer.id)renderMessages();renderContacts();
}
function beginTransfer(label,automatic=false){
  if(transfer){if(!automatic)toast('Wait for the current file transfer to finish.');return null;}
  const state={controller:new AbortController(),requestAbort:new AbortController(),label,loaded:new Map(),loadedBytes:0};paceTransfer.reset();transfer=state;state.healthTimer=setInterval(()=>{const status=paceTransfer.check();if(status.paused||status.networkChanged){if(!state.requestAbort.signal.aborted)state.requestAbort.abort(transferPaused());}},100);$('attach').disabled=true;$('attachment-progress').classList.remove('hidden');$('attachment-progress').textContent=label;return state;
}
async function receiveTransfer(b){
  if(!device||document.visibilityState!=='visible'||!validMessageId(b.messageId)||!b.envelope)return;const peer=device.contacts.find(c=>c.id===b.envelope.from);if(!peer)return;
  const payload=await open(device.identity,device.user.id,peer,b.envelope);if(document.visibilityState!=='visible'||payload.target!==b.messageId||!device.contacts.some(c=>c.id===peer.id))return;
  if(acceptTransfer(pendingTransfers,b.envelope,payload,{self:device.user.id,known:messages,deleted:deletedMessages})&&selected?.id===peer.id)renderMessages();
}
function localTransfer(state){
  if(!state.upload||state.controller.signal.aborted||state.committed)return;const {envelope,attachment}=state.upload,now=Date.now();
  const payload={kind:'transfer',target:envelope.id,attachment,createdAt:envelope.createdAt,expiresAt:envelope.expiresAt,percent:state.percent||0};
  acceptTransfer(pendingTransfers,{id:crypto.randomUUID(),from:envelope.from,to:envelope.to,createdAt:now,expiresAt:Math.min(envelope.expiresAt,now+20000)},payload,{self:device.user.id,known:messages,deleted:deletedMessages});if(selected?.id===state.peerId)renderMessages();return payload;
}
async function publishTransfer(state){
  const payload=localTransfer(state);if(!payload||!wsReady||ws?.readyState!==1||state.progressBusy||Date.now()-(state.progressAt||0)<3000)return;
  const peer=device.contacts.find(c=>c.id===state.peerId);if(!peer)return;state.progressAt=Date.now();state.progressBusy=true;
  try{const ttl=Math.min(20,Math.floor((payload.expiresAt-Date.now())/1000));if(ttl<1)return;const envelope=await seal(device.identity,device.user.id,peer,payload,ttl);
    if(!state.controller.signal.aborted&&!state.committed&&wsReady&&ws?.readyState===1)ws.send(JSON.stringify({type:'transfer',messageId:payload.target,envelope}));
  }catch{}finally{state.progressBusy=false;}
}
function transferProgress(state,index,total){const percent=Math.min(100,Math.round(index/total*100));if(state.percent===percent)return;state.percent=percent;if(state.upload)void publishTransfer(state);else{const m=messages.get(state.messageId);if(m?.loading){m.loadProgress=state.percent;if(selected&&[m.from,m.to].includes(selected.id))renderMessages();}}if(transfer===state)$('attachment-progress').textContent=`${state.label} · ${Math.round(index/total*100)}%`;}
function shareCall(state){
  if(state.callId===call?.id)return state.sharingReady||Promise.resolve();
  if(!call||!phone)return Promise.resolve();state.callId=call.id;state.preparing=true;
  clearInterval(state.sharingTimer);const notify=()=>{if(transfer===state&&call?.id===state.callId&&call.started)void signal('sharing',{active:true}).catch(()=>{});};notify();state.sharingTimer=setInterval(notify,10000);
  state.sharingReady=phone.setSharing(true).finally(()=>{state.preparing=false;});return state.sharingReady;
}
function endTransfer(state){clearInterval(state.healthTimer);clearInterval(state.progressTimer);if(state.upload){pendingTransfers.delete(state.messageId);if(selected)renderMessages();}state.cancelExpiry?.();clearInterval(state.sharingTimer);if(state.callId===call?.id){void phone?.setSharing(false);void signal('sharing',{active:false}).catch(()=>{});}if(transfer===state){transfer=null;$('attach').disabled=false;$('attachment-progress').classList.add('hidden');queueMicrotask(pumpMedia);}}
const paceTransfer=transferPacer(()=>phone?{id:call?.id,state:phone.pc?.connectionState,profile:phone.profile,mode:phone.mode(),network:navigator.connection?.type||'unknown',metered:navigator.connection?.type==='cellular'||navigator.connection?.saveData===true,stats:phone.stats,preparing:transfer?.preparing}:call?{state:'connecting'}:null,waiting=>{
  if(transfer&&waiting)$('attachment-progress').textContent=transfer.label+' · Waiting for connection · voice first';
});
function transferExpiry(state,expires){state.cancelExpiry=expiryAlarm(expires,()=>state.controller.abort(new DOMException('This file has expired.','AbortError')));}
async function retryTransfer(state,request,signal=state.controller.signal){
  for(let attempt=0;;attempt++){
    signal.throwIfAborted();
    try{return await request();}catch(error){
      if(signal.aborted||error.name==='TransferPausedError'||attempt>=7||error.status&&!([408,429,500,502,503,504].includes(error.status)))throw error;
      paceTransfer.backoff();
      if(transfer===state)$('attachment-progress').textContent=state.label+' · Reconnecting…';
      await new Promise((resolve,reject)=>{
        const done=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);},abort=()=>{done();reject(signal.reason);};
        const timer=setTimeout(()=>{done();resolve();},Math.min(16000,1000*2**attempt));signal.addEventListener('abort',abort,{once:true});
      });
    }
  }
}
async function chunkRequest(path,method,state,data,signal=state.controller.signal,expectedSize=TRANSFER_PART_SIZE){
  return retryTransfer(state,async()=>{
    await shareCall(state);const size=data?.byteLength||expectedSize;await paceTransfer(size,signal);
    if(state.requestAbort.signal.aborted)state.requestAbort=new AbortController();
    const pause=state.requestAbort.signal,start=performance.now();
    try{
      const res=await fetch(`${base}/api${path}`,{method,priority:'low',headers:{Authorization:`Bearer ${device.token}`,...(data?{'Content-Type':'application/octet-stream'}:{})},body:data,cache:'no-store',signal:AbortSignal.any([signal,pause,AbortSignal.timeout(30000)])});
      if(!res.ok){const body=await res.json().catch(()=>({}));throw Object.assign(new Error(body.error||'File transfer failed'),{status:res.status});}
      const result=method==='GET'?new Uint8Array(await res.arrayBuffer()):await res.json();
      paceTransfer.observe(method==='GET'?result.byteLength:size,performance.now()-start);return result;
    }catch(error){if(pause.aborted&&!signal.aborted)throw transferPaused();throw error;}
  },signal);
}
function chunkProgress(state,a,index,bytes){
  const old=state.loaded.get(index)||0,next=Math.min(Math.min(CHUNK_SIZE,a.size-index*CHUNK_SIZE),Math.max(old,bytes));
  state.loaded.set(index,next);state.loadedBytes+=next-old;transferProgress(state,state.loadedBytes,a.size);
}
async function transferChunk(a,index,state,cipher,signal=state.controller.signal){
  const path=`/attachments/${a.id}/chunks/${index}`,method=cipher?'PUT':'GET',length=Math.min(CHUNK_SIZE,a.size-index*CHUNK_SIZE)+16;
  const result=cipher?null:new Uint8Array(length),bytes=cipher?new Uint8Array(cipher):null;let offset=0;
  while(offset<length){
    signal.throwIfAborted();await shareCall(state);
    const whole=offset===0&&!paceTransfer.check().small,size=whole?length:Math.min(TRANSFER_PART_SIZE,length-offset),part=Math.floor(offset/TRANSFER_PART_SIZE);
    try{
      const received=await chunkRequest(path+(whole?'':'/parts/'+part),method,state,bytes?.subarray(offset,offset+size),signal,size);
      if(result){if(received.length!==size)throw new Error('Incomplete encrypted file chunk');result.set(received,offset);}
      offset+=size;chunkProgress(state,a,index,Math.max(0,offset-16));
    }catch(error){if(error.name!=='TransferPausedError')throw error;}
  }
  return result?.buffer;
}
async function sendFile(file,text='',sharedLocation,recipient=selected){
  if(sharedLocation&&!validLocation(sharedLocation))return toast('Invalid location.');
  if(!file||!recipient)return false;const peer=recipient;
  let a;try{a=newAttachment(file);}catch(e){return toast(e.message);}
  const state=beginTransfer(`Sending ${a.name} to ${contactName(device,peer)}`);if(!state)return;state.peerId=peer.id;
  let committed=false,writer;const owner=device.user.id;
  try{
    const envelope=await seal(device.identity,device.user.id,peer,{kind:'attachment',attachment:a,text,...(sharedLocation?{location:sharedLocation}:{})},timerFor(peer.id),{perView:true}),key=await attachmentKey(a);state.messageId=envelope.id;transferExpiry(state,(await messenger.messageState(envelope)).expiresAt);
    await retryTransfer(state,()=>api('/attachments','POST',{id:a.id,size:a.size,envelope},state.controller.signal));
    state.upload={envelope,attachment:{id:a.id,name:a.name,type:a.type,size:a.size}};void publishTransfer(state);state.progressTimer=setInterval(()=>void publishTransfer(state),10000);
    writer=await cachedMedia.writer(owner,{...envelope,...await messenger.messageState(envelope),wireExpiresAt:envelope.expiresAt},a);
    await transferPool(a.chunks,async(index,signal)=>{
      signal.throwIfAborted();const bytes=new Uint8Array(await file.slice(index*CHUNK_SIZE,(index+1)*CHUNK_SIZE).arrayBuffer());
      let cipher;try{cipher=await encryptChunk(key,a,index,envelope.expiresAt,bytes);}finally{bytes.fill(0);}
      await transferChunk(a,index,state,cipher,signal);if(writer)cacheNotice(await writer.put(index,cipher));
    },state.controller.signal);
    await retryTransfer(state,()=>api('/messages','POST',envelope,state.controller.signal));committed=true;state.committed=true;
    if(!state.controller.signal.aborted)cacheNotice(writer?await writer.commit():false);
    await acceptMessage(envelope);const m=messages.get(envelope.id);
    if(m&&document.visibilityState==='visible'&&!state.controller.signal.aborted){m.blob=file;m.blobURL=URL.createObjectURL(file);if(selected?.id===peer.id)renderMessages();}
    toast('File sent. It uses this chat’s disappearing timer.');return true;
  }catch(e){if(e.name!=='AbortError')toast(e.message);}
  finally{await writer?.abort();if(!committed)void api(`/attachments/${a.id}`,'DELETE').catch(()=>{});endTransfer(state);}
}
function saveAttachment(m){
  if(!m.attachment||m.expiresAt<=Date.now()||!m.blobURL)return toast('This file has expired.');
  const link=document.createElement('a');link.href=m.blobURL;link.download=m.attachment.name.replace(/[\/\\\x00-\x1f]/g,'_');link.click();
}
async function loadAttachment(m,automatic=false){
  if(!m.attachment||m.expiresAt<=Date.now()||messages.get(m.id)!==m)return;
  if(m.blobURL)return automatic?undefined:mediaKind(m.attachment.type)==='file'?saveAttachment(m):openViewer(m);
  const a=m.attachment,state=beginTransfer(`Loading ${a.name}`,automatic);if(!state)return;
  state.peerId=m.from===device.user.id?m.to:m.from;state.messageId=m.id;transferExpiry(state,m.expiresAt);m.loading=true;m.loadProgress=0;m.loadError=null;renderMessages();let pieces=[],writer;
  try{
    const key=await attachmentKey(a),owner=device.user.id;let reader=await cachedMedia.reader(owner,m,a),local=!!reader;
    for(let attempt=0;attempt<2;attempt++){
      try{
        if(!local)writer=await cachedMedia.writer(owner,m,a);
        await transferPool(a.chunks,async(index,signal)=>{
          signal.throwIfAborted();const cipher=local?await reader.chunk(index):await transferChunk(a,index,state,undefined,signal);
          if(!cipher)throw new Error('Cached file is incomplete.');
          const plain=new Uint8Array(await decryptChunk(key,a,index,m.wireExpiresAt||m.expiresAt,cipher));
          try{pieces[index]=new Blob([plain]);}finally{plain.fill(0);}
          if(!local&&writer)cacheNotice(await writer.put(index,cipher));
          chunkProgress(state,a,index,Math.min(CHUNK_SIZE,a.size-index*CHUNK_SIZE));
        },state.controller.signal);
        state.controller.signal.throwIfAborted();
        if(messages.get(m.id)!==m||deletedMessages.has(m.id)||m.expiresAt<=Date.now())throw new Error('This file has expired or was deleted.');
        if(!local)cacheNotice(writer?await writer.commit():false);break;
      }catch(error){
        await writer?.abort();writer=null;
        if(!local||state.controller.signal.aborted||m.expiresAt<=Date.now()||messages.get(m.id)!==m)throw error;
        pieces=[];await cachedMedia.evict(owner,m.id);reader=null;local=false;
      }
    }
    state.controller.signal.throwIfAborted();
    if(m.expiresAt<=Date.now()||messages.get(m.id)!==m)throw new Error('This file has expired or was deleted.');
    const blob=new Blob(pieces,{type:mediaKind(a.type)==='file'?'application/octet-stream':a.type});m.blob=blob;m.blobURL=URL.createObjectURL(blob);
    if(!automatic){if(mediaKind(a.type)==='file')saveAttachment(m);else openViewer(m);}
  }catch(e){if(e.name!=='AbortError'){m.loadError=e.message;if(!automatic)toast(e.message);}}
  finally{pieces=[];await writer?.abort();m.loading=false;endTransfer(state);if(selected&&[m.from,m.to].includes(selected.id))renderMessages();}
}
function closeViewer(){
  for(const media of $('media-content').querySelectorAll('audio,video')){media.pause();media.removeAttribute('src');media.load();}
  $('media-content').replaceChildren();$('media-error').replaceChildren();viewerMessage=null;if($('media-viewer').open)$('media-viewer').close();
}
async function openViewer(m){
  await markMessageViewed(m);
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
  if(selected.request)return toast('Files and media are available once the contact request is accepted.');
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
const actions=messageActions({messages:()=>messages,self:()=>device?.user.id,contacts:()=>(device?.contacts||[]).map(c=>({...c,name:contactName(device,c)})),peer:()=>selected,render:renderMessages,event:sendMessageEvent,sendText:sendTextTo,sendFile,load:loadAttachment,remove:async m=>{await api(`/messages/${m.id}`,'DELETE');rememberDeletion(m.id,m.expiresAt);},toast,emoji:chooseEmoji});
let eventChain=Promise.resolve(),receiptWanted=new Map(),visibleSince=new Map(),pendingMessageEvents=new Map(),receiptTimer,receiptsBusy=false,hydratingMessages=false;
async function acceptMessageEvent(update){
  if(document.visibilityState!=='visible'&&update?.envelope){
    const e=update.envelope,peerId=e.from===device.user.id?e.to:e.from,peer=device.contacts.find(c=>c.id===peerId);
    if(peer)await open(device.identity,device.user.id,peer,e);return;
  }
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
  const ttl=m.lifetime||isPermanent(m.expiresAt)?0:Math.floor((m.expiresAt-Date.now()-100)/1000*1000)/1000;
  const envelope=await seal(device.identity,device.user.id,peer,{kind:`message-${kind}`,target:m.id,...data},ttl);
  if(envelope.expiresAt>m.expiresAt)throw new Error('Try the update again');return {target:m.id,kind,envelope};
}
function sendMessageEvent(m,kind,data){
  const task=eventChain.catch(()=>{}).then(async()=>{const update=await eventEnvelope(m,kind,data);await api('/message-events','POST',{events:[update]});await acceptMessageEvent(update);});eventChain=task;return task;
}
function queueReceipts(){if(!hydratingMessages&&!receiptTimer&&document.visibilityState==='visible')receiptTimer=setTimeout(()=>{receiptTimer=null;void pumpReceipts();},350);}
let viewPumping=false,viewRetryAt=0,viewNextScan=0;
async function markMessageViewed(m){
  if(!m?.lifetime||m.from===device?.user.id||m.viewedAt||m.expiresAt<=Date.now()||messages.get(m.id)!==m)return;
  const state=await messenger.markViewed(m.id);if(!state)return;
  if(messages.get(m.id)===m){
    m.expiresAt=state.expiresAt;m.viewedAt=state.viewedAt;
    m.receipt={...m.receipt,deliveredAt:m.receipt?.deliveredAt||state.deliveredAt,readAt:state.viewedAt};
    await cachedMedia.startTimer(device.user.id,m);
    if(transfer?.messageId===m.id){transfer.cancelExpiry?.();transferExpiry(transfer,m.expiresAt);}
    if(selected?.id===m.from&&document.visibilityState==='visible')renderMessages();
  }
  void pumpViewOutbox(true);
}
async function pumpViewOutbox(force=false){
  if(force)viewNextScan=0;
  if(viewPumping||!device?.user||document.visibilityState!=='visible'||Date.now()<viewRetryAt||Date.now()<viewNextScan)return;
  viewPumping=true;viewNextScan=Date.now()+60000;let notified=false;
  try{
    for(const value of await messenger.pendingViews()){
      const peer=device.contacts.find(p=>p.id===value.from);if(!peer)continue;
      let update;
      try{
        const envelope=await messenger.viewReceipt(value,peer);update={target:value.id,kind:'read',envelope};
        await api('/message-events','POST',{events:[update]});
      }catch(error){
        if(update&&[404,410].includes(error.status)){await messenger.ackView(value.id,update.envelope.id);notified=true;continue;}
        viewRetryAt=Date.now()+3000;viewNextScan=viewRetryAt;break;
      }
      await messenger.ackView(value.id,update.envelope.id);notified=true;await acceptMessageEvent(update);
    }
    if(notified)await messenger.purge();
  }catch{viewRetryAt=Date.now()+3000;viewNextScan=viewRetryAt;}finally{viewPumping=false;if(!viewNextScan)queueMicrotask(()=>void pumpViewOutbox());}
}
async function pumpReceipts(){
  if(receiptsBusy||hydratingMessages||!device?.user||document.visibilityState!=='visible')return;
  receiptsBusy=true;let failed=false;
  try{
    const now=Date.now(),bounds=$('messages').getBoundingClientRect(),openChat=selected&&!$('conversation').classList.contains('hidden')&&bounds.height>0&&$('call-screen').classList.contains('hidden')&&!document.querySelector('dialog[open]');
    const rows=new Map([...$('messages').children].map(e=>[e.dataset.key,e]));
    for(const m of messages.values()){
      if(m.from===device.user.id||m.expiresAt-now<300)continue;
      if(device.contacts.find(peer=>peer.id===m.from)?.request)continue;
      const wanted=receiptWanted.get(m.id)||{deliveredAt:m.receipt?.deliveredAt||m.receivedLocally||Math.max(m.createdAt,now)};
      const rect=rows.get(m.id)?.querySelector('.message')?.getBoundingClientRect(),visible=openChat&&m.from===selected.id&&rect&&Math.min(rect.bottom,bounds.bottom)>Math.max(rect.top,bounds.top)&&rect.right>bounds.left&&rect.left<bounds.right;
      if(visible){
        if(!visibleSince.has(m.id))visibleSince.set(m.id,now);
        if(now-visibleSince.get(m.id)>=300){
          if(m.lifetime)await markMessageViewed(m);
          else if(!m.receipt?.readAt)wanted.readAt ||=Math.max(wanted.deliveredAt,now);
        }
      }else visibleSince.delete(m.id);
      if(!m.receipt?.deliveredAt||wanted.readAt&&!m.receipt.readAt)receiptWanted.set(m.id,wanted);else receiptWanted.delete(m.id);
    }
    const updates=[];
    for(const [id,wanted]of receiptWanted){
      const m=messages.get(id);if(!m||m.expiresAt-Date.now()<300){receiptWanted.delete(id);continue;}
      if(updates.length===20)break;
      try{updates.push(await eventEnvelope(m,wanted.readAt?'read':'receipt',wanted));}catch{receiptWanted.delete(id);}
    }
    if(updates.length){try{await api('/message-events','POST',{events:updates});for(const update of updates)await acceptMessageEvent(update);}catch{failed=true;}}
  }catch{failed=true;}finally{receiptsBusy=false;}
  if(failed&&!receiptTimer&&document.visibilityState==='visible')receiptTimer=setTimeout(()=>{receiptTimer=null;void pumpReceipts();},3000);
}
async function sendTextTo(peer,text,extra={}){await acceptContact(peer);const envelope=await seal(device.identity,device.user.id,peer,{kind:'text',text,...extra},timerFor(peer.id),{perView:true});await api('/messages','POST',envelope);await acceptMessage(envelope);}
async function sync(){
  const me=await api('/me');await pinContacts(me.contacts);
  for(const d of await api('/message-deletions'))rememberDeletion(d.id,d.expires);
  hydratingMessages=true;
  try{const saved=await api('/messages');
  for(const e of orderedEnvelopes(saved))try{await acceptMessage(e,true);}catch{toast('An encrypted message could not be verified.');}
  const updates=await api('/message-events'),byId=new Map(updates.map(u=>[u.envelope.id,u]));
  for(const e of orderedEnvelopes(updates.map(u=>u.envelope)))try{await acceptMessageEvent(byId.get(e.id));}catch{toast('A message update could not be verified.');}
  }finally{hydratingMessages=false;}
  if(selected)renderMessages();openMessageNotice();queueReceipts();void pumpViewOutbox(true);
}
async function connect(){
  clearTimeout(reconnectTimer);if(!device?.token||connecting||ws?.readyState===0||ws?.readyState===1)return;connecting=true;
  try{
    const ticket=await api('/ticket','POST',{});
    const socket=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}${base}/ws`);ws=socket;
    socket.onopen=()=>{if(ws===socket)socket.send(JSON.stringify({type:'auth',ticket:ticket.ticket}));};
    socket.onmessage=async event=>{if(ws!==socket)return;let b;try{
      b=JSON.parse(event.data);
      if(b.type==='ready'){const recoveringPhone=phone;connected(true);reconnectAttempt=0;await sync();if(ws!==socket)return;if(recoveringPhone&&phone===recoveringPhone)await recoveringPhone.restart();if(ws!==socket)return;clearInterval(heartbeat);heartbeat=setInterval(()=>{if(ws===socket&&wsReady&&socket.readyState===1)socket.send(JSON.stringify({type:'ping'}));},25000);}
      else if(b.type==='transfer')await receiveTransfer(b);
      else if(b.type==='transfer-ended'){if(pendingTransfers.delete(b.id)&&selected)renderMessages();}
      else if(b.type==='message')await acceptMessage(b.envelope);
      else if(b.type==='message-event')await acceptMessageEvent(b);
      else if(b.type==='message-deleted')rememberDeletion(b.id,b.expires);
      else if(b.type==='typing')await receiveTyping(b.envelope);
      else if(b.type==='contacts')await sync();
      else if(b.type==='secure-keys-needed')await messenger.publish();
      else if(b.type==='signal')await receiveSignal(b);
      else if(['busy','call-ended','call-expired','call-answered','error'].includes(b.type))await callInbox(()=>{
        if(ws!==socket||b.callId&&b.callId!==call?.id)return;
        if(b.type==='busy')finishCall('They’re on another call. Try again later.');
        else if(b.type==='call-ended')finishCall(b.reason||'Call ended');
        else if(b.type==='call-expired')finishCall('No answer. Try again later.');
        else if(b.type==='call-answered'){if(call&&!call.caller)finishCall('Answered in another tab.');}
        else if(b.error==='Unknown call'&&b.callId)finishCall('This call is no longer available. Try calling again.');
        else toast(b.error);
      });
    }catch(e){
      if(ws!==socket||e.message==='Expired')return;
      if(b?.type==='signal'){
        if(e.callVerification)toast('A call update could not be authenticated. Keep your saved identity and verify the contact.');
        else if(call?.id===b.callId){updateCall({warning:'Call connection update failed. Reconnecting…'});void phone?.restart();}
      }else toast(b?.type==='ready'||b?.type==='contacts'?'Could not refresh conversations. Reconnecting…':'An encrypted update could not be verified.');
    }};
    socket.onerror=()=>{};socket.onclose=()=>{if(ws!==socket)return;connected(false);clearInterval(heartbeat);scheduleReconnect();};
  }catch{connected(false);scheduleReconnect();}finally{connecting=false;}
}
function scheduleReconnect(){clearTimeout(reconnectTimer);if(!device)return;reconnectTimer=setTimeout(connect,Math.min(20000,1000*2**Math.min(5,reconnectAttempt++))+Math.random()*400);}
async function signal(kind,payload){
  return sendCallSignal(kind,payload);
}
function unlockSound(){
  const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
  try{
    soundContext ||= new AC();
    const status=()=>{$('ringing-status').textContent=soundContext.state==='running'?'Ringing is on while this page is active.':'Ringing is on. Tap anywhere to activate browser sound.';};
    soundContext.onstatechange=status;void soundContext.resume().then(status).catch(status);status();
  }catch{}
}
function ring(){ringer.start();}
function ringBurst(){
    const audible=soundContext?.state==='running';$('hear-ringing').classList.toggle('hidden',audible);
    if(!audible)return;
    // Two smooth, dual-tone bursts followed by a pause: a recognisable phone cadence.
    for(const delay of [0,.65])for(const frequency of [440,480]){
      const oscillator=soundContext.createOscillator(),gain=soundContext.createGain(),start=soundContext.currentTime+delay;
      oscillator.frequency.value=frequency;gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.07,start+.025);gain.gain.setValueAtTime(.07,start+.4);gain.gain.linearRampToValueAtTime(0,start+.45);
      oscillator.connect(gain).connect(soundContext.destination);ringNodes.add(oscillator);oscillator.onended=()=>{ringNodes.delete(oscillator);oscillator.disconnect();gain.disconnect();};oscillator.start(start);oscillator.stop(start+.46);
    }
    if(document.visibilityState==='visible')navigator.vibrate?.([450,200,450]);
}
function silenceRing(){for(const oscillator of ringNodes){try{oscillator.stop();}catch{}}ringNodes.clear();$('hear-ringing').classList.add('hidden');navigator.vibrate?.(0);}
function stopRing(){ringer.stop();}
function showCall(incoming=false){
  timerUi.dismiss();
  $('answer').disabled=!wsReady;
  dialUi.close();$('dial-settings-dialog').close();$('contact-options-dialog').close();$('remove-contact-dialog').close();
  actions.reset();alerts.close();locationShare.close();$('attachment-dialog').close();$('audio-output-dialog').close();$('return-call').classList.add('hidden');$('settings-dialog').close();stopTyping();captures.close();closeViewer();$('draft-dialog').close();$('emoji-dialog').close();
  $('call-screen').classList.remove('hidden');$('call-screen').classList.remove('has-video');$('call-name').textContent=contactName(device,call.peer);$('call-avatar').textContent=initials(contactName(device,call.peer));
  $('call-screen').classList.remove('call-connected','has-remote-video');$('call-peer-top').textContent=contactName(device,call.peer);$('switch-camera').classList.add('hidden');
  renderCallSas('pending');
  $('call-status').textContent=incoming?(call.video?'Incoming video call':'Incoming voice call'):'Calling…';$('call-duration').textContent='';for(const id of ['call-rate','call-audio-codec','call-video-codec']){$(id).textContent='';$(id).classList.add('hidden');} $('call-quality').textContent='Voice first';$('call-warning').textContent='';
  $('incoming-actions').classList.toggle('hidden',!incoming);$('active-actions').classList.toggle('hidden',incoming);$('mute').classList.remove('selected');$('speaker').classList.remove('selected');$('speaker').setAttribute('aria-pressed','false');$('speaker').classList.toggle('hidden',call.video);cameraButton(call.video);$('mute').ariaLabel='Mute microphone';renderOutput();renderCallMetrics();$('play-audio').classList.add('hidden');
}
async function createPhone(video,caller){
  const current=call,id=current.id;
  const ice=await api('/ice');
  if(call?.id!==id)throw new Error('Call cancelled');
  if(!ice.turn)$('call-warning').textContent='Relay is not configured. Calls across some networks may fail.';
  const active=new Phone({signal:(kind,payload)=>call===current?signal(kind,payload):Promise.resolve(),update:update=>{if(call===current&&phone===active)updateCall(update);},remote:$('remote-media'),local:$('local-media'),ended:reason=>{if(call===current&&phone===active)void endCall(reason);},preference});phone=active;active.refreshIce=()=>api('/ice');
  active.remoteCodecs=current.codecs;active.remoteMode=current.mode;await active.prepare(ice,video,caller);
  if(call!==current){active.close();return;}if(transfer?.callId)await shareCall(transfer);if(call!==current)return;void output.start(video).catch(()=>{});
  for(const c of pendingCandidates.get(id)||[]){if(call!==current)return;await active.candidate(c);}pendingCandidates.delete(id);
}
function updateCall(update){
  if(!call)return;
  if(update.connected||update.state==='connected')stopRing();
  if(update.state)$('call-status').textContent={new:'Connecting…',connecting:'Connecting…',connected:'Connected',disconnected:'Reconnecting…',failed:'Reconnecting…'}[update.state]||update.state;
  if(update.connected&&!call.started){
    call.started=Date.now();if(transfer?.callId===call.id)void signal('sharing',{active:true}).catch(()=>{});clearInterval(callTicker);callTicker=setInterval(()=>{if(!call)return;const sec=Math.floor((Date.now()-call.started)/1000);$('call-duration').textContent=`${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`;},1000);
    navigator.wakeLock?.request('screen').then(lock=>wakeLock=lock).catch(()=>{});
  }
  if(update.state)$('call-screen').classList.toggle('call-connected',update.state==='connected');
  if(update.connected)$('call-screen').classList.add('call-connected');
  if(update.connected||update.state==='connected')void prepareCallSas();
  if(update.remoteVideo!==undefined)call.remoteVideo=update.remoteVideo;
  if(update.localVideo!==undefined||update.remoteVideo!==undefined)videoLayout();
  if(update.cameraFacing){$('local-media').dataset.facing=update.cameraFacing;$('switch-camera').ariaLabel=update.cameraFacing==='environment'?'Switch to front camera':'Switch to back camera';}
  if(update.label){$('call-quality').title=update.label;$('call-quality').textContent={wifi:'Wi-Fi · clear',saver:'Data saver',weak:'Weak · voice first',critical:'Very weak'}[update.profile]||update.label;}
  if(update.videoPaused)$('call-quality').textContent='Weak · video paused';
  if(update.sharing&&!update.videoPaused)$('call-quality').textContent='Sharing · voice first';
  if(update.warning!==undefined)$('call-warning').textContent=update.warning;
  if(update.needsPlayback)$('play-audio').classList.remove('hidden');
  if(update.stats){const s=update.stats;call.stats=s;renderCallMetrics();$('call-stats').textContent='Adapts to your connection';if($('settings-dialog').open)$('diagnostic-result').textContent=`${formatRate(s.kbps)||'Measuring…'} media · ${Math.round(s.rtt*1000)} ms · ${Math.round(s.loss*100)}% loss${s.relay?' · relayed':' · direct'}`;}
}
function renderCallSas(state,words=''){
  const node=$('call-sas');node.dataset.state=state;
  node.textContent=state==='ready'?words:state==='pending'?'Call words · preparing…':'Call words unavailable';
  node.setAttribute('aria-label',state==='ready'?`Compare these four call words aloud: ${words}`:node.textContent);
  node.title=state==='ready'?'Read all four words to each other. Matching words check this call’s connection. No confirmation is required.':'Optional call comparison; the call works without it.';
}
function clearCallSas(){
  call?.sas?.close();if(call){call.sas=null;call.sasInbox=[];}
  $('call-sas').textContent='';$('call-sas').removeAttribute('aria-label');$('call-sas').title='';delete $('call-sas').dataset.state;
}
async function prepareCallSas(){
  const current=call,pc=phone?.pc;
  if(!current||!pc||pc.connectionState!=='connected')return;
  if(current.sasUpdating){current.sasQueued=true;return;}
  if(!current.sasSupported){renderCallSas('unavailable');return;}
  current.sasUpdating=true;
  try{
    const media=JSON.stringify([mediaFingerprints(pc.localDescription?.sdp),mediaFingerprints(pc.remoteDescription?.sdp)]);
    if(current.sasMedia===media)return;
    current.sas?.close();current.sas=null;current.sasMedia=media;renderCallSas('pending');
    const context=await callSasContext({callId:current.id,caller:current.caller,local:device.user,remote:current.peer,localSdp:pc.localDescription.sdp,remoteSdp:pc.remoteDescription.sdp});
    if(call!==current||phone?.pc!==pc)return;
    if(media!==JSON.stringify([mediaFingerprints(pc.localDescription?.sdp),mediaFingerprints(pc.remoteDescription?.sdp)])){current.sasQueued=true;return;}
    const check=callSas({context,initiator:current.caller,send:sas=>call===current&&current.sas===check?signal('sas',{sas}):Promise.reject(new Error('Call ended')),update:state=>{if(call===current&&current.sas===check)renderCallSas(state.state,state.words);}});
    current.sas=check;await check.start();
    for(const frame of current.sasInbox?.splice(0)||[])await check.receive(frame);
  }catch{
    if(call===current){current.sas?.close();current.sas=null;renderCallSas('unavailable');}
  }finally{current.sasUpdating=false;if(current.sasQueued){current.sasQueued=false;if(call===current)void prepareCallSas();}}
}
function renderCallMetrics(){
  const s=call?.stats||{},video=!!(phone?.videoWanted||call?.remoteVideo);
  $('call-rate').classList.add('hidden');
  for(const [kind,visible]of [['audio',true],['video',video]]){
    const node=$('call-'+kind+'-codec'),codec=s[kind+'Codec'],rate=formatRate(s[kind+'Kbps']);
    node.replaceChildren();
    node.innerHTML=`<svg aria-hidden="true" viewBox="0 0 24 24">${icons[kind==='audio'?'mic':'video']}</svg>`;
    const name=document.createElement('span'),speed=document.createElement('span'),unit=document.createElement('span');name.className='codec-name';speed.className='codec-rate';unit.className='codec-unit';name.textContent=`${kind==='audio'?'Voice':'Video'} · ${codec||'Connecting'}`;const parts=rate.split(' ');speed.textContent=parts[0]||'—';unit.textContent=parts[1]||'';node.append(name,speed,unit);node.setAttribute('aria-label',`${kind==='audio'?'Voice':'Video'} ${codec||'connecting'}, ${rate||'measuring'}`);node.classList.toggle('hidden',!visible);
    node.title=`Send ${formatRate(s[kind+'UploadKbps'])||'—'} · Receive ${formatRate(s[kind+'DownloadKbps'])||'—'}; codec payload including retransmissions, excludes network headers, TURN overhead and file transfers`;
  }
}
let startingCall=false;
async function startCall(video=true){
  unlockSound();if(!selected||call)return;if(!wsReady)return toast('Wait for the connection to return.');
  if(startingCall)return;
  if(selected.request==='incoming'){const peer=selected;startingCall=true;try{await acceptContact(peer);}catch(error){return toast(error.message);}finally{startingCall=false;}if(call||selected?.id!==peer.id)return;}
  const id=crypto.randomUUID();call={id,peer:selected,video,caller:true};showCall();
  try{await createPhone(video,true);if(call?.id!==id)return;const description=await phone.description('offer');if(call?.id!==id)return;await signal('offer',{description,video,codecs:phone.codecSummary,mode:phone.localMode(),sasVersion:1});if(call?.id!==id)return;call.timeout=setTimeout(()=>{if(call?.id===id&&!call.started)void endCall('No answer. Try again later.');},90000);}
  catch(e){if(call?.id===id)finishCall(e.name==='NotAllowedError'?'Allow microphone access to make calls.':e.message);}
}
function receiveSignal(b){return callInbox(()=>processSignal(b));}
async function processSignal(b){
  if(seenSignals.has(b.envelope.id))return;
  // Each call has its own ratchet scope. Late traffic for a finished call
  // cannot update the current call and need not consume old transport keys.
  if(b.kind!=='offer'&&b.callId!==call?.id)return;
  let peer=device.contacts.find(c=>c.id===b.envelope.from);
  if(!peer){await pinContacts((await api('/me')).contacts);peer=device.contacts.find(c=>c.id===b.envelope.from);}if(!peer)return;
  let payload;
  try{payload=await open(device.identity,device.user.id,peer,b.envelope);}
  catch(error){throw Object.assign(error,{callVerification:true});}
  if(!device.contacts.some(c=>c.id===peer.id)||payload.kind!==b.kind||payload.callId!==b.callId)return;
  seenSignals.add(b.envelope.id);if(seenSignals.size>2000)seenSignals.delete(seenSignals.values().next().value);
  if(b.kind==='offer'){
    if(call?.id===b.callId)return;if(call)return;
    if(payload.description?.type!=='offer')throw new Error('Invalid call offer');
    call={id:b.callId,peer,video:!!payload.video,caller:false,offer:payload.description,codecs:payload.codecs,mode:payload.mode,sasSupported:payload.sasVersion===1};showCall(true);ring();
    call.timeout=setTimeout(()=>{if(call?.id===b.callId&&!call.started)finishCall('Missed call');},Math.max(1,b.envelope.expiresAt-Date.now()));void tryNotificationAnswer();return;
  }
  if(b.kind==='ice'){
    if(phone&&call?.id===b.callId)await phone.candidate(payload.candidate);
    else{if(pendingCandidates.size>10)pendingCandidates.clear();const list=pendingCandidates.get(b.callId)||[];if(list.length<80)list.push(payload.candidate);pendingCandidates.set(b.callId,list);}return;
  }
  if(call?.id!==b.callId)return;
  const current=call,active=phone;
  if(b.kind==='answer'){if(!current.caller||!active||payload.description?.type!=='answer')return;stopRing();clearTimeout(current.timeout);current.sasSupported=payload.sasVersion===1;active.setRemoteMode(payload.mode);const changed=active.setVideoPreferences(payload.codecs);await active.receive(payload.description);if(call!==current)return;await active.replayCandidates();if(call!==current)return;if(changed)void active.restart();void prepareCallSas();}
  else if(b.kind==='sas'){
    if(!call.sasSupported||b.envelope.v!==2)return;
    if(call.sas)void call.sas.receive(payload.sas);
    else{call.sasInbox ||= [];if(call.sasInbox.length<12)call.sasInbox.push(payload.sas);}
  }
  else if(b.kind==='hangup')finishCall(payload.reason||'Call ended');
  else if(b.kind==='restart'){
    // A caller may retry while the recipient is still granting microphone
    // access. The original offer remains pending; do not negotiate over it.
    if(!active||!current.caller&&!current.answerSent)return;
    if(payload.request){if(current.caller)await active.restart();}
    else if(payload.description){
      if(payload.description.type!==(current.caller?'answer':'offer'))return;
      active.setRemoteMode(payload.mode);active.setVideoPreferences(payload.codecs);await active.receive(payload.description);if(call!==current)return;
      if(payload.description.type==='offer'){const description=await active.description('answer');if(call!==current)return;await signal('restart',{description,codecs:active.codecSummary,mode:active.localMode()});}
      if(call!==current)return;await active.replayCandidates();if(call===current)void prepareCallSas();
    }
  }
  else if(b.kind==='sharing'){await phone?.setRemoteSharing(payload.active===true);}
  else if(b.kind==='video'){phone?.setRemoteMode(payload.mode);call.remoteVideo=!!payload.enabled;videoLayout();}
}
async function openNotifiedCall(offer){
  if(call&&call.id!==offer.callId){toast('You are already on another call.');return;}
  if(!call)await receiveSignal(offer);
  // Only the existing signed/encrypted offer can create this call. A link never
  // creates an answer intent or requests microphone/camera access.
  if(call?.id!==offer.callId||call.caller||call.started||!call.offer)throw new Error('Call unavailable');
  $('call-screen').classList.remove('hidden');$('return-call').classList.add('hidden');
}
async function consumeMessageNotice(){
  if(!device?.user||document.visibilityState!=='visible')return;const intent=await chatNotificationIntents.take(device.user.id);if(!intent)return;pendingMessageNotice=intent;
  try{if(wsReady)await sync();else await connect();}catch{ /* Keep this short-lived decision for the next successful sync. */ }
}
function openMessageNotice(){
  if(!pendingMessageNotice||!device||document.visibilityState!=='visible')return;const intent=pendingMessageNotice;pendingMessageNotice=null;
  const target=resolveMessageIntent(intent,messages,device.contacts,device.user.id);if(!target)return toast('This conversation is no longer available.');
  if(call){$('call-screen').classList.add('hidden');$('return-call').classList.remove('hidden');}selectContact(target.peer);
  if(target.message)jumpMessage(target.message.id);else toast('That message has expired or was deleted.');
}
async function consumeNotificationAnswer(){
  if(!device?.user||document.visibilityState!=='visible')return;
  const intent=await notificationIntents.take(device.user.id);if(intent)pendingAnswer=intent;await tryNotificationAnswer();
}
async function tryNotificationAnswer(){
  if(!pendingAnswer||pendingAnswer.expiresAt<=Date.now()){pendingAnswer=null;return;}
  if(document.visibilityState!=='visible'||!call?.offer||call.caller||call.answering||call.started||call.id!==pendingAnswer.callId)return;
  const id=call.id,expiresAt=pendingAnswer.expiresAt;pendingAnswer=null;
  try{const status=await api(`/calls/${id}`);if(call?.id===id&&!call.answering&&document.visibilityState==='visible'&&expiresAt>Date.now()&&status.state==='ringing'&&status.canAnswer)await answerCall();}catch{ /* The visible Answer button remains available. */ }
}
async function declineCall(){
  if(!call||call.caller||call.started||call.answering)return;
  const id=call.id;try{await api(`/calls/${id}/decline`,'POST');if(call?.id===id)finishCall('Call declined');}
  catch{if(call?.id===id){if(wsReady)await endCall('Call declined');else toast('Could not reach the server to decline. Try again when connected.');}}
}
async function answerCall(){
  unlockSound();if(!call||!call.offer||call.answering||call.started)return;if(!wsReady){toast('Connecting to the call. Please try Answer in a moment.');void connect();return;}call.answering=true;stopRing();$('incoming-actions').classList.add('hidden');$('active-actions').classList.remove('hidden');$('call-status').textContent='Connecting…';
  const id=call.id;
  try{await acceptContact(call.peer);if(call?.id!==id)return;await createPhone(call.video,false);if(call?.id!==id)return;await phone.receive(call.offer);if(call?.id!==id)return;const description=await phone.description('answer');if(call?.id!==id)return;await signal('answer',{description,codecs:phone.codecSummary,mode:phone.localMode(),sasVersion:1});if(call?.id!==id)return;call.answerSent=true;navigator.serviceWorker?.controller?.postMessage({type:'call-ended',callId:id});await phone.replayCandidates();if(call?.id!==id)return;clearTimeout(call.timeout);void prepareCallSas();}
  catch(e){if(call?.id===id)await endCall(e.name==='NotAllowedError'?'Allow microphone access to answer.':e.message);}
}
function finishCall(reason='Call ended'){
  pendingAnswer=null;void notificationIntents.clear();
  if(call)call.ending=true;
  clearCallSas();if(call){clearTimeout(call.timeout);navigator.serviceWorker?.controller?.postMessage({type:'call-ended',callId:call.id});}stopRing();clearInterval(callTicker);phone?.close();phone=null;call=null;pendingCandidates.clear();wakeLock?.release().catch(()=>{});wakeLock=null;
  output.stop();$('audio-output-dialog').close();$('return-call').classList.add('hidden');$('call-screen').classList.add('hidden');queueMicrotask(pumpMedia);if(reason)toast(reason);
  if(device?.needsDialAlerts&&!device.alertsConfirmedAt){device.needsDialAlerts=false;void vault('put',device);setTimeout(()=>{if(!call&&document.visibilityState==='visible')void alerts.show();},500);}
}
async function endCall(reason='Call ended'){const current=call;if(!current)return;current.ending=true;stopRing();try{await signal('hangup',{reason});}catch{}if(call===current)finishCall(reason);}
function invite(){
  if(!device)return;$('invite-name').value='';$('invite-result').classList.add('hidden');$('invite-form').classList.remove('hidden');$('invite-dialog').showModal();$('invite-name').focus();
}
$('invite-form').onsubmit=async event=>{
  event.preventDefault();$('create-invite').disabled=true;
  try{const result=await api('/invite','POST',{name:$('invite-name').value.trim()});$('invite-link').value=result.url;$('invite-form').classList.add('hidden');$('invite-result').classList.remove('hidden');}
  catch(e){toast(e.message);}finally{$('create-invite').disabled=false;}
};
async function settingsDialog(){
  $('settings-self-name').textContent=device?.user?.name||'Your phone';$('settings-self-avatar').textContent=initials(device?.user?.name||'You');
  $('message-timer-value').textContent=selected?timerLabel(timerFor(selected.id)):'';$('message-timer').disabled=!selected;
  $('message-timer-context').textContent=selected?'New messages you send to '+contactName(device,selected):'Open a chat to choose its timer';
  $('rename-selected-contact').classList.toggle('hidden',!selected);$('settings-dialog').showModal();
}
async function boot(){
  try{
    if(!window.isSecureContext||!crypto.subtle)throw new Error('Open this phone over HTTPS to use secure calls.');
    [config,device]=await Promise.all([api('/config'),vault('get')]);
    $('dial-open').classList.toggle('hidden',!config.dialCodes);$('dial-settings').classList.toggle('hidden',!config.dialCodes);
    $('extra-ringing').classList.toggle('hidden',!config.ntfyAvailable);$('alerts-extra').classList.toggle('hidden',!config.ntfyAvailable);
    if(device)ownerSetup=null;
    if(invitation&&(device?.homeInviteStamp===await fingerprint(invitation)||device?.acceptedInvites?.includes(await fingerprint(invitation)))){invitation=null;clearEntryFragment(location,history);}
    if(invitation||!device?.user){
      if(invitation){
        const [token,fp]=invitation.split('.');
        $('setup-label').classList.add('hidden');$('join-button').firstChild.textContent='Accept invitation';
        $('welcome-title').textContent='You’re invited. Say hello.';
        try{const info=await api('/invite-info','POST',{invite:token,fingerprint:fp});$('welcome-title').textContent=info.from+' invited you';$('name-input').value=info.name||'';}catch(e){$('welcome-error').textContent=e.message;$('join-button').disabled=true;}
        $('welcome-text').textContent='Accept to connect, then we’ll help your phone make a sound when someone calls. Your name is optional.';
        if(phonePlatform().needsHomeScreen){$('join-button').firstChild.textContent='Continue';$('welcome-text').textContent='One small setup step will let your iPhone hear call alerts when it is closed. Tap Continue and we’ll guide you.';}
      }
      else if(!config.bootstrap){ownerSetup=null;$('welcome-title').textContent=config.dialCodes?'Who would you like to reach?':'A place for your people.';$('welcome-text').textContent=config.dialCodes?'Dial their calling code to call or message them. Your phone will remember your conversation.':'Open an invitation from someone you know.';$('name-label').classList.add('hidden');$('setup-label').classList.add('hidden');$('join-button').classList.add('hidden');$('welcome-dial').classList.toggle('hidden',!config.dialCodes);$('paste-invitation').classList.remove('hidden');}
      else if(ownerSetup){$('name-input').value=ownerName;$('setup-code').value=ownerSetup;$('setup-label').classList.add('hidden');$('welcome-text').textContent='Your private setup link is ready. Choose your name and set up this phone.';$('join-button').firstChild.textContent='Set up this phone';}
      $('welcome-dialog').showModal();
      if(!device?.user){startupStatus('setup');if(extraAlertEntry)await extraRinging.resume();else if(initialDialCode&&config.dialCodes)dialUi.show(initialDialCode);return;}
    }
    await ready();if(!invitation){alerts.resume(alertTestEntry);await extraRinging.resume();if(initialDialCode&&config.dialCodes)dialUi.show(initialDialCode);}
  }catch(e){toast(e.message);$('connection').textContent='Unable to connect';startupStatus('failed',e.message+' Reload to try again. Keep this browser’s site data.');}
}
async function ready(){
  await messenger.initialize(device);
  phoneInitialized=true;
  $('self-name').textContent=device.user.name;$('self-avatar').textContent=initials(device.user.name);renderContacts();await consumeNotificationAnswer();await consumeMessageNotice();await connect();startupStatus('ready');
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
    const wasInvitation=!!invitation,homeInviteStamp=device?.homeInviteStamp||(!device?.user&&phonePlatform().standalone&&invitation?await fingerprint(invitation):null);device={...device,identity,token:result.token||device?.token,user:result.user,contacts:result.contacts,pins:device?.pins||{},acceptedInvites:acceptedInvites.slice(-20),homeInviteStamp};delete device.dialEnrollment;delete device.enrollmentName;await pinContacts(result.contacts);ownerSetup=null;invitation=null;clearEntryFragment(location,history);$('setup-code').value='';$('welcome-dialog').close();await ready();if(result.contact)selectContact(result.contact);if(wasInvitation)await alerts.show();
  }catch(e){$('welcome-error').textContent=e.message;}finally{$('join-button').disabled=false;}
};
$('welcome-dialog').addEventListener('cancel',e=>e.preventDefault());
$('invite').onclick=invite;$('empty-invite').onclick=invite;$('settings').onclick=settingsDialog;$('chat-settings').onclick=settingsDialog;
$('dial-open').onclick=()=>dialUi.show();$('welcome-dial').onclick=()=>dialUi.show(initialDialCode||'');
$('dial-settings').onclick=()=>{$('settings-dialog').close();void dialUi.showSettings();};
$('accept-contact').onclick=async()=>{try{await acceptContact(selected);}catch(error){toast(error.message);}};
$('block-request').onclick=()=>{if(selected)showContactOptions(selected,true);};
$('rename-selected-contact').onclick=()=>{if(selected)editContactName(selected);};
$('contact-options-dialog').addEventListener('close',()=>{contactToRename=null;$('contact-name').value='';});
$('reset-contact-name').onclick=()=>{if(contactToRename)$('contact-name').value=contactToRename.name;};
$('remove-contact').onclick=()=>{const c=contactToRename;$('contact-options-dialog').close();if(c)showContactOptions(c);};
$('contact-name-form').onsubmit=async event=>{
  event.preventDefault();const c=contactToRename;if(!c)return;const prior=device.contactNames;$('save-contact-name').disabled=true;
  try{renameContact(device,c,$('contact-name').value);await vault('put',device);refreshContactNames();$('contact-options-dialog').close();toast('Contact name saved on this phone.');}
  catch(error){device.contactNames=prior;$('contact-name-error').textContent=error.message;}
  finally{$('save-contact-name').disabled=false;}
};
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
const timerUi=messageTimer({peer:()=>selected?{id:selected.id,name:contactName(device,selected)}:null,get:timerFor,save:(id,seconds)=>{settings.timers||={};settings.timers[id]=seconds;saveSettings();toast(seconds===0?'Disappearing messages off for your new messages.':'New messages disappear after '+timerLabel(seconds)+'.');},back:settingsDialog,toast});
$('message-timer').onclick=()=>timerUi.show();
$('peer-details').onclick=async()=>{if(!selected)return;$('safety-number').textContent=await safetyNumber(device.identity.keys,selected.keys);$('safety-dialog').showModal();};
$('voice').onclick=()=>startCall(false);$('video').onclick=()=>startCall(true);$('answer').onclick=answerCall;$('decline').onclick=declineCall;$('end-call').onclick=()=>endCall();
$('mute').onclick=()=>{if(phone){const muted=phone.mute();$('mute').classList.toggle('selected',muted);$('mute').ariaLabel=muted?'Unmute microphone':'Mute microphone';}};
function cameraButton(enabled){const button=$('toggle-video');button.classList.toggle('selected',!enabled);button.classList.toggle('camera-off',!enabled);button.ariaLabel=enabled?'Turn camera off':'Turn camera on';button.innerHTML=`<svg aria-hidden="true" viewBox="0 0 24 24">${icons[enabled?'video':'videoOff']}</svg>`;}
function renderOutput(){
  const button=$('speaker'),known=output.knownRoute!=='system';
  button.classList.toggle('selected',output.isSpeaker);button.classList.toggle('output-system',!output.canToggle);
  if(known)button.setAttribute('aria-pressed',String(output.isSpeaker));else button.removeAttribute('aria-pressed');
  button.ariaLabel=output.canToggle?(output.isSpeaker?'Use earpiece or headset':'Use speaker'):'Audio output: controlled by your phone';button.title=button.ariaLabel;
  button.querySelector('.output-hint')?.remove();if(!output.canToggle){const hint=document.createElement('span');hint.className='output-hint';hint.textContent='↗';hint.setAttribute('aria-hidden','true');button.append(hint);}
  if(!$('audio-output-dialog').open)return;
  const list=$('audio-output-list');list.replaceChildren();
  $('audio-output-status').textContent=output.supported&&output.items.some(d=>d.deviceId!=='default')?'Choose where you hear this call.':'Your browser does not expose an earpiece / speaker switch.';
  const help='The phone chooses its default output. This website cannot force its built-in earpiece or speaker unless the browser exposes them. A connected headset is the practical option for private calls. If your phone offers an output picker, you can use it.';
  $('audio-output-help').textContent=help;$('choose-output').classList.toggle('hidden',!output.supported||!navigator.mediaDevices?.selectAudioOutput);
  if(output.supported)for(const d of [{deviceId:'',label:'Phone / system default'},...output.items.filter(d=>d.deviceId!=='default'&&d.deviceId)]){const b=document.createElement('button');b.className='secondary full';b.textContent=d.label||'Audio device';b.setAttribute('aria-pressed',String(output.sink===d.deviceId));b.onclick=async()=>{try{if(await output.route(d.deviceId))$('audio-output-dialog').close();}catch{toast('The browser could not switch audio. Use your phone’s audio controls.');}};list.append(b);}
}
const output=new AudioOutput($('remote-media'),navigator.mediaDevices,renderOutput);
$('speaker').onclick=async()=>{if(!phone)return;try{await output.refresh();if(output.canToggle){if(await output.toggle())return;}else if(await output.choose())return;}catch{}$('audio-output-dialog').showModal();renderOutput();};
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
$('extra-ringing').onclick=()=>{$('settings-dialog').close();void extraRinging.show();};
$('alerts-extra').onclick=()=>{alerts.close();void extraRinging.show();};
$('enable-notifications').onclick=()=>{$('settings-dialog').close();void alerts.show();};
$('hear-ringing').onclick=()=>{const current=call;unlockSound();setTimeout(()=>{if(call===current&&waitingForAnswer(current))ring();},50);};
navigator.serviceWorker?.addEventListener('message',event=>{
  if(event.data?.type==='alert-opened'){if(event.data.testId)alerts.resume(event.data.testId);if(device){void consumeMessageNotice();void consumeNotificationAnswer();if(!wsReady)void connect();}}
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
  const c=contactToRemove,block=blockRemoval;if(!c)return;$('confirm-remove-contact').disabled=true;
  try{
    const result=await api(`/contacts/${c.id}${block?'?block=1':''}`,'DELETE');
    for(const m of result.deleted)rememberDeletion(m.id,m.expires);
    await clearContactHistory(c.id);await pinContacts(result.contacts);$('remove-contact-dialog').close();toast(block?'Contact blocked and shared history deleted.':'Contact and shared history deleted.');
  }catch(e){if(contactToRemove?.id===c.id){$('remove-contact-error').textContent=e.message;$('confirm-remove-contact').disabled=false;}else toast(e.message);}
};
$('confirm-forget').onclick=async()=>{
  try{await api('/device','DELETE');if(ws){ws.onclose=null;ws.close();}clearTimeout(reconnectTimer);clearInterval(heartbeat);finishCall('');transfer?.controller.abort();for(const m of messages.values())clearMessage(m);messages.clear();await cachedMedia.clear();await notificationIntents.clear();await chatNotificationIntents.clear();await messenger.forget();await vault('delete');localStorage.removeItem('ellie-settings');device=null;location.reload();}catch(e){toast(e.message);}
};
function clearMessage(m){m.reactions=null;m.receipt=null;m.versions=null;m.pinVersion=null;m.replyTo=null;if(viewerMessage?.id===m.id)closeViewer();if(m.blobURL)URL.revokeObjectURL(m.blobURL);m.blobURL=null;m.blob=null;m.location=null;m.text='';m.attachment=null;}
setInterval(()=>{if(purgeTransfers(pendingTransfers)&&selected)renderMessages();if(selected&&document.visibilityState==='visible')updateCountdowns($('messages'));for(const [id,updates]of pendingMessageEvents)if(!updates.some(e=>e.envelope.expiresAt>Date.now()))pendingMessageEvents.delete(id);queueReceipts();void pumpViewOutbox();for(const [id,expiry]of deletedMessages)if(expiry<=Date.now())deletedMessages.delete(id);for(const [id,expiry]of typingSeen)if(expiry<=Date.now())typingSeen.delete(id);renderTyping();let changed=false;for(const [id,m]of messages)if(m.expiresAt<=Date.now()){void cachedMedia.remove(device?.user.id,id,m.wireExpiresAt||m.expiresAt);if(m.lifetime){deletedMessages.set(id,m.wireExpiresAt);void messenger.purge().catch(()=>{});}clearMessage(m);messages.delete(id);receiptWanted.delete(id);visibleSince.delete(id);changed=true;}if(changed&&selected)renderMessages();},1000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&device?.user){void consumeMessageNotice();void consumeNotificationAnswer();void cachedMedia.purge();unlockSound();if(!wsReady)connect();else sync().catch(()=>{});if(call?.started)navigator.wakeLock?.request('screen').then(lock=>wakeLock=lock).catch(()=>{});}if(document.visibilityState==='hidden'){timerUi.dismiss();pendingTransfers.clear();actions.reset();clearTimeout(receiptTimer);receiptTimer=null;receiptWanted.clear();visibleSince.clear();pendingMessageEvents.clear();locationShare.close();$('attachment-dialog').close();stopTyping();typingPeers.clear();renderTyping();captures.close();closeViewer();clearDraft();$('draft-dialog').close();$('emoji-dialog').close();transfer?.controller.abort();for(const m of messages.values())clearMessage(m);messages.clear();$('messages').replaceChildren();$('pinned-message').textContent='';$('pinned-message').onclick=null;$('pinned-message').classList.add('hidden');}});
window.addEventListener('online',()=>{if(device&&!wsReady)connect();if(phone)void phone.networkChanged();});
navigator.connection?.addEventListener('change',()=>{if(phone)void phone.networkChanged();});
window.addEventListener('pagehide',()=>{clearCallSas();pendingTransfers.clear();actions.reset();clearTimeout(receiptTimer);receiptWanted.clear();visibleSince.clear();pendingMessageEvents.clear();locationShare.close();output.stop();stopTyping();captures.close();closeViewer();clearDraft();phone?.close();transfer?.controller.abort();for(const m of messages.values())clearMessage(m);messages.clear();});
unlockSound();
void boot();

document.addEventListener('close',queueReceipts,true);
