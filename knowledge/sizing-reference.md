# Sizing Reference — Power Apps Canvas Controls

Calibrated from live CSS extraction against the published PA canvas player.
Measurements describe the named classic or modern generation; they do not choose generator defaults. New controls follow `generator-rules.md` §3a (modern by default).
Use this file when setting `Size`, `Height`, `CheckboxSize`, `LayoutGap`, or `PaddingX/Y`
on any control. Do **not** guess — look up the value here first.

---

## Critical Rule: Classic vs Modern size units are NOT equivalent

| Control family | PA `Size` → CSS px | Example |
|---|---|---|
| **Classic** (`Label`) | PA Size × **1.333** | Size 11 → 14.67px |
| **Modern** (`ModernText`) | PA Size × **1.0** (direct) | Size 11 → 11px |

**Classic Size 11 renders almost 4px larger than Modern Size 11.**
To achieve equivalent visual weight: **Modern Size ≈ Classic Size × 1.333**
(e.g., Classic Size 11 ≈ Modern Size 15)

---

## 1. Text Sizes

### 1a. Classic — Label (Font.Lato)

Source element: `.appmagic-label-text`
Container element: `.appmagic-label` — has 5px padding top/bottom/left/right

| PA Size | CSS px  | Line-height | Visual character | Recommended use |
|---------|---------|-------------|------------------|-----------------|
| 8       | 10.67px | 12.8px      | Tiny — hard to read  | Fine print, legal text only |
| 9       | 12px    | 14.4px      | Very small       | Secondary metadata, captions, hints |
| 10      | 13.33px | 16px        | Small-compact    | Dense data tables, nav labels, breadcrumbs |
| 11      | 14.67px | 17.6px      | **Standard body** ← default | Form labels, body copy, input default text |
| 12      | 16px    | 19.2px      | Medium           | Card titles, slightly emphasized text |
| 13      | 17.33px | 20.8px      | Medium-large     | Section subheadings, card headers |
| 14      | 18.67px | 22.4px      | Large            | Page section headings |
| 16      | 21.33px | 25.6px      | Extra large      | Major page titles |
| 18      | 24px    | 28.8px      | Display          | Hero headings |
| 20      | 26.67px | 32px        | Hero             | Very large display/banner text |

**Bold weight (Font.'Lato Black'):** Same CSS px as normal at same Size. Bold does NOT change rendered size.

**Minimum natural container height for a classic Label at a given Size:**
`min container height = lineHeight + 10px` (5px padding top + 5px padding bottom)

| Size | Min container height |
|------|---------------------|
| 8    | 22.8px → use Height=24 |
| 9    | 24.4px → use Height=26 |
| 10   | 26px   → use Height=28 |
| 11   | 27.6px → use Height=30 |
| 12   | 29.2px → use Height=32 |
| 13   | 30.8px → use Height=32 |
| 14   | 32.4px → use Height=36 |
| 16   | 35.6px → use Height=40 |
| 18   | 38.8px → use Height=40 |
| 20   | 42px   → use Height=44 |

---

### 1b. Modern — ModernText (Fluent UI)

Source element: `fui-Text` PRE
Line-height ratio: fontSize × 1.4

| PA Size | CSS px | Line-height | Visual character | Recommended use |
|---------|--------|-------------|------------------|-----------------|
| 8       | 8px    | 11.2px      | Tiny — practically unreadable | Avoid |
| 9       | 9px    | 12.6px      | Very small       | Only for extreme compactness |
| 10      | 10px   | 14px        | Small            | Captions, hints |
| 11      | 11px   | 15.4px      | Compact body     | Secondary labels |
| 12      | 12px   | 16.8px      | Compact standard | Hints, secondary labels |
| 13      | 13px   | 18.2px      | **Standard Modern body** ← default | Form labels in Modern apps |
| 14      | 14px   | 19.6px      | Standard-large   | Matches Fluent UI default (buttons, checkboxes) |
| 16      | 16px   | 22.4px      | Medium-large     | Card headers, section titles |
| 18      | 18px   | 25.2px      | Large            | Page headings |
| 20      | 20px   | 28px        | Extra large      | Major headings |

**Bold weight:** Same CSS px — bold affects appearance only, not rendered size.

---

### 1c. Size equivalency — Classic ↔ Modern

To get the same visual text weight in a Modern control as a given Classic size:

| Classic Size | Classic CSS px | Modern Size (closest) | Modern CSS px |
|-------------|---------------|----------------------|---------------|
| 9           | 12px          | **12**               | 12px ✓ exact |
| 10          | 13.33px       | **13**               | 13px (close) |
| 11          | 14.67px       | **15**               | 15px (close) |
| 12          | 16px          | **16**               | 16px ✓ exact |
| 13          | 17.33px       | **17**               | 17px (close) |
| 14          | 18.67px       | **19**               | 19px (close) |
| 16          | 21.33px       | **21**               | 21px (close) |

**Practical rule:** For Modern forms, default to **Size 13** (= Classic Size 10) as body text and **Size 16** as section heading. Do NOT use Modern Size 11 where Classic Size 11 was used — they look very different.

---

## 2. Control Heights

### 2a. Buttons

**Classic — Classic/Button**
- Font: always 14.67px (PA Size 11 equivalent), regardless of `Height` setting
- CSS rendered height: PA Height + 0.8px (border artifact — negligible)
- Padding: 5px top/bottom, 5px left/right on inner label

| PA Height | CSS rendered | Feel |
|-----------|-------------|------|
| 28        | 28.8px      | Compact — tight, toolbar use |
| 32        | 32.8px      | Small — secondary actions |
| 36        | 36.8px      | Medium |
| **40**    | **40.8px**  | **Standard ← default** |
| 44        | 44.8px      | Comfortable — primary CTA |

**Modern — ModernButton**
- Font: always 14px (Fluent UI default), regardless of `Height`
- CSS rendered height: PA Height exactly (no offset)
- Padding: 5px top/bottom, 12px left/right (built-in Fluent padding)

| PA Height | CSS rendered | Feel |
|-----------|-------------|------|
| 28        | 28px        | Compact |
| 32        | 32px        | Small |
| 36        | 36px        | Medium |
| **40**    | **40px**    | **Standard ← default** |
| 44        | 44px        | Comfortable |

---

### 2b. Text Inputs

**Classic — Classic/TextInput** and **Modern — ModernTextInput**

| PA Height | Visual feel | Recommended for |
|-----------|-------------|-----------------|
| 28        | Very compact | Dense forms, inline edits |
| 32        | Compact     | Tight forms |
| 36        | Medium      | Comfortable compact forms |
| **40**    | **Standard** | **Default for most forms** |
| 44        | Comfortable | Spacious forms |
| 48        | Large       | Prominent inputs, search bars |

Classic internal default font: 14.67px (Size 11). Set `Size: =11` explicitly.
Modern internal default font: 14px (Fluent). Matches button font size.

---

### 2c. Dropdowns / ComboBoxes

**Classic — Classic/ComboBox**
- Selected-value text renders at **17.33px** (PA Size 13 equivalent) by default
- CSS height: PA Height + 0.8px offset

| PA Height | CSS height |
|-----------|-----------|
| 32        | 32.8px    |
| 36        | 36.8px    |
| **40**    | **40.8px** ← standard |
| 44        | 44.8px    |

**Modern — ModernCombobox**
Use PA Height = CSS height (Modern controls have exact height).

---

### 2d. Checkboxes

**Classic — Classic/CheckBox**
- Font: always 14.67px regardless of `CheckboxSize`
- `CheckboxSize` affects only the check box square — does NOT change font or container height
- Natural rendered container height: **~50px** (not affected by CheckboxSize 10–18)
- **In a fixed-height container**: Set `AlignInContainer: =AlignInContainer.Stretch` so it is constrained to the parent's height. Do NOT use `AlignInContainer.Center` — the checkbox's natural height (~50px) will exceed most row containers (40–44px) and overflow.

| CheckboxSize | What changes | What doesn't change |
|-------------|-------------|---------------------|
| 10          | Box is 10×10px | Font 14.67px, height 50px |
| 14          | Box is 14×14px | Font 14.67px, height 50px |
| 18          | Box is 18×18px | Font 14.67px, height 50px |

**Modern — CheckBox**
- Font: 14px (Fluent)
- Natural rendered height: **36px** (8px top/bottom padding inside label)
- `CheckboxSize` property does NOT exist on Modern checkbox — size is fixed by Fluent token
- Container row: use `Height: =40` for comfortable spacing around the 36px control

---

### 2e. Radios, Date Pickers, Toggles

| Control | Classic default Height | Modern default Height |
|---------|----------------------|----------------------|
| Classic/Radio | Formula: `=39 + Max(0, Floor((RadioSize-16)/2)) + Max(0, fontSize-10)` | — |
| ModernRadio | — | 40 (Fluent default row height) |
| Classic/DatePicker | 40 (same as TextInput) | — |
| ModernDatePicker | — | 40 |
| Classic/Toggle | 48 (natural toggle height) | — |
| Toggle | — | 48 |

---

## 3. Spacing — LayoutGap and Padding

### LayoutGap reference

| Value | Visual feel | Use |
|-------|-------------|-----|
| 4     | Hairline    | Between tightly-related items (label + input inline) |
| 6     | Tight       | Compact form rows |
| 8     | Close       | Default form gap between rows (compact) |
| 10    | Comfortable | Default spacing in standard forms |
| 12    | Standard    | Common gap for card content |
| 16    | Spacious    | Section gaps within a card |
| 20    | Open        | Gap between major sections |
| 24    | Airy        | Section-to-section in spacious layouts |
| 32    | Wide        | Between distinct content blocks |

### PaddingX / PaddingY (container internal padding)

| Value | Use |
|-------|-----|
| 8     | Tight card padding |
| 12    | Compact card padding |
| 16    | Standard card padding |
| 20    | Comfortable card / page padding |
| 24    | Spacious page padding |

### Border Safety Margin (Classic Focused Borders)

PA AutoLayout containers clip children to their bounds. When a child has visible borders, the parent container must reserve space.

**Rule for Vertical AutoLayout containers:**
- **Height formula**: add `+ (child.FocusedBorderThickness * 2)` for every child that has `FocusedBorderThickness > 0`
- **PaddingLeft / PaddingRight**: set to `Max(child.BorderThickness, child.FocusedBorderThickness)` of the most prominent bordered child

**Rule for Horizontal AutoLayout containers:**
- Same principle on the other axis: `PaddingTop / PaddingBottom = Max(BorderThickness, FocusedBorderThickness)`
- If the container has a fixed Height: add `(child.FocusedBorderThickness * 2)` to it

**Quick reference table:**

| Child control | Scenario | Parent Height adjustment | Parent PaddingL/R |
|---|---|---|---|
| Classic/TextInput | FocusedBorderThickness=2 | +4px | =2 |
| Classic/TextInput | FocusedBorderThickness=1 | +2px | =1 |
| GroupContainer wrapper | BorderThickness=1 | +2px | =1 |
| Button (transparent focused) | any | 0 | 0 |

### Horizontal Row Proportions

When multiple controls share a horizontal AutoLayout row and ALL must be fully visible, assign `FillPortions` ratios — never leave `FillPortions: =0` on a visible child without an explicit `Width`.

**Rule: Every visible child needs either `FillPortions > 0` OR explicit `Width`. Never both absent.**

| Row pattern | Left control | Right control | Rationale |
|---|---|---|---|
| Checkbox + policy link | `FillPortions: =3` | `FillPortions: =2` | Checkbox+label needs ~60%; link needs ~40% |
| Question label + radio/toggle | `FillPortions: =2` | `FillPortions: =1` | Label gets ~67%, control gets ~33% |
| Equal siblings | `FillPortions: =1` | `FillPortions: =1` | 50/50 split |
| Label + fixed-width button | `FillPortions: =1` | `FillPortions: =0` + explicit `Width` | Button has fixed size, label fills rest |

**Classic/Button height in fixed-height action rows (visible focused border):**
```
Height: =Parent.Height - (Self.FocusedBorderThickness * 2)
```

---

## 4. Quick-Pick Table

Use these combinations for common design scenarios without looking up individual values.

| Scenario | Font (labels) | Font (section headers) | Control height | Row gap | Card padding |
|---|---|---|---|---|---|
| **Classic — compact form** | Size 11 (14.67px) | Size 12–13 | Height 36 | LayoutGap 8 | Padding 12 |
| **Classic — standard form** | Size 11 | Size 13 | Height 40 | LayoutGap 10–12 | Padding 16 |
| **Classic — spacious form** | Size 11–12 | Size 14 | Height 44 | LayoutGap 16 | Padding 20–24 |
| **Modern Fluent — compact** | Size 13 | Size 16 | Height 36 | LayoutGap 8 | Padding 12 |
| **Modern Fluent — standard** | Size 13 | Size 16 | Height 40 | LayoutGap 12 | Padding 16 |
| **Modern Fluent — spacious** | Size 14 | Size 18 | Height 44 | LayoutGap 16 | Padding 20 |
| **Data table row** | Size 10 (Classic) / Size 13 (Modern) | Size 11/14 | Height 36 | LayoutGap 0 | Padding 8 |

---

## 5. Proportional Sizing — Scale Factor Rule

Reference values calibrated for ~860px reference design (common mockup/screenshot width).
Scale formula: `target_value = reference_value × (target_canvas_width / reference_canvas_width)`

| Canvas Width | Sidebar Width | Form/Content Card Width | Combo Wrapper (card − 48px padding) | Tab template (÷ 6 tabs) |
|---|---|---|---|---|
| 768px  | 120px | 360px | 312px | 108px |
| 1024px | 158px | 468px | 420px | 141px |
| 1280px | 194px | 584px | 536px | 180px |
| **1366px** | **200px** | **620px** | **572px** | **194px** |
| 1920px | 290px | 880px | 832px | 272px |

**What scales (proportional — apply scale factor):**
- Sidebar container width
- Content card / form card width
- Column container widths (combo wrappers, multi-column rows)
- Gallery template size when the gallery should fill available width

**What does NOT scale (absolute — keep fixed regardless of canvas width):**
- Row heights: nav items, top bar, tab bar, input rows, button rows
- Input height, button height
- Padding (`PaddingTop`, `PaddingBottom`, `PaddingLeft`, `PaddingRight`)
- `LayoutGap` values
- Font sizes — text legibility is viewport-independent
- Border radius values

**How to apply:**
1. Estimate the reference screenshot width in pixels
2. Compute: `scale_factor = target_canvas_width / reference_canvas_width`
3. Look up pre-computed values in the table above, or multiply reference values by scale_factor
4. Round to the nearest even number (e.g., 206 → 200, 618 → 620)

---

*Draws on CSS measurement data from ToluVictor/canvas-apps-tools (MIT).*

### Modern text minimum height (runtime rule of thumb)

For one line in `ModernText` or FluentV9 `Text`, start with `Height >= 1.5 × Size + PaddingTop + PaddingBottom`; for multiple lines use `1.5 × Size × lines + vertical padding`, or enable `AutoHeight`. A shorter box can show a scrollbar inside the text. This is a runtime sizing heuristic, supported independently by [2026-10-06 coauthoring errata A3](../docs/delivery-errata/2026-10-06-canvas-coauthoring-errata.md) and migration follow-up 3 (runtime observation, 2026-10-05) (FluentV9 Text needed approximately 1.6 × Size for Size ≤ 17). That follow-up also observed a scrollbar with AutoHeight true at small sizes after reload; fixed Height around 1.6 × Size worked for small single-line text, while AutoHeight remained the guidance for wrapping or larger text. Check rendering for the actual font and line count. The `modern-text-height-below-size` WARN applies only to literal Height, Size and authored vertical paddings, with missing paddings treated as zero and AutoHeight not true.

Oracle calibration: for a direct child of a vertical AutoLayout container, authored Height alone does not establish the rendered flex-axis height. The WARN requires explicit literal `FillPortions: =0` there; absent, dynamic or positive FillPortions leaves rendered height unresolved and is silent. This conservative exclusion removed seven Microsoft-template hits without claiming a default FillPortions value. It does not suppress fixed-height text outside that flex-axis context.
