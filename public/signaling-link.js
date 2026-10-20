// One temporary identity per page, retained only across this page's transport
// reconnects. Never stores identities, call content or keys.
export function signalingLink({ticket,url,enabled,active,clientId,onSocket=()=>{},onState=()=>{},onReady=()=>{},onPacket=()=>{},onError=()=>{},Socket=globalThis.WebSocket,now=Date.now,schedule=setTimeout,cancel=clearTimeout,random=Math.random}) {
  let socket=null,generation=0,attempt=0,opening=false,ready=false,stopped=false,abort=null,retry=null,deadline=null,pulse=null,pending=null,serial=0,lastForce=-Infinity;
  const clear=name=>{if(name!==null)cancel(name);};
  function clearHealth(){clear(deadline);clear(pulse);deadline=pulse=null;pending=null;}
  function current(ws,epoch){return !stopped&&socket===ws&&generation===epoch;}
  function scheduleRetry(){
    clear(retry);if(stopped||!enabled())return;
    const ceiling=active()?4000:20000,delay=Math.min(ceiling,(active()?500:1000)*2**Math.min(attempt++,5));
    retry=schedule(()=>{retry=null;void connect();},delay+random()*200);
  }
  function detach(){
    clearHealth();abort?.abort();abort=null;opening=false;ready=false;
    const old=socket;socket=null;onSocket(null);onState(false);
    if(old){old.onopen=old.onmessage=old.onclose=old.onerror=null;try{old.close(4000,'Reconnecting');}catch{}}
  }
  function failed(ws,epoch){if(!current(ws,epoch))return;++generation;detach();scheduleRetry();}
  function armPulse(){clear(pulse);pulse=schedule(()=>{pulse=null;probe();},active()?5000:20000);}
  function probe(urgent=false){
    if(stopped||!enabled())return;
    if(!ready||socket?.readyState!==1){if(!opening)void connect();return;}
    const ws=socket,epoch=generation;
    clear(pulse);pulse=null;
    if(pending){if(urgent){clear(deadline);deadline=schedule(()=>failed(ws,epoch),3000);}return;}
    pending=epoch+':'+(++serial);try{ws.send(JSON.stringify({type:'ping',nonce:pending}));}catch{return failed(ws,epoch);}
    clear(deadline);deadline=schedule(()=>failed(ws,epoch),urgent?3000:active()?8000:15000);
  }
  async function connect(force=false){
    if(stopped||!enabled())return;
    if(force){++generation;detach();attempt=0;}
    clear(retry);retry=null;
    if(opening||socket?.readyState===0||socket?.readyState===1)return;
    opening=true;const epoch=++generation;abort=new AbortController();
    // Covers a stuck ticket request as well as TCP/TLS/WebSocket/authentication.
    deadline=schedule(()=>{if(generation!==epoch||stopped)return;++generation;detach();scheduleRetry();},12000);
    try{
      const auth=await ticket(abort.signal);if(stopped||epoch!==generation)return;
      const ws=new Socket(url());socket=ws;onSocket(ws);
      ws.onopen=()=>{if(current(ws,epoch))try{ws.send(JSON.stringify({type:'auth',ticket:auth.ticket,clientId}));}catch{failed(ws,epoch);}};
      ws.onmessage=event=>{
        if(!current(ws,epoch))return;
        let packet;try{packet=JSON.parse(event.data);}catch{return;}
        if(packet.type==='ready'){
          if(ready)return;clear(deadline);deadline=null;opening=false;ready=true;attempt=0;onState(true);probe();
          // The application resumes call negotiation before history hydration.
          Promise.resolve().then(()=>{if(current(ws,epoch))return onReady(ws);}).catch(error=>{if(current(ws,epoch))onError(error,packet);});return;
        }
        if(!ready)return;
        if(packet.type==='pong'){
          if(pending&&(packet.nonce===pending||packet.nonce===undefined)){pending=null;clear(deadline);deadline=null;armPulse();}return;
        }
        Promise.resolve().then(()=>{if(current(ws,epoch))return onPacket(packet,ws);}).catch(error=>{if(current(ws,epoch))onError(error,packet);});
      };
      ws.onclose=()=>failed(ws,epoch);ws.onerror=()=>{};
    }catch(error){
      if(stopped||epoch!==generation)return;++generation;detach();scheduleRetry();
    }finally{if(epoch===generation)opening=false;}
  }
  return {
    connect,probe,
    networkChanged(force=false){if(force&&now()-lastForce>=1500){lastForce=now();void connect(true);}else probe(true);},
    stop(){stopped=true;++generation;clear(retry);retry=null;detach();},
    get socket(){return socket;},get ready(){return ready;}
  };
}
