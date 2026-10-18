import {mkdirSync,readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {audit} from './audit-source.mjs';
const tag=process.argv[2];
if (!/^v\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(tag||'')) throw new Error('Supply a version tag, for example v0.1.0');
execFileSync('git',['rev-parse','--verify',`refs/tags/${tag}`]);
const pkg=JSON.parse(execFileSync('git',['show',`${tag}:package.json`]).toString());
if ('v'+pkg.version!==tag) throw new Error('Tag does not match package version');
audit(tag);
const out='.runtime/releases';mkdirSync(out,{recursive:true,mode:0o700});
const base=`WebCaller-${tag}`;
const files=[];
for (const [format,suffix] of [['tar.gz','tar.gz'],['zip','zip']]) {
  const name=`${base}.${suffix}`;
  execFileSync('git',['archive',`--format=${format}`,`--prefix=${base}/`,`--output=${out}/${name}`,tag]);
  files.push(createHash('sha256').update(readFileSync(`${out}/${name}`)).digest('hex')+'  '+name);
}
// A small optional deployment bundle, independent of source/runtime directories.
const digestFile=process.argv[3];
if(digestFile){
  const digests=JSON.parse(readFileSync(digestFile,'utf8'));
  const dir=mkdtempSync(out+'/bundle-'),prefix=`WebCaller-Docker-${tag}`;mkdirSync(`${dir}/${prefix}`);
  try{
    for(const name of ['compose.yaml','images.env','webcaller','README.md','VERSION'])writeFileSync(`${dir}/${prefix}/${name}`,execFileSync('git',['show',`${tag}:docker/${name}`]),{mode:name==='webcaller'?0o755:0o644});
    writeFileSync(`${dir}/${prefix}/LICENSE`,execFileSync('git',['show',`${tag}:LICENSE`]));
    let env=readFileSync(`${dir}/${prefix}/images.env`,'utf8');
    for(const key of ['WEBCALLER_IMAGE','SETUP_IMAGE','TURN_IMAGE']){
      if(!/^sha256:[a-f0-9]{64}$/.test(digests[key]||''))throw new Error('Missing reviewed image digest: '+key);
      const line=env.match(new RegExp('^'+key+'=(.*)$','m'));
      if(!line)throw new Error('Missing image reference: '+key);
      env=env.replace(line[0],key+'='+line[1].split('@')[0]+'@'+digests[key]);
    }
    writeFileSync(`${dir}/${prefix}/images.env`,env);
    execFileSync('python3',['-c',`import pathlib,tarfile,zipfile,sys
root=pathlib.Path(sys.argv[1]);base=root/sys.argv[2];out=pathlib.Path(sys.argv[3])
with tarfile.open(out/(base.name+'.tar.gz'),'w:gz') as tar:tar.add(base,arcname=base.name)
with zipfile.ZipFile(out/(base.name+'.zip'),'w',zipfile.ZIP_DEFLATED) as z:
 for p in sorted(base.iterdir()):z.write(p,base.name+'/'+p.name)
`,dir,prefix,out]);
    for(const suffix of ['tar.gz','zip']){const name=prefix+'.'+suffix;files.push(createHash('sha256').update(readFileSync(`${out}/${name}`)).digest('hex')+'  '+name);}
  }finally{rmSync(dir,{recursive:true,force:true});}
}
writeFileSync(`${out}/SHA256SUMS.txt`,files.join('\n')+'\n');
console.log(`Release archives and checksums ready in ${out}; only the audited tag was packaged.`);
