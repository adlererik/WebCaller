// Move only the display element. No canvas, new video track, storage or resize.
export function previewPosition(x,y,width,height,previewWidth,previewHeight,inset=8) {
  const minX=Math.min(inset,Math.max(0,(width-previewWidth)/2)),minY=Math.min(inset,Math.max(0,(height-previewHeight)/2));
  return {x:Math.max(minX,Math.min(x,width-previewWidth-minX)),y:Math.max(minY,Math.min(y,height-previewHeight-minY))};
}
export function selfPreview({screen,local,onInteraction=()=>{},onDragChange=()=>{}}) {
  let drag=null,position=null,disposed=false,suppressClick=false;
  const listeners=[];
  function listen(type,fn){local.addEventListener(type,fn);listeners.push(()=>local.removeEventListener(type,fn));}
  const visible=()=>screen.classList.contains('has-video')&&!screen.classList.contains('hidden');
  function bounds(){return {frame:screen.getBoundingClientRect(),preview:local.getBoundingClientRect()};}
  function place(x,y){
    const {frame,preview}=bounds(); const point=previewPosition(x,y,frame.width,frame.height,preview.width,preview.height);
    local.style.left=point.x+'px';local.style.top=point.y+'px';local.style.right='auto';local.style.bottom='auto';
    position={x:point.x/Math.max(1,frame.width-preview.width),y:point.y/Math.max(1,frame.height-preview.height)};
  }
  function finish(event){
    if(!drag||event.pointerId!==drag.id)return;
    const id=drag.id; suppressClick=drag.moved; drag=null;
    local.classList.remove('dragging');if(local.hasPointerCapture?.(id))local.releasePointerCapture(id);
    onDragChange(false);
  }
  listen('pointerdown',event=>{
    if(!visible()||drag||event.isPrimary===false||event.button!==0)return;
    const {frame,preview}=bounds();
    drag={id:event.pointerId,startX:event.clientX,startY:event.clientY,x:preview.left-frame.left,y:preview.top-frame.top,moved:false};
    suppressClick=false;local.setPointerCapture(event.pointerId);local.classList.add('dragging');onDragChange(true);
  });
  listen('pointermove',event=>{
    if(!drag||event.pointerId!==drag.id)return;
    const dx=event.clientX-drag.startX,dy=event.clientY-drag.startY;
    if(!drag.moved&&Math.hypot(dx,dy)<5)return;
    drag.moved=true;event.preventDefault();event.stopPropagation();place(drag.x+dx,drag.y+dy);
  });
  for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(type,finish);
  listen('click',event=>{if(suppressClick){event.stopPropagation();suppressClick=false;}else onInteraction();});
  listen('keydown',event=>{
    const directions={ArrowLeft:[-16,0],ArrowRight:[16,0],ArrowUp:[0,-16],ArrowDown:[0,16]};
    if(!visible()||!directions[event.key])return;
    event.preventDefault();event.stopPropagation();const {frame,preview}=bounds(),[x,y]=directions[event.key];
    place(preview.left-frame.left+x,preview.top-frame.top+y);onInteraction();
  });
  function reset(){
    if(drag)finish({pointerId:drag.id});position=null;suppressClick=false;
    for(const name of ['left','top','right','bottom'])local.style.removeProperty(name);
  }
  return {
    layout(){if(disposed||!position||!visible())return;const {frame,preview}=bounds();place(position.x*(frame.width-preview.width),position.y*(frame.height-preview.height));},
    reset,
    dispose(){reset();disposed=true;listeners.splice(0).forEach(remove=>remove());}
  };
}
