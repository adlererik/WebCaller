# Contributing

This is the experimental libsignal/PQXDH branch. Use a recursive clone and keep the upstream source pinned/pristine. Follow docs/DEVELOPMENT.md and third_party/libsignal/README.md. The combined integration uses AGPL-3.0-only; retain original/dependency notices. Run npm run verify:signal and the native oracle for cryptographic integration changes, and regenerate the source offer before hosting. Stable Olm state is not a migration fixture. Do not publish stable container tags from this branch.

Use Node 24 and npm ci. Run npm run check, npm test and npm run audit:source before a pull request. Explain the concrete behavior changed and its validation. Use synthetic or disposable accounts for tests; never publish real identities, private QR links, .env files, certificates, databases or infrastructure diagnostics.

Privacy, authentication and media changes need meaningful regression coverage. Keep browser support/quality claims proportional to real test evidence. Review beginner documentation when changing configuration or installation. Report vulnerabilities privately as described in SECURITY.md.
