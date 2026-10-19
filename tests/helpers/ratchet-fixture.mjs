import {IDBFactory} from 'fake-indexeddb';
import {createApp} from '../../server/index.mjs';
import {newIdentity} from '../../public/crypto.js';
import {secureStore} from '../../public/secure-store.js';
import {secureMessaging} from '../../public/secure-messaging.js';
import {WebSocket} from 'ws';
import {once} from 'node:events';
export async function fixture(t,{before,clock=Date.now,olmA,olmB}={}){
  const app=createApp({dataDir:':memory:',env:{PUBLIC_URL:'https://example.com/calls',BOOTSTRAP_TOKEN:'synthetic-owner-code'}});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(()=>app.close());const url='http://127.0.0.1:'+app.server.address().port+'/calls/api';
  async function request(path,method='GET',body,token){
    const response=await fetch(url+path,{method,headers:{Origin:'https://example.com',...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const value=await response.json();
    if(!response.ok)throw Object.assign(new Error(value.error),{status:response.status});return value;
  }
  const aliceIdentity=await newIdentity(),alice=await request('/register','POST',{name:'Synthetic Alice',keys:aliceIdentity.keys,setupCode:'synthetic-owner-code'});
  const invitation=await request('/invite','POST',{},alice.token),[invite,fingerprint]=new URL(invitation.url).hash.slice(8).split('.');
  const bobIdentity=await newIdentity(),bob=await request('/join','POST',{name:'Synthetic Bob',keys:bobIdentity.keys,invite,fingerprint});
  alice.identity=aliceIdentity;bob.identity=bobIdentity;alice.pins={[bob.user.id]:bob.user};bob.pins={[alice.user.id]:alice.user};
  const apiA=(p,m,b)=>request(p,m,b,alice.token),apiB=(p,m,b)=>request(p,m,b,bob.token),idbA=new IDBFactory(),idbB=new IDBFactory();
  const optionsA={api:apiA,store:secureStore({indexedDB:idbA,name:'synthetic-a',now:clock}),now:clock,olm:olmA},optionsB={api:apiB,store:secureStore({indexedDB:idbB,name:'synthetic-b',now:clock}),now:clock,olm:olmB};
  if(before)await before({alice,bob,apiA,apiB});
  const a=secureMessaging(optionsA),b=secureMessaging(optionsB);await a.initialize(alice);await b.initialize(bob);
  const sendA=(text,ttl=3600)=>a.seal(alice.identity,alice.user.id,bob.user,{kind:'text',text},ttl);
  const sendB=text=>b.seal(bob.identity,bob.user.id,alice.user,{kind:'text',text},3600);
  const openA=e=>a.open(alice.identity,alice.user.id,bob.user,e),openB=e=>b.open(bob.identity,bob.user.id,alice.user,e);
  async function socket(d,api){const {ticket}=await api('/ticket','POST',{}),ws=new WebSocket(url.replace('/api','/ws').replace('http:','ws:'),{origin:'https://example.com'});await once(ws,'open');const ready=once(ws,'message');ws.send(JSON.stringify({type:'auth',ticket}));await ready;return ws;}
  return {app,alice,bob,a,b,apiA,apiB,sendA,sendB,openA,openB,optionsA,optionsB,socket};
}
