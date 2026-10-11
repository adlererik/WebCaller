// Authenticated TURN Allocate probe using the server-held REST secret.
// Prints allocation evidence only, never a TURN password/shared secret.
import dgram from 'node:dgram';
import {randomBytes,createHash,createHmac} from 'node:crypto';
const host=process.argv[2],port=Number(process.argv[3]||3478);
if(!host)throw new Error('Supply the relay hostname or IP');
if(!process.env.TURN_SECRET)throw new Error('Load the server .env with TURN_SECRET');
const username=`${Math.floor(Date.now()/1000)+120}:diagnostic`;
const password=createHmac('sha1',process.env.TURN_SECRET).update(username).digest('base64');
const cookie=Buffer.from('2112a442','hex');
function attribute(type,data){const b=Buffer.alloc(4+Math.ceil(data.length/4)*4);b.writeUInt16BE(type);b.writeUInt16BE(data.length,2);data.copy(b,4);return b;}
function packet(attrs,integrityKey){
 const id=randomBytes(12),parts=Buffer.concat(attrs),head=Buffer.alloc(20);head.writeUInt16BE(3);head.writeUInt16BE(parts.length+(integrityKey?24:0),2);cookie.copy(head,4);id.copy(head,8);
 const prefix=Buffer.concat([head,parts]);return {id,data:integrityKey?Buffer.concat([prefix,attribute(8,createHmac('sha1',integrityKey).update(prefix).digest())]):prefix};
}
function parse(data,id){
 if(!data.subarray(8,20).equals(id))throw new Error('Transaction mismatch');
 const attributes=new Map();let p=20;
 while(p+4<=data.length){const type=data.readUInt16BE(p),len=data.readUInt16BE(p+2);attributes.set(type,data.subarray(p+4,p+4+len));p+=4+Math.ceil(len/4)*4;}
 return {type:data.readUInt16BE(0),attributes};
}
const socket=dgram.createSocket('udp4');
async function exchange(p){
 return await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{socket.off('message',receive);reject(new Error('TURN response timed out: '+host+':'+port));},5000);
  function receive(data){if(!data.subarray(8,20).equals(p.id))return;clearTimeout(timer);socket.off('message',receive);try{resolve(parse(data,p.id));}catch(e){reject(e);}}
  socket.on('message',receive);socket.send(p.data,port,host,e=>{if(e){clearTimeout(timer);socket.off('message',receive);reject(e);}});
 });
}
try{
 const transport=attribute(0x19,Buffer.from([17,0,0,0]));const challenge=await exchange(packet([transport]));
 const realm=challenge.attributes.get(0x14),nonce=challenge.attributes.get(0x15);if(!realm||!nonce)throw new Error('No authentication challenge');
 const key=createHash('md5').update(`${username}:${realm.toString()}:${password}`).digest();
 const result=await exchange(packet([transport,attribute(6,Buffer.from(username)),attribute(0x14,realm),attribute(0x15,nonce)],key));
 if(result.type!==0x103)throw new Error('Allocation rejected: '+result.attributes.get(9)?.toString('hex'));
 const relay=result.attributes.get(0x16);if(!relay||relay[1]!==1)throw new Error('Missing IPv4 relay address');
 const relayIP=[...relay.subarray(4,8)].map((n,i)=>n^cookie[i]).join('.');const relayPort=relay.readUInt16BE(2)^0x2112;
 console.log(`PASS authenticated TURN allocation via ${host}:${port}; advertised relay ${relayIP}:${relayPort}`);
}finally{socket.close();}
