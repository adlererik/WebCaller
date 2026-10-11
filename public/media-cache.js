import {CHUNK_SIZE,MAX_FILE_SIZE} from './attachments.js';
// Persist ciphertext only. Keys, names, MIME types and plaintext stay in encrypted
// messages / memory. Transactions keep deletion ahead of late transfer writes.
export function mediaCache({indexedDB=globalThis.indexedDB,name='webcaller-media',now=Date.now}={}){
  let database,lastError;
  const connect=()=>database ||=new Promise((resolve,reject)=>{
    if(!indexedDB)return reject(new Error('Browser storage unavailable'));
    const request=indexedDB.open(name,1);
    request.onupgradeneeded=()=>{for(const n of ['files','deleted'])request.result.createObjectStore(n,{keyPath:'key'}).createIndex('expiresAt','expiresAt');};
    request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>db.close();resolve(db);};
    request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('Browser storage blocked'));
  });
  const safe=async work=>{try{lastError=null;return await work(await connect());}catch(e){lastError=e.name||e.message;return null;}};
  const key=(owner,id)=>owner+':'+id;
  const valid=(m,a)=>typeof m.id==='string'&&typeof a.id==='string'&&m.expiresAt>now()&&Number.isSafeInteger(m.expiresAt)&&Number.isSafeInteger(a.size)&&a.size>0&&a.size<=MAX_FILE_SIZE&&a.chunks===Math.ceil(a.size/CHUNK_SIZE);
  const transaction=(db,work)=>new Promise((resolve,reject)=>{
    const tx=db.transaction(['files','deleted'],'readwrite');let result;
    tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Storage transaction aborted'));
    work(tx,value=>result=value);
  });
  return {
    get lastError(){return lastError;},
    async put(owner,m,a,chunks){
      if(!owner||!valid(m,a)||chunks.length!==a.chunks||chunks.some((c,i)=>!(c instanceof ArrayBuffer)||c.byteLength!==Math.min(CHUNK_SIZE,a.size-i*CHUNK_SIZE)+16))return false;
      return !!await safe(db=>transaction(db,(tx,done)=>{
        const k=key(owner,m.id),check=tx.objectStore('deleted').get(k);
        check.onsuccess=()=>{if(check.result?.expiresAt>now()||!valid(m,a))return done(false);
          tx.objectStore('files').put({key:k,attachmentId:a.id,size:a.size,count:a.chunks,expiresAt:m.expiresAt,chunks});done(true);};
      }));
    },
    async get(owner,m,a){
      if(!owner||!valid(m,a))return null;
      return await safe(db=>transaction(db,(tx,done)=>{
        const k=key(owner,m.id),files=tx.objectStore('files'),check=tx.objectStore('deleted').get(k);
        check.onsuccess=()=>{if(check.result?.expiresAt>now()){files.delete(k);return done(null);}
          const request=files.get(k);request.onsuccess=()=>{const record=request.result;
            if(!valid(m,a)||!record||record.attachmentId!==a.id||record.expiresAt!==m.expiresAt||record.size!==a.size||record.count!==a.chunks)return done(null);
            done(record.chunks);
          };};
      }));
    },
    async remove(owner,id,expiresAt){
      if(!owner||typeof id!=='string'||!Number.isSafeInteger(expiresAt))return;
      await safe(db=>transaction(db,(tx)=>{const k=key(owner,id);tx.objectStore('files').delete(k);if(expiresAt>now())tx.objectStore('deleted').put({key:k,expiresAt});}));
    },
    async evict(owner,id){await safe(db=>transaction(db,tx=>tx.objectStore('files').delete(key(owner,id))));},
    async purge(){await safe(db=>transaction(db,tx=>{
      for(const n of ['files','deleted']){const request=tx.objectStore(n).index('expiresAt').openCursor();request.onsuccess=()=>{const cursor=request.result;if(!cursor||cursor.value.expiresAt>now())return;cursor.delete();cursor.continue();};}
    }));},
    async clear(){await safe(db=>transaction(db,tx=>{tx.objectStore('files').clear();tx.objectStore('deleted').clear();}));}
  };
}
