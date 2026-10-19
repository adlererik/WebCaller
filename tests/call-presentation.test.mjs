import test from 'node:test';
import assert from 'node:assert/strict';
import {callPresentation,squareCallView,viewOrientation,CALL_CONTROLS_IDLE_MS} from '../public/call-presentation.js';

function target(extra={}){
  const listeners=new Map();
  return {...extra,addEventListener(type,fn){const set=listeners.get(type)||new Set();set.add(fn);listeners.set(type,set);},removeEventListener(type,fn){listeners.get(type)?.delete(fn);},emit(type,event={}){for(const fn of listeners.get(type)||[])fn(event);},listenerCount(){return [...listeners.values()].reduce((n,set)=>n+set.size,0);}};
}
function fixture(){
  const classes=new Set(['has-video','call-connected']),timers=new Map();let nextId=0,dialog=false;
  const document=target({visibilityState:'visible',activeElement:null,querySelector:()=>dialog?{}:null});
  const view=target({innerWidth:390,innerHeight:844,visualViewport:target()});
  const screen=target({ownerDocument:document,classList:{contains:c=>classes.has(c),add:(...cs)=>cs.forEach(c=>classes.add(c)),remove:(...cs)=>cs.forEach(c=>classes.delete(c)),toggle(c,force){if(force)classes.add(c);else classes.delete(c);}},getBoundingClientRect:()=>({width:view.innerWidth,height:view.innerHeight})});
  const remote=target({videoWidth:360,videoHeight:640}),local=target(),orientations=[];
  const controller=callPresentation({screen,remote,local,view,document,onOrientationChange:o=>orientations.push(o),schedule:(fn,ms)=>{timers.set(++nextId,{fn,ms});return nextId;},cancel:id=>timers.delete(id)});
  return {controller,screen,remote,view,document,classes,timers,orientations,dialog(value){dialog=value;},tick(){const pending=[...timers.values()];timers.clear();pending.forEach(({fn})=>fn());}};
}
test('portrait fills the view; either landscape endpoint chooses a square on both phones',()=>{
  assert.equal(viewOrientation(390,844),'portrait');assert.equal(viewOrientation(844,390),'landscape');
  for(const [width,height,remoteOrientation,expected] of [[390,844,'portrait',false],[390,844,'landscape',true],[844,390,'portrait',true],[844,390,'landscape',true]])assert.equal(squareCallView({width,height,remoteOrientation}),expected);
  assert.equal(squareCallView({width:390,height:844,remoteWidth:640,remoteHeight:360}),true);
  assert.equal(squareCallView({width:390,height:844,remoteWidth:180,remoteHeight:320}),false);
  assert.equal(squareCallView({width:390,height:844,remoteOrientation:'portrait',remoteWidth:640,remoteHeight:480}),false);
});
test('the chat keyboard and browser toolbar do not falsely rotate a touch phone',()=>{
  const phone={navigator:{maxTouchPoints:5},screen:{orientation:{type:'portrait-primary'}}};
  assert.equal(viewOrientation(390,280,phone),'portrait');
  assert.equal(squareCallView({width:390,height:280,localOrientation:viewOrientation(390,280,phone),remoteOrientation:'portrait'}),false);
  phone.screen.orientation.type='landscape-primary';assert.equal(viewOrientation(844,390,phone),'landscape');
  const safari={navigator:{maxTouchPoints:5},orientation:0};assert.equal(viewOrientation(390,280,safari),'portrait');safari.orientation=-90;assert.equal(viewOrientation(844,390,safari),'landscape');
});
test('steady stats or video resizes do not keep resetting the four-second controls timer',()=>{
  const f=fixture();f.controller.update();const id=[...f.timers.keys()][0];assert.equal(f.timers.get(id).ms,CALL_CONTROLS_IDLE_MS);
  for(let i=0;i<20;i++){f.controller.update();f.remote.emit('resize');}assert.deepEqual([...f.timers.keys()],[id]);
  f.tick();assert.ok(f.classes.has('controls-hidden'));f.screen.emit('focusin');f.screen.emit('click',{target:f.screen});assert.equal(f.classes.has('controls-hidden'),false);assert.equal(f.timers.size,1);
  f.tick();assert.ok(f.classes.has('controls-hidden'));f.screen.emit('keydown',{target:f.screen,key:'Enter',preventDefault(){}});assert.equal(f.classes.has('controls-hidden'),false);f.controller.dispose();
});
test('voice, incoming/reconnecting and off-screen calls keep safe controls and no idle timer',()=>{
  const f=fixture();f.controller.update();f.tick();assert.ok(f.classes.has('controls-hidden'));
  for(const absent of ['call-connected','has-video']){f.classes.delete(absent);f.controller.update();assert.equal(f.classes.has('controls-hidden'),false);assert.equal(f.timers.size,0);f.classes.add(absent);f.controller.update();}
  f.classes.add('hidden');f.controller.update();assert.equal(f.timers.size,0);f.classes.delete('hidden');f.controller.update();assert.equal(f.timers.size,1);
  f.document.visibilityState='hidden';f.document.emit('visibilitychange');assert.equal(f.timers.size,0);f.controller.dispose();
});
test('settings dialogs and keyboard focus cannot lose their controls during interaction',()=>{
  const f=fixture();f.controller.update();f.dialog(true);f.tick();assert.equal(f.classes.has('controls-hidden'),false);
  f.dialog(false);f.document.emit('close');assert.equal(f.timers.size,1);
  f.document.activeElement={closest:()=>({matches:()=>true})};f.tick();assert.equal(f.classes.has('controls-hidden'),false);
  f.document.activeElement=null;f.screen.emit('focusout');f.tick();assert.ok(f.classes.has('controls-hidden'));f.controller.dispose();
});
test('orientation is event driven, reset per call, and retained across encoder resizes',()=>{
  const f=fixture();f.controller.update();assert.equal(f.classes.has('square-video'),false);
  f.controller.setRemoteOrientation('landscape');assert.ok(f.classes.has('square-video'));
  for(const [w,h]of [[640,360],[240,135],[180,320],[360,640]]){f.remote.videoWidth=w;f.remote.videoHeight=h;f.remote.emit('resize');assert.ok(f.classes.has('square-video'));}
  f.controller.setRemoteOrientation('untrusted-value');assert.ok(f.classes.has('square-video'));
  f.controller.reset('portrait');assert.equal(f.classes.has('square-video'),false);
  f.view.innerWidth=844;f.view.innerHeight=390;f.view.emit('resize');f.view.emit('resize');assert.deepEqual(f.orientations,['landscape']);assert.ok(f.classes.has('square-video'));
  f.controller.dispose();assert.equal(f.timers.size,0);assert.equal(f.classes.has('controls-hidden'),false);assert.equal(f.screen.listenerCount(),0);assert.equal(f.view.listenerCount(),0);assert.equal(f.remote.listenerCount(),0);
});
