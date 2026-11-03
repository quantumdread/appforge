# AppForge Formula Building Blocks

Use these AppForge examples to compose a task dashboard from local lookup tables, pure functions, and derived views. Adapt the data contract to the app before using them. All definitions belong in `App.Formulas` unless a comment specifies another property. Use English Power Fx separators.

## Example Data Contract

Load complete, bounded local collections before referencing them. `colTaskRows` contains numeric `ID`, `StateID`, `PriorityID`, `CategoryID`, and `OwnerID`; text `Title` and `Description`; and date/time `CreatedOn`, `DueOn`, and `ResolvedOn`. State codes 1 and 2 mean new and active; codes at least 4 mean closed. This ordering is an example contract, not a platform rule.

Lookup collections `colStateRows`, `colPriorityRows`, and `colCategoryRows` each have numeric ID, text Caption, Color-valued BadgeColor, and text IconName. `colAccountRows` has numeric ID and text DisplayName/Role. `colTaskComments` has numeric TaskID. `gblViewerAccount` holds the current account record. Bind a gallery to the named views below only after the collections have loaded.

## Lookup Helper Pattern

Keep field lookups in small typed functions. That gives repeated badges a common source of captions, colors, and icon identifiers. Store Color values as Color values; convert persisted hex text with `ColorValue` when building the local lookup cache.

```powerfx
udfStateCaption(StateKey: Number): Text = LookUp(colStateRows, ID = StateKey, Caption);
udfStateColor(StateKey: Number): Color = LookUp(colStateRows, ID = StateKey, BadgeColor);
udfPriorityCaption(PriorityKey: Number): Text = LookUp(colPriorityRows, ID = PriorityKey, Caption);
udfPriorityColor(PriorityKey: Number): Color = LookUp(colPriorityRows, ID = PriorityKey, BadgeColor);
udfPriorityIconName(PriorityKey: Number): Text = LookUp(colPriorityRows, ID = PriorityKey, IconName);
udfCategoryCaption(CategoryKey: Number): Text = LookUp(colCategoryRows, ID = CategoryKey, Caption);
udfCategoryColor(CategoryKey: Number): Color = LookUp(colCategoryRows, ID = CategoryKey, BadgeColor);
udfCategoryIconName(CategoryKey: Number): Text = LookUp(colCategoryRows, ID = CategoryKey, IconName);
```

In a gallery template, set a label's `Text` to `udfStateCaption(ThisItem.StateID)` and its badge's `Fill` to `udfStateColor(ThisItem.StateID)`. An icon-name string is application metadata; map it to an `Icon` enum before assigning an icon control's `Icon` property.

## User Lookup with Fallback

Distinguish an unassigned account from a failed connector operation. These helpers work on the local cache. For initials, the first character and the character after the first space are sufficient for this UI; a single-word name produces one initial.

```powerfx
udfAccountCaption(AccountKey: Number): Text =
    Coalesce(LookUp(colAccountRows, ID = AccountKey, DisplayName), "No owner");
udfAccountRole(AccountKey: Number): Text =
    Coalesce(LookUp(colAccountRows, ID = AccountKey, Role), "");
udfAccountInitials(AccountKey: Number): Text =
    With(
        {caption: Trim(LookUp(colAccountRows, ID = AccountKey, DisplayName))},
        If(
            IsBlank(caption), "?",
            Upper(Left(caption, 1) & Mid(caption, Find(" ", caption & " ") + 1, 1))
        )
    );
```

Use `udfAccountInitials(ThisItem.OwnerID)` in an avatar label and `"Owner: " & udfAccountCaption(ThisItem.OwnerID)` in an assignment label.

## Localized Relative Date

Normalize timestamps to a calendar day before describing elapsed days. Handle future values before past-date buckets. Use the same message keys with language-specific label records rather than duplicating date arithmetic. This example provides English and French; other locales can supply another record of the same shape.

```powerfx
fxRelativeLabels = If(
    Left(Language(), 2) = "fr",
    {TodayText: "Aujourd'hui", YesterdayText: "Hier", FuturePrefix: "Dans ", FutureSuffix: " jours", DaysSuffix: " jours passes", WeeksSuffix: " semaines passees", MonthsSuffix: " mois passes", YearsSuffix: " ans passes"},
    {TodayText: "Today", YesterdayText: "Yesterday", FuturePrefix: "In ", FutureSuffix: " days", DaysSuffix: " days earlier", WeeksSuffix: " weeks earlier", MonthsSuffix: " months earlier", YearsSuffix: " years earlier"}
);
udfRelativeDay(Stamp: DateTime): Text =
    If(
        IsBlank(Stamp), "",
        With(
            {elapsed: DateDiff(Date(Year(Stamp), Month(Stamp), Day(Stamp)), Today(), TimeUnit.Days)},
            Switch(
                true,
                elapsed < 0, fxRelativeLabels.FuturePrefix & Text(Abs(elapsed)) & fxRelativeLabels.FutureSuffix,
                elapsed = 0, fxRelativeLabels.TodayText,
                elapsed = 1, fxRelativeLabels.YesterdayText,
                elapsed < 7, Text(elapsed) & fxRelativeLabels.DaysSuffix,
                elapsed < 30, Text(RoundDown(elapsed / 7, 0)) & fxRelativeLabels.WeeksSuffix,
                elapsed < 365, Text(RoundDown(elapsed / 30, 0)) & fxRelativeLabels.MonthsSuffix,
                Text(RoundDown(elapsed / 365, 0)) & fxRelativeLabels.YearsSuffix
            )
        )
    );
```

Month/year buckets are approximations of 30/365 days. For calendar-accurate periods, implement a different contract. German or other translations use the same bucket keys; no customer-specific vocabulary is required.

## Smart Due Date Display

Describe urgency relative to today. For closed tasks, display the due date without claiming it is the actual completion date. The missing-date branch comes first.

```powerfx
udfDueCaption(DueStamp: DateTime, StateKey: Number): Text =
    If(
        IsBlank(DueStamp), "Due date not set",
        With(
            {remaining: DateDiff(Today(), Date(Year(DueStamp), Month(DueStamp), Day(DueStamp)), TimeUnit.Days)},
            Switch(
                true,
                StateKey >= 4, "Closed; due date " & Text(DueStamp, "yyyy-mm-dd"),
                remaining < 0, "Overdue: " & Text(Abs(remaining)) & " days",
                remaining = 0, "Due today",
                remaining = 1, "Due tomorrow",
                remaining <= 7, "Due in " & Text(remaining) & " days",
                Text(DueStamp, "yyyy-mm-dd")
            )
        )
    );
```

To localize due messages, put the phrases in a label record as above. Keep status/date logic shared.

## Business Logic UDFs

### Overdue, age, and comments

Define overdue once so the badge and dashboard agree. Ignore the time part for date-only due rules. Negative overdue days mean a date in the future.

```powerfx
udfTaskIsLate(DueStamp: DateTime, StateKey: Number): Boolean =
    !IsBlank(DueStamp) && StateKey < 4 && Date(Year(DueStamp), Month(DueStamp), Day(DueStamp)) < Today();
udfLateDays(DueStamp: DateTime): Number =
    If(IsBlank(DueStamp), 0, DateDiff(Date(Year(DueStamp), Month(DueStamp), Day(DueStamp)), Today(), TimeUnit.Days));
udfTaskAge(CreatedStamp: DateTime): Number = DateDiff(CreatedStamp, Today(), TimeUnit.Days);
udfTaskCommentCount(TaskKey: Number): Number = CountIf(colTaskComments, TaskID = TaskKey);
```

Use `udfTaskIsLate(ThisItem.DueOn, ThisItem.StateID)` in an overdue icon's `Visible`. For a row background, use:

```powerfx
// Row rectangle Fill
If(udfTaskIsLate(ThisItem.DueOn, ThisItem.StateID), Color.MistyRose, Color.Transparent)
```

### Text previews and date formats

Handle short preview widths without a negative `Left` length. Provide date helpers by format, rather than by a customer or country name.

```powerfx
udfPreview(Caption: Text, Limit: Number): Text =
    With(
        {width: Max(0, RoundDown(Limit, 0))},
        If(Len(Caption) <= width, Caption, width <= 3, Left(Caption, width), Left(Caption, width - 3) & "...")
    );
udfIsoDay(Stamp: DateTime): Text = If(IsBlank(Stamp), "-", Text(Stamp, "yyyy-mm-dd"));
udfSlashDay(Stamp: DateTime): Text = If(IsBlank(Stamp), "-", Text(Stamp, "mm/dd/yyyy"));
udfDottedDay(Stamp: DateTime): Text = If(IsBlank(Stamp), "-", Text(Stamp, "dd.mm.yyyy"));
```

A description label can call `udfPreview(ThisItem.Description, 90)`.

## Named Formula Patterns

### Dashboard metrics

Count over the complete local snapshot. These formulas describe its contents, not a guaranteed live server total. The current-month count includes a year boundary; the recent-week metric means a rolling seven days.

```powerfx
fxOpenTasks = CountIf(colTaskRows, StateID < 4);
fxClosedTasks = CountIf(colTaskRows, StateID >= 4);
fxNewTasks = CountIf(colTaskRows, StateID = 1);
fxActiveTasks = CountIf(colTaskRows, StateID = 2);
fxLateTasks = CountIf(colTaskRows, udfTaskIsLate(DueOn, StateID));
fxDueSoonTasks = CountIf(
    colTaskRows,
    StateID < 4 && !IsBlank(DueOn) && DueOn >= Today() && DueOn < DateAdd(Today(), 8, TimeUnit.Days)
);
fxCreatedThisMonth = CountIf(
    colTaskRows,
    CreatedOn >= Date(Year(Today()), Month(Today()), 1) &&
    CreatedOn < Date(Year(Today()), Month(Today()) + 1, 1)
);
fxCreatedRecently = CountIf(colTaskRows, CreatedOn >= DateAdd(Today(), -7, TimeUnit.Days));
fxClosedPercent = If(IsEmpty(colTaskRows), 0, Round(100 * fxClosedTasks / CountRows(colTaskRows), 1));
fxMeanResolutionDays = With(
    {resolved: Filter(colTaskRows, !IsBlank(ResolvedOn))},
    If(IsEmpty(resolved), 0, Round(Average(resolved, DateDiff(CreatedOn, ResolvedOn, TimeUnit.Days)), 1))
);
```

Bind KPI labels to `Text(fxOpenTasks)`, `Text(fxLateTasks)`, or `Text(fxClosedPercent) & "%"`. A zero denominator produces zero; a dashboard may instead choose a separate no-data label.

### Chart distributions

Alias outer and inner scopes so a task's ID cannot accidentally replace a lookup-row ID. Shape chart data into label and count columns, then map those columns in the chart's Studio field settings.

```powerfx
fxStateDistribution = AddColumns(
    colStateRows As StateRow,
    TaskCount, CountIf(colTaskRows As TaskRow, TaskRow.StateID = StateRow.ID)
);
fxCategoryDistribution = AddColumns(
    colCategoryRows As CategoryRow,
    TaskCount, CountIf(colTaskRows As TaskRow, TaskRow.CategoryID = CategoryRow.ID && TaskRow.StateID < 4)
);
fxPriorityDistribution = AddColumns(
    colPriorityRows As PriorityRow,
    TaskCount, CountIf(colTaskRows As TaskRow, TaskRow.PriorityID = PriorityRow.ID && TaskRow.StateID < 4)
);
```

Set the chart's `Items` to the chosen distribution and map Caption/TaskCount. Do not invent `Labels` or `Values` formula properties for a chart that uses field mapping.

### Seven daily buckets

Use half-open day ranges for timestamps; equality with midnight would miss events later that day.

```powerfx
fxDailyTaskTrend = AddColumns(
    Sequence(7, 0) As Offset,
    BucketDate, DateAdd(Today(), -Offset.Value, TimeUnit.Days),
    TaskCount,
    With(
        {dayFrom: DateAdd(Today(), -Offset.Value, TimeUnit.Days)},
        CountIf(colTaskRows, CreatedOn >= dayFrom && CreatedOn < DateAdd(dayFrom, 1, TimeUnit.Days))
    )
);
```

### Combined filter view

Initialize numeric filters and search text on screen entry, before binding them to the view. Use zero as the documented all-values sentinel for positive IDs. A blank owner could instead represent an explicit unassigned filter in another design.

```powerfx
// TaskQueueScreen.OnVisible
Set(gblStateFilter, 0);
Set(gblCategoryFilter, 0);
Set(gblPriorityFilter, 0);
Set(gblOwnerFilter, 0);
Set(gblTaskQuery, "")
```

```powerfx
// App.Formulas
fxVisibleTaskRows = Sort(
    Filter(
        colTaskRows,
        gblStateFilter = 0 || StateID = gblStateFilter,
        gblCategoryFilter = 0 || CategoryID = gblCategoryFilter,
        gblPriorityFilter = 0 || PriorityID = gblPriorityFilter,
        gblOwnerFilter = 0 || OwnerID = gblOwnerFilter,
        IsBlank(gblTaskQuery) || gblTaskQuery in Text(ID) || gblTaskQuery in Title || gblTaskQuery in Description
    ),
    CreatedOn,
    SortOrder.Descending
);
```

The search term is the left operand of `in`. This is a local multi-field substring view; do not transfer its delegation claims to a remote source.

Use `fxVisibleTaskRows` in the gallery's `Items` and `Text(CountRows(fxVisibleTaskRows)) & " tasks"` in the count label. For a state dropdown, supply records with numeric ID, including ID 0 for All, and run `Set(gblStateFilter, Self.Selected.ID)` in OnChange. For a classic search input, enable `DelayOutput` and set its OnChange to `Set(gblTaskQuery, Self.Text)`.

The clear action must reset every filter, including owner, and reset the search input whose Default is empty text:

```powerfx
Set(gblStateFilter, 0);
Set(gblCategoryFilter, 0);
Set(gblPriorityFilter, 0);
Set(gblOwnerFilter, 0);
Set(gblTaskQuery, "");
Reset(txtTaskQuery)
```

### Current account and recent rows

Reuse the same status contract for a personal queue. Keep recent rows explicitly ordered before limiting them.

```powerfx
fxMyOpenTaskRows = Filter(colTaskRows, OwnerID = gblViewerAccount.ID && StateID < 4);
fxMyOpenTaskCount = CountRows(fxMyOpenTaskRows);
fxRecentTaskRows = FirstN(Sort(colTaskRows, CreatedOn, SortOrder.Descending), 5);
```

## Choose the Smallest Building Block

| Requirement | Building block |
|---|---|
| Shared badge caption/color | Typed local lookup helper |
| Missing owner | Coalesce fallback |
| Feed timestamp | Relative-day helper with translated labels |
| Deadline urgency | Shared due/overdue rule |
| Dashboard totals | Named formulas over a complete snapshot |
| Distribution chart | Aliased lookup-to-task counts |
| Search and dropdowns | One derived filtered view |
| Personal queue | Shared account and status predicate |

For community attribution on the underlying named-formula and UDF techniques, see [named formula guidance](named-formulas-patterns.md) and [UDF guidance](udf-advanced-patterns.md). Keep the lookup schema and state-code contract consistent across consumers.
