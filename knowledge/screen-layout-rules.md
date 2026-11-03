# PowerApps Screen Layout Rules
Best practices for structuring screens and layouts

---

## ✅ Containers for Precision Layout (GOLDEN RULE)

**Use GroupContainers as layout building blocks.** Containers give you precise control over positioning and prevent layout drift.

### Container Hierarchy Pattern
```yaml
Screen
├── grpSidebar (fixed width sidebar)
├── grpMainContent (flexible main area)
│   ├── grpHeaderRow (buttons, search, etc.)
│   │   ├── btnAction1
│   │   ├── btnAction2
│   │   └── txtSearch
│   ├── grpFilterTabs (filter buttons)
│   │   └── galFilters
│   ├── grpContentArea (main content)
│   │   └── galItems
│   └── grpFooter (bottom controls)
└── grpSidePanel (optional right panel)
```

### Why Containers Work Better
1. **Isolation** - Child controls position relative to container (X=0, Y=0 is top-left of container)
2. **Responsive** - Container Width/Height can use formulas; children inherit
3. **Grouping** - Move entire sections by adjusting container position
4. **Z-Order** - Containers manage layering naturally

### Container Best Practices
```yaml
- grpHeaderRow:
    Control: GroupContainer@1.4.0
    Variant: ManualLayout
    Properties:
      Fill: =Color.Transparent    # Transparent for layout-only containers
      Height: =50                  # Fixed height for row
      Width: =Parent.Width - 48    # Responsive width with margin
      X: =24                       # Left margin
      Y: =60                       # Position from top
    Children:
      - btnFirst:
          Properties:
            X: =0                  # Relative to container, not screen!
            Y: =6
      - btnSecond:
          Properties:
            X: =140                # Next to first button
            Y: =6
      - txtSearch:
          Properties:
            X: =Parent.Width - 200 # Right-aligned within container
            Y: =6
```

### When to Create a Sub-Container
- **Logical grouping** - Header row, filter section, content area, footer
- **Complex positioning** - Multiple controls that need to move together
- **Responsive sections** - Areas that resize based on screen/parent
- **Galleries** - Always wrap galleries in containers for better control

### ❌ Don't Do This (Flat Layout Hell)
```yaml
# BAD: All controls at screen level with absolute positions
Children:
  - btn1:
      Properties:
        X: =124
        Y: =67
  - btn2:
      Properties:
        X: =274    # Magic numbers, hard to maintain
        Y: =67
  - galList:
      Properties:
        X: =124
        Y: =180    # If header changes, must update everything below
```

### ✅ Do This Instead (Container Structure)
```yaml
# GOOD: Organized in containers
Children:
  - grpHeader:
      Properties:
        X: =24
        Y: =60
        Height: =50
      Children:
        - btn1:
            Properties:
              X: =0      # Relative to container
        - btn2:
            Properties:
              X: =140    # Easy to understand spacing
  - grpContent:
      Properties:
        X: =24
        Y: =120          # Only need to adjust this if header changes
      Children:
        - galList:
            Properties:
              X: =0      # Fills container
```

---

## Screen Layout Patterns

### Standard App Layout
```yaml
Screens:
  ScreenName:
    Properties:
      Fill: =varTheme.SurfaceAlt
    Children:
      - grpSidebar:
          Control: GroupContainer@1.4.0
          Variant: ManualLayout
          Properties:
            Fill: =RGBA(47, 94, 111, 1)
            Height: =Parent.Height
            Width: =64
            X: =0
            Y: =0
      - grpMainContent:
          Control: GroupContainer@1.4.0
          Variant: ManualLayout
          Properties:
            Fill: =varTheme.SurfaceAlt
            Height: =Parent.Height
            Width: =Parent.Width - 64
            X: =64
            Y: =0
```

### With Collapsible Side Panel
```yaml
- grpMainContent:
    Properties:
      Width: =Parent.Width - 64 - If(varShowPanel, 280, 0)
      X: =64
- grpSidePanel:
    Properties:
      Visible: =varShowPanel
      Width: =280
      X: =Parent.Width - 280
```

---

## ❌ Icons on Buttons Don't Work

**Never try to overlay icons on buttons.** They render as text characters, not icons.

```yaml
# BAD: Icon overlay on button - renders as weird characters
- grpBtn:
    Children:
      - btnAction:
          Properties:
            Text: ="Submit"
      - iconOnButton:        # This will show as text, not icon!
          Control: Classic/Icon@2.5.0
          Properties:
            Icon: =Icon.Add
            X: =10
            Y: =10
```

**Instead:** Use buttons with text only, or use icon-only buttons (no text).

---

## 🔴 Container-First Layout (MANDATORY)

**ALL screens must use container structure. No exceptions.**

1. Never place controls directly on screen root (except the main wrapper container)
2. Every logical section gets its own GroupContainer
3. Minimum structure for any screen:

```yaml
Screens:
  ScreenName:
    Children:
      - grpMain:
          Control: GroupContainer@1.4.0
          Variant: ManualLayout
          Properties:
            Width: =Parent.Width
            Height: =Parent.Height
            X: =0
            Y: =0
          Children:
            - grpHeader:
                # Header content
            - grpContent:
                # Main content
            - grpFooter:
                # Optional footer
```

❌ **NEVER DO THIS:**
```yaml
Children:
  - lblTitle:
  - btnSubmit:
  - galItems:
```

---

## 🔴 Dynamic Positioning (MANDATORY)

**Always use formulas referencing sibling positions. Never hardcode Y or X when stacking.**

### Vertical Stacking (Y + Height)
```yaml
- grpHeader:
    Properties:
      Y: =0
      Height: =60

- grpContent:
    Properties:
      Y: =grpHeader.Y + grpHeader.Height    # Flush below header
      Height: =Parent.Height - grpHeader.Height - grpFooter.Height

- grpFooter:
    Properties:
      Y: =Parent.Height - 50
      Height: =50
```

### Horizontal Stacking (X + Width)
```yaml
- btnFirst:
    Properties:
      X: =0
      Width: =100

- btnSecond:
    Properties:
      X: =btnFirst.X + btnFirst.Width       # Flush right of first
      Width: =100

- btnThird:
    Properties:
      X: =btnSecond.X + btnSecond.Width     # Flush right of second
      Width: =100
```

### With Gaps (when needed)
```yaml
- btnSecond:
    Properties:
      X: =btnFirst.X + btnFirst.Width + 8   # 8px gap
```

❌ **BAD:** `Y: =60` (hardcoded, breaks if header height changes)
✅ **GOOD:** `Y: =grpHeader.Y + grpHeader.Height` (dynamic, always correct)

---

## Sizing Defaults

### Font Sizes (Use These, Not Larger)
| Element | Size |
|---------|------|
| Body text, Labels | `=13` |
| Buttons | `=13` |
| Section headers | `=16` |
| Page titles | `=18` |
| Small/meta text | `=11` |

### Text Width Buffer
When calculating width for Labels/Buttons with dynamic text:
- Add **20% buffer** to estimated width
- **Minimum formula:** `Width: =Len(Self.Text) * 8 + 24`
- For known static text, round up generously

```yaml
# For a button with "Submit" (6 chars)
# 6 * 8 + 24 = 72, round to 80+
- btnSubmit:
    Properties:
      Width: =100    # Generous, not tight
      Text: ="Submit"
```

### CheckBox Sizing
```yaml
- chkOption:
    Control: CheckBox@0.0.30
    Properties:
      Height: =28    # NOT 40 (default is too tall)
      Width: =28     # Icon-only
      # OR with label:
      Width: =Len("Option text") * 7 + 40
```

**Container rule:** When CheckBox is inside a container, ensure container `Height >= 32`

### Button Minimum Sizes
```yaml
# Icon-only button
Width: =40
Height: =40

# Text button
Width: =100    # Minimum
Height: =40

# Small/compact button
Width: =80
Height: =32
```

---

## Control Spacing Within Containers

### Vertical list of controls (form-like)
```yaml
- lbl1:
    Properties:
      Y: =0
- txt1:
    Properties:
      Y: =lbl1.Y + lbl1.Height + 4    # Small gap after label

- lbl2:
    Properties:
      Y: =txt1.Y + txt1.Height + 16   # Larger gap between field groups
- txt2:
    Properties:
      Y: =lbl2.Y + lbl2.Height + 4
```

### Horizontal button row
```yaml
- btnCancel:
    Properties:
      X: =Parent.Width - btnCancel.Width - btnSave.Width - 8
      Width: =100

- btnSave:
    Properties:
      X: =btnCancel.X + btnCancel.Width + 8
      Width: =100
```

---

## 📐 Responsive Design Setup

**For responsive apps, disable scaling in Settings:**
```
Settings > Display:
- Disable "Scale to fit"
- Disable "Lock aspect ratio"
- Disable "Lock orientation"
```

### Key Responsive Properties
```yaml
# Screen dimensions
Screen.Width = Max(App.Width, App.DesignWidth)
Screen.Height = Max(App.Height, App.DesignHeight)

# App.Width/Height = actual device/browser size (dynamic)
# App.DesignWidth/DesignHeight = minimum design size (static)
```

---

## 🔄 Auto-Layout Containers (Modern Responsive)

**Use AutoLayout variant for automatic responsive behavior.**

### Container Variants
| Variant | Use Case |
|---------|----------|
| `ManualLayout` | Fixed positioning with X, Y formulas |
| `AutoLayout` | Automatic spacing/sizing with Fill portions |

### Auto-Layout Container Properties
```yaml
- grpResponsive:
    Control: GroupContainer@1.4.0
    Variant: AutoLayout
    Properties:
      LayoutDirection: =LayoutDirection.Vertical   # or Horizontal
      LayoutAlignItems: =LayoutAlignItems.Stretch  # Stretch/Start/Center/End
      LayoutJustifyContent: =LayoutJustifyContent.Start  # Start/Center/End/SpaceBetween
      LayoutGap: =16                               # Gap between children
      LayoutWrap: =false                           # Allow wrapping
      LayoutOverflowY: =LayoutOverflow.Scroll      # Scroll/Hide/Clip
```

### Fill Portions (Proportional Sizing)
```yaml
# 3-column layout: 1:2:1 ratio
- grpLeft:
    Properties:
      LayoutMode: =LayoutMode.Auto
      FillPortions: =1

- grpCenter:
    Properties:
      LayoutMode: =LayoutMode.Auto
      FillPortions: =2      # Takes 2x the space

- grpRight:
    Properties:
      LayoutMode: =LayoutMode.Auto
      FillPortions: =1
```

### Fixed vs Flexible
```yaml
# Fixed height header, flexible content
- grpHeader:
    Properties:
      LayoutMode: =LayoutMode.Fixed
      Height: =64

- grpContent:
    Properties:
      LayoutMode: =LayoutMode.Auto
      FillPortions: =1      # Takes remaining space
```

---

## 📍 Centering Formulas

### Center Horizontally
```yaml
X: =(Parent.Width - Self.Width) / 2
```

### Center Vertically
```yaml
Y: =(Parent.Height - Self.Height) / 2
```

### Center Both (Absolute Center)
```yaml
X: =(Parent.Width - Self.Width) / 2
Y: =(Parent.Height - Self.Height) / 2
```

### Right-Align with Margin
```yaml
X: =Parent.Width - Self.Width - 16    # 16px from right edge
```

### Bottom-Align with Margin
```yaml
Y: =Parent.Height - Self.Height - 16  # 16px from bottom
```

---

## 📱 Screen Size Breakpoints

### Built-in Size Constants
| Constant | Value | Device |
|----------|-------|--------|
| `ScreenSize.Small` | 1 | Phone |
| `ScreenSize.Medium` | 2 | Tablet (portrait) |
| `ScreenSize.Large` | 3 | Tablet (landscape) |
| `ScreenSize.ExtraLarge` | 4 | Desktop |

### Conditional Visibility
```yaml
Visible: =Parent.Size >= ScreenSize.Medium    # Hide on phones
```

### Responsive Width by Screen Size
```yaml
Width: =Parent.Width * Switch(
    Parent.Size,
    ScreenSize.Small, 1,        # Full width on phone
    ScreenSize.Medium, 0.5,     # Half width on tablet
    0.33                        # Third width on desktop
)
```

### Conditional Layout (Stack vs Side-by-Side)
```yaml
# Stack vertical on small screens, horizontal on large
Width: =If(Parent.Size <= ScreenSize.Small, Parent.Width, Parent.Width / 2)
```

### Default Breakpoints
- **Tablet/Web:** [600, 900, 1200]
- **Phone:** [1200, 1800, 2400] (doubled for phone coordinates)

---

## ⚠️ Auto-Layout Gotchas

1. **No drag-and-drop** - Auto-layout containers disable dragging; use Tree view
2. **Wrap + Align conflict** - If `LayoutWrap = true`, child Align is ignored
3. **Scroll + Justify conflict** - If `LayoutWrap = false` and Overflow is Scroll, use `Justify = Start`
4. **Unsupported in containers:** DataTable, Charts, AddPicture
5. **Don't drag after formulas** - Dragging overwrites expressions with constants

---

## 🏗️ Responsive Layout Patterns

### Split-Screen (Desktop: 50/50, Mobile: Stacked)
```yaml
- grpLeft:
    Properties:
      Width: =If(Parent.Size >= ScreenSize.Medium, Parent.Width / 2, Parent.Width)
      Height: =If(Parent.Size >= ScreenSize.Medium, Parent.Height, Parent.Height / 2)

- grpRight:
    Properties:
      X: =If(Parent.Size >= ScreenSize.Medium, Parent.Width / 2, 0)
      Y: =If(Parent.Size >= ScreenSize.Medium, 0, Parent.Height / 2)
      Width: =If(Parent.Size >= ScreenSize.Medium, Parent.Width / 2, Parent.Width)
      Height: =If(Parent.Size >= ScreenSize.Medium, Parent.Height, Parent.Height / 2)
```

### Sidebar + Main Content
```yaml
- grpSidebar:
    Properties:
      Width: =If(Parent.Size >= ScreenSize.Medium, 250, 0)
      Visible: =Parent.Size >= ScreenSize.Medium

- grpMain:
    Properties:
      X: =If(Parent.Size >= ScreenSize.Medium, 250, 0)
      Width: =Parent.Width - Self.X
```

### Gallery in Container (Responsive)
```yaml
- grpGalleryWrapper:
    Control: GroupContainer@1.4.0
    Variant: ManualLayout
    Properties:
      Width: =Parent.Width
      Height: =Parent.Height - grpHeader.Height
      Y: =grpHeader.Y + grpHeader.Height
    Children:
      - galItems:
          Control: Gallery@4.2.0
          Variant: Vertical
          Properties:
            X: =0
            Y: =0
            Width: =Parent.Width
            Height: =Parent.Height
            TemplateSize: =80
```

---

## Scrollable Body with Fixed Header/Footer Pattern

For screens that need a fixed header at top, fixed footer at bottom, and scrollable content in between. The root must be a vertical AutoLayout container.

```yaml
Screens:
  ScreenName:
    Children:
      - grpRoot:
          Control: GroupContainer@1.4.0
          Variant: AutoLayout
          Properties:
            Width: =Parent.Width
            Height: =Parent.Height
            LayoutDirection: =LayoutDirection.Vertical
            LayoutGap: =0
            DropShadow: =DropShadow.None
          Children:
            - grpHeader:
                Control: GroupContainer@1.4.0
                Variant: AutoLayout
                Properties:
                  FillPortions: =0
                  Height: =64
                  LayoutMinHeight: =0
                  LayoutMinWidth: =0
                  AlignInContainer: =AlignInContainer.Stretch
                  # ... header content
            - grpScrollableBody:
                Control: GroupContainer@1.4.0
                Variant: AutoLayout
                Properties:
                  FillPortions: =1
                  LayoutOverflowY: =LayoutOverflow.Scroll
                  LayoutDirection: =LayoutDirection.Vertical
                  LayoutMinHeight: =0
                  LayoutMinWidth: =0
                  AlignInContainer: =AlignInContainer.Stretch
                  DropShadow: =DropShadow.None
                Children:
                  - grpBodyContent:
                      Control: GroupContainer@1.4.0
                      Variant: AutoLayout
                      Properties:
                        FillPortions: =0
                        Height: =child1.Height + child2.Height + 48
                        LayoutMinHeight: =0
                        LayoutMinWidth: =0
                        AlignInContainer: =AlignInContainer.Stretch
                      Children:
                        # ... scrollable content here
            - grpFooter:
                Control: GroupContainer@1.4.0
                Variant: AutoLayout
                Properties:
                  FillPortions: =0
                  Height: =50
                  LayoutMinHeight: =0
                  LayoutMinWidth: =0
                  AlignInContainer: =AlignInContainer.Stretch
                  # ... footer content
```

**Key rules:**
- Header and footer use `FillPortions: =0` with explicit `Height` (fixed)
- Scrollable body uses `FillPortions: =1` (takes remaining space) with `LayoutOverflowY: =LayoutOverflow.Scroll`
- Direct children of the scroll container MUST use `FillPortions: =0` with explicit `Height` — never `FillPortions: =1` (defeats scrolling)

---

## Gallery Sidebar Navigation Patterns

Three proven patterns for navigation galleries in sidebars. Choose based on the design.

### Pattern A — Gallery Fills Remaining Sidebar Height (Default)

The navGallery takes all remaining space after logo/header area. No spacer needed.

```yaml
- navGallery:
    Control: Gallery@2.15.0
    Variant: Vertical
    Properties:
      FillPortions: =1
      TemplateSize: =48
      TemplatePadding: =0
      ShowScrollbar: =false
      LayoutMinHeight: =0
      LayoutMinWidth: =0
```

Logo area and footer use `FillPortions: =0` with static heights. **Never add a spacer with `FillPortions: =1` alongside the gallery** — it would split the remaining space 50/50.

### Pattern B — Gallery Compact (Exactly as Tall as Items)

Use when nav items are few and elements below should follow immediately.

```yaml
- navGallery:
    Control: Gallery@2.15.0
    Variant: Vertical
    Properties:
      FillPortions: =0
      Height: =Self.AllItemsCount * (Self.TemplateHeight + Self.TemplatePadding)
      TemplateSize: =48
      TemplatePadding: =0
      ShowScrollbar: =false
      LayoutMinHeight: =0
      LayoutMinWidth: =0
```

> **Note:** `TemplateSize` is write-only. Use `Self.TemplateHeight` (vertical gallery) or `Self.TemplateWidth` (horizontal gallery) to read the effective size back in formulas. `Self.TemplateSize` does not exist as a readable property.

### Pattern C — Gallery Centered Vertically in Sidebar

Only use when the design explicitly shows nav icons centered in the middle of the sidebar height. Wrap the gallery in a centering container.

```yaml
- navCenterWrapper:
    Control: GroupContainer@1.4.0
    Variant: AutoLayout
    Properties:
      FillPortions: =1
      LayoutDirection: =LayoutDirection.Vertical
      LayoutJustifyContent: =LayoutJustifyContent.Center
      LayoutMinHeight: =0
      LayoutMinWidth: =0
      DropShadow: =DropShadow.None
    Children:
      - navGallery:
          Control: Gallery@2.15.0
          Variant: Vertical
          Properties:
            FillPortions: =0
            Height: =Self.AllItemsCount * Self.TemplateHeight
            TemplateSize: =48
            TemplatePadding: =0
            ShowScrollbar: =false
            LayoutMinHeight: =0
            LayoutMinWidth: =0
```
