# Email: compose and bulk campaigns

**Email** in the portal sidebar is owner-only and has four folders:

- **Compose** is a Gmail-style editor with From, To, Cc, Bcc, Subject and a formatted body (bold, italic, underline, lists, links). Addresses become chips as you type or paste them, and invalid ones are highlighted. The unsent draft is kept in this browser, and Ctrl/⌘ + Enter sends.
- **Sent** lists composed email with search, a reader, **Forward** and **Edit and send again**. The status is updated by the webhook: Sent, Delivered, Bounced, Marked as spam or Not sent.
- **Campaigns** is bulk sending to up to 200,000 opted-in recipients (described below).
- **Settings** holds the sender, deployment setup status, suppression list and activity.

Composed email goes to at most 50 addresses per message and 1,000 direct recipients per 24 hours, so bulk mail uses campaigns with their consent, unsubscribe and suppression safeguards. Each message has a browser-generated id that doubles as the provider idempotency key. A double click or retry cannot send it twice, and a failed message can be retried with its stored content. Composed email has no unsubscribe footer and needs only a sender name and address. The postal address is required for campaigns only.

## Why not Gmail
Gmail and Google Workspace mailboxes are capped at roughly 500–2,000 messages per day, and bulk sending from them gets the account suspended. The portal sends through **Resend**'s HTTP batch API instead (100 messages per call) from the Worker, using the same Cloudflare D1 database as the rest of the portal.

## Setup on the deployment (not included in source)
1. Create a Resend account, add your sending domain, and publish the SPF, DKIM and DMARC records it gives you. Gmail and Yahoo require all three, plus one-click unsubscribe, for bulk senders.
2. Choose a Resend plan whose monthly and daily quota covers your volume (100,000 emails is above the free tier).
3. Set Worker secrets:
   - `RESEND_API_KEY`: a sending-only API key.
   - `EMAIL_LINK_SECRET`: 32 or more random characters. It signs unsubscribe links. If it changes, links in email already sent stop working.
   - `RESEND_WEBHOOK_SECRET`: the `whsec_…` value for a Resend webhook pointed at `https://<site>/api/email/webhook` with the `email.bounced`, `email.complained` and `email.delivered` events.
4. Apply migrations `drizzle/0017_email_campaigns.sql` and `drizzle/0018_email_messages.sql`. They only add new tables and change no existing data.
5. `/api/email/unsubscribe` and `/api/email/webhook` must be publicly reachable. They are protected by signed tokens and Svix signatures, not by portal sign-in.

The page shows which secrets are missing. Without them, test sends and sending are refused. Nothing is marked as sent unless the provider accepted it.

## Flow
1. **Sender**: from name, a from address on the verified domain, and a postal address (required by CAN-SPAM). The postal address is added to every email.
2. **Campaign**: subject, HTML body and optional plain text. The merge fields are `{{name}}` and `{{email}}`, and their values are HTML-escaped.
3. **Recipients**: upload a CSV with an `email` column and an optional `name` column, and confirm that everyone opted in. Addresses are uploaded 1,000 per request, and duplicates and invalid addresses are skipped.
4. **Test**: sends the saved version to the owner. If the campaign is edited after the test, you have to test again.
5. **Start sending**: type the exact recipient count to confirm. Suppressed addresses are removed first.
6. **Sending** runs while the campaign page is open. Each dispatch call sends up to 5 batches (500 emails). At the provider's default rate limit, 100,000 emails take roughly 10–20 minutes. Closing the page pauses sending, and reopening it resumes where it stopped. Pause, resume and cancel are available.

## Safety properties
- Every message has an unsubscribe footer plus `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers (RFC 8058).
- Unsubscribes, hard bounces, complaints and manual entries go to a global suppression list, and suppressed addresses are skipped just before each batch is sent.
- Recipients are claimed in leased batches. A throttled or interrupted batch is retried with the same `Idempotency-Key`, so Resend replays the original result and nobody gets the email twice. A batch is marked failed after 5 attempts.
- The owner role, the origin check, revision checks and an audit log (`email_audit`) apply to every change.

## Not included
- Unattended background sending. Sites hosting here only declares D1 and R2 bindings. To send without the page open, add a Cron Trigger or a Queue consumer that calls `dispatch(campaignId)` from `lib/email-campaigns.ts`.
- Open and click tracking, scheduling, and A/B tests.

Tests: `node tests/email-campaigns.mjs` runs a full 100,000-recipient send against a mocked provider, and `node tests/email-messages.mjs` covers Compose and Sent. Migration `0018_email_messages.sql` only adds a new table.
