# Deep Linking in Canvas Apps

A deep-link URL supplies parameters that select a canvas app screen or record when the app opens. Route with `App.StartScreen`; the older `Navigate()` call in `App.OnStart` is deprecated.

Technique from Matthew Devaney: [Power Apps Deep Links: Email Direct Link To A Specific Record](https://www.matthewdevaney.com/power-apps-deep-links-email-direct-link-to-a-specific-record/).

---

## URL Syntax

```
https://apps.powerapps.com/play/{App ID}?{paramName}={paramValue}[&{paramName}={paramValue}...]
```

For apps embedded as a **Teams channel tab**, add `&source=teamstab` so the link opens inside Teams rather than launching a browser tab.

For **Power Pages / Power Platform-hosted contexts**, the host environment may rewrite the URL — test the deep link from the same context end users will use.

---

## The Three-Piece Pattern

| Piece | Where it lives | What it does |
|-------|---------------|--------------|
| 1. Capture | `App.OnStart` (optional) | Read `Param()` into a global variable for reuse |
| 2. Route | `App.StartScreen` | Decide which screen to render first based on the param |
| 3. Load | Target screen `OnVisible` | Look up the record / hydrate context for that screen |

`App.StartScreen` evaluates independently of `OnStart`. The app can render the right screen before `OnStart` finishes — that's why it replaces the old `Navigate()`-in-`OnStart` pattern.

---

## 1. Capture — App.OnStart

`OnStart` can no longer call `Navigate()`, but it **can** still set variables and look up records. Use it to capture deep link parameters once at startup if multiple screens or formulas need the value.

### Minimal capture (param into variable)

```powerfx
// App.OnStart
If(
    !IsBlank(Param("recordId")),
    Set(varRecordId, Param("recordId"))
);
```

### Capture + lookup (Devaney pattern — record ready at startup)

```powerfx
// App.OnStart
Set(
    varSelectedRecord,
    LookUp(
        'My Table',
        IDColumn = GUID(Param("recordId"))
    )
);
```

Use the capture-only version if the target screen `OnVisible` will do the lookup. Use the capture+lookup version if multiple screens need the record or you want it ready before the screen renders.

### Capture is optional

`Param()` can be read from anywhere — `StartScreen`, `OnVisible`, or any formula. You don't strictly need to capture into a variable. Capturing once is cleaner when the value is reused.

---

## 2. Route — App.StartScreen

`StartScreen` is a **data flow formula** — no behavior functions allowed (no `Set`, `Navigate`, `Collect`, `Patch`). It just returns a screen reference.

### Pattern: present-or-absent param

```powerfx
// App.StartScreen
If(
    IsBlank(Param("recordId")),
    'Landing Screen',     // Default — no deep link
    DetailsScreen         // Deep link present
)
```

### Pattern: multi-mode routing with Switch

```powerfx
// App.StartScreen
Switch(
    Param("mode"),
    "admin", AdminScreen,
    "reports", ReportsScreen,
    "settings", SettingsScreen,
    HomeScreen   // Default fallback
)
```

### Pattern: combine deep link with user-role check

```powerfx
// App.StartScreen
If(
    !IsBlank(Param("recordId")) && LookUp(Approvers, Email = User().Email).Active,
    DetailsScreen,
    'Landing Screen'
)
```

The role check prevents an unauthorized user from deep linking past UI-level filters. See [Security Considerations](#security-considerations).

---

## 3. Load — Target Screen OnVisible

If `OnStart` didn't already hydrate the record, the target screen does it in `OnVisible`. This keeps `StartScreen` fast (it shouldn't do heavy lookups) and isolates per-screen data loading.

### Pattern: load on first visit, skip on re-entry

```powerfx
// DetailsScreen.OnVisible
If(
    !IsBlank(varRecordId) && IsBlank(selectedItem),
    UpdateContext({
        selectedItem: LookUp('My Table', IDColumn = GUID(varRecordId))
    })
);
```

The `IsBlank(selectedItem)` guard prevents re-fetching every time the user navigates back to the screen from elsewhere within the app.

### Pattern: with not-found / unauthorized handling

```powerfx
// DetailsScreen.OnVisible
If(
    !IsBlank(varRecordId),
    With(
        { foundRecord: LookUp('My Table', IDColumn = GUID(varRecordId)) },
        If(
            IsBlank(foundRecord),
            UpdateContext({ errorMsg: "Record not found or you don't have access." }),
            UpdateContext({ selectedItem: foundRecord, errorMsg: "" })
        )
    )
);
```

---

## Parameter Type Casting

`Param()` always returns text. Always cast to the destination column's type before comparing.

| Destination type | Cast | Example |
|-----------------|------|---------|
| Dataverse GUID | `GUID()` | `LookUp(Accounts, accountid = GUID(Param("id")))` |
| Numeric ID | `Value()` | `LookUp(Orders, OrderID = Value(Param("ord")))` |
| Date | `DateValue()` | `Filter(Events, Date = DateValue(Param("date")))` |
| Boolean | `Param("flag") = "true"` | `If(Param("admin") = "true", ...)` |
| Text | no cast | `LookUp(Tickets, Number = Param("num"))` |

A type mismatch usually produces a silent `IsBlank()` match-failure rather than an error — easy to miss in testing.

---

## Common Pitfalls

### ❌ Using Navigate in OnStart (deprecated)

```powerfx
// App.OnStart
Navigate(
    If(Param("recordId") <> "", DetailsScreen, HomeScreen)
);
```

`Navigate()` is no longer allowed in `OnStart`. Use `StartScreen`.

### ❌ Doing the heavy lookup in StartScreen

```powerfx
// App.StartScreen
If(
    !IsBlank(LookUp('Heavy Table', ID = GUID(Param("id")))),
    DetailsScreen,
    HomeScreen
)
```

`StartScreen` blocks first-screen render. Heavy data ops here defeat its purpose. Decide which screen using a cheap check; load data in `OnVisible`.

### ❌ Forgetting type casting

```powerfx
// Param returns "abc-123" as text; column is GUID
LookUp(Records, IDColumn = Param("recordId"))   // Always blank
```

Cast `Param()` to the right type — see table above.

### ❌ No fallback for missing/invalid param

```powerfx
// App.StartScreen
DetailsScreen   // Always go here, even if no param
```

A user opening the app without a deep link sees a confused empty detail screen. Always provide a default route.

### ✅ Correct end-to-end pattern

```powerfx
// App.OnStart
If(!IsBlank(Param("recordId")), Set(varRecordId, Param("recordId")));

// App.StartScreen
If(IsBlank(Param("recordId")), 'Landing Screen', DetailsScreen)

// DetailsScreen.OnVisible
If(
    !IsBlank(varRecordId) && IsBlank(selectedItem),
    UpdateContext({
        selectedItem: LookUp('My Table', IDColumn = GUID(varRecordId))
    })
);
```

---

## Security Considerations

Deep links bypass UI-level filtering. A user who knows the URL pattern can change `?recordId=...` to view records they wouldn't see in the gallery.

### Required mitigations

| Approach | Implementation |
|----------|---------------|
| **Dataverse row-level security** | Configure table-level security roles so the `LookUp` returns blank for unauthorized rows. Cleanest. |
| **OnVisible authorization check** | Verify the record is in the user's allowed set before showing data: `If(LookUp(...).owner = User().Email, show, redirect)` |
| **Service-account pattern** | Don't expose the underlying connection; route through a flow that enforces auth. Used when the data source can't be locked down per-user. |

### What deep linking does NOT do

- It does **not** bypass app-level authentication (the user must still sign in to Power Apps)
- It does **not** bypass solution-level licensing
- It does **not** prevent URL inspection — never put secrets, passwords, or PII directly into query parameters

---

## Teams Embed Considerations

When the canvas app is embedded as a Microsoft Teams channel tab:

| Concern | Handling |
|---------|---------|
| **Open inside Teams, not browser** | Append `&source=teamstab` to the deep link URL |
| **Tab state persistence** | Teams Tab URL is fixed — the deep link URL is for clicks from email/Teams messages, not the tab itself |
| **Notification deep links** | Use the same `&source=teamstab` suffix when generating links from `NotifyApprovalRecipients` or equivalent flows |

---

## StartScreen Lifecycle

- `StartScreen` evaluates **once per app session**, at startup.
- Not re-evaluated when the user navigates within the app via `Navigate()` or `Back()`.
- Not re-evaluated when the user re-opens the app from a different deep link in the same session (browser tab reuse).
- For runtime route logic, use `Navigate()` from within screens — `StartScreen` is strictly a session entry point.

---

## Related Rules

- [navigate-back.md](navigate-back.md) — `Navigate()` and `Back()` functions for in-session screen changes
- [app-formulas/app-object.md](../app-formulas/app-object.md) — Full `App` object reference, including `StartScreen` and `OnStart` semantics
- [best-practices/performance-optimization.md](../best-practices/performance-optimization.md) — Why heavy `OnStart` and `StartScreen` formulas slow first-screen render
