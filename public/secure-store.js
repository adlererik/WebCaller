// Atomic encrypted records and a fenced IndexedDB lease shared by browser tabs.
// The wrapping key protects stored ciphertext, not a compromised same-origin page.
import {b64,unb64} from './crypto.js';
const enc=new TextEncoder(),dec=new TextDecoder();
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function secureStore({indexedDB=globalThis.indexedDB,name='webcaller-signal-secure-v1',now=Date.now}={}){
  let database;
  const connect=()=>database ||= new Promise((resolve,reject)=>{
    if(!indexedDB)return reject(new Error('Secure browser storage is unavailable.'));
    const r=indexedDB.open(name,1);r.onupgradeneeded=()=>r.result.createObjectStore('records',{keyPath:'id'}).createIndex('owner','owner');
    r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
  });
  async function transaction(work,mode='readonly'){
    const db=await connect();return new Promise((resolve,reject)=>{
      const tx=db.transaction('records',mode),store=tx.objectStore('records');let result;
      tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(tx.error||new Error('Secure storage transaction failed.'));
      try{work(store,value=>{result=value;},tx);}catch(error){tx.abort();reject(error);}
    });
  }
  const get=id=>transaction((s,done)=>{s.get(id).onsuccess=e=>done(e.target.result);});
  const list=owner=>transaction((s,done)=>{s.index('owner').getAll(owner).onsuccess=e=>done(e.target.result);});
  async function exclusive(owner,work){
    const id=owner+':lease',token=crypto.randomUUID(),deadline=now()+30000;
    while(!await transaction((s,done)=>{s.get(id).onsuccess=e=>{
      const prior=e.target.result;if(prior&&prior.until>now())return done(false);
      s.put({id,owner,token,until:now()+10000});done(true);
    };},'readwrite')){if(now()>deadline)throw new Error('Another tab is updating secure messages. Try again.');await pause(25);}
    async function commit(puts=[],removes=[]){
      return transaction((s,done,tx)=>{s.get(id).onsuccess=e=>{
        if(e.target.result?.token!==token||e.target.result.until<=now()){tx.abort();return;}
        for(const row of puts)s.put(row);for(const key of removes)s.delete(key);done(true);
      };},'readwrite');
    }
    const heartbeat=setInterval(()=>void transaction((s,done)=>{s.get(id).onsuccess=e=>{
      const lease=e.target.result;if(lease?.token===token){lease.until=now()+10000;s.put(lease);}done();
    };},'readwrite').catch(()=>{}),2500);
    try{return await work({commit});}finally{
      clearInterval(heartbeat);await transaction((s,done)=>{s.get(id).onsuccess=e=>{if(e.target.result?.token===token)s.delete(id);done();};},'readwrite');
    }
  }
  async function lock(owner,work){
    return exclusive(owner,async({commit})=>{
      let meta=await get(owner+':meta');
      if(!meta){meta={id:owner+':meta',owner,kind:'meta',key:await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']),legacyImported:false};await commit([meta]);}
      const aad=row=>enc.encode(JSON.stringify([row.id,row.owner,row.kind,row.peer||'',row.expiresAt||0,row.target||'']));
      const read=async suffix=>{
        const row=await get(owner+':'+suffix);if(!row)return null;
        if(row.expiresAt&&row.expiresAt<=now())return null;
        return JSON.parse(dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(row.iv),additionalData:aad(row)},meta.key,unb64(row.ciphertext))));
      };
      const record=async(suffix,value,attributes={})=>{
        const row={id:owner+':'+suffix,owner,...attributes},iv=crypto.getRandomValues(new Uint8Array(12));
        row.ciphertext=b64(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(row)},meta.key,enc.encode(JSON.stringify(value))));row.iv=b64(iv);return row;
      };
      return await work({meta,read,record,commit,list:()=>list(owner),key:suffix=>owner+':'+suffix,now});
    });
  }
  return {lock,exclusive,close:async()=>{(await connect()).close();database=null;}};
}
