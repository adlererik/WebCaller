# Features and media behavior

## Adaptive audio/video

| Profile | Mono Opus payload ceiling | Video ceiling | Capture target |
|---|---:|---:|---|
| Wi-Fi | 48 kb/s | 900 kb/s | 960×540, 24 fps |
| Data saver / unknown network | 20 kb/s | 120 kb/s | 320×180, 12 fps |
| Weak | 12 kb/s | 45 kb/s | 240×135, 6 fps |
| Critical | 8 kb/s | Paused | Audio continues if transport permits |

These are sender payload caps, not total network usage or guaranteed output rates. RTP, SRTP, IP, TURN, retransmissions and FEC add overhead. Browsers can control/ignore unsupported parameters. No arbitrary minimum bandwidth guarantees intelligible speech.

Stats are sampled every three seconds. Packet loss in received audio and sender RTCP reports, round-trip delay, jitter and available outgoing bitrate can trigger a downgrade. Recovery from weak/critical requires five healthy samples to avoid oscillation. Severe congestion disables outgoing video encodings while leaving audio enabled. Camera-off stops its track; camera-on requests it again.

Connection preference is always Automatic. Saved manual settings no longer affect calls. Timer and quality remain at the top; central details fade once video connects. Switching front/back cameras releases only the video device before requesting the other lens, replaces its sender track without SDP renegotiation, and attempts restoration if a lens is unavailable.

## Opus and microphone processing

Capture requests mono, 48 kHz input, acoustic echo cancellation (AEC), noise suppression (NS) and automatic gain control (AGC). Opus is preferred. SDP preserves existing parameters and requests in-band forward error correction (FEC), discontinuous transmission (DTX/VAD), mono and a maximum average bitrate. Sender caps adapt separately. Full-duplex means both people may speak simultaneously.

Packet loss concealment (PLC), jitter buffering, voice activity behavior, loss-driven FEC, codec mode and actual AEC/NS/AGC are browser internals. JavaScript cannot force every feature or certify sound quality. Optional sender/network priorities favor audio, with fallback to core parameters. [Opus RTP specification](https://www.rfc-editor.org/rfc/rfc7587), [capture constraints](https://www.w3.org/TR/mediacapture-streams/) and [optional priority](https://www.w3.org/TR/webrtc-priority/).

## Connections and signaling

WebSocket messages route encrypted offers, answers and ICE only between contacts. Short-lived single-use tickets are sent in the first frame rather than URL parameters. Heartbeats/reconnect backoff maintain signaling through a proxy/Tunnel. Offline incoming offers are temporarily held in memory for 90 seconds. Candidate buffering/generation checks and replay handle invitation/offline timing. ICE restart fetches new relay addresses and credentials on both peers; hourly caller restart refreshes allocations for long calls. Temporary TURN credentials last two hours.

## Text and notifications

Signed encrypted envelopes have expiry, sender/recipient, IDs and ciphertext. The encrypted mailbox is idempotent. Expiry is checked server-side and client-side; stored ciphertext is purged once per second and on startup/read. Optional push is generic and short-lived. No service worker fetch cache is created. Browser keys, tokens and contacts persist so the device can be used again.

## Encrypted attachments

A signed encrypted message carries a random per-file AES-256-GCM key and nonce prefix. Each 64 KB plaintext chunk is encrypted with a distinct indexed nonce; authenticated data binds the file ID, chunk order, size and expiry. Contents are uploaded sequentially to an authenticated contact-only mailbox and cannot be announced until all expected chunks exist. Filename/type/key stay inside the message envelope. Quotas limit pending and completed uploads. Chat sync fetches metadata; visible open conversations then automatically decrypt photos/video/audio sequentially. General files require a user action. Transfers pause for calls, preserving voice priority. Files expire alongside their messages and are removed with device deletion. Downloads and screenshots cannot be erased outside the app.

## Chat controls

Rounded green/gray bubbles, media captions, searchable self-hosted Unicode emoji with skin tones, front/back photo capture, previewable voice recording, automatic media previews and a full-screen image/video/audio viewer are included. Voice notes use browser-negotiated MP4/AAC or WebM/Ogg Opus at a requested mono 32 kbps. Both participants can delete any message; encrypted attachment chunks are removed transactionally and expiring deletion markers prevent replay/offline resurrection. Signed encrypted typing updates are ephemeral and never include draft text.

## Deliberately absent

No native mobile app, SIM/phone-number registration, group calls/chats, federation, Double Ratchet, audited security claim or guaranteed background ringing. This version is one-to-one calling, text and attachments. See [Verification](VERIFICATION.md).

## Call alerts and invitations

Inviters can prefill the recipient’s name. Invitation preview verifies the inviter fingerprint without consuming the link. iPhone/iPad guides Home Screen setup before enrollment; Android goes directly to acceptance and alerts. Permission requests follow an explicit tap. A test is sent after eight seconds to this browser’s subscription only; readiness is recorded only when its owner confirms hearing it, never inferred from delivery.

Pending calls send an initial generic push plus reminders at 15 and 35 seconds, with at most eight seconds of push-provider queue life per attempt. A per-call topic coalesces undelivered pushes. Answer, decline, hangup, expiry and device removal cancel remaining timers. An unopened recipient’s offer remains available up to the original 90-second deadline.

The service worker checks authenticated call state before sounding an alert, replaces earlier notifications for the call, and avoids a duplicate ding when a visible page confirms it is already audibly ringing. Stale alerts still show a silent generic notification to respect Apple’s user-visible push requirement. Declarative Web Push with `mutable:true` allows supported Apple browsers to display a generic fallback if the worker cannot run. Already delivered notifications and in-flight pushes cannot always be recalled, and the OS may quiet repeated alerts. The repeating dual-tone ringtone requires an active page and browser sound permission. See [Call alerts](CALL_ALERTS.md).
