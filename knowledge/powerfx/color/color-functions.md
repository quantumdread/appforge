# Color Functions

RGBA, Color, ColorValue, ColorFade - Create and manipulate colors.

---

## RGBA Function

Creates a color from red, green, blue, and alpha components.

### Syntax

```powerfx
RGBA( Red, Green, Blue, Alpha )
```

### Parameters

| Parameter | Range | Description |
|-----------|-------|-------------|
| Red | 0-255 | Red component |
| Green | 0-255 | Green component |
| Blue | 0-255 | Blue component |
| Alpha | 0-1 | Transparency (0=transparent, 1=opaque) |

### Examples

```powerfx
// Primary colors
RGBA( 255, 0, 0, 1 )       // Red
RGBA( 0, 255, 0, 1 )       // Green
RGBA( 0, 0, 255, 1 )       // Blue

// With transparency
RGBA( 255, 0, 0, 0.5 )     // 50% transparent red
RGBA( 0, 0, 0, 0.3 )       // 30% transparent black (overlay)

// Common colors
RGBA( 255, 255, 255, 1 )   // White
RGBA( 0, 0, 0, 1 )         // Black
RGBA( 128, 128, 128, 1 )   // Gray

// Microsoft blue
RGBA( 0, 120, 212, 1 )
```

---

## Color Enumeration

Access predefined CSS color values.

### Syntax

```powerfx
Color.ColorName
```

### Common Colors

```powerfx
Color.Red
Color.Green
Color.Blue
Color.White
Color.Black
Color.Gray
Color.Yellow
Color.Orange
Color.Purple
Color.Pink
Color.Transparent       // Fully transparent
Color.AliceBlue
Color.Coral
Color.CornflowerBlue
Color.Gold
Color.LightGray
Color.DarkGray
```

### Notes

- All Color enum values are 100% opaque
- For transparency, use RGBA or ColorFade
- Not available in PAC CLI

---

## ColorValue Function

Creates a color from CSS color string or hex code.

### Syntax

```powerfx
ColorValue( CSSColor )
```

### Supported Formats

| Format | Example |
|--------|---------|
| CSS color name | `"Red"`, `"CornflowerBlue"` |
| 6-digit hex | `"#FF0000"` (RGB, opaque) |
| 8-digit hex | `"#FF000080"` (RGBA with alpha) |

### Examples

```powerfx
// By name (case-insensitive)
ColorValue( "Red" )
ColorValue( "cornflowerblue" )
ColorValue( "DarkSlateGray" )

// By hex code
ColorValue( "#FF5733" )           // Orange
ColorValue( "#3498DB" )           // Blue
ColorValue( "#2ECC71" )           // Green

// With alpha (8-digit hex)
ColorValue( "#FF000080" )         // 50% transparent red
ColorValue( "#00000033" )         // 20% transparent black
```

---

## ColorFade Function

Brightens or darkens a color.

### Syntax

```powerfx
ColorFade( Color, FadeAmount )
```

### Parameters

| Parameter | Range | Description |
|-----------|-------|-------------|
| Color | Color | Base color |
| FadeAmount | -1 to 1 | -1=black, 0=no change, 1=white |

### Examples

```powerfx
// Lighten color (toward white)
ColorFade( Color.Blue, 0.5 )      // 50% lighter blue
ColorFade( Color.Red, 0.3 )       // Lighter red

// Darken color (toward black)
ColorFade( Color.Blue, -0.5 )     // 50% darker blue
ColorFade( Color.Green, -0.3 )    // Darker green

// Hover effect pattern
If( ThisItem.IsSelected,
    ColorFade( Color.Blue, -0.2 ),   // Darker when selected
    Color.Blue
)
```

---

## Common Patterns

### Theme Colors (Named Formulas)

```powerfx
App.Formulas:
    // Primary palette
    ThemePrimary = RGBA( 0, 120, 212, 1 );
    ThemeSecondary = RGBA( 0, 90, 158, 1 );
    ThemeAccent = RGBA( 255, 185, 0, 1 );

    // Semantic colors
    ColorSuccess = RGBA( 16, 124, 16, 1 );
    ColorWarning = RGBA( 255, 185, 0, 1 );
    ColorError = RGBA( 209, 52, 56, 1 );
    ColorInfo = RGBA( 0, 120, 212, 1 );

    // Backgrounds
    BgLight = RGBA( 250, 250, 250, 1 );
    BgDark = RGBA( 32, 32, 32, 1 );

    // Text colors
    TextPrimary = RGBA( 50, 50, 50, 1 );
    TextSecondary = RGBA( 100, 100, 100, 1 );
```

### Hover States

```powerfx
// Button Fill
If( Self.Pressed,
    ColorFade( ThemePrimary, -0.2 ),
    If( Self.Hovered,
        ColorFade( ThemePrimary, -0.1 ),
        ThemePrimary
    )
)
```

### Status Indicator Colors

```powerfx
Switch( ThisItem.Status,
    "Active", ColorSuccess,
    "Pending", ColorWarning,
    "Inactive", ColorError,
    Color.Gray
)

// Or with RGBA
Switch( ThisItem.Priority,
    "High", RGBA( 209, 52, 56, 1 ),
    "Medium", RGBA( 255, 185, 0, 1 ),
    "Low", RGBA( 16, 124, 16, 1 ),
    RGBA( 128, 128, 128, 1 )
)
```

### Row Alternating Colors

```powerfx
// Gallery template fill
If( Mod( ThisItem.ID, 2 ) = 0,
    RGBA( 245, 245, 245, 1 ),   // Light gray
    RGBA( 255, 255, 255, 1 )    // White
)
```

### Transparency Overlay

```powerfx
// Semi-transparent overlay
RGBA( 0, 0, 0, 0.5 )        // 50% black overlay

// Disabled state
RGBA( 128, 128, 128, 0.5 )  // Grayed out
```

### Conditional Background

```powerfx
// Highlight overdue items
If( DueDate < Today(),
    RGBA( 255, 230, 230, 1 ),   // Light red
    RGBA( 255, 255, 255, 1 )    // White
)
```

---

## Alpha Channel Quick Reference

| Alpha | Transparency |
|-------|--------------|
| 1.0 | 0% (opaque) |
| 0.75 | 25% |
| 0.5 | 50% |
| 0.25 | 75% |
| 0.1 | 90% |
| 0 | 100% (invisible) |

---

## Hex to RGBA Conversion

```powerfx
// #3498DB = RGB(52, 152, 219)
ColorValue( "#3498DB" )
// equivalent to:
RGBA( 52, 152, 219, 1 )
```

### Common Hex Colors

| Color | Hex | RGBA |
|-------|-----|------|
| White | #FFFFFF | RGBA(255,255,255,1) |
| Black | #000000 | RGBA(0,0,0,1) |
| Red | #FF0000 | RGBA(255,0,0,1) |
| Green | #00FF00 | RGBA(0,255,0,1) |
| Blue | #0000FF | RGBA(0,0,255,1) |
| MS Blue | #0078D4 | RGBA(0,120,212,1) |

---

## Sources

- [Microsoft Learn: Color functions](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-colors)
