// Keep call work ordered without putting chat/file downloads in the same queue.
export function orderedTasks(){
  let tail=Promise.resolve();
  return task=>{const job=tail.then(task);tail=job.catch(()=>{});return job;};
}

export function callOutbox({current,ready,seal,send,onError=()=>{}}){
  const states=new WeakMap();
  return function signal(kind,payload){
    const call=current();
    if(!call||call.ending&&kind!=='hangup')return Promise.resolve();
    let state=states.get(call);
    if(!state){state={queue:orderedTasks(),opened:false,initial:null,pending:[]};states.set(call,state);}
    const first=call.caller?'offer':'answer';
    const enqueue=(kind,payload,initial=false)=>state.queue(async()=>{
      if(current()!==call||call.ending&&kind!=='hangup')return;
      if(!ready())throw new Error('Waiting for the connection to return');
      const envelope=await seal(call,kind,payload);
      if(current()!==call||call.ending&&kind!=='hangup')return;
      if(!ready())throw new Error('Waiting for the connection to return');
      send({type:'signal',kind,callId:call.id,envelope});
      if(initial){
        state.opened=true;
        for(const item of state.pending.splice(0))void enqueue(item.kind,item.payload).catch(error=>{if(current()===call&&!call.ending)onError(error);});
      }
    });
    if(kind===first&&!state.opened)return state.initial ||= enqueue(kind,payload,true);
    if(kind==='hangup'){
      state.pending=[];
      // An outgoing call cancelled before its offer was queued never existed
      // on the server. An incoming call can always send a signed decline.
      if(call.caller&&!state.opened&&!state.initial)return Promise.resolve();
    }else if(!state.opened){
      if(state.pending.length>=128)return Promise.reject(new Error('Too many pending call updates'));
      // ICE can fire inside setLocalDescription, before the offer/answer has
      // even been encrypted. Accept it into memory and publish it afterwards.
      state.pending.push({kind,payload});return Promise.resolve();
    }
    return enqueue(kind,payload);
  };
}

export const waitingForAnswer=call=>!!call?.offer&&!call.caller&&!call.answering&&!call.started&&!call.ending;

export function callRinger({current,burst,silence,setInterval:repeat=globalThis.setInterval,clearInterval:cancel=globalThis.clearInterval}){
  let timer=null,generation=0;
  function stop(){generation++;if(timer!==null)cancel(timer);timer=null;silence();}
  function start(){
    stop();const call=current(),token=generation;
    if(!waitingForAnswer(call))return;
    const tick=()=>{
      if(token!==generation)return;
      if(current()!==call||!waitingForAnswer(call)){stop();return;}
      burst();
    };
    tick();timer=repeat(tick,3000);
  }
  return {start,stop};
}
