# Experimental verification record

Status: **experimental, no independent audit**. This records checks of the isolated libsignal/PQXDH + Ed25519 build, not a stable release or a certification of all phones. Stable Olm migration/release histories are not evidence for this transport.

## Application checks

Before public packaging: **258 tests total; 255 passed, zero failed, three explicitly skipped**. The skips migrate old Olm accounts and do not apply to fresh libsignal accounts. Existing tests cover calls, ordered signaling, identity pins, history/cache persistence, concurrent tabs, deletion/expiry, timers, attachments, alerts, codec selection, transfer pacing and media framing. Some direct Vodozemac tests remain independent SAS/legacy sanity checks.

Signal-specific tests check actual version-4 PQXDH packets; reject Olm/classical protocol substitution, tampered envelopes and changed identities; preserve one-time PQ/EC keys on authentication failure; and fail closed on an old Olm-only account snapshot. Larger wrapped PQ records avoid a spread-stack limit. Vendor bytes must match provenance.

Ed25519 tests check native verification, nonextractable keys, strict framing, forged/substituted certificates, cross-owner replay, old P-256 history/pins/session persistence, corrupt stored signer failure, mixed old/new application identities, signed timers/bundles and matching media-bound SAS. Prekey batches remain within the server request bound.

Run:

```sh
npm ci --ignore-scripts
npm run check
npm test
npm run audit:source
npm run verify:signal
```

Public packaging/build/source tests may add to that historical count; current command output is authoritative. Do not describe a configured future CI run as already successful.

Publication checks also passed two distribution tests: the stable prebuilt launcher refuses this experimental checkout, and the publishing guard rejects a substituted upstream commit or source URL. The combined application results were **257 passed, zero failed, three skipped**. Source packaging verified every regular-file hash and retained only the pinned upstream's internal fixture symlinks; private configuration/runtime files are excluded.

## Independent implementation oracle

The official `@signalapp/libsignal-client` **0.105.1** native package is a development-only reference. Three tests passed: WASM-initiated PQXDH, native-initiated PQXDH and invalid signed-bundle/identity rejection. Each direction completes 50 round trips, observes SPQR data and exercises serialized records, reordered/skipped packets, duplicates and tamper recovery.

```sh
npm --prefix third_party/libsignal/oracle ci --ignore-scripts
npm run test:signal
```

This verifies protocol interoperability, not Signal-service connectivity or the entire application's security. [Build and pin](../third_party/libsignal/README.md).

The root application dependency audit reported no vulnerabilities at publication. The separate development-only oracle tree reports a moderate transitive `uuid` advisory; see [Development](DEVELOPMENT.md) for the scope and why a forced downgrade is not used.

## Browser and transport trials

Disposable browser peers on separate origins retained existing P-256 application identities using certified Ed25519 signers, exchanged signed/encrypted messages, connected video calls and displayed matching fresh SAS. A fresh native-Web-Crypto Ed25519 identity also exchanged messages/calls with a retained identity. Contacts/history remained after refresh and new signed replies arrived. No authentication errors or continuing ring bursts were observed after connection; ordinary Call ended UI notices are expected.

Synthetic audio/video tracks were used. A full generated-data **200 MiB / 3200 chunk** attachment upload/download verified every plaintext byte, deletion cleanup and retry/cancellation behavior. Loopback timing is not an internet/phone throughput promise. A previous browser file-picker trial was not completed; physical picker behavior remains manual.

Public HTTPS and WebSocket checks, exact vendor/source bytes and authenticated TURN allocation were checked for the private trial. No deployment addresses/credentials or private diagnostics are included here. These results do not establish every NAT path, cellular media path or audible locked-phone alert.

## Manual phone checklist

1. Enroll fresh test identities on the separate HTTPS origin; retain the stable phone's storage/icon.
2. Message both ways; refresh, close/reopen chats and check history/cache, edits, replies, reactions and timers/Off.
3. Call both ways in voice/video; compare all four words. Check full-screen portrait fitting and square views on both sides when either phone rotates. Confirm controls and codec/rate rows fade together after four seconds, a tap restores them, and the centered SAS, quality, timer and self preview remain visible. Drag the preview, rotate the phone, and confirm it stays on screen without changing the transmitted video. Switch cameras and networks; check uninterrupted audio, encoder adaptation and recovery from poor conditions.
4. Send a photo/file while talking. Check percentage/spinner, cancellation, retry, cache reuse and continued audible speech.
5. Test Wi-Fi/mobile transitions, weak links and actual relay paths. Complete outages may interrupt sound.
6. Test locked-screen/browser-closed alerts, notification opening and supported actions on each OS. If using ntfy, confirm the sound/opening test and absence of duplicate browser call pushes.

Record browser/OS versions, network conditions and observed limits without publishing private messages or credentials. No test can promise zero traces, screenshot prevention or forced ringing against OS settings.
