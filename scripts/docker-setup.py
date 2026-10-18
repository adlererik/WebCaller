"""First-run configuration, private QR and reviewed bundle updates. Runs inside Docker."""
import argparse,contextlib,getpass,hashlib,ipaddress,json,os,pathlib,re,secrets,shutil,subprocess,sys,tarfile,tempfile,urllib.parse,urllib.request
FILES={'compose.yaml','images.env','webcaller','README.md','VERSION','LICENSE'}
def hostname(value):
 value=value.lower().strip()
 if not re.fullmatch(r'(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?',value) or '.' not in value or '..' in value:raise ValueError('Use a domain name without a scheme, port or path.')
 if any(not label or len(label)>63 or label.startswith('-') or label.endswith('-') for label in value.split('.')):raise ValueError('Invalid DNS hostname.')
 return value

def validate(s):
 s=dict(s);s['host']=hostname(s['host'])
 if s.get('mode') not in ['proxy','https','tunnel']:raise ValueError('Choose proxy, https or tunnel.')
 if s.get('relay') not in ['self','existing','none']:raise ValueError('Choose self, existing or none for TURN.')
 for key,default in [('appPort',8080),('ntfyPort',8094)]:
  s[key]=int(s.get(key,default))
  if not 1024<=s[key]<=65535:raise ValueError('Local ports must be 1024–65535.')
 if s['appPort']==s['ntfyPort']:raise ValueError('The app and ntfy need different local ports.')
 for key in ['publicIP','lanIP']:
  if s.get(key):
   ip=ipaddress.ip_address(s[key])
   if ip.version!=4 or (key=='publicIP' and not ip.is_global):raise ValueError('The relay needs a globally routable IPv4; LAN IPv4 is separate.')
 if s['relay']=='self' and not s.get('publicIP'):raise ValueError('Enter the relay public IPv4.')
 if s['relay']=='existing':
  urls=s.get('turnURLs','').split(',');secret=s.get('turnSecret','')
  if not urls or any(not re.fullmatch(r'turns?:[a-zA-Z0-9.-]+(?::[0-9]{1,5})?(?:\?transport=(?:udp|tcp))?',v) for v in urls):raise ValueError('Use comma-separated TURN URLs without embedded credentials.')
  if not re.fullmatch(r'[A-Za-z0-9_-]{32,256}',secret):raise ValueError('Use the existing relay REST shared secret, at least 32 characters.')
 if s.get('ntfy'):
  s['ntfyHost']=hostname(s['ntfyHost'])
  if s['host']==s['ntfyHost']:raise ValueError('ntfy needs a separate hostname.')
 if s['mode']=='tunnel' and not re.fullmatch(r'[A-Za-z0-9+/=_-]{20,4096}',s.get('tunnelToken','')):raise ValueError('Paste the tunnel connector token privately, without spaces.')
 if any('\n' in str(v) or '\r' in str(v) for v in s.values()):raise ValueError('Configuration values must be single-line.')
 return s

def write(path,text,mode=0o600):
 path.write_text(text);path.chmod(mode)
def envtext(values):return ''.join(k+'='+str(v)+'\n' for k,v in values.items())
def install(settings,bundle,vapid=None):
 s=validate(settings);bundle=pathlib.Path(bundle)
 if (bundle/'.env').exists() or (bundle/'config').exists():raise ValueError('Already configured or partial setup found. Keep the private files; use start/update rather than regenerating keys.')
 if vapid is None:
  r=subprocess.run(['node','--input-type=module','-e',"import p from 'web-push';process.stdout.write(JSON.stringify(p.generateVAPIDKeys()))"],cwd='/app',capture_output=True,text=True,check=True)
  vapid=json.loads(r.stdout)
 profiles=[]
 if s['mode'] in ['https','tunnel']:profiles.append(s['mode'])
 if s['relay']=='self':profiles.append('turn')
 if s.get('ntfy'):profiles.append('ntfy')
 secret=s.get('turnSecret') if s['relay']=='existing' else secrets.token_hex(32)
 urls=s.get('turnURLs','') if s['relay']=='existing' else (f"turn:{s['publicIP']}:3478?transport=udp,turn:{s['publicIP']}:3478?transport=tcp" if s['relay']=='self' else '')
 app={'PUBLIC_URL':'https://'+s['host']+'/calls','BOOTSTRAP_TOKEN':secrets.token_urlsafe(24),'VAPID_PUBLIC_KEY':vapid['publicKey'],'VAPID_PRIVATE_KEY':vapid['privateKey'],'VAPID_SUBJECT':'https://'+s['host'],'TURN_URLS':urls,'TURN_SECRET':secret}
 if s.get('ntfy'):app.update(NTFY_PUBLIC_URL='https://'+s['ntfyHost'],NTFY_PUBLISH_URL='http://ntfy:8094',NTFY_PUBLISH_TOKEN_FILE='/run/webcaller-ntfy/publisher.token',NTFY_ALLOW_DOCKER_HTTP='true',NTFY_IOS_UPSTREAM=str(bool(s.get('ios'))).lower())
 config=pathlib.Path(tempfile.mkdtemp(prefix='.setup-',dir=bundle));config.chmod(0o700)
 try:
  write(config/'app.env',envtext(app));write(config/'turn.env',envtext({'TURN_PUBLIC_IP':s.get('publicIP',''),'TURN_LAN_IP':s.get('lanIP',''),'TURN_SECRET':secret,'TURN_REALM':'webcaller'}))
  ntfy={'base-url':'https://'+s.get('ntfyHost','ntfy.example.com'),'listen-http':':8094','auth-file':'/var/lib/ntfy/auth.db','auth-default-access':'deny-all','cache-duration':'2m','manager-interval':'10s','web-root':'disable','log-level':'warn','upstream-base-url':'https://ntfy.sh' if s.get('ios') and s.get('ntfy') else ''}
  write(config/'ntfy.yml',''.join(k+': '+json.dumps(v)+'\n' for k,v in ntfy.items()),0o644)
  caddy=s['host']+' {\n  @phone path /calls /calls/*\n  reverse_proxy @phone webcaller:8080\n  respond "Not found" 404\n}\n'
  if s.get('ntfy'):caddy+='\n'+s['ntfyHost']+' {\n  reverse_proxy ntfy:8094 {\n    flush_interval -1\n  }\n}\n'
  write(config/'Caddyfile',caddy,0o644);write(config/'tunnel-token',s.get('tunnelToken','')+'\n');(config/'certs').mkdir(mode=0o700)
  os.rename(config,bundle/'config')
  write(bundle/'.env',envtext({'COMPOSE_PROFILES':','.join(profiles),'APP_PORT':s['appPort'],'NTFY_PORT':s['ntfyPort'],'NTFY_ENABLED':str(bool(s.get('ntfy'))).lower(),'SETUP_UID':os.getuid(),'SETUP_GID':os.getgid()}))
 except BaseException:
  if config.exists():shutil.rmtree(config)
  raise
 return {'profiles':profiles,'url':app['PUBLIC_URL']}

def wizard():
 print('WebCaller first setup. Keep this terminal private. Existing sites/routes are not changed.')
 host=input('Calls hostname (for example calls.example.com): ').strip()
 mode={'1':'https','2':'proxy','3':'tunnel'}[input('HTTPS: 1 automatic Caddy, 2 existing proxy/Tunnel, 3 new containerized Tunnel connector [2]: ').strip() or '2']
 token=getpass.getpass('Existing Cloudflare tunnel connector token (hidden): ') if mode=='tunnel' else ''
 relay={'1':'self','2':'existing','3':'none'}[input('TURN: 1 self-hosted, 2 existing REST relay, 3 configure later [1]: ').strip() or '1']
 s={'host':host,'mode':mode,'relay':relay,'tunnelToken':token}
 if relay=='self':
  s['publicIP']=input('Globally routable IPv4 of relay/router: ').strip();s['lanIP']=input('Fixed server LAN IPv4 behind home router (empty on a public VPS): ').strip()
 if relay=='existing':s.update(turnURLs=input('Comma-separated TURN URLs: ').strip(),turnSecret=getpass.getpass('REST shared secret (hidden): '))
 if relay=='none':print('Configure a reachable TURN relay before relying on calls across networks.')
 s['ntfy']=input('Enable optional ntfy extra ringing? [y/N]: ').strip().lower() in ['y','yes']
 if s['ntfy']:
  s['ntfyHost']=input('Separate ntfy hostname (for example ntfy.example.com): ').strip()
  s['ios']=input('Support iPhone ntfy wake-up via ntfy.sh metadata relay? [Y/n]: ').strip().lower() not in ['n','no']
 return s

def qr(bundle):
 import qrcode
 values=dict(line.split('=',1) for line in (bundle/'config/app.env').read_text().splitlines() if '=' in line)
 link=values['PUBLIC_URL'].rstrip('/')+'/#'+urllib.parse.urlencode({'setup':values['BOOTSTRAP_TOKEN'],'name':'My phone'})
 print('PRIVATE FIRST-PHONE SETUP. Scan with your Camera; keep this QR private. Other phones use invitations.')
 code=qrcode.QRCode(border=4);code.add_data(link);code.make(fit=True);code.print_ascii(invert=True)

def prepare_update(bundle,version):
 if not re.fullmatch(r'v[0-9]+\.[0-9]+\.[0-9]+',version):raise ValueError('Use an explicit release such as v0.16.1.')
 current=(bundle/'VERSION').read_text().strip()
 if tuple(map(int,version[1:].split('.')))<=tuple(map(int,current.split('.'))):raise ValueError('Choose a newer release; downgrades need manual migration review.')
 name='WebCaller-Docker-'+version;url='https://github.com/adlererik/WebCaller/releases/download/'+version+'/'
 with urllib.request.urlopen(url+'SHA256SUMS.txt',timeout=30) as r:sums=r.read(65536).decode()
 expected=next((line.split()[0] for line in sums.splitlines() if len(line.split())==2 and line.split()[-1]==name+'.tar.gz'),None)
 if not expected or not re.fullmatch('[a-f0-9]{64}',expected):raise ValueError('No checksum for the Docker bundle.')
 with urllib.request.urlopen(url+name+'.tar.gz',timeout=60) as r:data=r.read(4*1024*1024+1)
 if len(data)>4*1024*1024 or hashlib.sha256(data).hexdigest()!=expected:raise ValueError('Bundle size/checksum failed.')
 stage=bundle/'.updates'/version
 if stage.exists():shutil.rmtree(stage)
 stage.mkdir(parents=True,mode=0o700)
 import io
 with tarfile.open(fileobj=io.BytesIO(data),mode='r:gz') as archive:
  seen=set()
  for member in archive:
   if member.isdir():continue
   if not member.isfile() or not member.name.startswith(name+'/'):raise ValueError('Unexpected archive entry.')
   file=member.name[len(name)+1:]
   if file not in FILES or file in seen or member.size>2*1024*1024:raise ValueError('Unexpected or duplicate bundle file.')
   seen.add(file);write(stage/file,archive.extractfile(member).read().decode(),0o755 if file=='webcaller' else 0o644)
 if seen!=FILES or (stage/'VERSION').read_text().strip()!=version[1:]:raise ValueError('Incomplete or mismatched bundle.')
 images=dict(line.split('=',1) for line in (stage/'images.env').read_text().splitlines() if '=' in line and not line.startswith('#'))
 for key in ['WEBCALLER_IMAGE','SETUP_IMAGE','TURN_IMAGE']:
  if not re.fullmatch(r'ghcr\.io/adlererik/webcaller:[a-zA-Z0-9_.-]+@sha256:[a-f0-9]{64}',images.get(key,'')):raise ValueError('Update images must have the expected namespace and release digest.')
 if images.get('BUNDLE_FORMAT')!='1':raise ValueError('This release needs a different installer; follow its migration guide.')
 for key,prefix in [('NTFY_IMAGE','binwiederhier/ntfy:'),('CADDY_IMAGE','caddy:'),('TUNNEL_IMAGE','cloudflare/cloudflared:')]:
  if not re.fullmatch(re.escape(prefix)+r'[A-Za-z0-9_.-]+@sha256:[a-f0-9]{64}',images.get(key,'')):raise ValueError('Unexpected supporting image reference.')
 write(stage/'.verified',json.dumps({'from':current,'files':{f:hashlib.sha256((stage/f).read_bytes()).hexdigest() for f in FILES}}))
 print('Release bundle checksum and image references verified. Review its release notes before applying.')

def apply_update(bundle,version):
 if not re.fullmatch(r'v[0-9]+\.[0-9]+\.[0-9]+',version):raise ValueError('Invalid version.')
 stage=bundle/'.updates'/version
 if not all((stage/f).is_file() for f in FILES) or not (stage/'.verified').is_file():raise ValueError('Prepare the update first.')
 verified=json.loads((stage/'.verified').read_text())
 if verified.get('from')!=(bundle/'VERSION').read_text().strip() or any(verified.get('files',{}).get(f)!=hashlib.sha256((stage/f).read_bytes()).hexdigest() for f in FILES):raise ValueError('Prepared update changed or is stale; prepare it again.')
 previous=bundle/'.updates'/'previous';previous.mkdir(parents=True,exist_ok=True,mode=0o700)
 for f in FILES:
  shutil.copy2(bundle/f,previous/f)
  temp=bundle/('.new-'+f);shutil.copy2(stage/f,temp);os.replace(temp,bundle/f)
 print('Bundle updated. Private configuration and data volumes were preserved; no database rollback is attempted.')

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('action',choices=['init','qr','prepare-update','apply-update']);p.add_argument('version',nargs='?');p.add_argument('--bundle',type=pathlib.Path,default=pathlib.Path('/bundle'));p.add_argument('--settings',type=pathlib.Path)
 a=p.parse_args();os.umask(0o077)
 if a.action=='init':
  result=install(json.loads(a.settings.read_text()) if a.settings else wizard(),a.bundle)
  print('Private configuration created. Start with ./webcaller start, then ./webcaller qr.');print('Phone address: '+result['url'])
 elif a.action=='qr':qr(a.bundle)
 elif a.action=='prepare-update':prepare_update(a.bundle,a.version or '')
 elif a.action=='apply-update':apply_update(a.bundle,a.version or '')
if __name__=='__main__':
 try:main()
 except (EOFError,KeyboardInterrupt):
  print('Setup cancelled. Keep any existing private configuration.',file=sys.stderr);sys.exit(1)
 except (ValueError,KeyError,OSError,subprocess.SubprocessError) as e:
  # Do not echo URLs, credentials, source JSON or subprocess output in errors.
  if isinstance(e,ValueError):print(str(e),file=sys.stderr)
  else:print('Setup/update failed. Check the private configuration, network and Docker permissions. Existing secrets were not printed.',file=sys.stderr)
  sys.exit(1)
