// Three short-lived alerts, never an unbounded stream of notifications.
export function createCallAlerts({send,isWaiting,now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout,onStop=()=>{},delays=[15000,35000]}) {
  const jobs=new Map();
  function stop(id){const job=jobs.get(id);if(!job)return;job.timers.forEach(clearTimer);jobs.delete(id);onStop(id);}
  function start(call){
    stop(call.id);const job={timers:[],call};jobs.set(call.id,job);
    const deliver=index=>{
      if(jobs.get(call.id)!==job||!isWaiting(call.id)||call.expiresAt<=now()){stop(call.id);return;}
      const deliveryExpiresAt=Math.min(call.expiresAt,now()+20000);
      void Promise.resolve().then(()=>{if(jobs.get(call.id)===job&&isWaiting(call.id)&&call.expiresAt>now())return send(call,index,deliveryExpiresAt);}).catch(()=>{});
    };
    deliver(0);if(jobs.get(call.id)!==job)return;
    delays.forEach((delay,index)=>{if(delay<call.expiresAt-now()){const timer=setTimer(()=>deliver(index+1),delay);timer.unref?.();job.timers.push(timer);}});
  }
  return {start,stop,close(){for(const id of jobs.keys())stop(id);}};
}

export function notificationPayload({type,callId,testId,revision=0,url,expiresAt,callExpiresAt,messageId,peerId,recipientId}) {
  const call=type==='call',test=type==='test';
  const title=call?'Incoming call':test?'Call alert test':'New message';
  const body=call?'Tap to open your phone and answer.':test?'Tap here if you heard this alert.':'Open your phone to read it.';
  const tag=call?`call-${callId}-${revision}`:test?`test-${testId}`:'message-alert';
  const navigate=new URL(url);if(test)navigate.hash='alert-test='+testId;
  return {type,callId,testId,revision,expiresAt,callExpiresAt,...(type==='message'?{messageId,peerId,recipientId}:{}),
    web_push:8030,mutable:true,notification:{title,body,tag,navigate:navigate.href,silent:false,
      icon:new URL('./icon-192.png',url).href,
      data:{type,callId,testId,expiresAt,callExpiresAt,...(type==='message'?{messageId,peerId,recipientId}:{})}}};
}
