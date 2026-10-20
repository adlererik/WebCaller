import test from 'node:test';
import assert from 'node:assert/strict';
import {captureConstraints,videoScale,mediaBudget,Phone,PROFILES} from '../public/media.js';
test('all camera capture paths request full field of view without imposing a landscape height',()=>{
 for(const p of Object.values(PROFILES)){const c=captureConstraints(p);assert.equal(c.resizeMode,'none');assert.equal(c.height,undefined);assert.equal(c.aspectRatio,undefined);assert.equal(c.frameRate.ideal,p.fps);assert.equal(c.width.ideal,960);assert.equal(captureConstraints(p,{width:360,height:640}).width.ideal,540);}
});
test('sender scaling preserves portrait, landscape and 4:3 aspect ratios inside each adaptive budget',()=>{
 for(const profile of Object.keys(PROFILES))for(const sharing of [false,true])for(const [width,height] of [[360,640],[640,360],[480,640],[640,480],[1920,1080],[1080,1920]]){
  const p=mediaBudget(profile,{},false,sharing),scale=videoScale(p,{width,height}),w=width/scale,h=height/scale;
  assert.ok(scale>=1);assert.ok(Math.max(w,h)<=Math.max(p.width,p.height)+.001);assert.ok(Math.min(w,h)<=Math.min(p.width,p.height)+.001);assert.equal(w/h,width/height);
 }
 assert.equal(videoScale(PROFILES.saver,{width:360,height:640}),1);assert.equal(videoScale(PROFILES.saver,{width:640,height:360}),1);assert.equal(videoScale(PROFILES.saver,{}),1);
});
test('orientation changes and profiles never apply cropping dimensions to the running camera',async()=>{
 const constraints=[],encodings=[];let dimensions={width:360,height:640};
 const track={id:'portrait',getSettings:()=>dimensions,applyConstraints:async c=>constraints.push(c)};
 const phone=new Phone({signal:async()=>{},update:()=>{},remote:{},local:{},preference:()=> 'saver'});phone.pc={};phone.stream={getVideoTracks:()=>[track],getAudioTracks:()=>[]};phone.videoWanted=true;
 phone.videoSender={getParameters:()=>({encodings:[{}]}),setParameters:async p=>encodings.push(structuredClone(p))};
 await phone.applyProfile();assert.equal(encodings.at(-1).encodings[0].scaleResolutionDownBy,1);dimensions={width:640,height:360};await phone.applyProfile();assert.equal(encodings.at(-1).encodings[0].scaleResolutionDownBy,1);
 await phone.setSharing(true);for(const c of constraints){assert.equal(c.width.max,undefined);assert.ok(c.width.ideal>0);assert.equal(c.height,undefined);assert.equal(c.resizeMode,'none');}assert.ok(encodings.at(-1).encodings[0].maxBitrate<=45000);
});
test('browsers that refuse explicit downscaling still receive bitrate and frame-rate controls',async()=>{
 const accepted=[],phone=new Phone({signal:async()=>{},update:()=>{},remote:{},local:{},preference:()=> 'saver'});phone.stream={getVideoTracks:()=>[{getSettings:()=>({width:360,height:640})}]};
 const sender={getParameters:()=>({encodings:[{}]}),setParameters:async p=>{if(p.encodings[0].scaleResolutionDownBy)throw Error('Not supported');accepted.push(p);}};
 await phone.setSender(sender,true,PROFILES.saver);assert.equal(accepted.length,1);assert.equal(accepted[0].encodings[0].maxBitrate,500000);assert.equal(accepted[0].encodings[0].maxFramerate,20);
});
test('fluctuating bandwidth and file transfers retain camera geometry and adapt only the encoder',async()=>{
 const requested=[],encodings=[],geometry={width:{ideal:960},resizeMode:'none',facingMode:{ideal:'user'}};
 const track={id:'stable-camera',getSettings:()=>({width:960,height:720}),getConstraints:()=>({...geometry,frameRate:{ideal:24}}),applyConstraints:async c=>requested.push(c)};
 const phone=new Phone({signal:async()=>{},update:()=>{},remote:{},local:{},preference:()=> 'wifi'});phone.pc={};phone.stream={getVideoTracks:()=>[track],getAudioTracks:()=>[]};phone.videoWanted=true;
 phone.videoSender={getParameters:()=>({encodings:[{}]}),setParameters:async p=>encodings.push(structuredClone(p))};
 for(const profile of ['wifi','saver','weak','saver','wifi','weak','wifi']){phone.profile=profile;await phone.applyProfile();}
 await phone.setSharing(true);await phone.setSharing(false);
 for(const c of requested){assert.deepEqual(c.width,geometry.width);assert.equal(c.resizeMode,'none');assert.deepEqual(c.facingMode,geometry.facingMode);assert.equal(c.height,undefined);assert.equal(c.aspectRatio,undefined);}
 assert.ok(encodings.some(p=>p.encodings[0].maxBitrate===900000));assert.ok(encodings.some(p=>p.encodings[0].maxBitrate===45000));
 assert.ok(encodings.some(p=>p.encodings[0].scaleResolutionDownBy>1));
 const before=requested.length;phone.stats={bandwidth:1800000};await phone.applyProfile();assert.equal(requested.length,before,'Bitrate-only updates must not reconfigure the camera');
});
