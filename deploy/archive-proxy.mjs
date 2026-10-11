// Optional bridge for the operator's existing Archive origin on port 3000.
// Runs before the Archive request handler, so /calls bypasses its visitor logging.
import http from 'node:http';
export function proxyCalls(req,res) {
  const path=(req.url||'').split('?')[0];
  if(path!=='/calls'&&!path.startsWith('/calls/'))return false;
  const headers={...req.headers,host:'127.0.0.1:8080'};
  delete headers.cookie; // The phone has its own device identity; do not forward site cookies.
  const upstream=http.request({hostname:'127.0.0.1',port:8080,path:req.url,method:req.method,headers},response=>{
    res.writeHead(response.statusCode,response.headers);response.pipe(res);
  });
  upstream.on('error',()=>{if(!res.headersSent)res.writeHead(503,{'Content-Type':'text/plain','Cache-Control':'no-store'});res.end('Calling is temporarily unavailable. Please try again.');});
  req.on('aborted',()=>upstream.destroy());res.on('close',()=>upstream.destroy());req.pipe(upstream);return true;
}
export function proxyCallUpgrade(req,socket,head) {
  if(req.url!=='/calls/ws'){socket.destroy();return;}
  const headers={...req.headers,host:'127.0.0.1:8080'};delete headers.cookie;
  const upstream=http.request({hostname:'127.0.0.1',port:8080,path:req.url,method:req.method,headers});
  upstream.on('upgrade',(response,peer,extra)=>{
    socket.write(`HTTP/1.1 101 Switching Protocols\r\n${Object.entries(response.headers).map(([k,v])=>`${k}: ${v}`).join('\r\n')}\r\n\r\n`);
    if(head.length)peer.write(head);if(extra.length)socket.write(extra);
    peer.on('error',()=>socket.destroy());socket.on('error',()=>peer.destroy());
    socket.on('close',()=>peer.destroy());peer.on('close',()=>socket.destroy());socket.pipe(peer).pipe(socket);
  });
  upstream.on('response',response=>{socket.end(`HTTP/1.1 ${response.statusCode} Upgrade rejected\r\nConnection: close\r\n\r\n`);response.resume();});
  upstream.on('error',()=>socket.destroy());socket.on('error',()=>upstream.destroy());upstream.end();
}
