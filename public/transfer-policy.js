// Keep the original small-part wire format for weak links and older clients.
export const TRANSFER_PART_SIZE=4096;
export const TRANSFER_CHUNK_SIZE=65536,TRANSFER_CONCURRENCY=4;
export function transferBudget(call,now=Date.now()){
  if(!call)return Infinity;
  const {state,profile,stats}=call;
  if(state!=='connected'||call.preparing||!stats||['weak','critical'].includes(profile)||
    ![stats.loss,stats.rtt,stats.jitter].every(Number.isFinite)||stats.loss>.03||stats.rtt>.5||stats.jitter>.04||stats.bandwidth<85000||
    Number.isFinite(stats.sampledAt)&&now-stats.sampledAt>5000)return 0;
  // Unknown connection type is not proof of cellular or a slow file path.
  // The RTP estimate initializes probing; audio health governs subsequent growth.
  const cap=call.metered?2000000:24000000;
  const initial=Number.isFinite(stats.bandwidth)?Math.max(call.metered?128000:512000,Math.min(1000000,stats.bandwidth*.3)):512000;
  return Math.min(cap,call.transferRate??initial);
}
export function transferPacer(snapshot,onWaiting=()=>{},{now=()=>performance.now(),wall=Date.now,sleep}={}){
  let next=0,rate=0,lastSample,lastNetwork,lastCall,recovering=false,healthy=0,observed=0;
  const delay=sleep||((ms,signal)=>new Promise((resolve,reject)=>{
    signal.throwIfAborted();const done=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);};
    const abort=()=>{done();reject(signal.reason);},timer=setTimeout(()=>{done();resolve();},ms);
    signal.addEventListener('abort',abort,{once:true});
  }));
  const reset=()=>{next=0;rate=0;lastSample=lastNetwork=lastCall=undefined;recovering=false;healthy=0;observed=0;};
  const check=()=>{
    const call=snapshot(),time=wall();
    if(!call){reset();return {rate:Infinity,paused:false,small:false};}
    const network=call.network||'unknown',networkChanged=lastNetwork!==undefined&&lastNetwork!==network;
    if(lastCall!==call.id||networkChanged){rate=0;next=0;lastSample=undefined;observed=0;}
    lastNetwork=network;lastCall=call.id;
    // Waiting for video to yield is planned preparation, not an audio failure.
    // Preserve healthy probing instead of entering the congestion cooldown.
    if(call.preparing)return {rate:0,paused:true,small:true,networkChanged};
    const budget=transferBudget(call,time),sample=call.stats?.sampledAt??Math.floor(time/1000);
    if(!budget){rate=64000;next=0;observed=0;recovering=true;healthy=0;lastSample=sample;return {rate:0,paused:true,small:true,networkChanged};}
    if(!rate)rate=budget;
    if(sample!==lastSample){
      lastSample=sample;
      if(recovering){if(++healthy>=2)recovering=false;}
      else if(call.stats.loss<=.01&&call.stats.rtt<=.3&&call.stats.jitter<=.025)rate*=2;
      else rate=Math.max(64000,rate*.8);
    }
    const measuredCeiling=observed?Math.max(budget,observed*1.25):Infinity;
    rate=Math.min(transferBudget({...call,transferRate:rate},time),measuredCeiling);
    return {rate:recovering?0:rate,paused:recovering,small:!observed||rate<512000,networkChanged};
  };
  const pace=async(bytes,signal)=>{
    for(;;){
      signal.throwIfAborted();const status=check(),budget=status.rate;
      if(budget===Infinity){next=0;onWaiting(false);return;}
      if(!budget){onWaiting(true);await delay(100,signal);continue;}
      onWaiting(false);
      const time=now();if(next>time){await delay(Math.min(100,next-time),signal);continue;}
      next=time+bytes*8000/budget;return;
    }
  };
  pace.check=check;pace.reset=reset;
  pace.observe=(bytes,ms)=>{if(ms>0){const capacity=bytes*8000/ms*TRANSFER_CONCURRENCY;observed=observed?observed*.75+capacity*.25:capacity;}};
  pace.backoff=()=>{rate=Math.max(64000,rate/2);next=0;};
  return pace;
}
// A fixed upper bound keeps encryption, HTTP bodies and cache writes bounded.
// A failed worker aborts its siblings and all workers settle before returning.
export async function transferPool(count,work,signal,limit=TRANSFER_CONCURRENCY){
  const stop=new AbortController(),combined=AbortSignal.any([signal,stop.signal]);let next=0,error;
  await Promise.all(Array.from({length:Math.min(limit,count)},async()=>{
    try{for(;;){combined.throwIfAborted();const index=next++;if(index>=count)return;await work(index,combined);}}
    catch(e){if(!error){error=e;stop.abort(e);}}
  }));
  if(error)throw error;
}
export function transferPaused(){return Object.assign(new Error('File sharing paused to protect voice.'),{name:'TransferPausedError'});}
