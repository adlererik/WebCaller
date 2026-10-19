import {isPermanent} from './message-lifetime.js';
export function remainingTime(expiresAt,now=Date.now()){
  if(!Number.isSafeInteger(expiresAt)||isPermanent(expiresAt))return '';
  const seconds=Math.max(0,Math.ceil((expiresAt-now)/1000));
  const days=Math.floor(seconds/86400),hours=Math.floor(seconds%86400/3600),minutes=Math.floor(seconds%3600/60);
  return days?`${days}d ${hours}h`:hours?`${hours}h ${minutes}m`:minutes?`${minutes}m ${seconds%60}s`:`${seconds}s`;
}
// Update just these spans: media elements and their playback state stay untouched.
export function updateCountdowns(container,now=Date.now()){
  for(const node of container.querySelectorAll('.message-expiry')){
    const waiting=node.dataset.waiting==='true',text=waiting?remainingTime(Number(node.dataset.seconds)*1000,0):remainingTime(Number(node.dataset.expires),now),value=node.querySelector('.expiry-value');
    if(value&&value.textContent!==text)value.textContent=text;
    node.setAttribute('aria-label',waiting?'Countdown starts when viewed: '+text:'Disappears in '+text);
  }
}
