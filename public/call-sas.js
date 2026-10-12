import {b64,unb64,fingerprint} from './crypto.js';
import {loadOlm} from './vendor/vodozemac/load.js';
import {SAS_WORDS} from './sas-words.js';

const DOMAIN='WebCaller call SAS v1';
const encoder=new TextEncoder();
const hash=async text=>b64(await crypto.subtle.digest('SHA-256',encoder.encode(text)));
function binary(value,alphabet='url'){
  if(typeof value!=='string'||!(alphabet==='url'?/^[A-Za-z0-9_-]{43}$/:/^[A-Za-z0-9+/]{43}$/).test(value))throw new Error('Invalid SAS value');
  const bytes=unb64(value);
  if(bytes.length!==32||b64(bytes)!==value.replaceAll('+','-').replaceAll('/','_'))throw new Error('Invalid SAS encoding');
  return bytes;
}
function check(value,alphabet){const bytes=binary(value,alphabet);bytes.fill(0);return value;}

export function mediaFingerprints(sdp){
  if(typeof sdp!=='string'||sdp.length>100000)throw new Error('Media identity unavailable');
  const found=[...sdp.matchAll(/^a=fingerprint:(sha-(?:256|384|512)) ([0-9a-f:]+)\r?$/gmi)].map(([,algorithm,value])=>{
    const expected=Number(algorithm.slice(4))/8,parts=value.split(':');
    if(parts.length!==expected||parts.some(p=>!/^[0-9a-f]{2}$/i.test(p)))throw new Error('Invalid media identity');
    return algorithm.toLowerCase()+':'+parts.join(':').toUpperCase();
  });
  if(!found.length)throw new Error('Media identity unavailable');
  return [...new Set(found)].sort();
}

// Only stable, authenticated identities are bound: ICE addresses, bitrate and
// codec renegotiation must not change the words of an existing media connection.
export async function callSasContext({callId,caller,local,remote,localSdp,remoteSdp}){
  const [localIdentity,remoteIdentity]=await Promise.all([fingerprint(local.keys),fingerprint(remote.keys)]);
  const a={id:local.id,identity:localIdentity,media:mediaFingerprints(localSdp)};
  const b={id:remote.id,identity:remoteIdentity,media:mediaFingerprints(remoteSdp)};
  return JSON.stringify({protocol:DOMAIN,callId,caller:caller?a:b,callee:caller?b:a});
}

export function sasWords(mac){
  const bytes=binary(mac,'standard');
  try{
    const words=[];
    for(let word=0;word<4;word++){
      let index=0;
      for(let bit=word*11;bit<(word+1)*11;bit++)index=(index<<1)|((bytes[bit>>3]>>(7-(bit&7)))&1);
      words.push(SAS_WORDS[index]);
    }
    return words.join(' ');
  }finally{bytes.fill(0);}
}

// Optional human authentication, never a call gate. No storage APIs, no Olm
// root/chain-key export, no human "verified" flag. The existing Olm signatures,
// identity pins and DTLS-SRTP validation continue independently.
// The caller commits before the callee reveals a fresh key. Transcript-bound
// HKDF/HMAC comes from the already bundled Vodozemac SAS primitive; confirmations
// prove key possession, not that humans have compared these 44 displayed bits.
export function callSas({context,initiator,send,update,olm=loadOlm,timeout=45000,retry=5000}){
  let closed=false,failed=false,phase='new',queue=Promise.resolve(),sas,established;
  let contextHash,commitment,ourKey,ourNonce,theirKey,theirNonce,info,words='';
  let lastFrame,receivedKey,receivedReveal,receivedConfirm,transmissions=0,deadline,retryTimer;
  const notify=state=>{if(!closed)update({state,words:state==='ready'?words:''});};
  function release(){sas?.free();sas=null;established?.free();established=null;}
  function fail(){
    if(closed||failed)return;failed=true;phase='unavailable';clearTimeout(deadline);clearTimeout(retryTimer);release();
    words='';ourNonce=theirNonce=ourKey=theirKey=info=lastFrame=receivedKey=receivedReveal=receivedConfirm=null;notify('unavailable');
  }
  function enqueue(work){queue=queue.then(async()=>{if(!closed&&!failed)await work();}).catch(fail);return queue;}
  function armRetry(){
    clearTimeout(retryTimer);
    if(!closed&&!failed&&phase!=='ready'&&lastFrame&&transmissions<4)retryTimer=setTimeout(()=>void enqueue(()=>transmit()),retry);
  }
  async function transmit(frame){
    if(frame){lastFrame=Object.freeze(frame);transmissions=0;}
    if(closed||failed||!lastFrame||transmissions>=4)return;
    transmissions++;const outgoing=lastFrame;
    try{await send(outgoing);}catch{ /* Optional check retries; media never waits. */ }
    if(!closed&&!failed&&lastFrame===outgoing)armRetry();
  }
  function packet(step,body={}){return {v:1,step,context:contextHash,round:commitment,...body};}
  const commitFor=(key,nonce)=>hash(JSON.stringify([DOMAIN,'commit',context,key,nonce]));
  async function freshKey(){
    const O=await olm();if(closed||failed)return false;
    sas=new O.Sas();ourKey=check(sas.public_key,'standard');
    const nonce=crypto.getRandomValues(new Uint8Array(32));try{ourNonce=b64(nonce);}finally{nonce.fill(0);}
    return true;
  }
  function establish(callerKey,callerNonce,calleeKey,calleeNonce){
    // diffie_hellman consumes the Sas object, including on a rejected low-order key.
    const pending=sas;sas=null;established=pending.diffie_hellman(theirKey);
    info=JSON.stringify([DOMAIN,context,commitment,callerKey,callerNonce,calleeKey,calleeNonce]);
    words=sasWords(established.calculate_mac('display-words',info));
  }
  function ready(){
    phase='ready';clearTimeout(deadline);clearTimeout(retryTimer);release();
    ourKey=ourNonce=theirKey=theirNonce=info=null;notify('ready');
  }
  function start(){return enqueue(async()=>{
    if(phase!=='new')return;const digest=await hash(context);if(closed)return;contextHash=digest;
    deadline=setTimeout(fail,timeout);notify('pending');
    if(initiator){
      if(!await freshKey())return;const committed=await commitFor(ourKey,ourNonce);if(closed)return;commitment=committed;
      phase='await-key';await transmit(packet('commit'));
    }else phase='await-commit';
  });}
  function receive(frame){return enqueue(async()=>{
    if(phase==='new')return;
    // Stale packets from an earlier media connection cannot invalidate a new one.
    if(!frame||frame.context!==contextHash)return;
    if(frame.v!==1||!['commit','key','reveal','confirm'].includes(frame.step))throw new Error('Invalid SAS packet');
    check(frame.round);
    if(frame.step==='commit'){
      if(initiator)return;
      if(phase!=='await-commit'){
        if(frame.round===commitment&&phase==='await-reveal')await transmit();return;
      }
      commitment=frame.round;
      if(!await freshKey())return;phase='await-reveal';await transmit(packet('key',{key:ourKey,nonce:ourNonce}));return;
    }
    if(frame.round!==commitment)return;
    if(frame.step==='key'){
      if(!initiator)return;
      const key=check(frame.key,'standard'),nonce=check(frame.nonce),canonical=JSON.stringify([key,nonce]);
      if(phase!=='await-key'){
        if(phase==='await-confirm'&&receivedKey===canonical)await transmit();return;
      }
      theirKey=key;theirNonce=nonce;receivedKey=canonical;
      establish(ourKey,ourNonce,theirKey,theirNonce);phase='await-confirm';
      await transmit(packet('reveal',{key:ourKey,nonce:ourNonce,mac:established.calculate_mac('caller-confirm',info)}));return;
    }
    if(frame.step==='reveal'){
      if(initiator)return;
      const key=check(frame.key,'standard'),nonce=check(frame.nonce),mac=check(frame.mac,'standard'),canonical=JSON.stringify([key,nonce,mac]);
      if(phase!=='await-reveal'){
        if(phase==='ready'&&receivedReveal===canonical)await transmit();return;
      }
      if(await commitFor(key,nonce)!==commitment)throw new Error('SAS commitment mismatch');if(closed)return;
      theirKey=key;theirNonce=nonce;receivedReveal=canonical;
      establish(theirKey,theirNonce,ourKey,ourNonce);established.verify_mac('caller-confirm',info,mac);
      const response=packet('confirm',{mac:established.calculate_mac('callee-confirm',info)});
      // Keep only public confirmation material for bounded retransmission.
      await transmit(response);if(!closed&&!failed)ready();return;
    }
    if(frame.step==='confirm'){
      if(!initiator)return;const mac=check(frame.mac,'standard');
      if(phase!=='await-confirm')return;
      established.verify_mac('callee-confirm',info,mac);receivedConfirm=mac;ready();
    }
  });}
  function close(){
    if(closed)return;closed=true;clearTimeout(deadline);clearTimeout(retryTimer);release();phase='closed';
    words='';context=ourKey=ourNonce=theirKey=theirNonce=info=contextHash=commitment=lastFrame=receivedKey=receivedReveal=receivedConfirm=null;
  }
  return {start,receive,close,get state(){return phase;}};
}
