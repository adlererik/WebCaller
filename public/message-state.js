import {NO_EXPIRY} from './message-lifetime.js';
export const validMessageId=id=>typeof id==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id);
export function validReaction(emoji){
  if(emoji==='')return true;
  if(typeof emoji!=='string'||emoji.length>32||!/[\p{Extended_Pictographic}\p{Regional_Indicator}\u20e3]/u.test(emoji))return false;
  return [...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(emoji)].length===1;
}
export const compareVersion=(a,b)=>a.createdAt-b.createdAt||a.id.localeCompare(b.id);
export function messageEventLifetime(message,now=Date.now()){
  // A per-view message's wire sentinel and local countdown are different.
  // Reactions/edits bind to the original signed wire deadline; local expiry
  // still decides whether the UI is allowed to issue an update at all.
  const maxExpiry=message.wireExpiresAt??message.expiresAt;
  return {maxExpiry,ttl:maxExpiry===NO_EXPIRY?0:Math.max(0,(maxExpiry-now-100)/1000)};
}
export function applyMessageEvent(m,event,payload,now=Date.now()){
  const e=event.envelope,actor=e.from,other=actor===m.from?m.to:m.from;
  if(m.expiresAt<=now||e.expiresAt<=now||e.expiresAt>(m.wireExpiresAt||m.expiresAt)||e.createdAt<m.createdAt||e.to!==other||![m.from,m.to].includes(actor)||payload.target!==m.id||payload.kind!==`message-${event.kind}`)return false;
  const key=actor+':'+event.kind,prior=m.versions?.[key];
  if(prior&&compareVersion(e,prior)<=0)return false;
  if(event.kind==='edit'){
    if(actor!==m.from||m.location||m.attachment?.sticker||typeof payload.text!=='string'||payload.text.length>4000||!m.attachment&&!payload.text.trim())return false;
    m.text=payload.text;m.editedAt=e.createdAt;
  }else if(event.kind==='reaction'){
    if(!validReaction(payload.emoji))return false;
    m.reactions||={};if(payload.emoji)m.reactions[actor]=payload.emoji;else delete m.reactions[actor];
  }else if(event.kind==='pin'){
    if(typeof payload.pinned!=='boolean')return false;
    if(!m.pinVersion||compareVersion(e,m.pinVersion)>0){m.pinned=payload.pinned;m.pinVersion=e;}
  }else if(['receipt','read'].includes(event.kind)){
    const validTime=t=>Number.isSafeInteger(t)&&t>=m.createdAt&&t<=e.createdAt+30000&&t<m.expiresAt;
    if(event.kind==='read'&&payload.readAt===undefined)return false;
    if(actor!==m.to||!validTime(payload.deliveredAt)||payload.readAt!==undefined&&(!validTime(payload.readAt)||payload.readAt<payload.deliveredAt))return false;
    m.receipt={deliveredAt:m.receipt?.deliveredAt||payload.deliveredAt,...(m.receipt?.readAt||payload.readAt?{readAt:m.receipt?.readAt||payload.readAt}:{})};
  }else return false;
  m.versions||={};m.versions[key]={createdAt:e.createdAt,id:e.id};return true;
}
