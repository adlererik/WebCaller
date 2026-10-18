# Features and media behavior

## Adaptive audio/video

| Profile | Mono Opus payload ceiling | Video ceiling | Capture target |
|---|---:|---:|---|
| Wi-Fi | 48 kb/s | 900 kb/s | 960×540, 24 fps |
| Cellular / unknown network / remote saver | 20 kb/s | 120 kb/s | 320×180, 12 fps |
| Weak | 12 kb/s | 45 kb/s | 240×135, 6 fps |
| Critical | 8 kb/s | Paused | Audio continues if transport permits |

These are sender payload caps, not total network usage or guaranteed output rates. RTP, SRTP, IP, TURN, retransmissions and FEC add overhead. Browsers can control/ignore unsupported parameters. No arbitrary minimum bandwidth guarantees intelligible speech.

Stats are sampled every second. Packet loss in received audio and sender RTCP reports, round-trip delay, jitter and available outgoing bitrate can trigger a downgrade. Recovery from weak/critical requires five healthy samples to avoid oscillation. Severe congestion disables outgoing video encodings while leaving audio enabled. Camera-off stops its track; camera-on requests it again. Link capacity can reduce the caps further; video gets the remaining budget after reserving voice and overhead. Persistent CPU pressure reduces capture load.

Connection preference is always Automatic. Saved manual settings no longer affect calls. Timer and quality remain at the top; central details fade once video connects. Switching front/back cameras releases only the video device before requesting the other lens, replaces its sender track without SDP renegotiation, and attempts restoration if a lens is unavailable.

## Opus and microphone processing

Capture requests mono, 48 kHz input, acoustic echo cancellation (AEC), noise suppression (NS) and automatic gain control (AGC). Opus is preferred. SDP preserves existing parameters and requests in-band forward error correction (FEC), discontinuous transmission (DTX/VAD), mono and a maximum average bitrate. Sender caps adapt separately. Full-duplex means both people may speak simultaneously.

Packet loss concealment (PLC), jitter buffering, voice activity behavior, loss-driven FEC, codec mode and actual AEC/NS/AGC are browser internals. JavaScript cannot force every feature or certify sound quality. Optional sender/network priorities favor audio, with fallback to core parameters. [Opus RTP specification](https://www.rfc-editor.org/rfc/rfc7587), [capture constraints](https://www.w3.org/TR/mediacapture-streams/) and [optional priority](https://www.w3.org/TR/webrtc-priority/).

## Connections and signaling

WebSocket messages route encrypted offers, answers and ICE only between contacts. Short-lived single-use tickets are sent in the first frame rather than URL parameters. Heartbeats/reconnect backoff maintain signaling through a proxy/Tunnel. Offline incoming offers are temporarily held in memory for 90 seconds. Candidate buffering/generation checks and replay handle invitation/offline timing. ICE restart fetches new relay addresses and credentials on both peers; hourly caller restart refreshes allocations for long calls. Temporary TURN credentials last two hours.

## Text and notifications

Signed encrypted envelopes have expiry, sender/recipient, IDs and ciphertext. The encrypted mailbox is idempotent. Expiry is checked server-side and client-side; stored ciphertext is purged once per second and on startup/read. Optional push is generic and short-lived. No service worker fetch cache is created. Browser keys, tokens and contacts persist so the device can be used again.

## Encrypted attachments

A signed encrypted message carries a random per-file AES-256-GCM key and nonce prefix. Each 64 KB plaintext chunk is encrypted with a distinct indexed nonce; authenticated data binds the file ID, chunk order, size and expiry. Contents are uploaded sequentially to an authenticated contact-only mailbox and cannot be announced until all expected chunks exist. Filename/type/key stay inside the message envelope. Quotas limit pending and completed uploads. Chat sync fetches metadata; visible open conversations then automatically decrypt photos/video/audio sequentially. General files require a user action. Transfers during calls use paced encrypted parts that wait on weak connections, preserving voice priority. Files expire alongside their messages and are removed with device deletion. Downloads and screenshots cannot be erased outside the app.

## Chat controls

Rounded blue/gray bubbles, media captions, searchable self-hosted Unicode emoji with skin tones, front/back photo capture, previewable voice recording, automatic media previews and a full-screen image/video/audio viewer are included. Voice notes use browser-negotiated MP4/AAC or WebM/Ogg Opus at a requested mono 32 kbps. Both participants can delete any message; encrypted attachment chunks are removed transactionally and expiring deletion markers prevent replay/offline resurrection. Signed encrypted typing updates are ephemeral and never include draft text.

## Deliberately absent

No native mobile app, SIM/phone-number registration, group calls/chats, federation, Signal wire compatibility, post-quantum encryption, audited security claim or guaranteed background ringing. This version is one-to-one calling, text and attachments. See [Verification](VERIFICATION.md).

## Call alerts and invitations

Inviters can prefill the recipient’s name. Invitation preview verifies the inviter fingerprint without consuming the link. iPhone/iPad guides Home Screen setup before enrollment; Android goes directly to acceptance and alerts. Permission requests follow an explicit tap. A test is sent after eight seconds to this browser’s subscription only; readiness is recorded only when its owner confirms hearing it, never inferred from delivery.

Pending calls send an initial generic push plus reminders at 15 and 35 seconds, with at most twenty seconds of push-provider queue life per attempt. A per-call topic coalesces undelivered pushes. Answer, decline, hangup, expiry and device removal cancel remaining timers. An unopened recipient’s offer remains available up to the original 90-second deadline.

The service worker checks authenticated call state before sounding an alert, replaces earlier notifications for the call, and avoids a duplicate ding when a visible page confirms it is already audibly ringing. Stale alerts still show a silent generic notification to respect Apple’s user-visible push requirement. Declarative Web Push with `mutable:true` allows supported Apple browsers to display a generic fallback if the worker cannot run. Already delivered notifications and in-flight pushes cannot always be recalled, and the OS may quiet repeated alerts. The repeating dual-tone ringtone requires an active page and browser sound permission. See [Call alerts](CALL_ALERTS.md).

## Location and output controls (v0.5.0)

The Gallery/File/Location sheet offers only those three actions. Recent media comes from loaded, unexpired chat blobs in memory, excluding location cards. Expiry, deletion, backgrounding and dialog closure release thumbnails/references; there is no camera-roll scanner or persistent decrypted recent-media list.

Location automatically starts a one-shot geolocation request after the Location action. It requests enableHighAccuracy with maximumAge 0. Closing/changing contacts/backgrounding cancels the preview pipeline and ignores late position callbacks. Four to six viewport tiles at zoom 15 are rasterized to a 384×288 PNG with a pin and attribution. Tiles use normal browser HTTP caching, an anonymous CORS image and origin-only referrer. The overall application retains no-referrer elsewhere. Failed tile loading produces an explicitly labelled pin/coordinate preview. Coordinates, label, capture time, accuracy and preview attribution stay inside the signed encrypted attachment envelope; the image uses existing AES-GCM chunks. The server stores ciphertext and routing/size/expiry metadata. There is no plaintext location endpoint, reverse geocoder or live tracking.

Audio output uses HTMLMediaElement.setSinkId and the authorized audiooutput devices exposed by enumerateDevices. Voice calls reset to an exposed receiver/earpiece or headset, with system default as the fallback when neither can be controlled. Video selects a detected speaker and restores the prior voice sink after video stops. Device changes handle disconnected outputs; ending a call cancels pending routing and resets the media element. A failed switch preserves the last successful selection. The microphone and Opus processing are unaffected. An unexposed system route is labelled Audio output and has no on/off state claiming earpiece selection. Supported devices use the native picker or verified speaker/receiver switch. Browsers without routing explain that this website cannot force the built-in earpiece; a headset is a practical private-call option. See [W3C output API](https://www.w3.org/TR/audio-output/) and [Safari output support](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/) (the documented addition was for macOS).


## Message actions and acknowledgements (v0.6.0)

Signed encrypted message-state envelopes carry edits, reactions, pins and delivery/read timestamps. Routing includes a target ID and kind; clients verify those again against the authenticated encrypted payload. Only the original sender can edit and only the recipient can acknowledge delivery/viewing. Both participants can react, pin and delete. The SQLite message_events table keeps the latest encrypted envelope per actor/kind, with separate delivery and read kinds to preserve seen state across late delivery updates. Parent deletion cascades; expiry is bounded by the original message’s timer. There is no new push notification for each reaction or receipt. Receipt requests are batched, up to 20 updates per request.

A viewed mark requires the visible bubble in the active chat for at least 300 ms, while the app is visible and no app dialog/call screen covers the chat. It indicates app visibility, not proof a person read the text. Replies reference the parent ID instead of copying its text. Forwarding creates a new encrypted message/file for the chosen contact. Pins cannot extend message expiry. Latest-state version checks stop delayed older edits/reactions from replacing newer state. Plaintext actions/drafts are held in memory and cleared when the app backgrounds.

System appearance uses prefers-color-scheme CSS and matching browser theme-color tags. Map links use the viewing device’s platform, while the encrypted raster thumbnail continues to use the configured tile provider (OpenStreetMap by default). This does not require paid Google/Apple map imagery keys.


## Encrypted local media retention and live call metrics (v0.7.0)

Sent and verified received media is retained as complete encrypted chunk sets in IndexedDB, scoped to the local identity and message/attachment ID and bound to the original size/expiry. No attachment keys, filenames, MIME types or plaintext are added to that cache. Reopening uses authenticated local decryption instead of another media transfer. Deletion transactions remove bytes and store an expiring ID-only tombstone so a late transfer cannot restore them. Corrupt cached chunks are discarded and fetched again once. Expiry is enforced on every read/write and purge runs on startup, return to foreground and every minute while the page executes; closed browsers cannot physically purge until they run again. Forget this device clears the cache. Storage failure leaves messaging/calling usable and reports that reopening may download again. Browser storage remains subject to quota/eviction.

Negotiated video and voice codecs and their separate measured rates appear in two aligned rows near the top, with connection quality and the timer underneath. The video controls use a transparent tray. The rate samples cumulative bytes using statistics timestamps, counts bundled transports once, falls back to RTP counters, and skips invalid/reset baselines. Codec IDs are resolved from active stream reports; repair codecs are not presented as the picture codec. [WebRTC statistics specification](https://www.w3.org/TR/webrtc-stats/).

## Call sharing, codec efficiency and handovers (v0.8.0)

See [Call networking](CALL_NETWORK.md) for the full policy, budgets, browser limitations and testing steps. During calls the + sheet, location, local camera snapshots and voice notes remain available. Camera/microphone capture clones live call tracks when available and stops only its own clones; call video lens selection remains on the call screen. Encrypted file transfers use paced 4 KB HTTP pieces during a call and wait on poor audio or reconnecting media. Outside calls the existing 64 KB encrypted chunk format and fast transfers are retained. Partial ciphertext assembles into original chunks on the server; uncommitted parts inherit quota, access controls and original expiry, with foreign-key cleanup. Network errors retry idempotent transfers, at most eight attempts per request.

Both phones exchange signed encrypted codec efficiency summaries and network modes. Only variants reported smooth and efficient for both encoding and decoding on both phones receive the strongest preference: AV1, H.265, VP9, H.264, VP8. Unsupported/unknown efficiency leaves conservative compatible fallbacks; all repair codec capabilities remain available. Power-efficient does not prove hardware acceleration. Video adapts bitrate, frame rate and resolution without changing codecs on every speed fluctuation; a proven efficient alternative can be negotiated after sustained CPU limits.

The header shows separate Voice/Video codec and combined send-plus-receive payload rates. Per-media rates use primary RTP counters, including retransmitted primary payload where reported, avoiding separate RTX double counting; bundled transport totals remain available in diagnostics. They exclude network headers, TURN overhead and chat/file traffic. A rate starts only after two valid statistics samples.


## Contact removal (v0.9.0)

Press and hold a contact, right-click, or use Shift+F10 / Context Menu to open a confirmation dialog. Movement, scrolling, cancellation and removed rows cancel a pending hold. Confirmation removes the mutual connection and this pair’s entire shared mailbox, including unfinished uploads and all message updates. Other contacts, histories and identities are preserved. Ringing or answered calls between this pair end, and outstanding reminders stop. Closed browsers learn the change on resync. Deletion markers protect against late commits and replay until original expiry, even after a new invitation.

The browser clears this contact’s drafts, open media, decrypted messages, cached ciphertext, full contact entry, unread/typing state and conversation timer. Browser tests also caught and corrected whole-chunk downloads arriving in the wrong buffer form for ciphertext caching; both whole chunks and paced parts now retain downloaded media until deletion or expiry, subject to browser storage limits.

## Actionable background call alerts

Incoming call notifications request sound, vibration, persistence and Answer/Decline actions where supported. Answer carries a short-lived, one-use identity/call-bound decision into the foreground page and verifies the signed offer and authenticated waiting state before capture. A body tap opens the normal Answer screen. Decline uses a recipient-only authenticated API; network failure leaves an explicit fallback notice. High push urgency is a delivery hint, not a way to force a sleeping phone to ring or override user notification settings. iPhone background alerts still require the website’s Home Screen icon. See [Call alerts](CALL_ALERTS.md).

During network sharing, both video encoders temporarily yield capacity using an expiring encrypted activity signal. Voice settings are preserved; weak/reconnecting calls pause file pieces. Video resumes automatically afterward at its current connection budget. Opening a cached attachment avoids this sharing reduction. See [Call networking](CALL_NETWORK.md).

## Message notification routing and live chat status

Generic **New message** push payloads contain only opaque message, sender and recipient IDs plus expiry; names/content remain absent. A notification tap creates a one-use identity-bound chat target, valid for at most two minutes. The foreground app consumes it, synchronizes the authenticated mailbox, opens the pinned contact and scrolls to the verified message. Expired/deleted messages are not restored. Routing IDs never enter the notification’s app URL, browser history or referrer. There is no chat URL navigation for ordinary conversation selection.

Countdown spans use original message expiry and update separately from keyed message/media rows. Short timers tick each second; long timers use compact day/hour/minute units. File/media upload placeholders show a spinner and byte-based percentage on both connected participants. Progress envelopes are signed/encrypted, bound to a reserved upload and its original deadline, rate limited, never stored/replayed by the server and expire within 20 seconds. Completed/deleted messages reject late progress. Cancellation emits a participant-only cleanup event; placeholders cannot be selected, edited, replied to or treated as delivered/read messages. Reduced-motion devices retain percentage without spinner animation.

Privacy remains bounded by browser/OS capabilities, durable identity/media storage, notifications and provider metadata. See [Browser privacy](BROWSER_PRIVACY.md).

### v0.12.0 call header and background alert repair

- Voice/video numeric speeds and units align across stacked rows. The current header places quality/timer underneath, the video name at the left, and call words at screen center.
- Every live call push requests sound independently of a page's reported audio state. Three bounded attempts request a fresh alert: supporting browsers replace one notification with renotify; other browsers receive fresh reminder tags with cleanup after display.
- Device storage and server lookup have a total deadline so a sleeping worker can still show the notification. Ended/answered and expired calls remain silent; the original call deadline determines whether a delayed wake-up is still timely.
- Worker updates bypass the import cache. Locked-phone sound remains a physical-device check subject to the phone's notification settings.

Current v2 transport uses the Olm Double Ratchet. Minimal identity verification records survive contact/history removal. Four per-call words provide an optional human comparison bound to the media connection; the video name is upper left, the words centered in that row, and quality below the aligned codecs. See [call verification](CALL_VERIFICATION.md) and [security review](SECURITY_REVIEW.md).

## Optional extra ringing

A self-hosted ntfy server can send additional generic, maximum-priority (5) incoming-call alerts to the optional Android/iPhone ntfy app. Web Push and encrypted calling continue independently. Setup offers Android one-tap subscription, guided iPhone copy buttons, and a locked-phone sound/opening-link test. See [Extra ringing](EXTRA_RINGING.md) for installation, credentials, retention and the iPhone upstream wake-up limitation.
