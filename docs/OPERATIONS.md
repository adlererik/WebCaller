# Operations

For the ready-made image distribution, use the [prebuilt Docker guide](../docker/README.md): `./webcaller status`, `./webcaller stop`, `./webcaller start`, and `./webcaller update vX.Y.Z`. Its update command checks an explicit newer bundle, downloads images before replacing public files and waits for startup/health. Keep `.env`, `config/` and named volumes. It does not automatically back up conversation history or roll back database migrations. The older source-build and native workflows are below.

Run commands from the installed project directory. The first sections describe **Docker**; native systemd commands are below. Keep your chosen installation method when updating. Use the same Compose profiles selected during setup.

```sh
sudo docker compose ps
sudo docker compose logs --tail=100 webcaller
sudo docker compose --profile https --profile turn up -d
```

Only include profiles you actually use. Recreating selected containers loads changed `.env` values. Avoid posting logs without reviewing metadata. App logs do not intentionally include message bodies or invite fragments; infrastructure logs are outside this guarantee.

## Updates

Back up configuration and data first. Download and verify the new release using the [installation guide](INSTALL.md#2-download-webcaller-onto-the-debian-server), but do not run its first-install command again. Keep your installation path, `.env`, certificates and `.runtime/compose-profiles`; copy only the reviewed source into that directory. Do not copy a new example over `.env`. Keep the same Compose project name `webcaller` so named data volumes are reused. Then:

```sh
sudo docker compose build webcaller
sudo docker compose --profile https --profile turn up -d --build
```

Use only your chosen profiles. Wait for `sudo docker compose ps` to show the app healthy, then test the public page and a real call. Do not delete the data volume, rename the Compose project or regenerate secrets. v0.16.0 adds an alternative prebuilt distribution and restricted ntfy secret-file/private-network configuration; it does not change the database schema or encryption protocols. Earlier previews include additive schema and security migrations; always read [release notes](../CHANGELOG.md), especially when skipping versions. This preview does not provide account recovery/export or browser identity synchronization.

## Backups and disappearing messages

Back up `.env` and certs privately, encrypted and outside Git. Backing up SQLite retains ciphertext past its normal expiry and may conflict with your disappearing-message policy. Decide that policy first. Stop the app before making a consistent database copy; never use `down -v` to stop for a backup.

## Start after reboot

The installer enables Docker. Containers use `restart: unless-stopped`, so they restart after reboot unless deliberately stopped. This differs from a guarantee that your router, ISP or certificate provider stays reachable. Check `docker compose ps` and test a cross-network call after a real reboot.

## TLS renewal and IP changes

Caddy renews its web certificate automatically. Coturn domain certificates mounted in `certs/` need your own renewal/reload process. A changed home public IP requires DNS and TURN_PUBLIC_IP/TURN_URLS updates; the beginner Docker recipe does not automatically discover/forward router changes. The separate native maintenance helper can do this only after its explicit LAN/runtime/unit setup. Keep user/private data out of Git and releases.

## Stop or remove

`sudo docker compose --profile https --profile turn down` stops/removes containers while retaining named volumes. Remove your router/firewall forwarding if no longer needed. Deleting named volumes with `down -v` permanently removes server data and Caddy state; do so only intentionally after deciding whether you need recovery. Remove private .env/certs yourself when finished. Existing external provider records, client storage and recipient copies are separate.

After an update, refresh each phone in its usual browser or Home Screen icon **without clearing site data**. Clearing storage removes the identity and local history. Existing users can open **Settings → Set up call alerts**; new invitees see the guide automatically. Preserve the VAPID key pair so current subscriptions remain valid. Server restart clears pending calls and unfinished ten-minute sound tests; send a fresh test afterward. Notification delivery needs server HTTPS outbound access to the selected browser push provider, in addition to normal web signaling and TURN. No new inbound port is needed.

## Native systemd updates

For the [native installation](INSTALL_NATIVE.md), keep the original installation directory and regular service account. The generic path below is `/opt/webcaller`; substitute your own if different. Schedule a short interruption: restarting ends active calls and pending sound tests.

1. Download the new release and verify its checksum as in the installation guide. Review its release notes. Do not re-run first-owner setup.
2. Stop the app with `sudo systemctl stop webcaller.service`. Make a private backup of `.env` and the complete `data` directory while stopped, including SQLite sidecar files if present. Backups retain ciphertext past disappearance; keep them encrypted/outside Git and follow your retention policy.
3. Copy the reviewed release's source into the **existing** installation directory as its regular owner. Preserve `.env`, `data/`, `certs/`, `.runtime/` and other private configuration. Do not delete these directories, use a mirror/delete option, or replace the whole folder. Release archives contain no private configuration. Run commands from the original directory, not the extracted download.
4. Run `npm ci --ignore-scripts` and `npm run check` as the regular owner. Do not use sudo for npm or rotate keys. This update needs no change to the existing systemd unit.
5. Run `sudo systemctl start webcaller.service`, then `sudo systemctl status webcaller.service --no-pager` and `curl -fsS http://127.0.0.1:8080/calls/health`. Adjust port/path only if your private config differs. Test the HTTPS page, both call directions and alerts. If startup fails, inspect local journal output before sharing anything.

On both phones, reopen/refresh the usual browser or Home Screen icon **without clearing site data**. Preserve the VAPID pair, database, identity pins and ratchet state. If dependencies or startup fail, keep the app stopped while restoring the prior source and its dependencies; a database migration may also require its matching backup. Read release-specific rollback notes rather than opening a migrated database with arbitrary old code.

The optional `webcaller-ntfy.service` is separate. This source update does not reinstall its binary, alter its private ACL database or rewrite its tunnel route. Keep that service's private configuration and state too. A full server restart restarts enabled systemd services; confirm health and a locked-phone sound test afterward. The ntfy installer intentionally refuses an already configured installation.

## Updating to v0.17.1

Use the same installation method and preserve your private configuration, data volume/database and phone origin. Existing identities, contacts, Olm sessions, unread history, pins and SAS are retained. Refresh both phones after updating; older clients reject files above their old limit. Keep the existing iPhone Home Screen app and browser storage. The media cache upgrades additively and keeps old encrypted entries.

The default file reservations increase to 1024 MiB per sender and 4096 MiB globally, with a 200 MiB per-file limit. Explicit old/lower quota settings are preserved; adjust only those fields if needed, following [Configuration](CONFIGURATION.md#file-limit-and-storage-upgrades). Leave all owner, push and relay credentials intact. Ensure enough free disk for database/journal overhead and any private backups. A restart/update can interrupt calls. Native installations remain native; this release does not require or automatically perform a Docker migration.
