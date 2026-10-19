import {NO_EXPIRY,hasViewTimer,isViewReceipt} from '../public/message-lifetime.js';
export function registerViewTimer(store,e){
  if(hasViewTimer(e))store.run('INSERT INTO message_views(message_id,seconds,sender_expires,recipient_expires) VALUES(?,?,?,0)',e.id,e.lifetime.seconds,e.createdAt+e.lifetime.seconds*1000);
}
export function visibleMessages(store,owner,now=Date.now()){
  return store.all(`SELECT m.* FROM messages m LEFT JOIN message_views v ON v.message_id=m.id
    WHERE (m.sender=? OR m.recipient=?) AND m.expires>?
      AND (v.message_id IS NULL OR m.sender=? AND v.sender_expires>? OR m.recipient=? AND (v.recipient_expires=0 OR v.recipient_expires>?))
    ORDER BY m.created DESC LIMIT 500`,owner,owner,now,owner,now,owner,now);
}
export function visibleTo(store,message,owner,now=Date.now()){
  if(!message||![message.sender,message.recipient].includes(owner)||message.expires<=now)return false;
  const view=store.get('SELECT * FROM message_views WHERE message_id=?',message.id);
  return !view||(owner===message.sender?view.sender_expires>now:view.recipient_expires===0||view.recipient_expires>now);
}
export function applyViewReceipt(store,m,event,fail){
  const view=store.get('SELECT * FROM message_views WHERE message_id=?',m.id),e=event.envelope;
  if(!view){if(isViewReceipt(e))fail(400,'This message has no first-view timer');return m.expires;}
  if(event.kind!=='read'){if(isViewReceipt(e))fail(400,'Invalid read acknowledgement');return m.expires;}
  if(!isViewReceipt(e)||e.from!==m.recipient||e.lifetime.target!==m.id||e.lifetime.startedAt<m.created)fail(400,'A signed first-view acknowledgement is required');
  const deadline=e.lifetime.startedAt+view.seconds*1000;
  if(view.recipient_expires&&view.recipient_expires!==deadline)fail(409,'The first-view timer has already started');
  if(!view.recipient_expires){
    const expires=Math.max(view.sender_expires,deadline);
    store.run('UPDATE message_views SET recipient_expires=? WHERE message_id=?',deadline,m.id);
    store.run('UPDATE messages SET expires=? WHERE id=?',expires,m.id);
    store.run('UPDATE attachments SET expires=? WHERE message_id=? AND committed=1',expires,m.id);
    store.run('UPDATE message_events SET expires=? WHERE message_id=?',expires,m.id);
    return expires;
  }
  return m.expires;
}
export const replayDeadline=(store,id,fallback)=>store.get('SELECT message_id FROM message_views WHERE message_id=?',id)?NO_EXPIRY:fallback;
