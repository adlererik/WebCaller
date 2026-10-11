import {locationText,defaultAttribution} from './location.js';
import {mediaKind,fileSize} from './attachments.js';
const node=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
const glyph=(name)=>{const span=node('span');span.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true">${name==='play'?'<path d="m9 5 11 7-11 7Z"/>':'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'}</svg>`;return span;};
function messageText(text){
  const span=node('span','message-text');let offset=0;
  for(const match of text.matchAll(/\bhttps?:\/\/[^\s<]+/g)){
    const url=match[0].replace(/[.,!?;:]+$/,'');span.append(document.createTextNode(text.slice(offset,match.index)));
    const link=node('a','',url);link.href=url;link.target='_blank';link.rel='noopener noreferrer';span.append(link);offset=match.index+url.length;
  }
  span.append(document.createTextNode(text.slice(offset)));return span;
}
export function drawMessages({container,list,self,options,openMedia,load,save}){
  const nearBottom=container.scrollHeight-container.scrollTop-container.clientHeight<100;
  const prior=new Map([...container.children].map(e=>[e.dataset.key,e])),desired=[];let previousDay;
  for(const m of list){
    const date=new Date(m.createdAt),day=date.toLocaleDateString();
    if(day!==previousDay){const key='day-'+day;let d=prior.get(key);if(!d){d=node('div','date-divider',date.toLocaleDateString([],{weekday:'short',month:'short',day:'numeric'}));d.dataset.key=key;}desired.push(d);previousDay=day;}
    const uiKey=JSON.stringify([m.blobURL||'',m.text,m.loading,m.loadError,m.attachment?.type,m.location]);let row=prior.get(m.id);
    if(!row||row.dataset.ui!==uiKey){
      row=node('div','message-row'+(m.from===self?' outgoing':''));row.dataset.key=m.id;row.dataset.ui=uiKey;
      const bubble=node('div','message'+(m.from===self?' outgoing':''));row.append(bubble);
      let held=false,holdTimer,origin;
      row.oncontextmenu=e=>{e.preventDefault();options(m);};
      bubble.onpointerdown=e=>{if(e.pointerType==='touch'){held=false;origin=[e.clientX,e.clientY];holdTimer=setTimeout(()=>{held=true;options(m);},550);}};
      for(const name of ['pointerup','pointercancel','pointerleave'])bubble.addEventListener(name,()=>clearTimeout(holdTimer));
      bubble.onpointermove=e=>{if(origin&&Math.hypot(e.clientX-origin[0],e.clientY-origin[1])>10)clearTimeout(holdTimer);};
      bubble.addEventListener('click',e=>{if(held){held=false;e.preventDefault();e.stopImmediatePropagation();}},true);
      if(m.attachment){
        const a=m.attachment,kind=mediaKind(a.type);bubble.classList.add('attachment-message',kind+'-message');if(m.location)bubble.classList.add('location-message');
        if(['image','video'].includes(kind)){
          const preview=node('button','media-preview');preview.type='button';preview.ariaLabel=m.location?'Open location preview':kind==='image'?'Open photo':'Play video';
          if(m.blobURL){const media=node(kind==='image'?'img':'video','chat-media');media.src=m.blobURL;
            if(kind==='image')media.alt=a.name;else{media.muted=true;media.playsInline=true;media.preload='metadata';}
            media.addEventListener(kind==='image'?'load':'loadedmetadata',()=>{if(nearBottom)container.scrollTop=container.scrollHeight;});
            media.onerror=()=>{preview.classList.add('media-unavailable');};preview.append(media);
            if(kind==='video'){const play=node('span','media-play');play.append(glyph('play'));preview.append(play);}
          }else preview.append(node('span','media-placeholder',m.loadError?'Tap to retry':m.loading?'Loading…':'Loading media…'));
          preview.onclick=()=>m.blobURL?openMedia(m):load(m);bubble.append(preview);
        }else if(kind==='audio'&&m.blobURL){
          const audio=node('audio','chat-audio');audio.src=m.blobURL;audio.controls=true;audio.preload='metadata';audio.ariaLabel='Voice message';bubble.append(audio);
          const expand=node('button','audio-expand','Open audio');expand.type='button';expand.onclick=()=>openMedia(m);bubble.append(expand);
        }else{
          bubble.append(node('strong','attachment-name',kind==='audio'?'Voice message':a.name));
          const action=node('button','attachment-action',m.blobURL?'Save file':m.loading?'Loading…':`${m.loadError?'Retry':kind==='audio'?'Play voice message':'Download file'} · ${fileSize(a.size)}`);
          action.type='button';action.disabled=!!m.loading;action.onclick=()=>m.blobURL?save(m):load(m);bubble.append(action);
        }
      }
      if(m.location){bubble.append(messageText(locationText(m.location)));if(m.location.preview==='map'){const source=m.location.attribution||defaultAttribution,credit=node('a','map-credit',source.text);credit.href=source.url;credit.target='_blank';credit.rel='noopener noreferrer';bubble.append(credit);}}else if(m.text)bubble.append(messageText(m.text));
      const meta=node('span','message-meta',date.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}));bubble.append(meta);
      const menu=node('button','message-options');menu.type='button';menu.ariaLabel='Message options';menu.append(glyph('more'));menu.onclick=()=>options(m);row.append(menu);
    }
    desired.push(row);
  }
  if(!list.length)desired.push(node('p','chat-empty','A conversation just for you two.\nSay hello, or give them a call.'));
  // Reuse unchanged rows so an arriving message does not interrupt playing audio.
  let cursor=container.firstChild;
  for(const el of desired){if(el===cursor)cursor=cursor.nextSibling;else container.insertBefore(el,cursor);}
  const keep=new Set(desired);for(const el of [...container.children])if(!keep.has(el))container.removeChild(el);
  if(nearBottom||list.length<4)container.scrollTop=container.scrollHeight;
}
export function emojiPicker({input,changed,toast}){
  const $=id=>document.getElementById(id);let data,selection;
  function render(){
    const search=$('emoji-search').value.toLowerCase().trim(),category=$('emoji-category').value,tone=$('emoji-tone').value;
    const filtered=data.filter(([emoji,name,group])=>{
      if(category&&group!==category||search&&!name.includes(search)&&!emoji.includes(search))return false;
      if(tone==='all')return true;
      const tones=name.match(/(?:medium-light|medium-dark|medium|light|dark) skin tone/g)||[];
      return tone?tones.length>0&&tones.every(t=>t===tone):!tones.length;
    });
    const grid=$('emoji-grid');grid.replaceChildren();
    for(const [emoji,name]of filtered){const b=node('button','emoji-choice',emoji);b.type='button';b.title=name;b.ariaLabel=name;b.onclick=()=>{if(input.value.length-(selection[1]-selection[0])+emoji.length>input.maxLength)return toast('This message is full. Send it before adding more emoji.');input.setRangeText(emoji,selection[0],selection[1],'end');$('emoji-dialog').close();input.focus();changed();};grid.append(b);}
    $('emoji-status').textContent=filtered.length?'':'No matching emoji';
  }
  async function show(){
    selection=[input.selectionStart,input.selectionEnd];
    try{
      if(!data){const r=await fetch('./emojis.json',{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error('Emoji could not be loaded');data=await r.json();
        $('emoji-category').append(new Option('All categories',''));for(const group of new Set(data.map(e=>e[2])))$('emoji-category').append(new Option(group,group));}
      $('emoji-search').value='';render();$('emoji-dialog').showModal();
    }catch(e){toast(e.message);}
  }
  for(const id of ['emoji-search','emoji-category','emoji-tone'])$(id).addEventListener(id==='emoji-search'?'input':'change',render);
  return show;
}
