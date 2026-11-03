# Contributing to AppForge

## What's in this repository

```text
server/             MCP server, shared analyzer, builds and tests
cli/                Command-line validator, survey, corpus and maintainer tools
knowledge/          Rules, catalogs, templates, personas, examples and Power Fx
docs/               User guides
docs/maintainers/   Catalog and rule design, verification and acceptance records
skills/             Assistant workflows
.claude-plugin/     Plugin and marketplace configuration
.github/            Issue forms and repository configuration
CHANGELOG.md        Product release notes
```

Bring a focused change, its reason, and evidence that supports it. For a finding
without a patch, use the field-report format below or the
[issue forms](https://github.com/quantumdread/appforge/issues/new/choose).

## Development setup

Install Node.js 20 or later. From a clone of the repository:

```sh
cd server
npm ci
npm run release:check
```

`npm ci` installs the locked development dependencies. The release gate runs
serially: catalog build, core build, local MCP bundle build, Worker tests, Node
tests, TypeScript checking, then the acceptance corpus. It stops at the first
failure and performs no install or deployment.

The gate reports optional fixture configuration. External corpus roots come from
`APPFORGE_CORPUS_EXTERNAL_ROOTS`, separated by `;` on Windows or `:` elsewhere.
A configured root that does not exist fails the gate. Real archive fixtures use
`APPFORGE_REAL_MSAPP` and `APPFORGE_REAL_SOLUTION`; set
`APPFORGE_REQUIRE_REAL_SURVEY=1` when their coverage must be required.
Keep these inputs outside this repository.

## Corpus and rule calibration

The corpus is under `cli/corpus/`.
Its manifest includes isolated synthetic apps, rule coverage fixtures, AppForge
templates, analyzer fixtures, and unchanged Microsoft Studio template screens.
Optional external roots are read in place; their source is not copied here.

The gate checks pinned golden results and expected-rule coverage. Microsoft
templates supply a separate calibration: for each rule, WARN occurrences divided
by the total first-party control count must be at most 25%, using the Worker
profile. Multiple WARNs on one control count separately; there are no exemptions.

When the corpus reports a discrepancy:

1. Inspect the exact old and new findings and decide whether the change is intended.
2. Fix regressions in source rather than approving them as expected output.
3. For an intended difference, add its reported identity to `adjudications.json`
   as `{ "reference": "<path>#<heading>", "note": "<reason>" }`.
4. Reference an existing `docs/maintainers/design/*.md` heading or a heading in
   `CHANGELOG.md`. The validator matches
   heading text, not a GitHub slug; copy the heading text after `#`.
5. Rerun `npm run release:check`. Uncovered differences, unused adjudications,
   missing expected-rule coverage, or failed calibration fail the gate.

## Evidence and verification

Follow the [verification doctrine](knowledge/VERIFICATION-DOCTRINE.md).
Never set `verified: true` from reasoning, a unit test, or an apparently plausible
property name. Default new lint rules to WARN until compiler evidence justifies
a refusal.

| Evidence class | Meaning and permitted use |
|---|---|
| `compile_canvas` | Measured compile round-trip evidence; required to promote an additional input property to `verified: true`. |
| `studio-export-<date>` | Studio emitted the control or property. These lists are lower bounds because exports omit defaults. |
| `runtime_observation` | Observed Studio or player behavior. Record scope, environment, reproduction, and a falsifier; it cannot promote a catalog property. |
| Inferred | A hypothesis to investigate, without a verification stamp. |

Record rejected claims in
[disproofs.md](knowledge/disproofs.md).
The [campaign procedure](docs/maintainers/VERIFICATION-CAMPAIGNS.md) separates preparation,
evidence collection, review, local application, and remote queue stamps.

## Generated files

Never hand-edit these outputs:

- `knowledge/catalogs/control-manifest.yml` and
  `control-properties.yml`: regenerate with `cli/extractor.mjs`.
- `server/src/generated/`: regenerate with `npm run build:catalog`.
- `cli/dist/analyzer-core.mjs`: regenerate
  with `npm run build:core`.
- `server/dist-local/appforge-mcp.mjs`: regenerate with
  `npm run build:local`.
- `server/worker-configuration.d.ts`: regenerate with
  `npm run cf-typegen`; preserve its licence header.

Run the npm commands from `server`. The two bundles are committed
so users can run them without installing dependencies. Make catalog additions in
`control-augmentations.yml` with evidence, and implement analysis semantics in
`server/src/core/`; adapters share that core.

## Applying source with compile_canvas

`compile_canvas` belongs to Microsoft's canvas-authoring tooling. It applies
source even when validation reports failure. Treat every invocation as a tenant
write requiring explicit authorization; use an isolated scratch app for probes.

Run AppForge's `validate_yaml` first. Any REFUSE is a hard stop: correct it and
retry validation. AppForge validation is a local source check, not a tenant compile.

A partial source folder deletes omitted screens. Start from a complete, freshly
synced folder and review the entire intended source before applying it.

After inserting controls, save in Studio, sync fresh source, and compare child
order and control types with the intended source. Repeat authorized compiles
while `compare_child_order` reports `reordered`.

Never resume an expired Studio session after a compile: it can overwrite the
server with older local state. Reload the app fresh instead.

After bulk renames, inspect every screen's Studio tree for leftover temp-named
controls. They can render while remaining absent from `sync_canvas`; reloading
or compiling again may not remove them. Use a fresh temporary suffix for each
rename operation and remove leftovers in Studio before saving.

## Field reports

Report mismatches between AppForge and Microsoft validation, unknown control
types or properties, tool behavior that can lose work, and useful results from
bisection. Include candidates ruled out as well as the surviving explanation.
Use one block per finding:

```text
FINDING: <one sentence describing the fact>
KIND: catalog-gap | false-refuse | false-warn | missing-rule | tool-behaviour | doc-error | migration | method
EVIDENCE: compile | studio | visual | inferred
  <exact sanitized diagnostic, Studio export observation, visual confirmation, or hypothesis>
REPRO: <minimal synthetic steps or source shape; generic names only>
EXACT NAMES: <control type, variant, property keys, enum values, and counts>
STATUS: confirmed | suspected | ruled out
  <how the result was established or rejected>
APPFORGE SAID: <tool, rule id, verdict, and sanitized message; or "nothing">
ENVIRONMENT: <relevant tool/platform versions, without tenant or app identifiers>
FALSIFIER: <observation that would disprove the finding>
```

The report's evidence labels describe what was observed; they do not grant
catalog verification. For `report_issue`, select its corresponding accepted
label: `compile_canvas`, `studio_observation`, `visual`, or `inferred`.
The tool's `studio_observation` label is an issue intake label, distinct from
the catalog evidence stamps above.

Use `/appforge:report-issue` in Claude Code or the `report_issue` MCP tool to
prepare a report. The tool returns a prefilled URL and Markdown without sending
a request. Review the content before submitting it. Broader field-report kinds
can use the issue form's `other` category.

The maintainers assess findings at their supplied evidence level. A suspected
claim belongs in review or the verification queue until measured evidence
supports a stronger claim.

## Containment for issues and pull requests

No customer data belongs in issues, PRs, fixtures, reports, or screenshots.
Share process facts: control types, property keys, variants, enum values, counts,
sanitized platform diagnostics, and minimal synthetic reproductions.
Remove customer, company and person names, instance names from real apps,
formulas and labels from customer apps, data values, internal URLs, tenant and
app identifiers, local paths, and source hashes. Recreate the issue with generic
names and invented data. Keep original exports and raw evidence private.

## Commits and pull requests

Use a short imperative subject describing the behavior changed, for example
`docs: explain local MCP setup` or `fix: preserve variant evidence`.
Keep each commit focused. In the PR, explain the trigger, resulting behavior,
evidence, and checks run, including skipped coverage. Link the relevant public
issue or design document. Consult [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)
when adding material from another source.
