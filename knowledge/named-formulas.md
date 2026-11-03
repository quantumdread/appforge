# Power Apps Named Formulas (App.Formulas)

> **Machine-checked (v2.3, 2026-07-20):** the AppForge MCP `validate_yaml` now flags repeated non-trivial formulas (`duplicate-formula`, `duplicate-formula-in-gallery`) and repeated color literals as advisory WARNs (rule family: centralization). See CHANGELOG.

## Overview

Named Formulas are **declarative, globally-scoped, immutable calculations** defined in `App.Formulas` that automatically recalculate when dependencies change. They provide up to **80% faster load times** compared to App.OnStart.

---

## Syntax

```yaml
App.Formulas: |-
  =FormulaName = Expression;
  AnotherFormula = Expression;
```

**Rules:**
- Each formula ends with `;`
- Assignment uses `=`
- All formulas in one `App.Formulas` property

---

## Named Formulas vs Variables

| Aspect | Named Formulas | Set() | UpdateContext() |
|--------|----------------|-------|-----------------|
| Scope | Global | Global | Screen-local |
| Mutability | Immutable | Mutable | Mutable |
| Evaluation | Automatic | Manual | Manual |
| Side Effects | Not allowed | Allowed | Allowed |
| Performance | Deferred | Blocks OnStart | On execution |

---

## When to Use Named Formulas

**Use for:**
- Theme colors/fonts (constants)
- User profile lookups
- Filtered data views
- Calculated aggregations
- App constants

**Use Variables (Set) for:**
- Toggle states
- Form mode tracking
- Temporary flags
- Navigation parameters

---

## Common Patterns

### Theme Management
```yaml
App.Formulas: |-
  =AppTheme = {
      Primary: RGBA(59, 108, 125, 1),
      Secondary: RGBA(249, 251, 251, 1),
      TextDark: RGBA(0, 0, 0, 1),
      TextLight: RGBA(255, 255, 255, 1),
      FontSmall: 11,
      FontNormal: 13,
      FontLarge: 18
  };
```

### User Context
```yaml
App.Formulas: |-
  =CurrentUserEmail = User().Email;
  CurrentUser = LookUp(Users, 'Primary Email' = CurrentUserEmail);
  CurrentUserRole = CurrentUser.Role;
  IsAdmin = CurrentUserRole = "Administrator";
```

### Data Filtering Layers
```yaml
App.Formulas: |-
  =ActiveProjects = Filter(Projects, Status.Value = "Active");
  MyProjects = Filter(ActiveProjects, Owner.Email = CurrentUserEmail);
  HighPriorityProjects = Filter(ActiveProjects, Priority.Value = "High");
```

### Aggregations
```yaml
App.Formulas: |-
  =TotalBudget = Sum(ActiveProjects, Budget);
  ProjectCount = CountRows(MyProjects);
  AverageCompletion = Average(ActiveProjects, 'Percent Complete');
```

---

## Centralize with named formulas & UDFs
<!-- verified: true, verified_at: 2026-07-19, verified_by: compile_canvas -->

Formatting, status/badge logic, and data fallbacks are the highest-frequency sources of duplicated Power Fx. In one production app, centralizing about 55 callsites reduced them to 12 formulas. Named formulas and UDFs are also the **only centralization mechanism that works inside gallery templates**, where components cannot be placed.

Use typed UDFs for parameterized formatting. Keep locale explicit when output is user-facing:

```powerfx
FmtKr(v: Number): Text = Text(v, "#,##0", "sv-SE") & " kr"
```

Centralize badge behavior as a text + fill + color triplet so every callsite uses the same label and contrast pair:

```powerfx
BadgeText(status: Text): Text = Switch(status, "New", "New", "Done", "Done", "Unknown");
BadgeFill(status: Text): Color = Switch(status, "New", RGBA(219, 234, 254, 1), "Done", RGBA(220, 252, 231, 1), RGBA(243, 244, 246, 1));
BadgeColor(status: Text): Color = Switch(status, "New", RGBA(30, 64, 175, 1), "Done", RGBA(22, 101, 52, 1), RGBA(55, 65, 81, 1))
```

Wrap repeated data fallbacks instead of scattering `Coalesce` across controls:

```powerfx
TextOrDash(v: Text): Text = Coalesce(v, "—");
NumberOrZero(v: Number): Number = Coalesce(v, 0)
```

Typed UDFs require the **User-defined functions** experimental setting. Enable that setting before adding `FmtKr`, the badge triplet, or other typed functions to `App.Formulas`; ordinary parameterless named formulas do not require that gate.

---

## Migration from OnStart

**Before (slow):**
```yaml
App.OnStart: |-
  =Set(varUserEmail, User().Email);
  Set(varUserInfo, LookUp(Users, Email = varUserEmail));
  ClearCollect(colActiveProjects, Filter(Projects, Status = "Active"))
```

**After (fast):**
```yaml
App.Formulas: |-
  =UserEmail = User().Email;
  UserInfo = LookUp(Users, Email = UserEmail);
  ActiveProjects = Filter(Projects, Status.Value = "Active");
```

---

## Naming Convention

**Drop "var" prefix** for named formulas (they're immutable):
```yaml
# Named Formulas (immutable)
UserRole = LookUp(...)
PrimaryColor = RGBA(...)

# Variables (mutable) - keep var prefix
Set(varFormMode, FormMode.New)
Set(varShowPanel, false)
```

---

## Limitations

1. **No circular references** - Formulas cannot reference each other in a loop
2. **No behavior functions** - Cannot use Set, Collect, Notify (use UDFs for that)
3. **Immutable** - Cannot be modified after definition

---

## YAML Example

```yaml
App As App:
  Formulas: |-
    =// Constants
    AppTitle = "Service Manager";
    PageSize = 25;

    // User context
    CurrentUserEmail = User().Email;
    CurrentUser = LookUp(Users, 'Primary Email' = CurrentUserEmail);
    IsAdmin = CurrentUser.Role = "Administrator";

    // Data filters
    ActiveProjects = Filter(Projects, Status.Value = "Active");
    MyProjects = Filter(ActiveProjects, Owner.Email = CurrentUserEmail);

    // Aggregations
    TotalBudget = Sum(ActiveProjects, Budget);
    ProjectCount = CountRows(MyProjects);

    // Theme
    AppTheme = {
        Primary: RGBA(59, 108, 125, 1),
        Secondary: RGBA(249, 251, 251, 1)
    };

  OnStart: |-
    =// Only mutable state here
    Set(varFormMode, FormMode.New);
    Set(varShowPanel, false)
```
