"""Guided Linux configuration and verified updates. Runs inside the setup image."""
import argparse,contextlib,getpass,hashlib,ipaddress,json,os,pathlib,re,secrets,shutil,socket,struct,subprocess,sys,tarfile,tempfile,urllib.parse,urllib.request
FILES={'compose.yaml','images.env','webcaller','README.md','VERSION','LICENSE','LICENSE-MIT','LICENSING.md','THIRD_PARTY_NOTICES.md'}
def hostname(value):
 value=value.lower().strip()
 if not re.fullmatch(r'(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?',value) or '.' not in value or '..' in value:raise ValueError('Enter a domain name such as phone.example.com, without https:// or a path.')
 if any(not label or len(label)>63 or label.startswith('-') or label.endswith('-') for label in value.split('.')):raise ValueError('Check the spelling of the domain name.')
 return value

def validate(s):
 s=dict(s);s['host']=hostname(s['host'])
 if s.get('mode') not in ['proxy','https','tunnel']:raise ValueError('Choose automatic HTTPS, existing proxy or Tunnel.')
 if s.get('relay') not in ['self','existing','none']:raise ValueError('Choose self-hosted TURN, an existing relay or configure later.')
 s['appPath']=s.get('appPath','/calls').rstrip('/')
 if not re.fullmatch(r'/[a-zA-Z0-9][a-zA-Z0-9/_-]{0,99}',s['appPath']) or '//' in s['appPath']:raise ValueError('Use a simple application path such as /calls.')
 for key,default in [('appPort',8080),('ntfyPort',8094)]:
  s[key]=int(s.get(key,default))
  if not 1024<=s[key]<=65535:raise ValueError('Local ports must be 1024–65535.')
 if s['appPort']==s['ntfyPort']:raise ValueError('The app and ntfy need different local ports.')
 for key in ['publicIP','lanIP']:
  if s.get(key):
   ip=ipaddress.ip_address(s[key])
   if ip.version!=4 or (key=='publicIP' and not ip.is_global):raise ValueError('The relay needs a public IPv4. A private/router address cannot receive calls from the internet.')
 if s['relay']=='self' and not s.get('publicIP'):raise ValueError('Enter the TURN relay’s public IPv4 address.')
 if s['relay']=='existing':
  urls=[u.strip() for u in s.get('turnURLs','').split(',')];secret=s.get('turnSecret','')
  if not urls or any(not re.fullmatch(r'turns?:[a-zA-Z0-9.-]+(?::[0-9]{1,5})?(?:\?transport=(?:udp|tcp))?',v) for v in urls):raise ValueError('Use TURN addresses such as turn:relay.example.com:3478?transport=udp, without embedded passwords.')
  if not re.fullmatch(r'[A-Za-z0-9_-]{32,256}',secret):raise ValueError('This relay option needs its REST shared secret, at least 32 letters/digits/_/-. Ordinary account passwords are different.')
  s['turnURLs']=','.join(urls)
 if s.get('ntfy'):
  s['ntfyHost']=hostname(s['ntfyHost'])
  if s['host']==s['ntfyHost']:raise ValueError('Use a different hostname for ntfy, such as notify.example.com.')
 if s['mode']=='tunnel' and not re.fullmatch(r'[A-Za-z0-9+/=_-]{20,4096}',s.get('tunnelToken','')):raise ValueError('Paste the Cloudflare connector token privately, without spaces.')
 if any('\n' in str(v) or '\r' in str(v) for v in s.values()):raise ValueError('Configuration values must be single-line.')
 return s

def write(path,text,mode=0o600):path.write_text(text);path.chmod(mode)
def envtext(values):return ''.join(k+'='+str(v)+'\n' for k,v in values.items())
def readenv(path):return dict(l.split('=',1) for l in pathlib.Path(path).read_text().splitlines() if '=' in l and not l.startswith('#'))
def current(bundle):
 app=readenv(bundle/'config/app.env');env=readenv(bundle/'.env');profiles=env.get('COMPOSE_PROFILES','').split(',');url=urllib.parse.urlsplit(app['PUBLIC_URL'])
 turn=readenv(bundle/'config/turn.env')
 return {'host':url.hostname,'appPath':url.path,'mode':'https' if 'https' in profiles else 'tunnel' if 'tunnel' in profiles else 'proxy','relay':'self' if 'turn' in profiles else 'existing' if app.get('TURN_URLS') else 'none','publicIP':turn.get('TURN_PUBLIC_IP',''),'lanIP':turn.get('TURN_LAN_IP',''),'turnURLs':app.get('TURN_URLS',''),'turnSecret':app.get('TURN_SECRET',''),'appPort':int(env.get('APP_PORT',8080)),'ntfyPort':int(env.get('NTFY_PORT',8094)),'ntfy':'ntfy' in profiles,'ntfyHost':urllib.parse.urlsplit(app.get('NTFY_PUBLIC_URL','')).hostname or '','ios':app.get('NTFY_IOS_UPSTREAM')=='true','tunnelToken':(bundle/'config/tunnel-token').read_text().strip()}

def install(settings,bundle,vapid=None,replace=False):
 s=validate(settings);bundle=pathlib.Path(bundle);existing=(bundle/'.env').exists() or (bundle/'config').exists()
 if existing and not replace:raise ValueError('Already configured. Use ./webcaller configure to change settings, or ./webcaller start to start it. Your keys have not been replaced.')
 if replace and not ((bundle/'.env').is_file() and (bundle/'config/app.env').is_file()):raise ValueError('The existing configuration is incomplete. Restore a backup before reconfiguring.')
 prior=readenv(bundle/'config/app.env') if replace else {};env=readenv(bundle/'.env') if replace else {}
 if not replace and vapid is None:
  r=subprocess.run(['node','--input-type=module','-e',"import p from 'web-push';process.stdout.write(JSON.stringify(p.generateVAPIDKeys()))"],cwd='/app',capture_output=True,text=True,check=True);vapid=json.loads(r.stdout)
 profiles=[]
 if s['mode'] in ['https','tunnel']:profiles.append(s['mode'])
 if s['relay']=='self':profiles.append('turn')
 if s.get('ntfy'):profiles.append('ntfy')
 old=current(bundle) if replace else {}
 secret=s.get('turnSecret') if s['relay']=='existing' else prior.get('TURN_SECRET') or secrets.token_hex(32)
 urls=s.get('turnURLs','') if s['relay']=='existing' else (f"turn:{s['publicIP']}:3478?transport=udp,turn:{s['publicIP']}:3478?transport=tcp" if s['relay']=='self' else '')
 if s['relay']=='self' and old.get('relay')=='self':
  extra=[u for u in prior.get('TURN_URLS','').split(',') if u.startswith('turns:')]
  if extra:urls+=','+','.join(extra)
 app=dict(prior)
 if not replace:app.update(BOOTSTRAP_TOKEN=secrets.token_urlsafe(24),VAPID_PUBLIC_KEY=vapid['publicKey'],VAPID_PRIVATE_KEY=vapid['privateKey'],VAPID_SUBJECT='https://'+s['host'])
 if replace and old.get('appPath')!=s['appPath']:app.setdefault('APP_MANIFEST_ID',old['appPath'].rstrip('/')+'/')
 app.update(WEBCALLER_CRYPTO_ENGINE='libsignal-pqxdh-v1',PUBLIC_URL='https://'+s['host']+s['appPath'],TURN_URLS=urls,TURN_SECRET=secret)
 if replace and old.get('relay')!=s['relay']:
  app.pop('CF_TURN_KEY_ID',None);app.pop('CF_TURN_API_TOKEN',None)
 for k in ['NTFY_PUBLIC_URL','NTFY_PUBLISH_URL','NTFY_PUBLISH_TOKEN_FILE','NTFY_ALLOW_DOCKER_HTTP','NTFY_IOS_UPSTREAM']:app.pop(k,None)
 if s.get('ntfy'):app.update(NTFY_PUBLIC_URL='https://'+s['ntfyHost'],NTFY_PUBLISH_URL='http://ntfy:8094',NTFY_PUBLISH_TOKEN_FILE='/run/webcaller-ntfy/publisher.token',NTFY_ALLOW_DOCKER_HTTP='true',NTFY_IOS_UPSTREAM=str(bool(s.get('ios'))).lower())
 config=pathlib.Path(tempfile.mkdtemp(prefix='.setup-',dir=bundle));config.chmod(0o700)
 previous=None
 try:
  write(config/'app.env',envtext(app));write(config/'turn.env',envtext({'TURN_PUBLIC_IP':s.get('publicIP',''),'TURN_LAN_IP':s.get('lanIP',''),'TURN_SECRET':secret,'TURN_REALM':'webcaller'}))
  ntfy={'base-url':'https://'+s.get('ntfyHost','ntfy.example.com'),'listen-http':':8094','auth-file':'/var/lib/ntfy/auth.db','auth-default-access':'deny-all','cache-duration':'2m','manager-interval':'10s','web-root':'disable','log-level':'warn','upstream-base-url':'https://ntfy.sh' if s.get('ios') and s.get('ntfy') else ''}
  write(config/'ntfy.yml',''.join(k+': '+json.dumps(v)+'\n' for k,v in ntfy.items()),0o644)
  caddy=s['host']+' {\n  @phone path '+s['appPath']+' '+s['appPath']+'/*\n  reverse_proxy @phone webcaller:8080\n  respond "Not found" 404\n}\n'
  if s.get('ntfy'):caddy+='\n'+s['ntfyHost']+' {\n  reverse_proxy ntfy:8094 {\n    flush_interval -1\n  }\n}\n'
  write(config/'Caddyfile',caddy,0o644);write(config/'tunnel-token',s.get('tunnelToken','')+'\n')
  if replace and (bundle/'config/certs').is_dir():shutil.copytree(bundle/'config/certs',config/'certs')
  else:(config/'certs').mkdir(mode=0o700)
  settings={k:v for k,v in s.items() if k not in ['turnSecret','tunnelToken']};write(config/'setup.json',json.dumps(settings,indent=2)+'\n')
  if replace:
   previous=bundle/'.previous-config'
   if previous.exists():raise ValueError('A previous configuration recovery is pending. Use restore before trying again.')
   os.rename(bundle/'config',previous)
  os.rename(config,bundle/'config')
  env.update(COMPOSE_PROFILES=','.join(profiles),APP_PORT=s['appPort'],NTFY_PORT=s['ntfyPort'],NTFY_ENABLED=str(bool(s.get('ntfy'))).lower(),SETUP_UID=os.getuid(),SETUP_GID=os.getgid())
  env.setdefault('COMPOSE_PROJECT_NAME','webcaller-prebuilt' if replace else 'webcaller-'+secrets.token_hex(4))
  temp=bundle/'.env.new';write(temp,envtext(env));os.replace(temp,bundle/'.env')
  if previous:shutil.rmtree(previous)
 except BaseException:
  if config.exists():shutil.rmtree(config)
  if previous and previous.exists():
   if (bundle/'config').exists():shutil.rmtree(bundle/'config')
   os.rename(previous,bundle/'config')
  raise
 return {'profiles':profiles,'url':app['PUBLIC_URL']}

def ask(label,default='',check=None,secret=False):
 while True:
  suffix=' [Enter to keep]' if secret and default else ' ['+str(default)+']' if str(default) else ''
  value=(getpass.getpass if secret else input)(label+suffix+': ').strip() or default
  try:return check(value) if check else value
  except (ValueError,TypeError):print('  Please check that answer and try again. Use the format in the explanation above.')
def localport(v):
 value=int(v)
 if not 1024<=value<=65535:raise ValueError('Use a local port from 1024 to 65535.')
 return value
def public4(v):
 ip=ipaddress.IPv4Address(v)
 if not ip.is_global:raise ValueError('A public IPv4 is needed; choose an external relay for CGNAT.')
 return str(ip)
def secret_value(v,pattern):
 if not re.fullmatch(pattern,v):raise ValueError('Check the secret format.')
 return v
def choice(label,options,default):
 print('\n'+label)
 for i,(key,text) in enumerate(options,1):print('  '+str(i)+'. '+text)
 return ask('Choose a number',str(next(i for i,(k,_) in enumerate(options,1) if k==default)),lambda v:dict((str(i),k) for i,(k,_) in enumerate(options,1))[v] if v in [str(i) for i in range(1,len(options)+1)] else (_ for _ in ()).throw(ValueError()))
def yes(label,default=False):return ask(label,'yes' if default else 'no',lambda v:v.lower() in ['y','yes'] if v.lower() in ['y','yes','n','no'] else (_ for _ in ()).throw(ValueError()))
def public_ip():
 try:
  transaction=secrets.token_bytes(12)
  with socket.socket(socket.AF_INET,socket.SOCK_DGRAM) as s:
   s.settimeout(2);s.sendto(struct.pack('!HHI',1,0,0x2112a442)+transaction,('stun.cloudflare.com',3478));data=s.recv(2048)
  if data[8:20]!=transaction:return ''
  pos=20
  while pos+4<=len(data):
   kind,n=struct.unpack('!HH',data[pos:pos+4]);v=data[pos+4:pos+4+n];pos+=4+((n+3)//4)*4
   if kind==0x20 and len(v)>=8 and v[1]==1:return str(ipaddress.IPv4Address(bytes(a^b for a,b in zip(v[4:8],bytes.fromhex('2112a442')))))
 except (OSError,ValueError):pass
 return ''
def wizard(prior=None):
 old=prior or {};s=dict(old)
 print('\nWEBCALLER · '+('CHANGE SETTINGS' if prior else 'WELCOME'))
 print('A browser phone, hosted by you. This wizard keeps passwords and phone setup keys private.')
 print('\n1 OF 4 · YOUR WEBSITE')
 print('Use a hostname you own, for example phone.example.com. No domain is bought by this installer.')
 s['host']=ask('Website hostname',old.get('host',''),hostname)
 if prior and s['host']!=old['host']:print('A different hostname uses different browser storage. Existing phones will need setup at the new address; saved phone keys are not moved by changing DNS.')
 print('\n2 OF 4 · SECURE ACCESS')
 print('Automatic HTTPS suits a fresh public server. If a website or Tunnel already uses this server, keep that setup and choose option 2.')
 s['mode']=choice('How should people reach the website?',[('https','Automatic HTTPS for a fresh server (ports 80 and 443)'),('proxy','I already have an HTTPS website, reverse proxy or Tunnel'),('tunnel','Use my existing Cloudflare account with a new connector')],old.get('mode','https'))
 if s['mode']=='tunnel':
  print('Create the connector in Cloudflare, then paste its token here. This does not register a domain or change existing routes.')
  s['tunnelToken']=ask('Connector token',old.get('tunnelToken',''),lambda v:secret_value(v,r'[A-Za-z0-9+/=_-]{20,4096}'),secret=True)
 s['appPort']=ask('Local website port (keep the default unless it is busy)',old.get('appPort',8080),localport)
 print('\n3 OF 4 · RELIABLE CALLS')
 print('TURN is a relay that helps phones on different networks connect. It cannot be replaced by an ordinary website Tunnel.')
 s['relay']=choice('Where should the call relay run?',[('self','On this Linux server (public IPv4 or router forwarding required)'),('existing','Use a TURN REST relay I already have'),('none','Set up the website first; configure the relay later')],old.get('relay','self'))
 if s['relay']=='self':
  print('At home: forward TCP/UDP 3478 and UDP 49160–49260 to this server. Compare your router WAN address with the suggested public IP. If they differ or the WAN address is private/100.64–100.127, you may have CGNAT; use a public relay instead. Do not use a Cloudflare proxy IP.')
  s['publicIP']=ask('Public IPv4 of the relay/router',old.get('publicIP') or public_ip(),public4)
  print('On a public VPS leave the next answer empty. Behind a home router enter this server’s fixed LAN address.')
  s['lanIP']=ask('Fixed LAN IPv4 (optional)',old.get('lanIP',''),lambda v:str(ipaddress.IPv4Address(v)) if v else '')
 elif s['relay']=='existing':
  print('Use the relay’s TURN URLs and REST shared secret. A normal username/password account is not the same thing.')
  s['turnURLs']=ask('TURN URLs (comma separated)',old.get('turnURLs',''));s['turnSecret']=ask('REST shared secret',old.get('turnSecret',''),lambda v:secret_value(v,r'[A-Za-z0-9_-]{32,256}'),secret=True)
 print('\n4 OF 4 · OPTIONAL EXTRA RINGING')
 print('Browser alerts are included. ntfy is an optional extra for people able to install its phone app; it is not needed for chat/calls.')
 s['ntfy']=yes('Add a self-hosted ntfy alert server?',old.get('ntfy',False))
 if s['ntfy']:
  s['ntfyHost']=ask('Separate alert hostname (for example notify.example.com)',old.get('ntfyHost',''),hostname)
  s['ntfyPort']=ask('Local alert port',old.get('ntfyPort',8094),localport)
  print('Stock iPhone ntfy needs a wake-up metadata relay through ntfy.sh and Apple. Message/call contents and keys are not sent there.')
  s['ios']=yes('Enable that optional iPhone ntfy wake-up?',old.get('ios',False))
 s=validate(s)
 print('\nREADY TO SAVE\n  Website: https://'+s['host']+s['appPath']+'/\n  Access: '+s['mode']+'\n  Call relay: '+s['relay']+'\n  Extra ringing: '+('enabled' if s['ntfy'] else 'off'))
 if not yes('Save these settings?',True):raise KeyboardInterrupt()
 return s
def qr(bundle):
 import qrcode
 values=dict(line.split('=',1) for line in (bundle/'config/app.env').read_text().splitlines() if '=' in line)
 link=values['PUBLIC_URL'].rstrip('/')+'/#'+urllib.parse.urlencode({'setup':values['BOOTSTRAP_TOKEN'],'name':'My phone'})
 print('PRIVATE FIRST-PHONE SETUP. Scan with your Camera; keep this QR private. Other phones use invitations.')
 code=qrcode.QRCode(border=4);code.add_data(link);code.make(fit=True);code.print_ascii(invert=True)

def prepare_update(bundle,version):
 if not re.fullmatch(r'v[0-9]+\.[0-9]+\.[0-9]+',version):raise ValueError('Use an explicit release such as v0.17.1.')
 current=(bundle/'VERSION').read_text().strip()
 if tuple(map(int,current.split('.')))<(0,18,0):raise ValueError('Olm installations require the explicit migration guide, not an automatic libsignal update.')
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
 if images.get('BUNDLE_FORMAT')!='2':raise ValueError('This release needs a different installer; follow its migration guide.')
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
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('action',choices=['init','configure','plan-configure','qr','prepare-update','apply-update','snapshot','backup-info','restore','restore-seed']);p.add_argument('version',nargs='?');p.add_argument('--bundle',type=pathlib.Path,default=pathlib.Path('/bundle'));p.add_argument('--settings',type=pathlib.Path);p.add_argument('--archive',type=pathlib.Path);p.add_argument('--volumes',default='{}')
 a=p.parse_args();os.umask(0o077)
 if a.action=='plan-configure':
  settings=wizard(current(a.bundle));write(a.bundle/'.planned-settings.json',json.dumps(settings)+'\n');print('Choices prepared. The current services have not been stopped yet.')
 elif a.action in ['init','configure']:
  s=json.loads(a.settings.read_text()) if a.settings else wizard(current(a.bundle) if a.action=='configure' else None)
  result=install(s,a.bundle,replace=a.action=='configure');print('Settings saved. Phone address: '+result['url']+'/')
 elif a.action=='qr':qr(a.bundle)
 elif a.action=='prepare-update':prepare_update(a.bundle,a.version or '')
 elif a.action=='apply-update':apply_update(a.bundle,a.version or '')
 else:
  import docker_backup
  volumes=json.loads(a.volumes);owner=(int(os.environ.get('WEBCALLER_OWNER_UID','1000')),int(os.environ.get('WEBCALLER_OWNER_GID','1000')))
  if a.action=='snapshot':m=docker_backup.create(a.bundle,a.archive,volumes,owner);print('Consistent private backup saved.')
  elif a.action=='backup-info':m=docker_backup.verify(a.archive);print(json.dumps({k:m[k] for k in ['version','project','created','volumes']}))
  elif a.action=='restore-seed':docker_backup.seed(a.bundle,a.archive,owner);print('Matching installation settings recovered; data restore follows.')
  else:docker_backup.restore(a.bundle,a.archive,volumes,owner);print('Matching bundle, configuration and data restored.')
if __name__=='__main__':
 try:main()
 except (EOFError,KeyboardInterrupt):print('\nCancelled. Existing phone keys were not regenerated.',file=sys.stderr);sys.exit(1)
 except (ValueError,KeyError,OSError,subprocess.SubprocessError) as e:
  print(str(e) if isinstance(e,ValueError) else 'Setup/update failed. Check the private configuration and network. Credentials were not printed.',file=sys.stderr);sys.exit(1)
