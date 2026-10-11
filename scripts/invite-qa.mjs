// Isolated localhost test of the recipient's one-button invitation flow.
import {createApp} from '../server/index.mjs';
import {newIdentity,seal} from '../public/crypto.js';
import {WebSocket} from 'ws';
const origin='http://localhost:8091',base='/calls';
const app=createApp({dataDir:':memory:',env:{PUBLIC_URL:origin+base,BOOTSTRAP_TOKEN:'isolated-qa-code',VAPID_PUBLIC_KEY:'',VAPID_PRIVATE_KEY:'',CF_TURN_KEY_ID:'',CF_TURN_API_TOKEN:'',TURN_SECRET:'',TURN_URLS:''}});
await new Promise(r=>app.server.listen(8091,'127.0.0.1',r));
const identity=await newIdentity();let token,user;
const api=async(path,method='GET',body)=>{const r=await fetch(origin+base+'/api'+path,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});const b=await r.json();if(!r.ok)throw new Error(b.error);return b;};
const setup=await api('/register','POST',{name:'QA caller',keys:identity.keys,setupCode:'isolated-qa-code'});({token,user}=setup);
const invitation=await api('/invite','POST',{});console.log('Local disposable QA invitation: '+invitation.url);
const {ticket}=await api('/ticket','POST',{});const ws=new WebSocket(origin.replace('http','ws')+base+'/ws',{origin});ws.on('open',()=>ws.send(JSON.stringify({type:'auth',ticket})));
ws.on('message',async raw=>{if(JSON.parse(raw).type==='contacts'){const {contacts}=await api('/me');const peer=contacts[0];if(peer)await api('/messages','POST',await seal(identity,user.id,peer,{kind:'text',text:'Invitation accepted. This encrypted message reached your browser.'},300));}});
