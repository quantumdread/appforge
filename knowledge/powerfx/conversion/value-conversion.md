# Value Function and Type Conversion

Convert text and other types to numbers.

---

## Value Function

Converts text strings to numbers.

### Syntax

```powerfx
Value( String [, LanguageTag ] )
Value( Dynamic )
```

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| String | Yes | Text to convert |
| LanguageTag | No | Language for parsing (e.g., "en-US") |

---

## Basic Examples

```powerfx
Value( "123" )                    // 123
Value( "123.45" )                 // 123.45
Value( "-42" )                    // -42
Value( "  100  " )                // 100 (trims whitespace)
```

---

## Special Formats

### Percentages

```powerfx
Value( "50%" )                    // 0.5
Value( "12.5%" )                  // 0.125
Value( "100%" )                   // 1
```

### Currency

```powerfx
Value( "$100" )                   // 100
Value( "$1,234.56" )              // 1234.56
Value( "€50" )                    // 50 (with appropriate locale)
```

### Scientific Notation

```powerfx
Value( "1e3" )                    // 1000
Value( "2.5e2" )                  // 250
Value( "1.5e-2" )                 // 0.015
```

---

## Locale Handling

Different locales use different decimal/thousands separators.

### English (en-US)

- Decimal: `.` (period)
- Thousands: `,` (comma)

```powerfx
Value( "1,234.56" )               // 1234.56
Value( "1.234.56" )               // Error
```

### Spanish/German (es-ES, de-DE)

- Decimal: `,` (comma)
- Thousands: `.` (period)

```powerfx
Value( "1.234,56", "es-ES" )      // 1234.56
Value( "1,234.56", "es-ES" )      // 1234.56 (comma as thousands)
```

### Explicit Locale

```powerfx
// Force US interpretation
Value( "1,234.56", "en-US" )      // 1234.56

// Force European interpretation
Value( "1.234,56", "de-DE" )      // 1234.56
```

---

## Boolean Conversion

```powerfx
Value( true )                     // 1
Value( false )                    // 0
```

---

## Error Cases

```powerfx
Value( "abc" )                    // Error (can't convert)
Value( "" )                       // Error (empty string)
Value( Blank() )                  // Blank

// Safe conversion
IfError( Value( txtInput.Text ), 0 )
```

---

## Related Conversion Functions

| Function | Converts To |
|----------|-------------|
| `Value()` | Number |
| `Text()` | Text |
| `Boolean()` | Boolean |
| `DateValue()` | Date |
| `TimeValue()` | Time |
| `DateTimeValue()` | DateTime |
| `GUID()` | GUID |
| `ColorValue()` | Color |

---

## Common Patterns

### Form Input Validation

```powerfx
// Check if valid number
!IsError( Value( txtNumber.Text ) )

// Convert with default
Coalesce( IfError( Value( txtNumber.Text ), Blank() ), 0 )
```

### Parse User Input

```powerfx
// Price input
Set( varPrice, IfError( Value( txtPrice.Text ), 0 ) )

// Quantity with validation
If( IsBlank( txtQty.Text ),
    Notify( "Quantity required" ),
    !IsError( Value( txtQty.Text ) ),
    Set( varQty, Value( txtQty.Text ) ),
    Notify( "Enter a valid number" )
)
```

### Parameter Conversion

```powerfx
// URL parameter to number
Value( Param( "recordId" ) )

// With fallback
Coalesce( Value( Param( "page" ) ), 1 )
```

### Calculate from Text Fields

```powerfx
// Sum of text inputs
Value( txt1.Text ) + Value( txt2.Text ) + Value( txt3.Text )

// With error handling
Sum(
    IfError( Value( txt1.Text ), 0 ),
    IfError( Value( txt2.Text ), 0 ),
    IfError( Value( txt3.Text ), 0 )
)
```

---

## Float and Decimal

For specific numeric types:

```powerfx
// Decimal (default, higher precision)
Decimal( "123.456789" )

// Float (larger range, less precision)
Float( "1e308" )
```

---

## Text to Number in Formulas

```powerfx
// Direct calculation (auto-converts)
"100" + 50                        // Error! Use Value()

// Correct
Value( "100" ) + 50               // 150

// With Text input control
Value( TextInput1.Text ) * 2
```

---

## Sources

- [Microsoft Learn: Value function](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-value)
