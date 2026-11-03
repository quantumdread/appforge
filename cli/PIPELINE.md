# AppForge Generation Pipeline

How Canvas App YAML gets emitted under AppForge.

## Order of operations

```
intent
   ↓
[ planner agent ]                    — decomposes into screens, picks controls/data/aesthetic
   ↓
[ screen-builder agents ] (parallel) — write per-screen .pa.yaml from the plan
   ↓
[ cli/validate.mjs ]    ← THE GATE — classifies every property as PASS / WARN / REFUSE
   ↓
[ compile_canvas ]                   — only reached if the gate passed
   ↓
live studio (visible to user via the open Power Apps Designer tab)
```

The validator runs **before** `compile_canvas`. This is the gate.

## What the gate does

`cli/validate.mjs <working-dir>` walks every `.pa.yaml` and classifies each property usage:

| State | When | What the gate does |
|---|---|---|
| **PASS** | Property is in `control-properties.yml`, OR in `control-augmentations.yml` with `verified: true` | Silent. Counted in the summary. |
| **WARN** | Property is in `control-augmentations.yml` with `verified: false` (the default for new entries) | Emit warning naming the unverified property. Pipeline proceeds. The set of warnings IS the verification queue — usage drives priority. |
| **REFUSE** | Property is in neither catalog source | Stop. Return the `missing-catalog-entry` error block. **Do not call `compile_canvas`.** |

Exit code: `0` when all properties are PASS or WARN; `1` when any property is REFUSE.

## Why a pre-compile gate (vs. post-compile)

`compile_canvas` is authoritative for "does this YAML round-trip cleanly through the schema validator." But it has three weaknesses as a sole gate:

1. **Late.** Errors come back in batches after every screen has been written. With per-control validation up-front, the screen-builder can be told *while it's writing* that a property doesn't exist.
2. **No verification status.** `compile_canvas` is binary — pass or fail. It can't say "this property exists but it's an unverified augmentation, log it for prioritisation."
3. **Live-app side effects.** A successful `compile_canvas` mutates the live coauthoring session. If the YAML is structurally invalid (catalog-wise), there's no reason to push that into the user's studio tab even briefly.

The gate sits between generation and the live session. The gate is local-only; `compile_canvas` is the network call.

## Invocation

### From the command line

```sh
node cli/validate.mjs path/to/working-dir
echo $?    # 0 = clean or WARN-only; 1 = REFUSE present
```

### Microsoft-template calibration

The permanent `cli/corpus/oracle-ms-templates/` root contains only Microsoft's
nine first-party Studio screens, synced 2026-09-20. Its README records provenance;
The capture's own App.pa.yaml is excluded. The corpus runner analyzes these screens as an
independent app and measures every WARN using the complete Worker profile, even
rules absent from the CLI profile. A rule exceeding 25% fails the corpus gate,
naming its count and share. The denominator is real controls; the numerator is
WARN occurrences (multiple warnings on one control count separately). Exactly
25% passes. There are no exemptions, including accessibility rules. The check
also runs before golden regeneration, so goldens cannot bless calibration drift.

### Release corpus roots

Run `npm.cmd run corpus` from `server` with
`APPFORGE_CORPUS_EXTERNAL_ROOTS` set to the current bucketed delivery checkout
(after the 2026-10-02 repository move). Store the absolute path in local environment
configuration; Windows separates multiple roots with semicolons. An unset variable
is a reported external skip. A configured missing root fails the corpus and
`npm.cmd run release:check` with a diagnostic naming that path. Report every
external discrepancy to the release reviewer; do not re-baseline to clear it.

### Compile hooks

The plugin registers `cli/precompile-hook.mjs` before `compile_canvas` and
`cli/postcompile-hook.mjs` after it in `hooks/hooks.json`. Both match
`^mcp__.*__compile_canvas$`, including Microsoft's plugin and manual MCP setups.
They run with `node` and separate path arguments. Their timeouts are 120 and 10
seconds respectively. A consuming host still needs an invocation check there.

Choose the compile gate in `/config` (AppForge compile gate):

- `block` (default) stops compilation on REFUSE findings or validator failures
  with hook exit `2`. Fix the findings or toolchain and retry. If a REFUSE looks
  wrong, use `/appforge:report-issue`.
- `warn` allows compilation even on REFUSE findings or validator failures. It
  sends the assistant the findings and tells the user why compilation continued.
- `off` skips validation and the post-compile reminder. Both hooks are silent.

In `block` and `warn`, WARN-only results allow compilation and ask the assistant
to mention the warnings. Context includes counts and up to 20 finding lines,
with REFUSE findings first. The precompile hook keeps the text report on stderr.
It reads JSON from stdin and uses the current Node executable (`process.execPath`)
to run the validator with `--json`, so an empty `PATH` does not prevent validation.
Malformed payloads, missing `directoryPath`, inaccessible paths, and non-directory
paths are allowed with a note.

The postcompile hook reminds the assistant that compilation changes the open
app even when validation reports errors, and Studio saves automatically. Sync to
a new, empty folder, compare child order and control types, and get the user's
go-ahead before recompiling reordered or retyped controls. Reload an expired
session and never resume it. After bulk renames, ask the user to inspect every
screen's tree for temporary names.

For manual setups, register the hooks in the consuming repo's
`.claude/settings.json` and set `APPFORGE_COMPILE_GATE` to `block`, `warn`, or `off`.
The Claude Code plugin setting arrives as `CLAUDE_PLUGIN_OPTION_COMPILE_GATE` and takes
precedence. Unknown values fall back to `block` with a note. The assistant must
leave changes to the setting to the user.

### Local warning baselines

Baselines are consumer-owned files supported by the local CLI only. The Worker
validator has no baseline argument, state, or suppression surface.

```sh
# Capture the current WARN findings (REFUSE findings are always excluded).
node cli/validate.mjs path/to/working-dir --write-baseline appforge-baseline.json

# Move matching WARNs into a separate accepted section and report stale entries.
node cli/validate.mjs path/to/working-dir --baseline appforge-baseline.json
```

The `--baseline=<path>` and `--write-baseline=<path>` forms are also accepted.
Fingerprints use each file's forward-slash path relative to the enumerated
directory target (or its basename when the target is an explicit file), so the
same baseline is portable across checkouts with the same layout below that
target. A baseline entry requires only a 12-character lowercase hexadecimal
`fingerprint`; `rule`, `file`, and `note` are optional informational strings.

Only WARN findings can be accepted. REFUSE findings remain active, and the exit
code remains `1` whenever any REFUSE is present. Writing a baseline after a run
with REFUSE findings writes the WARNs and prints an exclusion notice. If a
`--write-baseline` target matches no files, the CLI exits `2` and does not create
or overwrite the baseline.

With `--baseline --json`, the output is a run-level object containing `reports`,
`accepted_total`, and `stale_baseline_entries`. Without `--baseline`, JSON keeps
the original plain reports-array shape.

The precompile gate passes no baseline flag. WARN remains non-blocking and is
included in hook context. REFUSE prevents `compile_canvas` in `block` mode;
`warn` allows it and tells the user, while `off` skips validation.

### Renovation survey artifacts

The opt-in `survey` subcommand is a separate analysis surface; it does not alter
the legacy validator or precompile exit policy.

```sh
node cli/validate.mjs survey <directory-or-msapp-or-solution.zip> \
  [--app <solution-app>] [--datasources <json>] [--baseline <json>] \
  [--write-baseline] [--suppressions <json>] [--previous <report.json>] \
  [--emit-datasources-skeleton <new-file.json>] \
  [--profile shared|existing-export] \
  [--report <outside-directory>] [--json]
```

It writes `analysis-report.json`, `report-technical.md`, and one immutable
`envelope-<uuid>.json` into `./appforge-survey` (or the explicit `--report`
directory); `--write-baseline` also writes `analysis-baseline.json`.

`--profile existing-export` explicitly selects export-survey advice. The default
is `shared`; file contents, names and archive/directory layout never select it.
Only complete inline `block-scalar-required` findings with `;{}` outside ordinary
string tokens, no raw `: `, and no locale-ambiguous separators become WARN /
MAINTAINABILITY. Semicolons inside delimiters or doubled executable semicolons
remain REFUSE, as do partial/interpolated formulas and all other REFUSE rules.
The advice concerns formatting for paste, not successful compilation or round-trip
preservation. `validate_yaml` and the precompile gate retain their shared behavior.
The MCP `survey_app` accepts the same optional `profile` enum. Unknown profiles
are usage errors on both surfaces.

The existing `policy.profile_id` records `shared` or `existing-export`; no report
schema version changes. New default reports use `shared` instead of the historical
`default` label, while old reports remain readable. Findings keep their identities;
levels, severity, affected priorities/advice and gate totals reflect the profile.
The minimized envelope still counts distinct fingerprints, so choosing a profile
does not change its rule counts or add profile metadata.

`--emit-datasources-skeleton <new-file.json>` adds a local annotation starter:
each independently collected datasource candidate maps to `"unresolved"`, in
exact name order. Already mapped candidates are included; unused declarations
are omitted. Names are lexical observations, not verified backend connections
or a complete dependency graph; unsupported or partially parsed formulas can
contain sources that the collector cannot name. An empty candidate set emits
`{}`. Change every value to `dataverse`, `sharepoint`, `sql`, `excel`,
`collection`, or `other` before passing the file to `--datasources`.

The skeleton requires an existing writable parent outside the app source tree.
It cannot replace an existing file, an input JSON/archive, a report artifact,
or the report directory's `.appforge-*` locks and recovery files. Paths through
symlinks or junctions are refused. Invalid or colliding destinations exit `2`
before reports are written; filesystem denial and runtime failures exit `3`.
Normal reports are published first, then the skeleton is
exclusively created; if that last write fails, exit `3` explicitly states that
reports may already exist. Those reports and any competing destination remain
intact. Retry with a fresh skeleton destination. This additional file does not
participate in report recovery, and stdout keeps its normal report bytes.

Exit codes are a closed table and differ from the legacy gate's `0/1`:

| Exit | Meaning |
|---|---|
| `0` | The survey completed. Findings — including REFUSE-level and BLOCK-severity findings — and invalid suppression rows are report data, not failures. |
| `2` | Usage or configuration: unknown/duplicate/valueless flags, `--app` outside solution intake, no app source at the target, unreadable or malformed option JSON, an invalid baseline or previous report, `delta-comparison-refused`, a conflicting implicit output directory, or a submit-envelope preflight refusal. Nothing is written. |
| `3` | Infrastructure: archive/dialect/zip safety, analyzer/report/envelope invariant violations, recovery-journal or output failures, and (for `submit-envelope`) network, server, or report-update failures. |

#### Comparing two surveys (`--previous`)

`--previous <report.json>` adds a `delta` section. Comparison is refused
(exit `2`, `delta-comparison-refused`) unless the previous report agrees with
the current run on all three of:

- the fingerprint formula (`finding-fingerprint/2`),
- `identity.fingerprint_basis`, and
- `identity.app_id`.

A profile change alone does not resolve a finding: REFUSE-to-WARN with the same
fingerprint is persisted. Compare the two reports' `policy.profile_id` when
explaining changed levels or priorities; fewer refusals from a profile change do
not mean source was repaired. Advisory findings use the existing baseline and
suppression policy after classification; retained REFUSE/BLOCK findings stay
ineligible for acceptance or suppression.

`app_id` derives from the app name, and for directory intake the app name is
the **last path segment as passed on the argv** — case-sensitive, and taken from
the argument rather than from a canonicalized realpath. Both runs must therefore
be spelled with the same basename. An archived copy only compares against its
original when it is surveyed from a directory of that same basename; a renamed
copy is refused rather than silently compared. (A `--app-name` override that
would decouple identity from the directory name is a recorded future candidate,
not a shipped flag.)

The shipped workaround for archived app versions (`DemoApp_Live`, `DemoApp_Fix`,
`DemoApp - copy 1-4-26` …) is therefore **directory-to-directory only**: restore or
copy each version into a directory that shares one basename and survey each in
turn. Mixed intake is not a workaround — a directory run and an msapp or
solution run of the same app still differ on `identity.fingerprint_basis` and
`--previous` refuses them. Use `--baseline` when you need acceptance across
intake kinds.

`--baseline` is the looser of the two mechanisms, but it is looser **only on the
basis class**: directory, msapp, and solution bases all declare the
`src-stripped/v1` normalization and therefore share one compatibility class, so
one emitted `analysis-baseline.json` is accepted by all three intakes. A
baseline does **not** assert app identity — it never checks `app_id`, so
supplying one from a different app silently accepts that app's tuples. App
identity is pinned by `--previous`, not by `--baseline`. The MCP `survey_app`
surface uses a `caller-supplied` basis, which matches nothing and accepts
nothing.

The default output is `<invocation-cwd>/appforge-survey`. A directory target
that contains this default must use an explicit `--report` outside the target.
Explicit output is realpath-checked and cannot traverse a symlink/junction or
sit inside a directory target. Archive names and app names never determine the
output path.

Artifacts use recovery-backed **whole-file publication**, not one
filesystem-wide transaction or continuous old-or-new replacement at a fixed
pathname. Each file is staged with an exclusive unpredictable name, flushed,
closed, and revalidated byte-for-byte both before and after publication. An
exclusive live-owner lock serializes cooperating writers to one report
directory. The two commands treat contention on that lock differently: survey
publication does **not** wait on a live output lock and fails closed with
`output-busy` (exit `3`), while `submit-envelope`'s report update retries
briefly before giving up. The envelope is published by an exclusive same-filesystem hard link
without overwrite. For each mutable file, the prior generation is captured
before the new complete generation is linked exclusively, with
`analysis-report.json` last as the commit marker. This no-overwrite choice means
a mutable public pathname can be briefly absent; readers never observe partial
file bytes. A caught precommit failure restores the prior mutable files while
ownership remains provable. If an uncooperative writer installs a newer
generation, AppForge preserves that generation plus its journal/backup and fails
closed instead of overwriting it. A killed process can leave whole
journal/temp/backup files; after proving the lock owner is dead, the next
invocation recovers only the fixed artifact names bound to that journal UUID and
verified hashes. Multiple successful runs retain their distinct immutable
envelope files.

With `--json`, stdout is byte-identical to the written JSON report. Otherwise it
is byte-identical to the technical report followed by one artifact-directory
footer. Diagnostics use stderr. The envelope is minimized pseudonymous data and
is only written for inspection here. After inspection, explicit submission is:

```bash
APPFORGE_SURVEY_ENDPOINT=https://your-host.example/survey/envelope \
APPFORGE_SURVEY_TOKEN=<bearer-token> \
node cli/validate.mjs submit-envelope <report-dir>/envelope-<uuid>.json
```

`APPFORGE_SURVEY_ENDPOINT` is required and must name your authenticated submission
endpoint. Missing or invalid configuration fails before any network call; HTTP is loopback-only. `submit-envelope` binds one regular
envelope file, reads it once, canonical-decodes it against the positive
allowlist, and requires its id and normalized path to match the valid sibling
`analysis-report.json` before network I/O. It posts that captured buffer with a
10-second timeout and refuses redirects. Acknowledged new/replay submissions
exit `0`; no-request usage/config/current-envelope refusals exit `2`; attempted
network/server/report-update failures exit `3`. Only the report submission
state is recovery-backed updated; envelope bytes remain immutable. If remote
acknowledgement succeeds but the report update fails, the diagnostic states
that remote truth and a retry safely exercises server-side idempotency.

The release/controller real-export gate is fail-closed and must configure both
`APPFORGE_REAL_MSAPP` and `APPFORGE_REAL_SOLUTION`, then set
`APPFORGE_REQUIRE_REAL_SURVEY=1` when running `server/test/survey-real.node.ts`.
Ordinary source-only test runs may report those external fixtures as skipped;
that skipped mode is not release evidence.

### From a Claude Code session

The skill or orchestrator should:
1. Bash-invoke `node cli/validate.mjs <dir>` after the screen-builders finish writing.
2. Read the report. If exit code 0 and no warnings: call `compile_canvas` directly.
3. If exit code 0 with warnings: call `compile_canvas`, then surface the warnings in the final response (they go in a `warnings:` block per the error contract in `generator-rules.md` §11).
4. If exit code 1: do not call `compile_canvas`. Return the structured `missing-catalog-entry` error block to the caller.

### Programmatic (library)

```js
import { loadCatalog, validateYaml } from './cli/validate.mjs';

const catalog = loadCatalog();                    // reads the .yml triple
const result = validateYaml(yamlText, catalog);   // → { issues, summary }

if (result.summary.refuse > 0) {
  // refuse generation; surface result.issues filtered to level === 'REFUSE'
}
// else: proceed to compile_canvas; result.issues filtered to level === 'WARN' becomes the warnings block
```

## What the gate does NOT do

- It does not parse Power Fx formulas — only enumerates property-key names. Bad formulas inside accepted properties pass the gate; `compile_canvas` catches them.
- It does not know about Family-vs-Variant semantics beyond what the catalog files say. If `describe_control` exposed something incorrectly, the gate inherits the error.
- It does not validate parent-context strictly. v1 admits any `parent_context_properties` unconditionally; strictly correct would gate on the actual parent's variant. Pragmatic until misuse shows up.

## What changes when the gate goes live

Up until now, AppForge has been preparation: catalogs, rules, extractor, augmentations, the diff. The gate is the first piece of AppForge that runs in the live generation loop. Every Canvas App YAML emitted with the gate active is one that's been classified against the catalog before being compiled. The verification queue stops being theoretical and starts being usage-weighted.
