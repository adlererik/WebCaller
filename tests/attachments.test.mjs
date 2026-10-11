import test from 'node:test';
import assert from 'node:assert/strict';
import {newAttachment,attachmentKey,encryptChunk,decryptChunk,validAttachment,CHUNK_SIZE} from '../public/attachments.js';
test('file encryption binds chunks to file identity, order and expiry',async()=>{
  const file=new File([new Uint8Array(2*CHUNK_SIZE+3).fill(71)],'private-name.txt',{type:'text/plain'}),a=newAttachment(file),key=await attachmentKey(a),expires=Date.now()+60000;
  const first=new Uint8Array(await file.slice(0,CHUNK_SIZE).arrayBuffer()),cipher=await encryptChunk(key,a,0,expires,first);
  assert.deepEqual(new Uint8Array(await decryptChunk(key,a,0,expires,cipher)),first);
  await assert.rejects(decryptChunk(key,{...a,id:crypto.randomUUID()},0,expires,cipher));
  await assert.rejects(decryptChunk(key,a,0,expires+1,cipher));
  await assert.rejects(decryptChunk(key,a,1,expires,cipher));
  const tampered=new Uint8Array(cipher);tampered[0]^=1;await assert.rejects(decryptChunk(key,a,0,expires,tampered));
  await assert.rejects(decryptChunk(key,a,0,Date.now()-1,cipher),/expired/);
  assert.equal(validAttachment({...a,chunks:999}),false);
});
