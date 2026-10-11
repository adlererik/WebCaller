export const TRANSFER_PART_SIZE=4096;
export function transferBudget(call){
  if(!call)return Infinity;
  const {state,profile,mode,stats}=call;
  if(state!=='connected'||call.preparing||!stats||['weak','critical'].includes(profile)||stats.loss>.03||stats.rtt>.5||stats.jitter>.04)return 0;
  const cap=mode==='wifi'?768000:64000;
  const capacity=stats.bandwidth;
  if(!Number.isFinite(capacity))return mode==='wifi'?96000:16000;
  // Leave capacity for voice, video retransmissions and network overhead.
  const media=Math.max(stats.uploadKbps||0,stats.downloadKbps||0)*1000;
  return Math.max(0,Math.min(cap,capacity*.35,capacity*.7-media-16000));
}
export function transferPacer(snapshot,onWaiting=()=>{}){
  let next=0;
  const delay=(ms,signal)=>new Promise((resolve,reject)=>{
    signal.throwIfAborted();const done=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);};
    const abort=()=>{done();reject(signal.reason);},timer=setTimeout(()=>{done();resolve();},ms);
    signal.addEventListener('abort',abort,{once:true});
  });
  return async(bytes,signal)=>{
    for(;;){
      signal.throwIfAborted();const budget=transferBudget(snapshot());
      if(budget===Infinity){next=0;onWaiting(false);return;}
      if(budget<4000){onWaiting(true);await delay(400,signal);continue;}
      onWaiting(false);
      // Recheck call health while waiting; reserve one small burst at a time.
      const now=performance.now();if(next>now){await delay(Math.min(400,next-now),signal);continue;}
      next=now+bytes*8*1000/budget;return;
    }
  };
}
