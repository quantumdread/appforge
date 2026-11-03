# Blank, IsBlank, IsEmpty, Coalesce Functions

Functions for handling "no value" scenarios.

---

## Key Concepts

| Concept | Description | Test Function |
|---------|-------------|---------------|
| **Blank** | No value / NULL | `IsBlank()` |
| **Empty String** | String with zero characters `""` | `IsBlank()` returns true |
| **Empty Table** | Table with no records | `IsEmpty()` |

---

## Blank Function

Creates a blank (null) value.

### Syntax

```powerfx
Blank()
```

### Examples

```powerfx
// Clear a variable
Set( varSelected, Blank() )

// Clear a field in data source (set to NULL)
Patch( Products, ThisItem, { Description: Blank() } )

// Conditional blank
If( ShouldClear, Blank(), CurrentValue )
```

---

## IsBlank Function

Tests if value is blank OR empty string.

### Syntax

```powerfx
IsBlank( Value )
```

### Return Type

Boolean (`true` or `false`)

### Rules

1. Returns `true` for `Blank()`
2. Returns `true` for empty string `""`
3. Returns `false` for tables (use `IsEmpty` for tables)
4. Returns `false` for `0` or `false`

### Examples

```powerfx
IsBlank( Blank() )           // true
IsBlank( "" )                // true
IsBlank( "Hello" )           // false
IsBlank( 0 )                 // false
IsBlank( false )             // false
IsBlank( TextInput1.Text )   // true if empty

// Required field validation
If( IsBlank( txtName.Text ), "Name is required" )

// Conditional display
If( IsBlank( User.Photo ), "No photo", "Has photo" )
```

### Test Blank Only (Not Empty String)

```powerfx
// Returns true only for Blank(), not for ""
Value = Blank()
```

---

## IsEmpty Function

Tests if a table has no records.

### Syntax

```powerfx
IsEmpty( Table )
```

### Return Type

Boolean (`true` or `false`)

### Equivalent To

```powerfx
CountRows( Table ) = 0
```

### Examples

```powerfx
IsEmpty( Products )                              // false if has records
IsEmpty( [] )                                    // true (empty inline table)
IsEmpty( Filter( Orders, Status = "Pending" ) )  // true if no matches

// Conditional message
If( IsEmpty( Gallery1.AllItems ), "No items found" )

// Check before First()
If( !IsEmpty( Results ), First( Results ).Name, "No results" )

// Check for errors
If( !IsEmpty( Errors( DataSource ) ), "Has errors" )
```

---

## Coalesce Function

Returns first non-blank, non-empty value.

### Syntax

```powerfx
Coalesce( Value1 [, Value2, ... ] )
```

### Rules

1. Evaluates left to right
2. Stops at first non-blank, non-empty value
3. Returns blank if ALL values are blank/empty
4. All arguments must be same type

### Equivalent To

```powerfx
If( !IsBlank( Value1 ), Value1, !IsBlank( Value2 ), Value2, ... )
```

### Examples

```powerfx
Coalesce( Blank(), 1 )                    // 1
Coalesce( "", "Default" )                 // "Default"
Coalesce( Blank(), "", "Fallback" )       // "Fallback"
Coalesce( txtInput.Text, "No input" )     // Input or "No input"

// Default value pattern
Coalesce( UserSetting, AppDefault, "System Default" )

// Null-safe field access
Coalesce( Record.OptionalField, "N/A" )

// First available contact method
Coalesce( User.Mobile, User.Work, User.Home, "No phone" )

// Default numeric value
Coalesce( Record.Quantity, 0 )
```

---

## Common Patterns

### Required Field Validation

```powerfx
// Single field
If( IsBlank( txtEmail.Text ), "Email is required", "" )

// Multiple fields
If(
    IsBlank( txtName.Text ), "Name is required",
    IsBlank( txtEmail.Text ), "Email is required",
    ""
)
```

### Safe Property Access

```powerfx
// Avoid errors from blank records
Coalesce( LookUp( Users, ID = varID ).Name, "Unknown" )

// Safe gallery selected
If( !IsBlank( Gallery1.Selected ), Gallery1.Selected.ID, -1 )
```

### Default Values

```powerfx
// Form default
Coalesce( EditRecord.Status, "Draft" )

// Setting with fallback
Coalesce(
    LookUp( UserSettings, UserID = User().Email ).Theme,
    LookUp( AppSettings, Key = "DefaultTheme" ).Value,
    "Light"
)
```

### Conditional Display

```powerfx
// Show/hide based on data
Visible: !IsBlank( ThisItem.ImageURL )

// Text with fallback
Coalesce( ThisItem.Nickname, ThisItem.FirstName, "Anonymous" )
```

### Check Before Operations

```powerfx
// Safe navigation
If( !IsBlank( varSelectedID ),
    Navigate( DetailScreen ),
    Notify( "Please select an item" )
)

// Safe collection operation
If( !IsEmpty( colSelected ),
    ForAll( colSelected, Patch( ... ) ),
    Notify( "Nothing selected" )
)
```

---

## Comparison Table

| Value | IsBlank | IsEmpty | = Blank() |
|-------|---------|---------|-----------|
| `Blank()` | true | Error | true |
| `""` | true | Error | false |
| `"text"` | false | Error | false |
| `0` | false | Error | false |
| `false` | false | Error | false |
| `[]` (empty table) | false | true | false |
| `[1,2,3]` | false | false | false |

---

## Common Mistakes

```powerfx
// BAD: Using IsBlank on table
If( IsBlank( MyCollection ), ... )  // Always false!

// GOOD: Use IsEmpty for tables
If( IsEmpty( MyCollection ), ... )

// BAD: Comparing to empty string doesn't catch Blank
If( Value = "", "Empty" )  // Misses Blank()

// GOOD: Use IsBlank to catch both
If( IsBlank( Value ), "Empty or blank" )

// BAD: Coalesce with wrong types
Coalesce( NumericField, "Default" )  // Type mismatch!

// GOOD: Match types
Coalesce( NumericField, 0 )
Coalesce( Text( NumericField ), "Default" )
```

---

## Sources

- [Microsoft Learn: Blank, Coalesce, IsBlank, IsEmpty](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-isblank-isempty)
