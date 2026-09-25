# RA Studio mailer: your own outbound mail server

This service sends the portal's email without any outside email company. It:

- takes messages from the portal over a signed HTTPS API;
- keeps them in a durable queue (SQLite file);
- looks up each recipient domain's mail servers (MX records) and delivers over SMTP on port 25, using STARTTLS when the other side offers it;
- signs every message with **your** DKIM key;
- retries temporary refusals such as greylisting or "try again later" with backoff for up to 72 hours;
- treats permanent refusals (5xx) as bounces;
- receives late bounce reports on port 25 at `bounce+<id>@your bounce domain`;
- limits sending per recipient domain and ramps up daily volume for a new IP address (warm-up);
- reports delivered, bounced and failed results back to the portal. The portal adds bounced addresses to its suppression list.

## What you need
Being your own email platform means owning what an email company normally provides:

1. **A server with outbound port 25 open and a fixed public IPv4 address.** This is a Linux VPS, 1 vCPU and 1 GB RAM being enough. Many clouds block port 25 by default: AWS, Google Cloud and Azure block it, and some providers open it only on request. Check before you buy, and ask the provider to open it if needed. The portal's Cloudflare Workers cannot send SMTP themselves, which is why this runs on its own server.
2. **Reverse DNS (PTR)** for that IP, set to your mail host name (for example `mail.example.com`). You set this at the VPS provider, not at your domain registrar.
3. **DNS records** at your domain registrar (replace `example.com` and the IP):

| Type | Name | Value | Purpose |
|---|---|---|---|
| A | `mail.example.com` | `203.0.113.10` | the mail server |
| TXT | `example.com` | `v=spf1 ip4:203.0.113.10 -all` (add any other senders you use, such as your normal mailbox provider's `include:`) | SPF for your From domain |
| TXT | `ra1._domainkey.example.com` | printed by `npm run dkim-keygen` | DKIM public key |
| TXT | `_dmarc.example.com` | `v=DMARC1; p=none; rua=mailto:dmarc@example.com` (move to `p=quarantine` once reports look clean) | DMARC |
| MX | `bounces.example.com` | `10 mail.example.com` | bounce reports come back here |
| TXT | `bounces.example.com` | `v=spf1 ip4:203.0.113.10 -all` | SPF for the return path |

## Install (Ubuntu/Debian VPS)
```bash
# Node.js 22 or newer, Caddy for HTTPS
sudo apt install -y caddy
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
sudo useradd --system --home /opt/ra-mailer ramailer
sudo mkdir -p /opt/ra-mailer && sudo cp -r mailer/* mailer/.env.example /opt/ra-mailer/ && cd /opt/ra-mailer
sudo npm ci --omit=dev
sudo -u ramailer node scripts/dkim-keygen.js ra1 example.com ./keys   # publish the printed TXT record
sudo cp .env.example .env && sudo nano .env                           # fill in every value
sudo mkdir -p data && sudo chown -R ramailer: data keys .env && sudo chmod 600 .env
sudo cp deploy/ra-mailer.service /etc/systemd/system/ && sudo systemctl enable --now ra-mailer
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile && sudo nano /etc/caddy/Caddyfile && sudo systemctl reload caddy
sudo ufw allow 25/tcp && sudo ufw allow 443/tcp                        # if you use ufw
```
Docker alternative: `docker build -t ra-mailer .`, then `docker run -d --env-file .env -p 127.0.0.1:8025:8025 -p 25:25 -v $PWD/data:/app/data -v $PWD/keys:/app/keys:ro ra-mailer`. Inside the container, set `HTTP_HOST=0.0.0.0`.

Then, in the portal deployment, set these secrets:
- `MAILER_URL=https://mail.example.com`
- `MAILER_SECRET`, the same value as in `.env`
- `EMAIL_LINK_SECRET`, 32 or more random characters

Open **Email → Settings → Check connection** in the portal to confirm it works.

## Getting into inboxes (read before sending 100,000)
A brand-new IP address has no reputation. Gmail, Outlook and Yahoo slow down or reject large volumes from unknown IPs.
- **Warm up.** By default the mailer sends at most `WARMUP_START=200` recipients on the first day and grows 1.5× per day (200 → 300 → 450 …). It reaches 100,000 per day after about 16 days. Mail over the day's limit simply waits in the queue.
- Send only to people who opted in, and keep the unsubscribe link (the portal adds it). Complaint rates above 0.3% get you blocked.
- Register with [Google Postmaster Tools](https://postmaster.google.com) and [Microsoft SNDS](https://sendersupport.olc.protection.outlook.com/snds/) to watch your reputation.
- Check that your IP is not on a blocklist before you start, for example with [MXToolbox](https://mxtoolbox.com/blacklists.aspx).
- Spam complaints are not reported automatically. Unlike bounces, they need feedback-loop programmes such as Yahoo CFL or Microsoft JMRP, which send reports by email. Add complaining addresses to the portal's suppression list.

## Operations
- Status: `curl -s localhost:8025/v1/health`, or **Check connection** in the portal. That shows today's count, the daily limit and the queue.
- Logs: `journalctl -u ra-mailer -f`
- Back up `data/mailer.sqlite` and `keys/`. The DKIM key must stay private.
- If the process stops mid-delivery, those deliveries are retried on restart. A message that was accepted at that exact moment may arrive twice. This is normal behaviour for mail servers.

## Test
`npm test` runs real SMTP on localhost against a stand-in recipient server. It checks DKIM signatures cryptographically, bounces, retries, warm-up and the bounce receiver. No mail leaves the machine.
