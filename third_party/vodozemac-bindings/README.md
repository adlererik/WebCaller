# WebCaller Vodozemac browser binding

Apache-2.0 source adapted from [Towns Protocol bindings](https://github.com/towns-protocol/vodozemac-bindings/tree/561147cb65f416f290b70630e25938881ddf1094/javascript), originally derived in part from Matrix's WASM bindings. This is a WebCaller build, not an upstream Towns npm release. The cryptographic core is the unmodified registry release **Vodozemac 0.11.1**, pinned with its transitive dependencies in `Cargo.lock`.

The adaptation propagates the newer core's fallible outbound-session/encryption results to JavaScript errors, explicitly requires full-authentication **Olm V2** for inbound creation, and returns a normal error instead of a WASM panic for invalid UTF-8 plaintext. The existing two-argument inbound JavaScript API is retained. The `experimental-session-config` feature enables V2; it does not enable a new application protocol. WebCaller continues to reject truncated-tag frames before decryption. No session, identity, SAS transcript or application storage format is deliberately changed.

The source retains the upstream API, including unused group/legacy helpers. WebCaller uses pairwise Olm and SAS; it does not enable Matrix group messaging, HPKE login or key backups by updating this library. Old app-v1 history has its existing limitations.

## Rebuild

Application users do **not** need Rust. The checked-in local browser assets work with the normal source/native/Docker installers.

Maintainers need Python 3, Rust **1.90.0**, its `wasm32-unknown-unknown` target and `wasm-bindgen-cli 0.2.100`. Install those tools in your own development environment, then run from the repository root:

```sh
rustup target add --toolchain 1.90.0 wasm32-unknown-unknown
cargo +1.90.0 install wasm-bindgen-cli --version 0.2.100 --locked
bash scripts/build-vodozemac.sh
npm ci --ignore-scripts
npm test
```

Use `rustup run 1.90.0 bash scripts/build-vodozemac.sh` if your default Rust version differs. The build uses locked dependencies, explicit WASM randomness, release/LTO optimization and normalized source/cache paths. It refreshes the browser binary/glue/types, loader hash, dependency notices, lock copy and source/artifact hashes in `public/vendor/vodozemac/provenance.json`. The lock and manifest identify the inputs; rebuild and compare hashes before distributing changed artifacts. Build tools/dependencies are not installed on a running server by this command.

`vodozemac-legacy-test` is an exact-pinned **development-only** alias for the previous `@towns-protocol/vodozemac@0.1.0` engine (core 0.9.0). It is used only by synthetic interoperability/upgrade tests, omitted by production `npm ci --omit=dev`, and never loaded by browser code. It lets tests exercise an actual old engine, rather than merely asserting that two new engines agree.

This binding and WebCaller's integration have not received an independent security audit. Pinned hashes and successful tests do not remove trust in website-delivered code.

The build removes only the optional WASM `producers` section, whose compiler-description text can vary across build hosts. Debug names and target features remain. A regression pins all executable/module data sections against the preceding 0.11.1 build; the runtime code is unchanged. Tool versions and hashes remain in the provenance file. CI rebuilds and compares the complete canonical assets byte for byte, with the original loader integrity check still enforced.
