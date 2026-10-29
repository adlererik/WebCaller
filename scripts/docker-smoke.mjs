// Disposable CI stack. Never point this at an installed user's Compose project.
import {mkdtempSync,copyFileSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {randomBytes,generateKeyPairSync} from 'node:crypto';
import {WebSocket} from 'ws';
const dir=mkdtempSync(join(tmpdir(),'webcaller-container-'));
for(const file of ['compose.yaml','images.env','webcaller','README.md','VERSION'])copyFileSync('docker/'+file,join(dir,file));for(const file of ['LICENSE','LICENSE-MIT','LICENSING.md','THIRD_PARTY_NOTICES.md'])copyFileSync(file,join(dir,file));
let images=readFileSync(join(dir,'images.env'),'utf8');for(const [key,value]of Object.entries({WEBCALLER_IMAGE:'webcaller-ci:app',SETUP_IMAGE:'webcaller-ci:setup',TURN_IMAGE:'webcaller-ci:turn'}))images=images.replace(new RegExp('^'+key+'=.*$','m'),key+'='+value);writeFileSync(join(dir,'images.env'),images);
const project='webcaller-ci-'+randomBytes(6).toString('hex');
const docker=(...args)=>execFileSync('docker',args,{cwd:dir,encoding:'utf8',maxBuffer:8*1024*1024,timeout:240000});
const compose=(...args)=>docker('compose','--project-name',project,'--project-directory',dir,'--env-file','images.env','--env-file','.env','-f','compose.yaml',...args);
const settings={host:'calls.example.test',mode:'proxy',relay:'self',publicIP:'1.1.1.1',appPort:18180,ntfyPort:18194,ntfy:true,ntfyHost:'notify.example.test',ios:false};
let phase='setup';
try{
 execFileSync('docker',['run','--rm','-i','--user',`${process.getuid()}:${process.getgid()}`,'--mount',`type=bind,src=${dir},dst=/bundle`,'webcaller-ci:setup','init','--settings','/dev/stdin'],{input:JSON.stringify(settings),encoding:'utf8',stdio:['pipe','pipe','pipe']});
 writeFileSync(join(dir,'.env'),readFileSync(join(dir,'.env'),'utf8').replace(/^COMPOSE_PROJECT_NAME=.*$/m,'COMPOSE_PROJECT_NAME='+project));
 compose('config','--quiet');
 const upstream=Object.fromEntries(images.split('\n').filter(v=>v.includes('=')&&!v.startsWith('#')).map(v=>v.split(/=(.*)/s).slice(0,2)));
 docker('run','--rm','--mount',`type=bind,src=${dir}/config/Caddyfile,dst=/etc/caddy/Caddyfile,readonly`,upstream.CADDY_IMAGE,'caddy','validate','--config','/etc/caddy/Caddyfile');
 assert.ok(docker('run','--rm',upstream.TUNNEL_IMAGE,'tunnel','run','--help').includes('--token-file'));
 compose('up','-d','--wait','--wait-timeout','180');
 const base='http://127.0.0.1:18180/calls',origin='https://calls.example.test';
 for(const path of ['/', '/health','/api/config','/app.js']){const r=await fetch(base+path);assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');}
 assert.equal((await(await fetch(base+'/api/config')).json()).ntfyAvailable,true);
 await new Promise((res,rej)=>{const ws=new WebSocket('ws://127.0.0.1:18180/calls/ws',{origin});const timer=setTimeout(()=>{ws.terminate();rej(new Error('WS deadline'));},10000);ws.on('open',()=>ws.send(JSON.stringify({type:'auth',ticket:'invalid'})));ws.on('error',rej);ws.on('close',code=>{clearTimeout(timer);try{assert.equal(code,4401);res();}catch(e){rej(e);}});});
 const env=Object.fromEntries(readFileSync(join(dir,'config/app.env'),'utf8').trim().split('\n').map(v=>v.split(/=(.*)/s).slice(0,2)));
 const keys=()=>generateKeyPairSync('ec',{namedCurve:'prime256v1'}).publicKey.export({format:'jwk'});
 let token;
 const api=async(path,body)=>{const r=await fetch(base+'/api'+path,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});assert.ok(r.ok,'API '+path+' status '+r.status);return r.json();};
 token=(await api('/register',{name:'CI fixture',keys:{dh:keys(),sign:keys()},setupCode:env.BOOTSTRAP_TOKEN})).token;
 const topic=(await api('/ntfy',{})).topic;
 const ntfy='http://127.0.0.1:18194';
 assert.equal((await fetch(ntfy+'/'+topic,{method:'POST',body:'Unauthorized fixture'})).status,403);
 assert.equal((await fetch(ntfy+'/'+topic+'/json?poll=1')).status,200);
 assert.equal((await fetch(ntfy+'/not-a-capability/json?poll=1')).status,403);
 const before=compose('exec','-T','webcaller','node','-e',"process.stdout.write(require('fs').readFileSync('/run/webcaller-ntfy/publisher.token'))");
 const access=await fetch(ntfy+'/'+topic+'/json?poll=1',{headers:{Authorization:'Bearer '+before.trim()}});assert.equal(access.status,403);
 const test=await api('/ntfy/test',{});let status;
 for(let i=0;i<100;i++){status=await api('/ntfy/test-status',{testId:test.testId});if(status.sent&&status.delivered)break;await new Promise(r=>setTimeout(r,150));}
 assert.equal(status.delivered,true);
 const records=(await(await fetch(ntfy+'/'+topic+'/json?poll=1')).text()).trim().split('\n').map(v=>JSON.parse(v));assert.equal(records.at(-1).priority,5);
 await api('/ntfy/test-result',{testId:test.testId,heard:true,usePhoneIcon:true});
 execFileSync(process.execPath,['--env-file='+join(dir,'config/turn.env'),'scripts/relay-probe.mjs','127.0.0.1'],{encoding:'utf8',timeout:10000});
 const qr=docker('run','--rm','--network','none','--user',`${process.getuid()}:${process.getgid()}`,'--mount',`type=bind,src=${dir},dst=/bundle`,'webcaller-ci:setup','qr');assert.ok(qr.includes('PRIVATE FIRST-PHONE'));
 compose('down');compose('up','-d','--wait','--wait-timeout','180');
 const after=compose('exec','-T','webcaller','node','-e',"process.stdout.write(require('fs').readFileSync('/run/webcaller-ntfy/publisher.token'))");assert.equal(after,before);
 assert.equal((await api('/ntfy')).topic,topic);assert.equal((await api('/ntfy')).confirmed,true);assert.equal((await(await fetch(base+'/api/config')).json()).bootstrap,false);
 // Exercise the shipped assistant and an actual consistent backup/restore.
 phase='assistant status';console.log('Checking assistant status');
 execFileSync(join(dir,'webcaller'),['status'],{cwd:dir,encoding:'utf8',timeout:10000});
 phase='consistent backup';console.log('Checking consistent backup');
 execFileSync('script',['-q','-e','-c','./webcaller backup','/dev/null'],{cwd:dir,input:'y\n',encoding:'utf8',timeout:180000});
 const backupFiles=(await import('node:fs')).readdirSync(join(dir,'backups')).filter(f=>f.endsWith('.tar.gz'));assert.equal(backupFiles.length,1);
 compose('exec','-T','webcaller','node','-e',"require('fs').writeFileSync('/app/data/after-backup-fixture','later')");
 compose('stop');
 phase='snapshot restore';console.log('Checking snapshot restore');
 execFileSync('python3',['-c',"import importlib.machinery,importlib.util,pathlib; loader=importlib.machinery.SourceFileLoader('assistant','webcaller'); spec=importlib.util.spec_from_loader('assistant',loader); m=importlib.util.module_from_spec(spec); loader.exec_module(m); m.restore_snapshot(pathlib.Path('backups').resolve()/"+JSON.stringify(backupFiles[0])+"); m.start()"],{cwd:dir,encoding:'utf8',timeout:180000});
 assert.equal(compose('exec','-T','webcaller','node','-e',"process.stdout.write(String(require('fs').existsSync('/app/data/after-backup-fixture'))) ").trim(),'false');
 assert.equal((await api('/ntfy')).topic,topic);assert.equal((await api('/ntfy')).confirmed,true);
 const restored=compose('exec','-T','webcaller','node','-e',"process.stdout.write(require('fs').readFileSync('/run/webcaller-ntfy/publisher.token'))");assert.equal(restored,before);
 console.log('PASS disposable Linux stack: setup, HTTPS config, WS auth, ntfy ACL/priority, TURN allocation, private QR, restart persistence and consistent backup/restore preserving credentials and registrations.');
}catch(error){
 console.error('Failed phase: '+phase+'; error type: '+error.name+'; status: '+error.status);
 if(['assistant status','consistent backup','snapshot restore'].includes(phase))for(const stream of [error.stdout,error.stderr])if(stream)console.error(String(stream).replace(/tk_[a-z0-9]+/g,'[redacted]').replace(/wc_[A-Za-z0-9_-]+/g,'[redacted]'));
 console.error('Disposable Docker smoke failed. Inspect synthetic container status below; credentials are omitted.');
 // Synthetic fixture only; never output config, tokens, QR, topic IDs or command buffers.
 try{const ps=compose('ps');console.error(ps);const logs=compose('logs','--tail=30','ntfy-init','webcaller','ntfy');console.error(logs.replace(/tk_[a-z0-9]+/g,'[redacted]').replace(/wc_[A-Za-z0-9_-]+/g,'[redacted]'));}catch{}
 process.exitCode=1;
}finally{try{compose('down','-v','--remove-orphans');}catch{}rmSync(dir,{recursive:true,force:true});}
