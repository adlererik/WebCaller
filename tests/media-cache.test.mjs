import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {mediaCache} from '../public/media-cache.js';
import {newAttachment,attachmentKey,encryptChunk,decryptChunk} from '../public/attachments.js';
async function fixture(){
 const indexedDB=new IDBFactory(),a=newAttachment(new File(['Secret photograph bytes'],'private-name.png',{type:'image/png'})),m={id:crypto.randomUUID(),expiresAt:Date.now()+60000},key=await attachmentKey(a),plain=new TextEncoder().encode('Secret photograph bytes'),chunks=[await encryptChunk(key,a,0,m.expiresAt,plain)];let time=Date.now();
 return {indexedDB,a,m,key,plain,chunks,clock:t=>time=t,cache:()=>mediaCache({indexedDB,name:'test',now:()=>time})};
}
test('encrypted files survive a new cache instance without retaining a key, name or plaintext',async()=>{
 const f=await fixture();assert.equal(await f.cache().put('alice',f.m,f.a,f.chunks),true);
 const saved=await f.cache().get('alice',f.m,f.a);assert.deepEqual(new Uint8Array(await decryptChunk(f.key,f.a,0,f.m.expiresAt,saved[0])),f.plain);
 const db=await new Promise(resolve=>{const r=f.indexedDB.open('test');r.onsuccess=()=>resolve(r.result);});
 const record=await new Promise(resolve=>{const r=db.transaction('files').objectStore('files').get('alice:'+f.m.id);r.onsuccess=()=>resolve(r.result);});
 assert.deepEqual(Object.keys(record).sort(),['attachmentId','chunks','count','expiresAt','key','size']);assert.notDeepEqual(new Uint8Array(record.chunks[0]),f.plain);assert.ok(!JSON.stringify(record).includes(f.a.key));assert.ok(!JSON.stringify(record).includes(f.a.name));db.close();
});
test('cached files are bound to owner, message, attachment, size and original expiry',async()=>{
 const f=await fixture(),c=f.cache();await c.put('alice',f.m,f.a,f.chunks);
 assert.equal(await c.get('bob',f.m,f.a),null);assert.equal(await c.get('alice',{...f.m,id:crypto.randomUUID()},f.a),null);
 assert.equal(await c.get('alice',f.m,{...f.a,id:crypto.randomUUID()}),null);assert.equal(await c.get('alice',{...f.m,expiresAt:f.m.expiresAt+1},f.a),null);assert.equal(await c.get('alice',f.m,{...f.a,size:f.a.size+1}),null);
});
test('deletion removes saved ciphertext and blocks late writes even in a new tab',async()=>{
 const f=await fixture(),c=f.cache();await c.put('alice',f.m,f.a,f.chunks);
 await Promise.all([c.remove('alice',f.m.id,f.m.expiresAt),f.cache().put('alice',f.m,f.a,f.chunks)]);
 assert.equal(await f.cache().get('alice',f.m,f.a),null);assert.equal(await f.cache().put('alice',f.m,f.a,f.chunks),false);
});
test('a deletion arriving while a file is saved wins across cache instances',async()=>{
 const f=await fixture();await Promise.all([f.cache().put('alice',f.m,f.a,f.chunks),f.cache().remove('alice',f.m.id,f.m.expiresAt)]);assert.equal(await f.cache().get('alice',f.m,f.a),null);
});
test('expiry makes the file unreadable and purge removes physical records',async()=>{
 const f=await fixture(),c=f.cache();await c.put('alice',f.m,f.a,f.chunks);f.clock(f.m.expiresAt);assert.equal(await c.get('alice',f.m,f.a),null);assert.equal(await c.put('alice',f.m,f.a,f.chunks),false);await c.purge();
 const db=await new Promise(resolve=>{const r=f.indexedDB.open('test');r.onsuccess=()=>resolve(r.result);});assert.equal(await new Promise(resolve=>{const r=db.transaction('files').objectStore('files').count();r.onsuccess=()=>resolve(r.result);}),0);db.close();
});
test('corrupt data can be evicted and replaced, while forget clears all cached records',async()=>{
 const f=await fixture(),c=f.cache();await c.put('alice',f.m,f.a,f.chunks);await c.evict('alice',f.m.id);assert.equal(await c.get('alice',f.m,f.a),null);assert.equal(await c.put('alice',f.m,f.a,f.chunks),true);await c.clear();assert.equal(await f.cache().get('alice',f.m,f.a),null);
});
test('storage unavailable and incomplete files do not break calling or messaging',async()=>{
 const c=mediaCache({indexedDB:null});await c.purge();assert.ok(c.lastError);const f=await fixture();assert.equal(await f.cache().put('alice',f.m,f.a,[]),false);assert.equal(await f.cache().put('alice',f.m,f.a,[f.plain.buffer]),false);assert.equal(await f.cache().get('alice',f.m,f.a),null);
});
