# PowerApps Modern Icon Reference

## Current type: ModernIcon (2026-11-11)

The authoring service now marks the bare `Icon` type below as superseded and says to use `ModernIcon` for new
icons. Existing `Icon` controls keep working, so the rest of this page stays for them.

ModernIcon differences, from the 2026-11-11 catalog:
- `IconStyle` uses the `IconStyle` enum: `=IconStyle.Filled` or `=IconStyle.Outline` (not `'Icon.IconStyle'`).
- `Icon` is text, for example `="Home"`, as on the bare type.
- **ModernIcon accepts `OnSelect`** (compile-verified 2026-11-11; the click itself was not exercised in play mode).
  The "no OnSelect" warning further down applies only to the superseded bare `Icon` type.

<!-- verified: true, verified_at: 2026-11-11, verified_by: compile_canvas -->
```yaml
- icoStatus:
    Control: ModernIcon
    Properties:
      Icon: ="Checkmark"
      IconColor: =RGBA(47, 163, 111, 1)
      IconStyle: =IconStyle.Filled
      Rotation: =0
      Height: =20
      Width: =20
```

Clickable ModernIcon:
<!-- verified: true, verified_at: 2026-11-11, verified_by: compile_canvas -->
```yaml
- icoClickProbe:
    Control: ModernIcon
    Properties:
      Icon: ="Home"
      OnSelect: =Set(varIconClicked, true)
      Height: =24
      Width: =24
```
A clickable icon also needs an `AccessibleLabel` so screen readers can name it; AppForge warns when it is missing.

## CRITICAL: The superseded bare `Icon` type has NO OnSelect

**Modern Icon@0.0.7 is DISPLAY-ONLY - it cannot respond to clicks!**

Use `Classic/Icon@2.5.0` for any icon that needs to be clickable.

## Control Versions

| Control Type | Version | Use Case |
|--------------|---------|----------|
| `Icon@0.0.7` | Modern | **Display-only** - status indicators, decorative icons |
| `Classic/Icon@2.5.0` | Classic | **Clickable icons** - navigation, buttons, actions |

## Modern Icon@0.0.7 Schema

```yaml
- iconExample:
    Control: Icon@0.0.7
    Properties:
      Icon: ="Home"
      IconColor: =RGBA(255, 255, 255, 1)
      IconStyle: ='Icon.IconStyle'.Regular
      Rotation: =0
      Height: =24
      Width: =24
      X: =0
      Y: =0
      OnSelect: =Navigate(Screen1)
```

## Key Properties

| Property | Type | Description | Example |
|----------|------|-------------|---------|
| `Icon` | String | Icon name in quotes | `="Home"`, `="Add"`, `="Cancel"` |
| `IconColor` | Color | Icon fill color | `=RGBA(255, 255, 255, 1)` |
| `IconStyle` | Enum | Filled or Regular style | `='Icon.IconStyle'.Regular` or `='Icon.IconStyle'.Filled` |
| `Rotation` | Number | Rotation in degrees | `=0` (normal), `=90`, `=180` (upside down), `=270` |
| `OnSelect` | Action | Click handler | `=Navigate(Screen1)` |

## Property Differences: Classic vs Modern

| Classic/Icon@2.5.0 | Icon@0.0.7 | Notes |
|--------------------|------------|-------|
| `Icon: =Icon.Home` | `Icon: ="Home"` | Modern uses string, no `Icon.` prefix |
| `Color` | `IconColor` | Renamed property |
| `HoverColor` | ❌ Not available | Modern icons don't have hover states |
| `PressedColor` | ❌ Not available | Modern icons don't have pressed states |
| ❌ Not available | `IconStyle` | New in modern |
| ❌ Not available | `Rotation` | New in modern |

## IconStyle Values

- `='Icon.IconStyle'.Regular` - Outline/stroke style (default)
- `='Icon.IconStyle'.Filled` - Solid filled style

## Rotation Values

| Value | Effect |
|-------|--------|
| `=0` | Normal orientation |
| `=90` | Rotated 90° clockwise |
| `=180` | Upside down |
| `=270` | Rotated 270° clockwise (or 90° counter-clockwise) |

## VERIFIED Modern Icon Names (73 total)

### Actions & Core UI (11)
```
Add, Edit, Delete, Copy, Save, SaveCopy, Open, Attach, Print, Filter, Search
```

### Arrows (11)
```
ArrowUp, ArrowDown, ArrowLeft, ArrowRight, ArrowClockwise, ArrowDownload,
ArrowExit, ArrowReset, ArrowSort, ArrowSync, ArrowUndo
```

### Chevrons (4)
```
ChevronUp, ChevronDown, ChevronLeft, ChevronRight
```

### Status & Feedback (8)
```
Checkmark, CheckmarkCircle, Dismiss, DismissCircle, ErrorCircle, Warning, Info, Question
```

### Documents & Files (5)
```
Document, DocumentAdd, DocumentBulletList, DocumentPdf, Link
```

### Communication (4)
```
Mail, Send, Chat, ServiceBell
```

### Calendar & Time (4)
```
Calendar, CalendarAdd, Clock, ClockAlarm
```

### People (4)
```
Person, People, PeopleAdd, Database
```

### Globe & Network (6)
```
Globe, GlobeArrowUp, GlobeError, GlobeProhibited, GlobeSync, GlobeWarning
```

### Apps & Navigation (7)
```
Home, AppsList, AppsListDetail, History, Settings, MoreHorizontal, GridDots
```

### Shopping & Commerce (2)
```
Cart, Money
```

### Tools & Utilities (5)
```
Camera, Eye, Eraser, EmojiSmileSlight, TextCaseTitle
```

### Transportation (1)
```
Airplane
```

### Basic Shapes (1)
```
Circle
```

---

## Alert Banner Icon Recommendations

| Alert Type | Icon Name |
|------------|-----------|
| Success | `"Checkmark"` or `"CheckmarkCircle"` |
| Warning | `"Warning"` |
| Error | `"ErrorCircle"` or `"DismissCircle"` |
| Info | `"Info"` |
| Close/Dismiss | `"Dismiss"` |

---

## Classic to Modern Mapping

| Classic Enum | Modern String |
|--------------|---------------|
| Icon.Cancel | `"Dismiss"` |
| Icon.Check | `"Checkmark"` |
| Icon.Warning | `"Warning"` |
| Icon.Information | `"Info"` |
| Icon.Error | `"ErrorCircle"` |
| Icon.Add | `"Add"` |
| Icon.Edit | `"Edit"` |
| Icon.Trash | `"Delete"` |
| Icon.Home | `"Home"` |
| Icon.Search | `"Search"` |
| Icon.Settings | `"Settings"` |
| Icon.Mail | `"Mail"` |
| Icon.Clock | `"Clock"` |
| Icon.Calendar | `"Calendar"` |
| Icon.Person | `"Person"` |
| Icon.People | `"People"` |
| Icon.Currency / Icon.Money | `"Money"` |
| Icon.ShoppingCart | `"Cart"` |
| Icon.ArrowDown | `"ArrowDown"` |
| Icon.ArrowUp | `"ArrowUp"` |
| Icon.ChevronDown | `"ChevronDown"` |
| Icon.ChevronUp | `"ChevronUp"` |

## Usage Examples

### Static Icon
```yaml
- iconSettings:
    Control: Icon@0.0.7
    Properties:
      Icon: ="Settings"
      IconColor: =varTheme.Primary
      IconStyle: ='Icon.IconStyle'.Regular
      Rotation: =0
      Height: =24
      Width: =24
```

### Conditional Icon
```yaml
- iconToggle:
    Control: Icon@0.0.7
    Properties:
      Icon: =If(varMenuExpanded, "Cancel", "Hamburger")
      IconColor: =RGBA(255, 255, 255, 1)
      IconStyle: ='Icon.IconStyle'.Regular
      Rotation: =0
      OnSelect: =Set(varMenuExpanded, !varMenuExpanded)
```

### Icon in Gallery (from data)
```yaml
# NavItems table with string icons:
# =Table({Title: "Home", Icon: "Home"}, {Title: "Settings", Icon: "Settings"})

- iconNavItem:
    Control: Icon@0.0.7
    Properties:
      Icon: =ThisItem.Icon
      IconColor: =RGBA(255, 255, 255, 0.9)
      IconStyle: ='Icon.IconStyle'.Regular
      Rotation: =0
```

## IMPORTANT: Do NOT Use

These properties do NOT exist on modern Icon@0.0.7:
- ❌ `OnSelect` - **the bare Icon type cannot be clicked** (ModernIcon can; see the top of this page)
- ❌ `Color` (use `IconColor` instead)
- ❌ `HoverColor`
- ❌ `PressedColor`
- ❌ `HoverFill`
- ❌ `PressedFill`

These icon formats do NOT work on modern icons:
- ❌ `Icon: =Icon.Home` (Classic format)
- ❌ `Icon: Icon.Home` (Missing equals sign)

**If you need OnSelect, use ModernIcon or Classic/Icon@2.5.0, not the bare Icon type.**

## Migration from Classic to Modern

**Before (Classic/Icon@2.5.0):**
```yaml
- iconOld:
    Control: Classic/Icon@2.5.0
    Properties:
      Icon: =Icon.Home
      Color: =RGBA(255, 255, 255, 1)
      HoverColor: =RGBA(255, 255, 255, 0.8)
      PressedColor: =RGBA(255, 255, 255, 0.6)
```

**After (Icon@0.0.7):**
```yaml
- iconNew:
    Control: Icon@0.0.7
    Properties:
      Icon: ="Home"
      IconColor: =RGBA(255, 255, 255, 1)
      IconStyle: ='Icon.IconStyle'.Regular
      Rotation: =0
```
