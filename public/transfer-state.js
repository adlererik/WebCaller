import {validLifetime} from './message-lifetime.js';
import {validMessageId,compareVersion} from './message-state.js';
import {MAX_FILE_SIZE} from './attachments.js';
export function acceptTransfer(pending,envelope,payload,{self,known=new Map(),deleted=new Map(),now=Date.now()}={}){
  const a=payload?.attachment;
  if(!Number.isSafeInteger(envelope.createdAt)||!Number.isSafeInteger(envelope.expiresAt)||envelope.createdAt>now+30000||envelope.expiresAt<=envelope.createdAt||envelope.from===envelope.to||payload?.kind!=='transfer'||!validMessageId(payload.target)||!validMessageId(a?.id)||typeof a.name!=='string'||!a.name.length||a.name.length>255||typeof a.type!=='string'||a.type.length>100||!Number.isSafeInteger(a.size)||a.size<=0||a.size>MAX_FILE_SIZE||!Number.isSafeInteger(payload.createdAt)||payload.createdAt>envelope.createdAt||!Number.isSafeInteger(payload.expiresAt)||payload.expiresAt<=now||payload.expiresAt<=payload.createdAt||!validLifetime({v:2,createdAt:payload.createdAt,expiresAt:payload.expiresAt,ratchet:{lane:'files'}})||!Number.isInteger(payload.percent)||payload.percent<0||payload.percent>100||!validMessageId(envelope.id)||envelope.expiresAt<=now||envelope.expiresAt-envelope.createdAt>20000||![envelope.from,envelope.to].includes(self)||known.has(payload.target)||deleted.has(payload.target))return false;
  const old=pending.get(payload.target);
  if(old&&(old.from!==envelope.from||old.to!==envelope.to||compareVersion(envelope,old.version)<=0||old.createdAt!==payload.createdAt||old.expiresAt!==payload.expiresAt||old.attachment.id!==a.id||old.attachment.size!==a.size||old.attachment.name!==a.name||old.attachment.type!==a.type))return false;
  if(!old&&pending.size>=20)return false;
  pending.set(payload.target,{id:payload.target,from:envelope.from,to:envelope.to,createdAt:payload.createdAt,expiresAt:payload.expiresAt,attachment:{id:a.id,name:a.name,type:a.type,size:a.size},percent:Math.max(old?.percent||0,payload.percent),pending:true,lease:Math.min(envelope.expiresAt,payload.expiresAt),version:{id:envelope.id,createdAt:envelope.createdAt}});return true;
}
export function purgeTransfers(pending,now=Date.now()){
  let changed=false;for(const [id,m]of pending)if(m.lease<=now||m.expiresAt<=now){pending.delete(id);changed=true;}return changed;
}
