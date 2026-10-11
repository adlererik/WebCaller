import test from 'node:test';
import assert from 'node:assert/strict';
import {measureCall,formatRate} from '../public/call-metrics.js';
const stats=(time=1000,sent=1000,received=2000)=>new Map([
 ['transport',{id:'transport',type:'transport',timestamp:time,bytesSent:sent,bytesReceived:received}],
 ['opus',{id:'opus',type:'codec',mimeType:'audio/opus'}],['vp8',{id:'vp8',type:'codec',mimeType:'video/VP8'}],['rtx',{id:'rtx',type:'codec',mimeType:'video/rtx'}],
 ['voice',{id:'voice',type:'outbound-rtp',kind:'audio',transportId:'transport',codecId:'opus',packetsSent:10,bytesSent:100,timestamp:time}],
 ['video',{id:'video',type:'inbound-rtp',kind:'video',transportId:'transport',codecId:'vp8',packetsReceived:20,bytesReceived:200,timestamp:time}],
 ['repair',{id:'repair',type:'outbound-rtp',kind:'video',transportId:'transport',codecId:'rtx',packetsSent:10,bytesSent:100,timestamp:time}]
]);
test('bundled media counts its transport once and measures actual send plus receive',()=>{
 const first=measureCall(stats());assert.equal(first.kbps,null);
 const next=measureCall(stats(2000,4000,7000),first.samples);
 assert.equal(next.kbps,64);assert.equal(next.uploadKbps,24);assert.equal(next.downloadKbps,40);
 assert.equal(next.audioCodec,'Opus');assert.equal(next.videoCodec,'VP8');assert.equal(next.rateSource,'transport payload');
});
test('counter resets, replacement transports and repeated timestamps do not spike rates',()=>{
 const first=measureCall(stats());assert.equal(measureCall(stats(2000,0,0),first.samples).kbps,null);
 assert.equal(measureCall(stats(1000,9000,9000),first.samples).kbps,null);
 const changed=stats(2000);changed.get('transport').id='new';assert.equal(measureCall(changed,first.samples).kbps,null);
});
test('only codecs actually reported on active media streams are displayed',()=>{
 const report=stats();report.set('unused',{type:'codec',mimeType:'video/AV1'});report.get('video').active=false;
 assert.equal(measureCall(report).videoCodec,'');report.get('voice').packetsSent=0;assert.equal(measureCall(report).audioCodec,'');
});
test('different negotiated send and receive codecs remain distinguishable',()=>{
 const report=stats();report.set('h264',{type:'codec',mimeType:'video/H264'});report.set('sendvideo',{id:'sendvideo',type:'outbound-rtp',kind:'video',codecId:'h264',packetsSent:1});
 assert.equal(measureCall(report).videoCodec,'↑H.264 ↓VP8');
});
test('browsers without transport counters fall back to RTP bytes without repair double counting',()=>{
 const first=stats();first.delete('transport');const prior=measureCall(first);assert.equal(prior.rateSource,'RTP payload');
 const next=stats(2000);next.delete('transport');next.get('voice').bytesSent+=1000;next.get('video').bytesReceived+=2000;next.get('repair').bytesSent+=5000;
 assert.equal(measureCall(next,prior.samples).kbps,24);
});
test('rate units use kbps below 1000 and Mbps above, with no invented first sample',()=>{
 assert.equal(formatRate(null),'');assert.equal(formatRate(undefined),'');assert.equal(formatRate(0),'0.0 kbps');assert.equal(formatRate(52.6),'53 kbps');assert.equal(formatRate(1280),'1.28 Mbps');
});
