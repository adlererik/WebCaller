// Capture is separate from calling: these streams never replace a call's microphone.
export function chatCapture({busy,onFile,toast}){
  const $=id=>document.getElementById(id);
  let stream,recorder,parts=[],size=0,started=0,ticker,keep=false,facing='environment',generation=0;
  const release=()=>{stream?.getTracks().forEach(t=>t.stop());stream=null;$('camera-preview').srcObject=null;clearInterval(ticker);};
  function cancel(){generation++;keep=false;if(recorder?.state==='recording')recorder.stop();release();parts=[];size=0;}
  function close(){cancel();for(const id of ['camera-dialog','voice-dialog'])if($(id).open)$(id).close();}
  async function captureCamera(exact=false){
    const current=++generation;release();$('camera-shutter').disabled=true;$('camera-flip').disabled=true;
    try{
      const next=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:exact?{exact:facing}:{ideal:facing},width:{ideal:1600},height:{ideal:1200}}});
      if(current!==generation||!$('camera-dialog').open||busy()){next.getTracks().forEach(t=>t.stop());return;}
      stream=next;facing=next.getVideoTracks()[0].getSettings().facingMode||facing;$('camera-preview').srcObject=next;$('camera-preview').dataset.facing=facing;
      await $('camera-preview').play();$('camera-status').textContent='';$('camera-flip').ariaLabel=facing==='user'?'Switch to back camera':'Switch to front camera';
    }finally{if(current===generation){$('camera-shutter').disabled=!stream;$('camera-flip').disabled=false;}}
  }
  async function camera(){
    if(busy())return toast('Finish the call or file transfer first.');
    if(!navigator.mediaDevices?.getUserMedia)return $('camera-input').click();
    close();$('camera-dialog').showModal();facing='environment';$('camera-status').textContent='Opening camera…';
    try{await captureCamera();}catch(e){$('camera-status').textContent=e.name==='NotAllowedError'?'Allow camera access, or use Phone camera below.':e.message;}
  }
  $('camera-flip').onclick=async()=>{
    const old=facing;facing=old==='user'?'environment':'user';
    try{await captureCamera(true);}catch{facing=old;try{await captureCamera();$('camera-status').textContent='The other camera is unavailable.';}catch(e){$('camera-status').textContent=e.message;}}
  };
  $('camera-shutter').onclick=async()=>{
    const video=$('camera-preview');if(!stream||!video.videoWidth)return;
    const current=generation,canvas=document.createElement('canvas'),scale=Math.min(1,1600/video.videoWidth);
    canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);
    const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',.82));canvas.width=canvas.height=0;
    if(!blob||current!==generation)return;
    close();onFile(new File([blob],'photo.jpg',{type:'image/jpeg'}));
  };
  $('camera-library').onclick=()=>{close();$('camera-input').click();};
  function stopRecording(){if(recorder?.state==='recording'){keep=true;$('recording-stop').disabled=true;recorder.stop();}}
  async function voice(){
    if(busy())return toast('Finish the call or file transfer first.');
    if(!window.MediaRecorder||!navigator.mediaDevices?.getUserMedia)return toast('Voice recording is unavailable in this browser.');
    close();const current=++generation;$('voice-dialog').showModal();$('recording-status').textContent='Opening microphone…';$('recording-stop').disabled=true;
    try{
      const next=await navigator.mediaDevices.getUserMedia({video:false,audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
      if(current!==generation||!$('voice-dialog').open||busy()){next.getTracks().forEach(t=>t.stop());return;}
      stream=next;
      const mime=['audio/mp4','audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/webm'].find(t=>MediaRecorder.isTypeSupported(t));
      const active=new MediaRecorder(next,{...(mime?{mimeType:mime}:{}),audioBitsPerSecond:32000});recorder=active;parts=[];size=0;keep=false;started=Date.now();
      active.ondataavailable=e=>{if(current!==generation||!e.data.size)return;parts.push(e.data);size+=e.data.size;if(size>9*1024*1024)stopRecording();};
      active.onerror=()=>{close();toast('Recording failed. Please try again.');};
      active.onstop=()=>{
        if(current!==generation)return;
        const blob=keep&&parts.length?new Blob(parts,{type:active.mimeType||mime||'audio/webm'}):null;
        const extension=blob?.type.includes('mp4')?'m4a':blob?.type.includes('ogg')?'ogg':'webm';
        recorder=null;parts=[];release();$('voice-dialog').close();
        if(blob)onFile(new File([blob],`voice-message.${extension}`,{type:blob.type}));
      };
      const tick=()=>{const seconds=Math.floor((Date.now()-started)/1000);$('recording-time').textContent=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;if(seconds>=300)stopRecording();};
      tick();ticker=setInterval(tick,250);active.start(1000);$('recording-status').textContent='Recording…';$('recording-stop').disabled=false;
    }catch(e){close();toast(e.name==='NotAllowedError'?'Allow microphone access to record a voice message.':e.message);}
  }
  $('recording-stop').onclick=stopRecording;
  for(const id of ['camera-dialog','voice-dialog'])$(id).addEventListener('close',()=>{if(!$('camera-dialog').open&&!$('voice-dialog').open)cancel();});
  return {camera,voice,close};
}
