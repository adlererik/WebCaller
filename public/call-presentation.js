// Presentation only: never change camera, encoder, network or encryption state.
export const CALL_CONTROLS_IDLE_MS=4000;
export const validOrientation=value=>value==='portrait'||value==='landscape';
export function viewOrientation(width=globalThis.innerWidth,height=globalThis.innerHeight,view=globalThis){
  const touch=view.navigator?.maxTouchPoints>0||view.matchMedia?.('(pointer:coarse)')?.matches;
  // Opening the chat keyboard must not pretend that an upright phone rotated.
  if(touch){
    const type=view.screen?.orientation?.type?.split('-')[0];if(validOrientation(type))return type;
    if(Number.isFinite(view.orientation))return Math.abs(view.orientation)%180===90?'landscape':'portrait';
  }
  return width>height?'landscape':'portrait';
}
export function squareCallView({width,height,localOrientation,remoteOrientation,remoteWidth=0,remoteHeight=0}){
  const remote=validOrientation(remoteOrientation)?remoteOrientation:remoteWidth>remoteHeight*1.08&&remoteHeight>0?'landscape':'portrait';
  const local=validOrientation(localOrientation)?localOrientation:width>height?'landscape':'portrait';
  return local==='landscape'||remote==='landscape';
}

export function callPresentation({screen,remote,local,view=globalThis,document=screen.ownerDocument,onOrientationChange=()=>{},schedule=setTimeout,cancel=clearTimeout}){
  let timer=null,eligible=false,remoteOrientation=null,orientation=viewOrientation(view.innerWidth,view.innerHeight,view),disposed=false;
  const listeners=[];
  function listen(target,type,handler,options){target?.addEventListener(type,handler,options);listeners.push(()=>target?.removeEventListener(type,handler,options));}
  const visible=()=>!screen.classList.contains('hidden')&&document.visibilityState!=='hidden';
  const active=()=>visible()&&screen.classList.contains('has-video')&&screen.classList.contains('call-connected');
  const controlsTarget=target=>target?.closest?.('button,a,input,select,textarea,[role="button"]');
  function clear(){if(timer!==null)cancel(timer);timer=null;}
  function held(){return !!document.querySelector('dialog[open]')||!!controlsTarget(document.activeElement)?.matches?.(':focus-visible');}
  function arm(){clear();if(active()&&!held())timer=schedule(hide,CALL_CONTROLS_IDLE_MS);}
  function reveal(){screen.classList.remove('controls-hidden');arm();}
  function hide(){clear();if(!active()||held())return;screen.classList.add('controls-hidden');}
  function layout(){
    if(disposed)return;
    const bounds=screen.getBoundingClientRect(),width=bounds.width||view.innerWidth,height=bounds.height||view.innerHeight;
    const next=viewOrientation(view.innerWidth,view.innerHeight,view);
    screen.classList.toggle('square-video',squareCallView({width,height,localOrientation:next,remoteOrientation,remoteWidth:remote.videoWidth,remoteHeight:remote.videoHeight}));
    if(next!==orientation){orientation=next;onOrientationChange(next);}
  }
  function update(){
    if(disposed)return;
    layout();const next=active();
    if(next!==eligible){eligible=next;reveal();}
    else if(!next){clear();screen.classList.remove('controls-hidden');}
  }
  // Focusing the screen can happen before click. Always reveal on a tap so
  // that focus does not make the first tap immediately hide controls again.
  listen(screen,'click',reveal);
  listen(screen,'pointermove',event=>{if(event.pointerType==='mouse')reveal();});
  listen(screen,'focusin',reveal);listen(screen,'focusout',arm);
  listen(screen,'keydown',event=>{if(event.target===screen&&['Enter',' '].includes(event.key)){event.preventDefault();reveal();}else reveal();});
  listen(view,'resize',()=>{layout();reveal();});
  listen(view.screen?.orientation,'change',()=>{layout();reveal();});
  listen(view,'orientationchange',()=>{layout();reveal();});
  listen(view.visualViewport,'resize',layout);
  listen(remote,'resize',layout);listen(remote,'loadedmetadata',layout);listen(local,'loadedmetadata',layout);
  listen(document,'close',()=>{if(visible())reveal();},true);
  listen(document,'visibilitychange',()=>{update();if(visible())reveal();});
  return {
    update,reveal,
    setRemoteOrientation(value){if(validOrientation(value)&&value!==remoteOrientation){remoteOrientation=value;layout();}},
    reset(value=null){clear();eligible=false;remoteOrientation=validOrientation(value)?value:null;screen.classList.remove('controls-hidden','square-video');update();},
    dispose(){disposed=true;clear();listeners.splice(0).forEach(remove=>remove());screen.classList.remove('controls-hidden','square-video');}
  };
}
