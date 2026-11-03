# AppForge – Design Principles

These principles control **how generated apps should look and feel**.  
They apply to all **Power Apps Canvas** UI output unless the user explicitly asks for something different.

Goals:
- Look and behave like a modern web application
- Prioritize clarity and hierarchy over “busy” UIs
- Be consistent across screens, components, and apps

---

## 1. Layout & Grid

### 1.1 Global Layout

- Prefer a **three-region structure**:
  - **Left**: Navigation (sidebar)
  - **Center**: Primary content
  - **Right**: Secondary panels (details, tips, actions) when needed
- The app should visually read as a **web dashboard**, not a mobile app stretched wide.

### 1.2 Grid & Alignment

- Use an **8px spacing grid** everywhere.
  - All padding, gaps, and margins must be multiples of `8`.
- Align content using **Containers**, not absolute positioning where possible.
- Avoid “floating” controls:
  - Controls must align to other controls’ edges or the container’s grid.
- Limit content width:
  - Main content area should visually stay within a **max width** (approx. 1200–1366px look), even if the app is wider.

---

## 2. Spacing Rules

- Section padding:
  - Outer page container: `24–32px` padding
  - Card internal padding: `16–24px`
- Vertical rhythm:
  - Between section title and content: `8–12px`
  - Between stacked cards/rows: `8–16px`
- Never place controls with less than `4px` spacing between them.

---

## 3. Containers & Cards

### 3.1 Cards

- Primary building block = **cards** for grouping:
  - Use rounded corners (subtle radius)
  - Light background distinct from page background
  - Soft shadow or border (not both heavy at once)
- One idea per card:
  - Metric card (KPI)
  - List card (recent items)
  - Detail card (record view)
  - Tips/side card (helper text)

### 3.2 Page Sections

Each screen should follow:

1. **Header row**
   - Page title
   - Optional breadcrumbs
   - Optional primary action button (e.g. “+ New …”) right-aligned

2. **Status / metrics row (optional)**
   - 3–5 metric cards in a row

3. **Main content**
   - Gallery, form, or detail area

4. **Secondary content**
   - Categories, tips, filters, activity, etc.

---

## 4. Navigation

- Prefer **left sidebar navigation** for multi-screen apps:
  - App title at top
  - Nav items stacked with icons
  - Current screen highlighted (background + accent bar)
- Separate “navigation” from “warnings/alerts” visually:
  - e.g. section label “VARNINGAR” with red badge item

- When a detail screen is opened from a list:
  - Keep the sidebar visible
  - Use a breadcrumb or “back” header to show context

---

## 5. Typography & Hierarchy

### 5.1 Headings

- Page title: largest, bold
- Section titles: medium size, semi-bold
- Card titles: medium size, semi-bold
- Metadata (dates, categories): smaller, muted color

### 5.2 Content Text

- Body text: single, consistent size across app
- Do **not** mix many font sizes on the same card.

### 5.3 Alignment

- Left-align all main titles and body text.
- Right-align numeric metrics where appropriate (e.g. counts, percentages).

---

## 6. Color System

> Use a **limited palette** that feels like a webapp, not a rainbow.

### 6.1 Color Roles

- **Background**
  - App/page background: very light neutral
  - Sidebar background: dark or mid-dark neutral
  - Card background: white / very light neutral

- **Text**
  - Primary text: near-black
  - Secondary text: medium grey
  - Muted metadata: lighter grey

- **Accent**
  - Single primary brand color used for:
    - Primary buttons
    - Selected nav item
    - Key highlights

- **Status colors**
  - Info / neutral (e.g. blue)
  - Success (green)
  - Warning (amber/orange)
  - Danger (red)
  - Use these consistently across:
    - Badges
    - Status labels
    - Icons

### 6.2 Usage Rules

- Never use more than **one accent color** per app without explicit user request.
- Use status colors only where status is actually represented (not as random decoration).
- Avoid full-saturation backgrounds except for sidebar and primary buttons.

---

## 7. Controls & Inputs

### 7.1 General

- Prefer **modern controls** for all new UIs.
- Labels should be **above** inputs (web form style), not to the left, unless space is very constrained.
- Required fields:
  - Use a subtle “*” or helper text; avoid bright red labels unless error state is present.

### 7.2 Filters & Search

- Place filters in a **single row** above list content.
- Order: Search box → status filter → category filter → priority filter → “Clear” / “Reset” button.
- Keep filter controls visually consistent (same height, same style).

### 7.3 Buttons

- Primary action (e.g. “+ Ny avvikelse”, “Spara”, “Rapportera”):
  - Solid, accent-colored button
  - Right-aligned in its section

- Secondary actions:
  - Outlined or subtle buttons
  - Grouped vertically in side panels or horizontally near primary actions

- Destructive actions:
  - Use danger color only when truly destructive
  - Label clearly (“Ta bort”, “Avbryt rapport” etc.)

---

## 8. Components & Reuse

When generating UIs, prefer reusing components (if available) instead of rebuilding layouts from scratch.

Example component roles:

- `cSidebarNav` / `cSidebarNavV2`
  - Use for left navigation across all screens.

- `cMetricCard`, `cKpiCard`, `cProgressCard`
  - Use on dashboards and list headers for stats.

- `cDeviationCard` / similar domain cards
  - Use as gallery templates for incident/issue lists.

- `cStatusBadge`
  - Use anywhere a status/category needs a pill or tag.

- `cAppHeader` / `cBreadcrumb`
  - Use as consistent screen headers.

If a requested screen fits an existing component pattern, you must **prefer** that pattern over ad-hoc layouts.

---

## 9. States & Feedback

### 9.1 Hover / Pressed (where applicable)

- Use subtle visual feedback:
  - Light background change
  - Slight border or shadow emphasis
- No extreme scale/rotation animations.

### 9.2 Status Indicators

- Overdue / Försenade:
  - Use red text or badge near the deadline / count
- “New” / “Ny”:
  - Use a small, high-contrast pill
- “Löst”, “Pågående”, “Granskas”:
  - Use consistent badge colors mapped to status.

### 9.3 Empty, Loading, Error

- Galleries / lists:
  - Empty state: show simple icon and one-line message (e.g. “Inga avvikelser ännu”)
- Forms:
  - Validation errors: group near fields, not only at the bottom.
- Critical actions:
  - Show confirmation dialogs for destructive operations.

---

## 10. Data Density & Text Handling

- Default to **medium density**:
  - Enough rows visible without feeling cramped.
- Truncate long text with ellipsis when needed.
  - Provide tooltips for full content if appropriate.
- Avoid multi-line chaos in list rows:
  - Only show 2–3 key lines:
    - ID + title
    - Category + owner
    - Relative time / status

---

## 11. Screen Archetypes

When user asks for:

### 11.1 “Dashboard”

Use:
- Sidebar navigation
- Top welcome/title
- Row of 3–5 metric cards
- Recent items card
- Category / breakdown card

### 11.2 “List” / “Alla ärenden”

Use:
- Sidebar navigation
- Search + filters bar
- Vertical list of cards or rows
- Right-aligned primary action (“+ New …”)
- Overdue indicators on rows when applicable

### 11.3 “Create / Ny …”

Use:
- Centered form card with title + helper text
- Labels above inputs
- Right-side tips panel if helpful
- Primary button aligned to bottom right of the form

### 11.4 “Detail / View”

Use:
- Left: main details card
- Right: actions + comments/timeline panel
- Clear status badge near title
- Key info grouped: description, metadata, assigned user, dates

---

## 12. Consistency Rules

- Once a pattern is chosen (e.g. sidebar style, metric card layout), **reuse it across all screens** in the app.
- Do not mix radically different visual styles in one app.
- Never downgrade to default “out-of-box” Power Apps look unless explicitly requested.


---

## 13. Responsive Layout

Evidence class: `studio-export-2026-09-09`. Extracted from nine of Microsoft's own current Studio screen templates, fetched byte-for-byte from the authoring service (`catalogs/sources/studio-export-2026-09-09-ms-templates.yaml`, Studio export findings, 2026-09-09). This is observed first-party practice, not house preference.

### The mechanism

Canvas apps adapt through **conditional property expressions keyed on `App.Width`** — not separate layouts, not device detection, not an orientation property. In the sampled templates `App.Width` appears 314 times across nine screens.

Breakpoints are a small fixed set. Use these rather than inventing new ones:

| Test | Meaning |
|---|---|
| `App.Width < 640` | Phone. Carries the overwhelming majority of adaptation. |
| `App.Width < 760` | Narrow tablet. Rare; only when 640 is insufficient. |
| `App.Width >= 1024` | Wide desktop. Enables two-column splits. |

### The five idioms

**1. Collapse to a single column.**
```yaml
LayoutDirection: =If(App.Width < 640, LayoutDirection.Vertical, LayoutDirection.Horizontal)
```

**2. Retire a region by zero width, not by `Visible`.** A side panel goes to `0` and stays in the tree, so its bindings and state survive.
```yaml
Width: =If(App.Width < 640, 0, 200)
```

**3. Swap fixed for fluid.** The child that is fixed-size on desktop becomes the flexible one on phone.
```yaml
FillPortions: =If(App.Width < 640, 1, 0)
```

**4. Grow the chrome on small screens.** Headers and touch targets get taller, not shorter.
```yaml
Height: =If(App.Width < 640, 104, 56)
```

**5. Fold the gutter into the width expression** rather than expressing it as padding.
```yaml
Width: =If(App.Width < 640, Parent.Width - 32, 0)
```

### Supporting scale

- `LayoutGap` on a **4px scale**: 4, 8, 12, 16. 8 and 16 dominate.
- `LayoutMinHeight` / `LayoutMinWidth` = **16** on essentially every flex child (~190 occurrences in nine screens). It prevents collapse when content is empty.
- `LayoutAlignItems.Center` is the default choice; `Stretch` is rare and deliberate.
- `LayoutOverflowY.Scroll` is used where content can exceed its container, not avoided.
- Horizontal and vertical `LayoutDirection` nest deeply and near-equally. Depth is normal; do not flatten for its own sake.

### Consequence for lint

Idiom 3 deliberately pairs a **conditional** `FillPortions` with a **conditional** fixed size. Any rule that reads those two properties independently, or reads either statically, will produce false positives on correctly-authored responsive layout. `fillportions-with-fixed-size` is the rule to check against this.

### What was not established

These templates are Microsoft's authored source. Nothing here was compiled, rendered, or exercised at any viewport in this capture — the idioms are what first-party templates *emit*, which is strong evidence for authoring convention and no evidence at all about runtime behaviour on a given device.
