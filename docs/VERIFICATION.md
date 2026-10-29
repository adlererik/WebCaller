# Release verification — v0.20.0

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

The v0.20.0 application run completed 339 tests: **336 passed, zero failed, three explicit old-Olm migration cases skipped**. The separate official-native libsignal interoperability run passed all **three** tests. Syntax, native installer checks, pinned source/binding provenance and publishing checks also passed. GitHub Actions records the published revision checks. Skipped migration cases do not prove automatic migration of Olm histories/sessions.

Added checks include all 1,407 asset hashes/dimensions, the 690-item Cutouts filter, encrypted Recent/Favorites, signed data-only signaling, bounded encrypted channel framing, store fallback, timer-safe reactions, zero-unused-prekey sticker bursts in an established chat, legacy sticker/control compatibility, context rejection without state mutation, publication retry without identity/prekey reset and fail-closed new-session wording. A disposable browser also transferred an actual sticker over two real peer connections with new handshakes unavailable, authenticated/cache-acknowledged it and applied a timed emoji reaction. These are synthetic checks, not an independent audit.


## Browser and physical-device distinction

Generated-media browser calls survived blackholed signaling sockets on caller and receiver without redialing, with unchanged matching SAS and a continuing timer. Other generated checks cover stored-history refresh, inline media, call controls and full-size encrypted file transfer. These do not simulate every OS radio transition, hardware encoder, battery state or locked-screen sound path.

On real Android/iPhone/desktop devices, test message/reload, calls both directions, SAS comparison, actual voice quality, hardware/CPU behavior, media sharing, camera/output controls, locked-screen Web Push/ntfy and Wi-Fi/cellular handover. Use direct and TURN-only calls across separate networks. A relay candidate only establishes allocation; it is not evidence that relay media traversed every firewall.

## Published artifacts

Release source archives are generated from the audited tag, expand the exact public upstream submodule and include a source manifest and corresponding-source download. Ordinary GitHub automatic archives omit the submodule. The v0.20.0 release uploads complete source TAR/ZIP archives, Linux Docker TAR/ZIP bundles and SHA256SUMS.txt. Docker bundles contain only launcher/Compose/version/license/reference files and pin their matching multi-architecture release images by digest. The earlier v0.19.0 release was source-only. Checksums accompany uploaded archives. Private configuration, identities, database files, personal screenshots, logs, owner links, notification capabilities and deployment URLs are excluded. The included README images use fictional example data.

Public CI runs application and native interoperability/source checks. Native amd64/arm64 image builds and disposable container smoke checks must succeed before the matching prebuilt bundle is published. Rebuilding or testing an established core does not independently validate WebCaller's composition. [Security review and limits](SECURITY_REVIEW.md).

## v0.20.0 Linux distribution

`tests/linux-assistant.test.mjs` exercises credential/instance preservation, snapshot restore/empty-folder recovery, archive corruption/path/link bounds and failed-change recovery. `scripts/docker-smoke.mjs` runs only against a disposable synthetic Compose project, builds the app/setup/relay stack on x86-64 and ARM64, and checks HTTP/WSS, ntfy ACL/priority, TURN allocation, restart persistence and consistent snapshot restoration. CI does not connect to a maintainer's deployed server.

The README screenshots use the real shipped UI components with fictional contacts/messages and an original landscape illustration. They establish appearance, not physical-phone call quality or a cryptographic audit. Reproduce with `node scripts/preview-release.mjs` on loopback; see [image provenance](images/README.md).
