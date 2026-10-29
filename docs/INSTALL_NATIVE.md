# Native installation on Debian — no Docker

This guide creates a **new** native installation on Debian 12/13. It does not replace an existing WebCaller, its Node installation or its service. Commands assume a regular SSH user with sudo. Replace `phone.example.com` with a separate hostname under your own domain.

## 1. Download into a separate folder

```sh
sudo apt update
sudo apt install -y git ca-certificates curl xz-utils nano python3 python3-venv
if sudo test -e /opt/webcaller; then echo 'Stop: the target directory already exists.'; exit 1; fi
sudo install -d -m 755 -o "$(id -un)" -g "$(id -gn)" /opt/webcaller
git clone --recurse-submodules --branch v0.20.0 https://github.com/adlererik/WebCaller.git /opt/webcaller
cd /opt/webcaller
```

**Release archive alternative:** instead of the `git clone` command, extract the uploaded `WebCaller-v0.20.0.tar.gz`/`.zip` into the empty `/opt/webcaller` folder. Use the uploaded release asset rather than GitHub's automatic Source code archive, and check its SHA-256 against the release's `SHA256SUMS.txt`. The uploaded asset includes pinned upstream source and `public/preview-source.tar.gz`. Skip `npm run prepare:source` below when using an extracted archive without `.git`; it is a Git-checkout build step. [Download choices](INSTALL.md).

Run each command only after the previous succeeds. If the existence check fails, stop: review the existing directory rather than overwriting it. For an existing Olm deployment, stop here and read [the migration guide](APPROVED_CUTOVER.md). Use a different new folder if needed and substitute that path throughout this guide. GitHub ZIPs omit source submodules; the recursive clone includes the exact official source needed for the source offer.

## 2. Install a private Node.js 24 runtime

WebCaller needs Node 24. These commands download the official Linux x64/arm64 binary into this project's ignored `.runtime` folder; they do not change system Node or another service. The SHA-256 list and archive are fetched over HTTPS. Node also documents [signed-checksum verification](https://github.com/nodejs/node#verifying-binaries).

```sh
mkdir -p .runtime/node-download
cd .runtime/node-download
case "$(dpkg --print-architecture)" in
  amd64) webcaller_arch=x64 ;;
  arm64) webcaller_arch=arm64 ;;
  *) echo 'Use the official Node.js download instructions for this architecture'; exit 1 ;;
esac
curl -fLO https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt
webcaller_archive=$(awk -v arch="$webcaller_arch" '$2 ~ ("-linux-" arch "\\.tar\\.xz$") {print $2; exit}' SHASUMS256.txt)
test -n "$webcaller_archive"
curl -fLO "https://nodejs.org/dist/latest-v24.x/$webcaller_archive"
awk -v file="$webcaller_archive" '$2 == file {print}' SHASUMS256.txt | sha256sum -c -
```

Continue only after `OK`. If downloading/checking fails, stop rather than using an incomplete archive.

```sh
mkdir -p ../node
tar -xJf "$webcaller_archive" -C ../node --strip-components=1 --no-same-owner
cd /opt/webcaller
export PATH="$PWD/.runtime/node/bin:$PATH"
node --version
npm --version
npm ci --ignore-scripts
npm run setup
npm run prepare:source
```

Node should report v24. Rust is not needed: browser WASM is already bundled. `prepare:source` creates the public corresponding-source download and requires the clean checked-out upstream source. It excludes private `.env`/data/runtime files. Preserve your `.runtime` Node directory and keep that runtime patched during future updates.

## 3. Set private configuration

```sh
nano .env
```

Use these values, replacing the example hostname:

```dotenv
HOST=127.0.0.1
PORT=8088
PUBLIC_URL=https://phone.example.com/calls
DATA_DIR=./data
WEBCALLER_CRYPTO_ENGINE=libsignal-pqxdh-v1
```

Keep the generated owner token and VAPID keys. Set `VAPID_SUBJECT` to your own contact URL/email. In nano: Ctrl+O, Enter to save; Ctrl+X to exit. Keep `.env` private and never commit/share it. The empty secret fields in `.env.example` are filled by setup, not by this documentation.

For an existing TURN relay, privately configure its REST `TURN_SECRET` and comma-separated `TURN_URLS`. Alternatively use the Cloudflare TURN API fields. [Networking](NETWORKING.md) explains public IP, CGNAT, ports and TLS. A website Tunnel is not a media relay. Optional ntfy fields remain blank until its server is configured.

Test the server in the foreground:

```sh
npm start
```

From another SSH terminal, `curl -fsS http://127.0.0.1:8088/calls/health` should return `"ok":true`. Use Ctrl+C in the first terminal to stop that foreground process before enabling the boot service. Do not regenerate secrets to fix a connection problem.

## 4. Give this installation a boot service

The following creates **webcaller.service**, using the current regular user and the private Node runtime. Do not run it from a root login. Check `whoami` first. If the unit already exists, inspect it instead of overwriting it.

```sh
test "$(id -u)" -ne 0 || { echo 'Use a regular SSH account, not root.'; exit 1; }
if sudo test -e /etc/systemd/system/webcaller.service; then echo 'Stop: the service already exists.'; exit 1; fi
mkdir -p data
chmod 700 data
sudo tee /etc/systemd/system/webcaller.service >/dev/null <<EOF
[Unit]
Description=WebCaller libsignal phone
After=network-online.target

[Service]
Type=simple
User=$(id -un)
Group=$(id -gn)
WorkingDirectory=/opt/webcaller
EnvironmentFile=/opt/webcaller/.env
ExecStart=/opt/webcaller/.runtime/node/bin/node /opt/webcaller/server/index.mjs
Restart=on-failure
RestartSec=3
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/opt/webcaller/data
RestrictSUIDSGID=true
LockPersonality=true
CapabilityBoundingSet=

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now webcaller.service
sudo systemctl status webcaller.service --no-pager
curl -fsS http://127.0.0.1:8088/calls/health
```

The service should be `active (running)`. Troubleshoot locally with `sudo journalctl -u webcaller.service -n 50 --no-pager`; redact logs before sharing. This service uses the same regular Unix account, not a complete host-security boundary. Use a dedicated account/additional isolation for stronger separation. The optional `deploy/install-system.sh` also installs webcaller.service; choose one method, not both.

## 5. Add HTTPS for the new hostname

Choose one existing HTTPS method; preserve existing routes/websites.

- **Cloudflare Tunnel running on this host:** add a published hostname `phone.example.com`, HTTP service `127.0.0.1:8088`, no path filter. Keep all earlier routes. No website router forwarding is needed.
- **Existing HTTPS reverse proxy:** forward `/calls` and `/calls/*`, including WebSocket upgrades, to `127.0.0.1:8088`. Use a valid certificate for the new hostname.
- **Fresh server using Caddy:** point the hostname at the public server/router; ports 80/443 must be available and forwarded appropriately. Add a new site block to your Caddy configuration rather than replacing other sites:

```caddyfile
phone.example.com {
    @phone path /calls /calls/*
    reverse_proxy @phone 127.0.0.1:8088
    respond "Not found" 404
}
```

Validate/reload your proxy using its official instructions. Open the HTTPS site without certificate warnings. Do not expose raw port 8088 as a substitute for HTTPS. [Networking](NETWORKING.md).

## 6. First phone, QR and invites

```sh
cd /opt/webcaller
python3 -m venv .runtime/qr-venv
.runtime/qr-venv/bin/python -m pip install qrcode==8.2
.runtime/qr-venv/bin/python scripts/phone-setup-qr.py --env .env --terminal
```

Keep this owner QR private. Scan it with the first Android phone's camera and open it in the browser you will keep using. It supplies the owner code automatically. Choose a display name, then **Invite someone** to connect the other phone. The invitee does not need the owner code, server password or publishing tokens.

On iPhone follow the invitation's Add to Home Screen guidance and use the Home Screen icon. If the first device is an iPhone, add the site before enrollment and open the owner setup there, or enroll a desktop first and invite the iPhone. Different browser/Home Screen profiles may not share identities; keep any normal WebCaller icon/storage.

Test messages, reloads, both call directions, matching SAS, photo transfer while calling, different networks and locked-screen sound. Optional ntfy uses its own hostname/service; adapt [Extra ringing](EXTRA_RINGING.md) with this installation's private `.env` and **webcaller.service**. Its stock iPhone wake-up relay limitation still applies.

## Updates and removal

Follow [Operations](OPERATIONS.md): preserve configuration/database/phone storage, update to a reviewed libsignal release, regenerate its source archive and refresh both phones. Stop this service with `sudo systemctl stop webcaller.service`. Removing this service is not a reason to restore or alter a stable installation.
