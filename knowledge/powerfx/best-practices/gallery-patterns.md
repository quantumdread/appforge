# Gallery Rules and Recipes

Build galleries around a clear query, stable record IDs, and explicit loading and editing state. Examples use English Power Fx separators and classic controls. Comments name the property that receives each expression; do not paste property labels into a formula. Remote examples require the named table and fields. Local examples require complete bounded caches, not arbitrary slices of a large source.

## Gallery Performance Optimization

### Choose the appropriate height model

Use a flexible-height gallery for variable-length text and a regular gallery for uniform rows. In a flexible-height template, enable `AutoHeight` on the content label and position subsequent controls below it. `TemplateSize` is numeric; `Auto` is not a valid value. Flexible-height rows can shift while data loads, so test scrolling.

```powerfx
// galTaskFeed.Height; header and footer are sibling controls
Parent.Height - conFeedHeading.Height - conFeedActions.Height
```

```powerfx
// lblTaskDescription.AutoHeight
true
```

```powerfx
// lblTaskDescription.Text
ThisItem.Description
```

```powerfx
// recTaskDivider.Y; lower edge determines the row's content extent
lblTaskDescription.Y + lblTaskDescription.Height + 12
```

For galleries inside auto-layout containers, set numeric `LayoutMinHeight` and `LayoutMinWidth` deliberately, such as 100 each. These are container allocation constraints, not automatic row heights.

Technique credit: Matthew Devaney — [Power Apps Gallery Design and UX Guidelines](https://www.matthewdevaney.com/power-apps-coding-standards-for-canvas-apps/power-apps-gallery-design-ux-guidelines/).

### Fetch fewer fields

Project only the fields needed for display and identity. Current `ShowColumns` syntax takes identifiers. A projection does not remove downstream delegation or retrieval limits.

```powerfx
// galCustomerCards.Items; Customers has the named fields
ShowColumns(Customers, ID, Name, Email, Region, PhotoUrl)
```

Technique credit: Matthew Devaney — [Power Apps Performance Optimization Guidelines](https://www.matthewdevaney.com/power-apps-coding-standards-for-canvas-apps/power-apps-performance-optimization-guidelines/).

### Resolve related values before rendering

Prefer backend relationships or views. For complete small caches, join locally using aliases so nested predicates compare the intended records. Wrapping a remote lookup in `AddColumns` still causes per-row requests.

```powerfx
// Behavior property; both collections have already loaded completely
ClearCollect(
    colOrderCards,
    AddColumns(
        colOrderRows As OrderRow,
        CustomerCaption,
        LookUp(colCustomerRows As CustomerRow, CustomerRow.ID = OrderRow.CustomerID, CustomerRow.Name)
    )
)
```

Use `colOrderCards` for Items and `ThisItem.CustomerCaption` for a row label. Apply the same rule to totals: compute expensive aggregates over complete local child rows or on the server, then bind the label to the projected amount.

Reference: [Microsoft Learn: optimized query patterns](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/optimized-query-data-patterns).

### Delay row construction

Set `DelayItemLoading` to true when deferring gallery rows improves the first screen. Choose `LoadingSpinner.Controls` or `LoadingSpinner.Data` for native feedback. These are configuration values, not a live Boolean indicating load completion.

Reference: [Microsoft Learn: gallery control](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/controls/control-gallery).

### Reduce repeated controls

Use a template for repeated rows instead of manually creating a label/button set for each record. Compare render cost with realistic row counts: a screen with 200 controls usually costs more than a comparable one with 50, but those figures are review signals rather than guaranteed timing thresholds. Cache frequently reused, bounded data and invalidate it deliberately.

Technique credit: Susheel / Visualpath — [Why Your PowerApps Are Slow: Common Mistakes Explained](https://medium.com/@susheel.visualpath/why-youre-powerapps-are-slow-common-mistakes-explained-75d104bd5e93).

## Gallery Item Templates & Dynamic Content

### Row colors

Use a stable numeric display sequence for alternating rows. A record ID's parity is stable but does not guarantee alternation after sorting or filtering. Here the local view already has `RowNumber`.

```powerfx
// galTaskFeed.TemplateFill
If(Mod(ThisItem.RowNumber, 2) = 1, Color.White, ColorValue("#EFF4F6"))
```

```powerfx
// Row background Fill
Switch(ThisItem.State, "Ready", Color.Honeydew, "Waiting", Color.LemonChiffon, "Blocked", Color.MistyRose, Color.White)
```

### Ownership, priority, and text styling

Only show edit affordances for the intended owner, then enforce access in the source. For a text OwnerEmail field, the edit icon's Visible can use `ThisItem.OwnerEmail = User().Email`. A priority badge can test `ThisItem.Priority = "Urgent"`.

```powerfx
// Due label Color
If(!IsBlank(ThisItem.DueDate) && ThisItem.DueDate < Today(), Color.FireBrick, Color.Black)
```

```powerfx
// Title label FontWeight
If(ThisItem.IsRead, FontWeight.Normal, FontWeight.Semibold)
```

Technique credit: Matthew Devaney — [Power Apps Gallery Design and UX Guidelines](https://www.matthewdevaney.com/power-apps-coding-standards-for-canvas-apps/power-apps-gallery-design-ux-guidelines/).

## Nested Galleries - Patterns & Limitations

### Bound the hierarchy

Limit nesting to two gallery levels: an outer gallery and one child. Extra templates increase memory and rendering work. Prefer a grouped or expandable single list when the interaction permits it. For a parent-child layout, filter by the outer row, not the outer gallery's single Selected value; otherwise every parent can show the selected parent's children.

Reference: [Microsoft Learn: gallery limitations](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/controls/control-gallery).

Technique credit: Matthew Devaney — [Power Apps Gallery Design and UX Guidelines](https://www.matthewdevaney.com/power-apps-coding-standards-for-canvas-apps/power-apps-gallery-design-ux-guidelines/).

### Group a complete local table

Group orders by a text Region field. Bind the outer gallery to the result and its nested gallery to `ThisItem.RegionOrders`. `GroupBy` is local here; first establish that the local dataset is complete.

```powerfx
ClearCollect(colOrdersByRegion, GroupBy(colOrderRows, Region, RegionOrders))
```

Technique credit: Shane Young / PowerApps911 — [PowerApps GroupBy Function and Nested Galleries](https://in.linkedin.com/posts/cincyshane_powerapps-groupby-function-and-nested-galleries-activity-6788455536141574146-PWjs).

### Expand one row instead

For a local region table, add an expansion flag, then toggle it in a template button. Bind the detail container's Visible to the flag and use a flexible-height layout to accommodate its content.

```powerfx
// Screen entry; colRegionRows is an existing local table
ClearCollect(colExpandableRegions, AddColumns(colRegionRows, DetailsOpen, false))
```

```powerfx
// Template button OnSelect
Patch(colExpandableRegions, ThisItem, {DetailsOpen: !ThisItem.DetailsOpen})
```

Technique credit: Shane Young / PowerApps911 — [Power Apps Flexible Height Container: Expand](https://fr.linkedin.com/posts/cincyshane_power-apps-flexible-height-container-expand-activity-6957352398038208512-aK16).

## Gallery Selection Patterns

### Single-record selection

Use Selected within the originating gallery's workflow. Store the record before navigation when another screen needs it. Navigation does not inherently erase Selected; resets, query changes, and screen dependencies make a captured record more predictable.

```powerfx
// galTaskFeed.OnSelect
Set(gblChosenTask, ThisItem);
Navigate(TaskDetailScreen, ScreenTransition.None)
```

Bind detail labels or a form Item to `gblChosenTask`.

Technique credit: Matthew Devaney — [Power Apps Gallery Design and UX Guidelines](https://www.matthewdevaney.com/power-apps-coding-standards-for-canvas-apps/power-apps-gallery-design-ux-guidelines/).

### Multiple records

Track IDs in a collection rather than reading every checkbox as the source of truth. This initialization establishes a numeric ID column and empties the table.

```powerfx
// TaskQueueScreen.OnVisible
ClearCollect(colChosenTaskKeys, {ID: 0});
Clear(colChosenTaskKeys)
```

```powerfx
// chkChooseTask.OnCheck
If(!(ThisItem.ID in colChosenTaskKeys.ID), Collect(colChosenTaskKeys, {ID: ThisItem.ID}))
```

```powerfx
// chkChooseTask.OnUncheck
With({taskKey: ThisItem.ID}, RemoveIf(colChosenTaskKeys, ID = taskKey))
```

```powerfx
// chkChooseTask.Default
ThisItem.ID in colChosenTaskKeys.ID
```

Technique credit: Matthew Devaney — [Power Apps Multiple Selection Checkbox](https://www.matthewdevaney.com/power-apps-multiple-selection-checkbox/).

### Select all, clear, and toggle

Choose the selection scope explicitly. To select every record in a complete local filtered view, use `ShowColumns(colVisibleTasks, ID)`. `galTaskFeed.AllItems` represents only loaded rows and includes template controls; it is not the entire remote query.

```powerfx
// Select all local matches button OnSelect
ClearCollect(colChosenTaskKeys, ShowColumns(colVisibleTasks, ID))
```

```powerfx
// Clear selection button OnSelect
Clear(colChosenTaskKeys)
```

A row button can toggle selection; a container does not provide a general OnSelect event.

```powerfx
// Template button OnSelect
With(
    {taskKey: ThisItem.ID},
    If(taskKey in colChosenTaskKeys.ID, RemoveIf(colChosenTaskKeys, ID = taskKey), Collect(colChosenTaskKeys, {ID: taskKey}))
)
```

Use a border or TemplateFill expression to show selected IDs. A selection count label can use `Text(CountRows(colChosenTaskKeys)) & " selected"`. If counting checked controls from AllItems instead, label it as the loaded-row count and account for virtualization. Clear temporary selection on workflow exit.

Technique credit: Shane Young / PowerApps911 — [Select Multiple Items and Select All in Power Apps Galleries](https://www.powerapps911.com/post/select-multiple-items-and-select-all-in-power-apps-galleries).

## Gallery with Forms Integration

### View and edit the chosen record

For a display form, connect Tasks as DataSource and use a captured source record as Item. A navigation call can instead supply destination context:

```powerfx
// Gallery OnSelect; destination form Item is locTaskToView
Navigate(TaskDetailScreen, ScreenTransition.None, {locTaskToView: ThisItem})
```

For an edit form on the current screen, select its record, set edit mode, and show its panel.

```powerfx
// Edit icon OnSelect; frmTaskEntry.DataSource is Tasks, Item is locTaskToEdit
UpdateContext({locTaskToEdit: ThisItem});
EditForm(frmTaskEntry);
Set(gblTaskEditorOpen, true)
```

Set the save button's OnSelect to `SubmitForm(frmTaskEntry)`. Put closing and success work in OnSuccess; use OnFailure for the form Error. Do not test Error immediately after starting submission.

```powerfx
// frmTaskEntry.OnSuccess
Set(gblTaskEditorOpen, false);
Notify("Task saved.", NotificationType.Success)
```

```powerfx
// frmTaskEntry.OnFailure
Notify("Task was not saved. " & frmTaskEntry.Error, NotificationType.Error)
```

Technique credit: Enjoy SharePoint — [Power Apps Gallery Patch](https://www.enjoysharepoint.com/power-apps-gallery-patch/).

### Inline edits

Set a classic text input's Default to `ThisItem.Title`. Save explicitly from a row button; avoid source-writing OnChange loops inside a gallery.

```powerfx
IfError(
    Patch(Tasks, LookUp(Tasks, ID = ThisItem.ID), {Title: txtTaskRowTitle.Text}),
    Notify("Task update failed.", NotificationType.Error); false,
    Notify("Task updated.", NotificationType.Success); true
)
```

Technique credit: Enjoy SharePoint — [Power Apps Gallery Patch](https://www.enjoysharepoint.com/power-apps-gallery-patch/).

### Bulk updates with row outcomes

For row-wise operations, iterate a separate key collection. Capture each result so a partial failure cannot produce an unconditional all-saved notification. Here Tasks has numeric StateCode.

```powerfx
// Bulk review button OnSelect
ClearCollect(
    colTaskSaveResults,
    ForAll(
        colChosenTaskKeys As Chosen,
        {
            ID: Chosen.ID,
            Saved: IfError(
                Patch(Tasks, LookUp(Tasks, ID = Chosen.ID), {StateCode: 2}),
                false,
                true
            )
        }
    )
);
If(
    CountIf(colTaskSaveResults, !Saved) > 0,
    Notify("Some tasks were not updated. Review and retry those rows.", NotificationType.Error),
    Notify(Text(CountRows(colTaskSaveResults)) & " tasks updated.", NotificationType.Success);
    Clear(colChosenTaskKeys)
)
```

Technique credit: Enjoy SharePoint — [Power Apps Gallery Patch](https://www.enjoysharepoint.com/power-apps-gallery-patch/).

### Table-form Patch for changed rows

Filter loaded editable rows to those whose value changed. Preserve source base records, and build an equally ordered change table. The gallery is bound to Tasks and has a classic `txtTaskRowTitle` input. Validate connector support and partial outcomes; table-form syntax does not guarantee one HTTP request or atomicity.

```powerfx
// Save loaded edits button OnSelect
ClearCollect(colChangedTaskRows, Filter(galTaskFeed.AllItems, Title <> txtTaskRowTitle.Text));
If(
    IsEmpty(colChangedTaskRows),
    Notify("There are no changed rows to save.", NotificationType.Information),
    IfError(
        Patch(
            Tasks,
            ForAll(colChangedTaskRows As Edited, LookUp(Tasks, ID = Edited.ID)),
            ForAll(colChangedTaskRows As Edited, {Title: Edited.txtTaskRowTitle.Text})
        ),
        Notify("Some edits could not be saved.", NotificationType.Error); false,
        Notify("Loaded edits saved.", NotificationType.Success); true
    )
)
```

This operates on loaded rows. It cannot save edits to rows the gallery never loaded. `IsError(Patch(...))` can also test an error, but `IfError` gives a direct failure branch and error details.

Technique credit: Matthew Devaney — [Fastest Way to Patch All Gallery Items in Power Apps](https://www.matthewdevaney.com/fastest-way-to-patch-all-gallery-items-power-apps/).

## Search and Filter Patterns

### Capture the search term

Use a search button for expensive queries or classic DelayOutput for delayed typing. Capture a term before applying it. Current `Search` column arguments are identifiers.

```powerfx
// btnFindTask.OnSelect
Set(gblTaskSearch, txtTaskSearch.Text)
```

```powerfx
// galTaskFeed.Items; this example uses a complete local cache
Search(colTaskRows, gblTaskSearch, Title, Description, Category)
```

Technique credit: Matthew Devaney — [Power Apps Gallery Design and UX Guidelines](https://www.matthewdevaney.com/power-apps-coding-standards-for-canvas-apps/power-apps-gallery-design-ux-guidelines/).

### Optional dropdown criteria

Give filters an explicit All option. For a classic dropdown, a small local option collection can contain Value records. Do not concatenate text with a table or depend on the old Distinct.Result field.

```powerfx
// Screen entry; local Tasks have text Region, State, ManagerEmail
ClearCollect(colRegionChoices, {Value: "All"});
Collect(colRegionChoices, Distinct(colTaskRows, Region))
```

Set `drpTaskRegion.Items` to `colRegionChoices` and its Default to `"All"`. Supply equivalent All options for the state and manager dropdowns.

```powerfx
// galTaskFeed.Items
Filter(
    colTaskRows,
    drpTaskRegion.Selected.Value = "All" || Region = drpTaskRegion.Selected.Value,
    drpTaskState.Selected.Value = "All" || State = drpTaskState.Selected.Value,
    drpTaskManager.Selected.Value = "All" || ManagerEmail = drpTaskManager.Selected.Value
)
```

Technique credit: Matthew Devaney — [Power Apps Gallery Design and UX Guidelines](https://www.matthewdevaney.com/power-apps-coding-standards-for-canvas-apps/power-apps-gallery-design-ux-guidelines/).

### Search plus filters

Combine independent criteria with AND. A blank search returns the unsearched rows; retain optional dropdown predicates around it.

```powerfx
// galTaskFeed.Items; complete local cache
Filter(
    If(IsBlank(gblTaskSearch), colTaskRows, Search(colTaskRows, gblTaskSearch, Title, Description)),
    drpTaskRegion.Selected.Value = "All" || Region = drpTaskRegion.Selected.Value,
    drpTaskState.Selected.Value = "All" || State = drpTaskState.Selected.Value
)
```

Technique credit: Reshmee Auckloo — [PowerApps Filter Search Gallery](https://reshmeeauckloo.com/posts/powerapps-filter-search-gallery/).

Technique credit: Power Apps Guide — [Filter OR to Return All Records When No Search Term Is Entered](https://powerappsguide.com/blog/post/filter-or-to-return-all-records-when-no-search-term-entered).

### Match semantics and delegation

SharePoint cannot delegate `Search`; supported Dataverse and SQL text columns can. `StartsWith` changes substring matching into prefix matching. Use it only when users accept that behavior and the connector/column supports it. Excel gains no delegation from that substitution. Local queries use the app's data row limit: 500 by default, configurable up to 10,000.

```powerfx
// Supported SharePoint text prefix candidate
Filter(Tasks, StartsWith(Title, gblTaskSearch))
```

Reference: [Microsoft Learn: Filter, Search and LookUp](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-filter-lookup).

Reference: [Microsoft Learn: delegation overview](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/delegation-overview).

### Dates, quick filters, and reset

For timestamp ranges, include the final selected day with an exclusive next-day boundary.

```powerfx
Filter(
    Orders,
    CreatedOn >= dteOrderFrom.SelectedDate,
    CreatedOn < DateAdd(dteOrderThrough.SelectedDate, 1, TimeUnit.Days)
)
```

Quick-filter buttons can set a text `gblQuickState` to `"Ready"`, `"Waiting"`, or `Blank()` for all. Highlight the active button with an expression such as `If(gblQuickState = "Ready", Color.Teal, Color.LightGray)`.

```powerfx
// galTaskFeed.Items
If(IsBlank(gblQuickState), colTaskRows, Filter(colTaskRows, State = gblQuickState))
```

Provide a clear action that resets the dropdowns and input, clears captured query/state values, and returns pagination to the first page.

## Empty State Handling

### Separate empty, failed, and loading states

For a loaded local snapshot, show an empty container only when the load completed successfully and the filtered view is empty. Do not hide a remote gallery solely because AllItems is initially empty: that can prevent the expected loading path.

```powerfx
// conEmptyTasks.Visible; load pattern below initializes the flags
!gblTaskLoadBusy && !gblTaskLoadFailed && IsEmpty(colTaskRows)
```

Use a neutral icon such as `Icon.Search`, a short heading, and a useful action. A contextual label can name the search or filter that produced no matches.

```powerfx
// lblEmptyTasks.Text
Switch(
    true,
    !IsBlank(gblTaskSearch), "No tasks match the search. Clear it to try again.",
    drpTaskRegion.Selected.Value <> "All", "No tasks in the chosen region.",
    !IsBlank(gblQuickState), "No tasks in the chosen state.",
    "There are no tasks yet. Create one to begin."
)
```

```powerfx
// Empty action OnSelect; txtTaskSearch.Default is empty text
If(
    !IsBlank(gblTaskSearch),
    Set(gblTaskSearch, ""); Reset(txtTaskSearch),
    NewForm(frmTaskEntry); Set(gblTaskEditorOpen, true)
)
```

Reset an input with `Reset`, not `Set(txtTaskSearch.Text, ...)`. Display a retry state for failure rather than claiming the dataset is empty.

Technique credit: Matthew Devaney — [Power Apps Gallery Design and UX Guidelines](https://www.matthewdevaney.com/power-apps-coding-standards-for-canvas-apps/power-apps-gallery-design-ux-guidelines/).

Technique credit: Power Platform Community — [Empty Gallery vs Still Loading](https://powerusers.microsoft.com/t5/Building-Power-Apps/Empty-Gallery-vs-Still-Loading/td-p/1277375).

## Loading Indicators

### Native or custom feedback

`LoadingSpinner.None` suppresses the native spinner; Controls/Data configure its rendering behavior. They do not report the current load state. Use explicit flags around collection loads. Connect a Tasks source small enough for the intended local snapshot.

```powerfx
// TaskQueueScreen.OnVisible
Set(gblTaskLoadBusy, true);
Set(gblTaskLoadFailed, false);
IfError(
    ClearCollect(colTaskRows, Tasks),
    Set(gblTaskLoadFailed, true); false,
    true
);
Set(gblTaskLoadBusy, false)
```

Bind a loading overlay's Visible to `gblTaskLoadBusy` and Fill to `RGBA(0, 0, 0, 0.4)`. Place it above content in Tree view; do not assign a nonexistent ZIndex. An imported animated media asset can supply a spinner; do not assume `Icon.Loading` exists. Show indicators for operations longer than about a second, and always clear them on success or failure.

Reference: [Microsoft Learn: gallery properties](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/controls/control-gallery).

Technique credit: SPGuides — [Power Apps Loading Spinner](https://www.spguides.com/power-apps-loading-spinner/).

### Progress for a known workload

Use a timer or server job status when the UI needs incremental progress. `ForAll` can run out of order and must not implement a shared counter. The following processes a local queue one item at a time. `colImportSource` contains Title; Tasks.Title is text. Initialize from a start button:

```powerfx
ClearCollect(colImportPending, colImportSource);
Set(gblImportTotal, CountRows(colImportPending));
Set(gblImportCompleted, 0);
Set(gblImportRunning, gblImportTotal > 0)
```

Set a Timer's Duration to 200, Repeat to true, and Start to `gblImportRunning`. Its OnTimerEnd can use:

```powerfx
If(
    !IsEmpty(colImportPending),
    With(
        {nextRow: First(colImportPending)},
        IfError(
            Patch(Tasks, Defaults(Tasks), {Title: nextRow.Title}),
            Set(gblImportRunning, false);
            Notify("Import paused after a save failure.", NotificationType.Error); false,
            Remove(colImportPending, nextRow);
            Set(gblImportCompleted, gblImportCompleted + 1);
            If(IsEmpty(colImportPending), Set(gblImportRunning, false)); true
        )
    )
)
```

A progress label can use `Text(gblImportCompleted) & " / " & Text(gblImportTotal)`. A rectangle's Width can use `If(gblImportTotal = 0, 0, Parent.Width * gblImportCompleted / gblImportTotal)`. For reliable large imports, prefer a server job with a status contract.

### Skeleton rows

Show a separate placeholder gallery while busy. Set its Items to `Sequence(6)` and draw neutral rectangles in its template. Bind its Visible to the busy flag and the real local gallery's Visible to `!gblTaskLoadBusy && !gblTaskLoadFailed`. Keep failure feedback separate from skeleton and empty states.

## Pagination Patterns

### Establish a complete paging source

A hidden gallery can stage a query, but its AllItems contains only loaded records. Visibility and scrolling affect loading. It cannot guarantee completeness, bypass delegation, or count every remote row. Use local paging only over a proven complete bounded cache. For large remote sources, use delegated scrolling or backend continuation/keyset paging.

For the local examples below, `colPagedOrders` is the complete ordered result. A hidden gallery may bind to it for inspection, but page slices use the collection rather than relying on loaded controls.

```powerfx
// Screen entry, after the bounded local cache has loaded completely
ClearCollect(colPagedOrders, Sort(colOrderRows, ID, SortOrder.Ascending));
Set(gblOrderPage, 1)
```

Set a page-size dropdown's Items to `[5, 10, 15, 25, 50, 100]` and its classic Default to `"25"`. Reset `gblOrderPage` to 1 when filters or page size change. Define:

```powerfx
// App.Formulas
fxOrderPageSize = drpOrderPageSize.Selected.Value;
fxOrderPageCount = Max(1, RoundUp(CountRows(colPagedOrders) / fxOrderPageSize, 0));
fxCurrentOrderPage = With(
    {priorRows: (gblOrderPage - 1) * fxOrderPageSize},
    LastN(
        FirstN(colPagedOrders, gblOrderPage * fxOrderPageSize),
        Max(0, Min(fxOrderPageSize, CountRows(colPagedOrders) - priorRows))
    )
);
```

Bind the display gallery's Items to `fxCurrentOrderPage`. The final short page and empty result return the correct slice.

Technique credit: Reza Dorrani — [Power Apps Paginated Gallery](https://rezadorrani.com/index.php/2021/01/05/power-apps-paginated-gallery/).

### Navigation and counts

Use `Set(gblOrderPage, 1)` for First and `Set(gblOrderPage, fxOrderPageCount)` for Last. Clamp Previous and Next:

```powerfx
// Previous OnSelect
Set(gblOrderPage, Max(1, gblOrderPage - 1))
```

```powerfx
// Next OnSelect
Set(gblOrderPage, Min(fxOrderPageCount, gblOrderPage + 1))
```

Disable First/Previous at page 1 and Next/Last at the last page. The next button's DisplayMode can use `If(gblOrderPage >= fxOrderPageCount, DisplayMode.Disabled, DisplayMode.Edit)`. Do not enable a further page merely because the current page exactly fills its capacity.

```powerfx
// Page label Text
"Page " & Text(gblOrderPage) & " of " & Text(fxOrderPageCount)
```

```powerfx
// Range label Text
If(
    IsEmpty(colPagedOrders), "0 orders",
    Text((gblOrderPage - 1) * fxOrderPageSize + 1) & "–" &
    Text(Min(gblOrderPage * fxOrderPageSize, CountRows(colPagedOrders))) &
    " of " & Text(CountRows(colPagedOrders)) & " orders"
)
```

Technique credit: Reza Dorrani — [Power Apps Paginated Gallery](https://rezadorrani.com/index.php/2021/01/05/power-apps-paginated-gallery/).

### Skip/take over local rows

An equivalent local slice drops prior rows with LastN and takes the next page with FirstN. Neither operation is a general delegated server-paging primitive.

```powerfx
FirstN(
    LastN(colPagedOrders, Max(0, CountRows(colPagedOrders) - (gblOrderPage - 1) * fxOrderPageSize)),
    fxOrderPageSize
)
```

Technique credit: Mrinal Pain — [Power Apps Pagination: Mastering Large Datasets with a Hidden Gallery](https://medium.com/@mrinalpain/power-apps-pagination-mastering-large-datasets-with-a-hidden-gallery-d626326116fc).

### Load more

For a local result, initialize `gblOrderVisibleCount` to 50, bind Items to `FirstN(colPagedOrders, gblOrderVisibleCount)`, and increase the count by 50 from a Load more button. Show that button while the count is below `CountRows(colPagedOrders)`. Remote infinite scrolling needs a delegated gallery or an explicit continuation token; FirstN over a large source does not implement that contract.

Paging can reduce rendered controls and improve navigation. Local paging still retains its full cache in memory; memory and network savings require backend paging. Consider paging above roughly 100 displayed items as a UX review threshold, not a mandatory row limit.

Technique credit: Rishan Solutions — [Using Lazy Loading in Galleries](https://rishandigital.com/powerapps/using-lazy-loading-in-galleries/).

## Common Gallery Mistakes

| Review item | Correction |
|---|---|
| 1. Ignored delegation warning | Verify connector/column support and test beyond the local cap |
| 2. Unneeded fields loaded | Project fields while retaining identity |
| 3. Remote row lookups | Join server-side or use complete local reference caches |
| 4. Manually repeated controls | Replace repeated sets with a gallery template |
| 5. Query on every keystroke | Capture the term on a button or debounce input |
| 6. Unstable order | Sort by title ascending or date descending, with a stable tie-breaker |
| 7. Stale cloud data | Refresh at an intentional point, then reload dependent caches |
| 8. Writing the iterated source | Iterate an independent key/change snapshot and preserve source records |
| 9. Repeated expensive row formulas | Share a projection or backend aggregate |
| 10. Uniform height for variable content | Use flexible height and AutoHeight labels where needed |
| 11. No empty state | Provide contextual text and clear/create actions |
| 12. Abandoned selection state | Clear temporary selections and reset gallery scroll when appropriate |
| 13. Detail reads another screen's Selected | Capture the selected record before navigation |
| 14. Delayed loading disabled | Keep the app's delayed screen loading enabled unless measured needs differ |
| 15. Excel used for concurrent writers | Assess SharePoint, Dataverse, or SQL for shared storage |

For cloud freshness, `Refresh(Tasks)` belongs in an intentional entry or refresh action. Reload the local snapshot afterward if the gallery uses a collection. Clearing a collection on exit is lifecycle cleanup, not proof of a memory leak. `Reset(galTaskFeed)` restores the gallery to its initial state; preserve selection deliberately if the workflow requires it.

Technique credit: Matthew Devaney — [Power Apps Gallery Design and UX Guidelines](https://www.matthewdevaney.com/power-apps-coding-standards-for-canvas-apps/power-apps-gallery-design-ux-guidelines/).

Technique credit: Susheel / Visualpath — [Why Your PowerApps Are Slow: Common Mistakes Explained](https://medium.com/@susheel.visualpath/why-youre-powerapps-are-slow-common-mistakes-explained-75d104bd5e93).

Technique credit: Power Apps Guide — [What Does the Delayed Load Setting Do?](https://powerappsguide.com/blog/post/settings-what-does-the-delayed-load-setting-do).

## Performance Best Practices

Before release, check column selection, delayed row loading, nesting depth, local cache completeness, and realistic device performance. Keep simple templates and avoid repeated remote lookups. Confirm sort order, source refresh behavior, and paging boundaries.

Exercise single/multiple selection, all/clear actions, resets, and navigation. Verify loading, retry, empty, and skeleton states. Save only changed rows; test partial failures and form OnSuccess/OnFailure. Compare row counts with the backend instead of treating AllItems as authoritative.

Technique credit: Matthew Devaney — [Power Apps Performance Optimization Guidelines](https://www.matthewdevaney.com/power-apps-coding-standards-for-canvas-apps/power-apps-performance-optimization-guidelines/).

## Source Directory

Author directories supplement the post-level credits. Follow a post link for the explanation of a specific technique, or a directory link for other material by that publisher.

| Author/site | Original directory |
|---|---|
| Matthew Devaney | [Canvas app guidance](https://www.matthewdevaney.com/) |
| Shane Young / PowerApps911 | [PowerApps911](https://www.powerapps911.com/) |
| Reza Dorrani | [Tutorials](https://rezadorrani.com/) |
| April Dunnam | [SharePoint Siren: templates and components](https://www.sharepointsiren.com/) |
| Rishan Solutions | [Power Apps resources](https://rishandigital.com/powerapps/) |
| Enjoy SharePoint | [Tutorial directory](https://www.enjoysharepoint.com/) |
| SPGuides | [Tutorial directory](https://www.spguides.com/) |
| Reshmee Auckloo | [Author site](https://reshmeeauckloo.com/) |
| Power Apps Guide | [Guide directory](https://powerappsguide.com/) |
| HubSite365 | [Community tutorials](https://www.hubsite365.com/) |
| Practical Power Apps | [Selection and app patterns](https://www.practicalpowerapps.com/) |
| Quisitive | [App and delegation resources](https://quisitive.com/) |
| Medium | [Original publication directory](https://medium.com/) |
