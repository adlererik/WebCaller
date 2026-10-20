import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {WebSocket} from 'ws';
import {appPaths,retiredAppPaths,matchAppPath,manifestIdentity} from '../server/app-paths.mjs';
import {createApp} from '../server/index.mjs';
import {newIdentity} from '../public/crypto.js';

test('aliases have strict path boundaries and cannot become origins or arbitrary URLs',()=>{
  const paths=appPaths(new URL('https://example.com/com'),'/calls,/com,/old/phone/');
  assert.equal(matchAppPath('/com/api/me',paths),'/com');assert.equal(matchAppPath('/calls/ws',paths),'/calls');
  for(const path of ['/company','/calls-archive','/','/calls%2fapi/me'])assert.equal(matchAppPath(path,paths),undefined);
  for(const path of ['https://bad.example/com','//bad','/com?token=x','/a/../b','/'])assert.throws(()=>appPaths(new URL('https://example.com/com'),path));
  assert.equal(manifestIdentity('/calls/','/com'),'/calls/');assert.throws(()=>manifestIdentity('https://bad.example/','/com'));
});
test('a replacement can retire every previous route without revealing it and retain the account',async t=>{
  const origin='https://example.com',base='/0123456789abcdef';
  assert.deepEqual(retiredAppPaths(new URL(origin+base),'/calls,/com'),['/calls','/com']);
  assert.throws(()=>retiredAppPaths(new URL(origin+'/phone'),'/phone/old'));
  const app=createApp({dataDir:':memory:',env:{PUBLIC_URL:origin+base,APP_PATH_ALIASES:'',APP_RETIRED_PATHS:'/calls,/com',APP_MANIFEST_ID:'/calls/',BOOTSTRAP_TOKEN:'synthetic',VAPID_PUBLIC_KEY:'',VAPID_PRIVATE_KEY:'',NTFY_PUBLIC_URL:'',NTFY_PUBLISH_URL:'',NTFY_PUBLISH_TOKEN:''}});
  t.after(()=>app.close());app.server.listen(0,'127.0.0.1');await once(app.server,'listening');const url='http://127.0.0.1:'+app.server.address().port;
  const keys=await newIdentity(),r=await fetch(url+base+'/api/register',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({name:'Alice',keys:keys.keys,setupCode:'synthetic'})});assert.equal(r.status,201);const alice=await r.json();
  for(const old of ['/com','/com/','/com/sw.js','/com/api/config','/calls/','/calls/health','/calls/manifest.webmanifest']){
    const r=await fetch(url+old,{redirect:'manual'});assert.equal(r.status,404);assert.equal(r.headers.get('location'),null);assert.ok(!(await r.text()).includes(base));
  }
  const config=await(await fetch(url+base+'/api/config')).json();assert.deepEqual(config.appPaths,[base]);assert.deepEqual(config.retiredAppPaths,['/calls','/com']);
  assert.equal((await fetch(url+base+'/')).headers.get('x-robots-tag'),'noindex, nofollow, noarchive');
  const auth={Origin:origin,Authorization:'Bearer '+alice.token,'Content-Type':'application/json'};
  const invitation=await(await fetch(url+base+'/api/invite',{method:'POST',headers:auth,body:'{}'})).json();assert.ok(invitation.url.startsWith(origin+base+'/#invite='));
  const ticket=await(await fetch(url+base+'/api/ticket',{method:'POST',headers:auth,body:'{}'})).json(),ws=new WebSocket(url.replace('http:','ws:')+base+'/ws',{origin});await once(ws,'open');const ready=once(ws,'message');ws.send(JSON.stringify({type:'auth',ticket:ticket.ticket}));assert.equal(JSON.parse((await ready)[0]).type,'ready');ws.close();await once(ws,'close');
  assert.equal(app.store.get('SELECT count(*) n FROM users').n,1);
});
test('new and legacy paths share identity, contacts, push registration and authenticated WebSockets',async t=>{
  const origin='https://example.com';
  const app=createApp({dataDir:':memory:',env:{PUBLIC_URL:origin+'/com',APP_PATH_ALIASES:'/calls',APP_MANIFEST_ID:'/calls/',BOOTSTRAP_TOKEN:'synthetic-owner-code',VAPID_PUBLIC_KEY:'',VAPID_PRIVATE_KEY:'',NTFY_PUBLIC_URL:'',NTFY_PUBLISH_URL:'',NTFY_PUBLISH_TOKEN:''}});
  t.after(()=>app.close());app.server.listen(0,'127.0.0.1');await once(app.server,'listening');const url='http://127.0.0.1:'+app.server.address().port;
  async function request(path,token,body){const res=await fetch(url+path,{method:body?'POST':'GET',headers:{Origin:origin,...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {res,data:await res.json()};}
  const identity=await newIdentity();const {res,data:alice}=await request('/calls/api/register',null,{name:'Alice',keys:identity.keys,setupCode:'synthetic-owner-code'});assert.equal(res.status,201);
  app.store.run('INSERT INTO push(owner,endpoint,subscription,confirmed) VALUES(?,?,?,?)',alice.user.id,'https://push.example.test/synthetic','{"synthetic":true}',1234);
  for(const base of ['/com','/calls']){
    assert.equal((await request(base+'/health')).res.status,200);
    const config=(await request(base+'/api/config')).data;assert.equal(config.base,base);assert.equal(config.publicURL,origin+'/com');assert.deepEqual(config.appPaths,['/calls','/com']);
    assert.equal((await request(base+'/api/me',alice.token)).data.user.id,alice.user.id);
    const manifest=(await request(base+'/manifest.webmanifest')).data;assert.equal(manifest.id,'/calls/');assert.equal(manifest.start_url,base+'/');assert.equal(manifest.scope,'/');
    const ticket=(await request(base+'/api/ticket',alice.token,{})).data.ticket;
    const socket=new WebSocket(url.replace('http:','ws:')+base+'/ws',{origin});await once(socket,'open');const ready=once(socket,'message');socket.send(JSON.stringify({type:'auth',ticket}));assert.equal(JSON.parse((await ready)[0]).type,'ready');socket.close();await once(socket,'close');
  }
  const invitation=(await request('/calls/api/invite',alice.token,{})).data;
  assert.ok(invitation.url.startsWith(origin+'/com/#invite='));
  const [invite,fingerprint]=new URL(invitation.url).hash.slice(8).split('.'),bobKeys=await newIdentity();
  const {data:bob}=await request('/com/api/join',null,{name:'Bob',keys:bobKeys.keys,invite,fingerprint});
  assert.equal((await request('/calls/api/me',alice.token)).data.contacts[0].id,bob.user.id);
  assert.equal((await request('/com/api/me',bob.token)).data.contacts[0].id,alice.user.id);
  for(const path of ['/company/health','/calls-old/api/config','/api/config'])assert.equal((await request(path)).res.status,404);
  const foreign=new WebSocket(url.replace('http:','ws:')+'/com/ws',{origin:'https://bad.example'});await new Promise(resolve=>foreign.once('error',resolve));
  assert.equal(app.store.get('SELECT COUNT(*) n FROM users').n,2);
  assert.deepEqual({...app.store.get('SELECT owner,endpoint,confirmed FROM push')},{owner:alice.user.id,endpoint:'https://push.example.test/synthetic',confirmed:1234});
});
