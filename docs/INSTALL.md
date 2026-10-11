# Beginner installation guide

## What you are installing

WebCaller is a small website on your server. Phones open it in Safari or Chrome. Docker runs the server program; Caddy can give it a secure HTTPS address; coturn helps calls cross different internet connections. The phones do not need SIM cards.

You will need a Debian 12/13 computer or VPS with administrator access, internet access, a domain you control, and two devices to test a call. The installer is intended for a fresh server. It will not remove existing container software or overwrite an existing `.env`.

## 1. Choose your address

Use a separate address such as `calls.yourdomain.com`. The app lives at `https://calls.yourdomain.com/calls`. A separate subdomain keeps it isolated from scripts on another website.

Choose one HTTPS method:

**A. Automatic Caddy:** point the domain's DNS A record at your public server/router IPv4. If behind a home router, forward TCP 80 and TCP 443 to the Debian computer. These ports must be free. A Cloudflare DNS record for this route should be DNS-only while configuring certificates. The installer starts Caddy and obtains/renews the certificate. [Caddy HTTPS requirements](https://caddyserver.com/docs/automatic-https).

**B. Existing HTTPS proxy or Cloudflare Tunnel:** choose option 2 in the installer. In Cloudflare's published application route, send your calls hostname to `http://127.0.0.1:8080` on the server. Enable WebSockets. Caddy is not started, so an existing website keeps ports 80/443. If the tunnel runs in another container, `127.0.0.1` means that container; use a shared network and `http://webcaller:8080` instead. [Cloudflare published application guide](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/routing-to-tunnel/).

Do not replace an existing website's port forwarding. Follow [Networking](NETWORKING.md) if ports are occupied or you use a home connection.

## 2. Download WebCaller onto the Debian server

The easiest way to connect is to open Terminal on your computer and enter `ssh YOUR_USERNAME@YOUR_SERVER_ADDRESS`. Replace the capitalized words with your own details. Enter the server password locally if asked; never post it in an issue.

Download the release:

```sh
sudo apt update
sudo apt install -y curl tar
curl -fL https://github.com/adlererik/WebCaller/releases/download/v0.2.0/WebCaller-v0.2.0.tar.gz -o WebCaller-v0.2.0.tar.gz
curl -fL https://github.com/adlererik/WebCaller/releases/download/v0.2.0/SHA256SUMS.txt -o SHA256SUMS.txt
```

Check the archive before extracting:

```sh
grep 'WebCaller-v0.2.0.tar.gz$' SHA256SUMS.txt | sha256sum -c -
tar -xzf WebCaller-v0.2.0.tar.gz
cd WebCaller-v0.2.0
```

A successful checksum says `OK`. Stop if it fails. Alternatively download/extract the ZIP on your computer and copy the folder to your server.

## 3. Run the guided installer

```sh
sudo bash deploy/install-debian.sh
```

It installs Docker from Docker's official signed Debian repository when needed, supplies Python/QR support, asks the questions below, creates private secrets and starts the selected containers. It does not add your account to the Docker administrator group. [Official Docker installation](https://docs.docker.com/engine/install/debian/).

Enter your domain, for example `calls.yourdomain.com`. Choose HTTPS option 1 for Caddy or 2 for your existing proxy/Tunnel. Choose TURN option 1 for self-hosted coturn, 2 for an existing REST-credential relay, or 3 to configure later.

For self-hosted TURN, enter the public IPv4 visible in your router's WAN page or VPS dashboard. If the Debian computer is behind your home router, enter its fixed LAN IPv4 too. On a directly public VPS, leave the LAN field empty. A private address such as `192.168.x.x` is not a public WAN address.

For home TURN, manually forward TCP/UDP 3478 and UDP 49160–49260 to the Debian computer and allow them in the host/provider firewall. Tunnel alone does not carry TURN media. See [Networking](NETWORKING.md) for CGNAT and TLS.

The first download/build may take several minutes. Check:

```sh
sudo docker compose ps
```

`webcaller` should become healthy. Open your real HTTPS address. A local `localhost` address on your phone refers to that phone, not the server.

## 4. Set up your first phone by QR

In the server terminal, run:

```sh
sudo .runtime/qr-venv/bin/python scripts/phone-setup-qr.py --env .env --terminal
```

This intentionally displays a **private setup QR** in your terminal. Open your phone's Camera, scan the QR, tap the website link, and press **Set up this phone**. Change the default name if wanted. No long code needs typing. Keep the QR private; it contains the credential for the first registration.

If scanning a terminal is awkward, use the private browser card. On the server:

```sh
sudo .runtime/qr-venv/bin/python scripts/phone-setup-qr.py --env .env
```

Leave that command running. Open a second terminal **on your computer**, then run:

```sh
ssh -L 8093:127.0.0.1:8093 YOUR_USERNAME@YOUR_SERVER_ADDRESS
```

Open `http://localhost:8093/` on your computer. Scan the displayed QR with the phone, or use **Copy setup link** and send it to yourself. The private card closes after 30 minutes; it never goes on the public website. If the local port is busy, stop your previous card/tunnel before retrying. The setup link works while no browser is registered; it is not a separate 30-minute authentication token.

A manual alternative is to privately read `BOOTSTRAP_TOKEN` from `.env` and paste it into the first phone's code field. Other phones use invitations, not the owner code. Clearing all server users can make the owner code eligible again, so continue to keep it private.

## 5. Invite someone and test

On the first phone choose **Invite someone → Share invitation** or **Copy link**. The other person opens the complete link in their phone browser and presses **Accept invitation**. Their name is optional. Each invitation works once and lasts 24 hours.

Tap the phone icon for voice or the camera icon for video. Allow the microphone and, for video, the camera. Test both call directions, then put the devices on different internet connections. Open Settings → **Check calling connection**. A relay allocation test is useful, but a real cross-network conversation is the final check.

Keep the page open to receive calls. A browser-only website cannot guarantee closed-browser or locked-phone ringing. Connection management is always **Automatic**; unknown networks default to saving data. Ringing activates with your first normal tap or keypress, without a separate setup switch.

## If something goes wrong

| Symptom | What to check |
|---|---|
| Incorrect setup code | Use the private QR or complete setup link; placeholder text is not the code |
| Invitation expired/used | Create a fresh one-person invitation |
| Microphone unavailable | Open the real HTTPS site and allow microphone permission |
| Website unreachable | DNS, Caddy certificate, port forwarding or Tunnel route; `sudo docker compose ps` |
| App port occupied | Choose a free `APP_PORT` in `.env`; change the proxy target to the same port |
| Page works but calls fail | TURN credentials and external relay ports; Tunnel is not a media relay |
| iPhone does not ring when closed | Unsupported in this no-install model; keep the page active |
| Very slow internet | Audio adapts and video pauses; complete outages cannot carry a call |

For updates use [Operations](OPERATIONS.md); do not regenerate `.env` or delete the data volume.
