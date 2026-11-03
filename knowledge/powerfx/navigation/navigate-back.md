# Navigation Functions: Navigate and Back

Control which screen is displayed in your app.

## Navigate Function

Changes to a different screen with optional transition and context variables.

### Syntax

```powerfx
Navigate( Screen [, Transition [, UpdateContextRecord ] ] )
```

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| Screen | Yes | Screen to display |
| Transition | No | Visual transition effect |
| UpdateContextRecord | No | Context variables to set on target screen |

### Return Value

Returns `true` on success, `false` on error.

---

## Screen Transitions

| Transition | Description |
|------------|-------------|
| `ScreenTransition.None` | Instant switch (default) |
| `ScreenTransition.Fade` | Fade out/in |
| `ScreenTransition.Cover` | New slides in from right |
| `ScreenTransition.CoverRight` | New slides in from left |
| `ScreenTransition.UnCover` | Current slides out to right |
| `ScreenTransition.UnCoverRight` | Current slides out to left |

### Transition Pairs

| Going Forward | Going Back (inverse) |
|---------------|----------------------|
| Cover | UnCover |
| CoverRight | UnCoverRight |
| Fade | Fade |
| None | None |

---

## Navigate Examples

### Basic Navigation

```powerfx
// Simple navigation
Navigate( HomeScreen )

// With transition
Navigate( DetailScreen, ScreenTransition.Cover )

// With fade
Navigate( SettingsScreen, ScreenTransition.Fade )
```

### Passing Context Variables

```powerfx
// Pass single variable
Navigate( DetailScreen, ScreenTransition.None, { locItemID: Gallery1.Selected.ID } )

// Pass multiple variables
Navigate( DetailScreen, ScreenTransition.Fade, {
    locItemID: Gallery1.Selected.ID,
    locItemName: Gallery1.Selected.Name,
    locIsEditMode: true
})

// Pass entire record
Navigate( DetailScreen, ScreenTransition.None, {
    locSelectedItem: Gallery1.Selected
})
```

### Conditional Navigation

```powerfx
// Navigate based on condition
If(
    varIsAdmin,
    Navigate( AdminDashboard ),
    Navigate( UserDashboard )
)

// Navigate with validation
If(
    IsValid,
    Navigate( NextScreen );
    true,
    Notify( "Please fix errors", NotificationType.Error );
    false
)
```

---

## Back Function

Returns to the previous screen.

### Syntax

```powerfx
Back( [ Transition ] )
```

### Rules

1. **Automatic inverse**: Uses inverse of original transition by default
2. **Stack-based**: Returns to most recently visited screen
3. **Returns boolean**: `true` if successful, `false` if no history

### Examples

```powerfx
// Simple back
Back()

// With specific transition
Back( ScreenTransition.UnCover )

// Check if can go back
If( Back(), true, Navigate( HomeScreen ) )
```

---

## Screen Events

| Event | Fires When |
|-------|------------|
| `OnVisible` | Screen becomes visible |
| `OnHidden` | Screen is navigated away from |

### Example: Screen Initialization

```powerfx
// DetailScreen.OnVisible
If(
    !IsBlank( locItemID ),
    Set( varCurrentItem, LookUp( Items, ID = locItemID ) )
)
```

### Example: Cleanup on Leave

```powerfx
// EditScreen.OnHidden
If( locHasUnsavedChanges,
    // Could prompt user or auto-save
    Set( varPendingChanges, true )
)
```

---

## Navigation Patterns

### Master-Detail Pattern

```powerfx
// Gallery OnSelect - go to detail
Navigate( DetailScreen, ScreenTransition.Cover, {
    locSelectedID: ThisItem.ID
})

// Detail screen - load data
// DetailScreen.OnVisible
Set( varDetailRecord, LookUp( DataSource, ID = locSelectedID ) )

// Back button
Back()
```

### Wizard/Multi-Step Form

```powerfx
// Step 1 -> Step 2
Navigate( Step2Screen, ScreenTransition.Cover, {
    locFormData: colFormData
})

// Step 2 -> Step 3
Navigate( Step3Screen, ScreenTransition.Cover, {
    locFormData: Collect( locFormData, Step2Data )
})

// Back maintains data
Back()  // Returns to previous step with data intact
```

### Tab-Like Navigation

```powerfx
// No transition for tab-like behavior
Navigate( Tab2Screen, ScreenTransition.None )

// Track current tab
Set( varCurrentTab, "Tab2" );
Navigate( Tab2Screen, ScreenTransition.None )
```

### Confirmation Before Navigate

```powerfx
// Check for unsaved changes
If(
    locHasChanges,
    UpdateContext( { locShowConfirmDialog: true } ),
    Navigate( HomeScreen )
)

// In confirmation dialog - Discard button
Navigate( HomeScreen )

// In confirmation dialog - Save button
SubmitForm( EditForm1 );
Navigate( HomeScreen )
```

---

## Common Patterns

### Navigate After Save

```powerfx
// Form OnSuccess
Navigate( DetailScreen, ScreenTransition.UnCover, {
    locItemID: EditForm1.LastSubmit.ID
})
```

### Navigate with Loading State

```powerfx
Set( varIsLoading, true );
Navigate( DataScreen, ScreenTransition.Fade );
// DataScreen.OnVisible handles loading
```

### Deep Link Handling (App.OnStart)

```powerfx
// Handle Param for deep linking
If(
    !IsBlank( Param("itemId") ),
    Navigate( DetailScreen, ScreenTransition.None, {
        locItemID: Value( Param("itemId") )
    })
)
```

---

## Best Practices

```powerfx
// GOOD: Pass only IDs, lookup on target screen
Navigate( DetailScreen, ScreenTransition.None, { locItemID: ThisItem.ID } )

// AVOID: Passing large records
Navigate( DetailScreen, ScreenTransition.None, { locItem: Gallery1.Selected } )

// GOOD: Consistent transition direction
// Forward: Cover, Back: uses inverse automatically
Navigate( NextScreen, ScreenTransition.Cover )
Back()

// GOOD: Initialize on OnVisible, not via context
// DetailScreen.OnVisible
ClearCollect( colRelatedItems, Filter( Items, ParentID = locItemID ) )

// AVOID: Heavy operations in Navigate context
Navigate( Screen, None, {
    locData: Filter( LargeTable, ... )  // Don't do this
})
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Context not available | Ensure variable name matches in Navigate and target screen |
| Back goes wrong place | Check navigation history, use Navigate for explicit control |
| Screen flickers | Use ScreenTransition.None or Fade |
| Data not loading | Move data loading to OnVisible event |

---

## Sources

- [Microsoft Learn: Navigate and Back](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-navigate)
