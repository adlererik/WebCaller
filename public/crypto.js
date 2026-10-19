const enc = new TextEncoder(), dec = new TextDecoder();
export const b64 = (data) => btoa(String.fromCharCode(...new Uint8Array(data))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
export const unb64 = (text) => Uint8Array.from(atob(text.replaceAll('-','+').replaceAll('_','/')), c => c.charCodeAt(0));
const curve = { name: 'ECDH', namedCurve: 'P-256' };
const signing = { name: 'ECDSA', namedCurve: 'P-256' };
export async function newIdentity() {
  const dh = await crypto.subtle.generateKey(curve, false, ['deriveBits']);
  const sign = await crypto.subtle.generateKey(signing, false, ['sign','verify']);
  const keys = { dh: await crypto.subtle.exportKey('jwk', dh.publicKey), sign: await crypto.subtle.exportKey('jwk', sign.publicKey) };
  return { dh: dh.privateKey, sign: sign.privateKey, keys };
}
export async function fingerprint(keys) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(JSON.stringify(keys))));
  return [...bytes].map(b => b.toString(16).padStart(2,'0')).join('');
}
export async function safetyNumber(a,b) {
  const f = [await fingerprint(a), await fingerprint(b)].sort();
  return (await fingerprint(f)).match(/.{1,4}/g).join(' ');
}
function header(e) { return JSON.stringify({ v:e.v, id:e.id, from:e.from, to:e.to, createdAt:e.createdAt, expiresAt:e.expiresAt }); }
function unsigned(e) { return JSON.stringify({ v:e.v, id:e.id, from:e.from, to:e.to, createdAt:e.createdAt, expiresAt:e.expiresAt, ephemeral:e.ephemeral, iv:e.iv, ciphertext:e.ciphertext, selfCiphertext:e.selfCiphertext }); }
async function aes(privateKey, publicJwk, context) {
  const pub = await crypto.subtle.importKey('jwk', publicJwk, curve, false, []);
  const shared = await crypto.subtle.deriveBits({ name:'ECDH', public:pub }, privateKey, 256);
  const material = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name:'HKDF', hash:'SHA-256', salt:enc.encode(context), info:enc.encode('webcaller-v1') }, material, { name:'AES-GCM', length:256 }, false, ['encrypt','decrypt']);
}
export async function seal(identity, from, contact, payload, ttl = 86400) {
  const pair = await crypto.subtle.generateKey(curve, false, ['deriveBits']);
  const createdAt = Date.now();
  const e = { v:1, id:crypto.randomUUID(), from, to:contact.id, createdAt, expiresAt:createdAt+ttl*1000,
    ephemeral:await crypto.subtle.exportKey('jwk', pair.publicKey), iv:b64(crypto.getRandomValues(new Uint8Array(12))) };
  const data = enc.encode(JSON.stringify(payload)), additionalData = enc.encode(header(e));
  const params = { name:'AES-GCM', iv:unb64(e.iv), additionalData };
  e.ciphertext = b64(await crypto.subtle.encrypt(params, await aes(pair.privateKey, contact.keys.dh, header(e)), data));
  e.selfCiphertext = b64(await crypto.subtle.encrypt(params, await aes(pair.privateKey, identity.keys.dh, header(e)), data));
  e.signature = b64(await crypto.subtle.sign({ name:'ECDSA', hash:'SHA-256' }, identity.sign, enc.encode(unsigned(e))));
  return e;
}
export async function open(identity, self, contact, e) {
  if (e.expiresAt <= Date.now()) throw new Error('Expired');
  const outgoing = e.from === self;
  if ((outgoing && e.to !== contact.id) || (!outgoing && (e.from !== contact.id || e.to !== self))) throw new Error('Wrong recipient');
  const signingKey = await crypto.subtle.importKey('jwk', outgoing ? identity.keys.sign : contact.keys.sign, signing, false, ['verify']);
  if (!await crypto.subtle.verify({ name:'ECDSA', hash:'SHA-256' }, signingKey, unb64(e.signature), enc.encode(unsigned(e)))) throw new Error('Invalid signature');
  const clear = await crypto.subtle.decrypt({ name:'AES-GCM', iv:unb64(e.iv), additionalData:enc.encode(header(e)) }, await aes(identity.dh, e.ephemeral, header(e)), unb64(outgoing ? e.selfCiphertext : e.ciphertext));
  return JSON.parse(dec.decode(clear));
}
export async function vault(action, value) {
  const db = await new Promise((resolve,reject) => {
    const r = indexedDB.open('webcaller-device',1);
    r.onupgradeneeded = () => r.result.createObjectStore('device');
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
  try { return await new Promise((resolve,reject) => {
    const tx = db.transaction('device', action === 'get' ? 'readonly' : 'readwrite');
    const store = tx.objectStore('device');
    const r = action === 'get' || action === 'create' ? store.get('identity') : action === 'delete' ? store.delete('identity') : store.put(value,'identity');
    let result; r.onsuccess = () => {
      if(action === 'create' && r.result === undefined){store.add(value,'identity');result=value;}
      else result=r.result;
    }; tx.oncomplete = () => resolve(result); tx.onerror = tx.onabort = () => reject(tx.error||new Error('Device storage was interrupted'));
  }); } finally { db.close(); }
}
