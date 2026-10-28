# Source review and limits

Reviewed against the libsignal/PQXDH integration, Ed25519 application signatures and v0.19.0 release changes through 28 October 2026. This is a maintainer-assisted implementation review and test record, **not an independent audit, proof or Signal endorsement**. Historical stable Olm reviews do not certify this adapter.

## Protections checked

- Unmodified official v0.105.1 source pin, WASM checksum and binding/lock provenance; explicit v4 PQXDH and native interoperability both ways with SPQR traffic.
- Expected peer identity supplied to upstream stores; persistent application/libsignal pins; substituted prekeys/identities rejected.
- Atomic account/session/history commits, authenticated one-use EC/PQ prekey consumption, cross-tab fencing, skipped/reordered/duplicate/tampered input handling.
- Ed25519 envelope/prekey signatures, account-bound P-256-to-Ed25519 signer certificates, nonextractable keys, preserved pins/history and corrupt-state failure without identity reset.
- Authenticated/ordered call signaling, committed media-bound optional SAS, no continued ringtone after connection in generated-media browser checks.
- AES-GCM file chunks and ratcheted manifests, transfer pacing/cancellation/retry, history/cache persistence and retention boundaries.

## Unresolved boundaries

The wrapper is custom; this is not an official supported browser API. Interoperability is not proof of secure composition. Recovery must reach each affected stream. Stored history/file keys remain accessible to a compromised usable origin/profile. Malicious website updates can use nonextractable keys and read plaintext. Existing P-256 anchors remain trust anchors.

Outer signatures alter deniability. The native MAC is eight bytes, not the stable Olm MAC. PQXDH/SPQR does not make DTLS media, classical identity authentication or SAS post-quantum. No key transparency, Sealed Sender, anonymous transport or Signal-equivalent metadata protection is claimed.

Real-device microphone quality, power, locked-screen sound, storage eviction, media pickers and radio handovers require physical trials. TURN allocation/page load is not an end-to-end call test. No zero-trace, universal screenshot prevention or forced closed-browser ringing claim is possible.

[Verification commands](VERIFICATION.md) · [Binding/oracle](../third_party/libsignal/README.md) · [Threat model](SECURITY.md) · [SAS](CALL_VERIFICATION.md).

## Release additions checked

The release adds authenticated same-page handover recovery, acknowledged dead-socket detection, fresh correlated ICE generations and audio-gated video recovery. These change transport reliability, not cryptographic keys/algorithms. Retired routes reject old HTTP/WS paths without revealing the replacement, and push migration replaces only an authenticated owner's previous endpoints after the new subscription is accepted. Public source examples contain no deployment-specific paths.

Release-matched Docker bundles explicitly select the libsignal engine and use a new bundle format so old Olm updaters cannot silently cross the protocol boundary. Complete source archives expand the pinned upstream gitlink and include the hosted corresponding-source offer. Independent review of the composition is still outstanding.


The sticker update additionally checks authenticated AES-GCM/Signal manifests, bounded encrypted data-channel frames and cache acknowledgements; zero-unused-prekey sending through an established chat; backwards reading of old file-scoped stickers; rejected context substitutions without committing state; automatic publication retries without identity replacement/prekey resurrection; and fail-closed wording for a genuinely new session without starter material. Physical-phone acceptance and an independent composition audit remain separate from these checks.
