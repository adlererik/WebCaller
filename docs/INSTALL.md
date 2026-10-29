# Install WebCaller v0.20.0

WebCaller has two installation paths. Both run the same browser phone and encryption; choose the one that fits your server.

| Choice | What you need | Guide |
|---|---|---|
| **Guided Linux Docker edition** | Linux x86-64/ARM64, Docker Engine + Compose, Python 3.10+ | [Start here](../docker/README.md) — ready-made images, setup questions, diagnostics, backups, settings changes and updates. |
| **Native Debian/source** | Debian 12/13, Node 24, Python 3; Git for a source checkout | [Native instructions](INSTALL_NATIVE.md) — regular system services without Docker. Existing native installations can stay native. |

Phone users open your website. They do not need Docker, an account password, a SIM or a WebCaller phone app. iPhone background browser alerts require Add to Home Screen. Optional ntfy extra ringing requires its separate client. [Phone guide](USER_GUIDE.md).

## Before you start

You need a server, an HTTPS hostname you control and a reachable TURN call relay for difficult networks. A fresh public Linux VPS is the simplest complete Docker arrangement. A home server can expose its website through an HTTPS Tunnel but may need a public relay elsewhere if behind CGNAT. An HTTP Tunnel does not relay WebRTC media.

The installer does not register domains, change your DNS account, bypass CGNAT or replace an existing website. The wizard explains each choice and prints the routes and ports for your answers. Networking that requires your router/DNS account still needs your action.

## Recommended: guided Linux download

Use the uploaded **WebCaller-Docker-v0.20.0.tar.gz** from the [release](https://github.com/adlererik/WebCaller/releases/tag/v0.20.0), plus **SHA256SUMS.txt**. The small archive downloads matching images from GitHub Container Registry. It is not an offline image bundle.

In a new empty folder on your Linux server:

```sh
curl -fLO https://github.com/adlererik/WebCaller/releases/download/v0.20.0/WebCaller-Docker-v0.20.0.tar.gz
curl -fLO https://github.com/adlererik/WebCaller/releases/download/v0.20.0/SHA256SUMS.txt
sha256sum --ignore-missing -c SHA256SUMS.txt
```

Continue when the Docker archive reports **OK**:

```sh
tar -xzf WebCaller-Docker-v0.20.0.tar.gz
cd WebCaller-Docker-v0.20.0
./webcaller setup
```

The wizard covers your website, HTTPS access, call relay and optional extra ringing. It generates private credentials, checks ports and can start the stack. Then run `./webcaller doctor` and scan `./webcaller qr` with the first phone. Invite other people from that phone. Run `./webcaller` without arguments for a numbered menu.

Linux x86-64/ARM64 only: this launcher does not support Docker Desktop, Windows/macOS, remote Docker contexts or 32-bit ARM. Docker Engine itself is installed/updated through your distribution's supported instructions. Rootless Docker needs an external relay; the included TURN host-network recipe requires standard Engine networking. [Complete walkthrough, troubleshooting and recovery](../docker/README.md).

## Source/native download

The uploaded **WebCaller-v0.20.0.tar.gz** and **WebCaller-v0.20.0.zip** contain complete application source, browser WASM, the exact pinned upstream source and matching corresponding-source offer. They do not contain server credentials, configuration, conversations or phone identities.

Check the chosen archive against the release's **SHA256SUMS.txt**, extract it into an empty folder and follow [Native Debian installation](INSTALL_NATIVE.md). Rust is not needed to run the bundled browser crypto. Use the uploaded complete release assets; GitHub's automatic Source code ZIP/TAR omits submodules.

For a developer checkout:

```sh
git clone --recurse-submodules --branch v0.20.0 https://github.com/adlererik/WebCaller.git
cd WebCaller
npm ci --ignore-scripts
npm run setup
npm run prepare:source
```

These commands assume Node 24. `prepare:source` is for a Git checkout; skip it in an unchanged extracted release archive without `.git`, because that archive already includes the source offer. [Development and rebuilding](DEVELOPMENT.md).

## Updates without losing your setup

For a v0.20.0 Docker installation, use `./webcaller check-update` and `./webcaller update`. The assistant discovers actual stable Docker bundles, downloads first, makes a consistent private snapshot and preserves configuration. Failed startup triggers matching prior bundle/configuration/server-data recovery. Use `configure`, `backup` and `restore` for guided maintenance. Read the [full update/restore instructions](../docker/README.md#updates-and-recovery), including the older v0.18.0 launcher caveat.

Native installations use the [native update procedure](OPERATIONS.md#native-libsignal-updates), retaining their service, `.env`, data and existing networking. Installing or downloading a Docker release never converts a native installation.

Earlier **Olm v0.17.x or older** needs an explicit [backed-up migration](APPROVED_CUTOVER.md), not an ordinary update. Do not clear browser site data or regenerate secrets to fix a connection issue.

Server backups contain credentials and are not password-encrypted. Keep them on protected storage. They cannot recover private identities/history erased from phones. Updates/restores interrupt calls; a restore returns server state to the snapshot rather than preserving later changes.

## Check the first two phones

1. Enroll the first phone with the private QR; send an invitation to the second phone.
2. Exchange a text, a sticker and a photo. Reopen the chat to check retained media.
3. Call both ways, compare all four SAS words and try front/back cameras. Tap the chat name to compare the full fingerprint through a trusted channel.
4. Test one phone on Wi-Fi and one on cellular. A local health check or TURN allocation is not proof of complete media delivery.
5. Test locked-screen alerts, notification opening/answering and Wi-Fi/cellular recovery. Phone permissions and OS policy still apply.

Keep using the same browser/Home Screen icon. Refresh after an app update; do not clear site data. [All features](FEATURES.md) · [Security](SECURITY.md) · [Troubleshooting](OPERATIONS.md).
