import {NO_EXPIRY} from '../public/message-lifetime.js';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export function createStore(dir) {
  if (dir !== ':memory:') mkdirSync(dir, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(dir === ':memory:' ? dir : join(dir, 'calls.sqlite'));
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA secure_delete=ON; PRAGMA journal_mode=DELETE; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, keys TEXT NOT NULL, token_hash TEXT UNIQUE NOT NULL);
    CREATE TABLE IF NOT EXISTS contacts (a TEXT NOT NULL REFERENCES users(id), b TEXT NOT NULL REFERENCES users(id), PRIMARY KEY(a,b));
    CREATE TABLE IF NOT EXISTS dial_codes (code TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, active INTEGER NOT NULL CHECK(active IN (0,1)));
    CREATE UNIQUE INDEX IF NOT EXISTS dial_codes_active_owner ON dial_codes(owner) WHERE active=1;
    CREATE TABLE IF NOT EXISTS contact_requests (sender TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, recipient TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created INTEGER NOT NULL, messages INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(sender,recipient), CHECK(sender<>recipient));
    CREATE TABLE IF NOT EXISTS contact_blocks (owner TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, peer TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created INTEGER NOT NULL, PRIMARY KEY(owner,peer), CHECK(owner<>peer));
    CREATE TABLE IF NOT EXISTS invites (hash TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, sender TEXT NOT NULL REFERENCES users(id), recipient TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL, created INTEGER NOT NULL, envelope TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS message_views (message_id TEXT PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE, seconds INTEGER NOT NULL, sender_expires INTEGER NOT NULL, recipient_expires INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS message_events (message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE, actor TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL CHECK(kind IN ('receipt','read','edit','reaction','pin')), created INTEGER NOT NULL, expires INTEGER NOT NULL, event_id TEXT NOT NULL, envelope TEXT NOT NULL, PRIMARY KEY(message_id,actor,kind));
    CREATE INDEX IF NOT EXISTS message_events_expiry ON message_events(expires);
    CREATE INDEX IF NOT EXISTS messages_expiry ON messages(expires);
    CREATE INDEX IF NOT EXISTS messages_recipient ON messages(recipient,created);
    CREATE TABLE IF NOT EXISTS ntfy_devices (owner TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, topic TEXT UNIQUE NOT NULL, created INTEGER NOT NULL, confirmed INTEGER NOT NULL DEFAULT 0, preferred INTEGER NOT NULL DEFAULT 1 CHECK(preferred IN (0,1)));
    CREATE TABLE IF NOT EXISTS push (owner TEXT NOT NULL REFERENCES users(id), endpoint TEXT PRIMARY KEY, subscription TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS attachments (id TEXT PRIMARY KEY, message_id TEXT UNIQUE NOT NULL, sender TEXT NOT NULL REFERENCES users(id), recipient TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL, size INTEGER NOT NULL, envelope TEXT NOT NULL, committed INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS attachment_chunks (attachment TEXT NOT NULL REFERENCES attachments(id) ON DELETE CASCADE, part INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY(attachment,part));
    CREATE TABLE IF NOT EXISTS attachment_parts (attachment TEXT NOT NULL REFERENCES attachments(id) ON DELETE CASCADE, chunk INTEGER NOT NULL, part INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY(attachment,chunk,part));
    CREATE INDEX IF NOT EXISTS attachments_expiry ON attachments(expires);
    CREATE TABLE IF NOT EXISTS message_deletions (id TEXT PRIMARY KEY, sender TEXT NOT NULL REFERENCES users(id), recipient TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS message_deletions_expiry ON message_deletions(expires);
    CREATE TABLE IF NOT EXISTS ratchet_accounts (owner TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, identity TEXT NOT NULL, signature TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS ratchet_prekeys (owner TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, id TEXT NOT NULL, key TEXT NOT NULL, signature TEXT NOT NULL, claimed INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(owner,id));
  `);
  // Additive migrations preserve existing accounts and single-use invitations.
  if(!db.prepare('PRAGMA table_info(invites)').all().some(c=>c.name==='name'))db.exec("ALTER TABLE invites ADD COLUMN name TEXT NOT NULL DEFAULT ''");
  if(!db.prepare('PRAGMA table_info(push)').all().some(c=>c.name==='confirmed'))db.exec('ALTER TABLE push ADD COLUMN confirmed INTEGER NOT NULL DEFAULT 0');
  if(!db.prepare('PRAGMA table_info(ntfy_devices)').all().some(c=>c.name==='preferred'))db.exec('ALTER TABLE ntfy_devices ADD COLUMN preferred INTEGER NOT NULL DEFAULT 1 CHECK(preferred IN (0,1))');
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  const get = (sql, ...args) => db.prepare(sql).get(...args);
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const transaction = (fn) => {
    db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); db.exec('COMMIT'); return result; }
    catch (e) { db.exec('ROLLBACK'); throw e; }
  };
  const purge = (now = Date.now()) => {
    run('INSERT OR IGNORE INTO message_deletions SELECT m.id,m.sender,m.recipient,? FROM messages m JOIN message_views v ON v.message_id=m.id WHERE m.expires<=?',NO_EXPIRY,now);
    run('DELETE FROM message_events WHERE expires<=?', now);
    run('DELETE FROM message_deletions WHERE expires<=?', now);
    run('DELETE FROM attachments WHERE expires<=?', now);
    run('DELETE FROM messages WHERE expires<=?', now);
    run('DELETE FROM invites WHERE expires<=?', now);
  };
  purge();
  return { db, run, get, all, transaction, purge, close: () => db.close() };
}
