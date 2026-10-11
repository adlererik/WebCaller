// Synthetic peer for LOCAL UI QA only. Never contacts a real person.
import {newIdentity,seal,open} from '../public/crypto.js';
import {WebSocket} from 'ws';
const invitation=new URL(process.argv[2]);
if(invitation.hostname!=='localhost')throw new Error('This QA peer is local-only');
const origin=invitation.origin,base=invitation.pathname.replace(/\/$/,'');
const [invite,fingerprint]=new URLSearchParams(invitation.hash.slice(1)).get('invite').split('.');
const identity=await newIdentity();let token;
const api=async(path,method='GET',body)=>{
 const r=await fetch(origin+base+'/api'+path,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});const b=await r.json();if(!r.ok)throw new Error(b.error);return b;
};
const joined=await api('/join','POST',{name:'QA peer',keys:identity.keys,invite,fingerprint});token=joined.token;
const {ticket}=await api('/ticket','POST',{});const ws=new WebSocket(origin.replace('http','ws')+base+'/ws',{origin});
ws.on('open',()=>ws.send(JSON.stringify({type:'auth',ticket})));
ws.on('message',async raw=>{
 const event=JSON.parse(raw);
 if(event.type==='ready'){await api('/messages','POST',await seal(identity,joined.user.id,joined.contact,{kind:'text',text:'Hello from the local test peer. This conversation is encrypted.'},300));console.log('Synthetic peer connected; awaiting a test message.');}
 if(event.type==='message'&&event.envelope.from!==joined.user.id){
  const m=await open(identity,joined.user.id,joined.contact,event.envelope);
  if(m.kind==='text'){console.log('Synthetic peer decrypted the reply successfully.');await api('/messages','POST',await seal(identity,joined.user.id,joined.contact,{kind:'text',text:'Received. Your reply decrypted successfully.'},30));}
 }
});
