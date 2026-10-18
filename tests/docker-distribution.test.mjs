import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
function python(code){const r=spawnSync('python3',['-c',code],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout;}
const load=`import importlib.util,pathlib,json,os,tempfile\nspec=importlib.util.spec_from_file_location('setup',${JSON.stringify(resolve('scripts/docker-setup.py'))});m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)\n`;
test('container setup rejects unsafe input before writing and preserves existing installations',t=>{
 const dir=mkdtempSync(join(tmpdir(),'webcaller-bundle-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 python(load+`b=pathlib.Path(${JSON.stringify(dir)})\ns={'host':'calls.example.test','mode':'proxy','relay':'self','publicIP':'1.1.1.1','ntfy':True,'ntfyHost':'notify.example.test','ios':True}\nfor patch in [{'host':'x.test\\nPORT=1'},{'host':'x.test;bad'},{'ntfyHost':s['host']},{'publicIP':'192.168.0.1'},{'mode':'invalid'},{'mode':'tunnel','tunnelToken':''},{'appPort':80}]:\n try:m.install({**s,**patch},b,{'publicKey':'public-fixture','privateKey':'private-fixture'})\n except ValueError:pass\n else:raise Exception('unsafe settings accepted')\nassert not (b/'config').exists()\nm.install(s,b,{'publicKey':'public-fixture','privateKey':'private-fixture'})\nbefore=(b/'config/app.env').read_bytes()\ntry:m.install(s,b,{'publicKey':'changed','privateKey':'changed'})\nexcept ValueError:pass\nelse:raise Exception('existing config replaced')\nassert (b/'config/app.env').read_bytes()==before\nassert (b/'config/app.env').stat().st_mode&0o777==0o600\nassert (b/'config').stat().st_mode&0o777==0o700\n`);
 const app=readFileSync(join(dir,'config/app.env'),'utf8');assert.match(app,/NTFY_PUBLISH_TOKEN_FILE=\/run\/webcaller-ntfy\/publisher.token/);assert.ok(!app.includes('NTFY_PUBLISH_TOKEN='));
 const config=readFileSync(join(dir,'config/ntfy.yml'),'utf8');assert.match(config,/auth-default-access: "deny-all"/);assert.match(config,/upstream-base-url: "https:\/\/ntfy.sh"/);
 assert.match(readFileSync(join(dir,'.env'),'utf8'),/COMPOSE_PROFILES=turn,ntfy/);
});
test('optional services stay disabled unless selected and tunnel secrets stay out of app configuration',t=>{
 const dir=mkdtempSync(join(tmpdir(),'webcaller-tunnel-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 python(load+`b=pathlib.Path(${JSON.stringify(dir)})\nm.install({'host':'calls.example.test','mode':'tunnel','tunnelToken':'synthetic-tunnel-connector-fixture','relay':'none'},b,{'publicKey':'public-fixture','privateKey':'private-fixture'})\n`);
 assert.match(readFileSync(join(dir,'.env'),'utf8'),/COMPOSE_PROFILES=tunnel\n/);assert.ok(!readFileSync(join(dir,'config/app.env'),'utf8').includes('synthetic-tunnel'));
 assert.equal(readFileSync(join(dir,'config/tunnel-token'),'utf8').trim(),'synthetic-tunnel-connector-fixture');
});
test('update validation rejects invalid versions before network access and keeps existing config',()=>{
 python(load+`for version in ['latest','../../x','v1.2.3/other','v1.2.3;bad','v1.2']:\n try:m.prepare_update(pathlib.Path('/unused'),version)\n except ValueError:pass\n else:raise Exception('unsafe version accepted')\n`);
});
test('a verified update preserves private settings and rejects altered staged files',t=>{
 const dir=mkdtempSync(join(tmpdir(),'webcaller-update-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 python(load+`import io,tarfile,hashlib,contextlib\nb=pathlib.Path(${JSON.stringify(dir)})\nb.mkdir(exist_ok=True);(b/'config').mkdir();(b/'config/app.env').write_text('existing private fixture')\nfor f in m.FILES:(b/f).write_text('0.16.0' if f=='VERSION' else 'old '+f)\nimage='ghcr.io/adlererik/webcaller:0.16.1@sha256:'+'a'*64\nimages='BUNDLE_FORMAT=1\\n'+''.join(k+'='+image+'\\n' for k in ['WEBCALLER_IMAGE','SETUP_IMAGE','TURN_IMAGE'])+''.join(k+'='+v+'@sha256:'+'b'*64+'\\n' for k,v in [('NTFY_IMAGE','binwiederhier/ntfy:v2.31.1'),('CADDY_IMAGE','caddy:2-alpine'),('TUNNEL_IMAGE','cloudflare/cloudflared:latest')])\narchive=io.BytesIO()\nwith tarfile.open(fileobj=archive,mode='w:gz') as tar:\n for f in m.FILES:\n  data=('0.16.1' if f=='VERSION' else images if f=='images.env' else 'new '+f).encode();entry=tarfile.TarInfo('WebCaller-Docker-v0.16.1/'+f);entry.size=len(data);tar.addfile(entry,io.BytesIO(data))\ndata=archive.getvalue();sums=hashlib.sha256(data).hexdigest()+'  WebCaller-Docker-v0.16.1.tar.gz\\n'\nm.urllib.request.urlopen=lambda url,timeout:contextlib.closing(io.BytesIO(sums.encode() if url.endswith('SHA256SUMS.txt') else data))\nm.prepare_update(b,'v0.16.1')\nstage=b/'.updates/v0.16.1';(stage/'compose.yaml').write_text('tampered')\ntry:m.apply_update(b,'v0.16.1')\nexcept ValueError:pass\nelse:raise Exception('altered staging accepted')\nassert (b/'VERSION').read_text()=='0.16.0'\nm.prepare_update(b,'v0.16.1');m.apply_update(b,'v0.16.1')\nassert (b/'VERSION').read_text()=='0.16.1'\nassert (b/'config/app.env').read_text()=='existing private fixture'\ntry:m.prepare_update(b,'v0.16.0')\nexcept ValueError:pass\nelse:raise Exception('downgrade accepted')\n`);
});
