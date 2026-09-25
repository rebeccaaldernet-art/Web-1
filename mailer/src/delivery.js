import dns from 'node:dns/promises';
import nodemailer from 'nodemailer';
// Direct-to-MX delivery: look up the recipient domain's mail servers and hand the message to them over SMTP
// (port 25, STARTTLS when offered), signed with DKIM. No third-party relay is involved.

export class PermanentError extends Error {}
// Headers covered by the DKIM signature. RFC 8058 (and Gmail/Yahoo bulk-sender rules) require List-Unsubscribe and
// List-Unsubscribe-Post to be signed for one-click unsubscribe; nodemailer's default list omits the latter.
const DKIM_HEADERS = 'From:Sender:Reply-To:Subject:Date:Message-ID:To:Cc:MIME-Version:Content-Type:Content-Transfer-Encoding:' +
  'In-Reply-To:References:List-Id:List-Unsubscribe:List-Unsubscribe-Post';

export async function mailServers(domain, config, resolver = dns) {
  if (config.mxOverride) {
    const [host, port] = config.mxOverride.split(':');
    return [{ host, port: Number(port) || 25 }];
  }
  let records;
  try {
    records = await resolver.resolveMx(domain);
  } catch (e) {
    if (e.code === 'ENOTFOUND') throw new PermanentError(`Domain ${domain} does not exist`);
    if (e.code !== 'ENODATA') throw e;
    records = [];
  }
  // RFC 7505 "null MX": the domain accepts no email.
  if (records.length === 1 && (records[0].exchange === '' || records[0].exchange === '.')) throw new PermanentError(`${domain} does not accept email`);
  if (!records.length) {
    // RFC 5321 5.1: with no MX records, the domain's own address record is the mail server.
    try { await resolver.resolve4(domain); } catch (e) {
      if (['ENOTFOUND', 'ENODATA'].includes(e.code)) throw new PermanentError(`${domain} has no mail server`);
      throw e;
    }
    return [{ host: domain, port: 25 }];
  }
  return records.sort((a, b) => a.priority - b.priority).map(r => ({ host: r.exchange, port: 25 }));
}

const smtpCode = e => Number(e?.responseCode) || 0;
const describe = e => String(e?.response || e?.message || e).slice(0, 500);

// Returns { accepted: [], bounced: [{rcpt, error}], deferred: [{rcpt, error}], response }.
export async function deliver({ config, message, delivery, servers, transportFactory = nodemailer.createTransport }) {
  const rcpts = JSON.parse(delivery.rcpts);
  const mail = {
    // VERP return path: bounces come back to bounce+<delivery id>@BOUNCE_DOMAIN and identify this delivery.
    envelope: { from: `bounce+${delivery.id}@${config.bounceDomain}`, to: rcpts },
    from: message.from_header,
    to: JSON.parse(message.to_list),
    cc: JSON.parse(message.cc_list),
    replyTo: message.reply_to || undefined,
    subject: message.subject,
    html: message.html || undefined,
    text: message.text || undefined,
    headers: JSON.parse(message.headers),
    messageId: `<${message.id}@${config.dkim?.domainName || config.hostname}>`,
    date: new Date(message.created),
    disableFileAccess: true,
    disableUrlAccess: true,
  };
  let lastError = 'No mail server could be reached';
  for (const server of servers) {
    const transport = transportFactory({
      host: server.host, port: server.port, secure: false, name: config.hostname,
      requireTLS: config.requireTls, tls: { rejectUnauthorized: false, servername: server.host },
      connectionTimeout: 30000, greetingTimeout: 30000, socketTimeout: 120000,
      dkim: config.dkim ? { ...config.dkim, headerFieldNames: DKIM_HEADERS } : undefined, logger: false, debug: false,
    });
    try {
      const info = await transport.sendMail(mail);
      const accepted = (info.accepted || []).map(String).map(s => s.toLowerCase());
      const bounced = [], deferred = [];
      for (const e of info.rejectedErrors || []) {
        const rcpt = String(e.recipient || '').toLowerCase();
        (smtpCode(e) >= 500 ? bounced : deferred).push({ rcpt, error: describe(e) });
      }
      // Recipients neither accepted nor listed as rejected are retried rather than assumed delivered.
      for (const r of rcpts) if (!accepted.includes(r) && !bounced.some(b => b.rcpt === r) && !deferred.some(d => d.rcpt === r)) deferred.push({ rcpt: r, error: 'No response for this recipient' });
      return { accepted, bounced, deferred, response: String(info.response || '').slice(0, 500) };
    } catch (e) {
      const code = smtpCode(e);
      if (code >= 500) {
        // Every recipient was refused, or the message itself was refused after DATA.
        const perRcpt = new Map((e.rejectedErrors || []).map(x => [String(x.recipient).toLowerCase(), x]));
        const bounced = [], deferred = [];
        for (const r of rcpts) {
          const x = perRcpt.get(r) || e;
          (smtpCode(x) >= 500 ? bounced : deferred).push({ rcpt: r, error: describe(x) });
        }
        return { accepted: [], bounced, deferred, response: describe(e) };
      }
      if (code >= 400) return { accepted: [], bounced: [], deferred: rcpts.map(rcpt => ({ rcpt, error: describe(e) })), response: describe(e) };
      // Connection-level failure: try the next mail server for this domain.
      lastError = `${server.host}: ${describe(e)}`;
    } finally {
      transport.close();
    }
  }
  return { accepted: [], bounced: [], deferred: rcpts.map(rcpt => ({ rcpt, error: lastError })), response: lastError };
}
