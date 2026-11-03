# Basic Mathematical Functions

Abs, Exp, Ln, Log, Power, Sqrt - Core mathematical operations.

---

## Abs Function

Returns the absolute (non-negative) value.

### Syntax

```powerfx
Abs( Number )
Abs( SingleColumnTable )
```

### Examples

```powerfx
Abs( -55 )              // 55
Abs( 55 )               // 55
Abs( -3.5 )             // 3.5
Abs( 0 )                // 0

// Calculate difference (always positive)
Abs( Value1 - Value2 )
```

---

## Sqrt Function

Returns the square root.

### Syntax

```powerfx
Sqrt( Number )
```

### Examples

```powerfx
Sqrt( 9 )               // 3
Sqrt( 16 )              // 4
Sqrt( 2 )               // 1.414213...
Sqrt( -1 )              // Blank (undefined)
```

---

## Power Function

Returns a number raised to a power.

### Syntax

```powerfx
Power( Base, Exponent )
```

### Alternative

```powerfx
Base ^ Exponent
```

### Examples

```powerfx
Power( 5, 3 )           // 125 (5³)
Power( 2, 10 )          // 1024 (2¹⁰)
Power( 10, 2 )          // 100 (10²)
Power( 4, 0.5 )         // 2 (square root of 4)

// Using ^ operator
5 ^ 3                   // 125
2 ^ 10                  // 1024
```

---

## Exp Function

Returns e raised to a power (e ≈ 2.71828).

### Syntax

```powerfx
Exp( Number )
```

### Examples

```powerfx
Exp( 0 )                // 1
Exp( 1 )                // 2.71828... (e)
Exp( 2 )                // 7.38906... (e²)
```

---

## Ln Function

Returns the natural logarithm (base e).

### Syntax

```powerfx
Ln( Number )
```

### Examples

```powerfx
Ln( 1 )                 // 0
Ln( 2.71828 )           // ~1 (ln of e)
Ln( 100 )               // 4.60517...
Ln( 0 )                 // Blank (undefined)
Ln( -1 )                // Blank (undefined)
```

---

## Log Function

Returns logarithm in specified base.

### Syntax

```powerfx
Log( Number [, Base ] )
```

### Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| Number | Yes | - | Value to take log of |
| Base | No | 10 | Logarithm base |

### Examples

```powerfx
Log( 100 )              // 2 (log₁₀ 100)
Log( 1000 )             // 3 (log₁₀ 1000)
Log( 64, 2 )            // 6 (log₂ 64)
Log( 81, 3 )            // 4 (log₃ 81)
Log( 0 )                // Blank (undefined)
```

---

## Single-Column Table Support

All functions work with single-column tables:

```powerfx
// Table with Value column: [9, 4, 16]
Sqrt( ValueTable )      // Returns table: [3, 2, 4]
Abs( ValueTable )       // Returns table: [9, 4, 16]
```

---

## Common Patterns

### Distance Calculation

```powerfx
Sqrt( Power( X2 - X1, 2 ) + Power( Y2 - Y1, 2 ) )
```

### Percentage Difference

```powerfx
Abs( (NewValue - OldValue) / OldValue ) * 100
```

### Compound Interest

```powerfx
Principal * Power( 1 + Rate, Years )
```

### Logarithmic Scale

```powerfx
Log( Value ) / Log( MaxValue ) * 100
```

---

## Notes

- Functions return **Blank** for undefined results (negative sqrt, log of 0, etc.)
- Works in: Canvas apps, Dataverse formula columns, Model-driven apps, Power Pages

---

## Sources

- [Microsoft Learn: Mathematical functions](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-numericals)
