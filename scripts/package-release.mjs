import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
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
writeFileSync(`${out}/SHA256SUMS.txt`,files.join('\n')+'\n');
console.log(`Release archives and checksums ready in ${out}; only the audited tag was packaged.`);
