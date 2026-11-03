# Canvas App Failure Traps

Review these cases before a prototype becomes a shared app. Examples use classic controls, English separators, and tables containing the specified fields. Property comments identify where to paste each expression.

## 1. Building Before Defining the Work

Write down users, tasks, permissions, expected row counts, and growth. Sketch screens and data movement before selecting storage. Missing requirements lead to schema changes, repeated UI work, or slow queries.

Technique credit: Hako IT — [Power Apps Mistakes and How to Avoid Them](https://www.hakoit.com/en/power-apps-mistakes-and-how-to-avoid-them/).

Technique credit: HubSite365 — [5 Biggest Mistakes Power Apps Users Make When Starting Out](https://www.hubsite365.com/en-ww/crm-pages/5-biggest-mistakes-power-apps-users-make-when-starting-out-034000b8-9d12-4cae-a97e-954c21015cf2.htm).

## 2. Selecting Storage Only by Convenience

Use these planning bands, then check delegation, concurrency, security, and licensing. They are not backend capacity limits.

| Expected rows | Initial candidates |
|---|---|
| Below 500 | Excel for limited use; SharePoint for shared lists |
| 500–5,000 | SharePoint with suitable column indexes |
| 5,000–100,000 | Dataverse or SQL Server |
| Above 100,000 | Dataverse or SQL Server with server views |

For a struggling SharePoint app, index queried columns, review views and selectivity, then assess migration. A view does not turn unsupported Power Fx into a server query. Avoid Excel for many simultaneous writers.

Technique credit: Hako IT — [Power Apps Mistakes and How to Avoid Them](https://www.hakoit.com/en/power-apps-mistakes-and-how-to-avoid-them/).

## 3. Accepting a Partial Query Result

A local query over 10,000 records can inspect only the first 500 in a default app. Even at the 10,000-row maximum it cannot inspect a larger source. Matching results may be smaller still. Treat delegation warnings as correctness issues.

For SharePoint text, offer prefixes only when users accept that behavior. `Search` matches substrings and cannot delegate there; Dataverse and SQL support it on suitable text columns.

```powerfx
// galCustomerMatches.Items; Name and Email are text
Filter(
    Customers,
    StartsWith(Name, txtCustomerPrefix.Text) || StartsWith(Email, txtCustomerPrefix.Text)
)
```

See [Microsoft Learn: performant apps](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/create-performant-apps-overview) for data and query design.

Technique credit: Matthew Devaney — [Power Apps Coding Standards for Canvas Apps](https://www.matthewdevaney.com/power-apps-coding-standards-for-canvas-apps/).

## 4. Turning Startup into a Data Import

Loading profiles, managers, settings, and all business tables in sequence can push startup beyond ten seconds. Define read-only expressions in `App.Formulas` and load bounded screen data when needed.

```powerfx
// App.Formulas
fxAccountProfile = Office365Users.MyProfile();
fxReportingManager = Office365Users.Manager(fxAccountProfile.UserPrincipalName);
```

```powerfx
// OrderQueueScreen.OnVisible; OrderStates is a small reference table
If(IsEmpty(colOrderStates), ClearCollect(colOrderStates, OrderStates))
```

Define cache invalidation explicitly. An empty collection can mean either an unloaded cache or a successful empty response.

Technique credit: Matthew Devaney — [Power Apps Coding Standards for Canvas Apps](https://www.matthewdevaney.com/power-apps-coding-standards-for-canvas-apps/).

## 5. Querying Related Data for Each Row

One order request plus one customer request per displayed order is N+1: 100 rows can mean 101 requests. Prefer backend joins or relationship expansion. For small, complete caches, join locally before displaying rows.

```powerfx
// Load both snapshots completely before this action
ClearCollect(
    colOrderDisplay,
    AddColumns(
        colOrderSnapshot As OrderRow,
        CustomerCaption,
        LookUp(colCustomerSnapshot As CustomerRow, CustomerRow.ID = OrderRow.CustomerID, CustomerRow.Name)
    )
)
```

Bind the gallery to `colOrderDisplay` and its label to `ThisItem.CustomerCaption`. Wrapping a remote lookup in `AddColumns` still creates row requests.

Technique credit: Matthew Devaney — [Power Apps Coding Standards for Canvas Apps](https://www.matthewdevaney.com/power-apps-coding-standards-for-canvas-apps/).

## 6. Freezing Every Position

Place heading and navigation rows inside a vertical root container. Let the body grow between them. Configure alignment and flexible dimensions; test narrow and wide windows. Coordinates alone do not handle rotation or text growth.

Technique credit: Matthew Devaney — [Power Apps Coding Standards for Canvas Apps](https://www.matthewdevaney.com/power-apps-coding-standards-for-canvas-apps/).

## 7. Leaving Inserted Names in Place

Rename controls by purpose: `btnOpenOrder`, `lblOrderState`, `txtOrderPrefix`, `OrderDetailScreen`. Make navigation destinations and references readable without opening each control.

Technique credit: Matthew Devaney — [Power Apps Coding Standards for Canvas Apps](https://www.matthewdevaney.com/power-apps-coding-standards-for-canvas-apps/).

## 8. Duplicating Configuration Literals

Store colors in an `fx` theme record. Put deployment values in environment configuration and runtime choices in variables. A hardcoded email check cannot enforce backend authorization.

```powerfx
// App.Formulas
fxQueuePalette = {Accent: ColorValue("#165B78"), Surface: ColorValue("#F2F6F8")};
```

Use `fxQueuePalette.Accent` for button fill and shared state such as `gblChosenCategory` for runtime filtering.

Technique credit: Matthew Devaney — [Power Apps Coding Standards for Canvas Apps](https://www.matthewdevaney.com/power-apps-coding-standards-for-canvas-apps/).

## 9. Navigating After an Unchecked Save

Keep confirmation and navigation in the success branch. `Orders` needs a text `Title` field.

```powerfx
IfError(
    Patch(Orders, Defaults(Orders), {Title: txtNewOrderTitle.Text}),
    Notify("Order could not be saved. " & FirstError.Message, NotificationType.Error); false,
    Notify("Order created.", NotificationType.Success);
    Navigate(OrderDetailScreen, ScreenTransition.None); true
)
```

Technique credit: Matthew Devaney — [Power Apps Coding Standards for Canvas Apps](https://www.matthewdevaney.com/power-apps-coding-standards-for-canvas-apps/).

## 10. Serializing Independent Loads

Start independent connector work together. Keep dependencies in sequence; branches must not read values assigned by other branches.

```powerfx
Concurrent(
    ClearCollect(colStateOptions, OrderStates),
    ClearCollect(colDeliveryOptions, DeliveryMethods),
    ClearCollect(colRegionOptions, Regions)
)
```

Each source must fit its local loading limit. Concurrency changes timing, not delegation.

Technique credit: Matthew Devaney — [Power Apps Coding Standards for Canvas Apps](https://www.matthewdevaney.com/power-apps-coding-standards-for-canvas-apps/).

## 11. Reusing a Name Across Scopes

Screen context hides a same-named global. Distinguish application state with `gbl`, screen context with `loc`, and in-memory tables with `col`.

```powerfx
Set(gblWorkflowState, "Ready");
UpdateContext({locEditorState: "Draft"})
```

Technique credit: Matthew Devaney — [Power Apps Coding Standards for Canvas Apps](https://www.matthewdevaney.com/power-apps-coding-standards-for-canvas-apps/).

## 12. Treating Collections as Permanent Storage

Collections belong to the current session. Save business changes to a persistent source. Use `SaveData` and `LoadData` only in an explicit offline/local design, with the host's support and storage limits checked.

Technique credit: Matthew Devaney — [Power Apps Coding Standards for Canvas Apps](https://www.matthewdevaney.com/power-apps-coding-standards-for-canvas-apps/).

## 13. Testing Only a Tiny Fixture

Load realistic row counts and plant known matches beyond the local query limit. Test on target devices and networks. Inspect requests in Monitor. Compare returned IDs against the source: a truncated count cannot prove completeness.

Technique credit: Matthew Devaney — [Power Apps Coding Standards for Canvas Apps](https://www.matthewdevaney.com/power-apps-coding-standards-for-canvas-apps/).

## 14. Creating a Control Dependency Cycle

Do not make two inputs define each other's defaults. Bind both `Default` properties to shared state, update it from a behavior, and reset inputs when the design requires a new default.

```powerfx
// txtSharedValue.OnChange
Set(gblSharedCaption, Self.Text)
```

Use `gblSharedCaption` for the other inputs' `Default`.

Technique credit: Matthew Devaney — [Power Apps Coding Standards for Canvas Apps](https://www.matthewdevaney.com/power-apps-coding-standards-for-canvas-apps/).

## 15. Discovering Phone Constraints at Release

Test touch targets, keyboard behavior, orientation, memory, and intermittent connections early. Use containers, trim caches, and define offline behavior. A desktop success path leaves these conditions untested.

Technique credit: Matthew Devaney — [Power Apps Coding Standards for Canvas Apps](https://www.matthewdevaney.com/power-apps-coding-standards-for-canvas-apps/).

## 16. Calling a Flow for Every Small Operation

Flow startup adds latency. About 0.6 seconds per invocation is a commonly observed estimate, not a guarantee; measure the deployment. Use connectors for simple reads/writes and immediate UI responses. Reserve flows for branching, multi-step processes, background jobs, and explicitly authorized service-side work.

Technique credit: Matthew Devaney — [Power Apps Coding Standards for Canvas Apps](https://www.matthewdevaney.com/power-apps-coding-standards-for-canvas-apps/).

## 17. Repeating Profile Connector Expressions

Define one read-only profile formula and reuse its fields. This allows evaluation reuse; it is not a permanent cache or a promise of exactly one request.

```powerfx
// App.Formulas
fxSignedInProfile = Office365Users.MyProfile();
fxSignedInName = fxSignedInProfile.DisplayName;
fxSignedInMail = fxSignedInProfile.Mail;
fxSignedInDepartment = fxSignedInProfile.Department;
```

Technique credit: Matthew Devaney — [Power Apps Coding Standards for Canvas Apps](https://www.matthewdevaney.com/power-apps-coding-standards-for-canvas-apps/).

## Review Map

| Symptom | First change to assess |
|---|---|
| Missing results | Check delegation and column types |
| Slow first screen | Reduce startup work; defer screen loads |
| Repeated row requests | Use server joins or complete local caches |
| Layout overflow | Configure containers and resize tests |
| Confusing formulas | Rename controls and distinguish scopes |
| Hidden save failures | Gate success with error handling |
| Serial request latency | Use `Concurrent` for independent work |
| Memory pressure | Reduce retained rows, columns, and collections |
| Queries fail after growth | Reassess storage and query design |

Technique credit: Matthew Devaney — [Power Apps Coding Standards for Canvas Apps](https://www.matthewdevaney.com/power-apps-coding-standards-for-canvas-apps/).
