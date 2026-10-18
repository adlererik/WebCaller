// A publishing guard, not a substitute for a security audit or secret scanner.
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

export function problems(path, data) {
  const issues=[];
  if (/(^|\/)(node_modules|\.npm|\.cache|\.runtime|data|artifacts|certs|backups|__pycache__|config|\.updates)(\/|$)/i.test(path) ||
      /(^|\/)\.env(?:\..*)?$/.test(path) && path!=='.env.example' ||
      /\.(?:pem|key|sqlite(?:3)?(?:-wal|-shm)?|db|log|pyc|tgz|zip|tar\.gz)$/i.test(path)) issues.push('private/runtime filename');
  if (/(^|\/)(?:app|turn)\.env$/.test(path)) issues.push('private service environment');
  if (/(^|\/)\.setup-[^/]+(\/|$)|(^|\/)tunnel-token$/.test(path)) issues.push('private setup state');
  const text=data.toString('utf8');
  if (/-----BEGIN (?:[A-Z ]*PRIVATE KEY)-----/.test(text)) issues.push('private key');
  if (/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[0-9A-Z]{16})\b/.test(text)) issues.push('credential pattern');
  if (/(?<![A-Za-z0-9_-])wc_[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/.test(text)) issues.push('embedded ntfy read capability');
  if (/\btk_[a-z0-9]{20,}\b/.test(text)) issues.push('ntfy credential pattern');
  if (/(?:[#&]setup=)[A-Za-z0-9_-]{20,}/.test(text)) issues.push('embedded owner setup link');
  if (/^(?:BOOTSTRAP_TOKEN|VAPID_PRIVATE_KEY|CF_TURN_API_TOKEN|TURN_SECRET|NTFY_PUBLISH_TOKEN)=[^\r\n]+/m.test(text)) issues.push('populated secret assignment');
  return issues;
}

export function audit(ref, cwd=process.cwd()) {
  const files=execFileSync('git',ref?['ls-tree','-r','--name-only','-z',ref]:['ls-files','-z'],{cwd}).toString().split('\0').filter(Boolean);
  if (!files.length) throw new Error('No tracked source. Stage the reviewed source before auditing.');
  const failures=[];
  for (const file of files) {
    const data=ref?execFileSync('git',['show',`${ref}:${file}`],{cwd,maxBuffer:20*1024*1024}):readFileSync(`${cwd}/${file}`);
    for (const issue of problems(file,data)) failures.push(`${file}: ${issue}`);
  }
  if (failures.length) throw new Error('Publishing guard failed:\n'+failures.join('\n'));
  return files.length;
}

if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try { console.log(`PASS publishing guard: ${audit(process.argv[2])} tracked files. Review separately for deployment-specific data.`); }
  catch (error) { console.error(error.message);process.exitCode=1; }
}
