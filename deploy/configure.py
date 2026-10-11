"""First-run questions. Creates .env once, without printing secrets."""
import getpass,ipaddress,os,pathlib,re,urllib.parse,urllib.request
os.umask(0o077)
path=pathlib.Path('.env');profiles=pathlib.Path('.runtime/compose-profiles');profiles.parent.mkdir(exist_ok=True)
if path.exists():
 print('Existing .env preserved. Edit it manually to change the address or relay.')
 if not profiles.exists(): profiles.write_text('')
 raise SystemExit(0)
def ask(prompt,default=''):
 value=input(prompt+(' ['+default+']' if default else '')+': ').strip()
 return value or default
raw=ask('Website address, for example calls.yourdomain.com')
url=urllib.parse.urlsplit(raw if '://' in raw else 'https://'+raw)
if url.scheme!='https' or not url.hostname or url.username or url.password or url.query or url.fragment or url.path not in ('','/','/calls','/calls/') or url.port not in (None,443):raise SystemExit('Use an HTTPS domain with /calls, no password, query, or custom port.')
if url.hostname=='example.com' or url.hostname.endswith('.example.com') or any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-' for c in url.hostname):raise SystemExit('Enter your real domain name, not an example or IP.')
try: ipaddress.ip_address(url.hostname)
except ValueError: pass
else:raise SystemExit('Use a domain name for the beginner HTTPS install.')
public='https://'+url.hostname+'/calls'
mode=ask('HTTPS: 1 = automatic Caddy (ports 80/443 free), 2 = existing proxy or Cloudflare Tunnel','1')
if mode not in ('1','2'):raise SystemExit('Choose 1 or 2.')
selected=['https'] if mode=='1' else []
relay=ask('TURN relay: 1 = free self-hosted coturn, 2 = existing relay, 3 = configure later','1')
if relay not in ('1','2','3'):raise SystemExit('Choose 1, 2 or 3.')
values={'PUBLIC_URL':public,'WEB_HOST':url.hostname,'VAPID_SUBJECT':'https://'+url.hostname,'APP_PORT':'8080'}
if relay=='1':
 print('The relay must have a public IPv4. Home servers also need router forwarding; see docs/NETWORKING.md.')
 public_ip=ask('Public IPv4 of this server or its router')
 try:
  addr=ipaddress.ip_address(public_ip)
  if addr.version!=4 or not addr.is_global:raise ValueError()
 except ValueError:raise SystemExit('TURN requires a globally routable IPv4, not a LAN address.')
 lan=ask('Server LAN IPv4 when behind a home router; leave empty on a directly public server')
 if lan:
  try:
   if ipaddress.ip_address(lan).version!=4:raise ValueError()
  except ValueError:raise SystemExit('Invalid LAN IPv4.')
 values.update(TURN_PUBLIC_IP=public_ip,TURN_LAN_IP=lan,TURN_URLS=f'turn:{public_ip}:3478?transport=udp,turn:{public_ip}:3478?transport=tcp')
 selected.append('turn')
elif relay=='2':
 values['TURN_URLS']=ask('Comma-separated TURN URLs supplied by your relay')
 values['TURN_SECRET']=getpass.getpass('REST shared secret (hidden while typing): ')
 if not values['TURN_URLS'] or not re.fullmatch(r'[A-Za-z0-9_-]{32,}',values['TURN_SECRET']):raise SystemExit('Use valid URLs and a long REST shared secret. Cloudflare API keys are configured separately in .env.')
else: print('Configure TURN before relying on calls across different networks.')
text=pathlib.Path('.env.example').read_text()
for key,value in values.items():text=re.sub('^'+key+'=.*$',lambda _:key+'='+value,text,flags=re.M)
path.write_text(text);path.chmod(0o600);profiles.write_text(' '.join(selected));profiles.chmod(0o600)
print('Configuration saved privately. Address: '+public)
