# Developing the experimental branch

Use Node 24+, Python 3, Git and a recursive source checkout. The bundled Signal/Vodozemac WASM runs in ordinary browsers; Rust is only for rebuilding it. Do not point development processes at a live database or hostname.

```sh
npm ci --ignore-scripts
npm run check
npm test
npm run audit:source
npm run verify:signal
npm run prepare:source
```

The publication guard scans tracked application source and validates the official upstream gitlink separately. The checked-out upstream must be pristine and at the pinned commit. `.runtime`, `.env`, node_modules, databases, private QR links, screenshots of personal conversations, infrastructure logs and build output must not be committed. Use disposable identities/synthetic media.

The [binding guide](../third_party/libsignal/README.md) explains the exact Rust/wasm-bindgen build and native oracle:

```sh
npm --prefix third_party/libsignal/oracle ci --ignore-scripts
npm run test:signal
```

These native binaries are development-only references, not browser or server runtime dependencies. Updating an upstream pin requires reviewing protocol/state compatibility and regenerating provenance, notices/source offer and meaningful tests. Do not change libsignal internals just to make a browser test pass.

The oracle's pinned dependency tree currently reports the moderate [uuid buffer-bounds advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq) through `@signalapp/types` / `uuid` 13.0.0. This is separate from the root application's dependency tree; those native test packages are not served to phones or installed for production. Keep the oracle isolated and use its synthetic test inputs. Do not run `npm audit fix --force`: the suggested package downgrade would stop matching the checked protocol version. Review the oracle lock when updating upstream.

The application suite includes explicit skips for three old Olm-account migration cases: this branch uses fresh libsignal accounts. Direct Vodozemac tests remain useful for its independent SAS and legacy sanity checks; passing them is not evidence that Signal transport works. The separate native oracle establishes that interoperability.

CI runs source/syntax/tests/publishing and source-offer checks on this branch. Stable image publication is restricted to the stable branch; no experimental image/release is published automatically. Dockerfiles/source recipes are advanced development paths, not a tested prebuilt experimental bundle. Generated-phone media tests cannot establish audible quality, battery use, OS routing or locked-device alerts.

Original WebCaller source keeps its MIT notice; the combined libsignal distribution/integration uses AGPL-3.0-only. Preserve [licensing](../LICENSING.md), corresponding source and dependency notices. Report vulnerabilities privately via [SECURITY.md](../SECURITY.md).
