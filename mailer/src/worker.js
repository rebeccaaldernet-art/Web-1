import crypto from 'node:crypto';
import { deliver, mailServers, PermanentError } from './delivery.js';
import { queueEvent } from './events.js';
import { tx } from './db.js';
// Scheduler: picks due deliveries and sends them within the global concurrency, per-domain concurrency,
// per-domain rate and daily warm-up limits. Temporary failures are retried with backoff; permanent ones bounce.
const DAY = 86400000;
const utcDay = t => new Date(t).toISOString().slice(0, 10);
export const backoff = attempts => Math.min(5 * 60000 * 2 ** Math.max(0, attempts - 1), 4 * 3600000);

export function createWorker({ config, db, deliverFn = deliver, resolveFn = mailServers, now = () => Date.now() }) {
  let active = 0, reserved = 0, timer = null, stopping = false, running = false;
  const perDomain = new Map(), recent = new Map(), inflight = new Set();

  function warmupStart() {
    if (config.warmupStartDate) return Date.parse(config.warmupStartDate + 'T00:00:00Z');
    const row = db.prepare("SELECT value FROM state WHERE key='warmup_start'").get();
    return row ? Number(row.value) : null;
  }
  function dailyCap() {
    if (!config.warmupStart) return config.dailyLimit;
    const start = warmupStart();
    const days = start === null ? 0 : Math.max(0, Math.floor((Date.parse(utcDay(now()) + 'T00:00:00Z') - start) / DAY));
    return Math.min(config.dailyLimit, Math.floor(config.warmupStart * config.warmupGrowth ** days));
  }
  const todayCount = () => db.prepare('SELECT recipients FROM daily_counts WHERE day=?').get(utcDay(now()))?.recipients || 0;
  function count(n) {
    if (!n) return;
    if (warmupStart() === null) db.prepare("INSERT OR IGNORE INTO state (key,value) VALUES ('warmup_start',?)").run(String(Date.parse(utcDay(now()) + 'T00:00:00Z')));
    db.prepare('INSERT INTO daily_counts (day,recipients) VALUES (?,?) ON CONFLICT(day) DO UPDATE SET recipients=recipients+excluded.recipients').run(utcDay(now()), n);
  }
  function rateOk(domain) {
    const since = now() - 60000;
    const list = (recent.get(domain) || []).filter(t => t > since);
    recent.set(domain, list);
    return list.length < config.perDomainPerMinute && (perDomain.get(domain) || 0) < config.perDomainConcurrency;
  }

  function record(delivery, result) {
    const t = now(), rcpts = JSON.parse(delivery.rcpts);
    tx(db, () => {
      const { accepted, bounced } = result;
      let deferred = result.deferred;
      const expired = t - delivery.created > config.maxRetryHours * 3600000;
      const failed = expired ? deferred : [];
      if (expired) deferred = [];
      const finalStatus = accepted.length ? 'sent' : bounced.length ? 'bounced' : failed.length ? 'failed' : 'deferred';
      if (deferred.length && (accepted.length || bounced.length)) {
        // Partly accepted: the recipients still to retry move to a new delivery row.
        db.prepare("INSERT INTO deliveries (id,message_id,domain,rcpts,status,attempts,next_attempt,last_error,created,updated) VALUES (?,?,?,?,'deferred',?,?,?,?,?)")
          .run(crypto.randomUUID(), delivery.message_id, delivery.domain, JSON.stringify(deferred.map(d => d.rcpt)), delivery.attempts, t + backoff(delivery.attempts), deferred[0].error, delivery.created, t);
        db.prepare('UPDATE deliveries SET rcpts=? WHERE id=?').run(JSON.stringify(rcpts.filter(r => !deferred.some(d => d.rcpt === r))), delivery.id);
      }
      if (finalStatus === 'deferred') db.prepare("UPDATE deliveries SET status='deferred',next_attempt=?,last_error=?,updated=? WHERE id=?").run(t + backoff(delivery.attempts), deferred[0]?.error || null, t, delivery.id);
      else db.prepare('UPDATE deliveries SET status=?,response=?,last_error=?,updated=? WHERE id=?').run(finalStatus, result.response || null, (bounced[0] || failed[0])?.error || null, t, delivery.id);
      count(accepted.length + bounced.length);
      if (accepted.length) queueEvent(db, config, { type: 'email.delivered', email_id: delivery.message_id, to: accepted });
      if (bounced.length) queueEvent(db, config, { type: 'email.bounced', email_id: delivery.message_id, to: bounced.map(b => b.rcpt), bounce: { type: 'Permanent', message: bounced[0].error } });
      if (failed.length) queueEvent(db, config, { type: 'email.failed', email_id: delivery.message_id, to: failed.map(f => f.rcpt), error: failed[0].error });
    });
  }

  async function run(delivery) {
    const message = db.prepare('SELECT * FROM messages WHERE id=?').get(delivery.message_id);
    let result;
    try {
      const servers = await resolveFn(delivery.domain, config);
      result = await deliverFn({ config, message, delivery, servers });
    } catch (e) {
      const rcpts = JSON.parse(delivery.rcpts), error = String(e?.message || e).slice(0, 500);
      result = e instanceof PermanentError ? { accepted: [], bounced: rcpts.map(rcpt => ({ rcpt, error })), deferred: [], response: error } : { accepted: [], bounced: [], deferred: rcpts.map(rcpt => ({ rcpt, error })), response: error };
    }
    record(delivery, result);
  }

  function tick() {
    if (stopping || running) return;
    running = true;
    try {
      let remaining = dailyCap() - todayCount() - reserved;
      const due = db.prepare("SELECT * FROM deliveries WHERE status IN ('queued','deferred') AND next_attempt<=? ORDER BY next_attempt LIMIT 500").all(now());
      for (const d of due) {
        if (active >= config.concurrency || remaining <= 0) break;
        const n = JSON.parse(d.rcpts).length;
        if (n > remaining || !rateOk(d.domain)) continue;
        const claimed = db.prepare("UPDATE deliveries SET status='sending',attempts=attempts+1,updated=? WHERE id=? AND status IN ('queued','deferred')").run(now(), d.id);
        if (!claimed.changes) continue;
        d.attempts += 1;
        active++; reserved += n; remaining -= n;
        perDomain.set(d.domain, (perDomain.get(d.domain) || 0) + 1);
        recent.get(d.domain).push(now());
        const job = run(d).catch(e => console.error('delivery error', e)).finally(() => {
          active--; reserved -= n; perDomain.set(d.domain, perDomain.get(d.domain) - 1); inflight.delete(job);
          if (!stopping) setImmediate(tick);
        });
        inflight.add(job);
      }
    } finally {
      running = false;
    }
  }

  return {
    start() { timer = setInterval(tick, config.tickMs); tick(); },
    kick() { setImmediate(tick); },
    tick,
    dailyCap,
    todayCount,
    async idle() { while (inflight.size) await Promise.all([...inflight]); },
    async stop() { stopping = true; clearInterval(timer); while (inflight.size) await Promise.all([...inflight]); },
  };
}
