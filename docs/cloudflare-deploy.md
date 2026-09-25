# Publish the portal on your own Cloudflare account

This publishes the portal as a Cloudflare Worker named `ra-studio-portal`. It uses your existing D1 database `ra-studio`, which is already migrated through `0018_email_messages.sql`.

## What is different from Sites hosting
- **Sign-in uses Cloudflare Access.** It is free for up to 50 users. The Cloudflare build sets `AUTH_MODE=cloudflare-access`. The portal then ignores the Sites `oai-authenticated-*` headers, because anyone could send those outside Sites, and trusts only a Cloudflare Access token whose signature, issuer, audience and expiry it has verified (`lib/cloudflare-access.ts`). If the Access settings below are missing, nobody can sign in. The portal refuses rather than guessing.
- The owner is whoever signs in with the email address stored for the `workspace-owner` member. Access verifies that email address, and the first person to sign in is never promoted.
- Build settings live in `cloudflare.deploy.json` (none of them are secret).

## 1. Connect the repository (one time)
1. In the Cloudflare dashboard, go to **Workers & Pages → Create → Import a repository**, and choose GitHub `rebeccaaldernet-art/Web-1`.
2. Use these settings:
   - Project (Worker) name: `ra-studio-portal`. This must match `name` in `cloudflare.deploy.json`.
   - Production branch: `claude/brave-turing-jk2tk1`, or `main` after you merge it.
   - Build command: `pnpm run build:cloudflare`
   - Deploy command: `npx wrangler deploy`
3. Save and deploy. Cloudflare builds and publishes the site, and gives you its address: `https://ra-studio-portal.<your-subdomain>.workers.dev`.
4. Every later push to that branch deploys automatically.

## 2. Turn on sign-in (Cloudflare Access)
1. Open the Worker, go to **Settings → Domains & Routes**, and on `workers.dev` select **Enable Cloudflare Access**.
2. Select **Manage Cloudflare Access**. Allow the email addresses of the people who should use the portal (at least the owner's). The default login method, a one-time PIN sent by email, is enough.
3. Copy two values:
   - the application's **Audience (AUD) tag**;
   - your **team domain**, `https://<team-name>.cloudflareaccess.com` (under **Zero Trust → Settings**).
4. Open the Worker, go to **Settings → Variables and Secrets**, and add:
   - `CF_ACCESS_TEAM_DOMAIN` = the team domain
   - `CF_ACCESS_AUD` = the AUD tag
5. Open the site address and sign in. The owner account opens; anyone else waits for approval, because approval is on.

## 3. Sending email
Choose one or both:
- **Compose (one-off emails) through Cloudflare Email Service.** This needs the Workers Paid plan and a domain whose DNS is on Cloudflare.
  1. Go to **Compute → Email Service → Email Sending → Onboard Domain** and pick your domain. Cloudflare adds the SPF, DKIM and DMARC records.
  2. Set `"cloudflare_email": true` in `cloudflare.deploy.json` and push. The next deploy then includes the `EMAIL` binding.
  3. In the portal, under **Email → Settings**, set the From address on that domain.

  Cloudflare allows this service for transactional, one-off email only, so the portal never uses it for campaigns.
- **Campaigns (bulk) and all mail through your own mail server.** Cloudflare Workers cannot open SMTP port 25, so bulk sending uses the `mailer/` service on a separate server. See `mailer/README.md`. Then add the secrets `MAILER_URL`, `MAILER_SECRET` and `EMAIL_LINK_SECRET` under **Variables and Secrets**.
  - With a mail server, add a **second Access application** with a **Bypass → Everyone** policy for these paths, so recipients and your mail server can reach them. Each path protects itself with signed links or signatures.
    - `ra-studio-portal.<subdomain>.workers.dev/api/email/unsubscribe`
    - `ra-studio-portal.<subdomain>.workers.dev/api/email/webhook`

## 4. Optional: file storage (R2)
Shared files, uploads and the Data Lake need R2. R2 is currently not enabled on this account.
1. Enable R2 in the dashboard and create a bucket, for example `ra-studio-files`.
2. Put its name in `r2_bucket_name` in `cloudflare.deploy.json` and push.

Until then, those features show "File storage unavailable". Email, messages and access control work without R2.

## Database updates later
New migrations in `drizzle/` can be applied with:

`npx wrangler d1 migrations apply ra-studio --remote --config dist/server/wrangler.json`

Run `pnpm run build:cloudflare` first. The database's `d1_migrations` table already records `0000`–`0018`.
