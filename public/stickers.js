export function stickerDimensions(bytes,total=bytes.byteLength){
  const a=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes),view=new DataView(a.buffer,a.byteOffset,a.byteLength),text=(i,n)=>String.fromCharCode(...a.slice(i,i+n));
  if(total<20||total>512*1024||a.length<20||text(0,4)!=='RIFF'||text(8,4)!=='WEBP'||view.getUint32(4,true)+8!==total)throw Error('Invalid WebP sticker');
  for(let offset=12;offset+8<=a.length;){
    const kind=text(offset,4),size=view.getUint32(offset+4,true),p=offset+8;if(p+size>total)throw Error('Invalid WebP sticker chunk');let width,height;
    if(kind==='VP8X'&&size>=10&&p+10<=a.length){width=1+a[p+4]+a[p+5]*256+a[p+6]*65536;height=1+a[p+7]+a[p+8]*256+a[p+9]*65536;}
    if(kind==='VP8 '&&size>=10&&p+10<=a.length&&text(p+3,3)==='\x9d\x01\x2a'){width=view.getUint16(p+6,true)&16383;height=view.getUint16(p+8,true)&16383;}
    if(kind==='VP8L'&&size>=5&&p+5<=a.length&&a[p]===0x2f){const bits=view.getUint32(p+1,true);width=(bits&16383)+1;height=((bits>>>14)&16383)+1;}
    if(width&&height){if(width>512||height>512)throw Error('Stickers must be at most 512 × 512');return {width,height};}
    offset=p+size+(size%2);
  }
  throw Error('Unsupported WebP sticker header');
}
export function validStickerCatalog(value){
  const safe=/^[a-z0-9-]{1,60}$/;
  return value?.v===1&&Array.isArray(value.packs)&&value.packs.length<=24&&value.packs.every(p=>safe.test(p.id)&&typeof p.title==='string'&&p.title.length<=80&&Array.isArray(p.stickers)&&p.stickers.length>0&&p.stickers.length<=120&&p.stickers.every(s=>/^[0-9]{1,3}$/.test(s.id)&&s.file===p.id+'/'+s.id.padStart(3,'0')+'.webp'&&Number.isSafeInteger(s.bytes)&&s.bytes>0&&s.bytes<=512*1024&&Number.isInteger(s.width)&&s.width>0&&s.width<=512&&Number.isInteger(s.height)&&s.height>0&&s.height<=512&&/^[a-f0-9]{64}$/.test(s.sha256)));
}
export function stickerPicker({button,panel,peer,send,warm,toast,loadPreferences=async()=>null,savePreferences=async()=>{}}){
  const $=id=>document.getElementById(id);let catalog,loading,loadedPreferences,preferenceWrites=Promise.resolve(),tab='recent',busy=false,recents=[],favorites=new Set();
  const key=(pack,s)=>pack.id+':'+s.id;
  const all=()=>catalog.packs.flatMap(pack=>pack.stickers.map(sticker=>({pack,sticker,key:key(pack,sticker)})));
  function persist(){const value={recents:recents.slice(),favorites:[...favorites]};preferenceWrites=preferenceWrites.catch(()=>{}).then(()=>savePreferences(value));void preferenceWrites.catch(()=>toast('Sticker choices could not be saved on this device.'));}
  function close(){panel.classList.add('hidden');button.setAttribute('aria-expanded','false');}
  function tabs(){
    const list=$('sticker-tabs');list.replaceChildren();
    for(const [id,title,cover]of [['recent','Recent',null],['favorites','Favorites',null],...catalog.packs.map(p=>[p.id,p.title,p.stickers[0].file])]){
      const b=document.createElement('button');b.type='button';b.role='tab';b.id='sticker-tab-'+id;b.setAttribute('aria-selected',String(tab===id));b.setAttribute('aria-controls','sticker-grid');b.title=title;b.ariaLabel=title;
      if(cover){const image=document.createElement('img');image.src='./stickers/'+cover;image.alt='';image.loading='lazy';b.append(image);}else b.textContent=id==='recent'?'◷':'☆';
      const label=document.createElement('span');label.textContent=title;b.append(label);b.onclick=()=>{tab=id;render();};
      b.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const buttons=[...list.children],i=buttons.indexOf(b);const next=e.key==='Home'?buttons[0]:e.key==='End'?buttons.at(-1):buttons[(i+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length];next.click();next.focus();};list.append(b);
    }
  }
  function render(){
    tabs();const entries=all(),items=tab==='recent'?recents.map(id=>entries.find(x=>x.key===id)).filter(Boolean):tab==='favorites'?entries.filter(x=>favorites.has(x.key)):entries.filter(x=>x.pack.id===tab);
    const grid=$('sticker-grid');grid.replaceChildren();grid.setAttribute('aria-labelledby','sticker-tab-'+tab);
    $('sticker-pack-name').textContent=catalog.packs.find(p=>p.id===tab)?.title|| (tab==='favorites'?'Favorites':'Recently sent');
    for(const entry of items){
      const tile=document.createElement('div');tile.className='sticker-tile';const b=document.createElement('button');b.type='button';b.className='sticker-choice';b.ariaLabel='Send '+entry.sticker.label;b.disabled=busy;
      const image=document.createElement('img');image.src='./stickers/'+entry.sticker.file;image.alt=entry.sticker.label;image.loading='lazy';image.decoding='async';b.append(image);
      b.onclick=async()=>{
        if(busy||!peer())return;busy=true;b.disabled=true;$('sticker-status').textContent='Sending sticker…';const contact=peer();
        try{
          const response=await fetch('./stickers/'+entry.sticker.file,{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Sticker could not be loaded');
          const data=await response.arrayBuffer();if(data.byteLength!==entry.sticker.bytes)throw Error('Invalid sticker asset');
          const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(n=>n.toString(16).padStart(2,'0')).join('');if(hash!==entry.sticker.sha256)throw Error('Sticker integrity check failed');
          if(peer()?.id!==contact.id)return;
          const ok=await send(new File([data],entry.pack.title+' '+entry.sticker.id+'.webp',{type:'image/webp'}),contact);
          if(ok){recents=[entry.key,...recents.filter(id=>id!==entry.key)].slice(0,30);persist();close();}
        }catch(e){toast(e.message);}finally{busy=false;$('sticker-status').textContent='';render();}
      };
      const star=document.createElement('button');star.type='button';star.className='sticker-favorite';star.textContent=favorites.has(entry.key)?'★':'☆';star.ariaLabel=(favorites.has(entry.key)?'Remove from':'Add to')+' favorites';star.setAttribute('aria-pressed',String(favorites.has(entry.key)));star.onclick=()=>{favorites.has(entry.key)?favorites.delete(entry.key):favorites.add(entry.key);persist();render();};tile.append(b,star);grid.append(tile);
    }
    if(!items.length){const empty=document.createElement('p');empty.className='sticker-empty';empty.textContent=tab==='favorites'?'Tap a star to keep a sticker here.':'Your recently sent stickers appear here. Choose a pack below.';grid.append(empty);}
  }
  async function show(){
    if(!peer())return;panel.classList.remove('hidden');button.setAttribute('aria-expanded','true');void warm(peer());
    try{
      if(!catalog){loading ||= fetch('./stickers/catalog.json',{cache:'no-store',signal:AbortSignal.timeout(15000)}).then(async r=>{if(!r.ok)throw Error('Sticker packs could not be loaded');const value=await r.json();if(!validStickerCatalog(value))throw Error('Invalid sticker catalog');return value;}).catch(e=>{loading=null;throw e;});catalog=await loading;tab=recents.length?'recent':catalog.packs[0].id;}
      loadedPreferences ||= loadPreferences().then(value=>{const valid=new Set(all().map(x=>x.key));recents=[...new Set(Array.isArray(value?.recents)?value.recents:[])].filter(id=>valid.has(id)).slice(0,30);favorites=new Set((Array.isArray(value?.favorites)?value.favorites:[]).filter(id=>valid.has(id)));}).catch(()=>{});await loadedPreferences;
      render();
    }catch(e){close();toast(e.message);}
  }
  button.setAttribute('aria-expanded','false');button.onclick=()=>panel.classList.contains('hidden')?void show():close();$('close-stickers').onclick=close;
  panel.addEventListener('keydown',e=>{if(e.key==='Escape'){close();button.focus();}});
  return {close,reset(){close();recents=[];favorites.clear();loadedPreferences=null;}};
}
