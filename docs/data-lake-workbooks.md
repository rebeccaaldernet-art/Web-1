# Data Lake workbooks

Implements `docs/handoff/EXCEL-WORKBOOK-REQUIREMENTS.md`: one uploaded Excel file becomes one workbook with all of its worksheets, shown as tabs, editable, saved with revision checks, and exported again as one multi-sheet `.xlsx`.

## Storage

| Where | What |
|---|---|
| D1 `lake_workbooks` | id, name, `state` (`staging` or `complete`), `revision`, `sheet_count`, `bytes`, timestamps, owner |
| D1 `lake_sheets` | id, workbook, `position` (0-based order), original worksheet name, columns, `row_count`, `bytes`, `object_key` |
| R2 `data-lake/<workbook>/<sheet>/<uuid>` | one JSON object per saved worksheet revision (`{columns, rows}`) |
| D1 `lake_tokens.dataset` | a worksheet id; feeds are scoped to one worksheet |

Migration `0016` creates the tables and copies every legacy row of `lake_datasets` into a one-sheet workbook whose workbook id and sheet id equal the old dataset id. Old feed URLs and credentials therefore keep working. The legacy table and its objects are left in place; a legacy workbook's row and object are removed only when the owner deletes that workbook.

## Import

The browser parses the file in `public/lake/file-worker.js` (ExcelJS / Papa Parse). Every worksheet is read in order and the worker posts a progress message per sheet. Sheets that cannot be imported are reported by name with the reason; empty sheets are listed as skipped. Nothing is uploaded until the owner clicks Save.

Saving is staged so a partial import is never listed:

1. `import-begin` creates a `staging` workbook row with the declared sheet count.
2. `import-sheet` uploads one worksheet per request (server validates headers, limits and the workbook budget, then stores the object and row).
3. `import-commit` verifies that positions `0..n-1` all arrived, then flips the workbook to `complete` with a fresh revision.
4. Any failure or cancel calls `import-abort`, which deletes the staging rows and objects. Staging workbooks older than two hours are swept on the next import.

## Budget

| Limit | Value |
|---|---|
| Uploaded file | 5 MB |
| Worksheets per workbook | 25 |
| Populated rows per worksheet | 50,000 |
| Columns per worksheet | 100 |
| Extracted JSON per worksheet | 7 MB |
| Extracted JSON per workbook | 64 MB |
| Request body | 8 MB (one worksheet per request) |
| Header length | 128 characters, unique per sheet (case-insensitive) |

The old 250,000 aggregate cell cap is not used. Formatting-only cells and blank rows are ignored. The first populated row is the header; blank headers become `column_N` and duplicate headers get a numbered suffix, both reported in the import summary. Formula cells contribute their cached result only; formulas without a cached result import as empty and are counted in the summary. Styles, charts, merged cells, macros and data validation are not imported.

## Editing and saving

Worksheets load on demand and stay cached in the page with their edits, so switching tabs never loses work. Save sends each changed worksheet in its own `update` request carrying the workbook revision; the server writes a new object, then updates the sheet row and workbook revision in one guarded batch. If another session saved first, the request returns 409 and nothing changes. Reloading the page restores the saved sheets in their original order.

## Export and feeds

- **Excel**: all worksheets of the open workbook, in order, as one generated `.xlsx`, including unsaved edits shown on screen. Original styles, charts and macros are not reproduced.
- **CSV / SQLite**: the open worksheet only. CSV escapes formula-like cells.
- **Power BI / Excel feeds**: `/api/data-lake/feed/<sheet id>` with a per-worksheet credential (Basic user `datalake`, 30-day expiry, revocable). Feeds serve only the last saved revision.

## Deletion

Deleting a workbook removes all its sheet rows, every stored object under its prefix, its feed credentials and, for migrated workbooks, the legacy dataset row. The call is safe to retry.

## Tests

```
node tests/lake-file-worker.mjs   # parsing, limits, progress, multi-sheet export and roundtrip
node tests/data-lake.mjs          # API: access, upgrade, staged import, conflicts, feeds, deletion
```

Both use synthetic files. They do not prove Power BI or Excel refresh configuration, which is done in those applications.
