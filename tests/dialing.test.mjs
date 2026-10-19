import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {WebSocket} from 'ws';
import {IDBFactory} from 'fake-indexeddb';
import {createApp} from '../server/index.mjs';
import {createStore} from '../server/store.mjs';
import {newIdentity,fingerprint,vault} from '../public/crypto.js';
import {secureMessaging} from '../public/secure-messaging.js';
import {secureStore} from '../public/secure-store.js';
import {dialCode,dialEntry,dialLink,checkDialTarget} from '../public/dial-code.js';
import {dialIdentity} from '../public/dialing.js';
import {clearEntryFragment} from '../public/onboarding.js';

async function fixture(t,env={}){
 const origin='https://example.com',app=createApp({dataDir:':memory:',env:{PUBLIC_URL:origin+'/calls',BOOTSTRAP_TOKEN:'synthetic-dial-owner',VAPID_PUBLIC_KEY:'',VAPID_PRIVATE_KEY:'',NTFY_PUBLIC_URL:'',NTFY_PUBLISH_URL:'',NTFY_PUBLISH_TOKEN:'',CF_TURN_KEY_ID:'',CF_TURN_API_TOKEN:'',TURN_SECRET:'',TURN_URLS:'',...env}});
 app.server.listen(0,'127.0.0.1');await once(app.server,'listening');t.after(()=>app.close());const home='http://127.0.0.1:'+app.server.address().port+'/calls';
 async function request(path,method='GET',body,token,requestOrigin=origin){
  const r=await fetch(home+'/api'+path,{method,headers:{Origin:requestOrigin,...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json()};
 }
 const identity=await newIdentity(),owner={...(await request('/register','POST',{name:'Parent',keys:identity.keys,setupCode:'synthetic-dial-owner'})).body,identity};
 const api=(device)=>(p,m='GET',b)=>request(p,m,b,device.token).then(r=>{if(r.status>=400)throw Object.assign(new Error(r.body.error),{status:r.status});return r.body;});
 async function claim(code='2013',device=owner){return request('/dial/code','PUT',{code},device.token);}
 async function guest(code='2013',name='Child'){
  const identity=await newIdentity(),token=randomBytes(32).toString('base64url'),r=await request('/dial/connect','POST',{code,name,keys:identity.keys},token);assert.equal(r.status,201,JSON.stringify(r.body));return {...r.body,identity,token};
 }
 async function messenger(device,idb=new IDBFactory()){
  const options={api:api(device),store:secureStore({indexedDB:idb,name:'synthetic-dial-'+device.user.id})},value=secureMessaging(options);await value.initialize(device);return {value,options};
 }
 async function socket(device){
  const {ticket}=await api(device)('/ticket','POST',{}),ws=new WebSocket(home.replace('http:','ws:')+'/ws',{origin});await once(ws,'open');const ready=once(ws,'message');ws.send(JSON.stringify({type:'auth',ticket}));await ready;t.after(()=>ws.close());return ws;
 }
 return {app,owner,claim,guest,request,api,messenger,socket};
}

test('numeric addresses preserve leading zeroes, ignore spacing and reject ambiguous or oversized input',()=>{
 assert.equal(dialCode('2 0 1 3'),'2013');assert.equal(dialCode('00-13'),'0013');
 for(const value of [2013,'123','1234567890123','20x13','２０１３','+2013','2013/',' '.repeat(50)])assert.equal(dialCode(value),null);
 assert.equal(dialEntry('#dial=2013'),'2013');assert.equal(dialEntry('#invite=trusted&dial=2013'),null);assert.equal(dialEntry('#setup=owner&dial=2013'),null);
 assert.equal(dialLink('https://example.com/calls/','20 13'),'https://example.com/calls/#dial=2013');
 const paths=[],location={hash:'#dial=2013&receiver=untrusted&setup=private',pathname:'/calls/',search:''},history={replaceState:(_,__,url)=>paths.push(url)};
 clearEntryFragment(location,history,false,true);assert.deepEqual(paths,['/calls/#dial=2013']);clearEntryFragment(location,history);assert.equal(paths.at(-1),'/calls/');
});
test('guest identity is durably saved before enrollment and reused after failed requests or reload',async()=>{
 let saved,created=0,writes=0;const identity={syntheticPrivateKey:true},args={load:async()=>saved,save:async value=>{saved=structuredClone(value);writes++;},newIdentity:async()=>{created++;return identity;},random:array=>array.fill(7)};
 const first=await dialIdentity(args);assert.equal(first.token.length,43);assert.equal(first.dialEnrollment,true);assert.equal(writes,1);
 const again=await dialIdentity(args);assert.deepEqual(again,first);assert.equal(created,1);assert.equal(writes,1);
 saved={...saved,user:{id:'existing-device'},contacts:[{id:'parent'}]};assert.deepEqual(await dialIdentity(args),saved);assert.equal(created,1);
 await assert.rejects(dialIdentity({...args,load:async()=>({user:{id:'damaged'}})}),/usual phone/);
 await assert.rejects(dialIdentity({...args,load:async()=>null,save:async()=>{throw Error('Storage unavailable');}}),/Storage unavailable/);
});
test('returning browsers reject a changed code target locally even if a server ignores the expected identity',()=>{
 const id=randomUUID(),other=randomUUID(),keys={synthetic:true};assert.doesNotThrow(()=>checkDialTarget(id,{id,keys}));
 assert.throws(()=>checkDialTarget(id,{id:other,keys}),/code has changed/);assert.throws(()=>checkDialTarget(null,{id:'bad',keys}),/could not be verified/);
});
test('simultaneous first-time tabs atomically adopt one saved device instead of replacing identities',async t=>{
 const prior=Object.getOwnPropertyDescriptor(globalThis,'indexedDB');Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:new IDBFactory()});
 t.after(()=>prior?Object.defineProperty(globalThis,'indexedDB',prior):delete globalThis.indexedDB);
 const args={load:()=>vault('get'),save:value=>vault('create',value),newIdentity};
 const [a,b]=await Promise.all([dialIdentity(args),dialIdentity(args)]);assert.equal(a.token,b.token);assert.equal(await fingerprint(a.identity.keys),await fingerprint(b.identity.keys));
 const existing={...a,user:{id:randomUUID()},contacts:[{id:randomUUID()}],pins:{saved:true}};await vault('put',existing);
 assert.deepEqual((await dialIdentity(args)).pins,{saved:true});assert.deepEqual((await vault('create',{synthetic:'must not replace'})).user,existing.user);
});
test('existing identities start unlisted; a code is optional, authenticated, unique and can be disabled',async t=>{
 const f=await fixture(t);assert.equal((await f.api(f.owner)('/dial/settings')).code,null);
 assert.equal((await f.request('/dial/code','PUT',{code:'2013'})).status,401);
 assert.equal((await f.request('/dial/code','PUT',{code:'2013'},f.owner.token,'https://untrusted.example')).status,403);
 assert.equal((await f.claim()).status,200);const child=await f.guest();assert.equal((await f.claim('2013',child)).status,409);
 const random=await f.request('/dial/code','PUT',{random:true},child.token);assert.equal(random.status,200);assert.match(random.body.code,/^[0-9]{6}$/);
 const oldUser=f.app.store.get('SELECT * FROM users WHERE id=?',f.owner.user.id);
 assert.equal((await f.request('/dial/code','DELETE',undefined,f.owner.token)).status,200);assert.equal((await f.api(f.owner)('/dial/settings')).code,null);
 assert.equal((await f.request('/dial/connect','POST',{code:'2013'},child.token)).status,404);
 assert.deepEqual(f.app.store.get('SELECT * FROM users WHERE id=?',f.owner.user.id),oldUser);assert.equal((await f.claim()).status,200);
});
test('retired codes remain reserved to their identity; a changed mapping is rejected before any enrollment',async t=>{
 const f=await fixture(t);await f.claim();const child=await f.guest();await f.claim('2014');assert.equal((await f.claim('2013',child)).status,409);
 const before=f.app.store.get('SELECT COUNT(*) n FROM users').n;
 const r=await f.request('/dial/connect','POST',{code:'2014',expectedPeer:randomUUID(),name:'Child',keys:(await newIdentity()).keys},randomBytes(32).toString('base64url'));
 assert.equal(r.status,409);assert.equal(f.app.store.get('SELECT COUNT(*) n FROM users').n,before);
});
test('first-time dialing enrolls once; repeated dialing returns the same device and one pending connection',async t=>{
 const f=await fixture(t);await f.claim();const child=await f.guest();
 assert.equal(f.app.store.get('SELECT COUNT(*) n FROM users').n,2);assert.equal(f.app.store.get('SELECT COUNT(*) n FROM contact_requests').n,1);
 assert.equal((await f.api(f.owner)('/me')).contacts[0].request,'incoming');assert.equal((await f.api(child)('/me')).contacts[0].request,'outgoing');
 const repeated=await f.request('/dial/connect','POST',{code:'20 13',keys:child.identity.keys,name:'Ignored rename',expectedPeer:f.owner.user.id},child.token);
 assert.equal(repeated.status,200);assert.equal(repeated.body.user.id,child.user.id);assert.equal(repeated.body.user.name,'Child');assert.equal(f.app.store.get('SELECT COUNT(*) n FROM users').n,2);
 assert.equal((await f.request('/dial/connect','POST',{code:'2013',keys:(await newIdentity()).keys},child.token)).status,403);
 assert.equal((await f.request('/dial/connect','POST',{code:'2013'},f.owner.token)).status,400);
});
test('unknown codes cannot create accounts; no unauthenticated directory or recovery exists',async t=>{
 const f=await fixture(t);const key=(await newIdentity()).keys,token=randomBytes(32).toString('base64url');
 assert.equal((await f.request('/dial/connect','POST',{code:'2013',keys:key},token)).status,404);assert.equal(f.app.store.get('SELECT COUNT(*) n FROM users').n,1);
 await f.claim();assert.equal((await f.request('/dial/connect','POST',{code:'2013',keys:key})).status,401);
 assert.equal((await f.request('/dial/connect','POST',{code:'2013',keys:f.owner.identity.keys},token)).status,409);
 assert.equal((await f.request('/dial/settings')).status,401);assert.equal((await f.request('/dial/connect')).status,401);
 assert.equal(f.app.store.get('SELECT COUNT(*) n FROM users').n,1);
});
test('an operator can disable code enrollment while existing authenticated phones keep working',async t=>{
 const f=await fixture(t,{DIAL_CODES_ENABLED:'false'});assert.equal((await f.request('/config')).body.dialCodes,false);assert.equal((await f.claim()).status,404);
 assert.equal((await f.request('/dial/connect','POST',{code:'2013'},f.owner.token)).status,404);assert.equal((await f.api(f.owner)('/me')).user.id,f.owner.user.id);
});
test('encrypted text requests use Olm V2, are limited to five, accept only by the recipient and retain history across repeat dialing',async t=>{
 const f=await fixture(t);await f.claim();const child=await f.guest(),a=await f.messenger(f.owner),b=await f.messenger(child),texts=[];
 for(let i=0;i<5;i++){
  const envelope=await b.value.seal(child.identity,child.user.id,f.owner.user,{kind:'text',text:'Hello '+i},3600);assert.equal(envelope.v,2);
  assert.equal((await f.request('/messages','POST',envelope,child.token)).status,201);texts.push(envelope);
  assert.equal((await a.value.open(f.owner.identity,f.owner.user.id,child.user,envelope)).text,'Hello '+i);
 }
 assert.equal((await f.request('/messages','POST',texts[0],child.token)).status,200);
 const sixth=await b.value.seal(child.identity,child.user.id,f.owner.user,{kind:'text',text:'Wait for acceptance'},3600);assert.equal((await f.request('/messages','POST',sixth,child.token)).status,429);
 assert.equal((await f.request('/contacts/'+f.owner.user.id+'/accept','POST',{},child.token)).status,404);
 assert.equal((await f.request('/contacts/'+child.user.id+'/accept','POST',{},f.owner.token)).status,200);
 assert.equal((await f.api(child)('/me')).contacts[0].request,undefined);assert.equal((await f.request('/messages','POST',sixth,child.token)).status,201);
 const before=await fingerprint(child.identity.keys);await f.api(child)('/dial/connect','POST',{code:'2013',expectedPeer:f.owner.user.id});
 const reopened=secureMessaging(b.options);await reopened.initialize(child);assert.equal((await reopened.open(child.identity,child.user.id,f.owner.user,texts[0])).text,'Hello 0');assert.equal(await fingerprint(child.identity.keys),before);
 const reply=await a.value.seal(f.owner.identity,f.owner.user.id,child.user,{kind:'text',text:'Hi again'},3600);assert.equal((await f.request('/messages','POST',reply,f.owner.token)).status,201);assert.equal((await reopened.open(child.identity,child.user.id,f.owner.user,reply)).text,'Hi again');
 assert.equal((await f.api(child)('/messages')).length,7);assert.equal(f.app.store.get('SELECT COUNT(*) n FROM users').n,2);
});
test('pending callers cannot upload attachments; blocking revokes messages, prekeys, calls and repeat code connection',async t=>{
 const f=await fixture(t);await f.claim();const child=await f.guest(),a=await f.messenger(f.owner),b=await f.messenger(child);
 const fake=await b.value.seal(child.identity,child.user.id,f.owner.user,{kind:'attachment',attachment:{id:randomUUID()}},3600);
 assert.equal((await f.request('/messages','POST',fake,child.token)).status,403);
 const body={id:randomUUID(),size:1,envelope:fake};assert.notEqual((await f.request('/attachments','POST',body,child.token)).status,201);
 const text=await b.value.seal(child.identity,child.user.id,f.owner.user,{kind:'text',text:'Before block'},3600);assert.equal((await f.request('/messages','POST',text,child.token)).status,201);
 assert.equal((await f.request('/contacts/'+child.user.id+'?block=1','DELETE',undefined,f.owner.token)).status,200);
 assert.equal((await f.api(f.owner)('/me')).contacts.length,0);assert.equal((await f.api(child)('/messages')).length,0);
 assert.equal((await f.request('/dial/connect','POST',{code:'2013'},child.token)).status,404);
 assert.equal((await f.request('/ratchet/claim/'+f.owner.user.id,'POST',{},child.token)).status,403);
 assert.equal((await f.request('/messages','POST',text,child.token)).status,410);
 assert.equal((await f.api(f.owner)('/dial/settings')).blocked[0].id,child.user.id);
 assert.equal((await f.request('/blocks/'+child.user.id,'DELETE',undefined,child.token)).status,200);assert.equal((await f.request('/dial/connect','POST',{code:'2013'},child.token)).status,404);
 await f.api(f.owner)('/blocks/'+child.user.id,'DELETE');assert.equal((await f.request('/dial/connect','POST',{code:'2013'},child.token)).status,200);
 assert.equal((await f.api(child)('/messages')).length,0);assert.ok(a.value);
});
test('a first encrypted call rings without an invite; answering confirms the existing pair and keeps authenticated media signaling',{timeout:15000},async t=>{
 const f=await fixture(t);await f.claim();const child=await f.guest(),a=await f.messenger(f.owner),b=await f.messenger(child);
 const receiver=await f.socket(f.owner),sender=await f.socket(child),events=[];
 receiver.on('message',raw=>events.push(JSON.parse(raw)));const callId=randomUUID(),offer=await b.value.seal(child.identity,child.user.id,f.owner.user,{kind:'offer',callId,description:{type:'offer',sdp:'synthetic'}},90);
 const arrived=once(receiver,'message');sender.send(JSON.stringify({type:'signal',kind:'offer',callId,envelope:offer}));assert.equal(JSON.parse((await arrived)[0]).kind,'offer');assert.equal((await a.value.open(f.owner.identity,f.owner.user.id,child.user,offer)).callId,callId);
 const answer=await a.value.seal(f.owner.identity,f.owner.user.id,child.user,{kind:'answer',callId,description:{type:'answer',sdp:'synthetic'}},120);
 const delivered=new Promise(resolve=>sender.on('message',raw=>{const packet=JSON.parse(raw);if(packet.kind==='answer')resolve(packet);}));receiver.send(JSON.stringify({type:'signal',kind:'answer',callId,envelope:answer}));await delivered;
 assert.equal((await f.api(child)('/me')).contacts[0].request,undefined);assert.equal(f.app.store.get('SELECT COUNT(*) n FROM contact_requests').n,0);assert.equal(f.app.store.get('SELECT COUNT(*) n FROM contacts').n,2);
 const ice=await b.value.seal(child.identity,child.user.id,f.owner.user,{kind:'ice',callId,candidate:{candidate:'synthetic'}},120),received=new Promise(resolve=>receiver.on('message',raw=>{const packet=JSON.parse(raw);if(packet.kind==='ice')resolve(packet);}));sender.send(JSON.stringify({type:'signal',kind:'ice',callId,envelope:ice}));assert.equal((await received).callId,callId);
});
test('additive code tables survive reopen without replacing existing identities, connections or ratchet state',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'webcaller-dial-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));let s=createStore(dir);
 const keys=JSON.stringify((await newIdentity()).keys),id=randomUUID();s.run('INSERT INTO users VALUES(?,?,?,?)',id,'Existing phone',keys,'synthetic-token-hash');s.run('INSERT INTO ratchet_accounts VALUES(?,?,?)',id,'unchanged-curve-key','unchanged-signature');
 s.run('INSERT INTO dial_codes VALUES(?,?,1)','0013',id);s.close();s=createStore(dir);t.after(()=>s.close());
 assert.equal(s.get('SELECT keys FROM users WHERE id=?',id).keys,keys);assert.equal(s.get('SELECT identity FROM ratchet_accounts WHERE owner=?',id).identity,'unchanged-curve-key');assert.equal(s.get('SELECT code FROM dial_codes WHERE owner=?',id).code,'0013');
});
