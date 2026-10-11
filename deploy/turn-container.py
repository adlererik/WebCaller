"""Generate private coturn config from environment; never print secrets."""
import ipaddress,os,pathlib
os.umask(0o077)
public=os.environ.get('TURN_PUBLIC_IP','')
lan=os.environ.get('TURN_LAN_IP','')
secret=os.environ.get('TURN_SECRET','')
if not public or not ipaddress.ip_address(public).is_global: raise SystemExit('Set TURN_PUBLIC_IP to a globally routable IPv4.')
if ipaddress.ip_address(public).version!=4: raise SystemExit('This coturn recipe currently requires IPv4.')
if lan and ipaddress.ip_address(lan).version!=4: raise SystemExit('TURN_LAN_IP must be IPv4.')
if len(secret)<32 or any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-' for c in secret):raise SystemExit('Generate TURN_SECRET with npm run setup.')
realm=os.environ.get('TURN_REALM','webcaller')
if not realm or any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-' for c in realm):raise SystemExit('Invalid TURN_REALM.')
text=pathlib.Path('/etc/webcaller-turn.template').read_text()
text=text.replace('RELAY_LAN_OR_PUBLIC_IP',lan or '0.0.0.0').replace('external-ip=PUBLIC_IP','external-ip='+public+('/'+lan if lan else ''))
text=text.replace('static-auth-secret=GENERATE_A_LONG_RANDOM_SECRET','static-auth-secret='+secret).replace('turn.example.com',realm)
cert=pathlib.Path('/certs/fullchain.pem');key=pathlib.Path('/certs/privkey.pem')
text='\n'.join(line for line in text.splitlines() if not line.startswith(('cert=','pkey=','log-file=')))
text+='\nno-dtls\nno-stdout-log\nlog-file=/dev/null\npidfile=/tmp/webcaller-turn.pid\n'
text+=('cert='+str(cert)+'\npkey='+str(key)+'\n') if cert.is_file() and key.is_file() else 'no-tls\n'
conf=pathlib.Path('/tmp/webcaller-turn.conf');conf.write_text(text);conf.chmod(0o600)
os.execv('/usr/bin/turnserver',['turnserver','-c',str(conf)])
