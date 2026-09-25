import fs from 'node:fs';
// All settings come from the environment (see README.md). Nothing secret is stored in the repository.
function num(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be a non-negative number`);
  return n;
}
function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required`);
  return v;
}
export function loadConfig(env = process.env) {
  const saved = process.env;
  process.env = env;
  try {
    const secret = required('MAILER_SECRET');
    if (secret.length < 32) throw new Error('MAILER_SECRET must be at least 32 characters');
    const hostname = required('MAILER_HOSTNAME');
    if (!/^[a-z0-9.-]+$/i.test(hostname)) throw new Error('MAILER_HOSTNAME must be a plain host name');
    const dkimKeyPath = env.DKIM_PRIVATE_KEY_PATH;
    const config = {
      secret,
      // EHLO name. Must match the reverse DNS (PTR) of the server's public IP.
      hostname,
      httpHost: env.HTTP_HOST || '127.0.0.1',
      httpPort: num('HTTP_PORT', 8025),
      inboundHost: env.INBOUND_HOST || '0.0.0.0',
      inboundPort: num('INBOUND_PORT', 25),
      inboundEnabled: env.INBOUND_ENABLED !== 'false',
      dataDir: env.DATA_DIR || './data',
      portalWebhookUrl: env.PORTAL_WEBHOOK_URL || '',
      // Only these From domains may be sent, so a leaked secret cannot be used to spoof other domains.
      allowedFromDomains: required('ALLOWED_FROM_DOMAINS').split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
      bounceDomain: required('BOUNCE_DOMAIN').toLowerCase(),
      dkim: dkimKeyPath ? { domainName: required('DKIM_DOMAIN').toLowerCase(), keySelector: required('DKIM_SELECTOR'), privateKey: fs.readFileSync(dkimKeyPath, 'utf8') } : null,
      // Warm-up: a new IP address starts at warmupStart recipients per day and grows by warmupGrowth each day up to dailyLimit.
      dailyLimit: num('DAILY_LIMIT', 100000),
      warmupStart: num('WARMUP_START', 200),
      warmupGrowth: num('WARMUP_GROWTH', 1.5),
      warmupStartDate: env.WARMUP_START_DATE || '',
      concurrency: num('CONCURRENCY', 10),
      perDomainConcurrency: num('PER_DOMAIN_CONCURRENCY', 2),
      perDomainPerMinute: num('PER_DOMAIN_PER_MINUTE', 60),
      maxRetryHours: num('MAX_RETRY_HOURS', 72),
      // Testing only: deliver every domain to this host:port instead of looking up MX records.
      mxOverride: env.MX_OVERRIDE || '',
      requireTls: env.REQUIRE_TLS === 'true',
      tickMs: num('TICK_MS', 1000),
    };
    if (!config.dkim) console.warn('DKIM_PRIVATE_KEY_PATH is not set: mail will be unsigned and most providers will reject or spam it.');
    return config;
  } finally {
    process.env = saved;
  }
}
