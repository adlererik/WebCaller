import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createStore} from '../server/store.mjs';
import {vault,fingerprint} from '../public/crypto.js';
import {secureStore} from '../public/secure-store.js';
import {fixture} from './helpers/ratchet-fixture.mjs';

async function legacyIdentity(){
 const dh=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},false,['deriveBits']);
 const sign=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']);
 return {dh:dh.privateKey,sign:sign.privateKey,keys:{dh:await crypto.subtle.exportKey('jwk',dh.publicKey),sign:await crypto.subtle.exportKey('jwk',sign.publicKey)}};
}
test('production profile retains the original device vault and isolates new ratchet/cache state',async t=>{
 const factory=new IDBFactory(),prior=globalThis.indexedDB;globalThis.indexedDB=factory;t.after(()=>{globalThis.indexedDB=prior;});
 const identity=await legacyIdentity(),id=crypto.randomUUID(),device={identity,user:{id,name:'Synthetic existing phone',keys:identity.keys},token:'synthetic-persisted-token',contacts:[],pins:{}};
 const db=await new Promise((resolve,reject)=>{const r=factory.open('ellie-device',1);r.onupgradeneeded=()=>r.result.createObjectStore('device');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 await new Promise((resolve,reject)=>{const tx=db.transaction('device','readwrite');tx.objectStore('device').put(device,'identity');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
 const loaded=await vault('get');assert.equal(loaded.token,device.token);assert.equal(await fingerprint(loaded.identity.keys),await fingerprint(identity.keys));assert.equal(loaded.identity.sign.extractable,false);
 const old=secureStore({indexedDB:factory,name:'ellie-secure'});await old.lock(id,async store=>store.commit([await store.record('account',{syntheticOldOlmState:true},{kind:'account'})]));
 const fresh=secureStore({indexedDB:factory});assert.equal(await fresh.lock(id,store=>store.read('account')),null);
 assert.equal((await old.lock(id,store=>store.read('account'))).syntheticOldOlmState,true);
 const cacheSource=await readFile(new URL('../public/media-cache.js',import.meta.url),'utf8');assert.match(cacheSource,/webcaller-signal-media-v1/);
});
test('existing P-256 phone identities exchange PQXDH traffic with certified Ed25519 without replacing alert rows',async t=>{
 const a=await legacyIdentity(),b=await legacyIdentity(),original=await fingerprint(a.keys);
 const f=await fixture(t,{identityA:a,identityB:b});
 f.app.store.run('INSERT INTO ntfy_devices VALUES(?,?,?,?,?)',f.alice.user.id,'wc_'+'x'.repeat(43),Date.now(),Date.now(),1);
 const saved=f.app.store.get('SELECT * FROM ntfy_devices WHERE owner=?',f.alice.user.id);
 const message=await f.sendA('After cutover');assert.equal(message.ratchet.protocol,'signal-pqxdh-v1');assert.match(message.signature,/^ed25519-v1\./);assert.equal((await f.openB(message)).text,'After cutover');
 assert.equal(await fingerprint(f.alice.identity.keys),original);assert.deepEqual(f.app.store.get('SELECT * FROM ntfy_devices WHERE owner=?',f.alice.user.id),saved);
});
test('offline database cutover purges only incompatible content/ratchets, preserves routing and is idempotent',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'webcaller-cutover-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const s=createStore(dir),a=crypto.randomUUID(),b=crypto.randomUUID(),id=crypto.randomUUID(),expires=Date.now()+3600000;
 for(const [u,n]of [[a,'A'],[b,'B']])s.run('INSERT INTO users VALUES(?,?,?,?)',u,n,'{}','synthetic-'+u);
 s.run('INSERT INTO contacts VALUES(?,?)',a,b);s.run('INSERT INTO ntfy_devices VALUES(?,?,?,?,?)',a,'wc_'+'x'.repeat(43),1,1,1);s.run('INSERT INTO push VALUES(?,?,?,?)',a,'https://example.invalid/synthetic','{}',1);
 s.run('INSERT INTO dial_codes VALUES(?,?,?)','73042',a,1);s.run('INSERT INTO messages VALUES(?,?,?,?,?,?)',id,a,b,expires,Date.now(),'{}');s.run('INSERT INTO ratchet_accounts VALUES(?,?,?)',a,'synthetic-old-olm','synthetic-signature');
 const before=Object.fromEntries(['users','contacts','push','ntfy_devices','dial_codes'].map(name=>[name,s.all('SELECT * FROM '+name)]));s.close();
 const run=()=>{const r=spawnSync('python3',['deploy/migrate-olm-to-signal.py','--database',join(dir,'calls.sqlite'),'--apply'],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);};
 assert.equal(run().alreadyApplied,false);assert.equal(run().alreadyApplied,true);
 const after=createStore(dir);t.after(()=>after.close());for(const [name,rows]of Object.entries(before))assert.deepEqual(after.all('SELECT * FROM '+name),rows);assert.equal(after.get('SELECT COUNT(*) n FROM messages').n,0);assert.equal(after.get('SELECT COUNT(*) n FROM ratchet_accounts').n,0);
});
