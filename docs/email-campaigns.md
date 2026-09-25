# Email: compose and bulk campaigns

**Email** in the portal sidebar is owner-only and has four folders:

- **Compose** is a Gmail-style editor with From, To, Cc, Bcc, Subject and a formatted body (bold, italic, underline, lists, links). Addresses become chips as you type or paste them, and invalid ones are highlighted. The unsent draft is kept in this browser, and Ctrl/⌘ + Enter sends.
- **Sent** lists composed email with search, a reader, **Forward** and **Edit and send again**. The status comes from your mail server's reports: Sent (queued on your server), Delivered (accepted by the recipient's server), Bounced, or Not sent.
- **Campaigns** is bulk sending to up to 200,000 opted-in recipients (described below).
- **Settings** holds the sender, deployment setup status, suppression list and activity.

Composed email goes to at most 50 addresses per message and 1,000 direct recipients per 24 hours, so bulk mail uses campaigns with their consent, unsubscribe and suppression safeguards. Each message has a browser-generated id that doubles as the mailer's idempotency key. A double click or retry cannot send it twice, and a failed message can be retried with its stored content. Composed email has no unsubscribe footer and needs only a sender name and address. The postal address is required for campaigns only.

## How email is delivered: your own mail server
No outside email service is used. The portal hands messages to **your own mail server**, the `mailer/` service in this repository, over a signed HTTPS API. The mailer delivers them directly to each recipient's mail server over SMTP, signed with your DKIM key, and handles retries, bounces and daily warm-up. It reports delivered, bounced and failed results back to `/api/email/webhook`.

The mailer runs on its own Linux server because Cloudflare Workers, which run the portal, cannot open SMTP connections on port 25. Server requirements, DNS records (SPF, DKIM, DMARC, PTR, bounce MX), installation and warm-up guidance are in [`mailer/README.md`](../mailer/README.md).

Gmail and Google Workspace mailboxes are capped at roughly 500–2,000 messages per day, so they are not used for bulk sending.

## Portal setup (secrets on the portal deployment)
1. `MAILER_URL`: the HTTPS address of your mail server, for example `https://mail.example.com`.
2. `MAILER_SECRET`: the same 32+ character value as `MAILER_SECRET` in the mailer's `.env`. It signs requests in both directions.
3. `EMAIL_LINK_SECRET`: 32 or more random characters that sign unsubscribe links. If it changes, links in email already sent stop working.
4. Apply migrations `drizzle/0017_email_campaigns.sql` and `drizzle/0018_email_messages.sql`. They only add new tables and change no existing data.
5. `/api/email/unsubscribe` and `/api/email/webhook` must be publicly reachable. They are protected by signed tokens and signatures, not by portal sign-in.

**Email → Settings → Check connection** confirms that the portal can reach the mailer, and shows today's count against the warm-up limit. Without the secrets, sending is refused. A message counts as sent only once your mail server has accepted it, and as delivered only once the recipient's server has.

## Flow
1. **Sender**: from name, a from address on the verified domain, and a postal address (required by CAN-SPAM). The postal address is added to every email.
2. **Campaign**: subject, HTML body and optional plain text. The merge fields are `{{name}}` and `{{email}}`, and their values are HTML-escaped.
3. **Recipients**: upload a CSV with an `email` column and an optional `name` column, and confirm that everyone opted in. Addresses are uploaded 1,000 per request, and duplicates and invalid addresses are skipped.
4. **Test**: sends the saved version to the owner. If the campaign is edited after the test, you have to test again.
5. **Start sending**: type the exact recipient count to confirm. Suppressed addresses are removed first.
6. **Sending** runs while the campaign page is open. Each dispatch call hands up to 500 emails to your mail server, so 100,000 are queued in a few minutes. Closing the page pauses the hand-off, and reopening it resumes where it stopped. Pause, resume and cancel are available. Your mail server then delivers the queue within its daily warm-up limit. From a new IP address, 100,000 recipients take about two to three weeks at first. Once the IP is warmed up, it can deliver that many in a day.

## Safety properties
- Every message has an unsubscribe footer plus `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers (RFC 8058).
- Unsubscribes, hard bounces, complaints and manual entries go to a global suppression list, and suppressed addresses are skipped just before each batch is sent.
- Recipients are claimed in leased batches. A throttled or interrupted batch is retried with the same `Idempotency-Key`, so the mailer returns the original result and nobody gets the email twice. A batch is marked failed after 5 attempts.
- The owner role, the origin check, revision checks and an audit log (`email_audit`) apply to every change.

## Not included
- Unattended background sending. Sites hosting here only declares D1 and R2 bindings. To send without the page open, add a Cron Trigger or a Queue consumer that calls `dispatch(campaignId)` from `lib/email-campaigns.ts`.
- Open and click tracking, scheduling, and A/B tests.

Tests: `node tests/email-campaigns.mjs` runs a full 100,000-recipient send against a mocked mail server, and `node tests/email-messages.mjs` covers Compose and Sent. `node tests/email-own-server.mjs` runs the whole chain (portal → mailer → SMTP → reports back) on localhost after `npm ci` in `mailer/`, and `cd mailer && npm test` tests the mail server itself. Migration `0018_email_messages.sql` only adds a new table.
