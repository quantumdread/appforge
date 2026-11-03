# Power Apps Forms Reference

## Form Types

| Type | Purpose | Modes | Can Save |
|------|---------|-------|----------|
| **Edit Form** | CRUD operations | New, Edit, View | Yes |
| **Display Form** | Read-only display | View only | No |

---

## Form Modes

```yaml
FormMode.Edit    # Edit existing record
FormMode.New     # Create new record
FormMode.View    # Read-only mode
```

---

## Core Properties

### Data Binding
```yaml
DataSource: =Accounts                    # Required - data source
Item: =Gallery1.Selected                 # Record to display/edit
DefaultMode: =FormMode.Edit              # Initial mode
```

### State Properties (Edit Form)
```yaml
Valid: Boolean      # All fields valid?
Unsaved: Boolean    # Has unsaved changes?
Error: String       # Error message from failed submit
ErrorKind: Enum     # None, Validation, Sync, Conflict
Updates: Record     # Current field values
LastSubmit: Record  # Last successfully saved record
```

---

## Form Functions

### SubmitForm
```yaml
OnSelect: =SubmitForm(EditForm1)
```

### ResetForm
```yaml
OnSelect: =ResetForm(EditForm1)
```

### NewForm
```yaml
OnSelect: =NewForm(EditForm1)
```

### EditForm / ViewForm
```yaml
OnSelect: =EditForm(EditForm1)
OnSelect: =ViewForm(EditForm1)
```

---

## Event Handlers

### OnSuccess
```yaml
OnSuccess: =Back()
OnSuccess: =Navigate(DetailScreen, ScreenTransition.Fade)
OnSuccess: |-
  =Notify("Saved!", NotificationType.Success);
  Back()
```

### OnFailure
```yaml
OnFailure: =Notify(EditForm1.Error, NotificationType.Error)
OnFailure: |-
  =If(
      EditForm1.ErrorKind = ErrorKind.Conflict,
      Refresh(Accounts); Notify("Record changed by another user"),
      Notify("Error: " & EditForm1.Error)
  )
```

---

## Common Patterns

### Save Button with Validation
```yaml
- btnSave:
    Properties:
      Text: ="Save"
      DisplayMode: =If(EditForm1.Valid && EditForm1.Unsaved, DisplayMode.Edit, DisplayMode.Disabled)
    Events:
      OnSelect: =SubmitForm(EditForm1)
```

### Cancel Button
```yaml
- btnCancel:
    Events:
      OnSelect: =ResetForm(EditForm1); Back()
```

### Prevent Unsaved Loss
```yaml
# Disable gallery while editing
Disabled: =EditForm1.Unsaved

# Warn on navigation
OnSelect: |-
  =If(
      EditForm1.Unsaved,
      If(Confirm("Discard changes?"), ResetForm(EditForm1); Back()),
      Back()
  )
```

### Manual Save with Patch
```yaml
OnSelect: |-
  =If(
      EditForm1.Valid,
      Patch(Accounts, EditForm1.Item, EditForm1.Updates);
      Back(),
      Notify("Fix errors first")
  )
```

---

## Card Controls

### Card Properties
```yaml
DataField: "FieldName"    # Link to data source field
Value: Current value       # Read
Update: New value          # Write
Valid: true/false          # Validation status
Required: true/false       # Is required
```

### Card Validation
```yaml
# Email validation
Card_Email.Valid: |-
  =Contains(Card_Email.Update, "@") &&
   Contains(Card_Email.Update, ".")

# Date range
Card_EndDate.Valid: =Card_EndDate.Update > Card_StartDate.Update
```

---

## ErrorKind Values

| Value | Cause | Solution |
|-------|-------|----------|
| **None** | No error | Proceed |
| **Validation** | Field validation failed | User fixes values |
| **Sync** | Server error | Check Error property |
| **Conflict** | Another user changed record | Refresh and reload |

---

## Best Practices

1. Always set DataSource and Item
2. Use OnSuccess for navigation after save
3. Display Error property for user feedback
4. Enable Save button only when Valid && Unsaved
5. Handle ErrorKind.Conflict by refreshing
6. Use ResetForm on Cancel
