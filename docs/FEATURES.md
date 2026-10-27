# WebCaller feature reference — v0.18.0

A browser phone for one-to-one calls and conversations on Android, iPhone and desktop. The UI follows familiar Signal-style patterns; it is not an official Signal client. [User guide](USER_GUIDE.md) · [Security](SECURITY.md).

## Getting connected

- Private owner setup QR, one-use invitations, verified inviter preview, optional prefilled recipient name and iPhone Home Screen guidance.
- Optional unique 4–12 digit calling codes: choose/disable your code in Settings, dial another person, call or message without an invitation, then return to the same browser identity/contact/history later.
- Calling-code request acceptance, initial message/media limits, rate limiting and identity blocking. Codes are public addresses, not passwords or identity proofs.
- Remembered contacts, local contact renaming, rename reset and long-press/right-click contact options. Contact removal deletes the mutual connection/shared mailbox and ends calls between that pair; independent identity pins survive.
- Clear startup/loading/failure status instead of displaying a misleading empty contact list while synchronization is pending.

## Calling and display

- Video calls by default, explicit voice-only option, full-duplex voice, mute, camera on/off, front/back camera switch and chat/media sharing during calls.
- Browser-supported output switching: voice prefers an exposed receiver/headset; video requests an exposed speaker. Unavailable system routes are not simulated by a fake toggle. A browser cannot force an earpiece it does not expose.
- Upright immersive remote video; largest-fitting square when either peer is landscape; stable capture geometry avoids repeated crop/resize oscillation. Display fitting can crop edges; transmitted camera frames are not redrawn/cropped by the UI.
- Transparent video control tray, large touch targets, cog settings, idle fade/tap-to-show. Codec rows fade with controls; centered SAS, quality, elapsed time and the fixed-size draggable/keyboard-movable self preview remain visible.
- Actual negotiated voice/video codecs and their separate upload-plus-download payload rates in aligned kbps/Mbps rows. Per-direction details in the tooltip; these are not available link speed or carrier billing totals.
- Repeating page ringtone when browser audio is unlocked, incoming Answer/Decline controls, duplicate-offer handling, stale-call isolation and answering-tab ownership.

## Sound, video, files and changing networks

- Opus conversation audio with requested echo cancellation, noise suppression, automatic gain control, in-band FEC and DTX. Browser loss concealment, jitter buffer, negotiated repair, retransmission and congestion control remain active where available.
- Conditional video efficiency preference AV1 → H.265/HEVC → VP9 → H.264 → VP8, with mutual smooth/power-efficient encode **and** decode capability reports. Hardware use is ultimately controlled by browser/OS; unknown support keeps compatible fallbacks.
- Automatic voice-first bitrate/resolution/frame-rate adaptation. Wi-Fi ceiling: 900 kbps video and 48 kbps voice per direction. Cellular/unknown ceiling: 500 kbps video and 20 kbps voice per direction. Weak/critical profiles reduce further.
- Tiny usable video can continue at 160×90/2 fps. If it must pause, healthy-audio-gated 6 kbps probes periodically test recovery with bounded growth/backoff. Missing/poor audio and CPU pressure prevent aggressive probes.
- Acknowledged signaling heartbeats detect a dead OPEN socket. Bounded reconnect/authentication deadlines, same-page answered-call recovery and fresh, correlated ICE generations improve Wi-Fi/cellular handovers. Call negotiation resumes before bulk history sync.
- Original caller creates ICE restart offers to avoid glare; stale answers/candidates are rejected, repeated offers reuse cached answers, TURN credentials refresh. Complete outages/OS suspension can still interrupt sound or end a call.
- File/media limit **200 MiB (209,715,200 bytes)** each. Up to four bounded encrypted chunk workers on healthy links, smaller weak-link parts, retry/cancellation and byte-based spinner/percentage placeholders at both connected ends.
- Sharing pauses/aborts requests when audio health is poor or the call reconnects, then probes recovery. Video yields capacity during a network transfer; voice ceilings are not raised for sharing. Explicitly reported cellular file traffic has its own 2 Mbps ceiling; healthy Wi-Fi/unclassified file traffic can rise to 24 Mbps. These are ceilings, not promises.

See [Call networking](CALL_NETWORK.md) for exact policies, diagnostics and real-phone testing.

## Chat, media and message actions

- End-to-end encrypted text, blue/gray rounded bubbles, emoji composer with skin tones, signed encrypted typing dots and delivered/read receipts with overlapping green checks/timestamps.
- Tap/long-press/right-click a message for reactions, reply, sender-only edit, forward, copy, select, information, pin and delete for both. Only the original sender can edit; only the recipient can acknowledge delivery/viewing.
- A read receipt reflects visible app content, not proof a person read/understood it. Reactions/receipts do not generate a new push for every update.
- Inline pictures, video and audio on both ends; captions; full-screen viewer/player with close; attachment/gallery/file picker; recent loaded chat media; front/back camera capture; voice-note recording/preview.
- Capture during calls clones live media tracks where possible and stops its own clones, preserving call capture. The recent-media strip does not scan the phone's camera roll.
- Current-location action requests a fresh high-accuracy fix with OS permission, builds a pin/map preview and sends coordinates/accuracy/capture time/attribution inside encrypted media. Google Maps links on Android and Apple Maps links on Apple devices. No live tracking or reverse geocoder. Tile/map providers can see their own requests.
- Encrypted local media cache avoids another transfer after closing/reopening a chat, subject to expiry/deletion, integrity checks and storage quotas/eviction. Attachment keys/filenames/plaintext are not added to the chunk cache; retained message records still contain the necessary file key.

## Timers and deletion

New conversations default to **one hour**. Options include Off, presets and custom number/unit wheels for seconds, minutes, hours, days and weeks, up to **four weeks**. Changing your setting affects only new messages you send. Every existing message keeps its original authenticated duration, including when either person chooses a different timer or Off; opening the chat or refreshing never replaces that duration with the current preference.

The sender countdown starts at send; the recipient's starts at first actual viewing. An unread copy can remain after the sender's visible copy disappears. Per-message countdowns, first-view state and pending read-start updates survive refresh/reconnection. Off retains messages until deletion. Pins never extend lifetime.

Either participant can delete a message for both. Server ciphertext/chunks and client app/cache records are removed, and bounded tombstones prevent late uploads/replay from resurrecting it. An offline client learns deletion on synchronization. Closed browsers cannot run physical cleanup immediately. Screenshots, downloads, recipients' external copies, browser/OS traces and backups cannot be erased by the app.

## Security and verification

- Official pinned libsignal 0.105.1 Rust core through WASM; strict PQXDH v4 (X25519/Kyber-1024), Double Ratchet + SPQR/Triple Ratchet (ML-KEM-768), upstream AES-256-CBC/HMAC/HKDF and separate application Ed25519 signatures.
- Fresh AES-256-GCM per-file keys, authenticated indexed chunks and ratcheted manifests. Atomic AES-GCM local records, nonextractable CryptoKeys, cross-tab fencing and explicit corruption/identity-change errors.
- Persistent application/libsignal identity pins, trusted-invite fingerprints and grouped 256-bit pairwise safety fingerprint: open chat, tap contact name/header, compare all groups through a trusted channel.
- Optional fresh four-word, 44-bit committed X25519/HKDF/HMAC SAS bound to accepted media fingerprints/identities. It stays local to the UI, uses no exported Signal root secret, survives ordinary ICE changes and clears at call end. Calls continue if comparison is skipped.
- No mandatory external key-transparency service. This avoids that dependency but lacks automatic directory-wide consistency verification. No Sealed Sender, traffic anonymity or audited-equivalence claim.
- HTTPS/WSS delivery, authenticated one-use WS tickets, signed encrypted offer/answer/ICE/control, strict origin checks, bounded uploads and authenticated expiring TURN credentials.

Live media remains DTLS-SRTP and is not made post-quantum by message encryption. Browser-delivered code, endpoint compromise, retained history and metadata are material limits. [Complete explanation](SECURITY.md).

## Alerts and everyday settings

- Neutral New message notices open the intended conversation using a short-lived identity-bound intent rather than putting contact/message IDs in the URL.
- Web Push requests sound/vibration and Answer/Decline actions where supported. Answer hands a one-use call-bound choice to the foreground page; microphone permission is still required. High urgency cannot force sound or bypass Focus/Silent/battery policy.
- Optional self-hosted ntfy priority-5 generic call alerts, per-phone enrollment/test and confirmed preference. Confirmed ntfy suppresses duplicate browser **call** pushes; publish failures fall back for that call. Text-message pushes continue normally.
- Android one-tap ntfy subscription; guided iPhone fields/test and usual-phone-icon fallback for Safari/Home Screen profile differences. Stock iPhone wake-up optionally uses ntfy.sh plus Apple push metadata delivery.
- System theme detection plus Light/Dark overrides; local Page title setting; Automatic connection mode and page ringing default; grouped settings, diagnostics, relay allocation check and explicit device removal.
- Print/background privacy cleanup and neutral notifications, without claiming universal screenshot blocking or invisible browser history.

## Hosting and installation

Native Debian/Node.js/SQLite, source-built Docker and release-matched prebuilt amd64/arm64 Docker bundles. Optional Caddy, coturn, ntfy and Cloudflare connector. Private first-run credential generation, QR onboarding, digest-pinned prebuilt bundles, explicit updates and backup instructions.

STUN/ICE selects direct media when possible; TURN carries encrypted media when needed. A Cloudflare HTTP Tunnel carries the site/signaling, not TURN/RTP. Public IPv4/CGNAT/router/firewall/TLS guidance is included. Paths are configurable; aliases support gradual moves, retired routes return 404 without disclosing the replacement, and owned Web Push registrations can migrate after a phone opens the new path. A hidden path is not origin isolation or authentication.

## Not included

Groups/federation, native mobile call integration, calls to Signal/WhatsApp accounts, compulsory phone numbers, automatic key transparency, Sealed Sender, traffic-analysis anonymity, guaranteed background ringing, universal earpiece/screenshot control, guaranteed zero traces or independent security certification. This is a one-to-one self-hosted browser phone. [Verification](VERIFICATION.md).
