import {b64} from './crypto.js';
import {dialCode,dialLink} from './dial-code.js';

// Persist the new identity and its random bearer token before enrollment. A
// lost response/reload can retry the same enrollment without replacing keys.
export async function dialIdentity({load,save,newIdentity,random=crypto.getRandomValues.bind(crypto)}){
  let device=await load();
  if(device?.identity&&device.token)return device;
  if(device)throw new Error('Open your usual phone to keep its saved identity');
  device={identity:await newIdentity(),token:b64(random(new Uint8Array(32))),contacts:[],pins:{},dialEnrollment:true};
  const stored=await save(device);
  if(stored!==undefined){if(!stored?.identity||!stored.token)throw new Error('Open your usual phone to keep its saved identity');return stored;}
  return device;
}

export function dialingUI({api,device,config,connect,action,before=async()=>true,toast}){
  const $=id=>document.getElementById(id),dialog=$('dial-dialog'),settings=$('dial-settings-dialog');let busy=false;
  function show(code=''){
    $('dial-code').value=dialCode(code)||'';$('dial-error').textContent='';
    $('dial-name-label').classList.toggle('hidden',!!device()?.user);$('dial-name').value=device()?.enrollmentName||'';
    if(!dialog.open)dialog.showModal();if(!window.matchMedia('(pointer:coarse)').matches)$('dial-code').focus();
  }
  async function submit(event){
    event.preventDefault();if(busy)return;
    const code=dialCode($('dial-code').value),mode=event.submitter?.value||'video';
    if(!code){$('dial-error').textContent='Enter a calling code of 4 to 12 digits.';return;}
    busy=true;for(const button of $('dial-actions').querySelectorAll('button'))button.disabled=true;
    try{if(!await before(code,mode))return;$('dial-error').textContent='Connecting…';const contact=await connect(code,$('dial-name').value.trim());dialog.close();await action(contact,mode);}
    catch(error){$('dial-error').textContent=error.message;if(!dialog.open)toast(error.message);}
    finally{busy=false;for(const button of $('dial-actions').querySelectorAll('button'))button.disabled=false;}
  }
  $('dial-form').addEventListener('submit',event=>void submit(event));
  for(const button of $('dial-pad').querySelectorAll('button'))button.addEventListener('click',()=>{
    const input=$('dial-code');input.value=button.dataset.digit==='back'?input.value.slice(0,-1):(input.value+button.dataset.digit).slice(0,12);
  });
  function render(state){
    $('my-dial-code').value=state.code||'';$('dial-settings-status').textContent=state.code?'Share this code with people you want to hear from.':'You are unlisted. Choose a code to let people contact you without an invitation.';
    $('disable-dial-code').classList.toggle('hidden',!state.code);$('copy-dial-link').classList.toggle('hidden',!state.code);
    const list=$('blocked-contacts');list.replaceChildren();
    for(const peer of state.blocked||[]){
      const row=document.createElement('div'),name=document.createElement('span'),button=document.createElement('button');row.className='blocked-contact';name.textContent=peer.name;button.type='button';button.className='secondary';button.textContent='Unblock';
      button.onclick=async()=>{button.disabled=true;try{await api('/blocks/'+peer.id,'DELETE');await showSettings();}catch(error){toast(error.message);button.disabled=false;}};
      row.append(name,button);list.append(row);
    }
    $('blocked-heading').classList.toggle('hidden',!(state.blocked||[]).length);
  }
  async function showSettings(){
    if(!settings.open)settings.showModal();$('dial-settings-status').textContent='Loading…';
    try{render(await api('/dial/settings'));}catch(error){$('dial-settings-status').textContent=error.message;}
  }
  async function save(random=false){
    const code=dialCode($('my-dial-code').value);
    if(!random&&!code){$('dial-settings-status').textContent='Choose a calling code of 4 to 12 digits.';return;}
    $('save-dial-code').disabled=true;$('random-dial-code').disabled=true;
    try{const result=await api('/dial/code','PUT',random?{random:true}:{code});render({...result,blocked:(await api('/dial/settings')).blocked});toast('Your calling code is '+result.code+'.');}
    catch(error){$('dial-settings-status').textContent=error.message;}finally{$('save-dial-code').disabled=false;$('random-dial-code').disabled=false;}
  }
  $('dial-settings-form').addEventListener('submit',event=>{event.preventDefault();void save();});
  $('random-dial-code').onclick=()=>void save(true);
  $('disable-dial-code').onclick=async()=>{try{await api('/dial/code','DELETE');await showSettings();toast('Your calling code is off. Saved conversations still work.');}catch(error){toast(error.message);}};
  $('copy-dial-link').onclick=async()=>{try{await navigator.clipboard.writeText(dialLink(config().publicURL.replace(/\/$/,'')+'/', $('my-dial-code').value));toast('Calling link copied.');}catch{$('my-dial-code').select();toast('Share the code shown above.');}};
  return {show,showSettings,close:()=>dialog.close()};
}
