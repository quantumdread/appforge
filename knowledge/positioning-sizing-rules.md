# Positioning & Sizing Rules for Power Apps YAML

## Text Width Calculation (CRITICAL)

**Formula**: `Width = CharCount × CharWidth + Padding`

| Font Size | Char Width | Padding | Example |
|-----------|------------|---------|---------|
| 9-10 | 6px | 12px | "M T W" (5) = 42px |
| 11-12 | 7px | 16px | "+12.5%" (7) = 65px |
| 13-14 | 8px | 16px | "Electronics" (11) = 104px |
| 16+ | 10px | 20px | "Dashboard" (9) = 110px |

**Quick reference for common text:**

| Text | Chars | Size 12 Width | Size 13 Width |
|------|-------|---------------|---------------|
| "Save" | 4 | 44px | 48px |
| "Cancel" | 6 | 58px | 64px |
| "Submit" | 6 | 58px | 64px |
| "View Profile" | 12 | 100px | 112px |
| "+12.5%" | 7 | 65px | 72px |
| "vs last week" | 12 | 100px | 112px |
| "Electronics" | 11 | 93px | 104px |

**Badge width by digits:**

| Digits | Width | Shape |
|--------|-------|-------|
| 1 | 20px | Circle |
| 2 | 28px | Pill |
| 3+ | 36px | Pill |

**Rule**: When in doubt, add 20% to your estimate. Text wrapping is worse than extra whitespace.

---

## Grid System

Use an **8px base grid** for all positioning and sizing:
- Spacing: 8, 16, 24, 32, 40, 48...
- Small adjustments: 4px increments allowed

## Standard Control Sizes

| Element | Width | Height | Notes |
|---------|-------|--------|-------|
| Icon (small) | 16 | 16 | Inline with text |
| Icon (standard) | 24 | 24 | Default icon size |
| Icon (large) | 32 | 32 | Feature icons |
| Avatar (small) | 32 | 32 | Lists, compact |
| Avatar (medium) | 48 | 48 | Cards, profiles |
| Avatar (large) | 64 | 64 | Hero profiles |
| Badge (circle) | 20 | 20 | Single digit |
| Badge (pill) | 28 | 20 | Double digit |
| Step circle | 40 | 40 | Wizard steppers |
| Button height | - | 40 | Standard buttons |
| Input height | - | 40 | Text inputs |
| Nav item height | - | 44 | Sidebar nav items |
| Header height | - | 56-64 | App headers |

## Centering Controls (Overlay Pattern)

When placing a label/icon centered on a shape (circle, rectangle):

```yaml
# The background shape
- cirBackground:
    Control: Circle@2.3.0
    Properties:
      X: =100
      Y: =50
      Width: =40
      Height: =40

# Centered content - MATCH X/Y/Width/Height exactly
- lblCentered:
    Control: Label@2.5.1
    Properties:
      Text: |-
        ="1"
      Align: =Align.Center
      VerticalAlign: =VerticalAlign.Middle
      X: =100      # Same as shape
      Y: =50       # Same as shape
      Width: =40   # Same as shape
      Height: =40  # Same as shape
```

**Rule**: For centered overlays, copy X/Y/Width/Height from parent shape and use `Align.Center` + `VerticalAlign.Middle`.

## Connecting Lines Between Circles

For horizontal lines connecting step circles:

```
Circle 1          Line           Circle 2
[  X1  ]--------------------[  X2  ]
   |                            |
   X1 + W1                      X2
```

**Formula**:
```yaml
- recConnectingLine:
    Properties:
      X: =Circle1.X + Circle1.Width    # Start at right edge of circle 1
      Y: =Circle1.Y + (Circle1.Height / 2) - 2  # Vertically centered (line height 4)
      Width: =Circle2.X - Circle1.X - Circle1.Width  # Gap between circles
      Height: =4
```

**With overlap** (line goes slightly under circles for cleaner look):
```yaml
- recConnectingLine:
    Properties:
      X: =Circle1.X + Circle1.Width - 5   # Overlap into circle by 5px
      Y: =Circle1.Y + (Circle1.Height / 2) - 2
      Width: =Circle2.X - Circle1.X - Circle1.Width + 10  # Add 10 for both overlaps
      Height: =4
```

## Wizard Stepper Positioning (4 steps)

**General formula** for N steps in W width:
- Gap between centers = W / N
- Step centers at: W/(2N), 3W/(2N), 5W/(2N), 7W/(2N)

**Example: 4 steps in 560px width** (140px gaps):

| Step | Center | Circle X (40px) | Label X (80px wide) |
|------|--------|-----------------|---------------------|
| 1 | 70 | 50 | 30 |
| 2 | 210 | 190 | 170 |
| 3 | 350 | 330 | 310 |
| 4 | 490 | 470 | 450 |

**Calculations**:
- Circle X = Center - (CircleWidth / 2)
- Label X = Center - (LabelWidth / 2)

**Lines** (with 5px overlap each side):
- Line X = Circle1.X + Circle1.Width - 5
- Line Width = Circle2.X - Circle1.X - Circle1.Width + 10

| Line | X | Width |
|------|---|-------|
| 1 | 85 | 110 |
| 2 | 225 | 110 |
| 3 | 365 | 110 |

## Vertical Spacing

| Context | Spacing |
|---------|---------|
| Between section headers and content | 8px |
| Between list items | 4px |
| Between form fields | 16px |
| Between card sections | 24px |
| Page margins | 16-24px |
| Card padding | 16-20px |

## Label Positioning Under Circles

For labels centered under circles:

```yaml
- lblUnderCircle:
    Properties:
      Align: =Align.Center
      X: =Circle.X - 20   # Extend 20px on each side
      Y: =Circle.Y + Circle.Height + 8  # 8px gap below circle
      Width: =Circle.Width + 40  # Wider than circle for text
      Height: =20
```

## Icon Inside Circle (Checkmarks, etc.)

For icons centered in circles:

```yaml
# 40px circle with 24px icon
- cirStep:
    X: =100
    Y: =50
    Width: =40
    Height: =40

- icnCheck:
    X: =108   # Circle.X + (40-24)/2 = 100 + 8
    Y: =58    # Circle.Y + (40-24)/2 = 50 + 8
    Width: =24
    Height: =24
```

**Formula**: `Icon.X = Circle.X + (Circle.Width - Icon.Width) / 2`

## Ring Effect (Active Step)

For a ring effect (outer colored circle, inner white circle):

```yaml
# Outer circle (colored)
- cirOuter:
    X: =100
    Y: =50
    Width: =40
    Height: =40
    Fill: =PrimaryColor

# Inner circle (white) - 6px smaller, offset by 3px
- cirInner:
    X: =103   # Outer.X + 3
    Y: =53    # Outer.Y + 3
    Width: =34  # Outer.Width - 6
    Height: =34  # Outer.Height - 6
    Fill: =RGBA(255, 255, 255, 1)
```

**Rule**: Inner circle = Outer - 6px total (3px border on each side)

## Common Patterns

### Sidebar Nav Item
```
Height: 44px
Icon: X=24, Y=10 (from item top), 24x24
Label: X=56, Y=10, Height=24
Badge: X=Right-aligned, Y=12, 28x20
Accent bar: X=0, Y=0, Width=4, Height=44
```

### Breadcrumb Item
```
Height: 40px
Home icon: 20x20
Labels: Height=24, Y=8
Chevron separators: 16x20
Spacing between items: 4-8px
```

### Profile Card
```
Avatar: 48-64px circle
Name label: FontSize=16, Semibold
Role label: FontSize=12, Normal, Gray
Status dot: 12-16px circle
```

---

## FillPortions Detailed Rules and Ratio Math

### How FillPortions Works

In any AutoLayout container, `FillPortions` controls how a child sizes itself on the **primary axis** (width for horizontal, height for vertical):

1. Container allocates space to all static-sized children first (`FillPortions: =0`)
2. Remaining space is divided among flexible children proportionally
3. `LayoutMinWidth`/`LayoutMinHeight` acts as floor — child won't shrink below this

### Example (horizontal container, width 1000px):
- Child A: `FillPortions: =0`, `Width: =200` — gets exactly 200px
- Child B: `FillPortions: =2` — gets 2/3 of remaining 800 = ~533px
- Child C: `FillPortions: =1` — gets 1/3 of remaining 800 = ~267px

### Ratio Examples

| Desired layout | FillPortions values |
|---|---|
| Equal 3-column | `1 : 1 : 1` |
| Sidebar (narrow) + Main (wide) | `1 : 3` |
| 50% : 25% : 25% | `2 : 1 : 1` |
| Fixed sidebar + flexible main | Sidebar: `FillPortions: =0` + `Width: =250`, Main: `FillPortions: =1` |

### FillPortions Defaults to Zero

`FillPortions` defaults to zero when omitted — always set it explicitly. A child with `FillPortions: =0` and no explicit `Width`/`Height` collapses to zero size.

### Constraining Flexible Children

| Intent | Properties |
|---|---|
| Fill with minimum size | `FillPortions: =1` + `LayoutMinHeight: =N` |
| Fill with maximum size | `FillPortions: =1` + `LayoutMaxHeight: =N` |
| Fill with both bounds | `FillPortions: =1` + `LayoutMinHeight: =N` + `LayoutMaxHeight: =M` |

When the floor is hit, the system treats the item as static at its minimum value and redistributes remaining space among other flexible items.

### Canvas Scale Factor for Proportional Sizing

When converting a screenshot or design mockup to PowerApps YAML, use a scale factor to translate pixel measurements:

**Default Power Apps canvas width: 1366px**

1. Measure the design mockup's total width in pixels
2. Calculate scale factor: `scaleFactor = 1366 / mockupWidth`
3. Multiply all measured dimensions by the scale factor

**Example:** A mockup is 1920px wide. Scale factor = 1366/1920 = 0.71.
- A 300px sidebar in the mockup becomes `300 * 0.71 = 213px` in Power Apps
- A 16px font stays at 16px (font sizes don't scale)

**Rules:**
- Apply scale factor to Width, Height, X, Y, padding, gap, and border radius
- Do NOT scale font sizes, border thickness, or icon sizes (these are perceptual, not spatial)
- Round all scaled values to the nearest whole number
- For responsive layouts, prefer `FillPortions` over scaled fixed values
