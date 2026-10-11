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
  let configuration={iceServers:[{urls:'turn:old.invalid'}],iceTransportPolicy:'relay',certificates:[{synthetic:true}]};
  phone.pc={getConfiguration:()=>configuration,setConfiguration:next=>{assert.deepEqual(next.certificates,configuration.certificates);configuration=next;changes.push(next);},
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
function cameraFixture(){
 const events=[],audio={kind:'audio',enabled:true,stop(){events.push('audio-stopped');}},old={kind:'video',stop(){events.push('old-stopped');},getSettings:()=>({facingMode:'user',deviceId:'front'}),applyConstraints:async()=>{}};
 const tracks=[audio,old],phone=new Phone({signal:async()=>{},update:()=>{},local:{},remote:{},preference:()=> 'auto'});
 phone.pc={};phone.stream={getVideoTracks:()=>tracks.filter(t=>t.kind==='video'),getAudioTracks:()=>[audio],addTrack:t=>tracks.push(t),removeTrack:t=>tracks.splice(tracks.indexOf(t),1)};phone.videoWanted=true;
 phone.videoSender={replaceTrack:async track=>events.push(track?.getSettings().deviceId||'none')};phone.applyProfile=async()=>{};
 const make=(mode,id)=>({kind:'video',stop(){events.push(id+'-stopped');},getSettings:()=>({facingMode:mode,deviceId:id}),applyConstraints:async()=>{}});
 return {phone,events,make,audio};
}
test('switching camera releases video before capture and keeps the microphone',async t=>{
 const prior=Object.getOwnPropertyDescriptor(globalThis,'navigator');t.after(()=>{if(prior)Object.defineProperty(globalThis,'navigator',prior);else delete globalThis.navigator;});
 const f=cameraFixture();Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:async c=>{
  assert.equal(c.audio,false);assert.equal(c.video.facingMode.exact,'environment');assert.equal(f.events[0],'old-stopped');return {getVideoTracks:()=>[f.make('environment','back')]};
 }}}});
 assert.equal(await f.phone.switchCamera(),'environment');assert.equal(f.phone.stream.getAudioTracks()[0],f.audio);assert.ok(!f.events.includes('audio-stopped'));assert.equal(f.phone.videoWanted,true);
});
test('failed camera switching restores the front camera without ending audio',async t=>{
 const prior=Object.getOwnPropertyDescriptor(globalThis,'navigator');t.after(()=>{if(prior)Object.defineProperty(globalThis,'navigator',prior);else delete globalThis.navigator;});
 const f=cameraFixture();Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:async c=>{
  if(c.video.facingMode?.exact)throw Object.assign(new Error('No rear camera'),{name:'OverconstrainedError'});
  assert.equal(c.video.deviceId.exact,'front');return {getVideoTracks:()=>[f.make('user','front')]};
 }}}});
 await assert.rejects(f.phone.switchCamera(),/No rear camera/);assert.equal(f.phone.facingMode,'user');assert.equal(f.phone.stream.getVideoTracks()[0].getSettings().deviceId,'front');assert.ok(!f.events.includes('audio-stopped'));assert.equal(f.phone.videoWanted,true);
});
test('finite link budgets lower video before voice and reduce capture load for CPU congestion',async()=>{
 const {mediaBudget}=await import('../public/media.js');
 const weak=mediaBudget('wifi',{bandwidth:60000});assert.equal(weak.video,0);assert.equal(weak.audio,27000);
 const constrained=mediaBudget('wifi',{bandwidth:200000});assert.ok(constrained.video<=50000);assert.equal(constrained.fps,6);
 const cell=mediaBudget('saver',{bandwidth:2000000});assert.equal(cell.video,120000);assert.equal(cell.audio,20000);
 const cpu=mediaBudget('wifi',{},true);assert.equal(cpu.fps,12);assert.equal(cpu.width,640);assert.equal(cpu.video,350000);
});
test('either endpoint using cellular or an unknown network limits both directions',()=>{
 const phone=new Phone({signal:async()=>{},update:()=>{},local:{},remote:{},preference:()=> 'wifi'});
 assert.equal(phone.mode(),'saver');phone.remoteMode='wifi';assert.equal(phone.mode(),'wifi');phone.remoteMode='saver';assert.equal(phone.mode(),'saver');phone.close();
});
test('restart requests are queued during negotiation and failed signaling rolls back an unsent offer',async()=>{
 const phone=new Phone({signal:async()=>{throw new Error('Offline');},update:()=>{},local:{},remote:{},preference:()=> 'auto'});
 let queued=0,rolledBack=false;phone.queueRestart=()=>queued++;phone.caller=true;
 phone.pc={signalingState:'have-remote-offer',connectionState:'disconnected',close(){}};
 await phone.restart();assert.equal(queued,1);assert.equal(phone.restartPending,true);
 phone.pc.signalingState='stable';phone.pc.getConfiguration=()=>({});phone.pc.createOffer=async()=>({type:'offer',sdp:'v=0\r\n'});phone.pc.setLocalDescription=async d=>{phone.pc.signalingState=d.type==='rollback'?'stable':'have-local-offer';if(d.type==='rollback')rolledBack=true;};
 await phone.restart();assert.equal(rolledBack,true);assert.equal(phone.restartPending,true);assert.ok(queued>=2);phone.close();
});
test('unchanged relay settings are retained; incompatible browsers recover with valid existing credentials',async()=>{
 const phone=new Phone({signal:async()=>{},update:()=>{},local:{},remote:{},preference:()=> 'auto'});let sets=0;
 phone.pc={getConfiguration:()=>({bundlePolicy:'max-bundle'}),setConfiguration:()=>{sets++;throw Object.assign(new Error('Unsupported configuration update'),{name:'InvalidModificationError'});},close(){}};
 phone.iceServers=[{urls:'turn:old.test'}];phone.iceExpiresAt=Date.now()+3600000;phone.refreshIce=async()=>({iceServers:phone.iceServers});await phone.refreshConfiguration();assert.equal(sets,0);
 phone.refreshIce=async()=>({iceServers:[{urls:'turn:new.test'}]});await phone.refreshConfiguration();assert.equal(sets,1);assert.equal(phone.relayRefreshDeferred,true);
 phone.iceExpiresAt=Date.now()-1;await assert.rejects(phone.refreshConfiguration(),/Unsupported/);phone.close();
});
