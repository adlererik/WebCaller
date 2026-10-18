// One-shot container: sees only ntfy state and its publisher-token volume.
import {mkdirSync,existsSync,readFileSync,writeFileSync,chownSync,chmodSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
export function initialize({enabled,root='/var/lib/ntfy',secrets='/run/webcaller-ntfy',config='/etc/ntfy/server.yml',binary='ntfy',owners=true}){
  if(!enabled)return 'Extra ringing disabled.';
  mkdirSync(root,{recursive:true,mode:0o700});mkdirSync(secrets,{recursive:true,mode:0o700});
  const db=root+'/auth.db',file=secrets+'/publisher.token';
  if(existsSync(db)!==existsSync(file))throw new Error('Incomplete ntfy initialization. Restore its matching state/token volumes; no credentials were replaced.');
  const run=(args,env={})=>{
    const r=spawnSync(binary,[args[0],'--config',config,...args.slice(1)],{env:{...process.env,...env},encoding:'utf8',maxBuffer:1024*1024});
    if(r.status!==0)throw new Error('ntfy initialization failed. Credentials were not printed.');
    return r.stdout+r.stderr;
  };
  if(!existsSync(db)){
    // A partial fresh init fails closed on retry; never silently replace its credentials.
    try{
      writeFileSync(db,'',{mode:0o600,flag:'wx'});
      run(['user','add','webcaller'],{NTFY_PASSWORD:randomBytes(48).toString('base64url')});
      run(['access','webcaller','wc_*','write-only']);run(['access','everyone','wc_*','read-only']);
      const token=run(['token','add','--label','WebCaller publisher','webcaller']).match(/\btk_[a-z0-9]{20,}\b/)?.[0];
      if(!token)throw new Error('No publishing credential generated.');
      writeFileSync(file,token+'\n',{mode:0o400,flag:'wx'});
    }catch(error){throw new Error('ntfy initialization incomplete; inspect the two dedicated volumes before retrying. No app identity was changed.',{cause:error});}
  }else if(!/^tk_[a-z0-9]{20,}$/.test(readFileSync(file,'utf8').trim()))throw new Error('Invalid stored ntfy credential; refusing to replace it.');
  if(owners){
    for(const name of readdirSync(root)){chownSync(root+'/'+name,10001,10001);chmodSync(root+'/'+name,0o600);}
    chownSync(root,10001,10001);chmodSync(root,0o700);
    chownSync(file,1000,1000);chmodSync(file,0o400);chownSync(secrets,1000,1000);chmodSync(secrets,0o700);
  }
  return 'Isolated ntfy publisher ready; existing credentials preserved.';
}
if(process.argv[1]?.endsWith('/docker-ntfy-init.mjs')){
  try{console.log(initialize({enabled:process.env.NTFY_ENABLED==='true'}));}
  catch{console.error('ntfy initialization failed. Keep existing state/token volumes and inspect the private installation; no app keys were reset.');process.exitCode=1;}
}
