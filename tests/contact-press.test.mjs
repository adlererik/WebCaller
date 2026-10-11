import test from 'node:test';
import assert from 'node:assert/strict';
import {contactPress} from '../public/contact-press.js';
class Target extends EventTarget {isConnected=true;setPointerCapture(){}}
function fixture(t){
  t.mock.timers.enable({apis:['setTimeout']});
  const element=new Target(),scope=new Target(),seen=[];
  const dispose=contactPress(element,{scope,open:()=>seen.push('options'),activate:()=>seen.push('chat')});
  t.after(dispose);
  const send=(name,fields={})=>{const e=new Event(name,{cancelable:true});Object.assign(e,{button:0,pointerId:1,clientX:20,clientY:20,isPrimary:true,detail:1,...fields});element.dispatchEvent(e);return e;};
  return {element,scope,seen,send,dispose};
}
test('short taps open chat; a long press opens options and consumes the following tap',t=>{
  const f=fixture(t);f.send('pointerdown');t.mock.timers.tick(100);f.send('pointerup');f.send('click');assert.deepEqual(f.seen,['chat']);
  f.send('pointerdown');t.mock.timers.tick(650);assert.deepEqual(f.seen,['chat','options']);f.send('pointerup');assert.equal(f.send('click').defaultPrevented,true);assert.equal(f.seen.length,2);
  // A later keyboard activation remains available.
  f.send('click',{detail:0});assert.equal(f.seen.at(-1),'chat');
});
test('moving, scrolling, cancelling and removing a row cannot trigger a stale contact menu',t=>{
  const f=fixture(t);
  f.send('pointerdown');f.send('pointermove',{clientY:35});t.mock.timers.tick(1000);
  f.send('pointerdown');f.scope.dispatchEvent(new Event('scroll'));t.mock.timers.tick(1000);
  f.send('pointerdown');f.send('pointercancel');t.mock.timers.tick(1000);
  f.send('pointerdown');f.element.isConnected=false;t.mock.timers.tick(1000);
  f.element.isConnected=true;f.send('pointerdown');f.dispose();t.mock.timers.tick(1000);
  assert.deepEqual(f.seen,[]);
});
test('contact options also work with a right click, Context Menu key and Shift+F10',t=>{
  const f=fixture(t);assert.equal(f.send('contextmenu').defaultPrevented,true);
  assert.equal(f.send('keydown',{key:'ContextMenu'}).defaultPrevented,true);
  assert.equal(f.send('keydown',{key:'F10',shiftKey:true}).defaultPrevented,true);
  f.send('pointerdown',{isPrimary:false});t.mock.timers.tick(1000);
  assert.deepEqual(f.seen,['options','options','options']);
});
