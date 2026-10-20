# Official libsignal browser integration

The browser uses unmodified official libsignal **v0.105.1**, commit `1738ead8a12ffe539f6309958123dadb16dc3b95`. `upstream/` is the pinned public Git submodule, `binding/` is the small custom AGPL-3.0-only Rust/WASM adapter and exact Cargo lock, and `oracle/` contains tests against official `@signalapp/libsignal-client` 0.105.1. This is not an official Signal browser SDK or supported Signal client.

## Source and runtime

```sh
git submodule update --init --recursive
npm run verify:signal
```

Phones load the ready-made checked WASM in `public/vendor/signal/`; they need no Rust, Node package or native app. The server does not load the native oracle. The loader verifies the recorded WASM SHA-256 before instantiation. Source/lock/artifact pins are in [provenance](../../public/vendor/signal/provenance.json).

The module is 1,078,988 bytes, approximately 313,820 gzip bytes for the checked build. The independent Vodozemac SAS module remains; neither number is a device startup or power benchmark. PQ account/session records are larger than the old Olm records.

## Build the binding

Install Rust **1.98.1** with `wasm32-unknown-unknown`, a C compiler, Python 3 and `protoc`. Install wasm-bindgen-cli **0.2.100** from its registry. From the project root:

```sh
rustup toolchain install 1.98.1 --profile minimal --target wasm32-unknown-unknown
cargo +1.98.1 install wasm-bindgen-cli --version 0.2.100 --locked
npm run build:signal
npm run verify:signal
```

The build script uses Cargo `--locked`, wasm-bindgen's bundler output and no producer section; it remaps source/cache paths so private home directories are not embedded. It refreshes the loader pin/provenance for the generated artifact. Exact byte reproducibility also depends on toolchain/platform/dependencies; a future CI rebuild is not evidence until it has run successfully. No libsignal protocol source is patched. The wrapper retains both wasm getrandom backend versions required by the dependency graph.

## Official native oracle

With Node 24 on a platform supported by the official native package:

```sh
npm --prefix third_party/libsignal/oracle ci --ignore-scripts
npm run test:signal
```

Both initiation directions complete 50 round trips and observe SPQR data. Tests cover serialized session records, reordered/skipped packets, duplicate/tampered packets and signed-bundle/identity substitution. Native package integrity is pinned in its lock and browser provenance. This reference is development-only; it is never a browser fallback.

## Adapter boundary

The adapter calls upstream account/prekey/session/encrypt/decrypt operations, provides bounded serialization/in-memory stores and wraps resulting persistent snapshots in WebCaller's atomic AES-GCM secure store. It supplies expected peer identities, requires PQXDH v4 and consumes one-time EC/PQ keys only after authenticated decryption. It does not expose root/chain secrets for SAS.

The JavaScript application signs encrypted routing/context and prekey publications with Ed25519. Older test P-256 identities retain their pins through a certified Ed25519 signer. This is separate from upstream XEdDSA and from the fresh X25519 call SAS. Live media remains DTLS-SRTP. [Threat model](../../docs/SECURITY.md) · [Architecture](../../docs/ARCHITECTURE.md).

This directory combines official AGPLv3-only source, a custom AGPLv3-only binding and dependency locks. Preserve corresponding source and [notices](../../THIRD_PARTY_NOTICES.md). `npm run prepare:source` packages the clean upstream plus tracked application/binding/build/oracle source for the hosted source offer. Private runtime/configuration and dependencies installed in node_modules are excluded.
