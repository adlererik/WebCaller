#!/usr/bin/env python3
"""Show the existing owner setup secret as a private, temporary, loopback-only QR card.

Install qrcode==8.2 into .runtime/qr-python. No setup secret is printed or written to disk.
"""
import argparse, json, pathlib, shlex, subprocess, sys, threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlencode, urlsplit

sys.path.insert(0,str(pathlib.Path(__file__).resolve().parent.parent/'.runtime/qr-python'))
import qrcode
from qrcode.image.svg import SvgPathFillImage

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--ssh',help='Your SSH login, such as admin@server.example.com')
parser.add_argument('--env',help='Read an installed .env locally instead of SSH')
parser.add_argument('--key',help='Optional SSH identity file')
parser.add_argument('--project',default='/opt/webcaller')
parser.add_argument('--name',default='My phone')
parser.add_argument('--port',type=int,default=8093)
parser.add_argument('--terminal',action='store_true',help='Display the private QR in this terminal, then exit')
parser.add_argument('--preview',action='store_true',help='Use a non-secret demonstration QR instead of reading the server')
args=parser.parse_args()
if args.preview:
    owner={'publicURL':'https://example.com/calls','setupCode':'demonstration-setup-code','registered':0}
elif args.env:
    values=dict(line.split('=',1) for line in pathlib.Path(args.env).read_text().splitlines() if '=' in line and not line.startswith('#'))
    owner={'publicURL':values.get('PUBLIC_URL'),'setupCode':values.get('BOOTSTRAP_TOKEN'),'registered':0}
else:
    if not args.ssh: sys.exit('Supply --ssh YOUR_LOGIN or --env PATH. No server address is assumed.')
    code='import json,pathlib,urllib.request;v=dict(line.split("=",1) for line in pathlib.Path(".env").read_text().splitlines() if "=" in line and not line.startswith("#"));u=v["PUBLIC_URL"];p=v.get("APP_PORT",v.get("PORT","8080"));c=json.load(urllib.request.urlopen("http://127.0.0.1:"+p+"/calls/api/config",timeout=5));print(json.dumps({"publicURL":u,"setupCode":v.get("BOOTSTRAP_TOKEN"),"registered":0 if c["bootstrap"] else 1}))'
    command='cd '+shlex.quote(args.project)+' && python3 -c '+shlex.quote(code)
    result=subprocess.run(['ssh',*(['-i',args.key] if args.key else []),'-o','BatchMode=yes',args.ssh,command],capture_output=True,text=True,timeout=20)
    if result.returncode:
        sys.exit('Could not read owner setup securely over SSH. No secret was printed.')
    owner=json.loads(result.stdout)
if owner['registered']:
    sys.exit('The first phone is already registered. Use Invite someone from that phone instead.')
public=urlsplit(owner['publicURL'])
if public.scheme!='https' or not public.hostname or public.username or public.password or not owner['setupCode']:
    sys.exit('The server has no valid HTTPS setup configuration.')
link=owner['publicURL'].rstrip('/')+'/#'+urlencode({'setup':owner['setupCode'],'name':args.name[:48]})
qr=qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M,border=4,box_size=10)
qr.add_data(link);qr.make(fit=True)
if args.terminal:
    print('PRIVATE FIRST-PHONE SETUP: scan with your Camera, then tap Set up this phone.')
    qr.print_ascii(invert=True)
    sys.exit(0)
svg=qr.make_image(image_factory=SvgPathFillImage).to_string()
page=b'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Set up your phone</title><link rel="stylesheet" href="/style.css"><main><p class="eyebrow">WEBCALLER</p><h1>Scan with your phone.</h1><p>Open your phone's Camera, point it at this QR code, and tap the website link.</p><img src="/qr.svg" alt="Private phone setup QR code"><p>Your name and setup code are filled in.<br>Tap <strong>Set up this phone</strong>.</p><button id="copy">Copy setup link</button><p class="small">Or copy the link and send it to yourself.<br>Keep this QR and link private. They set up the first phone.</p><p id="status" role="status"></p><textarea id="fallback" readonly hidden aria-label="Private setup link"></textarea></main><script src="/card.js"></script></html>'''
style=b'''*{box-sizing:border-box}body{margin:0;background:#f4f7fc;font:16px/1.6 system-ui,sans-serif;color:#23364e}main{max-width:560px;padding:30px;margin:24px auto;text-align:center;background:white;border-radius:24px}.eyebrow{color:#3478f6;font-size:12px;letter-spacing:3px;font-weight:700}h1{font-size:30px;line-height:1.2}img{display:block;width:min(340px,100%);height:auto;margin:20px auto}button{border:0;border-radius:14px;padding:14px 24px;background:#3478f6;color:white;font:inherit;font-weight:600;cursor:pointer}.small{color:#708096;font-size:13px}textarea{width:100%;min-height:100px;overflow-wrap:anywhere}#status{font-size:14px;color:#3478f6}@media(max-width:580px){main{margin:0;border-radius:0}}'''
script=b'''document.querySelector('#copy').onclick=async()=>{try{const r=await fetch('/link',{cache:'no-store'});if(!r.ok)throw new Error();const link=await r.text();try{await navigator.clipboard.writeText(link);document.querySelector('#status').textContent='Copied. Send it to yourself, then open it on your phone.';}catch{const field=document.querySelector('#fallback');field.hidden=false;field.value=link;field.select();document.querySelector('#status').textContent='Select and copy this private link.';}}catch{document.querySelector('#status').textContent='This temporary setup card has closed.';}};'''
class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def do_GET(self):
        expected={'localhost:'+str(args.port),'127.0.0.1:'+str(args.port)}
        if self.headers.get('Host') not in expected:
            self.send_error(403);return
        origin=self.headers.get('Origin')
        if origin and origin not in {'http://'+host for host in expected}:
            self.send_error(403);return
        resources={'/':('text/html',page),'/qr.svg':('image/svg+xml',svg),'/style.css':('text/css',style),'/card.js':('text/javascript',script),'/link':('text/plain',link.encode())}
        if self.path not in resources:
            self.send_error(404);return
        mime,body=resources[self.path]
        self.send_response(200)
        self.send_header('Content-Type',mime+'; charset=utf-8')
        self.send_header('Content-Length',str(len(body)))
        self.send_header('Cache-Control','no-store')
        self.send_header('Referrer-Policy','no-referrer')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Content-Security-Policy',"default-src 'none'; img-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'")
        self.send_header('X-Frame-Options','DENY')
        self.end_headers();self.wfile.write(body)
server=HTTPServer(('127.0.0.1',args.port),Handler)
timer=threading.Timer(1800,server.shutdown);timer.daemon=True;timer.start()
print('Private QR card ready on http://localhost:'+str(args.port)+'/ (closes after 30 minutes).',flush=True)
try: server.serve_forever()
finally: timer.cancel();server.server_close()
