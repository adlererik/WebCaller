# Verification of v0.3.0

## Scope

The original application had eleven passing Node tests and short real Chromium WebRTC tests using synthetic audio/video, including direct and relay-only UDP/TCP/TLS, camera replacement, audio-to-video upgrade, critical-profile video pause and ICE restart with fresh credentials. Those relay tests originated inside a LAN using a public-address/hairpin path. Private deployment addresses and credentials are intentionally absent from this public report.

The public release passes 23 Node tests (including attachment integrity/order/expiry, authorization/quota/cleanup, front/back switching/restoration, first-run secret preservation and publishing guards) and is separately checked for JavaScript/Python/shell syntax, backend/encryption/media/onboarding tests, container builds and health, and tracked-source/archive privacy. The app image passes loopback HTTP/no-store, WebSocket auth-rejection and container-health checks. The relay image accepts an authenticated UDP allocation; Caddy and Compose configurations validate. Guided Caddy/Tunnel selections, existing config preservation and private file permissions are checked without changing system packages. See the release notes and CI for exact results. Installing Docker system packages, real DNS/certificate issuance on another person's server and every router model cannot be certified by source tests.

Additional two-browser synthetic checks cover automatic photo/video/audio previews on both sides, captions, selfie capture with camera switching, emoji search/selection, voice recording/preview/playback, video playback in the full-screen viewer, recipient/sender deletion, viewer closure on remote deletion and deletion persistence after reload.

Browser UI checks on a disposable loopback origin used generated camera/audio, not real microphones or contacts. They covered sending a photo and a text file through the + menu, verifying downloaded file bytes, decrypting a received photo, Automatic/ringing state, connected video fade, top timer/quality, front/back switching, and a 393 px frame with no horizontal overflow and all four controls inside the width. A phone-width frame tests responsive CSS, not a physical iPhone/Android camera or browser.

## Still needs real-world testing

- Physical Android/iPhone calls, both directions, across genuinely separate networks.
- Device AEC/NS/AGC, earpiece/speaker/Bluetooth routing and subjective speech quality.
- Router-level loss/bandwidth shaping, severe burst loss, Wi-Fi transitions and long calls.
- Real reboot/recovery and certificate renewal on each deployment.
- Independent cryptographic/security audit.

## Unsupported guarantees

Guaranteed closed-browser/locked-phone ringing with no install, usable speech through arbitrary outages/zero bandwidth, and zero forensic traces are not possible promises. No Signal Double Ratchet or audited security claim is made.
