# Technical analysis report — Component Laboratory

- Report ID: golden-dirty
- App ID: component-laboratory-9bbaeb8c
- App name resolution: manifest
- Source: directory; completeness: full
- Fingerprint basis: directory/src-stripped/v1
- Surveyed at: 2026-08-29T12:00:00.000Z
- Analyzer version: golden
- Catalog: 2026-11-12T11:10:59.163Z; extracted 2026-11-12T11:10:59.163Z; 0 days old
- Files: dirty.pa.yaml (a18bdb5f227546011620d5b0dafd742cb329b8c7d27447705fe9b1d933df1699)

## Gate

- Decision: **BLOCK**
- Summary: PASS 3; WARN 5; REFUSE 2; controls 6; files 1

### Per file

- dirty.pa.yaml — PASS 3; WARN 5; REFUSE 2; controls 6

## Active remediation

- **now · 100** — property-not-in-catalog (action_state: active)
  - Group: 17603e5592db8870
  - Why: Rule family: catalog.
  - How: Use the known catalog candidate 'Text'.
  - Effort: judgment; descriptor coverage: none

- **now · 100** — property-not-in-catalog (action_state: active)
  - Group: 672bbd5d3aac6148
  - Why: Rule family: catalog.
  - How: Classic/Button has TabIndex; use Classic/Button if this control needs it
  - Effort: judgment; descriptor coverage: none

- **later · 19** — 4 control(s) lack AccessibleLabel — screen readers announce only the control type: txtAliasOne, txtAliasTwo, txtAliasThree, galPending (action_state: active)
  - Group: 1b6b5823fe5ea8c1
  - Why: Rule family: accessibility.
  - How: set AccessibleLabel on each input to what the screen reader should announce
  - Effort: judgment; descriptor coverage: none

- **later · 19** — 4 control(s) use types Microsoft has superseded: Button (1) → ModernButton, TextInput (3) → ModernTextInput. Existing controls keep working; Microsoft recommends the Modern type for new controls. Controls: btnLegacy, txtAliasOne, txtAliasTwo, txtAliasThree (action_state: active)
  - Group: ef3c5299ccf82df3
  - Why: Rule family: versioning.
  - How: use the Modern type for new controls; convert existing ones only when you are already changing them
  - Effort: judgment; descriptor coverage: none

- **later · 15** — 1 control type(s) carry @version pins across 1 file(s) — observed, not judged: a suffix alone establishes neither lag nor incompatibility; see the version-lag inventory for evidence-backed migrations. Pins are optional in authored YAML: the compile path strips them, so new code can use bare control types. Files: dirty.pa.yaml. Pinned: btnLegacy (action_state: active)
  - Group: 5ec1f44f6c829bbc
  - Why: Rule family: versioning.
  - How: No rule-provided fix is available.
  - Effort: judgment; descriptor coverage: none

## Verify first

- **verify-first · 4** — Verification required for group 4d0adfa3f871c24d before any remediation.
  - Verify the underlying evidence and classify the result before taking action.
  - Effort: judgment; descriptor coverage: none

## Accepted & suppressed debt

- **later · 15** — TabIndex 2 is positive — custom tab indexes are retired (treated as 0) and break screen-reader order (action_state: accepted)
  - Group: 5e18ba6213e71ccd
  - Why: Rule family: accessibility.
  - How: use TabIndex 0 (focusable) or -1 (skipped); order comes from control/container structure
  - Effort: judgment; descriptor coverage: none

## Findings

### unknown-property — dirty.pa.yaml:8

- Severity: BLOCK; analyzer level: REFUSE; confidence: medium (rule-family-default)
- Control: btnLegacy (Button)
- Property: TabIndex
- Fingerprint: 547eb68e13558d60; group: 672bbd5d3aac6148
- Status: baseline new
- Detail: property-not-in-catalog
- Fix: Classic/Button has TabIndex; use Classic/Button if this control needs it
- Catalog caveat: BLOCK is against catalog 2026-11-12T11:10:59.163Z, extracted 2026-11-12T11:10:59.163Z (0 days stale).

### unknown-property — dirty.pa.yaml:23

- Severity: BLOCK; analyzer level: REFUSE; confidence: medium (rule-family-default)
- Control: btnTypo (ModernButton)
- Property: Textt
- Fingerprint: 3193aeae7884f907; group: 17603e5592db8870
- Status: baseline new
- Detail: property-not-in-catalog
- Fix: not provided by the rule
- Did you mean: Text
- Catalog caveat: BLOCK is against catalog 2026-11-12T11:10:59.163Z, extracted 2026-11-12T11:10:59.163Z (0 days stale).
- Near miss: yes (`near_miss: true`)

### version-pin-in-control-type — dirty.pa.yaml:4

- Severity: MAINTAINABILITY; analyzer level: WARN; confidence: medium (rule-family-default)
- Control: btnLegacy (Button)
- Property: not applicable
- Fingerprint: 5ff7b80c43475b0c; group: 5ec1f44f6c829bbc
- Status: baseline new
- Detail: 1 control type(s) carry @version pins across 1 file(s) — observed, not judged: a suffix alone establishes neither lag nor incompatibility; see the version-lag inventory for evidence-backed migrations. Pins are optional in authored YAML: the compile path strips them, so new code can use bare control types. Files: dirty.pa.yaml. Pinned: btnLegacy
- Fix: not provided by the rule
- Aggregate controls: btnLegacy

### superseded-control-type — dirty.pa.yaml:4

- Severity: MAINTAINABILITY; analyzer level: WARN; confidence: medium (rule-family-default)
- Control: btnLegacy (Button)
- Property: not applicable
- Fingerprint: 1c3c78caf1977aa0; group: ef3c5299ccf82df3
- Status: baseline new
- Detail: 4 control(s) use types Microsoft has superseded: Button (1) → ModernButton, TextInput (3) → ModernTextInput. Existing controls keep working; Microsoft recommends the Modern type for new controls. Controls: btnLegacy, txtAliasOne, txtAliasTwo, txtAliasThree
- Fix: use the Modern type for new controls; convert existing ones only when you are already changing them
- Aggregate controls: btnLegacy, txtAliasOne, txtAliasTwo, txtAliasThree

### a11y-tabindex-positive — dirty.pa.yaml:8

- Severity: MAINTAINABILITY; analyzer level: WARN; confidence: medium (rule-family-default)
- Control: btnLegacy (Button)
- Property: TabIndex
- Fingerprint: 9b5dfa3ab35f9a16; group: 5e18ba6213e71ccd
- Status: baseline accepted
- Detail: TabIndex 2 is positive — custom tab indexes are retired (treated as 0) and break screen-reader order
- Fix: use TabIndex 0 (focusable) or -1 (skipped); order comes from control/container structure

### a11y-inputs-missing-accessiblelabel — dirty.pa.yaml:10

- Severity: MAINTAINABILITY; analyzer level: WARN; confidence: medium (rule-family-default)
- Control: txtAliasOne (TextInput)
- Property: not applicable
- Fingerprint: 99e75486c494408a; group: 1b6b5823fe5ea8c1
- Status: baseline new
- Detail: 4 control(s) lack AccessibleLabel — screen readers announce only the control type: txtAliasOne, txtAliasTwo, txtAliasThree, galPending
- Fix: set AccessibleLabel on each input to what the screen reader should announce
- Aggregate controls: txtAliasOne, txtAliasTwo, txtAliasThree, galPending

### delegation-search-caveat — dirty.pa.yaml:19

- Severity: UNCERTAINTY; analyzer level: WARN; confidence: low (provenance)
- Control: galPending (Gallery)
- Property: Items
- Fingerprint: 130164abf82ad7a7; group: 4d0adfa3f871c24d
- Status: baseline new
- Detail: Search( on bound source 'PendingLedger' — delegation depends on connector and column support; this checker has not established them. Search uses substring matching; supply `datasources` to sharpen this into a source-specific finding. Identifier 'PendingLedger' matches none of the known variable prefixes (col, var, gbl, loc) and is not declared in datasources, so it is assumed to be a bound source.
- Verification guidance: consider Filter(Source, StartsWith(Column, text)) only if prefix matching meets the request and the connector and column type support delegation; prefix and substring matching are not equivalent. StartsWith does not make Excel queries delegable

## Inventories

### Datasources

- PendingLedger — backend: unresolved; resolved_by: unresolved; confidence: none

### Backend risks

- Backend risks: not available from this intake

### Version lag

- btnLegacy (dirty.pa.yaml) — observed Button@0.0.45; newest known (lower bound; studio-export-2026-08-26): ModernButton@1.0.0.
  - Studio migration: update control versions to ModernButton@1.0.0 — Studio: update control versions.

### Modernization

- TextInput → ModernTextInput; verified: false; controls: 3; mechanical: 3; needs review: 0
  - Authored properties: same 0; renamed 0; manual 0; dropped cosmetic 0; dropped behaviour 0
  - Review reasons: none
  - Reference rewrites: 1; unmapped: 0
  - Review controls (up to 10): none (0 total)
  - Note: Unknown source properties are not counted here; the gate reports them separately.

- Button → ModernButton; verified: false; controls: 1; mechanical: 1; needs review: 0
  - Authored properties: same 2; renamed 0; manual 0; dropped cosmetic 0; dropped behaviour 0
  - Review reasons: none
  - Reference rewrites: 0; unmapped: 0
  - Review controls (up to 10): none (0 total)
  - Note: Unknown source properties are not counted here; the gate reports them separately.

### Screens

- Workshop (dirty.pa.yaml) — controls: 6; threshold: not exercised

### Components

- Components: no entries reported by this intake

### Connections

- Connections: not available from this intake

## Coverage

- Unit: classified property occurrences
- Tiers: extractor_verified 3; augmentation_verified 0; dump_sourced_lower_bound 0; component_defined 0; unknown 2
- Exclusions: Occurrences on unrecognized control types, unknown variants, and the App pseudo-control enter no tier.
- Catalog staleness: 0 days; current for the configured threshold

### Limitations

- metadata-absent at Connections.json: The internal fixture intentionally omits connection metadata.

### Unverified catalog claims

- dump_sourced:ComboBoxDataField — evidence class: dump-sourced-lower-bound
- dump_sourced:TableDataField — evidence class: dump-sourced-lower-bound

## Baseline & suppressions

- Baseline formula: finding-fingerprint/2
- Baseline applied from: analysis-baseline/1
- Baseline basis matches: yes
- Accepted findings: 1
- Stale baseline entries: 0
- Baseline migration required: no
- Applied suppressions: 0
- Expired suppressions: 0
- Invalid suppressions: 0
