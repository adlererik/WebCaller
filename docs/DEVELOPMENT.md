# Development and release workflow

Use Node.js 24 (SQLite DatabaseSync is built in) and Python 3 for optional router/QR tools. All frontend assets are local; there is no bundler or third-party CDN. npm is the standard documented package manager; the original pnpm lock is also retained for source completeness.

```sh
npm ci
npm run check
npm test
npm run audit:source
npm run setup
```

For loopback development set PUBLIC_URL=http://localhost:8080/calls in private .env, then npm start. Do not publish that URL as a phone link. HTTPS is required on real phones.

The synthetic browser harness runs on localhost:8090 and can use direct/UDP/TCP/TLS paths. It requests no real microphone/camera: tones/canvas are generated in memory. The invitation/messaging harnesses are disposable local fixtures, never production services. Use a fresh browser origin/profile for owner enrollment tests. Physical device, external network, subjective speech quality, power management and WAN shaping tests are separate.

## Contributing

Read [CONTRIBUTING.md](../CONTRIBUTING.md). Small changes should include meaningful tests where auth/crypto/adaptation behavior changes. Keep deployment-specific values in .env, never example source. Native runtime helpers are advanced; do not claim the guided Docker installer exercised them.

## Building a release

Set the package version and CHANGELOG, run checks/tests/container smoke tests, stage source and run the source audit before committing. Tag the reviewed commit. `node scripts/package-release.mjs v0.16.0` archives only tracked files, produces ZIP/tar.gz and SHA256SUMS.txt under ignored .runtime/releases. Inspect both archives before uploading them to a GitHub release for that tag. Keep this an explicitly marked preview until its assurance and device-testing limits change. Never tar the working directory with .env/data/runtime included. The GitHub automatic source archives are also available.

CI runs install, syntax, tests, tracked-source audit and builds the app/relay containers with read-only repository permissions. It uses pinned action commits. No deployment, signing key or provider secret is required to test this source.

## Public distribution review

Use reserved examples (`calls.example.com`, `ntfy.example.com`, `/opt/webcaller`) rather than copying a live deployment. Review staged changes, tracked assets, Git history and release notes for private hosts, IPs, account/tunnel IDs, tokens, setup/invitation links, subscription topics, logs and screenshots. The publishing guard catches known credential/runtime patterns; it cannot recognize every private value or scrub older commits. Build source archives from the reviewed tag with the supplied script, never from a deployed directory. Checksums detect archive changes; a checksum served with an archive is not an independent signature.

A public report should contain commands and results with infrastructure metadata removed. Do not publish actual `.env` files, databases, server-generated configuration or first-phone QR cards. Review CI output too. See [Security](SECURITY.md) and [Operations](OPERATIONS.md).

## Build the complete prebuilt stack from source

You can build the same three project images without using GHCR. With Docker on Linux, run from a reviewed source checkout:

```sh
docker build -t webcaller-local:app .
docker build -f deploy/Dockerfile.setup -t webcaller-local:setup .
docker build -f deploy/Dockerfile.turn -t webcaller-local:turn .
```

Copy the tracked `docker/` files and root `LICENSE` to a fresh installation folder outside the checkout. In that folder's `images.env`, set `WEBCALLER_IMAGE=webcaller-local:app`, `SETUP_IMAGE=webcaller-local:setup` and `TURN_IMAGE=webcaller-local:turn`; keep upstream images pinned. Then follow the same setup/start/QR guide. Private configuration belongs to the installation, not Git. The older Debian source-builder remains available too.

`Prebuilt Docker images` CI builds and runs disposable real stacks on native amd64 and arm64 runners. Its publishing mode is manually dispatched with an existing reviewed version tag; it tests before pushing architecture tags and combines them only after both pass. Release tags are not overwritten. All three project variants share the public `ghcr.io/adlererik/webcaller` package with version, `-setup` and `-turn` tags; set that package public and verify anonymous pulls before advertising downloads. The source/revision labels link builds to the project.

After publication, obtain the three multi-architecture manifest digests and run `node scripts/package-release.mjs v0.16.0 PATH_TO_DIGEST_JSON`. That JSON maps `WEBCALLER_IMAGE`, `SETUP_IMAGE` and `TURN_IMAGE` to their `sha256:` digests. This produces the normal source archives plus small Docker ZIP/tar bundles and one checksum file. The Docker bundle includes only its six public files and pins every image; it never includes generated configuration or a data volume. Measure compressed platform layers after publication when reporting download size; shared layers may reduce actual transfer.
