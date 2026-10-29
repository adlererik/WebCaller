"""Versioned, allowlisted Docker snapshots. No Docker socket is mounted here."""
import hashlib,json,os,pathlib,shutil,tarfile,tempfile
from datetime import datetime,timezone
FILES={'compose.yaml','images.env','webcaller','README.md','VERSION','LICENSE','LICENSE-MIT','LICENSING.md','THIRD_PARTY_NOTICES.md'}
VOLUMES={'app_data','ntfy_state','publisher','caddy_data','caddy_config'}
LIMIT=100*1024**3

def allowed(name):
 p=pathlib.PurePosixPath(name)
 if p.is_absolute() or '..' in p.parts or str(p)!=name or '\\' in name:return False
 return name=='BACKUP.json' or (len(p.parts)>=2 and p.parts[0]=='bundle' and (p.parts[1] in FILES|{'.env'} and len(p.parts)==2 or p.parts[1]=='config')) or (len(p.parts)>=2 and p.parts[0]=='volumes' and p.parts[1] in VOLUMES)

def digest(path):
 h=hashlib.sha256()
 with path.open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()

def create(bundle,archive,volumes,owner=None):
 bundle=pathlib.Path(bundle);archive=pathlib.Path(archive)
 if archive.exists():raise ValueError('That backup file already exists. Choose a new filename.')
 manifest={'format':1,'version':(bundle/'VERSION').read_text().strip(),'project':env(bundle/'.env').get('COMPOSE_PROJECT_NAME','webcaller-prebuilt'),'created':datetime.now(timezone.utc).isoformat(),'volumes':sorted(volumes),'files':{}}
 if not set(volumes)<=VOLUMES:raise ValueError('Unexpected backup volume.')
 paths=[]
 for n in sorted(FILES|{'.env'}):
  p=bundle/n
  if not p.is_file() or p.is_symlink():raise ValueError('Installation bundle is incomplete or contains a symlink.')
  paths.append(('bundle/'+n,p))
 paths.append(('bundle/config',bundle/'config'))
 paths += [('volumes/'+n,pathlib.Path(p)) for n,p in sorted(volumes.items())]
 temporary=archive.with_name(archive.name+'.partial')
 try:
  with temporary.open('xb') as raw:
   os.chmod(temporary,0o600)
   with tarfile.open(fileobj=raw,mode='w:gz',dereference=False) as tar:
    def add(name,path):
     if not allowed(name) or path.is_symlink() or not (path.is_file() or path.is_dir()):raise ValueError('Backups require regular files/directories; replace symbolic links with copied files.')
     if path.is_file():manifest['files'][name]=digest(path)
     tar.add(path,arcname=name,recursive=False)
     if path.is_dir():
      for child in sorted(path.iterdir()):add(name+'/'+child.name,child)
    for name,path in paths:add(name,path)
    import io
    data=(json.dumps(manifest,sort_keys=True)+'\n').encode();item=tarfile.TarInfo('BACKUP.json');item.size=len(data);item.mode=0o600;tar.addfile(item,io.BytesIO(data))
  if owner:os.chown(temporary,*owner)
  os.replace(temporary,archive)
 except BaseException:
  temporary.unlink(missing_ok=True);raise
 return manifest

def env(path):return dict(l.split('=',1) for l in pathlib.Path(path).read_text().splitlines() if '=' in l and not l.startswith('#'))

def verify(archive):
 seen=set();dirs=set();hashes={};small={};manifest=None;total=0
 with tarfile.open(archive,'r:gz') as tar:
  for member in tar:
   name=member.name
   if not allowed(name) or name in seen or not (member.isfile() or member.isdir()):raise ValueError('Unsafe or duplicate backup entry.')
   if len(seen)>=200000 or member.size<0 or member.size>LIMIT or total+member.size>LIMIT:raise ValueError('Backup exceeds the supported size/count limit.')
   seen.add(name);total+=member.size
   if not (0<=member.uid<2**31 and 0<=member.gid<2**31):raise ValueError('Invalid backup file ownership.')
   if member.isdir():dirs.add(name);continue
   h=hashlib.sha256()
   f=tar.extractfile(member)
   if name in ['bundle/.env','bundle/VERSION']:
    if member.size>65536:raise ValueError('Backup configuration is too large.')
    data=f.read();small[name]=data.decode();h.update(data);hashes[name]=h.hexdigest();continue
   if name=='BACKUP.json':
    if member.size>16*1024*1024:raise ValueError('Backup manifest is too large.')
    manifest=json.loads(f.read());continue
   for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
   hashes[name]=h.hexdigest()
 if not manifest or manifest.get('format')!=1 or hashes!=manifest.get('files'):raise ValueError('Backup integrity check failed.')
 import re
 if not re.fullmatch(r'\d+\.\d+\.\d+',manifest.get('version','')) or not re.fullmatch(r'[a-z0-9][a-z0-9_-]{0,62}',manifest.get('project','')) or not set(manifest.get('volumes',[]))<=VOLUMES:raise ValueError('Invalid backup metadata.')
 if any('bundle/'+n not in hashes for n in FILES|{'.env'}) or 'bundle/config/app.env' not in hashes:raise ValueError('Backup is missing required configuration.')
 if 'bundle/config' not in dirs:raise ValueError('Missing configuration directory.')
 if small.get('bundle/VERSION','').strip()!=manifest['version']:raise ValueError('Backup version mismatch.')
 values=dict(l.split('=',1) for l in small['bundle/.env'].splitlines() if '=' in l and not l.startswith('#'))
 if values.get('COMPOSE_PROJECT_NAME','webcaller-prebuilt')!=manifest['project']:raise ValueError('Backup project mismatch.')
 actual_volumes={pathlib.PurePosixPath(n).parts[1] for n in seen if n.startswith('volumes/')}
 if actual_volumes!=set(manifest['volumes']):raise ValueError('Backup volume entries do not match the manifest.')
 for n in manifest['volumes']:
  if 'volumes/'+n not in dirs:raise ValueError('Missing backup volume.')
 # Reject paths nested beneath a regular file before changing any destination.
 for name in seen:
  for parent in pathlib.PurePosixPath(name).parents:
   if str(parent) in hashes:raise ValueError('A backup file is used as a directory.')
 return manifest

def restore(bundle,archive,volumes,owner):
 bundle=pathlib.Path(bundle);m=verify(archive)
 if set(volumes)!=set(m['volumes']):raise ValueError('Backup volume mapping does not match.')
 for root in volumes.values():
  root=pathlib.Path(root)
  if root.is_symlink() or not root.is_dir():raise ValueError('Invalid restore volume mount.')
 # The caller stops this installation first and takes a safety backup.
 stage=pathlib.Path(tempfile.mkdtemp(prefix='.restore-',dir=bundle));stage.chmod(0o700)
 try:
  for root in volumes.values():
   for p in pathlib.Path(root).iterdir():
    if p.is_dir() and not p.is_symlink():shutil.rmtree(p)
    else:p.unlink()
  with tarfile.open(archive,'r:gz') as tar:
   for item in tar:
    if item.name=='BACKUP.json':continue
    parts=pathlib.PurePosixPath(item.name).parts
    root=stage if parts[0]=='bundle' else pathlib.Path(volumes[parts[1]])
    tail=parts[1:] if parts[0]=='bundle' else parts[2:]
    dest=root.joinpath(*tail)
    dest.parent.mkdir(parents=True,exist_ok=True)
    if item.isdir():dest.mkdir(exist_ok=True)
    else:
     with dest.open('xb') as f:shutil.copyfileobj(tar.extractfile(item),f,1024*1024)
    os.chmod(dest,item.mode&0o777)
    os.chown(dest,*(owner if parts[0]=='bundle' else (item.uid,item.gid)))
  # Verify identity-bearing settings agree with the manifest before replacement.
  if env(stage/'.env').get('COMPOSE_PROJECT_NAME','webcaller-prebuilt')!=m['project'] or (stage/'VERSION').read_text().strip()!=m['version']:raise ValueError('Backup identity/version mismatch.')
  old=bundle/'config'
  if old.exists():shutil.rmtree(old)
  os.replace(stage/'config',old)
  for n in FILES|{'.env'}:os.replace(stage/n,bundle/n)
 finally:shutil.rmtree(stage,ignore_errors=True)
 return m


def seed(bundle,archive,owner):
 bundle=pathlib.Path(bundle);verify(archive)
 if (bundle/'.env').exists() or (bundle/'config').exists():raise ValueError('Restore into an empty installation folder, or use normal restore for the existing installation.')
 stage=pathlib.Path(tempfile.mkdtemp(prefix='.restore-',dir=bundle));stage.chmod(0o700)
 try:
  with tarfile.open(archive,'r:gz') as tar:
   for item in tar:
    if not item.name.startswith('bundle/'):continue
    dest=stage.joinpath(*pathlib.PurePosixPath(item.name).parts[1:]);dest.parent.mkdir(parents=True,exist_ok=True)
    if item.isdir():dest.mkdir(exist_ok=True)
    else:
     with dest.open('xb') as f:shutil.copyfileobj(tar.extractfile(item),f,1024*1024)
    os.chmod(dest,item.mode&0o777);os.chown(dest,*owner)
  for n in FILES|{'.env','config'}:os.replace(stage/n,bundle/n)
 finally:shutil.rmtree(stage,ignore_errors=True)
