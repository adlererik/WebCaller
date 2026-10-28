# Install WebCaller v0.19.0

**v0.19.0 is a source/native release.** It includes stickers and the latest sending/timer fixes. No new prebuilt Docker image or Docker bundle is published. The previous [v0.18.0 Docker release](https://github.com/adlererik/WebCaller/releases/tag/v0.18.0) remains available, with its own matching guide and images.

Phone users open your website; they do not install a WebCaller phone app. iPhone background browser alerts require adding the website to the Home Screen. Optional ntfy alerts require the separate ntfy client. The source server can run natively or be built into a container by an operator; neither requires a new prebuilt Docker release.

## Before you start

You need a server, an HTTPS hostname under your control and a reachable TURN relay for calls across difficult networks. Debian 12/13 is the documented native target. A home server behind CGNAT can host the website through a Tunnel but normally needs a public TURN relay elsewhere. A Tunnel does not relay WebRTC media.

The native guide uses Node 24, Python 3 and Git. Browser crypto/WASM is bundled, so you do not need Rust or a paid sticker API. Use a current phone browser supporting Web Crypto Ed25519. The ready-made sticker artwork is served by your installation, with no sticker-provider login or bot token.

For a fresh installation, use a separate directory and hostname if another app already exists. A different path on the same hostname does not isolate browser keys. If upgrading an existing libsignal v0.18.0 installation, use the normal [backed-up source update](OPERATIONS.md#native-libsignal-updates), preserve its configuration and reload both phones once. No account/history reset is needed. v0.17.1 and older use Olm and need the separate [migration procedure](APPROVED_CUTOVER.md).

## Recommended: native Debian, no Docker

Follow [Native installation](INSTALL_NATIVE.md) from start to finish. It covers prerequisites, an isolated Node runtime, the source, private configuration, a boot service, HTTPS and the private first-phone QR. It avoids changing system Node or another website. For TURN use an existing REST relay or the native coturn instructions in [Networking](NETWORKING.md). Optional ntfy has its own [native installer](EXTRA_RINGING.md).

Choose one way to get the source:

- **Uploaded release archive:** download **WebCaller-v0.19.0.tar.gz** or **WebCaller-v0.19.0.zip** from the [release](https://github.com/adlererik/WebCaller/releases/tag/v0.19.0), together with **SHA256SUMS.txt**. These include the exact upstream source and a matching corresponding-source download. Extract into a new empty directory. They contain no private configuration, so setup generates your own secrets.
- **Git checkout:** recursively clone the tagged release. GitHub's automatic **Source code** ZIP/TAR downloads omit the upstream submodule; use the uploaded assets above or this command:

```sh
git clone --recurse-submodules --branch v0.19.0 https://github.com/adlererik/WebCaller.git WebCaller
cd WebCaller
```

For an uploaded TAR archive on Linux, run these in a new download folder after installing `curl` as shown in the native guide:

```sh
curl -fLO https://github.com/adlererik/WebCaller/releases/download/v0.19.0/WebCaller-v0.19.0.tar.gz
curl -fLO https://github.com/adlererik/WebCaller/releases/download/v0.19.0/SHA256SUMS.txt
sha256sum --ignore-missing -c SHA256SUMS.txt
tar -xzf WebCaller-v0.19.0.tar.gz
cd WebCaller-v0.19.0
```

Continue only after the checksum says **OK**. Use this extracted folder as the project folder, or use the native guide's `/opt/webcaller` location consistently. Do not mix commands between two different copies.

On a system where Node 24 is already installed, the application steps are:

```sh
npm ci --ignore-scripts
npm run setup
```

For a **Git checkout**, also run `npm run prepare:source`. The uploaded release archive already contains `public/preview-source.tar.gz`; do not run that Git-based packaging command in an extracted archive without `.git` metadata. Preserve the supplied source offer/licenses. [Licensing](../LICENSING.md).

Edit `.env` for your own HTTPS hostname, listening address/port and relay. Keep `WEBCALLER_CRYPTO_ENGINE=libsignal-pqxdh-v1` and the generated owner/VAPID secrets. Run `npm start` for an initial foreground check, then follow the native guide for your boot service, HTTPS and first-phone setup. The overview commands alone do not configure a public certificate, proxy, firewall or TURN server for you.

## Optional alternatives

For the **previous prebuilt v0.18.0 Docker stack**, use [its matching guide](../docker/README.md) and `WebCaller-Docker-v0.18.0.tar.gz` from that release. Its launcher pulls the published digest-pinned images; it does not include v0.19.0 stickers/fixes. Do not ask its updater for a v0.19.0 bundle that does not exist.

Operators who want the current source in a container can review the root source-build Compose recipe and run `docker compose up -d --build`. This builds locally; it does not pull a v0.19.0 prebuilt image or require changing a working native installation. Do not start native and container listeners on the same port. Networking/HTTPS requirements still apply.

## Set up the first phone

Generate the private setup QR using the native guide. Scan it with the first phone's camera; the long owner code fills automatically. Choose a display name. Keep this QR private: it grants first-phone setup access.

Then choose **Invite someone**. Send that invitation through a channel you trust; the invitee accepts and chooses a name. They do not need SSH, a server password, owner code or publishing token. Alternatively choose your own calling code in Settings and let someone dial it. Codes are addresses, not secrets or proof of identity.

On **iPhone**, follow Add to Home Screen and use that icon for calls/alerts. Safari and Home Screen profiles can differ, including when ntfy opens a link. If an alert says to open your usual phone, use the existing Home Screen icon rather than creating another identity. If the first phone is an iPhone, add the site before enrollment and open the owner setup there, or enroll a desktop first and invite it.

On **Android**, accept in the browser you intend to keep using and allow microphone/camera and notifications when requested. In Settings, send the alert test, lock the screen, tap the notice and confirm only if you actually heard it. Optional ntfy has its own guided test. No push urgency bypasses OS restrictions.

## Check it before relying on it

1. Send a message each way, refresh and confirm contacts/history remain.
2. Tap the folded-corner sticker icon, choose a pack and tap a sticker. Try Favorites and both Cutouts/All views.
3. Call both ways and compare all four SAS words. Tap the chat name/header to compare the full safety fingerprint through a trusted channel.
4. Send a photo during the call and confirm speech stays clear.
5. Test on different networks, including TURN allocation and actual media delivery.
6. Test locked-screen sound, notification opening/answering, front/back cameras and audio output on each phone.
7. Walk from Wi-Fi to cellular and back during a call; confirm recovery without redialing. A short radio gap remains possible.

Keep browser site data: it contains the identity, keys and saved conversations. Reloading after an update is different from clearing that data. [User guide](USER_GUIDE.md) · [Troubleshooting](OPERATIONS.md) · [Security](SECURITY.md).
