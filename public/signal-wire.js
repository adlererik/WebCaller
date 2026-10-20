// Only public bounds/order hints. Authentication and parsing belong to libsignal.
import {unb64} from './crypto.js';
export function signalFraming(r){
 if(r?.protocol!=='signal-pqxdh-v1'||![2,3].includes(r.type)||typeof r.data!=='string'||r.data.length>24000)throw Error('Invalid Signal message framing');
 const bytes=unb64(r.data);if(bytes.length<9||(bytes[0]>>4)<3)throw Error('Invalid Signal message framing');
 return {key:r.sessionId,index:0};
}
export function orderedEnvelopes(envelopes){return [...envelopes].sort((a,b)=>a.createdAt-b.createdAt||a.id.localeCompare(b.id));}
