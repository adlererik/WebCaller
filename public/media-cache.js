import {NO_EXPIRY} from './message-lifetime.js';
import {CHUNK_SIZE,MAX_FILE_SIZE} from './attachments.js';
// Persist ciphertext only. Keys, names, MIME types and plaintext stay in encrypted
// messages / memory. Transactions keep deletion ahead of late transfer writes.
export function mediaCache({indexedDB=globalThis.indexedDB,name='webcaller-media',now=Date.now}={}){
  let database,lastError;
  const connect=()=>database ||=new Promise((resolve,reject)=>{
    if(!indexedDB)return reject(new Error('Browser storage unavailable'));
    const request=indexedDB.open(name,2);
    request.onupgradeneeded=()=>{
      const db=request.result;
      for(const n of ['files','deleted','pending','chunks'])if(!db.objectStoreNames.contains(n)){
        const store=db.createObjectStore(n,{keyPath:'key'});store.createIndex('expiresAt','expiresAt');
        if(n==='chunks'){store.createIndex('fileKey','fileKey');store.createIndex('generation','generation');}
      }
    };
    request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>db.close();resolve(db);};
    request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('Browser storage blocked'));
  });
  const safe=async work=>{try{lastError=null;return await work(await connect());}catch(e){lastError=e.name||e.message;return null;}};
  const key=(owner,id)=>owner+':'+id;
  const valid=(m,a)=>typeof m.id==='string'&&typeof a.id==='string'&&m.expiresAt>now()&&Number.isSafeInteger(m.expiresAt)&&Number.isSafeInteger(a.size)&&a.size>0&&a.size<=MAX_FILE_SIZE&&a.chunks===Math.ceil(a.size/CHUNK_SIZE);
  const transaction=(db,work)=>new Promise((resolve,reject)=>{
    const tx=db.transaction(['files','deleted','pending','chunks'],'readwrite');let result;
    tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Storage transaction aborted'));
    work(tx,value=>result=value);
  });
  const walk=(index,value,action)=>{const r=index.openCursor(value);r.onsuccess=()=>{const c=r.result;if(c){action(c);c.continue();}};};
  const erase=(tx,k)=>{tx.objectStore('files').delete(k);tx.objectStore('pending').delete(k);walk(tx.objectStore('chunks').index('fileKey'),k,c=>c.delete());};
  const binding=(m)=>m.wireExpiresAt||m.expiresAt;
  const matches=(r,m,a)=>valid(m,a)&&r&&r.attachmentId===a.id&&(r.bindingExpiry||r.expiresAt)===binding(m)&&r.expiresAt>now()&&r.size===a.size&&r.count===a.chunks&&(r.expiresAt===m.expiresAt||m.lifetime&&r.expiresAt===NO_EXPIRY);
  const metadata=(owner,m,a)=>({key:key(owner,m.id),attachmentId:a.id,size:a.size,count:a.chunks,expiresAt:m.expiresAt,...(m.lifetime?{bindingExpiry:binding(m)}:{})});
  return {
    // Stream complete encrypted chunks into separate records. Only a complete,
    // generation-bound set becomes visible; deletions invalidate late writers.
    async writer(owner,m,a){
      if(!owner||!valid(m,a))return null;
      const k=key(owner,m.id),generation=crypto.randomUUID();let closed=false;
      const started=await safe(db=>transaction(db,(tx,done)=>{
        const r=tx.objectStore('deleted').get(k);r.onsuccess=()=>{
          if(r.result?.expiresAt>now()||!valid(m,a))return done(false);
          const pending=tx.objectStore('pending'),prior=pending.get(k);prior.onsuccess=()=>{
            if(prior.result)walk(tx.objectStore('chunks').index('generation'),prior.result.generation,c=>c.delete());
            pending.put({...metadata(owner,m,a),generation,expiresAt:Math.min(m.expiresAt,now()+86400000)});done(true);
          };
        };
      }));
      if(!started)return null;
      const close=async()=>{if(closed)return;closed=true;await safe(db=>transaction(db,tx=>{
        const pending=tx.objectStore('pending'),r=pending.get(k);r.onsuccess=()=>{if(r.result?.generation===generation)pending.delete(k);};
        walk(tx.objectStore('chunks').index('generation'),generation,c=>c.delete());
      }));};
      return {
        async put(index,bytes){
          if(closed||!Number.isInteger(index)||index<0||index>=a.chunks||!(bytes instanceof ArrayBuffer)||bytes.byteLength!==Math.min(CHUNK_SIZE,a.size-index*CHUNK_SIZE)+16)return false;
          return !!await safe(db=>transaction(db,(tx,done)=>{
            const r=tx.objectStore('pending').get(k);r.onsuccess=()=>{
              if(r.result?.generation!==generation||!valid(m,a))return done(false);
              const expiresAt=Math.min(m.expiresAt,now()+86400000);
              tx.objectStore('chunks').put({key:generation+':'+index,fileKey:k,generation,index,expiresAt,bytes});done(true);
            };
          }));
        },
        async commit(){
          if(closed)return false;
          const result=await safe(db=>transaction(db,(tx,done)=>{
            const pending=tx.objectStore('pending'),r=pending.get(k);r.onsuccess=()=>{
              if(r.result?.generation!==generation||!valid(m,a))return done(false);
              const chunks=tx.objectStore('chunks'),count=chunks.index('generation').count(generation);count.onsuccess=()=>{
                if(count.result!==a.chunks)return done(false);
                walk(chunks.index('fileKey'),k,c=>{if(c.value.generation!==generation)c.delete();else c.update({...c.value,expiresAt:m.expiresAt});});
                tx.objectStore('files').put({...metadata(owner,m,a),generation});pending.delete(k);done(true);
              };
            };
          }));
          if(result)closed=true;return !!result;
        },abort:close
      };
    },
    async reader(owner,m,a){
      if(!owner||!valid(m,a))return null;
      const k=key(owner,m.id),record=await safe(db=>transaction(db,(tx,done)=>{
        const removed=tx.objectStore('deleted').get(k);removed.onsuccess=()=>{
          if(removed.result?.expiresAt>now())return done(null);
          const r=tx.objectStore('files').get(k);r.onsuccess=()=>done(matches(r.result,m,a)?r.result:null);
        };
      }));
      if(!record)return null;
      return {async chunk(index){
        if(!Number.isInteger(index)||index<0||index>=a.chunks)return null;
        return await safe(db=>transaction(db,(tx,done)=>{
          const r=tx.objectStore('files').get(k);r.onsuccess=()=>{
            if(!matches(r.result,m,a)||r.result.generation!==record.generation)return done(null);
            if(record.chunks)return done(record.chunks[index]);
            const bytes=tx.objectStore('chunks').get(record.generation+':'+index);bytes.onsuccess=()=>done(bytes.result?.expiresAt>now()?bytes.result.bytes:null);
          };
        }));
      }};
    },
    get lastError(){return lastError;},
    async put(owner,m,a,chunks){
      if(!owner||!valid(m,a)||chunks.length!==a.chunks||chunks.some((c,i)=>!(c instanceof ArrayBuffer)||c.byteLength!==Math.min(CHUNK_SIZE,a.size-i*CHUNK_SIZE)+16))return false;
      return !!await safe(db=>transaction(db,(tx,done)=>{
        const k=key(owner,m.id),check=tx.objectStore('deleted').get(k);
        check.onsuccess=()=>{if(check.result?.expiresAt>now()||!valid(m,a))return done(false);
          tx.objectStore('files').put({key:k,attachmentId:a.id,size:a.size,count:a.chunks,expiresAt:m.expiresAt,...(m.lifetime?{bindingExpiry:m.wireExpiresAt||m.expiresAt}:{}),chunks});done(true);};
      }));
    },
    async get(owner,m,a){
      if(!owner||!valid(m,a))return null;
      return await safe(db=>transaction(db,(tx,done)=>{
        const k=key(owner,m.id),files=tx.objectStore('files'),check=tx.objectStore('deleted').get(k);
        check.onsuccess=()=>{if(check.result?.expiresAt>now()){files.delete(k);return done(null);}
          const request=files.get(k);request.onsuccess=()=>{const record=request.result;
            if(!valid(m,a)||!record||record.attachmentId!==a.id||(record.bindingExpiry||record.expiresAt)!==(m.wireExpiresAt||m.expiresAt)||record.expiresAt<=now()||record.expiresAt!==m.expiresAt&&!(m.lifetime&&record.expiresAt===NO_EXPIRY)||record.size!==a.size||record.count!==a.chunks)return done(null);
            if(record.expiresAt!==m.expiresAt){record.expiresAt=m.expiresAt;files.put(record);}
            done(record.chunks);
          };};
      }));
    },
    async startTimer(owner,m){
      if(!owner||!m.lifetime||!Number.isSafeInteger(m.expiresAt)||m.expiresAt<=now())return;
      await safe(db=>transaction(db,tx=>{const files=tx.objectStore('files'),request=files.get(key(owner,m.id));request.onsuccess=()=>{const record=request.result;if(record&&record.expiresAt===NO_EXPIRY&&(record.bindingExpiry||record.expiresAt)===(m.wireExpiresAt||m.expiresAt)){record.expiresAt=m.expiresAt;files.put(record);walk(tx.objectStore('chunks').index('fileKey'),key(owner,m.id),c=>c.update({...c.value,expiresAt:Math.min(c.value.expiresAt,m.expiresAt)}));}};}));
    },
    async remove(owner,id,expiresAt){
      if(!owner||typeof id!=='string'||!Number.isSafeInteger(expiresAt))return;
      await safe(db=>transaction(db,(tx)=>{const k=key(owner,id);erase(tx,k);if(expiresAt>now())tx.objectStore('deleted').put({key:k,expiresAt});}));
    },
    async evict(owner,id){await safe(db=>transaction(db,tx=>erase(tx,key(owner,id))));},
    async purge(){await safe(db=>transaction(db,tx=>{
      for(const n of ['files','deleted','pending','chunks']){const request=tx.objectStore(n).index('expiresAt').openCursor();request.onsuccess=()=>{const cursor=request.result;if(!cursor||cursor.value.expiresAt>now())return;cursor.delete();cursor.continue();};}
    }));},
    async clear(){await safe(db=>transaction(db,tx=>{for(const n of ['files','deleted','pending','chunks'])tx.objectStore(n).clear();}));}
  };
}
