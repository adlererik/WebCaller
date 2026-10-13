# Calling on changing and weak networks

## Sharing during a call

Tap the call's back arrow to open chat, then use + for Gallery, File or Location. The call stays connected. Return to call brings the picture back. Camera snapshots can reuse your live call camera; switch its lens from the call screen. Voice notes reuse your local microphone, not the other person's call audio. Cancelling these captures stops the cloned tracks only.

During a call, encrypted transfers use 4 KB pieces. A network transfer temporarily lowers outgoing video on both phones to at most 180 kbps on confirmed Wi-Fi or 45 kbps on cellular/unknown links, at no more than 320×180 / 10 fps. Voice keeps its existing budget. This frees capacity for sharing; video returns to the current adaptive budget when sharing ends, fails or is cancelled. A signed encrypted activity signal renews every ten seconds; the other phone’s activity lease expires after 30 seconds if a closing signal is lost. Locally cached media does not lower video.

Good confirmed Wi-Fi allows up to 768 kbps of file payload; cellular/unknown links allow up to 64 kbps. Missing bandwidth estimates use conservative 96/16 kbps limits. Actual limits are also bounded by estimated spare capacity: at most 35% of the estimate, with measured sending/receiving media and 30% network headroom reserved. Short 4 KB bursts begin as soon as media is connected, statistics are healthy and the video reduction has been applied. This cannot guarantee immediate delivery over a saturated or unusable link. Poor audio, low capacity, video-paused profiles or media reconnection pause file requests. They resume as conditions improve or the call ends. Files are additional user-requested data, outside the video budget. HTTP/TLS headers add overhead. A whole 64 KB request already started before a call may finish before pacing takes effect.

Every request is authenticated and ciphertext is unchanged from earlier releases. The server assembles complete encrypted chunks from bounded pieces. Partial pieces cannot be edited, read before completion, or stored beyond the original attachment lifetime. Interrupted requests retry idempotently, at most eight attempts; deletion/expiry/authentication failures stop. Closing or backgrounding the page still cancels transfers to clear private drafts and plaintext from memory. It is not a persistent background upload service.

## Automatic video codec selection

The browser must expose a codec through its WebRTC RTP capabilities first. WebCaller then probes `MediaCapabilities.encodingInfo` and `decodingInfo` using `type: webrtc`, at the normal Wi-Fi target of 960×540/24 fps. The codec MIME type and format parameters, including H.264 profile, remain specific to each variant. Probes have a short timeout and do not require hardware model detection.

Both endpoints exchange signed encrypted efficiency summaries. Variants reported supported, smooth and power-efficient for both encoding and decoding at both ends receive priority in this order: AV1, H.265, VP9, H.264, VP8. H.264/VP8 are conservative fallbacks when efficiency information is absent or inconclusive. Other exposed variants remain negotiable for compatibility. Original capability objects and RTX/RED/FEC options are preserved. Audio remains Opus when available.

**Power-efficient is a browser estimate, not proof of full hardware acceleration.** An AV1 decoder alone does not establish an efficient AV1 encoder. Some browsers underreport support, and some codecs/hardware are not exposed to WebRTC at all. WebCaller cannot force access to them. Codec selection favors confirmed efficiency without device-model guesswork. See the [Media Capabilities specification](https://www.w3.org/TR/media-capabilities/) and [WebRTC specification](https://www.w3.org/TR/webrtc/).

Bitrate, resolution and frame rate adapt with the same codec. Repeated codec changes on each fluctuation would add negotiation risk. Sustained CPU limits lower capture load; after ten limited samples, a mutually confirmed efficient alternative may be negotiated. The browser handles keyframes, retransmission feedback, pacing, congestion control and negotiated video repair mechanisms. These are not switches that can all be forced by JavaScript.

## Data and voice priority

| Network/profile | Voice cap per direction | Video cap per direction | Capture ceiling |
|---|---:|---:|---|
| Both ends confirmed Wi-Fi/Ethernet | 48 kbps | 900 kbps | 960×540, 24 fps |
| Either end cellular, data saver or unknown | 20 kbps | 120 kbps | 320×180, 12 fps |
| Weak | 12 kbps | 45 kbps | 240×135, 6 fps |
| Critical | 8 kbps, further capacity limited | Paused | Voice first |

The healthy cellular combined ceiling is about **2.1 MB per minute** of bidirectional codec payload: two directions × (120 + 20) kbps. Network headers, transport/relay overhead, repair and file transfers add data; silence and static pictures often use less. This is a conservative budget controlled by this app, not a claim to reproduce a proprietary Signal/WhatsApp algorithm or exact billable usage. Browser controls may differ.

Actual estimated outgoing capacity can lower these caps further. The app reserves voice and overhead before assigning remaining capacity to video. Poor received audio, remote audio loss, jitter, delay and CPU congestion drive adaptation. Statistics are sampled each second; weak/critical recovery waits for five healthy samples. Very poor links pause picture transmission and file sharing before sacrificing voice. Voice uses mono Opus with requested FEC, DTX, AEC, noise suppression and gain control; concealment, jitter buffering and full duplex are handled by the browser.

Browsers may hide whether a phone uses Wi-Fi or cellular. Unknown networks use the conservative cellular budget. The app cannot infer an unmetered connection from a high download speed. No codec can maintain a call through zero usable bandwidth, a complete outage or an OS terminating the browser.

## Wi-Fi to cellular and back

Connection-change/online events, failed/disconnected media and reconnected signaling trigger recovery. The same call ID and microphone remain in use. Only the original caller creates restart offers, avoiding simultaneous-offer conflicts. Requests made while negotiation is busy are queued; unanswered offers and signaling failures are retried. An unsent local offer is rolled back. ICE candidates are matched to their generation and fresh TURN settings are requested before gathering again.

Both endpoints report their network mode, so one on Wi-Fi cannot force the other to receive the larger Wi-Fi budget. If an embedded browser refuses an ordinary ICE settings update, still-valid old relay credentials are retained for recovery. Normal supported browsers replace the relay settings and long calls refresh hourly. The app does not falsely report that a rejected refresh succeeded. Credentials close to expiry cannot be relied on indefinitely.

The client and server allow up to three minutes of recovery before ending a disconnected active call. Reconnected authenticated sockets cancel stale disconnect timers. The original ringing/expiry rules still apply to unanswered calls. Switching radios can briefly interrupt sound while the OS acquires a usable path. JavaScript cannot guarantee a gap-free handover on every phone/network.

## What the numbers mean

Two compact rows at the top show video above voice, each with its rate immediately beside the codec; connection quality and the timer sit underneath. Video-call controls have a transparent tray with individual shaded buttons. The rows show the actual negotiated codecs from active WebRTC stream reports and separate **send plus receive** payload rates in kbps/Mbps. Their tooltip gives each direction. These are measured byte deltas, not the maximum bitrate setting or link speed. Separate primary RTP counters avoid counting RTX payload twice. Diagnostics also retain bundled transport totals. Network headers, TURN overhead and file/chat requests are not included; use router/device counters to measure billed traffic. See the [WebRTC statistics specification](https://www.w3.org/TR/webrtc-stats/).

## Test your phones

1. Start voice, turn camera on/off and send an image/file while talking in both directions.
2. Walk outside Wi-Fi coverage while cellular data is enabled, then return to Wi-Fi. Confirm the existing timer continues and neither phone needs to dial again. A short sound interruption is possible.
3. Check the codec/rate display. Where network type is exposed, either cellular endpoint limits both video directions.
4. Test a controlled weak/lossy connection. Picture and file transfers should reduce/pause before voice; improve the link and confirm recovery.
5. Repeat Android/iPhone, headset/Bluetooth/speaker, front/back lens, direct and TURN-only paths. Actual hardware acceleration and power consumption require measurements on those physical devices.


## New flagship phones: which codec actually works?

A phone needs an encoder for outgoing camera video and a decoder for incoming video. Hardware playback support alone does not establish an efficient two-way WebRTC call. The browser, OS, exact profile and other phone also matter.

| Codec | Practical expectation |
|---|---|
| H.264 | Broadly compatible fallback. Hardware implementations are common, but the browser chooses the actual implementation. |
| H.265 / HEVC | An efficient option when both browsers advertise compatible WebRTC capabilities and efficient encoding/decoding. Safari supports HEVC RTP; Chrome added WebRTC HEVC in version 136, with device-dependent capability reporting. |
| AV1 | Can offer strong compression, but efficient hardware encoding must be confirmed separately from decoding. Do not force it solely because a phone is a flagship. |
| VP9 | Another optional candidate when both phones expose it and report efficient two-way support. |
| VP8 | Widely compatible fallback when more efficient shared variants are unavailable. |

As examples, Apple lists HEVC/H.264 among the iPhone 17 Pro’s camera recording formats and AV1 among playback formats. Qualcomm explicitly lists an accelerated H.265/VP9/AV1 **decoder** in the Snapdragon 8 Elite Gen 5 brief. These specifications are not a promise of AV1 hardware encoding in a browser. WebCaller queries both sides and shows the actual negotiated codec at the top of the call. H.265 is a plausible efficient shared option on modern devices; H.264 remains a practical fallback. Exact hardware acceleration still needs tests on those phones.

Primary references: [WebRTC’s required H.264/VP8 codecs](https://www.rfc-editor.org/rfc/rfc7742.html), [Safari HEVC RTP support](https://webkit.org/blog/15865/webkit-features-in-safari-18-0/), [Chrome 136 WebRTC HEVC](https://developer.chrome.com/blog/chrome-136-beta), [iPhone 17 Pro specifications](https://support.apple.com/en-us/125090), [Snapdragon 8 Elite Gen 5 brief](https://www.qualcomm.com/content/dam/qcomm-martech/dm-assets/documents/Snapdragon-8-Elite-Gen-5-product-brief.pdf), and [Media Capabilities](https://www.w3.org/TR/media-capabilities/). Reviewed October 2026; runtime detection takes precedence over this overview.

## Sharing status

Uploads display a spinning chat placeholder and percentage at both connected ends. Percentage follows uploaded payload bytes, including partial 4 KB call bursts; it is distinct from media bitrate and server delivery/read marks. Announcements are at most one per three seconds, with a ten-second renewal while stalled, and expire within 20 seconds. They contain no file key or plaintext outside the encrypted envelope. The completed, verified attachment replaces the placeholder; a local download shows separate loading progress. Tiny status updates still consume some signaling bandwidth, and the transfer budget remains conservative when media capacity is uncertain.

## Fixed call header

Voice and video rows share columns for the codec, numeric speed and unit. Numbers are right-aligned, and kbps/Mbps start at the same column in both rows. Quality occupies its own row below the codec stack, aligned with the codec names; the timer is on the right of that row. In video calls the name aligns with the codec icons at the upper left and optional security words are centered on the screen in the same row. The settings cog remains at the upper right. Long names/codecs truncate visually while their accessible text remains available. Speeds still show measured codec payload upload plus download, excluding network headers, TURN overhead and chat/file traffic.
