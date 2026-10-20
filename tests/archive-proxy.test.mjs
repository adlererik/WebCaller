import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {WebSocketServer,WebSocket} from 'ws';
import {archiveProxy,proxyOptions} from '../deploy/archive-proxy.mjs';
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
test('private configuration forwards only the replacement, with no retired redirects or visitor logging',async t=>{
  const base='/0123456789abcdef',options=proxyOptions({PUBLIC_URL:'https://example.com'+base,APP_PATH_ALIASES:'',APP_RETIRED_PATHS:'/com,/calls'});
  assert.deepEqual(options,{paths:[base],retiredPaths:['/calls','/com']});
  const received=[],logged=[],backend=http.createServer((req,res)=>{received.push(req.url);res.end('app');});
  backend.listen(0,'127.0.0.1');await once(backend,'listening');
  const sockets=new WebSocketServer({server:backend});sockets.on('connection',ws=>ws.send('ready'));
  const {proxyCalls,proxyCallUpgrade}=archiveProxy({...options,port:backend.address().port});
  const gateway=http.createServer((req,res)=>{if(proxyCalls(req,res))return;logged.push(req.url);res.end('site');});gateway.on('upgrade',proxyCallUpgrade);gateway.listen(0,'127.0.0.1');await once(gateway,'listening');
  t.after(()=>{gateway.closeAllConnections();gateway.close();sockets.close();backend.closeAllConnections();backend.close();});
  const origin='http://127.0.0.1:'+gateway.address().port;
  for(const old of ['/calls','/calls/','/calls/api/config','/com','/com/health','/com/sw.js']){
    const r=await fetch(origin+old,{redirect:'manual'});assert.equal(r.status,404);assert.equal(r.headers.get('location'),null);assert.equal(await r.text(),'Not found');assert.equal(r.headers.get('cache-control'),'no-store');
  }
  assert.deepEqual(received,[]);assert.deepEqual(logged,[]);
  assert.equal(await(await fetch(origin+base+'/')).text(),'app');
  const ws=new WebSocket(origin.replace('http:','ws:')+base+'/ws');assert.equal((await once(ws,'message'))[0].toString(),'ready');ws.close();await once(ws,'close');
  for(const old of ['/calls','/com']){
    const ws=new WebSocket(origin.replace('http:','ws:')+old+'/ws');await new Promise(resolve=>ws.once('error',resolve));
  }
  assert.equal(await(await fetch(origin+'/company')).text(),'site');assert.deepEqual(logged,['/company']);
  assert.throws(()=>proxyOptions({PUBLIC_URL:'https://example.com/com',APP_RETIRED_PATHS:'/com/child'}));
});
