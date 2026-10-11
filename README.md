# WebCaller

A browser-only phone for Android, iPhone and desktop: adaptive mono Opus voice, optional video, encrypted disappearing text, and simple invitations. No SIM, phone number or native app is required. iPhone background call alerts need this website saved to the Home Screen.

**Start here: [Beginner installation guide](docs/INSTALL.md).** Use a Debian 12/13 server, a domain name and the guided installer. Docker supplies Node.js 24; optional Caddy supplies HTTPS and optional coturn supplies your own free relay.

This is the **v0.8.0 preview**. It has passing automated and synthetic-browser tests, but has not been independently audited or certified on a physical Android/iPhone pair.

## What you get

- Voice calls in both directions at once, with mono Opus, requested echo cancellation, noise suppression, gain control, FEC and DTX.
- Voice-first adaptation: video steps down and pauses as loss, delay or bandwidth deteriorate. Data saver is the default when the network type is unknown.
- Optional video, microphone mute, front/back camera switch and upgrading an audio call to video. Codec preferences use shared encoding/decoding efficiency reports with compatible fallbacks. Timer and quality stay at the top while central details fade.
- Signal-style Gallery/File/Location sheet, recent chat media, map cards, emoji, camera capture, voice notes, typing dots and delete-for-both.
- Plain dark voice-call screen with top timer/quality and a five-button tray. Speaker/output switching where the browser exposes devices; phone-specific help elsewhere.
- Encrypted one-to-one text, images, video, voice notes and files (up to 10 MB each) with disappearing timers, including unread/offline expiry.
- One-person, single-use invitations; recipients choose an optional name and accept.
- Private QR onboarding for the first phone, so nobody has to type a long setup secret.
- Contact safety numbers, identity change detection, reconnection, relay diagnostics and guided call-alert setup with a locked-phone sound test and bounded reminders.
- Local SQLite ciphertext storage, authenticated WebSocket signaling and temporary TURN credentials.
- Files/media during calls, paced in small encrypted pieces that wait when voice needs the link.
- Separate live voice/video codec and data-rate indicators, cellular budgets for both endpoints and automatic Wi-Fi/cellular recovery. See [Call networking](docs/CALL_NETWORK.md).

## Know the limits before installing

Call invitations detect the phone and guide the recipient through enabling alerts. Android can receive browser push; iPhone/iPad requires a Home Screen web app. A locked-phone sound test helps check setup. Up to three spaced alerts request the phone’s normal notification sound; the repeating ringtone plays when the page is open. OS settings, suspension, push delivery and connection still prevent guaranteed closed-phone ringing. See [Call alerts](docs/CALL_ALERTS.md).

Audio cannot survive zero usable bandwidth or complete outages. Bitrate figures are codec payload ceilings; network overhead uses extra data. Browser support determines actual microphone processing, FEC, PLC and sender controls.

Disappearing messages are not a guarantee of zero forensic traces. Screenshots, recipient copies, browser/OS history, provider metadata and external backups may remain. The custom encryption is **not Signal Protocol or Double Ratchet**, has no forward secrecy against compromise of a recipient's long-term private key, and is unaudited. See [security and privacy](docs/SECURITY.md).

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
