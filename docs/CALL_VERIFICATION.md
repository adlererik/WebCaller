# Optional four-word call check

Calls work normally without reading or confirming anything. After both browsers connect, four English words appear in the same font as the codec information. In video calls the name sits at the upper left, aligned with the codec icons, and the words are centered on the screen in that same row. The codec/rate rows stay aligned, with call quality underneath. Both voice and video calls have the display. It is a local DOM overlay and is never drawn into the transmitted media.

Ask the other person to read all four words, in order, and compare them to yours. If any differ, avoid discussing sensitive information and end the call. A matching comparison gives probabilistic protection against a network MITM under trusted client software and a trustworthy human comparison. It cannot protect against malicious website code or compromised endpoints. The application never asserts that you performed the comparison.

“Call words · preparing…” means the exchange is still running. “Call words unavailable” can mean an older client, missing media fingerprints, an interrupted exchange or a validation failure. None stops the call. Reopen the page on both phones after upgrading. Existing contact identities, messages and call encryption remain intact.

## Protocol v1

Existing pinned identities and signed Olm v2 signaling remain mandatory. Both peers advertise `sasVersion: 1` in their authenticated offer/answer. The check starts after the media connection is connected.

1. Both endpoints independently construct identical canonical JSON context: protocol domain, call ID, caller/callee user IDs, their existing public-identity fingerprints, and normalized/sorted SHA-256-or-stronger DTLS fingerprint sets from the accepted local/remote SDP. ICE addresses and codec preferences are excluded.
2. The caller generates a fresh Vodozemac SAS X25519 key pair and random 32-byte nonce, then sends SHA-256 of `[domain, "commit", context, callerPublicKey, callerNonce]`. Only the commitment and context hash are revealed.
3. On receiving that commitment, the callee generates a fresh SAS key pair and nonce and sends the public contribution. It retains the commitment for checking the later reveal.
4. The caller computes X25519 and sends its committed contribution plus a `caller-confirm` HMAC. The callee verifies the commitment, computes X25519 and verifies this proof before sending a `callee-confirm` HMAC. Non-contributory/low-order public keys are rejected by Vodozemac.
5. The HKDF/HMAC info is canonical JSON `[domain, context, commitment, callerPublicKey, callerNonce, calleePublicKey, calleeNonce]`. Confirmation inputs are role specific. An independent `display-words` HMAC input supplies the first 44 bits for four 11-bit indices into the bundled 2048-word alphabet. These words are a public checksum, not an encryption key or account recovery phrase.
6. Each endpoint displays words only after checking its counterpart's key confirmation. The callee's public confirmation can be retransmitted on an identical caller reveal. Private SAS and shared-secret objects are freed after completion; only the display and bounded public replay-response material remain for the current call.

Frames use `kind: "sas"` within active-call Olm envelopes. They are not saved as local history, and no SAS private state, words or human-verification record is written to IndexedDB, localStorage, cookies, notifications or URLs. Existing ratchet state still commits atomically. Duplicates are handled at the call protocol layer with fresh encrypted envelopes for retries, avoiding replaying an already-consumed Olm message key.

There is one round per media identity context, no unbounded automatic re-key attempts. Each outbound handshake stage has at most four transmissions, spaced by five seconds; the check has a 45-second deadline. Stale contexts/rounds are ignored. A call can continue without the check. Ordinary ICE handovers retain its words; changed media fingerprints clear them and start a new ephemeral check. At hang-up and page exit (`pagehide`), timers, references, pending frames, visible text, titles and accessibility labels are cleared. Deferred startup is checked against the current live media connection, and closing the helper prevents late words from reappearing. Browser/OS forensic erasure cannot be promised.

## Scope and review

This application-specific integration has not had an independent security audit. It does not replace identity pinning or authenticate offline conversations through voice recognition. SAS verification is conditional on actually comparing all four words accurately and in order. Spell/repeat an unclear word; the dictionary is not guaranteed phonetically distinct. The nominal ideal false-match probability is 2^-44 (about 1 in 17.6 trillion per independent attempt), not a formal audit result or a guarantee against human mistakes. Matching words protect this call under trusted clients, not all prior/offline messages, and a malicious client can lie about its display. A four-word sequence may statistically repeat; each call uses fresh material rather than promising global uniqueness.

References: [Matrix SAS](https://spec.matrix.org/latest/client-server-api/#short-authentication-string-sas-verification), [ZRTP commitment design](https://www.rfc-editor.org/rfc/rfc6189.html#section-4.4.1.1), [WebRTC media identities](https://www.rfc-editor.org/rfc/rfc8827.html#section-7.4). The word alphabet is MIT-licensed BIP-39 English; it is used only for display. See [its notice](../third_party/bip39/NOTICE.txt).

The [source review](SECURITY_REVIEW.md) explains MITM, identity continuity and forward-secrecy limits; the [README](../README.md#webcaller-beside-signal) compares the design with Signal.
