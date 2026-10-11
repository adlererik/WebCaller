import {existsSync,readFileSync,writeFileSync,chmodSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import webpush from 'web-push';
let text=readFileSync(existsSync('.env')?'.env':'.env.example','utf8');
const get=key=>text.match(new RegExp('^'+key+'=(.*)$','m'))?.[1]||'';
const put=(key,value)=>{const re=new RegExp('^'+key+'=.*$','m');text=re.test(text)?text.replace(re,key+'='+value):text+'\n'+key+'='+value+'\n';};
if(!get('BOOTSTRAP_TOKEN'))put('BOOTSTRAP_TOKEN',randomBytes(24).toString('base64url'));
if(!get('TURN_SECRET'))put('TURN_SECRET',randomBytes(32).toString('hex'));
if(Boolean(get('VAPID_PUBLIC_KEY'))!==Boolean(get('VAPID_PRIVATE_KEY')))throw new Error('Set both VAPID keys, or clear both to generate a pair.');
if(!get('VAPID_PUBLIC_KEY')){const keys=webpush.generateVAPIDKeys();put('VAPID_PUBLIC_KEY',keys.publicKey);put('VAPID_PRIVATE_KEY',keys.privateKey);}
writeFileSync('.env',text,{mode:0o600});chmodSync('.env',0o600);
console.log('Private .env is ready. Existing secrets were preserved. Use a private setup QR or BOOTSTRAP_TOKEN for the first phone.');
