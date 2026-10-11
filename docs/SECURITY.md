# Security and privacy model

## Scope

This is an unaudited preview. Do not substitute it for independently audited software where compromise, surveillance or forensic recovery could cause serious harm. It is one-to-one software, not Signal Protocol or Double Ratchet.

## Encryption

Browsers generate non-exportable P-256 ECDH/ECDSA private keys stored in IndexedDB. Per-envelope ephemeral ECDH, HKDF-SHA256 and AES-256-GCM encrypt text and signaling; ECDSA-SHA256 authenticates signed metadata/ciphertext, sender/recipient and expiry. Sender and recipient get their own decryptable copies. Pinning/safety numbers detect known identity changes. Initial trust depends on the invitation channel.

There is **no forward secrecy against compromise of the recipient's long-term private key**. The server routes ciphertext and public keys, but a compromised origin can serve malicious JavaScript. Non-exportable keys can still be used by malicious same-origin code. Use a dedicated calls subdomain; URL paths do not isolate IndexedDB from another script on the same origin. DTLS-SRTP protects media; no separate independently verified application call-key protocol is claimed.

## Expiry and traces

File keys and names are wrapped inside signed encrypted message envelopes; 64 KB file chunks use AES-GCM with indexed nonces and authenticated file identity/order/size/expiry. The same unaudited protocol and long-term key limitations apply to attachments. The server can see sizes and timing. Completed attachments are immutable and contact-only; pending uploads share bounded quotas.

Messages expire from send time, including unread/offline messages. Server purge runs every second and on startup/read; client purge removes plaintext references/DOM. Backgrounding clears displayed plaintext and revokes decrypted image/file blob URLs. Expiry, participant deletion and device deletion cascade to encrypted chunks. Explicit deletion retains only message ID, participant IDs and original expiry until that expiry to stop replay and inform reconnecting devices. It does not retain the envelope/key/name/content. Automatic previews download encrypted media in the open visible chat and retain decrypted blobs only in memory. Complete encrypted media chunks also persist in a separate IndexedDB cache until deletion/expiry cleanup; that cache has identity/message/file IDs, byte size, count and original expiry, but no plaintext, filenames, MIME types or file keys. Expiring local deletion tombstones block late-write resurrection. Remote deletion reaches an offline phone when it reconnects; server deletion markers are processed before media rehydration. Cache reads/writes reject expired content; physical cache purging cannot run while the browser is closed and occurs on next startup/foreground and periodically while running. Browser/OS storage can retain forensic remnants or evict cached data. Forget this device clears local encrypted media, but cannot erase other devices while they are offline. Camera and voice drafts are discarded on backgrounding; native camera/download copies remain under OS control. Typing statuses are signed/encrypted, short-lived and never stored; no draft text is transmitted. Chat is hidden from print layouts. These actions cannot prevent OS screenshots, screen recording or photographing a display. No persistent plaintext outbox/cache is created. SQLite uses `secure_delete=ON` and DELETE journaling for operational deletion, not guaranteed forensic erasure on SSDs/snapshots/backups.

Device keys/tokens, names, contacts and settings persist. Screenshots, browser history, camera/share history, OS notification history, DNS records, push/provider metadata, swap, recipients' external copies and backups may remain. HTTPS/Tunnel/proxy/operator logs can reveal metadata. A website cannot guarantee zero traces.

## Authentication and signaling

Only first-owner setup can register without an invitation while no users exist. The private QR/link contains that same bearer secret; keep it private. If all users are deleted the code can become eligible again. Invitations expire after 24 hours, are single use and pin the inviter fingerprint. API bearer tokens are hashed in server storage; device possession grants access. Origin enforcement, contact authorization, body limits, rate limits, no-store, CSP, framing/referrer/permissions headers and short-lived single-use WebSocket tickets are used. Tokens are not placed in WebSocket URL query strings.

Push subscription endpoints are restricted to known HTTPS provider hosts to reduce SSRF risk. Notifications are generic. Coturn has temporary REST HMAC credentials, quotas and denied private/multicast peer ranges. Never expose unauthenticated TURN or enable browser certificate-warning bypasses.

## Publishing safely

The repository/release contains source, tests, examples and documentation. It excludes `.env`, databases, identities, runtime/private QR output, certificates/keys, deployment backups, logs, dependency folders and production diagnostics. Examples use reserved domains and explicit user-supplied server addresses. `npm run audit:source` checks Git-tracked files for private file types and common credential literals. Deployment-specific addresses and names require a separate manual review. This is a focused guard, not a professional security audit. Review new data/assets before committing and rotate a secret if it was ever published; deleting a later commit does not erase Git history.

## Call-alert data

Invitations now optionally hold a recipient name until redemption/expiry. During iPhone Home Screen setup, the invitation fragment stays in the address for launch handoff. It is cleared after acceptance and only its hash is retained to recognize a previously consumed launch link. Browser/Home Screen metadata and a user-copied clipboard may still retain that original URL. Fragments are never sent in HTTP URLs or referrers. A Home Screen web app has its own browser identity; existing browser keys/contacts are not silently transferred or reset. Use a fresh invitation for a new Home Screen identity.

Push contains generic text, type, opaque call/test ID and deadlines, without names, SDP, keys or message bodies. Push-provider endpoints/subscription keys remain server-held. The worker reads the existing browser vault token to check call state on the same origin. Test records live in server memory for ten minutes and bind to owner and subscription; confirmation timestamps persist until that subscription changes or is removed. The browser keeps an unfinished test ID/deadline to resume after notification tap. Phone sound confirmation is a user report, not a delivery or audibility guarantee.

## Location privacy

Location is optional, one-shot and previewed before Send. Coordinates/label/accuracy/capture time and the thumbnail are encrypted using the existing attachment/message format. Sender map-tile requests disclose map area/IP to the configured provider. The map image is transmitted to the recipient as encrypted media; receiving it does not automatically load third-party map tiles. Tapping Maps sends coordinates to that external service. Normal tile caches, browser history and provider metadata may remain after message expiry/deletion. The app’s no-store ciphertext policy does not erase external tile caches. Never claim zero location traces. Map provider configuration is public; do not embed private API keys. Only that provider’s image origin is added to CSP, and geolocation/speaker-selection are allowed for self only.


## Message actions and receipts

Edits, emoji reactions, pins and receipt timestamps are signed/encrypted with the same device keys as chat. The server sees participant IDs, target message IDs, event kinds, update time and expiry, but not the edited text, emoji or read/delivery timestamps inside the payload. It retains only the latest state per participant and kind. Updates cannot extend original expiry and are deleted with the parent message/device.

An edit updates the visible message, but the original encrypted message envelope remains until deletion/expiry; this is not forensic erasure of the prior text. A recipient, forwarded copy, downloaded file, clipboard or screenshot may retain content. Replies avoid keeping a quoted plaintext copy after original deletion/expiry. A viewed acknowledgement is based on visible app UI, not an assurance a human read it. The timestamp comes from the recipient device clock. Pins never defeat disappearing-message expiry.

Call sharing keeps the same encryption and expiry rules. The server temporarily stores small ciphertext parts, never their file key or plaintext, and only assembles them into authenticated ciphertext chunks. Incomplete parts disappear with the reserved attachment on cancellation, device removal or expiry. Capability summaries contain codec variants and efficiency booleans inside encrypted call signaling; hardware implementation names are not sent. Calls remain subject to the same DTLS-SRTP and origin-trust limitations.


## Removing a contact

Contact removal is participant-scoped and guarded by bearer authentication and origin validation. The server atomically removes both contact rows, this pair’s ciphertext messages, attachments (including incomplete uploads), encrypted message events and all chunk/part records. Other conversations remain. It ends this pair’s waiting/active call and stops reminder timers. Idempotent retries return no information about conversations the requester does not participate in.

Only deleted message IDs, participants and original expiry remain as replay barriers; there is no message content in those markers. The markers expire with the originals. They also let a closed browser evict cached ciphertext after reconnecting. Local contact pins/settings, displayed plaintext and drafts are cleared on removal. Saved files, forwarded copies, screenshots, offline devices before reconnecting, browser/OS traces and external backups cannot be guaranteed erased. Deployment source backups do not contain the application database; operators should set their own data-backup retention policy.

## Notification actions

High urgency requests fast delivery, not privileged audio. No background microphone or custom continuous ringtone is attempted. Notification sound/banners remain subject to user and OS controls. A one-time IndexedDB answer decision contains only owner ID, call ID and a deadline capped at 30 seconds; no secret or content is added. It is consumed/deleted atomically and rejected after expiry or for another identity. The page also checks a signed encrypted incoming offer and authenticated waiting status while visible. URLs cannot auto-answer calls. Expired metadata may remain on disk while the browser is suspended, and is cleared on consumption, call end or forgetting the device. Background decline is authenticated, origin checked, recipient only, and refuses already answered calls. Notification history can remain under OS control.

## Browser history and message routing

A website cannot erase browser/global or synced history, OS notification records or evidence of its service worker, notification permission, saved identity and cached ciphertext. Normal history deletion is a browser/user operation, not a website API. No IDs or names are added to conversation URLs; notification message routing uses only opaque IDs in a short-lived identity-bound local record, removed on consumption/forgetting the device. Neutral notification wording protects visible content, not the existence of the website. Suspended browsers may retain expired metadata until they run again. Persistent phone identity and cached media remain as required for returning calls and local reopening. See [Browser privacy](BROWSER_PRIVACY.md).

Transfer progress remains encrypted and only in client memory. It is never persisted as chat history or server events; its sender must own a live reservation. Late progress cannot restore a committed/deleted attachment, and its short lease expires if connectivity is lost. Countdown updates do not change expiry or mark a message read by themselves.
