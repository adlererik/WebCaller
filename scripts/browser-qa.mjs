// A local-only, isolated test harness. No phone account, mic, or camera access.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {createHmac} from 'node:crypto';
const html=`<!doctype html><html><meta charset="utf-8"><title>WebCaller media QA</title><body><h1>Real WebRTC media test</h1><label>Media path <select id="transport"><option value="direct">Direct</option><option value="udp">TURN UDP</option><option value="tcp">TURN TCP</option><option value="tls">TURN TLS</option></select></label><button id="run">Run synthetic duplex test</button><pre id="result">Ready. Synthetic audio and video only.</pre><video id="ar" autoplay muted playsinline></video><video id="al" autoplay muted playsinline></video><video id="br" autoplay muted playsinline></video><video id="bl" autoplay muted playsinline></video><script type="module">
import {Phone} from './media.js';
const out=document.querySelector('#result');
document.querySelector('#run').onclick=async()=>{
 let a,b,ctx;const drawTimers=[];
 try {
  document.querySelector('#run').disabled=true;out.textContent='Running…';
  const transport=document.querySelector('#transport').value;
  const response=await fetch('/ice?transport='+transport);if(!response.ok)throw new Error(await response.text());const ice=await response.json();
  ctx=new AudioContext();await ctx.resume();
  const makeStream=async({video})=>{const tone=ctx.createOscillator();tone.frequency.value=440;const sink=ctx.createMediaStreamDestination();tone.connect(sink);tone.start();if(video){const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;const c=canvas.getContext('2d');c.fillStyle='#3478f6';c.fillRect(0,0,320,180);const stream=canvas.captureStream(12);sink.stream.addTrack(stream.getVideoTracks()[0]);drawTimers.push(setInterval(()=>{c.fillStyle='hsl('+Date.now()%360+',70%,50%)';c.fillRect(0,0,320,180);},100));}return sink.stream;};
  navigator.mediaDevices.getUserMedia=makeStream;
  let mode='saver';const statuses={};
  const dispatch=(other,self)=>async(kind,p)=>{if(kind==='ice')await other().candidate(p.candidate);if(kind==='restart'&&p.description){await other().receive(p.description);await self().receive(await other().description('answer'));}};
  const options=(label)=>({update:s=>{statuses[label]={...statuses[label],...s};},remote:document.querySelector('#'+label+'r'),local:document.querySelector('#'+label+'l'),ended:()=>{},preference:()=>mode});
  a=new Phone({...options('a'),signal:dispatch(()=>b,()=>a)});b=new Phone({...options('b'),signal:dispatch(()=>a,()=>b)});
  await a.prepare(ice,true,true);await b.prepare(ice,true,false);
  const offer=await a.description('offer');await b.receive(offer);const answer=await b.description('answer');await a.receive(answer);
  for(let i=0;i<150;i++){if(a.pc.connectionState==='connected'&&b.pc.connectionState==='connected')break;await new Promise(r=>setTimeout(r,100));}
  if(a.pc.connectionState!=='connected'||b.pc.connectionState!=='connected')throw new Error('Peers did not connect: '+JSON.stringify({statuses,states:[a.pc.connectionState,b.pc.connectionState],candidates:[a.localCandidates,b.localCandidates].map(list=>list.map(c=>({type:c.candidate.split(' typ ')[1]?.split(' ')[0]})))}));
  await new Promise(r=>setTimeout(r,3000));
  const counts=async pc=>{let audio=0,video=0;for(const s of (await pc.getStats()).values())if(s.type==='inbound-rtp'){if(s.kind==='audio')audio+=s.packetsReceived||0;if(s.kind==='video')video+=s.packetsReceived||0;}return {audio,video};};
  const path=async pc=>{const stats=await pc.getStats();for(const s of stats.values())if(s.type==='candidate-pair'&&s.state==='succeeded'&&s.nominated){const local=stats.get(s.localCandidateId),remote=stats.get(s.remoteCandidateId);return {local:local?.candidateType,remote:remote?.candidateType,relayProtocol:local?.relayProtocol};}return {};};
  const paths=[await path(a.pc),await path(b.pc)];if(transport!=='direct'&&paths.some(p=>p.local!=='relay'||p.remote!=='relay'))throw new Error('Relay-only path was not selected: '+JSON.stringify(paths));
  const first=[await counts(a.pc),await counts(b.pc)];if(first.some(s=>s.audio<1||s.video<1))throw new Error('Missing duplex audio/video RTP: '+JSON.stringify({first,statuses,a:[...await a.pc.getStats()].map(x=>x[1]).filter(s=>s.type.includes('rtp')),b:[...await b.pc.getStats()].map(x=>x[1]).filter(s=>s.type.includes('rtp'))}));
  a.profile='critical';await a.applyProfile();if(a.videoSender.getParameters().encodings[0].active!==false)throw new Error('Video did not pause');if(!a.stream.getAudioTracks()[0].enabled)throw new Error('Audio paused with video');
  await a.toggleVideo();await a.toggleVideo();a.profile='saver';await a.applyProfile();await new Promise(r=>setTimeout(r,1000));
  const last=[await counts(a.pc),await counts(b.pc)];
  const opus=a.pc.localDescription.sdp.includes('usedtx=1')&&a.pc.localDescription.sdp.includes('useinbandfec=1');a.close();b.close();
  a=new Phone({...options('a'),signal:dispatch(()=>b,()=>a)});b=new Phone({...options('b'),signal:dispatch(()=>a,()=>b)});
  await a.prepare(ice,false,true);await b.prepare(ice,false,false);
  await b.receive(await a.description('offer'));await a.receive(await b.description('answer'));
  await a.toggleVideo();await b.toggleVideo();await new Promise(r=>setTimeout(r,3000));
  const upgraded=[await counts(a.pc),await counts(b.pc)];if(upgraded.some(s=>s.audio<1||s.video<1))throw new Error('Audio call upgrade to video failed: '+JSON.stringify({upgraded,statuses,profiles:[a.profile,b.profile]}));
  let refreshes=0;a.refreshIce=b.refreshIce=async()=>{refreshes++;const response=await fetch('/ice?transport='+transport);if(!response.ok)throw new Error('Relay refresh failed');return response.json();};
  await a.restart();await new Promise(r=>setTimeout(r,1000));
  if(a.pc.connectionState!=='connected'||b.pc.connectionState!=='connected')throw new Error('ICE restart failed');
  if(refreshes<2)throw new Error('Both peers did not refresh the relay on restart');
  out.textContent=JSON.stringify({passed:true,transport,paths,duplexRtp:first,afterCameraToggle:last,voiceCallUpgradedToVideo:upgraded,iceRestart:true,freshRelayCredentialsOnRestart:true,criticalVideoPaused:true,audioContinues:true,opus},null,2);
 }catch(e){out.textContent='FAIL: '+e.stack;}finally{a?.close();b?.close();drawTimers.forEach(clearInterval);ctx?.close();document.querySelector('#run').disabled=false;}
};</script></body></html>`;
const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.url.startsWith('/ice?')){
    const transport=new URL(req.url,'http://localhost').searchParams.get('transport');
    res.setHeader('Content-Type','application/json');
    if(transport==='direct')return res.end(JSON.stringify({iceServers:[]}));
    const urls=(process.env.TURN_URLS||'').split(',').filter(url=>transport==='tls'?url.startsWith('turns:'):url.startsWith('turn:')&&url.endsWith('transport='+transport));
    if(!process.env.TURN_SECRET||!urls.length){res.statusCode=400;return res.end('Requested relay is not configured for this local QA server');}
    const username=Math.floor(Date.now()/1000)+300+':qa';
    return res.end(JSON.stringify({iceTransportPolicy:'relay',iceServers:[{urls,username,credential:createHmac('sha1',process.env.TURN_SECRET).update(username).digest('base64')}]}));
  }
  if(req.url==='/media.js'){res.setHeader('Content-Type','text/javascript');return res.end(await readFile(new URL('../public/media.js',import.meta.url)));}
  res.setHeader('Content-Type','text/html');res.end(html);
});
server.listen(Number(process.env.QA_PORT)||8090,'127.0.0.1',()=>console.log('Local synthetic media QA is ready on loopback.'));
