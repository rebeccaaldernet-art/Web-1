# RA Studio product and progress handoff

## Purpose and working preferences
A company portal for Rebecca Aldernet Studio: staff communication, directory, files, website access, orders, inventory and restricted data analysis. User wants functional features, mobile usability, minimal repeated questions, and honest status. Repeated premature completion claims caused frustration. Distinguish source implementation, deployed code, configured credentials and verified end-to-end operation. Earlier Wix-change consent was task-specific; do not interpret it as blanket authorization for future destructive stock operations.

## Current feature status
| Feature | Evidence and limitations |
|---|---|
| Company portal | Home/dashboard, department channels, team directory, files, roles and activity analytics exist. New membership requires approval according to earlier configuration; inspect current settings before relying on it. |
| Messaging | Channels and private threads, message editing/deletion, mentions/unread indicators. Direct-message icons are beside people in the directory; dedicated sidebar DM entry was removed. Refresh should open #general, not the last private chat. |
| Navigation/mobile | Back button/browser history, latest-message opening and mobile layout fixes were implemented. Preserve them. |
| Online presence | Current source has per-tab sessions, 10-second heartbeat, page-exit beacon, sequence ordering, last-seen and 75-second expiry fallback. Multiple sessions are aggregated. Browser termination/network loss can delay offline detection; immediate disappearance is not guaranteed. User previously reported incorrect green dots; verify in two real accounts/tabs. |
| Notifications | Mentions exist, but requested mute-bypassing sound and device push with the tab/browser closed are NOT established as complete. Earlier uncommitted push work was lost when the workspace was pruned. Do not claim push works. Need implementation/audit, subscriptions, service worker, delivery tests and device permission handling. System mute/DND and browser support remain relevant. |
| Orders | Stored order list and receiver exist; UI refreshes stored records every 5 seconds while visible. Five Wix order automations were previously enabled and configuration-checked. Successful new-order delivery is still unverified. Refreshing this table does not fetch missing Wix orders. |
| Order history | Import/reconciliation incomplete. Last explicitly reported processed count was 2,625 out of 23,623 historical orders; these are historical observations, not a current database count. Previous full Wix reference: main site 23,556 + Designs 67. Do not mark history complete without fresh reconciliation. |
| Analytics | Sidebar Analytics is RA Studio activity. Orders → Analytics must open Wix Sales in a new tab. Custom order analytics UI was removed after incomplete history and differing definitions produced misleading numbers. Some old analytics code/routes remain; don't re-enable accidentally. |
| Inventory snapshot | 27,519 listings across four supported Wix stores were imported and reconciled at that time. Other three sites had no supported catalog. Counts/quantities are historical. Search, scrolling and sorting exist; green in-stock and orange out-of-stock. Keep unknown/untracked/variant quantities distinct from zero. |
| Live inventory | Current source adds owner-only connection form, encrypted credential storage and read-only Wix product queries, with refresh while visible every 60 seconds. Key validation makes a real query against each selected site before saving. Deployment/configuration success of an actual key is NOT verified in this handoff. Earlier claims that no integration code exists are superseded by current source, but not proof of a connected account. |
| Shared stock | NOT implemented/verified as a cross-site write system. User wants a sale on any site to decrement matching items/variants everywhere. Main Rebecca Aldernet site was chosen as the initial stock reference. Product/variant mapping, idempotency, retry/concurrency handling and sales/cancellation semantics are needed before writes. Names alone are unsafe matches. |
| Product links | Current source links product name/image to the storefront URL where supplied. Hidden/unpublished/missing storefront URLs fall back to the Wix item with an explanatory label. |
| Painting scan | Camera/upload UI, reference-photo storage and perceptual image comparison exist. It compares registered reference signatures, not an automatically indexed universal AI catalog. Match/review/no-match states and details exist. User reported failures after uploading; actual successful use remains unverified. It should not certify identity solely from a green match. |
| Data Lake | Owner-only on the server. Dataset editing, CSV/XLSX import/export, browser SQL query/change preview, SQLite export, read-only authenticated dataset feeds and access log exist. Detailed behavior below. |
| Independent hosting | Earlier standalone Cloudflare Access source ZIP was delivered, but this package is the newer live Sites source. Porting authentication and configuring hosting/storage is required for independent deployment. Existing user IDs and files need planned migration. |

## Data Lake: latest resolved problem and current workflow
User wanted to edit sheets and use one dataset across SQL, Excel/CSV and Power BI. The page froze, then workbook deletion was confusing, then upload hit a cell limit.

- File import/export and SQL run in Web Workers. Editable view renders 25 rows × 10 columns at a time; all imported data stays in the saved dataset.
- Reset & delete workbook deletes the selected saved dataset and its feed credentials; object versions are cleaned up. User's last screenshot explicitly showed "Workbook deleted. Import a new file to start again." Treat deletion as solved unless new evidence contradicts it.
- The subsequent screenshot showed "Workbook limit: 50,000 rows, 100 columns and 250,000 total cells." The old importer counted all worksheets plus formatting, rejecting valid small sheets.
- Version 53 removes that aggregate cap. Excel first lists worksheets; choose one and click **Load selected worksheet**, review, then **Save private dataset**. CSV loads directly. One sheet is materialized at a time. Empty-format cells and entirely blank rows are ignored.
- Limits: 5 MB uploaded file; 50,000 populated data rows, 100 columns and 7 MB extracted JSON per selected sheet; worker timeout 30 seconds. A real value beyond column 100 still fails that sheet. Headers must be unique (case-insensitive), <=128 characters. First populated row is the header. Formula cached results are used; Excel formulas are not recalculated.
- Individual sheet errors do not prevent selecting another worksheet. Cancel is available while processing.
- Actual customer workbook has not been supplied/tested in this final repair; screenshot is evidence of the prior failure only. Automated tests cover a 270,000-cell sheet, a second small sheet, oversized actual columns, formatting at ZZ60000, CSV handling and Excel roundtrip. Build and TypeScript passed.

## SQL, Excel and Power BI semantics
The saved dataset is the common source. SQL runs in local browser SQLite, not the production app database. SELECT displays results (up to 1,000 rows); UPDATE/INSERT/DELETE preview changes before applying to the sheet. Save sheet changes publishes the result to feeds. Revision checks prevent silently overwriting another saved version.

Power BI/Excel consume authenticated CSV feed URLs. Credential expires in 30 days and can be revoked; Basic username `datalake`, password generated credential, or Bearer for suitable clients. Feed reads require the originating owner still be active. Microsoft connection and scheduled refresh still require setup in those applications. There is no established Microsoft account connection, external SQL Server/Postgres connection or bidirectional Excel writeback. The audit log does not record browser-local SQL or downstream activity on downloads.

## Next work, in sensible order
1. Verify version 53 upload with the user's actual workbook; collect only the exact worksheet/error needed. Don't inflate limits blindly or render the whole file as inputs.
2. Confirm new account can access the same project; preserve owner-only Data Lake and protected customer data.
3. Inspect inventory connection status without exposing credentials; use the owner-only secure form, verify a controlled Wix stock change appears after refresh. Key persists server-side; not needed at each login.
4. Diagnose order delivery without exposing webhook secrets. Previous checks were blocked by approval/network policy. Don't work around those controls. Prove one authorized delivery and reconcile missing records before claiming live orders.
5. Verify online presence across tabs/accounts and last-seen times.
6. Complete/test requested notifications and scan behavior, then design shared stock synchronization with exact product/variant mappings.

## Earlier comparison values (do not hardcode as current analytics)
Main Wix Sales dashboard screenshot: September 15, 2025–September 14, 2026; all locations; 13,567 orders, $519.47 average order value, roughly $7M rounded sales. The user chose direct Wix analytics instead of further custom reconciliation. Dashboard URL is in lib/wix-sites.ts.

## Migration boundaries
This ZIP is source plus the tracked product snapshot, not a production backup. For a separate copy, arrange authorized exports/imports of D1 records and R2 objects; preserve attachments/foreign keys and explicitly map old authentication identities. Provision fresh secrets, reconnect external services, update webhook destinations and BI feeds, and test before switching staff. Do not copy platform identity headers into a self-hosted trust model. Do not promote arbitrary new sign-ins to owner to solve access problems.

## Latest addition: portal ownership control (version 53)
Members now offers Transfer portal ownership to the current owner. Recipient must be active, already signed in, and have an email. Owner types recipient email; server checks origin and owner role and atomically swaps recipient to owner and former owner to admin. Both permission overrides reset. Replay by former owner is denied. Tests and production build passed. This DOES NOT transfer hosting, source editing or publishing rights. No ownership transfer was performed by the assistant. The screenshot showed swargjoy@gmail.com as an active portal admin, not a Site editor. The new account intended for independent continuation is swargjoy@gmail.com, but require authenticated verification before assigning owner privileges.
