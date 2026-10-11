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

## Opus and microphone processing

Capture requests mono, 48 kHz input, acoustic echo cancellation (AEC), noise suppression (NS) and automatic gain control (AGC). Opus is preferred. SDP preserves existing parameters and requests in-band forward error correction (FEC), discontinuous transmission (DTX/VAD), mono and a maximum average bitrate. Sender caps adapt separately. Full-duplex means both people may speak simultaneously.

Packet loss concealment (PLC), jitter buffering, voice activity behavior, loss-driven FEC, codec mode and actual AEC/NS/AGC are browser internals. JavaScript cannot force every feature or certify sound quality. Optional sender/network priorities favor audio, with fallback to core parameters. [Opus RTP specification](https://www.rfc-editor.org/rfc/rfc7587), [capture constraints](https://www.w3.org/TR/mediacapture-streams/) and [optional priority](https://www.w3.org/TR/webrtc-priority/).

## Connections and signaling

WebSocket messages route encrypted offers, answers and ICE only between contacts. Short-lived single-use tickets are sent in the first frame rather than URL parameters. Heartbeats/reconnect backoff maintain signaling through a proxy/Tunnel. Offline incoming offers are temporarily held in memory for 90 seconds. Candidate buffering/generation checks and replay handle invitation/offline timing. ICE restart fetches new relay addresses and credentials on both peers; hourly caller restart refreshes allocations for long calls. Temporary TURN credentials last two hours.

## Text and notifications

Signed encrypted envelopes have expiry, sender/recipient, IDs and ciphertext. The encrypted mailbox is idempotent. Expiry is checked server-side and client-side; stored ciphertext is purged once per second and on startup/read. Optional push is generic and short-lived. No service worker fetch cache is created. Browser keys, tokens and contacts persist so the device can be used again.

## Deliberately absent

No native mobile app, install prompt, SIM/phone-number registration, group calls/chats, attachments, federation, Double Ratchet, audited security claim or guaranteed background ringing. This initial version is one-to-one calling and text. See [Verification](VERIFICATION.md).
