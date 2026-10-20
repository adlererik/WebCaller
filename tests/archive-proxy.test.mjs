import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {WebSocketServer,WebSocket} from 'ws';
import {archiveProxy} from '../deploy/archive-proxy.mjs';
test('both app paths bypass website logging and strip unrelated cookies for HTTP and WebSockets',async t=>{
  const received=[],logged=[];
  const backend=http.createServer((req,res)=>{received.push({url:req.url,cookie:req.headers.cookie});res.end(req.url);});backend.listen(0,'127.0.0.1');await once(backend,'listening');
  const sockets=new WebSocketServer({server:backend});sockets.on('connection',(ws,req)=>{received.push({url:req.url,cookie:req.headers.cookie});ws.send('connected');});
  const {proxyCalls,proxyCallUpgrade}=archiveProxy({port:backend.address().port});
  const gateway=http.createServer((req,res)=>{if(proxyCalls(req,res))return;logged.push(req.url);res.end('ordinary website');});gateway.on('upgrade',proxyCallUpgrade);gateway.listen(0,'127.0.0.1');await once(gateway,'listening');
  t.after(()=>{gateway.closeAllConnections();gateway.close();sockets.close();backend.closeAllConnections();backend.close();});const origin='http://127.0.0.1:'+gateway.address().port;
  for(const base of ['/com','/calls']){
    assert.equal(await(await fetch(origin+base+'/health',{headers:{Cookie:'synthetic_site_cookie=example'}})).text(),base+'/health');
    const ws=new WebSocket(origin.replace('http:','ws:')+base+'/ws',{headers:{Cookie:'synthetic_site_cookie=example'}});assert.equal((await once(ws,'message'))[0].toString(),'connected');ws.close();await once(ws,'close');
  }
  assert.deepEqual(logged,[]);assert.equal(received.length,4);assert.ok(received.every(req=>req.cookie===undefined));
  assert.equal(await(await fetch(origin+'/company')).text(),'ordinary website');assert.deepEqual(logged,['/company']);
});
