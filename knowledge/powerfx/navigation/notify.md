# Notify Function

Displays a banner notification message to the user.

---

## Syntax

```powerfx
Notify( Message [, NotificationType [, Timeout ] ] )
```

## Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| Message | Yes | - | Text message to display |
| NotificationType | No | Information | Type/style of notification |
| Timeout | No | 10000 | Milliseconds before auto-dismiss |

---

## NotificationType Options

| Type | Color | Use For |
|------|-------|---------|
| `NotificationType.Information` | Blue | General info, status updates |
| `NotificationType.Success` | Green | Successful operations |
| `NotificationType.Warning` | Yellow/Orange | Warnings, cautions |
| `NotificationType.Error` | Red | Errors, failures |

---

## Timeout Behavior

- Default: 10000ms (10 seconds)
- Set to `0` for persistent notification (user must dismiss)
- Pressing the triggering control again dismisses notification

---

## Examples

### Basic Notifications

```powerfx
// Information (default)
Notify( "Processing your request..." )

// Success
Notify( "Record saved successfully!", NotificationType.Success )

// Warning
Notify( "This action cannot be undone", NotificationType.Warning )

// Error
Notify( "Failed to connect to server", NotificationType.Error )
```

### With Custom Timeout

```powerfx
// Quick 3-second notification
Notify( "Saved!", NotificationType.Success, 3000 )

// Persistent until dismissed
Notify( "Please review the errors below", NotificationType.Error, 0 )

// Long-running notice
Notify( "Large file uploading...", NotificationType.Information, 30000 )
```

---

## Common Patterns

### After Save Operations

```powerfx
// Form OnSuccess
Notify( "Changes saved successfully", NotificationType.Success, 3000 )

// Form OnFailure
Notify( "Save failed: " & EditForm1.Error, NotificationType.Error, 0 )
```

### Validation Messages

```powerfx
If( IsBlank( txtEmail.Text ),
    Notify( "Email is required", NotificationType.Warning )
)

If( !IsMatch( txtEmail.Text, Match.Email ),
    Notify( "Please enter a valid email address", NotificationType.Error )
)
```

### Operation Feedback

```powerfx
// Before long operation
Notify( "Loading data, please wait...", NotificationType.Information )

// Delete confirmation
Notify( "Item deleted", NotificationType.Success, 3000 )

// Copy to clipboard
Copy( TextToCopy );
Notify( "Copied to clipboard!", NotificationType.Success, 2000 )
```

### Error Handling

```powerfx
IfError(
    Patch( DataSource, ThisItem, Updates ),
    Notify( "Error: " & FirstError.Message, NotificationType.Error, 0 )
)
```

### Conditional Messages

```powerfx
Notify(
    If( CountRows( colSelected ) = 1,
        "1 item selected",
        CountRows( colSelected ) & " items selected"
    ),
    NotificationType.Information,
    3000
)
```

---

## Best Practices

### Message Guidelines

```powerfx
// GOOD: Clear, actionable message
Notify( "Unable to save. Please check your connection and try again.", NotificationType.Error )

// BAD: Vague message
Notify( "Error", NotificationType.Error )

// GOOD: Specific success
Notify( "Order #" & varOrderID & " submitted", NotificationType.Success )

// BAD: Generic success
Notify( "Done", NotificationType.Success )
```

### Timeout Guidelines

| Scenario | Recommended Timeout |
|----------|-------------------|
| Quick confirmations | 2000-3000ms |
| Standard messages | 5000ms |
| Important info | 10000ms (default) |
| Errors requiring action | 0 (persistent) |
| Warnings before action | 0 (persistent) |

---

## Multiple Notifications

Sequential notifications replace previous ones:

```powerfx
// Only last notification shows
Notify( "First" );   // Replaced immediately
Notify( "Second" );  // Replaced immediately
Notify( "Third" )    // This one displays
```

To show multiple messages, combine them:

```powerfx
Notify(
    "Saved 3 records. 2 warnings found.",
    NotificationType.Warning
)
```

---

## Platform Notes

- Works in Canvas apps, Custom pages, Power Fx commanding
- In Model-driven app commanding, `NotificationType.Success` shows as Information
- Notifications dock above the page content
- Mobile apps support same notification types

---

## Alternatives

| Need | Alternative |
|------|-------------|
| Persistent message | Label with visibility toggle |
| Multiple messages | Error collection in gallery |
| Rich content | Custom popup/dialog |
| Toast with actions | Custom component |

---

## Sources

- [Microsoft Learn: Notify function](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-showerror)
