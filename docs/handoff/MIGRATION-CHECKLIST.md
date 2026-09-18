# Existing-data migration checklist

Status: no production data export is included. This file describes the required transfer, not a completed backup.

An authorized operator with access to the original deployment must produce a consistent export of business records and their referenced objects. Obtain it before deleting the old account. Use supported export/storage tools; do not bypass project authorization.

## Records and files
- Members, roles, approval settings, channels and permissions. Map authenticated identities explicitly to the new deployment; old Site-specific user IDs will not automatically match.
- Channel messages, private conversation participants/messages, attachments, pins, read/unread and mention relationships. Protect private conversation membership.
- Stored orders, site mapping, import progress and any manual classifications. Existing import is incomplete; an export does not fix missing Wix orders.
- Inventory reference-photo metadata, image objects and signature data. Historical product snapshot is already in source.
- Data Lake dataset metadata and current workbook objects, revisions as needed, and access history. Issue fresh feed credentials under the new owner; reconnect Power BI/Excel.
- All referenced uploaded-file objects with original metadata/content types.

Do not carry over active bearer tokens, credential secrets or old login sessions as ordinary data exports. Reconfigure secrets securely and revoke old integrations only after cutover has been verified.

## Import and acceptance
1. Inspect the fresh schema and migration order; avoid duplicating bootstrap records.
2. Import records preserving primary/foreign-key relationships, timestamps, ownership and file references.
3. Restore objects and verify bytes/checksums and content types.
4. Reconcile per-table counts and object counts/sizes against the export, reporting omissions.
5. Test owner/admin/member and private-message access with real authenticated accounts.
6. Open representative old messages, attachments, orders and workbooks from the new portal.
7. Reconnect Wix callbacks to the new URL, verify one authorized update, and restore BI feeds with fresh credentials.
8. For data written after the first snapshot, arrange a final incremental transfer or brief planned cutover window; do not silently lose ongoing messages.
9. Confirm the new account can edit, publish and administer the new project. Only then consider closing the old account.
