# Rounding Functions

Round, RoundDown, RoundUp, Trunc, Int - Round numbers to specified precision.

---

## Function Overview

| Function | Description | Direction |
|----------|-------------|-----------|
| `Round` | Round to nearest | Up if ≥5, down if <5 |
| `RoundUp` | Always round away from zero | Up |
| `RoundDown` | Always round toward zero | Down |
| `Trunc` | Remove decimal portion | Toward zero |
| `Int` | Round to integer | Down (toward -∞) |

---

## Round, RoundDown, RoundUp

### Syntax

```powerfx
Round( Number, DecimalPlaces )
RoundDown( Number, DecimalPlaces )
RoundUp( Number, DecimalPlaces )
```

### DecimalPlaces Parameter

| Value | Effect |
|-------|--------|
| > 0 | Round to N decimal places |
| 0 | Round to integer |
| < 0 | Round to left of decimal |

### Examples with DecimalPlaces

```powerfx
// Two decimal places
Round( 430.125, 2 )         // 430.13
RoundDown( 430.129, 2 )     // 430.12
RoundUp( 430.121, 2 )       // 430.13

// Zero decimal places (integer)
Round( 7.5, 0 )             // 8
Round( 7.4, 0 )             // 7
RoundDown( 7.9, 0 )         // 7
RoundUp( 7.1, 0 )           // 8

// Negative decimal places (left of decimal)
Round( 450, -2 )            // 500
RoundDown( 499, -2 )        // 400
RoundUp( 401, -2 )          // 500
Round( 1234, -3 )           // 1000
```

---

## Int and Trunc

### Syntax

```powerfx
Int( Number )
Trunc( Number )
```

### Key Difference

| | Positive | Negative |
|-|----------|----------|
| **Int** | Down | Down (toward -∞) |
| **Trunc** | Toward zero | Toward zero |

### Examples

```powerfx
// Positive numbers (same result)
Int( 7.9 )                  // 7
Trunc( 7.9 )                // 7

// Negative numbers (DIFFERENT!)
Int( -7.9 )                 // -8 (toward -∞)
Trunc( -7.9 )               // -7 (toward zero)

Int( -7.1 )                 // -8
Trunc( -7.1 )               // -7
```

---

## Comparison Table

| Number | Round(x,0) | RoundUp(x,0) | RoundDown(x,0) | Int(x) | Trunc(x) |
|--------|------------|--------------|----------------|--------|----------|
| 7.9 | 8 | 8 | 7 | 7 | 7 |
| 7.5 | 8 | 8 | 7 | 7 | 7 |
| 7.1 | 7 | 8 | 7 | 7 | 7 |
| -7.1 | -7 | -8 | -7 | -8 | -7 |
| -7.5 | -8 | -8 | -7 | -8 | -7 |
| -7.9 | -8 | -8 | -7 | -8 | -7 |

---

## Common Patterns

### Currency Formatting

```powerfx
// Round to cents
Round( Price * Quantity, 2 )

// Always round up (e.g., pricing)
RoundUp( Cost * 1.15, 2 )
```

### Percentage Display

```powerfx
// Round percentage to 1 decimal
Round( Value / Total * 100, 1 ) & "%"
```

### Remove Decimals

```powerfx
// Equivalent approaches
Trunc( Number )
Int( Number )              // Different for negatives!
Round( Number, 0 )         // May round up
RoundDown( Number, 0 )     // Same as Trunc for positives
```

### Round to Nearest 5

```powerfx
Round( Number / 5, 0 ) * 5
```

### Round to Nearest 10

```powerfx
Round( Number, -1 )
```

### Round to Nearest 100

```powerfx
Round( Number, -2 )
```

### Ceiling Function (Round Up)

```powerfx
// Round up to next integer
-Int( -Number )
// or
RoundUp( Number, 0 )
```

### Floor Function (Round Down)

```powerfx
// Round down to previous integer
Int( Number )              // Works for positive
Trunc( Number )            // Works for all
```

### Calculate Whole Units + Remainder

```powerfx
// Whole units
Trunc( TotalItems / PackSize )

// Remainder
Mod( TotalItems, PackSize )
```

---

## Use Cases

| Scenario | Function |
|----------|----------|
| Currency calculations | `Round( x, 2 )` |
| Always round up for pricing | `RoundUp( x, 2 )` |
| Truncate for whole units | `Trunc( x )` |
| Get integer part | `Int( x )` or `Trunc( x )` |
| Round to nearest 10/100 | `Round( x, -1 )` / `Round( x, -2 )` |
| Conservative estimate | `RoundDown( x, 0 )` |

---

## Single-Column Table Support

All functions work with single-column tables:

```powerfx
Round( ValueTable, 2 )      // Round all values to 2 decimals
Int( NumberColumn )         // Get integer portion of all values
```

---

## Sources

- [Microsoft Learn: Rounding functions](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-round)
