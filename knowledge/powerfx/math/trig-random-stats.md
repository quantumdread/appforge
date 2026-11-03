# Trigonometric, Random, and Statistical Functions

Sin, Cos, Tan, Asin, Acos, Atan, Atan2, Cot, Acot, Degrees, Radians, Rand, RandBetween, Mod, Pi, StdevP, VarP - Trigonometry, randomization, and statistical calculations.

---

## Trigonometric Functions Overview

All trigonometric functions work with **radians** by default. Convert to/from degrees as needed.

| Function | Input | Returns | Range |
|----------|-------|---------|-------|
| `Sin` | Radians | Sine | -1 to 1 |
| `Cos` | Radians | Cosine | -1 to 1 |
| `Tan` | Radians | Tangent | Any number |
| `Asin` | -1 to 1 | Radians | -π/2 to π/2 |
| `Acos` | -1 to 1 | Radians | 0 to π |
| `Atan` | Any number | Radians | -π/2 to π/2 |
| `Cot` | Radians | Cotangent | Any number |
| `Acot` | Any number | Radians | 0 to π |

---

## Pi Constant

Returns the mathematical constant π (pi).

### Syntax

```powerfx
Pi()
```

### Examples

```powerfx
Pi()                        // 3.14159265358979...
Pi() * 2                    // Full circle in radians
Pi() / 2                    // 90 degrees in radians
2 * Pi() * Radius           // Circumference of circle
```

### Common Values

| Description | Formula | Value |
|-------------|---------|-------|
| 90 degrees | `Pi() / 2` | 1.5708... |
| 180 degrees | `Pi()` | 3.14159... |
| 360 degrees | `2 * Pi()` | 6.28318... |
| 45 degrees | `Pi() / 4` | 0.78539... |
| 30 degrees | `Pi() / 6` | 0.52359... |

---

## Sin Function

Returns the sine of an angle in radians.

### Syntax

```powerfx
Sin( Radians )
Sin( SingleColumnTable )
```

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| Radians | Yes | Angle in radians |

### Return Value

Number between -1 and 1.

### Examples

```powerfx
Sin( 0 )                    // 0
Sin( Pi() / 2 )             // 1 (90 degrees)
Sin( Pi() )                 // 0 (180 degrees)
Sin( 3 * Pi() / 2 )         // -1 (270 degrees)

// Convert from degrees first
Sin( 45 * Pi() / 180 )      // 0.707... (sine of 45 degrees)

// Use Radians function
Sin( Radians( 90 ) )        // 1
Sin( Radians( 45 ) )        // 0.707...
```

### Common Use Cases

- **Wave calculations**: Oscillating values over time
- **Circular motion**: X/Y coordinates on a circle
- **Periodic animations**: Smooth repeating movements
- **Physics calculations**: Simple harmonic motion

### Use Case: Circle Point Coordinates

```powerfx
// Get point on circle (Radius R, Angle A)
{
    X: CenterX + Radius * Cos( Radians( Angle ) ),
    Y: CenterY + Radius * Sin( Radians( Angle ) )
}
```

---

## Cos Function

Returns the cosine of an angle in radians.

### Syntax

```powerfx
Cos( Radians )
Cos( SingleColumnTable )
```

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| Radians | Yes | Angle in radians |

### Return Value

Number between -1 and 1.

### Examples

```powerfx
Cos( 0 )                    // 1
Cos( Pi() / 2 )             // 0 (90 degrees)
Cos( Pi() )                 // -1 (180 degrees)
Cos( 3 * Pi() / 2 )         // 0 (270 degrees)

// Convert from degrees first
Cos( 60 * Pi() / 180 )      // 0.5 (cosine of 60 degrees)

// Using Radians function
Cos( Radians( 0 ) )         // 1
Cos( Radians( 90 ) )        // 0
Cos( Radians( 180 ) )       // -1
```

### Common Use Cases

- **X-axis positioning**: On circular paths
- **Wave calculations**: Cosine waves
- **Lighting calculations**: Directional intensity
- **Distance calculations**: Adjacent side in right triangle

### Use Case: Smooth Animation

```powerfx
// Oscillate between 0 and 1 (easing curve)
(1 + Cos( Radians( TimerValue ) )) / 2
```

---

## Tan Function

Returns the tangent of an angle in radians.

### Syntax

```powerfx
Tan( Radians )
Tan( SingleColumnTable )
```

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| Radians | Yes | Angle in radians |

### Return Value

Number (unbounded).

### Examples

```powerfx
Tan( 0 )                    // 0
Tan( Pi() / 4 )             // 1 (45 degrees)
Tan( Radians( 30 ) )        // 0.577... (tangent of 30 degrees)
Tan( Radians( 60 ) )        // 1.732... (tangent of 60 degrees)

// Undefined at 90 degrees (vertical asymptote)
Tan( Pi() / 2 )             // Approaches infinity

// Useful for slopes
Slope = Tan( Radians( 30 ) ) // 0.577 (rise/run for 30-degree angle)
```

### Common Use Cases

- **Slope calculations**: Rise over run
- **Angle-to-slope conversion**: From angle to gradient
- **Physics**: Projectile motion calculations
- **Geometry**: Tangent line calculations

### Use Case: Slope from Angle

```powerfx
// If you know angle, get slope
Slope = Tan( Radians( AngleDegrees ) )

// If you know slope, get angle (use Atan)
Angle = Degrees( Atan( Slope ) )
```

---

## Asin Function

Returns the arcsine (inverse sine) in radians.

### Syntax

```powerfx
Asin( Number )
Asin( SingleColumnTable )
```

### Parameters

| Parameter | Required | Domain | Description |
|-----------|----------|--------|-------------|
| Number | Yes | -1 to 1 | Sine value |

### Return Value

Radians between -π/2 and π/2 (-1.5708... to 1.5708...).

### Examples

```powerfx
Asin( 0 )                   // 0
Asin( 0.5 )                 // 0.5236... (30 degrees)
Asin( 0.707 )               // 0.7854... (45 degrees)
Asin( 1 )                   // 1.5708... (90 degrees)
Asin( -0.5 )                // -0.5236... (-30 degrees)

// Convert to degrees
Degrees( Asin( 0.5 ) )      // 30
Degrees( Asin( 0.707 ) )    // 45

// Outside valid range returns blank
Asin( 2 )                   // Blank (invalid)
Asin( -1.5 )                // Blank (invalid)
```

### Common Use Cases

- **Angle recovery**: When you know the sine value
- **Sound wave analysis**: Finding phase angles
- **Vector operations**: Calculating angles from sine components
- **Geometry**: Finding angles in right triangles

### Use Case: Find Angle from Opposite/Hypotenuse

```powerfx
// In right triangle: angle = arcsin(opposite / hypotenuse)
Angle = Degrees( Asin( OppositeLength / HypotenuseLength ) )
```

---

## Acos Function

Returns the arccosine (inverse cosine) in radians.

### Syntax

```powerfx
Acos( Number )
Acos( SingleColumnTable )
```

### Parameters

| Parameter | Required | Domain | Description |
|-----------|----------|--------|-------------|
| Number | Yes | -1 to 1 | Cosine value |

### Return Value

Radians between 0 and π (0 to 3.14159...).

### Examples

```powerfx
Acos( 1 )                   // 0
Acos( 0.5 )                 // 1.0472... (60 degrees)
Acos( 0.707 )               // 0.7854... (45 degrees)
Acos( 0 )                   // 1.5708... (90 degrees)
Acos( -1 )                  // 3.14159... (180 degrees)

// Convert to degrees
Degrees( Acos( 0.5 ) )      // 60
Degrees( Acos( 0 ) )        // 90
Degrees( Acos( -1 ) )       // 180

// Outside valid range returns blank
Acos( 2 )                   // Blank (invalid)
```

### Common Use Cases

- **Angle recovery**: When you know the cosine value
- **Light angle calculations**: From intensity ratios
- **Vector dot product**: Finding angle between vectors
- **Physics**: Finding angles in rotational systems

### Use Case: Angle Between Two Vectors

```powerfx
// Angle between vectors using dot product
DotProduct = V1X * V2X + V1Y * V2Y;
Magnitude1 = Sqrt( V1X ^ 2 + V1Y ^ 2 );
Magnitude2 = Sqrt( V2X ^ 2 + V2Y ^ 2 );
Angle = Degrees( Acos( DotProduct / (Magnitude1 * Magnitude2) ) )
```

---

## Atan Function

Returns the arctangent (inverse tangent) in radians.

### Syntax

```powerfx
Atan( Number )
Atan( SingleColumnTable )
```

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| Number | Yes | Tangent value (any number) |

### Return Value

Radians between -π/2 and π/2.

### Examples

```powerfx
Atan( 0 )                   // 0
Atan( 1 )                   // 0.7854... (45 degrees)
Atan( 0.577 )               // 0.5236... (30 degrees)
Atan( 1.732 )               // 1.0472... (60 degrees)
Atan( -1 )                  // -0.7854... (-45 degrees)

// Convert to degrees
Degrees( Atan( 1 ) )        // 45
Degrees( Atan( 0.577 ) )    // 30

// Works with any number
Atan( 100 )                 // 1.5608... (approaching π/2)
Atan( -100 )                // -1.5608... (approaching -π/2)
```

### Common Use Cases

- **Slope to angle**: Converting slope to angle
- **Cursor direction**: Angle from mouse/touch position
- **Targeting**: Finding aim angle to target
- **Navigation**: Heading from X/Y displacement

### Use Case: Angle to Target from Mouse

```powerfx
// Calculate angle from current position to mouse
// Use Atan2 instead of Atan for proper quadrant handling
DeltaX = MouseX - CurrentX;
DeltaY = MouseY - CurrentY;
AngleToMouse = Degrees( Atan2( DeltaX, DeltaY ) )
```

---

## Atan2 Function

Returns the arctangent of Y/X coordinates in radians, handling all quadrants.

### Syntax

```powerfx
Atan2( X, Y )
```

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| X | Yes | X-axis coordinate |
| Y | Yes | Y-axis coordinate |

### Return Value

Radians between -π and π (excluding -π).

### Benefits

- Handles all four quadrants correctly
- Avoids division by zero errors
- More accurate than Atan(Y/X)

### Examples

```powerfx
// Angle from origin to different quadrants
// Note: Atan2(X, Y) - X is first parameter
Atan2( 5, 3 )               // 0.5404... (~31 degrees)
Atan2( 4, 4 )               // 0.7854... (45 degrees, Q1)
Atan2( -4, 4 )              // 2.3562... (135 degrees, Q2)
Atan2( -4, -4 )             // -2.3562... (-135 degrees, Q3)
Atan2( 4, -4 )              // -0.7854... (-45 degrees, Q4)

// Convert to degrees
Degrees( Atan2( 4, 4 ) )    // 45
Degrees( Atan2( -4, 4 ) )   // 135
Degrees( Atan2( -4, -4 ) )  // -135 (or 225 with adjustment)
Degrees( Atan2( 4, -4 ) )   // -45

// Cardinal directions (X, Y)
Atan2( 0, 1 )               // 1.5708... (90 degrees, North)
Atan2( 0, -1 )              // -1.5708... (-90 degrees, South)
Atan2( 1, 0 )               // 0 (East)
Atan2( -1, 0 )              // 3.14159... (West)
```

### Common Use Cases

- **2D positioning**: Finding angle from coordinates
- **Game development**: Aiming, rotation, steering
- **Navigation**: Compass heading from displacement
- **Graphics**: Rotating objects toward targets
- **Compass calculations**: True bearing

### Use Case: Rotate Object Toward Target

```powerfx
// Calculate angle to target (X first, then Y)
TargetAngle = Atan2( TargetX - CurrentX, TargetY - CurrentY );

// Apply rotation
Rotate = Degrees( TargetAngle )

// Smooth rotation
RotationSpeed = 90; // degrees per second
CurrentRotation = If(
    Abs(TargetAngle - CurrentRotation) < RotationSpeed * dt,
    TargetAngle,
    CurrentRotation + Sign(TargetAngle - CurrentRotation) * RotationSpeed * dt
)
```

---

## Cot Function

Returns the cotangent of an angle in radians.

### Syntax

```powerfx
Cot( Radians )
Cot( SingleColumnTable )
```

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| Radians | Yes | Angle in radians |

### Return Value

Number (unbounded).

### Relationship

Cot(x) = 1 / Tan(x) = Cos(x) / Sin(x)

### Examples

```powerfx
Cot( Pi() / 4 )             // 1 (45 degrees)
Cot( Radians( 30 ) )        // 1.732... (30 degrees)
Cot( Radians( 60 ) )        // 0.577... (60 degrees)
Cot( Pi() / 2 )             // 0 (90 degrees)

// Using identity: 1 / Tan(x)
1 / Tan( Radians( 45 ) )    // 1 (same as Cot)

// Near 0 or π, approaches infinity
Cot( 0.1 )                  // 9.966... (approaching infinity)
Cot( Pi() - 0.1 )           // -9.966... (approaching -infinity)
```

### Common Use Cases

- **Geometry**: Cotangent slope calculations
- **Physics**: Angular relationships
- **Trigonometric identities**: Mathematical calculations
- **Less common**: Rarely used in typical applications

### Use Case: Inverse Slope

```powerfx
// Cotangent useful for "inverse" tangent relationships
Angle = Radians( 30 );
Cot( Angle )                // 1.732 (run/rise rather than rise/run)
```

---

## Acot Function

Returns the arccotangent (inverse cotangent) in radians.

### Syntax

```powerfx
Acot( Number )
Acot( SingleColumnTable )
```

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| Number | Yes | Cotangent value (any number) |

### Return Value

Radians between 0 and π.

### Relationship

- Acot(x) = π/2 - Atan(x) for most values
- Or: Acot(x) = Atan(1/x) with quadrant adjustments

### Examples

```powerfx
Acot( 1 )                   // 0.7854... (45 degrees)
Acot( 0.577 )               // 1.0472... (60 degrees)
Acot( 1.732 )               // 0.5236... (30 degrees)
Acot( 0 )                   // 1.5708... (90 degrees)

// Convert to degrees
Degrees( Acot( 1 ) )        // 45
Degrees( Acot( 0.577 ) )    // 60

// Extreme values approach limits
Acot( 100 )                 // 0.01 (approaching 0)
Acot( 0.01 )                // 1.5608... (approaching π/2)
Acot( -1 )                  // 2.3562... (135 degrees)
```

### Common Use Cases

- **Inverse cotangent operations**: When working with cot values
- **Mathematical identity**: Trigonometric calculations
- **Less common**: Rarely used in typical applications

### Use Case: Recover Angle from Cotangent

```powerfx
// If you have a cotangent value and need the angle
CotValue = 1.732;  // Cot of 30 degrees
Angle = Degrees( Acot( CotValue ) )  // Returns 30
```

---

## Degrees Function

Converts radians to degrees.

### Syntax

```powerfx
Degrees( Radians )
Degrees( SingleColumnTable )
```

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| Radians | Yes | Angle in radians |

### Return Value

Number (angle in degrees).

### Formula

Degrees = Radians * 180 / π

### Examples

```powerfx
Degrees( 0 )                // 0
Degrees( Pi() / 2 )         // 90
Degrees( Pi() )             // 180
Degrees( 2 * Pi() )         // 360
Degrees( Pi() / 4 )         // 45
Degrees( Pi() / 6 )         // 30

// Convert trig results
Degrees( Sin( Radians( 45 ) ) )     // Returns sine of 45 degrees
Degrees( Asin( 0.5 ) )              // 30 (arcsin of 0.5)
Degrees( Atan( 1 ) )                // 45 (arctan of 1)
```

### Common Use Cases

- **User-friendly display**: Show angles in degrees instead of radians
- **Trig function results**: Convert arc functions output to degrees
- **UI interaction**: Most users think in degrees
- **Angle calculations**: Working with angle measurements

### Use Case: Display Angle in Degrees

```powerfx
// Calculate angle and display to user
AngleRad = Atan2( Y, X );
Label1.Text = Degrees( AngleRad ) & " degrees"
```

---

## Radians Function

Converts degrees to radians.

### Syntax

```powerfx
Radians( Degrees )
Radians( SingleColumnTable )
```

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| Degrees | Yes | Angle in degrees |

### Return Value

Number (angle in radians).

### Formula

Radians = Degrees * π / 180

### Examples

```powerfx
Radians( 0 )                // 0
Radians( 90 )               // 1.5708... (π/2)
Radians( 180 )              // 3.14159... (π)
Radians( 360 )              // 6.28318... (2π)
Radians( 45 )               // 0.7854... (π/4)
Radians( 30 )               // 0.5236... (π/6)

// Use with trig functions
Sin( Radians( 90 ) )        // 1 (sine of 90 degrees)
Cos( Radians( 180 ) )       // -1 (cosine of 180 degrees)
Tan( Radians( 45 ) )        // 1 (tangent of 45 degrees)
```

### Common Use Cases

- **Input conversion**: User provides angles in degrees
- **Trig calculations**: All trig functions use radians
- **Angle specification**: Define rotations in degrees
- **Formula clarity**: Make formulas more readable to non-mathematicians

### Use Case: Rotate Element by User-Specified Degrees

```powerfx
// User inputs angle in degrees via slider (0-360)
RotationAngle = Radians( SliderAngle.Value );
Image1.Rotation = RotationAngle

// Or keep display in degrees
Image1.Rotation = SliderAngle.Value * Pi() / 180
```

---

## Rand Function

Returns a random decimal number between 0 and 1.

### Syntax

```powerfx
Rand()
```

### Return Value

Number >= 0 and < 1.

### Examples

```powerfx
Rand()                      // 0.234... (different each time)
Rand()                      // 0.891...
Rand()                      // 0.123...

// Scale to range
Rand() * 100                // 0 to 100
Rand() * 255                // 0 to 255 (color value)
Rand() * 10 + 5             // 5 to 15
Int( Rand() * 6 ) + 1       // 1 to 6 (dice roll)

// Percentage
Rand() * 100 & "%"          // "45.2%"

// Random boolean (50/50)
Rand() < 0.5                // True or False

// Multiple independent values
{
    R: Int( Rand() * 256 ),
    G: Int( Rand() * 256 ),
    B: Int( Rand() * 256 )
}
```

### Common Use Cases

- **Game mechanics**: Dice rolls, random events
- **Randomized values**: Shuffling, lotteries
- **Randomized UI**: Varying animations, positions
- **A/B testing**: Random assignment
- **Color generation**: Random RGB values

### Use Case: Random Color

```powerfx
// Generate random color
{
    R: Int( Rand() * 256 ),
    G: Int( Rand() * 256 ),
    B: Int( Rand() * 256 ),
    A: 1
}

// Or RGB formula
RGBA( Int(Rand()*256), Int(Rand()*256), Int(Rand()*256), 1 )
```

### Use Case: Random Item from List

```powerfx
// Pick random item from table
RandomIndex = Int( Rand() * CountRows( Items ) ) + 1;
RandomItem = Index( Items, RandomIndex )
```

---

## RandBetween Function

Returns a random integer between two values, inclusive.

### Syntax

```powerfx
RandBetween( Bottom, Top )
```

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| Bottom | Yes | Lower bound (inclusive) |
| Top | Yes | Upper bound (inclusive) |

### Return Value

Random integer >= Bottom and <= Top.

### Examples

```powerfx
RandBetween( 1, 10 )        // Random integer 1 to 10
RandBetween( 0, 1 )         // 0 or 1 (coin flip)
RandBetween( 1, 6 )         // Dice roll
RandBetween( 1, 52 )        // Card from deck
RandBetween( -10, 10 )      // -10 to 10
RandBetween( 50, 100 )      // 50 to 100 percent

// Weighted selection
If( RandBetween(1,100) <= 30, "Common", "Rare" )

// Generate multiple random values
Sequence( 10, 1, 1 ),
RandBetween( 1, 100 )

// Time-based seed variation
RandBetween( Hour(Now()), 24 )
```

### Common Use Cases

- **Game mechanics**: Dice rolls, card draws
- **Random sampling**: Selecting items by position
- **Randomized UI**: Random layout options
- **Testing**: Generating test data
- **Probability simulations**: Random events

### Use Case: Weighted Random Selection

```powerfx
// 70% chance of Common, 20% Uncommon, 10% Rare
RandomValue = RandBetween( 1, 100 );
Rarity = If(
    RandomValue <= 70,
    "Common",
    If(RandomValue <= 90, "Uncommon", "Rare")
)
```

### Use Case: Generate Random Test Data

```powerfx
// Create 100 random records
ForAll(
    Sequence( 100 ),
    {
        Name: "Item" & Value,
        Quantity: RandBetween( 1, 100 ),
        Price: RandBetween( 10, 1000 ) / 100,  // $0.10 to $10.00
        InStock: RandBetween( 0, 1 ) = 1
    }
)
```

---

## Mod Function

Returns the remainder after division.

### Syntax

```powerfx
Mod( Number, Divisor )
```

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| Number | Yes | Number to divide |
| Divisor | Yes | Number to divide by |

### Return Value

Remainder after division. **The result has the same sign as the divisor.**

### Examples

```powerfx
Mod( 10, 3 )                // 1 (10 / 3 = 3 remainder 1)
Mod( 17, 5 )                // 2 (17 / 5 = 3 remainder 2)
Mod( 20, 4 )                // 0 (20 / 4 = 5 remainder 0)
Mod( 100, 30 )              // 10
Mod( 7, 7 )                 // 0 (evenly divisible)

// Negative numbers - result sign follows DIVISOR
Mod( 25, 4 )                // 1
Mod( 25, -4 )               // -3 (sign matches divisor)
Mod( -25, 4 )               // 3 (sign matches divisor)
Mod( -25, -4 )              // -1 (sign matches divisor)

// Decimal remainder
Mod( 10.5, 3 )              // 1.5
Mod( 2.5, 0.5 )             // 0
```

### Common Use Cases

- **Divisibility testing**: Is number even/odd, divisible by N
- **Cycling through ranges**: Repeating patterns
- **Pagination**: Calculate page numbers, offsets
- **Alternating logic**: Zebra striping, alternating rows
- **Time calculations**: Hours, minutes, seconds conversion
- **Remainder calculations**: Split into groups with remainder

### Use Case: Determine Even or Odd

```powerfx
If( Mod( Number, 2 ) = 0, "Even", "Odd" )

// Practical example: alternate row colors
If( Mod( RowIndex, 2 ) = 0, Color.LightGray, Color.White )
```

### Use Case: Pagination

```powerfx
// Calculate starting index for page
PageSize = 10;
PageNumber = 3;
StartIndex = (PageNumber - 1) * PageSize + 1;

// Get remainder for last page
RemainingItems = Mod( TotalItems, PageSize );
LastPageItems = If( RemainingItems = 0, PageSize, RemainingItems )
```

### Use Case: Time Calculation

```powerfx
// Convert total seconds to HH:MM:SS
TotalSeconds = 3661;
Hours = Int( TotalSeconds / 3600 );
Minutes = Int( Mod( TotalSeconds, 3600 ) / 60 );
Seconds = Mod( TotalSeconds, 60 );
// Result: 1 hour, 1 minute, 1 second
```

### Use Case: Repeating Pattern

```powerfx
// Rotate through N colors
Colors = ["Red", "Green", "Blue"];
ItemColor = Index( Colors, Mod( ItemIndex - 1, 3 ) + 1 )

// Or use Index function with Mod
Index( Colors, Mod( ItemIndex, CountRows(Colors) ) + 1 )
```

---

## StdevP Function

Returns the population standard deviation of values.

### Syntax

```powerfx
StdevP( NumericalFormula1 [, NumericalFormula2, ... ] )
StdevP( Table, NumericalFormula )
```

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| NumericalFormula(s) | Yes | Numeric values to operate on |
| Table | Yes | Table to operate on |
| NumericalFormula | Yes | Formula to evaluate for each record |

### Return Value

Number (standard deviation of population).

### Important Notes

- **Not delegable**: StdevP cannot be delegated for any data sources. Only the first portion of data will be retrieved and the function applied locally. A delegation warning will appear at authoring time.
- **Numeric values only**: Other value types (strings, records) are ignored.
- **Population calculation**: Uses N as divisor (entire population).

### Examples

```powerfx
// Individual values
StdevP( 1, 2, 3, 4, 5 )     // 1.414...

// Slider values
StdevP( Slider1.Value, Slider2.Value, Slider3.Value )

// Table column
StdevP( Products, Price )   // Standard deviation of all prices

// Filtered data
StdevP( Filter( Sales, Year = 2024 ), Amount )

// With formula
StdevP( Orders, Amount * Quantity )
```

### Common Use Cases

- **Quality control**: Measure process variation
- **Risk assessment**: Volatility of investments
- **Data analysis**: Consistency of measurements
- **Statistical reporting**: Population-level metrics
- **Outlier detection**: Identify values beyond N standard deviations

### Use Case: Quality Control Alert

```powerfx
// Alert if measurement deviates from normal
AverageValue = Average( Measurements, Value );
StdDev = StdevP( Measurements, Value );
IsOutlier = Abs( NewMeasurement - AverageValue ) > 3 * StdDev;

Notify( "Measurement out of control!" )  // If IsOutlier
```

### Use Case: Assess Data Variability

```powerfx
// High stddev = high variability, low = consistent
AverageSales = Average( SalesData, Amount );
SalesVariability = StdevP( SalesData, Amount );
Consistency = AverageSales / SalesVariability;

Label1.Text = If(
    Consistency > 5,
    "Sales are consistent",
    "Sales are highly variable"
)
```

---

## VarP Function

Returns the population variance of values.

### Syntax

```powerfx
VarP( NumericalFormula1 [, NumericalFormula2, ... ] )
VarP( Table, NumericalFormula )
```

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| NumericalFormula(s) | Yes | Numeric values to operate on |
| Table | Yes | Table to operate on |
| NumericalFormula | Yes | Formula to evaluate for each record |

### Return Value

Number (variance of population).

### Important Notes

- **Not delegable**: VarP cannot be delegated for any data sources. Only the first portion of data will be retrieved and the function applied locally. A delegation warning will appear at authoring time.
- **Numeric values only**: Other value types (strings, records) are ignored.
- **Population calculation**: Uses N as divisor (entire population).

### Variance and Standard Deviation

| Relationship | Formula |
|--------------|---------|
| StdevP | Sqrt(VarP) |
| VarP | StdevP^2 |

### Examples

```powerfx
// Individual values
VarP( 1, 2, 3, 4, 5 )       // 2 (= 1.414^2)

// Slider values
VarP( Slider1.Value, Slider2.Value, Slider3.Value )

// Table column
VarP( Products, Price )     // Variance of all prices

// Relationship to StdevP
VarP( Values ) = Power( StdevP( Values ), 2 )
StdevP( Values ) = Sqrt( VarP( Values ) )

// With formula
VarP( Employees, Salary )
```

### Common Use Cases

- **Statistical analysis**: Variance in data
- **Risk measurement**: Portfolio variance
- **Performance metrics**: Consistency analysis
- **Mathematical calculations**: When variance needed directly
- **Multivariate analysis**: Component variance

### Use Case: Compare Data Spread

```powerfx
// Which dataset has more variation?
VarianceA = VarP( DatasetA, Value );
VarianceB = VarP( DatasetB, Value );

If(
    VarianceA > VarianceB,
    "Dataset A is more spread out",
    "Dataset B is more spread out"
)
```

### Use Case: Portfolio Risk Assessment

```powerfx
// Simple variance of returns (indicates volatility/risk)
PortfolioVariance = VarP( Returns, ReturnValue );
PortfolioRisk = Sqrt( PortfolioVariance );  // Standard deviation

Label1.Text = If(
    PortfolioRisk > 0.15,
    "High risk portfolio",
    "Conservative portfolio"
)
```

---

## Trigonometric Function Reference Table

| Angle (deg) | Radians | Sin | Cos | Tan |
|------------|---------|-----|-----|-----|
| 0 | 0 | 0 | 1 | 0 |
| 30 | π/6 | 0.5 | 0.866 | 0.577 |
| 45 | π/4 | 0.707 | 0.707 | 1 |
| 60 | π/3 | 0.866 | 0.5 | 1.732 |
| 90 | π/2 | 1 | 0 | ∞ |
| 180 | π | 0 | -1 | 0 |
| 270 | 3π/2 | -1 | 0 | 0 |
| 360 | 2π | 0 | 1 | 0 |

---

## Combined Examples

### Example: Draw Circle with Points

```powerfx
// Generate 8 points around a circle
ForAll(
    Sequence( 8, 0, 1 ),
    {
        Angle: Radians( Value * 45 ),  // 0, 45, 90, 135, ...
        X: 200 + 100 * Cos( Radians(Value * 45) ),
        Y: 200 + 100 * Sin( Radians(Value * 45) ),
        Label: Value & ""
    }
)
```

### Example: Rotating Animation

```powerfx
// In Timer control (Interval = 50)
Set( varRotation, (varRotation + 5) Mod 360 );
Image1.Rotation = Radians( varRotation )
```

### Example: Wave Animation

```powerfx
// Oscillating Y position using sine wave
Set( varTime, varTime + 0.05 );
Label1.Y = 200 + 100 * Sin( varTime )
```

### Example: Distance and Bearing

```powerfx
// Calculate distance and bearing between two points
Distance = Sqrt( Power(X2-X1, 2) + Power(Y2-Y1, 2) );
BearingRadians = Atan2( X2-X1, Y2-Y1 );
BearingDegrees = Degrees( BearingRadians );

// Convert to compass bearing (0-360)
Bearing = Mod( BearingDegrees + 360, 360 )
```

### Example: Random Color Generator

```powerfx
Button1.OnSelect = Set( varColor,
    RGBA(
        RandBetween( 0, 255 ),
        RandBetween( 0, 255 ),
        RandBetween( 0, 255 ),
        1
    )
);
Rectangle1.Fill = varColor
```

### Example: Modulo Pattern

```powerfx
// Generate table with alternating pattern
ForAll(
    Sequence( 20 ),
    {
        Item: "Row " & Value,
        Color: If( Mod(Value, 2) = 0, Color.LightGray, Color.White ),
        Category: Switch(
            Mod( Value, 3 ),
            0, "A",
            1, "B",
            2, "C"
        )
    }
)
```

---

## Single-Column Table Support

All functions support single-column tables:

```powerfx
// Table with numeric column
Sqrt( ValueColumn )         // Returns sqrt of each value
Sin( AngleColumn )          // Returns sin of each angle
RandBetween( 1, 6 )         // Returns random integer for each row
StdevP( SalesColumn )       // Returns standard deviation
```

---

## Notes

- **Radians vs Degrees**: All trig functions use radians. Use `Radians()` and `Degrees()` for conversion
- **Blank Returns**: Inverse trig functions return Blank for out-of-range arguments (e.g., Asin(2), Acos(-2))
- **Randomness**: Rand() and RandBetween() are volatile functions - generate new random values on each evaluation
- **Atan2 Parameter Order**: Atan2(X, Y) - X parameter comes first, then Y parameter
- **Mod Sign Behavior**: Mod result always has the same sign as the divisor (not the dividend)
- **Delegation**: StdevP and VarP cannot be delegated for any data sources
- **Works In**: Canvas apps, Copilot Studio, Desktop flows, Model-driven apps, Power Platform CLI, Dataverse functions, Power Pages
- **Not in Dataverse formula columns**: StdevP and VarP do not support Dataverse formula columns

---

## Common Patterns Summary

| Need | Pattern | Functions |
|------|---------|-----------|
| Circle point at angle | `{X: CenterX + R*Cos(angle), Y: CenterY + R*Sin(angle)}` | Cos, Sin, Radians |
| Angle from coordinates | `Degrees(Atan2(X, Y))` | Atan2, Degrees |
| Random integer range | `RandBetween(Min, Max)` | RandBetween |
| Random decimal 0-1 | `Rand()` | Rand |
| Even/odd detection | `Mod(Number, 2) = 0` | Mod |
| Repeating sequence | `Mod(Index, Count) + 1` | Mod |
| Data variability | `StdevP(Table, Column)` | StdevP |
| Data spread | `VarP(Table, Column)` | VarP |

---

## Sources

- [Microsoft Learn: Trigonometric functions (Acos, Acot, Asin, Atan, Atan2, Cos, Cot, Degrees, Pi, Radians, Sin, Tan)](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-trig)
- [Microsoft Learn: Random functions (Rand, RandBetween)](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-rand)
- [Microsoft Learn: Mod function](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-mod)
- [Microsoft Learn: Statistical functions (Average, Max, Min, StdevP, Sum, VarP)](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-aggregates)
