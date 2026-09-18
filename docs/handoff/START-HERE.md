# RA Studio — GPT source and continuation package
Prepared September 18, 2026. Source snapshot: version 53.

Upload this ZIP to the NEW ChatGPT account in a conversation with coding/file tools. Paste the contents of PASTE-IN-GPT.txt, or say:

> Read START-HERE.md and execute PASTE-IN-GPT.txt. Use the supplied source to build my new RA Studio portal under this account. Preserve the existing features and implement the workbook requirements in EXCEL-WORKBOOK-REQUIREMENTS.md.

This package includes the complete tracked application source, not just a prompt. source/ contains the frontend, backend routes, schema/migrations, static libraries, dependency lockfile, regression checks and historical product snapshot. AGENTS.md gives the coding assistant project instructions. setup-local.mjs provides a local installation/check helper. HANDOFF.md and TECHNICAL.md record prior work and remaining limitations.

IMPORTANT: the source currently imports one selected worksheet as a separate dataset. Grouping ALL sheets into one workbook is the latest requested change, specified in EXCEL-WORKBOOK-REQUIREMENTS.md; it is NOT implemented in this snapshot. The next GPT must implement and test it before claiming completion.

Production database records, messages, orders, uploaded attachments, workbooks, reference images, credentials and old-account permissions are NOT included. Use MIGRATION-CHECKLIST.md for a separate authorized export/import. The tracked inventory data is a historical snapshot. Do not delete the old account before migration is verified.

The original .openai/hosting.json in source/ records the old project. The new assistant must create a new project owned by the new account and use its actual returned ID; it must not deploy this package against the old association. The package grants no access to the old hosting account.

No live site changes or production data export were made when creating this package. All included original source files are checksummed in SOURCE-MANIFEST.json. Supplemental instructions and the setup helper are separate from the original source commit.
