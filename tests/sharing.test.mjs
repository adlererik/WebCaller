import test from 'node:test';
import assert from 'node:assert/strict';
import {validLocation,mapsURL,locationText,mapPoint,locate} from '../public/location.js';
import {AudioOutput} from '../public/audio-output.js';
const place={lat:0,lon:0,accuracy:12,capturedAt:Date.now(),label:'Main entrance',preview:'map'};
test('location validates coordinates and generates a Maps URL without user-controlled links',()=>{
  assert.ok(validLocation(place));assert.equal(mapsURL(place),'https://maps.google.com/maps?q=0.000000,0.000000');
  assert.equal(locationText(place),'Main entrance\nhttps://maps.google.com/maps?q=0.000000,0.000000');
  for(const patch of [{lat:91},{lon:-181},{lat:NaN},{accuracy:-1},{capturedAt:1.2},{label:'x'.repeat(161)},{preview:'javascript:'}])assert.equal(validLocation({...place,...patch}),false);
  assert.throws(()=>mapsURL({...place,lon:Infinity}));
  for(const lat of [-90,0,90]){const point=mapPoint(lat,180);assert.ok(Number.isFinite(point.x)&&Number.isFinite(point.y));assert.ok(point.y>=-1&&point.y<=point.n*256+1);}
});
test('cancelled one-shot location ignores late callbacks and never starts another request',async()=>{
  let success,calls=0;const controller=new AbortController();const result=locate({getCurrentPosition(ok,error,options){calls++;success=ok;assert.equal(options.maximumAge,0);}},controller.signal);
  controller.abort();await assert.rejects(result,{name:'AbortError'});success({coords:{latitude:0,longitude:0}});assert.equal(calls,1);
});
function audioFixture(){
  const routes=[];let fail=false,items=[{kind:'audiooutput',deviceId:'default',label:'Default'},{kind:'audiooutput',deviceId:'speaker',label:'Built-in speaker'},{kind:'audiooutput',deviceId:'headset',label:'Headset'}];
  const element={sinkId:'',async setSinkId(id){if(fail)throw new Error('Denied');routes.push(id);this.sinkId=id;}};
  const devices=new EventTarget();devices.enumerateDevices=async()=>items;devices.selectAudioOutput=async()=>items[2];const output=new AudioOutput(element,devices);
  return {output,routes,element,devices,fail:()=>fail=true,items:value=>items=value};
}
test('voice output uses real browser devices, failure preserves selection, video prefers speaker and restores voice',async()=>{
  const f=audioFixture();await f.output.start();assert.equal(f.output.isSpeaker,false);await f.output.route('headset');
  await f.output.setVideo(true);assert.equal(f.output.isSpeaker,true);await f.output.setVideo(false);assert.equal(f.output.sink,'headset');
  f.fail();await assert.rejects(f.output.toggle());assert.equal(f.output.sink,'headset');f.output.stop();
});
test('output chooser and unplugged device reset use exposed device IDs only',async()=>{
  const f=audioFixture();await f.output.start();await f.output.choose();assert.equal(f.output.sink,'headset');
  f.items([]);await f.output.refresh();assert.equal(f.output.sink,'');assert.deepEqual(f.routes,['headset','']);f.output.stop();
});
test('unsupported output routing does not claim speaker activation or change microphone tracks',async()=>{
  const output=new AudioOutput({},{});await output.start(true);assert.equal(output.supported,false);assert.equal(output.isSpeaker,false);assert.equal(await output.toggle(),false);output.stop();
});
test('ending a call cancels a pending output change and resets the media element',async()=>{
  let finish,route='';const element={async setSinkId(id){if(id==='speaker')await new Promise(r=>finish=r);route=id;}};
  const output=new AudioOutput(element,{enumerateDevices:async()=>[]});await output.start();const change=output.route('speaker');await new Promise(r=>setImmediate(r));output.stop();finish();assert.equal(await change,false);await output.tail;assert.equal(route,'');assert.equal(output.isSpeaker,false);
});

test('late output enumeration from an ended call cannot change the next call’s route',async()=>{
 let resolveOld,requests=0;const routes=[],devices={enumerateDevices:()=>++requests===1?new Promise(r=>resolveOld=r):Promise.resolve([{kind:'audiooutput',deviceId:'speaker',label:'Speaker'}])};
 const output=new AudioOutput({setSinkId:async id=>routes.push(id)},devices);
 const old=output.start(true);output.stop();await output.start(false);resolveOld([{kind:'audiooutput',deviceId:'speaker',label:'Speaker'}]);await old;
 assert.equal(output.video,false);assert.equal(output.isSpeaker,false);assert.ok(!routes.includes('speaker'));output.stop();
});
