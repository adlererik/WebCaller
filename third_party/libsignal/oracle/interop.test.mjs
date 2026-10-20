import test from 'node:test';import assert from 'node:assert/strict';
import * as S from '@signalapp/libsignal-client';
import {loadSignalBinding} from '../../../public/vendor/signal/load.js';
const binding=await loadSignalBinding(),to=b=>Buffer.from(b).toString('base64').replaceAll('=',''),from=s=>Buffer.from(s,'base64');
function run(v){const r=JSON.parse(binding.dispatch(JSON.stringify({now:Date.now(),...v})));if(!r.ok)throw Error(r.error);return r.result;}
const create=()=>run({action:'create',count:8});
const bundle=p=>({...p,prekey:p.keys[0]});
class Sessions extends S.SessionStore{map=new Map();async saveSession(a,r){this.map.set(a.toString(),r.serialize());}async getSession(a){const r=this.map.get(a.toString());return r?S.SessionRecord.deserialize(r):null;}async getExistingSessions(a){return Promise.all(a.map(x=>this.getSession(x)));}}
class Identities extends S.IdentityKeyStore{known=new Map();constructor(){super();this.key=S.PrivateKey.generate();}async getIdentityKey(){return this.key;}async getLocalRegistrationId(){return 123;}async saveIdentity(a,k){const p=this.known.get(a.toString());if(p&&!p.equals(k))throw Error('Identity changed');this.known.set(a.toString(),k);return S.IdentityChange.NewOrUnchanged;}async getIdentity(a){return this.known.get(a.toString())||null;}async isTrustedIdentity(a,k){const p=await this.getIdentity(a);return !p||p.equals(k);}}
class Prekeys extends S.PreKeyStore{map=new Map();async savePreKey(i,r){this.map.set(i,r.serialize());}async getPreKey(i){if(!this.map.has(i))throw Error('Missing prekey');return S.PreKeyRecord.deserialize(this.map.get(i));}async removePreKey(i){this.map.delete(i);}}
class Signed extends S.SignedPreKeyStore{map=new Map();async saveSignedPreKey(i,r){this.map.set(i,r.serialize());}async getSignedPreKey(i){return S.SignedPreKeyRecord.deserialize(this.map.get(i));}}
class Kyber extends S.KyberPreKeyStore{map=new Map();async saveKyberPreKey(i,r){this.map.set(i,r.serialize());}async getKyberPreKey(i){if(!this.map.has(i))throw Error('Missing PQ prekey');return S.KyberPreKeyRecord.deserialize(this.map.get(i));}async markKyberPreKeyUsed(i){assert.ok(this.map.delete(i));}}
async function native(){const identity=new Identities(),sessions=new Sessions(),prekeys=new Prekeys(),signed=new Signed(),kyber=new Kyber();const sk=S.PrivateKey.generate(),pk=S.PrivateKey.generate(),pq=S.KEMKeyPair.generate();const sig=identity.key.sign(sk.getPublicKey().serialize()),pqsig=identity.key.sign(pq.getPublicKey().serialize());
 await signed.saveSignedPreKey(1,S.SignedPreKeyRecord.new(1,Date.now(),sk.getPublicKey(),sk,sig));await prekeys.savePreKey(1,S.PreKeyRecord.new(1,pk.getPublicKey(),pk));await kyber.saveKyberPreKey(1,S.KyberPreKeyRecord.new(1,Date.now(),pq,pqsig));
 const pub=to(identity.key.getPublicKey().serialize());return {identity,sessions,prekeys,signed,kyber,pub,address:S.ProtocolAddress.new(pub,1),bundle:{identity:pub,registration:123,signed:{id:1,key:to(sk.getPublicKey().serialize()),signature:to(sig)},prekey:{id:1,key:to(pk.getPublicKey().serialize()),kyber:to(pq.getPublicKey().serialize()),kyberSignature:to(pqsig)}}};}
function nativeBundle(p){const k=p.prekey,s=p.signed;return S.PreKeyBundle.new(p.registration,1,k.id,S.PublicKey.deserialize(from(k.key)),s.id,S.PublicKey.deserialize(from(s.key)),from(s.signature),S.PublicKey.deserialize(from(p.identity)),k.id,S.KEMPublicKey.deserialize(from(k.kyber)),from(k.kyberSignature));}
function wsend(w,remote,session,text,b){return run({action:'encrypt',account:w.account,local:w.public.identity,remote,expectedIdentity:remote,session:session||null,bundle:b||null,plaintext:to(Buffer.from(text))});}
function wrecv(w,remote,session,m){return run({action:'decrypt',account:w.account,local:w.public.identity,remote,expectedIdentity:remote,session:session||null,type:m.type,data:m.data});}
async function nrecv(n,remote,m){const address=S.ProtocolAddress.new(remote,1);return m.type===3?S.signalDecryptPreKey(S.PreKeySignalMessage.deserialize(from(m.data)),address,n.address,n.sessions,n.identity,n.prekeys,n.signed,n.kyber):S.signalDecrypt(S.SignalMessage.deserialize(from(m.data)),address,n.address,n.sessions,n.identity);}
async function nsend(n,remote,text){const m=await S.signalEncrypt(Buffer.from(text),S.ProtocolAddress.new(remote,1),n.address,n.sessions,n.identity);return {type:m.type(),data:to(m.serialize())};}
for(const wasmFirst of [true,false])test(`official native and WASM interoperate; ${wasmFirst?'WASM':'native'} initiates PQXDH`,async()=>{
 const w=create(),n=await native();let session;let nonemptyPq=0;
 if(wasmFirst){const e=wsend(w,n.pub,null,'WASM hello',n.bundle);w.account=e.account;session=e.session;assert.equal(Buffer.from(await nrecv(n,w.public.identity,e.payload)).toString(),'WASM hello');}
 else{await S.processPreKeyBundle(nativeBundle(bundle(w.public)),S.ProtocolAddress.new(w.public.identity,1),n.address,n.sessions,n.identity);const e=await nsend(n,w.public.identity,'Native hello'),d=wrecv(w,n.pub,null,e);w.account=d.account;session=d.session;assert.equal(from(d.payload.plaintext).toString(),'Native hello');assert.equal(Object.keys(w.account.kyber).length,7);}
 for(let i=0;i<50;i++){
  const a=await nsend(n,w.public.identity,'Native '+i);if(a.type===2&&S.SignalMessage.deserialize(from(a.data)).pqRatchet().length)nonemptyPq++;
  const d=wrecv(w,n.pub,session,a);w.account=d.account;session=d.session;assert.equal(from(d.payload.plaintext).toString(),'Native '+i);
  const e=wsend(w,n.pub,session,'WASM '+i);w.account=e.account;session=e.session;assert.equal(Buffer.from(await nrecv(n,w.public.identity,e.payload)).toString(),'WASM '+i);
 }
 assert.ok(nonemptyPq>0,'Current official SPQR data exchanged');
 // Both platforms accept and continue from each other's exact session records.
 S.SessionRecord.deserialize(from(session));const nativeRecord=await n.sessions.getSession(S.ProtocolAddress.new(w.public.identity,1));assert.ok(nativeRecord);
 const packets=[];for(let i=0;i<4;i++)packets.push(await nsend(n,w.public.identity,'Ordered '+i));
 for(const i of [3,0,2,1]){const d=wrecv(w,n.pub,session,packets[i]);w.account=d.account;session=d.session;assert.equal(from(d.payload.plaintext).toString(),'Ordered '+i);}
 assert.throws(()=>wrecv(w,n.pub,session,packets[0]));
 const valid=await nsend(n,w.public.identity,'Valid after tamper'),bad=structuredClone(valid),bytes=from(bad.data);bytes[bytes.length-1]^=1;bad.data=to(bytes);
 assert.throws(()=>wrecv(w,n.pub,session,bad));const good=wrecv(w,n.pub,session,valid);assert.equal(from(good.payload.plaintext).toString(),'Valid after tamper');
});
test('incorrect signed bundle and substituted identity fail before a session is accepted',async()=>{
 const a=create(),b=create(),bad=bundle(b.public);bad.signed.signature=to(Buffer.alloc(64));assert.throws(()=>wsend(a,b.public.identity,null,'reject',bad));
 const n=await native();assert.throws(()=>wsend(a,n.pub,null,'reject',bundle(b.public)));
});
