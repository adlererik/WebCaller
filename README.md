# WebCaller — experimental libsignal / PQXDH

A **Signal-like WebRTC phone** for Android, iPhone and desktop browsers: adaptive voice/video, encrypted chat, pictures, files and simple invitations. No SIM card, account password or phone number is required. This is an independent project, not a Signal client or a way to contact Signal users.

**This branch is an experimental browser integration of official libsignal v0.105.1, with PQXDH and Ed25519 application signatures.** It is based on WebCaller v0.17.1, but is not a stable release, an audited messenger or an in-place upgrade for the Olm version on [`main`](https://github.com/adlererik/WebCaller/tree/main). Use a separate installation, HTTPS hostname and fresh accounts. [Beginner installation](docs/INSTALL.md) · [All features](docs/FEATURES.md) · [Security model](docs/SECURITY.md).

The stable release's Docker downloads/images still contain Olm. They do **not** install this branch. Start with the native experimental guide. Nothing in this branch automatically changes an existing server.

## Why this experiment exists

On the stable branch I chose Olm Double Ratchet for practical calling and classical forward secrecy. Here I am testing the official Signal protocol core in the browser, including its post-quantum session agreement and ratcheting. This lets us evaluate extra startup, storage, bandwidth and integration work with real phones instead of guessing. The protocol implementation is upstream; the browser/storage adapter and WebCaller integration are experimental.

I still want invitations and calling codes ordinary people can use without giving a phone number. The four visible call words remain an optional human check. You can ask someone to read them aloud; forgetting does not stop the call. This does not replace key transparency's directory-consistency checks, and key transparency does not inherently require phone numbers.

For a serious nation-state threat, I would worry about a compromised phone or malicious website code as well as the encryption. A phone exploit can expose the microphone and plaintext without breaking a cipher. Excellent cryptography cannot repair an owned endpoint; this project is not interception-proof. **Stay tuned… I’m working on an embedded device for encrypted calls, much like a Trezor hardware wallet—but for calls ;)** That remains a separate project in development.

## What you can do

| Area | Included features |
|---|---|
| Reach someone | One-use invitations, private first-phone QR, optional user-chosen 4–12 digit calling codes, remembered contacts, search and local contact names. Video defaults, with voice-only calling available. |
| Calls | One-to-one full-duplex voice/video, front/back cameras, mute, camera on/off, chat during calls and browser-supported audio-output selection. Complete frames fit portrait/landscape screens. |
| Sound and bandwidth | Opus, requested AEC/NS/AGC, FEC and DTX; automatic audio-first adaptation, video reduction/pause, Wi-Fi/mobile budgets and ICE recovery. Complete outages can still interrupt calls. |
| Video | Conditional AV1 → H.265/HEVC → VP9 → H.264 → VP8 efficiency preference when both browsers report efficient encoding **and** decoding; compatible fallbacks remain. Hardware use is browser-controlled. |
| Chat | Encrypted text, typing indicators, delivered/read marks, replies, sender-only edits, reactions, forwarding, copy, selection, info, pinning and deletion for both participants. System/light/dark themes and familiar composer controls. |
| Media | Inline images/video, full-screen viewing/playback, gallery/files, camera capture, voice notes and current-location sharing with platform map links. Up to **200 MiB per file**. |
| Sharing during calls | Bounded parallel encrypted transfer, percentage/spinner placeholders, retry/cancellation and audio-aware pacing. Video yields capacity; severe audio trouble pauses transfer. Retained cached media is reused, subject to browser storage limits. |
| Message lifetime | Off, presets and custom seconds/minutes/hours/days/weeks up to four weeks. Sender countdown starts when sent; recipient countdown starts on first viewing. State survives refresh. Unread ciphertext can remain after sender expiry. |
| Alerts | Neutral message notices open the conversation. Web Push requests call sound and Answer/Decline where supported. Optional self-hosted ntfy adds priority-5 alerts with a per-phone sound/opening test and avoids duplicate browser call pushes. |
| Mobile video | Up to 500 kbps in each direction, with lower resolution/frame rate on poor links, voice-first pauses and cautious periodic recovery probes. |
| Call header | Aligned audio/video codec and kbps/Mbps rows fade with video controls. Centered four-word SAS, quality and timer stay visible; drag the fixed-size self preview. Rates describe codec payload, not carrier billing. |
| Hosting | Native Node.js/SQLite, HTTPS/WSS signaling, direct WebRTC where possible, TURN fallback and optional Cloudflare Tunnel for the website. A Tunnel is not a TURN relay. |

See [Features](docs/FEATURES.md), [User guide](docs/USER_GUIDE.md), [Calling codes](docs/CALLING_CODES.md) and [Call networking](docs/CALL_NETWORK.md). A website cannot force a closed phone to ring, select an unexposed earpiece, prevent all screenshots or erase browser/OS history. iPhone background Web Push requires the website's Home Screen icon; stock ntfy iPhone wake-up also uses platform push infrastructure and the configured upstream wake-up relay. [Alerts](docs/CALL_ALERTS.md) · [Extra ringing](docs/EXTRA_RINGING.md) · [Browser privacy](docs/BROWSER_PRIVACY.md).

## Encryption used here

Content is end-to-end encrypted when browsers run trusted code and authenticate the intended contact keys. The website/CDN/operator still supplies executable JavaScript; a malicious update can use keys or read plaintext on the phone.

| Component | Algorithms and implementation | Meaning and limits |
|---|---|---|
| Initial message/signaling session | Official **PQXDH**, **X25519 + Kyber-1024**, libsignal v0.105.1 | Explicit session version 4; no silent classical v3 session. Kyber-1024 must not be relabeled ML-KEM-1024. |
| Ongoing ratchet | Upstream **Double Ratchet + SPQR**, the **Triple Ratchet**; SPQR v1.6.0 uses **ML-KEM-768** | Native/WASM tests observe SPQR traffic in both directions. Recovery needs fresh uncompromised exchanges in the affected stream and loss of attacker access. |
| Ratcheted messages | **AES-256-CBC**, **HMAC-SHA-256**, **HKDF-SHA-256** | Upstream Signal message MAC: **8 bytes / 64 bits**, not Olm's 32-byte MAC. WebCaller additionally authenticates envelopes with Ed25519. |
| Application signatures | Native Web Crypto **Ed25519**; libsignal keeps its internal **XEdDSA/Curve25519** machinery | New identities use Ed25519 directly. Earlier test P-256 identities certify a nonextractable Ed25519 signer with **ECDSA P-256/SHA-256**, preserving pins/history. Outer signatures reduce deniability. |
| Attachments and local wrapped records | **AES-256-GCM**, 128-bit tags | Fresh per-file keys and authenticated chunks; keys/manifests are ratcheted. A separate nonextractable browser wrapping key does not protect against an attacker controlling the origin/profile. |
| Live voice/video | Browser-negotiated **DTLS-SRTP** | Separate from the message ratchet. Live media is **not made post-quantum secure**; no fixed SRTP AES key size is promised. |
| Optional four-word SAS | Fresh **X25519**, **SHA-256** commitment, **HKDF-SHA-256/HMAC-SHA-256** | A 44-bit comparison bound to call ID, roles, authenticated identities and accepted media certificate fingerprints. No ratchet secret is exported. |
| Compatibility-only history | Historical P-256 signatures; authorized v1 **ECDH P-256 / HKDF-SHA-256 / AES-256-GCM** | Earlier test history remains readable; new traffic cannot downgrade to v1. This is not an Olm-account migration. |
| Website and notifications | **HTTPS/WSS**, TURN REST **HMAC-SHA-1** credentials, Web Push **ECDSA P-256 VAPID** | Delivery mechanisms separate from content encryption. Relevant services still see delivery/network metadata. |

Official core pin: [`1738ead8a12ffe539f6309958123dadb16dc3b95`](https://github.com/signalapp/libsignal/tree/1738ead8a12ffe539f6309958123dadb16dc3b95). The [binding/build guide](third_party/libsignal/README.md), exact lockfiles, pinned upstream source submodule and matching official Node oracle are included. [Provenance](public/vendor/signal/provenance.json) records the checked WASM hash. Vodozemac remains for the separate SAS primitive and legacy regression checks; it no longer encrypts new messages/signaling.

### Forward secrecy, MITM and comparison with Signal

| Property | This experiment | Signal |
|---|---|---|
| Protocol | Pinned official libsignal through a custom browser adapter, PQXDH and current ratcheting | Maintained protocol and supported clients. [Specifications](https://signal.org/docs/). |
| Past traffic | Discarded ratchet secrets protect transport; retained history/file keys remain separate exposures | Ratcheting also does not erase retained endpoint history. [Ratchet design](https://signal.org/docs/specifications/doubleratchet/). |
| MITM checks | Invitation fingerprints, persistent application/libsignal pins and optional SAS; calling-code first contact trusts initial mapping | Safety numbers and, where supported, automatic key verification/key transparency. [Safety numbers](https://support.signal.org/hc/en-us/articles/360007060632-What-is-a-safety-number-and-why-do-I-see-that-it-changed). |
| Client delivery | Origin/operator controls newly delivered executable JavaScript | Installed clients separate delivery-server replies from application updates. |
| Metadata/deniability | No Sealed Sender or key transparency; routing/timing/size metadata remains. Extra public signatures reduce deniability | Different application protections, including [Sealed Sender](https://signal.org/blog/sealed-sender/). Neither guarantees anonymity. |
| Assurance | Unaudited browser/storage/signature/SAS integration and limited device testing | Much more external scrutiny, supported clients and operational experience. Same core does not mean same overall assurance. |

Classical Ed25519/P-256 authentication, the SAS and DTLS media remain separate from hybrid message secrecy. This is not a claim of Signal-equivalent security or protection against endpoint compromise. [Threat model](docs/SECURITY.md) · [Source review](docs/SECURITY_REVIEW.md) · [PQXDH](https://signal.org/docs/specifications/pqxdh/) · [SPQR](https://signal.org/blog/spqr/).

### Use the four call words

Read **all four words in order** to each other during the call. They appear at the top beside the name; codecs/rates and quality sit underneath. Matching words check the accepted connection under trusted-client/protocol assumptions. A mismatch means this check has not authenticated the call: stop sharing sensitive information and reconnect/verify through a trusted channel. Skipping comparison leaves the call working but gives no additional human verification. [Exchange details](docs/CALL_VERIFICATION.md).

## Try it on your own server

Use a new hostname, directory/database, owner token and VAPID keys. A different path on an existing hostname is **not** browser-storage isolation. Keep any stable installation and phone storage intact.

```sh
git clone --recurse-submodules --branch codex/experimental-libsignal-pqxdh https://github.com/adlererik/WebCaller.git WebCaller-Experimental
cd WebCaller-Experimental
npm ci --ignore-scripts
npm run setup
npm run prepare:source
```

Node.js 24+, Python 3 and Git are needed; Rust is only for rebuilding WASM. Edit the new private `.env` for your HTTPS hostname/relay and keep `WEBCALLER_TEST_INSTANCE=libsignal-preview-v1`. Follow the [native guide](docs/INSTALL_NATIVE.md) for a private Node runtime, boot service, HTTPS and first-phone QR. Local desktop testing can use `PUBLIC_URL=http://localhost:8088/calls` and `PORT=8088`, then `npm start`; phones require HTTPS.

Both participants must use the experimental origin. Stable Olm accounts/sessions cannot be imported. Earlier libsignal/P-256 test accounts keep their identities/history using certified Ed25519 signers; refresh **both** phones without clearing site data.

## Verification and documentation

Before public packaging, the experiment passed **255 application tests, zero failures, three explicit skips** for inapplicable old Olm migration cases. Three official-native interoperability tests passed, including both initiation directions and SPQR traffic. Browser checks covered old/new signing identities, messages, reload persistence, calls and matching SAS. A generated-data 200 MiB encrypted attachment round trip passed. These are not an independent audit or a physical-phone audio/alert/hand-over guarantee. [Reproducible verification](docs/VERIFICATION.md).

| Guide | Contents |
|---|---|
| [Install](docs/INSTALL.md) / [Native server](docs/INSTALL_NATIVE.md) | Separate setup, HTTPS, TURN, owner QR and phones |
| [User guide](docs/USER_GUIDE.md) / [Features](docs/FEATURES.md) | Calls, chat, media, settings and limitations |
| [Security](docs/SECURITY.md) / [Call words](docs/CALL_VERIFICATION.md) | Algorithms, pins, SAS and metadata |
| [Architecture](docs/ARCHITECTURE.md) / [Build libsignal](third_party/libsignal/README.md) | Adapters, wire framing, build and native oracle |
| [Configuration](docs/CONFIGURATION.md) / [Networking](docs/NETWORKING.md) | Private secrets, TURN, CGNAT, proxies and signaling |
| [Alerts](docs/CALL_ALERTS.md) / [Extra ringing](docs/EXTRA_RINGING.md) | Android/iPhone, optional ntfy and sound tests |
| [Operations](docs/OPERATIONS.md) / [Development](docs/DEVELOPMENT.md) | Backups, updates, browser state and source distribution |

## License

This combined experimental distribution uses **AGPL-3.0-only** because it links libsignal. Original WebCaller code retains its [MIT notice](LICENSE-MIT); Vodozemac is Apache-2.0 and other components retain their licenses. Preserve [notices](THIRD_PARTY_NOTICES.md) and corresponding source when distributing/operating the combined work. `npm run prepare:source` creates the hosted source download without private configuration/state. [Licensing](LICENSING.md) · [Security reporting](SECURITY.md).
