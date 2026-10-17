import {phonePlatform} from './call-setup.js';
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
export function ntfyEntry(hash){
  const p=new URLSearchParams(hash.replace(/^#/,'')),owner=p.get('receiver'),test=p.get('ntfy-test'),call=p.get('incoming-call');
  if(!uuid(owner)||!!test===!!call||!uuid(test||call))return null;
  return {owner,...(test?{testId:test}:{callId:call})};
}

export function ntfySetup({api,config,device,toast,entry}){
  const $=id=>document.getElementById(id),dialog=$('extra-ringing-dialog');let state,testId,busy=false,poll;
  const ios=()=>phonePlatform().ios;
  function text(title,body){$('extra-title').textContent=title;$('extra-text').textContent=body;$('extra-status').textContent='';}
  function reset(){clearTimeout(poll);for(const id of ['extra-connect','extra-instructions','extra-test','extra-confirm','extra-manual-confirm','extra-help','extra-disable'])$(id).classList.add('hidden');}
  function status(message){$('extra-status').textContent=message;}
  function installedSteps(){
    reset();text('Connect this phone',ios()?'Open ntfy, allow notifications, then tap +. Choose “Use another server” and copy the two details below.':'Tap Connect this phone. ntfy will add your incoming-call alerts. Allow notifications when asked.');
    $('extra-instructions').classList.remove('hidden');$('extra-server').value=state.server;$('extra-topic').value=state.topic;
    $('extra-manual').open=ios();$('extra-manual-title').textContent=ios()?'Copy these into ntfy':'Link did not open ntfy?';
    $('extra-android').classList.toggle('hidden',ios());$('extra-ios').classList.toggle('hidden',!ios());
    if(!ios())$('extra-link').href=state.link;
    $('extra-test').classList.remove('hidden');$('extra-disable').classList.remove('hidden');
    if(ios())status('Use your usual phone icon to answer if tapping an ntfy alert opens Safari. A new browser profile cannot access your existing phone.');
    else status('Keep ntfy’s instant delivery service running. You can choose a longer sound under ntfy → Settings → Notifications → Urgent.');
  }
  async function show(){
    reset();if(!dialog.open)dialog.showModal();
    if(!device()){text('Open your usual phone','Open the Home Screen phone icon or the browser where you accepted your invitation, then return to Settings → Extra ringing.');return;}
    text('Extra ringing','ntfy can make an extra sound when someone calls. Normal call alerts keep working too.');
    try{
      state=await api('/ntfy');if(!state.available){status('The server owner has not enabled extra ringing yet.');return;}
      if(ios()&&!state.iosInstant){status('Extra ringing on iPhone is not enabled on this server. Normal Home Screen call alerts still work.');return;}
      if(state.connected){if(state.pendingTest){testId=state.pendingTest.testId;waiting();return;}if(state.confirmed){reset();text('Extra ringing is ready','This phone passed the sound test. Keep ntfy notifications and sounds enabled. If an alert opens another browser, use your usual phone icon to answer.');$('extra-test').classList.remove('hidden');$('extra-disable').classList.remove('hidden');}else installedSteps();return;}
      const store=ios()?'https://apps.apple.com/app/ntfy/id1625396347':'https://play.google.com/store/apps/details?id=io.heckel.ntfy';
      $('extra-store').href=store;$('extra-connect').classList.remove('hidden');
      status('Install the free ntfy app once, then come back here and press “I have ntfy”. This is optional.');
    }catch(e){status(e.message);}
  }
  async function connect(){
    if(busy)return;busy=true;$('extra-have-app').disabled=true;
    try{state=await api('/ntfy','POST',{});installedSteps();}catch(e){status(e.message);}finally{busy=false;$('extra-have-app').disabled=false;}
  }
  async function test(){
    if(busy)return;busy=true;$('extra-test').disabled=true;
    try{
      const result=await api('/ntfy/test','POST',{});testId=result.testId;waiting();
    }catch(e){status(e.message);}finally{busy=false;$('extra-test').disabled=false;}
  }
  function waiting(){
    reset();text('Now lock your phone','Close this page and lock the phone. In about eight seconds, ntfy should make a sound. Tap its notification to return here. If it opens a different browser, open your usual phone icon.');
    $('extra-confirm').classList.remove('hidden');$('extra-confirm').disabled=true;$('extra-help').classList.remove('hidden');status('Only confirm after you actually hear the test.');void watch();
  }
  async function watch(){
    if(!dialog.open||!testId)return;
    try{const result=await api('/ntfy/test-status','POST',{testId});
      $('extra-confirm').disabled=!result.delivered||!result.opened;
      $('extra-manual-confirm').classList.toggle('hidden',!result.delivered||result.opened);
      if(result.sent&&!result.delivered)status('The alert server did not accept the test. Go back and try again.');
      else if(result.opened&&result.delivered)status('The alert opened this phone. Confirm below only if it also made a sound.');
      else if(result.sent)status('Tap the ntfy test notification. If it opens another browser, open your usual phone icon and choose “I heard it · use my phone icon”.');
      poll=setTimeout(watch,2500);
    }catch(e){status(e.message);}
  }
  async function confirm(usePhoneIcon=false){
    if(busy)return;busy=true;$('extra-confirm').disabled=true;
    try{await api('/ntfy/test-result','POST',{testId,heard:true,usePhoneIcon});testId=null;reset();text('Extra ringing is ready','Incoming calls will also send urgent ntfy alerts. Keep ntfy’s notifications and sound on. If an alert opens another browser, use your usual phone icon to answer.');$('extra-disable').classList.remove('hidden');toast('Extra ringing sound confirmed.');}
    catch(e){status(e.message);}finally{busy=false;}
  }
  async function resume(incoming=entry){
    if(!incoming){if(device()&&config()?.ntfyAvailable){try{state=await api('/ntfy');if(state.pendingTest){testId=state.pendingTest.testId;if(!dialog.open)dialog.showModal();waiting();}}catch{}}return;}entry=null;
    if(!device()||incoming.owner!==device().user.id){reset();text('Open your usual phone','This alert opened a different browser profile. Open your usual Home Screen phone icon or browser to answer. Your existing identity and conversations stay there.');if(!dialog.open)dialog.showModal();return;}
    if(incoming.testId){
      testId=incoming.testId;reset();if(!dialog.open)dialog.showModal();text('Did you hear it?','Only confirm if the ntfy test made a sound while your phone was locked.');
      try{await api('/ntfy/test-open','POST',{testId});$('extra-confirm').classList.remove('hidden');$('extra-help').classList.remove('hidden');await watch();}catch(e){status(e.message);}
    }else if(incoming.callId){
      // An external URL can only open the app. Never create an answer intent,
      // choose a caller identity, or request microphone permission from it.
      try{const call=await api('/calls/'+incoming.callId);if(!call.canAnswer)toast('This call is no longer waiting.');}catch{toast('Open your phone to check for an incoming call.');}
    }
  }
  $('extra-have-app').onclick=()=>void connect();$('extra-test').onclick=()=>void test();$('extra-confirm').onclick=()=>void confirm();$('extra-manual-confirm').onclick=()=>void confirm(true);
  $('extra-help').onclick=()=>{clearTimeout(poll);text('Check the sound','In ntfy and your phone’s Settings, allow notifications and sounds. On Android, enable instant delivery and allow background battery use. Silent mode, Focus and Do Not Disturb may mute alerts.');$('extra-test').classList.remove('hidden');$('extra-confirm').classList.add('hidden');$('extra-manual-confirm').classList.add('hidden');};
  $('extra-disable').onclick=async()=>{try{await api('/ntfy','DELETE');testId=null;await show();status('Disconnected. You can also remove “Incoming calls” in ntfy. Normal browser call alerts stay on.');}catch(e){status(e.message);}};
  for(const [button,input]of [['extra-copy-server','extra-server'],['extra-copy-topic','extra-topic']])$(button).onclick=async()=>{try{await navigator.clipboard.writeText($(input).value);status('Copied. Paste it into ntfy.');}catch{$(input).select();status('Select and copy this value, then paste into ntfy.');}};
  $('extra-close').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{clearTimeout(poll);$('extra-server').value='';$('extra-topic').value='';$('extra-link').removeAttribute('href');state=null;});
  return {show,resume,available:()=>!!config()?.ntfyAvailable};
}
