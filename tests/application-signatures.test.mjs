import test from 'node:test';
import assert from 'node:assert/strict';
import {createPublicKey,verify as nativeVerify} from 'node:crypto';
import {newIdentity,fingerprint} from '../public/crypto.js';
import {prepareApplicationSigner,signApplication,verifyApplicationSignature,applicationSignatureParts} from '../public/application-signatures.js';
import {verifyApplicationSignature as serverVerify} from '../server/application-signatures.mjs';
import {secureMessaging,identityStatement,prekeyStatement} from '../public/secure-messaging.js';
import {ratchetStatement} from '../public/envelope-auth.js';
import {callSasContext,callSas} from '../public/call-sas.js';
import {loadOlm} from '../public/vendor/vodozemac/load.js';
import {fixture} from './helpers/ratchet-fixture.mjs';
const enc=new TextEncoder();
async function legacyIdentity(){
 const dh=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},false,['deriveBits']),sign=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']);
 return {dh:dh.privateKey,sign:sign.privateKey,keys:{dh:await crypto.subtle.exportKey('jwk',dh.publicKey),sign:await crypto.subtle.exportKey('jwk',sign.publicKey)}};
}
const oldSign=async(identity,text)=>Buffer.from(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},identity.sign,enc.encode(text))).toString('base64url');
test('new application identities use nonextractable Ed25519 keys with native-verifiable signatures',async()=>{
 const a=await newIdentity();assert.equal(a.keys.sign.crv,'Ed25519');assert.equal(a.keys.sign.kty,'OKP');assert.equal(a.sign.extractable,false);assert.equal(a.dh.algorithm.namedCurve,'P-256');
 const signer=await prepareApplicationSigner(a,'alice'),signature=await signApplication(signer,'signed context'),parts=applicationSignatureParts(signature);
 assert.equal(parts.algorithm,'Ed25519');assert.equal(parts.key,undefined);assert.equal(parts.signature.length,64);
 assert.ok(nativeVerify(null,Buffer.from('signed context'),createPublicKey({key:a.keys.sign,format:'jwk'}),parts.signature));
 assert.ok(await verifyApplicationSignature(a.keys.sign,'alice','signed context',signature));assert.ok(serverVerify(a.keys.sign,'alice','signed context',signature));
 assert.equal(await verifyApplicationSignature(a.keys.sign,'alice','changed context',signature),false);
 await assert.rejects(crypto.subtle.exportKey('pkcs8',a.sign));
});
test('existing identity certifies Ed25519 without changing its fingerprint; forgery and cross-owner replay fail',async()=>{
 const a=await legacyIdentity(),b=await legacyIdentity(),before=await fingerprint(a.keys),signer=await prepareApplicationSigner(a,'alice'),signature=await signApplication(signer,'message');
 assert.equal(await fingerprint(a.keys),before);assert.equal(signer.key.extractable,false);assert.equal(applicationSignatureParts(signature).key.length,32);
 assert.ok(await verifyApplicationSignature(a.keys.sign,'alice','message',signature));assert.ok(serverVerify(a.keys.sign,'alice','message',signature));
 const attacker=await prepareApplicationSigner(b,'alice'),forged=await signApplication(attacker,'message');
 const parts=signature.split('.'),corrupt=parts.slice();corrupt[2]=(corrupt[2][0]==='A'?'B':'A')+corrupt[2].slice(1);
 for(const [root,owner,value]of [[a.keys.sign,'bob',signature],[b.keys.sign,'alice',signature],[a.keys.sign,'alice',forged],[a.keys.sign,'alice',corrupt.join('.')],[a.keys.sign,'alice','unknown-v1.'+parts.at(-1)],[a.keys.sign,'alice',signature+'.extra'],[a.keys.sign,'alice',parts[0]+'.'+parts.at(-1)]]){
  assert.equal(await verifyApplicationSignature(root,owner,'message',value),false);assert.equal(serverVerify(root,owner,'message',value),false);
 }
 await assert.rejects(prepareApplicationSigner(a,'alice',{...signer,publicKey:attacker.publicKey}),/does not match/);
 const original=await oldSign(a,'historical message');assert.ok(await verifyApplicationSignature(a.keys.sign,'alice','historical message',original));assert.ok(serverVerify(a.keys.sign,'alice','historical message',original));
 const ed=await newIdentity();assert.equal(await verifyApplicationSignature(ed.keys.sign,'alice','historical message',original),false);
});
test('old P-256 test accounts retain pins, sessions, history and delegated signer across tabs and reload',async t=>{
 const identityA=await legacyIdentity(),identityB=await legacyIdentity(),fpA=await fingerprint(identityA.keys),fpB=await fingerprint(identityB.keys),f=await fixture(t,{identityA,identityB});
 const old=await f.sendA('Before application-signature upgrade');old.signature=await oldSign(identityA,ratchetStatement(old));await f.apiA('/messages','POST',old);assert.equal((await f.openB(old)).text,'Before application-signature upgrade');
 // Seed the exact sender history digest of the prior build, without changing
 // identity or transport/session records.
 await f.a.store.lock(f.alice.user.id,async db=>{const value=await db.read('history/'+old.id);value.digest=Buffer.from(await crypto.subtle.digest('SHA-256',enc.encode(JSON.stringify(old)))).toString('base64url');await db.commit([await db.record('history/'+old.id,value,{kind:'history',peer:f.bob.user.id,expiresAt:old.expiresAt})]);});
 const first=await f.sendA('Ed25519 on existing account');assert.equal(applicationSignatureParts(first.signature).key.length,32);await f.apiA('/messages','POST',first);assert.equal((await f.openB(first)).text,'Ed25519 on existing account');
 const signer=await f.a.store.lock(f.alice.user.id,async db=>db.meta.applicationSigner);assert.equal(signer.key.extractable,false);
 const a=secureMessaging(f.optionsA),b=secureMessaging(f.optionsB);await Promise.all([a.initialize(f.alice),b.initialize(f.bob)]);
 const restored=await f.a.store.lock(f.alice.user.id,async db=>db.meta.applicationSigner);assert.equal(restored.publicKey,signer.publicKey);assert.equal(restored.certificate,signer.certificate);
 assert.equal((await b.open(f.bob.identity,f.bob.user.id,f.alice.user,old)).text,'Before application-signature upgrade');
 assert.equal((await a.open(f.alice.identity,f.alice.user.id,f.bob.user,old)).text,'Before application-signature upgrade');
 const next=await a.seal(f.alice.identity,f.alice.user.id,f.bob.user,{kind:'text',text:'Reloaded'},3600);assert.equal(next.ratchet.sessionId,first.ratchet.sessionId);assert.equal((await b.open(f.bob.identity,f.bob.user.id,f.alice.user,next)).text,'Reloaded');
 assert.equal(await fingerprint(f.alice.identity.keys),fpA);assert.equal(await fingerprint(f.bob.identity.keys),fpB);
 const meta=await f.a.store.lock(f.alice.user.id,async db=>{db.meta.applicationSigner={...db.meta.applicationSigner,certificate:'invalid'};await db.commit([db.meta]);return db.meta;});
 await assert.rejects(secureMessaging(f.optionsA).initialize(f.alice),/signature|signing key/i);
 assert.equal((await f.a.store.lock(f.alice.user.id,db=>db.meta)).identity,meta.identity);
});
test('new and existing accounts interoperate; signed lifetimes, bundles and certificate tampering fail closed',async t=>{
 const f=await fixture(t,{identityB:await legacyIdentity()}),bundle=await f.apiA('/ratchet/claim/'+f.bob.user.id,'POST',{});
 assert.ok(serverVerify(f.bob.user.keys.sign,f.bob.user.id,identityStatement(f.bob.user.id,bundle.identity),bundle.signature));
 assert.ok(serverVerify(f.bob.user.keys.sign,f.bob.user.id,prekeyStatement(f.bob.user.id,bundle.identity,bundle.prekey.id,bundle.prekey.key),bundle.prekey.signature));
 const e=await f.a.seal(f.alice.identity,f.alice.user.id,f.bob.user,{kind:'text',text:'Timed Ed25519'},30,{perView:true});await f.apiA('/messages','POST',e);assert.equal((await f.openB(e)).text,'Timed Ed25519');
 await assert.rejects(f.apiA('/messages','POST',{...e,lifetime:{...e.lifetime,seconds:60}}),error=>error.status===400);
 const reply=await f.sendB('Delegated reply');assert.equal((await f.openA(reply)).text,'Delegated reply');
 const wrong=reply.signature.split('.');wrong[1]=Buffer.alloc(32,5).toString('base64url');await assert.rejects(f.openA({...reply,signature:wrong.join('.')}),/Invalid signature/);
 await assert.rejects(f.apiB('/messages','POST',{...reply,signature:wrong.join('.')}),error=>error.status===400);
 const replacement=await newIdentity(),invalid=await signApplication({key:replacement.sign},ratchetStatement(e));await assert.rejects(f.apiA('/messages','POST',{...e,signature:invalid}),error=>error.status===400);
 assert.equal((await f.openB(await f.sendA('Still synchronized'))).text,'Still synchronized');
});
test('Ed25519 identities retain media-bound four-word SAS and media substitutions change its context',async()=>{
 const a={id:'alice',keys:(await newIdentity()).keys},b={id:'bob',keys:(await newIdentity()).keys};
 const cert=n=>'v=0\r\na=fingerprint:sha-256 '+Array(32).fill(n).join(':')+'\r\n';
 const context=await callSasContext({callId:'ed25519-call',caller:true,local:a,remote:b,localSdp:cert('AA'),remoteSdp:cert('BB')});
 assert.equal(context,await callSasContext({callId:'ed25519-call',caller:false,local:b,remote:a,localSdp:cert('BB'),remoteSdp:cert('AA')}));
 assert.notEqual(context,await callSasContext({callId:'ed25519-call',caller:true,local:a,remote:b,localSdp:cert('AA'),remoteSdp:cert('CC')}));
 const O=await loadOlm(),pending=[],states={};
 const caller=callSas({context,initiator:true,olm:async()=>O,send:async frame=>pending.push([false,frame]),update:state=>states.caller=state});
 const callee=callSas({context,initiator:false,olm:async()=>O,send:async frame=>pending.push([true,frame]),update:state=>states.callee=state});
 try{await callee.start();await caller.start();while(pending.length){const [toCaller,frame]=pending.shift();await(toCaller?caller:callee).receive(frame);}assert.equal(states.caller.state,'ready');assert.equal(states.caller.words,states.callee.words);assert.equal(states.caller.words.split(' ').length,4);}finally{caller.close();callee.close();}
});
