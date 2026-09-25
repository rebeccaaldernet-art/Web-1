import { sign } from './signing.js';
// Delivery results are reported to the portal webhook through a durable outbox, signed with MAILER_SECRET,
// and retried with backoff until the portal acknowledges them.
export function queueEvent(db, config, event) {
  if (!config.portalWebhookUrl) return;
  db.prepare('INSERT INTO outbox (body,next_attempt) VALUES (?,?)').run(JSON.stringify({ ...event, created: Date.now() }), Date.now());
}
export function createEventSender({ config, db, fetchFn = fetch, now = () => Date.now() }) {
  let timer = null, busy = false;
  async function flush() {
    if (busy || !config.portalWebhookUrl) return;
    busy = true;
    try {
      const rows = db.prepare('SELECT * FROM outbox WHERE next_attempt<=? ORDER BY id LIMIT 100').all(now());
      if (!rows.length) return;
      const body = JSON.stringify({ events: rows.map(r => JSON.parse(r.body)) });
      let ok = false;
      try {
        const r = await fetchFn(config.portalWebhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', ...sign(config.secret, body) }, body, signal: AbortSignal.timeout(20000) });
        ok = r.ok;
        if (!ok) console.warn(`Portal webhook returned ${r.status}`);
      } catch (e) {
        console.warn('Portal webhook unreachable:', e.message);
      }
      const ids = rows.map(r => r.id);
      if (ok) db.prepare(`DELETE FROM outbox WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids);
      else for (const r of rows) db.prepare('UPDATE outbox SET attempts=attempts+1,next_attempt=? WHERE id=?').run(now() + Math.min(30000 * 2 ** r.attempts, 3600000), r.id);
    } finally {
      busy = false;
    }
  }
  return { start() { timer = setInterval(() => void flush(), 2000); }, flush, stop() { clearInterval(timer); } };
}
