# WebCaller security and encryption

This is the security model for **v0.20.0**, which uses official libsignal **0.105.1**, pinned to commit `1738ead8a12ffe539f6309958123dadb16dc3b95`. It supersedes descriptions of the earlier Olm message transport. The upstream protocol source is unmodified. WebCaller's WASM adapter, storage, application signatures, call handling and SAS composition remain **unaudited**. This document describes mechanisms and boundaries, not a security certification.

## What end-to-end encryption means here

A sending browser encrypts text, attachment keys/manifests, message updates and call signaling for the other browser. The server stores/routes ciphertext and public key material. It does not normally hold the private conversation keys. Attachments are encrypted before upload. WebRTC encrypts live audio/video between peers, including through a TURN relay.

Encryption prevents a passive network observer or an honest-but-curious relay/mailbox from simply reading conversation content. It does not hide every participant/address/time/size, prevent message suppression, or make a compromised browser safe. The HTTPS website still supplies executable client code. If an operator/CDN/origin is compromised and delivers malicious JavaScript, that code can read plaintext and use stored keys before encryption or after decryption. A path on a hostname is not an isolation boundary from other same-origin code.

## Exact cryptographic inventory

| Purpose | Construction | Important detail |
|---|---|---|
| Initial hybrid agreement | Official **PQXDH v4**, **X25519 + Kyber-1024**, signed EC/PQ prekeys, upstream **XEdDSA/Curve25519** identity authentication | Binding requires version 4; no silent fallback to classical v3. Kyber-1024 is not renamed ML-KEM-1024. |
| Ongoing session keys | Official **Double Ratchet + SPQR**, combined as **Triple Ratchet**; pinned SPQR **1.6.0 / ML-KEM-768** | Classical and sparse post-quantum contributions are mixed by upstream code. Recovery requires fresh exchanges, not merely a timer. |
| Ratcheted payloads | **AES-256-CBC**, **HKDF-SHA-256**, **HMAC-SHA-256**, libsignal's **8-byte/64-bit message MAC** | The pinned `triple_ratchet.rs` verifies authentication before CBC decryption. Other algorithms present in upstream source are not automatically used by this v4 binding. |
| Outer application signatures | Web Crypto **Ed25519**, 32-byte public key, 64-byte signature | Covers encrypted routing/context/envelopes and public prekey statements. Does not modify libsignal's internal signatures or ratchet. |
| Old application identity continuity | Existing **ECDSA P-256/SHA-256** anchor certifies an owner-bound Ed25519 signer | Fingerprints/pins remain unchanged. Historical signatures remain verifiable; new Signal envelopes use Ed25519. P-256 is not secretly replaced inside libsignal. |
| Files | Fresh **AES-256-GCM** key per attachment, 128-bit tag, 96-bit nonce = random 64-bit per-file prefix + 32-bit chunk index | 64 KiB plaintext chunks; authenticated context binds file ID/index/size/expiry. File key/type/name remain inside the ratcheted manifest. |
| Local secure records | **AES-256-GCM**, nonextractable wrapping CryptoKey, authenticated record context | Encrypts serialized ratchets/history/timers/file metadata in IndexedDB. The usable wrapping key is also held by that origin/profile. This is not a user-password-encrypted vault. |
| Live voice/video | Browser-negotiated **DTLS-SRTP** | Separate from Signal message encryption. Media cipher/profile is browser negotiated; no fixed AES-128/AES-256/ChaCha choice is promised. Live media is not made post-quantum by the message ratchet. |
| Call SAS | Ephemeral **X25519**, **SHA-256** commit/reveal, **HKDF-SHA-256/HMAC-SHA-256** confirmations and display derivation | Vodozemac supplies the separate SAS primitive. Four 2048-word indices provide 44 comparison bits. No Signal root/chain secret is exported. |
| Pairwise safety display | **SHA-256**, 256-bit grouped hexadecimal checksum of the sorted two application identity fingerprints | WebCaller format, not Signal's standard 60-digit number. It is public comparison data, not a password or recovery key. |
| Server delivery | HTTPS/WSS; one-use authenticated WebSocket tickets | Protects transport and access. Signaling content remains independently signed/ratcheted. |
| TURN access | Short-lived REST credentials using **HMAC-SHA-1** with a private relay secret | Authorizes relay allocation; it is not the media cipher. Direct/relayed paths still use DTLS-SRTP. |
| Browser notifications | **P-256 ECDSA VAPID** plus the provider's Web Push transport | Separate notification infrastructure. Payloads omit names/message content and carry generic events/opaque routing identifiers. |
| Historical v1 records only | **ECDH P-256 / HKDF-SHA-256 / AES-256-GCM** and historical signatures | Exact authorized legacy snapshots can be read; new transport is not allowed to downgrade to v1. Old Olm sessions are not libsignal sessions. |

The pinned core/binding/locks/WASM hashes and license are [verifiable](../third_party/libsignal/README.md). Core algorithm code is upstream; custom serialization/store/identity composition is still security-critical. Generic claims about another libsignal version are not evidence about this release.

## Forward secrecy: past, future and saved history

**Classical forward secrecy** limits exposure of old recorded ciphertext if an attacker later steals current session state: used ratchet message keys are discarded, and successive DH/key-chain updates derive new keys. It is not a promise that a device containing readable saved messages cannot disclose them. Bounded skipped/out-of-order keys and previous session records are part of the state and remain relevant.

**Post-quantum forward secrecy** starts with PQXDH's hybrid X25519/Kyber agreement. Its aim includes resisting an adversary who records encrypted message traffic now and obtains a capable quantum computer later, under the hybrid protocol's assumptions. This is not equivalent to quantum-resistant identity authentication: the pinned protocol still authenticates using classical signatures. Live DTLS-SRTP media is a separate exposure.

**Post-compromise security** concerns future traffic after an attacker loses access to state. Classical Double Ratchet healing needs a fresh uncompromised DH contribution and suitable communication. SPQR adds incremental post-quantum exchanges; a new contribution must actually complete/reach the relevant session. No guarantee follows from sending a single packet, waiting a fixed number of seconds, or healing another lane. WebCaller separates chat/events/call/typing/transfer scopes. Each affected stream needs fresh uncompromised exchanges. A stolen long-term identity or an attacker who still controls the phone/origin defeats these assumptions.

Retained text history and attachment keys are sealed separately for usability. Capturing that usable local state can disclose retained content even if the original transport keys are gone. Off messages intentionally remain until deletion. A per-file key protects an entire retained file; there is no claim of ratcheting every media byte or making a retained file key disappear when its transport key does.

References: [PQXDH](https://signal.org/docs/specifications/pqxdh/), [Double/Triple Ratchet](https://signal.org/docs/specifications/doubleratchet/), [SPQR design](https://signal.org/blog/spqr/).

## Identity verification without key transparency

The maintainer chose not to require a third-party key-transparency service/auditor. The app also does not require a telephone number. These are separate choices: key transparency itself does not inherently require phone-number registration.

WebCaller provides four complementary checks:

1. **Invitation fingerprint:** a one-use invitation carries the inviter's public identity fingerprint in its URL fragment. A trusted channel for that link authenticates the initial inviter. If the link itself is substituted, its fingerprint can be substituted too.
2. **Persistent identity pins:** application identity and libsignal identity continuity are remembered locally. A changed server roster, contact removal or history deletion must not silently authorize replacement keys. New code-to-contact mappings are remembered, but first contact via a calling code still trusts the directory's initial mapping.
3. **Full safety fingerprint:** in a chat, tap the contact's name/header and compare the entire grouped 256-bit pairwise safety fingerprint through an independent trusted channel or in person. The display covers application identities; signed prekey statements and separately pinned libsignal identities provide the session-binding chain. It is not a standalone display of every current libsignal/DTLS key.
4. **Optional call SAS:** compare all four displayed words in order. The exchange binds the accepted call's media fingerprints, call ID, roles and application identities to fresh contributions. Skipping this comparison leaves calling usable but adds no human verification.

Key transparency offers global directory-consistency and monitoring checks that these manual checks do not provide automatically. WebCaller has no automatic transparency log, external witnesses or background directory-wide consistency verification. This trades that automation for fewer external verification dependencies. [Signal's explanation](https://signal.org/blog/automatic-key-verification/).

A legitimate phone/browser reinstall can create a new identity. Investigate the change through a trusted channel. Do not clear site data, delete a contact or approve a reset simply to silence a warning. A safety mismatch is not treated as ordinary ICE/congestion trouble.

## Four words and man-in-the-middle attacks

A passive observer cannot derive the displayed check from public handshake contributions alone. Against an active intermediary splitting a call into two connections, correctly comparing a committed, media-bound SAS can expose mismatched connections under honest-client/protocol assumptions. The nominal ideal false match is 2^-44 per independent attempt; this is not a formal proof of this application's composition or a model of human mistakes.

The caller commits before the callee reveals its contribution. Both peers verify role-specific key confirmation before displaying words. The context binds actual accepted DTLS certificate fingerprints, roles, call ID and application identity fingerprints, rather than just two unauthenticated public keys. Words are local DOM text, never rendered into outgoing video frames. They are not stored as conversation history or a permanent human-verification record. Ordinary ICE path changes retain the media identity/words; changed accepted media fingerprints start a fresh check. Hang-up/page exit clears references/timers/display. JavaScript memory management cannot promise forensic zeroization.

The SAS does not authenticate previous offline messages, make voice recognition a cryptographic primitive, or defeat malicious clients that lie about their display. A full fingerprint comparison gives persistent identity assurance; call words give a convenient per-call check. Neither is useful if compared with an attacker-controlled communication channel without independently knowing the intended person. [Protocol and limits](CALL_VERIFICATION.md).

## Server, relay, notification and traffic metadata

The application server sees identities/public keys, contact relations, calling codes, routing identifiers, ciphertext sizes, timings, retention/deletion events, push endpoints and network connections. It can drop, delay, replay attempted deliveries, deny service or attack first-contact lookup. Authorization, signatures, pins, one-time prekeys and replay checks constrain behavior; they do not remove server trust for code delivery/availability.

A TURN relay forwards encrypted media but sees endpoint IPs, allocations and packet timing/size. Direct peers may learn each other's network addresses. STUN/ICE discover/select paths; they are not extra content ciphers. HTTPS and TURN do not provide traffic anonymity. There is no Sealed Sender, onion transport, traffic padding or resistance to global timing correlation. Strong content encryption therefore does not establish privacy from a state observing metadata or controlling endpoints.

Web Push and optional ntfy carry generic call/message notices, not conversation plaintext/keys/SAS. Providers can still observe delivery metadata. Optional stock iPhone ntfy wake-up passes through ntfy.sh metadata relay and Apple infrastructure; fully self-hosting the application does not eliminate that platform dependency. ntfy subscriptions are secret read capabilities and publisher credentials stay server-side. A successful publish does not prove a phone made a sound.

## Storage, timers and deletion

Phone identities, tokens, persistent pins, ratchets and retained history use browser storage. Nonextractable Web Crypto keys resist ordinary raw export; malicious same-origin code can still ask those keys to sign/decrypt. IndexedDB leases/transactions fence cross-tab writes and commit account/session/history state together. Corrupt or mismatched state fails explicitly rather than silently replacing the identity. Serialized WASM/JavaScript copies and browser backups remain part of the exposure.

The media cache retains complete authenticated ciphertext sets, not plaintext thumbnails/filenames/keys. The corresponding retained message can still contain the decryption key. Deletion/expiry removes app records/chunks and bounded replay/deletion markers prevent resurrection; pinning cannot extend expiry. Cached data remains subject to browser quotas, eviction and cleanup opportunities.

New conversation timers default to one hour. Sender time starts at send; recipient time starts on first actual viewing. An unread recipient copy can therefore outlive the sender's visible copy. Off retains messages until deletion. Closed browsers cannot physically run cleanup until they execute again. Screenshots, downloads, OS notifications, browser history, recipient copies and backups cannot be recalled or securely erased by this website. These are retention controls, not zero-trace guarantees. [Browser privacy](BROWSER_PRIVACY.md).

## Strengths and remaining risks

| Strength | Boundary |
|---|---|
| Official pinned protocol core; strict PQXDH v4; native interoperability/SPQR tests | Custom browser adapter/composition is not independently audited or an official supported Signal SDK |
| Forward secrecy and hybrid ongoing ratcheting | Saved history, skipped keys, identity theft and continuous endpoint access remain exposures |
| Ed25519 signatures, signed prekeys and persistent dual identity pins | Outer signatures reduce deniability and do not fix a malicious first-contact directory by themselves |
| Committed media-bound SAS and full safety fingerprint | Optional/manual checks can be skipped or miscompared; no automatic transparency log |
| AES-GCM files and sealed local records | Usable browser keys and retained manifests can disclose retained data to a compromised profile |
| Self-hosted mailbox/relay/optional ntfy | Hosting/CDN/OS/push infrastructure and traffic metadata still matter |
| Strict same-origin writes, authenticated one-use tickets, bounded transfers | DoS, traffic analysis, compromised dependencies/origin and OS suspension remain possible |

Compared with Signal, the protocol core is a strong starting point and number-free self-hosting is a useful choice. Signal's supported clients have much broader review and a different client-update trust boundary. WebCaller does not inherit Sealed Sender, key transparency, every Signal client protection, or audited assurance by linking libsignal. It is not described as safe against all three-letter agencies. A compromised phone/origin can bypass content protection without breaking a cipher. [Side-by-side table](../README.md#how-it-compares-with-signal).

## Reconnecting transports and private paths

A temporary in-memory page UUID accompanies a one-use authenticated WebSocket ticket so a reconnecting page can reclaim its own answered call. It is scoped to the authenticated account, is not a persistent identifier/authentication secret, and cannot let another tab inherit the answered socket. Heartbeats use WSS; SDP, ICE and restart correlations remain inside signed encrypted envelopes. Media adaptation and attachment pacing do not weaken encryption.

A random URL path discourages blind discovery but is a shareable address, not access control. Retired paths return 404 without revealing the replacement. `noindex`/`no-referrer` reduce cooperative indexing/referrer leakage; they do not erase history, hide traffic or prevent recipients/server code from knowing the URL. Never commit a private deployment path or list it in a public robots file/sitemap.

## Review and reporting

Review provenance and run the tests in [Verification](VERIFICATION.md). Independent review should focus on adapter/store serialization, signature composition, prekey lifetime/consumption, identity continuity, SAS/media binding, retained-history exposure and deployment/code delivery. [Review record](SECURITY_REVIEW.md) distinguishes tests from an audit. Report vulnerabilities privately as described in [SECURITY.md](../SECURITY.md).

## Sticker delivery

Stickers reuse authenticated AES-256-GCM attachment chunks and Signal-ratcheted key manifests. The sticker marker is encrypted with the manifest. A data-only WebRTC connection carries ciphertext; its SDP/ICE are signed and encrypted through pinned Signal identities. The server authorizes only accepted contacts, with bounded requests. Data frames, buffering, size, replay and idle lifetime are bounded. Ciphertext also remains in the ordinary attachment service for offline delivery and cache recovery. This adds no custom ratchet, changes no call SAS or media encryption, and does not make browser DTLS itself post-quantum. Public artwork requests and network/routing metadata remain visible to the host/CDN, and direct ICE may disclose IP addresses to the accepted contact. Recent/favorite sticker IDs use the existing AES-GCM encrypted device store. See [the sticker guide](STICKERS.md).


Sticker manifests now use the existing chat ratchet rather than consuming a new one-time PQXDH bundle for each image. Each sticker still has its own random AES-256-GCM attachment key. Auxiliary sticker-link and file-progress streams are separate per-contact ratchets; authenticated payloads retain their call/transfer identifiers and receivers reject mismatched contexts. Old per-file manifests and per-attempt control envelopes remain readable. Reconnect/resume schedules bounded publication retries without resetting identity pins, reusing claimed prekeys or falling back to plaintext. Starting a genuinely new session with no authenticated starter material still fails closed. This application-session change does not alter libsignal, its WASM binding, media encryption or SAS. Both browsers must load the updated client to receive the new shared-session sticker format.

## Linux installer and recovery boundary

v0.20.0 adds a Linux-only Docker assistant without changing the cryptographic core, browser binding, media protocol or SAS. Release bundles pin image digests; updater downloads are bounded/allowlisted, checked against release checksums and limited to expected image namespaces/bundle format. Checksums/digests identify downloaded bytes; they are not independent proof that an authorized publisher is trustworthy. Docker Engine and its socket are a privileged host trust boundary; the helper does not receive the Docker socket, and its archive commands run without container networking.

Each new installation has a persistent random Compose project name. Maintenance locks and local-engine/project-folder/volume-label checks reduce accidental cross-installation changes. Consistent snapshots stop this project's services and include matching bundle/configuration/server-volume data. They contain secrets, are private by filesystem permissions and are **not password-encrypted**. A restore is an operator-authorized replacement of server state, not a phone-key backup. Archive verification rejects corruption, path escapes, links, special files, duplicates and excessive counts/sizes before restoring volumes. Only restore trusted snapshots: saved bundle files include executable code.

Automatic startup recovery restores the prior server snapshot and resumes a previously running stack; it cannot restore browser ratchet/identity state or promise retention of later messages. Keep private independent backups and test recovery. Host networking, router/DNS/firewall configuration, certificate renewal for optional TURN-TLS, browser suspension and actual cross-network media tests remain operational responsibilities. Native services are not migrated by downloading or running this installer in a separate folder.
