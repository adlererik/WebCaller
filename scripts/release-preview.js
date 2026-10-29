// Synthetic screenshot fixtures using the real shipped components. No accounts,
// API calls, phone data, keys, service worker or notification registration.
import {drawMessages} from '/ui/chat-ui.js';
import {icons} from '/preview-icons.js';
const $=id=>document.getElementById(id),mode=new URL(location).searchParams.get('view')||'chat';
document.documentElement.dataset.theme=mode==='mobile'?'dark':'light';
for(const e of document.querySelectorAll('[data-icon]'))if(icons[e.dataset.icon])e.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true">${icons[e.dataset.icon]}</svg>`;
$('dial-open').classList.remove('hidden');$('self-name').textContent='Alex';$('self-avatar').textContent='A';$('connection').textContent='Ready for conversations';$('connection').classList.add('online');
const contacts=[['maya','Maya Chen'],['leo','Leo Martin'],['sam','Sam Rivera'],['nora','Nora Williams'],['jules','Jules Park'],['robin','Robin Ellis']];
$('contacts').replaceChildren();$('contact-count').textContent=contacts.length;
for(const [i,[id,label]]of contacts.entries()){
 const row=document.createElement('div');row.className='person-row';const button=document.createElement('button');button.className='contact'+(id==='maya'&&mode!=='home'?' selected':'');button.type='button';button.ariaLabel='Chat with '+label;
 const avatar=document.createElement('div');avatar.className='avatar';avatar.dataset.tone=String(i%5);avatar.textContent=label.split(' ').map(w=>w[0]).join('');const text=document.createElement('div');text.className='contact-text';const strong=document.createElement('strong');strong.textContent=label;text.append(strong);button.append(avatar,text);
 if(mode==='home'&&i===0){const badge=document.createElement('span');badge.className='unread';badge.textContent='2';button.append(badge);}
 const actions=document.createElement('div');actions.className='person-actions';for(const [kind,cls,aria]of [['video','home-call','Video call'],['more','home-contact-options','Contact options for']]){const b=document.createElement('button');b.className=cls;b.type='button';b.ariaLabel=aria+' '+label;b.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true">${icons[kind]}</svg>`;actions.append(b);}
 row.append(button,actions);$('contacts').append(row);button.onclick=()=>{location.href='/?view=mobile';};
}
$('peer-name').textContent='Maya Chen';$('peer-avatar').textContent='MC';
if(mode==='home'){$('conversation').classList.add('hidden');$('empty').classList.remove('hidden');}
else{
 document.querySelector('.app').classList.add('chat-open');$('conversation').classList.remove('hidden');$('empty').classList.add('hidden');
 const picture=new Image();picture.src='/example.svg';await picture.decode();const canvas=document.createElement('canvas');canvas.width=960;canvas.height=560;canvas.getContext('2d').drawImage(picture,0,0);const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));
 const now=Date.now(),self='demo-self',peer='demo-maya';
 const make=(id,from,text,minutes)=>({id,from,to:from===self?peer:self,text,createdAt:now-minutes*60000,expiresAt:now+(60-minutes)*60000,receipt:from===self?{deliveredAt:now-minutes*60000+1000,readAt:now-minutes*60000+4000}:undefined});
 const list=[make('demo-1',peer,'Made it home. How was your day?',8),make('demo-2',self,'Much better after this view ☀️',7),{...make('demo-3',self,'Found a quiet spot for our next call.',6),attachment:{id:'demo-photo',name:'Afternoon by the lake.png',type:'image/png',size:blob.size,chunks:1},blobURL:URL.createObjectURL(blob),reactions:{[peer]:'❤️'}},make('demo-4',peer,'That looks lovely. Video call in a minute?',3),make('demo-5',self,'Absolutely. I’ll call you now.',2)];
 drawMessages({container:$('messages'),list,self,options:()=>{},openMedia:()=>{},load:()=>{},save:()=>{}});
}
$('settings').onclick=()=>{$('settings-dialog').showModal();};
$('back').onclick=()=>{location.href='/?view=home';};
document.body.dataset.previewReady='true';
