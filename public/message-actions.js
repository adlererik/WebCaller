// Conversation state is deliberately memory-only and cleared on backgrounding.
export function messageActions({messages,self,contacts,peer,render,event,sendText,sendFile,load,remove,toast,emoji}){
  const $=id=>document.getElementById(id);let chosen,editing,forwarding,replyTo,replyPeer,deleting=[];
  const selection=new Set();
  const alive=m=>m&&messages().get(m.id)===m&&m.expiresAt>Date.now();
  const stamp=t=>t?new Date(t).toLocaleString():'Not yet';
  const summary=m=>m.location?'Current location':m.text||m.attachment?.name||'Message';
  function replyBar(){const original=messages().get(replyTo);$('reply-context').classList.toggle('hidden',!replyTo);$('reply-summary').textContent=alive(original)?summary(original).slice(0,120):'Original message unavailable';}
  function selectionBar(){const n=selection.size;$('selection-bar').classList.toggle('hidden',!n);$('selection-count').textContent=`${n} selected`;}
  function close(){for(const id of ['message-dialog','edit-dialog','forward-dialog','message-info-dialog','delete-dialog'])$(id).close();chosen=editing=forwarding=null;deleting=[];$('edit-text').value='';$('forward-people').replaceChildren();$('message-info').replaceChildren();$('quick-reactions').replaceChildren();}
  function reset(){close();replyTo=replyPeer=null;selection.clear();replyBar();selectionBar();}
  function select(m){if(!alive(m))return;if(selection.has(m.id))selection.delete(m.id);else if(selection.size<20)selection.add(m.id);else return toast('Select up to 20 messages at a time.');selectionBar();render();}
  function show(m){
    if(!alive(m))return;if(selection.size)return select(m);chosen=m;
    $('message-edit').classList.toggle('hidden',m.from!==self()||!!m.location);
    $('message-pin').lastChild.textContent=m.pinned?'Unpin':'Pin';
    const strip=$('quick-reactions');strip.replaceChildren();
    for(const value of ['❤️','👍','👎','😂','😮','😢']){
      const b=document.createElement('button');b.type='button';b.textContent=value;b.ariaLabel=`React ${value}`;b.setAttribute('aria-pressed',String(m.reactions?.[self()]===value));b.onclick=()=>void react(m,value);strip.append(b);
    }
    const more=document.createElement('button');more.type='button';more.textContent='•••';more.ariaLabel='More reactions';more.onclick=()=>{$('message-dialog').close();void emoji(value=>react(m,value));};strip.append(more);
    $('message-dialog').showModal();
  }
  async function react(m,value){if(!alive(m))return;close();try{await event(m,'reaction',{emoji:m.reactions?.[self()]===value?'':value});}catch(e){toast(e.message);}}
  async function copy(list){const text=list.filter(alive).map(summary).join('\n\n');if(!text)return;try{await navigator.clipboard.writeText(text);toast('Copied.');}catch{toast('Your browser could not copy. Select the text and use Copy.');}}
  function prepareForward(list){
    forwarding=list.filter(alive);$('message-dialog').close();const el=$('forward-people');el.replaceChildren();
    for(const c of contacts()){
      const b=document.createElement('button');b.className='secondary full';b.textContent=c.name;b.onclick=async()=>{
        const items=forwarding?.slice();if(!items)return;b.disabled=true;
        try{for(const m of items){if(!alive(m))continue;if(m.attachment){if(!m.blob)await load(m,true);if(!alive(m)||!m.blob)throw new Error('Open this media first, then try forwarding it.');if(!await sendFile(new File([m.blob],m.attachment.name,{type:m.attachment.type}),m.text,m.location,c))throw new Error('This media was not forwarded. Try again after the call or transfer.');}else await sendText(c,m.text,{forwarded:true});}close();toast('Forwarded.');}catch(e){toast(e.message);}finally{b.disabled=false;}
      };el.append(b);
    }
    $('forward-dialog').showModal();
  }
  function askDelete(list){deleting=list.filter(alive);if(!deleting.length)return;$('message-dialog').close();$('delete-description').textContent=`Delete ${deleting.length===1?'this message':`these ${deleting.length} messages`} and any attached media for both people?`;$('delete-dialog').showModal();}
  $('message-reply').onclick=()=>{if(!alive(chosen))return;replyTo=chosen.id;replyPeer=peer()?.id;close();replyBar();$('message-input').focus();};
  $('cancel-reply').onclick=()=>{replyTo=replyPeer=null;replyBar();};
  $('message-edit').onclick=()=>{if(!alive(chosen)||chosen.from!==self()||chosen.location)return;editing=chosen;$('message-dialog').close();$('edit-text').value=editing.text;$('edit-dialog').showModal();$('edit-text').focus();};
  $('edit-form').onsubmit=async e=>{e.preventDefault();const m=editing,text=$('edit-text').value.trim();if(!alive(m))return close();if(!text&&!m.attachment)return;$('save-edit').disabled=true;try{await event(m,'edit',{text});close();}catch(e){toast(e.message);}finally{$('save-edit').disabled=false;}};
  $('message-forward').onclick=()=>prepareForward([chosen]);
  $('message-copy').onclick=()=>{const m=chosen;close();void copy([m]);};
  $('message-select').onclick=()=>{const m=chosen;close();select(m);};
  $('message-pin').onclick=async()=>{const m=chosen;close();if(!alive(m))return;try{await event(m,'pin',{pinned:!m.pinned});}catch(e){toast(e.message);}};
  $('message-info-button').onclick=()=>{
    const m=chosen;if(!alive(m))return;$('message-dialog').close();const el=$('message-info');el.replaceChildren();
    for(const [name,value]of [['Sent',stamp(m.createdAt)],['Received',stamp(m.receipt?.deliveredAt)],['Seen',stamp(m.receipt?.readAt)],['Edited',m.editedAt?stamp(m.editedAt):'Never'],['Disappears',stamp(m.expiresAt)]]){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=name;dd.textContent=value;el.append(dt,dd);}
    $('message-info-dialog').showModal();
  };
  $('delete-message').onclick=()=>askDelete([chosen]);
  $('confirm-delete-messages').onclick=async()=>{const items=deleting.slice();$('confirm-delete-messages').disabled=true;try{for(const m of items)if(alive(m))await remove(m);close();selection.clear();selectionBar();render();}catch(e){toast(e.message);}finally{$('confirm-delete-messages').disabled=false;}};
  $('selection-clear').onclick=()=>{selection.clear();selectionBar();render();};
  const selectedMessages=()=>[...selection].map(id=>messages().get(id)).filter(alive).sort((a,b)=>a.createdAt-b.createdAt);
  $('selection-copy').onclick=()=>void copy(selectedMessages());$('selection-forward').onclick=()=>prepareForward(selectedMessages());$('selection-delete').onclick=()=>askDelete(selectedMessages());
  return {show,reset,selection,select,reply:()=>replyPeer===peer()?.id&&alive(messages().get(replyTo))?replyTo:undefined,clearReply:()=>{replyTo=replyPeer=null;replyBar();},changed(){
    for(const id of selection)if(!alive(messages().get(id)))selection.delete(id);selectionBar();replyBar();
    if(chosen&&!alive(chosen)||editing&&!alive(editing)||forwarding?.some(m=>!alive(m))||deleting.some(m=>!alive(m)))close();
  }};
}
