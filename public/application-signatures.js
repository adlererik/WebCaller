// Versioned application signatures, separate from libsignal and call SAS.
// Existing P-256 identities authorize one Ed25519 signing key without changing
// their identity fingerprints. New identities sign directly with Ed25519.
const encoder=new TextEncoder(),PREFIX='ed25519-v1';
const encode=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
function decode(value,size){
  if(typeof value!=='string'||!new RegExp(`^[A-Za-z0-9_-]{${Math.ceil(size*4/3)}}$`).test(value))throw Error('Invalid signature.');
  const bytes=Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
  if(bytes.length!==size||encode(bytes)!==value)throw Error('Invalid signature.');return bytes;
}
export function signingKeyType(key){
  if(!key||typeof key!=='object'||key.d!==undefined)return null;
  try{
    if(key.kty==='OKP'&&key.crv==='Ed25519'&&key.y===undefined){decode(key.x,32);return 'Ed25519';}
    if(key.kty==='EC'&&key.crv==='P-256'){decode(key.x,32);decode(key.y,32);return 'P-256';}
  }catch{}return null;
}
export const delegatedSigningStatement=(owner,key)=>JSON.stringify(['WebCaller application signing key v1',owner,key]);
export function applicationSignatureParts(value){
  if(typeof value!=='string'||value.length>256)throw Error('Invalid signature.');
  if(!value.includes('.'))return {algorithm:'P-256',signature:decode(value,64)};
  const parts=value.split('.');if(parts[0]!==PREFIX||![2,4].includes(parts.length))throw Error('Invalid signature.');
  if(parts.length===2)return {algorithm:'Ed25519',signature:decode(parts[1],64)};
  return {algorithm:'Ed25519',key:decode(parts[1],32),publicKey:parts[1],certificate:decode(parts[2],64),signature:decode(parts[3],64)};
}
export function validApplicationSignature(value){try{applicationSignatureParts(value);return true;}catch{return false;}}
async function rootVerify(root,text,signature){
  const type=signingKeyType(root);if(!type)return false;
  const algorithm=type==='Ed25519'?{name:'Ed25519'}:{name:'ECDSA',namedCurve:'P-256'};
  const key=await crypto.subtle.importKey('jwk',root,algorithm,false,['verify']);
  return crypto.subtle.verify(type==='Ed25519'?'Ed25519':{name:'ECDSA',hash:'SHA-256'},key,signature,encoder.encode(text));
}
export async function verifyApplicationSignature(root,owner,text,value){
  try{
    const parts=applicationSignatureParts(value),type=signingKeyType(root);
    if(parts.algorithm==='P-256')return type==='P-256'&&await rootVerify(root,text,parts.signature);
    if(!parts.key)return type==='Ed25519'&&await rootVerify(root,text,parts.signature);
    if(type!=='P-256'||typeof owner!=='string'||!await rootVerify(root,delegatedSigningStatement(owner,parts.publicKey),parts.certificate))return false;
    const key=await crypto.subtle.importKey('raw',parts.key,'Ed25519',false,['verify']);
    return await crypto.subtle.verify('Ed25519',key,parts.signature,encoder.encode(text));
  }catch{return false;}
}
export async function signApplication(signer,text){
  const key=signer.key;
  if(key.algorithm.name==='Ed25519'){
    const signature=encode(await crypto.subtle.sign('Ed25519',key,encoder.encode(text)));
    return signer.publicKey?`${PREFIX}.${signer.publicKey}.${signer.certificate}.${signature}`:`${PREFIX}.${signature}`;
  }
  // Historical v1 helper only. Active Signal envelopes always use Ed25519.
  if(key.algorithm.name!=='ECDSA'||key.algorithm.namedCurve!=='P-256')throw Error('Unsupported signing identity.');
  return encode(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,encoder.encode(text)));
}
export async function prepareApplicationSigner(identity,owner,prior){
  const type=signingKeyType(identity.keys.sign);
  if(type==='Ed25519'){
    if(identity.sign.algorithm.name!=='Ed25519')throw Error('Signing identity does not match.');
    return {key:identity.sign};
  }
  if(type!=='P-256'||identity.sign.algorithm.name!=='ECDSA')throw Error('Unsupported signing identity.');
  let signer=prior;
  if(!signer){
    let pair;try{pair=await crypto.subtle.generateKey('Ed25519',false,['sign','verify']);}
    catch{throw Error('This browser needs Ed25519 support. Update your browser; keep its site data.');}
    const publicKey=encode(await crypto.subtle.exportKey('raw',pair.publicKey));
    const certificate=encode(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},identity.sign,encoder.encode(delegatedSigningStatement(owner,publicKey))));
    signer={v:1,key:pair.privateKey,publicKey,certificate};
  }
  if(signer.v!==1||signer.key?.algorithm?.name!=='Ed25519'||signer.key.extractable!==false||!signer.publicKey||!signer.certificate)throw Error('Stored application signing key is invalid. Keep this browser’s site data.');
  const challenge='WebCaller application signer check '+encode(crypto.getRandomValues(new Uint8Array(32)));
  if(!await verifyApplicationSignature(identity.keys.sign,owner,challenge,await signApplication(signer,challenge)))throw Error('Stored application signing key does not match this identity.');
  return signer;
}
