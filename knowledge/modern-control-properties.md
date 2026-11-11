# Modern Control Properties Reference

## ModernButton Controls

Use the bare `ModernButton` type on the compile path. `ModernButton@1.0.0` is legacy Studio paste-path metadata only; do not put version pins in documentation examples.
<!-- verified: true, verified_at: 2026-07-19, verified_by: compile_canvas -->

```yaml
- btnSubmit:
    Control: ModernButton
    Properties:
      Text: ="Submit"
      BasePaletteColor: =RGBA(24, 95, 165, 1)
      OnSelect: |-
        =SubmitForm(frmDetails)
```

## TextInput Controls

> **Superseded names (2026-11-11).** The authoring service now says not to use the bare `TextInput`, `CheckBox` and
> `DatePicker` types for new controls, and to use `ModernTextInput`, `ModernCheckbox` and `ModernDatePicker` instead.
> The bare types still compile in apps that already have them, so their sections stay below. The Modern types have
> different property names: check each section, not just the type.

### ModernTextInput (use for new controls)
Properties:
- `Default` - Initial text
- `Text` - The current text (output; read it as `txtSearch.Text`)
- `Placeholder` - Hint text when empty
- `Type` - `=TextInputType.Multiline`, `.SingleLine`, `.Password` or `.Search`
- `OnChange` - Event when text changes
- There is no `Value`, `Mode`, `FontSize` or `FontColor`; use `Size` and `Color`

Example:
<!-- verified: true, verified_at: 2026-11-11, verified_by: compile_canvas -->
```yaml
- txtSearch:
    Control: ModernTextInput
    Properties:
      AccessibleLabel: ="Search"
      Default: =""
      Placeholder: ="Enter search text"
      Type: =TextInputType.Multiline
      OnChange: |-
        =Set(varSearchText, txtSearch.Text)
      Width: =200
      Height: =40
```

### TextInput (superseded; still valid in existing apps)
Properties:
- `Value` - The current text value (NOT Default)
- `Placeholder` - Hint text when empty (NOT HintText or Hint)
- `OnChange` - Event when text changes
- `Mode` - use `='TextInputCanvas.Mode'.Multiline` for multiline input (lowercase `l` in `line`)
<!-- verified: true, verified_at: 2026-07-19, verified_by: compile_canvas -->
- `Format` - Text format type
- `Width`, `Height`, `X`, `Y` - Layout properties
- `Visible` - Show/hide control
- `DisplayMode` - Edit, View, or Disabled

Example:
```yaml
- txtSearch:
    Control: TextInput
    Properties:
      Value: =""
      Placeholder: ="Enter search text"
      Mode: ='TextInputCanvas.Mode'.Multiline
      OnChange: |-
        =Set(varSearchText, txtSearch.Value)
      Width: =200
      Height: =40
```

### Classic/TextInput
Properties:
- `Default` - Initial value
- `HintText` - Placeholder text
- `Text` - Current value (read-only)
- `Mode` - use the legacy `TextMode` enum for Classic/TextInput (this is distinct from modern `TextInputCanvas.Mode`)
- `BorderColor`, `HoverBorderColor` - Border styling
- `HoverFill` - Background on hover
- `Font` - Font family
- `OnChange` - Event when text changes

Example:
```yaml
- txtClassic:
    Control: Classic/TextInput
    Properties:
      Default: =""
      HintText: ="Enter text"
      Mode: =TextMode.MultiLine
      BorderColor: =RGBA(207, 221, 224, 1)
      HoverBorderColor: =RGBA(59, 108, 125, 1)
```

## Gallery Orientation

### CRITICAL: Gallery Layout Rules

#### Vertical Gallery (items stack top to bottom)
Use for:
- Lists of records
- Status filter buttons that should stack vertically
- Tab buttons in a column
- Any vertical scrolling list

```yaml
- galItems:
    Control: Gallery@2.15.0
    Variant: Vertical  # Items stack vertically
    Properties:
      TemplateSize: =100  # Height of each item
      Height: =500
      Width: =300
```

#### Horizontal Gallery (items side by side)
Use for:
- Tab bars (horizontal tabs)
- Image carousels
- Button groups in a row
- Horizontal scrolling lists

```yaml
- galTabs:
    Control: Gallery@2.15.0
    Variant: Horizontal  # Items side by side
    Properties:
      TemplateSize: =130  # Width of each item
      Height: =50
      Width: =Parent.Width
      WrapCount: =9  # Max items before wrap
```

### Gallery WrapCount Property
- Controls how many items appear before wrapping
- For Horizontal: number of items per row
- For Vertical: number of items per column
- Set high (e.g., 999) to prevent wrapping

## CheckBox Controls

### ModernCheckbox (use for new controls)
Properties:
- `Default` - Initial checked state (Boolean)
- `Checked` - Current state (output; read it as `chkModern.Checked`)
- `Label` - Label text
- `OnCheck` - Event when checked
- `OnUncheck` - Event when unchecked
- There is no input `Checked`, `Text` or `OnSelect`

Example:
<!-- verified: true, verified_at: 2026-11-11, verified_by: compile_canvas -->
```yaml
- chkModern:
    Control: ModernCheckbox
    Properties:
      AccessibleLabel: ="Accept terms"
      Default: =false
      Label: ="Accept terms"
      OnCheck: |-
        =Set(varAccepted, true)
```

### CheckBox (superseded; still valid in existing apps)
Properties:
- `Checked` - Boolean value (NOT Default)
- `Text` - Label text
- `OnCheck` - Event when checked
- `OnUncheck` - Event when unchecked

Example (existing apps only):
```yaml
- chkModern:
    Control: CheckBox
    Properties:
      Checked: =false
      Text: ="Accept terms"
      OnCheck: |-
        =Set(varAccepted, true)
```

### Classic/CheckBox@2.1.0
Properties:
- `Default` - Initial checked state
- `Text` - Label text
- `OnCheck` - Event when checked
- `OnUncheck` - Event when unchecked
- `BorderColor`, `CheckboxBorderColor` - Styling

## DatePicker Controls

### ModernDatePicker (use for new controls)
Properties:
- `DefaultDate` - Initial date
- `SelectedDate` - Selected date (output; read it as `dpStart.SelectedDate`)
- `Format` - `=DatePickerFormat.Short`, `.LongAbbreviated` or `.YearMonth`
- `StartOfWeek` - for example `=StartOfWeek.Monday`
- `OnChange` - Event when the date changes

Example:
<!-- verified: true, verified_at: 2026-11-11, verified_by: compile_canvas -->
```yaml
- dpStart:
    Control: ModernDatePicker
    Properties:
      AccessibleLabel: ="Start date"
      DefaultDate: =Today()
      Format: =DatePickerFormat.Short
      StartOfWeek: =StartOfWeek.Monday
      OnChange: |-
        =Set(varStartDate, dpStart.SelectedDate)
```

### DatePicker (superseded; still valid in existing apps)
Properties:
- `SelectedDate` - Selected date value
- `Format` - Date format
- `IsRequired` - Required field indicator

### Classic/DatePicker@2.6.0
Properties:
- `DefaultDate` - Initial date
- `SelectedDate` - Current selected date
- `Format` - DateTimeFormat enumeration
- `StartOfWeek` - Week start day
- `DateTimeZone` - Time zone setting
- `BorderColor`, `IconBackground`, `IconFill` - Styling

## Common Property Differences Summary

| Classic control | Superseded bare type | Current Modern type | Initial value | Read the current value |
|-----------------|----------------------|---------------------|---------------|------------------------|
| Classic/TextInput | TextInput | ModernTextInput | `Default` (Classic, Modern); `Value` (bare) | `.Text` (Classic, Modern); `.Value` (bare) |
| Classic/TextInput | TextInput | ModernTextInput | Hint: `HintText` (Classic); `Placeholder` (bare, Modern) | |
| Classic/CheckBox | CheckBox | ModernCheckbox | `Default` (Classic, Modern); `Checked` (bare) | `.Value` (Classic); `.Checked` (bare, Modern) |
| Classic/DatePicker | DatePicker | ModernDatePicker | `DefaultDate` (Classic, Modern) | `.SelectedDate` |
| Classic/Icon | Icon | ModernIcon | Icon (enum on Classic, text on Modern) | |

## Best Practices
1. **Gallery Orientation**: Always use Vertical for stacked items, Horizontal for side-by-side
2. **TextInput Access**: ModernTextInput and Classic/TextInput read `.Text`; the superseded bare TextInput reads `.Value`
3. **Icon References**: Use Icon enumeration for Classic/Icon (e.g., `Icon.Information`)
4. **Property Names**: Check control version to use correct property names
5. **Event Handlers**: Modern controls may have different event names than Classic
