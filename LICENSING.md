# Distribution licensing

The integration and combined distribution are **AGPL-3.0-only** because they link libsignal. [LICENSE](LICENSE) contains the full text. The upstream license is also retained in the pinned source submodule and [browser vendor directory](public/vendor/signal/LICENSE-AGPL.txt). Earlier MIT-only Olm releases retain their original licensing.

The original WebCaller application retains its [MIT grant and copyright](LICENSE-MIT). Permissive/Apache licenses on original and dependency components remain attached to them. New binding and signature-integration files are distributed here under AGPL-3.0-only; this does not revoke prior MIT releases.

Use the recursive clone in [Install](docs/INSTALL.md) for complete source. It includes the browser/storage/signature adapter, build scripts, exact dependency locks, official upstream source at its pinned commit and native interoperability tests. GitHub's ordinary Download ZIP does not expand source submodules.

Run `npm run prepare:source` before hosting or building an image, and again after local code changes. It creates `public/preview-source.tar.gz`, served from the test guide, containing tracked application source and complete checked-out upstream source. Retain that offer, the licenses and notices. Modified deployments must provide their corresponding modified source as required by the license; a link to unrelated stable source is not sufficient.

The packager excludes `.env`, phone keys, databases, private QR links, credentials, backups, node_modules and build output. Dependencies/build inputs are pinned with public upstream locations. [Notices](THIRD_PARTY_NOTICES.md) · [Binding build](third_party/libsignal/README.md).

## Character sticker artwork

Bundled community character artwork is separate from the code grants. Original artists/rightsholders retain their rights; no MIT/AGPL artwork license or official endorsement is asserted. Keep [the asset notice](public/stickers/NOTICE.md) and [source/hash catalog](public/stickers/catalog.json) with any copies. A public catalog's availability alone is not a blanket commercial redistribution grant.
