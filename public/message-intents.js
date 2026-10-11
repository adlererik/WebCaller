// One-use chat navigation from a notification tap; no URL identifiers or content.
// Valid for at most two minutes. This never grants microphone/camera permission.
export function messageIntents({factory=globalThis.indexedDB,name='webcaller-message-intents',now=Date.now}={}){
  const uuid=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/.test(value);
  const connect=()=>new Promise((resolve,reject)=>{
    if(!factory)return reject(new Error('Browser storage unavailable'));
    const r=factory.open(name,1);r.onupgradeneeded=()=>r.result.createObjectStore('open',{keyPath:'owner'});
    r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Error('Browser storage blocked'));
  });
  async function transaction(work){
    const db=await connect();try{return await new Promise((resolve,reject)=>{
      const tx=db.transaction('open','readwrite');let value;
      tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Storage aborted'));
      work(tx.objectStore('open'),result=>value=result);
    });}finally{db.close();}
  }
  return {
    async put(owner,messageId,peerId,expiresAt){
      if(!uuid(owner)||!uuid(messageId)||!uuid(peerId)||!Number.isSafeInteger(expiresAt)||expiresAt<=now())return false;
      try{return await transaction((store,done)=>{store.clear();store.put({owner,messageId,peerId,expiresAt:Math.min(expiresAt,now()+120000)});done(true);});}catch{return false;}
    },
    async take(owner){
      if(!uuid(owner))return null;
      try{return await transaction((store,done)=>{const r=store.get(owner);r.onsuccess=()=>{store.clear();const value=r.result;done(value&&uuid(value.messageId)&&uuid(value.peerId)&&value.expiresAt>now()?value:null);};});}catch{return null;}
    },
    async clear(){try{await transaction(store=>store.clear());}catch{}}
  };
}
export function resolveMessageIntent(intent,messages,contacts,self,now=Date.now()){
  if(!intent||intent.owner!==self||intent.expiresAt<=now)return null;
  const peer=contacts.find(c=>c.id===intent.peerId);if(!peer)return null;
  const m=messages.get(intent.messageId);if(m&&(m.from!==peer.id||m.to!==self))return null;
  return {peer,message:m?.expiresAt>now?m:null};
}
