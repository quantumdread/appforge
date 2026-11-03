# Reusable Values in App.Formulas

Use a named formula for a value derived from other values. Keep mutable state and actions in behavior properties. Code comments identify property destinations; use English separators and classic controls. Connect each named source before using its fields.

## Choose a Formula or a Variable

A named formula is a dependency expression, not an assignment that runs once. Power Fx chooses when to evaluate it and can reuse its result. Its definition cannot be overwritten with `Set`; its value can change when its dependencies change. Connector reuse does not guarantee one permanent request or live synchronization with remote edits.

| Decision | Named formula | Variable/collection |
|---|---|---|
| Definition location | `App.Formulas` | Behavior such as OnSelect, OnVisible, OnStart |
| Updating the value | Dependency recalculation | Explicit `Set`, `UpdateContext`, or collection operations |
| Typical use | Shared filter, profile expression, theme, derived total | Selection, edit mode, mutable cache |
| Actions | Not in ordinary named values | Behavior formulas can perform them |
| Evaluation | Runtime schedules it as needed | Assignment stores a snapshot |

```powerfx
// App.Formulas
fxOrderAccent = ColorValue("#245E73");
fxSignedInAddress = User().Email;
```

Reference: [Microsoft Learn: App object](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/object-app).

## 1. Share Source Filters

Define common views once. The following assumes Tasks has Yes/No `IsActive`, text `Priority` and `State`, and a single-person `Owner` field. Verify the connector delegation of each predicate; wrapping a query in a named formula does not change it.

```powerfx
// App.Formulas
fxActiveTasks = Filter(Tasks, IsActive = true);
fxUrgentTasks = Filter(Tasks, Priority = "Urgent" && State = "Open");
fxTasksOwnedByMe = Filter(Tasks, Owner.Email = User().Email);
```

Bind `galTaskQueue.Items` to `fxActiveTasks`. Changes to the common filter then reach every consumer.

Technique credit: Matthew Devaney — [6 Use-Cases for the Power Apps App.Formulas Property](https://www.matthewdevaney.com/6-use-cases-for-the-power-apps-app-formulas-property-named-formulas/).

## 2. Share Profile Expressions

Reuse one profile expression, derive the department, and load manager/photo data only where required. These examples use the original Office365Users profile operation and its PascalCase fields. Handle missing managers and inaccessible photos in the consuming UI.

```powerfx
// App.Formulas
fxViewerProfile = Office365Users.MyProfile();
fxViewerManager = Office365Users.Manager(fxViewerProfile.UserPrincipalName);
fxViewerDepartment = fxViewerProfile.Department;
fxViewerPhoto = IfError(
    If(
        Office365Users.UserPhotoMetadata(fxViewerProfile.UserPrincipalName).HasPhoto,
        Office365Users.UserPhotoV2(fxViewerProfile.UserPrincipalName),
        SampleImage
    ),
    SampleImage
);
```

Technique credit: Matthew Devaney — [6 Use-Cases for the Power Apps App.Formulas Property](https://www.matthewdevaney.com/6-use-cases-for-the-power-apps-app-formulas-property-named-formulas/).

## 3. Derive UI Permission Flags

Read the user's Dataverse roles once through a shared formula, then derive the flags used by controls. Role display names and relationship names depend on the connected schema. The following uses `Users.domainname` and the named security-role association; configure those names in the app. The custom role in this example is `Order Reviewer`.

```powerfx
// App.Formulas
fxViewerRoles = LookUp(Users, domainname = User().Email).'Security Roles (systemuserroles_association)';
fxViewerIsAdministrator = "System Administrator" in fxViewerRoles.Name;
fxViewerIsReviewer = "Order Reviewer" in fxViewerRoles.Name;
fxViewerCanApprove = fxViewerIsAdministrator || fxViewerIsReviewer;
fxViewerCanRemove = fxViewerIsAdministrator;
```

Set an approval button's `Visible` to `fxViewerCanApprove`. For a navigation guard, test the flag in a behavior and navigate to `AccessDeniedScreen` if false. UI flags only shape the interface; backend permissions must enforce the same access.

Technique credit: Matthew Devaney — [6 Use-Cases for the Power Apps App.Formulas Property](https://www.matthewdevaney.com/6-use-cases-for-the-power-apps-app-formulas-property-named-formulas/).

## 4. Normalize Launch Parameters

Build a record of launch options. Supply defaults in one place and convert text flags explicitly.

```powerfx
// App.Formulas
fxLaunchOptions = {
    OrderKey: Param("order"),
    ViewMode: Coalesce(Param("view"), "read"),
    EntryPoint: Coalesce(Param("entry"), "menu"),
    ShowDiagnostics: Lower(Coalesce(Param("diagnostics"), "false")) = "true",
    ReturnAddress: Param("return")
};
```

Use `fxLaunchOptions.ShowDiagnostics` for a diagnostic container's `Visible`. Use this behavior to select a form mode:

```powerfx
If(fxLaunchOptions.ViewMode = "edit", EditForm(frmOrderDetails), ViewForm(frmOrderDetails))
```

Pass a launch key into screen context through navigation:

```powerfx
Navigate(OrderDetailScreen, ScreenTransition.None, {locLaunchOrderKey: fxLaunchOptions.OrderKey})
```

Validate externally supplied record IDs and return destinations before acting on them.

Technique credit: Matthew Devaney — [6 Use-Cases for the Power Apps App.Formulas Property](https://www.matthewdevaney.com/6-use-cases-for-the-power-apps-app-formulas-property-named-formulas/).

## 5. Wrap Environment Configuration

Expose a record with meaningful fields instead of repeating Dataverse lookups. Add the Environment Variable Values table and its definition relationship. Create the four definitions named below and provide current values in each environment. For a deployment using definition defaults instead, resolve those defaults explicitly.

```powerfx
// App.Formulas
fxDeployment = {
    SupportEmail: LookUp(
        'Environment Variable Values',
        'Environment Variable Definition'.'Display Name' = "Order Support Email",
        Value
    ),
    OrganizationLabel: LookUp(
        'Environment Variable Values',
        'Environment Variable Definition'.'Display Name' = "Order Organization Label",
        Value
    ),
    UploadLimitMB: Value(LookUp(
        'Environment Variable Values',
        'Environment Variable Definition'.'Display Name' = "Order Upload Limit MB",
        Value
    )),
    HelpAddress: LookUp(
        'Environment Variable Values',
        'Environment Variable Definition'.'Display Name' = "Order Help Address",
        Value
    )
};
```

Bind labels to `fxDeployment.SupportEmail` and `fxDeployment.OrganizationLabel`. A help button can run `Launch(fxDeployment.HelpAddress)`. Verify the value permissions in development, test, and production.

Technique credit: Matthew Devaney — [6 Use-Cases for the Power Apps App.Formulas Property](https://www.matthewdevaney.com/6-use-cases-for-the-power-apps-app-formulas-property-named-formulas/).

## 6. Define Design Tokens

Keep colors, fonts, and dimensions in shared records. Set individual control properties to fields of the theme. The theme values are design choices, not platform defaults.

```powerfx
// App.Formulas
fxOrderColors = {
    Accent: ColorValue("#245E73"),
    Muted: ColorValue("#60737C"),
    Positive: ColorValue("#26704B"),
    Negative: ColorValue("#A33245"),
    Caution: ColorValue("#D69B23"),
    Information: ColorValue("#316AAB"),
    Surface: ColorValue("#F2F6F8"),
    Ink: ColorValue("#202E35"),
    Paper: Color.White,
    Clear: RGBA(0, 0, 0, 0)
};
fxOrderFonts = {Heading: Font.'Open Sans', Body: Font.'Open Sans', Code: Font.'Courier New'};
fxOrderSizes = {Small: 11, Body: 13, Subtitle: 16, Title: 20, Heading: 26, Radius: 6, Gap: 12, LargeGap: 24};
fxOrderTheme = {Palette: fxOrderColors, Typeface: fxOrderFonts, Scale: fxOrderSizes};
```

For a classic button use `fxOrderColors.Accent` in `Fill`, `fxOrderColors.Paper` in `Color`, `fxOrderFonts.Body` in `Font`, `fxOrderSizes.Body` in `Size`, and `fxOrderSizes.Radius` in `RadiusTopLeft`.

Technique credit: Matthew Devaney — [6 Use-Cases for the Power Apps App.Formulas Property](https://www.matthewdevaney.com/6-use-cases-for-the-power-apps-app-formulas-property-named-formulas/).

## Additional Derived Values

### Date boundaries

Choose a week convention explicitly. This version starts on Monday and includes month/year boundaries and rolling 30/90-day starts. Volatile time functions are evaluated when the formula recalculates; do not assume a continuously ticking clock.

```powerfx
// App.Formulas
fxCalendar = {
    CurrentDate: Today(),
    WeekFrom: DateAdd(Today(), 1 - Weekday(Today(), StartOfWeek.Monday), TimeUnit.Days),
    WeekThrough: DateAdd(Today(), 7 - Weekday(Today(), StartOfWeek.Monday), TimeUnit.Days),
    MonthFrom: Date(Year(Today()), Month(Today()), 1),
    MonthThrough: DateAdd(Date(Year(Today()), Month(Today()) + 1, 1), -1, TimeUnit.Days),
    YearFrom: Date(Year(Today()), 1, 1),
    ThirtyDaysFrom: DateAdd(Today(), -30, TimeUnit.Days),
    NinetyDaysFrom: DateAdd(Today(), -90, TimeUnit.Days)
};
```

Technique credit: Matthew Devaney — [6 Use-Cases for the Power Apps App.Formulas Property](https://www.matthewdevaney.com/6-use-cases-for-the-power-apps-app-formulas-property-named-formulas/).

### Counts and observation time

Derive metrics over complete local caches, or use supported server aggregates. A named formula does not remove a count's delegation limit. `Now()` is evaluation time, not proof that remote data was refreshed.

```powerfx
// App.Formulas; both caches are completely loaded
fxQueueMetrics = {
    Customers: CountRows(colCustomerCache),
    ActiveCustomers: CountIf(colCustomerCache, IsActive),
    WaitingOrders: CountIf(colOrderCache, State = "Waiting")
};
fxMetricsObservedAt = Now();
```

Record an actual refresh timestamp in a variable after a successful load if that is what the UI promises.

Technique credit: Matthew Devaney — [6 Use-Cases for the Power Apps App.Formulas Property](https://www.matthewdevaney.com/6-use-cases-for-the-power-apps-app-formulas-property-named-formulas/).

### Locale and feature flags

Select a same-shaped label record for each language. Store feature choices in another record; a feature flag is not an authorization check.

```powerfx
// App.Formulas
fxUiLanguage = Left(Language(), 2);
fxQueueLabels = If(
    fxUiLanguage = "fr",
    {Heading: "Commandes", Save: "Enregistrer", Cancel: "Annuler"},
    {Heading: "Orders", Save: "Save", Cancel: "Cancel"}
);
fxQueueFeatures = {
    DarkTheme: false,
    PreviewTools: fxViewerIsAdministrator,
    MaxUploadMB: 12,
    OfflineEnabled: true,
    Maintenance: false
};
```

Technique credit: Matthew Devaney — [6 Use-Cases for the Power Apps App.Formulas Property](https://www.matthewdevaney.com/6-use-cases-for-the-power-apps-app-formulas-property-named-formulas/).

## Keep Actions in Behaviors

Ordinary named values cannot run flows, navigation, notifications, writes, collection changes, or variable assignments. Put `Run`, `Navigate`, `Patch`, `Collect`, `ClearCollect`, `UpdateContext`, `Set`, and `Notify` in behavior properties or a supported behavior UDF.

Use `OrderQueueScreen` as `App.StartScreen`. Do not make the start screen depend on globals initialized by OnStart. Screen OnVisible can load a small settings table and choose form mode:

```powerfx
// OrderQueueScreen.OnVisible
ClearCollect(colQueueSettings, QueueSettings);
Set(gblQueueReady, true);
If(fxLaunchOptions.ViewMode = "edit", EditForm(frmOrderDetails))
```

OnVisible runs again on later visits. Keep one-time initialization and refresh policies deliberate.

Technique credit: Matthew Devaney — [6 Use-Cases for the Power Apps App.Formulas Property](https://www.matthewdevaney.com/6-use-cases-for-the-power-apps-app-formulas-property-named-formulas/).

## Migrate Assignments by Purpose

Move a theme literal, profile expression, and derived role flag from OnStart into `App.Formulas`. Keep a user's current selection in a global, screen edit state in context, and a mutable row cache in a collection. Move screen-specific loads into OnVisible after checking their row bounds. This preserves behavior while allowing startup scheduling to improve.

Use `fx`, `gbl`/`var`, `loc`, `col`, and `udf` consistently; do not retain competing names for the same value after migration.

Technique credit: Matthew Devaney — [Power Apps Coding Standards for Canvas Apps](https://www.matthewdevaney.com/power-apps-coding-standards-for-canvas-apps/).
