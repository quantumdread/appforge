# Survey findings by exact catalog version

This offline report answers: **which rule ids contribute the most reported finding counts across accepted survey submissions, grouped by exact catalog version?** A finding count is the envelope's deduplicated-fingerprint count. It is not a count of unique apps or users, raw lint occurrences, or confirmed defects. Catalog run totals are not per-rule opportunity denominators.

## Capture one complete cell

An operator with at least **Workers Platform Admin** access opens the deployed Cloudflare Durable Object namespace, selects **Data Studio**, and selects the object by unique name **`stats:survey`** or its id. Data Studio supports the SQLite-backed object used here. In the **Query** tab, run only the single statement in [export-survey-aggregates.sql](../../server/scripts/sql/export-survey-aggregates.sql). Each statement is sent as a separate request; keeping this capture to one read-only statement provides a coherent view of the aggregate table. [Cloudflare Data Studio documentation](https://developers.cloudflare.com/durable-objects/observability/data-studio/), [SQLite storage API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/).

Copy the **complete `export_json` cell** into a local UTF-8 file without editing it. The SQL builds the closed `survey-aggregate-export/1` object, records `captured_at`, asserts `complete_snapshot: true`, and casts each count to text **inside SQLite**, before any UI or JavaScript numeric conversion. An empty table produces `rows: []`. Keep the original capture for review. No Data Studio file-export button or Wrangler SQL export command is assumed.

The query has been exercised against local SQLite with an empty table and signed-64-bit values, and the resulting cells passed through the CLI. No live Data Studio access or capture was performed. Account access and copying a complete cell remain to be observed on the first authorized capture. `complete_snapshot` is the operator's assertion; the reader cannot authenticate a capture or detect every coherently edited omission.

## Read the capture locally

From `server`:

```powershell
node scripts/read-survey-aggregates.mjs 'C:\local-evidence\survey-aggregates.json'
node scripts/read-survey-aggregates.mjs 'C:\local-evidence\survey-aggregates.json' --json
```

The reader only reads that local file and prints a report. It does not fetch data, execute SQL, inspect credentials, change catalogs, or submit telemetry. Exit `0` means a report was produced, `2` means invalid usage or export, and `3` means the local file could not be read. Failures produce no report on stdout.

Input fields are exactly `schema`, `captured_at` (a calendar-valid UTC timestamp in the query's `YYYY-MM-DDTHH:mm:ss.sssZ` format), `complete_snapshot`, and `rows`. Each row contains exactly `metric_key` and `count`. Counts should be canonical nonnegative decimal **strings** through `9223372036854775807`; safe nonnegative integer JSON numbers are also accepted. Unsafe numbers are rejected, even if they look close to a valid integer. Duplicate metric keys, extra fields, malformed relevant keys, inconsistent totals and partial snapshots are rejected. Relevant encoded segments must round-trip through `encodeURIComponent` exactly, including uppercase percent escapes. The reader retains historical catalog/rule identities without requiring today's generated catalog.

## Interpret the result

The `survey-aggregate-report/1` JSON report has `global`, `catalogs`, `legacy_unattributed`, and `ignored_metric_rows`. All finding/run counts are decimal strings, computed with BigInt. Catalogs sort lexically by their complete identity; rules sort by finding count descending, then rule id. Zero-finding cohorts remain visible with an empty rule list. The report does not present an affected-run percentage.

Future accepted submissions add `survey:cohort:v1:catalog:<encoded exact catalog>:runs` and `survey:cohort:v1:catalog:<encoded exact catalog>:rule:<encoded rule id>`. Existing global and marginal metrics remain unchanged. The existing id/digest deduplication and single SQLite transaction cover old and new counters together; duplicates and conflicting/rejected submissions add neither. No new table, binding, migration, administrative route, or backfill is involved.

For a complete capture, `legacy_unattributed` subtracts summed cohort counts from each global rule count, and summed cohort runs from global accepted runs. These residuals are the totals that lack this cohort instrumentation; they cannot be assigned to catalog versions. The reader also requires runs to exist for positive findings in each of the global, cohort and residual groups. Legacy-only data says **“No attributable rule-by-catalog data”** while retaining honest global totals. Catalog-version marginals, opportunities, and unknown metric families are counted only as ignored rows; their keys are not copied into the report and are never used to infer historical joint distributions.
