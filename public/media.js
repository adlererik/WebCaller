import {measureCall} from './call-metrics.js';
import {codecKey,probeVideoCodecs,preferVideoCodecs} from './video-codecs.js';
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
export function mediaBudget(profile,stats={},cpuLimited=false,sharing=false){
  const p={...PROFILES[profile]};
  if(Number.isFinite(stats.bandwidth)){
    // Reserve voice and headroom before assigning anything to video.
    p.audio=Math.max(6000,Math.min(p.audio,Math.floor(stats.bandwidth*.45)));
    p.video=Math.min(p.video,Math.max(0,Math.floor(stats.bandwidth*.65-p.audio*1.5-8000)));
    if(p.video<25000)p.video=0;
  }
  if(sharing){p.video=Math.min(p.video,profile==='wifi'?180000:45000);p.width=Math.min(p.width,320);p.height=Math.min(p.height,180);p.fps=Math.min(p.fps,10);}
  if(p.video>0&&p.video<90000){p.width=240;p.height=135;p.fps=6;}
  else if(p.video>0&&p.video<300000){p.width=320;p.height=180;p.fps=12;}
  if(sharing)p.fps=Math.min(p.fps,10);
  if(cpuLimited){p.fps=Math.min(p.fps,12);p.width=Math.min(p.width,640);p.height=Math.min(p.height,360);p.video=Math.min(p.video,350000);}
  return p;
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
    this.facingMode='user';this.cameraBusy=false;this.trafficSamples=new Map();this.stats=null;this.codecSummary=[];this.avoidCodecs=new Set();this.restartPending=false;this.restartBusy=false;this.cpuSamples=0;this.sharing=false;this.remoteSharingUntil=0;
  }
  localMode(){return networkMode(this.preference());}
  mode(){return this.localMode()==='wifi'&&this.remoteMode==='wifi'?'wifi':'saver';}
  setRemoteMode(mode){
    if(!['wifi','saver'].includes(mode))return;
    this.remoteMode=mode;this.profile=chooseProfile(this.mode(),this.stats||{},this.profile,this.stable);void this.applyProfile();
  }
  setSharing(active){this.sharing=active===true;return this.applyProfile();}
  setRemoteSharing(active){this.remoteSharingUntil=active===true?Date.now()+30000:0;return this.applyProfile();}
  get isSharing(){return this.sharing||this.remoteSharingUntil>Date.now();}
  async prepare(ice, video=false, caller=false) {
    this.caller=caller; this.videoWanted=video;this.profile=this.mode();
    this.videoCodecs=globalThis.RTCRtpSender?.getCapabilities?.('video')?.codecs||[];
    this.codecSummary=await probeVideoCodecs(this.videoCodecs);
    if(this.closed)throw new Error('Call cancelled');
    this.pc=new RTCPeerConnection({ iceServers:ice.iceServers, iceTransportPolicy:ice.iceTransportPolicy||'all', bundlePolicy:'max-bundle', rtcpMuxPolicy:'require' });
    const pc=this.pc;
    this.iceServers=ice.iceServers;this.iceExpiresAt=ice.expiresAt||Date.now()+7200000;
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
    this.setVideoPreferences();
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
      if(state==='connected'){clearTimeout(this.failTimer);this.failTimer=null;this.update({connected:true});}
      if(state==='disconnected'||state==='failed'){
        void this.restart();
        if(!this.failTimer)this.failTimer=setTimeout(()=>{if(this.pc&&this.pc.connectionState!=='connected')this.ended('Connection lost. Try calling again.');},180000);
      }
    };
    this.statsTimer=setInterval(()=>void this.sample(),1000);
    // Renew the caller's ICE generation so long calls actually use fresh TURN allocations.
    this.iceRefresh=setInterval(()=>void (this.caller?this.restart():this.refreshConfiguration()).catch(()=>this.update({warning:'Relay refresh failed'})),3600000);
    await this.applyProfile();
  }
  setVideoPreferences(remote){
    if(remote!==undefined)this.remoteCodecs=Array.isArray(remote)?remote:undefined;
    const ordered=preferVideoCodecs(this.videoCodecs||[],this.codecSummary,this.remoteCodecs,this.avoidCodecs),key=ordered[0]?codecKey(ordered[0]):'';
    const changed=!!this.preferredCodec&&this.preferredCodec!==key;this.preferredCodec=key;
    try{if(ordered.length)this.videoTransceiver?.setCodecPreferences?.(ordered);}catch{try{this.videoTransceiver?.setCodecPreferences?.([]);}catch{}}
    return changed;
  }
  async description(type, restart=false) {
    this.appliedBudget=null;
    if(restart)this.localCandidates=[];
    const desc=type==='offer' ? await this.pc.createOffer({iceRestart:restart}) : await this.pc.createAnswer();
    // The ceiling allows later Wi-Fi upgrades. Actual sender limits remain dynamic.
    desc.sdp=tuneOpus(desc.sdp,48000);
    await this.pc.setLocalDescription(desc);
    return {type:desc.type,sdp:desc.sdp};
  }
  async receive(description) {
    const pc=this.pc;
    if(description.type==='answer'&&pc.signalingState==='stable'&&pc.remoteDescription?.sdp===description.sdp)return;
    const prior=this.pc.remoteDescription?.sdp.match(/a=ice-ufrag:([^\r\n]+)/)?.[1];
    const incoming=description.sdp.match(/a=ice-ufrag:([^\r\n]+)/)?.[1];
    if(prior&&incoming&&prior!==incoming){
      this.localCandidates=[];
      await this.refreshConfiguration().catch(()=>this.update({warning:'Relay refresh failed'}));
      if(this.pc!==pc)throw new Error('Call cancelled');
    }
    await this.pc.setRemoteDescription(description);
    this.appliedBudget=null;
    if(!this.videoSender){
      this.videoTransceiver=this.pc.getTransceivers().find(t=>t.receiver.track.kind==='video');
      if(this.videoTransceiver){this.videoTransceiver.direction='sendrecv';this.videoSender=this.videoTransceiver.sender;}
    }
    this.setVideoPreferences();
    const ufrags=[...description.sdp.matchAll(/a=ice-ufrag:([^\r\n]+)/g)].map(m=>m[1]);
    for(const c of this.candidates.splice(0))if(!c.usernameFragment||ufrags.includes(c.usernameFragment))await this.pc.addIceCandidate(c);
    await this.applyProfile();
    if(description.type==='answer'&&this.restartPending)void this.restart();
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
    if(this.pc===pc&&next){
      if(JSON.stringify(next.iceServers)===JSON.stringify(this.iceServers))return;
      try{
        // Preserve immutable certificates and transport policies when replacing ICE.
        pc.setConfiguration({...pc.getConfiguration(),iceServers:next.iceServers});
        this.iceServers=next.iceServers;this.iceExpiresAt=next.expiresAt||Date.now()+7200000;this.relayRefreshDeferred=false;this.update({warning:''});
      }catch(error){
        // Some embedded browsers reject even ordinary configuration updates.
        // Their still-valid credentials can gather a new ICE generation normally.
        if(this.iceExpiresAt>Date.now()+60000){this.relayRefreshDeferred=true;return;}
        throw error;
      }
    }
  }
  queueRestart(delay=2000){
    if(!this.pc||this.restartTimer)return;
    this.restartTimer=setTimeout(()=>{this.restartTimer=null;if(this.pc&&(this.restartPending||['disconnected','failed'].includes(this.pc.connectionState)||this.pc.signalingState==='have-local-offer'))void this.restart();},delay);
  }
  async networkChanged(){
    if(!this.pc)return;
    this.stable=0;this.profile=chooseProfile(this.mode(),this.stats||{},this.profile,0);this.stats=null;this.last=null;this.trafficSamples.clear();
    await this.applyProfile();await this.signal('video',{enabled:this.videoWanted,mode:this.localMode()}).catch(()=>{});await this.restart();
  }
  async restart() {
    if(!this.pc)return;
    this.restartPending=true;
    const wait=6000-(Date.now()-this.restartAt);
    if(this.caller&&this.pc.signalingState==='have-local-offer'&&wait<=0&&!this.restartBusy){
      this.restartAt=Date.now();this.restartBusy=true;
      const pc=this.pc;
      try{await this.signal('restart',{description:{type:pc.localDescription.type,sdp:pc.localDescription.sdp},codecs:this.codecSummary,mode:this.localMode()});await this.replayCandidates();}
      catch{this.update({warning:'Waiting for signaling…'});}
      finally{this.restartBusy=false;if(this.pc===pc)this.queueRestart(6500);}return;
    }
    if(this.restartBusy||this.pc.signalingState&&this.pc.signalingState!=='stable'||wait>0){this.queueRestart(Math.max(1000,wait));return;}
    this.restartAt=Date.now();this.restartBusy=true;this.restartPending=false;
    const pc=this.pc;
    try {
      await this.refreshConfiguration().catch(()=>this.update({warning:'Relay refresh failed'}));
      if(this.pc!==pc)return;
      // Only the original caller offers; this avoids glare during simultaneous handovers.
      if(this.caller)await this.signal('restart',{description:await this.description('offer',true),codecs:this.codecSummary,mode:this.localMode()});
      else await this.signal('restart',{request:true});
    }catch{
      this.restartPending=true;
      // A failed signaling send must not leave an unsent local offer blocking retries.
      if(this.pc===pc&&pc.signalingState==='have-local-offer')await pc.setLocalDescription({type:'rollback'}).catch(()=>{});
      this.update({warning:'Waiting for signaling…'});
    }finally{
      this.restartBusy=false;
      if(this.pc===pc&&(this.restartPending||['disconnected','failed'].includes(pc.connectionState)||pc.signalingState==='have-local-offer'))this.queueRestart(6500);
    }
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
    await this.applyProfile();await this.signal('video',{enabled:this.videoWanted,mode:this.localMode()});return this.videoWanted;
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
    if(video){params.encodings[0].maxFramerate=p.fps;params.degradationPreference='balanced';}
    // Priority is an optional browser extension. Retry with core parameters.
    params.encodings[0].priority=video?'very-low':'high';params.encodings[0].networkPriority=video?'low':'high';
    try{await sender.setParameters(params);}catch{
      delete params.encodings[0].priority;delete params.encodings[0].networkPriority;
      try{await sender.setParameters(params);}catch{this.update({warning:'This browser controls its own media bitrate'});}
    }
  }
  applyProfile(){
    this.profileDirty=true;if(!this.pc)return Promise.resolve();if(this.profileTask)return this.profileTask;this.applying=true;
    this.profileTask=Promise.resolve().then(async()=>{
      while(this.profileDirty&&this.pc){
        this.profileDirty=false;const pc=this.pc,p=mediaBudget(this.profile,this.stats||{},this.cpuSamples>=3,this.isSharing);this.budget=p;
        const signature=JSON.stringify([p.audio,Math.floor(p.video/1000)*1000,p.width,p.height,p.fps,p.label,this.isSharing,this.videoWanted,this.stream?.getVideoTracks()[0]?.id,this.audioSender?.getParameters?.().encodings?.length,this.videoSender?.getParameters?.().encodings?.length]);
        if(signature===this.appliedBudget)continue;this.appliedBudget=signature;
        await this.setSender(this.audioSender,false,p);if(this.pc!==pc)return;await this.setSender(this.videoSender,true,p);
        const track=this.stream?.getVideoTracks()[0];
        if(track){track.enabled=p.video>0;await track.applyConstraints({width:{ideal:p.width,max:p.width},height:{ideal:p.height,max:p.height},frameRate:{max:p.fps}}).catch(()=>{});}
        this.update({profile:this.profile,label:p.label,sharing:this.isSharing,videoPaused:this.videoWanted&&p.video===0,localVideo:this.videoWanted,cameraFacing:this.facingMode,audioSettings:this.stream?.getAudioTracks()[0]?.getSettings()});
      }
    }).finally(()=>{this.applying=false;this.profileTask=null;});return this.profileTask;
  }
  async sample(){
    if(!this.pc||this.sampling)return;this.sampling=true;
    try{
      const pc=this.pc,report=await pc.getStats();if(this.pc!==pc)return;let rtt=0,jitter=0,lost=0,received=0,bandwidth=Infinity,relay=false,outboundLoss=0,remoteLost=0,sent=0;
      const selectedPairs=new Set([...report.values()].filter(s=>s.type==='transport').map(s=>s.selectedCandidatePairId).filter(Boolean));
      for(const s of report.values()){
        if(s.type==='inbound-rtp'&&(s.kind||s.mediaType)==='audio'){lost=s.packetsLost||0;received=s.packetsReceived||0;jitter=s.jitter||0;}
        if(s.type==='outbound-rtp'&&(s.kind||s.mediaType)==='audio')sent+=s.packetsSent||0;
        if(s.type==='remote-inbound-rtp'&&(s.kind||s.mediaType)==='audio'){remoteLost+=s.packetsLost||0;rtt=Math.max(rtt,s.roundTripTime||0);outboundLoss=Math.max(outboundLoss,s.fractionLost||0);jitter=Math.max(jitter,s.jitter||0);}
        if(s.type==='candidate-pair'&&s.state==='succeeded'&&(selectedPairs.size?selectedPairs.has(s.id):s.nominated||s.selected)){
          rtt=Math.max(rtt,s.currentRoundTripTime||0);bandwidth=s.availableOutgoingBitrate??Infinity;
          relay=report.get(s.localCandidateId)?.candidateType==='relay'||report.get(s.remoteCandidateId)?.candidateType==='relay';
        }
      }
      const dl=Math.max(0,lost-(this.last?.lost||0)),dr=Math.max(0,received-(this.last?.received||0));
      const sentDelta=Math.max(0,sent-(this.last?.sent||0)),remoteLossDelta=Math.max(0,remoteLost-(this.last?.remoteLost||0));
      const loss=Math.max(outboundLoss,sentDelta?Math.min(1,remoteLossDelta/sentDelta):0,dl+dr?dl/(dl+dr):0);
      const {samples,...traffic}=measureCall(report,this.trafficSamples);this.trafficSamples=samples;
      const stats={loss,rtt,jitter,bandwidth,relay,...traffic};this.stats=stats;
      const limited=[...report.values()].find(s=>s.type==='outbound-rtp'&&s.kind==='video'&&s.qualityLimitationReason==='cpu');
      this.cpuSamples=limited?this.cpuSamples+1:0;
      if(this.cpuSamples===10){
        const codec=report.get(limited.codecId),current=(this.videoCodecs||[]).find(c=>c.mimeType.toLowerCase()===codec?.mimeType?.toLowerCase()&&(c.sdpFmtpLine||'')===(codec?.sdpFmtpLine||''));
        const alternatives=this.codecSummary.filter(c=>c.encode&&c.decode&&this.remoteCodecs?.some(r=>r.key===c.key&&r.encode&&r.decode));
        if(current&&alternatives.some(c=>c.key!==codecKey(current))){this.avoidCodecs.add(codecKey(current));this.setVideoPreferences();void this.restart();}
      }
      this.last={lost,received,sent,remoteLost};
      if(loss<.03&&rtt<.5&&jitter<.04&&bandwidth>100000)this.stable++;else this.stable=0;
      const next=chooseProfile(this.mode(),stats,this.profile,this.stable);
      this.profile=next;await this.applyProfile();
      this.update({stats});
    }catch{}finally{this.sampling=false;}
  }
  close(){
    clearInterval(this.statsTimer);clearInterval(this.iceRefresh);clearTimeout(this.failTimer);clearTimeout(this.restartTimer);this.closed=true;
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
