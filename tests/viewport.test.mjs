import test from 'node:test';
import assert from 'node:assert/strict';
import {appViewport} from '../public/viewport.js';

function fixture({visual=true}={}) {
  const win=new EventTarget(),doc=new EventTarget(),viewport=new EventTarget();
  const frames=new Map(),timers=new Map(),styles=new Map();let next=0,resets=0,height=844,top=900;
  const messages={scrollHeight:1500,get clientHeight(){return height-244;},get scrollTop(){return top;},set scrollTop(value){top=Math.max(0,Math.min(value,1500-this.clientHeight));}};
  Object.assign(viewport,{height:844,offsetTop:0,scale:1});
  Object.assign(win,{visualViewport:visual?viewport:undefined,innerHeight:844,scrollX:0,scrollY:0,
    requestAnimationFrame:fn=>{frames.set(++next,fn);return next;},cancelAnimationFrame:id=>frames.delete(id),
    setTimeout:fn=>{timers.set(++next,fn);return next;},clearTimeout:id=>timers.delete(id),
    scrollTo(){resets++;win.scrollX=win.scrollY=viewport.offsetTop=0;}});
  Object.assign(doc,{activeElement:null,visibilityState:'visible',documentElement:{clientHeight:844,style:{
    setProperty(name,value){styles.set(name,value);if(name==='--app-viewport-height')height=parseFloat(value);},
    removeProperty:name=>styles.delete(name)
  }},getElementById:id=>id==='messages'?messages:null});
  const controller=appViewport({window:win,document:doc});
  const emit=(target,name)=>target.dispatchEvent(new Event(name));
  const flush=()=>{const tasks=[...frames.values()];frames.clear();for(const fn of tasks)fn();};
  return {win,doc,viewport,controller,styles,messages,frames,timers,flush,resets:()=>resets,
    focus(){doc.activeElement={matches:()=>true};emit(doc,'focusin');flush();},
    blur(){doc.activeElement=null;emit(doc,'focusout');},
    geometry(h,offset=0){viewport.height=h;viewport.offsetTop=offset;emit(viewport,'resize');emit(viewport,'scroll');flush();},
    settle(){const tasks=[...timers.values()];timers.clear();for(const fn of tasks)fn();flush();},emit};
}
test('keyboard panning and repeated dismissal restore the shell and keep the latest message visible',()=>{
  const f=fixture();
  for(let i=0;i<5;i++) {
    f.focus();f.geometry(510,35);
    assert.equal(f.styles.get('--app-viewport-height'),'510px');assert.equal(f.styles.get('--app-viewport-top'),'35px');
    assert.equal(f.messages.scrollTop,1500-f.messages.clientHeight);
    f.win.scrollY=35;f.geometry(844); // Android may keep the input focused.
    assert.equal(f.win.scrollY,0);assert.equal(f.styles.get('--app-viewport-height'),'844px');
    assert.equal(f.styles.get('--app-viewport-top'),'0px');f.blur();f.settle();
  }
  assert.equal(f.resets(),5);f.controller.dispose();
});
test('older-message scroll positions survive keyboard resizing without jumping to the end',()=>{
  const f=fixture();f.messages.scrollTop=180;f.focus();f.geometry(510,20);f.geometry(844);
  assert.equal(f.messages.scrollTop,180);f.controller.dispose();
});
test('a late iOS root scroll after blur is corrected without scrolling the chat',()=>{
  const f=fixture();f.messages.scrollTop=180;f.focus();f.geometry(500,40);f.blur();
  f.geometry(844,40);f.win.scrollY=40;f.settle();
  assert.equal(f.win.scrollY,0);assert.equal(f.styles.get('--app-viewport-top'),'0px');
  assert.equal(f.messages.scrollTop,180);f.controller.dispose();
});
test('pinch zoom is left alone and layout resumes when returning to normal scale',()=>{
  const f=fixture();f.viewport.scale=2;f.win.scrollY=60;f.geometry(400,100);f.blur();f.settle();
  assert.equal(f.styles.get('--app-viewport-height'),'844px');assert.equal(f.resets(),0);assert.equal(f.win.scrollY,60);
  f.viewport.scale=1;f.geometry(844);assert.equal(f.styles.get('--app-viewport-height'),'844px');f.controller.dispose();
});
test('rotation and resume use the current geometry; teardown removes pending work',()=>{
  const f=fixture();f.win.innerHeight=f.doc.documentElement.clientHeight=390;f.geometry(390);
  assert.equal(f.styles.get('--app-viewport-height'),'390px');
  f.emit(f.win,'pageshow');f.controller.dispose();f.flush();f.settle();f.geometry(844);
  assert.equal(f.styles.size,0);assert.equal(f.frames.size,0);assert.equal(f.timers.size,0);
});
test('browsers without VisualViewport retain the CSS viewport fallback',()=>{
  const f=fixture({visual:false});f.focus();f.blur();f.settle();
  assert.equal(f.styles.size,0);f.controller.dispose();
});
