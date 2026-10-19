import {randomInt,randomUUID} from 'node:crypto';
import {dialCode} from '../public/dial-code.js';

// Numeric codes are public addresses. Device tokens and encryption identities
// remain separate; a code never authenticates or recovers an existing device.
export function dialing({store,body,fail,rate,emit,userView,validKeys,validName,hash,publicURL,enabled=true}){
  const blocked=(a,b)=>!!store.get('SELECT 1 FROM contact_blocks WHERE (owner=? AND peer=?) OR (owner=? AND peer=?)',a,b,b,a);
  const request=(a,b)=>store.get('SELECT * FROM contact_requests WHERE (sender=? AND recipient=?) OR (sender=? AND recipient=?)',a,b,b,a);
  const pending=(a,b)=>!blocked(a,b)&&!!request(a,b);
  const confirmed=(a,b)=>!!store.get('SELECT 1 FROM contacts WHERE a=? AND b=?',a,b);
  const notify=(a,b)=>{emit(a,{type:'contacts'});emit(b,{type:'contacts'});};
  function roster(id,accepted){
    const peers=new Map(accepted.map(p=>[p.id,p]));
    for(const r of store.all('SELECT * FROM contact_requests WHERE sender=? OR recipient=?',id,id)){
      const peer=r.sender===id?r.recipient:r.sender;
      if(peers.has(peer)||blocked(id,peer))continue;
      const u=store.get('SELECT * FROM users WHERE id=?',peer);
      if(u)peers.set(peer,{...userView(u),request:r.sender===id?'outgoing':'incoming'});
    }
    return [...peers.values()].filter(p=>!blocked(id,p.id));
  }
  function accept(owner,peer){
    if(blocked(owner,peer))fail(403,'This contact is blocked');
    if(confirmed(owner,peer))return;
    if(!store.get('SELECT 1 FROM contact_requests WHERE sender=? AND recipient=?',peer,owner))fail(404,'Contact request unavailable');
    store.transaction(()=>{
      store.run('INSERT OR IGNORE INTO contacts VALUES(?,?)',owner,peer);store.run('INSERT OR IGNORE INTO contacts VALUES(?,?)',peer,owner);
      store.run('DELETE FROM contact_requests WHERE (sender=? AND recipient=?) OR (sender=? AND recipient=?)',owner,peer,peer,owner);
    });notify(owner,peer);
  }
  async function connect(req,json){
    if(!enabled)fail(404,'Calling codes are not enabled');
    rate('dial-ip:'+req.socket.remoteAddress,30);
    const b=await body(req),code=dialCode(b.code);if(!code)fail(400,'Enter a calling code of 4 to 12 digits');
    const token=req.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
    if(!token)fail(401,'Open or set up your phone first');
    const existing=store.get('SELECT * FROM users WHERE token_hash=?',hash(token));
    const target=store.get('SELECT users.* FROM dial_codes JOIN users ON users.id=dial_codes.owner WHERE code=? AND active=1',code);
    if(!target||existing&&blocked(existing.id,target.id))fail(404,'That code is unavailable');
    if(b.expectedPeer!==undefined&&b.expectedPeer!==target.id)fail(409,'This code has changed. Open your saved conversation instead.');
    if(existing?.id===target.id)fail(400,'That is your own calling code');
    if(!existing){
      rate('dial-enroll:'+req.socket.remoteAddress,8);
      if(!validKeys(b.keys)||!validName(b.name||'Guest'))fail(400,'Invalid name or device keys');
      if(store.get('SELECT 1 FROM users WHERE keys=?',JSON.stringify(b.keys)))fail(409,'Open your usual phone to keep its identity');
    }else if(b.keys&&hash(JSON.stringify(b.keys))!==hash(existing.keys))fail(403,'Device identity does not match');
    const id=existing?.id||randomUUID();rate('dial-device:'+id,12);rate('dial-target:'+target.id,30);
    const result=store.transaction(()=>{
      if(!confirmed(id,target.id)&&!request(id,target.id)){
        if(store.get('SELECT COUNT(*) n FROM contact_requests WHERE recipient=?',target.id).n>=50||store.get('SELECT COUNT(*) n FROM contact_requests WHERE sender=?',id).n>=10)fail(429,'Too many pending contact requests. Try again later.');
      }
      if(!existing)store.run('INSERT INTO users VALUES(?,?,?,?)',id,(b.name||'Guest').trim(),JSON.stringify(b.keys),hash(token));
      if(!confirmed(id,target.id))store.run('INSERT OR IGNORE INTO contact_requests VALUES(?,?,?,0)',id,target.id,Date.now());
      // Dialling each other is mutual consent; ordinary one-way dialling still
      // requires the recipient to accept, reply or answer a call.
      if(store.get('SELECT 1 FROM contact_requests WHERE sender=? AND recipient=?',target.id,id)){
        store.run('INSERT OR IGNORE INTO contacts VALUES(?,?)',id,target.id);store.run('INSERT OR IGNORE INTO contacts VALUES(?,?)',target.id,id);
        store.run('DELETE FROM contact_requests WHERE (sender=? AND recipient=?) OR (sender=? AND recipient=?)',id,target.id,target.id,id);
      }
      return {user:userView(store.get('SELECT * FROM users WHERE id=?',id)),contact:userView(target)};
    });notify(id,target.id);json(existing?200:201,result);
  }
  function beforeMessage(sender,envelope){
    if(confirmed(sender,envelope.to))return;
    const r=request(sender,envelope.to);
    if(!r||r.sender!==sender||blocked(sender,envelope.to))fail(403,'Accept this contact request first');
    if(![2,3].includes(envelope.v)||envelope.ratchet?.lane!=='chat')fail(403,'Send a text request first. Media is available after acceptance.');
    if(r.messages>=5)fail(429,'Wait for this person to accept before sending more messages');
  }
  function countMessage(sender,recipient){if(!confirmed(sender,recipient))store.run('UPDATE contact_requests SET messages=messages+1 WHERE sender=? AND recipient=?',sender,recipient);}
  async function routes(req,route,u,json){
    if(route==='/dial/settings'&&req.method==='GET'){
      json(200,{enabled,code:store.get('SELECT code FROM dial_codes WHERE owner=? AND active=1',u.id)?.code||null,blocked:store.all('SELECT users.id,users.name FROM contact_blocks JOIN users ON users.id=contact_blocks.peer WHERE owner=?',u.id)});return true;
    }
    if(route==='/dial/code'&&['PUT','DELETE'].includes(req.method)){
      if(!enabled)fail(404,'Calling codes are not enabled');rate('dial-code:'+u.id,10);
      if(req.method==='DELETE'){store.run('UPDATE dial_codes SET active=0 WHERE owner=?',u.id);json(200,{code:null});return true;}
      const b=await body(req);let code=dialCode(b.code);
      if(b.random===true){for(let i=0;i<30;i++){const choice=String(randomInt(100000,1000000));if(!store.get('SELECT 1 FROM dial_codes WHERE code=?',choice)){code=choice;break;}}}
      if(!code)fail(400,'Choose a calling code of 4 to 12 digits');
      store.transaction(()=>{
        const prior=store.get('SELECT * FROM dial_codes WHERE code=?',code);
        if(prior&&prior.owner!==u.id)fail(409,'That code is unavailable. Choose another one.');
        if(!prior&&store.get('SELECT COUNT(*) n FROM dial_codes WHERE owner=?',u.id).n>=10)fail(429,'This phone has reserved too many codes');
        store.run('UPDATE dial_codes SET active=0 WHERE owner=?',u.id);
        store.run('INSERT INTO dial_codes(code,owner,active) VALUES(?,?,1) ON CONFLICT(code) DO UPDATE SET active=1',code,u.id);
      });const url=new URL(publicURL);url.hash='dial='+code;json(200,{code,url:url.href});return true;
    }
    const accepted=route.match(/^\/contacts\/([a-f0-9-]{36})\/accept$/);
    if(accepted&&req.method==='POST'){accept(u.id,accepted[1]);json(200,{ok:true});return true;}
    const unblock=route.match(/^\/blocks\/([a-f0-9-]{36})$/);
    if(unblock&&req.method==='DELETE'){store.run('DELETE FROM contact_blocks WHERE owner=? AND peer=?',u.id,unblock[1]);json(200,{ok:true});return true;}
    return false;
  }
  return {connect,routes,roster,blocked,pending,accept,beforeMessage,countMessage};
}
