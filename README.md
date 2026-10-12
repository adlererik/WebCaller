# WebCaller

A browser-only phone for Android, iPhone and desktop: adaptive mono Opus voice, optional video, encrypted disappearing text, and simple invitations. No SIM, phone number or native app is required. iPhone background call alerts need this website saved to the Home Screen.

**Start here: [Beginner installation guide](docs/INSTALL.md).** Use a Debian 12/13 server, a domain name and the guided installer. Docker supplies Node.js 24; optional Caddy supplies HTTPS and optional coturn supplies your own free relay.

This is the **v0.13.0 preview**. It has passing automated and synthetic-browser tests, but has not been independently audited or certified on a physical Android/iPhone pair.

## What you get

- Voice calls in both directions at once, with mono Opus, requested echo cancellation, noise suppression, gain control, FEC and DTX.
- Voice-first adaptation: video steps down and pauses as loss, delay or bandwidth deteriorate. Data saver is the default when the network type is unknown.
- Optional video, microphone mute, front/back camera switch and upgrading an audio call to video. Codec preferences use shared encoding/decoding efficiency reports with compatible fallbacks. Timer and quality stay at the top while central details fade.
- Signal-style Gallery/File/Location sheet, recent chat media, map cards, emoji, camera capture, voice notes, typing dots and delete-for-both.
- Plain dark voice-call screen with top timer/quality and a five-button tray. Speaker/output switching where the browser exposes devices; phone-specific help elsewhere.
- Encrypted one-to-one text, images, video, voice notes and files (up to 10 MB each) with per-message countdowns and disappearing timers, including unread/offline expiry.
- One-person, single-use invitations; recipients choose an optional name and accept.
- Press-and-hold contact removal with confirmation, shared history/media deletion, active-call cleanup and protection against delayed uploads.
- Private QR onboarding for the first phone, so nobody has to type a long setup secret.
- Contact safety numbers, identity change detection, reconnection, relay diagnostics and guided call-alert setup with a locked-phone sound test, bounded high-urgency reminders and Answer/Decline notification actions where supported.
- Local SQLite ciphertext storage, authenticated WebSocket signaling and temporary TURN credentials.
- Files/media during calls with encrypted spinner/percentage placeholders on both phones; both video encoders temporarily yield bandwidth, with small encrypted transfers that wait when voice needs the link.
- Aligned video/voice codec and rate rows, transparent video controls, cellular budgets for both endpoints and automatic Wi-Fi/cellular recovery. See [Call networking](docs/CALL_NETWORK.md).

## Know the limits before installing

Call invitations detect the phone and guide the recipient through enabling alerts. Android can receive browser push; iPhone/iPad requires a Home Screen web app. Neutral New message notices open the intended conversation without putting routing IDs into the URL. A locked-phone sound test helps check setup. Up to three spaced alerts request the phone’s normal notification sound; the repeating ringtone plays when the page is open. OS settings, suspension, push delivery and connection still prevent guaranteed closed-phone ringing. See [Call alerts](docs/CALL_ALERTS.md).

Audio cannot survive zero usable bandwidth or complete outages. Bitrate figures are codec payload ceilings; network overhead uses extra data. Browser support determines actual microphone processing, FEC, PLC and sender controls. A normal website cannot erase global or synced browser history or hide its service-worker/storage usage; see [Browser privacy](docs/BROWSER_PRIVACY.md).

Disappearing messages cannot guarantee zero forensic traces: recipient copies, browser/OS records, provider metadata and backups may remain. New transport uses the Olm Double Ratchet; retained readable history is separately encrypted on the device. Historical v1 messages retain their old security limitations. The application and its integration remain unaudited. See [security and privacy](docs/SECURITY.md).

## Install

Download and extract the [latest release](https://github.com/adlererik/WebCaller/releases). On your Debian server, enter the extracted folder and run:

```sh
sudo bash deploy/install-debian.sh
```

The installer asks for your domain, HTTPS method and relay choice. Set your DNS and router/firewall first using the [beginner guide](docs/INSTALL.md). Your server's `.env` contains new private secrets; none are supplied by this repository. Existing secrets are preserved on setup.

For local development with Node 24:

```sh
npm ci
npm run setup
# Edit PUBLIC_URL in .env to http://localhost:8080/calls for local testing.
npm start
```

Open `http://localhost:8080/calls`. Loopback HTTP is suitable for local tests; phones require the real HTTPS site.

## Documentation

| Guide | What it explains |
|---|---|
| [Install](docs/INSTALL.md) | Plain-language Debian setup, domain, first phone QR and first call |
| [Using WebCaller](docs/USER_GUIDE.md) | Every button, invitations, calls, messages and settings |
| [Features](docs/FEATURES.md) | Audio/video adaptation, Opus and notification behavior |
| [Networking](docs/NETWORKING.md) | TURN, public IP, CGNAT, router ports, Cloudflare Tunnel and TLS |
| [Configuration](docs/CONFIGURATION.md) | Every environment setting and generated secret |
| [Security](docs/SECURITY.md) | Encryption, expiry, trace limits and safe publishing |
| [Architecture](docs/ARCHITECTURE.md) | Components, APIs, message formats and source files |
| [Operations](docs/OPERATIONS.md) | Updates, backups, restart, logs, migration and removal |
| [Development](docs/DEVELOPMENT.md) | Tests, contributors and release packaging |
| [Verification](docs/VERIFICATION.md) | What passed and what remains unverified |

## Release and license

[Release notes](CHANGELOG.md) describe the initial preview. Code is available under the [MIT license](LICENSE). Dependency notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Please report vulnerabilities privately using [SECURITY.md](SECURITY.md).


New in v0.7.0: Signal-style blue sent bubbles, overlapping green delivery/viewed checks, compact measured kbps/Mbps and actual voice/video codec indicators at the top of calls, and encrypted local media retention across chat closure/backgrounding/reload. The existing message menu includes reactions, Reply, sender-only Edit, Forward, Copy, Select, Info, Pin and Delete for both. See the [user guide](docs/USER_GUIDE.md) for plain-language instructions and storage/browser limitations.

## v0.12.0 call header and background alerts

Voice/video rates now share aligned numeric and kbps/Mbps columns. Quality stays centered in the caller-name row, with the timer to the right. Live call reminders request sound independently of a sleeping page, use `renotify` or fresh reminder tags where it is unsupported, and cannot be blocked indefinitely by a device-storage/server lookup. Answered/ended and originally expired calls remain silent. Reload the receiving phone once, then use **Settings → Call alerts → Send test alert** with the phone locked. Actual notification sound remains controlled by the phone. See [Call alerts](docs/CALL_ALERTS.md).

## v0.13.0 security upgrade

New chat, media manifests and call signaling use the Olm Double Ratchet. Contact/history removal keeps a separate verification fingerprint, preventing a server roster change from silently resetting trust. Reopen the page on both phones once after upgrading; accounts, invitations and authorized old history are preserved. Keep browser site storage intact: the server cannot reconstruct discarded transport keys or your local readable history. Key claims/publication yield to call signaling, files have separate one-use sessions, and per-call streams isolate new calls from old typing/progress traffic. See [Security and upgrade details](docs/SECURITY.md).
