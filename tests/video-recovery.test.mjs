import test from 'node:test';
import assert from 'node:assert/strict';
import {videoRecovery,VIDEO_PROBE_INTERVAL,healthyAudio} from '../public/video-recovery.js';
import {mediaBudget,chooseProfile} from '../public/media.js';
const good={loss:0,rtt:.05,jitter:.005,bandwidth:90000,audioFlow:true,connected:true,videoUploadKbps:20};
const opts=now=>({now,stable:5,wanted:true});
test('fast cellular video aims at 500 kbps each way without increasing the voice budget',()=>{
 const b=mediaBudget('saver',{bandwidth:150000000});assert.equal(b.video,500000);assert.equal(b.audio,20000);assert.equal(b.width,640);assert.equal(b.height,360);assert.equal(b.fps,20);
 const c=videoRecovery(),p=c.budget(b,mediaBudget('saver'),{...good,bandwidth:150000000},opts(0));assert.equal(p.video,500000);assert.equal(p.audio,20000);
});
test('a stale low estimate no longer locks a healthy call in weak mode indefinitely',()=>{
 assert.equal(chooseProfile('saver',good,'weak',4),'weak');assert.equal(chooseProfile('saver',good,'weak',5),'saver');
 const c=videoRecovery(),base=mediaBudget('saver',good),ceiling=mediaBudget('saver');let p=c.budget(base,ceiling,good,opts(0));assert.ok(p.video>base.video);
 for(let now=3000;now<=63000;now+=3000){p=c.budget(base,ceiling,{...good,videoUploadKbps:p.video/1000},opts(now));assert.equal(p.audio,base.audio);assert.ok(p.video<=500000);}
 assert.equal(p.video,500000);
});
test('paused video probes gently, pauses on no progress and periodically tries again',()=>{
 const c=videoRecovery(),s={...good,bandwidth:40000,videoUploadKbps:0},base=mediaBudget('saver',s),cap=mediaBudget('saver');assert.equal(base.video,0);
 let p=c.budget(base,cap,s,opts(0));assert.equal(p.video,6000);assert.equal(p.fps,2);assert.equal(p.audio,base.audio);
 p=c.budget(base,cap,s,opts(3000));assert.equal(p.video,0);assert.equal(c.budget(base,cap,s,opts(3000+VIDEO_PROBE_INTERVAL-1)).video,0);
 assert.equal(c.budget(base,cap,s,opts(3000+VIDEO_PROBE_INTERVAL)).video,6000);
});
test('audio degradation aborts extra probing immediately; no probes during handover, muted camera or file sharing',()=>{
 for(const patch of [{loss:.1},{rtt:1},{jitter:.1},{audioFlow:false},{connected:false}]){
  const c=videoRecovery(),base=mediaBudget('weak',good),cap=mediaBudget('saver');c.budget(base,cap,good,opts(0));const p=c.budget(base,cap,{...good,...patch},opts(1000));assert.ok(p.video<=base.video);assert.equal(p.audio,base.audio);
 }
 const base=mediaBudget('saver',{...good,bandwidth:40000}),cap=mediaBudget('saver');
 for(const extra of [{wanted:false},{sharing:true},{stable:4}])assert.equal(videoRecovery().budget(base,cap,good,{...opts(0),...extra}).video,base.video);
 assert.equal(healthyAudio({...good,audioFlow:false}),false);
});
test('tiny usable video remains enabled and CPU limits remain enforced',()=>{
 const budget=mediaBudget('weak',{bandwidth:50000});assert.ok(budget.video>0);assert.ok(budget.video<15000);assert.equal(budget.fps,2);
 const cap=mediaBudget('saver',{},true),p=videoRecovery().budget(mediaBudget('weak',good),cap,good,opts(0));assert.ok(p.video<=350000);assert.ok(p.fps<=12);
});
