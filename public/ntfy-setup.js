import {phonePlatform} from './call-setup.js';
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
export function ntfyEntry(hash){
  const p=new URLSearchParams(hash.replace(/^#/,'')),owner=p.get('receiver'),test=p.get('ntfy-test'),call=p.get('incoming-call');
  if(!uuid(owner)||!!test===!!call||!uuid(test||call))return null;
  return {owner,...(test?{testId:test}:{callId:call})};
}

export function ntfySetup({api,config,device,toast,entry,openCall=async()=>{}}){
  const $=id=>document.getElementById(id),dialog=$('extra-ringing-dialog');let state,testId,busy=false,poll;
  const ios=()=>phonePlatform().ios;
  function text(title,body){$('extra-title').textContent=title;$('extra-text').textContent=body;$('extra-status').textContent='';}
  function reset(){clearTimeout(poll);for(const id of ['extra-connect','extra-instructions','extra-test','extra-confirm','extra-manual-confirm','extra-help','extra-disable','extra-use-browser','extra-use-ntfy'])$(id)?.classList.add('hidden');}
  function status(message){$('extra-status').textContent=message;}
  function ready(){
    reset();const ntfy=state.preferred!==false;
    text(ntfy?'ntfy call alerts are on':'Browser call alerts are on',ntfy?
      'This phone passed the sound test. Calls use ntfy to avoid duplicate browser alerts. If the alert server cannot be reached, browser alerts are the backup. Keep ntfy notifications and sounds enabled.':
      'Calls use your browser notifications. Your ntfy connection is saved, so you can switch back without setting it up again.');
    $('extra-test').classList.remove('hidden');$('extra-disable').classList.remove('hidden');
    $(ntfy?'extra-use-browser':'extra-use-ntfy')?.classList.remove('hidden');
    if(ntfy)status('Tap Open call in the notification, then Answer. If it opens another browser, use your usual phone icon.');
  }
  async function preference(useNtfy){
    if(busy)return;busy=true;
    for(const id of ['extra-use-browser','extra-use-ntfy'])if($(id))$(id).disabled=true;
    try{state=await api('/ntfy/preference','POST',{useNtfy});ready();toast(useNtfy?'ntfy call alerts are on.':'Browser call alerts are on.');}
    catch(e){status(e.message);}finally{busy=false;for(const id of ['extra-use-browser','extra-use-ntfy'])if($(id))$(id).disabled=false;}
  }
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
    text('Call alerts with ntfy','You can use ntfy for incoming-call alerts. After the sound test, this phone uses ntfy with browser alerts as a backup when the alert server cannot be reached.');
    try{
      state=await api('/ntfy');if(!state.available){status('The server owner has not enabled extra ringing yet.');return;}
      if(ios()&&!state.iosInstant){status('Extra ringing on iPhone is not enabled on this server. Normal Home Screen call alerts still work.');return;}
      if(state.connected){if(state.pendingTest){testId=state.pendingTest.testId;waiting();return;}if(state.confirmed)ready();else installedSteps();return;}
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
    try{await api('/ntfy/test-result','POST',{testId,heard:true,usePhoneIcon});testId=null;state={...state,confirmed:true,preferred:true};ready();toast('ntfy sound confirmed. Calls will use ntfy alerts.');}
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
      try{
        const call=await api('/calls/'+incoming.callId+'?offer=1');
        if(call.state!=='ringing'||!call.canAnswer||!Number.isSafeInteger(call.expiresAt)||call.expiresAt<=Date.now()){toast('This call is no longer waiting.');return;}
        if(call.offer?.callId!==incoming.callId||call.offer.kind!=='offer')throw new Error('Call offer unavailable');
        await openCall(call.offer);if(dialog.open)dialog.close();
      }catch{toast('Open your usual phone to check for an incoming call.');}
    }
  }
  $('extra-have-app').onclick=()=>void connect();$('extra-test').onclick=()=>void test();$('extra-confirm').onclick=()=>void confirm();$('extra-manual-confirm').onclick=()=>void confirm(true);
  $('extra-use-browser')?.addEventListener('click',()=>void preference(false));$('extra-use-ntfy')?.addEventListener('click',()=>void preference(true));
  $('extra-help').onclick=()=>{clearTimeout(poll);text('Check the sound','In ntfy and your phone’s Settings, allow notifications and sounds. On Android, enable instant delivery and allow background battery use. Silent mode, Focus and Do Not Disturb may mute alerts.');$('extra-test').classList.remove('hidden');$('extra-confirm').classList.add('hidden');$('extra-manual-confirm').classList.add('hidden');};
  $('extra-disable').onclick=async()=>{try{await api('/ntfy','DELETE');testId=null;await show();status('Disconnected. You can also remove “Incoming calls” in ntfy. Normal browser call alerts stay on.');}catch(e){status(e.message);}};
  for(const [button,input]of [['extra-copy-server','extra-server'],['extra-copy-topic','extra-topic']])$(button).onclick=async()=>{try{await navigator.clipboard.writeText($(input).value);status('Copied. Paste it into ntfy.');}catch{$(input).select();status('Select and copy this value, then paste into ntfy.');}};
  $('extra-close').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{clearTimeout(poll);$('extra-server').value='';$('extra-topic').value='';$('extra-link').removeAttribute('href');state=null;});
  return {show,resume,available:()=>!!config()?.ntfyAvailable};
}
