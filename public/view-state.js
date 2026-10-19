// Per-device deadlines are sealed separately from the immutable wire envelope.
// A pending read acknowledgement contains timing metadata, never message text.
import {NO_EXPIRY,hasViewTimer} from './message-lifetime.js';
export function viewState({store,owner,now,digest}) {
  const suffix=id=>'lifetime/'+id;
  const result=value=>({expiresAt:value.expiresAt,viewedAt:value.readAt||undefined,deliveredAt:value.deliveredAt||undefined,lifetime:{mode:'after-view',seconds:value.seconds}});
  function fresh(e){return {id:e.id,from:e.from,to:e.to,createdAt:e.createdAt,seconds:e.lifetime.seconds,expiresAt:e.from===owner()?e.createdAt+e.lifetime.seconds*1000:NO_EXPIRY,readAt:0,deliveredAt:e.from===owner()?0:Math.max(e.createdAt,now()),notifyPending:false};}
  const record=(db,value)=>db.record(suffix(value.id),value,{kind:'lifetime',peer:value.from===owner()?value.to:value.from,expiresAt:NO_EXPIRY,target:value.id});
  async function remember(db,e){
    if(!hasViewTimer(e))return null;
    const prior=await db.read(suffix(e.id)),hash=await digest(e);
    if(prior&&prior.digest!==hash)throw new Error('Message identifier conflict.');
    const value=prior||{...fresh(e),digest:hash};return {value,record:prior?null:await record(db,value)};
  }
  async function deadline(db,e,payload,parent){
    if(hasViewTimer(e))return (parent?.value||await db.read(suffix(e.id))||fresh(e)).expiresAt;
    if(payload.target){if(await db.read('deleted/'+payload.target))return 0;const value=await db.read(suffix(payload.target));if(value)return Math.min(e.expiresAt,value.expiresAt);}
    return e.expiresAt;
  }
  async function inspect(e){
    if(!hasViewTimer(e))return {expiresAt:e.expiresAt};
    return store.lock(owner(),async db=>{
      if(await db.read('deleted/'+e.id))return {expiresAt:0,deleted:true};
      const value=await db.read(suffix(e.id));if(value&&value.digest!==await digest(e))throw new Error('Message identifier conflict.');
      return result(value||fresh(e));
    });
  }
  async function assertReadable(db,e){
    if(!hasViewTimer(e))return;
    const value=await db.read(suffix(e.id));if(value&&value.digest!==await digest(e))throw new Error('Message identifier conflict.');
    if((value||fresh(e)).expiresAt<=now())throw Object.assign(new Error('Message expired.'),{code:'MESSAGE_EXPIRED'});
  }
  async function mark(id){return store.lock(owner(),async db=>{
    const value=await db.read(suffix(id));if(!value||value.to!==owner())return null;
    if(value.readAt||value.expiresAt<=now())return result(value);
    value.readAt=Math.max(value.createdAt,value.deliveredAt,now());value.expiresAt=value.readAt+value.seconds*1000;value.notifyPending=true;
    const puts=[await record(db,value)];
    for(const row of await db.list())if(row.kind==='history'&&(row.id===db.key('history/'+id)||row.target===id)){
      const key=row.id.slice(owner().length+1),history=await db.read(key);
      if(history)puts.push(await db.record(key,history,{kind:'history',peer:row.peer,expiresAt:Math.min(row.expiresAt,value.expiresAt),target:row.target||''}));
    }
    await db.commit(puts);return result(value);
  });}
  async function pending(){return store.lock(owner(),async db=>{
    const items=[];for(const row of await db.list())if(row.kind==='lifetime'){const value=await db.read(row.id.slice(owner().length+1));if(value?.notifyPending&&value.to===owner())items.push(value);}
    return items.sort((a,b)=>a.readAt-b.readAt).slice(0,20);
  });}
  async function outboxIn(db,id){return db.read('view-outbox/'+id);}
  async function checkReceipt(db,payload,peer){
    const value=await db.read(suffix(payload.target));
    if(!value?.notifyPending||value.to!==owner()||value.from!==peer.id||payload.readAt!==value.readAt||payload.deliveredAt!==value.deliveredAt)throw new Error('Read acknowledgement is no longer pending.');
    return value;
  }
  async function queued(db,e,payload){return db.record('view-outbox/'+payload.target,{target:payload.target,kind:'read',envelope:e},{kind:'view-outbox',peer:e.to,expiresAt:NO_EXPIRY,target:payload.target});}
  async function acknowledge(id,eventId){return store.lock(owner(),async db=>{
    const queued=await outboxIn(db,id);if(!queued||queued.envelope.id!==eventId)return;
    const value=await db.read(suffix(id)),puts=[];if(value){value.notifyPending=false;puts.push(await record(db,value));}
    await db.commit(puts,[db.key('view-outbox/'+id)]);
  });}
  async function cleanup(db,rows){
    const puts=[],remove=[];
    for(const row of rows)if(row.kind==='lifetime'){
      const value=await db.read(row.id.slice(owner().length+1));
      if(value&&value.expiresAt<=now()&&!value.notifyPending){
        puts.push(await db.record('deleted/'+value.id,{deleted:true},{kind:'deleted',expiresAt:NO_EXPIRY}));
        remove.push(row.id,...rows.filter(r=>r.id===db.key('history/'+value.id)||r.target===value.id).map(r=>r.id));
      }
    }
    return {puts,remove};
  }
  return {remember,deadline,inspect,assertReadable,mark,pending,outboxIn,checkReceipt,queued,acknowledge,cleanup};
}
