# Operations

Run commands from the installed project directory. Use the same Compose profiles selected during setup.

```sh
sudo docker compose ps
sudo docker compose logs --tail=100 webcaller
sudo docker compose --profile https --profile turn up -d
```

Only include profiles you actually use. Recreating selected containers loads changed `.env` values. Avoid posting logs without reviewing metadata. App logs do not intentionally include message bodies or invite fragments; infrastructure logs are outside this guarantee.

## Updates

Back up configuration and data first. Fetch/review the new release, preserve the existing `.env`, certificates and `.runtime/compose-profiles`, and keep the same Compose project name `webcaller` so named data volumes are reused. Then:

```sh
sudo docker compose build webcaller
sudo docker compose --profile https --profile turn up -d --build
```

Use only your chosen profiles. Do not run `npm run setup` to rotate keys, delete the data volume or rename the Compose project. v0.3.0 adds deletion markers; v0.2.0 added attachment tables/indexes on startup with CREATE TABLE IF NOT EXISTS; it preserves existing identities and messages. New versions may require schema migration; read the release notes. This preview does not provide account recovery/export or browser identity synchronization.

## Backups and disappearing messages

Back up `.env` and certs privately, encrypted and outside Git. Backing up SQLite retains ciphertext past its normal expiry and may conflict with your disappearing-message policy. Decide that policy first. Stop the app before making a consistent database copy; never use `down -v` to stop for a backup.

## Start after reboot

The installer enables Docker. Containers use `restart: unless-stopped`, so they restart after reboot unless deliberately stopped. This differs from a guarantee that your router, ISP or certificate provider stays reachable. Check `docker compose ps` and test a cross-network call after a real reboot.

## TLS renewal and IP changes

Caddy renews its web certificate automatically. Coturn domain certificates mounted in `certs/` need your own renewal/reload process. A changed home public IP requires DNS and TURN_PUBLIC_IP/TURN_URLS updates; the beginner Docker recipe does not automatically discover/forward router changes. The separate native maintenance helper can do this only after its explicit LAN/runtime/unit setup. Keep user/private data out of Git and releases.

## Stop or remove

`sudo docker compose --profile https --profile turn down` stops/removes containers while retaining named volumes. Remove your router/firewall forwarding if no longer needed. Deleting named volumes with `down -v` permanently removes server data and Caddy state; do so only intentionally after deciding whether you need recovery. Remove private .env/certs yourself when finished. Existing external provider records, client storage and recipient copies are separate.

Both phones should refresh the page after this update to load the new composer, media preview and deletion controls. Preserve browser site data when refreshing; clearing storage removes the identity.
