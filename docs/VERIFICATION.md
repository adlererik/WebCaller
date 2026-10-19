# Verification history

## Scope

Results below are historical checks for the named versions, not a certification of every release or phone. The newest release checks are at the end.

The original application had eleven passing Node tests and short real Chromium WebRTC tests using synthetic audio/video, including direct and relay-only UDP/TCP/TLS, camera replacement, audio-to-video upgrade, critical-profile video pause and ICE restart with fresh credentials. Those relay tests originated inside a LAN using a public-address/hairpin path. Private deployment addresses and credentials are intentionally absent from this public report.

The preceding v0.3.0 release passed 23 Node tests (including attachment integrity/order/expiry, authorization/quota/cleanup, front/back switching/restoration, first-run secret preservation and publishing guards) and is separately checked for JavaScript/Python/shell syntax, backend/encryption/media/onboarding tests, container builds and health, and tracked-source/archive privacy. The app image passes loopback HTTP/no-store, WebSocket auth-rejection and container-health checks. The relay image accepts an authenticated UDP allocation; Caddy and Compose configurations validate. Guided Caddy/Tunnel selections, existing config preservation and private file permissions are checked without changing system packages. See the release notes and CI for exact results. Installing Docker system packages, real DNS/certificate issuance on another person's server and every router model cannot be certified by source tests.

Additional two-browser synthetic checks cover automatic photo/video/audio previews on both sides, captions, selfie capture with camera switching, emoji search/selection, voice recording/preview/playback, video playback in the full-screen viewer, recipient/sender deletion, viewer closure on remote deletion and deletion persistence after reload.

Browser UI checks on a disposable loopback origin used generated camera/audio, not real microphones or contacts. They covered sending a photo and a text file through the + menu, verifying downloaded file bytes, decrypting a received photo, Automatic/ringing state, connected video fade, top timer/quality, front/back switching, and a 393 px frame with no horizontal overflow and all four controls inside the width. A phone-width frame tests responsive CSS, not a physical iPhone/Android camera or browser.

## Still needs real-world testing

- Physical Android/iPhone calls, both directions, across genuinely separate networks.
- Device AEC/NS/AGC, earpiece/speaker/Bluetooth routing and subjective speech quality.
- Router-level loss/bandwidth shaping, severe burst loss, Wi-Fi transitions and long calls.
- Real reboot/recovery and certificate renewal on each deployment.
- Independent cryptographic/security audit.

## Unsupported guarantees

Guaranteed closed-browser/locked-phone ringing with no install, usable speech through arbitrary outages/zero bandwidth, and zero forensic traces are not possible promises. The v2 app uses the Olm Double Ratchet, not Signal’s wire protocol; no independently audited integration claim is made.

## v0.4.0 call-alert checks

32 Node tests cover the existing encryption/media/server behavior plus bounded reminder timing, stop on answer/cancellation, short deadlines, failed push attempts, owner/subscription-bound tests, explicit sound confirmation, invite preview without redemption, iPhone/iPad detection, fragment handoff and worker suppression of stale/duplicate sounds. JavaScript syntax and the publishing guard pass.

Disposable local browser fixtures use simulated platform/permission/subscription APIs and a fake push transport. They verify prefilled recipient name, iPhone guidance before invitation consumption, Home Screen acceptance, Android direct onboarding, test/lock-phone instructions, no-sound help, blocked-permission help, consumed-launch-link handling and incoming labelled Answer/Decline. A 390 px iframe checks responsive layout; it is not an iPhone simulator. The page creates actual Web Audio oscillators, but subjective sound, notification delivery and locked-phone behavior still need the built-in sound test on physical phones. No real contacts, microphones or live push subscriptions are used by these fixtures.

This update does not change the WebRTC codec/network stack or container/deployment dependencies. Previous container/relay checks apply to those unchanged parts; the new call-alert checks do not re-certify real phone audio or OS background behavior.

## v0.5.0 sharing and call-layout checks

40 Node tests pass, including coordinate validation/safe Maps link construction, map projection boundaries, cancellation of late geolocation, encrypted location/thumbnail decryption by both participants and transactional removal, restricted geolocation/output permissions and tile CSP, real exposed output-ID selection, output failure/unplug handling, video speaker preference/voice restoration, unsupported browsers and cancellation/reset after hangup. Existing attachment expiry tests apply to location images as the same attachment format.

Disposable browser fixtures verify the three sheet actions, recent loaded chat photos, preview-before-send using synthetic coordinates/tiles, automatic map cards on both phones, full-screen map viewing, actual two-browser WebRTC using synthetic audio/cameras, speaker-button state against simulated sink selection, audio-to-video upgrade, hidden speaker in video, front/back switching and call minimize/return. A 390 px iframe verifies all five 54 px touch controls fit within the call tray and the sheet fits the screen. A separate browser request confirms real OpenStreetMap tiles can load using a public synthetic test point; it does not query anyone’s real location. Browser fixtures do not certify physical-phone speaker routing, GPS accuracy or audible quality. No real microphones/cameras, user media, contacts or push recipients are used.

No container, TURN, codec or deployment dependencies changed. Existing deployment validation remains relevant; this UI update does not repeat unrelated container/network tests or certify physical Android/iPhone audio routing.

## v0.5.1 routing cancellation

41 Node tests pass. The additional regression ends a video call while output enumeration is pending, starts a voice call, resolves the old result, and verifies the new call keeps its voice route. Pending output-picker results are also checked against the original call generation before routing. This is a source-level concurrency fix; the previously documented UI and media checks remain applicable.


## v0.6.0 message controls and defaults

Automated checks cover encrypted event authorization, isolation, idempotency, replacement of older state, batch atomicity, WebSocket propagation, original-expiry enforcement and deletion/device cascades. Client state tests cover target binding, sender-only editing, separate delivery/read updates, cross-participant pin ordering and Unicode reaction validation. Output tests cover an earpiece default, explicit speaker toggling, video restoration, stale call cancellation and video requested while output enumeration is pending. Map-link checks cover Apple/Android selection and URL encoding.

Disposable two-browser checks with synthetic media/location/clipboard verified delivery without a seen mark before opening the chat, a second mark after visibility, edits on both sides and after reload, reactions and full emoji picker, replies, copy, forwarding, selection, info timestamps, pins and deletion cleanup including unavailable quotes. Synthetic calls verified initial receiver routing, explicit speaker toggling, video speaker routing, restoration after camera-off and fading video overlays. Location requests started automatically after Location and encrypted map cards arrived on both sides. Phone-width light/dark branches were checked separately; neither proves physical OS routing or GPS accuracy.


## v0.7.0 sender styling, media retention and call metrics

57 private-project / 61 public-release Node tests cover the existing suite plus encrypted cache persistence, identity/message/file/size/expiry binding, both concurrent save/delete orders, late-write tombstones, expiry cleanup, corruption eviction/replace, forgetting storage and unavailable storage. Media-stat tests cover transport deduplication, measured bidirectional deltas, first-sample absence, timestamp/counter resets, actual active codec IDs, asymmetric codecs, RTP fallback/repair exclusion and SI rate units. Sender-only editing remains enforced in UI, decrypted state validation and server authorization.

Disposable real-browser checks verify first transfers on both sides, a sent photo cached without downloading its own copy, reloads with no additional chunk GETs, sender-only Edit visibility, overlapping checks and Signal-style blue. Generated audio/video exercise real browser codec/stat reports and the compact call indicators; phone-width light/dark layouts are checked. No real device media, location, contacts or call recipients are used. These tests do not certify physical-phone routing or audio quality. Existing TURN/container checks apply to unchanged networking components.

## v0.8.0 call sharing and network adaptation

69 private / 73 public-release Node tests cover separate RTP-kind rates, reset baselines and repair exclusion; profile-specific encode/decode probes, missing/rejected/stalled APIs and mutual efficiency/fallback preferences; voice/capacity and CPU budgets; queued restart/rollback, relay-refresh fallback, cancellation and stale server disconnect timers; paced transfer pause/resume/abort; authenticated immutable ciphertext pieces, incomplete-upload rejection, legacy chunk reconstruction and expiry/deletion cleanup. Existing cache, encryption, authorization, messages, camera, audio-output and onboarding checks continue to pass.

Disposable browser sessions use synthetic camera/microphone, accounts and files. Real browser RTP shows Opus and H.264 with separate Voice/Video rates. A photo arrives on both sides during a connected call. Injected Wi-Fi/cellular events reduce both ends to the cellular budget, then restore Wi-Fi while preserving the call ID and timer. A forced signaling socket close reconnects with a fresh ticket and resumes that same call. Injected 25 kbps capacity, 2-second delay and high jitter pause outgoing video and file transfer while audio remains enabled; restoring statistics resumes transfers after healthy recovery. Camera snapshots clone the live call track without ending the call. These are controlled policy tests, not physical radio handover, hardware-acceleration or audible-quality certification.

The embedded browser independently rejects setConfiguration even on a fresh peer connection with or without explicit certificates. The app skips unchanged settings and retains still-valid relay credentials when an update is rejected; Node tests verify the supported update path and expiry rejection. Physical Android/iPhone tests, metered network-layer traffic and hardware power/encoder measurements remain necessary. Container CI builds both app and relay for the release; TURN/router configuration is unchanged.


## v0.9.0 contact removal

75 private / 79 public-release Node tests cover held presses versus ordinary taps, scrolling/movement/cancellation/disposal, right-click and keyboard access; participant/origin authorization and isolated idempotent removal; deletion of both message directions, reactions/receipts/edits through cascades, complete and unfinished media, chunk/part cleanup, offline deletion markers and replay rejection after a fresh invitation. Waiting and answered calls stop; unrelated calls remain and both participants can call again after reconnecting through a new invitation.

Disposable two-browser QA verifies tap-to-chat, an 800 ms held press, right-click, Shift+F10, cancellation without deletion, confirmed removal on both phones and persistence after reopening. A downloaded preview initially exposed a whole-chunk buffer mismatch that prevented ciphertext caching outside calls. After correction the recipient’s cached-file count became one; removing the contact reduced it to zero with no messages or contact remaining. Physical Android/iPhone long-press ergonomics and hardware codec measurements remain manual checks.

## v0.10.0 call presentation, sharing and notification actions

82 private / 86 public-release tests pass with JavaScript syntax checks. New coverage checks video yielding without altering voice caps, waiting for in-flight sender updates, video restoration and expiry of the remote sharing lease, capacity-aware transfer budgets in both directions, truthful unknown audio-output state, one-use identity-bound notification decisions and expiry, notification Answer/Decline availability/fallback, recipient-only decline authorization/origin checks, and encrypted sharing signal binding to an existing call. Reminder queue deadlines are now bounded at 20 seconds, with at most three attempts and cancellation preserved.

Disposable browser sessions use generated audio/video, accounts and files. A 2 MB file starts during a connected Opus/H.264 call; both endpoints reduce the video cap from 900 to 180 kbps while retaining the 48 kbps voice cap. Injected 25 kbps capacity, high delay and jitter pause file bursts and outgoing video; healthy recovery completes the transfer and restores both camera budgets. A simulated deliberate notification Answer decision opens and answers the verified matching offer through the real foreground handoff. Phone-width portrait presentation shows the aligned codec/rate rows, quality to the right and transparent control tray. No real personal media, hardware microphones/cameras, location or push recipients are used.

These are policy, API and browser-integration checks. They do not certify audible sound on locked physical Android/iPhone devices, native heads-up banners, hardware routing or radio handover. Android Chrome may not expose a built-in earpiece/speaker switch. Web push cannot force notification sound or override Silent mode, Focus, denied permissions or OS/browser suspension; users must complete the actual locked-phone alert test.

## v0.11.0 message notices, countdowns and transfer placeholders

89 private / 93 public-release tests pass with JavaScript syntax checks. Added tests cover neutral notification payloads; opaque-ID routing without URL parameters; one-use identity binding, expiry, missing contacts and sender/recipient validation; isolated countdown updates and deadline boundaries; encrypted progress reservation authorization, lifetime bounds, no message-history storage and cancellation; progress version ordering, immutable metadata, monotonic percentage, lease expiry and committed/deleted guards.

Disposable browser tests confirm notification navigation from a fresh page and from the contact list on an existing phone, matching the intended sender/message. A 30-second text counts down beside its timestamp and overlapping receipt marks and disappears on both sides. The existing photo stays cached through countdown updates and a third phone-width view. A 2 MB upload during a connected Opus/H.264 call displays Sending/Receiving spinners and percentages on both phones, then becomes the ordinary completed file bubble. Hanging up removes pacing and lets the remaining upload finish. Compact codecs/rates and the cog settings icon are visually checked. Portrait previews use synthetic accounts, photos/audio/video and files only.

No claim is made that a website can erase global/synced browser history, guarantee zero forensic traces, override phone notification sound rules or route an earpiece that the browser does not expose. Message/call notification buttons and physical locked-phone sound still require checks on the actual devices.

## v0.12.0 fixed header and sleeping-worker alerts

95 private / 99 public-release tests pass with JavaScript syntax checks. New notification tests exercise a frozen foreground page, repeated live alerts replacing one notification with sound/vibration requested each time, a provider queue deadline passing while the original call remains waiting, answered/ended/expired results, original expiry during the server lookup, indefinitely blocked device storage and a status fetch that ignores abort. The worker proceeds after its bounded lookup and aborts the request. Failure to inspect existing notifications cannot prevent the silent expired-call result. A separate fallback test verifies fresh audible reminder tags for engines without renotify and cleanup that preserves the new notice. Apple declarative fallback retains fresh attempt tags. Existing notification Answer/Decline and message-to-chat handoffs still pass.

Phone-width browser QA uses synthetic accounts, microphone/video streams and a local server. Video/voice rates share numeric/unit columns, and the quality badge remains at the same centered location through connection-quality and video/voice changes. Actual locked-phone audible delivery remains a manual test; automated tests cannot certify Android/iPhone notification sound or override their settings.

## v0.13 security upgrade

110 private-project / 114 public-release Node tests pass, including ratchet replies, signed framing/tamper rejection, encrypted history and reload, atomic concurrent tab sends, simultaneous first-session convergence, exact legacy migration/no downgrade, deletion/expiry/tombstones, persistent pins after contact removal, one-use signed prekeys, attachment manifests/edits/receipts/reopened offers, discarded consumed transport keys, slow attachments after 55 later messages, ordered hydration, full-tag enforcement, authenticated WebSocket offer/answer/ICE, delayed file-key requests yielding to established-call signaling, and expired-lease fencing. Existing 95 tests continue to pass. Disposable real-browser checks verify invitation activation, text/replies, delivery/read indicators, edits, inline images and history/media after both pages reload, with no browser crypto errors. This is not a physical-phone battery/routing/background-ring test or an independent security audit.

## v0.14.1 call header and source security review

124 private-project / 128 public-release Node tests pass, with syntax checks. The added key-directory regression rejects a substituted one-time prekey signature and a correctly signed replacement Olm account after pinning, then confirms the established conversation still decrypts. Existing framing, tamper, legacy-downgrade, one-use prekey, cross-tab fencing, discarded message-key, deletion/expiry and SAS proof/context/cancellation checks pass.

Disposable browser sessions with generated audio/video verify matching four-word SAS through actual WebRTC. At 390 pixels, the name and codec icons share the same left edge, words are centered at 195 pixels, and quality aligns with codec text underneath. At 320 pixels the words remain centered without overlapping the truncated name. A synthetic `pagehide` event clears the SAS text, aria label, title and state; browser error logs are empty. No real user accounts, microphones/cameras, locations or push recipients are used.

Documentation now distinguishes end-to-end content encryption from origin-delivered code trust, classical transport forward secrecy from retained history, per-stream recovery, first-contact trust, metadata, and short-lived sealed local status copies. The [review](SECURITY_REVIEW.md) records evidence, the cleanup fix and remaining limits. It is not an independent audit or proof that all MITM/post-compromise cases are secure. Physical-phone audio/ringing and other unchanged networking components retain their prior verification limits.

## v0.15.0 optional ntfy alerts

- Existing encryption implementation, identity pins, SAS and codec sources are preserved. Source-only server deployment verifies existing identity/authentication records and protected crypto files before and after updating.
- 134 application tests pass; the public checkout additionally covers publishing and distribution checks. Regressions exercise fixed-destination configuration, per-owner random read addresses, denied anonymous publishing, generic payloads, successful-delivery/heard confirmation, opening-link or explicit phone-icon fallback, cancellation, independent Web Push and removal.
- The real pinned ntfy 2.31.1 binary was tested locally: authenticated write-only publishing works, anonymous publishing and unrelated-topic reads fail, anonymous capability subscription and view actions work, and the publisher cannot read alerts. No real users were notified by these tests.
- Synthetic Chromium checks cover Android subscription links, iPhone guided setup, narrow light/dark layouts, same-tab notification hash handling, browser-profile mismatch, recovery of pending sound tests after reload and explicit phone-icon fallback. These simulate phone browser layouts and do not certify Android/iOS native notification delivery.
- Public HTTPS/no-store and unauthenticated WebSocket rejection are checked through the production proxy/Tunnel. Native locked-phone sounds, public ntfy routing, operator-installed service isolation and external-network delivery still require the operator/device tests in [Extra ringing](EXTRA_RINGING.md).

## v0.15.1 public documentation and distribution

- 139 public-source tests pass, including the existing application, encryption, signaling, media and ntfy regressions and a new publishing-guard check for embedded notification read capabilities and publisher tokens. JavaScript syntax and Debian installer/shell/Python checks pass.
- Local documentation links and heading targets resolve; shell examples parse. The native guide's official Node 24.22.0 amd64 download and SHA-256 check were exercised without installing system services. A new guide does not certify a fresh Debian installation, public DNS, a router or phone behavior.
- Public source, Git history and release metadata are reviewed for known deployment identifiers, private addresses/paths, credentials, setup links and notification capabilities. The release script archives only the reviewed Git tag and generates SHA-256 checksums. Runtime folders, private environment files, databases, certificates, logs and personal screenshots are excluded. Pattern scans are a publishing safeguard, not a promise that every possible secret format is detectable.
- CI builds the app and TURN images and repeats source checks; see the [workflow results](https://github.com/adlererik/WebCaller/actions/workflows/ci.yml) for the release commit. No live server credentials are used in this workflow.

This patch updates documentation, version labels, public-distribution checks and the private QR card's branding. It does not change application encryption, stored identities, codec policy, call signaling or notification delivery. Existing real-device and independent-audit limitations remain.

## v0.16.1 prebuilt Docker distribution

Native amd64 and arm64 CI builds run the same disposable complete stack: generated private setup, app HTTP health/no-store, WebSocket authentication rejection, first identity registration, private QR rendering, authenticated TURN allocation, ntfy anonymous read-capability/write-denial, publisher read-denial, priority-5 alert delivery through the app's secret file/private network, and identity/topic/publisher persistence after container recreation. The fixture has no real contacts, microphone/camera, GPS, phone subscription or production credentials. Each test run uses a fresh random Compose project name and tears down only its own disposable volumes. Caddy configuration and the connector token-file option are checked separately; public ACME issuance and real Cloudflare connectivity need each operator's setup.

144 automated public-source tests pass. New tests reject unsafe setup values, partial/repeated setup, mixed/unreadable publisher credentials, non-approved HTTP destinations, unsafe update versions, downgraded updates and tampered staging. Updates preserve private configuration in fixtures. Publishing guards reject generated config/service environment paths, credentials and notification capabilities. Source/installer syntax checks and the existing crypto, SAS, media and notification regressions remain part of CI. See [workflow results](https://github.com/adlererik/WebCaller/actions/workflows/containers.yml) for the release commit.

This tests container deployment and API behavior, not physical locked-phone sounds, subjective audio, hardware codec efficiency, internet relay reachability, router forwarding or seamless radio handover. TURN allocation alone is not an end-to-end media test. Source/native install paths remain available; migration of an existing deployment into new prebuilt volumes is deliberately not automated. No new independent cryptographic audit is claimed.

## Unreleased Vodozemac 0.11.1 upgrade

154 public-source tests pass. Ten added checks use the actual previous pinned 0.9.0 WASM as a development-only compatibility oracle, exercise both old/new initiation directions and SAS roles, reopen old saved accounts/sessions/history/attachment keys, consume an unread prekey after upgrading, continue through an old open tab and reject non-contributory Curve25519 inputs at setup/ratchet boundaries. Binding-level inbound checks reject truncated-tag V1 without consuming the valid prekey; the original packet still works after invalid-key rejection. Existing 144 checks remain passing.

The registry core source matches the pinned upstream 0.11.1 tag. Repeated builds from the public checkout and a separate local path containing spaces produce the same 522,552-byte WASM (SHA-256 `58f30fb84fca1476828527b4dee2308bcd985733108c33c495b817cac5b84bce`). The pinned build script normalizes source/cache paths, refreshes license notices and records source/artifact hashes. CI is configured to rebuild and compare artifacts on relevant source changes; local results do not assert that a future CI job has already run. See the [security review addendum](SECURITY_REVIEW.md#vodozemac-upgrade-addendum--18-october-2026-unreleased).

Disposable Chromium checks at phone width pass with two updated engines and with one actual previous engine served to the other synthetic browser profile. They exercise UI enrollment, two-way texts, inline encrypted images, readable text/image history and identity fingerprints after reload, generated-media WebRTC video calls, matching four-word SAS and word cleanup after hangup. Both runs report zero page errors. No physical microphone/camera, real account, external STUN/TURN, production server or push recipient is used. This does not certify iPhone/Android hardware or background behavior. A separate production-only npm install confirms the previous test engine is omitted.

## Preferred ntfy call alerts

Regression coverage includes default and migrated preferences, authenticated/origin-checked switching without changing topics, ntfy-only success, browser-only absent/untested/opted-out recipients, publishing rejection/network/timeout fallback, same-call fallback retention and next-call retry, answer/decline/hang-up cancellation, unchanged text pushes, exact encrypted-offer access limited to the waiting recipient, and stale/profile-mismatched notification links. Tests use synthetic users and stub publishers; they do not certify physical-phone sounds or native link routing.

## Call signaling order and ringtone lifecycle

A deterministic reproduction of the previous call sender produced ICE before the initial offer, which the server rejects as an unknown call. Regression tests now hold early ICE/SAS/sharing updates until the initial encrypted offer or answer is published, serialize later encryption and transport sends, cancel stale work and keep the queue usable after an individual failure. Incoming call work is ordered separately from message/media downloads, so notification/live-offer duplicates are checked after earlier decryption completes.

Ringtone tests cover answer, connection, end, replacement calls and delayed callbacks. Server integration tests check that answering closes sibling recipient tabs, a second tab cannot replace the accepted answer, unknown calls remain unauthorized, and errors carry the originating call ID so a finished call cannot disrupt a later one. Real cryptographic verification remains enabled; ordinary WebRTC failures no longer receive a misleading encryption warning.

Disposable in-app browser checks use generated microphone/camera tracks and synthetic accounts, with no real notifications or physical device capture. Voice calling, upgrading voice to video, a second video call after reload, matching four-word SAS, and immediate page-ringtone cleanup pass. With two recipient tabs sharing an identity, only the answering tab keeps the connected call; the sibling returns to chat and its ring counter stays stopped. Both active endpoints report zero authentication/connection warnings. These checks do not certify iOS/Android background audio, real radio handovers or OS notification delivery.

## Optional personal calling codes

198 private-project / 208 public-source tests pass with syntax checks. Seventeen new regressions cover numeric parsing, fragment precedence, atomic first-tab identity creation, saved-token retries, unchanged existing identities, unique/retired/disabled codes, no enrollment for unknown codes, remembered-target rejection, encrypted five-message requests, recipient-only acceptance, media restrictions, blocking/unblocking, first encrypted call signaling and persistent conversation history. The mobile keypad does not summon a competing software keyboard; preflight cancellation, failed retries and rapid double taps are covered.

Disposable browser profiles with synthetic identities and generated audio/video verify code selection, first-visit messaging without an invitation, recipient acceptance by answering, a voice call, and a fresh visitor’s first-action video call. Both call endpoints show matching four-word SAS, stop page ringing after connection and clear the words after hangup. Reloading and dialing the same code reopens the same contact and earlier two-way texts. A ready-event race was corrected so initial synchronization cannot unnecessarily restart a newly created call. No real user notifications or microphone/camera captures were used. These checks do not certify native phone notification routing, background ringing, hardware or radio handovers.

The deployment check runs against an isolated copy under the existing native Debian Node runtime. It verifies additive migration against a separate SQLite snapshot and preserves existing identity/token/contact/ratchet and ntfy records. Cryptographic algorithms, vendor engine, SAS, TURN, push configuration and the service definition are unchanged. The only change to the existing crypto utility is atomic creation of a missing browser vault entry.

## Calling defaults, local labels and appearance

204 private-project / 214 public-source tests pass. Added checks exercise explicit/automatic appearance, saved selections, unavailable storage, local-only contact renaming, vault reload, original-name restoration, unchanged identity/trust records, invalid/removed contacts and default video submission. Existing signaling, encryption, SAS, message history and media tests remain passing. Browser checks use synthetic accounts and generated media to verify video as the first/Enter action, matching SAS, contact labels after refresh, separate original names on the other phone, and Dark/Light selection. No production accounts or physical capture devices are used in these tests. This front-end update does not require a native service restart, database migration, dependency changes or Docker.

## Mobile contacts home redesign

The home screen uses a separately scoped stylesheet, compact labeled dialing/invitation cards, contact search, distinct avatar colors and separate chat/video/options targets. Existing chats, call screens, dialogs and encryption sources are unchanged. 204 private-project / 214 public-source tests pass, with native Debian staging and syntax checks. Disposable browser checks cover narrow phone-frame layouts in light and dark, contact search, visible options/rename, invitation and dialing navigation, chat opening and one-tap contact-row video calling with matching SAS. The browser previews use synthetic profiles and generated media, not production users or physical capture devices. Deployment preserves the running native service without a restart or database migration.

## Settings and message timers — 18 October 2026

The redesigned Settings page retains all existing controls and separates the timer into a radio-list page and a two-wheel custom popup. Disposable real browser identities verify both light/dark phone layouts, keyboard-operated number/unit wheels, Cancel versus Set and Save, the four-week preset, and Off saved across refresh. A real two-browser encrypted Off text exchange includes delivery/read receipts and sealed-history reopening without a countdown. Existing live identities are not used for these checks.

Nine focused lifetime tests cover malformed saved preferences, exact custom bounds, legacy/v2/signaling lifetime separation, timeout overflow/cancellation, encrypted text/edit/read/delete/reload behavior, long offline Off delivery, safe migration of unexpired current sessions, refusal to revive expired sessions, and Off attachment encryption/reservation/commit/deletion. Full source tests pass: 213 for the private/native build and 223 for the public tree (which includes publishing/container guards). The change leaves cryptographic algorithms, vendor engine, identity trust and call SAS unchanged; retained current chat/update state and Off history have the documented storage tradeoffs in SECURITY.md. Phone OS ringing remains subject to the previously documented limits.

## Full-frame video and first-view timers — 19 October 2026

The private/native tree passes 226 tests; the public tree passes 236 including publishing/container checks. New tests cover authenticated v3 policies, immutable first-view clocks across tabs/reloads, sender-expired/recipient-unread delivery, delayed read-start replay beyond five minutes, metadata-only retries after local expiry, recipient file access after sender expiry, immutable attachment AAD/cache retiming, deletion/replay barriers and expired-update echoes. Existing v1/v2, old/new Vodozemac, identity/session/history, media and SAS compatibility tests remain passing.

Two disposable browser identities exchange a five-second timed message: the sender copy expires while the recipient chat is covered, then the recipient gets a full five seconds at first viewing, with no verification errors. A generated-media WebRTC call verifies portrait 180×320 video reaching a 1280×720 desktop viewport with contain fitting, while the reverse stream remains 320×180. The complete camera frame survives capture and sender scaling; four SAS words match on both sides and the call ends on both peers. No physical microphones/cameras, real messages, locations or phone push recipients are used. Hardware-phone orientation and shortcut-icon refresh remain subject to browser/device behavior.

The native deployment stages its full tests and exercises the additive message_views migration on a private SQLite copy, comparing existing account/contact/ratchet/prekey/code/push/ntfy records before applying. Source/configuration hashes and existing core account records are checked across deployment. No Docker conversion or identity reset is part of this update.

## v0.17.0: adaptive sharing and 200 MiB files

The release suite contains **247 public-source tests**, including bounded workers, healthy unknown-network probing, metered ceilings, preparation without congestion cooldown, poor/stale audio pauses, cautious recovery, cancellation, a 200 MiB/3200-chunk manifest and the last chunk's routing/authentication. Legacy encrypted files, actual old/new Vodozemac engines, saved identities/sessions/history and call SAS remain covered. Timing-sensitive lifetime fixtures use controlled clocks rather than assuming asynchronous cryptography finishes within one second; reminder tests check that notification counts stop increasing after answer/cancel.

A separate full-size HTTP test uploaded and downloaded all **209,715,200 bytes** through authenticated contact-only endpoints, decrypted and checked every chunk, then confirmed delete-for-both removed server ciphertext. It used bounded workers and exercised rate-limit retries; this is a loopback server/integrity test, not a WAN speed promise.

Two real browser peers used generated cameras/audio, persisted disposable identities and a 4,212,707-byte PNG with a synthetic 60 ms delay per attachment request. Both peers displayed the image during an active Opus/H.264 call with matching SAS. Refreshing/reopening used the incremental encrypted cache with **zero additional download requests**. An injected poor-audio interval paused file traffic while the peer connection stayed connected, then completed after recovery. Tests use no physical microphones/cameras, production accounts or real push recipients.

New cache tests cover additive opening of the original IndexedDB schema, complete-set publication, no whole ciphertext array in the new manifest, generation fencing, both deletion races, immutable AAD with first-view retiming, owner/file binding, clearing and bounded incomplete staging retention. Browser quota/eviction, physical-phone memory, severe real WAN loss, audible quality and radio handovers still require device tests.

Distribution checks build and exercise the public amd64/arm64 app/setup/TURN images, private setup generation, Caddy/Compose validation, health/no-store, WebSocket authentication, ntfy ACL/priority, relay allocation and restart persistence. Release archives contain audited tracked source or the small digest-pinned Docker bundle, never live environment, data, credentials or deployment backups. Container smoke tests use disposable projects/volumes. See the release CI results; release status is not an independent security audit.
