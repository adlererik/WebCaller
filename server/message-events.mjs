import {visibleMessages,visibleTo,applyViewReceipt} from './message-retention.mjs';
import {isViewReceipt} from '../public/message-lifetime.js';
// Store only the latest encrypted state per participant and kind. The parent
// message owns the lifetime; deletion cascades to every edit and receipt.
export function messageEventRoutes({store,body,fail,validateEnvelope,emit}){
  return async(req,res,route,u,json)=>{
    if(route!=='/message-events')return false;
    store.purge();
    if(req.method==='GET'){
      const ids=visibleMessages(store,u.id).map(m=>m.id);
      const rows=ids.length?store.all('SELECT message_id AS target,kind,envelope FROM message_events WHERE message_id IN ('+ids.map(()=>'?').join(',')+') ORDER BY created,event_id',...ids):[];
      json(200,rows.map(r=>({...r,envelope:JSON.parse(r.envelope)})));return true;
    }
    if(req.method!=='POST')fail(405,'Method not allowed');
    const b=await body(req);
    if(!Array.isArray(b.events)||!b.events.length||b.events.length>20)fail(400,'Send up to 20 encrypted updates');
    const pending=[];
    store.transaction(()=>{
      for(const event of b.events){
        const {target,kind,envelope}=event||{};
        if(typeof target!=='string'||!['receipt','read','edit','reaction','pin'].includes(kind))fail(400,'Invalid message update');
        const m=store.get('SELECT * FROM messages WHERE id=?',target);
        if(!m||m.expires<=Date.now()||![m.sender,m.recipient].includes(u.id))fail(404,'Message expired or was deleted');
        if(kind==='edit'&&u.id!==m.sender||['receipt','read'].includes(kind)&&u.id!==m.recipient)fail(403,'This update is not allowed');
        validateEnvelope(envelope,u.id,false,isViewReceipt(envelope)&&u.id===m.recipient);
        if(!visibleTo(store,m,u.id)&&!(kind==='read'&&isViewReceipt(envelope)&&u.id===m.recipient))fail(404,'Message expired on this device');
        const other=m.sender===u.id?m.recipient:m.sender;
        if(envelope.to!==other||envelope.expiresAt>JSON.parse(m.envelope).expiresAt||envelope.createdAt<m.created)fail(400,'Update must belong to this message and its timer');
        const expiry=applyViewReceipt(store,m,event,fail);
        const prior=store.get('SELECT * FROM message_events WHERE message_id=? AND actor=? AND kind=?',target,u.id,kind);
        if(prior&&prior.event_id===envelope.id){if(prior.envelope!==JSON.stringify(envelope))fail(409,'Conflicting update');continue;}
        // A delayed older request must not undo a newer edit or reaction.
        if(prior&&(prior.created>envelope.createdAt||prior.created===envelope.createdAt&&prior.event_id>=envelope.id))continue;
        store.run(`INSERT INTO message_events VALUES(?,?,?,?,?,?,?) ON CONFLICT(message_id,actor,kind)
          DO UPDATE SET created=excluded.created,expires=excluded.expires,event_id=excluded.event_id,envelope=excluded.envelope`,
          target,u.id,kind,envelope.createdAt,expiry,envelope.id,JSON.stringify(envelope));
        pending.push({type:'message-event',target,kind,envelope});
      }
    });
    for(const event of pending){emit(u.id,event);emit(event.envelope.to,event);}
    json(200,{ok:true});return true;
  };
}
