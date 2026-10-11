# Security and privacy model

## Scope

This is an unaudited preview. Do not substitute it for independently audited software where compromise, surveillance or forensic recovery could cause serious harm. It is one-to-one software, not Signal Protocol or Double Ratchet.

## Encryption

Browsers generate non-exportable P-256 ECDH/ECDSA private keys stored in IndexedDB. Per-envelope ephemeral ECDH, HKDF-SHA256 and AES-256-GCM encrypt text and signaling; ECDSA-SHA256 authenticates signed metadata/ciphertext, sender/recipient and expiry. Sender and recipient get their own decryptable copies. Pinning/safety numbers detect known identity changes. Initial trust depends on the invitation channel.

There is **no forward secrecy against compromise of the recipient's long-term private key**. The server routes ciphertext and public keys, but a compromised origin can serve malicious JavaScript. Non-exportable keys can still be used by malicious same-origin code. Use a dedicated calls subdomain; URL paths do not isolate IndexedDB from another script on the same origin. DTLS-SRTP protects media; no separate independently verified application call-key protocol is claimed.

## Expiry and traces

File keys and names are wrapped inside signed encrypted message envelopes; 64 KB file chunks use AES-GCM with indexed nonces and authenticated file identity/order/size/expiry. The same unaudited protocol and long-term key limitations apply to attachments. The server can see sizes and timing. Completed attachments are immutable and contact-only; pending uploads share bounded quotas.

Messages expire from send time, including unread/offline messages. Server purge runs every second and on startup/read; client purge removes plaintext references/DOM. Backgrounding clears displayed plaintext and revokes decrypted image/file blob URLs. Expiry, participant deletion and device deletion cascade to encrypted chunks. Explicit deletion retains only message ID, participant IDs and original expiry until that expiry to stop replay and inform reconnecting devices. It does not retain the envelope/key/name/content. Automatic previews download encrypted media in the open visible chat and retain decrypted blobs only in memory. Camera and voice drafts are discarded on backgrounding; native camera/download copies remain under OS control. Typing statuses are signed/encrypted, short-lived and never stored; no draft text is transmitted. Chat is hidden from print layouts. These actions cannot prevent OS screenshots, screen recording or photographing a display. No persistent plaintext outbox/cache is created. SQLite uses `secure_delete=ON` and DELETE journaling for operational deletion, not guaranteed forensic erasure on SSDs/snapshots/backups.

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
