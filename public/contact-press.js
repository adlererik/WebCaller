// A hold opens contact options; movement/scrolling must remain ordinary scrolling.
export function contactPress(element,{open,activate,hold=650,scope=globalThis.document}={}){
  let timer,pointer,startX,startY,consumed=false;
  const cancel=()=>{clearTimeout(timer);timer=undefined;pointer=undefined;};
  const show=()=>{cancel();consumed=true;open();};
  const down=e=>{
    cancel();consumed=false;
    if(e.button!==0||e.isPrimary===false)return;
    pointer=e.pointerId;startX=e.clientX;startY=e.clientY;
    try{element.setPointerCapture?.(pointer);}catch{}
    timer=setTimeout(()=>{if(element.isConnected!==false)show();else cancel();},hold);
  };
  const move=e=>{if(e.pointerId===pointer&&Math.hypot(e.clientX-startX,e.clientY-startY)>10)cancel();};
  const click=e=>{if(consumed&&e.detail!==0){e.preventDefault();e.stopPropagation();consumed=false;return;}activate();};
  const context=e=>{e.preventDefault();show();};
  const key=e=>{if(e.key==='ContextMenu'||e.key==='F10'&&e.shiftKey){e.preventDefault();show();}};
  const listeners={pointerdown:down,pointermove:move,pointerup:cancel,pointercancel:cancel,lostpointercapture:cancel,click,contextmenu:context,keydown:key};
  for(const [name,fn]of Object.entries(listeners))element.addEventListener(name,fn);
  scope?.addEventListener('scroll',cancel,true);
  return ()=>{cancel();for(const [name,fn]of Object.entries(listeners))element.removeEventListener(name,fn);scope?.removeEventListener('scroll',cancel,true);};
}
