# Operating the experimental installation

Keep it separate from stable WebCaller: hostname/origin, directory, database, service/port, owner code and VAPID keys. Sharing a suitable TURN relay does not require sharing accounts or phone storage. Stable Olm databases/sessions cannot be imported. Paths/service names below are examples from the [native guide](INSTALL_NATIVE.md).

## Backup

Privately retain the source commit and submodule pin, lockfiles, `.env`, native Node runtime/service unit and a **consistent SQLite backup**. Copy a stopped database or use SQLite's online backup API; copying only a live main database can miss WAL data. Include encrypted attachments/state kept by that database. Never upload backups to GitHub.

Phone keys, local history/cache and identity pins live in browser storage. A server backup cannot replace them. Keep the original phone origin/profile/Home Screen icon, and do not clear site data as an update/troubleshooting step. Nonextractable keys cannot simply be exported by copying server files.

## Update this branch

Read the changes, make a private backup and finish calls first. In the separate checkout:

```sh
git status --short
git fetch origin
git log --oneline HEAD..origin/codex/experimental-libsignal-pqxdh
```

Review local changes before proceeding. For an unmodified checkout:

```sh
sudo systemctl stop webcaller-experimental.service
git merge --ff-only origin/codex/experimental-libsignal-pqxdh
git submodule update --init --recursive
export PATH="$PWD/.runtime/node/bin:$PATH"
npm ci --ignore-scripts
npm run check
npm test
npm run audit:source
npm run prepare:source
sudo systemctl start webcaller-experimental.service
curl -fsS http://127.0.0.1:8088/calls/health
```

If a step fails, inspect it before starting. Preserve private configuration and data; do not run setup in another directory and copy its new secrets over the old ones. `setup` preserves existing values but cannot recover lost browser keys. Runtime/security updates are separate maintenance work.

Refresh both test phones after updates without clearing site data. Earlier libsignal test P-256 identities authorize an Ed25519 signer without changing their fingerprints/history. An older loaded client does not understand new Ed25519 framing. Test messages, both call directions, SAS, files and sound after updating.

## Rollback

Retain the prior code/runtime and database backup before changing versions. Database rollback is not automatic; restoring it after new messages arrive loses subsequent server state. Older code may not understand new signatures or serialized ratchet state. Do not open a migrated database with arbitrary old code. Restore the matching source/configuration/runtime and compatible database only after reviewing the change. Browser state may also have advanced; keep it available while diagnosing rather than resetting identities.

The safest experiment is an independent installation alongside a working stable phone. Stopping/removing that experiment then does not require a stable rollback at all.

## Health, logs and retention

`sudo systemctl status webcaller-experimental.service --no-pager` and local `journalctl` inspect this service. HTTPS health, an authenticated message round trip and an actual call are distinct checks. A relay candidate does not prove a complete media path. Test locked-phone sounds physically; push publication is not an audible-delivery acknowledgment.

Off messages persist until deletion. For new timed messages, the sender clock starts when sent and the recipient clock at first view; unread ciphertext can remain after sender expiry. Expiry/deletion cleans application records and cached ciphertext under those rules, not all browser/OS/backups. [Security](SECURITY.md) · [Browser privacy](BROWSER_PRIVACY.md).

## Stop or remove only the experiment

```sh
sudo systemctl disable --now webcaller-experimental.service
```

Keep backups until you decide what to retain. Removing source, server state or a phone identity is a separate destructive decision; stopping the service does not need any of those deletions. Do not touch the stable service, reverse-proxy routes or phones.
