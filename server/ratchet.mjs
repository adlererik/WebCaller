import {verify,createPublicKey} from 'node:crypto';
const curveKey=s=>typeof s==='string'&&/^[A-Za-z0-9+/]{43}$/.test(s)&&Buffer.from(s,'base64').length===32;
const identityStatement=(owner,identity)=>JSON.stringify({v:2,owner,identity});
const prekeyStatement=(owner,identity,id,key)=>JSON.stringify({v:2,owner,identity,id,key});
export function ratchetRoutes({store,related,body,fail,emit}){
  return async(req,res,route,u,json)=>{
    if(!route.startsWith('/ratchet/'))return false;
    if(route==='/ratchet/status'&&req.method==='GET'){
      json(200,{available:store.get('SELECT COUNT(*) n FROM ratchet_prekeys WHERE owner=? AND claimed=0',u.id).n});return true;
    }
    if(route==='/ratchet/publish'&&req.method==='POST'){
      const b=await body(req),publicKey=createPublicKey({key:JSON.parse(u.keys).sign,format:'jwk'});
      const authentic=(statement,signature)=>typeof signature==='string'&&signature.length<=128&&verify('sha256',Buffer.from(statement),{key:publicKey,dsaEncoding:'ieee-p1363'},Buffer.from(signature,'base64url'));
      if(b.v!==2||!curveKey(b.identity)||!Array.isArray(b.keys)||b.keys.length>50||!authentic(identityStatement(u.id,b.identity),b.signature))fail(400,'Invalid signed secure identity');
      const seen=new Set();
      for(const k of b.keys){
        if(!k||typeof k.id!=='string'||!/^[A-Za-z0-9+/]{1,24}$/.test(k.id)||seen.has(k.id)||!curveKey(k.key)||!authentic(prekeyStatement(u.id,b.identity,k.id,k.key),k.signature))fail(400,'Invalid signed one-time key');seen.add(k.id);
      }
      const prior=store.get('SELECT * FROM ratchet_accounts WHERE owner=?',u.id);
      if(prior&&prior.identity!==b.identity)fail(409,'This device’s secure storage changed. Set up the device again rather than replacing its trusted identity.');
      store.transaction(()=>{
        store.run('INSERT OR IGNORE INTO ratchet_accounts VALUES(?,?,?)',u.id,b.identity,b.signature);
        for(const k of b.keys){const existing=store.get('SELECT * FROM ratchet_prekeys WHERE owner=? AND id=?',u.id,k.id);
          if(existing&&(existing.key!==k.key||existing.signature!==k.signature)){
            // ECDSA signatures are randomized; the same public key may be re-signed on retry.
            if(existing.key!==k.key)fail(409,'One-time key identifier conflict');
          }
          // Keep claimed IDs: a retried publication must never resurrect a used key.
          store.run('INSERT OR IGNORE INTO ratchet_prekeys VALUES(?,?,?,?,0)',u.id,k.id,k.key,k.signature);
        }
      });
      // A migration snapshot is safe to retry: v1 writes to/from activated devices
      // are blocked. Only envelopes already stored before activation are returned.
      const legacy=store.all('SELECT envelope FROM messages WHERE sender=? OR recipient=? UNION SELECT envelope FROM message_events WHERE actor=? OR message_id IN(SELECT id FROM messages WHERE sender=? OR recipient=?) UNION SELECT envelope FROM attachments WHERE sender=? OR recipient=?',u.id,u.id,u.id,u.id,u.id,u.id,u.id).map(r=>JSON.parse(r.envelope)).filter(e=>e.v===1&&e.expiresAt>Date.now());
      json(200,{ok:true,legacy});if(!prior)for(const peer of store.all('SELECT b FROM contacts WHERE a=?',u.id))emit(peer.b,{type:'contacts'});return true;
    }
    const claim=route.match(/^\/ratchet\/claim\/([a-f0-9-]{36})$/);
    if(claim&&req.method==='POST'){
      const peer=claim[1];if(!related(u.id,peer))fail(403,'Invite this person first');
      const bundle=store.transaction(()=>{
        const a=store.get('SELECT * FROM ratchet_accounts WHERE owner=?',peer);
        if(!a)fail(426,'Ask the other person to reopen WebCaller to update secure messaging.');
        const k=store.get('SELECT * FROM ratchet_prekeys WHERE owner=? AND claimed=0 ORDER BY id LIMIT 1',peer);
        if(!k){emit(peer,{type:'secure-keys-needed'});fail(503,'The other device needs to reopen WebCaller to refresh its secure keys.');}
        store.run('UPDATE ratchet_prekeys SET claimed=1 WHERE owner=? AND id=? AND claimed=0',peer,k.id);
        return {v:2,identity:a.identity,signature:a.signature,prekey:{id:k.id,key:k.key,signature:k.signature}};
      });json(200,bundle);return true;
    }
    fail(404,'Secure messaging route not found');
  };
}
