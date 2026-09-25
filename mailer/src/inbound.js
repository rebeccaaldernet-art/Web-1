import fs from 'node:fs';
import { SMTPServer } from 'smtp-server';
import { queueEvent } from './events.js';
// Receives bounce reports (DSNs) sent to the VERP return path bounce+<delivery id>@BOUNCE_DOMAIN.
// Point the BOUNCE_DOMAIN MX record at this server. All other recipients are refused.
const VERP = /^bounce\+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@(.+)$/i;
export function parseBounce(raw) {
  const statuses = [...raw.matchAll(/^Status:\s*([245])\.(\d{1,3})\.(\d{1,3})/gim)].map(m => Number(m[1]));
  const recipients = [...raw.matchAll(/^Final-Recipient:\s*rfc822\s*;\s*<?([^\s>]+)>?/gim)].map(m => m[1].toLowerCase());
  const diagnostic = raw.match(/^Diagnostic-Code:\s*(?:smtp;)?\s*(.+)$/im)?.[1]?.trim().slice(0, 500) || '';
  if (/^Auto-Submitted:\s*auto-replied/im.test(raw)) return null;
  if (statuses.length) return statuses.includes(5) ? { permanent: true, recipients, diagnostic } : null;
  // Non-standard bounce without a delivery-status part.
  const subject = raw.match(/^Subject:\s*(.+)$/im)?.[1] || '';
  if (/undeliver|delivery (status notification|has failed)|returned mail|failure notice|mail delivery failed/i.test(subject)) return { permanent: true, recipients, diagnostic: subject.slice(0, 300) };
  return null;
}
export function handleBounce(db, config, deliveryId, raw) {
  const parsed = parseBounce(raw);
  if (!parsed) return false;
  const d = db.prepare('SELECT * FROM deliveries WHERE id=?').get(deliveryId);
  if (!d) return false;
  const rcpts = JSON.parse(d.rcpts);
  const bounced = parsed.recipients.filter(r => rcpts.includes(r));
  const to = bounced.length ? bounced : rcpts;
  db.prepare("UPDATE deliveries SET status='bounced',last_error=?,updated=? WHERE id=?").run(parsed.diagnostic || 'Bounced after acceptance', Date.now(), d.id);
  queueEvent(db, config, { type: 'email.bounced', email_id: d.message_id, to, bounce: { type: 'Permanent', message: parsed.diagnostic || 'Bounced after acceptance' } });
  return true;
}
export function createInbound({ config, db }) {
  const tls = process.env.INBOUND_TLS_KEY_PATH && process.env.INBOUND_TLS_CERT_PATH ? { key: fs.readFileSync(process.env.INBOUND_TLS_KEY_PATH), cert: fs.readFileSync(process.env.INBOUND_TLS_CERT_PATH) } : null;
  return new SMTPServer({
    name: config.hostname, banner: 'RA Studio mailer', logger: false, authOptional: true, size: 2 * 1024 * 1024,
    disabledCommands: tls ? ['AUTH'] : ['AUTH', 'STARTTLS'], ...(tls || {}),
    onRcptTo(address, session, cb) {
      const m = String(address.address).match(VERP);
      if (!m || m[2].toLowerCase() !== config.bounceDomain || !db.prepare('SELECT 1 FROM deliveries WHERE id=?').get(m[1].toLowerCase())) {
        const err = new Error('No such recipient'); err.responseCode = 550; return cb(err);
      }
      return cb();
    },
    onData(stream, session, cb) {
      const chunks = [];
      let size = 0;
      stream.on('data', c => { size += c.length; if (size <= 2 * 1024 * 1024) chunks.push(c); });
      stream.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        try {
          for (const r of session.envelope.rcptTo) handleBounce(db, config, String(r.address).match(VERP)[1].toLowerCase(), raw);
        } catch (e) { console.error('bounce handling failed', e); }
        cb();
      });
    },
  });
}
