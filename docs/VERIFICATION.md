# Verification of v0.1.0

## Scope

The original application had eleven passing Node tests and short real Chromium WebRTC tests using synthetic audio/video, including direct and relay-only UDP/TCP/TLS, camera replacement, audio-to-video upgrade, critical-profile video pause and ICE restart with fresh credentials. Those relay tests originated inside a LAN using a public-address/hairpin path. Private deployment addresses and credentials are intentionally absent from this public report.

The public release passes 15 Node tests (including first-run secret preservation and publishing guards) and is separately checked for JavaScript/Python/shell syntax, backend/encryption/media/onboarding tests, container builds and health, and tracked-source/archive privacy. The app image passes loopback HTTP/no-store, WebSocket auth-rejection and container-health checks. The relay image accepts an authenticated UDP allocation; Caddy and Compose configurations validate. Guided Caddy/Tunnel selections, existing config preservation and private file permissions are checked without changing system packages. See the release notes and CI for exact results. Installing Docker system packages, real DNS/certificate issuance on another person's server and every router model cannot be certified by source tests.

## Still needs real-world testing

- Physical Android/iPhone calls, both directions, across genuinely separate networks.
- Device AEC/NS/AGC, earpiece/speaker/Bluetooth routing and subjective speech quality.
- Router-level loss/bandwidth shaping, severe burst loss, Wi-Fi transitions and long calls.
- Real reboot/recovery and certificate renewal on each deployment.
- Independent cryptographic/security audit.

## Unsupported guarantees

Guaranteed closed-browser/locked-phone ringing with no install, usable speech through arbitrary outages/zero bandwidth, and zero forensic traces are not possible promises. No Signal Double Ratchet or audited security claim is made.
