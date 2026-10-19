import test from 'node:test';import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';import {mediaCache} from '../public/media-cache.js';
import {newAttachment,CHUNK_SIZE,attachmentKey,encryptChunk,decryptChunk} from '../public/attachments.js';
import {NO_EXPIRY} from '../public/message-lifetime.js';
async function fixture(){const indexedDB=new IDBFactory(),cache=()=>mediaCache({indexedDB,name:'stream'}),a=newAttachment({size:2*CHUNK_SIZE+1,name:'Synthetic media.bin'}),m={id:crypto.randomUUID(),expiresAt:Date.now()+60000},key=await attachmentKey(a);return {indexedDB,cache,a,m,key,chunk:async i=>encryptChunk(key,a,i,m.wireExpiresAt||m.expiresAt,new Uint8Array(Math.min(CHUNK_SIZE,a.size-i*CHUNK_SIZE)).fill(i+1))};}
test('incremental ciphertext remains invisible until complete and survives reopening without a network transfer',async()=>{
 const f=await fixture(),c=f.cache(),w=await c.writer('alice',f.m,f.a);
 await w.put(2,await f.chunk(2));assert.equal(await c.reader('alice',f.m,f.a),null);assert.equal(await w.commit(),false);
 for(const i of [1,0])assert.equal(await w.put(i,await f.chunk(i)),true);
 assert.equal(await w.commit(),true);await w.abort(); // Cleanup cannot erase committed data.
 const reader=await f.cache().reader('alice',f.m,f.a);assert.ok(reader);
 for(let i=0;i<3;i++)assert.ok(new Uint8Array(await decryptChunk(f.key,f.a,i,f.m.expiresAt,await reader.chunk(i))).every(v=>v===i+1));
 const db=await new Promise(resolve=>{const r=f.indexedDB.open('stream');r.onsuccess=()=>resolve(r.result);});
 const record=await new Promise(resolve=>{const r=db.transaction('files').objectStore('files').get('alice:'+f.m.id);r.onsuccess=()=>resolve(r.result);});
 assert.equal(record.chunks,undefined);assert.ok(record.generation);assert.ok(!JSON.stringify(record).includes(f.a.key));db.close();
});
test('deletion invalidates active writers/readers across tabs and removes staged bytes',async()=>{
 const f=await fixture(),c=f.cache(),w=await c.writer('alice',f.m,f.a);await w.put(0,await f.chunk(0));
 await f.cache().remove('alice',f.m.id,f.m.expiresAt);assert.equal(await w.put(1,await f.chunk(1)),false);assert.equal(await w.commit(),false);await w.abort();assert.equal(await c.reader('alice',f.m,f.a),null);assert.equal(await c.writer('alice',f.m,f.a),null);
});
test('a new generation rejects late writes and first-view expiry retimes streamed chunks without changing their AAD',async()=>{
 const f=await fixture();f.m.expiresAt=NO_EXPIRY;f.m.wireExpiresAt=NO_EXPIRY;f.m.lifetime={mode:'after-view',seconds:30};
 const c=f.cache(),old=await c.writer('alice',f.m,f.a),w=await f.cache().writer('alice',f.m,f.a);assert.equal(await old.put(0,await f.chunk(0)),false);
 for(let i=0;i<3;i++)await w.put(i,await f.chunk(i));assert.equal(await w.commit(),true);await old.abort();
 f.m.expiresAt=Date.now()+30000;await c.startTimer('alice',f.m);const r=await f.cache().reader('alice',f.m,f.a);assert.ok(r);
 assert.equal(new Uint8Array(await decryptChunk(f.key,f.a,2,NO_EXPIRY,await r.chunk(2)))[0],3);
 await c.remove('alice',f.m.id,NO_EXPIRY);assert.equal(await r.chunk(2),null);
});
test('opening an existing v1 cache upgrades additively and retains previously saved ciphertext',async()=>{
 const f=await fixture(),cipher=await f.chunk(0),idb=f.indexedDB;
 const db=await new Promise(resolve=>{const r=idb.open('stream',1);r.onupgradeneeded=()=>{for(const n of ['files','deleted'])r.result.createObjectStore(n,{keyPath:'key'}).createIndex('expiresAt','expiresAt');};r.onsuccess=()=>resolve(r.result);});
 const a={...f.a,size:CHUNK_SIZE,chunks:1};await new Promise(resolve=>{const t=db.transaction('files','readwrite');t.objectStore('files').put({key:'alice:'+f.m.id,attachmentId:a.id,size:a.size,count:1,expiresAt:f.m.expiresAt,chunks:[cipher]});t.oncomplete=resolve;});db.close();
 const reader=await f.cache().reader('alice',f.m,a);assert.deepEqual(await reader.chunk(0),cipher);
});

test('streamed reads bind the owner, attachment and immutable expiry; clearing removes complete and pending sets',async()=>{
 const f=await fixture(),c=f.cache(),w=await c.writer('alice',f.m,f.a);for(let i=0;i<3;i++)await w.put(i,await f.chunk(i));await w.commit();
 assert.equal(await c.reader('bob',f.m,f.a),null);assert.equal(await c.reader('alice',{...f.m,expiresAt:f.m.expiresAt+1},f.a),null);assert.equal(await c.reader('alice',f.m,{...f.a,id:crypto.randomUUID()}),null);
 const reader=await c.reader('alice',f.m,f.a),pending=await c.writer('alice',{...f.m,id:crypto.randomUUID()},f.a);await pending.put(0,await f.chunk(0));await c.clear();assert.equal(await reader.chunk(0),null);assert.equal(await pending.put(1,await f.chunk(1)),false);
});
test('an incomplete Off cache has a bounded staging lease and physical purge removes expired chunks',async()=>{
 const f=await fixture();let time=Date.now();f.m.expiresAt=NO_EXPIRY;const c=mediaCache({indexedDB:f.indexedDB,name:'leases',now:()=>time}),w=await c.writer('alice',f.m,f.a);await w.put(0,await f.chunk(0));
 time+=86400001;await c.purge();assert.equal(await w.put(1,await f.chunk(1)),false);assert.equal(await w.commit(),false);assert.equal(await c.reader('alice',f.m,f.a),null);
 const db=await new Promise(resolve=>{const r=f.indexedDB.open('leases');r.onsuccess=()=>resolve(r.result);});
 assert.equal(await new Promise(resolve=>{const r=db.transaction('chunks').objectStore('chunks').count();r.onsuccess=()=>resolve(r.result);}),0);db.close();
});
