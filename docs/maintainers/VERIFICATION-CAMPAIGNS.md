# Verification campaigns and errata

These local commands prepare review packages, apply a named reviewed plan, or
perform separately authorized queue stamps. They do not run `compile_canvas`,
authenticate a tenant result, or authorize a catalog decision. Keep raw queue
captures, result files and tenant transcripts in a private working directory.
Only reviewed synthetic repros and non-sensitive summaries belong in this repo.

The exact local JSON formats are validated by
[`verification-contracts.mjs`](../../server/scripts/lib/verification-contracts.mjs);
[`verification-evidence.mjs`](../../server/scripts/lib/verification-evidence.mjs)
classifies evidence. These `/1` formats are local files; they add no MCP tool or
response field. Read the [verification doctrine](../../knowledge/VERIFICATION-DOCTRINE.md)
before collecting evidence.

## Prepare a campaign

From `server`, with an already captured queue and reviewed recipes:

```powershell
node scripts/verification-campaign.mjs --queue C:/private/queue.json --recipes ../../docs/maintainers/verification/recipes/2026-09-08-queue-hypotheses.json --out C:/private/campaign --date 2026-11-03
```

Use a new output directory on each invocation. `manifest.json` pins source files,
the installed analyzer artifact, inputs and exact repro bytes. The worklist records
pending cases, prerequisites and unmapped or ambiguous queue rows. Counts prioritize
work; a bounded queue listing is not a complete queue or a count of distinct apps.
The bundled literals are hypotheses. Their absence from a dump lower bound is the
reason to test them, not evidence that they are invalid or compiler-verified.
Keep the full package private when queue keys contain custom component/property
names. Publish only reviewed synthetic repros and a summary; redacting the full
manifest would break its identity and result bindings.

The local gate uses the installed CLI profile. It does not replace the delivery
tenant's validation or compilation. Repro, ancestor, property or binding changes
require a regenerated and reviewed case before collecting evidence. SQL compilation
establishes only a compiler subclaim; delegation requires the separate controlled
runtime falsifier. Incomplete aggregate-key coverage stays open even when a case
settles.

The maintainers execute the generated worklist in an authorized tenant session
and supply `verification-results/1`. Include exact claim/repro/context
hashes, actual evidence-file digests and completed tenant prerequisites. Results
are cumulative for that campaign. Collect the intended compiler batch before
applying; after a catalog change, further new evidence needs a rebuilt, regenerated
and reviewed campaign. Keep earlier packages and pending results.

## Review, apply and stamp are separate commands

```powershell
node scripts/adjudicate.mjs --campaign C:/private/campaign/manifest.json --results C:/private/results.json --queue C:/private/queue.json --rules-root ../knowledge --out C:/private/review --acknowledge-maintainer-evidence
node scripts/adjudicate.mjs --apply-local C:/private/review/edits.json --rules-root ../knowledge --acknowledge-maintainer-evidence
```

Review writes `RESULTS.md`, `edits.json`, `review-context.json`, candidate replacement
files and a derived `queue-snapshot.json`. Snapshot stamps are proposals against the captured counts;
they do not prove local application or refresh the live queue. Pending, blocked,
mixed-outcome and incompletely covered keys stay open. Raw unknown queue fields are
preserved only in the private machine-readable snapshot.

Set `APPFORGE_MAINTAINER` to the evidence producer's marker before review, apply,
or stamping. Missing, empty, or whitespace-only configuration fails closed for
catalog changes. For example, in PowerShell:

```powershell
$env:APPFORGE_MAINTAINER = 'maintainer'
```

Use that exact value in the results' `produced_by` field. Do not publish raw
results or personal evidence markers in public reports.

Property promotion/removal requires matching measured `compile_canvas` evidence,
a `produced_by` marker exactly matching the configured `APPFORGE_MAINTAINER` and explicit acknowledgement. The marker is
an operator assertion, not authentication. Historical disproofs block conflicting
changes for the maintainer's review. Dump-property and observed-variant results remain
proposals for the required per-claim decision. No runtime or Studio-export evidence
is upgraded to compiler evidence.

Apply checks every source, artifact and supplied evidence pin, reconstructs the
permitted changes, and replaces only allowlisted files. Existing property metadata
is preserved; promotion changes the verification stamp, with complete new evidence
retained in the plan. New properties require a known control, a recognized type and
an existing unambiguous additional-property block. Other shapes require review.

There is no transaction across files. A later write failure reports completed files;
resume the same reviewed plan against exact before/after hashes. Any unrelated drift
fails. Do not edit plan hashes or replacement bytes to force a replay. A successful
local apply is still followed by the repository's build and release checks before
any separately authorized deployment.

Only after per-instance authorization, remote stamping uses full context:

```powershell
node scripts/adjudicate.mjs --stamp-remote --campaign C:/private/campaign/manifest.json --results C:/private/results.json --queue C:/private/queue.json --rules-root ../knowledge --edits C:/private/review/edits.json --out C:/private/stamp-review --acknowledge-maintainer-evidence
```

Stamping first verifies the already-applied state; it cannot apply local edits.
The result author must exactly equal the reviewed plan author. Each key is freshly
read, unknown live fields are preserved, and the current count is stamped. Exact
same-author/outcome/count replays are idempotent; conflicting adjudication or a
changed replay count requires fresh review. `REMOTE-STAMPS.md` and the completion
report retain per-key progress after a partial failure. The existing KV get/put
boundary is best effort, without compare-and-swap; use a quiescent write window if
strict concurrent-field preservation is required. The legacy positional
adjudication command is not property-promotion evidence.

Keep `review-context.json` beside its reviewed `edits.json`. It binds the exact
campaign, cumulative results, queue capture and edits bytes, including reviews with
no property replacements. Changed or newly added results need a fresh review
package; missing or mismatched context refuses before any remote attempt.

## Ingest local errata

```powershell
node scripts/ingest-errata.mjs C:/private/errata.json --rules-root ../knowledge --out C:/private/errata-review
node scripts/ingest-errata.mjs --apply-local C:/private/errata-review/edits.json --rules-root ../knowledge
```

`appforge-errata/1` accepts an additional-property add/promote proposal or a scoped
observation in `troubleshooting.md` or `powerfx-reference.md`. Add the same
`--acknowledge-maintainer-evidence` flag to both commands for compiler-backed property
changes. `ERRATA.md` states each decision; ingestion alone changes no source file.
Observation records visibly retain scope, evidence class, environment,
reproduction and falsifier. Runtime and dated Studio-export evidence can document
an observation, while unverified property hypotheses remain pending. The expired
`studio-observation` input alias is rejected; historical catalog parsing is unchanged.

Duplicate identities, unknown targets, unsupported types, stale evidence, disproof
conflicts and arbitrary paths cannot become automatic catalog edits. Exact repeated
observations are idempotent; a reused ID with different evidence is a conflict.
Errata has no remote queue mode.

Each CLI provides `--help` without needing input files. The separate
[survey aggregate reader](SURVEY-AGGREGATE-EXPORT.md) and
[Route A catalog checklist](verification/ROUTE-A-CATALOG-ADJUDICATION.md) cover the
related operator workflows.
