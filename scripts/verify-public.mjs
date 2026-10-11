import {WebSocket} from 'ws';
const url=new URL(process.argv[2]||process.env.PUBLIC_URL||'http://localhost:8080/calls');
const base=url.pathname.replace(/\/$/,'');
for(const path of ['/', '/health','/api/config','/app.js','/media.js']){
  const r=await fetch(url.origin+base+path,{signal:AbortSignal.timeout(15000)});
  if(!r.ok||r.headers.get('cache-control')!=='no-store')throw new Error('Unexpected public response at '+path+': '+r.status);
  console.log('PASS HTTP '+path+' · no-store');
}
await new Promise((resolve,reject)=>{
  const ws=new WebSocket(url.origin.replace('https:','wss:').replace('http:','ws:')+base+'/ws',{origin:url.origin,handshakeTimeout:15000});
  const timer=setTimeout(()=>{ws.terminate();reject(new Error('WebSocket verification timed out'));},20000);
  ws.on('open',()=>ws.send(JSON.stringify({type:'auth',ticket:'not-a-valid-ticket'})));
  ws.on('error',reject);
  ws.on('close',code=>{clearTimeout(timer);if(code!==4401)return reject(new Error('Unexpected close code '+code));console.log('PASS WebSocket upgrade · unauthenticated access rejected');resolve();});
});
