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

Set the package version and CHANGELOG, run checks/tests/container smoke tests, stage source and run the source audit before committing. Tag the reviewed commit. `node scripts/package-release.mjs v0.1.0` archives only tracked files, produces ZIP/tar.gz and SHA256SUMS.txt under ignored .runtime/releases. Upload those assets to a GitHub release for that tag. Never tar the working directory with .env/data/runtime included. The GitHub automatic source archives are also available.

CI runs install, syntax, tests, tracked-source audit and builds the app/relay containers with read-only repository permissions. It uses pinned action commits. No deployment, signing key or provider secret is required to test this source.
