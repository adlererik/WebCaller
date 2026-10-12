import {fingerprint} from './crypto.js';
// A server-controlled roster change must never authorize an identity change.
export async function checkContactTrust(store,owner,contact,seed){
  const next=await fingerprint(contact.keys);
  return store.lock(owner,async db=>{
    const suffix='trust/'+contact.id,prior=await db.read(suffix);
    const expected=prior?.fingerprint||(seed?await fingerprint(seed.keys):null);
    if(expected&&expected!==next)throw new Error(`Device keys changed for ${contact.name||'this contact'}. Verify their new identity through a trusted channel.`);
    if(!prior)await db.commit([await db.record(suffix,{fingerprint:next},{kind:'trust',peer:contact.id})]);
    return next;
  });
}
