// Read public Olm framing only. Encryption and ratchet state belong to Vodozemac.
import {b64,unb64} from './crypto.js';
function fields(bytes){
  const result=new Map();let offset=0;
  function number(){let value=0;for(let shift=0;shift<=49;shift+=7){if(offset>=bytes.length)throw new Error('Invalid Olm framing.');const byte=bytes[offset++];value+=(byte&127)*2**shift;if(!Number.isSafeInteger(value))break;if(!(byte&128))return value;}throw new Error('Invalid Olm framing.');}
  while(offset<bytes.length){const tag=number(),id=Math.floor(tag/8),wire=tag%8;if(!id||result.has(id))throw new Error('Invalid Olm framing.');
    if(wire===0)result.set(id,number());
    else if(wire===2){const size=number();if(size>bytes.length-offset)throw new Error('Invalid Olm framing.');result.set(id,bytes.subarray(offset,offset+size));offset+=size;}
    else throw new Error('Invalid Olm framing.');
  }return result;
}
export function olmFraming(r){
  let bytes=unb64(r.data);if(r.type===0){if(bytes[0]!==3)throw new Error('Invalid Olm prekey framing.');bytes=fields(bytes.subarray(1)).get(4);}
  if(!(bytes instanceof Uint8Array)||bytes[0]!==4||bytes.length<34)throw new Error('A full-authentication Olm v2 message is required.');
  const f=fields(bytes.subarray(1,bytes.length-32)),key=f.get(1),index=f.get(2)||0;
  if(!(key instanceof Uint8Array)||key.length!==32||typeof index!=='number')throw new Error('Invalid Olm ratchet header.');
  return {key:b64(key),index};
}
export function orderedEnvelopes(envelopes){
  const groups=new Map();
  for(const e of envelopes){let key='legacy',index=e.createdAt;
    if(e.v>=2)try{const h=olmFraming(e.ratchet);key=e.from+'/'+e.ratchet.sessionId+'/'+h.key;index=h.index;}catch{key='invalid/'+e.id;}
    if(!groups.has(key))groups.set(key,[]);groups.get(key).push({e,index});
  }
  return [...groups.values()].flatMap(group=>group.sort((a,b)=>a.index-b.index).map(row=>row.e));
}
