import {createPublicKey,verify} from 'node:crypto';
import {applicationSignatureParts,signingKeyType,delegatedSigningStatement} from '../public/application-signatures.js';

// Node verification is synchronous because envelope validation is synchronous.
// Parsing and signed certificate bytes are shared with the browser verifier.
export function verifyApplicationSignature(root,owner,text,value){
  try{
    const parts=applicationSignatureParts(value),type=signingKeyType(root),key=createPublicKey({key:root,format:'jwk'});
    const p256=(message,signature)=>verify('sha256',Buffer.from(message),{key,dsaEncoding:'ieee-p1363'},signature);
    if(parts.algorithm==='P-256')return type==='P-256'&&p256(text,parts.signature);
    if(!parts.key)return type==='Ed25519'&&verify(null,Buffer.from(text),key,parts.signature);
    if(type!=='P-256'||typeof owner!=='string'||!p256(delegatedSigningStatement(owner,parts.publicKey),parts.certificate))return false;
    const signer=createPublicKey({key:{kty:'OKP',crv:'Ed25519',x:parts.publicKey},format:'jwk'});
    return verify(null,Buffer.from(text),signer,parts.signature);
  }catch{return false;}
}
