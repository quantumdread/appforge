# Disproofs register

> Claims that were **tested and falsified**. A row here is earned knowledge — each one cost a live-tenant test (or equivalent evidence) to produce, and re-believing a disproven claim is the most preventable failure this project has. Errata ingestion and catalog work MUST check incoming claims against this file first; a match flips the burden of proof onto the new evidence (fresh, stronger-class verification required). Doctrine: `VERIFICATION-DOCTRINE.md` → "Disproofs register".
>
> Created 2026-08-11 (v2.4.1). Rows are append-only; if a disproof is itself overturned, strike the row and link the new evidence — never delete.

## Founding batch — 2026-05-10, `compile_canvas` against live tenant

The hand-curated property table (now retired) claimed 22 properties as MCP omissions. Batch verification confirmed 4 (all on `Gallery`, now in `control-augmentations.yml`) and **falsified these 18**:

| Claim (property exists) | Disproven | Evidence |
|---|---|---|
| `Camera.Brightness` | 2026-05-10 | `compile_canvas` rejection |
| `Camera.Contrast` | 2026-05-10 | `compile_canvas` rejection |
| `Camera.Zoom` | 2026-05-10 | `compile_canvas` rejection |
| `Classic/CheckBox.Value` | 2026-05-10 | `compile_canvas` rejection |
| `Classic/ComboBox.OnNavigate` | 2026-05-10 | `compile_canvas` rejection |
| `Classic/Slider.ReadOnly` | 2026-05-10 | `compile_canvas` rejection |
| `Classic/Toggle.Rail*` / `Classic/Toggle.Value*` (rail/value styling family, multiple properties) | 2026-05-10 | `compile_canvas` rejection |
| `ComboBox.TextInputPlaceholder` | 2026-05-10 | `compile_canvas` rejection |
| `DatePicker.DefaultDate` | 2026-05-10 | `compile_canvas` rejection |
| `Icon.AccessibleLabel` | 2026-05-10 | `compile_canvas` rejection |
| `Icon.BasePaletteColor` | 2026-05-10 | `compile_canvas` rejection |
| `InfoButton.IconSize` | 2026-05-10 | `compile_canvas` rejection |
| `Label.DelayOutput` | 2026-05-10 | `compile_canvas` rejection |
| `Radio.OnSelect` | 2026-05-10 | `compile_canvas` rejection |
| `Table.Size` | 2026-05-10 | `compile_canvas` rejection |
| `TextInput.DelayOutput` | 2026-05-10 | `compile_canvas` rejection |

(Source of record: `CHANGELOG.md`, 2026-05-10 threshold entry.)

> **Generation-boundary note (2026-08-26):** `ModernDatePicker` — the current-generation control — *does* have `DefaultDate` (`studio-export-2026-08-26`; Studio's version migration rewrites `DatePicker.SelectedDate` to it). The `DatePicker.DefaultDate` disproof above applies to the classic-generation control only. A disproof is scoped to the exact control type it was tested on — never pattern-match it onto another generation.

## Disproofs since

| Claim | Believed where | Disproven | Evidence | Notes |
|---|---|---|---|---|
| `Icon.Left` / `Icon.Right` are valid icon enum names | doc examples (multiple rule docs) | 2026-07-19 | `compile_canvas` rejection (delivery errata) | Correct names: `Icon.ChevronLeft` / `Icon.ChevronRight`. How doc-example drift was discovered. |
| Co-authoring sync "drops property formulas" | `troubleshooting.md` (shipped wrongly stamped `compile_canvas`) | 2026-08-10 | `runtime_observation` (before/after materialization evidence) | Real cause: the canvas-authoring MCP materializes at its **bundled stale control versions** (e.g. `Button@0.0.45`); Studio's "update control versions" fixes in place. Upstream bug report filed (`cli/upstream-bug-report.md`, finding 7). The wrong entry is the doctrine's overclaiming case study. |
| SharePoint delegates `IsBlank` | `delegation-reference.md` table | 2026-08-10 | documented-consensus (practitioner + vendor docs; **not yet tenant-tested**) | Weaker evidence class than the rows above — recorded honestly. SQL `IsBlank` variant queued for tenant verification (`docs/TENANT-SESSION-WORKLIST.md`). |
| Out-In pattern step 3 is delegable | `delegation-reference.md` worked example comment | 2026-08-10 | documented-consensus (not yet tenant-tested) | Relabelled non-delegable; the per-source table ("base table only") was right, the example comment was wrong. |
| The current extractor declares `ModernTextInput.OnSelect` | May 2026 extracted catalog | 2026-09-20 | Fresh Route A extraction: property absent; corpus, acceptance-app and fresh Microsoft-template usage scans: zero | Retired with the extracted catalog refresh. This is catalog-declaration evidence, not a compiler rejection; new compiler evidence can establish a separate augmentation claim. |

