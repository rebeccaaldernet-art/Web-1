// End-to-end test of the self-hosted mailer with real SMTP on localhost: a fake recipient mail server receives
// the messages, and a DSN is sent back into the bounce receiver. No mail leaves this machine.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { SMTPServer } from 'smtp-server';
import nodemailer from 'nodemailer';
import { loadConfig } from '../src/config.js';
import { openDb } from '../src/db.js';
import { createApi } from '../src/api.js';
import { createWorker, backoff } from '../src/worker.js';
import { createEventSender } from '../src/events.js';
import { createInbound, parseBounce } from '../src/inbound.js';
import { mailServers, PermanentError } from '../src/delivery.js';
import { sign, verify } from '../src/signing.js';
import { dkimVerify } from 'mailauth';


// Fake recipient mail server: refuses reject@*, temporarily refuses later@* until `allowLater`.
const received = [];
let allowLater = false;
const sink = new SMTPServer({
  authOptional: true, disabledCommands: ['AUTH', 'STARTTLS'], logger: false,
  onRcptTo(a, s, cb) {
    const addr = a.address.toLowerCase();
    if (addr.startsWith('reject@')) { const e = new Error('5.1.1 User unknown'); e.responseCode = 550; return cb(e); }
    if (addr.startsWith('later@') && !allowLater) { const e = new Error('4.7.1 Greylisted, try again'); e.responseCode = 451; return cb(e); }
    cb();
  },
  onData(stream, session, cb) { const c = []; stream.on('data', d => c.push(d)); stream.on('end', () => { received.push({ from: session.envelope.mailFrom.address, to: session.envelope.rcptTo.map(r => r.address), raw: Buffer.concat(c).toString() }); cb(); }); },
});
await new Promise(r => sink.listen(0, '127.0.0.1', r));
const sinkPort = sink.server.address().port;

const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const secret = crypto.randomBytes(32).toString('hex');
const config = {
  secret, hostname: 'mail.studio.test', allowedFromDomains: ['studio.test'], bounceDomain: 'bounces.studio.test',
  dkim: { domainName: 'studio.test', keySelector: 'ra1', privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }) },
  dailyLimit: 100000, warmupStart: 0, warmupGrowth: 1.5, warmupStartDate: '', concurrency: 10, perDomainConcurrency: 2, perDomainPerMinute: 1000,
  maxRetryHours: 72, mxOverride: `127.0.0.1:${sinkPort}`, requireTls: false, tickMs: 50, portalWebhookUrl: 'https://portal.test/api/email/webhook',
};
const db = openDb(':memory:');
const worker = createWorker({ config, db });
const posted = [];
const events = createEventSender({ config, db, fetchFn: async (url, init) => { assert.ok(verify(secret, init.body, init.headers['X-Mailer-Timestamp'], init.headers['X-Mailer-Signature'])); posted.push(...JSON.parse(init.body).events); return new Response('{}'); } });
const api = createApi({ config, db, worker });
await new Promise(r => api.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${api.address().port}`;
async function call(path, body, { key = crypto.randomUUID(), signed = true, headers = {} } = {}) {
  const text = body === undefined ? '' : JSON.stringify(body);
  const r = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key, ...(signed ? sign(secret, text) : {}), ...headers }, body: body === undefined ? undefined : text });
  return { status: r.status, body: await r.json() };
}
async function settle() { for (let i = 0; i < 20; i++) { worker.tick(); await worker.idle(); } await events.flush(); }
const msg = (o = {}) => ({ from: 'RA Studio <hello@studio.test>', to: ['alice@example.test'], subject: 'Hello', html: '<p>Hi</p>', text: 'Hi', ...o });

// Authentication.
assert.equal((await fetch(base + '/v1/health')).status, 200);
assert.equal((await call('/v1/messages', [msg()], { signed: false })).status, 401);
assert.equal((await call('/v1/messages', [msg()], { headers: { 'X-Mailer-Signature': 'forged', 'X-Mailer-Timestamp': String(Math.floor(Date.now() / 1000)) } })).status, 401);
assert.equal((await call('/v1/messages', [msg()], { headers: sign(secret, JSON.stringify([msg()]), Math.floor(Date.now() / 1000) - 3600) })).status, 401);
// Validation: spoofed domain, header injection, disallowed headers, recipient cap.
assert.match((await call('/v1/messages', [msg({ from: 'CEO <ceo@bank.test>' })])).body.message, /not allowed/);
assert.equal((await call('/v1/messages', [msg({ subject: 'Hi\r\nBcc: victim@x.test' })])).status, 422);
assert.equal((await call('/v1/messages', [msg({ headers: { 'X-Evil': '1' } })])).status, 422);
assert.equal((await call('/v1/messages', [msg({ to: ['bad address@x.test'] })])).status, 422);
assert.equal((await call('/v1/messages', [msg({ to: Array.from({ length: 51 }, (_, i) => `p${i}@x.test`) })])).status, 422);

// Delivery with To/Cc/Bcc across two domains, DKIM, VERP return path and List-Unsubscribe passthrough.
const key = crypto.randomUUID();
const batch = [msg({ to: ['alice@example.test'], cc: ['bob@other.test'], bcc: ['carol@example.test'], reply_to: 'reply@studio.test', headers: { 'List-Unsubscribe': '<https://portal.test/u?r=1&t=x>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } })];
const first = await call('/v1/messages', batch, { key });
assert.equal(first.status, 200, JSON.stringify(first.body));
const replay = await call('/v1/messages', batch, { key });
assert.deepEqual(replay.body, first.body);
assert.equal((await call('/v1/messages', [msg()], { key })).status, 409);
assert.equal(db.prepare('SELECT COUNT(*) n FROM deliveries WHERE message_id=?').get(first.body.data[0].id).n, 2);
await settle();
assert.equal(received.length, 2);
const exampleMail = received.find(r => r.to.includes('alice@example.test'));
assert.deepEqual(exampleMail.to.sort(), ['alice@example.test', 'carol@example.test']);
assert.match(exampleMail.from, /^bounce\+[0-9a-f-]{36}@bounces\.studio\.test$/);
assert.match(exampleMail.raw, /^DKIM-Signature: v=1; a=rsa-sha256; c=relaxed\/relaxed; d=studio\.test;[\s\S]*s=ra1/m);
// Verify the DKIM signature cryptographically, as a receiving server would.
const publicTxt = 'v=DKIM1; k=rsa; p=' + crypto.createPublicKey(config.dkim.privateKey).export({ type: 'spki', format: 'der' }).toString('base64');
const dkim = await dkimVerify(Buffer.from(exampleMail.raw), { resolver: async (name, type) => { assert.equal(`${name}/${type}`, 'ra1._domainkey.studio.test/TXT'); return [[publicTxt]]; } });
assert.equal(dkim.results[0].status.result, 'pass', JSON.stringify(dkim.results[0].status));
assert.match(exampleMail.raw, /^List-Unsubscribe:\s+<https:\/\/portal\.test\/u\?r=1&t=x>/m);
assert.match(exampleMail.raw, /^ h=[^;]*list-unsubscribe:list-unsubscribe-post;/m);
assert.match(exampleMail.raw, /^Cc: bob@other\.test/m);
assert.doesNotMatch(exampleMail.raw, /^Bcc:|carol@example\.test/m);
assert.match(exampleMail.raw, new RegExp(`^Message-ID: <${first.body.data[0].id}@studio\\.test>`, 'm'));
const delivered = posted.filter(e => e.type === 'email.delivered' && e.email_id === first.body.data[0].id);
assert.deepEqual(delivered.flatMap(e => e.to).sort(), ['alice@example.test', 'bob@other.test', 'carol@example.test']);

// Hard bounce (550) vs temporary refusal (451) with retry.
posted.length = 0; received.length = 0;
const mixed = await call('/v1/messages', [msg({ to: ['reject@example.test', 'later@example.test', 'ok@example.test'] })]);
await settle();
const mixedId = mixed.body.data[0].id;
assert.deepEqual(posted.find(e => e.type === 'email.bounced').to, ['reject@example.test']);
assert.deepEqual(posted.find(e => e.type === 'email.delivered').to, ['ok@example.test']);
const retry = db.prepare("SELECT * FROM deliveries WHERE message_id=? AND status='deferred'").get(mixedId);
assert.deepEqual(JSON.parse(retry.rcpts), ['later@example.test']);
assert.ok(retry.next_attempt >= Date.now() + backoff(1) - 5000);
allowLater = true; db.prepare('UPDATE deliveries SET next_attempt=0 WHERE id=?').run(retry.id); posted.length = 0;
await settle();
assert.deepEqual(posted.find(e => e.type === 'email.delivered').to, ['later@example.test']);

// Retries give up after MAX_RETRY_HOURS and report failure (not a bounce).
allowLater = false; posted.length = 0;
const stale = await call('/v1/messages', [msg({ to: ['later@example.test'] })]);
await worker.idle();
db.prepare('UPDATE deliveries SET created=?, next_attempt=0 WHERE message_id=?').run(Date.now() - 73 * 3600000, stale.body.data[0].id);
await settle();
assert.equal(posted.find(e => e.email_id === stale.body.data[0].id).type, 'email.failed');

// Bounce receiver: a DSN to the VERP address after acceptance marks the delivery bounced.
const inbound = createInbound({ config, db });
await new Promise(r => inbound.listen(0, '127.0.0.1', r));
const inboundPort = inbound.server.address().port;
const bouncedDelivery = db.prepare("SELECT * FROM deliveries WHERE message_id=? AND domain='example.test'").get(first.body.data[0].id);
const dsn = nodemailer.createTransport({ host: '127.0.0.1', port: inboundPort, secure: false, ignoreTLS: true });
posted.length = 0;
await dsn.sendMail({ envelope: { from: '', to: `bounce+${bouncedDelivery.id}@bounces.studio.test` }, from: 'MAILER-DAEMON@example.test', to: `bounce+${bouncedDelivery.id}@bounces.studio.test`, subject: 'Undelivered Mail Returned to Sender', text: 'Reporting-MTA: dns; mx.example.test\n\nFinal-Recipient: rfc822; carol@example.test\nAction: failed\nStatus: 5.1.1\nDiagnostic-Code: smtp; 550 5.1.1 mailbox does not exist\n' });
await events.flush();
assert.deepEqual(posted[0].to, ['carol@example.test']);assert.equal(posted[0].type, 'email.bounced');
await assert.rejects(dsn.sendMail({ envelope: { from: '', to: 'anyone@bounces.studio.test' }, from: 'x@y.test', to: 'anyone@bounces.studio.test', subject: 's', text: 't' }), /550/);
assert.equal(parseBounce('Subject: Out of office\nAuto-Submitted: auto-replied\n\nI am away'), null);
assert.equal(parseBounce('Status: 4.2.2\nFinal-Recipient: rfc822; a@b.test'), null);

// Warm-up: a new IP sends only WARMUP_START recipients on day one; the rest wait for the next day.
const wdb = openDb(':memory:');
const wconfig = { ...config, warmupStart: 5, portalWebhookUrl: '' };
const wworker = createWorker({ config: wconfig, db: wdb });
const { enqueue } = await import('../src/api.js');
const { validateMessage } = await import('../src/api.js');
wdb.exec('BEGIN'); enqueue(wdb, Array.from({ length: 12 }, (_, i) => validateMessage(msg({ to: [`w${i}@example.test`] }), wconfig))); wdb.exec('COMMIT');
received.length = 0;
for (let i = 0; i < 10; i++) { wworker.tick(); await wworker.idle(); }
assert.equal(received.length, 5);
assert.equal(wdb.prepare("SELECT COUNT(*) n FROM deliveries WHERE status='queued'").get().n, 7);
const later = createWorker({ config: wconfig, db: wdb, now: () => Date.now() + 2 * 86400000 });
assert.equal(later.dailyCap(), 11);

// MX resolution rules.
const noOverride = { ...config, mxOverride: '' };
const resolver = (mx, a = true) => ({ resolveMx: async () => { if (mx instanceof Error) throw mx; return mx; }, resolve4: async () => { if (!a) { const e = new Error('x'); e.code = 'ENODATA'; throw e; } return ['192.0.2.1']; } });
const err = code => Object.assign(new Error(code), { code });
assert.deepEqual(await mailServers('d.test', noOverride, resolver([{ exchange: 'b.mx', priority: 20 }, { exchange: 'a.mx', priority: 10 }])), [{ host: 'a.mx', port: 25 }, { host: 'b.mx', port: 25 }]);
await assert.rejects(mailServers('d.test', noOverride, resolver([{ exchange: '', priority: 0 }])), PermanentError);
await assert.rejects(mailServers('d.test', noOverride, resolver(err('ENOTFOUND'))), PermanentError);
assert.deepEqual(await mailServers('d.test', noOverride, resolver(err('ENODATA'))), [{ host: 'd.test', port: 25 }]);
await assert.rejects(mailServers('d.test', noOverride, resolver(err('ENODATA'), false)), PermanentError);
await assert.rejects(mailServers('d.test', noOverride, resolver(err('ETIMEOUT'))), e => !(e instanceof PermanentError));

// Config loading.
assert.throws(() => loadConfig({ MAILER_SECRET: 'short' }), /at least 32/);
const loaded = loadConfig({ MAILER_SECRET: secret, MAILER_HOSTNAME: 'mail.studio.test', ALLOWED_FROM_DOMAINS: 'Studio.test, other.test', BOUNCE_DOMAIN: 'bounces.studio.test' });
assert.deepEqual(loaded.allowedFromDomains, ['studio.test', 'other.test']);

const stats = await call('/v1/stats');
assert.equal(stats.status, 200); assert.ok(stats.body.deliveries.sent >= 3);
await worker.stop(); api.close(); sink.close(); inbound.close();
console.log('PASS: signed API (unsigned, forged and stale requests refused); from-domain allow list; header-injection and recipient-cap validation; idempotent batches; per-domain split with Bcc kept out of headers; DKIM signature, VERP return path, Message-ID and List-Unsubscribe over real SMTP; 550 bounce vs 451 retry with backoff; retry expiry reported as failure; signed webhook events; DSN bounce receiver (unknown addresses refused, auto-replies and 4.x ignored); IP warm-up daily cap; MX/null-MX/A-fallback rules; config validation.');
