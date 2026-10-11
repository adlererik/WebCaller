import test from 'node:test';import assert from 'node:assert/strict';
import {codecKey,probeVideoCodecs,preferVideoCodecs} from '../public/video-codecs.js';
const codecs=[{mimeType:'video/VP8',clockRate:90000},{mimeType:'video/H264',clockRate:90000,sdpFmtpLine:'profile-level-id=42e01f;packetization-mode=1'},{mimeType:'video/H264',clockRate:90000,sdpFmtpLine:'profile-level-id=640c1f;packetization-mode=1'},{mimeType:'video/AV1',clockRate:90000},{mimeType:'video/rtx',clockRate:90000,sdpFmtpLine:'apt=96'}];
test('efficient codec preference requires encode AND decode on both phones, preserves repair objects',()=>{
 const local=codecs.map(c=>({key:codecKey(c),encode:true,decode:true})),remote=local.map(c=>({...c}));
 remote[3].encode=false;local[2].encode=false;
 const selected=preferVideoCodecs(codecs,local,remote);
 assert.equal(selected[0],codecs[1]);assert.deepEqual(new Set(selected),new Set(codecs));assert.equal(selected.at(-1),codecs[4]);
 remote[3].encode=true;assert.equal(preferVideoCodecs(codecs,local,remote)[0],codecs[3]);
 assert.equal(preferVideoCodecs(codecs,local,remote,new Set([codecKey(codecs[3])]))[0],codecs[1]);
});
test('profile-specific WebRTC capability probes do not mistake AV1 decoding for efficient encoding',async()=>{
 const calls=[],caps={encodingInfo:async config=>{calls.push(config);return {supported:true,smooth:true,powerEfficient:!config.video.contentType.includes('AV1')};},decodingInfo:async()=>({supported:true,smooth:true,powerEfficient:true})};
 const results=await probeVideoCodecs(codecs,caps);
 assert.equal(results.length,4);assert.equal(results[3].encode,false);assert.equal(results[3].decode,true);
 assert.ok(calls.every(c=>c.type==='webrtc'));assert.ok(calls[1].video.contentType.includes('profile-level-id=42e01f'));assert.notEqual(results[1].key,results[2].key);
});
test('unsupported APIs, rejected and stalled probes fall back without blocking the call',async()=>{
 const unknown=await probeVideoCodecs(codecs,{},5);assert.equal(preferVideoCodecs(codecs,unknown)[0],codecs[1]);
 const broken=await probeVideoCodecs(codecs,{encodingInfo:()=>new Promise(()=>{}),decodingInfo:async()=>{throw new Error('Unsupported');}},5);
 assert.ok(broken.every(c=>!c.encode&&!c.decode));assert.equal(broken.length,4);
});
