# Technical continuation notes

## Exact reference state
- Live URL: https://commonroom-team.rebeccaaldernet.chatgpt.site
- Project: appgprj_6aa2e582c7d0819181e020b7b0eefa0a
- Source commit: 6a0b7ba3e9adc4bc937b62cba754cec31f108712
- Saved version 53: appgprj_6aa2e582c7d0819181e020b7b0eefa0a~appgver_1c26babfefc48191b94fbb740f54887f
- Successful deployment: appgdep_6aac0cb57fe4819197ecba9881e4cb00
- Prior working directory: /workspace/sites/commonroom (do not assume it exists in another session).
- Original audience public; application APIs enforce approved membership, roles and owner-only Data Lake. Preserve current controls, and inspect current project state before deployment.

## Source and stack
React 19, TypeScript, Vinext/Vite, Cloudflare Workers runtime, D1 relational storage and R2 objects. package.json and pnpm-lock.yaml pin the installed dependency graph; Node >=22.13.0, pnpm 11.19.0 declared. Source README is the starter's detailed local/runtime guide, not a complete product manual.

The source export omits .git history, node_modules, build artifacts, local runtime state and untracked files. SHA-256 manifest identifies the exact exported tracked files. .openai/hosting.json retains the existing project identifier and bindings DB/BUCKET for SAME-project continuation. It does not grant access; do not use that identifier as the target for a separate clone.

## Main files
| Area | Files |
|---|---|
| Entry/shell | app/page.tsx, app/workspace.tsx, app/globals.css |
| Auth/permissions | app/chatgpt-auth.ts, lib/access.ts, lib/permissions.ts, app/api/access/route.ts |
| Direct messages | app/direct-messages.tsx, app/api/direct-messages/route.ts |
| Presence | app/member-presence.tsx, app/api/presence/route.ts |
| Orders | app/orders-view.tsx, lib/website-orders.ts, app/api/orders/route.ts, app/api/orders/receive/route.ts |
| Wix sites/analytics URL | lib/wix-sites.ts, scripts/wix-order-automation.mjs |
| Inventory snapshot/UI | data/inventory-snapshot.json, lib/inventory.ts, app/inventory-view.tsx |
| Read-only live inventory | app/live-wix-inventory.tsx, lib/live-wix-inventory.ts, lib/credential-seal.ts, app/api/inventory/connection/route.ts, app/api/inventory/live/route.ts |
| Painting matching | app/inventory-scanner.tsx, lib/painting-match.ts, app/api/inventory/scan/route.ts |
| Data Lake | app/data-lake.tsx, lib/data-lake.ts, app/api/data-lake/route.ts, app/api/data-lake/feed/[id]/route.ts |
| Background file/SQL processing | public/lake/file-worker.js, public/lake/query-worker.js and self-hosted libraries/licenses |
| Database | db/schema.ts, drizzle/0000 through 0015 SQL files and migration journal |
| Regression checks | tests/*.mjs |

## Configuration (names only, no values included)
- DB and BUCKET: provisioned runtime bindings.
- WIX_ORDER_SECRETS: server-side JSON mapping site IDs to webhook secrets, consumed by order receiver. Never send through client bundles, logs or this chat.
- WIX_INVENTORY_ENCRYPTION_KEY: server encryption key for the saved Wix connection. The encrypted object is stored at private-integrations/wix-inventory-v1 in R2; neither object nor encryption key is in the source ZIP.
- The connection form validates Wix access separately for each selected supported site. It saves only after all checks succeed. GET returns status, never raw API key. Current source reads products; it does not write shared inventory.

## Resume and validate
For an authorized Sites project, read the installed Sites building/hosting skills, retrieve current project/version, obtain repository access through supported tools, and compare current remote to the exported commit. If remote has newer work, merge against it; never force-push this snapshot over newer changes. Configure the local execution profile per the skill before running project commands. Install using the lockfile and the skill's installation workflow.

Commands used for the latest change, after dependencies were installed:
```
pnpm exec tsc --noEmit
node tests/lake-file-worker.mjs
```
Both passed, as did the Sites build helper. Other meaningful tests exist for Data Lake authorization/revision/feed/deletion, presence, inventory, message delivery, unread state and navigation. They are not a substitute for a live browser/device or actual Wix delivery test. Browser QA was unavailable in the final upload-fix session, and the actual customer workbook was not tested.

Use installed Sites helpers for building/packaging. Commit and push the exact source state; after successful push run `git rev-parse --verify HEAD` and use that full SHA to save a version with its matching built archive. Deploy the saved version, preserve the current audience, and poll until success before saying live. Use per-command ephemeral Git authentication, never persist tokens in the package or repository.

For a fresh local database, follow source/README.md to apply migration files in order. Do not replay migrations against an existing production database. A development mock identity is for local loopback only and must not become production authentication.

## Independent-hosting caution
This export is the Sites source, not a newly tested standalone deployment. Production auth relies on trusted platform-injected identity headers. An independent host must validate its own signed login tokens and block spoofed headers before reusing access logic. Configure Workers/D1/R2 under the company's account, migrate authorized records/objects and remap user IDs, set fresh secrets, reconnect Wix, and test access plus file operations before production cutover.
