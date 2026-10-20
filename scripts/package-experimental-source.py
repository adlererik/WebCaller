"""Package tracked corresponding source; never walk private runtime/state."""
from pathlib import Path
import subprocess,tarfile,gzip,io,hashlib,json,os
root=Path(__file__).resolve().parents[1]
sub='third_party/libsignal/upstream'
subprocess.run(['python3',str(root/'scripts/verify-signal-source.py')],cwd=root,check=True)
def tracked(cwd):return subprocess.check_output(['git','ls-files','-z'],cwd=cwd).decode().split('\0')
files=[name for name in tracked(root) if name and name!=sub]
files += [sub+'/'+name for name in tracked(root/sub) if name]
output=root/'public/preview-source.tar.gz'
manifest={};links={};temporary=root/'.runtime/experimental-source.tmp';temporary.parent.mkdir(exist_ok=True)
with temporary.open('wb') as raw,gzip.GzipFile(filename='',fileobj=raw,mode='wb',mtime=0) as compressed,tarfile.open(fileobj=compressed,mode='w') as archive:
 for name in sorted(files):
  path=root/name
  if path.is_symlink():
   # Preserve official internal fixture links without following anything outside
   # the checked source. No application/private filesystem links are accepted.
   assert name.startswith(sub+'/') and path.resolve().is_relative_to((root/sub).resolve()),'Unsafe source symlink: '+name
   target=os.readlink(path);assert not Path(target).is_absolute()
   entry=tarfile.TarInfo('WebCaller-Experimental/'+name);entry.type=tarfile.SYMTYPE;entry.linkname=target;entry.mode=0o777;archive.addfile(entry);links[name]=target;continue
  assert path.is_file(),'Expected a source file: '+name
  data=path.read_bytes();entry=tarfile.TarInfo('WebCaller-Experimental/'+name);entry.size=len(data);entry.mode=0o755 if path.stat().st_mode&0o111 else 0o644;entry.mtime=0
  archive.addfile(entry,io.BytesIO(data));manifest[name]=hashlib.sha256(data).hexdigest()
 data=(json.dumps({'libsignalCommit':'1738ead8a12ffe539f6309958123dadb16dc3b95','sha256':manifest,'symlinks':links},indent=2)+'\n').encode()
 entry=tarfile.TarInfo('WebCaller-Experimental/SOURCE-MANIFEST.json');entry.size=len(data);entry.mode=0o644;archive.addfile(entry,io.BytesIO(data))
temporary.replace(output)
print('Prepared public corresponding source:',len(files),'files,',output.stat().st_size,'bytes; no runtime/configuration files included')
