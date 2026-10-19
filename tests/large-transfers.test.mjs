import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './helpers/ratchet-fixture.mjs';
import {MAX_FILE_SIZE,CHUNK_SIZE,newAttachment,validAttachment,attachmentKey,encryptChunk,decryptChunk} from '../public/attachments.js';
import {transferLimits} from '../server/transfer-limits.mjs';
test('200 MiB manifests and the last encrypted chunk are accepted; oversized files and chunk indices are rejected',async t=>{
 const f=await fixture(t),a=newAttachment({size:MAX_FILE_SIZE,name:'Synthetic boundary.bin',type:'application/octet-stream'});
 assert.equal(MAX_FILE_SIZE,200*1024*1024);assert.equal(a.chunks,3200);assert.ok(validAttachment(a));assert.throws(()=>newAttachment({size:MAX_FILE_SIZE+1}),/200 MB/);assert.equal(validAttachment({...a,size:MAX_FILE_SIZE+1}),false);
 const envelope=await f.a.seal(f.alice.identity,f.alice.user.id,f.bob.user,{kind:'attachment',attachment:a},3600,{perView:true});
 await f.apiA('/attachments','POST',{id:a.id,size:a.size,envelope});
 const base='http://127.0.0.1:'+f.app.server.address().port+'/calls/api/attachments/'+a.id+'/chunks/',headers={Origin:'https://example.com',Authorization:'Bearer '+f.alice.token};
 const key=await attachmentKey(a),plain=new Uint8Array(CHUNK_SIZE).fill(173),cipher=await encryptChunk(key,a,3199,envelope.expiresAt,plain);
 assert.equal((await fetch(base+'3199',{method:'PUT',headers,body:cipher})).status,201);
 assert.equal((await fetch(base+'3199',{method:'PUT',headers,body:cipher})).status,200);
 assert.equal((await fetch(base+'3200',{method:'PUT',headers,body:cipher})).status,404);
 assert.equal((await fetch(base+'3199/parts/17',{method:'PUT',headers,body:cipher.slice(0,4096)})).status,404);
 await assert.rejects(f.apiA('/messages','POST',envelope),e=>e.status===409);
 assert.deepEqual(new Uint8Array(await decryptChunk(key,a,3199,envelope.expiresAt,cipher)),plain);
 await assert.rejects(decryptChunk(key,a,3198,envelope.expiresAt,cipher));
 await f.apiA('/attachments/'+a.id,'DELETE');assert.equal(f.app.store.get('SELECT COUNT(*) n FROM attachment_chunks').n,0);
});
test('transfer limits bound active bodies, refill gradually and do not punish a healthy 4 MiB pipeline',()=>{
 let time=0;const acquire=transferLimits({now:()=>time});const done=Array.from({length:8},()=>acquire('alice'));
 assert.throws(()=>acquire('alice'),e=>e.status===429);done.forEach(release=>{release();release();});
 for(let i=8;i<64;i++)acquire('alice')();assert.throws(()=>acquire('alice'),e=>e.status===429);
 time+=1000;for(let i=0;i<64;i++)acquire('alice')();
 for(let i=0;i<64;i++){time+=10;acquire('alice')();}
 assert.doesNotThrow(()=>acquire('bob')());
});
