import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export function createStore(dir) {
  if (dir !== ':memory:') mkdirSync(dir, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(dir === ':memory:' ? dir : join(dir, 'calls.sqlite'));
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA secure_delete=ON; PRAGMA journal_mode=DELETE; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, keys TEXT NOT NULL, token_hash TEXT UNIQUE NOT NULL);
    CREATE TABLE IF NOT EXISTS contacts (a TEXT NOT NULL REFERENCES users(id), b TEXT NOT NULL REFERENCES users(id), PRIMARY KEY(a,b));
    CREATE TABLE IF NOT EXISTS invites (hash TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, sender TEXT NOT NULL REFERENCES users(id), recipient TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL, created INTEGER NOT NULL, envelope TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS message_events (message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE, actor TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL CHECK(kind IN ('receipt','read','edit','reaction','pin')), created INTEGER NOT NULL, expires INTEGER NOT NULL, event_id TEXT NOT NULL, envelope TEXT NOT NULL, PRIMARY KEY(message_id,actor,kind));
    CREATE INDEX IF NOT EXISTS message_events_expiry ON message_events(expires);
    CREATE INDEX IF NOT EXISTS messages_expiry ON messages(expires);
    CREATE INDEX IF NOT EXISTS messages_recipient ON messages(recipient,created);
    CREATE TABLE IF NOT EXISTS push (owner TEXT NOT NULL REFERENCES users(id), endpoint TEXT PRIMARY KEY, subscription TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS attachments (id TEXT PRIMARY KEY, message_id TEXT UNIQUE NOT NULL, sender TEXT NOT NULL REFERENCES users(id), recipient TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL, size INTEGER NOT NULL, envelope TEXT NOT NULL, committed INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS attachment_chunks (attachment TEXT NOT NULL REFERENCES attachments(id) ON DELETE CASCADE, part INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY(attachment,part));
    CREATE INDEX IF NOT EXISTS attachments_expiry ON attachments(expires);
    CREATE TABLE IF NOT EXISTS message_deletions (id TEXT PRIMARY KEY, sender TEXT NOT NULL REFERENCES users(id), recipient TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS message_deletions_expiry ON message_deletions(expires);
  `);
  // Additive migrations preserve existing accounts and single-use invitations.
  if(!db.prepare('PRAGMA table_info(invites)').all().some(c=>c.name==='name'))db.exec("ALTER TABLE invites ADD COLUMN name TEXT NOT NULL DEFAULT ''");
  if(!db.prepare('PRAGMA table_info(push)').all().some(c=>c.name==='confirmed'))db.exec('ALTER TABLE push ADD COLUMN confirmed INTEGER NOT NULL DEFAULT 0');
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  const get = (sql, ...args) => db.prepare(sql).get(...args);
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const transaction = (fn) => {
    db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); db.exec('COMMIT'); return result; }
    catch (e) { db.exec('ROLLBACK'); throw e; }
  };
  const purge = (now = Date.now()) => {
    run('DELETE FROM message_events WHERE expires<=?', now);
    run('DELETE FROM message_deletions WHERE expires<=?', now);
    run('DELETE FROM attachments WHERE expires<=?', now);
    run('DELETE FROM messages WHERE expires<=?', now);
    run('DELETE FROM invites WHERE expires<=?', now);
  };
  purge();
  return { db, run, get, all, transaction, purge, close: () => db.close() };
}
