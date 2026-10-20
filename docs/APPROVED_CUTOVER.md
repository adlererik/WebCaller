# Operator-approved replacement of an Olm installation

v0.18.0 uses official libsignal/PQXDH with an unaudited custom browser adapter. An operator may explicitly approve replacing their existing native application while keeping the same HTTPS origin, proxy/tunnel, TURN and ntfy configuration. This does not make the integration independently audited or change live media from DTLS-SRTP.

The entry point accepts `WEBCALLER_CRYPTO_ENGINE=libsignal-pqxdh-v1` for this approved cutover. The separate preview still accepts its original test-instance flag. Neither option allows an encryption downgrade or changes network services.

## What stays and what starts fresh

- Preserve the original device vault (`ellie-device`), application identities, authentication tokens and application identity fingerprints. Existing P-256 identities authorize nonextractable Ed25519 application signers; new identities use Ed25519.
- Retain users, contact relationships, public calling codes, invitations, Web Push subscriptions and ntfy topic/confirmation/preference records. Keep the existing VAPID, TURN and ntfy credentials and every existing network URL.
- Remove incompatible server messages, media, message events/receipts and old Olm account/prekey records during an offline, backed-up migration. New PQXDH sessions publish fresh signed EC/PQ prekeys.
- The Signal state namespace is `webcaller-signal-secure-v1`; the media namespace is `webcaller-signal-media-v1`. Do not read or overwrite the earlier Olm ratchet/media databases. Existing settings remain in `ellie-settings`; the Home Screen manifest identity/scope stay unchanged.

The database migration is explicit and idempotent: `deploy/migrate-olm-to-signal.py --database /path/to/offline/calls.sqlite --apply`. Run it only with the application stopped and a verified matching source/configuration/runtime/database backup. It does not stop services, modify environment files, reconfigure networking or clear users/subscriptions. It leaves a `crypto_deployments` record so retrying does not erase later Signal traffic.

## Deployment and recovery requirements

Before cutover, test the exact payload in a staging directory with disposable data and a migrated database copy. Back up source, native runtime/dependencies, private configuration, the original service unit and a consistent SQLite snapshot. Actually start a restored copy on a loopback port to verify recovery. Keep these backups private; they contain secrets and old encrypted test data.

Stop the original application service before changing its database/source. Keep its service name, native Node runtime, listener and public URL. Add only the explicit engine flag to its private environment. Do not invoke the generic server installers, modify proxy/tunnel routes, regenerate credentials or deploy Docker as part of the cutover. Start the original service and verify public HTTPS/WSS, signed encrypted messaging/calls/SAS, file transfer and configured relay/alert paths. Roll back automatically if startup or protected configuration checks fail.

Refresh both phones using their usual URL/Home Screen icon; keep site data and existing ntfy subscriptions. Older loaded Olm pages cannot communicate with Signal pages. No manual owner setup should be needed for an existing valid identity/profile. OS notification and audio-routing restrictions still apply.

Rollback must stop the application and restore the matching original source, environment, dependencies/runtime and database, then start that same service. Do not restore over a live database. The old phone vault/Olm stores remain available; reload the old application without clearing site data. Server state created after the snapshot is lost on rollback, and phones newly enrolled after cutover may need enrollment again. A server backup does not export browser-held private keys.

The source offer must include these operator adaptations. Regenerate it after changes; private environment, backups, operational reports and conversation data must never enter the public source archive.
