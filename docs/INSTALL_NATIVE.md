# Native Debian installation

This is an alternative to Docker for a **fresh Debian 12/13 server**. Choose it if you want the supplied optional ntfy server installer. The same WebCaller code runs under systemd, Debian's service manager, so it starts again after reboot. A normal caller never needs to follow this guide.

You need a regular SSH account with `sudo`, a domain you control, HTTPS forwarding, and a reachable TURN relay. Use `/opt/webcaller` below; paths for this helper must not contain spaces. Replace `calls.example.com` and `ntfy.example.com` with subdomains of your own domain. They are examples, not addresses to register or copy literally.

Do not use this as a migration recipe for an existing Docker or native installation. Preserve its identity database, private `.env`, browser data and deployment method; see [Operations](OPERATIONS.md). Do not run both phone services on port 8080.

## 1. Download the release

Connect to the server as your regular user, then follow [Download WebCaller](INSTALL.md#2-download-webcaller-onto-the-debian-server), including the checksum. From inside the extracted `WebCaller-v0.15.1` folder:

```sh
sudo apt update
sudo apt install -y ca-certificates curl xz-utils nano python3 python3-venv
sudo test ! -e /opt/webcaller
sudo install -d -m 755 -o "$(id -un)" -g "$(id -gn)" /opt/webcaller
cp -a . /opt/webcaller/
cd /opt/webcaller
```

Run each command only after the previous one succeeds. If the existence check fails, stop: there is already an installation to review, not a folder to overwrite.

## 2. Install Node.js 24

WebCaller needs **Node.js 24 LTS**, rather than an older Debian default. If `node --version` already shows v24 and `npm --version` works, skip the download below. Otherwise, on a fresh server with no existing Node installation, these commands download the official v24.22.0 Linux binary for amd64 or arm64 and check its checksum. For another architecture or an existing managed Node installation, use the [official Node downloads](https://nodejs.org/en/download) and keep a system-wide Node 24 available to systemd and sudo. Keep this runtime patched; the pinned version here is a reproducible starting point.

```sh
mkdir -p .runtime/node-download
cd .runtime/node-download
case "$(dpkg --print-architecture)" in
  amd64) webcaller_arch=x64 ;;
  arm64) webcaller_arch=arm64 ;;
  *) echo 'Use the official Node guide for this architecture'; exit 1 ;;
esac
webcaller_node=v24.22.0
curl -fLO "https://nodejs.org/dist/$webcaller_node/node-$webcaller_node-linux-$webcaller_arch.tar.xz"
curl -fLO "https://nodejs.org/dist/$webcaller_node/SHASUMS256.txt"
grep " node-$webcaller_node-linux-$webcaller_arch.tar.xz$" SHASUMS256.txt | sha256sum -c -
```

Continue only after `OK`. These checksums are fetched over HTTPS; Node also documents [verification of signed checksums](https://github.com/nodejs/node#verifying-binaries).

```sh
sudo test ! -e /usr/local/lib/webcaller-node
sudo install -d -m 755 /usr/local/lib/webcaller-node
sudo tar -xJf "node-$webcaller_node-linux-$webcaller_arch.tar.xz" -C /usr/local/lib/webcaller-node --strip-components=1 --no-same-owner
sudo ln -s /usr/local/lib/webcaller-node/bin/node /usr/local/bin/node
sudo ln -s /usr/local/lib/webcaller-node/bin/npm /usr/local/bin/npm
cd /opt/webcaller
node --version
npm --version
sudo node --version
```

If any destination already exists, stop and review it rather than replacing it. Both Node commands must report v24. This native runtime is not updated by the Docker image or by downloading a new WebCaller release.

## 3. Create the private configuration

```sh
npm ci --ignore-scripts
npm run setup
nano .env
```

Set `PUBLIC_URL` to your real address, for example `https://calls.example.com/calls`, and `VAPID_SUBJECT` to your own contact URL or `mailto:` email. Leave `HOST=127.0.0.1`, `PORT=8080` and `DATA_DIR=./data` for this guide. Keep the generated secrets; the supplied file's empty secret fields are filled automatically. In nano, save with Ctrl+O, Enter, then exit with Ctrl+X. Do not paste the resulting `.env` into an issue or commit it to Git.

For an existing TURN relay, enter its `TURN_URLS` and the matching REST shared `TURN_SECRET` privately. If using the Cloudflare TURN API instead, fill its two separate credential fields. A Tunnel is not a TURN relay. See [Networking](NETWORKING.md) before relying on calls across different networks. The optional ntfy fields stay empty until step 7.

## 4. Start the phone service

```sh
sudo bash deploy/install-system.sh
sudo systemctl status webcaller.service --no-pager
curl -fsS http://127.0.0.1:8080/calls/health
```

The service should say `active (running)` and health should contain `"ok":true`. The helper uses your current regular user as the service user and the system Node binary; run it with sudo from that account. It restricts writes to the project's data directory. This helper does not install HTTPS or TURN.

If startup fails, use `sudo journalctl -u webcaller.service -n 50 --no-pager` locally. Review and redact output before sharing it. Do not repeatedly regenerate secrets to fix a startup error.

## 5. Give the website HTTPS

Choose **one** route:

- **Existing Cloudflare Tunnel:** the connector must run directly on this Debian host. Add a published application for your `calls` subdomain, Service URL `http://127.0.0.1:8080`, with no path filter. Follow the [dashboard steps](INSTALL.md#1-choose-your-address); keep existing routes. No website router forward is needed.
- **Existing HTTPS proxy:** forward `/calls` and `/calls/*`, including WebSocket upgrades, to loopback port 8080. Use a valid certificate for your own calls hostname.
- **Fresh server using Caddy:** first point your hostname at the public server/router and forward TCP 80/443 as described in the main guide. Only if those ports and `/etc/caddy/Caddyfile` are not serving another website, install Caddy with `sudo apt install -y caddy`, then edit `/etc/caddy/Caddyfile` using `sudo nano`. Use this configuration with your own hostname:

  ```caddyfile
  calls.example.com {
      @phone path /calls /calls/*
      reverse_proxy @phone 127.0.0.1:8080
      respond "Not found" 404
  }
  ```

  Check it with `sudo caddy validate --config /etc/caddy/Caddyfile`, then `sudo systemctl enable --now caddy` and `sudo systemctl reload caddy`. Do not replace an existing site's configuration with this example. [Caddy HTTPS requirements](https://caddyserver.com/docs/automatic-https/).

Open your real `https://calls…/calls` address. It should show WebCaller without certificate errors. Do not expose port 8080 directly to the internet as a substitute for HTTPS.

## 6. Set up the first phone, then invite people

```sh
python3 -m venv .runtime/qr-venv
.runtime/qr-venv/bin/python -m pip install --disable-pip-version-check qrcode==8.2
.runtime/qr-venv/bin/python scripts/phone-setup-qr.py --env .env --terminal
```

Keep this QR private. Follow [First phone by QR](INSTALL.md#4-set-up-your-first-phone-by-qr), including its iPhone note, then [Invite someone and test](INSTALL.md#5-invite-someone-and-test). Invited people only open their link and follow the phone guide. Keep using that browser or, on iPhone, the saved Home Screen icon. Clearing its site data removes the identity.

Test calls in both directions on different networks. A successful page load or TURN allocation alone does not prove a working voice path. Complete the built-in locked-phone alert test on each phone.

## 7. Optional ntfy server

Once the phone service works, follow [Extra ringing → Install on Debian](EXTRA_RINGING.md#install-on-debian). For this guide, the private config is `/opt/webcaller/.env` and the app service is `webcaller.service`. The helper creates a separate restricted ntfy service on loopback 8094; add its own HTTPS hostname/route. Choose `--ios` if supporting the stock iPhone client, and read the wake-up metadata relay limitation first.

No recipient needs your server password or publishing token. The setup screen gives each phone its own read-only subscription address and sound test. Normal browser alerts remain available without ntfy.

## Restarting and updating

After a private config edit, run `sudo systemctl restart webcaller.service` and check health again. Use `sudo systemctl status webcaller-ntfy.service --no-pager` for the optional alert service. See [Operations](OPERATIONS.md#native-systemd-updates) for source upgrades that preserve configuration and data. Keep Debian, Node, HTTPS/TURN and ntfy patched separately; re-running the ntfy installer is not its upgrade process.
