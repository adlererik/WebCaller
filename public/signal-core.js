// Experimental compatibility/storage adapter, not a reimplementation of Signal.
// Cryptographic operations execute in the pinned official libsignal Rust core.
import {loadSignalBinding} from './vendor/signal/load.js';
import {b64,unb64} from './crypto.js';
const enc=new TextEncoder(),dec=new TextDecoder();
let loading;
export async function loadSignal(){return loading ||= (async()=>{
 const binding=await loadSignalBinding();
 const run=request=>{const reply=JSON.parse(binding.dispatch(JSON.stringify({now:Date.now(),...request})));if(!reply.ok)throw Error(reply.error);return reply.result;};
 class Message {
  constructor(type,bytes){this.message_type=type;this.ciphertext=new Uint8Array(bytes);}
  free(){this.ciphertext?.fill(0);this.ciphertext=null;}
 }
 class Account {
  constructor(snapshot){this.state=snapshot?structuredClone(snapshot):run({action:'create',count:0}).account;this.consumed=[];}
  static from_state(snapshot){return new Account(snapshot);}
  get snapshot(){return structuredClone(this.state);}
  get public(){return run({action:'public',account:this.state});}
  get curve25519_key(){return this.public.identity;}
  get max_number_of_one_time_keys(){return 64;}
  generate_one_time_keys(count){this.state=run({action:'replenish',account:this.state,count}).account;}
  get one_time_keys(){const pub=this.public;return pub.keys.map(prekey=>[String(prekey.id),JSON.stringify({identity:pub.identity,registration:pub.registration,signed:pub.signed,prekey})]);}
  mark_keys_as_published(ids){this.state=run({action:'published',account:this.state,ids:ids.map(Number)}).account;}
  create_outbound_session(identity,key){const bundle=JSON.parse(key);if(bundle.identity!==identity)throw Error('Bundle identity mismatch');return new Session({remote:identity,bundle},this);}
  create_inbound_session(identity,message){const session=new Session({remote:identity},this);return {session,plaintext:session.decrypt(message),free(){}};}
  free(){this.state=null;this.consumed=[];}
 }
 class Session {
  constructor(snapshot,account){if(!account)throw Error('Missing session account');this.state=structuredClone(snapshot);this.account=account;}
  static from_state(snapshot,account){return new Session(snapshot,account);}
  get snapshot(){return structuredClone(this.state);}
  get session_id(){if(!this.state.id)throw Error('Session not initialized');return this.state.id;}
  request(action,extra){
   const before=Object.keys(this.account.state.prekeys);
   const out=run({action,account:this.account.state,session:this.state.session||null,local:this.account.curve25519_key,remote:this.state.remote,expectedIdentity:this.state.remote,...extra});
   this.account.state=out.account;this.account.consumed=before.filter(id=>!(id in out.account.prekeys));
   this.state={session:out.session,id:out.id,remote:this.state.remote};return out.payload;
  }
  encrypt(text){const bytes=enc.encode(text);try{const p=this.request('encrypt',{bundle:this.state.bundle||null,plaintext:b64(bytes).replaceAll('-','+').replaceAll('_','/')});return new Message(p.type,unb64(p.data));}finally{bytes.fill(0);}}
  decrypt(message){const p=this.request('decrypt',{type:message.message_type,data:b64(message.ciphertext).replaceAll('-','+').replaceAll('_','/')});const bytes=unb64(p.plaintext);try{return dec.decode(bytes);}finally{bytes.fill(0);}}
  free(){this.state=null;this.account=null;}
 }
 return {Account,Session,SignalMessage:Message,SessionConfigVersion:{V2:4},run};
})();}
