// Prepare a private coturn config from the app's secret without printing it.
import {readFileSync,writeFileSync,mkdirSync,existsSync,renameSync} from 'node:fs';
import {randomBytes,X509Certificate} from 'node:crypto';
import {isIP} from 'node:net';
import {resolve} from 'node:path';
const address=process.argv[2],lan=process.argv[3]||process.env.TURN_LAN_IP;
if(isIP(address)!==4||isIP(lan)!==4)throw new Error('Supply the public IPv4 and server LAN IPv4');
let env=readFileSync('.env','utf8');
const beforeEnv=env,beforeConfig=existsSync('.runtime/turnserver.conf')?readFileSync('.runtime/turnserver.conf','utf8'):'';
const portIndex=process.argv.indexOf('--tls-port');
const tlsPort=Number(portIndex>=0?process.argv[portIndex+1]:env.match(/^TURN_TLS_PORT=(.+)$/m)?.[1]||5349);
if(![443,5349,8443].includes(tlsPort))throw new Error('TURN TLS external port must be 443, 5349 or 8443');
env=/^TURN_TLS_PORT=.*$/m.test(env)?env.replace(/^TURN_TLS_PORT=.*$/m,'TURN_TLS_PORT='+tlsPort):env+'\nTURN_TLS_PORT='+tlsPort+'\n';
let shared=env.match(/^TURN_SECRET=(.+)$/m)?.[1];
if(!shared){shared=randomBytes(32).toString('hex');env=env.replace(/^TURN_SECRET=.*$/m,'TURN_SECRET='+shared);}
const certDir=resolve('.runtime/acme/config/live/webcaller-turn');
let tls=false;
if(existsSync(certDir+'/fullchain.pem')&&existsSync(certDir+'/privkey.pem')){
  const cert=new X509Certificate(readFileSync(certDir+'/fullchain.pem'));
  tls=Boolean(cert.checkIP(address)&&Date.parse(cert.validTo)>Date.now()+3600000);
}
const urls=`turn:${address}:3478?transport=udp,turn:${address}:3478?transport=tcp`+(tls?`,turns:${address}:${tlsPort}?transport=tcp`:'');
if(process.argv.includes('--enable'))env=env.replace(/^TURN_URLS=.*$/m,'TURN_URLS='+urls);
const save=(path,contents)=>{const temp=path+'.'+randomBytes(6).toString('hex')+'.tmp';writeFileSync(temp,contents,{mode:0o600,flag:'wx'});renameSync(temp,path);};
save('.env',env);
mkdirSync('.runtime',{recursive:true,mode:0o700});
const template=readFileSync('deploy/turnserver.conf.example','utf8');
const config=template.replaceAll('RELAY_LAN_OR_PUBLIC_IP',lan).replace('external-ip=PUBLIC_IP',`external-ip=${address}/${lan}`)
 .replace('static-auth-secret=GENERATE_A_LONG_RANDOM_SECRET','static-auth-secret='+shared)
 .replace(/^cert=.*$/m,tls?'cert='+certDir+'/fullchain.pem':'no-tls').replace(/^pkey=.*$/m,tls?'pkey='+certDir+'/privkey.pem':'')+'\nno-dtls\npidfile='+resolve('.runtime/turnserver.pid')+'\nlog-file=/dev/null\nno-stdout-log\n';
save('.runtime/turnserver.conf',config);
if(env!==beforeEnv||config!==beforeConfig)writeFileSync('.runtime/turn-needs-restart','1',{mode:0o600});
console.log(`Prepared authenticated UDP/TCP coturn; IP-certified TLS ${tls?'enabled':'unavailable'}. App URLs ${process.argv.includes('--enable')?'enabled':'unchanged'}.`);
