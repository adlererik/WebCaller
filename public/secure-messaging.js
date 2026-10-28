import {envelopeHeader as header,ratchetStatement as signed} from './envelope-auth.js';
import {viewState} from './view-state.js';
import {fingerprint,b64,unb64,open as openLegacy} from './crypto.js';
import {secureStore} from './secure-store.js';
import {checkContactTrust} from './contact-trust.js';
import {loadSignal} from './signal-core.js';
import {signalFraming} from './signal-wire.js';
import {prepareApplicationSigner,signApplication,verifyApplicationSignature} from './application-signatures.js';
import {NO_EXPIRY,validLifetime,messageExpiry,hasViewTimer,isViewReceipt} from './message-lifetime.js';
const enc=new TextEncoder();
const digest=async value=>b64(await crypto.subtle.digest('SHA-256',enc.encode(JSON.stringify(value))));
export const identityStatement=(owner,identity)=>JSON.stringify({v:2,owner,identity});
export const prekeyStatement=(owner,identity,id,key)=>JSON.stringify({v:2,owner,identity,id,key});
// Sticker manifests belong to the ongoing chat ratchet, like text. Legacy
// per-file envelopes remain readable without changing their authenticated lane.
const laneFor=(p,e)=>p.kind==='attachment'?(p.attachment?.sticker===true&&(!e?.ratchet||e.ratchet.lane==='chat')?'chat':'files'):p.kind==='text'?'chat':p.kind==='typing'?'typing':p.kind==='transfer'?'transfer':p.kind?.startsWith('message-')?'events':'signal';
const scopeFor=(p,e)=>{
  if(p.kind==='attachment')return laneFor(p,e)==='chat'?'chat':e.id;
  // Reuse auxiliary ratchets instead of claiming a new one-time bundle for
  // every file-progress update or abandoned sticker-connection attempt.
  if(p.kind==='transfer')return e.ratchet?.scope===p.target?p.target:'transfer';
  if(p.kind==='sticker-link')return e.ratchet?.scope===p.callId?p.callId:'sticker-link';
  return p.callId||laneFor(p,e);
};
// Short-lived signaling also needs a sealed local copy: a notification/reload
// can reopen the same offer after its transport key has already been discarded.
// The optional call check has no saved transcript or verification record.
// Ratchet state still advances atomically; normal signaling keeps its reload copy.
const persistent=payload=>payload.kind!=='sas';
// These snapshots are committed only through the AES-256-GCM secure store.
function pack(value){return {signal:value.snapshot};}
function unpack(Type,data,account){if(!data?.signal)throw Error('Missing test Signal state');return Type.from_state(data.signal,account);}
function validate(e,self,peer,now){
  if(!e||![1,2,3].includes(e.v)||e.expiresAt<=now)throw new Error('Expired or unsupported encrypted message.');
  if(!Number.isSafeInteger(e.createdAt)||!Number.isSafeInteger(e.expiresAt)||e.createdAt>now+30000||e.expiresAt<=e.createdAt||!validLifetime(e))throw new Error('Invalid message lifetime.');
  if((e.from===self&&e.to!==peer.id)||(e.from!==self&&(e.from!==peer.id||e.to!==self)))throw new Error('Wrong recipient.');
  if(e.v>=2){const r=e.ratchet;if(r?.protocol!=='signal-pqxdh-v1'||!['chat','events','signal','files','typing','transfer'].includes(r.lane)||typeof r.scope!=='string'||r.scope.length>100||![2,3].includes(r.type)||typeof r.data!=='string'||r.data.length>24000||!r.sessionId||!r.identity||!r.recipientIdentity)throw new Error('Invalid ratchet message.');}
}
export function secureMessaging({api,store=secureStore(),now=Date.now,olm=loadSignal}={}){
  let device,O,initializing,replenishTimer,applicationSigner;
  function replenish(attempt=0){
    if(replenishTimer||!device)return;
    const current=device;
    replenishTimer=setTimeout(()=>{
      replenishTimer=null;if(device!==current)return;
      void publish().catch(()=>{if(device===current&&attempt<3)replenish(attempt+1);});
    },attempt?Math.min(8000,1000*2**(attempt-1)):200);
  }
  const owner=()=>device?.user.id;
  const views=viewState({store,owner,now,digest});
  const sessionDeadline=lane=>['chat','events'].includes(lane)?NO_EXPIRY:now()+604800000;
  async function trust(peer){return checkContactTrust(store,owner(),peer,device.pins?.[peer.id]);}
  async function verify(key,owner,text,signature){
    if(!await verifyApplicationSignature(key,owner,text,signature))throw new Error('Invalid signature.');
  }
  const sign=text=>signApplication(applicationSigner,text);
  async function peerIdentity(db,peer,value){
    const suffix='ratchet-peer/'+peer.id,prior=await db.read(suffix);
    if(prior&&prior.identity!==value)throw new Error(`Secure identity changed for ${peer.name||'this contact'}. Verify the new device before continuing.`);
    return prior?null:db.record(suffix,{identity:value},{kind:'ratchet-peer',peer:peer.id});
  }
  async function initialize(next){
    if(initializing)return initializing;
    device=next;initializing=(async()=>{
      O=await olm();
      // Import legacy trust before consulting any server-controlled roster.
      for(const peer of Object.values(device.pins||{}))await trust(peer);
      await store.lock(owner(),async db=>{
        const identity=await fingerprint(device.identity.keys);
        if(db.meta.identity&&db.meta.identity!==identity)throw new Error('Secure storage belongs to another device.');
        db.meta.identity=identity;
        applicationSigner=await prepareApplicationSigner(device.identity,owner(),db.meta.applicationSigner);
        if(applicationSigner.publicKey)db.meta.applicationSigner=applicationSigner;
        if(!await db.read('account')){
          const account=new O.Account();try{
            account.generate_one_time_keys(16);
            const keys=Object.fromEntries(account.one_time_keys);
            await db.commit([db.meta,await db.record('account',{...pack(account),keys:Object.fromEntries(Object.keys(keys).map(id=>[id,true])),pending:keys},{kind:'account'})]);
          }finally{account.free();}
        }else await db.commit([db.meta]);
      });
      // Current chat/update ratchets must survive offline delivery of Off
      // messages. Reseal only unexpired existing records; never recover expired
      // or deleted keys. Signaling/typing/transfer lifetimes stay bounded.
      await store.lock(owner(),async db=>{
        const rows=await db.list(),puts=[],sessions=new Set();
        for(const row of rows.filter(row=>row.kind==='session')){
          const suffix=row.id.slice(owner().length+1),value=await db.read(suffix);
          if(value&&['chat','events'].includes(value.lane)){
            sessions.add(suffix.slice('session/'.length));
            if(row.expiresAt!==NO_EXPIRY)puts.push(await db.record(suffix,value,{kind:'session',peer:row.peer,expiresAt:NO_EXPIRY}));
          }
        }
        for(const row of rows.filter(row=>row.kind==='preferred'&&row.expiresAt!==NO_EXPIRY)){
          const suffix=row.id.slice(owner().length+1),value=await db.read(suffix);
          if(value&&sessions.has(value.id))puts.push(await db.record(suffix,value,{kind:'preferred',peer:row.peer,expiresAt:NO_EXPIRY}));
        }
        if(puts.length)await db.commit(puts);
      });
      await publish();await purge();
    })();
    try{await initializing;}catch(error){initializing=null;throw error;}
  }
  async function publish(){
    return store.exclusive(owner()+':publication',async()=>{
      const status=await api('/ratchet/status');
      const prepared=await store.lock(owner(),async db=>{
        const data=await db.read('account'),account=unpack(O.Account,data);
        try{
          if(status.available<8&&Object.keys(data.keys).length<account.max_number_of_one_time_keys){
            account.generate_one_time_keys(Math.min(8,account.max_number_of_one_time_keys-Object.keys(data.keys).length));
            const extra=Object.fromEntries(account.one_time_keys);Object.assign(data.keys,Object.fromEntries(Object.keys(extra).map(id=>[id,true])));Object.assign(data.pending,extra);
          }
          Object.assign(data,pack(account));await db.commit([await db.record('account',data,{kind:'account'})]);
          return {identity:account.curve25519_key,keys:data.pending};
        }finally{account.free();}
      });
      const keys=[];
      for(const [id,key]of Object.entries(prepared.keys))keys.push({id,key,signature:await sign(prekeyStatement(owner(),prepared.identity,id,key))});
      const identitySignature=await sign(identityStatement(owner(),prepared.identity));
      // Hybrid bundles plus a continuity certificate must fit the existing 64 KiB
      // request bound. Commit each successful batch; a later retry is idempotent.
      for(let offset=0;offset<Math.max(1,keys.length);offset+=8){
      const batch=keys.slice(offset,offset+8),response=await api('/ratchet/publish','POST',{v:2,identity:prepared.identity,signature:identitySignature,keys:batch});
      await store.lock(owner(),async db=>{
        const puts=[];
        if(!db.meta.legacyImported){
          for(const envelope of response.legacy||[])if(envelope.v===1&&envelope.expiresAt>now())puts.push(await db.record('legacy/'+envelope.id,{digest:await digest(envelope)},{kind:'legacy',expiresAt:envelope.expiresAt}));
          db.meta.legacyImported=true;puts.push(db.meta);
        }
        // Reload after the request: another tab may have consumed a prekey.
        const data=await db.read('account'),account=unpack(O.Account,data);
        try{
          account.mark_keys_as_published(batch.map(k=>k.id));for(const {id}of batch)delete data.pending[id];Object.assign(data,pack(account));
          puts.push(await db.record('account',data,{kind:'account'}));await db.commit(puts);
        }finally{account.free();}
      });
      }
    });
  }
  async function cached(db,e){
    const row=await db.read('history/'+e.id);if(!row)return null;
    if(row.digest!==await digest(e))throw new Error('Message identifier conflict.');
    return row.payload;
  }
  async function archive(db,e,payload,parent){
    const expiresAt=await views.deadline(db,e,payload,parent);
    if(expiresAt<=now()){
      // Consume transport keys without retaining an expired edit's text. A short
      // digest-only reload copy also absorbs socket/HTTP echo duplicates.
      if(payload.kind?.startsWith('message-'))return db.record('history/'+e.id,{digest:await digest(e),payload:{kind:'message-expired',target:payload.target}},{kind:'event-replay',peer:e.from===owner()?e.to:e.from,expiresAt:Math.min(e.expiresAt,now()+120000)});
      return null;
    }
    return db.record('history/'+e.id,{digest:await digest(e),payload},{kind:'history',peer:e.from===owner()?e.to:e.from,expiresAt,target:payload.target||''});
  }
  async function seal(identity,self,peer,payload,ttl=86400,options={}){
    if(!O||self!==owner()||identity!==device.identity)throw new Error('Secure messaging is not ready.');await trust(peer);
    const createdAt=now(),lane=laneFor(payload),timed=options.perView&&ttl>0,view=options.viewReceipt;
    if(timed&&(!['chat','files'].includes(lane)||!Number.isInteger(ttl)))throw new Error('Invalid view timer.');
    const e={v:timed||view?3:2,id:crypto.randomUUID(),from:self,to:peer.id,createdAt,expiresAt:messageExpiry(createdAt,ttl,lane)};
    if(timed){e.expiresAt=NO_EXPIRY;e.lifetime={mode:'after-view',seconds:ttl};}
    if(view){if(payload.kind!=='message-read'||payload.target!==view.target||payload.readAt!==view.startedAt)throw new Error('Invalid read acknowledgement.');e.expiresAt=NO_EXPIRY;e.lifetime={mode:'view-receipt',target:view.target,startedAt:view.startedAt};}
    const scope=scopeFor(payload,e),stream=peer.id+'/'+lane+'/'+scope;
    return store.exclusive(owner()+':stream/'+stream,async()=>{
      const needsSession=await store.lock(owner(),async db=>{
        const preferred=await db.read('preferred/'+stream),prior=preferred&&await db.read('session/'+preferred.id);
        return !prior||(['typing','transfer'].includes(lane)&&now()-prior.createdAt>900000);
      });
      let bundle;
      if(needsSession){
        for(let attempt=0;;attempt++)try{bundle=await api('/ratchet/claim/'+peer.id,'POST',{});break;}
        catch(error){if(error.status!==503||attempt>=4){if([426,503].includes(error.status))throw Object.assign(new Error('Waiting for their phone to reconnect. Please try again shortly.'),{status:error.status,cause:error});throw error;}await new Promise(resolve=>setTimeout(resolve,500*2**attempt));}
        if(bundle.v!==2||!bundle.prekey)throw new Error(`Ask ${peer.name||'the other person'} to reopen WebCaller to update secure messaging.`);
        await verify(peer.keys.sign,peer.id,identityStatement(peer.id,bundle.identity),bundle.signature);
        await verify(peer.keys.sign,peer.id,prekeyStatement(peer.id,bundle.identity,bundle.prekey.id,bundle.prekey.key),bundle.prekey.signature);
      }
      return store.lock(owner(),async db=>{
      let account,session;
      try{
        if(view){await views.checkReceipt(db,payload,peer);const saved=await views.outboxIn(db,payload.target);if(saved)return saved.envelope;}
        const preferred=await db.read('preferred/'+stream);let prior=preferred&&await db.read('session/'+preferred.id);
        if(prior&&['typing','transfer'].includes(lane)&&now()-prior.createdAt>900000)prior=null;
        const data=await db.read('account');account=unpack(O.Account,data);
        let state=prior,peerRecord;
        if(prior)session=unpack(O.Session,prior,account);
        else{
          peerRecord=await peerIdentity(db,peer,bundle.identity);
          session=account.create_outbound_session(bundle.identity,bundle.prekey.key,O.SessionConfigVersion.V2);
          state={peer:peer.id,lane,scope,identity:bundle.identity,prekeyId:bundle.prekey.id,createdAt};
        }
        e.createdAt=Math.max(now(),(state.lastSentAt||0)+1,view?.startedAt||0);e.expiresAt=e.v===3?NO_EXPIRY:messageExpiry(e.createdAt,ttl,lane);state.lastSentAt=e.createdAt;
        const message=session.encrypt(JSON.stringify({header:header(e),payload}));
        try{e.ratchet={protocol:'signal-pqxdh-v1',lane,scope,sessionId:session.session_id,identity:account.curve25519_key,recipientIdentity:state.identity,type:message.message_type,data:b64(message.ciphertext),prekeyId:state.prekeyId};}finally{message.free();}
        e.signature=await sign(signed(e));
        const puts=lane==='files'?[]:[await db.record('session/'+session.session_id,{...state,...pack(session)},{kind:'session',peer:peer.id,expiresAt:sessionDeadline(lane)}),await db.record('preferred/'+stream,{id:session.session_id},{kind:'preferred',peer:peer.id,expiresAt:sessionDeadline(lane)})];
        if(peerRecord)puts.push(peerRecord);const parent=await views.remember(db,e);if(parent?.record)puts.push(parent.record);if(persistent(payload)){const history=await archive(db,e,payload,parent);if(history)puts.push(history);}if(view)puts.push(await views.queued(db,e,payload));
        await db.commit(puts);return e;
      }finally{session?.free();account?.free();}
      });
    });
  }
  async function open(identity,self,peer,e){
    if(!O||self!==owner()||identity!==device.identity)throw new Error('Secure messaging is not ready.');
    validate(e,self,peer,now());await trust(peer);
    if(e.v>=2){await verify(e.from===self?identity.keys.sign:peer.keys.sign,e.from,signed(e),e.signature);signalFraming(e.ratchet);}
    let consumed=false;const payload=await store.lock(owner(),async db=>{
      if(await db.read('deleted/'+e.id))throw new Error('Message was deleted.');
      await views.assertReadable(db,e);
      const saved=await cached(db,e);if(saved)return saved;
      if(e.v===1){
        const allowed=await db.read('legacy/'+e.id);
        if(!allowed||allowed.digest!==await digest(e))throw new Error('This old encryption format is not authorized for new messages. Reopen WebCaller on both phones.');
        const payload=await openLegacy(identity,self,peer,e);await db.commit([await archive(db,e,payload)]);return payload;
      }
      if(e.from===self)throw new Error('This sent message is no longer available in this browser.');
      const r=e.ratchet;let session,account,message,result;
      try{
        const data=await db.read('account');account=unpack(O.Account,data);
        if(r.recipientIdentity!==account.curve25519_key)throw new Error('Wrong secure device.');
        const peerRecord=await peerIdentity(db,peer,r.identity),prior=await db.read('session/'+r.sessionId);
        if(prior&&(prior.peer!==peer.id||prior.lane!==r.lane||prior.scope!==r.scope||prior.identity!==r.identity))throw new Error('Wrong secure session.');
        message=new O.SignalMessage(r.type,unb64(r.data));let plaintext,state=prior;
        if(prior){session=unpack(O.Session,prior,account);plaintext=session.decrypt(message);}
        else{
          if(r.type!==3)throw new Error('Secure session is missing. Ask the other person to reopen WebCaller.');
          result=account.create_inbound_session(r.identity,message);session=result.session;plaintext=result.plaintext;
          if(session.session_id!==r.sessionId)throw new Error('Wrong session identifier.');
          state={peer:peer.id,lane:r.lane,scope:r.scope,identity:r.identity,prekeyId:r.prekeyId,createdAt:e.createdAt};
          for(const id of account.consumed){delete data.keys[id];delete data.pending[id];}Object.assign(data,pack(account));
          consumed=true;
        }
        const decoded=JSON.parse(plaintext);
        if(decoded.header!==header(e)||laneFor(decoded.payload,e)!==r.lane||scopeFor(decoded.payload,e)!==r.scope)throw new Error('Invalid authenticated message context.');
        const puts=r.lane==='files'?[]:[await db.record('session/'+r.sessionId,{...state,...pack(session)},{kind:'session',peer:peer.id,expiresAt:sessionDeadline(r.lane)})];
        if(!prior)puts.push(await db.record('account',data,{kind:'account'}));if(peerRecord)puts.push(peerRecord);
        const stream=peer.id+'/'+r.lane+'/'+r.scope,preferred=await db.read('preferred/'+stream);
        // Simultaneous first sends converge on one shared, bidirectional session.
        if(r.lane!=='files'&&(!preferred||!await db.read('session/'+preferred.id)||r.sessionId<=preferred.id))puts.push(await db.record('preferred/'+stream,{id:r.sessionId},{kind:'preferred',peer:peer.id,expiresAt:sessionDeadline(r.lane)}));
        if(e.v===3&&!(hasViewTimer(e)&&['text','attachment'].includes(decoded.payload.kind)||isViewReceipt(e)&&decoded.payload.kind==='message-read'&&decoded.payload.target===e.lifetime.target&&decoded.payload.readAt===e.lifetime.startedAt))throw new Error('Invalid authenticated lifetime context.');
        const parent=await views.remember(db,e);if(parent?.record)puts.push(parent.record);
        if(persistent(decoded.payload)){const history=await archive(db,e,decoded.payload,parent);if(history)puts.push(history);}await db.commit(puts);
        return decoded.payload;
      }finally{session?.free();result?.free();message?.free();account?.free();}
    });
    if(consumed)replenish();return payload;
  }
  async function purge(){return store.lock(owner(),async db=>{const rows=await db.list(),extra=await views.cleanup(db,rows);await db.commit(extra.puts,[...new Set([...extra.remove,...rows.filter(r=>r.expiresAt&&r.expiresAt<=now()).map(r=>r.id)])]);});}
  async function remove(id,expiresAt){return store.lock(owner(),async db=>{
    const rows=await db.list(),removes=rows.filter(r=>r.id===db.key('history/'+id)||r.id===db.key('legacy/'+id)||r.target===id).map(r=>r.id);
    await db.commit([await db.record('deleted/'+id,{deleted:true},{kind:'deleted',expiresAt})],removes);
  });}
  async function forgetPeer(peer){return store.lock(owner(),async db=>{
    const rows=await db.list();await db.commit([],rows.filter(r=>r.peer===peer&&!['trust','ratchet-peer'].includes(r.kind)).map(r=>r.id));
  });}
  async function forget(){if(!owner())return;clearTimeout(replenishTimer);replenishTimer=null;await store.lock(owner(),async db=>{await db.commit([],(await db.list()).filter(r=>r.kind!=='lease').map(r=>r.id));});device=null;O=null;applicationSigner=null;initializing=null;}
  async function viewReceipt(value,peer){return seal(device.identity,owner(),peer,{kind:'message-read',target:value.id,deliveredAt:value.deliveredAt,readAt:value.readAt},0,{viewReceipt:{target:value.id,startedAt:value.readAt}});}
  return {initialize,seal,open,trust,publish,refresh:replenish,purge,remove,forgetPeer,forget,store,messageState:views.inspect,markViewed:views.mark,pendingViews:views.pending,viewReceipt,ackView:views.acknowledge};
}
