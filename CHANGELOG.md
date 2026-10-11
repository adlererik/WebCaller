# Changelog

## 0.1.0 — 2026-10-11

Initial public preview of WebCaller.

### Included

Adaptive mono Opus voice, optional video, camera upgrade/toggle/mute, voice-first congestion profiles, encrypted disappearing one-to-one text, single-use invitations, private QR first-phone onboarding, safety numbers/contact pinning, generic optional notifications, authenticated reconnecting signaling and short-lived TURN credentials. Self-hosted coturn and optional Cloudflare TURN are supported.

A guided Debian 12/13 installer, Node 24 app container, optional Caddy HTTPS/coturn profiles, native deployment examples, configuration/networking/operations/security guides, tests, source privacy checks and release archives are included. Public examples contain no real deployment credentials, domains, addresses, personal users, data or QR output.

### Limits

Preview, unaudited custom encryption with no Double Ratchet/recipient-key forward secrecy. Browser-only background ringing and forensic erasure cannot be guaranteed. Synthetic tests do not certify physical phone sound quality or external reachability. TURN-TLS setup/renewal and router forwarding need explicit deployment configuration.
