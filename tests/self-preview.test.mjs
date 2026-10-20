import test from 'node:test';
import assert from 'node:assert/strict';
import {selfPreview,previewPosition} from '../public/self-preview.js';
function fixture(){
  let width=390,height=844;const handlers=new Map(),styles={},classes=new Set(),captures=new Set(),dragChanges=[];
  const screen={classList:{contains:c=>['has-video'].includes(c)},getBoundingClientRect:()=>({left:0,top:0,width,height})};
  const local={style:{...styles,removeProperty(name){delete this[name];}},classList:{add:c=>classes.add(c),remove:c=>classes.delete(c)},getBoundingClientRect:()=>({left:parseFloat(local.style.left)||290,top:parseFloat(local.style.top)||154,width:90,height:120}),addEventListener:(name,fn)=>handlers.set(name,fn),removeEventListener:name=>handlers.delete(name),setPointerCapture:id=>captures.add(id),hasPointerCapture:id=>captures.has(id),releasePointerCapture:id=>captures.delete(id)};
  const preview=selfPreview({screen,local,onDragChange:value=>dragChanges.push(value)});
  return {preview,local,handlers,captures,dragChanges,resize(w,h){width=w;height=h;preview.layout();},emit(name,extra={}){handlers.get(name)?.({pointerId:1,isPrimary:true,button:0,clientX:300,clientY:160,preventDefault(){},stopPropagation(){},...extra});}};
}
test('preview drag is fixed-size, stays on screen and clamps after rotation',()=>{
  const f=fixture();f.emit('pointerdown');assert.ok(f.captures.has(1));f.emit('pointermove',{clientX:50,clientY:700});
  assert.equal(f.local.style.left,'40px');assert.equal(f.local.style.top,'694px');assert.equal(f.local.style.width,undefined);assert.equal(f.local.style.height,undefined);
  f.emit('pointerup');assert.deepEqual(f.dragChanges,[true,false]);assert.equal(f.captures.size,0);
  f.resize(844,390);assert.ok(parseFloat(f.local.style.top)<=262);assert.ok(parseFloat(f.local.style.left)<=746);
  f.preview.reset();assert.equal(f.local.style.left,undefined);assert.equal(f.local.style.top,undefined);f.preview.dispose();assert.equal(f.handlers.size,0);
});
test('secondary fingers and pointer cancellation cannot hijack or leave a stuck drag',()=>{
  const f=fixture();f.emit('pointerdown');f.emit('pointerdown',{pointerId:2});f.emit('pointermove',{pointerId:2,clientX:20});assert.equal(f.local.style.left,undefined);
  f.emit('pointercancel');assert.equal(f.captures.size,0);f.emit('pointermove',{clientX:20});assert.equal(f.local.style.left,undefined);
  f.emit('keydown',{key:'ArrowLeft'});assert.equal(f.local.style.left,'274px');f.preview.dispose();
  assert.deepEqual(previewPosition(-100,1000,390,844,90,120),{x:8,y:716});
});
