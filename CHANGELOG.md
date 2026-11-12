# Changelog

Release notes for AppForge. Version numbers continue from the project's private development history; this
repository starts at 3.16.0.

## 3.20.1 — looping SVG animation (2026-11-12)

- **Looping SVG animation** (`svg-images.md`, new section). Two ways to make a chart replay on its own, both
  compile-verified and watched in Studio: SMIL that restarts from its own end (`begin='0s;a0.end+4s'`, with every other
  animation starting from `a0.begin`), and a CSS cycle that grows and then holds (`animation: grow 6s infinite`). The
  CSS example has a working Pause button, for WCAG 2.2.2.
- **Correction:** changing the SVG text (the `<!-- run n -->` comment) does not make the image replay, even when a
  Timer changes it. The doc said this was untested; it now says it does not work.

## 3.20.0 — the existing app is not a template; compile gate REFUSE gap closed (2026-11-12)

- **The existing app is not a template.** New rule in `generator-rules.md` §3a (item 8) and in `/appforge:edit-app`:
  when adding to an app, build new controls and formulas from AppForge's rules, not by copying neighbouring screens.
  Match the look by reusing the app's values. Copy existing controls only when the user asks for that. This
  overrides the authoring service's "unless it's already present in this app" notice.
- **New WARN `new-control-superseded-type`.** Given an untouched copy of the app from before the change, it names
  each control the change adds with a superseded type (for example a new `Button` instead of `ModernButton`), one
  finding per control. Supply the copy as `before_files` to `validate_yaml`, as `--before <folder>` to
  `cli/validate.mjs`, or as a sibling folder named `before` next to the compile folder: the compile gate picks it up
  by itself. Without a copy it stays silent; `superseded-control-type` then advises on the whole app as before.
- **`/appforge:edit-app`** now keeps that `before` copy, passes it to `validate_yaml`, and says not to copy patterns
  from the app.
- **Field report** (2026-11-12): a new dashboard screen got bare `Button` and `Text` controls because the app already
  used them.
- **The compile gate now runs four REFUSE rules it skipped:** `block-scalar-required` (an unquoted formula containing
  `: `, which compile rejects as "found invalid mapping"), `formula-missing-equals`, `enum-value-invalid` and
  `bare-color-name`. They ran in `validate_yaml` but not in the CLI profile that the gate uses (gap noted 2026-10-06).
  Field report, 2026-11-12: an `AccessibleLabel` with `": "` passed the gate, then failed to compile.

## 3.19.0 — blank-safe zero guards; modern text width; SVG doc (2026-11-11)

- **New WARN `zero-guard-misses-blank`.** It flags a division whose divisor is guarded only with `= 0` or `<> 0`.
  A blank value is not equal to 0, but division treats it as 0, so the guard lets it through. That happens, for
  example, before data has loaded: Studio evaluates formulas early. The fix it suggests is `Coalesce(x, 0) = 0`,
  `x > 0` or `IfError`. It stays silent when the formula already uses IsBlank, Coalesce, IsBlankOrError or IfError.
- **New WARN `modern-text-width-below-text`.** It flags `ModernText` or `Text` whose literal text cannot fit on one line
  (estimated at 0.5 × Size per character) and whose Height cannot hold a second line, so a scrollbar appears. It stays
  silent inside auto-layout unless a horizontal parent fixes the width.
- **Both come from a field report** on a live dashboard (2026-11-11). Troubleshooting and the validator checklist
  describe them.
- **New doc: `svg-images.md`.** It shows SVG charts and animation in canvas apps through a data URI, in an Image
  control or an HTML text `<img>`; inline `<svg>` in HTML text renders blank. Static charts, a CSS spinner and animated
  bars and a progress ring were compile-verified, and the maker watched them render.
- **Docs:** the legacy version list in `component-rules.md` now marks `Text@0.0.51` and the other unprefixed types as
  superseded, so they are not mistaken for current modern controls.

## 3.18.0 — superseded-control advisory; Modern examples (2026-11-11)

- **New advisory: `superseded-control-type` (WARN, never blocks).** Once per app it lists the controls that use a
  type Microsoft has superseded, with the replacement and a count, for example `Button (1) → ModernButton`. Existing
  controls keep working; it recommends the Modern type for new controls only. App surveys rank it as a later item.
- **Modern examples, compile-verified 2026-11-11.**
  - **Docs:** `modern-control-properties.md` has ModernTextInput, ModernCheckbox and ModernDatePicker sections next to
    the superseded ones, which stay for existing apps. The property names differ: ModernCheckbox sets `Default` and
    `Label` and reads `.Checked`; ModernTextInput sets `Default` and `Type` and reads `.Text`.
  - **Template:** `form-template-1.yaml` now uses ModernDatePicker, ModernRadio, ModernTextInput, ModernNumberInput,
    ModernCombobox and ModernButton.
  - **Icons:** ModernIcon accepts `OnSelect`. The old "modern icons cannot be clicked" warning now applies only to the
    superseded bare `Icon` type.
  - **Layout:** the checkbox sizing example in `screen-layout-rules.md` uses ModernCheckbox.
- **Clearer first-run messages.**
  - **Old catalog note:** when the catalog is old, the assistant is told to keep the gate, tell the user and suggest
    updating AppForge or reporting the gap, instead of re-extracting the catalog itself.
  - **Version pins:** the pin advisory no longer refers to "this repository".
  - **Size limits:** oversized input now reads "Input too large for one request".
  - **Descriptions:** the plugin description, getting-started guide and glossary describe the compile gate,
    `/appforge:edit-app` and issue reporting. The README has a fallback install for older Claude Code.

## 3.17.0 — control catalog refreshed (2026-11-11)

- **Catalog refreshed from the live Power Apps service (2026-11-11).** It now has 133 controls, up from 127.
  - **New:** ModernAttachments, ModernBadge, NativePdfViewer, NativePenInput, Geolocation and DataWedgeScanner.
  - **Changed:** ModernDataGrid and ModernRating gained `ContentLanguage`.
  - **Removed:** nothing.
- **Superseded controls stay valid.** Microsoft's service no longer lists 20 bare-named modern controls: Avatar, Badge,
  Button, CheckBox, ComboBox, DatePicker, DropDown, Icon, InfoButton, Link, NumberInput, Progress, Radio, Slider,
  Spinner, Table, TabList, Text, TextInput and Toggle.
  - **Still accepted:** the service still describes them, and existing apps still use them, so AppForge accepts them
    as before.
  - **Marked:** the catalog records each one as `listed: false`, with the replacement Microsoft names, such as
    `superseded_by: ModernCheckbox`. For new controls, prefer the Modern names.
- **The extractor (`cli/extractor.mjs`) is safer to re-run.**
  - **Unlisted controls:** it re-describes every control the previous catalog held that the list no longer offers,
    and keeps each one that still describes.
  - **Lost controls:** it refuses to write a catalog that would lose one.
  - **Components:** it ignores the open app's own canvas components.

## 3.16.0 — first public release (2026-11-03)

What this release contains:

- **21 MCP tools** over stdio (`server/dist-local/appforge-mcp.mjs`, committed, no install step), available as a
  Claude Code plugin or for any MCP client, plus an optional self-hosted Cloudflare Worker. They are grouped as
  catalog, validation, child-order comparison, modernization, renaming, templates, rules, Power Fx, survey,
  verification queue and issue reporting. See the [developer guide](docs/developer-guide.md) for the list.
- **A control catalog** (`knowledge/catalogs/`) of 127 extracted and 2 Studio-dump-sourced controls, extracted
  2026-09-20 from Microsoft's canvas-authoring MCP server, with a hand-maintained augmentation overlay that records the
  evidence class of every addition.
- **PA-YAML validation** with three states (PASS, WARN, REFUSE), shared by the MCP server and the command-line
  validator (`cli/validate.mjs`). It covers catalog conformance, YAML hazards, delegation, centralization,
  accessibility, navigation, write-error handling and layout rules.
- **Source tools:** `compare_child_order` checks child order, membership and editor render risk after a compile.
  `modernize_controls` converts classic controls to the Modern* family. `rename_controls` proposes or applies names
  across a complete file set.
- **App survey:** a structured report, technical Markdown and a minimized envelope for an existing app, from a
  directory, an `.msapp` file or a solution `.zip`.
- **Power Fx reference** (`knowledge/powerfx/`): 203 function entries, each with its Microsoft Learn sources. Answers
  carry the CC BY 4.0 attribution.
- **Rule documents, templates and personas** (`knowledge/`): 36 served documents, including the diagnostician,
  documenter and renovator prompts, plus 11 layout templates.
- **A safety net for Microsoft's canvas-apps plugin:** with the AppForge plugin installed, every `compile_canvas` is
  checked first (block, warn or off, set in `/config`), and the assistant is reminded to verify the result after each
  compile. `/appforge:edit-app` walks a whole change through both plugins.
- **Issue reporting:** `report_issue`, five GitHub issue forms with a containment checklist, and the Claude Code plugin
  skill `/appforge:report-issue`.
- **Plain-language guides** in `docs/`: getting started, things you can ask, FAQ and glossary.
- **Release gate:** `npm run release:check` in `server/` builds the catalog, the core and the local bundle, then runs
  the Worker and Node test suites, TypeScript and the acceptance corpus. The corpus includes the calibration against
  Microsoft's Studio templates.

Factual note carried into this release: the nondelegable data row limit is documented as 500 by default, configurable
from 1 to 10,000 (Microsoft Learn, delegation overview). AppForge's lint notes, survey text and docs state it that way.
