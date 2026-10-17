#!/usr/bin/env python3
"""Install a dedicated, restricted ntfy service. No application database access.
Run --check without sudo to validate inputs without modifying the host.
"""
import argparse,hashlib,json,os,pathlib,platform,re,secrets,shutil,subprocess,tarfile,tempfile,time,urllib.request
VERSION='2.31.1'
CHECKSUMS={'x86_64':'2eda91800b93c882b489679d82b72e8cf3e003f008a88035054bf5bd560bd183','aarch64':'6ff52455d7bc48e250bccec5f9f2a6c5375899f66c484fac85db9fde961e3b43'}
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--host',required=True,help='Separate public hostname, e.g. ntfy.example.com')
p.add_argument('--app-env',required=True,type=pathlib.Path,help='Existing private WebCaller .env file')
p.add_argument('--app-service',default='webcaller.service')
p.add_argument('--ios',action='store_true',help='Enable ntfy.sh wake-up metadata relay for the stock iPhone client')
p.add_argument('--check',action='store_true')
a=p.parse_args()
if not re.fullmatch(r'(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?',a.host) or '.' not in a.host or '..' in a.host:p.error('Use a DNS hostname without a scheme, port or path')
if not re.fullmatch(r'[a-zA-Z0-9_@.-]+\.service',a.app_service):p.error('Invalid service name')
a.app_env=a.app_env.resolve(strict=True)
original=a.app_env.read_text();env=dict(line.split('=',1) for line in original.splitlines() if '=' in line and not line.startswith('#'))
from urllib.parse import urlsplit
if urlsplit(env.get('PUBLIC_URL','')).hostname==a.host:p.error('Use a separate hostname from the phone')
if any(env.get(k) for k in ['NTFY_PUBLIC_URL','NTFY_PUBLISH_URL','NTFY_PUBLISH_TOKEN']):p.error('ntfy is already configured. Review the existing installation before replacing it.')
if platform.machine() not in CHECKSUMS:p.error('This installer supports Debian amd64 and arm64')
if a.check:print('Inputs verified. Would install ntfy '+VERSION+' on loopback 8094 with a separate systemd DynamicUser. No changes made.');raise SystemExit
if os.geteuid()!=0:p.error('Run with sudo so ntfy can run under its own restricted identity')
subprocess.run(['systemctl','is-active','--quiet',a.app_service],check=True)
try:
 urllib.request.urlopen('http://127.0.0.1:8094/v1/health',timeout=1)
except OSError:pass
else:raise SystemExit('Port 8094 is already in use; review it before installing.')
binary=pathlib.Path('/usr/local/lib/webcaller-ntfy/ntfy');config=pathlib.Path('/etc/webcaller-ntfy/server.yml');state=pathlib.Path('/var/lib/webcaller-ntfy');unit=pathlib.Path('/etc/systemd/system/webcaller-ntfy.service')
if unit.exists() or config.exists():raise SystemExit('Existing ntfy service/configuration found. No changes made.')
arch={'x86_64':'amd64','aarch64':'arm64'}[platform.machine()]
with tempfile.TemporaryDirectory(prefix='webcaller-ntfy-') as temp:
 archive=pathlib.Path(temp)/'ntfy.tar.gz'
 urllib.request.urlretrieve(f'https://github.com/binwiederhier/ntfy/releases/download/v{VERSION}/ntfy_{VERSION}_linux_{arch}.tar.gz',archive)
 if hashlib.sha256(archive.read_bytes()).hexdigest()!=CHECKSUMS[platform.machine()]:raise SystemExit('ntfy checksum mismatch')
 with tarfile.open(archive) as tar:
  member=next(m for m in tar.getmembers() if m.name.endswith('/ntfy') and m.isfile())
  binary.parent.mkdir(parents=True,exist_ok=True);binary.write_bytes(tar.extractfile(member).read());binary.chmod(0o755)
config.parent.mkdir(mode=0o755,parents=True,exist_ok=True);state.mkdir(mode=0o700,exist_ok=True)
# Two-minute in-memory notification retention supports the iOS wake-up fetch.
# There is no attachment cache, public publishing, signup or web UI.
values={'base-url':'https://'+a.host,'listen-http':'127.0.0.1:8094','auth-file':str(state/'auth.db'),'auth-default-access':'deny-all','cache-duration':'2m','manager-interval':'10s','web-root':'disable','log-level':'warn','upstream-base-url':'https://ntfy.sh' if a.ios else ''}
config.write_text('\n'.join(k+': '+json.dumps(v) for k,v in values.items())+'\n');config.chmod(0o644)
(state/'auth.db').touch(mode=0o600,exist_ok=False)
cmd=[str(binary)]
def ntfy(*args,extra=None):
 result=subprocess.run(cmd+[args[0],'--config',str(config)]+list(args[1:]),env={**os.environ,**(extra or {})},stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 if result.returncode:raise RuntimeError('ntfy administration failed; credentials have not been displayed. Inspect the local configuration.')
 return result.stdout+result.stderr
ntfy('user','add','webcaller',extra={'NTFY_PASSWORD':secrets.token_urlsafe(48)})
ntfy('access','webcaller','wc_*','write-only')
ntfy('access','everyone','wc_*','read-only')
token=re.search(r'\btk_[a-z0-9]+\b',ntfy('token','add','--label','WebCaller alerts','webcaller'))
if not token:raise RuntimeError('No publishing token returned')
unit.write_text('''[Unit]
Description=WebCaller optional ntfy call alerts
After=network-online.target
Wants=network-online.target
[Service]
Type=simple
DynamicUser=yes
User=webcaller-ntfy
StateDirectory=webcaller-ntfy
StateDirectoryMode=0700
ExecStart=/usr/local/lib/webcaller-ntfy/ntfy serve --config /etc/webcaller-ntfy/server.yml
Restart=on-failure
RestartSec=3
UMask=0077
NoNewPrivileges=yes
PrivateTmp=yes
PrivateDevices=yes
ProtectSystem=strict
ProtectHome=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
RestrictSUIDSGID=yes
LockPersonality=yes
CapabilityBoundingSet=
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
StandardOutput=null
StandardError=journal
[Install]
WantedBy=multi-user.target
''');unit.chmod(0o644)
subprocess.run(['systemctl','daemon-reload'],check=True);subprocess.run(['systemctl','enable','--now','webcaller-ntfy.service'],check=True)
for attempt in range(30):
 try:
  with urllib.request.urlopen('http://127.0.0.1:8094/v1/health',timeout=1) as r:
   if json.load(r).get('healthy'):break
 except OSError:pass
 time.sleep(.5)
else:raise RuntimeError('ntfy did not become healthy; application configuration was not changed')
# Check actual ACL enforcement before enabling the feature in the app.
probe='wc_'+secrets.token_urlsafe(32)
try:
 urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:8094/'+probe,data=b'Unauthorized probe'),timeout=2)
except urllib.error.HTTPError as e:
 if e.code not in [401,403]:raise
else:raise RuntimeError('Anonymous publishing was allowed; application configuration was not changed')
with urllib.request.urlopen('http://127.0.0.1:8094/'+probe+'/json?poll=1',timeout=2) as r:
 if r.status!=200:raise RuntimeError('Read-capability subscription failed')
backup=a.app_env.parent/'.runtime'/('env-before-ntfy-'+str(int(time.time())))
backup.parent.mkdir(mode=0o700,exist_ok=True)
shutil.copy2(a.app_env,backup);backup.chmod(0o600)
addition={'NTFY_PUBLIC_URL':'https://'+a.host,'NTFY_PUBLISH_URL':'http://127.0.0.1:8094','NTFY_PUBLISH_TOKEN':token.group(),'NTFY_IOS_UPSTREAM':str(a.ios).lower()}
lines=[line for line in original.splitlines() if not any(line.startswith(k+'=') for k in addition)]
# Preserve the existing inode/owner because the app's restricted user reads it.
a.app_env.write_text('\n'.join(lines)+ '\n\n# Optional isolated ntfy call alerts\n'+'\n'.join(k+'='+v for k,v in addition.items())+'\n');a.app_env.chmod(0o600)
try:
 subprocess.run(['systemctl','restart',a.app_service],check=True)
 app_port=int(env.get('PORT','8080'));app_path=urlsplit(env.get('PUBLIC_URL','')).path.rstrip('/')+'/health'
 for attempt in range(30):
  try:
   with urllib.request.urlopen(f'http://127.0.0.1:{app_port}'+app_path,timeout=1) as r:
    if json.load(r).get('ok'):break
  except OSError:pass
  time.sleep(.5)
 else:raise RuntimeError('WebCaller health check failed')
except BaseException:
 a.app_env.write_text(original);a.app_env.chmod(0o600)
 subprocess.run(['systemctl','restart',a.app_service],check=False)
 raise
print('Installed isolated ntfy '+VERSION+'. Anonymous publishing is denied; native clients have read-only capability URLs. No chat/call encryption keys were changed.')
print('Add the Cloudflare Tunnel route '+a.host+' → HTTP 127.0.0.1:8094, then test Settings → Extra ringing on a phone.')
