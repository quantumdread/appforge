# Design Spec Formats

Reference templates for creating structured design specifications before generating YAML.
Use the section matching the resolved generation mode.

---

## Replicate Mode

Extract directly from the screenshot. Be precise — measure colors, estimate pixel dimensions from proportions.

```
=== DESIGN SPEC (extracted from screenshot) ===
Mode: replicate
Paste target: [screen / container / gallery template]
Screen name: [ScreenName]
Control style: [classic / modern / auto→classic]

COLORS
  Background:       RGBA(249,250,251,1)
  Sidebar bg:       RGBA(255,255,255,1)
  Primary text:     RGBA(17,24,39,1)
  Secondary text:   RGBA(107,114,128,1)
  Accent:           RGBA(234,88,12,1)
  Active nav bg:    RGBA(255,247,237,1)
  Border:           RGBA(229,231,235,1)
  Input border:     RGBA(209,213,219,1)
  [add all colors visible in the mockup]

MEASUREMENTS
  Canvas:           1366×768 (tablet)
  Reference canvas width: ~[N]px  (estimate from screenshot)
  Scale factor:           [1366/N] (see sizing-reference.md §5)
  Sidebar width:    [ref × scale]px
  Top bar height:   64px
  Tab bar height:   42px
  Form card width:  [ref × scale]px
  Form card padding: 24px all sides
  Gap between form groups: 20px
  Input height:     40px
  Button height:    36px
  Nav item height:  40px
  [add all key measurements]

TYPOGRAPHY
  Logo:             13px, Lato Black, Bold
  Page title:       14px, Lato Black, Bold
  Card title:       13px, Lato Black, Bold
  Form labels:      11px, Lato, Semibold
  Input text:       11px, Lato, Regular
  Nav labels:       10px, Lato, Semibold (active) / Regular (inactive)
  Breadcrumb:       9px, Lato, Regular
  Button text:      11px, Lato, Normal
  [add all typography visible]

COMPONENT STATE DESCRIPTIONS
  Nav item (active):   accent bg tint, accent icon, accent label, semibold
  Nav item (default):  transparent bg, gray icon, gray label, regular weight
  Tab (active):        dark text, 2px underline at bottom
  Tab (default):       gray text, no underline
  Button "Save":       outlined — white fill, gray border
  Button "Continue":   filled dark — dark fill, white text
  Button "Cancel":     text-only, underlined, no fill
  Input (focused):     border thickens to 2px, darkens to primary text color
  Input (hover):       border lightens slightly
  Checkbox (checked):  fill = primary text color, white checkmark
  [add all interactive state descriptions]

THEME MAPPING (map extracted colors to varTheme tokens)
  varTheme.Primary    → [Accent color]
  varTheme.Surface    → [Card/panel bg]
  varTheme.Background → [Screen bg]
  varTheme.Text       → [Primary text]
  varTheme.TextSecondary → [Secondary text]
  varTheme.Border     → [Border color]
  [map all extracted colors to varTheme properties]

MODIFICATIONS (user-requested changes — apply over extracted spec)
  [list each modification, or omit if none]
```

---

## Improvement Mode

```
=== DESIGN SPEC (improvement mode) ===
Mode: improvement
Paste target: [screen / container / gallery template]
Screen name: [ScreenName]
Control style: [classic / modern / auto→classic]

DESIGN TOKENS (using varTheme)
─────────────────────────────────────────────────────────
PALETTE (map to varTheme properties)
  varTheme.Background:     RGBA(...)   ← base screen/page bg
  varTheme.Surface:        RGBA(...)   ← card/panel bg
  varTheme.Border:         RGBA(...)   ← dividers, input borders
  varTheme.Primary:        RGBA(...)   ← CTA buttons, active states, focus rings
  varTheme.Secondary:      RGBA(...)   ← optional 2nd accent
  varTheme.Text:           RGBA(...)   ← headings, primary labels
  varTheme.TextSecondary:  RGBA(...)   ← metadata, helper text, placeholders
  varTheme.TextOnPrimary:  RGBA(...)   ← text on accent-colored surfaces

TYPOGRAPHY
  Font:           [Lato / Segoe UI / Verdana / Georgia / Courier New]
  Heading-Size:   [PA size integer]  ← section titles, card headers
  Body-Size:      [PA size integer]  ← form labels, list items, body copy
  Caption-Size:   [PA size integer]  ← timestamps, metadata, helper text
  Heading-Weight: [Bold / Semibold]
  Body-Weight:    [Normal / Semibold]

DENSITY
  Profile:   [compact / balanced / generous]
  LayoutGap: [integer]
  PaddingH:  [integer]  ← PaddingLeft + PaddingRight
  PaddingV:  [integer]  ← PaddingTop + PaddingBottom

RADIUS
  Container:   [integer]  ← GroupContainer cards, panels
  Interactive: [integer]  ← buttons, inputs

STATE COLORS (derived from varTheme.Primary)
  HoverFill:     RGBA(...)  ← accent at ~8% opacity
  PressedFill:   RGBA(...)  ← accent at ~15% opacity
  FocusedBorder: RGBA(...)  ← accent at full opacity
  DisabledFill:  RGBA(...)  ← near-background, very low contrast
  DisabledColor: RGBA(...)  ← text-secondary at ~38% opacity
─────────────────────────────────────────────────────────

PART A — PRESERVE (extracted from screenshot)
  Sections (keep in this order):
    1. [Section name and purpose]
    2. [Section name and purpose]
  Field labels to keep verbatim:
    - "[exact label text]"
  Navigation items (keep verbatim):
    - "[item name]"
  Control purposes:
    - [controlName]: [what it does]

PART B — IMPROVE (apply these; replace anything from PART A that conflicts)
  COLORS
    [full palette using varTheme tokens]

  MEASUREMENTS
    [standardized values from sizing-reference.md]

  TYPOGRAPHY
    [full type scale]

  CONTROL UPGRADES
    [list any controls being upgraded]

  LAYOUT FIXES
    - Add LayoutMinWidth: =0 and LayoutMinHeight: =0 to all containers
    - Add DropShadow: =DropShadow.Light to card containers
    - Add radius to all inputs and buttons
    - Add proper hover/pressed/focus states to all interactive controls

  SPECIFIC IMPROVEMENTS (from user, if any)
    [list user-specified improvements]

  COMPONENT STATE DESCRIPTIONS
    [state descriptions using PART B colors]
```

---

## Build from Scratch (Text-Only) Mode

```
=== DESIGN SPEC (synthesized from description + user answers) ===
Mode: text-only
Paste target: [screen / container / gallery template]
Screen name: [ScreenName]
Layout pattern: [from user's answer]
Primary purpose: [from user's answer]
Control style: [classic / modern / auto→classic]

DESIGN TOKENS (using varTheme)
─────────────────────────────────────────────────────────
PALETTE
  varTheme.Background:     RGBA(...)
  varTheme.Surface:        RGBA(...)
  varTheme.Border:         RGBA(...)
  varTheme.Primary:        RGBA(...)
  varTheme.Secondary:      RGBA(...)
  varTheme.Text:           RGBA(...)
  varTheme.TextSecondary:  RGBA(...)
  varTheme.TextOnPrimary:  RGBA(...)

TYPOGRAPHY
  Font:           [Lato / Segoe UI / Verdana / Georgia / Courier New]
  Heading-Size:   [PA size integer]
  Body-Size:      [PA size integer]
  Caption-Size:   [PA size integer]
  Heading-Weight: [Bold / Semibold]
  Body-Weight:    [Normal / Semibold]

DENSITY
  Profile:   [compact / balanced / generous]
  LayoutGap: [integer]
  PaddingH:  [integer]
  PaddingV:  [integer]

RADIUS
  Container:   [integer]
  Interactive: [integer]

STATE COLORS (derived from varTheme.Primary)
  HoverFill:     RGBA(...)
  PressedFill:   RGBA(...)
  FocusedBorder: RGBA(...)
  DisabledFill:  RGBA(...)
  DisabledColor: RGBA(...)
─────────────────────────────────────────────────────────

COLORS  [source: user selected "[palette answer]"]
  [full palette using varTheme tokens, marked as "proposed"]

MEASUREMENTS  [source: sizing-reference.md defaults]
  [standard values]

TYPOGRAPHY  [source: defaults — Lato font system]
  [full type scale]

COMPONENT STATE DESCRIPTIONS  [source: best practices]
  [standard state descriptions for the control types in this screen]
```

---

*Draws on design concepts from ToluVictor/canvas-apps-tools (MIT).*
