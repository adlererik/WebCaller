const auxiliary=/^(rtx|red|ulpfec|flexfec(?:-03)?|cn|telephone-event)$/i;
function codecName(mime=''){
  const name=mime.split('/')[1]||'';
  return /^opus$/i.test(name)?'Opus':/^h264$/i.test(name)?'H.264':/^h265$/i.test(name)?'H.265':name;
}
// Count each bundled transport once. These browser counters exclude network headers.
export function measureCall(report,previous=new Map()){
  const streams=[...report.values()].filter(s=>['inbound-rtp','outbound-rtp'].includes(s.type)&&s.active!==false);
  const transportIds=new Set(streams.map(s=>s.transportId).filter(Boolean));
  let counters=[...transportIds].map(id=>report.get(id)).filter(s=>s&&Number.isFinite(s.bytesSent)&&Number.isFinite(s.bytesReceived));
  let source='transport payload';
  if(!counters.length){
    counters=streams.filter(s=>!auxiliary.test(codecName(report.get(s.codecId)?.mimeType)));
    source='RTP payload';
  }
  const samples=new Map();let upload=0,download=0,measured=false;
  for(const s of counters){
    const key=s.type+':'+s.id,now={sent:s.bytesSent||0,received:s.bytesReceived||0,time:s.timestamp},prior=previous.get(key),elapsed=now.time-prior?.time;
    if(prior&&Number.isFinite(elapsed)&&elapsed>0&&now.sent>=prior.sent&&now.received>=prior.received){
      upload+=(now.sent-prior.sent)*8/elapsed;download+=(now.received-prior.received)*8/elapsed;measured=true;
    }
    samples.set(key,now);
  }
  const codecs={audio:{send:new Set(),receive:new Set()},video:{send:new Set(),receive:new Set()}};
  for(const s of streams){
    const mime=report.get(s.codecId)?.mimeType||'',kind=s.kind||mime.split('/')[0],name=codecName(mime);
    if(!codecs[kind]||!name||auxiliary.test(name)||!(s.packetsSent>0||s.packetsReceived>0))continue;
    codecs[kind][s.type==='outbound-rtp'?'send':'receive'].add(name);
  }
  const label=kind=>{
    const send=[...codecs[kind].send].sort().join('/'),receive=[...codecs[kind].receive].sort().join('/');
    return send&&receive&&send!==receive?`↑${send} ↓${receive}`:send||receive;
  };
  return {samples,kbps:measured?upload+download:null,uploadKbps:measured?upload:null,downloadKbps:measured?download:null,rateSource:source,audioCodec:label('audio'),videoCodec:label('video')};
}
export function formatRate(kbps){
  if(!Number.isFinite(kbps)||kbps<0)return '';
  return kbps>=1000?`${(kbps/1000).toFixed(2)} Mbps`:`${kbps<10?kbps.toFixed(1):Math.round(kbps)} kbps`;
}
