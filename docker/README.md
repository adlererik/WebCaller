# WebCaller for Linux — guided server edition v0.20.0

Your people open a link. You keep control of the server. This download guides you through installing WebCaller, HTTPS, a call relay and optional extra ringing, then gives you simple maintenance commands.

**Linux x86-64 and ARM64 only.** Use Docker Engine directly on Linux, Python 3.10+ and Docker Compose 2.20+. Docker Desktop, Windows, macOS, remote Docker contexts and 32-bit ARM are not supported by this installer. Phones still use an ordinary browser; they do not need Docker.

Already have a native WebCaller service? Keep it. This package is an alternative installation in its own empty folder; it does not migrate or modify a native installation, another website or another Docker project. Earlier Olm versions need the separate [migration guide](../docs/APPROVED_CUTOVER.md).

## What you need before starting

- A Linux server you can log into by SSH. A public VPS is the simplest networking arrangement. A modest 64-bit server is sufficient for a small installation; allow room for container images, backups and retained files.
- A hostname under a domain you control, such as `phone.example.com`. The wizard does not buy a domain or change your DNS account.
- Docker Engine, the Compose plugin and Python 3.10+. You do not need Node, npm, Rust or to compile anything.
- Either a public IPv4 for the included TURN call relay, router forwarding to it, or an existing reachable TURN REST relay elsewhere.

**Website access and call connectivity are different.** A Cloudflare HTTP Tunnel can expose the website without router forwarding, but cannot carry TURN media. A home server behind CGNAT normally needs a public relay elsewhere. The wizard explains this and lets you configure the website first without pretending calls have been verified.

### Install Docker once

Follow the official instructions for your Linux distribution: [Debian](https://docs.docker.com/engine/install/debian/), [Ubuntu](https://docs.docker.com/engine/install/ubuntu/), [Fedora](https://docs.docker.com/engine/install/fedora/) or [other supported Linux distributions](https://docs.docker.com/engine/install/). Include the **Docker Compose plugin**. Install Python 3 using your distribution's package manager if it is missing.

Check:

```sh
python3 --version
docker version
docker compose version
```

If Docker says permission denied, follow its installation guide or run WebCaller commands consistently with `sudo`. Do not remove existing containers or replace another site's configuration to make this installer work. Docker access is powerful: keep its socket private.

## 1. Download into a new folder

In your SSH terminal:

```sh
mkdir WebCaller-download
cd WebCaller-download
curl -fLO https://github.com/adlererik/WebCaller/releases/download/v0.20.0/WebCaller-Docker-v0.20.0.tar.gz
curl -fLO https://github.com/adlererik/WebCaller/releases/download/v0.20.0/SHA256SUMS.txt
sha256sum --ignore-missing -c SHA256SUMS.txt
```

Continue when the Docker archive says **OK**. Other entries in the checksum file are source downloads you have not downloaded. If the check fails, download again; do not proceed with that file.

```sh
tar -xzf WebCaller-Docker-v0.20.0.tar.gz
cd WebCaller-Docker-v0.20.0
./webcaller setup
```

This is a small online installer: it downloads release-matched, digest-pinned images from GitHub Container Registry. It is not an offline copy of every image. Each installation gets its own persistent Docker project name, configuration and data volumes. Keep this folder after setup; it is your server's control panel.

If you run `./webcaller` without a command in an interactive terminal, it displays a numbered menu.

## 2. Follow the four-part wizard

**Your website:** enter a hostname such as `phone.example.com`, without `https://` or a path. The default phone address is `https://phone.example.com/calls/`.

**Secure access:** choose one:

| Choice | Use it when | What you must do |
|---|---|---|
| Automatic HTTPS | A fresh server can use ports 80 and 443 | Point DNS at the server/router's public IP; allow TCP 80/443. Caddy obtains and renews certificates. |
| Existing website/proxy/Tunnel | You already have HTTPS or another site uses those ports | Add a new hostname route to the shown loopback app port; preserve existing routes and WebSocket upgrades. |
| Containerized Cloudflare connector | You have a Cloudflare account, domain and tunnel token | Paste its token privately; add the shown hostname routes in your existing account. No domain or Cloudflare account is created. |

**Reliable calls:** choose the included self-hosted relay, an existing TURN REST relay, or configure later. For the self-hosted option, the wizard can suggest the public IP seen by a STUN server; this is a suggestion, not proof of a public inbound route. At home, compare it with the router's WAN address. If they differ, or the WAN address is private/CGNAT, read [networking](../docs/NETWORKING.md) before relying on this relay. Rootless Docker needs an external relay; the bundled host-network TURN recipe requires standard Docker Engine networking.

An existing relay must use REST shared-secret credentials. An ordinary fixed username/password account is not interchangeable with that option. Secrets are entered without echoing them.

**Extra ringing:** optionally add a self-hosted ntfy server under a separate hostname. Only people who install its phone client use this extra channel. Browser alerts remain available. Stock iPhone ntfy wake-up additionally uses ntfy.sh/Apple metadata infrastructure, which the wizard explains before you enable it. [Alerts and limitations](../docs/EXTRA_RINGING.md).

The wizard shows a summary and asks before saving. It generates unique owner, VAPID and relay credentials; it does not overwrite an existing installation. You can then start the stack immediately or finish the networking steps first.

## 3. Follow your connection checklist

```sh
./webcaller instructions
./webcaller start
./webcaller doctor
```

`instructions` prints routes and ports for **your chosen configuration**. `doctor` checks the local application and public HTTPS without turning off certificate validation. A WAIT result means setup is unfinished; it is not an instruction to create a new identity.

For a self-hosted home TURN relay, forward:

| Traffic | Destination |
|---|---|
| TCP and UDP 3478 | This Linux server, port 3478 |
| UDP 49160–49260 | The same ports on this Linux server |
| TCP 80 and 443 | This server only if you chose automatic HTTPS |

Equivalent VPS firewall rules are needed on a public server. Docker's published ports can interact with host firewalls; follow Docker's distribution-specific guidance. Do not expose the app's raw HTTP port as a substitute for HTTPS.

For an existing proxy/Tunnel running on the host, target `127.0.0.1:8080` by default. A containerized connector targets `webcaller:8080`, because its loopback address is not the host's. Optional ntfy similarly uses its selected loopback port on the host, or `ntfy:8094` inside the Docker network. The printed checklist gives the exact values.

### Restricted networks and TURN-TLS

The included relay starts with authenticated UDP/TCP TURN on 3478. This already carries **end-to-end encrypted WebRTC media**. Some restricted networks need TURN over TLS as an additional transport.

For TURN-TLS, copy a valid certificate and private key for your relay hostname into `config/certs/fullchain.pem` and `config/certs/privkey.pem` (real files, not symlinks), arrange certificate renewal, allow TCP 5349 and append `turns:relay.example.com:5349?transport=tcp` to `TURN_URLS` in private `config/app.env`. Recreate the service containers after a manual file change with `./webcaller stop` then `./webcaller start`. Certificates and renewal are additional setup; the wizard does not claim to have provisioned TURN-TLS. An existing HTTPS site already using 443 cannot also share that port with coturn without a separately designed proxy/IP arrangement.

A successful local health check or TURN allocation is not proof that two remote phones can exchange media. Test one phone on Wi-Fi and the other on cellular.

## 4. Set up the first phone

```sh
./webcaller qr
```

Scan this **private first-phone QR** with the phone camera, then choose a name. Use **Invite someone** on that phone for other people; do not send them owner/server credentials. Calling codes are optional.

On iPhone, follow the Add to Home Screen instructions and continue using that icon. Enable browser call alerts, test the sound while locked, then test calls in both directions. A website cannot force continuous ringing if the OS suspends it. Optional ntfy requires its own app. [Phone guide](../docs/USER_GUIDE.md).

## Everyday commands

| Command | Purpose |
|---|---|
| `./webcaller status` | Version and service state |
| `./webcaller doctor` | Local/public HTTPS checks and next steps |
| `./webcaller instructions` | Your DNS/proxy/port checklist |
| `./webcaller qr` | Private first-phone setup QR |
| `./webcaller logs` | Recent diagnostics; inspect before sharing |
| `./webcaller stop` / `start` | Stop/start this installation without deleting data |
| `./webcaller configure` | Guided changes with a safety snapshot |
| `./webcaller check-update` | Find a newer stable release with a Docker bundle |
| `./webcaller update` | Review and install that newer Docker release |
| `./webcaller backup` | Consistent private server snapshot |
| `./webcaller restore backups/FILE.tar.gz` | Restore a trusted snapshot after explicit confirmation |

## Change settings later

```sh
./webcaller configure
```

The wizard starts with the existing answers; Enter retains them. It briefly stops **this Docker installation**, makes a consistent safety snapshot, and recreates the selected services. Owner/VAPID credentials, persistent volumes and the Docker project identity are preserved. Extra application settings are retained where they are not explicitly controlled by the wizard. A failed/cancelled change restores the safety snapshot and restarts the previous stack if it was running.

Changing a hostname changes the browser origin. Browser identity/history is not automatically moved to a different website; phones need setup at the new address. Restoring server data also cannot recover keys that were erased from a phone. Finish calls before maintenance.

## Back up and restore

```sh
./webcaller backup
```

Confirm the brief interruption. The command stops this installation's services, snapshots matching bundle files, private configuration and its existing named volumes, then resumes the stack if it was running. It prints a filename under `backups/`. Copy that archive to protected storage away from the server.

**Backups contain credentials and are not password-encrypted.** They are created with private file permissions. Use encrypted storage for an off-server copy. Never upload these files, `config/`, `.env` or private QR output to GitHub. Never run `docker compose down -v` on an installation you want to keep.

To restore on the same installation:

```sh
./webcaller restore backups/YOUR-BACKUP.tar.gz
```

Use the actual filename printed by Backup. The assistant verifies file hashes, allowed paths and the installation identity before changing data. It takes a safety backup and asks you to type **RESTORE**. Restoration replaces matching bundle/configuration/data with the snapshot; server changes after that time are lost. Only use backups you trust: they contain executable installer files too.

To recover on a replacement Linux server, install Docker/Compose/Python, extract a fresh release bundle into an empty folder, copy your private backup there, then run `./webcaller restore /absolute/path/to/YOUR-BACKUP.tar.gz` **before setup**. The assistant recovers the saved configuration and data without generating replacement keys. It refuses to create a second copy of that project where its containers/volumes already exist. Update DNS/router settings if the server address changed and run Doctor again. Private keys and conversations retained only on a phone remain that phone's responsibility.

Snapshots support regular files/directories, not symlinks or special files; copy TLS files into `config/certs`. The verifier rejects corruption, unexpected paths, links, duplicate entries and excessive archive sizes/counts. Hash checks detect corruption, not who made an untrusted archive. Keep enough free disk space for a full copy and retain the required prior images for offline recovery.

## Updates and recovery

```sh
./webcaller check-update
./webcaller update
```

The assistant offers a published stable release **with an actual Docker bundle**, shows its release-notes link and asks for confirmation. It checks the archive checksum/allowed files, requires the expected image namespaces/digests, downloads images before stopping services, then takes a full safety snapshot. Private configuration is retained. Startup failure triggers restoration of the previous matching bundle, configuration and server data. If automatic recovery itself fails, the assistant keeps the backup and gives its location for manual recovery. It never changes a separate native installation.

You may choose an explicit newer release with `./webcaller update vX.Y.Z`. Replace the placeholder with a real release. Updates interrupt calls; they are deliberate, not unattended. Protocol boundaries and incompatible bundle formats require a reviewed migration. A rollback restores server state at the snapshot, not phone/browser state or later messages; do not clear phones' site data as a repair step.

**Coming from the older v0.18.0 Docker launcher:** its own updater predates automatic snapshots. First stop that installation and make a consistent private copy of its installation folder/configuration and named volumes using [Docker's volume backup procedure](https://docs.docker.com/engine/storage/volumes/#back-up-restore-or-migrate-data-volumes). Then use its documented `./webcaller update v0.20.0`. It preserves its existing project/configuration; future maintenance uses the new assistant. The older updater does not retroactively gain automatic recovery for that first upgrade. Existing Olm installations require the separate migration guide.

## Included software and security

WebCaller, setup helper and coturn images are published at `ghcr.io/adlererik/webcaller` with x86-64/ARM64 variants and release-specific app, `-setup` and `-turn` tags. The downloadable bundle pins project and supporting ntfy/Caddy/cloudflared images by digest. Docker Engine itself remains a host prerequisite maintained through your Linux package manager.

Chat/signaling use official libsignal PQXDH/Triple Ratchet with application Ed25519 signatures; files use fresh AES-256-GCM keys. Voice/video use browser DTLS-SRTP, with optional media-bound SAS words and a full identity fingerprint. The custom browser integration remains unaudited. Read [security and encryption](../docs/SECURITY.md), [all features](../docs/FEATURES.md) and [licensing](../LICENSING.md).

The combined distribution links AGPL-3.0-only libsignal. Images include notices and matching corresponding source; release source archives include the pinned upstream source. Preserve this source offer when hosting or modifying the project. Sticker artwork has separate attribution/rights records.
