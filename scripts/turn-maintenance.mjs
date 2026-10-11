// Runs as webcaller. The system unit's privileged post-step restarts services only after a change.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {X509Certificate} from 'node:crypto';

const read=path=>existsSync(path)?readFileSync(path,'utf8'):'';
const beforeEnv=read('.env'),beforeConfig=read('.runtime/turnserver.conf');
const certPath='.runtime/acme/config/live/webcaller-turn/fullchain.pem';
const beforeCert=read(certPath);
const tlsPort=Number(beforeEnv.match(/^TURN_TLS_PORT=(.+)$/m)?.[1]||5349);
const lan=beforeEnv.match(/^TURN_LAN_IP=(.+)$/m)?.[1];
if(!lan)throw new Error('Set TURN_LAN_IP before enabling router maintenance');
const mappingArgs=['scripts/router-turn.py','--apply','--server',lan];
if(beforeCert&&[5349,8443].includes(tlsPort))mappingArgs.push('--tls-port',String(tlsPort));
const mapping=spawnSync('python3',mappingArgs,{encoding:'utf8',timeout:90000});
if(mapping.status!==0)throw new Error('TURN mapping maintenance failed: '+mapping.stderr);
const {wan_ip:address}=JSON.parse(mapping.stdout);
console.log('TURN router mappings checked; WAN '+address);
// Renew provisioned TLS through the public TCP 80 → LAN 8085 validation forward.
if(beforeCert){
  const cert=new X509Certificate(beforeCert);
  if(!cert.checkIP(address)||Date.parse(cert.validTo)-Date.now()<80*3600000){
    const renewal=spawnSync('.runtime/certbot/bin/certbot',['certonly','--standalone','--http-01-port','8085',
      '--http-01-address',lan,'--preferred-profile','shortlived','--ip-address',address,
      '--cert-name','webcaller-turn','--config-dir','.runtime/acme/config','--work-dir','.runtime/acme/work',
      '--logs-dir','.runtime/acme/logs','--non-interactive','--keep-until-expiring','--renew-with-new-domains'],
      {encoding:'utf8',timeout:180000});
    if(renewal.status!==0)console.error('TURN certificate renewal failed; details are in private .runtime/acme/logs.');
    else console.log('TURN IP certificate renewal checked.');
  }
}
const configured=spawnSync(process.execPath,['scripts/configure-local-turn.mjs',address,lan,'--enable'],{encoding:'utf8'});
if(configured.status!==0)throw new Error('TURN configuration maintenance failed');
if(beforeEnv!==read('.env')||beforeConfig!==read('.runtime/turnserver.conf')||beforeCert!==read(certPath)){
  writeFileSync('.runtime/turn-needs-restart','1',{mode:0o600});
  console.log('TURN configuration changed; services will reload.');
}
