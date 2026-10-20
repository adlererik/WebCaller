# Third-party notices

WebCaller uses ws (MIT) and web-push (MIT), with transitive packages recorded in package-lock.json and pnpm-lock.yaml. Their package licenses remain in installed dependencies.

Optional QR generation uses qrcode 8.2 (BSD). Container/deployment components Node.js, Debian, coturn, Python, Caddy, ntfy, cloudflared and Docker retain their own licenses. Source/setup ZIPs contain no operating-system binaries; prebuilt images obtain dependencies from their upstream releases/registries. The setup image includes the checksum-verified official ntfy 2.31.1 executable for isolated initialization, with its archive license retained at `/usr/share/doc/webcaller-ntfy/LICENSE`. Its source is available at https://github.com/binwiederhier/ntfy/tree/v2.31.1. Official ntfy/Caddy/cloudflared runtime images retain their upstream notices. See their upstream license files.

The UI is inspired by familiar private messaging interfaces. It is original application code and is not affiliated with Signal. This release uses official libsignal through a custom browser binding; it is not an official Signal client and cannot contact Signal accounts/services.


Bundled Vodozemac provides the independent SAS X25519/HKDF/HMAC primitive here; new message/signaling encryption uses libsignal. Direct Olm tests remain legacy checks, not a runtime fallback. Exact Vodozemac versions, references and Apache-2.0 license are in [the vendor directory](public/vendor/vodozemac/).

Official libsignal v0.105.1 is AGPL-3.0-only, pinned at `1738ead8a12ffe539f6309958123dadb16dc3b95`. Its [source submodule](third_party/libsignal/upstream), [binding/lock](third_party/libsignal/binding), [native oracle](third_party/libsignal/oracle) and [build guide](third_party/libsignal/README.md) are included. The combined distribution is AGPL-3.0-only; original MIT grants remain in LICENSE-MIT. The browser vendor directory retains the upstream license/provenance. [Rust dependency licenses/notices](third_party/libsignal/licenses/DEPENDENCIES.md) include SPQR v1.6.0 and its public source commit. Preserve the source offer described in LICENSING.md.

The current locally built binding adapts Towns Protocol's Apache-2.0 source for Vodozemac 0.11.1. Its [source/build instructions](third_party/vodozemac-bindings/README.md), dependency lock and generated dependency license notices are included. The previous Towns 0.1.0 package (Vodozemac 0.9.0) is retained only as a development-test dependency for compatibility checks; it is not a production/browser fallback.

The 2048-word BIP-39 English list is used only as the optional call-comparison display alphabet. Source, authors, pinned revision and MIT license are in [third_party/bip39/NOTICE.txt](third_party/bip39/NOTICE.txt).
