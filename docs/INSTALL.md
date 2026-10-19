# Install the experimental libsignal version

Use a **separate website, directory and database** with disposable accounts. This is not a stable release or a migration tool. Keep any working WebCaller installation and phone storage intact. Public examples contain no maintainer deployment credentials or first-phone links.

```sh
git clone --recurse-submodules --branch codex/experimental-libsignal-pqxdh https://github.com/adlererik/WebCaller.git WebCaller-Experimental
cd WebCaller-Experimental
```

Stable release ZIPs/prebuilt images contain Olm, not this branch. GitHub's ordinary ZIP omits submodule contents; use the recursive clone for complete source. Bundled browser WASM is ready to use, so callers/server operators do not need Rust unless rebuilding it.

## What you need

- A Linux server. The native guide targets Debian 12/13 with SSH/sudo for prerequisites and an optional boot service.
- Node.js 24, Python 3 and Git. Browsers need native Web Crypto Ed25519 support; unsupported browsers fail explicitly rather than changing algorithms.
- A new HTTPS hostname under a domain you control, such as `calls-test.example.com`. Adding a subdomain does not itself register another domain. Provider charges depend on your provider.
- A reachable TURN relay for calls across difficult networks. A Cloudflare Tunnel carries the website/WebSockets, not TURN media. A suitable relay can be reused without sharing phone databases or owner/push keys.

**Follow [Native Debian installation](INSTALL_NATIVE.md)** for the complete route: separate directory, private Node runtime, `webcaller-experimental.service`, HTTPS, owner QR and phones. Do not use the stable service installer as an in-place upgrade.

## First phone and invitations

Generate the private QR after the website serves HTTPS. Scan it with the first Android phone's camera and keep using the same browser. The owner code fills automatically; choose a test name. Use **Invite someone** for the other phone.

On iPhone, follow the invitation's Home Screen instructions and use its new **WC Test** icon. Safari/Home Screen storage can differ. Keep any normal WebCaller icon/storage. If the first phone is an iPhone, save the test site to the Home Screen before enrollment and open the owner link/code there, or enroll a desktop first and invite the iPhone.

After setup, optional calling codes are available in Settings. A code is an address, not a password or proof of identity.

## Test and update

Send messages both ways, refresh and reopen chats. Call both ways, compare all four SAS words, and send a photo while talking. Try different networks, locked-screen alerts and Wi-Fi/mobile transitions. OS permissions still apply; urgency cannot force sound. [Optional ntfy](EXTRA_RINGING.md) is a separate alert channel, not conversation transport; never give recipients a publishing token/server password.

Stable Olm accounts cannot be imported. Earlier **libsignal test** P-256 accounts preserve their pins/history through certified Ed25519 signers. Refresh both test phones after updates; keep site data.

Back up source, configuration, database and dependency locks first. Server backups do not contain phone private keys. [Operations](OPERATIONS.md). [Container note](../docker/README.md): there is no published experimental prebuilt image/all-in-one release bundle here.
