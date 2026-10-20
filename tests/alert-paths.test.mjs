import test from 'node:test';
import assert from 'node:assert/strict';
import {registerAlerts} from '../public/call-setup.js';
const href='https://example.com/com/';
function registration(path,subscription=true,script='sw.js') {const scope=new URL(path,href).href;return {scope,active:{scriptURL:new URL(script,scope).href},pushManager:{getSubscription:async()=>subscription?{endpoint:'synthetic'}:null}};}
test('a working legacy alert subscription is reused at the new path without duplicate push registration',async()=>{
  const old=registration('/calls/'),current=registration('/com/',false),other=registration('/blog/'),calls=[];
  const result=await registerAlerts({appPaths:['/com','/calls']},{href,worker:{getRegistrations:async()=>[other,current,old],register:async(...args)=>{calls.push(args);return old;}}});
  assert.equal(result,old);assert.equal(calls.length,1);assert.equal(calls[0][0],'/calls/sw.js');assert.equal(calls[0][1].scope,'/calls/');
});
function retiredFixture({fail=false,permission='granted',foreign=false}={}) {
  const home='https://example.com/0123456789abcdef/',events=[],old=registration('/calls/');
  old.pushManager.getSubscription=async()=>({endpoint:'old-owned',unsubscribe:async()=>events.push('unsubscribe')});old.unregister=async()=>events.push('unregister');old.getNotifications=async()=>[];
  const current=registration('/0123456789abcdef/',false);let subscription=null;
  current.pushManager={getSubscription:async()=>subscription,subscribe:async()=>{events.push('subscribe');return subscription={endpoint:'new-owned',toJSON:()=>({endpoint:'new-owned',keys:{auth:'a',p256dh:'b'}})};}};
  const api=async(path,method,body)=>{events.push({path,method,body});if(path==='/push/status')return {subscribed:!foreign};if(fail)throw Error('Server unavailable');return {ok:true};};
  const options={href:home,permission:()=>permission,api,worker:{getRegistrations:async()=>[old,current,registration('/blog/')],register:async(path,opts)=>{assert.equal(path,'/0123456789abcdef/sw.js');assert.equal(opts.scope,'/0123456789abcdef/');return current;}}};
  return {old,current,events,options,config:{appPaths:['/0123456789abcdef'],retiredAppPaths:['/calls','/com'],vapidPublicKey:'AQID'}};
}
test('retired workers migrate after the new subscription is accepted, without duplicate alerts or permission prompts',async()=>{
  const f=retiredFixture();assert.equal(await registerAlerts(f.config,f.options),f.current);
  assert.deepEqual(f.events,[{path:'/push/status',method:'POST',body:{endpoint:'old-owned'}},'subscribe',{path:'/push',method:'POST',body:{endpoint:'new-owned',keys:{auth:'a',p256dh:'b'},replaces:['old-owned']}},'unsubscribe','unregister']);
});
test('a failed migration leaves the old subscription intact and can be retried',async()=>{
  const f=retiredFixture({fail:true});await assert.rejects(registerAlerts(f.config,f.options),/Server unavailable/);assert.equal(f.events.includes('unsubscribe'),false);assert.equal(f.events.includes('unregister'),false);
});
test('retired alert migration requires existing permission and authenticated ownership',async()=>{
  for(const settings of [{permission:'default'},{permission:'denied'},{foreign:true}]){
    const f=retiredFixture(settings);await registerAlerts(f.config,f.options);assert.equal(f.events.includes('subscribe'),false);assert.equal(f.events.includes('unsubscribe'),false);assert.equal(f.events.includes('unregister'),false);
  }
});
test('concurrent startup and alert setup share one migration',async()=>{
  const f=retiredFixture();await Promise.all([registerAlerts(f.config,f.options),registerAlerts(f.config,f.options)]);assert.equal(f.events.filter(e=>e==='subscribe').length,1);assert.equal(f.events.filter(e=>e?.path==='/push').length,1);
});
test('an unrelated worker cannot be reused even if it claims the same origin or app scope',async()=>{
  const calls=[],unrelated=registration('/com/',true,'other-worker.js');
  await registerAlerts({appPaths:['https://bad.example','//bad']},{href,worker:{getRegistrations:async()=>[unrelated,registration('/blog/')],register:async(...args)=>{calls.push(args);return registration('/com/');}}});
  assert.equal(calls[0][0],'/com/sw.js');assert.equal(calls[0][1].scope,'/com/');
});
