// Mobile keyboards resize the visual viewport, not always the layout viewport.
// Keep its offset/height out of document flow so focus cannot strand a scrolled
// header. No touch interception: scrolling messages, dialogs and zoom still work.
export function appViewport({window:win,document:doc}) {
  const viewport=win.visualViewport,style=doc.documentElement.style;
  let frame=null,disposed=false,keyboardWasOpen=false;const timers=new Set(),listeners=[];
  const unzoomed=()=>!viewport||Math.abs(viewport.scale-1)<0.01;
  const editing=()=>!!doc.activeElement?.matches('textarea,input:not([type=button]):not([type=submit]):not([type=checkbox]):not([type=radio]),[contenteditable="true"]');
  const keyboardOpen=()=>!!viewport&&editing()&&Math.max(doc.documentElement.clientHeight||0,win.innerHeight||0)-viewport.height>100;
  function restoreRoot() {
    if(win.scrollX||win.scrollY)win.scrollTo({left:0,top:0,behavior:'instant'});
  }
  function update() {
    frame=null;if(disposed||!unzoomed())return;
    const keyboard=keyboardOpen();
    // Android's Back/keyboard-dismiss button can leave the textarea focused.
    // Restore the root when the usable height recovers in that case too.
    if(keyboardWasOpen&&!keyboard)restoreRoot();
    keyboardWasOpen=keyboard;
    const messages=doc.getElementById('messages');
    const atEnd=messages&&messages.scrollHeight-messages.clientHeight-messages.scrollTop<32;
    if(viewport&&Number.isFinite(viewport.height)&&viewport.height>0) {
      style.setProperty('--app-viewport-height',`${viewport.height}px`);
      style.setProperty('--app-viewport-top',`${Math.max(0,viewport.offsetTop||0)}px`);
    }
    // Read after the shell resizes. Preserve an older-message scroll position.
    if(atEnd)messages.scrollTop=messages.scrollHeight;
  }
  function schedule() {
    if(!disposed&&frame===null)frame=win.requestAnimationFrame(update);
  }
  function settle() {
    if(disposed||!unzoomed())return;
    // iOS can retain a root scroll offset after focus ends. Never reset an
    // inner scroller, a live input's focus pan, or a user's pinch zoom.
    if(!editing()||!keyboardOpen())restoreRoot();
    schedule();
  }
  function focusChanged() {
    schedule();
    for(const id of timers)win.clearTimeout(id);timers.clear();
    // Cover browsers which report their final keyboard-close geometry late.
    for(const ms of [100,350,700]) {
      const id=win.setTimeout(()=>{timers.delete(id);settle();},ms);timers.add(id);
    }
  }
  function listen(target,event,handler) {
    target?.addEventListener(event,handler,{passive:true});listeners.push([target,event,handler]);
  }
  listen(viewport,'resize',schedule);listen(viewport,'scroll',schedule);
  listen(win,'resize',schedule);listen(win,'orientationchange',focusChanged);
  listen(win,'pageshow',focusChanged);
  listen(doc,'focusin',focusChanged);listen(doc,'focusout',focusChanged);
  listen(doc,'visibilitychange',()=>{if(doc.visibilityState==='visible')focusChanged();});
  update();
  return {dispose(){
    disposed=true;if(frame!==null)win.cancelAnimationFrame(frame);
    for(const id of timers)win.clearTimeout(id);
    for(const [target,event,handler]of listeners)target?.removeEventListener(event,handler);
    style.removeProperty('--app-viewport-height');style.removeProperty('--app-viewport-top');
  }};
}

if(typeof window!=='undefined'&&typeof document!=='undefined')appViewport({window,document});
