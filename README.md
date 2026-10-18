# WebCaller

A **Signal-like WebRTC phone** that runs in the browser on Android, iPhone and desktop: adaptive Opus voice, optional video, encrypted disappearing text, and simple invitations. No SIM, phone number or native app is required. iPhone background call alerts need this website saved to the Home Screen. WebCaller is an independent project; “Signal-like” describes its interface and conversation workflow.

**Start here: [Beginner installation guide](docs/INSTALL.md).** Use a Debian 12/13 server, a domain name and the guided installer. Docker supplies Node.js 24; optional Caddy supplies HTTPS and optional coturn supplies your own free relay.

This is the **v0.15.1 preview**. It has passing automated and synthetic-browser tests, but has not been independently audited or certified on a physical Android/iPhone pair.

## Why I made these choices

I’m keeping **Olm Double Ratchet** for now. My priority is practical calls on weak connections and forward secrecy for message transport against classical computers. For this project, I don’t currently consider the extra bandwidth, state and browser-porting/migration work of Signal’s new post-quantum **Triple Ratchet** worth the additional protection against a future cryptographically relevant quantum computer, sometimes called **Q-Day**. That is my threat-model choice, not a benchmark showing that Signal’s design is inefficient: its SPQR deliberately spreads the overhead across messages. WebCaller does not claim post-quantum security, and traffic recorded today may become readable later. Forward secrecy here concerns discarded transport keys; retained history and live WebRTC media have the separate limits described below. [Signal’s Triple Ratchet design](https://signal.org/blog/spqr/).

I chose a visible, four-word **Short Authentication String (SAS)** for each call and invitation-based setup without requiring identifiable registration information such as a phone number. Fresh contributions generate the words for every call; the words appear over the video as a local interface overlay and are never added to the transmitted camera image. Read all four words to each other to check the current connection. The call still works if you skip this, but skipping gives no human SAS verification. Fresh words can statistically repeat; global uniqueness is not promised. Existing identity pins remain part of the protection. [How to use the words](docs/CALL_VERIFICATION.md).

I’m not adding an Automatic Key Verification/key-transparency directory at this stage. Signal’s current Automatic Key Verification is available when it knows your contact’s phone number. **Key transparency itself does not inherently require phone numbers**; it can use other identifiers, and SAS does not provide its global directory-consistency checks. My preference for this project is phone-number-free invitations and a simple human check during the call. [Signal’s availability rules](https://support.signal.org/hc/en-us/articles/10223569377562-Automatic-Key-Verification), [key-transparency explanation](https://signal.org/blog/automatic-key-verification/).

For a serious nation-state threat, I would worry more about the phone being compromised than someone breaking well-designed encryption. Pegasus and zero-click exploit chains are documented examples of endpoint attacks: compromising a phone can expose plaintext or microphones without breaking the communication cipher. Signal’s engineering deserves respect, but even excellent encryption cannot make a compromised phone safe. My guiding principle is: **don’t assume anything on a phone is safe just because an app encrypts it.** This is a threat-model warning, not a claim that every phone is easily exploitable; device, patch level and attacker capability matter. [Citizen Lab’s documented Pegasus exploit](https://citizenlab.ca/blastpass-nso-group-iphone-zero-click-zero-day-exploit-captured-in-the-wild/).

**Stay tuned… I’m working on an embedded device for encrypted calls, much like a Trezor hardware wallet—but for calls ;)** It’s a separate project still in development.

## Security: what is protected

**Messages, attachments and one-to-one calls are end-to-end encrypted when both browsers run trusted WebCaller code and the intended contact keys are authenticated.** The server stores message/file ciphertext rather than plaintext or their decryption keys. A Wi-Fi observer, ISP or TURN relay cannot normally read that content. The website operator still controls the JavaScript delivered to the phones; this is the most important limitation of a browser-only messenger.

New messages, edits, receipts, file-key manifests and call signaling use the **Olm Double Ratchet**. Signed one-time prekeys establish sessions, message keys advance and consumed keys are discarded. Contact identity pins survive deleting a contact/history, so a server roster reset cannot silently authorize replacement keys for the same contact ID. Signed encrypted signaling binds the call's accepted media fingerprints. Four optional per-call security words let you compare that connection aloud. These are useful protections, not an independent audit or a guarantee against every attack. See the [source review and its limits](docs/SECURITY_REVIEW.md).

### Encryption inventory

| Component | Algorithms actually used | Meaning and limits |
|---|---|---|
| New message/signaling transport | Olm Double Ratchet; **Curve25519/X25519**, **AES-256-CBC**, **HMAC-SHA-256**, **HKDF-SHA-256** | Vodozemac 0.9.0 through a locally bundled binding. Olm SessionConfig V2 requires a full 32-byte MAC. This is not Signal's wire protocol. |
| Signed identity/prekey/envelope authentication | **ECDSA P-256 with SHA-256** | Signs published Olm identities/prekeys and complete envelope routing/expiry/ciphertext. Pins detect changes; signatures alone do not establish who a new contact is. |
| Files, images, video and voice-note attachments | Fresh per-file **AES-256-GCM**, 128-bit authentication tags | Indexed 96-bit nonces and authenticated chunk context; the file key/name/type travel inside a ratcheted manifest. |
| Browser account/session/history records | Separate non-exportable **AES-256-GCM** wrapping key | Stored in the same browser origin. Protects record ciphertext, not an attacker able to use that origin/profile and its key. |
| Live voice/video | **WebRTC DTLS-SRTP** | The browser negotiates the DTLS/SRTP cipher suite. Do not assume AES-256 or a Double Ratchet for individual media frames. TURN relays encrypted media. |
| Four-word call SAS | Fresh ephemeral **X25519**, **SHA-256** commitment, **HKDF-SHA-256 / HMAC-SHA-256** | Binds call ID, roles, identity fingerprints, accepted DTLS fingerprints and fresh contributions. Four 2048-word indices encode a **44-bit comparison**, not a 256-bit password. |
| Authorized historical v1 messages | Ephemeral **ECDH P-256**, **HKDF-SHA-256**, **AES-256-GCM**, **ECDSA P-256** | Only exact pre-upgrade envelopes remain readable. Recipient static-key compromise can expose this old traffic; upgrading cannot add forward secrecy retroactively. |

X25519 and P-256 provide roughly **128-bit classical security**; a 256-bit AES key does not make the whole protocol 256-bit secure. WebCaller does not implement ChaCha20-Poly1305 for its message/file format, PQXDH, ML-KEM, a post-quantum ratchet, key transparency or Sealed Sender. HTTPS/WSS, temporary TURN authentication and Web Push are additional delivery mechanisms, not substitutes for content encryption. [Detailed inventory](docs/SECURITY.md#encryption).

### WebCaller beside Signal

Comparison reviewed **13 October 2026**. Features depend on client/session version; Signal's modern design includes more than the original Double Ratchet.

| Security property | WebCaller | Signal |
|---|---|---|
| End-to-end content protection | Olm v2 messages/manifests/signaling; AES-GCM attachments; DTLS-SRTP calls, subject to trusted clients and verified contact keys. | End-to-end messages and calls using Signal's supported clients/protocol. [Calling](https://support.signal.org/hc/en-us/articles/360007060492-Voice-or-Video-Calling). |
| Session agreement and ratcheting | Classical X25519 one-time-prekey Olm and Double Ratchet; no post-quantum agreement/ratchet. | PQXDH plus classical Double Ratchet and SPQR combined as the **Triple Ratchet** for supporting sessions. [Specifications](https://signal.org/docs/), [SPQR](https://signal.org/blog/spqr/). |
| Message ciphers | AES-256-CBC + full-length HMAC-SHA-256; HKDF-SHA-256. | AES-256-CBC + HMAC-SHA-256 and HKDF-SHA-256 in the reviewed one-to-one libsignal implementation, with hybrid ratchet-derived message keys. Different call/attachment formats have their own ciphers. [Encryption source](https://github.com/signalapp/libsignal/blob/4beb029d8a941f81e7d9c6d8af1ed25a677569a8/rust/protocol/src/triple_ratchet.rs), [MAC source](https://github.com/signalapp/libsignal/blob/4beb029d8a941f81e7d9c6d8af1ed25a677569a8/rust/protocol/src/protocol.rs). |
| Forward secrecy | Discarded v2 transport keys protect past traffic from later ratchet-state exposure. Retained local history/file keys and old v1 traffic are separate exposures. | Ratcheting protects discarded transport secrets, including hybrid protection in supporting sessions. Retained endpoint history still needs protection. [Ratchet specification](https://signal.org/docs/specifications/doubleratchet/). |
| Recovery after a temporary compromise | Requires loss of attacker access and fresh uncompromised DH exchanges **in the affected stream**. One-way traffic alone does not heal a compromised chain. | Classical and post-quantum recovery mechanisms in supporting modern sessions; recovery still requires fresh exchanges and the attacker losing access. [SPQR](https://signal.org/blog/spqr/). |
| MITM / new-contact authentication | Invitation fingerprint for the inviter, safety-number comparison, persistent P-256 and Olm pins, optional per-call SAS. No human comparison means no additional human assurance. | Safety numbers and change detection; **automatic key verification through key transparency**, where available. [Safety numbers](https://support.signal.org/hc/en-us/articles/360007060632-What-is-a-safety-number-and-why-do-I-see-that-it-changed), [automatic verification](https://support.signal.org/hc/en-us/articles/10223569377562-Automatic-Key-Verification). |
| Client delivery trust | Fresh website code is controlled by the origin/TLS/CDN/operator. Malicious code can use non-exportable keys and read plaintext. `/calls` is not isolated from other same-origin code. | Installed clients separate routine messaging-server responses from executable application updates. Device/software updates remain part of the trust model. This is an architectural comparison, not immunity to compromise. |
| Metadata / deniability | Server sees the contact graph, participant IDs, times, sizes and public keys. Public envelope signatures provide transferable ciphertext authentication, reducing deniability. | Sealed Sender reduces sender exposure to the delivery service; the one-to-one ratchet uses symmetric message authentication. Neither guarantees anonymity or removes network metadata. [Sealed Sender](https://signal.org/blog/sealed-sender/), [ratchet design](https://signal.org/docs/specifications/doubleratchet/). |
| Assurance | Open source, established cryptographic core, regression tests and this source review. Custom integration/SAS has **no independent audit or formal security proof**. | Published specifications, maintained production implementations and substantially more external scrutiny and operational experience. That does not imply bug-free software. [Signal specifications](https://signal.org/docs/). |
| Operator control / setup | Self-hosted, no SIM or phone-number registration; easy web invitations. Operator control adds responsibility for secure hosting and updates. | Maintained service and installed apps; different registration and operational tradeoffs. Self-hosting is not itself stronger cryptography. |

For security-sensitive conversations, **Signal offers the stronger overall assurance**. WebCaller provides useful classical end-to-end encryption but should not be advertised as Signal-equivalent, post-quantum secure, forensic-proof or interception-proof.

### How to use the four call words

1. Start a voice/video call and wait for four words. In video calls, the name is at the upper left and the words are centered in that same row; codecs/rates and quality sit underneath.
2. Read **all four words in order**, and have the other person compare every word to their display. Repeat/spell an unclear word. They are a public check, not a secret password or recovery phrase.
3. If they differ, end the call and verify the contact through a trusted route. If they are unavailable or you skip comparing, the call still works, but you did not gain SAS assurance.

Under trusted clients and an accurate comparison, matching words provide probabilistic protection against a MITM on **that call's authenticated connection**. The nominal 44-bit false-match probability is about 1 in 17.6 trillion per independent attempt; that is not an audited bound for this entire application, and mistakes or compromised code defeat the check. Fresh call contributions are generated each time, although sequences can statistically repeat. The words do not authenticate every earlier/offline message. They are never painted into outgoing video, saved as history or used to gate a child's call, and are cleared on hang-up/page exit. [Protocol and limitations](docs/CALL_VERIFICATION.md).

### The strongest protections and the main weaknesses

**Strong points:** ciphertext-only server content storage; signed and pinned key exchanges; full-tag Olm ratcheting; authenticated encrypted call signaling; media-bound fresh SAS; authenticated AES-GCM attachment chunks; authorization, replay/deletion barriers and expiry checks; atomic cross-tab crypto state. You control hosting and do not need phone-number registration.

**Weak points:** server-controlled browser code and the shared origin; first-contact trust without key transparency; optional checks that people may skip; classical-only key agreement; readable retained browser history with its key in the same profile; metadata; legacy history without modern forward secrecy; no independent integration audit. Continued device/origin compromise defeats ratchet recovery. Disappearing messages cannot erase screenshots, backups, notification/browser records or recipients' saved copies.

Deleting a contact keeps a minimal verification record to resist identity replacement. Clearing all site storage removes that protection and the local keys/history. Reopen both phones once after upgrading, and preserve browser storage for continuity. Full details: [security model](docs/SECURITY.md), [review findings](docs/SECURITY_REVIEW.md), [browser privacy](docs/BROWSER_PRIVACY.md).

## What you get

- Voice calls in both directions at once, with Opus, requested echo cancellation, noise suppression, gain control, FEC and DTX.
- Voice-first adaptation: video steps down and pauses as loss, delay or bandwidth deteriorate. Data saver is the default when the network type is unknown.
- Optional four-word call comparison centered in the video header beside the caller name, bound to fresh per-call keys and the accepted media fingerprints. Calls work without confirmation. See [Call verification](docs/CALL_VERIFICATION.md).
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

## Audio and video quality

WebCaller aims for clear, natural-sounding conversation and a detailed, smooth picture while using the bandwidth and processing power the two devices can afford. **Audio always gets priority.** Codec choice, capture resolution, frame rate and sender bitrate are adjusted automatically; users do not need to choose a codec.

### Video codecs and preference order

The app can negotiate these codecs **when both browsers expose compatible WebRTC support**. Among variants that both ends report as supported, smooth and power-efficient for **both encoding and decoding**, its preference is:

| Preference | Video codec | Quality and practical role |
|---|---|---|
| 1 | **AV1** | Modern compression designed to preserve high-quality detail with efficient use of data. First preference when both phones have an efficient send/receive path. |
| 2 | **H.265 / HEVC** | High-efficiency compression for a detailed picture within a limited bitrate, using compatible profiles exposed by both browsers. Often useful on phones with efficient HEVC implementations. |
| 3 | **VP9** | A strong quality/compression option, generally more efficient than VP8, when both browsers can encode and decode it efficiently. |
| 4 | **H.264 / AVC** | High-quality video with broad interoperability and commonly available hardware paths. A practical preferred fallback when efficiency reports for newer codecs are unavailable or inconclusive. |
| 5 | **VP8** | A widely supported WebRTC fallback that can still produce a good picture with sufficient bitrate. Useful when other compatible efficient paths are unavailable. |

This is the app’s **conditional compression/efficiency preference**, rather than a universal ranking of visible quality. All five can produce high-quality video; encoder implementation, codec profile, bitrate, resolution, lighting, motion and packet loss affect the result. A phone reporting efficient H.264 and inefficient AV1 will favor H.264. The actual mutually negotiated codec is displayed during the call. [AV1 design](https://aomedia.org/specifications/av1/), [HEVC standard](https://www.itu.int/rec/T-REC-H.265), [VP9 overview](https://www.webmproject.org/vp9/), [WebRTC video interoperability requirements](https://www.rfc-editor.org/info/rfc7742/).

### How the app tries to use device hardware

The browser supplies the encoders and decoders, including hardware-accelerated paths it makes available. WebCaller first reads its WebRTC codec capabilities, then queries **Media Capabilities encoding and decoding efficiency** for each exposed codec/profile at the normal Wi-Fi target. Both phones exchange these results inside encrypted call signaling. A codec gets the strongest preference only when both ends report efficient encoding **and** decoding; having an AV1 hardware decoder alone does not establish an efficient AV1 encoder.

Hardware acceleration can reduce CPU load, heat and battery use. The browser controls whether it is actually used: `powerEfficient` is an estimate, not proof that every stage runs in hardware, and WebCaller cannot force access to a chip’s unexposed codec. Missing, rejected or timed-out probes preserve compatible fallbacks, favoring H.264 then VP8 before other unconfirmed choices. During sustained CPU pressure the app lowers capture load and can renegotiate a mutually efficient alternative. [Media Capabilities](https://www.w3.org/TR/media-capabilities/), [WebRTC codec controls](https://www.w3.org/TR/webrtc/).

### Audio codecs and sound quality

**Opus is the preferred live-call codec.** It is designed for low-delay, high-quality speech and adapts efficiently to different bitrates. The app requests 48 kHz microphone input and allows up to 48 kbps of voice payload on healthy, confirmed Wi-Fi. Cellular/data-saver and weaker profiles reduce that budget to preserve conversation. Echo cancellation, noise suppression, automatic gain control, in-band forward error correction and discontinuous transmission are requested; packet-loss concealment, jitter buffering and the actual codec modes are managed by the browser. Both people can speak at once. [Opus](https://opus-codec.org/), [Opus RTP specification](https://www.rfc-editor.org/rfc/rfc7587.html).

| Audio use | Available codec/format and selection |
|---|---|
| **Live voice and video calls** | **Opus**, explicitly preferred when the browser exposes codec-preference controls. The browser negotiates its defaults when those controls are unavailable; the call header shows what is actually active. |
| **Recorded voice messages** | Browser-supported **MP4/M4A** recording, commonly AAC, is checked first for playback compatibility, followed by **WebM/Opus** and **Ogg/Opus**, then a supported WebM/default recording path. Recording requests 32 kbps. The browser chooses the actual MP4 codec. |

There is no separate live-call audio quality ladder: the app prefers Opus and adapts its budget. Voice-note format preference is about compatibility, not a claim that AAC always sounds better than Opus. Actual sound also depends on the microphone, browser processing and the connection.

### How quality follows bandwidth

These are the current **per-sender payload ceilings and capture targets**; available capacity can reduce them further:

| Connection profile | Opus voice ceiling | Video ceiling | Video capture target |
|---|---:|---:|---|
| Both ends on healthy, confirmed Wi-Fi | 48 kbps | 900 kbps | 960×540, 24 fps |
| Either end on cellular, data saver or an unknown network | 20 kbps | 120 kbps | 320×180, 12 fps |
| Weak connection | 12 kbps | 45 kbps | 240×135, 6 fps |
| Very weak connection | 8 kbps | Paused | Voice continues if the link permits |

The app samples available outgoing capacity, audio loss, round-trip delay and jitter each second. It reserves capacity for voice and transport headroom before allocating video. The browser’s congestion control and the app’s bitrate/resolution/frame-rate budgets work together. Weak links reduce the picture first; severe congestion pauses outgoing video and file transfers. Healthy recovery waits for five good samples before restoring quality to avoid rapid oscillation.

Most bandwidth changes are handled **within the current codec**. A Wi-Fi/cellular transition adjusts the budgets and uses ICE recovery when needed, while keeping the call session where recovery succeeds. During file/media sharing, both video senders temporarily yield bandwidth while retaining the current voice budget. The app also reduces video load under CPU pressure. Complete outages and physical radio handovers can still interrupt sound; no codec can deliver speech without a usable path.

At the top of the call, separate video/voice rows show the actual codec and measured **send plus receive** payload rate in kbps/Mbps. Those readings and the ceilings above exclude some network/TURN overhead and chat/file traffic, so they are not a mobile-provider billing meter. See [Call networking](docs/CALL_NETWORK.md) for the full policy and verification limits.

## Know the limits before installing

Call invitations detect the phone and guide the recipient through enabling alerts. Android can receive browser push; iPhone/iPad requires a Home Screen web app. Neutral New message notices open the intended conversation without putting routing IDs into the URL. A locked-phone sound test helps check setup. Up to three spaced alerts request the phone’s normal notification sound; the repeating ringtone plays when the page is open. OS settings, suspension, push delivery and connection still prevent guaranteed closed-phone ringing. See [Call alerts](docs/CALL_ALERTS.md).

Optional **self-hosted ntfy extra ringing** adds maximum-priority (5) generic alerts for recipients with its free Android/iPhone app. Android has one-tap subscription; iPhone has guided copy buttons. A locked-phone sound test enables the extra path after checking the opening link or choosing the phone-icon fallback. Calls, Web Push, Olm, identity pins and SAS stay independent of ntfy. Its device-specific read address cannot send alerts or access conversations. iPhone wake-up still uses ntfy.sh and platform push infrastructure; no website can force continuous ringing or erase native notification traces. See [extra ringing setup, sound settings and security](docs/EXTRA_RINGING.md). Its optional server installer supports the [native systemd installation](docs/INSTALL_NATIVE.md); it does not automatically configure the Docker deployment.

Audio cannot survive zero usable bandwidth or complete outages. Bitrate figures are codec payload ceilings; network overhead uses extra data. Browser support determines actual microphone processing, FEC, PLC and sender controls. A normal website cannot erase global or synced browser history or hide its service-worker/storage usage; see [Browser privacy](docs/BROWSER_PRIVACY.md).

Disappearing messages cannot guarantee zero forensic traces: recipient copies, browser/OS records, provider metadata and backups may remain. New transport uses the Olm Double Ratchet; retained readable history is separately encrypted on the device. Historical v1 messages retain their old security limitations. The application and its integration remain unaudited. See [security and privacy](docs/SECURITY.md).

## Install

Download and extract the [latest release](https://github.com/adlererik/WebCaller/releases). On your Debian server, enter the extracted folder and run:

```sh
sudo bash deploy/install-debian.sh
```

The installer asks for your domain, HTTPS method and relay choice. Set your DNS and router/firewall first using the [beginner guide](docs/INSTALL.md). Your server's `.env` contains new private secrets; none are supplied by this repository. Existing secrets are preserved on setup.

For a fresh installation using the optional ntfy server helper, follow the [native Debian guide](docs/INSTALL_NATIVE.md) instead. Invited people do not install server software or handle these secrets: they open the invitation and follow the phone's short setup guide.

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
| [Native Debian install](docs/INSTALL_NATIVE.md) | Alternative systemd setup for the optional ntfy server installer |
| [Using WebCaller](docs/USER_GUIDE.md) | Every button, invitations, calls, messages and settings |
| [Call alerts](docs/CALL_ALERTS.md) | Android/iPhone setup, notifications and the locked-phone sound test |
| [Extra ringing](docs/EXTRA_RINGING.md) | Optional ntfy, subscriptions, sound settings and troubleshooting |
| [Features](docs/FEATURES.md) | Audio/video adaptation, Opus and notification behavior |
| [Networking](docs/NETWORKING.md) | TURN, public IP, CGNAT, router ports, Cloudflare Tunnel and TLS |
| [Configuration](docs/CONFIGURATION.md) | Every environment setting and generated secret |
| [Security](docs/SECURITY.md) | Encryption, expiry, trace limits and safe publishing |
| [Browser privacy](docs/BROWSER_PRIVACY.md) | What the website can and cannot hide or erase |
| [Source security review](docs/SECURITY_REVIEW.md) | Threat model, findings, forward secrecy and Signal comparison |
| [Call verification](docs/CALL_VERIFICATION.md) | Using the four words and the SAS protocol |
| [Architecture](docs/ARCHITECTURE.md) | Components, APIs, message formats and source files |
| [Operations](docs/OPERATIONS.md) | Updates, backups, restart, logs, migration and removal |
| [Development](docs/DEVELOPMENT.md) | Tests, contributors and release packaging |
| [Verification](docs/VERIFICATION.md) | What passed and what remains unverified |

## Release and license

[Release notes](CHANGELOG.md) describe each preview. Code is available under the [MIT license](LICENSE). Dependency notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Please report vulnerabilities privately using [SECURITY.md](SECURITY.md).
