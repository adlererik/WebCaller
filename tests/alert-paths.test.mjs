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
test('an unrelated worker cannot be reused even if it claims the same origin or app scope',async()=>{
  const calls=[],unrelated=registration('/com/',true,'other-worker.js');
  await registerAlerts({appPaths:['https://bad.example','//bad']},{href,worker:{getRegistrations:async()=>[unrelated,registration('/blog/')],register:async(...args)=>{calls.push(args);return registration('/com/');}}});
  assert.equal(calls[0][0],'/com/sw.js');assert.equal(calls[0][1].scope,'/com/');
});
