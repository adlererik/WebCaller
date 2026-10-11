// the operator's existing Node origin already receives the Cloudflare Tunnel traffic.
// Preserve the complete current source (including uncommitted work) before editing.
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const target=resolve(process.argv[2]||(()=>{throw new Error('Supply the existing Node server source path');})());
const source=readFileSync(target,'utf8');
if(source.includes('proxyCalls(req,res)')){console.log('Archive proxy is already linked.');process.exit(0);}
const request='const server = http.createServer(async (req, res) => {';
const listen='server.listen(port, hostname,';
if(!source.includes(request)||!source.includes(listen))throw new Error('Unexpected Archive server structure; no file changed.');
const next=`import { proxyCalls, proxyCallUpgrade } from ${JSON.stringify(resolve('deploy/archive-proxy.mjs'))};\n`+source.replace(request,request+'\n  if (proxyCalls(req,res)) return;').replace(listen,"server.on('upgrade', proxyCallUpgrade);\n"+listen);
mkdirSync(resolve('deploy/backups'),{recursive:true,mode:0o700});
const backup=resolve('deploy/backups/archive-server-'+Date.now()+'.mjs');
writeFileSync(backup,source,{mode:0o600,flag:'wx'});writeFileSync(target,next);
console.log('Linked /calls HTTP and WebSocket proxy. Complete prior source saved at '+backup);
