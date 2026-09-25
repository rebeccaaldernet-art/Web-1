import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
// Durable queue in a local SQLite file. One message is split into one delivery per recipient domain,
// because each domain is a separate SMTP transaction to that domain's mail servers.
export function openDb(dataDir) {
  let file = ':memory:';
  if (dataDir !== ':memory:') {
    fs.mkdirSync(dataDir, { recursive: true });
    file = path.join(dataDir, 'mailer.sqlite');
  }
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS requests (idempotency_key TEXT PRIMARY KEY, body_hash TEXT NOT NULL, response TEXT NOT NULL, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY, from_header TEXT NOT NULL, to_list TEXT NOT NULL, cc_list TEXT NOT NULL, reply_to TEXT,
      subject TEXT NOT NULL, html TEXT NOT NULL, text TEXT NOT NULL, headers TEXT NOT NULL, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS deliveries (
      id TEXT PRIMARY KEY, message_id TEXT NOT NULL, domain TEXT NOT NULL, rcpts TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued', attempts INTEGER NOT NULL DEFAULT 0, next_attempt INTEGER NOT NULL,
      last_error TEXT, response TEXT, created INTEGER NOT NULL, updated INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_deliveries_due ON deliveries(status, next_attempt);
    CREATE INDEX IF NOT EXISTS idx_deliveries_message ON deliveries(message_id);
    CREATE TABLE IF NOT EXISTS daily_counts (day TEXT PRIMARY KEY, recipients INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, body TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_attempt INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  // A delivery that was mid-send when the process stopped is retried. The recipient server may already have
  // accepted it, so a crash at exactly that moment can cause one duplicate; this is standard MTA behaviour.
  db.prepare("UPDATE deliveries SET status='deferred', next_attempt=? WHERE status='sending'").run(Date.now());
  return db;
}
export function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
