# Guided Docker installation — WebCaller v0.18.0

**Version note:** this guide and the prebuilt images remain at v0.18.0. The v0.19.0 sticker release is source/native only and does not include a Docker update bundle. Use the [native/source guide](../docs/INSTALL.md) for those features; do not pass v0.19.0 to this prebuilt updater.

This small download installs the **libsignal/PQXDH v0.18.0** application. It pulls matching prebuilt images from GitHub Container Registry (GHCR); you do not need Node, npm or Rust on the host. Native amd64/arm64 images support Linux servers, including common x86 VPSs and 64-bit ARM servers.

The bundle includes the phone, setup wizard/private QR and optional coturn, ntfy, Caddy HTTPS and Cloudflare connector. You still supply a server, domain, network access and any required router/DNS configuration. It does not register domains or replace another website automatically.

**Existing Olm v0.17.x or earlier:** use [upgrade planning](../docs/APPROVED_CUTOVER.md). This protocol boundary is bundle format 2; do not point it at old volumes or bypass an updater's migration refusal. New installations use a fresh empty folder. This does not change a separate native installation.

## 1. Install Docker

Use the official [Docker Engine on Debian](https://docs.docker.com/engine/install/debian/) guide (or your distribution's supported instructions), including the **Docker Compose plugin**. Check:

```sh
docker --version
docker compose version
```

If your account is not allowed to use Docker, follow the vendor's instructions or use `sudo` consistently for these commands. Docker access grants substantial host privileges; keep its socket private. Preserve any existing containers/volumes.

## 2. Download and check the bundle

On the server, in a new empty directory:

```sh
mkdir WebCaller-install
cd WebCaller-install
curl -fLO https://github.com/adlererik/WebCaller/releases/download/v0.18.0/WebCaller-Docker-v0.18.0.tar.gz
curl -fLO https://github.com/adlererik/WebCaller/releases/download/v0.18.0/SHA256SUMS.txt
sha256sum --ignore-missing -c SHA256SUMS.txt
```

Continue only when the Docker archive reports **OK**. The checksum file also lists source assets, which are intentionally absent here. The download is a small installation bundle, not an offline copy of all images. Image references in the uploaded bundle are versioned **and digest-pinned**; `docker/images.env` in source is the editable build reference.

```sh
tar -xzf WebCaller-Docker-v0.18.0.tar.gz
cd WebCaller-Docker-v0.18.0
./webcaller setup
```

## 3. Answer the setup questions

- **Hostname:** your own HTTPS hostname, for example `phone.example.com`. The initial app URL is `https://phone.example.com/calls/`.
- **HTTPS:** choose automatic Caddy only if ports 80/443 are available and reach this server. If another website/proxy or Tunnel already runs here, choose the existing proxy/Tunnel option and add a route to the selected loopback app port. Keep other routes.
- **TURN:** self-host if the relay/router has a publicly reachable IPv4 and you can open its ports; otherwise supply an existing TURN REST relay. Behind CGNAT, use a public relay elsewhere. Configure-later is useful for setup, but not reliable cross-network calling.
- **Optional ntfy:** choose it only if you want extra ringing for people who can install its app. Give it a separate hostname. The iPhone option uses the described ntfy.sh wake-up metadata relay; encrypted conversations remain in WebCaller.

The wizard creates private `config/` files and credentials, plus persistent Docker volumes. It will not overwrite an existing setup. Do not publish `config/`, `.env`, tunnel tokens, private QR output or volume backups. Do not use `docker compose down -v` on a real installation: it removes persistent data.

For a home relay forward **TCP/UDP 3478** and **UDP 49160–49260** to it; public VPS firewalls need equivalent rules. HTTPS Caddy needs TCP80/443 separately. TURN-TLS/certificate setup is additional; a Cloudflare HTTP Tunnel does not relay TURN media. [Networking and CGNAT](../docs/NETWORKING.md).

For an existing proxy/Tunnel, target the app's selected port on loopback (default `127.0.0.1:8080`) and preserve WebSocket upgrades. With the containerized Tunnel option, the connector uses Docker-network service names such as `webcaller:8080`; its loopback is not the host's loopback. A separate ntfy route targets its chosen loopback port or `ntfy:8094` inside that Docker network. No Cloudflare account/domain is created by the wizard.

## 4. Start and enroll the first phone

```sh
./webcaller start
./webcaller status
./webcaller qr
```

The services should report running/healthy. Scan the private first-phone QR with the phone camera and choose a display name. **Invite someone** connects other people; they do not need owner/server credentials. Keep the first-phone QR private. iPhone users follow Add to Home Screen and use that icon for calls/alerts. [Phone instructions](../docs/USER_GUIDE.md).

Test messages, calls both ways, four matching SAS words, a photo while talking, different networks, locked-screen sound and Wi-Fi/cellular recovery. Settings → Check calling connection only proves relay allocation, not complete media delivery. Alert delivery depends on phone permissions and OS policy.

## Everyday commands

```sh
./webcaller status
./webcaller logs
./webcaller stop
./webcaller start
```

Logs are diagnostics, not material to post publicly without checking for identifiers. The generated configuration and named volumes preserve identity/mailbox/ntfy state across normal restart. Phone private keys are held by the browser, not recoverable from a server backup.

## Update and recovery

Read release notes first, finish calls and make a consistent private backup of the installation/configuration and persistent volumes. Use an explicit newer **libsignal** version:

```sh
./webcaller update vX.Y.Z
```

Replace `vX.Y.Z` with the actual release. The updater checks bundle checksum, allowed files, version order and image namespace/digests, pulls before replacement, preserves private configuration/volumes and checks startup. Updates are deliberate, not unattended. Existing explicit configuration wins over new defaults. A protocol/database migration is not an ordinary update; downgrades and Olm cutovers require manual review. Source-only package changes do not alter a running native service.

The updater is not an automatic database rollback mechanism. Keep a matching prior bundle/images/configuration/database backup until tested, and restore with services stopped. Do not restore a database over a running application or clear phones' browser data to repair connectivity. [Operations and backups](../docs/OPERATIONS.md).

## What is downloaded and licensed

The application/setup/relay images are published under `ghcr.io/adlererik/webcaller`, with release-specific app, `-setup` and `-turn` tags plus amd64/arm64 variants. Supporting ntfy/Caddy/cloudflared images are separately pinned. Download size varies by architecture and registry layer cache; this bundle is only the launcher, not an offline appliance.

The combined application links AGPL-3.0-only libsignal. The app image includes notices and the matching corresponding-source download; release source archives include full pinned upstream source. Preserve that source offer if you modify or host it. [Licensing](../LICENSING.md) · [Security](../docs/SECURITY.md).
