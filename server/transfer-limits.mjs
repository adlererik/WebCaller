// Attachment requests carry at most one encrypted 64 KiB chunk. Bound active
// bodies and request rate independently of chat/signaling rate limits.
export function transferLimits({now=Date.now,rate=120,burst=64,concurrency=8}={}){
  const users=new Map();let swept=0;
  return owner=>{
    const time=now();
    if(time-swept>60000){for(const [id,s]of users)if(!s.active&&time-s.time>60000)users.delete(id);swept=time;}
    const s=users.get(owner)||{tokens:burst,time,active:0};
    s.tokens=Math.min(burst,s.tokens+Math.max(0,time-s.time)*rate/1000);s.time=time;users.set(owner,s);
    if(s.active>=concurrency||s.tokens<1)throw Object.assign(new Error('File transfer is busy. Retrying shortly.'),{status:429});
    s.tokens--;s.active++;let released=false;
    return ()=>{if(!released){released=true;s.active--;}};
  };
}
