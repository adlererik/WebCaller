// A bounded, low-priority data-only connection. SDP/ICE travel inside the same
// authenticated Signal envelopes as call signaling; image keys never go here.
export const STICKER_LIMIT=512*1024,STICKER_FRAME=16384;
const idPattern=/^[a-f0-9-]{36}$/;
export function stickerChannels({self,peer,ice,signal,receive,pace=async()=>{},RTC=globalThis.RTCPeerConnection,now=Date.now,onError=()=>{}}){
  const links=new Map(),seen=new Map(),preparing=new Map(),inboxes=new Map();let closed=false,generation=0;
  function dispose(link){if(!link||link.disposed)return;link.disposed=true;clearTimeout(link.idle);clearTimeout(link.deadline);link.reject?.(Error('Sticker connection closed'));link.pendingAck?.reject(Error('Sticker connection closed'));for(const part of link.incoming?.parts||[])part.fill(0);link.pc.close();if(links.get(link.peer.id)===link)links.delete(link.peer.id);link.incoming=null;}
  function touch(link){clearTimeout(link.idle);link.idle=setTimeout(()=>dispose(link),90000);}
  function bind(link,channel){
    if(link.channel||channel.label!=='webcaller-stickers-v1'||channel.protocol!=='webcaller-stickers-v1'){channel.close();return;}
    link.channel=channel;channel.binaryType='arraybuffer';
    channel.onopen=()=>{clearTimeout(link.deadline);touch(link);link.resolve(link);};
    channel.onclose=()=>dispose(link);channel.onerror=()=>dispose(link);
    channel.onmessage=event=>{
      const size=typeof event.data==='string'?event.data.length:event.data?.byteLength;
      link.queuedBytes=(link.queuedBytes||0)+size;if(!Number.isFinite(size)||link.queuedBytes>768*1024){dispose(link);return;}
      // Serialize asynchronous validation/cache writes as well as SCTP frames.
      link.queue=link.queue.then(async()=>{
        if(link.disposed)return;touch(link);const data=event.data;
        if(typeof data==='string'){
          if(data.length>34000)throw Error('Sticker header too large');const packet=JSON.parse(data);
          if(packet.type==='ack'){if(link.pendingAck?.id===packet.id){link.pendingAck.resolve();link.pendingAck=null;}return;}
          if(packet.type==='start'){
            const e=packet.envelope,sizes=packet.sizes;
            if(link.incoming||!idPattern.test(e?.id||'')||e.from!==link.peer.id||e.to!==self()||e.expiresAt<=now()||seen.has(e.id)||!Array.isArray(sizes)||!sizes.length||sizes.length>8||!sizes.every(n=>Number.isInteger(n)&&n>16&&n<=65552)||sizes.reduce((a,b)=>a+b,0)>STICKER_LIMIT+128)throw Error('Invalid sticker transfer');
            link.incoming={envelope:e,sizes,parts:[],length:0,total:sizes.reduce((a,b)=>a+b,0),started:now()};return;
          }
          const incoming=link.incoming;
          if(packet.type!=='end'||!incoming||packet.id!==incoming.envelope.id||incoming.length!==incoming.total)throw Error('Incomplete sticker');
          link.incoming=null;const bytes=new Uint8Array(incoming.total);let offset=0;for(const part of incoming.parts){bytes.set(part,offset);offset+=part.length;part.fill(0);}
          const chunks=[];offset=0;for(const size of incoming.sizes){chunks.push(bytes.slice(offset,offset+size));offset+=size;}
          link.receivingId=packet.id;
          try{if(await receive(link.peer,incoming.envelope,chunks)===true&&channel.readyState==='open')channel.send(JSON.stringify({type:'ack',id:packet.id}));seen.set(packet.id,now());if(seen.size>128)seen.delete(seen.keys().next().value);}finally{link.receivingId=null;bytes.fill(0);for(const chunk of chunks)chunk.fill(0);}
        }else{
          const incoming=link.incoming;
          if(!(data instanceof ArrayBuffer)||!incoming||data.byteLength>STICKER_FRAME||incoming.length+data.byteLength>incoming.total||now()-incoming.started>20000)throw Error('Invalid sticker frame');
          incoming.parts.push(new Uint8Array(data));incoming.length+=data.byteLength;
        }
      }).catch(error=>{onError(error);dispose(link);}).finally(()=>{link.queuedBytes-=size;});
    };
  }
  async function create(contact,id,caller){
    const epoch=generation,config=await ice();if(closed||epoch!==generation||!peer(contact.id))throw Error('Sticker chat unavailable');
    const existing=links.get(contact.id);if(existing&&(existing.channel?.readyState==='open'||existing.id<id))return existing;dispose(existing);
    if(links.size>=3)dispose(links.values().next().value);
    // Credentials are fetched freshly; no new hostname, router port or service.
    const pc=new RTC({iceServers:config.iceServers}),link={peer:contact,id,caller,pc,candidates:[],localCandidates:[],signalReady:false,signalQueue:Promise.resolve(),queue:Promise.resolve()};
    link.ready=new Promise((resolve,reject)=>{link.resolve=resolve;link.reject=reject;});void link.ready.catch(()=>{});
    links.set(contact.id,link);link.deadline=setTimeout(()=>dispose(link),12000);
    pc.onicecandidate=e=>{if(e.candidate&&links.get(contact.id)===link){
      if(link.localCandidates.length<64)link.localCandidates.push(e.candidate.toJSON());if(link.signalReady)flushIce(link);
    }};
    pc.onconnectionstatechange=()=>{if(pc.connectionState==='failed'||pc.connectionState==='closed')dispose(link);};
    pc.ondatachannel=e=>bind(link,e.channel);
    if(caller)bind(link,pc.createDataChannel('webcaller-stickers-v1',{ordered:true,protocol:'webcaller-stickers-v1',priority:'low'}));
    return link;
  }
  function flushIce(link){
    link.signalQueue=link.signalQueue.then(async()=>{while(link.localCandidates.length&&!link.disposed)await signal(link.peer,{kind:'sticker-link',callId:link.id,action:'ice',candidate:link.localCandidates.shift()});}).catch(error=>{onError(error);dispose(link);});
  }
  async function describe(link,action){
    await signal(link.peer,{kind:'sticker-link',callId:link.id,action,description:link.pc.localDescription.toJSON()});link.signalReady=true;flushIce(link);
  }
  async function prepare(contact){
    if(closed||!RTC||!peer(contact.id))return null;
    let link=links.get(contact.id);if(link)return link.ready;
    link=await create(contact,crypto.randomUUID(),true);
    if(!link.caller||link.offered)return link.ready;link.offered=true;
    await link.pc.setLocalDescription(await link.pc.createOffer());
    await describe(link,'offer');return link.ready;
  }
  function ensure(contact){
    if(!preparing.has(contact.id)){const pending=prepare(contact);preparing.set(contact.id,pending);void pending.finally(()=>{if(preparing.get(contact.id)===pending)preparing.delete(contact.id);}).catch(()=>{});}
    return preparing.get(contact.id);
  }
  async function accept(contact,payload){
    if(closed||!RTC||payload.kind!=='sticker-link'||!idPattern.test(payload.callId||'')||!peer(contact.id))return;
    let link=links.get(contact.id);
    if(payload.action==='offer'){
      if(payload.description?.type!=='offer'||typeof payload.description.sdp!=='string'||payload.description.sdp.length>18000)return;
      if(link?.id===payload.callId)return;
      if(link&&(link.channel?.readyState==='open'||link.id<payload.callId))return;
      dispose(link);link=await create(contact,payload.callId,false);if(link.id!==payload.callId)return;
      await link.pc.setRemoteDescription(payload.description);await link.pc.setLocalDescription(await link.pc.createAnswer());
      await describe(link,'answer');
    }else if(link?.id===payload.callId){
      if(payload.action==='answer'&&payload.description?.type==='answer'&&link.pc.signalingState==='have-local-offer'){
        await link.pc.setRemoteDescription(payload.description);for(const c of link.candidates)await link.pc.addIceCandidate(c);link.candidates=[];
      }else if(payload.action==='ice'&&typeof payload.candidate?.candidate==='string'&&payload.candidate.candidate.length<2000){
        if(link.pc.remoteDescription)await link.pc.addIceCandidate(payload.candidate);else if(link.candidates.length<64)link.candidates.push(payload.candidate);
      }
    }
  }
  async function send(contact,envelope,chunks,abort){
    let timer;const deadline=new AbortController(),combined=AbortSignal.any([abort,deadline.signal]);
    timer=setTimeout(()=>deadline.abort(),2500);
    try{
      combined.throwIfAborted();const ready=ensure(contact);const link=await Promise.race([ready,new Promise((_,reject)=>combined.addEventListener('abort',()=>reject(Error('Use encrypted upload')), {once:true}))]);
      if(!link||link.sending)return false;link.sending=true;
      try{
        const channel=link.channel,sizes=chunks.map(c=>c.byteLength);
        if(sizes.reduce((a,b)=>a+b,0)>STICKER_LIMIT+128)return false;
        channel.send(JSON.stringify({type:'start',envelope,sizes}));
        for(const chunk of chunks){const bytes=new Uint8Array(chunk);for(let offset=0;offset<bytes.length;offset+=STICKER_FRAME){
          combined.throwIfAborted();const frame=bytes.slice(offset,offset+STICKER_FRAME);await pace(frame.length,combined);
          while(channel.bufferedAmount>65536){combined.throwIfAborted();await new Promise(r=>setTimeout(r,20));}
          if(channel.readyState!=='open')throw Error('Sticker connection closed');channel.send(frame);touch(link);
        }}
        const ack=new Promise((resolve,reject)=>{link.pendingAck={id:envelope.id,resolve,reject};});void ack.catch(()=>{});
        channel.send(JSON.stringify({type:'end',id:envelope.id}));
        await Promise.race([ack,new Promise((_,reject)=>combined.addEventListener('abort',()=>reject(Error('Sticker delivery timeout')),{once:true}))]);return true;
      }finally{link.sending=false;link.pendingAck=null;}
    }catch(error){onError(error);dispose(links.get(contact.id));return false;}finally{clearTimeout(timer);}
  }
  function receiveSignal(contact,payload){
    const epoch=generation,prior=inboxes.get(contact.id)||Promise.resolve();
    const task=prior.catch(()=>{}).then(()=>{if(epoch===generation)return accept(contact,payload);});inboxes.set(contact.id,task);
    void task.finally(()=>{if(inboxes.get(contact.id)===task)inboxes.delete(contact.id);}).catch(()=>{});return task;
  }
  return {prepare:contact=>ensure(contact).catch(error=>{onError(error);return null;}),accept:receiveSignal,send,
    incoming:id=>[...links.values()].some(l=>l.incoming?.envelope.id===id||l.receivingId===id),
    reset(){generation++;for(const link of [...links.values()])dispose(link);seen.clear();preparing.clear();inboxes.clear();},
    close(){closed=true;this.reset();}};
}
