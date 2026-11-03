# Delegation Rules for Canvas Apps

Keep queries on the server whenever the result must cover a large source. Examples use English separators and classic input controls. Create the referenced SharePoint lists or other tables with the named fields. Treat each code block as a separate property expression unless it contains a behavior chain.

## What is Delegation?

A delegated expression becomes a backend query. A local expression evaluates records retrieved into the app. Local evaluation can miss matches outside the retrieved slice.

Power Apps processes at most the app's data row limit locally: 500 rows by default, configurable from 1 to 10,000 (Microsoft Learn, delegation overview; older apps and guides cite 2,000). Even the highest limit cannot guarantee complete results as a source grows. A delegated gallery can request further matching pages without collecting the entire source.

Resolve blue underlines and inspect warning triangles. Also test completeness: the absence of a warning does not prove that a collection or gallery has loaded every row.

Reference: [Microsoft Learn: delegation overview](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/delegation-overview).

## Delegation by Data Source

| Backend | Query planning rule |
|---|---|
| Dataverse | Broad support; verify each operator against column type |
| SQL Server | Broad support; use server views for complex logic |
| SharePoint | Supported predicates only; complex columns add restrictions |
| **Excel** | None |
| Collections | Local memory; delegation does not apply |

Excel remains local even if its predicate uses StartsWith. Use the connector references reached from [Microsoft Learn: delegation list](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/delegation-list) before declaring a formula safe for a backend.

## SharePoint Delegation Reference

### Fully Delegable Functions

`Filter` and `LookUp` delegate when their predicates do. `Sort` and `SortByColumns` delegate on supported simple fields, not arbitrary expressions or complex values.

### Delegable Operators (in Filter/LookUp)

| Operation | Example predicate | Restriction |
|---|---|---|
| Equality | `Title = "Review"` | Check the column or complex subfield |
| Inequality | `Quantity <> 0` | Supported numbers/dates; do not assume text or Boolean support |
| Ordered comparison | `Amount < 250`, `Amount <= 250`, `Amount > 250`, `Amount >= 250` | Supported numbers/dates; ID is special |
| Conjunction | `Quantity > 0 && Amount >= 25` | Both predicates must delegate |
| Disjunction | `Title = "Review" \|\| Title = "Dispatch"` | Both predicates must delegate |
| Text prefix | `StartsWith(Title, "Re")` | Supported text; not Choice/Lookup subfields |

### NON-Delegable (SharePoint)

| Construct | Action to take |
|---|---|
| Search | Decide whether a prefix query would satisfy the user |
| in / exactin / Not / EndsWith | Use supported positive predicates or redesign the stored data |
| IsBlank on a source field | Check field support and null versus empty-text requirements |
| Len/Left/Mid/Right/Lower/Upper/Trim on source fields | Normalize on the server or evaluate after a complete bounded load |

`IsBlank(txtTaskPrefix.Text)` depends on a control, not a different value for every source row. Do not confuse that constant guard with `IsBlank(Title)` inside a source filter.

Technique credit: Matthew Devaney — [SharePoint Delegation Cheat Sheet for Power Apps](https://www.matthewdevaney.com/sharepoint-delegation-cheat-sheet-for-power-apps/).

### Column Type Limitations (SharePoint)

| SharePoint field | Server sort | Server filtering |
|---|---|---|
| Single-line text | Supported | Equality and supported text predicates |
| Number | Supported | Supported comparisons |
| Date/time | Supported | Supported comparisons |
| Yes/No | Supported | Equality |
| Single Choice | Unsupported | Supported subfield equality |
| Lookup | Unsupported | Limited to supported subfields/operators |
| Person | Unsupported | Limited; use Email or DisplayName |
| Multi-value Choice/Person/Lookup | Unsupported | Membership patterns evaluate locally |
| Calculated | Unsupported for these patterns | Do not rely on delegation |

Check the underlying field/subfield type, not just the name shown in Studio.

Technique credit: Matthew Devaney — [SharePoint Delegation Cheat Sheet for Power Apps](https://www.matthewdevaney.com/sharepoint-delegation-cheat-sheet-for-power-apps/).

### ID Column Quirk

Use equality when filtering SharePoint's built-in ID. Although Power Fx presents it as numeric, the connector does not delegate `<`, `<=`, `<>`, `>`, or `>=` on ID.

```powerfx
// Server-supported SharePoint ID lookup
Filter(Tasks, ID = 84)
```

```powerfx
// Local evaluation on SharePoint ID; unsafe for retrieving all later tasks
Filter(Tasks, ID > 84)
```

Technique credit: Matthew Devaney — [SharePoint Delegation Cheat Sheet for Power Apps](https://www.matthewdevaney.com/sharepoint-delegation-cheat-sheet-for-power-apps/).

## Filtering SharePoint by Column Type

### Single Line of Text

Use equality for an exact value or `StartsWith` for a prefix. A blank control guard can disable that criterion. Substring membership in a text field is local on SharePoint.

```powerfx
Filter(Tasks, IsBlank(txtTaskPrefix.Text) || Title = txtTaskPrefix.Text)
```

```powerfx
Filter(Tasks, IsBlank(txtTaskPrefix.Text) || StartsWith(Title, txtTaskPrefix.Text))
```

```powerfx
// Local substring variant
Filter(Tasks, txtTaskPrefix.Text in Title)
```

Technique credit: Platforms of Power — [SharePoint filtering guidance](https://platformsofpower.net/).

### Number Columns

Convert the input once per query, not a source column for every row. Here `Quantity` and `Amount` are numbers. Both zero sliders disable the amount range.

```powerfx
Filter(Orders, IsBlank(txtUnitsFilter.Text) || Quantity = Value(txtUnitsFilter.Text))
```

```powerfx
Filter(
    Orders,
    (sldLowerAmount.Value = 0 && sldUpperAmount.Value = 0) ||
    (Amount >= sldLowerAmount.Value && Amount <= sldUpperAmount.Value)
)
```

Technique credit: Platforms of Power — [SharePoint filtering guidance](https://platformsofpower.net/).

### Date Columns

Equality fits a date-only value. For timestamps, prefer an inclusive start and exclusive next-day end so the entire final day is included. If only one boundary is set, apply that boundary alone.

```powerfx
Filter(Tasks, IsBlank(dteDueFilter.SelectedDate) || DueDate = dteDueFilter.SelectedDate)
```

```powerfx
Filter(
    Orders,
    IsBlank(dteOrderFrom.SelectedDate) || Created >= dteOrderFrom.SelectedDate,
    IsBlank(dteOrderThrough.SelectedDate) || Created < DateAdd(dteOrderThrough.SelectedDate, 1, TimeUnit.Days)
)
```

Technique credit: Platforms of Power — [SharePoint filtering guidance](https://platformsofpower.net/).

### Choice Columns

Match the `Value` of a single Choice by equality. Testing membership in a multi-choice value table is local.

```powerfx
Filter(Tasks, IsBlank(drpTaskState.Selected.Value) || Status.Value = drpTaskState.Selected.Value)
```

```powerfx
// Categories is multi-choice
Filter(Tasks, drpTaskCategory.Selected.Value in Categories.Value)
```

Technique credit: Platforms of Power — [SharePoint filtering guidance](https://platformsofpower.net/).

### Person/Group Columns

Use a single person's `Email` or `DisplayName` with supported comparisons. A multi-person membership query cannot use this single-person delegation pattern.

```powerfx
Filter(Tasks, IsBlank(cmbTaskOwner.Selected.Email) || Owner.Email = cmbTaskOwner.Selected.Email)
```

```powerfx
// Reviewers is multi-person: local membership
Filter(Tasks, cmbTaskOwner.Selected.Email in Reviewers.Email)
```

Technique credit: Platforms of Power — [SharePoint filtering guidance](https://platformsofpower.net/).

### Yes/No Columns

Compare Boolean values directly. For dropdown text, supply `"true"`/`"false"` values before using `Boolean`.

```powerfx
Filter(Tasks, IsBlank(drpCompletion.Selected.Value) || IsComplete = Boolean(drpCompletion.Selected.Value))
```

```powerfx
Filter(Tasks, IsComplete = false)
```

Technique credit: Platforms of Power — [SharePoint filtering guidance](https://platformsofpower.net/).

### Lookup Columns

Use equality against a supported single lookup subfield. Prefix matching on a Lookup or Choice subfield is not a delegated alternative.

```powerfx
Filter(Tasks, Category.Value = drpTaskCategory.Selected.Value)
```

Technique credit: Platforms of Power — [SharePoint filtering guidance](https://platformsofpower.net/).

### Managed Metadata

Term-label filtering is a local pattern here. Provide `Department` as a managed metadata field and `cmbDepartment` with a `Label` field.

```powerfx
Filter(Tasks, IsBlank(cmbDepartment.Selected.Label) || Department.Label = cmbDepartment.Selected.Label)
```

Technique credit: Platforms of Power — [SharePoint filtering guidance](https://platformsofpower.net/).

### Hyperlink Columns

If Studio exposes a custom hyperlink column as text and its connector mapping supports text delegation, prefix filtering may be supported. Do not extend that claim to system Link fields. Substring filtering remains local.

```powerfx
Filter(Tasks, StartsWith(ReferenceUrl, txtReferencePrefix.Text))
```

```powerfx
Filter(Tasks, txtReferencePrefix.Text in ReferenceUrl)
```

Technique credit: Platforms of Power — [SharePoint filtering guidance](https://platformsofpower.net/).

### Location Columns

Use the actual exposed field names and types. The following assumes the Location additional fields have been exposed as text. Validate their delegation in the connector; a location label alone is not proof of support.

```powerfx
Filter(Tasks, 'Location: Name' = "North Office")
```

```powerfx
Filter(Tasks, 'Location: Postal Code' = "10001")
```

Technique credit: Platforms of Power — [SharePoint filtering guidance](https://platformsofpower.net/).

### Created/Modified By

Filter supported person subfields. Connector profile expressions are constant for the query rather than row calculations.

```powerfx
Filter(Tasks, 'Created By'.Email = User().Email)
```

```powerfx
Filter(Tasks, 'Modified By'.Email = Office365Users.MyProfileV2().mail)
```

Technique credit: Platforms of Power — [SharePoint filtering guidance](https://platformsofpower.net/).

### Combined Multi-Filter Example

Separate `Filter` conditions combine with AND. Disable optional criteria using control-dependent blank guards.

```powerfx
Filter(
    Tasks,
    'Created By'.Email = User().Email,
    Category.Value = drpTaskCategory.Selected.Value,
    IsBlank(drpTaskState.Selected.Value) || Status.Value = drpTaskState.Selected.Value,
    IsBlank(dteDueFrom.SelectedDate) || DueDate >= dteDueFrom.SelectedDate
)
```

Technique credit: Platforms of Power — [SharePoint filtering guidance](https://platformsofpower.net/).

## Dataverse Delegation Reference

`Filter`, `LookUp`, `Search`, `Sort`, and `SortByColumns` have backend support subject to their column/operator matrix. `StartsWith`, `EndsWith`, and supported forms of `in` can delegate. Membership on a base-table column and substring matching are distinct forms; inspect the current connector matrix for both. Do not assume every complex field, cast, related-table predicate, or aggregate delegates.

Reference: [Microsoft Learn: connector delegation references](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/delegation-list).

## SQL Server Delegation Reference

Use supported `Filter`, `LookUp`, `Sort`, `SortByColumns`, and text `Search` queries. Review SQL column types and null behavior. A formula that delegates to Dataverse need not delegate to SQL.

Reference: [Microsoft Learn: connector delegation references](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/delegation-list).

## Common Delegation Fixes

### Fix 1: Review IsBlank and Blank() Semantics

First identify whether the tested value varies by source row. Next establish column type, connector support, and required treatment of empty strings. `IsBlank` accepts blank and empty text; equality with `Blank()` need not accept empty text. These expressions therefore have different meanings. Do not automatically replace one with the other or promise delegation of equality/inequality across connectors. In particular, assess SQL independently.

```powerfx
// Row-dependent test; local for SharePoint text
Filter(Tasks, IsBlank(Title))
```

```powerfx
// Different empty-text behavior; verify the connector/field before selecting it
Filter(Tasks, Title = Blank())
```

### Fix 2: Consider Prefix Matching When It Meets the Request

Use a prefix only if the user accepts losing middle-of-text matches. Establish the backend first: SharePoint `Search` is local, supported SharePoint text prefixes can delegate, and Excel supports neither delegation path.

```powerfx
// Substring behavior
Search(Tasks, txtTaskPrefix.Text, Title)
```

```powerfx
// Prefix behavior
Filter(Tasks, StartsWith(Title, txtTaskPrefix.Text))
```

### Fix 3: Not to Positive Logic

Replace negation with a supported comparison where the column type permits it. For a numeric SharePoint `StateCode`, use:

```powerfx
Filter(Tasks, StateCode <> 4)
```

`Not(StateCode = 4)` and `!(StateCode = 4)` cannot delegate to SharePoint. Text `<>` must not inherit a numeric comparison's delegation claim.

### Fix 4: Complex OR to Multiple Conditions

SharePoint supports OR between delegable predicates. Keep explicit equalities for finite text choices. Table membership with `in` is an alternative only for a connector that supports that form; it is not a SharePoint fix.

```powerfx
Filter(Tasks, Title = "Review" || Title = "Dispatch" || Title = "Archive")
```

### Fix 5: In-Memory Processing for Small Datasets

Load a complete bounded dataset, then use local functions freely. A source smaller than the maximum limit still needs a configured limit high enough to retrieve all of its rows.

```powerfx
// Tasks must fit the configured local row limit
ClearCollect(colTaskSearchCache, Tasks)
```

```powerfx
// galTaskMatches.Items
Search(colTaskSearchCache, txtTaskPrefix.Text, Title, Description)
```

Technique credit: Matthew Devaney — [SharePoint Delegation Cheat Sheet for Power Apps](https://www.matthewdevaney.com/sharepoint-delegation-cheat-sheet-for-power-apps/).

## Increasing the Row Limit

### Default: 500 rows

Retain the default for ordinary testing and use a very small limit to expose local evaluation during delegation checks.

### Maximum: 10,000 rows

Settings > General > Data row limit accepts 1 to 10,000 (Microsoft Learn; older guidance, including the examples here, used 2,000). Raising the limit helps only bounded local workloads, and it costs memory and load time, especially for wide tables. Growth beyond the chosen limit still loses rows.

Reference: [Microsoft Learn: query limits](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/delegation-overview).

## Workarounds for Large Datasets

### Pattern 1: Double Collection Technique

Two opposite delegated sorts can retrieve at most twice the data row limit in distinct rows (4,000 with a 2,000 limit, 20,000 with the 10,000 maximum). They cover both ends, not an arbitrarily large middle. Use a stable unique numeric key and verify that both sorts delegate. Preserve complete records when removing overlap.

```powerfx
Concurrent(
    ClearCollect(colEarliestOrders, Sort(Orders, ID, SortOrder.Ascending)),
    ClearCollect(colLatestOrders, Sort(Orders, ID, SortOrder.Descending))
);
ClearCollect(colMergedOrders, colEarliestOrders);
Collect(
    colMergedOrders,
    Filter(colLatestOrders As Candidate, !(Candidate.ID in colEarliestOrders.ID))
)
```

Technique credit: Matthew Devaney — [SharePoint Delegation Cheat Sheet for Power Apps](https://www.matthewdevaney.com/sharepoint-delegation-cheat-sheet-for-power-apps/).

### Pattern 2: Chunked Loading with ForAll

Partition a known key range only when comparisons on that key delegate and each partition fits the local cap. Never partition SharePoint's built-in ID with inequalities. Here `OrderNumber` is a unique whole-number column, not SharePoint ID. Ten ranges cover 1–10,000; adjust coverage deliberately.

```powerfx
Clear(colOrderPartitions);
ForAll(
    Sequence(10, 0, 1000) As Partition,
    Collect(
        colOrderPartitions,
        Filter(Orders, OrderNumber > Partition.Value && OrderNumber <= Partition.Value + 1000)
    )
)
```

`ForAll` does not delegate or guarantee iteration order. Sort the resulting collection for display. Sparse keys, duplicate numbers, throttling, or updates during loading can break coverage assumptions.

### Pattern 3: Server-Side Filtering with Views

Use Dataverse filtered views or SQL views for reusable server logic. On SharePoint, index selective filter/sort fields and design views around them; canvas formulas still need supported predicates.

### Pattern 4: Power Automate for Complex Queries

Move unsupported query logic to a flow that explicitly implements filtering and pagination. Define its response schema. For example, connect `FindOrdersFlow` with text inputs and a text output named `resultsJson` containing an array of objects with numeric `id` and text `title`.

```powerfx
With(
    {response: FindOrdersFlow.Run(txtTaskPrefix.Text, drpTaskState.Selected.Value)},
    ClearCollect(
        colFlowOrders,
        ForAll(
            Table(ParseJSON(response.resultsJson)) As ResultRow,
            {ID: Value(ResultRow.Value.id), Title: Text(ResultRow.Value.title)}
        )
    )
)
```

## Indexing for Performance

For SharePoint lists above 5,000 items, add indexes through List Settings > Indexed columns on fields used in filters and sorts. A list permits up to 20 column indexes. Indexes improve selective server work; they do not change Power Fx delegation support.

Dataverse manages indexes, including those supporting primary keys, relationships, and common system queries. Do not assume that every status field has a guaranteed index or that a maker can add arbitrary indexes through a solution setting. Use supported keys and platform tuning/support options for custom requirements.

Technique credit: Matthew Devaney — [SharePoint Delegation Cheat Sheet for Power Apps](https://www.matthewdevaney.com/sharepoint-delegation-cheat-sheet-for-power-apps/).

## Checking Delegation Status

Hover warnings for the affected operation. Test beyond 500 rows and beyond the configured cap, including a known matching record near the end. Compare IDs and totals against a server result. `CountRows(Filter(...))` itself may evaluate locally; a count of 500 or 2,000 is a warning sign, not proof that those are the only matches.

```powerfx
// Diagnostic local count; not an authoritative SharePoint server total
CountRows(Filter(Tasks, IsComplete = false))
```

Technique credit: Matthew Devaney — [SharePoint Delegation Cheat Sheet for Power Apps](https://www.matthewdevaney.com/sharepoint-delegation-cheat-sheet-for-power-apps/).

## Quick Reference Card

| SharePoint pattern | Decision |
|---|---|
| Supported field equality / ID equality | Candidate for server evaluation |
| Numeric/date comparisons except on ID | Candidate for server evaluation |
| AND/OR of supported predicates | Candidate for server evaluation |
| Prefix on supported text | Candidate for server evaluation |
| Sort on a simple supported field | Candidate for server evaluation |
| Search / text membership / exactin / Not / EndsWith | Local in these SharePoint patterns |
| Field IsBlank / field text transformations | Review local behavior and redesign |
| Sort on Choice or Person | Local; use another sort field |

Technique credit: Matthew Devaney — [SharePoint Delegation Cheat Sheet for Power Apps](https://www.matthewdevaney.com/sharepoint-delegation-cheat-sheet-for-power-apps/).
