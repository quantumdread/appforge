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

### Modern TextInput
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

### Modern CheckBox@0.0.30
Properties:
- `Checked` - Boolean value (NOT Default)
- `Text` - Label text
- `OnCheck` - Event when checked
- `OnUncheck` - Event when unchecked

Example:
```yaml
- chkModern:
    Control: CheckBox@0.0.30
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

### Modern DatePicker@0.0.46
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

| Classic Control | Modern Control | Classic Property | Modern Property |
|----------------|----------------|------------------|-----------------|
| Classic/TextInput | TextInput | Default | Value |
| Classic/TextInput | TextInput | HintText | Placeholder |
| Classic/TextInput | TextInput | Text (read) | Value (read/write) |
| Classic/CheckBox | CheckBox | Default | Checked |
| Classic/DatePicker | DatePicker | DefaultDate | SelectedDate |
| Classic/Icon | Icon | Icon (enum) | Icon (string or enum) |

## Best Practices
1. **Gallery Orientation**: Always use Vertical for stacked items, Horizontal for side-by-side
2. **TextInput Access**: Modern uses `.Value`, Classic uses `.Text` for reading current value
3. **Icon References**: Use Icon enumeration for Classic/Icon (e.g., `Icon.Information`)
4. **Property Names**: Check control version to use correct property names
5. **Event Handlers**: Modern controls may have different event names than Classic
