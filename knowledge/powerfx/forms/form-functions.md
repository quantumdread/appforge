# Form Functions

EditForm, NewForm, ResetForm, SubmitForm, ViewForm - Control Edit Form behavior.

---

## Form Modes

| Mode | Description | User Can Edit |
|------|-------------|---------------|
| `FormMode.Edit` | Edit existing record | Yes |
| `FormMode.New` | Create new record | Yes |
| `FormMode.View` | View existing record | No |

---

## SubmitForm

Saves form data to the data source.

### Syntax

```powerfx
SubmitForm( FormName )
```

### Behavior

1. Validates all required fields
2. Checks `Form.Valid` property
3. On success:
   - Runs `OnSuccess` formula
   - Clears `Error` and `ErrorKind`
   - Changes `FormMode.New` → `FormMode.Edit`
4. On failure:
   - Runs `OnFailure` formula
   - Sets error properties

### Examples

```powerfx
// Simple save button
SubmitForm( EditForm1 )

// With navigation
SubmitForm( EditForm1 );
Navigate( SuccessScreen )

// Note: Better to use OnSuccess for navigation
// EditForm1.OnSuccess: Navigate( DetailScreen )
```

---

## EditForm

Sets form to edit mode for existing record.

### Syntax

```powerfx
EditForm( FormName )
```

### Examples

```powerfx
// Edit button in gallery
EditForm( EditForm1 );
Navigate( FormScreen )

// With item selection
Set( varEditItem, Gallery1.Selected );
EditForm( EditForm1 );
Navigate( FormScreen )
```

---

## NewForm

Sets form to new record mode.

### Syntax

```powerfx
NewForm( FormName )
```

### Behavior

- Ignores current `Item` property
- Uses data source `Defaults()` values
- `SubmitForm` will create new record

### Examples

```powerfx
// New record button
NewForm( EditForm1 );
Navigate( FormScreen )

// Reset to new after save (in OnSuccess)
NewForm( EditForm1 )
```

---

## ResetForm

Resets form to initial values.

### Syntax

```powerfx
ResetForm( FormName )
```

### Behavior

- Runs `OnReset` formula
- In `FormMode.New`: returns to `FormMode.Edit`
- In `FormMode.View`: no effect

### Examples

```powerfx
// Cancel button
ResetForm( EditForm1 );
Back()

// Reset and stay
ResetForm( EditForm1 )

// Clear form for new entry
ResetForm( EditForm1 );
NewForm( EditForm1 )
```

---

## ViewForm

Sets form to read-only view mode.

### Syntax

```powerfx
ViewForm( FormName )
```

### Behavior

- All controls become read-only
- `SubmitForm` has no effect
- `ResetForm` has no effect

### Examples

```powerfx
// View details button
ViewForm( EditForm1 );
Navigate( FormScreen )

// Toggle view/edit
If( varIsEditing,
    EditForm( EditForm1 ),
    ViewForm( EditForm1 )
)
```

---

## Form Properties

### Key Properties

| Property | Description |
|----------|-------------|
| `Form.Mode` | Current FormMode |
| `Form.Valid` | True if all validation passes |
| `Form.Unsaved` | True if changes not saved |
| `Form.LastSubmit` | Last successfully submitted record |
| `Form.Error` | Error message from last submit |
| `Form.ErrorKind` | Type of last error |
| `Form.Updates` | Record of current changes |

### Form Events

| Event | When Triggered |
|-------|----------------|
| `OnSuccess` | After successful submit |
| `OnFailure` | After failed submit |
| `OnReset` | When ResetForm called |

---

## Common Patterns

### Complete Save Button

```powerfx
// OnSelect
If( EditForm1.Valid,
    SubmitForm( EditForm1 ),
    Notify( "Please complete required fields", NotificationType.Warning )
)

// Form OnSuccess
Notify( "Saved successfully", NotificationType.Success );
Navigate( ListScreen )

// Form OnFailure
Notify( "Save failed: " & EditForm1.Error, NotificationType.Error )
```

### Cancel with Confirmation

```powerfx
If( EditForm1.Unsaved,
    // Show confirmation dialog
    UpdateContext( { locShowConfirm: true } ),
    // No changes, just go back
    ResetForm( EditForm1 );
    Back()
)
```

### Edit/View Toggle

```powerfx
// Toggle button
If( EditForm1.Mode = FormMode.View,
    EditForm( EditForm1 ),
    ViewForm( EditForm1 )
)

// Button text
If( EditForm1.Mode = FormMode.View, "Edit", "View Only" )
```

### New vs Edit Screen

```powerfx
// Screen OnVisible
If( IsBlank( varSelectedItem ),
    NewForm( EditForm1 ),
    EditForm( EditForm1 )
)
```

### Master-Detail Pattern

```powerfx
// Gallery OnSelect
Set( varSelectedItem, ThisItem );
ViewForm( DetailForm );
Navigate( DetailScreen )

// Edit button on detail screen
EditForm( DetailForm )

// Save button
SubmitForm( DetailForm )

// DetailForm.OnSuccess
ViewForm( DetailForm )
```

### Form with Related Records

```powerfx
// After creating main record, create related records
// MainForm.OnSuccess
ForAll( colRelatedItems,
    Patch( RelatedTable,
        Defaults( RelatedTable ),
        {
            MainRecordID: MainForm.LastSubmit.ID,
            Detail: ThisRecord.Detail
        }
    )
);
Navigate( SuccessScreen )
```

---

## DisplayMode Mapping

| Form Mode | Control DisplayMode |
|-----------|-------------------|
| `FormMode.Edit` | `DisplayMode.Edit` |
| `FormMode.New` | `DisplayMode.Edit` |
| `FormMode.View` | `DisplayMode.View` |

---

## Common Mistakes

```powerfx
// BAD: Navigate before form processes
SubmitForm( EditForm1 );
Navigate( NextScreen )  // May navigate before save completes

// GOOD: Use OnSuccess for navigation
// EditForm1.OnSuccess property:
Navigate( NextScreen )

// BAD: Not checking Valid before submit
SubmitForm( EditForm1 )

// GOOD: Check validation
If( EditForm1.Valid, SubmitForm( EditForm1 ) )

// BAD: Expecting immediate LastSubmit
SubmitForm( EditForm1 );
Set( varNewID, EditForm1.LastSubmit.ID )  // May be old value

// GOOD: Access in OnSuccess
// OnSuccess: Set( varNewID, EditForm1.LastSubmit.ID )
```

---

## Sources

- [Microsoft Learn: Form functions](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-form)
