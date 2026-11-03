# Reset Function

Reset a control to its default value.

---

## Syntax

```powerfx
Reset( Control )
```

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| Control | Yes | Control to reset |

## Return Value

None - used for side effect only.

---

## Description

- Resets control to its **Default** property value
- Discards all user changes
- **Behavior formulas only** - cannot use in calculated properties

---

## Basic Example

```powerfx
// Reset a text input
Reset( TextInput1 )

// Reset a dropdown
Reset( Dropdown1 )

// Reset a slider
Reset( Slider1 )
```

---

## Button to Reset Field

```powerfx
// Button OnSelect
Reset( txtEmail )

// Or reset multiple fields
Reset( txtEmail );
Reset( txtPhone );
Reset( txtAddress )
```

---

## Important Restrictions

### Gallery and Form Limitations

**Cannot reset controls inside Gallery or Edit Form from outside**:

```powerfx
// ERROR: Won't work - trying to reset from outside gallery
Reset( Gallery1.Selected.TextInput1 )
```

**Can reset from within the same gallery/form**:

```powerfx
// OK: Reset button inside gallery
// Button inside gallery's OnSelect:
Reset( TextInput1 )
```

### Forms Alternative

Use `ResetForm` to reset all controls in a form at once:

```powerfx
// Reset entire form (preferred for forms)
ResetForm( EditForm1 )
```

---

## Alternative: Reset Property

Instead of calling Reset function, toggle a control's **Reset** property:

### Via Button Press

```powerfx
// Control's Reset property:
Reset = btnReset.Pressed
```

### Via Variable

```powerfx
// Button OnSelect:
Set( varReset, true ); Set( varReset, false )

// Control's Reset property:
Reset = varReset
```

This approach is better when resetting **many controls** from **multiple places**.

---

## Common Patterns

### Clear Form Fields

```powerfx
// Button to clear all fields
Reset( txtName );
Reset( txtEmail );
Reset( txtPhone );
Reset( dpDate );
Reset( ddCategory )
```

### Reset on Screen Navigation

```powerfx
// Screen OnVisible
Reset( txtSearch );
Reset( ddFilter )
```

### Reset After Submit

```powerfx
// After successful form submission
SubmitForm( EditForm1 );
If(
    EditForm1.Valid,
    Reset( txtComments ); Navigate( SuccessScreen )
)
```

### Reset Search Field

```powerfx
// Clear search button
Reset( txtSearch );
Set( varSearchResults, Blank() )
```

---

## Auto-Reset Behavior

Controls automatically reset when their **Default** property changes:

```powerfx
// If txtName has Default = varDefaultName
// Changing varDefaultName resets the control
Set( varDefaultName, "New Default" )
// txtName now shows "New Default"
```

---

## Supported Controls

- Text input
- Dropdown
- Combo box
- Date picker
- Slider
- Toggle
- Radio
- Check box
- Rating
- List box
- Rich text editor
- Pen input

---

## Reset vs ResetForm

| Reset | ResetForm |
|-------|-----------|
| Single control | All form controls |
| Any control | Form control only |
| Manual per control | Single call |
| Works anywhere | Works with forms |

```powerfx
// Reset individual control
Reset( txtEmail )

// Reset entire form
ResetForm( EditForm1 )
```

---

## Common Mistakes

```powerfx
// BAD: Trying to reset gallery item from outside
Reset( Gallery1.Selected.txtInput )

// GOOD: Use button inside gallery or reset gallery data source

// BAD: Resetting form controls individually
Reset( EditForm1.txtName );
Reset( EditForm1.txtEmail )

// GOOD: Use ResetForm for forms
ResetForm( EditForm1 )
```

---

## Sources

- [Microsoft Learn: Reset function](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-reset)
