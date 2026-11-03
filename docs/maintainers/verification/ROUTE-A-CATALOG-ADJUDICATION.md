# Route A — tenant extraction and catalog adjudication

Prepared 2026-09-08 for the R3 verification contract (2026-09-08). Use this operator sequence with [the tenant-session worklist](../../TENANT-SESSION-WORKLIST.md) and complete a per-change decision record below. No extraction, tenant test, catalog promotion or remote write has been performed during preparation. The maintainer runs the tenant work in an authorized delivery session; catalog replacement and deployment require their separate decisions.

## Scripted path for steps 1-5

`docs/maintainers/verification/route-a-session.ps1` automates baseline hashing, extraction, the completeness audit and both diffs, and reports which controls became newly describable — including any `dump_sourced` entry that must now be **retired** rather than expanded. It is read-only against tenant and repo, refuses an output directory inside the repository or one that already exists, and stops before adjudication.

```powershell
pwsh -File docs\maintainers\verification\route-a-session.ps1 -ReviewRoot C:\tmp\catalog-review-<date>
```

Environment and app default to the source recorded in the committed manifest, so a re-run is a same-tenant, same-cluster comparison and every difference is a genuine platform change. Steps 6-7 below stay manual: they need per-change decisions.

## Operator sequence

1. **Capture the baseline privately.** Record the AppForge commit and exact SHA-256 hashes of `catalogs/control-manifest.yml`, `catalogs/control-properties.yml`, `catalogs/control-augmentations.yml` and `disproofs.md`. Preserve their exact bytes in a new private review directory before running anything. Include `disproofs.index.json` when the accepted R3 implementation supplies it. Read `extracted_at` and current counts from the files; do not carry forward the old worklist's relative age, dump-control count or unresolved-property list.

2. **Confirm the delivery session.** The extractor starts its own canvas-authoring MCP process through `dnx`; it does not reuse AppForge's HTTP bearer token or an already connected MCP transport. `dnx` must be available and the delivery session must already have working canvas-authoring authentication. Confirm these process environment variables without printing or recording their values:

   | Variable | Actual extractor contract |
   |---|---|
   | `CANVAS_ENVIRONMENT_ID` | Required; absence exits 1 before extraction. |
   | `CANVAS_APP_ID` | Required; absence exits 1 before extraction. |
   | `CANVAS_CLUSTER_CATEGORY` | Defaults to `prod` if omitted. Confirm the correct delivery cluster; the script documents `prod`, `gov`, `high`, `dod`, `china`, `test` but does not validate this enum. |

3. **Extract into a fresh directory.** The actual invocation is one positional output directory, with no `--out` flag:

   ```powershell
   $appForgeRoot = 'C:\path\to\appforge'
   # Replace with the private review directory established in step 1.
   $catalogReviewRoot = 'C:\path\to\private\catalog-review'
   $freshCatalogDir = Join-Path $catalogReviewRoot 'fresh'
   if (-not (Test-Path -LiteralPath $catalogReviewRoot -PathType Container)) {
     throw 'Prepare the private review directory and baseline first.'
   }
   if (Test-Path -LiteralPath $freshCatalogDir) {
     throw 'Choose a fresh extraction destination; existing output is not safe to reuse.'
   }
   if (-not $env:CANVAS_ENVIRONMENT_ID -or -not $env:CANVAS_APP_ID) {
     throw 'The authorized delivery environment is missing required CANVAS variables.'
   }
   node (Join-Path $appForgeRoot 'cli\extractor.mjs') $freshCatalogDir 1> (Join-Path $catalogReviewRoot 'extractor.stdout.log') 2> (Join-Path $catalogReviewRoot 'extractor.stderr.log')
   if ($LASTEXITCODE -ne 0) { throw 'Extraction failed; inspect the private logs before proceeding.' }
   ```

   The script creates its output directory recursively and overwrites the two fixed YAML filenames if they already exist. Never point it at the committed `catalogs` directory; omitting the positional argument defaults to `./catalogs` relative to the process cwd. It calls `list_controls` and `describe_control`, not `compile_canvas`. It writes `control-manifest.yml` and `control-properties.yml`. The manifest contains environment/app identifiers, so keep the raw capture and logs in the private delivery workspace; shared review notes contain counts, hashes and catalog rule/control names only, with no environment values or customer formulas.

4. **Audit extraction completeness before accepting differences.** Record `controls_total_in_tenant`, `controls_in_this_file`, `controls_skipped`, `is_partial` and both output hashes. Require plausible nonzero output and reconcile kept plus skipped counts. Retain every skipped-control reason and parser/enum warning for review. A detected claimed-versus-parsed list-count mismatch exits 2, but skipped `describe_control` failures and parser warnings can still end with successful file output. Exit 0 is therefore not a completeness verdict. A missing control/property in a partial or suspicious capture is not evidence of platform removal.

5. **Compare exact old and fresh YAML files.** Use an ordinary file diff, for example `git diff --no-index -- <old-file> <fresh-file>` separately for the manifest and properties file. Exit 1 means differences were found; it is not an extraction failure. Keep these raw diffs private because the manifest contains tenant identifiers. Classify every addition, removal, property type/direction change, enum change, parent-context change and variant change in the decision table below.

   `node cli/diff-catalogs.mjs <baseline-directory> <fresh-directory>` compares two extracted YAML catalog snapshots and writes `cli/diff-report.md`. It reports control, property and variant differences. Its report is a review aid; use the retirement audit and release gate before accepting the fresh extraction. Run it from the repository root.

6. **Adjudicate the evidence, then test a candidate in isolation.** Obtain the maintainer's decisions for newly reachable dump controls, observation-tier changes and property promotions. Preserve unrelated augmentations and comments; never hand-edit extractor-generated manifests/properties to manufacture the desired result. If a dump control is newly reachable, plan its exact overlay retirement together with the generated replacement; the build gate rejects overlap, but the gate does not grant approval to retire it. An omitted observed variant does not establish mandatory migration or disprove its continued acceptance.

   Stage only the reviewed candidate changes in an isolated AppForge checkout/copy. From that candidate's `server`, run `npm.cmd run release:check` serially; it builds catalog/core, runs both test pools, type-checks and runs the corpus. Supply only already authorized external corpus roots and record skipped real fixtures explicitly. Adjudicate every intended corpus difference before regeneration; never blanket-rebaseline a refusal change. Re-survey the authorized acceptance app with this exact candidate artifact, recording counts/rule IDs and retained/new/resolved findings without copying private source. Compare existing REFUSEs separately. Passing software gates does not establish tenant compilation or visual behavior.

7. **Publish only after the separate release decision.** Present the candidate diff, before/after hashes, evidence record, remaining unknowns, gate results and exact promotion/retirement requests. Keep primary catalog replacement, merge/push and deployment pending their applicable approvals. Update release documentation/control counts from the accepted artifact, not from an expected count. Remote queue stamps are separate authorized actions: mixed outcomes or incomplete key-to-claim coverage remain open under R3. No legacy queue stamp is property-promotion evidence.

## Claim worklist to reconcile with the fresh capture

| Question | Required observation and falsifier | Decision boundary |
|---|---|---|
| `TypedDataCard.Default`, `Update`, `MaxLength` | Check fresh extractor coverage. For any remaining manual additional-property claim, validate a minimal case and obtain the matching accepted tenant compile result; a relevant rejection of that exact claim falsifies it. | Current entries are unverified hypotheses backed by recorded Studio emission. Additional-property `verified: true` requires the exact compile evidence; do not infer it from extraction success or another property's compile. |
| Observed unprefixed `TypedDataCard` variants | Compare the actual `describe_control` variant list with the exact observed names. If still absent, distinguish continued acceptance from mandatory Studio migration using the recorded variant falsifier. | Presence can support a reviewed extraction-tier change. Absence alone does not retire the observation tier; the maintainer decides the exact case. |
| Previously unreachable controls, including the old Arrow/DataCard/FluidGrid questions | Reconcile each name with the fresh skipped list. If still unreachable, an authorized Studio insert/export can establish emitted existence and properties; inability to insert or absence from that export leaves the question open. | Fresh dump evidence is a lower bound, not an exhaustive property list or a compile stamp. Do not preserve historical counts or add/retire controls automatically. |
| `Classic/Icon` accessibility properties | Reconcile current extractor/dump data first: `AccessibleLabel` already appears in the committed dump lower bound; the old claim that both it and `TabIndex` are missing is stale. Use property-specific minimal compile cases for any requested stronger verification. | Retain the actual evidence class. Do not add an augmentation or promote a whole property family from one successful case. |
| SQL `IsBlank` and SharePoint query claims | SQL requires the R3 runtime falsifier: identified connector/environment, configured nondelegation limit, qualifying controlled rows beyond that limit, expected full result, observed result and available delegation/monitor evidence. Frame SharePoint's exact expression/column type separately and check the disproof register first. | Compile acceptance tests syntax only; a missing design-time warning does not prove delegation. No automatic rewrite or disproof reversal. |

Keep the remaining locale, paste, materialization and other historical worklist questions pending until their original claims and current implementation are reconciled. This worklist does not claim to have settled them.

## Per-change adjudication record

| Field | Record before approving the candidate |
|---|---|
| Identity | Exact control/property/variant or scoped rule claim; preserve generation boundaries. |
| Baseline and candidate | Source commit; old/new file hashes; precise diff location. |
| Change and completeness | Addition/removal/type/enum/variant/context change; skipped/partial-capture qualifications. |
| Evidence | Extraction, Studio export, compiler result or structured runtime observation; private evidence reference/hash; claim scope and environment reference without publishing its values. |
| Falsifier and result | Exact discriminating test; actual result or **pending**; setup/transport errors remain inconclusive. |
| Disproof/overlay impact | Exact existing register/index match, augmentation target, dump overlap or observation-tier decision. Never silently reverse a disproof. |
| Decision | Accept candidate / reject candidate / needs evidence; the maintainer's specific promotion/retirement decision where required. |
| Verification | Candidate build/tests/corpus/real-app results, intentional differences and skipped checks; tenant compile/visual checks still needed. |

Source check: [extractor](../../../cli/extractor.mjs), [catalog snapshot diff](../../../cli/diff-catalogs.mjs), [current augmentations](../../../knowledge/catalogs/control-augmentations.yml), [verification doctrine](../../../knowledge/VERIFICATION-DOCTRINE.md). Reviewed statically on 2026-09-08; none of these operator commands was executed during preparation.
