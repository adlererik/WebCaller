# Third-party notices

WebCaller uses ws (MIT) and web-push (MIT), with transitive packages recorded in package-lock.json and pnpm-lock.yaml. Their package licenses remain in installed dependencies.

Optional QR generation uses qrcode 8.2 (BSD). Container/deployment components Node.js, Debian, coturn, Python, Caddy and Docker retain their own licenses; they are obtained separately from official registries/repositories and are not bundled as source binaries in the release. See their upstream license files.

The UI is inspired by familiar private messaging interfaces. It is original application code, is not affiliated with Signal, and does not implement Signal Protocol.


The bundled Vodozemac WASM/JavaScript components provide Olm Double Ratchet messaging and the SAS X25519/HKDF/HMAC primitive. Their exact versions, upstream references and Apache-2.0 license are retained in [the vendor directory](public/vendor/vodozemac/).

The 2048-word BIP-39 English list is used only as the optional call-comparison display alphabet. Source, authors, pinned revision and MIT license are in [third_party/bip39/NOTICE.txt](third_party/bip39/NOTICE.txt).
