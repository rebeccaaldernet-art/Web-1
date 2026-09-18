# RA Studio continuation rules

This package is a source handoff, not a production backup. Read the root handoff files and PASTE-IN-GPT.txt. Original source commit: 6a0b7ba3e9adc4bc937b62cba754cec31f108712, version 53. No account authority travels with source files.

Application root is source/. Stack: React/TypeScript, Vinext/Vite, Workers, D1, R2. Retain the architecture and lockfile. This is not an ordinary Next.js Node-server deployment. Node >=22.13.0 and pnpm 11.19.0 are declared. Follow installed Sites skills when using Sites; do not assume old /root/.codex paths exist. source/README.md covers local development and migrations. Clean exports default to portable mode.

NEW project only. Resolve/register its identity using supported tools and replace the historical .openai/hosting.json association before publishing. Keep old portal untouched. Review owner bootstrap migrations before provisioning a new database. Verify authenticated identity; don't trust arbitrary headers or promote the first sign-in. App-level ownership transfer does not transfer platform editing rights.

Preserve server-side role checks, approval requirements, private message boundaries, CSRF/origin checks, revision checks and credential secrecy. Do not use public object storage for customer data. No live credentials or production objects are included. Do not bypass unavailable account/network capabilities.

Latest workbook requirements are in EXCEL-WORKBOOK-REQUIREMENTS.md. They supersede the old single-sheet importer behavior but are not yet implemented. Implement a backward-compatible path for existing datasets, without deleting records, then test with synthetic files. Do not return fake completed status.

Useful checks after dependency install, from source/:
- pnpm exec tsc --noEmit
- node tests/access.mjs
- node tests/lake-file-worker.mjs
- pnpm run build
Run other focused checks when their functionality changes. Test real auth and permissions separately on the new deployment. Tests are not proof that external integrations work.

Never deploy or migrate customer records without authorized destination access. If independent hosting is chosen, replace Sites-dependent authentication with a verified signed-token provider and provision real bindings; this conversion is not preimplemented in this package. No need to modify the original site to prepare the new one.
