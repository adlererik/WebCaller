# Source security review — 13 October 2026

This is a maintainer-assisted source review of WebCaller v0.14.1, not an independent penetration test, cryptographic audit, formal proof or physical-device certification. Passing tests cannot establish that every implementation detail is correct. The review supports specific conclusions below rather than an unconditional claim that the app is safe from interception.

## Conclusion

The current v2 design has real end-to-end encryption and useful classical forward secrecy for discarded transport secrets. It uses an established Olm core rather than a newly invented message cipher. Its signed key directory, persistent identity pins, atomic state updates and call-media-bound SAS address several common integration mistakes. There was no demonstrated bypass of these checks in the exercised paths.

The largest structural weakness is **website code delivery**: a compromised origin, hosting account, same-origin application or trusted deployment path can deliver JavaScript that uses existing non-exportable keys and reads plaintext. A server holding only the existing database/TURN traffic has a different capability from a server that can change code delivered to a phone. Those threats must not be conflated. The app is not equivalent to Signal's maintained installed clients, current hybrid ratchets and key transparency.

## Scope and evidence

Reviewed client identity/vault and legacy encryption (`crypto.js`), local encrypted state/locking (`secure-store.js`), Olm framing/transport/prekeys (`secure-messaging.js`, `olm-wire.js`, `server/ratchet.mjs`), identity continuity (`contact-trust.js`), attachments/cache/expiry, call SAS/context/lifecycle (`call-sas.js`, `app.js`), and relevant API/WebSocket authorization and delivery code. Also inspected the pinned Vodozemac source/provenance and Signal's current primary specifications/source. Tests exercise synthetic identities and messages; no production secrets or conversations are included in the published review.

Evidence includes ratchet delivery/replies/reload, tamper/downgrade rejection, signed one-use prekeys, independent per-file/call streams, identity pins after contact removal and across tabs, atomic fenced commits, attachment authentication/deletion, actual encrypted WebSocket offer/answer/ICE, and SAS commitment/proof/context/timeout/cancellation tests. A new regression substitutes a prekey in a hostile directory and then supplies a correctly signed different Olm account: signature validation rejects the first and the saved Olm pin rejects the second, with the established conversation still working. Browser QA uses real WebRTC with generated media, not real microphones/cameras, and checks matching words and page-exit cleanup.

This was not exhaustive fuzzing, side-channel analysis, a wasm/compiler supply-chain audit, an exploit assessment of every browser/OS, or a certification of physical-phone audio/push/network behavior.

## Findings and corrections

| Finding | Result |
|---|---|
| Page exit closed media but left the call-word DOM/helper until page disposal; cached-page lifecycle could retain the display. | Fixed: shared SAS cleanup now runs on both hang-up and `pagehide`, closes the helper, empties pending frames/text/accessibility metadata and cancels pending work. A synthetic pagehide test confirms empty text, aria label, title and state. No cipher or identity format changed. |
| Typing/progress documentation implied absolutely no local persistence. | Corrected: the server does not archive these events, and their visible UI state is temporary; local cryptographic reload copies are sealed until the short envelope TTL. Draft text is not transmitted. |
| Contact deletion descriptions implied trust pins were erased. | Corrected: full contact/history/UI data is removed, but minimal P-256 and Olm verification records remain until forgetting the device/site storage, resisting trust-reset substitution. |
| Older feature documentation said no Double Ratchet and used obsolete call-header positions. | Corrected for the v2 transport, current SAS/name layout and quality below the codec stack. |
| Claims of Signal equivalence, universal AES-256 media encryption, quantum protection or guaranteed zero traces would be unsupported. | Documentation now explicitly separates primitives, content types, browser trust, retained history, comparison limits and unverified properties. |

No changes to Olm/Vodozemac, ratchet formats, stored identities, message history or trust-reset policy were made by this release.

## Protocol inventory

| Layer | Actual construction |
|---|---|
| v2 text/state/call signaling | Vodozemac 0.9.0 Olm Double Ratchet via the pinned @towns-protocol/vodozemac 0.1.0 browser/WASM binding. Curve25519/X25519 identity/one-time/ratchet DH, HKDF-SHA-256, AES-256-CBC and HMAC-SHA-256. Olm V2 full 32-byte authentication tag is mandatory. |
| Application authentication | ECDSA P-256/SHA-256 signs identities/prekeys and canonical envelope metadata plus ratchet ciphertext. SHA-256 contact fingerprints are pinned locally. |
| File chunks | Independent fresh 256-bit AES-GCM key per file, 128-bit tag, 96-bit nonce (random 64-bit per-file prefix plus 32-bit chunk index); AAD binds file ID/index/size/expiry. File keys/names/types are encrypted in v2 manifests. |
| Browser retained history/account/sessions | Independent non-exportable AES-256-GCM wrapping key, stored by the same origin. Library pickles are wrapped inside those records. This is not a user-passphrase vault or protection against malicious same-origin code. |
| Voice/video RTP | Browser DTLS-SRTP with fingerprints carried inside authenticated Olm signaling. The browser negotiates the actual media cipher suite. No claim of Double Ratchet, post-quantum recovery or AES-256 for every media packet. |
| Call verification | Fresh ephemeral X25519, SHA-256 commit/reveal, transcript-bound HKDF-SHA-256/HMAC-SHA-256, role-specific confirmations, 44-bit four-word display. Existing device pins/Olm signaling remain active. |
| Historical app v1 | ECDH P-256 + HKDF-SHA-256 + AES-256-GCM and ECDSA P-256 signatures, including static-key readable history copies. Exact authorized migration snapshots only; no new v1 downgrade. |
| Delivery/authentication | HTTPS/WSS TLS negotiated separately; hashed bearer API tokens and single-use WebSocket tickets; standard temporary TURN REST HMAC-SHA-1 credentials; VAPID ECDSA P-256 and Web Push encryption handled by the pinned web-push dependency. These do not replace E2EE contact authentication. |

X25519/P-256 are roughly 128-bit classical constructions, not 256-bit or post-quantum key agreement. SHA-256 output length and AES key length are not the security level of the whole app. No app message/attachment ChaCha20-Poly1305 format is implemented. Browser TLS may negotiate its own suites. Consult [the implementation model](SECURITY.md) and [call verification protocol](CALL_VERIFICATION.md).

## Forward secrecy and recovery

**What is good:** v2 message keys are derived and discarded as transport advances; possession of the old P-256 private key alone does not decrypt v2 transport. Inbound Olm session creation consumes the recipient's actual one-time private key after authenticating the packet. Tests show current Olm state cannot decrypt an already-consumed earlier packet. New traffic cannot silently downgrade to the historical app format.

**What remains exposed:** retained text, file keys/manifests and sealed reload copies are deliberately readable from local history even after the transport key is discarded. Someone able to use the profile/origin and its wrapping key can read that retained history. Unused prekeys/pending unread packets and bounded skipped-message keys are still needed for asynchronous delivery. Skipped keys are not guaranteed erased at an unseen message's disappearing deadline. Closed browsers cannot perform physical disk cleanup. Old app v1 history keeps its original static-key limitations.

**Recovery is conditional:** Olm is designed to recover after temporary state compromise once the attacker loses access and new uncompromised DH contributions are mixed in. Each chat/events/typing/transfer/call stream is independent. A reply on a receipt or typing stream does not refresh a compromised chat stream; one-way sends advancing a symmetric chain alone do not provide new unknown DH entropy. Files use isolated one-use sessions. No app-wide, immediate or ongoing-compromise recovery claim is made. The present tests do not independently prove every post-compromise-healing scenario across all streams.

Calls use the browser's separate ephemeral DTLS-SRTP setup rather than the message ratchet. Signaling authentication and SAS connect the accepted media identities to the call. There is no claim that a compromised live media session heals through per-message Olm ratcheting.

## MITM and identity continuity

A normal on-path attacker cannot substitute trusted signed prekeys/envelopes or media fingerprints without failing validation. Both P-256 fingerprints and accepted Olm identities are pinned. Contact deletion, server roster removal or another tab cannot silently clear those pins for the same identity. Identity changes stop rather than automatically accepting new keys.

First contact still needs authentication: invitations carry the inviter's fingerprint, so a recipient can verify the inviter against a link received through a trustworthy route. The inviter learns the joiner's first keys through enrollment/directory state. A stolen/replaced invite, new contact ID, new browser or cleared storage creates a fresh-trust situation. Names and possession of a link alone do not prove a real-world identity. A safety-number comparison through a trusted route gives ongoing identity assurance; this app has no transparency log/global consistency proof.

The call SAS binds fresh keys **and the accepted DTLS fingerprint sets**, call ID, roles and existing public identity fingerprints. A plain hash of public keys would not offer the same commitment/secret-contribution properties. Commit/reveal and distinct confirmation roles are tested, including substituted contexts and low-order X25519 rejection. ICE/codec changes that retain media certificates retain the words; a changed connected media identity starts a fresh check.

Four 2048-word indices carry 44 comparison bits. Approximately 2^-44 is the nominal ideal false-match probability for an independent attempt, not a formal bound for this application or a promise that attack/human-error rates equal that value. Read every word in order. The dictionary is not guaranteed phonetically distinct. Skipping the check gives no human SAS assurance. A mismatch or unavailable display must not be treated as verification. Voice recognition and shared memories are not cryptographic authentication, and the app does not mark a call human-verified automatically. Matching words cannot defeat client code that lies about its display.

## Threat comparison

| Attacker capability | Protection / exposure |
|---|---|
| Wi-Fi/ISP observer or TURN relay | Content is encrypted; addresses, traffic volume/timing and provider metadata remain observable. Blocking and traffic analysis remain possible. |
| Read-only theft of server database | Ciphertext alone should not reveal current v2 contents; account/contact public metadata and token hashes remain. Host logs, backups and auxiliary infrastructure may contain metadata. |
| Malicious signaling/key-directory responses, with trusted client code | Existing pins, signed prekeys/envelopes and SAS resist substitution; first-contact trust and denial/replay availability remain concerns. |
| Control of website code/deployment/CDN/same-origin application | Can serve malicious JavaScript that reads plaintext or invokes browser keys. Pins, WASM hashes and SAS shown by that code cannot independently defeat it. |
| Device/profile access | Can expose cached history, identities, active/session/skipped keys, media and notifications; non-exportable is not equivalent to hardware isolation or a locked app. |
| Ongoing endpoint control | No reliable confidentiality or post-compromise recovery; the attacker sees fresh plaintext/keys. |
| Future powerful quantum attacker with recorded traffic | Classical X25519/P-256 protection lacks post-quantum agreement/ratchet. AES-256 does not fix that. |

A `/calls` path is part of the site's existing origin; a dedicated origin/subdomain would improve containment but needs a planned identity/storage migration. CSP, no-store, origin checks, quotas, authorization and encrypted storage reduce attack surface without removing this architectural trust. The server knows contact relationships, routing IDs, timing and sizes. ECDSA envelope signatures also reduce deniability relative to symmetric one-to-one message authentication; a signature authenticates the ciphertext/header, not automatically a human's interpretation of its plaintext.

## Beside Signal

The [README comparison](../README.md#webcaller-beside-signal) lists the practical differences. Signal's published design now combines PQXDH, Double Ratchet and SPQR for supporting sessions, and offers automatic key verification based on key transparency where available. WebCaller implements neither post-quantum mechanism nor transparency. Signal's installed clients have a different code-delivery boundary and much more external scrutiny. Both still need endpoint protection and honest treatment of retained history and metadata. Self-hosting and no phone-number registration are WebCaller operational choices, not evidence of superior crypto.

Primary references checked for this review:

- [Olm protocol](https://gitlab.matrix.org/matrix-org/olm/-/blob/master/docs/olm.md) and [Vodozemac source](https://github.com/matrix-org/vodozemac/tree/v0.9.0).
- [Signal Double/Triple Ratchet specification](https://signal.org/docs/specifications/doubleratchet/), [PQXDH](https://signal.org/docs/specifications/pqxdh/) and [SPQR introduction](https://signal.org/blog/spqr/). PQXDH adds hybrid initial agreement; SPQR uses ML-KEM-768 for a sparse post-quantum ratchet. Support/negotiation matters; historical sessions do not all become identical automatically.
- [Signal automatic key verification](https://signal.org/blog/automatic-key-verification/), [availability and limitations](https://support.signal.org/hc/en-us/articles/10223569377562-Automatic-Key-Verification), [safety numbers](https://support.signal.org/hc/en-us/articles/360007060632-What-is-a-safety-number-and-why-do-I-see-that-it-changed), [Sealed Sender](https://signal.org/blog/sealed-sender/).
- [Pinned libsignal transport source](https://github.com/signalapp/libsignal/tree/4beb029d8a941f81e7d9c6d8af1ed25a677569a8/rust/protocol/src), inspected for AES-256-CBC/HMAC-SHA-256/HKDF-SHA-256; the presence of shared primitives does not make the applications equally secure.
- [WebRTC security architecture, RFC 8827](https://www.rfc-editor.org/rfc/rfc8827.html), [Matrix SAS](https://spec.matrix.org/latest/client-server-api/#short-authentication-string-sas-verification) and [ZRTP commitment rationale](https://www.rfc-editor.org/rfc/rfc6189.html#section-4.4.1.1). WebCaller's custom transcript is not certified as Matrix/ZRTP-compatible.

## Remaining work for stronger assurance

An independent integration audit/fuzzing and a deliberate hostile-code/first-contact assessment are the most valuable next steps. Improve origin isolation through a planned migration, maintain dependencies/hosting, verify contacts, and protect browser profiles/devices. Do not bolt on post-quantum or transparency primitives without a reviewed protocol and safe migration plan. See [verification limits](VERIFICATION.md), [browser privacy](BROWSER_PRIVACY.md) and [expiry/storage details](SECURITY.md).
