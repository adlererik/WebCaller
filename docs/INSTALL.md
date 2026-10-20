# Install WebCaller v0.18.0

Choose one method below. They run the same libsignal/PQXDH application. You do not need to install a native phone app to use calls/chat; iPhone background browser alerts require adding the website to the Home Screen. Optional ntfy alerts require the separate ntfy client.

## Before you start

You need a Linux server (Debian 12/13 is the documented native target), a domain/HTTPS hostname you control, and either a publicly reachable TURN relay or the ability to create one. A home server behind CGNAT can host the website through a Tunnel but normally needs a public relay elsewhere. The complete Docker stack supports Linux amd64 and arm64. Node 24, Python 3 and Git are needed for source/native setup; phone users need a current browser supporting Web Crypto Ed25519. Bundled WASM means Rust is not needed for installation.

Use a fresh directory and hostname if another installation exists. A different path on the same hostname does not isolate browser keys. This release changes the transport from Olm to libsignal: do not overwrite an old database or point a new image at old volumes without the [migration procedure](APPROVED_CUTOVER.md). Backups and phone site data matter.

## Option A: easiest complete stack — prebuilt Docker

Download **WebCaller-Docker-v0.18.0.tar.gz** from the [release](https://github.com/adlererik/WebCaller/releases/tag/v0.18.0), not GitHub's automatic Source code ZIP. It contains a small launcher/Compose bundle; the actual matching images are pulled from GHCR. The bundle pins their digests.

Follow [the Docker guide](../docker/README.md): install Docker/Compose using their official instructions, extract into an empty folder, run `./webcaller setup`, `./webcaller start`, then `./webcaller qr`. The wizard asks about HTTPS, your relay/public IP, optional ntfy and an existing proxy or Tunnel. It generates credentials privately. It cannot obtain a domain or fix CGNAT/router forwarding for you.

## Option B: native Debian, no Docker

Follow [Native installation](INSTALL_NATIVE.md) from start to finish. It includes prerequisites, a private Node runtime, source, private configuration, a boot service, HTTPS and the first-phone QR. This avoids altering system Node or another website. For TURN use an existing REST relay or the native coturn instructions in [Networking](NETWORKING.md). Optional ntfy has its own [native installer](EXTRA_RINGING.md).

## Option C: source or locally built containers

For a Git checkout:

```sh
git clone --recurse-submodules --branch v0.18.0 https://github.com/adlererik/WebCaller.git WebCaller
cd WebCaller
npm ci --ignore-scripts
npm run setup
npm run prepare:source
```

Edit `.env` for your own hostname/HTTPS port/relay. Keep `WEBCALLER_CRYPTO_ENGINE=libsignal-pqxdh-v1` and the generated owner/VAPID secrets. Use `npm start` for a native foreground process, or `docker compose up -d --build` for the root source-build recipe after reviewing its optional HTTPS/TURN profiles. Do not start native and Docker listeners on the same port. The detailed native/Networking guides explain the public proxy and firewall steps.

The uploaded `WebCaller-v0.18.0.tar.gz`/`.zip` release assets include full pinned upstream source and the generated corresponding-source download. GitHub's **automatic** Source code archives do not expand submodules; use the uploaded assets or recursive clone. Keep the source offer/licenses with hosted builds. [Licensing](../LICENSING.md).

## Set up the first phone

Generate the private setup QR using the selected guide. Scan it with the first phone's camera; the long owner code fills automatically. Choose a display name. Keep this QR private: it grants the first-phone setup capability.

Then choose **Invite someone**. Send that invitation through a channel you trust; the invitee accepts and chooses a name. They do not need SSH, a server password, owner code or publishing token. Alternatively choose your own calling code in Settings and let someone dial it. Codes are addresses, not secrets or proof of identity.

On **iPhone**, follow Add to Home Screen and use that icon for calls/alerts. Safari and Home Screen profiles can differ, including when ntfy opens a link. If a notification says to open your usual phone, use the existing Home Screen icon rather than creating another identity. If the first phone is an iPhone, add the site before enrollment and open the owner setup there, or enroll a desktop first and invite it.

On **Android**, accept in the browser you intend to keep using and allow microphone/camera and notifications when requested. In Settings, send the alert test, lock the screen, tap the notice and confirm only if you actually heard it. Optional ntfy has its own guided test. No push urgency bypasses OS restrictions.

## Check it before relying on it

1. Send a message each way, refresh and confirm contacts/history remain.
2. Call both ways and compare all four SAS words. Tap the chat name/header to compare the full safety fingerprint through a trusted channel.
3. Send a photo during the call and confirm speech stays clear.
4. Test on different networks, including TURN allocation and actual media delivery.
5. Test locked-screen sound, notification opening/answering, front/back cameras and audio output on each phone.
6. Walk from Wi-Fi to cellular and back during a call; confirm recovery without redialing. A short radio gap remains possible.

Do not clear browser site data to fix a connection problem. It contains the identity, keys and saved conversations. [User guide](USER_GUIDE.md) · [Troubleshooting](OPERATIONS.md) · [Security](SECURITY.md).
