import {MAX_MESSAGE_SECONDS,timerValue,timerLabel} from './message-lifetime.js';

export const TIMER_UNITS = [
  {id:'seconds',seconds:1,max:59}, {id:'minutes',seconds:60,max:59},
  {id:'hours',seconds:3600,max:23}, {id:'days',seconds:86400,max:6},
  {id:'weeks',seconds:604800,max:4}
];
export function customSeconds(count,unit) {
  const choice=TIMER_UNITS.find(x=>x.id===unit);
  if(!choice||!Number.isInteger(count)||count<1||count>choice.max||count*choice.seconds>MAX_MESSAGE_SECONDS)throw new Error('Choose a valid time.');
  return count*choice.seconds;
}
export function splitTimer(seconds) {
  for(const unit of [...TIMER_UNITS].reverse()){
    const count=seconds/unit.seconds;if(Number.isInteger(count)&&count>=1&&count<=unit.max)return {count,unit:unit.id};
  }
  return {count:1,unit:'days'};
}

// Three copies keep the selected item in the middle cycle. Native touch
// scrolling, snap points, tapping and keyboard input all select the same value.
export function timerWheel(element,{values,value,label,onChange}) {
  const rowHeight=48;let items=values.slice(),selected=value,settle,ignore=false;
  element.setAttribute('role','listbox');element.tabIndex=0;element.setAttribute('aria-label',label);
  function updateAria(){
    const index=items.indexOf(selected);element.setAttribute('aria-activedescendant',element.id+'-option-'+(items.length+index));
    for(const node of element.children){const chosen=node.dataset.value===String(selected)&&Number(node.dataset.index)===items.length+index;node.setAttribute('aria-selected',String(chosen));node.classList.toggle('wheel-selected',node.dataset.value===String(selected));}
  }
  function center(animate=false){
    if(!element.isConnected)return;
    const index=items.indexOf(selected);ignore=true;element.scrollTo({top:(items.length+index)*rowHeight,behavior:'instant'});
    queueMicrotask(()=>{ignore=false;});
  }
  function choose(next,animate=false){if(next===undefined)return;const changed=next!==selected;selected=next;updateAria();center(animate);if(changed)onChange(selected);}
  function render(){
    element.replaceChildren();
    for(let i=0;i<items.length*3;i++){
      const item=items[i%items.length],node=document.createElement('div');node.className='wheel-option';node.id=element.id+'-option-'+i;node.dataset.value=String(item);node.dataset.index=String(i);node.setAttribute('role','option');if(i<items.length||i>=items.length*2)node.setAttribute('aria-hidden','true');node.textContent=String(item);node.onclick=()=>choose(item,true);element.append(node);
    }
    updateAria();center();
  }
  function settled(){
    if(ignore)return;
    const index=Math.round(element.scrollTop/rowHeight),next=items[((index%items.length)+items.length)%items.length];
    const changed=next!==selected;selected=next;updateAria();center();if(changed)onChange(selected);
  }
  element.addEventListener('scroll',()=>{if(!ignore){clearTimeout(settle);settle=setTimeout(settled,120);}}, {passive:true});
  element.addEventListener('scrollend',settled);
  element.addEventListener('keydown',event=>{
    const offset={ArrowDown:1,ArrowUp:-1,PageDown:5,PageUp:-5}[event.key];let index=items.indexOf(selected);
    if(offset!==undefined)index=(index+offset+items.length)%items.length;
    else if(event.key==='Home')index=0;else if(event.key==='End')index=items.length-1;else return;
    event.preventDefault();choose(items[index]);
  });
  render();
  return {
    get value(){return selected;},
    set(nextValues,nextValue){items=nextValues.slice();selected=nextValue;clearTimeout(settle);render();},
    refresh:()=>center(),
    settle(){clearTimeout(settle);ignore=false;settled();return selected;},
    stop(){clearTimeout(settle);}
  };
}

export function messageTimer({peer,get,save,back,toast}) {
  const $=id=>document.getElementById(id),page=$('message-timer-dialog'),custom=$('custom-time-dialog');
  const presets=[0,2419200,604800,86400,28800,3600,300,30];let draft=86400,owner,customChoice=false,quantity,units,customReady=false;
  const countItems=unit=>Array.from({length:TIMER_UNITS.find(u=>u.id===unit).max},(_,i)=>i+1);
  function render(){
    $('timer-scope').textContent=peer()?'For new messages you send to '+peer().name:'For this chat';
    const list=$('timer-options'),focused=list.contains(document.activeElement)?document.activeElement.value:null;list.replaceChildren();
    for(const seconds of [...presets,'custom']){
      const label=document.createElement('label');label.className='timer-option';const input=document.createElement('input');input.type='radio';input.name='message-lifetime';input.value=String(seconds);
      input.checked=seconds==='custom'?customChoice:!customChoice&&seconds===draft;
      const text=document.createElement('span');text.textContent=seconds==='custom'?'Custom time':timerLabel(seconds);label.append(input,text);
      if(seconds==='custom'){
        const detail=document.createElement('span');detail.className='timer-option-detail';detail.textContent=customChoice?timerLabel(draft):'Choose an exact time';text.append(detail);
        input.onclick=()=>openCustom();
      }else input.onchange=()=>{draft=seconds;customChoice=false;render();};
      list.append(label);
    }
    if(focused!==null)list.querySelector('input[value="'+focused+'"]')?.focus({preventScroll:true});
  }
  function show(){const current=peer();if(!current)return;owner=current.id;draft=timerValue(get(current.id));customChoice=!presets.includes(draft);$('settings-dialog').close();render();page.showModal();}
  function dismiss(){quantity?.stop();units?.stop();custom.close();page.close();owner=null;}
  function goBack(){dismiss();back();}
  function currentChoice(){return customSeconds(quantity.value,units.value);}
  function summary(){if(customReady)$('custom-time-summary').textContent=timerLabel(currentChoice());}
  function openCustom(){
    const choice=splitTimer(draft||86400);customReady=false;custom.showModal();
    if(!quantity){
      quantity=timerWheel($('timer-number-wheel'),{values:countItems(choice.unit),value:choice.count,label:'Number',onChange:summary});
      units=timerWheel($('timer-unit-wheel'),{values:TIMER_UNITS.map(u=>u.id),value:choice.unit,label:'Time unit',onChange:unit=>{quantity.set(countItems(unit),Math.min(quantity.value,TIMER_UNITS.find(u=>u.id===unit).max));summary();}});
    }else {quantity.set(countItems(choice.unit),choice.count);units.set(TIMER_UNITS.map(u=>u.id),choice.unit);}
    customReady=true;summary();requestAnimationFrame(()=>{quantity.refresh();units.refresh();});
  }
  function cancelCustom(){custom.close();quantity?.stop();units?.stop();render();$('timer-options').querySelector('input[value="custom"]')?.focus();}
  $('timer-back').onclick=goBack;page.addEventListener('cancel',event=>{event.preventDefault();goBack();});
  $('timer-save').onclick=()=>{
    if(peer()?.id!==owner){dismiss();toast('This chat is no longer open.');return;}
    save(owner,draft);dismiss();back();
  };
  $('custom-time-cancel').onclick=cancelCustom;custom.addEventListener('cancel',event=>{event.preventDefault();cancelCustom();});
  $('custom-time-set').onclick=()=>{
    units.settle();quantity.settle();draft=currentChoice();customChoice=true;custom.close();render();
  };
  return {show,dismiss};
}
