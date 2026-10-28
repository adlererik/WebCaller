import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {audit} from '../scripts/audit-source.mjs';
test('prebuilt bundle pins its own published version independently of newer source releases and requires private setup',()=>{
 const source=JSON.parse(readFileSync('package.json')).version,version=readFileSync('docker/VERSION','utf8').trim();
 assert.match(version,/^\d+\.\d+\.\d+$/);
 const a=version.split('.').map(Number),b=source.split('.').map(Number);
 assert.ok(a[0]<b[0]||a[0]===b[0]&&(a[1]<b[1]||a[1]===b[1]&&a[2]<=b[2]),'prebuilt release cannot claim a future source version');
 const images=readFileSync('docker/images.env','utf8');
 for(const suffix of ['','-setup','-turn'])assert.ok(images.includes('ghcr.io/adlererik/webcaller:'+version+suffix+'\n'));
 assert.match(images,/BUNDLE_FORMAT=2/);
 const result=spawnSync('sh',['docker/webcaller','status'],{encoding:'utf8'});
 assert.equal(result.status,1);assert.match(result.stdout+result.stderr,/Run \.\/webcaller setup first/);
});
test('publishing guard accepts only the pinned official upstream gitlink and rejects substitution',t=>{
 const cwd=mkdtempSync(join(tmpdir(),'webcaller-publication-'));t.after(()=>rmSync(cwd,{recursive:true,force:true}));
 const git=(...args)=>{const result=spawnSync('git',args,{cwd,encoding:'utf8'});assert.equal(result.status,0,result.stderr);return result.stdout;};
 git('init','-q');writeFileSync(join(cwd,'.gitmodules'),'[submodule "third_party/libsignal/upstream"]\n path = third_party/libsignal/upstream\n url = https://github.com/signalapp/libsignal.git\n');git('add','.gitmodules');
 git('update-index','--add','--cacheinfo','160000,1738ead8a12ffe539f6309958123dadb16dc3b95,third_party/libsignal/upstream');
 assert.equal(audit(undefined,cwd),2);
 git('update-index','--cacheinfo','160000,1111111111111111111111111111111111111111,third_party/libsignal/upstream');assert.throws(()=>audit(undefined,cwd),/Unexpected upstream/);
 git('update-index','--cacheinfo','160000,1738ead8a12ffe539f6309958123dadb16dc3b95,third_party/libsignal/upstream');
 writeFileSync(join(cwd,'.gitmodules'),readFileSync(join(cwd,'.gitmodules'),'utf8').replace('signalapp/libsignal.git','unexpected/source.git'));
 assert.throws(()=>audit(undefined,cwd),/Unexpected upstream/);
});
