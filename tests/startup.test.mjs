import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../public/startup.js',import.meta.url),'utf8');
function fixture(){
  const handlers=new Map(),timers=new Map();let timerId=0,reloads=0;
  const elements=new Map(['startup-notice','startup-detail','startup-retry','connection'].map(id=>[id,{hidden:id==='startup-notice',textContent:'',addEventListener:(type,handler)=>handlers.set(id+':'+type,handler)}]));
  const win={addEventListener:(type,handler)=>handlers.set(type,handler)};
  const forbidden=new Proxy({}, {get(){throw new Error('Startup must not access browser storage');}});
  vm.runInNewContext(source,{
    window:win,document:{getElementById:id=>elements.get(id)},location:{reload(){reloads++;}},
    setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id),
    indexedDB:forbidden,localStorage:forbidden,sessionStorage:forbidden
  });
  return {elements,timers,win,reloads:()=>reloads,emit:(name,event={})=>handlers.get(name)?.(event),delay:()=>{for(const fn of timers.values())fn();timers.clear();}};
}

test('a stalled module graph exposes a retry without altering saved browser storage',()=>{
  const f=fixture();assert.equal(f.elements.get('startup-notice').hidden,true);
  f.delay();assert.equal(f.elements.get('startup-notice').hidden,false);
  assert.match(f.elements.get('startup-detail').textContent,/taking longer to load/);
  assert.equal(f.reloads(),0); // Never automatically interrupt loading or loop on poor networks.
  f.emit('startup-retry:click');assert.equal(f.reloads(),1);
});
test('late successful startup removes the warning and does not let a timer restore it',()=>{
  const f=fixture();f.delay();f.emit('webcaller-startup',{detail:{state:'ready'}});
  assert.equal(f.elements.get('startup-notice').hidden,true);
  f.delay();f.emit('error',{target:f.win});assert.equal(f.elements.get('startup-notice').hidden,true);
});
test('onboarding counts as completed startup and cancels the watchdog',()=>{
  const f=fixture();f.emit('webcaller-startup',{detail:{state:'setup'}});
  assert.equal(f.timers.size,0);f.delay();assert.equal(f.elements.get('startup-notice').hidden,true);
});
test('script loading errors stay visible while unrelated image errors do not fail startup',()=>{
  const f=fixture();f.emit('error',{target:{tagName:'IMG'}});assert.equal(f.elements.get('startup-notice').hidden,true);
  f.emit('error',{target:{tagName:'SCRIPT'}});
  assert.equal(f.elements.get('startup-notice').hidden,false);assert.equal(f.elements.get('connection').textContent,'Unable to load');
  assert.match(f.elements.get('startup-detail').textContent,/required app file/);assert.equal(f.reloads(),0);
});
test('secure startup failures remain visible as text without resetting device state',()=>{
  const f=fixture();const message='Secure module failed <unexpected>';f.emit('webcaller-startup',{detail:{state:'failed',message}});
  assert.equal(f.elements.get('startup-detail').textContent,message);assert.equal(f.elements.get('startup-notice').hidden,false);
  assert.equal(f.timers.size,0);assert.equal(f.reloads(),0);
});
