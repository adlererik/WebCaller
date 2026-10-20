# Release verification — v0.18.0

Verification checks the implementation at a reviewed revision; it is not an independent audit or a guarantee for every phone. Do not point tests at real accounts, notifications or production databases.

## Reproduce the source checks

Use Node 24 and a recursive clone of the release:

```sh
npm ci --ignore-scripts
npm run check
npm test
npm run audit:source
npm run verify:signal
npm run prepare:source
npm --prefix third_party/libsignal/oracle ci --ignore-scripts
npm run test:signal
```

The pinned official source must be pristine. Source verification checks its commit, original license and binding/lock/WASM hashes. The browser loader verifies the checked module's SHA-256 before instantiation. Exact build/rebuild commands and tool versions are in [the binding guide](../third_party/libsignal/README.md). The oracle's native dependency is development-only; it is not installed on phones or used as a runtime fallback.

## Evidence covered

- Strict PQXDH v4, both initiation directions and 50 native/WASM round trips each with SPQR data observed in both directions; serialized sessions, reordered/skipped/duplicate/tampered packets and identity/signed-bundle substitution.
- Application Ed25519 direct/certified signatures, retained P-256 anchors, persistent application/libsignal pins after roster/contact changes, explicit corrupt-state failure and atomic account/session/history writes.
- Independent 44-bit media-bound committed SAS: matching words, role/context/commitment/media mismatch rejection, retries, handover and cleanup; no transport secret export.
- AES-GCM attachment chunks, participant authorization, 200 MiB/index limits, local ciphertext caching, expiry/deletion/replay boundaries, sender/recipient view timers, sender-only edits and authenticated receipts.
- Signaling order/replay/answered-tab ownership; dead OPEN socket replacement, fresh ICE correlation/candidate matching and tiny-video recovery without increasing voice budgets.
- Retired path 404/no redirect, new-path authenticated WS, owned push subscription replacement, foreign-account rejection, failed migration retry and unrelated worker preservation.
- Docker setup input validation, preserved private config/volumes, explicit Olm-upgrade refusal, version/checksum/digest/tamper checks; disposable runtime smoke tests for app health, WS authentication, ntfy ACL/priority/test delivery, TURN allocation, QR and restart persistence.
- Syntax, source packaging, private-data publishing guard and reviewed dependency/provenance checks.

The v0.18.0 application suite passed 302 tests (299 passes, zero failures, three explicit old-Olm migration skips), including the release-specific distribution/update checks. GitHub Actions and the final release notes record the published build result. Three native interoperability tests are separate. Skipped old Olm cases are not proof that Olm histories/sessions migrate automatically.

## Browser and physical-device distinction

Generated-media browser calls survived blackholed signaling sockets on caller and receiver without redialing, with unchanged matching SAS and a continuing timer. Other generated checks cover stored-history refresh, inline media, call controls and full-size encrypted file transfer. These do not simulate every OS radio transition, hardware encoder, battery state or locked-screen sound path.

On real Android/iPhone/desktop devices, test message/reload, calls both directions, SAS comparison, actual voice quality, hardware/CPU behavior, media sharing, camera/output controls, locked-screen Web Push/ntfy and Wi-Fi/cellular handover. Use direct and TURN-only calls across separate networks. A relay candidate only establishes allocation; it is not evidence that relay media traversed every firewall.

## Published artifacts

Release source archives are generated from the audited tag, expand the exact public upstream submodule and include a source manifest and corresponding-source download. Ordinary GitHub automatic archives omit the submodule. Docker bundles contain only launcher/Compose/version/license/reference files and pin release images by digest. Checksums accompany uploaded archives. Private configuration, identities, database files, screenshots, logs, owner links, notification capabilities and deployment URLs are excluded.

Public CI runs application and native interoperability/source checks. Native amd64/arm64 image builds and disposable container smoke checks must succeed before the matching prebuilt bundle is published. Rebuilding or testing an established core does not independently validate WebCaller's composition. [Security review and limits](SECURITY_REVIEW.md).
