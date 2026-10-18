import {readFileSync} from 'node:fs';
import {randomBytes,randomUUID} from 'node:crypto';

// ntfy carries generic alerts only. A per-device 256-bit read capability makes
// native enrollment possible without giving an invitee any publishing password.
export function ntfyConfig(env,appURL){
  let token=env.NTFY_PUBLISH_TOKEN;
  if(env.NTFY_PUBLISH_TOKEN_FILE){
    if(token)throw new Error('Choose an inline ntfy token or its secret file, not both.');
    try{token=readFileSync(env.NTFY_PUBLISH_TOKEN_FILE,'utf8').trim();}catch{throw new Error('Cannot read the ntfy publisher secret file.');}
  }
  const values=[env.NTFY_PUBLIC_URL,env.NTFY_PUBLISH_URL,token];
  if(values.every(v=>!v))return null;
  if(values.some(v=>!v))throw new Error('Set all three NTFY_PUBLIC_URL, NTFY_PUBLISH_URL and NTFY_PUBLISH_TOKEN values, or leave all empty.');
  const pub=new URL(values[0]),publish=new URL(values[1]);
  const root=u=>u.pathname==='/'&&!u.search&&!u.hash&&!u.username&&!u.password;
  if(!root(pub)||pub.protocol!=='https:'||pub.origin===new URL(appURL).origin)throw new Error('NTFY_PUBLIC_URL must be a separate HTTPS origin without a path.');
  const dockerHTTP=env.NTFY_ALLOW_DOCKER_HTTP==='true'&&publish.origin==='http://ntfy:8094';
  if(!root(publish)||!(dockerHTTP||publish.protocol==='https:'||(publish.protocol==='http:'&&['127.0.0.1','[::1]','localhost'].includes(publish.hostname))))throw new Error('NTFY_PUBLISH_URL must be HTTPS or loopback HTTP; the exact private Docker destination requires its explicit opt-in.');
  if(!/^[A-Za-z0-9_-]{16,200}$/.test(values[2]))throw new Error('Invalid ntfy publishing token format.');
  return {origin:pub.origin,publish:publish.origin,token:values[2],iosInstant:env.NTFY_IOS_UPSTREAM==='true'};
}
export function ntfyAlerts({env,publicURL,store,body,fail,rate,fetcher=fetch,testDelay=8000}){
  const config=ntfyConfig(env,publicURL),tests=new Map(),active=new Set(),timers=new Set();let closed=false;
  const row=owner=>store.get('SELECT * FROM ntfy_devices WHERE owner=?',owner);
  function stop(callId){for(const job of active)if(job.callId===callId)job.controller.abort();}
  function revoke(owner){
    for(const job of active)if(job.owner===owner)job.controller.abort();
    for(const [id,test]of tests)if(test.owner===owner){clearTimeout(test.timer);timers.delete(test.timer);tests.delete(id);}
    store.run('DELETE FROM ntfy_devices WHERE owner=?',owner);
  }
  function prune(){for(const [id,test]of tests)if(test.expiresAt<=Date.now()){clearTimeout(test.timer);timers.delete(test.timer);tests.delete(id);}}
  function view(owner){
    prune();const r=row(owner),pending=[...tests.entries()].find(([,t])=>t.owner===owner&&t.topic===r?.topic);
    return {available:!!config,iosInstant:!!config?.iosInstant,connected:!!r,confirmed:!!r?.confirmed,
      ...(pending?{pendingTest:{testId:pending[0],sent:pending[1].sent,delivered:pending[1].ok,opened:pending[1].opened}}:{}),
      ...(config&&r?{server:config.origin,topic:r.topic,link:`ntfy://${new URL(config.origin).host}/${r.topic}?display=Incoming%20calls`}:{})};
  }
  const opening=(owner,key,value)=>{const url=new URL(publicURL);url.pathname=url.pathname.replace(/\/$/,'')+'/';url.hash=new URLSearchParams({[key]:value,receiver:owner}).toString();return url.href;};
  async function publish(r,{callId,revision=0,testId,expiresAt}){
    if(!config||closed||expiresAt<=Date.now()||row(r.owner)?.topic!==r.topic)return false;
    const controller=new AbortController(),job={controller,owner:r.owner,callId};active.add(job);
    const click=opening(r.owner,testId?'ntfy-test':'incoming-call',testId||callId);
    const payload={topic:r.topic,title:testId?'Call alert test':'Incoming call',message:testId?'Tap to return to your phone and check the sound.':'Open your phone to answer.',priority:5,tags:['telephone_receiver'],click,
      actions:[{action:'view',label:testId?'Open test':'Open call',url:click,clear:true}]};
    // Never follow redirects with a publishing credential, and never accept a
    // client-provided destination. Failures are independent of browser push.
    try{
      const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(Math.max(1,Math.min(4000,expiresAt-Date.now())))]);
      const res=await fetcher(config.publish,{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+config.token,'Content-Type':'application/json'},body:JSON.stringify(payload),signal});
      await res.body?.cancel();return res.ok;
    }catch{return false;}finally{active.delete(job);}
  }
  return {
    available:!!config,iosInstant:!!config?.iosInstant,stop,revoke,
    async call(c,revision,expiresAt){const r=row(c.to);if(r?.confirmed)return publish(r,{callId:c.id,revision,expiresAt});return false;},
    async routes(req,route,u,json){
      if(!route.startsWith('/ntfy'))return false;
      if(route==='/ntfy'&&req.method==='GET'){json(200,view(u.id));return true;}
      if(route==='/ntfy'&&req.method==='DELETE'){revoke(u.id);json(200,{ok:true});return true;}
      if(!config)fail(503,'Extra ringing has not been enabled on the server.');
      if(route==='/ntfy'&&req.method==='POST'){
        rate('ntfy-setup:'+u.id,6);
        if(!row(u.id))store.run('INSERT INTO ntfy_devices(owner,topic,created,confirmed) VALUES(?,?,?,0)',u.id,'wc_'+randomBytes(32).toString('base64url'),Date.now());
        json(200,view(u.id));return true;
      }
      if(route==='/ntfy/test'&&req.method==='POST'){
        rate('ntfy-test:'+u.id,3);prune();const r=row(u.id);if(!r)fail(409,'Connect this phone first.');
        for(const [id,test]of tests)if(test.owner===u.id){clearTimeout(test.timer);timers.delete(test.timer);tests.delete(id);}
        const id=randomUUID(),test={owner:u.id,topic:r.topic,expiresAt:Date.now()+600000,sent:false,ok:false,opened:false};tests.set(id,test);
        test.timer=setTimeout(async()=>{timers.delete(test.timer);if(closed||tests.get(id)!==test||row(u.id)?.topic!==r.topic)return;
          test.sent=true;test.ok=await publish(r,{testId:id,expiresAt:Date.now()+20000});
        },testDelay);test.timer.unref?.();timers.add(test.timer);
        json(202,{testId:id,expiresAt:test.expiresAt});return true;
      }
      if(['/ntfy/test-open','/ntfy/test-result','/ntfy/test-status'].includes(route)&&req.method==='POST'){
        const b=await body(req),test=tests.get(b.testId);
        if(!test||test.owner!==u.id||test.expiresAt<=Date.now()||row(u.id)?.topic!==test.topic)fail(410,'Send a fresh test alert first.');
        if(route==='/ntfy/test-open'){test.opened=true;json(200,{ok:true});return true;}
        if(route==='/ntfy/test-status'){json(200,{sent:test.sent,delivered:test.ok,opened:test.opened});return true;}
        if(b.heard!==true||!test.sent||!test.ok||(!test.opened&&b.usePhoneIcon!==true))fail(409,'Only confirm after hearing the test; open its link or explicitly choose to use your usual phone icon.');
        store.run('UPDATE ntfy_devices SET confirmed=? WHERE owner=? AND topic=?',Date.now(),u.id,test.topic);tests.delete(b.testId);json(200,{ok:true});return true;
      }
      return false;
    },
    close(){closed=true;for(const t of timers)clearTimeout(t);timers.clear();tests.clear();for(const job of active)job.controller.abort();}
  };
}
