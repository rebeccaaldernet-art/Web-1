import crypto from 'node:crypto';
// Requests between the portal and the mailer are signed both ways:
// X-Mailer-Timestamp (unix seconds) and X-Mailer-Signature = base64url(HMAC-SHA256(secret, `${timestamp}.${body}`)).
export function sign(secret, body, timestamp = Math.floor(Date.now() / 1000)) {
  const signature = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('base64url');
  return { 'X-Mailer-Timestamp': String(timestamp), 'X-Mailer-Signature': signature };
}
export function verify(secret, body, timestamp, signature, now = Date.now()) {
  if (!timestamp || !signature || !/^\d{1,12}$/.test(timestamp)) return false;
  if (Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  const expected = Buffer.from(sign(secret, body, timestamp)['X-Mailer-Signature']);
  const given = Buffer.from(signature);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}
