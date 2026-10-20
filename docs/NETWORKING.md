# Networking, TURN, HTTPS and CGNAT

This release uses libsignal/PQXDH with Ed25519 application signatures. [Install](INSTALL.md) · [Security](SECURITY.md) · [Olm upgrade planning](APPROVED_CUTOVER.md).

## Two separate paths

HTTPS/WebSocket carries the page, authentication and encrypted signaling. DTLS-SRTP carries media directly between browsers or through TURN. A working page does not prove a working call. Cloudflare Tunnel's HTTP application route does not carry browser TURN/RTP. WebSocket upgrades must reach the app. [Cloudflare WebSockets](https://developers.cloudflare.com/network/websockets/).

## Direct public VPS

The easiest free relay path is coturn on a VPS with a public IPv4. Set `TURN_PUBLIC_IP`, leave `TURN_LAN_IP` empty, use the `turn` Compose profile and allow TCP/UDP 3478 plus UDP 49160–49260 in the VPS firewall/security group. The Compose relay uses Linux host networking. Port 8080 for the web app is published on loopback only. Docker-published ports can bypass ufw rules; manage exposure using Docker/provider rules. See [Docker firewall notes](https://docs.docker.com/engine/install/debian/#firewall-limitations).

## Native coturn on a fresh Debian relay

This is for a fresh relay with no existing coturn configuration/users. Preserve/reuse an existing relay instead of replacing its config. On the WebCaller server, set your real `TURN_PUBLIC_IP`, optional `TURN_LAN_IP` and `TURN_URLS` in private `.env`. For example, URLs may be `turn:turn.example.com:3478?transport=udp,turn:turn.example.com:3478?transport=tcp`; the relay DNS record must resolve directly to its public IP, not through an HTTP proxy. Setup already generated `TURN_SECRET`; keep that same secret at both ends.

```sh
sudo apt update
sudo apt install -y coturn
cd /opt/webcaller
export PATH="$PWD/.runtime/node/bin:$PATH"
node --env-file=.env --input-type=module <<'JS'
import {writeFileSync} from 'node:fs';
import {isIP} from 'node:net';
const {TURN_PUBLIC_IP:pub,TURN_LAN_IP:lan,TURN_SECRET:secret}=process.env;
if(isIP(pub)!==4||(lan&&isIP(lan)!==4)||!secret||!/^[A-Za-z0-9_-]{32,}$/.test(secret))throw Error('Set relay IP and generated REST secret privately in .env first');
const lines=['listening-port=3478','listening-ip=0.0.0.0','external-ip='+pub+(lan?'/'+lan:''),'realm=webcaller','fingerprint','use-auth-secret','static-auth-secret='+secret,'min-port=49160','max-port=49260','no-cli','no-loopback-peers','no-multicast-peers','no-tls','no-dtls'];
writeFileSync('.runtime/coturn.conf',lines.join('\n')+'\n',{mode:0o600});
JS
sudo cp -an /etc/turnserver.conf /etc/turnserver.conf.before-webcaller
sudo install -o root -g turnserver -m 640 .runtime/coturn.conf /etc/turnserver.conf
sudo systemctl enable --now coturn
sudo systemctl restart coturn
sudo systemctl restart webcaller.service
```

Continue only if each command succeeds. The private staged config/backup contains a relay secret: never upload either. Open/forward TCP+UDP3478 and UDP49160–49260 as below, then test externally. Initial config is UDP/TCP TURN; add valid relay certificates and remove `no-tls`/configure 5349 when following the TLS section. The generated Node app credentials are time-limited, so never put a permanent TURN username/password into public JavaScript.

## Home router

Give the server a fixed/reserved LAN IP. Forward TCP 3478, UDP 3478 and UDP 49160–49260 to it. Preserve other services' mappings. For Caddy HTTPS, TCP 80 and 443 must reach Caddy. For TURN-TLS on 5349, add TCP 5349 separately. A single external TCP 443 forward cannot point to two ordinary servers at once.

UPnP helpers are optional advanced tools. `python3 scripts/router-turn.py --server YOUR_LAN_IP` reads status; add `--apply` to create only mappings labeled WebCaller TURN. It refuses collisions and rolls back newly created entries on errors. `--remove` removes only owned mappings. `--tls-port 5349` or 8443 adds that high port; it never changes 80/443 automatically. Routers may clear mappings when settings change, so manual stable mappings are simpler for the beginner Docker recipe.

## Am I behind CGNAT?

Run `python3 scripts/network-check.py` on the server. It reports HTTPS egress, two STUN observations and, if UPnP exposes it, the router WAN address. A globally routable router WAN matching egress suggests no CGNAT. A private/shared WAN, including 100.64.0.0/10, suggests upstream NAT; ask the ISP to confirm. Missing router information means unknown. This is diagnostic evidence, not a guarantee that every inbound port works. The script contacts ipify, Google/Cloudflare STUN and the local router; do not publish its output without redacting addresses.

With CGNAT, ask for a public IPv4, put TURN on a public VPS, or use a managed relay. Cloudflare Tunnel can make the page reachable through CGNAT but does not solve the media relay requirement.

## TURN-TLS without breaking a website

The beginner self-hosted profile initially exposes authenticated UDP/TCP 3478. Media is still end-to-end DTLS-SRTP; TURN-TLS additionally encrypts the client-to-relay transport. UDP is preferable on loss-prone links because TCP can stall queued audio behind loss.

To add TLS, point a **DNS-only** relay hostname such as `turn.example.com` at the relay's public IP. Put its publicly trusted certificate and key in private `certs/fullchain.pem` and `certs/privkey.pem` (never commit these). Add `turns:turn.example.com:5349?transport=tcp` to `TURN_URLS`, permit TCP 5349 and restart app/relay. The relay container detects those files. Arrange renewal and restart coturn after changed certificates; the Docker starter does not issue/renew TURN domain certificates automatically.

If HTTPS already owns 443, keep it there and use TURN-TLS 5349 or 8443. A deliberately configured TLS/SNI TCP proxy or separate public relay is needed to share 443. Networks restricted to 443 may still block 5349.

Advanced native-runtime scripts can obtain Let's Encrypt short-lived **IP** certificates using Certbot 5.4+ and free TCP 80 forwarded to LAN 8085. `deploy/setup-turn-tls.sh PUBLIC_IP LAN_IP [5349]` assumes a prepared `.runtime/certbot`/`.runtime/node`, accepts CA terms in the invoked command, stages first and writes a reload marker. Adapt the optional systemd units to your user/project before enabling maintenance. Do not run these specialized native scripts in place of the beginner Docker steps. [IP certificate support](https://letsencrypt.org/2026/03/11/shorter-certs-certbot).

## Managed Cloudflare TURN

Set `CF_TURN_KEY_ID` and `CF_TURN_API_TOKEN` privately. This backend takes precedence over `TURN_URLS` and returns short-lived credentials; it is separate from Tunnel. Managed TURN can have quotas/charges; check current pricing and billing before enabling. [Official pricing](https://developers.cloudflare.com/realtime/sfu/platform/pricing/), [credentials API](https://developers.cloudflare.com/realtime/turn/generate-credentials/).

## Verify real connectivity

Settings → Check calling connection tests relay allocation. `node --env-file=.env scripts/relay-probe.mjs YOUR_RELAY_HOST` checks authenticated UDP allocation. `node scripts/verify-public.mjs YOUR_HTTPS_URL` checks page headers and the WebSocket path. Tests from inside the router using its public IP may use NAT hairpinning; they do not prove external reachability. Test actual Android↔iPhone calls on different networks, both directions, including a relay-only test and Wi-Fi transitions.
