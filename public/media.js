// Bitrates are codec payload caps. IP/UDP/SRTP/TURN overhead is additional.
export const PROFILES = {
  wifi: { audio:48000, video:900000, width:960, height:540, fps:24, label:'Wi-Fi · clear voice' },
  saver: { audio:20000, video:120000, width:320, height:180, fps:12, label:'Data saver · mono voice' },
  weak: { audio:12000, video:45000, width:240, height:135, fps:6, label:'Weak connection · voice first' },
  critical: { audio:8000, video:0, width:160, height:90, fps:4, label:'Very weak · video paused' }
};
export function networkMode(preference='auto', connection=globalThis.navigator?.connection) {
  if (preference === 'wifi') return 'wifi';
  if (preference === 'saver' || connection?.saveData) return 'saver';
  return connection?.type === 'wifi' || connection?.type === 'ethernet' ? 'wifi' : 'saver';
}
export function chooseProfile(mode, stats, previous='saver', stable=0) {
  const { loss=0, rtt=0, jitter=0, bandwidth=Infinity } = stats;
  if (loss > .16 || rtt > 1.5 || jitter > .15 || bandwidth < 35000) return 'critical';
  if (loss > .06 || rtt > .65 || jitter > .06 || bandwidth < 85000) return 'weak';
  // Slow recovery prevents repeatedly starving audio on a marginal link.
  if (['critical','weak'].includes(previous) && stable < 5) return previous;
  return mode;
}
export function tuneOpus(sdp, bitrate=20000) {
  const payloads = [...sdp.matchAll(/^a=rtpmap:(\d+) opus\/48000(?:\/2)?\r?$/gm)].map(m=>m[1]);
  for (const pt of payloads) {
    const fmtp = new RegExp(`^a=fmtp:${pt} (.*)\\r?$`, 'm');
    const old = sdp.match(fmtp)?.[1] || '';
    const params = new Map(old.trim().split(';').filter(Boolean).map(p=>p.trim().split('=')));
    for (const [k,v] of Object.entries({ minptime:10, useinbandfec:1, usedtx:1, stereo:0, 'sprop-stereo':0, maxaveragebitrate:bitrate, maxplaybackrate:48000, 'sprop-maxcapturerate':48000 })) params.set(k,String(v));
    const line = `a=fmtp:${pt} ${[...params].map(([k,v])=>`${k}=${v}`).join(';')}`;
    sdp = fmtp.test(sdp) ? sdp.replace(fmtp,line+'\r') : sdp.replace(new RegExp(`(a=rtpmap:${pt} [^\\r\\n]+)`), `$1\r\n${line}`);
  }
  return sdp;
}
export class Phone {
  constructor({ signal, update, remote, local, ended, preference }) {
    Object.assign(this,{signal,update,remote,local,ended,preference});
    this.pc=null; this.stream=null; this.candidates=[]; this.localCandidates=[]; this.videoWanted=false; this.muted=false;
    this.profile=networkMode(preference()); this.stable=0; this.last=null; this.restartAt=0; this.applying=false;
    this.facingMode='user';this.cameraBusy=false;
  }
  async prepare(ice, video=false, caller=false) {
    this.caller=caller; this.videoWanted=video;
    this.pc=new RTCPeerConnection({ iceServers:ice.iceServers, iceTransportPolicy:ice.iceTransportPolicy||'all', bundlePolicy:'max-bundle', rtcpMuxPolicy:'require' });
    const pc=this.pc;
    const p=PROFILES[this.profile];
    const audio={ channelCount:{ideal:1}, sampleRate:{ideal:48000}, echoCancellation:true, noiseSuppression:true, autoGainControl:true };
    this.stream=await navigator.mediaDevices.getUserMedia({audio,video:video ? {width:{ideal:p.width},height:{ideal:p.height},frameRate:{ideal:p.fps},facingMode:'user'} : false});
    if(this.pc!==pc){this.stream.getTracks().forEach(t=>t.stop());this.stream=null;throw new Error('Call cancelled');}
    const audioTrack=this.stream.getAudioTracks()[0]; this.audioSender=this.pc.addTrack(audioTrack,this.stream);
    const codecs=RTCRtpSender.getCapabilities?.('audio')?.codecs?.filter(c=>c.mimeType.toLowerCase()==='audio/opus');
    if (codecs?.length) this.pc.getTransceivers().find(t=>t.sender===this.audioSender)?.setCodecPreferences?.(codecs);
    const track=this.stream.getVideoTracks()[0];
    if(track)this.facingMode=track.getSettings().facingMode||'user';
    if(track){
      this.videoSender=this.pc.addTrack(track,this.stream);
      this.videoTransceiver=this.pc.getTransceivers().find(t=>t.sender===this.videoSender);
    }else if(caller){
      this.videoTransceiver=this.pc.addTransceiver('video',{direction:'sendrecv'});
      this.videoSender=this.videoTransceiver.sender;
    }
    this.local.srcObject=this.stream;
    this.pc.onicecandidate=({candidate})=>{ if(candidate){this.localCandidates.push(candidate.toJSON()); void this.signal('ice',{candidate:candidate.toJSON()}).catch(()=>{});} };
    this.pc.ontrack=({track})=>{
      let stream=this.remote.srcObject; if(!stream) this.remote.srcObject=stream=new MediaStream();
      if(!stream.getTracks().some(t=>t.id===track.id)) stream.addTrack(track);
      this.remote.play().catch(()=>this.update({needsPlayback:true}));
      if(track.kind==='video'){
        const changed=()=>this.update({remoteVideo:!track.muted&&track.readyState==='live'});
        track.onmute=changed;track.onunmute=changed;track.onended=changed;changed();
      }
    };
    this.pc.onconnectionstatechange=()=>{
      const state=this.pc.connectionState; this.update({state});
      if(state==='connected'){clearTimeout(this.failTimer);this.update({connected:true});}
      if(state==='disconnected'||state==='failed'){
        this.restart();
        clearTimeout(this.failTimer);this.failTimer=setTimeout(()=>{if(this.pc&&this.pc.connectionState!=='connected')this.ended('Connection lost. Try calling again.');},45000);
      }
    };
    this.statsTimer=setInterval(()=>void this.sample(),3000);
    // Renew the caller's ICE generation so long calls actually use fresh TURN allocations.
    this.iceRefresh=setInterval(()=>void (this.caller?this.restart():this.refreshConfiguration()).catch(()=>this.update({warning:'Relay refresh failed'})),3600000);
    await this.applyProfile();
  }
  async description(type, restart=false) {
    if(restart)this.localCandidates=[];
    const desc=type==='offer' ? await this.pc.createOffer({iceRestart:restart}) : await this.pc.createAnswer();
    // Receive ceiling stays high on Wi-Fi; sender caps adapt independently below it.
    desc.sdp=tuneOpus(desc.sdp,networkMode(this.preference())==='wifi'?48000:20000);
    await this.pc.setLocalDescription(desc);
    return {type:desc.type,sdp:desc.sdp};
  }
  async receive(description) {
    const pc=this.pc;
    const prior=this.pc.remoteDescription?.sdp.match(/a=ice-ufrag:([^\r\n]+)/)?.[1];
    const incoming=description.sdp.match(/a=ice-ufrag:([^\r\n]+)/)?.[1];
    if(prior&&incoming&&prior!==incoming){
      this.localCandidates=[];
      await this.refreshConfiguration().catch(()=>this.update({warning:'Relay refresh failed'}));
      if(this.pc!==pc)throw new Error('Call cancelled');
    }
    await this.pc.setRemoteDescription(description);
    if(!this.videoSender){
      this.videoTransceiver=this.pc.getTransceivers().find(t=>t.receiver.track.kind==='video');
      if(this.videoTransceiver){this.videoTransceiver.direction='sendrecv';this.videoSender=this.videoTransceiver.sender;}
    }
    const ufrags=[...description.sdp.matchAll(/a=ice-ufrag:([^\r\n]+)/g)].map(m=>m[1]);
    for(const c of this.candidates.splice(0))if(!c.usernameFragment||ufrags.includes(c.usernameFragment))await this.pc.addIceCandidate(c);
    await this.applyProfile();
  }
  async candidate(candidate) {
    const description=this.pc?.remoteDescription;
    const matches=!candidate.usernameFragment||description?.sdp.includes('a=ice-ufrag:'+candidate.usernameFragment);
    if(!description||!matches){if(this.candidates.length<100)this.candidates.push(candidate);}
    else await this.pc.addIceCandidate(candidate);
  }
  async replayCandidates() { for(const candidate of this.localCandidates)await this.signal('ice',{candidate}); }
  async refreshConfiguration(){
    const pc=this.pc;if(!pc)return;
    const next=await this.refreshIce?.();
    if(this.pc===pc&&next)pc.setConfiguration({...pc.getConfiguration(),iceServers:next.iceServers});
  }
  async restart() {
    if(!this.pc||Date.now()-this.restartAt<12000)return;
    this.restartAt=Date.now();
    const pc=this.pc;
    try {
      await this.refreshConfiguration().catch(()=>this.update({warning:'Relay refresh failed'}));
      if(this.pc!==pc)return;
      if(this.caller)await this.signal('restart',{description:await this.description('offer',true)});
      else await this.signal('restart',{request:true});
    }catch{this.update({warning:'Waiting for signaling…'});}
  }
  async toggleVideo() {
    if(this.cameraBusy)throw new Error('The camera is switching. Try again shortly.');
    if(this.videoWanted){this.videoWanted=false;await this.videoSender.replaceTrack(null);this.stream.getVideoTracks().forEach(t=>{t.stop();this.stream.removeTrack(t);});}
    else{
      const pc=this.pc;
      const p=PROFILES[this.profile];
      const stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:p.width},height:{ideal:p.height},frameRate:{ideal:p.fps},facingMode:{ideal:this.facingMode}},audio:false});
      if(this.pc!==pc){stream.getTracks().forEach(t=>t.stop());throw new Error('Call cancelled');}
      const track=stream.getVideoTracks()[0];this.stream.addTrack(track);await this.videoSender.replaceTrack(track);this.videoWanted=true;
    }
    this.update({localVideo:this.videoWanted,cameraFacing:this.facingMode});
    await this.applyProfile();await this.signal('video',{enabled:this.videoWanted});return this.videoWanted;
  }
  async switchCamera(){
    if(!this.pc||!this.videoWanted||this.cameraBusy)throw new Error('Turn on the camera before switching.');
    this.cameraBusy=true;
    const pc=this.pc,old=this.stream.getVideoTracks()[0],settings=old?.getSettings()||{},prior=settings.facingMode||this.facingMode,next=prior==='environment'?'user':'environment',p=PROFILES[this.profile];
    let fresh;
    const capture=async camera=>{
      const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{width:{ideal:p.width},height:{ideal:p.height},frameRate:{ideal:p.fps},...camera}});
      if(this.pc!==pc){stream.getTracks().forEach(t=>t.stop());throw new Error('Call cancelled');}
      return stream.getVideoTracks()[0];
    };
    const install=async(track,facing)=>{
      try{
        await this.videoSender.replaceTrack(track);
        if(this.pc!==pc)throw new Error('Call cancelled');
        this.stream.addTrack(track);this.local.srcObject=this.stream;this.facingMode=track.getSettings().facingMode||facing;
        this.update({localVideo:true,cameraFacing:this.facingMode});await this.applyProfile();
      }catch(error){track.stop();if(this.stream?.getVideoTracks().includes(track))this.stream.removeTrack(track);throw error;}
    };
    // Some phones permit only one open camera. Release video; keep microphone alive.
    old?.stop();if(old)this.stream.removeTrack(old);
    try{
      fresh=await capture({facingMode:{exact:next}});
      if(settings.deviceId&&fresh.getSettings().deviceId===settings.deviceId)throw new Error('No other camera is available.');
      await install(fresh,next);return this.facingMode;
    }catch(error){
      fresh?.stop();if(fresh&&this.stream)this.stream.removeTrack(fresh);
      if(this.pc===pc){
        try{const restored=await capture(settings.deviceId?{deviceId:{exact:settings.deviceId}}:{facingMode:{ideal:prior}});await install(restored,prior);}
        catch{if(this.pc===pc){this.videoWanted=false;await this.videoSender.replaceTrack(null);this.update({localVideo:false});await this.signal('video',{enabled:false});}}
      }
      throw error;
    }finally{this.cameraBusy=false;}
  }
  mute(){this.muted=!this.muted;this.stream?.getAudioTracks().forEach(t=>t.enabled=!this.muted);return this.muted;}
  async setSender(sender,video,p){
    if(!sender)return;const params=sender.getParameters();if(!params.encodings?.length)return;
    Object.assign(params.encodings[0],{maxBitrate:video?Math.max(1000,p.video):p.audio,active:!video||(p.video>0&&this.videoWanted)});
    if(video){params.encodings[0].maxFramerate=p.fps;params.degradationPreference='maintain-framerate';}
    // Priority is an optional browser extension. Retry with core parameters.
    params.encodings[0].priority=video?'very-low':'high';params.encodings[0].networkPriority=video?'low':'high';
    try{await sender.setParameters(params);}catch{
      delete params.encodings[0].priority;delete params.encodings[0].networkPriority;
      try{await sender.setParameters(params);}catch{this.update({warning:'This browser controls its own media bitrate'});}
    }
  }
  async applyProfile(){
    if(this.applying||!this.pc)return;this.applying=true;
    try{
      const p=PROFILES[this.profile];
      await this.setSender(this.audioSender,false,p);await this.setSender(this.videoSender,true,p);
      const track=this.stream?.getVideoTracks()[0];
      if(track){track.enabled=p.video>0;await track.applyConstraints({width:{ideal:p.width},height:{ideal:p.height},frameRate:{max:p.fps}}).catch(()=>{});}
      this.update({profile:this.profile,label:p.label,videoPaused:this.videoWanted&&p.video===0,localVideo:this.videoWanted,cameraFacing:this.facingMode,audioSettings:this.stream?.getAudioTracks()[0]?.getSettings()});
    }finally{this.applying=false;}
  }
  async sample(){
    if(!this.pc||this.sampling)return;this.sampling=true;
    try{
      const report=await this.pc.getStats();let rtt=0,jitter=0,lost=0,received=0,bytes=0,bandwidth=Infinity,relay=false,outboundLoss=0;
      for(const s of report.values()){
        if(s.type==='inbound-rtp'&&s.kind==='audio'){lost=s.packetsLost||0;received=s.packetsReceived||0;jitter=s.jitter||0;}
        if(s.type==='remote-inbound-rtp'&&s.kind==='audio'){rtt=Math.max(rtt,s.roundTripTime||0);outboundLoss=Math.max(outboundLoss,s.fractionLost||0);jitter=Math.max(jitter,s.jitter||0);}
        if(s.type==='outbound-rtp'||s.type==='inbound-rtp')bytes+=(s.bytesSent||s.bytesReceived||0);
        if(s.type==='candidate-pair'&&s.state==='succeeded'&&(s.nominated||s.selected)){
          rtt=Math.max(rtt,s.currentRoundTripTime||0);bandwidth=s.availableOutgoingBitrate??Infinity;
          relay=report.get(s.localCandidateId)?.candidateType==='relay'||report.get(s.remoteCandidateId)?.candidateType==='relay';
        }
      }
      const dl=Math.max(0,lost-(this.last?.lost||0)),dr=Math.max(0,received-(this.last?.received||0));
      const loss=Math.max(outboundLoss,dl+dr?dl/(dl+dr):0);
      const stats={loss,rtt,jitter,bandwidth,relay,kbps:this.last?Math.max(0,(bytes-this.last.bytes)*8/(Date.now()-this.last.time)):0};
      this.last={lost,received,bytes,time:Date.now()};
      if(loss<.03&&rtt<.5&&jitter<.04&&bandwidth>100000)this.stable++;else this.stable=0;
      const next=chooseProfile(networkMode(this.preference()),stats,this.profile,this.stable);
      if(next!==this.profile){this.profile=next;await this.applyProfile();}
      this.update({stats});
    }catch{}finally{this.sampling=false;}
  }
  close(){
    clearInterval(this.statsTimer);clearInterval(this.iceRefresh);clearTimeout(this.failTimer);
    this.pc?.close();this.pc=null;this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;
    this.remote.srcObject=null;this.local.srcObject=null;
  }
}
export async function testRelay(ice){
  if(!ice.turn)return {ok:false,text:'No TURN relay configured. Direct calls may fail across networks.'};
  const pc=new RTCPeerConnection({iceServers:ice.iceServers,iceTransportPolicy:'relay'});pc.createDataChannel('diagnostic');
  try{
    return await new Promise(async(resolve,reject)=>{
      const timer=setTimeout(()=>resolve({ok:false,text:'No relay candidate within 15 seconds. Check TURN credentials, DNS and firewall.'}),15000);
      pc.onicecandidate=e=>{if(e.candidate?.type==='relay'){clearTimeout(timer);resolve({ok:true,text:'TURN allocation succeeded. Test a call across two different networks to verify media.'});}};
      try{await pc.setLocalDescription(await pc.createOffer());}catch(e){clearTimeout(timer);reject(e);}
    });
  }finally{pc.close();}
}
