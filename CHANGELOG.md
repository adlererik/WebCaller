# Changelog

## 0.3.0 — 2026-10-11

- Match the supplied Signal-style chat reference with rounded green/gray bubbles, integrated composer controls, edge-to-edge media and captions.
- Automatically display photos/video/audio in the open visible chat on both phones; add full-screen media viewing with a close button and inline voice playback.
- Add camera capture/front-back switching, previewable mono voice recording, a self-hosted searchable Unicode emoji catalog with skin tones, and file/media drafts.
- Add encrypted ephemeral typing animations and deletion by either participant, with offline deletion sync, replay prevention and encrypted chunk removal.
- Keep call audio ahead of attachment transfers and clear media/capture drafts on backgrounding. Add deletion tables without changing identities or the encryption format. Refresh both phones after updating.
- 23 automated tests pass, including participant deletion/replay and ephemeral typing tests; two-browser synthetic media checks pass.

## 0.2.0 — 2026-10-11

- Add a chat + menu for encrypted images/files up to 10 MB, chunked transfer, contact authorization, storage quotas and disappearance cleanup.
- Always use Automatic connection management and activate ringing with ordinary user interaction.
- Fade central caller details in connected video, keep timer/quality at the top, and add front/back camera switching with microphone continuity and restoration on failure.
- Revoke decrypted previews on background/expiry and hide chat in print layouts; screenshots remain outside browser control.
- Add five regression tests for encrypted file integrity, authorization/expiry/quota and camera switching; 20 tests pass.
- Add attachment tables on startup; preserve existing identities and text messages. Refresh both phones after updating.

## 0.1.0 — 2026-10-11

Initial public preview of WebCaller.

### Included

Adaptive mono Opus voice, optional video, camera upgrade/toggle/mute, voice-first congestion profiles, encrypted disappearing one-to-one text, single-use invitations, private QR first-phone onboarding, safety numbers/contact pinning, generic optional notifications, authenticated reconnecting signaling and short-lived TURN credentials. Self-hosted coturn and optional Cloudflare TURN are supported.

A guided Debian 12/13 installer, Node 24 app container, optional Caddy HTTPS/coturn profiles, native deployment examples, configuration/networking/operations/security guides, tests, source privacy checks and release archives are included. Public examples contain no real deployment credentials, domains, addresses, personal users, data or QR output.

### Limits

Preview, unaudited custom encryption with no Double Ratchet/recipient-key forward secrecy. Browser-only background ringing and forensic erasure cannot be guaranteed. Synthetic tests do not certify physical phone sound quality or external reachability. TURN-TLS setup/renewal and router forwarding need explicit deployment configuration.
