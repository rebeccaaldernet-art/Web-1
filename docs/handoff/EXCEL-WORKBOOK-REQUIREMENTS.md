# Required next change: one workbook, many worksheet tabs

Status: specification for implementation. Included source still saves selected worksheets as separate datasets. Do not describe the specification as working code.

## Data and import
- User selects .xlsx or CSV. Parse in a Web Worker using existing ExcelJS/Papa Parse dependencies.
- Keep one workbook ID, name, timestamps, revision and ordered sheet list with stable IDs and original names. Each sheet holds columns and rows with consistent primitive/date serialization. CSV is a one-sheet workbook.
- Save worksheet JSON and a workbook manifest in private R2; keep metadata/current revision in D1. Internal multiple objects must appear as ONE workbook in the UI.
- Stage and validate all sheets before committing the workbook as complete. Failed/abandoned imports must not show as successful; report offending sheet names and clean up staging objects.
- Apply server validation and owner-only authorization to every operation. Do not use localStorage as the durable database or public object URLs as authorization.
- Treat first populated row as header, matching current data-table design. Preserve data without silent truncation; explain invalid/duplicate headers, cached formulas without results and unsupported Excel features.
- Ignore formatting-only empty areas. Start with existing 5 MB file, 50,000 populated data rows, 100 columns and 7 MB extracted JSON per sheet. Remove no safeguards blindly; set a documented total workbook budget and staged API requests. Do not restore the old 250,000 aggregate cell cap.

## Editing and export
- Workbook selector plus worksheet tabs; switch sheets without losing edits. Bounded/virtualized visible cells; background file work, progress and cancel.
- Revision-checked persistent saves with conflict handling. Reopening after refresh must restore saved sheets and ordering.
- Export all current worksheets as one generated .xlsx. CSV exports only selected sheet. Distinguish reconstructed data export from unchanged original: styles, charts, macros and formula recalculation are not guaranteed.
- Workbook deletion removes all its sheets/objects and revokes associated feed credentials with clear confirmation and retry handling.
- Preserve old single-sheet datasets through a non-destructive schema/data upgrade path when existing records are imported.

## SQL and external feeds
- Select workbook and sheet for SQL; maintain explicit preview/apply/save for changes. Only published saved revision is read by external feeds.
- Keep scoped expiring/revocable read-only feeds for Power BI/Excel; external connection setup remains separate. Do not expose unrestricted SQL against the app database.

## Acceptance
Test a 3-sheet workbook, names/order, types/blanks/dates/cached results, formatting beyond actual data, a >250,000-cell supported sheet, oversized sheet rejection with no false complete import, cancellation, save/reload, edit/reload, all-sheet export, concurrent revision conflict, deletion/re-upload, and signed-out/member denial. Use synthetic data. Report actual evidence and limitations before publishing.
