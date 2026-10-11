// Coordinates and the rendered preview travel inside the encrypted attachment.
export function validAttribution(a){
  if(!a||typeof a.text!=='string'||a.text.length>160||!a.text.trim()||typeof a.url!=='string'||a.url.length>400)return false;
  try{const u=new URL(a.url);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}
}
export const defaultAttribution={text:'© OpenStreetMap contributors',url:'https://www.openstreetmap.org/copyright'};
export function validLocation(p){
  return !!p&&Number.isFinite(p.lat)&&Math.abs(p.lat)<=90&&Number.isFinite(p.lon)&&Math.abs(p.lon)<=180&&Number.isFinite(p.accuracy)&&p.accuracy>=0&&p.accuracy<=20000000&&Number.isSafeInteger(p.capturedAt)&&p.capturedAt>0&&typeof p.label==='string'&&p.label.length<=160&&['map','pin'].includes(p.preview)&&(p.attribution===undefined||validAttribution(p.attribution));
}
export function mapsURL(p){if(!validLocation(p))throw new Error('Invalid location');return `https://maps.google.com/maps?q=${p.lat.toFixed(6)},${p.lon.toFixed(6)}`;}
export function locationText(p){return `${p.label||'Current location'}\n${mapsURL(p)}`;}
export function mapPoint(lat,lon,zoom=15){
  const n=2**zoom,s=Math.sin(Math.max(-85.05112878,Math.min(85.05112878,lat))*Math.PI/180);
  return {x:(lon+180)/360*n*256,y:(.5-Math.log((1+s)/(1-s))/(4*Math.PI))*n*256,n};
}
function tileImage(url,signal){
  return new Promise((resolve,reject)=>{
    const img=new Image();img.crossOrigin='anonymous';img.referrerPolicy='origin';
    const finish=(error)=>{clearTimeout(timer);signal.removeEventListener('abort',abort);img.onload=img.onerror=null;if(error){img.src='';reject(error);}else resolve(img);};
    const abort=()=>finish(new DOMException('Cancelled','AbortError'));
    const timer=setTimeout(()=>finish(new Error('Map unavailable')),7000);
    img.onload=()=>finish(img.naturalWidth===256&&img.naturalHeight===256?null:new Error('Map unavailable'));img.onerror=()=>finish(new Error('Map unavailable'));signal.addEventListener('abort',abort,{once:true});
    if(signal.aborted)return abort();img.src=url;
  });
}
export async function locationPreview(p,{tileURL,signal,attribution=defaultAttribution}){
  signal.throwIfAborted();const canvas=document.createElement('canvas');canvas.width=384;canvas.height=288;
  const c=canvas.getContext('2d'),{x,y,n}=mapPoint(p.lat,p.lon),left=x-192,top=y-144;
  c.fillStyle='#e9edf2';c.fillRect(0,0,384,288);let available=true;
  const tiles=[];
  for(let tx=Math.floor(left/256);tx<=Math.floor((left+383)/256);tx++)for(let ty=Math.floor(top/256);ty<=Math.floor((top+287)/256);ty++){
    if(ty<0||ty>=n)continue;
    const url=tileURL.replace('{z}','15').replace('{x}',String((tx%n+n)%n)).replace('{y}',String(ty));
    tiles.push(tileImage(url,signal).then(img=>c.drawImage(img,tx*256-left,ty*256-top,256,256)));
  }
  const results=await Promise.allSettled(tiles);signal.throwIfAborted();available=results.length>0&&results.every(r=>r.status==='fulfilled');
  if(!available){c.fillStyle='#e9edf2';c.fillRect(0,0,384,288);c.fillStyle='#586374';c.font='16px system-ui';c.textAlign='center';c.fillText('Map preview unavailable',192,218);c.font='14px system-ui';c.fillText(`${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}`,192,244);}
  c.fillStyle='#df443c';c.strokeStyle='#b12824';c.lineWidth=2;c.beginPath();c.moveTo(192,151);c.bezierCurveTo(178,128,170,118,170,107);c.arc(192,107,22,Math.PI,0);c.bezierCurveTo(214,118,206,128,192,151);c.fill();c.stroke();c.beginPath();c.arc(192,107,8,0,Math.PI*2);c.fillStyle='#a51e22';c.fill();
  if(available){c.textAlign='right';c.font='11px system-ui';const text=attribution.text;c.fillStyle='rgba(255,255,255,.9)';c.fillRect(0,270,384,18);c.fillStyle='#374151';c.fillText(text,379,283,374);}
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));signal.throwIfAborted();if(!blob)throw new Error('Could not create the location preview.');
  return {file:new File([blob],'location.png',{type:'image/png'}),location:{...p,preview:available?'map':'pin',...(available?{attribution}:{})}};
}
export function locate(geolocation,signal){
  return new Promise((resolve,reject)=>{
    const abort=()=>{signal.removeEventListener('abort',abort);reject(new DOMException('Cancelled','AbortError'));};
    signal.addEventListener('abort',abort,{once:true});if(signal.aborted)return abort();
    geolocation.getCurrentPosition(position=>{signal.removeEventListener('abort',abort);if(!signal.aborted)resolve(position);},error=>{signal.removeEventListener('abort',abort);if(!signal.aborted)reject(error);},{enableHighAccuracy:true,maximumAge:0,timeout:15000});
  });
}
export function locationSharing({peer,busy,config,onSend}){
  const $=id=>document.getElementById(id);let draft,controller,recipient,url;
  function clear(){controller?.abort();controller=null;draft=null;recipient=null;if(url)URL.revokeObjectURL(url);url=null;$('location-preview').replaceChildren();$('location-label').value='';$('send-location').disabled=true;}
  function close(){clear();if($('location-dialog').open)$('location-dialog').close();}
  function show(){if(!peer()||busy())return;clear();recipient=peer().id;const provider=new URL(config().mapTileURL,window.location.origin).hostname;$('location-provider').textContent=provider==='tile.openstreetmap.org'?'OpenStreetMap':provider;$('location-recipient').textContent=`Send your current location to ${peer().name}. Preview it first, then press Send.`;$('location-status').textContent='';$('locate').disabled=false;$('location-dialog').showModal();}
  $('location-dialog').addEventListener('close',clear);
  $('locate').onclick=async()=>{
    if(!navigator.geolocation){$('location-status').textContent='Location is unavailable. Open this website in your phone’s browser.';return;}
    controller?.abort();controller=new AbortController();const active=controller,signal=active.signal;draft=null;$('send-location').disabled=true;$('locate').disabled=true;$('location-status').textContent='Finding your location…';
    try{
      const position=await locate(navigator.geolocation,signal);signal.throwIfAborted();
      const p={lat:Number(position.coords.latitude.toFixed(6)),lon:Number(position.coords.longitude.toFixed(6)),accuracy:Math.round(position.coords.accuracy),capturedAt:Date.now(),label:'',preview:'pin'};
      if(!validLocation(p))throw new Error('The phone returned an invalid location.');
      $('location-status').textContent='Creating the map preview…';const next=await locationPreview(p,{tileURL:config().mapTileURL,attribution:config().mapAttribution||defaultAttribution,signal});signal.throwIfAborted();
      if(peer()?.id!==recipient||busy())return close();draft=next;if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(draft.file);
      const image=document.createElement('img');image.src=url;image.alt='Preview of your current location';$('location-preview').replaceChildren(image);
      $('location-status').textContent=`${p.lat.toFixed(6)}, ${p.lon.toFixed(6)} · accurate to about ${p.accuracy} m${next.location.preview==='pin'?' · Map unavailable; coordinates can still be sent.':''}`;$('send-location').disabled=false;
    }catch(e){if(!signal.aborted)$('location-status').textContent=e.code===1?'Allow location access in your browser, then try again.':e.code===3?'Finding your location took too long. Try again outside or near a window.':e.message||'Could not find your location. Try again.';}
    finally{if(controller===active)$('locate').disabled=false;}
  };
  $('send-location').onclick=()=>{if(!draft||busy()||peer()?.id!==recipient)return;const next=draft;next.location.label=$('location-label').value.trim().slice(0,160);close();onSend(next.file,next.location);};
  return {show,close};
}
