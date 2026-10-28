# Changelog

## Unreleased

- Anchor the app and credit footer inside the usable screen area. Resize the chat above mobile keyboards, account for safe areas and focus panning, and restore the page after keyboard dismissal without moving an older-message scroll position. Preserve pinch zoom and independent message/dialog scrolling.

## 0.19.0 — Stickers, reactions and reliable sending — 2026-10-28

This is a source/native release; no new prebuilt Docker image or Docker bundle is published.

- Add sticker support with transparent cutouts, pack tabs, encrypted local Recent/Favorites, one-tap sending, lazy loading and borderless chat images. Preserve existing sticker IDs and saved choices; artwork attribution and source records accompany the assets.
- Encrypt each sticker with a fresh AES-256-GCM attachment key protected by libsignal. Add bounded low-priority WebRTC data-channel delivery with signed/encrypted SDP/ICE, authenticated receive/cache acknowledgement and the normal encrypted attachment-store fallback for offline clients or failed connections. Preserve voice-first transfer pacing, calls, SAS and notifications.
- Fix exhausted starter keys while sending stickers: reuse the established chat ratchet for image manifests and separate per-contact auxiliary ratchets for sticker connections/progress. Reconnect/resume schedules bounded publication retries. Keep identity pins and one-use prekey enforcement; new sessions with no authenticated starter material still fail closed with plain reconnect wording. Existing per-file sticker envelopes remain readable. Both clients must reload once.
- Fix emoji reactions on timed messages by binding updates to the original signed wire lifetime without resetting either device's countdown.
- Keep older bubbles' original disappearing duration when either person changes the timer for future messages, including refresh/reopen. Preserve separate sender/recipient countdowns and Off.
- Replace the old experimental-encryption footer with **Coded by Erik Adler**, linked to this repository. Rewrite sticker usage, installation/update choices, architecture, security and verification documentation for this release.
- Keep the pinned libsignal core/binding and all existing encryption algorithms unchanged. Preserve the v0.18.0 prebuilt Docker references independently of the source version; release packaging refuses a mismatched optional Docker bundle.

## 0.18.0 — 2026-10-20

- Promote official libsignal 0.105.1/PQXDH v4 and Double/Triple Ratchet/SPQR to the main release, with Ed25519 application signatures, persistent identity pins and existing media-bound four-word SAS. Keep the custom browser integration explicitly unaudited; live media remains DTLS-SRTP. Old Olm installations require an explicit backed-up migration.
- Raise cellular/unknown video to 500 kbps per direction, preserve voice ceilings, retain tiny video, pause when required and add bounded healthy-audio recovery probes. Harden dead-socket detection, same-page answered-call ownership, fresh correlated ICE generations and delayed-answer/candidate rejection during network handovers.
- Add immersive portrait/square landscape call views, fading controls/codec rows, aligned rates, persistent SAS/quality/timer and draggable self preview. Fix dark captions and default new conversations to one-hour disappearing messages.
- Add local page-title configuration and same-origin route aliases/retirement without disclosure redirects; migrate only authenticated owned browser push subscriptions after replacement succeeds. Keep invitations, calling codes, ntfy and relay configuration independent of route choice.
- Publish release-matched libsignal native/source/prebuilt Docker instructions and amd64/arm64 images, complete upstream source archives, source offer, checksums and digest-pinned setup bundle. Bundle format 2 prevents an old Olm updater from silently crossing the protocol boundary.
- Rewrite security, encryption inventory, forward secrecy/PQ/recovery limits, SAS/full fingerprint instructions, no-third-party-transparency rationale, Signal comparison, features and beginner installation/operations guides. Public examples contain no deployment credentials or personal addresses.

## 0.18.0-experimental.1 — libsignal/PQXDH branch, 2026-10-19

- Add official libsignal v0.105.1 at 1738ead8a12ffe539f6309958123dadb16dc3b95 through a custom browser WASM/storage adapter. Require v4 PQXDH with X25519/Kyber-1024; retain upstream Double/Triple Ratchet/SPQR. Stable Olm accounts are not imported.
- Use Web Crypto Ed25519 application signatures. Earlier libsignal test P-256 identities keep pins/history through certified nonextractable signers, strict framing, old signature verification and bounded prekey batches.
- Retain the media-bound optional four-word SAS, AES-GCM files/local records, adaptive calls, chat, timers, codes, cache and alert workflows. Live media remains DTLS-SRTP, not post-quantum media.
- Include pinned upstream source, binding/locks/build/oracle, AGPL source offer, MIT/dependency notices and complete branch-specific documentation. No private deployment credentials/state are included.
- Label the integration unaudited. Block the stable prebuilt launcher here and restrict stable registry publishing. No experimental prebuilt image or stable release is published by this branch.

Entries below describe historical stable releases, not this branch's current encryption or migration support.

## 0.17.1 — 2026-10-19

- Publish the complete adaptive-sharing / 200 MiB release below with source archives, digest-pinned Docker setup bundles and native amd64/arm64 images.
- Remove optional WASM compiler-producer metadata so clean local and GitHub builds reproduce identical browser assets. Keep debug names and target-feature metadata; all executable sections, instructions, imports/exports and data remain byte-for-byte identical to the preceding 0.11.1 module. Keep the exact loader integrity check.
- Add a regression pin for unchanged runtime sections and retain public CI rebuild evidence. Olm, AES-GCM, identities, saved sessions/history and call SAS are unchanged.

## 0.17.0 — 2026-10-19 (build candidate)

- Raise the file/media limit to 200 MiB, extend encrypted chunk routing through index 3199 and use fresh 1 GiB per-sender / 4 GiB global reservation defaults. Existing explicit lower quotas remain an operator choice.
- Replace sequential 4 KiB in-call throttling with up to four adaptive encrypted chunk workers, measured file-path probing and a healthy-link ceiling of 24 Mbps (2 Mbps on explicitly reported cellular/Save-Data). Unknown network types no longer impose the old 8 KB/s file limit.
- Pause/abort file requests for weak or stale call health, resume cautiously after healthy samples, keep voice priority and temporarily reduce video. Replace the 600/minute attachment bottleneck with bounded concurrency and a replenishing request limit.
- Cache complete ciphertext sets incrementally with additive IndexedDB migration, generation fencing, deletion/expiry cleanup and backward-compatible reads. Preserve AES-256-GCM file framing, Olm sessions, identity pins, call SAS and existing history.
- Include the previously unreleased hardening, calling-code/onboarding fixes, modern home/settings screens, Off/four-week timers, independent sender/recipient expiry, full-frame orientation and handset icon described below.
- Publish generic source and prebuilt amd64/arm64 Docker distributions, plain-language installation/update guides, full feature/security documentation, checksums and release-specific image digests. No live deployment configuration is included.

## Included in 0.17.0 — Full-frame calls & independent message timers

- Preserve the complete remote/self camera frame across portrait, landscape and desktop screens. Replace the chat-bubble app mark with a handset design across the home page, favicon and mobile icon assets.
- Start the sender timer when sent and the recipient timer at first viewing for new timed text/media. Persist the first view across reloads, retry signed read-start acknowledgements, and retain encrypted unread copies until viewing/deletion. Existing messages, Off, identities, pins, Olm and call SAS keep their existing behavior.
- Authenticate the new v3 application lifetime fields, filter message/media access by participant deadlines, shorten cached-media deadlines without redownloading, and prevent expired-copy replay. Document the longer unread retention and timing metadata.

## Included in 0.17.0 — Settings & message timers

- Redesign Settings as a mobile page with grouped controls, clear icons, large touch targets and light/dark themes; retain appearance, codes, contact naming, call alerts, optional ntfy, diagnostics and device removal.
- Match the Signal-style disappearing-message list and custom number/unit wheels, with Cancel, Set and explicit Save. Add Off and timers through four weeks for new outgoing text/media without changing older messages. Keep timer semantics from send time.
- Validate the new signed v2 lifetimes on both endpoints and server, preserve legacy bounds and signaling limits, retain current chat/update ratchets for late Off delivery, and bound uncommitted uploads to a renewable 24-hour lease. Document retained history/skipped-key tradeoffs and the need to refresh old clients.

## Included in 0.17.0 — Vodozemac hardening

- Prefer confirmed ntfy for call alerts without duplicate browser pushes; fall back on failed publishing and keep subsequent reminders on browser push for that call. Preserve text pushes, existing subscriptions and encrypted calling. Add an authenticated per-device switch and recipient-only opening of the exact waiting encrypted call; keep Answer explicit.

- Show loading conversations instead of a false zero count during startup. An independent watchdog keeps download/startup errors visible and offers a page reload without clearing device identity, trust pins or messages.

- Update the bundled Rust cryptographic core from Vodozemac 0.9.0 to 0.11.1 and retain the adapted Apache-2.0 browser binding source, exact dependency lock, pinned build tools and reproducible build script.
- Propagate invalid Curve25519/session/encryption failures as JavaScript errors. Explicitly require full-authentication Olm V2 on inbound creation; do not accept the newer library's default V1 configuration. Preserve existing application encryption formats, identity pins and four-word call verification.
- Exercise the actual previous engine against the new engine: bidirectional messages, saved accounts/sessions, unread prekeys, locally wrapped history and attachments, old open tabs and matching SAS. Add inbound/outbound/DH-ratchet invalid-key and truncated-authentication rejection tests.
- Record source/artifact hashes and refreshed dependency licenses. Add a CI rebuild comparison. This is a source update, not an independent cryptographic audit or an automatic server deployment.

## 0.16.1 — 2026-10-18

- Add a complete prebuilt Docker distribution alongside native and source-built installations, with native amd64/arm64 image builds, ready-made image publishing and small digest-pinned setup bundles.
- Containerize the setup wizard, private first-phone QR, ntfy initialization and optional Cloudflare connector; retain optional Caddy and coturn. Generate credentials privately at installation time and preserve existing configuration/volumes on restart.
- Isolate ntfy state and its publisher-secret volume from app data. Add secret-file loading and an explicit exact-host private Docker HTTP opt-in; native HTTPS/loopback validation remains the default. Keep existing Olm, identity pins, SAS, media encryption and calling protocols.
- Add an explicit-version update command with checksum/digest checks, download-before-replacement, downgrade/tamper rejection, local confirmation and startup checks. No unattended updates, conversation archives or automatic database rollback.
- Document all three install choices, domain/router requirements, notification setup, data retention, updates and migration limits. Existing installations are not automatically migrated.

## 0.15.1 — 2026-10-18

- Refresh the public installation and usage guides without changing the project’s security choices or personal README style. Use generic domain/path examples and current source download commands.
- Add a native Debian/systemd guide for the optional ntfy server helper; distinguish it from the guided Docker deployment and document safe updates for each.
- Explain ntfy priority 5, Android sound channels, iPhone subscription fields and sound limits, WebSockets, DNS delays, login prompts and the phone-icon fallback.
- Expand configuration references, first-phone/iPhone guidance, public packaging checks and release verification; reject embedded ntfy read addresses and publisher tokens in the publishing guard. Replace the private setup card’s old branding with WebCaller.
- Preserve application protocols, identities, encryption, call behavior and existing data. Distribute reviewed tracked source only, with SHA-256 checksums and no deployment configuration.

## 0.15.0 — 2026-10-17

- Add optional self-hosted ntfy incoming-call alerts alongside existing Web Push; keep Olm, identity pins, SAS, media encryption and call signaling unchanged.
- Guide Android one-tap subscription and iPhone manual subscription with copy buttons. Require a locked-phone sound test and check the opening link, with an explicit phone-icon fallback; detect different browser identities without transferring keys.
- Use independent random 256-bit read addresses, a server-only write-only publishing token, generic payloads, bounded reminders and cancellation. Notification links never auto-answer.
- Add a checksum-pinned Debian systemd installer with a separate restricted DynamicUser, deny-all defaults, read-only native subscriptions and two-minute in-memory alert retention. Document the iPhone upstream wake-up relay, native history, stale-alert and routing limits.
- Add security and integration regressions, and test ACL/payload behavior against real ntfy 2.31.1. Physical-phone delivery remains to be tested.

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
