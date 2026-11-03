# Modern Control Updates — February 2026

Microsoft released updated versions of 9 modern controls in February 2026. These updates include property renames, new enum patterns, behavioral changes, and new styling capabilities.

**Important:** These are opt-in updates. Existing controls (`Text@0.0.51`, `TextInput@0.0.54`, etc.) continue to work. Updated controls use new type names (e.g., `ModernText`, `ModernTextInput`, etc.).

**Version warning:** The MS Learn documentation examples show `@1.0.0` for all updated controls. These versions have NOT been verified against a real app export. Before using any updated control, insert it in your app via Studio, export the YAML, and confirm the actual `Type@Version` your tenant emits. Use `get_control_info` for current version knowledge from `catalogs/control-manifest.yml`.

---

## Updated Control Type Names

| Previous Type | Updated Type | Key Changes |
|---------------|-------------|-------------|
| `Text@0.0.51` | `ModernText@1.0.0` | 9 property renames, new OnSelect event, DisplayMode removed |
| `TextInput@0.0.54` | `ModernTextInput@1.0.0` | OnChange on blur only, TriggerOutput default = Keypress, View mode read-only |
| `NumberInput@2.9.12` | `ModernNumberInput@1.0.0` | OnChange on blur + step clicks, TriggerOutput removed, new styling |
| `DatePicker@0.0.46` | `ModernDatePicker@1.0.0` | View mode fixed, Format honored, DateTimeZone respected, gallery crash fixed |
| `ComboBox@0.0.51` | `ModernCombobox@1.0.0` | SelectMultiple default = true, toggle to unselect, OnChange fires on every selection |
| `Radio@0.0.25` | `ModernRadio@1.0.0` | Item order preserved, View mode read-only, new styling properties |
| `Link@0.0.45` | `ModernLink@1.0.0` | URL security validation, FontWeight fix, Wrap fix |
| `InfoButton@0.0.32` | `ModernInformationButton@1.0.0` | Content flyout fixed, AcceptsFocus removed |
| `TabList@2.2.31` | `ModernTabList@1.0.0` | New Appearance property, item order preserved, Items auto-refresh |

---

## Property Renames (All Updated Controls)

These renames apply across most or all updated controls:

| Old Name | New Name | Affected Controls |
|----------|----------|-------------------|
| `FontColor` | `Color` | All 9 updated controls |
| `FontSize` | `Size` | All 9 updated controls |
| `FontItalic` | `Italic` | All 9 updated controls |
| `FontStrikethrough` | `Strikethrough` | All 9 updated controls |
| `FontUnderline` | `Underline` | All 9 updated controls |
| `Weight` | `FontWeight` | ModernText only (was named differently from other controls) |
| `BorderRadius` | `RadiusTopLeft`, `RadiusTopRight`, `RadiusBottomLeft`, `RadiusBottomRight` | All controls with borders |

---

## New Enum Patterns (Replaces String Values)

Updated controls require typed enum syntax instead of string values.

### Align
**Used by:** ModernText, ModernTextInput, ModernNumberInput, ModernLink, ModernTabList, ModernDatePicker, ModernCombobox

| Enum Value | Description |
|------------|-------------|
| `Align.Left` | Left-aligned (default) |
| `Align.Center` | Centered |
| `Align.Right` | Right-aligned |
| `Align.Justify` | Full width (ModernText, ModernLink only) |

Previous `"Start"` or `""` maps to `Align.Left`. Previous `"End"` maps to `Align.Right`.

### VerticalAlign
**Used by:** ModernText, ModernLink

| Enum Value | Description |
|------------|-------------|
| `VerticalAlign.Top` | Top-aligned |
| `VerticalAlign.Middle` | Centered vertically (default) |
| `VerticalAlign.Bottom` | Bottom-aligned |

### FontWeight
**Used by:** All updated controls

| Enum Value | Description |
|------------|-------------|
| `FontWeight.Bold` | Bold |
| `FontWeight.Semibold` | Semibold |
| `FontWeight.Normal` | Normal (default) |
| `FontWeight.Lighter` | Lighter |

**Breaking:** `FontWeight.Medium` is REMOVED. Maps to `FontWeight.Normal` during update.

### ValidationState
**Used by:** ModernDatePicker, ModernTextInput, ModernNumberInput, ModernCombobox, ModernRadio

| Enum Value | Description |
|------------|-------------|
| `ValidationState.None` | No validation (default) |
| `ValidationState.Error` | Error styling (red border) |

### Appearance (Input Controls)
**Used by:** ModernDatePicker, ModernTextInput, ModernNumberInput, ModernCombobox

| Enum Value | Description |
|------------|-------------|
| `Appearance.Filled` | Filled background |
| `Appearance.FilledDarker` | Darker filled (default) |
| `Appearance.Outline` | Outlined border, transparent background |

### Appearance (TabList)
**Used by:** ModernTabList

| Enum Value | Description |
|------------|-------------|
| `TabListAppearance.Transparent` | Transparent background |
| `TabListAppearance.Subtle` | Subtle background |
| `TabListAppearance.Underline` | Underline indicator |
| `TabListAppearance.Filled` | Filled solid backgrounds |

### Appearance (Link)
**Used by:** ModernLink (property renamed from `Appearance` to `Type`)

| Enum Value | Description |
|------------|-------------|
| `LinkAppearance.Default` | Standard link style (default) |
| `LinkAppearance.Subtle` | Lighter styling |

### BorderStyle
**Used by:** All updated controls with borders

| Enum Value | Description |
|------------|-------------|
| `BorderStyle.Solid` | Solid (default) |
| `BorderStyle.Dashed` | Dashed |
| `BorderStyle.Dotted` | Dotted |
| `BorderStyle.None` | No border |

### TextInputType
**Used by:** ModernTextInput (replaces `Mode` / `Type` string values)

| Enum Value | Description |
|------------|-------------|
| `TextInputType.SingleLine` | Single-line (default) |
| `TextInputType.Multiline` | Multi-line text area |
| `TextInputType.Password` | Password masking |
| `TextInputType.Search` | Search input styling |

### TriggerOutput
**Used by:** ModernTextInput

| Enum Value | Description |
|------------|-------------|
| `TriggerOutput.Keypress` | Updates on every keystroke (default) |
| `TriggerOutput.FocusOut` | Updates on blur |
| `TriggerOutput.Delayed` | Short delay (auto in forms) |

### DecimalPrecision
**Used by:** ModernNumberInput

| Enum Value | Description |
|------------|-------------|
| `DecimalPrecision.Auto` | Auto (default) |
| `DecimalPrecision.'0'` | Integers only |
| `DecimalPrecision.'1'` | 1 decimal place |
| `DecimalPrecision.'2'` | 2 decimal places |
| `DecimalPrecision.'3'` | 3 decimal places |

### DatePickerFormat
**Used by:** ModernDatePicker

| Enum Value | Description | Example |
|------------|-------------|---------|
| `DatePickerFormat.LongAbbreviated` | Abbreviated month (default) | Jan 15, 2024 |
| `DatePickerFormat.Short` | Short numeric | 1/15/2024 |
| `DatePickerFormat.Long` | Full month name | January 15, 2024 |

Also supports custom format strings: `"dd-mm-yyyy"`, `"yyyy-mm-dd"`, etc.

### Layout (Radio)
**Used by:** ModernRadio

| Enum Value | Description |
|------------|-------------|
| `Layout.Vertical` | Stacked vertically (default) |
| `Layout.Horizontal` | Side-by-side |

### TabListAlignment
**Used by:** ModernTabList

| Enum Value | Description |
|------------|-------------|
| `TabListAlignment.Start` | Left-aligned |
| `TabListAlignment.Center` | Centered (default) |
| `TabListAlignment.End` | Right-aligned |

---

## OnChange Behavior Changes (CRITICAL)

| Control | Previous OnChange | New OnChange | Impact |
|---------|-------------------|--------------|--------|
| ModernTextInput | Every keystroke | Focus out (blur) only | **CRITICAL** — Performance improvement, may need formula updates |
| ModernNumberInput | Every keystroke | Focus out + step button clicks | Performance improvement |
| ModernCombobox | Delayed/Focus out | Every selection/deselection | More responsive |
| ModernRadio | Sometimes inconsistent | Every selection reliably | Improved reliability |

**Tip:** For per-keystroke updates, reference the control's output property (e.g., `TextInput1.Text`) directly in formulas instead of relying on OnChange.

---

## Removed / Replaced Properties

### ModernText
| Removed | Notes |
|---------|-------|
| `DisplayMode` | Removed from panel. Still exists for backward compatibility but has no effect. Use OnSelect for interaction. |

### ModernNumberInput
| Removed | Notes |
|---------|-------|
| `TriggerOutput` | Removed entirely. OnChange fires on blur + step clicks. |

### ModernDatePicker
| Removed | Replacement |
|---------|-------------|
| `Required` | Use `ValidationState` instead |

### ModernCombobox
| Removed | Replacement |
|---------|-------------|
| `TriggerOutput` | `DelayOutput` (`TriggerOutput="Keypress"` → `DelayOutput=false`, `TriggerOutput="FocusOut"` → `DelayOutput=true`) |
| `Fields` | `ItemDisplayText` (replace `Fields=["FieldName"]` with `ItemDisplayText=ThisItem.FieldName`) |

### ModernLink
| Removed | Notes |
|---------|-------|
| `AcceptsFocus` | Auto-managed for accessibility |
| `Appearance` | Renamed to `Type` (uses `LinkAppearance` enum) |

### ModernInformationButton
| Removed | Notes |
|---------|-------|
| `AcceptsFocus` | Auto-managed for accessibility |

---

## New Properties Added

### All Updated Controls
- `Fill` — Background fill color
- `BorderColor`, `BorderStyle`, `BorderThickness` — Border styling
- `RadiusTopLeft`, `RadiusTopRight`, `RadiusBottomLeft`, `RadiusBottomRight` — Per-corner radius
- `PaddingTop`, `PaddingBottom`, `PaddingLeft`, `PaddingRight` — Padding

### ModernText
- `OnSelect` — Click/tap event (also fires on Enter/Space for accessibility)

### ModernNumberInput
- `Default` — Initial value
- `HintText` — Placeholder text
- `Color` — Text color (was missing)
- `Fill` — Background color (was missing)
- `Font` — Font family (was missing)
- `Appearance` — Visual style

### ModernDatePicker
- `DefaultDate` — Initial date
- `Placeholder` — Hint text (replaces previous placeholder behavior)
- `Appearance` — Visual style

### ModernTextInput
- `Default` — Initial value
- `OnSelect` — Click/tap event
- `Appearance` — Visual style

### ModernTabList
- `Default` — Initially selected tab
- `Appearance` — Visual style (4 options)
- `Alignment` — Tab list positioning

### ModernCombobox
- `ItemDisplayText` — Display formula (replaces Fields)
- `InputTextPlaceholder` — Hint text
- `DelayOutput` — Replaces TriggerOutput
- `Required` — Validation
- `Appearance` — Visual style

### ModernRadio
- `ItemDisplayText` — Display formula
- `Required` — Validation
- `HoverColor`, `PressedColor`, `DisabledColor` — State colors
- `RadioSize`, `RadioBackgroundFill`, `RadioBorderColor`, `RadioSelectionFill` — Radio button styling
- `LineHeight` — Spacing between options

---

## Behavioral Notes

### ComboBox SelectMultiple Default Changed
`SelectMultiple` now defaults to `true`. Explicitly set `SelectMultiple = false` for single-select.

### ComboBox Toggle Selection
Clicking a selected item now unselects it. Previously required clearing the entire selection.

### Text Control OnSelect
The ModernText control now supports OnSelect, making it useful for clickable labels.

### View Mode Improvements
- ModernTextInput: View mode is now truly read-only (previously still editable)
- ModernDatePicker: Calendar can no longer be opened in View mode
- ModernRadio: Shows read-only appearance (not grayed-out disabled look)

### URL Security (Link)
ModernLink blocks `javascript:` and other unsafe URL schemes. Only `http://` and `https://` are allowed.

---

## YAML Examples

### ModernText (Updated Text Control)
```yaml
- lblTitle:
    Control: ModernText@1.0.0
    Properties:
      Text: ="Welcome"
      Size: =24
      FontWeight: =FontWeight.Bold
      Color: =RGBA(0, 120, 212, 1)
      Align: =Align.Center
      VerticalAlign: =VerticalAlign.Middle
      X: =40
      Y: =40
      Width: =300
      Height: =50
```

### ModernTextInput (Updated TextInput)
```yaml
- txtName:
    Control: ModernTextInput@1.0.0
    Properties:
      Placeholder: ="Enter name"
      Type: =TextInputType.SingleLine
      TriggerOutput: =TriggerOutput.Keypress
      Required: =true
      Appearance: =Appearance.FilledDarker
      X: =40
      Y: =100
      Width: =300
      Height: =32
```

### ModernDatePicker (Updated DatePicker)
```yaml
- datStart:
    Control: ModernDatePicker@1.0.0
    Properties:
      Placeholder: ="Select date"
      DefaultDate: =Today()
      Format: =DatePickerFormat.Short
      StartOfWeek: =StartOfWeek.Monday
      StartDate: =Today()
      EndDate: =Today() + 365
      X: =40
      Y: =100
      Width: =280
      Height: =32
```

### ModernCombobox (Updated ComboBox)
```yaml
- cmbDepartment:
    Control: ModernCombobox@1.0.0
    Properties:
      Items: =["Engineering", "Sales", "Marketing"]
      ItemDisplayText: =ThisItem.Value
      InputTextPlaceholder: ="Select department..."
      SelectMultiple: =false
      IsSearchable: =true
      Appearance: =Appearance.FilledDarker
      X: =40
      Y: =100
      Width: =320
      Height: =32
```

### ModernTabList (Updated TabList)
```yaml
- tabSections:
    Control: ModernTabList@1.0.0
    Properties:
      Items: =["Overview", "Details", "History"]
      Default: ="Overview"
      Appearance: =TabListAppearance.Underline
      Alignment: =TabListAlignment.Start
      Size: =16
      FontWeight: =FontWeight.Semibold
      X: =40
      Y: =100
      Width: =600
      Height: =60
```

## Sources

- [Recent updates to modern controls in canvas apps](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/controls/modern-controls/modern-control-updates)
- [Text — recent updates](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/controls/modern-controls/modern-control-text#recent-updates)
- [Text Input — recent updates](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/controls/modern-controls/modern-control-text-input#recent-updates)
- [Number Input — recent updates](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/controls/modern-controls/modern-control-number-input#recent-updates)
- [Date picker — recent updates](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/controls/modern-controls/modern-control-date-picker#recent-updates)
- [Combo box — recent updates](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/controls/modern-controls/modern-control-combobox#recent-updates)
- [Radio — recent updates](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/controls/modern-controls/modern-controls-radio-group#recent-updates)
- [Link — recent updates](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/controls/modern-controls/modern-control-link#recent-updates)
- [Info button — recent updates](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/controls/modern-controls/modern-control-info-button#recent-updates)
- [Tab List — recent updates](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/controls/modern-controls/modern-control-tabs-or-tabs-list#recent-updates)
