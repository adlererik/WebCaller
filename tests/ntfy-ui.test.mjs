import test from 'node:test';
import assert from 'node:assert/strict';
import {ntfySetup} from '../public/ntfy-setup.js';
const owner='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',callId='cccccccc-cccc-4ccc-cccc-cccccccccccc';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(t,{initial={connected:true,confirmed:true,preferred:true},entry,response}={}){
 const previous=new Map(['document','window','navigator'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)])),elements=new Map(),calls=[],opened=[],toasts=[];
 const element=id=>{
  if(elements.has(id))return elements.get(id);
  const classes=new Set(['hidden']),events=new Map(),el={open:false,textContent:'',value:'',disabled:false,events,
   classList:{add:v=>classes.add(v),remove:v=>classes.delete(v),contains:v=>classes.has(v),toggle:(v,on)=>{if(on===undefined)on=!classes.has(v);on?classes.add(v):classes.delete(v);}},
   showModal(){this.open=true;},close(){this.open=false;events.get('close')?.();},addEventListener:(name,fn)=>events.set(name,fn),removeAttribute:()=>{},select:()=>{}};
  elements.set(id,el);return el;
 };
 Object.defineProperty(globalThis,'document',{configurable:true,value:{getElementById:element}});
 Object.defineProperty(globalThis,'window',{configurable:true,value:{matchMedia:()=>({matches:false})}});
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{userAgent:'Android',platform:'Linux',maxTouchPoints:1,mediaDevices:{getUserMedia(){throw Error('A notification link must not request capture');}}}});
 t.after(()=>{element('extra-ringing-dialog').close();for(const [name,descriptor]of previous)descriptor?Object.defineProperty(globalThis,name,descriptor):delete globalThis[name];});
 let state={available:true,server:'https://notify.example.com',topic:'wc_synthetic_same_subscription',...initial};
 const api=async(path,method='GET',body)=>{calls.push({path,method,body});if(response&&path.startsWith('/calls/'))return response;
  if(path==='/ntfy/preference'){state={...state,preferred:body.useNtfy};return state;}if(path==='/ntfy')return state;throw Error('Unexpected request '+path);};
 const ui=ntfySetup({api,config:()=>({ntfyAvailable:true}),device:()=>({user:{id:owner}}),toast:v=>toasts.push(v),openCall:async offer=>opened.push(offer),entry});
 return {ui,element,calls,opened,toasts};
}

test('a confirmed phone switches notification methods without re-enrollment or deleting its subscription',async t=>{
 const f=fixture(t);await f.ui.show();assert.equal(f.element('extra-title').textContent,'ntfy call alerts are on');
 assert.equal(f.element('extra-use-browser').classList.contains('hidden'),false);
 f.element('extra-use-browser').events.get('click')();await flush();
 assert.equal(f.element('extra-title').textContent,'Browser call alerts are on');assert.equal(f.element('extra-use-ntfy').classList.contains('hidden'),false);
 f.element('extra-use-ntfy').events.get('click')();await flush();assert.equal(f.element('extra-title').textContent,'ntfy call alerts are on');
 assert.deepEqual(f.calls.filter(c=>c.path==='/ntfy/preference').map(c=>c.body),[{useNtfy:false},{useNtfy:true}]);
 assert.equal(f.calls.some(c=>c.method==='DELETE'||c.path.includes('/test')),false);
});

test('an ntfy link opens only the exact active call after the existing device status check',async t=>{
 const offer={kind:'offer',callId,envelope:{v:2,id:'synthetic-encrypted-offer'}};
 const f=fixture(t,{entry:{owner,callId},response:{state:'ringing',canAnswer:true,expiresAt:Date.now()+20000,offer}});
 await f.ui.resume();assert.deepEqual(f.opened,[offer]);assert.deepEqual(f.calls,[{path:'/calls/'+callId+'?offer=1',method:'GET',body:undefined}]);
 assert.equal(f.calls.some(c=>c.method==='POST'),false);
});

test('a notification in another browser profile cannot load or answer the call',async t=>{
 const f=fixture(t,{entry:{owner:other,callId}});await f.ui.resume();assert.deepEqual(f.opened,[]);assert.deepEqual(f.calls,[]);
 assert.equal(f.element('extra-title').textContent,'Open your usual phone');
});

for(const scenario of ['expired','answered','wrong call'])test(`an ntfy link rejects an ${scenario} notification without answering`,async t=>{
 const offer={kind:'offer',callId:scenario==='wrong call'?other:callId,envelope:{v:2}};
 const f=fixture(t,{entry:{owner,callId},response:{state:scenario==='answered'?'answered':'ringing',canAnswer:scenario!=='answered',expiresAt:Date.now()+(scenario==='expired'?-1:20000),offer}});
 await f.ui.resume();assert.deepEqual(f.opened,[]);assert.equal(f.calls.some(c=>c.method==='POST'),false);assert.ok(f.toasts.length);
});
