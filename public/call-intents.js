// A one-use decision from a notification button, never from a link or push payload.
// No names/content; at most 30 seconds of answer intent, scoped to this identity.
export function callIntents({factory=globalThis.indexedDB,name='webcaller-call-intents',now=Date.now}={}){
  const uuid=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/.test(value);
  const connect=()=>new Promise((resolve,reject)=>{
    if(!factory)return reject(new Error('Browser storage unavailable'));
    const r=factory.open(name,1);r.onupgradeneeded=()=>r.result.createObjectStore('answer',{keyPath:'owner'});
    r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Error('Browser storage blocked'));
  });
  async function transaction(work){
    const db=await connect();try{return await new Promise((resolve,reject)=>{
      const tx=db.transaction('answer','readwrite');let value;
      tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Storage aborted'));
      work(tx.objectStore('answer'),result=>value=result);
    });}finally{db.close();}
  }
  return {
    async put(owner,callId,expiresAt){
      if(!uuid(owner)||!uuid(callId)||!Number.isSafeInteger(expiresAt)||expiresAt<=now())return false;
      try{return await transaction((store,done)=>{store.clear();store.put({owner,callId,expiresAt:Math.min(expiresAt,now()+30000)});done(true);});}catch{return false;}
    },
    async take(owner){
      if(!uuid(owner))return null;
      try{return await transaction((store,done)=>{const r=store.get(owner);r.onsuccess=()=>{store.clear();const value=r.result;done(value&&uuid(value.callId)&&value.expiresAt>now()?value:null);};});}catch{return null;}
    },
    async clear(){try{await transaction(store=>store.clear());}catch{}}
  };
}
