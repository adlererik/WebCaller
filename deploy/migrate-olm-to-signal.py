"""Operator-approved, offline cutover. Never run against a running service."""
import argparse
import json
import sqlite3
from pathlib import Path
from time import time

ENGINE = 'libsignal-pqxdh-v1'
PRESERVED = ('users', 'contacts', 'push', 'ntfy_devices', 'dial_codes',
             'invites', 'contact_requests', 'contact_blocks')
REMOVED = ('attachment_parts', 'attachment_chunks', 'attachments',
           'message_events', 'message_views', 'messages', 'message_deletions',
           'ratchet_prekeys', 'ratchet_accounts')


def migrate(path):
    db = sqlite3.connect('file:' + str(Path(path).resolve()) + '?mode=rw', uri=True)
    try:
        assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        db.execute('PRAGMA foreign_keys=ON')
        db.execute('PRAGMA secure_delete=ON')
        tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        assert set(PRESERVED + REMOVED) <= tables, 'Unexpected source database schema'
        if 'crypto_deployments' in tables and db.execute(
                'SELECT 1 FROM crypto_deployments WHERE engine=?', (ENGINE,)).fetchone():
            return {'engine': ENGINE, 'alreadyApplied': True}
        before = {name: db.execute('SELECT * FROM ' + name + ' ORDER BY rowid').fetchall()
                  for name in PRESERVED}
        removed = {name: db.execute('SELECT COUNT(*) FROM ' + name).fetchone()[0]
                   for name in REMOVED}
        with db:
            db.execute('CREATE TABLE IF NOT EXISTS crypto_deployments '
                       '(engine TEXT PRIMARY KEY, applied INTEGER NOT NULL)')
            for name in REMOVED:
                db.execute('DELETE FROM ' + name)
            db.execute('INSERT INTO crypto_deployments VALUES(?,?)', (ENGINE, int(time() * 1000)))
            for name in PRESERVED:
                assert db.execute('SELECT * FROM ' + name + ' ORDER BY rowid').fetchall() == before[name], name
            assert not db.execute('PRAGMA foreign_key_check').fetchall(), 'Foreign key violation'
        assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        return {'engine': ENGINE, 'alreadyApplied': False, 'removed': removed,
                'preserved': {name: len(rows) for name, rows in before.items()}}
    finally:
        db.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database', required=True)
    parser.add_argument('--apply', action='store_true', required=True,
                        help='Confirm the service is stopped and a verified rollback backup exists')
    args = parser.parse_args()
    print(json.dumps(migrate(args.database)))
