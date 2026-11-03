# Concatenate and Concat Functions

## Concatenate Function

Joins individual text strings into a single string.

### Syntax

```powerfx
Concatenate( String1 [, String2, ... ] )
```

### Alternative: & Operator

```powerfx
String1 & String2 & String3
```

### Rules

1. **Type coercion**: Non-text values are converted to text
2. **Blank handling**: Blank values are treated as empty strings
3. **Prefer &**: The `&` operator is more readable for simple cases

### Examples

```powerfx
// Basic concatenation
Concatenate( "Hello", " ", "World" )      // "Hello World"
"Hello" & " " & "World"                   // "Hello World" (same)

// With variables
Concatenate( FirstName, " ", LastName )   // "John Doe"
FirstName & " " & LastName                // "John Doe" (same)

// With numbers (auto-converted to text)
"Total: " & Sum( Orders, Amount )         // "Total: 1234.56"

// Building file paths
Concatenate( FolderPath, "/", FileName )

// Multi-line (use Char(10) for line break)
"Line 1" & Char(10) & "Line 2"
```

---

## Concat Function

Concatenates a column across all records in a table.

### Syntax

```powerfx
Concat( Table, Formula [, Separator ] )
```

### Parameters

| Parameter | Required | Type | Description |
|-----------|----------|------|-------------|
| Table | Yes | Table | Table to process |
| Formula | Yes | Text | Formula returning text for each record |
| Separator | No | Text | Text inserted between each value |

### Rules

1. **Record scope**: `ThisRecord` available within formula
2. **No trailing separator**: Separator only appears between values
3. **Empty table**: Returns empty string for empty tables

### Examples

```powerfx
// Simple column concatenation
Concat( Products, Name, ", " )
// "Widget, Gadget, Thing"

// With quotes
Concat( Products, "'" & Name & "'", ", " )
// "'Widget', 'Gadget', 'Thing'"

// With filtering
Concat( Filter( Products, InStock ), Name, ", " )

// Building comma-separated IDs
Concat( Gallery1.AllItems, Text( ID ), "," )
// "1,2,3,4,5"

// Email list
Concat( SelectedUsers, Email, "; " )
// "user1@email.com; user2@email.com"

// HTML list items
"<ul>" & Concat( Items, "<li>" & Title & "</li>" ) & "</ul>"
```

---

## Common Patterns

### Build Comma-Separated List

```powerfx
Concat( colSelectedItems, Name, ", " )
```

### Create SQL IN Clause Values

```powerfx
"(" & Concat( SelectedIDs, "'" & Text(ID) & "'", "," ) & ")"
// "('1','2','3')"
```

### Merge Address Fields

```powerfx
Concatenate(
    Street,
    Char(10),
    City, ", ", State, " ", PostalCode
)
```

### Display Selected Checkboxes

```powerfx
Concat(
    Filter( CheckboxOptions, IsSelected ),
    Label,
    ", "
)
```

### Build Query String

```powerfx
"?" & Concat(
    colParameters,
    Key & "=" & EncodeUrl( Value ),
    "&"
)
// "?name=John&city=Seattle"
```

---

## Comparison

| Use Case | Function |
|----------|----------|
| Join 2-3 fixed strings | `&` operator |
| Join many fixed strings | `Concatenate()` |
| Join values from table/collection | `Concat()` |
| Build repeated patterns | `Concat()` with `Sequence()` |

---

## Special Characters

```powerfx
Char(10)    // Line feed (new line)
Char(13)    // Carriage return
Char(9)     // Tab
Char(34)    // Double quote
```

### Example: Multi-line Text

```powerfx
"Name: " & Name & Char(10) &
"Email: " & Email & Char(10) &
"Phone: " & Phone
```

---

## Sources

- [Microsoft Learn: Concat and Concatenate](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-concatenate)
