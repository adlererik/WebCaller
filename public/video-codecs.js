// MediaCapabilities reports efficiency, not a guarantee of hardware acceleration.
const repair=/\/(rtx|red|ulpfec|flexfec(?:-03)?)$/i;
const order=['av1','h265','vp9','h264','vp8'];
export function codecKey(codec){
  return [codec.mimeType.toLowerCase(),codec.clockRate,[...(codec.sdpFmtpLine||'').split(';')].map(s=>s.trim().toLowerCase()).filter(Boolean).sort().join(';')].join('|');
}
export async function probeVideoCodecs(codecs,capabilities=globalThis.navigator?.mediaCapabilities,timeout=1200){
  return Promise.all(codecs.filter(c=>!repair.test(c.mimeType)).slice(0,24).map(async codec=>{
    const contentType=codec.mimeType+(codec.sdpFmtpLine?';'+codec.sdpFmtpLine:'');
    const video={contentType,width:960,height:540,bitrate:900000,framerate:24};
    const query=async method=>{
      if(typeof capabilities?.[method]!=='function')return null;
      let timer;
      try{return await Promise.race([Promise.resolve().then(()=>capabilities[method]({type:'webrtc',video})),new Promise(resolve=>timer=setTimeout(()=>resolve(null),timeout))]);}
      catch{return null;}finally{clearTimeout(timer);}
    };
    const [encode,decode]=await Promise.all([query('encodingInfo'),query('decodingInfo')]);
    const efficient=result=>!!(result?.supported&&result.smooth&&result.powerEfficient);
    return {key:codecKey(codec),encode:efficient(encode),decode:efficient(decode)};
  }));
}
export function preferVideoCodecs(codecs,local=[],remote,avoid=new Set()){
  const safe=Array.isArray(remote)?remote.slice(0,24).filter(c=>typeof c?.key==='string'&&c.key.length<500):null;
  const rank=codec=>{
    if(repair.test(codec.mimeType))return 100;
    const key=codecKey(codec),a=local.find(c=>c.key===key),b=safe?.find(c=>c.key===key);
    const efficient=a?.encode===true&&a?.decode===true&&(!safe||(b?.encode===true&&b?.decode===true));
    const name=codec.mimeType.split('/')[1].toLowerCase(),position=order.indexOf(name);
    return (avoid.has(key)?80:efficient?0:30)+(position<0?10:efficient?position:name==='h264'?0:name==='vp8'?1:10);
  };
  // Retain the original capability objects and every RTX/RED/FEC fallback.
  return codecs.map((codec,index)=>({codec,index,rank:rank(codec)})).sort((a,b)=>a.rank-b.rank||a.index-b.index).map(c=>c.codec);
}
