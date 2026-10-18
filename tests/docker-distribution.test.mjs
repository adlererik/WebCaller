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
