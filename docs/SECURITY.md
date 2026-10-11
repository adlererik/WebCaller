# Security and privacy model

## Scope

This is an unaudited initial preview. Do not substitute it for independently audited software where compromise, surveillance or forensic recovery could cause serious harm. It is one-to-one software, not Signal Protocol or Double Ratchet.

## Encryption

Browsers generate non-exportable P-256 ECDH/ECDSA private keys stored in IndexedDB. Per-envelope ephemeral ECDH, HKDF-SHA256 and AES-256-GCM encrypt text and signaling; ECDSA-SHA256 authenticates signed metadata/ciphertext, sender/recipient and expiry. Sender and recipient get their own decryptable copies. Pinning/safety numbers detect known identity changes. Initial trust depends on the invitation channel.

There is **no forward secrecy against compromise of the recipient's long-term private key**. The server routes ciphertext and public keys, but a compromised origin can serve malicious JavaScript. Non-exportable keys can still be used by malicious same-origin code. Use a dedicated calls subdomain; URL paths do not isolate IndexedDB from another script on the same origin. DTLS-SRTP protects media; no separate independently verified application call-key protocol is claimed.

## Expiry and traces

File keys and names are wrapped inside signed encrypted message envelopes; 64 KB file chunks use AES-GCM with indexed nonces and authenticated file identity/order/size/expiry. The same unaudited protocol and long-term key limitations apply to attachments. The server can see sizes and timing. Completed attachments are immutable and contact-only; pending uploads share bounded quotas.

Messages expire from send time, including unread/offline messages. Server purge runs every second and on startup/read; client purge removes plaintext references/DOM. Backgrounding clears displayed plaintext and revokes decrypted image/file blob URLs. Expiry/device deletion cascades to encrypted chunks. Chat is hidden from print layouts. These actions cannot prevent OS screenshots, screen recording or photographing a display. No persistent plaintext outbox/cache is created. SQLite uses `secure_delete=ON` and DELETE journaling for operational deletion, not guaranteed forensic erasure on SSDs/snapshots/backups.

Device keys/tokens, names, contacts and settings persist. Screenshots, browser history, camera/share history, OS notification history, DNS records, push/provider metadata, swap, recipients' external copies and backups may remain. HTTPS/Tunnel/proxy/operator logs can reveal metadata. A website cannot guarantee zero traces.

## Authentication and signaling

Only first-owner setup can register without an invitation while no users exist. The private QR/link contains that same bearer secret; keep it private. If all users are deleted the code can become eligible again. Invitations expire after 24 hours, are single use and pin the inviter fingerprint. API bearer tokens are hashed in server storage; device possession grants access. Origin enforcement, contact authorization, body limits, rate limits, no-store, CSP, framing/referrer/permissions headers and short-lived single-use WebSocket tickets are used. Tokens are not placed in WebSocket URL query strings.

Push subscription endpoints are restricted to known HTTPS provider hosts to reduce SSRF risk. Notifications are generic. Coturn has temporary REST HMAC credentials, quotas and denied private/multicast peer ranges. Never expose unauthenticated TURN or enable browser certificate-warning bypasses.

## Publishing safely

The repository/release contains source, tests, examples and documentation. It excludes `.env`, databases, identities, runtime/private QR output, certificates/keys, deployment backups, logs, dependency folders and production diagnostics. Examples use reserved domains and explicit user-supplied server addresses. `npm run audit:source` checks Git-tracked files for private file types and common credential literals. Deployment-specific addresses and names require a separate manual review. This is a focused guard, not a professional security audit. Review new data/assets before committing and rotate a secret if it was ever published; deleting a later commit does not erase Git history.
