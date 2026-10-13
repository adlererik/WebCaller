# Changelog

## 0.14.1 — 2026-10-13

- Align the video-call name with the left codec icons and center call words in the same row. Quality remains below the aligned codec/rate rows.
- Clear optional call-word state and accessibility metadata on page exit as well as hang-up; preserve existing ciphers, identities and stored history.
- Add hostile-key-directory signature/Olm identity continuity regression coverage.
- Publish a scoped source security review, exact cipher inventory, SAS instructions, forward-secrecy/recovery limitations and a dated Signal comparison. Correct local status-retention and contact-pin deletion descriptions.
- Validate 124 private / 128 public tests and synthetic real-browser calls at 390/320 px. No independent integration audit or physical-phone certification is claimed.

## v0.14.0 — Optional four-word call comparison

- Display four fresh call words beside the contact name in the codec font. Stack codec/rate rows with call quality aligned underneath.
- Bind the optional check to the active call, pinned public identities and accepted DTLS fingerprints using a committed ephemeral X25519 exchange and the existing Vodozemac SAS primitive. Use four 11-bit word indices (44 bits) and role-specific key confirmations. No new package or change to existing Olm encryption/pins.
- Keep SAS state in memory, exclude its plaintext frames from readable history, and clear its display/accessibility labels at hang-up. ICE and codec changes retain the words when media identity is unchanged; changed fingerprints start a fresh round.
- Handle retries, duplicates, unsupported peers, invalid keys/proofs and timeouts without gating or terminating the call. A matching human comparison is optional and is never recorded as verified.
- Add protocol and privacy documentation. The application-specific integration remains unaudited. Reopen the page on both phones after upgrading.

## v0.5.1 — Cancel stale audio-output work

- Prevent a late speaker enumeration or output-picker result from an ended call affecting the next call.
- Add a regression check for this cross-call race; 41 automated tests pass.

## v0.5.0 — Media sheet, location and voice-call layout

- Replace the + menu with a bottom sheet: recent visible chat media and Gallery, File and Location. The phone’s camera roll remains behind its native picker.
- Preview and send a one-time location with an encrypted map thumbnail, optional place name and Maps link. Media/coordinates disappear and delete together; no live tracking or server-side geocoding.
- Plain dark voice-call screen, top name/timer/quality, central initials avatar, bottom Speaker/Camera/Mic/More/Hang up tray, and return-to-call navigation.
- Route audio using exposed browser devices, prefer speaker for video where available, restore the chosen voice output when video stops, and offer phone-specific help where routing is unavailable. No native earpiece/speaker guarantee is claimed.
- 40 automated tests pass, with synthetic two-browser media/location/call checks and responsive 390 px layout checks. Existing identities, encryption formats, TURN settings and stored messages remain compatible. Refresh both phones after updating.

## v0.4.0 — Easier invitations and call alerts

- Optional recipient-name prefilling and verified invitation preview.
- Phone-specific onboarding: iPhone/iPad Home Screen handoff before invitation acceptance; Android notification permission and a locked-phone sound test.
- A delayed test bound to the current subscription, with explicit heard/silent confirmation and phone settings help.
- At most three short-lived call pushes, cancellable reminders, stale-call checks, foreground sound coordination and Apple declarative fallback.
- Recognisable repeating foreground ringtone, labelled Answer/Decline, tap-to-ring fallback and duplicate reconnect prevention.
- Additive migrations preserve existing users, keys, message records and push subscriptions. No guaranteed closed-phone ringtone or OS-sound override is claimed.


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
