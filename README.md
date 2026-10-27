# WebCaller

**A Signal-like WebRTC phone for Android, iPhone and desktop.** High-quality adaptive voice/video, end-to-end encrypted messages and media, simple invitations and optional calling codes. No SIM card, phone number or account password is required. The phone runs in your browser; you host the server.

[Install on your server](docs/INSTALL.md) · [Download v0.18.0](https://github.com/adlererik/WebCaller/releases/tag/v0.18.0) · [All features](docs/FEATURES.md) · [How to use it](docs/USER_GUIDE.md) · [Security explained](docs/SECURITY.md)

**v0.18.0 brings the official libsignal core, PQXDH and Triple Ratchet to the main release.** The cryptographic core is upstream Signal code; its browser binding, storage integration and optional call-verification exchange are WebCaller code and remain unaudited. This is an independent project, not an official Signal client. It cannot call Signal or WhatsApp users, and using the same core does not give it Signal's overall security assurance. Earlier Olm installations need a planned migration, not an ordinary overwrite. [Upgrade guide](docs/APPROVED_CUTOVER.md).

## Why I built it this way

I wanted something a nontechnical relative could open and understand: accept an invitation, choose a name and talk. I also wanted control over my own server, good sound on poor connections and no compulsory telephone-number directory. The interface follows familiar Signal-style calling and messaging patterns, with extra controls tucked into Settings.

I started with Olm Double Ratchet for classical forward secrecy. This release moves new message and signaling sessions to the official **libsignal 0.105.1** implementation, with **PQXDH and Triple Ratchet/SPQR**. I chose an established protocol implementation instead of inventing a message cipher. The application around that library still needs careful testing and independent review.

**I chose not to depend on a third-party key-transparency service or its auditors.** WebCaller instead combines trusted invitations, locally pinned identities, a full pairwise safety fingerprint and an optional four-word check during calls. That is a deliberate dependency/usability choice, not a claim that human checks provide key transparency's automatic, directory-wide consistency guarantees. Key transparency does not inherently require a phone number. [What this choice protects—and what it leaves to you](docs/SECURITY.md#identity-verification-without-key-transparency).

Against a nation-state adversary, I would worry about a compromised phone or malicious website update as much as cryptanalysis. An exploit such as Pegasus can get at the microphone or plaintext without breaking the encryption. This applies to excellent messengers too; it is not evidence that Signal's protocol is broken. Don't assume anything on an owned phone is safe. **Stay tuned… I'm working on an embedded device for encrypted calls, much like a Trezor hardware wallet—but for calls ;)** That is a separate project in development.

## What is included

| Feature | What it does |
|---|---|
| Simple contact setup | Private first-phone QR, one-use invitations, optional recipient name, optional unique 4–12 digit calling codes, remembered contacts and local contact renaming. No mandatory telephone number. |
| Voice and video | One-to-one full-duplex calling, video by default, voice-only option, mute, camera toggle, front/back cameras and browser-supported output selection. |
| Good sound first | Opus, requested echo cancellation, noise suppression, gain control, in-band FEC and DTX; browser packet-loss concealment, jitter buffering and congestion control. Video/files yield before voice. |
| Efficient video | AV1, H.265/HEVC, VP9, H.264 and VP8 when the browsers expose them. Both phones' encode/decode efficiency reports influence selection; compatible fallbacks remain available. |
| Changing networks | Automatic bitrate, frame-rate and resolution adaptation; tiny video, pause/recovery probes, authenticated signaling recovery and fresh ICE restarts during Wi-Fi/cellular changes. |
| Practical mobile budgets | Up to 500 kbps sent and 500 kbps received for video when either end is cellular/unknown. Confirmed Wi-Fi can use 900 kbps per direction. Audio/headers/files are additional. |
| Modern call screen | Immersive upright view, square layout when either screen is sideways, fading controls/codec rows, persistent SAS/quality/timer and a draggable fixed-size self preview. |
| Encrypted chat | Text, typing animation, replies, sender-only edits, reactions, forwarding, copy, selection, pinning, message information and deletion for both people. |
| Stickers | 1,117 local WebP stickers in 18 packs, including three Angel Dust packs; pack tabs, encrypted local Recent/Favorites, one-tap sending and borderless rendering. Signal-protected keys, encrypted WebRTC data-channel delivery and stored encrypted fallback. [Guide](docs/STICKERS.md). |
| Media and files | Up to 200 MiB per item; inline pictures/video/audio, full-screen viewer, captions, gallery/file picker, front/back photo capture, voice notes and current-location map cards. |
| Sharing while talking | Up to four paced encrypted upload/download workers, weak-link parts, retry/cancellation and percentage placeholders. Video temporarily yields capacity; poor audio pauses file traffic. |
| Media that stays available | Complete encrypted local media caching avoids another transfer when reopening a chat, until expiry/deletion or browser storage eviction. |
| Disappearing messages | One-hour default for new conversations; Off, presets and custom number/unit wheels through four weeks. Separate sender/send and recipient/first-view countdowns. |
| Call and message alerts | Neutral message notifications open the intended chat. Web Push requests call sound and Answer/Decline where supported. Optional self-hosted ntfy priority-5 alerts avoid duplicate browser call pushes, with failure fallback. |
| Appearance and privacy controls | System/light/dark appearance, configurable local page title, settings behind a cog, no plaintext message content in notifications, no application asset cache in the service worker. |
| Self-hosting | Native Node/SQLite, source-built Docker or the guided prebuilt Docker bundle; HTTPS/WSS, STUN/ICE, authenticated TURN and optional Cloudflare Tunnel. Configurable paths and safe retirement of previous routes. |

[Complete feature reference](docs/FEATURES.md). Browser restrictions still matter: a website cannot guarantee ringing after the OS suspends it, force an unexposed earpiece, prevent every screenshot or erase browser/OS history. iPhone browser call alerts require a Home Screen web app. Optional ntfy requires its client; stock iPhone ntfy wake-up also uses platform push infrastructure. [Alerts](docs/CALL_ALERTS.md) · [ntfy](docs/EXTRA_RINGING.md).

## Security in plain English

Your phones encrypt message content, attachment keys and call setup before sending them through the server. The server routes ciphertext. Live sound/video is encrypted by WebRTC between the peers, including when a TURN relay carries it. The server still sees account/contact/routing/timing/size information, and it supplies the JavaScript your phone runs. Self-hosting gives you control; it does not make the website incapable of attacking its clients.

| Layer | What this release actually uses |
|---|---|
| Session establishment | **PQXDH v4: X25519 + Kyber-1024**, with signed prekeys and libsignal's internal **XEdDSA** authentication. Classical-only v3 sessions are rejected by the binding. |
| Ongoing encryption | Official **Double Ratchet + Sparse Post-Quantum Ratchet (SPQR)**, combined as **Triple Ratchet**. Pinned SPQR 1.6.0 uses **ML-KEM-768**. |
| Ratcheted message cipher | Upstream v4 **AES-256-CBC**, **HKDF-SHA-256** and **HMAC-SHA-256**, with libsignal's **8-byte/64-bit message MAC**. This is authenticated upstream protocol encryption, not bare CBC. |
| Extra application authentication | Native Web Crypto **Ed25519** signatures cover encrypted envelopes and prekey publications. Existing P-256 identities can certify an Ed25519 signer without changing their stored fingerprint. |
| Attachments/local wrapped records | **AES-256-GCM**, with 128-bit authentication tags. Each file has a fresh 256-bit key and indexed authenticated chunks; its key travels inside a ratcheted message. |
| Live voice/video | Browser-negotiated **DTLS-SRTP**. PQXDH/Triple Ratchet does **not** make live media post-quantum encrypted. The browser selects the media cipher; no universal AES size or ChaCha20-Poly1305 promise is made. |
| Four call words | Fresh **X25519**, **SHA-256** commitment and **HKDF/HMAC-SHA-256** key confirmation, with four 11-bit word indices: **44 comparison bits**. Bound to accepted media certificate fingerprints and authenticated identities. |
| Full safety fingerprint | A **256-bit SHA-256 pairwise fingerprint** of the two application identities, shown as grouped hexadecimal. This is WebCaller's format, not Signal's 60-digit safety number. |
| Delivery/relay credentials | **HTTPS/WSS**, Web Push **P-256 VAPID** authentication, short-lived TURN REST credentials made with **HMAC-SHA-1**. These are separate from conversation encryption. |

Kyber-1024 in PQXDH and ML-KEM-768 in SPQR are different components; the initial KEM is not labeled ML-KEM-1024. Classical Ed25519/XEdDSA authentication and WebRTC media remain distinct from post-quantum message secrecy. The exact pin, binding source, locks, checksums and native interoperability tests are [included](third_party/libsignal/README.md).

**Forward secrecy:** discarding used ratchet keys limits what a later stolen session state reveals about previously recorded traffic. **Post-compromise recovery:** fresh uncompromised ratchet exchanges can protect future traffic after an attacker loses access. Neither mechanism removes saved history/file keys from a phone, fixes a stolen identity, or defeats a continuously compromised endpoint. Each affected message/signaling stream needs to recover. [Full security model](docs/SECURITY.md).

### Verify the person and the call

1. **For a live call:** both people read all four displayed words, in order, and check they match exactly. They sit at the top of the call and remain when controls fade. Words are local UI, not pixels burned into the outgoing video. Forgetting the comparison never blocks the call; it also gives no extra human verification.
2. **For the saved identity:** open the chat and **tap the contact's name/header**. Compare the entire grouped safety fingerprint in person or through a separate trusted channel. Compare it again after a genuine device/identity change. A name or calling code alone is not proof.
3. **If either check differs:** stop exchanging sensitive information and investigate through a trusted channel. Do not assume a key warning is just a network issue.

SAS is fresh per accepted media context, survives ordinary ICE handovers and is cleared at hang-up. Four words are a compact comparison, not a secret key, recovery phrase or guarantee of global uniqueness. [How the exchange works](docs/CALL_VERIFICATION.md).

### How it compares with Signal

| Property | WebCaller v0.18.0 | Signal |
|---|---|---|
| Protocol core | Pinned official libsignal through a custom WASM/storage adapter | Official maintained clients and protocol integration |
| Message forward secrecy/PQ | PQXDH + Double/Triple Ratchet; persistence, history and recovery limits apply | Maintained protocol with supported clients and much wider scrutiny |
| Identity verification | Trusted invitations, persistent pins, full pairwise fingerprint and optional media-bound SAS | Safety numbers and supported automatic verification/key transparency |
| Key-transparency dependency | No external key-transparency service/auditors; human verification is the operator's choice | Automatic verification adds directory-consistency checks with independent auditors |
| Media | DTLS-SRTP browser transport, authenticated setup and optional SAS binding | A separate supported calling stack; a shared message library does not make calls identical |
| Metadata | Self-hosted directory/relay control, no mandatory phone number; no Sealed Sender or traffic anonymity | Includes application protections such as Sealed Sender; not anonymity or endpoint immunity |
| Application delivery | Website/operator/CDN can deliver new executable client code on load | Installed signed clients have a different update/distribution boundary |
| Assurance | Unaudited integration and limited physical-device coverage | Substantially more security review, deployment experience and supported testing |

Signal's design is the inspiration, not a certification. Read [Signal's PQXDH specification](https://signal.org/docs/specifications/pqxdh/), [ratchet specification](https://signal.org/docs/specifications/doubleratchet/), [automatic verification explanation](https://signal.org/blog/automatic-key-verification/) and [Sealed Sender description](https://signal.org/blog/sealed-sender/) for their guarantees. [Our strengths and limitations](docs/SECURITY.md#strengths-and-remaining-risks).

## Audio and video quality

Opus is the preferred conversation codec: it handles speech efficiently and changes bitrate as conditions change. Echo/noise/gain processing is requested from the browser; codec FEC, DTX, jitter buffering and concealment help with loss and silence. These are browser-negotiated capabilities, not switches that JavaScript can universally force. Voice-note recording separately uses browser-supported MP4/AAC or WebM/Ogg Opus; it is not the live call codec. Other RTP audio fallbacks depend on the browser; Opus is the preferred conversation path.

For video, the preference among **mutually reported smooth, power-efficient encode/decode variants** is **AV1 → H.265/HEVC → VP9 → H.264 → VP8**. Think of this as an efficiency preference, not an absolute picture-quality ranking: bitrate, hardware, resolution and scene content matter. H.264/VP8 remain practical fallbacks. Both encode **and** decode efficiency must be reported at both ends; an AV1 playback decoder alone is insufficient. The browser ultimately controls hardware acceleration.

High compression leaves more bandwidth for a clear picture, but software encoding on a slow phone can cost power and hurt quality. WebCaller checks reported efficiency, lowers capture load under sustained CPU pressure and can negotiate a supported efficient alternative. It adapts bitrate/frame rate/resolution without changing codec on every fluctuation. On weak links it preserves tiny video where usable, pauses if necessary and periodically probes recovery while protecting voice. [Budgets, transfer pacing, codecs, ICE and handovers](docs/CALL_NETWORK.md).

## Get it running

Choose **one** installation method:

- **Guided prebuilt Docker bundle:** download `WebCaller-Docker-v0.18.0.tar.gz` from the release, extract it, then run `./webcaller setup`, `./webcaller start` and `./webcaller qr`. The wizard configures the optional HTTPS/TURN/ntfy services. [Step-by-step guide](docker/README.md).
- **Native Debian, no Docker:** use the complete [native guide](docs/INSTALL_NATIVE.md) for Node, private configuration, HTTPS, boot service, TURN and the private first-phone QR.
- **Build from source:** recursively clone the tagged release, install dependencies, generate private setup keys and build the source offer. The root Compose file can also build a container locally. [Installation choices](docs/INSTALL.md).

You need a server, a domain/HTTPS address and a reachable TURN relay for reliable calls across difficult networks. A Cloudflare Tunnel can carry the website and WebSockets; it cannot relay WebRTC media. CGNAT usually requires a separate public TURN server. A successful relay allocation is useful but not a complete call test.

Scan the private owner QR with the first phone. Other people use invitations or an optional calling code; **never send them server passwords or owner setup credentials**. On iPhone follow Add to Home Screen and use that icon for calls/alerts. Then test messages, a call both ways, all four words, a photo during a call, locked-screen alerts and a Wi-Fi/cellular transition.

## Documentation and verification

[Features](docs/FEATURES.md) · [User guide](docs/USER_GUIDE.md) · [Install](docs/INSTALL.md) · [Native setup](docs/INSTALL_NATIVE.md) · [Docker](docker/README.md) · [Networking](docs/NETWORKING.md) · [Call adaptation](docs/CALL_NETWORK.md) · [Configuration](docs/CONFIGURATION.md) · [Calling codes](docs/CALLING_CODES.md) · [Alerts](docs/CALL_ALERTS.md) · [ntfy](docs/EXTRA_RINGING.md) · [Operations/backups](docs/OPERATIONS.md) · [Security](docs/SECURITY.md) · [SAS](docs/CALL_VERIFICATION.md) · [Source review](docs/SECURITY_REVIEW.md) · [Architecture](docs/ARCHITECTURE.md) · [Development](docs/DEVELOPMENT.md)

Release checks include application tests, official-native libsignal interoperability in both directions/SPQR exchange, source/WASM provenance, secret scanning, installation/bundle checks and container smoke tests. See [the exact evidence and commands](docs/VERIFICATION.md). Tests are not an independent audit or a guarantee of sound, battery life, notification delivery or radio handover on every phone.

## License

The combined libsignal distribution is **AGPL-3.0-only**. Original application code retains its [MIT notice](LICENSE-MIT); Vodozemac is Apache-2.0. Preserve [dependency notices](THIRD_PARTY_NOTICES.md) and provide corresponding source when required by the [license](LICENSING.md). Release source archives include the pinned upstream source; GitHub's automatic archives do not expand submodules.
