# Validator Checklist

> **Automation status (2026-07-06):** the formula-shape gates (leading `=`, block scalars,
> `Color.` prefix), enum values, duplicate properties, PA2108 traps (§14), and the layout
> anti-pattern gates (§15–§19) are now machine-checked by the AppForge MCP `validate_yaml`
> tool (REFUSE = compile/paste breakers, WARN = silent visual bugs). The centralization family (duplicate formulas incl. the gallery-template variant, repeated color literals, heavy OnStart) is machine-checked as advisory WARNs since v2.3. The delegation and performance families (row-limit truncation patterns, per-row gallery queries, heavy OnStart, cross-screen references, control budgets) are machine-checked as advisory WARNs since v2.4 — supply validate_yaml a `datasources` map to activate the source-specific delegation rules. The remaining gates
> (single screen, varTheme usage, template Children nesting) are still manual self-checks.

Use this list to self‑check **before** returning YAML. The generator should answer “yes” to all.

1. **Top-level** is exactly `Screens:` with ≥1 screen map.
2. Every `Children` item is a **single-key map** naming the instance.
3. Every `Control` type exists in `catalogs/control-manifest.yml`.
4. `Control` uses the bare cataloged type without version pins (preserve namespaces like `Classic/...`). Follow `generator-rules.md` §3a: current `Modern*` by default; `ModernIcon` supports `OnSelect`, and `Classic/Icon` is only for a required classic enum icon with no ModernIcon text name; other classic choices name a required property missing on modern in a comment or the spec. Never delete an icon action to clear its unknown-property REFUSE.
5. Only keys from `ControlProperties[Type]` are used (`properties`, `layout`, `events`, and `variants`).
6. All formula values start with `=`.
7. **Formula block scalars:** `|-` is required for `: ` (colon followed by a space) in an unquoted inline formula, even inside Power Fx strings; YAML-quoted values are exempt. It is recommended for `;`, `{` or `}` outside Power Fx strings when pasting through Studio's code view, or for formulas longer than 120 chars. `validate_yaml` refuses only the colon-space hazard (`block-scalar-required`); punctuation gets WARN `inline-formula-paste-hygiene`. Inline punctuation compiles and syncs as-is, and Studio writes it this way.
8. **No pretty‑print inside formulas** — block content is a **single line** when the source formula is single‑line.
9. Inside any block scalar, the first character is `=`.
10. Named colors use `Color.` prefix (e.g., `Color.Transparent`, not bare `Transparent`).
11. Galleries/forms with item templates include nested `Children:`.
12. YAML parses (no stray tabs, bad indents, or unterminated code fences).
13. Theming referenced via `varTheme` where styling is present (or explicitly justified otherwise).

---

## Additional QA Checks (Layout Anti-Patterns)

### 14. PA2108 Trap Table — Invalid Property Combinations

Before returning YAML, check properties against the exact `Modern*` type, the current React family. Do not generate the older bare FluentV9 types or rely on lossy Studio Update. The catalog and draft map were re-checked on 2026-10-06; the map conversions remain unverified. Modern radio uses `OnChange`.

| Control | Invalid Property — NEVER USE | Correct Approach |
|---|---|---|
| `ModernTextInput` | `Value`, `HintText`, `Mode` | Initial `Default`, output `Text`, prompt `Placeholder`, mode `Type` (`TextInputType.SingleLine`, `Multiline`, `Password`) |
| `ModernCombobox` | `SearchField`, `SearchFields`, `DisplayFields`, `Default` | `DefaultSelectedItems`, `IsSearchable`, `ItemDisplayText`; required field lists need a named `Classic/ComboBox` exception |
| `ModernRadio`, `ModernDropdown` | `DefaultSelectedItems` | `Default` record matching `Items`; review conversion from classic text |
| `ModernRadio` | `OnSelect` | `OnChange` |
| `ModernDatePicker` | `Default`, authored `SelectedDate` | Initial `DefaultDate` (Date); read `SelectedDate`; review DateTime conversion |
| `ModernCheckbox`, `ModernToggle` | authored `Checked` | Initial `Default`; read `Checked` |
| `ModernSlider` | authored `Value`, `Layout` | Initial `Default`; read `Value`; use `LayoutDirection` |
| `Rectangle`, `Label` | `RadiusTopLeft/Right/BottomLeft/Right` | Use a cataloged rounded container; `ModernText` already has Radius* |
| `Classic/TextInput` | `Mode: =TextInputMode.___` | Classic `TextMode.SingleLine`, `MultiLine`, or `Password` |

The historical July TextInput Mode stamp concerned bare FluentV9 `TextInput`, not current `ModernTextInput.Type`. No modern gallery exists; use `Gallery` with current children and row taps on `Gallery.OnSelect`, or `ModernTabList`/`Table` when it does the whole job. See compile and Studio evidence, 2026-10-06.

### 15. LayoutMinWidth/LayoutMinHeight Default Check

Verify that every control and container inside an AutoLayout parent has explicit `LayoutMinWidth` and `LayoutMinHeight` set. Power Apps defaults are 250 and 100 respectively — omitting them causes silent overflow.

- Stretched children must have `LayoutMinWidth: =0`
- Galleries with `FillPortions: =1` must have `LayoutMinWidth: =0` and `LayoutMinHeight: =0`

### 16. Layout Anti-Pattern Checks

**Scroll-trap**: If a container has `LayoutOverflowY: =LayoutOverflow.Scroll`, verify its direct scrollable children use `FillPortions: =0` (not `=1`). `FillPortions: =1` pins the child to viewport height and scroll never activates.

**Overlay-trap**: If a container has a transparent overlay button (`Classic/Button` with `Fill: =RGBA(0,0,0,0)`) as a child, verify the container is `Variant: ManualLayout` (not AutoLayout). AutoLayout causes the overlay to consume all height, hiding siblings.

**Wrap-missing**: Every `Label` intended as single-line (nav items, headers, badges, KPI values) must have `Wrap: =false`. Default `true` causes unexpected line-breaks in narrow containers.

**No-height-trap**: Every `FillPortions: =0` container must have an explicit `Height` formula. Without it, Power Apps defaults to 200px instead of sizing to content.

### 17. FillPortions vs Height Mutual Exclusivity

Review controls with positive literal `FillPortions` and literal `Height`/`Width` on the parent's main axis: flex sizing takes precedence. `fillportions-with-fixed-size` skips width-dependent `If`/`Switch` branches in `FillPortions`, `Width` or `Height` keyed on `App.Width` or `Parent.Width`; responsive layouts can deliberately change sizing modes. Other formula-valued flex or main-axis sizes remain conservatively skipped. A zero authored size can be a deliberate fallback for a flex spacer, as in Microsoft's first-party templates; review intent before editing.

### 18. AlignInContainer Explicit Check

Review cross-axis alignment at either level: child `AlignInContainer` or direct parent `LayoutAlignItems`. `missing-align-in-container` warns only when both are absent. Explicit parent alignment, including Stretch or a conditional expression, is sufficient. The Microsoft-template oracle has 172 children using parent alignment and six remaining cases with neither level explicit; absence is a review question, not proof of a visual defect.

### Manual group stretching

`manual-group-may-stretch` is an advisory WARN in both profiles: a ManualLayout
`GroupContainer` directly inside a vertical AutoLayout container with no explicit
`FillPortions` can share free space (effective default 1). The warning asks
"is this group meant to stretch?" and has no fix action. Explicit FillPortions,
horizontal or unresolved parent directions, AutoLayout/GridLayout children and
unresolved child layout modes are excluded. An omitted child variant is treated
as manual only when it has no LayoutDirection or nonmanual LayoutMode.

Evidence: migration findings, 2026-10-05, lesson 4 and follow-up 2 item 1.
Setting FillPortions to zero was right on five screens and wrong on two; inspect
the intended design. The nine Microsoft oracle screens have zero hits.

### 19. Gallery Column Alignment Validation

When using a header row + gallery table pattern, verify that `FillPortions` values in the header row and gallery template row are **identical** for each column. Mismatched values cause columns to not line up.

### Field-report formula hazards

These rules use the compiler/runtime evidence recorded in the
field report, 2026-10-06.
They run in both the Worker and CLI analyzer profiles.

| Rule | Gate | Check and remedy |
|---|---|---|
| `yaml-comment-truncates-formula` | REFUSE | A plain formula scalar has a YAML inline comment and the retained formula has an unterminated string or unbalanced parentheses/brackets/braces. YAML cuts the value at ` #`; quote the whole YAML value or use a `|-` block scalar. |
| `yaml-inline-comment-after-formula` | WARN | A plain formula scalar has an inline comment and its retained formula has a complete lexical parse. Text after `#` is a YAML comment, outside the formula. Quote the value or use `|-` if the text belongs in the formula. |
| `component-input-called-as-function` | REFUSE | Inside its own ComponentDefinition, or outside a definition through a uniquely resolved CanvasComponent instance whose definition is in the analyzed bundle, a formula calls an authored Input or Output property without Parameters as `cExample.Value()`. On 2026-10-06, the minimal scratch-app probe (authoring service v3.26093.10) rejected `cProbeParen.Msg()` as an unknown or unsupported function in its namespace, accepted `cProbeBare.Msg`, and retained `PropertyKind: Input` on sync, so the July 2026 InputFunction materialization no longer supports the `()` form. Read it without parentheses: `cExample.Value`. InputFunction, OutputFunction, Action, Event and properties declaring Parameters are excluded; the screen-side probe also rejected `crumbs_1.SelectedStep()` and accepted `crumbs_1.SelectedStep` in a Label and instance handler. Read instance values without parentheses: `instance.Value`. Absent definitions and ambiguous or shadowed instance names stay silent. |
| `addcolumns-string-column-name` | REFUSE; existing-export WARN | An unqualified AddColumns call uses a string literal in a new-column slot (arguments 2, 4, 6, ...). Power Fx 1.0 reports `Expected identifier name`; use `Name` or the single-quoted identifier `'Display Name'`. Existing exports may predate Power Fx 1.0, so that explicit survey profile projects the finding to a correctness-risk warning. |
| `sortbycolumns-on-added-column` | WARN | SortByColumns directly encloses AddColumns as its first argument and sorts by a column added there. This failed compilation on Dataverse-backed Items; generality across sources is unproven. Sort the source first, then add: `AddColumns(Sort(src, col, SortOrder.Ascending), newCol, col)`. |
| `select-parent-in-gallery` | WARN | An On* behavior property contains unqualified `Select(Parent)` with a Gallery ancestor. Warn at any depth inside a component definition, including a direct gallery child (runtime comparison, 2026-10-06, generation report items 7–8). Outside components, warn only on nested controls; direct screen-gallery children remain silent. In a component, put the action on the gallery's OnSelect or the control's own OnSelect. For other nested controls, repeat the row logic or call a UDF. |
| `filter-constant-or-column` | WARN | A non-collection Filter predicate has an OR operand equating two literals and/or variables. The runtime error is "The left side of the 'Equal' operator must be a property of the entity". Branch outside: `If(varX = "all", Src, Filter(Src, Col = varX))`. Collection naming and datasource-map exclusions apply. |
| `zero-guard-misses-blank` | WARN | A formula divides by a reference whose only guard is `= 0` or `<> 0`, with no IsBlank, Coalesce, IsBlankOrError or IfError in it. Blank is not equal to 0 but division treats it as 0. Use `Coalesce(x, 0) = 0`, `x > 0` or IfError. |
| `modern-text-width-below-text` | WARN | ModernText or Text has a literal Text that needs more than Width minus horizontal padding at 0.5 × Size per character, with literal Height below 3 × Size plus vertical padding and AutoHeight not true. Silent inside auto-layout unless a horizontal parent fixes the width with FillPortions 0. |
| `index-literal-position` | WARN | Index uses a literal position ≥ 2 without a literal table proving enough rows. Hidden controls still evaluate formulas. Use `First(t)` or `Last(FirstN(t, n))`. Dynamic positions, including Sequence(CountRows(...)) row values, are silent. |
| `modern-text-height-below-size` | WARN | ModernText or Text has literal Height < 1.5 × literal Size + literal vertical padding, with missing paddings zero and AutoHeight not true. A scrollbar can appear inside the text. Increase Height or enable AutoHeight; see sizing-reference.md and both runtime reports. Oracle-calibrated exclusion: direct vertical AutoLayout children require explicit literal FillPortions = 0 to establish fixed rendered height; absent, dynamic or positive FillPortions is silent. |

Comment rules exclude quoted/block scalars and non-formula values. Closed
interpolated strings count as complete for the inline-comment WARN even though
their contents remain opaque to call analysis. Call rules
use complete lexical structure, ignoring strings, comments, qualified function
lookalikes and partial formulas. Local bindings are excluded where they shadow
the component or Parent name. The advice requires review; it does not produce
an automatic formula edit.

For `unknown-property`, the fix now names a classic counterpart when its input
catalog contains the rejected property. Resolve the counterpart from the
modernization map's source type, otherwise from `Classic/<type>` in the manifest.
For example: `Classic/Icon has OnSelect; use Classic/Icon if this control needs it`.
The rule, detail and level stay the same. Authored JavaScript prototype member
names receive ordinary catalog results; catalog dictionaries use own entries.

### Output references

`unknown-output-reference` warns when a complete formula reads a member that is
absent from both the input and output lists of an extractor-sourced control
instance in the analyzed bundle. The warning names the resolved type and offers
a near match when available; the classic-to-FluentV9 `TextInput` migration maps
`Text` to `Value`.

Resolution is case-insensitive and accepts quoted identifiers. Ambiguous names,
unresolved symbols, component instances, synthetic or dump-sourced controls,
local scope bindings and tokenizer-partial formulas are skipped. `Self`, `Parent`,
`ThisItem` and `ThisRecord` are excluded. Gallery and form runtime members are
accepted from the catalog's output lists; there is no runtime-member allow-list.
Suggestions require review and never produce an automatic edit.

### LayoutMaxWidth in manual groups

`layoutmaxwidth-collapses-children` warns when a manual `GroupContainer` directly
inside an AutoLayout `GroupContainer` sets `LayoutMaxWidth`, and at least one of
its direct children reads `Parent.Width` in its `Width` formula. This combination
can collapse child widths, leaving labels invisible and inputs narrow. Review
the cap, consider AutoLayout for the group or remove the cap if appropriate,
and verify the layout in Studio; the warning offers prose, with no automatic edit.

Groups marked AutoLayout, setting `LayoutDirection`, or declaring an auto
`LayoutMode` are excluded. Strings, comments, partial formulas and descendants
with a different parent do not establish a dependent width. Opaque `With`
bindings are conservatively skipped. The rule is WARN in both analyzer profiles,
classified as a layout correctness risk. Evidence is a visual runtime observation
from one app, the maintainer verified, in migration findings item 13; it is not a catalog
property claim or compile verification.
