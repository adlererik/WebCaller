import {b64,unb64} from './crypto.js';
export const MAX_FILE_SIZE=10*1024*1024, CHUNK_SIZE=64*1024;
const enc=new TextEncoder();
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const imageTypes=new Set(['image/jpeg','image/png','image/webp','image/gif','image/avif']);
export const videoTypes=new Set(['video/mp4','video/webm','video/ogg','video/quicktime']);
export const audioTypes=new Set(['audio/mp4','audio/webm','audio/ogg','audio/mpeg','audio/wav','audio/x-wav','audio/aac','audio/flac']);
export function mediaKind(type){const base=(type||'').split(';')[0].trim().toLowerCase();return imageTypes.has(base)?'image':videoTypes.has(base)?'video':audioTypes.has(base)?'audio':'file';}
export function fileSize(size){return size<1024?`${size} B`:size<1024*1024?`${Math.ceil(size/1024)} KB`:`${(size/1024/1024).toFixed(1)} MB`;}
export function validAttachment(a){
  return !!a&&uuid.test(a.id)&&typeof a.name==='string'&&a.name.length>0&&a.name.length<=255&&typeof a.type==='string'&&a.type.length<=100&&Number.isSafeInteger(a.size)&&a.size>0&&a.size<=MAX_FILE_SIZE&&a.chunks===Math.ceil(a.size/CHUNK_SIZE)&&typeof a.key==='string'&&/^[A-Za-z0-9_-]{43}$/.test(a.key)&&typeof a.nonce==='string'&&/^[A-Za-z0-9_-]{11}$/.test(a.nonce);
}
export function newAttachment(file){
  if(!file.size||file.size>MAX_FILE_SIZE)throw new Error('Choose a file between 1 byte and 10 MB.');
  return {id:crypto.randomUUID(),name:(file.name||'file').slice(0,255),type:(file.type||'application/octet-stream').slice(0,100),size:file.size,chunks:Math.ceil(file.size/CHUNK_SIZE),key:b64(crypto.getRandomValues(new Uint8Array(32))),nonce:b64(crypto.getRandomValues(new Uint8Array(8)))};
}
export async function attachmentKey(a){
  if(!validAttachment(a))throw new Error('Invalid attachment');
  return crypto.subtle.importKey('raw',unb64(a.key),{name:'AES-GCM'},false,['encrypt','decrypt']);
}
function params(a,index,expiresAt){
  if(!Number.isInteger(index)||index<0||index>=a.chunks||!Number.isSafeInteger(expiresAt)||expiresAt<=Date.now())throw new Error('Attachment expired or invalid chunk');
  const iv=new Uint8Array(12);iv.set(unb64(a.nonce));new DataView(iv.buffer).setUint32(8,index);
  return {name:'AES-GCM',iv,additionalData:enc.encode(JSON.stringify({v:1,id:a.id,index,size:a.size,expiresAt}))};
}
export async function encryptChunk(key,a,index,expiresAt,bytes){
  const expected=Math.min(CHUNK_SIZE,a.size-index*CHUNK_SIZE);
  if(bytes.byteLength!==expected)throw new Error('Invalid chunk size');
  return crypto.subtle.encrypt(params(a,index,expiresAt),key,bytes);
}
export async function decryptChunk(key,a,index,expiresAt,bytes){
  const expected=Math.min(CHUNK_SIZE,a.size-index*CHUNK_SIZE);
  if(bytes.byteLength!==expected+16)throw new Error('Invalid encrypted chunk size');
  return crypto.subtle.decrypt(params(a,index,expiresAt),key,bytes);
}
