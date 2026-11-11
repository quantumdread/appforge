# Troubleshooting

### Paste fails silently or errors in Studio
- Check indent: 2 spaces per level, no tabs.
- Ensure each `Children` entry is a **single-key map**.
- Confirm every `Control` type appears in `catalogs/control-manifest.yml`; generate bare types without version pins.
- If using `:` inside any string (e.g., `"Note: done"`), ensure the formula is under a block scalar `|-`.

### Event formula errors (OnSelect/OnVisible/OnChange)
- Use `|-` if the formula has `;`, `{`, `}`, `:`, or is very long.
- Do **not** reformat the formula content. Keep it one line under `|-` unless you explicitly want pretty formatting.

### Unknown or ignored properties
- The property might not exist in your app’s build. Remove it or add it to your catalog only after verifying Studio emits it for that control.
- Dotted keys (`Items.Series1`, `Items.Value`) must match exactly.

### Wrong control namespace (modern vs classic)
- Preserve cataloged namespaces in existing source. Generate current `Modern*` controls under `generator-rules.md` §3a, with a named catalog-proven capability exception for classic controls.
- Use `ModernIcon.OnSelect`; `Classic/Icon` is only for a required classic enum icon with no current text name. Never delete an action to resolve a property error.
- `ModernTextInput` uses initial `Default` and output `Text`; `ModernRadio`/`ModernDropdown` use a `Default` record; `ModernDatePicker` uses initial `DefaultDate` and output `SelectedDate`. Modern radio uses `OnChange`. Look up the exact target property set; conversion drafts remain unverified.

### “A new version of this control is available” on compiled controls
An older generation type was generated. Bare FluentV9 types (`Text`, `TextInput`, `Button`, `TabList`, `Icon`, etc.) precede current `Modern*` (React). Generate `Modern*` directly. Studio's “update control versions” converts them and is lossy: on 2026-10-06 it dropped explicit `Size` and `VerticalAlign`. Do not depend on Update to finish generation (compile and Studio evidence, 2026-10-06).

### Theming doesn’t apply
- Verify `varTheme` is set on a screen that runs (`ThemeInit` first or your own init path).
- Reference tokens (`varTheme.Primary`, etc.) consistently; avoid mixing hardcoded colors.

### The generator refuses with `missing-catalog-entry`
- Add the missing control or property to your catalog app, re‑extract, and update the two catalog markdown files.
- Refusal is by design—prevents silent guessing.

### Data bindings (`Items`, `Text` etc.) show errors after paste
- Ensure your collections/variables (`colItems`, `varTheme`, etc.) exist in the app (`OnStart` or init screen).
- If a formula references `ThisItem` or `Parent`, ensure it’s inside the right template context (e.g., inside a Gallery child).

### A Dataverse choice works in `Patch` but fails in `Filter` or `LookUp`
<!-- verified: true, verified_at: 2026-07-19, verified_by: compile_canvas -->

- A literal such as `'OptionSet'.Value` can resolve in assignment or `Patch` context but fail in a comparison for some global option sets. Structurally identical option sets can behave differently.
- `Choices(...)` does not expose its `.Value` as text. `LookUp(Choices(Table.choicecol), Value = "Label")` compares an `OptionSetValue` with text and fails.
- Use a data-derived `OptionSetValue` in a named formula, then compare with that value:

  ```powerfx
  CatX = LookUp(Categories, key = "X").choicecol;
  Filter(Items, choicecol = CatX)
  ```

- When the required option is first by definition order, use its position:

  ```powerfx
  Filter(Items, choicecol = First(Choices(Items.choicecol)).Value)
  ```

### Related lookup fields are blank after `Set(varRecord, Patch(...))`
<!-- verified: true, verified_at: 2026-07-19, verified_by: compile_canvas -->

- A record returned by `Patch()` does not lazy-load related columns; lookups retain only their id and primary name. Records sourced through a gallery or `LookUp` do lazy-load them.
- Re-hydrate the saved record from its table before reading related fields:

  ```powerfx
  Set(varOrder, Patch(Orders, Defaults(Orders), {Name: "New order"}));
  Set(varOrder, LookUp(Orders, OrderId = varOrder.OrderId))
  ```

### An untouched pen input passes an `IsBlank(PenInput.Image)` guard
<!-- verified: true, verified_at: 2026-07-19, verified_by: compile_canvas -->

- `PenInput.Image` is never blank: an empty canvas is still an image. Set a Boolean when the user interacts with the pen input and gate save/validation on that variable instead.
- Patching `PenInput.Image` to a Dataverse Image column works. `AddMedia.Media` is Text and does not patch successfully to an Image column.

### Previous-generation `TextInput.Mode` multiline casing (existing source)
<!-- verified: true, verified_at: 2026-07-19, verified_by: compile_canvas -->

- On the older bare FluentV9 `TextInput`, the enum member is `Multiline` (lowercase `l` in `line`). Use the fully qualified form:

  ```powerfx
  ='TextInputCanvas.Mode'.Multiline
  ```

For new `ModernTextInput` controls, use `Type: =TextInputType.Multiline`; the July stamp above covers the older Mode syntax only.

### Data inserted outside the app does not appear in the running session
<!-- verified: true, verified_at: 2026-07-19, verified_by: compile_canvas -->

- With non-delegable predicates, rows inserted externally (for example through the Web API) can remain invisible because the running app uses its session data cache.
- An in-app `Patch` updates that cache. For externally inserted rows, fully reload the app session before concluding that the insert failed.

### Controls render incorrectly after a co-authoring sync through the canvas-authoring MCP even though the YAML looks correct
<!-- verified: true, verified_at: 2026-07-20, verified_by: runtime_observation,
     claim_scope: studio_materializes,
     environment: canvas-authoring MCP server 1.0.3483.70-preview against a delivery tenant, Studio current as of 2026-07-20,
     reproduction: author a ModernButton via the MCP compile path, sync, inspect the materialized instance in Studio code view (before/after evidence in cli/upstream-bug-report.md finding 7),
     falsifier: a post-sync export where MCP-materialized instances carry the tenant-current control versions (e.g. ModernButton@1.0.0) without running "update control versions" -->

- **Symptom fingerprint:** After a canvas-authoring MCP sync, controls render incorrectly in Studio even though the YAML looks correct. `GroupContainer` controls render as black boxes because modern `Fill`/`Radius` properties are absent from the older control schema at which those instances were materialized, not from the authored source. `Button` controls show the default text `"Button"` instead of the authored `Text`, and other modern-control properties appear unset. Published apps and the player inherit the broken render.
- **Root cause:** The canvas-authoring MCP materializes control instances at the control versions bundled with the MCP server, which lag the tenant's current versions. Studio's current renderer silently ignores properties that do not exist in the older control schema. This is a version mismatch, **not** data loss: the stored YAML and formulas are intact.
- **Detection (per screen, in Studio):** select a screen and check its Properties panel — Studio shows *"This screen has N controls that can be updated to newer versions"* with a **Controls to update** list naming each lagging instance and an **Update all** button (observed 2026-08-26, a delivery tenant, on MCP-authored controls immediately after sync). The warning is per-screen, so sweep every screen in Tree view. Caveat: the same warning appears from ordinary version drift (monthly platform releases bump control versions), so it alone does not prove MCP-stale materialization — freshly authored controls showing it right after a sync is the bug's fingerprint; old controls showing it slowly over time is normal aging.
- **Fix (fastest, in place):** Run Studio's **"update control versions"** action (or the per-screen **Update all** button above). It migrates instances to current versions and rewrites the property vocabulary. Migration map observed from before/after export pairs (`catalogs/sources/studio-export-2026-08-26.yaml`; version pins are quoted Studio output, not authoring guidance):

  | Materialized (stale) | Tenant-current | Property rewrites observed |
  |---|---|---|
  | `Button@0.0.45` | `ModernButton@1.0.0` | `FontSize`→`Size`, `BorderRadius`→`RadiusTopLeft`/`RadiusTopRight`/`RadiusBottomLeft`/`RadiusBottomRight`, `='ButtonCanvas.Appearance'.X`→`=ButtonAppearance.X` |
  | `TextInput@0.0.54` | `ModernTextInput@1.1.1` | **`Value`→`Default`** (the current generation reverses the old modern-TextInput rule "no Default, bind Value" — that rule still holds for the stale `TextInput` generation the compile path materializes); gains `TriggerOutput`, `MaxLength`, `Align`, `VerticalAlign` |
  | `DatePicker@0.0.46` | `ModernDatePicker@1.0.1` | `SelectedDate`→`DefaultDate` (note: classic-gen `DatePicker.DefaultDate` remains compile-rejected — see `disproofs.md`; the property exists only on the Modern control) |
  | `CheckBox@0.0.30` | `ModernCheckbox@1.0.0` | `Checked`→`Default` |

  `ModernButton`, `ModernTextInput`, and `ModernDatePicker` are extractor-cataloged with the migrated vocabulary; `ModernCheckbox` postdates the 2026-05-10 extraction and is dump-sourced (`studio-export-2026-08-26`). See `get_control_info` for the per-generation property sets.
- **Alternative fix:** Paste the screen into Studio code view. Paste instantiates controls at current versions, which is why per-screen paste "just works."
- **Do not conclude:** This symptom is not evidence of source corruption or formula loss. Do not hand-rewrite source YAML to chase it. Keep authoring **bare control types** without `@version` pins; pins in authored source are a separate staleness problem.
- This is distinct from benign round-trip diffs: round-trips can alphabetize properties and prune default-valued properties, producing large diffs without changing rendered behavior.

### Still stuck?
- Trim to a minimal repro (one screen, one control) and add back lines until it breaks. The last change pinpoints the culprit.

### Filter fails with an entity-property equality error

Runtime observation, 2026-10-06 ([delivery errata A1](../docs/delivery-errata/2026-10-06-canvas-coauthoring-errata.md)): a delegated constant-or-column predicate such as `Filter(Src, "all" = varX || Col = varX)` compiled but failed with "The left side of the 'Equal' operator must be a property of the entity". Branch outside the Filter: `If(varX = "all", Src, Filter(Src, Col = varX))`. `filter-constant-or-column` is WARN only; collections are excluded by naming convention or the datasource map.

### Index errors even when the control is hidden

Runtime observation, 2026-10-06 ([delivery errata A2](../docs/delivery-errata/2026-10-06-canvas-coauthoring-errata.md)): "The second argument to the 'Index' function must be between 1 and 1…" was shown for a literal position beyond the table's length. Hidden controls still evaluate formulas, so `Visible: =false` does not protect `Index(t, 2)`. Use `First(t)` or `Last(FirstN(t, n))`; these avoid the out-of-range error on a short table. `index-literal-position` warns for literal positions at least 2 unless a literal table proves sufficient rows. Positions from `Sequence(CountRows(...))` remain dynamic and silent.

### Division by zero although the formula checks for zero

Field report (2026-11-11, a dashboard built through the canvas-authoring MCP): chart formulas guarded with
`If(x = 0, 0, a / x)` raised a division-by-zero error. Studio evaluated them before the data had loaded, so `x` was
blank. Microsoft documents both halves: division treats blank as 0, but blank is not equal to 0, so the guard lets it
through ([error handling](https://learn.microsoft.com/power-platform/power-fx/error-handling)). Guard with
`Coalesce(x, 0) = 0`, `IsBlank(x) || x = 0` or `x > 0`, or wrap the division in `IfError`. The WARN
`zero-guard-misses-blank` flags a divisor whose only guard is `= 0` or `<> 0` in the same formula.

### Grey scrollbar inside modern text that is too narrow

Field report (2026-11-11): `ModernText` labels with a large `Size` showed grey scrollbars until they were widened. Text
too long for one line wraps, and a fixed `Height` that holds only one line then scrolls. The WARN
`modern-text-width-below-text` estimates 0.5 × `Size` per character for literal text with literal `Width`, `Height` and
`Size`. It fires when that exceeds the width minus horizontal padding, and `Height` is below two lines (3 × `Size` plus
vertical padding). The estimate is a heuristic: check rendering for the font. Widen the control, reduce `Size`, or
enable `AutoHeight`.
<!-- verified: false — field report only (2026-11-11); heuristic not runtime-calibrated -->

### Newly inserted controls move after Studio saves

Sync observations, 2026-10-06 ([delivery errata B1](../docs/delivery-errata/2026-10-06-canvas-coauthoring-errata.md)): a compile and immediate sync had the correct order, but Studio appended inserted controls when it saved. After every compile that inserts controls, save in Studio and sync to a separate scratch folder. Run `compare_child_order` with the complete local source as `expected` and that fresh sync as `actual`, or `node cli/validate.mjs compare-order <expected-dir> <scratch-sync-dir> --json`. The comparison ignores property ordering and pruned defaults; `appended_at_end` identifies the insert symptom. Recompile the complete source while it reports `reordered`, then save, sync and compare again until `identical` is true (the reports needed two or three compiles). Investigate `membership-changed` before retrying. Reload Studio before editing. A successful compile alone does not establish saved child order; follow the deployment authorization procedure for each tenant write.

A clean sync in the session that compiled is not proof of the saved order (field report, 2026-11-03): after compiling inserts, reload Studio before the sync you compare. If inserted controls are still at the end, reload, compile once more, then save and publish without reloading in between.

### Moved or retyped controls render black in the Studio editor after reload

Field reports, 2026-11-03: after a compile that moved existing controls to new parents, the compile passed, the sync was clean and the live session rendered correctly, but after save and reload every moved control and its descendants showed in the editor's design surface as black boxes or not at all. Play mode was correct. Observed once: a control whose type changed under the same name, and back, was invisible in the editor after reload and correct in play mode. **Check play mode before treating editor rendering as a defect, and before any rollback.** A second reload cleared it once; renaming cleared it every time: give each moved or retyped control and its descendants a new name, so the compile re-inserts them instead of moving them. Before a push, run `compare_child_order` with a fresh sync as `expected` and the folder you will compile as `actual`; `editor_render_risk` lists the rename set. Layout properties on the receiving container (`LayoutOverflow`, `LayoutWrap`, a transparent `Fill`) were ruled out as the cause.

### Horizontal gallery template-root container geometry changes

Narrowed sync observation (sync observation, 2026-10-06, intake B2): a container used as the template root of a horizontal gallery may have `Width` pinned to `320` and geometry formulas involving `Parent.TemplateWidth`, `Parent.Width * n` or a sibling's `.Y` rewritten as constants on Studio load. Compare that container's geometry before and after a Studio load/save. The broader claim was not reproduced for plain direct template children: those formulas survived unchanged. A vertical auto-layout root survived in the field report; reproducing the narrower container shape remains pending, so no blanket geometry lint is asserted.

### Repeated sync_canvas HTTP 500

Observed 2026-10-06 ([delivery errata B3](../docs/delivery-errata/2026-10-06-canvas-coauthoring-errata.md)): after several compiles, two consecutive sync calls returned HTTP 500. Reconnect the coauthoring session with `connect` using the same account, then retry `sync_canvas`; reconnecting cleared the reported failure.

### ModernDropdown Default record displayed empty

Known issue, **unverified** ([delivery errata B4](../docs/delivery-errata/2026-10-06-canvas-coauthoring-errata.md)): `Items: =["a","b"]`, `ItemDisplayText: =ThisItem.Value` and a block-scalar `Default` record `{Value: "a"}` displayed empty in Studio. The catalog's Record type agrees with the authored shape; the cause has not been isolated. The delivery used ModernTabList as a workaround. Reproduce before changing the catalog or treating this as a general ModernDropdown limitation.
