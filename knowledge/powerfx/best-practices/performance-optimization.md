# Canvas App Performance Rules

Measure startup, requests, and rendering before optimizing. Fetch fewer rows and columns, share repeated work, and keep connectors out of frequently evaluated UI paths. Examples use English separators and classic controls; comments identify properties. Connect the named sources with the fields shown.

## Startup and Independent Loads

Define read-only expressions in `App.Formulas`. Their values follow dependencies; they are not assignments that run once. Defer screen-specific loads and retain only required startup state.

```powerfx
// App.Formulas
fxQueueProfile = Office365Users.MyProfile();
fxQueueManager = Office365Users.Manager(fxQueueProfile.UserPrincipalName);
fxQueueTheme = {Accent: ColorValue("#236477"), Neutral: ColorValue("#667780")};
```

```powerfx
// OrderQueueScreen.OnVisible; both reference tables must fit the local row cap
If(IsEmpty(colDeliveryMethods), ClearCollect(colDeliveryMethods, DeliveryMethods));
If(IsEmpty(colOrderStates), ClearCollect(colOrderStates, OrderStates))
```

Use `Concurrent` for independent requests. Run dependent work afterward. Elapsed time can approach the slowest request rather than the sum, subject to throttling and device limits.

```powerfx
Concurrent(
    ClearCollect(colCustomerRegions, CustomerRegions),
    ClearCollect(colOrderStateOptions, OrderStates),
    ClearCollect(colDeliveryChoices, DeliveryMethods)
)
```

Reference: [Microsoft Learn: code optimization](https://learn.microsoft.com/en-us/power-apps/guidance/coding-guidelines/code-optimization).

Technique credit: Matthew Devaney — [Power Apps Performance Optimization Guidelines](https://www.matthewdevaney.com/power-apps-coding-standards-for-canvas-apps/power-apps-performance-optimization-guidelines/).

## Data Loading Patterns

Use `LookUp` for one record. It expresses the requirement directly; do not assume `First(Filter(...))` always downloads every match or promises a fixed speed difference.

```powerfx
LookUp(Customers, ID = 84)
```

Use `CountIf` for a conditional count. `Count` counts numeric values in a single column, not arbitrary table rows.

```powerfx
CountIf(colOrderSnapshot, State = "Waiting")
```

Replace a reset followed by a load with `ClearCollect`. Remote retrieval still has a row cap. Keep explicit column selection enabled and preserve only required fields. Newer apps normally enable ECS, including the 2023-era baseline; inspect older settings and collection lineage. Since version 3.24042, table-shaping column arguments use identifiers.

```powerfx
ClearCollect(colCustomerPreview, ShowColumns(Customers, ID, Name, Email, Phone, IsActive))
```

Technique credit: Matthew Devaney — [Power Apps Performance Optimization Guidelines](https://www.matthewdevaney.com/power-apps-coding-standards-for-canvas-apps/power-apps-performance-optimization-guidelines/).

## Precompute Repeated Row Work

Move expensive repeated calculations and formatting into a projection or cached load. Cheap template expressions are acceptable. `AddColumns` still computes per row and recalculates with dependencies; it is not permanent storage.

```powerfx
// galOrderAmounts.Items; snapshot has Units, UnitCost, DiscountRate
AddColumns(
    AddColumns(colOrderSnapshot, NetAmount, Units * UnitCost * (1 - DiscountRate)),
    AmountCaption, Text(NetAmount, "[$-en-US]$#,##0.00"),
    AmountBand, If(NetAmount >= 750, "Large", "Routine")
)
```

Bind labels to `ThisItem.AmountCaption` and `ThisItem.AmountBand`. Nest projections when later expressions need a newly added field.

Technique credit: Platforms of Power — [Power Apps Performance Optimisation: Ultimate Guide](https://platformsofpower.net/power-apps-performance-optimisation-ultimate-guide/).

## Cache Related Data and Avoid N+1

One list request plus a related-record request per displayed row is N+1. Prefer relationship expansion or server joins/views. In Dataverse, a schema exposing Orders.Customer and customer Name permits `ThisItem.Customer.Name`; inspect actual expansion in Monitor.

For small, complete local caches, join before display. Here orders have CustomerID and RepID, while the other caches have ID and Name.

```powerfx
ClearCollect(
    colOrderCaptions,
    AddColumns(
        colOrderSnapshot As OrderRow,
        CustomerCaption, LookUp(colCustomerSnapshot As CustomerRow, CustomerRow.ID = OrderRow.CustomerID, CustomerRow.Name),
        RepCaption, LookUp(colRepSnapshot As RepRow, RepRow.ID = OrderRow.RepID, RepRow.Name)
    )
)
```

Use the same pattern for contacts and account names. Remote lookups inside `AddColumns` still issue per-row calls; remote projections can also be row-limited. A key-map collection can simplify references, but adding a Key column does not create a database index or make the collection smaller by itself.

```powerfx
ClearCollect(colCustomerKeyMap, RenameColumns(ShowColumns(colCustomerSnapshot, ID, Name), ID, CustomerKey))
```

Technique credit: Platforms of Power — [Power Apps Performance Optimisation: Ultimate Guide](https://platformsofpower.net/power-apps-performance-optimisation-ultimate-guide/).

## Reduce Controls and Screen Dependencies

Treat 500 controls per app as a review budget, not a hard platform limit. A form field often contains about four controls. Separate new/edit/view forms multiply that cost: use one edit form and switch with `NewForm`, `EditForm`, and `ViewForm`. Set its Item to the selected source record; a default Item alone does not establish new mode.

Use a gallery/button template for a repeated menu. It reduces authored controls, though rendered rows retain runtime cost.

```powerfx
// galQueueMenu.Items
Table(
    {Caption: "Queue", Destination: OrderQueueScreen},
    {Caption: "Customers", Destination: CustomerListScreen},
    {Caption: "Summary", Destination: OrderSummaryScreen},
    {Caption: "Preferences", Destination: PreferencesScreen}
)
```

```powerfx
// Template button OnSelect
Navigate(ThisItem.Destination, ScreenTransition.None)
```

Store selection before navigating. Reading controls from another screen can force that screen to load.

```powerfx
// Order gallery OnSelect
Set(gblChosenOrder, ThisItem);
Navigate(OrderDetailScreen, ScreenTransition.None)
```

Set classic search inputs' `DelayOutput` to true, or capture the term on a button. Debouncing changes frequency, not delegation. A supported SharePoint text prefix can use:

```powerfx
// galOrderQueue.Items
Filter(Orders, StartsWith(Title, txtOrderPrefix.Text))
```

Use `ScreenTransition.None` when animation adds no useful feedback. This avoids animation cost, not connector latency.

Technique credit: Matthew Devaney — [Power Apps Performance Optimization Guidelines](https://www.matthewdevaney.com/power-apps-coding-standards-for-canvas-apps/power-apps-performance-optimization-guidelines/).

## Bound and Flatten Collections

Mobile memory is limited. Load only the needed subset and never equate a capped collection with its source. Use `FirstN`, not the nonexistent `TopN`. This preview operates on a complete bounded local snapshot.

```powerfx
ClearCollect(colRecentOrderPreview, FirstN(Sort(colOrderSnapshot, CreatedOn, SortOrder.Descending), 100))
```

Avoid repeatedly collecting related rows inside nested loops. Prefer flat rows or locally grouped data. When a nested child table is necessary, alias both scopes. This projection remains nested; it is not a flat join.

```powerfx
ClearCollect(
    colCustomersWithOrders,
    AddColumns(
        colCustomerSnapshot As CustomerRow,
        CustomerOrders, Filter(colOrderSnapshot As OrderRow, OrderRow.CustomerID = CustomerRow.ID)
    )
)
```

For a flat view, start from orders and add customer captions. Clear temporary caches when the owning workflow ends.

Technique credit: Platforms of Power — [Power Apps Performance Optimisation: Ultimate Guide](https://platformsofpower.net/power-apps-performance-optimisation-ultimate-guide/).

## Use Flows for Server Work

About 0.6 seconds per invocation is a community estimate of flow startup, not a guarantee. Measure it. Avoid one flow call per small row update. Connect a batch flow with a text input and submit one JSON payload where that contract is supported.

```powerfx
// Behavior property; ProcessOrderBatch accepts JSON text
ProcessOrderBatch.Run(JSON(colOrderChanges))
```

| Prefer a flow | Prefer a direct connector |
|---|---|
| Multi-step business process | Simple create/read/update/delete |
| Background execution | Immediate UI response |
| Large server transformation | Small bounded query |
| Branching across services | One-source operation |

Use service-side permissions only through an explicitly authorized design.

Technique credit: Platforms of Power — [Power Apps Performance Optimisation: Ultimate Guide](https://platformsofpower.net/power-apps-performance-optimisation-ultimate-guide/).

## Simplify Hot Formulas

Name repeated arithmetic with `With`, flatten branches with `Switch` or multi-condition `If`, and reference the current control through `Self`.

```powerfx
With({gross: Value(txtNetAmount.Text) * 1.08}, If(gross >= 750, gross * 0.95, gross))
```

```powerfx
// State label Text
Switch(drpQueueState.Selected.Value, "R", "Ready", "W", "Waiting", "C", "Closed", "Other")
```

```powerfx
// Classic button Fill
If(Self.Pressed, Color.Navy, Color.Teal)
```

Technique credit: Matthew Devaney — [Power Apps Performance Optimization Guidelines](https://www.matthewdevaney.com/power-apps-coding-standards-for-canvas-apps/power-apps-performance-optimization-guidelines/).

## Review Connections

Use roughly 30 connections as a review budget. Count configured connection instances and credentials, not just connector types. Several lists can share a SharePoint-site connection, SQL tables a database connection, and Dataverse tables an environment connection. A single connector type can still have multiple connections. Consolidate redundant connections and remove unused ones.

Technique credit: Matthew Devaney — [Power Apps Performance Optimization Guidelines](https://www.matthewdevaney.com/power-apps-coding-standards-for-canvas-apps/power-apps-performance-optimization-guidelines/).

## Batch Changes with Source Records

`ForAll` is not inherently sequential, but row-wise remote writes can be costly and throttled. Where supported, use table-form `Patch` with base/change tables of matching size and order. Base records must retain source identity. Here `colOrderBases` contains a complete small set of Orders records, and State is text.

```powerfx
IfError(
    Patch(Orders, colOrderBases, ForAll(colOrderBases, {State: "Reviewed"})),
    Notify("Some order updates failed.", NotificationType.Error); false,
    Notify("Order updates returned successfully.", NotificationType.Success); true
)
```

Check partial failures and measure requests. Dataverse, SQL, and SharePoint implementations differ; there is no universal tenfold gain or single-request guarantee. SharePoint supports applicable table-form patterns; it is not universally limited to individual Power Fx Patch calls.

Technique credit: Matthew Devaney — [Power Apps Performance Optimization Guidelines](https://www.matthewdevaney.com/power-apps-coding-standards-for-canvas-apps/power-apps-performance-optimization-guidelines/).

## Keep Media Small

Use SVG data URIs for simple scalable artwork and dynamic colors. Text SVG need not be smaller for photographs. Compress raster media, remove unused images in Studio, and review unused connections separately.

```powerfx
// imgQueueMarker.Image
"data:image/svg+xml," & EncodeUrl("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect x='4' y='4' width='24' height='24' rx='5' fill='#236477'/></svg>")
```

Technique credit: Matthew Devaney — [Power Apps Performance Optimization Guidelines](https://www.matthewdevaney.com/power-apps-coding-standards-for-canvas-apps/power-apps-performance-optimization-guidelines/).

## Maintain the Published App

Review App checker warnings, formula costs, control counts, and unused components. Save, test, and republish periodically to adopt runtime fixes and optimizations. Validate on target devices before releasing.

Reference: [Microsoft Learn: performant apps overview](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/create-performant-apps-overview).

Technique credit: Matthew Devaney — [Power Apps Performance Optimization Guidelines](https://www.matthewdevaney.com/power-apps-coding-standards-for-canvas-apps/power-apps-performance-optimization-guidelines/).

## Choose a Backend for the Work

| Concern | Dataverse | SharePoint | SQL Server |
|---|---|---|---|
| Delegation | Broad, type-dependent | More restricted | Broad, type-dependent |
| Related data | Native navigation | Supported lookups/joins | Views/joins and supported relationships |
| Text Search | Supported columns | Local | Supported columns |
| Large shared workloads | Strong candidate | Selective indexed queries needed | Strong candidate |
| Offline | Supported canvas scenarios | Custom design needed | Custom design needed |

Consider Dataverse for enterprise relational workloads, then assess licensing, security, and operations. Backend choice alone cannot fix a poor query.

Technique credit: Platforms of Power — [Power Apps Performance Optimisation: Ultimate Guide](https://platformsofpower.net/power-apps-performance-optimisation-ultimate-guide/).

## Measure Changes

Record wall-clock duration around a bounded load and trace milestones. This measures app elapsed time, not isolated server execution.

```powerfx
// Diagnostic button OnSelect
UpdateContext({locLoadBegan: Now()});
Trace("Order preview load began", TraceSeverity.Information);
ClearCollect(colTimedOrderPreview, Filter(Orders, State = "Ready"));
UpdateContext({locLoadFinished: Now()});
UpdateContext({locLoadMilliseconds: DateDiff(locLoadBegan, locLoadFinished, TimeUnit.Milliseconds)});
Trace("Order preview load finished", TraceSeverity.Information, {Rows: CountRows(colTimedOrderPreview), Milliseconds: locLoadMilliseconds});
Notify(Text(locLoadMilliseconds) & " ms elapsed", NotificationType.Information)
```

Open Monitor from Studio tools and inspect request count, payload size, duration, and formula evaluations. Aim for a useful first screen within five seconds as a design target. Test realistic row counts, devices, and networks rather than only a small warm cache.

Technique credit: Platforms of Power — [Power Apps Performance Optimisation: Ultimate Guide](https://platformsofpower.net/power-apps-performance-optimisation-ultimate-guide/).

## Review Priorities

| Observed cost | First investigation |
|---|---|
| Startup blocks the UI | Derived formulas and deferred loads |
| Per-row network reads | Relationships, views, or complete local joins |
| Count/filter repetition | Appropriate aggregates and delegation |
| Single-record query | Express it with LookUp |
| Repeated controls | Gallery/template or shared form |
| Deep nested galleries | Flatten or group the data |
| Unexpected screen loading | Remove cross-screen control references |

Technique credit: Matthew Devaney — [Power Apps Performance Optimization Guidelines](https://www.matthewdevaney.com/power-apps-coding-standards-for-canvas-apps/power-apps-performance-optimization-guidelines/).
