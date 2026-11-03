# Centralization lint — design spec

Date: 2026-07-20
Status: approved direction (user), pending plan + implementation. Ships AFTER the 2026-07-19 component-errata increment (as v2.3.0).
Origin: observed in a delivery app — formatting/status/badge duplication was the highest-frequency defect (~55 callsites collapsed to 12 named formulas/UDFs), and gallery templates make UDFs/named formulas the ONLY centralization mechanism. AppForge currently *advises* centralization (named-formulas docs, component-vs-UDF decision guide) but *analyzes* nothing.

## Goal

`validate_yaml` gains a WARN-only lint family that detects centralization opportunities in submitted PA-YAML batches: repeated formulas, repeated color literals, and heavy `OnStart`. Zero REFUSEs — these are advisory by doctrine (a centralization miss compiles fine; the cardinal failure is a false block). Telemetry (`lint:` keys) measures real-world hit rates before any escalation is considered.

## Why it's cheap now

The v2.1 walker already captures property **values** (normalized, quote-unwrapped, block-scalar-joined). Exact-match duplicate detection is normalize → hash → count. No Power Fx parsing.

## Rules (all WARN)

### 1. `duplicate-formula`
Identical normalized formula appearing **≥ 3 times** across the batch (all files).
- Normalization: strip leading `=`, collapse all whitespace runs to single space, trim. Exact string match only — no semantic equivalence.
- Non-triviality gate (all must hold): normalized length ≥ 15 chars; contains at least one `(` **or** one of `&&`, `||`, `&`, `+`, `-`, `*`, `/`, `<`, `>`, `!` (operator presence); is not a bare enum/color reference (`^[A-Za-z]+\.[A-Za-z0-9.]+$`).
- Context-bound formulas are skipped (amended 2026-07-20): a formula referencing `Parent.` or `Self.` WITHOUT referencing `ThisItem` cannot become a named formula (those references are placement-dependent) — skip it in rules 1–2. `ThisItem` formulas stay: they are precisely the UDF-with-parameters candidates.
- Excluded property names (positional/size churn is legitimately repetitive): `X`, `Y`, `Width`, `Height`, `LayoutMinWidth`, `LayoutMinHeight`, `FillPortions`, `Visible` *when the value is exactly `=true`/`=false`*.
- Issue anchoring: first occurrence (file/line/control/property); `detail` names the count and up to 3 other locations (`file:line`), and the suggestion: "appears N× — centralize as a named formula or UDF in App.Formulas".
- Threshold constant `DUPLICATE_FORMULA_MIN = 3` in the lint data section, documented as tunable.

### 2. `duplicate-formula-in-gallery`
Same detection, but fires (separately, instead of rule 1) when **≥ 2** occurrences and **all** occurrences sit inside gallery templates (walker: any ancestor control of type `Gallery`). Stronger message: "components cannot live in gallery templates — a named formula/UDF is the only centralization mechanism here" (cross-ref component-rules.md decision guide). Separate id so the verification queue distinguishes the gallery-context signal.

### 3. `repeated-color-literal`
The same literal `RGBA(...)` expression (whitespace-normalized) occurring **≥ 5 times** across the batch, scanned as substrings of all property values (not just whole-value matches — colors embedded in `If(...)` chains count).
- Suggestion: "define a theme token (varTheme.X) or named formula".
- Excluded: `RGBA(0, 0, 0, 0)` and `RGBA(255, 255, 255, 1)` (transparent/white are idiomatic noise).
- Threshold constant `REPEATED_COLOR_MIN = 5`.

### 4. `heavy-onstart`
`App.OnStart` whose value contains **≥ 5** top-level `;`-separated statements → "migrate initialization to App.Formulas (named formulas) + StartScreen; OnStart is the documented performance/anti-pattern hotspot".
- Statement counting: split the normalized value on `;`, count non-empty segments, fire at **≥ 5 segments** (amended 2026-07-20 after audit: raw semicolon-counting was off-by-one vs the ≥5-statements intent — 5 statements have 4 separators).
- Requires the **walker App-block extension** (below).

## Walker extension: `App:` block awareness

The walker currently ignores top-level `App:` blocks. Extend it to emit a pseudo-control `{ type: '__App', name: 'App', properties: [...] }` from a top-level `App:` mapping (properties incl. `OnStart`; and detect a `Formulas:` block — capture the named-formula **names** declared, via `NAME = ...;` scanning of the block-scalar value).
- Used by rule 4, and to enrich rules 1–3: when the batch already has an `App.Formulas` block, the suggestion says "add to your existing App.Formulas" (awareness, not suppression — a duplicate is a duplicate even when other things are centralized).
- Both validators (worker lib + local cli/validate.mjs) get the same extension — they are separate implementations by design.
- `__App` participates in nothing else: no catalog membership checks, no name-collision check against controls.

## Non-goals (explicit)

- No Power Fx AST / semantic-equivalence detection (only exact normalized match).
- No auto-fix / rewrite suggestions beyond the message text.
- No REFUSE escalation path in this increment — queue data first.
- No detection of *near*-duplicates (parameterizable formulas differing by one literal). That is the natural v2 once queue data shows the exact-match rule fires usefully; note it in the code comment.
- No cross-batch memory (each validate_yaml call is self-contained).

## Surface changes

- `validate_yaml` description: one sentence about the centralization WARN family.
- Telemetry: rules ride the existing `lint:<rule>:<Type>.<Prop>` keys unchanged (anchored at first occurrence).
- Docs: `named-formulas.md` and `performance-rules.md` gain a short "the validator now flags this" note; `validator-checklist.md` automation note extended.
- Version: worker `2.3.0`. CHANGELOG entry.

## Tests

Per rule: positive (fires at threshold), negative (below threshold / excluded property / trivial formula / excluded color), and boundary (exactly at threshold). Gallery variant: same formula 2× inside gallery templates fires rule 2 not rule 1; 3× spread across gallery + screen fires rule 1 not rule 2. App-block: OnStart with 5 statements fires; 4 doesn't; Formulas names captured and reflected in the enriched suggestion. Cross-file: duplicates spread over multiple files in one batch are counted together. Local validator parity for rules 1–4 (its directory mode counts across files).

## Acceptance criteria

- A delivery-shaped fixture (a badge `If`-chain repeated 3× across two files, one occurrence in a gallery template) produces exactly the expected WARNs with correct counts/locations, `gate_decision: PROCEED_WITH_WARNINGS`.
- A clean, centralized app (formulas referenced via named-formula names) produces zero centralization WARNs.
- Live deploy verified via the queue: the smoke WARNs appear under `lint:duplicate-formula:*` keys.
