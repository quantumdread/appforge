# Canvas Authoring MCP — gaps to file upstream

This is a running record of upstream findings against the canvas-authoring MCP. Findings (1)–(6) form the original, primary forensic set from running `cli/extractor.mjs` against an `EU-IL106 / Prod` tenant on 2026-05-10, then diffing the result against a year-old hand-curated catalog (see `cli/diff-report.md` for the full diff). Later findings carry their own provenance inline.

This is meant as a starting point for a Microsoft / Power Platform issue. Drop it into a GitHub issue against the canvas-authoring MCP server, the canvas-apps plugin repo, or whatever upstream channel is appropriate.

---

## (1) `describe_control` returns HTTP 500 for 9 controls advertised by `list_controls`

`list_controls` advertises these 9 control types as available; calling `describe_control` for any of them returns:

```
HTTP 500 (InternalServerError): {"traceLevel":2,"message":"An error occurred.","status":500}
```

Affected controls:

| Type | Family (presumed) |
|---|---|
| `Arrow` | Classic |
| `Circle` | Classic |
| `Classic/Icon` | Classic |
| `DataCard` | Classic / Form-internal |
| `FluidGrid` | Classic |
| `Form` | Classic |
| `PartialCircle` | Classic |
| `Star` | Classic |
| `Triangle` | Classic |

Pattern: all 9 are Classic-family controls, mostly shape primitives plus `Form`/`DataCard`/`FluidGrid`. Suggests a server-side schema-resolution bug specific to certain Classic controls rather than a transient outage — the failure was 100% reproducible across multiple runs against the same authoring session.

Sample server-side stack trace from the MCP server's stderr (one occurrence):

```
fail: CanvasAuthoringMcpServer.Tools.CanvasCompileTools[0]
      Error retrieving control description for Arrow
      System.Net.Http.HttpRequestException: HTTP 500 (InternalServerError): {"traceLevel":2,"message":"An error occurred.","status":500}
         at CanvasAuthoringMcpServer.Authentication.AuthenticatedHttpClient.HandleResponse[T](...)
         at CanvasAuthoringMcpServer.Services.DocumentServerSessionManager.GetAsync[T](...)
         at CanvasAuthoringMcpServer.Tools.CanvasCompileTools.DescribeControl(String controlName) in CanvasCompileTools.cs:line 218
```

The MCP server is faithfully relaying an upstream service error (the document-server `/api/yaml/controls/<Name>` endpoint). The fix lives at the document-server layer, not the MCP layer.

## (2) `describe_control` omits `OnSelect` on `Gallery`

`describe_control({controlName: "Gallery"})` does not list `OnSelect` in its `Input Properties` block, but `compile_canvas` accepts it on a real Gallery. Confirmed 2026-05-10 by writing a test screen with `Gallery.OnSelect: =Set(...)` and compiling against a live tenant — the compiler accepted the property.

This is more pernicious than (1) because `describe_control` succeeds silently with incomplete output. A generator that trusts `describe_control` as the authoritative property allow-list will refuse to emit `Gallery.OnSelect` even though the schema accepts it. Standard developer pattern; widespread breakage if relied on.

The manual catalog also originally claimed `Radio.OnSelect`, but `compile_canvas` rejected that one (`Unknown property 'OnSelect' for control type 'Radio'`) — so the auto-extractor was correct on Radio, and the issue is specific to Gallery. The pattern of which controls' `OnSelect` are exposed vs hidden is worth a sweep on the document-server side.

## (3) Other potentially-omitted input properties

A year-old hand-curated catalog (extracted from real app YAML exports) claims the following input properties exist on these controls but the current `describe_control` doesn't surface them. **These are unverified** as of this report — some may be schema-renames, some may be real omissions, some may be manual errors (the Radio.OnSelect example above shows the manual is not infallible). Listed here so the team can audit:

| Control | Claim from manual catalog |
|---|---|
| `Camera` | `Brightness`, `Contrast`, `Zoom` |
| `Classic/CheckBox` | `Value` |
| `Classic/ComboBox` | `OnNavigate` |
| `Classic/Slider` | `ReadOnly` |
| `Classic/Toggle` | `RailFill`, `RailHoverFill`, `ValueFill`, `ValueHoverFill` |
| `ComboBox` | `TextInputPlaceholder` |
| `DatePicker` | `DefaultDate` (may be `SelectedDate` rename) |
| `Gallery` | `WrapCount`, `TemplateFill`, `ItemAccessibleLabel` |
| `Icon` | `BasePaletteColor`, `AccessibleLabel` |
| `InfoButton` | `IconSize` |
| `Label`, `TextInput` | `DelayOutput` |
| `Table` | `Size` |

## (4) `describe_control` does not differentiate Gallery `Vertical` vs `Horizontal` variants

`describe_control({controlName: "Gallery"})` reports `Variants (2): Vertical, Horizontal` but emits a single `Input Properties (27)` block with no `Additional input properties for Vertical:` or `for Horizontal:` sections. Compare to `GroupContainer` which DOES have three such sections (one per variant).

Either the variants are genuinely property-equivalent (in which case the validator can treat `Variant:` on Gallery as cosmetic), or the MCP isn't surfacing per-variant differences. Worth confirming.

## (5) Output schema is markdown text, not structured

Minor but worth flagging. `describe_control`'s response shape is:

```json
{ "content": [{ "type": "text", "text": "Control Button\r\nFamily: FluentV9\r\n\r\nInput Properties (38):\r\n  - AcceptsFocus: Boolean\r\n  ..." }] }
```

A text format with `\r\n` line endings, indented bullet-list properties, free-form section headers. Any consumer that wants structured data has to parse this with regex. Two practical issues:

- **CRLF interacts badly with regex** — JS `.` doesn't match `\r`, and `$` without `/m` doesn't match before `\r`. Naïve parsers fail silently. Worth either normalising to `\n` or — preferably — adding a `structured: true` parameter that returns JSON directly.
- **Inline enums vs explicit-named enums use different formats** — `Foo: Enum (a, b, c)` (inline) vs `Foo: Enum\n      Enum name: X\n      Enum values: a, b, c` (explicit). Inconsistent.

## (6) MCP server crashes on shutdown disposing the authoring session

Cosmetic, but the server logs an unhandled exception every time it shuts down:

```
warn: CanvasAuthoringMcpServer.Services.DocumentServerSessionManager[0]
      Failed to dispose authoring session on server
      System.Text.Json.JsonException: The input does not contain any JSON tokens.
      Expected the input to start with a valid JSON token, when isFinalBlock is true.
```

Looks like the document-server `/api/authoringsession/dispose` endpoint returns 204 No Content but the MCP's deserializer expects a JSON body.

## (7) Materialization on the `compile_canvas` write path stamps stale control versions

**Component:** `Microsoft.PowerApps.CanvasAuthoring.McpServer`

**Server version:** `1.0.3483.70-preview` (the client launched it via `dnx … --yes --prerelease`, resolving the latest prerelease)

**Observed:** 2026-07-20 in a customer DEV environment (identifiers available on request).

**Authored source:** The affected button used the bare type `Control: Button` with no version pin. The pin was introduced by materialization, not by the author.

**Repro:**

1. Author a screen whose YAML uses bare modern control types — for example, `Control: Button` with authored `Text` and `Control: GroupContainer` with `Fill`/`Radius`.
2. Send that YAML through `compile_canvas`, the write path that mutates the live coauthoring session and where the stale-version materialization was observed.
3. Open the app in Studio and inspect the rendered controls and Studio code view.
4. Run `sync_canvas` as a read-back. The returned stored YAML retains the authored formulas; this demonstrates that the symptom is not formula loss and does not make `sync_canvas` the materializing step.

**Expected:** Materialization on the `compile_canvas` write path instantiates controls at the tenant's current control versions and they render as authored.

**Actual:** Materialization on the `compile_canvas` write path stamped older control versions, and Studio's current renderer silently ignored properties absent from those schemas. Containers rendered as black boxes, and buttons showed the default `"Button"` text. Publishing propagated the broken render to the player.

**Quoted tool/Studio output (client identifiers omitted; the version pins are quoted Studio/tool output, not authoring guidance):**

```yaml
# As materialized by compile_canvas (Studio code view) — stale schema:
- pa_btnSaveDraft:
    Control: Button@0.0.45
    Properties:
      Appearance: ='ButtonCanvas.Appearance'.Secondary
      BorderRadius: =14
      FontSize: =14
      Height: =48

# The same control after Studio's "update control versions" action — current schema:
- pa_btnSaveDraft:
    Control: ModernButton@1.0.0
    Properties:
      Appearance: =ButtonAppearance.Secondary
      RadiusBottomLeft: =14
      RadiusBottomRight: =14
      RadiusTopLeft: =14
      RadiusTopRight: =14
      Size: =14
      Height: =48
```

**Workarounds:** Studio's "update control versions" action fixes the issue in place and migrates `Button@0.0.45` to `ModernButton@1.0.0`. Pasting a screen into Studio code view also instantiates controls at current versions. Studio also surfaces the problem per screen: the screen's Properties panel shows *"This screen has N controls that can be updated to newer versions"* with the affected instances listed and an **Update all** button.

**Persistence:** Still reproducing as of 2026-08-26 (a delivery tenant). Observed scale: entire MCP-authored screens flagged — one screen with 23 of its controls listed (every toggle, text input, and button authored through the write path), another with 6. The staleness applies to every control the write path materializes, not occasional instances.

**Impact:** Affected apps written through `compile_canvas` need a manual post-write remediation pass. Teams that do not know the cause can conclude that formulas were lost and fall back to hand-pasting each screen, costing hours per iteration.

**Suggested fix:** Materialize the tenant's current control versions on the `compile_canvas` write path, or expose the target version set as a parameter so callers can select it deliberately.

---

## Forensic data

For findings (1)–(6), the catalog files in `knowledge/catalogs/` are the artefact-of-record for which controls existed in the `EU-IL106 / Prod` tenant on 2026-05-10 and which properties the MCP exposed for each. They are stable input for reproducing that original forensic set.
