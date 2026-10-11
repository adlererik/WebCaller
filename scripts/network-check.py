#!/usr/bin/env python3
"""Read-only network evidence. Does not create router mappings or change firewall rules."""
import socket,struct,secrets,urllib.request,urllib.parse,xml.etree.ElementTree as ET,ipaddress,json,time
report={'timestamp_utc':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'stun':[]}
try: report['server_egress_ip']=urllib.request.urlopen('https://api.ipify.org',timeout=10).read().decode()
except Exception as e:report['egress_error']=str(e)
s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM);s.settimeout(5)
for host,port in [('stun.cloudflare.com',3478),('stun.l.google.com',19302)]:
 try:
  tx=secrets.token_bytes(12);start=time.monotonic();s.sendto(struct.pack('!HHI',1,0,0x2112a442)+tx,(host,port));data,_=s.recvfrom(4096)
  if data[8:20]!=tx:raise RuntimeError('STUN transaction mismatch')
  pos=20
  while pos+4<=len(data):
   kind,n=struct.unpack('!HH',data[pos:pos+4]);value=data[pos+4:pos+4+n];pos+=4+(n+3)//4*4
   if kind==0x20 and len(value)>=8 and value[1]==1:
    mapped=socket.inet_ntoa(bytes(x^y for x,y in zip(value[4:8],bytes.fromhex('2112a442'))))
    report['stun'].append({'server':host,'mapped_ip':mapped,'mapped_port':struct.unpack('!H',value[2:4])[0]^0x2112,'rtt_ms':round((time.monotonic()-start)*1000,1)})
 except Exception as e:report['stun'].append({'server':host,'error':str(e)})
s.close()
s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM);s.settimeout(2)
s.sendto(b'M-SEARCH * HTTP/1.1\r\nHOST:239.255.255.250:1900\r\nMAN:"ssdp:discover"\r\nMX:1\r\nST:urn:schemas-upnp-org:device:InternetGatewayDevice:1\r\n\r\n',('239.255.255.250',1900))
locations=[]
try:
 while True:
  data,_=s.recvfrom(4096)
  for line in data.decode(errors='replace').splitlines():
   if line.lower().startswith('location:'):
    url=line.split(':',1)[1].strip()
    if url not in locations:locations.append(url)
except socket.timeout:pass
for url in locations:
 try:
  root=ET.fromstring(urllib.request.urlopen(url,timeout=5).read())
  for svc in root.iter():
   if not svc.tag.endswith('service'):continue
   fields={c.tag.split('}')[-1]:c.text for c in svc};kind=fields.get('serviceType','')
   if 'WANIPConnection' not in kind and 'WANPPPConnection' not in kind:continue
   action='GetExternalIPAddress';body=f'<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><u:{action} xmlns:u="{kind}"/></s:Body></s:Envelope>'
   req=urllib.request.Request(urllib.parse.urljoin(url,fields['controlURL']),data=body.encode(),headers={'Content-Type':'text/xml','SOAPAction':f'"{kind}#{action}"'})
   doc=ET.fromstring(urllib.request.urlopen(req,timeout=5).read())
   for el in doc.iter():
    if el.tag.endswith('NewExternalIPAddress'):report['router_wan_ip']=el.text
 except Exception as e:report['router_error']=str(e)
if 'router_wan_ip' in report:
 report['router_wan_is_public']=ipaddress.ip_address(report['router_wan_ip']).is_global
 report['wan_matches_server_egress']=report['router_wan_ip']==report.get('server_egress_ip')
 report['cgnat_evidence']='No CGNAT indicated: router WAN is public and matches server egress.' if report['router_wan_is_public'] and report['wan_matches_server_egress'] else 'Upstream NAT indicated; confirm the ISP/router topology.'
else:report['cgnat_evidence']='Unknown: router WAN address unavailable.'
report['turn_note']='A public WAN does not remove the need for TURN between restrictive client networks. STUN is not an external inbound port test.'
print(json.dumps(report,indent=2))
