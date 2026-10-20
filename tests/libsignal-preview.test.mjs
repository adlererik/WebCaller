import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './helpers/ratchet-fixture.mjs';
import {b64,unb64} from '../public/crypto.js';
import {loadSignal} from '../public/signal-core.js';
import {secureMessaging} from '../public/secure-messaging.js';
import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
test('preview actually sends Signal v4 PQXDH envelopes and rejects Olm protocol substitution',async t=>{
 const f=await fixture(t),e=await f.sendA('Signal transport');assert.equal(e.ratchet.protocol,'signal-pqxdh-v1');assert.equal(e.ratchet.type,3);assert.equal(unb64(e.ratchet.data)[0]>>4,4);assert.equal(unb64(e.ratchet.identity).length,33);
 assert.equal((await f.openB(e)).text,'Signal transport');
 const substituted={...e,id:crypto.randomUUID(),ratchet:{...e.ratchet,protocol:'olm-v2'}};
 await assert.rejects(f.openB(substituted));await assert.rejects(f.apiA('/messages','POST',substituted),e=>e.status===400);
 assert.equal((await f.openA(await f.sendB('After rejection'))).text,'After rejection');
});
test('unauthenticated envelope never consumes a PQ one-time key or commits state',async t=>{
 const f=await fixture(t),e=await f.sendA('Authenticated retry'),before=await f.b.store.lock(f.bob.user.id,db=>db.read('account'));
 await assert.rejects(f.openB({...e,signature:b64(new Uint8Array(64))}));
 const after=await f.b.store.lock(f.bob.user.id,db=>db.read('account'));assert.deepEqual(before,after);
 assert.equal((await f.openB(e)).text,'Authenticated retry');
 const consumed=await f.b.store.lock(f.bob.user.id,db=>db.read('account'));
 assert.equal(Object.keys(consumed.signal.prekeys).length,Object.keys(before.signal.prekeys).length-1);
 assert.equal(Object.keys(consumed.signal.kyber).length,Object.keys(before.signal.kyber).length-1);
});
test('preexisting Olm-only account state fails closed instead of replacing its identity',async t=>{
 const f=await fixture(t);const old={pickle:'synthetic-legacy-pickle',key:'synthetic-legacy-key',keys:{},pending:{}};
 await f.a.store.lock(f.alice.user.id,async db=>db.commit([await db.record('account',old,{kind:'account'})]));
 const a=secureMessaging(f.optionsA);await assert.rejects(a.initialize(f.alice),/Missing test Signal state/);
 assert.deepEqual(await f.a.store.lock(f.alice.user.id,db=>db.read('account')),old);
});
test('larger PQ account records use bounded base64 encoding without a spread-stack limit',()=>{const bytes=new Uint8Array(500000).fill(193);assert.deepEqual(unb64(b64(bytes)),bytes);});
test('served Signal WASM matches its pin, omits private source paths and uses unmodified released upstream',async()=>{
 const root=new URL('../public/vendor/signal/',import.meta.url),meta=JSON.parse(await readFile(new URL('provenance.json',root),'utf8')),bytes=await readFile(new URL('pkg/signal_bg.wasm',root));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),meta.wasmSha256);assert.equal(meta.commit,'1738ead8a12ffe539f6309958123dadb16dc3b95');assert.equal(meta.officialProtocolSourceModified,false);assert.ok(!/\/(?:home|Users)\/[^/]+\/Documents\//.test(bytes.toString('latin1')));assert.ok(meta.experimental);
 const engine=await loadSignal(),account=new engine.Account();assert.equal(unb64(account.curve25519_key).length,33);account.free();
});
