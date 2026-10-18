# WebCaller: the easy Docker installation

This runs the same Signal-like WebRTC phone, encrypted chat and optional ntfy alerts using ready-made images. **The person running the server follows this guide once. People receiving invitations just open their link.** No Node.js, npm, Python or systemd app service needs installing on the server.

This is the **v0.16.1 preview**, for Linux **amd64** (Intel/AMD) and **arm64** servers. Docker selects the right image. Docker Engine and a recent Compose plugin (2.24 or newer) must already work. [Install Docker on Debian](https://docs.docker.com/engine/install/debian/). Windows/macOS Docker Desktop, rootless Docker and other architectures are not certified for this complete host-networked TURN stack.

Use this for a **new installation**. If you already have WebCaller, keep using its current update method until you plan a migration. This package uses its own Compose project and volumes; it does not import a native database or the old source-built Docker volume automatically. Starting a new empty database under an existing phone URL would strand existing browser identities.

## 1. Have your addresses ready

You need a domain you control, such as `calls.example.com`, and optionally another subdomain, `ntfy.example.com`. **Replace example.com with your own domain.** A subdomain is not another domain registration. Docker does not configure DNS, router forwarding or Cloudflare routes for you.

Choose one website connection:

- **Automatic HTTPS with Caddy:** point both selected hostnames at the server/router public IP. Allow/forward TCP 80 and 443 to this server. These ports must be free; preserve an existing website and use a proxy/Tunnel instead if occupied. Caddy obtains and renews the website certificates.
- **Existing HTTPS proxy or Cloudflare Tunnel:** keep its current installation and routes. Forward the calls hostname to `http://127.0.0.1:8080` and the optional ntfy hostname to `http://127.0.0.1:8094`. WebSocket upgrades and streaming must pass through. These are loopback listeners, not public HTTP ports.
- **Containerized Cloudflare connector:** create/select your tunnel in Cloudflare and use its connector token in the private setup wizard. The tunnel runs in this bundle, without installing cloudflared on the host. Its published application routes must target **`http://webcaller:8080`** for calls and **`http://ntfy:8094`** for ntfy, because loopback inside this connector means the connector itself. Leave the route Path empty for separate hostnames and keep other routes. [Cloudflare route instructions](https://developers.cloudflare.com/tunnel/get-started/#publish-an-application).

For home-hosted coturn, the server/router needs a **public IPv4**. Give the server a fixed LAN address, then forward TCP/UDP 3478 and UDP 49160–49260 to it. On a public VPS, allow those ports in its firewall and leave the wizard's LAN field empty. CGNAT needs an external reachable relay or an ISP public-IP option; a Tunnel alone cannot carry TURN media. [Networking guide](https://github.com/adlererik/WebCaller/blob/v0.16.1/docs/NETWORKING.md).

## 2. Download the small setup bundle

On the server, download these files from the [v0.16.1 release](https://github.com/adlererik/WebCaller/releases/tag/v0.16.1). If using a terminal:

```sh
curl -fL https://github.com/adlererik/WebCaller/releases/download/v0.16.1/WebCaller-Docker-v0.16.1.tar.gz -o WebCaller-Docker-v0.16.1.tar.gz
curl -fL https://github.com/adlererik/WebCaller/releases/download/v0.16.1/SHA256SUMS.txt -o SHA256SUMS.txt
grep 'WebCaller-Docker-v0.16.1.tar.gz$' SHA256SUMS.txt | sha256sum -c -
```

Continue only after `OK`. Then:

```sh
tar -xzf WebCaller-Docker-v0.16.1.tar.gz
cd WebCaller-Docker-v0.16.1
./webcaller setup
```

If your account cannot use Docker, run the commands with `sudo`, consistently from then on. The bundle needs only Docker and ordinary Linux shell tools; curl/tar are for downloading/extracting, not app runtimes. Public images require no GitHub login.

## 3. Answer the short setup questions

Enter your calls hostname, choose your website connection above, and choose self-hosted TURN, an existing REST-credential relay, or configure later. Self-hosting asks for the relay public IPv4 and, at home, the server LAN IPv4. Configure-later cannot ensure cross-network calls.

Optional extra ringing asks for the separate ntfy hostname. Choose iPhone support if any recipient might use the stock iPhone ntfy app: it requires the ntfy.sh wake-up metadata relay. Actual generic alerts remain on your ntfy server; Apple/Firebase/upstream infrastructure still participates in waking iPhones. This is not an entirely offline push system.

The wizard generates fresh owner, browser-push and TURN secrets. Tunnel/relay secrets are entered privately with hidden input. It writes private **`.env` and `config/`** files and refuses to overwrite an existing setup. Do not upload them, the terminal QR or your generated settings to GitHub. Do not run setup again as an upgrade.

## 4. Start and set up your first phone

```sh
./webcaller start
./webcaller status
./webcaller qr
```

The first start downloads the selected images and waits for services to start/become healthy. The QR is intentionally **private**: scan it with your phone Camera and finish first-phone setup. Nobody needs to type a long setup code. Other phones use **Invite someone → Create invitation → Share invitation**.

For the first iPhone, the simplest route is to register your own computer using the private setup link first, then invite the iPhone. Invitations guide **Share → Add to Home Screen → Add** before acceptance; the owner QR does not perform that handoff. Alternatively, add the site to the Home Screen before registration, open its icon and privately paste the owner code there. Existing Safari identities do not automatically move into a Home Screen app. [First-phone instructions](https://github.com/adlererik/WebCaller/blob/v0.16.1/docs/INSTALL.md#4-set-up-your-first-phone-by-qr).

Allow microphone/camera when making or answering a call. Enable browser alerts and complete the locked-phone sound test. iPhone users should keep using the saved Home Screen icon. Do not clear site storage: that removes the phone's keys and local history.

Test calls **in both directions on different networks**, not only on your Wi-Fi. Check Settings → **Check calling connection**. A relay candidate proves allocation, not every possible media path.

## 5. Optional ntfy on each phone

If enabled, open **Settings → Extra ringing · ntfy**. Android has a connect button after installing the free ntfy app. On iPhone, paste this phone's long `wc_` subscription into **Topic name**, enable **Use another server**, paste **Server** into **Service URL**, then Subscribe. “Incoming calls” is only a friendly name. No subscription username/password or server publishing credential is needed.

Return to WebCaller, use **Test the sound**, lock the phone and confirm only after hearing it. If a notification opens another browser, use the explicit usual-phone-icon fallback. Alerts use ntfy priority **5 / Max / urgent**. Sound/channel instructions, DNS/login help and iPhone limits are in [Extra ringing](https://github.com/adlererik/WebCaller/blob/v0.16.1/docs/EXTRA_RINGING.md). A website or Docker image cannot force a sleeping phone to override its sound settings.

## Everyday commands

| Command | What it does |
|---|---|
| `./webcaller start` | Start selected services and check startup/health |
| `./webcaller status` | Show container state |
| `./webcaller qr` | Show the private first-owner QR; use invitations after setup |
| `./webcaller logs` | Show recent logs; review/redact them before sharing |
| `./webcaller stop` | Stop services while keeping configuration and data |
| `./webcaller update vX.Y.Z` | Download/check a specific newer Docker bundle, pull its images and restart |

Use the same folder and account for later commands. Editing `config/app.env` requires `./webcaller start` to recreate the app with new environment values. Never regenerate the owner/VAPID/TURN keys to troubleshoot connectivity. Public ports belong to the chosen proxy/TURN; the phone and ntfy HTTP ports bind only to loopback.

## Updates, backups and removal

Read the new release notes first. When nobody is calling, run `./webcaller update vX.Y.Z`, substituting an actual newer version. It asks for confirmation locally, checks the bundle's HTTPS-downloaded checksum, requires approved image namespaces/digests, pulls images before replacing the public bundle files, and waits for startup/health. `.env`, `config/`, browser identities and existing named volumes remain. It rejects downgrades. `--yes` skips only the local confirmation; no unattended update schedule is installed.

A restart can interrupt calls. Health checks prove startup, not voice quality, migration correctness or locked-phone sound. If checks fail, keep the configuration/volumes and inspect status/logs. Previous public bundle files are retained under `.updates/previous`; this is **not a database backup or automatic database rollback**. Follow release-specific migration/rollback instructions before reverting an app image.

Make any private backups you need before updating, using Docker's [volume backup instructions](https://docs.docker.com/engine/storage/volumes/#back-up-restore-or-migrate-data-volumes). Stop the services for a consistent SQLite copy. Back up `.env`, `config/`, app data, ntfy state and publisher volumes together; preserve Caddy volumes if used. Keep backups private/encrypted. Backups can retain ciphertext after a disappearing timer; choose their retention deliberately. The updater does not automatically archive conversation history.

`./webcaller stop` preserves everything. To permanently remove the installation, stop it and intentionally remove its containers, named volumes and private folder after deciding whether you need recovery. **Do not use `docker compose down -v` during ordinary updates**: it deletes data. Server removal does not erase recipients' devices, screenshots, browser/OS history or external records.

## What is inside

Version/digest-pinned images run WebCaller, a one-shot setup tool, optional coturn, optional ntfy, and either optional Caddy or a Cloudflare connector. Project images come from `ghcr.io/adlererik/webcaller`; third-party images come from their official registries and are pinned by digest. Source ZIP/tar downloads and native/source-built Docker installs remain available. There is no universal `latest` auto-upgrade.

WebCaller uses its existing Olm Double Ratchet, signed/pinned identities, AES-GCM attachments, media-bound optional four-word SAS and WebRTC DTLS-SRTP. Docker changes deployment, not those protocols. ntfy has its own state and a write-only server publisher credential; it cannot read app files or authenticate a caller. Publishing uses the exact `http://ntfy:8094` destination on a private Docker network with an explicit server-only opt-in. The alert publisher token crosses that same-host network in plaintext, rather than TLS; this does not carry chat, call media or encryption keys. External phone access stays HTTPS. Ordinary native configuration still rejects non-loopback HTTP.

The app never receives the Docker socket. One-shot ntfy initialization has limited volume-management capabilities and no network; runtime ntfy is unprivileged and has no app-data mount. Adding containers does not protect against a compromised host, browser-delivered malicious code or an owned phone. [Security model](https://github.com/adlererik/WebCaller/blob/v0.16.1/docs/SECURITY.md).

TURN-TLS is optional: place your relay's valid `fullchain.pem` and `privkey.pem` privately in `config/certs/`, add its `turns:` URL to `config/app.env`, and forward/allow TCP 5349. Arrange certificate renewal and restart the relay after renewal. Caddy's website certificates are separate; this bundle does not automatically issue TURN/IP certificates or change existing TCP 443 forwarding. See Networking for restricted networks.
