# Power Apps Delegation Reference

> **Machine-checked (v2.4, 2026-08-10):** `validate_yaml` now flags non-delegable query patterns (`delegation-firstn-on-source`, `delegation-forall-writes`, `delegation-search-caveat`, plus source-specific SharePoint/SQL/Excel rules) as advisory WARNs. Supply the optional `datasources` map (`{name: dataverse|sharepoint|sql|excel|collection|other}`) to unlock the source-specific checks; without it only the source-agnostic core fires. Never REFUSEs.

## What is Delegation?

When Power Fx queries translate to **server-side queries**. Only matching rows returned to client.

**Non-delegable behavior:** Power Apps retrieves the first 500 records by default (the app's data row limit, configurable up to 10,000) and processes them locally. Results beyond limit **silently ignored**.

---

## Limits

| Setting | Default | Maximum |
|---------|---------|---------|
| Data row limit | 500 | 10,000 |
| Lookup levels | 2 | 2 |
| Entity joins | 20 | 20 |

**Development tip:** Set to 1 during development to catch issues early.

---

## Delegable Functions

### Always Delegable
```yaml
Filter:
  - Filter()
  - Search() (connector/column support required; not SharePoint or Excel)
  - LookUp()
  - First()

Sorting:
  - Sort() (single column)
  - SortByColumns()

Logical:
  - And (&&)
  - Or (||)
  - Not (!) - except SharePoint

Comparison:
  - =, <>, >=, <=, >, <

String:
  - StartsWith() (column on left; connector and column type must support delegation)
  - EndsWith() (except SharePoint)
  - TrimEnds()
  - IsBlank() (check row dependence and connector/column support; see per-source notes)

Aggregates:
  - Sum(), Average(), Min(), Max()
  - CountRows(), Count()
```

### Never Delegable
```yaml
Record Selection:
  - FirstN(), Last(), LastN()

Conditional:
  - If(), Switch()

Type Conversion:
  - Text(), Value()

String Manipulation:
  - Lower(), Upper()
  - Left(), Mid(), Right(), Len()
  - Concatenate(), &, Concat()

Collections:
  - Collect(), ClearCollect()
  - GroupBy(), Ungroup()
```

---

## Data Source Specifics

### SharePoint
```yaml
Delegable:
  - Filter, LookUp, First
  - Sort, SortByColumns
  - StartsWith (only for supported column types and acceptable prefix matching)
  - And, Or (NOT won't delegate)

NOT Delegable:
  - Search (substring matching; StartsWith is only a conditional prefix alternative)
  - IsBlank (row-dependent column tests need delegation review; see notes below)
  - EndsWith
  - Not (!)
  - Lower(), Upper()

Person Columns:
  - Email: delegable
  - DisplayName: delegable
  - JobTitle, Department: NOT delegable

ID Field:
  - Only = operator delegates
  - Comparisons (>, <) do NOT delegate
```

### Dataverse
```yaml
Best delegation support
Direct connection (no connector overhead)
Access related tables: ThisItem.Account.'Account Name'
Enhanced delegation available (Settings > Upcoming Features)
```

### SQL Server
```yaml
Delegable:
  - Most standard operations

NOT Delegable:
  - IsBlank() (catalog claim unverified; queued for tenant verification, see notes below)

Quirks:
  - Len() behavior differs (char vs varchar)
  - Use varchar/nvarchar, not char/nchar
```

---

## LHS Rule (Critical)

Entity properties **MUST** be on left side:

```yaml
# CORRECT
Filter(Budgets, 'Business unit ID'.Name = varValue)

# INCORRECT - Will not delegate
Filter(Budgets, varValue = 'Business unit ID'.Name)
```

---

## Performance Patterns

### LookUp vs First/Filter
```yaml
# BAD - 1,413ms, retrieves 500+ records
First(Filter(Accounts, ID = 123))

# GOOD - 138ms, retrieves 1 record
LookUp(Accounts, ID = 123)
```

### Avoid Select N+1
```yaml
# BAD - Query per gallery item
Gallery.Items: Orders
  Label.Text: =LookUp(Customers, ID = ThisItem.CustomerID, Name)

# GOOD - Single query, local lookup
OnVisible: =ClearCollect(colCustomers, ShowColumns(Customers, "ID", "Name"))
Gallery.Items: Orders
  Label.Text: =LookUp(colCustomers, ID = ThisItem.CustomerID, Name)
```

### With() for Multiple References
```yaml
# BAD - Multiple API calls
=LookUp(Users, ID = 1, FirstName) & " " & LookUp(Users, ID = 1, LastName)

# GOOD - Single lookup
=With(
    {user: LookUp(Users, ID = 1)},
    user.FirstName & " " & user.LastName
)
```

### Explicit Column Selection
```yaml
# Reduce payload
ClearCollect(
    colAccounts,
    ShowColumns(
        Filter(Accounts, Status = "Active"),
        "name", "email", "phone"
    )
)
```

---

## SharePoint Workarounds

### In-Out Pattern
Delegable pre-filter, then non-delegable on reduced set:
```yaml
Filter(
    Filter(SharePointList, CreatedDateTime > DateAdd(Today(), -30, Days)),  # Delegable
    Lower(Title) = Lower(SearchInput.Text)  # Non-delegable on small set
)
```

### Out-In Pattern
For complex non-delegable filtering:
```yaml
# Step 1: Collect IDs
ClearCollect(colAllIDs, ShowColumns(SharePointList, "ID", "Title"))

# Step 2: Filter locally
ClearCollect(colMatchingIDs, Filter(colAllIDs, StartsWith(Title, UserInput.Text)))

# Step 3: Retrieve full records (NOT delegable — bounded by the row limit)
ClearCollect(colResults, Filter(SharePointList, ID in colMatchingIDs.ID))
```

> **Step 3 correction 2026-08-10.** This step was previously commented "(delegable)". It is not:
> SharePoint does not delegate the `in` operator — the per-source table below lists `In` as
> "Base table only", and `validate_yaml`'s `delegation-sharepoint-in` rule flags exactly this
> shape. The pattern remains useful, but step 3 retrieves only the first page (500 default /
> 10,000 max) of `SharePointList`, so keep `colMatchingIDs` inside that bound or filter on an
> indexed column instead. Evidence class: documented consensus, **not** `compile_canvas` (see
> `VERIFICATION-DOCTRINE.md`); **queued for tenant verification**.

---

## Warning Signs

- **Yellow triangle** next to control
- **Blue wavy underline** in formula
- Test with data row limit = 1

---

## Quick Reference by Data Source

| Function | Dataverse | SharePoint | SQL Server |
|----------|-----------|------------|------------|
| Filter | Yes | Yes | Yes |
| Search | Yes | **No** | Yes |
| LookUp | Yes | Yes | Yes |
| Sort | Yes | Yes | Yes |
| StartsWith | Supported column types | Supported column types | Supported column types |
| EndsWith | Yes | **No** | Yes |
| In | Yes | Base table only | Yes |
| IsBlank | Yes | Row-dependent column tests need review; see note | Unverified; see note |
| Not (!) | Yes | **No** | Yes |

> **Search and prefix filtering have different matching behavior.** SharePoint does not support delegation of Search. Consider StartsWith only if prefix matching meets the request and the connector and column type support delegation; a substring request is not equivalent. For an unresolved source, establish the connector first. StartsWith does not make Excel queries delegable.
>
> **SharePoint `IsBlank` is a pattern warning.** The checker has not established whether the tested value depends on each source row. If the tested value is a column, check column support and connector delegation support. `= Blank()` does not treat empty strings as blank, unlike IsBlank — no automatic replacement. The documented SharePoint concern is not a tenant compile-verification claim (see `VERIFICATION-DOCTRINE.md`).
>
> **SQL Server `IsBlank` is unresolved.** The catalog non-delegation claim remains unverified and **queued for tenant verification**; see the verification queue. Establish row dependence, column type, connector support, and blank/empty-string semantics before choosing a form. If the tested value is a column, check column support. `= Blank()` does not treat empty strings as blank, unlike IsBlank; neither equality nor inequality is an automatic replacement or a delegation assurance.
