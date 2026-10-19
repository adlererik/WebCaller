# Experimental security model

This describes the libsignal/PQXDH branch, not stable Olm. The official core is pinned to v0.105.1, commit `1738ead8a12ffe539f6309958123dadb16dc3b95`, with unmodified protocol source. The browser/storage/signature integration and custom SAS have **no independent audit or formal proof**. An established library does not prove its surrounding application correct.

## Encryption

| Layer | Actual construction |
|---|---|
| Establishment | Version-4 PQXDH, X25519 + Kyber-1024, signed EC/PQ prekeys and upstream XEdDSA. No silent classical v3 session. |
| Ratchet | Upstream Double Ratchet + SPQR v1.6.0 as Triple Ratchet. SPQR uses incremental ML-KEM-768; tests observe its traffic both ways. |
| Message ciphertext | AES-256-CBC, HMAC-SHA-256 with an **8-byte MAC**, HKDF-SHA-256-derived keys. Not the stable branch's full-length Olm MAC. |
| Application signatures | Native Web Crypto Ed25519 on encrypted routing/header/ratchet statements and prekey publications. Existing test P-256 anchors can certify a nonextractable Ed25519 signer. |
| Attachments | Fresh AES-256-GCM key per file, 128-bit tags, indexed 96-bit chunk nonces and authenticated file/index/expiry context. Manifests/keys travel inside ratcheted encryption. |
| Local records | Nonextractable AES-256-GCM wrapping key for serialized ratchets, history, timers and file/cache metadata. Private application CryptoKeys persist by IndexedDB structured clone. |
| Live media | Browser-negotiated DTLS-SRTP, independent of the message ratchet; not made post-quantum secure by PQXDH. No fixed media AES key size is promised. |
| SAS | Fresh X25519, SHA-256 commitment, HKDF/HMAC-SHA-256; 44 display bits binding call/role/identity/media context and fresh contributions. |
| Delivery | HTTPS/WSS; TURN REST HMAC-SHA-1 credentials and separate Web Push ECDSA P-256 VAPID keys. Delivery plumbing, not content ciphers. |

Initial **Kyber-1024** and SPQR's ongoing **ML-KEM-768** are different components. Do not relabel the initial KEM ML-KEM-1024. Classical Ed25519/P-256 authentication, SAS and DTLS remain separate from hybrid message secrecy; the whole application is not automatically quantum resistant. [PQXDH](https://signal.org/docs/specifications/pqxdh/) · [Ratchet](https://signal.org/docs/specifications/doubleratchet/) · [SPQR](https://signal.org/blog/spqr/).

## Authentication and continuity

An invitation authenticates the inviter's fingerprint when delivered through a trusted channel. Application fingerprints and separate libsignal identity pins persist locally, including after contact/history removal. A server roster must not silently authorize replacement keys. First contact by code trusts the initial directory mapping; compare SAS or verify through another trusted channel. A familiar name/code is not identity proof.

Fresh accounts have Ed25519 application identities. Earlier libsignal test accounts retain their original P-256 anchors. The anchor signs a domain-separated certificate binding an Ed25519 public signer to the account ID. Generation occurs once under a fenced transaction; the private key is nonextractable and persists across tabs/reloads. Versioned `ed25519-v1` framing carries a direct signature or the certified signer, certificate and signature. Browser and server validate both. Corrupt state, forged certificates, cross-owner reuse and malformed suites fail closed, without identity reset or algorithm fallback.

Historical P-256 signatures and prekey signatures remain verifiable. Updated clients emit Ed25519, so refresh older loaded pages. P-256 anchors remain part of those accounts' trust model. This is custom application continuity code, not a libsignal key conversion or a forward-secrecy upgrade.

Outer public signatures provide transferable ciphertext authentication. **Do not claim Signal's complete deniability properties.** No ratchet root/chain secret is exported for the SAS or application signatures.

## Forward secrecy and compromise recovery

Consumed ratchet keys are discarded, limiting exposure of recorded traffic from later state compromise under the protocol assumptions. Skipped/out-of-order storage, serialization, prekey lifetime and transaction boundaries still matter.

Retained readable history/file keys are stored separately. A compromised usable origin/profile can expose them even after old transport keys are erased. Off messages persist until deletion. A recipient's unread timed copy can remain after the sender expires, until first view/deletion. Disappearing messages are retention behavior, not guaranteed secure erasure.

Recovery requires the attacker to lose access and fresh uncompromised exchanges to reach the affected stream. Chat/events/call/typing/transfer/file scopes are separate; one healed stream does not prove all are healed. One-way traffic alone does not ensure classical DH recovery; SPQR exchanges must complete too. A still-compromised browser/identity defeats those assumptions.

## Media, SAS and MITM

Signed/ratcheted signaling authenticates accepted media setup. The optional committed SAS binds actual accepted DTLS fingerprints and application identities. Read **all four words in order**. A mismatch must not be ignored. Skipping does not block calling, so it gives no extra human verification.

Four 2048-word indices provide 44 comparison bits, not a password or globally unique ID. Words are local DOM, not transmitted video pixels. No human-verified flag/SAS transcript persists. State is released at end/change/failure, subject to browser memory-management limits. [Exchange](CALL_VERIFICATION.md).

## Exposure and limits

- Website/CDN/operator updates, other same-origin code, extensions or an owned phone can read plaintext/use keys. A URL path is not origin isolation.
- Servers see account/contact/routing/timing/size/code/push metadata; TURN sees network endpoints and traffic patterns. No Sealed Sender, anonymity routing or traffic-padding protection is claimed.
- A server can delay/drop traffic, deny service, exhaust prekeys or lie during first contact. Pins and limits do not make a malicious server harmless.
- Browser/OS history, caches, service workers, notifications, screenshots, recipient copies and backups may remain. Zero traces and universal screenshot prevention are not possible promises.
- Generic push/ntfy alerts omit conversation plaintext/keys, but leave metadata. Successful publishing does not prove audible delivery.
- Radio outages, browser hardware limits and OS suspension affect calls/alerts. Synthetic tests do not certify physical-phone quality.

## Installation and publishing

Use a separate directory/database/hostname/service/port and fresh owner/VAPID secrets. Do not import stable Olm accounts or clear stable phone storage. Exact authorized v1 compatibility is only for earlier test history; new traffic cannot downgrade to v1.

Keep `.env`, keys, private QR links, databases, server credentials, infrastructure diagnostics and backups out of Git. The publishing guard is not a complete scanner/audit. Official upstream is a pinned public source submodule; the source offer requires that clean checked-out source and excludes local state.

Independent review should cover the adapter, storage, signatures, call binding and deployment. Signal's supported clients have substantially greater scrutiny. [Comparison](../README.md#forward-secrecy-mitm-and-comparison-with-signal) · [Verification](VERIFICATION.md) · [Reporting](../SECURITY.md).
