import http from 'node:http';
import crypto from 'node:crypto';
import { verify } from './signing.js';
import { tx } from './db.js';
// HTTP API used by the portal. Every request must carry a valid signature made with MAILER_SECRET.
//   POST /v1/messages  body: [{from,to,cc,bcc,reply_to,subject,html,text,headers}] (1-100 messages)
//                      header Idempotency-Key: a retried request returns the original response instead of queueing again.
//   GET  /v1/stats     queue and warm-up status
//   GET  /v1/health    unauthenticated liveness probe
const MAX_BODY = 25 * 1024 * 1024;
const LIMITS = { messages: 100, recipients: 50, subject: 998, html: 2 * 1024 * 1024, text: 1024 * 1024 };
const ADDRESS = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
const noCrlf = v => typeof v === 'string' && !/[\r\n\0]/.test(v);
export const validAddress = v => typeof v === 'string' && v.length <= 254 && ADDRESS.test(v) && !v.includes('..');
const domainOf = a => a.slice(a.lastIndexOf('@') + 1).toLowerCase();

function parseFrom(v) {
  if (!noCrlf(v) || v.length > 320) return null;
  const m = v.match(/^\s*(?:"?([^"<>]{0,200})"?\s*)?<([^<>\s]+)>\s*$/) || v.match(/^\s*()([^<>\s]+)\s*$/);
  if (!m || !validAddress(m[2])) return null;
  return { name: (m[1] || '').trim(), address: m[2].toLowerCase() };
}
function addressList(v, field) {
  if (v === undefined || v === null) return [];
  const list = typeof v === 'string' ? [v] : v;
  if (!Array.isArray(list)) throw new Error(`${field} must be a list of addresses`);
  return [...new Set(list.map(a => {
    if (!validAddress(a)) throw new Error(`${field} contains an invalid address`);
    return a.toLowerCase();
  }))];
}
// Only the compliance headers the portal sets are passed through; everything else is generated here.
function extraHeaders(v) {
  if (v === undefined || v === null) return {};
  if (typeof v !== 'object' || Array.isArray(v)) throw new Error('headers must be an object');
  const out = {};
  for (const [k, value] of Object.entries(v)) {
    if (!noCrlf(value) || value.length > 2000) throw new Error(`Invalid ${k} header`);
    if (k === 'List-Unsubscribe' && /^<https:\/\/[^\s<>]+>(,\s*<mailto:[^\s<>]+>)?$/.test(value)) out[k] = value;
    else if (k === 'List-Unsubscribe-Post' && value === 'List-Unsubscribe=One-Click') out[k] = value;
    else throw new Error(`Header ${k} is not allowed`);
  }
  return out;
}
export function validateMessage(m, config) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) throw new Error('Each message must be an object');
  const from = parseFrom(m.from);
  if (!from) throw new Error('from must be "Name <address>"');
  if (!config.allowedFromDomains.includes(domainOf(from.address))) throw new Error(`Sending from ${domainOf(from.address)} is not allowed on this mail server`);
  const to = addressList(m.to, 'to'), cc = addressList(m.cc, 'cc'), bcc = addressList(m.bcc, 'bcc');
  const rcpts = [...new Set([...to, ...cc, ...bcc])];
  if (!to.length) throw new Error('to needs at least one address');
  if (rcpts.length > LIMITS.recipients) throw new Error(`At most ${LIMITS.recipients} recipients per message`);
  const replyTo = m.reply_to ? addressList(m.reply_to, 'reply_to')[0] : null;
  const subject = m.subject ?? '';
  if (!noCrlf(subject) || subject.length > LIMITS.subject) throw new Error('Invalid subject');
  const html = m.html ?? '', text = m.text ?? '';
  if (typeof html !== 'string' || typeof text !== 'string' || html.length > LIMITS.html || text.length > LIMITS.text) throw new Error('Message body is too large');
  if (!html && !text) throw new Error('Message needs html or text');
  const fromHeader = from.name ? `"${from.name.replace(/["\\]/g, '')}" <${from.address}>` : from.address;
  return { fromHeader, to, cc, rcpts, replyTo, subject, html, text, headers: extraHeaders(m.headers) };
}
// Call inside a transaction.
export function enqueue(db, messages, now = Date.now()) {
  return messages.map(m => {
    const id = crypto.randomUUID();
    db.prepare('INSERT INTO messages (id,from_header,to_list,cc_list,reply_to,subject,html,text,headers,created) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(id, m.fromHeader, JSON.stringify(m.to), JSON.stringify(m.cc), m.replyTo, m.subject, m.html, m.text, JSON.stringify(m.headers), now);
    const byDomain = new Map();
    for (const r of m.rcpts) byDomain.set(domainOf(r), [...(byDomain.get(domainOf(r)) || []), r]);
    for (const [domain, rcpts] of byDomain) {
      db.prepare("INSERT INTO deliveries (id,message_id,domain,rcpts,status,next_attempt,created,updated) VALUES (?,?,?,?,'queued',?,?,?)")
        .run(crypto.randomUUID(), id, domain, JSON.stringify(rcpts), now, now, now);
    }
    return { id };
  });
}
export function stats(db, worker) {
  const rows = db.prepare('SELECT status, COUNT(*) n FROM deliveries GROUP BY status').all();
  return { deliveries: Object.fromEntries(rows.map(r => [r.status, r.n])), today: worker.todayCount(), dailyCap: worker.dailyCap(), outbox: db.prepare('SELECT COUNT(*) n FROM outbox').get().n };
}
const json = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
};
export function createApi({ config, db, worker }) {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://mailer');
    if (req.method === 'GET' && url.pathname === '/v1/health') return json(res, 200, { ok: true });
    const chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY) { json(res, 413, { message: 'Request too large' }); req.destroy(); }
      else chunks.push(c);
    });
    req.on('end', () => {
      if (res.writableEnded) return;
      const body = Buffer.concat(chunks).toString('utf8');
      if (!verify(config.secret, body, req.headers['x-mailer-timestamp'], req.headers['x-mailer-signature'])) return json(res, 401, { message: 'Invalid signature' });
      try {
        if (req.method === 'GET' && url.pathname === '/v1/stats') return json(res, 200, stats(db, worker));
        if (req.method !== 'POST' || url.pathname !== '/v1/messages') return json(res, 404, { message: 'Not found' });
        const key = req.headers['idempotency-key'];
        if (typeof key !== 'string' || !key || key.length > 256) return json(res, 400, { message: 'Idempotency-Key header is required' });
        const hash = crypto.createHash('sha256').update(body).digest('hex');
        const previous = db.prepare('SELECT body_hash, response FROM requests WHERE idempotency_key=?').get(key);
        if (previous) return previous.body_hash === hash ? json(res, 200, JSON.parse(previous.response)) : json(res, 409, { message: 'Idempotency-Key was already used with a different request' });
        let input;
        try { input = JSON.parse(body); } catch { return json(res, 400, { message: 'Body must be JSON' }); }
        if (!Array.isArray(input) || input.length < 1 || input.length > LIMITS.messages) return json(res, 422, { message: `Send between 1 and ${LIMITS.messages} messages` });
        let messages;
        try { messages = input.map(m => validateMessage(m, config)); } catch (e) { return json(res, 422, { message: e.message }); }
        // Queueing and recording the idempotency key are one transaction, so a crash cannot queue a batch twice.
        const response = tx(db, () => {
          const out = { data: enqueue(db, messages) };
          db.prepare('INSERT INTO requests (idempotency_key, body_hash, response, created) VALUES (?,?,?,?)').run(key, hash, JSON.stringify(out), Date.now());
          return out;
        });
        worker.kick();
        return json(res, 200, response);
      } catch (e) {
        console.error(e);
        return json(res, 500, { message: 'Mail server error' });
      }
    });
  });
}
