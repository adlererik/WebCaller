#!/usr/bin/env python3
"""Manage only WebCaller TURN's UPnP mappings. Default is read-only; --apply changes them."""
import argparse, ipaddress, json, socket, sys, urllib.error, urllib.parse, urllib.request
import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--apply', action='store_true')
parser.add_argument('--remove', action='store_true')
parser.add_argument('--tls-port', type=int, choices=[5349, 8443], help='Also map this unprivileged TURN-TLS port to server port 5349')
parser.add_argument('--server', required=True, help='Your server LAN IPv4; never inferred or guessed')
args = parser.parse_args()
if args.apply and args.remove:
    parser.error('Choose --apply or --remove')
if not ipaddress.ip_address(args.server).is_private:
    parser.error('--server must be a LAN address')
description = 'WebCaller TURN'
desired = [(3478, 3478, 'UDP'), (3478, 3478, 'TCP')]
desired += [(port, port, 'UDP') for port in range(49160, 49261)]
if args.tls_port:
    desired += [(args.tls_port, 5349, 'TCP')]

def local_url(url):
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != 'http' or not parsed.hostname or not ipaddress.ip_address(parsed.hostname).is_private:
        raise RuntimeError('Router supplied a non-local control URL')
    return url

sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock.settimeout(2)
sock.sendto(b'M-SEARCH * HTTP/1.1\r\nHOST:239.255.255.250:1900\r\nMAN:"ssdp:discover"\r\nMX:1\r\nST:urn:schemas-upnp-org:device:InternetGatewayDevice:1\r\n\r\n', ('239.255.255.250', 1900))
locations = []
try:
    while True:
        data, _ = sock.recvfrom(4096)
        for line in data.decode(errors='replace').splitlines():
            if line.lower().startswith('location:'):
                url = local_url(line.split(':', 1)[1].strip())
                if url not in locations:
                    locations.append(url)
except socket.timeout:
    pass
finally:
    sock.close()
endpoint = kind = None
for url in locations:
    doc = ET.fromstring(urllib.request.urlopen(url, timeout=5).read())
    for svc in doc.iter():
        if not svc.tag.endswith('service'):
            continue
        fields = {c.tag.split('}')[-1]: c.text for c in svc}
        if 'WANIPConnection' in fields.get('serviceType', '') or 'WANPPPConnection' in fields.get('serviceType', ''):
            endpoint = local_url(urllib.parse.urljoin(url, fields['controlURL']))
            kind = fields['serviceType']
            break
    if endpoint:
        break
if not endpoint:
    sys.exit('No UPnP router discovered. Configure the documented ports manually.')

class SoapError(Exception):
    def __init__(self, code, message):
        self.code = code
        super().__init__(f'Router {code}: {message}')

def soap(action, fields=None):
    content = ''.join(f'<{key}>{escape(str(value))}</{key}>' for key, value in (fields or {}).items())
    body = f'<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><u:{action} xmlns:u="{kind}">{content}</u:{action}></s:Body></s:Envelope>'
    req = urllib.request.Request(endpoint, data=body.encode(), headers={'Content-Type': 'text/xml', 'SOAPAction': f'"{kind}#{action}"'})
    try:
        result = ET.fromstring(urllib.request.urlopen(req, timeout=5).read())
    except urllib.error.HTTPError as error:
        fields = {e.tag.split('}')[-1]: e.text for e in ET.fromstring(error.read()).iter()}
        raise SoapError(fields.get('errorCode'), fields.get('errorDescription')) from error
    return {e.tag.split('}')[-1]: e.text or '' for e in result.iter() if e.tag.split('}')[-1].startswith('New')}

wan = soap('GetExternalIPAddress')['NewExternalIPAddress']
if not ipaddress.ip_address(wan).is_global:
    sys.exit('Router WAN is not globally routable; self-hosted public TURN needs an upstream public route.')
existing = {}
for index in range(4096):
    try:
        entry = soap('GetGenericPortMappingEntry', {'NewPortMappingIndex': index})
    except SoapError as error:
        if error.code in ('713', '714'):
            break
        raise
    existing[(int(entry['NewExternalPort']), entry['NewProtocol'])] = entry
else:
    sys.exit('Router mapping inventory exceeded safety limit')

conflicts = []
for external, internal, protocol in desired:
    current = existing.get((external, protocol))
    if current and (current['NewInternalClient'] != args.server or int(current['NewInternalPort']) != internal
                    or current['NewPortMappingDescription'] != description or current['NewRemoteHost']):
        conflicts.append(f'{protocol} {external} already belongs to {current["NewInternalClient"]}:{current["NewInternalPort"]}')
if conflicts and not args.remove:
    sys.exit('No mappings changed: ' + '; '.join(conflicts))

changed = []
try:
    for external, internal, protocol in desired:
        current = existing.get((external, protocol))
        fields = {'NewRemoteHost': '', 'NewExternalPort': external, 'NewProtocol': protocol}
        if args.remove:
            if current and current['NewInternalClient'] == args.server and current['NewPortMappingDescription'] == description:
                soap('DeletePortMapping', fields)
                changed.append((external, protocol))
        elif args.apply:
            if not current or current['NewEnabled'] != '1' or current['NewLeaseDuration'] != '0':
                soap('AddPortMapping', {**fields, 'NewInternalPort': internal, 'NewInternalClient': args.server,
                     'NewEnabled': 1, 'NewPortMappingDescription': description, 'NewLeaseDuration': 0})
                if not current:
                    changed.append((external, protocol))
                verified = soap('GetSpecificPortMappingEntry', fields)
                if verified['NewInternalClient'] != args.server or int(verified['NewInternalPort']) != internal or verified['NewEnabled'] != '1':
                    raise RuntimeError('Router did not retain the requested mapping')
except Exception:
    if args.apply:
        for external, protocol in changed:
            try:
                soap('DeletePortMapping', {'NewRemoteHost': '', 'NewExternalPort': external, 'NewProtocol': protocol})
            except Exception:
                pass
    raise
print(json.dumps({'wan_ip': wan, 'mode': 'remove' if args.remove else 'apply' if args.apply else 'status',
                  'desired_count': len(desired), 'changed_count': len(changed),
                  'present_before': sum((port, protocol) in existing for port, _, protocol in desired),
                  'server': args.server, 'tls_port': args.tls_port}))
