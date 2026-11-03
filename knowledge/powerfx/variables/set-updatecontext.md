# Variable Functions: Set and UpdateContext

## Variable Types in Power Apps

| Type | Scope | Function | Use Case |
|------|-------|----------|----------|
| Global Variable | Entire app | `Set()` | App-wide state, user preferences |
| Context Variable | Single screen | `UpdateContext()` | Screen-specific state, temp values |
| Collection | Entire app | `Collect()`, `ClearCollect()` | Tables of data |

---

## Set Function (Global Variables)

Creates or updates a global variable accessible throughout the app.

### Syntax

```powerfx
Set( VariableName, Value )
```

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| VariableName | Yes | Name of global variable |
| Value | Yes | Value to assign (any type) |

### Rules

1. **Global scope**: Available on all screens
2. **Implicit creation**: Created on first use
3. **Persists until close**: Value retained while app runs
4. **Lost on close**: Must recreate when app reopens
5. **Behavior only**: Can only be used in behavior formulas (OnSelect, OnStart, etc.)
6. **No return value**: Set doesn't return a value

### Examples

```powerfx
// Simple values
Set( varUserName, "John" )
Set( varCounter, 0 )
Set( varIsAdmin, true )

// Increment counter
Set( varCounter, varCounter + 1 )

// Store record
Set( varCurrentUser, User() )
Set( varSelectedItem, Gallery1.Selected )

// Store record with fields
Set( varPerson, { Name: "John", Age: 30 } )

// Update record field
Set( varPerson, Patch( varPerson, { Age: 31 } ) )

// Store from data source
Set( varSettings, LookUp( Settings, Key = "Theme" ) )

// Clear variable
Set( varUserName, Blank() )
```

---

## UpdateContext Function (Context Variables)

Creates or updates variables scoped to the current screen.

### Syntax

```powerfx
UpdateContext( { Variable1: Value1 [, Variable2: Value2, ... ] } )
```

### Rules

1. **Screen scope**: Only available on current screen
2. **Multiple variables**: Can set multiple in one call
3. **Record syntax**: Uses record notation with curly braces
4. **Navigate transfer**: Pass values when navigating with Navigate()

### Examples

```powerfx
// Single variable
UpdateContext( { locShowPopup: true } )

// Multiple variables
UpdateContext( {
    locIsEditing: true,
    locSelectedID: Gallery1.Selected.ID,
    locOriginalValue: TextInput1.Text
} )

// Toggle boolean
UpdateContext( { locShowDetails: !locShowDetails } )

// Reset form state
UpdateContext( {
    locIsEditing: false,
    locSelectedID: Blank(),
    locHasChanges: false
} )
```

---

## Passing Context with Navigate

### Syntax

```powerfx
Navigate( Screen, Transition, { ContextVar1: Value1 } )
```

### Example

```powerfx
// Source screen - pass data
Navigate(
    DetailScreen,
    ScreenTransition.None,
    { locItemID: Gallery1.Selected.ID }
)

// Destination screen - use context variable
LookUp( Items, ID = locItemID )
```

---

## Naming Conventions

| Convention | Example | Description |
|------------|---------|-------------|
| `var` prefix | `varUserName` | Global variables |
| `loc` prefix | `locIsEditing` | Context (local) variables |
| `col` prefix | `colSelectedItems` | Collections |

---

## When to Use Each

### Use Global Variables (Set) for:

- User session data (current user info)
- App-wide settings/preferences
- Navigation state
- Cached data used on multiple screens
- Counters that persist across screens

### Use Context Variables (UpdateContext) for:

- Screen-specific UI state (popups, edit mode)
- Temporary values during form editing
- Local calculations
- Values that should reset when leaving screen

---

## Common Patterns

### App Initialization (App.OnStart)

```powerfx
// Initialize global state
Set( varCurrentUser, User() );
Set( varIsAdmin, LookUp( Admins, Email = User().Email ) );
Set( varAppSettings, LookUp( Settings, Active = true ) );
Set( varTheme, "Light" )
```

### Toggle Popup

```powerfx
// Button OnSelect
UpdateContext( { locShowPopup: !locShowPopup } )

// Popup Visible property
locShowPopup
```

### Edit Mode Pattern

```powerfx
// Edit button
UpdateContext( {
    locIsEditing: true,
    locOriginalRecord: Gallery1.Selected
} )

// Save button
Patch( DataSource, locOriginalRecord, EditForm.Updates );
UpdateContext( { locIsEditing: false } )

// Cancel button
UpdateContext( { locIsEditing: false } )
```

### Loading State

```powerfx
// Before data operation
UpdateContext( { locIsLoading: true } );
ClearCollect( colResults, Filter( LargeTable, Status = "Active" ) );
UpdateContext( { locIsLoading: false } )
```

### Counter

```powerfx
// Global counter
Set( varClickCount, varClickCount + 1 )

// Screen-specific counter
UpdateContext( { locViewCount: locViewCount + 1 } )
```

---

## Common Mistakes

```powerfx
// BAD: Using Set for screen-specific state
Set( varShowPopup, true )  // Popup state leaks to other screens

// GOOD: Use UpdateContext
UpdateContext( { locShowPopup: true } )

// BAD: Multiple Set calls for related values
Set( varName, "John" );
Set( varAge, 30 );
Set( varEmail, "john@email.com" )

// GOOD: Use a single record variable
Set( varPerson, { Name: "John", Age: 30, Email: "john@email.com" } )

// BAD: Forgetting record syntax for UpdateContext
UpdateContext( locValue: 5 )  // Error!

// GOOD: Use curly braces
UpdateContext( { locValue: 5 } )
```

---

## Variable Scope Diagram

```
App Level (Set)
├── varCurrentUser     ← Available everywhere
├── varAppSettings     ← Available everywhere
│
Screen1 (UpdateContext)
├── locIsEditing       ← Only on Screen1
├── locSelectedID      ← Only on Screen1
│
Screen2 (UpdateContext)
├── locShowPopup       ← Only on Screen2
├── locFormValid       ← Only on Screen2
```

---

## Sources

- [Microsoft Learn: Set function](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-set)
- [Microsoft Learn: UpdateContext function](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-updatecontext)
