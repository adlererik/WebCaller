"""Release only a reviewed Git tag and its pinned public upstream source."""
from pathlib import Path,PurePosixPath
import copy,gzip,hashlib,io,json,posixpath,subprocess,sys,tarfile,zipfile
tag,prefix,destination=sys.argv[1:];root=Path(__file__).resolve().parents[1]
pin='1738ead8a12ffe539f6309958123dadb16dc3b95';sub='third_party/libsignal/upstream'
def git(*args,cwd=root):return subprocess.check_output(['git',*args],cwd=cwd)
assert git('ls-tree',tag,'--',sub).decode().split()[:3]==['160000','commit',pin]
assert git('rev-parse','HEAD',cwd=root/sub).decode().strip()==pin
assert not git('status','--porcelain',cwd=root/sub).strip(),'Upstream must be pristine'
epoch=int(git('log','-1','--format=%ct',tag));entries={}
for archive_data,base in [(git('archive','--format=tar',tag),''),(git('archive','--format=tar',pin,cwd=root/sub),sub+'/')]:
 with tarfile.open(fileobj=io.BytesIO(archive_data)) as source:
  for member in source:
   name=base+member.name.rstrip('/')
   if name==sub:continue
   assert not name.startswith('/') and '..' not in PurePosixPath(name).parts
   if member.issym():
    target=posixpath.normpath(posixpath.join(posixpath.dirname(name),member.linkname))
    assert name.startswith(sub+'/') and not member.linkname.startswith('/') and target.startswith(sub+'/'),'Unsafe source link'
   assert member.isfile() or member.isdir() or member.issym()
   info=copy.copy(member);info.name=name;info.uid=info.gid=0;info.uname=info.gname='root';info.mtime=epoch;info.pax_headers={}
   entries[name]=(info,source.extractfile(member).read() if member.isfile() else None)
manifest={'version':tag,'upstreamCommit':pin,'sha256':{n:hashlib.sha256(d).hexdigest() for n,(m,d) in entries.items() if m.isfile()},'symlinks':{n:m.linkname for n,(m,d) in entries.items() if m.issym()}}
data=(json.dumps(manifest,indent=2)+'\n').encode();info=tarfile.TarInfo('SOURCE-MANIFEST.json');info.mode=0o644;info.size=len(data);info.mtime=epoch;entries[info.name]=(info,data)
def tar_bytes(items):
 out=io.BytesIO()
 with gzip.GzipFile(fileobj=out,mode='wb',mtime=epoch,filename='') as compressed,tarfile.open(fileobj=compressed,mode='w') as archive:
  for name,(member,data) in sorted(items.items()):
   item=copy.copy(member);item.name=prefix+'/'+name;archive.addfile(item,io.BytesIO(data) if data is not None else None)
 return out.getvalue()
offer=tar_bytes(entries);info=tarfile.TarInfo('public/preview-source.tar.gz');info.size=len(offer);info.mode=0o644;info.mtime=epoch;entries[info.name]=(info,offer)
out=root/destination;out.mkdir(parents=True,exist_ok=True);(out/(prefix+'.tar.gz')).write_bytes(tar_bytes(entries))
with zipfile.ZipFile(out/(prefix+'.zip'),'w',zipfile.ZIP_DEFLATED) as archive:
 import time,stat
 for name,(member,data) in sorted(entries.items()):
  item=zipfile.ZipInfo(prefix+'/'+name+('/' if member.isdir() else ''),time.gmtime(epoch)[:6]);item.create_system=3
  item.external_attr=((stat.S_IFLNK|0o777) if member.issym() else (stat.S_IFDIR if member.isdir() else stat.S_IFREG)|member.mode)<<16
  item.compress_type=zipfile.ZIP_DEFLATED;archive.writestr(item,member.linkname.encode() if member.issym() else data or b'')
print('Prepared complete public source archives with pinned upstream and matching source offer')
