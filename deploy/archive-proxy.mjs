// Optional bridge for the operator's existing Archive origin on port 3000.
// Runs before the Archive request handler, so app routes bypass visitor logging.
// Read the app's own private configuration, independent of the website's cwd/env.
import http from 'node:http';
import {readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {appPaths,retiredAppPaths} from '../server/app-paths.mjs';
export function proxyOptions(env) {
  if(!env.PUBLIC_URL)return {};
  const url=new URL(env.PUBLIC_URL),paths=appPaths(url,env.APP_PATH_ALIASES||'');
  return {paths,retiredPaths:retiredAppPaths(url,env.APP_RETIRED_PATHS||'',paths)};
}
export function archiveProxy({hostname='127.0.0.1',port=8080,paths=['/com','/calls'],retiredPaths=[]}={}) {
function proxyCalls(req,res) {
  const path=(req.url||'').split('?')[0];
  if(retiredPaths.some(base=>path===base||path.startsWith(base+'/'))){
    res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow, noarchive'});res.end(req.method==='HEAD'?undefined:'Not found');return true;
  }
  if(!paths.some(base=>path===base||path.startsWith(base+'/')))return false;
  const headers={...req.headers,host:`${hostname}:${port}`};
  delete headers.cookie; // The phone has its own device identity; do not forward site cookies.
  const upstream=http.request({hostname,port,path:req.url,method:req.method,headers},response=>{
    res.writeHead(response.statusCode,response.headers);response.pipe(res);
  });
  upstream.on('error',()=>{if(!res.headersSent)res.writeHead(503,{'Content-Type':'text/plain','Cache-Control':'no-store'});res.end('Calling is temporarily unavailable. Please try again.');});
  req.on('aborted',()=>upstream.destroy());res.on('close',()=>upstream.destroy());req.pipe(upstream);return true;
}
function proxyCallUpgrade(req,socket,head) {
  if(!paths.some(base=>req.url===base+'/ws')){socket.destroy();return;}
  const headers={...req.headers,host:`${hostname}:${port}`};delete headers.cookie;
  const upstream=http.request({hostname,port,path:req.url,method:req.method,headers});
  upstream.on('upgrade',(response,peer,extra)=>{
    socket.write(`HTTP/1.1 101 Switching Protocols\r\n${Object.entries(response.headers).map(([k,v])=>`${k}: ${v}`).join('\r\n')}\r\n\r\n`);
    if(head.length)peer.write(head);if(extra.length)socket.write(extra);
    peer.on('error',()=>socket.destroy());socket.on('error',()=>peer.destroy());
    socket.on('close',()=>peer.destroy());peer.on('close',()=>socket.destroy());socket.pipe(peer).pipe(socket);
  });
  upstream.on('response',response=>{socket.end(`HTTP/1.1 ${response.statusCode} Upgrade rejected\r\nConnection: close\r\n\r\n`);response.resume();});
  upstream.on('error',()=>socket.destroy());socket.on('error',()=>upstream.destroy());upstream.end();
}

return {proxyCalls,proxyCallUpgrade};
}
let privateEnv={};
try{privateEnv=parseEnv(readFileSync(new URL('../.env',import.meta.url),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
export const {proxyCalls,proxyCallUpgrade}=archiveProxy(proxyOptions(privateEnv));
