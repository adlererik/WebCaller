# Operations, updates and recovery

## Keep the parts separate

A phone's private identity, ratchets and readable local history live in its browser profile. The server holds public identity/contact metadata and queued encrypted content. TURN is a media relay; ntfy is an optional notification service. Changing one component is not a reason to regenerate another component's secrets.

Use [the native guide](INSTALL_NATIVE.md) or [Docker guide](../docker/README.md) consistently. Keep configuration private. Preserve owner token, VAPID key pair, TURN secret, ntfy publisher credential and browser site data during ordinary updates. Changing hostname/profile can create a different browser storage context; a path on the same origin is not a separate security boundary.

## Back up before an update

Finish active calls. Save the exact source/tag, dependency lock/runtime or image digests, private configuration, service/proxy configuration, a **consistent** SQLite snapshot and any required ntfy state. These are sensitive backups; keep them access restricted. A raw copy of a live SQLite file without its WAL is not a dependable backup. Stop the app for the copy or use SQLite's backup API.

For a native installation at `/opt/webcaller`:

```sh
sudo systemctl stop webcaller.service
mkdir -m 700 -p "$HOME/webcaller-backups"
cp -a /opt/webcaller/.env "$HOME/webcaller-backups/app.env"
cp -a /opt/webcaller/data "$HOME/webcaller-backups/data"
sudo systemctl start webcaller.service
```

Use a **new dated backup directory** for each real backup, not a repeatedly overwritten example. Adapt the service/root to your own installation. Save source/runtime/units separately too. Server backups do not contain phone-held private keys. Browser-profile backups, where available, are separate and highly sensitive; a copied database alone is not a portable device export.

## Native libsignal updates

For a Git installation, review the release, stop the service, make the backup, then fetch the chosen tag and its pinned submodule. Keep `.env`/data/runtime. From the project with its Node runtime in PATH:

```sh
git fetch --tags origin
git switch --detach vX.Y.Z
git submodule update --init --recursive
npm ci --ignore-scripts
npm run verify:signal
npm run prepare:source
sudo systemctl restart webcaller.service
```

Replace the version placeholder with a reviewed actual tag. Preserve any local modifications before switching. Rebuild the source offer after local code edits. Do not deploy an arbitrary branch automatically or run `npm audit fix --force` against the pinned protocol/oracle just to remove a warning. Restore the matching earlier code/config/database with the service stopped if a migration failed. New messages created after an old snapshot may be lost on a database rollback.

For Docker, use its explicit-version updater and [volume/config backup guidance](../docker/README.md). The new bundle format deliberately blocks the old Olm updater from blindly applying this protocol change. `down -v` deletes volumes; do not use it as a restart command.

## Update to v0.19.0

For existing v0.18.0 libsignal installations, this is a normal backed-up source/native update: preserve `.env`, the database, browser site data, identities, service/proxy, TURN and ntfy configuration. No conversation purge or new phone enrollment is required. Reload both browsers once after the code update so they understand the shared-chat sticker context. Old per-file stickers remain readable.

There is no v0.19.0 prebuilt Docker bundle or image. The v0.18.0 Docker release remains available; its updater cannot apply a source-only release. A native source update does not require switching to Docker.

### Sticker sending or reactions

If an older client asks the other person to refresh secure keys while sending stickers, update the source and reload both phones once. The fix uses an established chat session rather than consuming a new starter bundle for every sticker, and retries publication on reconnect/resume. A new conversation without any authenticated starter bundle still needs the other phone to reconnect; keep its existing identity/site data. A plain reconnect message does not mean the application sent plaintext.

For a reaction, tap/long-press the bubble and choose an emoji; tap your current reaction to remove it. Updating the chat timer affects future messages only. Older bubbles retain their original duration.

## Olm to libsignal is a migration

v0.17.1 and earlier use a different message transport. Read [Approved cutover](APPROVED_CUTOVER.md). Stage/rehearse on a copied database, preserve device identities/contacts/alert registrations and networking secrets, explicitly remove incompatible mailbox/session data while stopped, and keep a tested rollback. Both peers must reload the new client. This is not an automatic import of Olm sessions/history and must not be hidden inside a normal image pull.

## Verify after changing anything

- Check app HTTPS health and WebSocket upgrade through the actual public proxy, not just loopback.
- Confirm existing identity/contacts, send/reload messages, call both directions, compare SAS and transfer media while talking.
- Test relay allocation **and** a real different-network call; test Wi-Fi/cellular handover and phone audio routes.
- Test locked-screen browser/ntfy notifications and opening the right profile/chat/call.
- Inspect service restarts/errors privately; do not paste credentials or personal logs into public issues.

A green health check, a TURN candidate or a passing synthetic test does not certify physical-phone sound or every route. [Verification](VERIFICATION.md).

## Troubleshooting without resetting identities

If Connecting persists, check HTTPS/WS routing, service health and both clients' versions. Keep browser storage. A key/signature warning is not a generic network error: verify the contact through a trusted channel, never bypass pin checks. If an iPhone ntfy link opens a different profile, use the usual Home Screen icon. If media fails across networks, verify TURN/ports/TLS/credentials; a working Tunnel alone is insufficient.

For a native installation, `sudo systemctl status webcaller.service --no-pager` and `sudo journalctl -u webcaller.service -n 50 --no-pager` are local diagnostics. `node scripts/verify-public.mjs YOUR_HTTPS_APP_URL` checks public serving/WS. Settings contains a relay allocation check. [Networking](NETWORKING.md) · [Alerts](CALL_ALERTS.md).

## Same-origin path changes

Back up source/private configuration/database, finish calls and update both the application and HTTP/WS proxy. A gradual move can keep aliases:

```dotenv
PUBLIC_URL=https://phone.example.com/new-path
APP_PATH_ALIASES=/calls
APP_MANIFEST_ID=/calls/
```

`APP_MANIFEST_ID` is an internal installed-web-app identifier, not a promise the old route remains served. The Archive bridge reads the app's `.env` beside its own module; restart it and the app after editing. A whole-host Tunnel route needs no path edit; path-specific routes must cover the new prefix. TURN and a separate ntfy hostname are independent.

To **retire** old URLs, clear aliases and put them in `APP_RETIRED_PATHS`. The bridge returns 404 before website visitor logging, rejects old WS upgrades and never redirects to disclose the replacement. Share the new address privately. Future invites/ntfy links use it automatically, while old delivered notices/invites/bookmarks do not rewrite themselves.

Open the new address on each phone in the same profile. With existing notification permission, the app first registers/accepts a replacement push subscription, then removes only owned retired endpoints/workers. Failure keeps prior registrations for retry; unrelated workers/accounts are untouched. iPhone Home Screen identities/permissions require device testing. Update saved entries and retest alerts without clearing site data.

A randomly generated path reduces blind discovery, not endpoint/traffic exposure. Keep private paths out of source, robots files and sitemaps. `noindex`/`no-referrer` cannot erase browser/OS history. [Browser privacy](BROWSER_PRIVACY.md).

## Retention and resource use

New conversation defaults are one-hour disappearing messages; Off retains until deletion. Sender countdown starts at send, recipient countdown at first view, so unread encrypted recipient copies can remain longer. Cached ciphertext is reused until its participant deadline/deletion or browser eviction. The server applies quotas and expiration; phones physically purge only when running. Downloads/screenshots/backups remain outside recall.

Keep only installations you need enabled. Stopping an optional test service does not require deleting its data or changing production routes. Do not run native and Docker instances against the same SQLite path/port, or restore state while a process still uses it.
