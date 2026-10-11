import test from 'node:test';
import assert from 'node:assert/strict';
import {networkMode,chooseProfile,tuneOpus,PROFILES,Phone} from '../public/media.js';
test('unknown networks save data and confirmed Wi-Fi allows higher quality',()=>{
  assert.equal(networkMode('auto',{}),'saver');assert.equal(networkMode('auto',{type:'wifi'}),'wifi');
  assert.equal(networkMode('auto',{type:'wifi',saveData:true}),'saver');assert.equal(networkMode('saver',{type:'wifi'}),'saver');
});
test('ICE restart uses a changed relay before offering and ignores a cancelled refresh',async()=>{
  const changes=[],signals=[];
  const phone=new Phone({signal:async(kind,payload)=>signals.push({kind,payload}),update:()=>{},local:{},remote:{},preference:()=> 'saver'});
  let configuration={iceServers:[{urls:'turn:old.invalid'}],iceTransportPolicy:'relay'};
  phone.pc={getConfiguration:()=>configuration,setConfiguration:next=>{configuration=next;changes.push(next);},
    createOffer:async options=>{assert.equal(configuration.iceServers[0].urls,'turn:new.invalid');assert.equal(options.iceRestart,true);return {type:'offer',sdp:'v=0\r\n'};},
    setLocalDescription:async()=>{},close:()=>{}};
  phone.caller=true;phone.refreshIce=async()=>({iceServers:[{urls:'turn:new.invalid',username:'fresh',credential:'temporary'}]});
  await phone.restart();assert.equal(changes.length,1);assert.equal(configuration.iceTransportPolicy,'relay');assert.equal(signals[0].kind,'restart');
  phone.restartAt=0;let resolve;
  phone.refreshIce=()=>new Promise(r=>resolve=r);
  const pending=phone.restart();phone.close();resolve({iceServers:[{urls:'turn:cancelled.invalid'}]});await pending;
  assert.equal(changes.length,1);assert.equal(signals.length,1);
});
test('audio wins over video; recovery waits for five healthy samples',()=>{
  assert.equal(chooseProfile('wifi',{bandwidth:25000},'wifi'),'critical');assert.equal(PROFILES.critical.video,0);
  assert.equal(chooseProfile('saver',{loss:.08},'saver'),'weak');
  assert.equal(chooseProfile('wifi',{},'weak',4),'weak');assert.equal(chooseProfile('wifi',{},'weak',5),'wifi');
  assert.equal(chooseProfile('saver',{},'wifi',5),'saver');
});
test('Opus negotiation preserves existing fmtp options and requests FEC, DTX and mono',()=>{
  const sdp='v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2\r\na=fmtp:111 minptime=10;useinbandfec=0;foo=bar\r\n';
  const tuned=tuneOpus(sdp,20000);
  for(const x of ['foo=bar','useinbandfec=1','usedtx=1','stereo=0','maxaveragebitrate=20000'])assert.ok(tuned.includes(x));
  assert.equal((tuned.match(/a=fmtp:111/g)||[]).length,1);
});
