# Sort and SortByColumns Functions

Sort tables by one or more columns.

---

## Sort Function

Sort by a formula evaluated for each record.

### Syntax

```powerfx
Sort( Table, Formula [, SortOrder ] )
```

### Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| Table | Yes | - | Table to sort |
| Formula | Yes | - | Formula returning sortable value |
| SortOrder | No | Ascending | `SortOrder.Ascending` or `SortOrder.Descending` |

### Examples

```powerfx
// Sort alphabetically
Sort( Products, Name )

// Sort descending
Sort( Products, Price, SortOrder.Descending )

// Sort by calculated value
Sort( Orders, Quantity * UnitPrice, SortOrder.Descending )

// Sort by date
Sort( Events, StartDate )
Sort( Events, StartDate, SortOrder.Descending )  // Most recent first
```

---

## SortByColumns Function

Sort by column names (strings), supports multiple columns.

### Syntax

```powerfx
SortByColumns( Table, ColumnName1 [, SortOrder1, ColumnName2, SortOrder2, ... ] )
```

### Custom Sort Order

```powerfx
SortByColumns( Table, ColumnName, SortOrderTable )
```

### Examples

```powerfx
// Sort by single column
SortByColumns( Products, "Name" )

// Sort descending
SortByColumns( Products, "Price", SortOrder.Descending )

// Multi-column sort
SortByColumns( Employees,
    "Department", SortOrder.Ascending,
    "LastName", SortOrder.Ascending,
    "FirstName", SortOrder.Ascending
)

// Custom sort order (Priority: High, Medium, Low)
SortByColumns( Tasks, "Priority", [ "High", "Medium", "Low" ] )

// Custom order for status
SortByColumns( Orders, "Status", [ "Pending", "Processing", "Shipped", "Delivered" ] )
```

---

## Multi-Column Sort with Sort()

Nest Sort calls (inner sort is secondary):

```powerfx
// Primary: LastName, Secondary: FirstName
Sort( Sort( Contacts, FirstName ), LastName )

// Primary: Department, Secondary: Salary (desc)
Sort(
    Sort( Employees, Salary, SortOrder.Descending ),
    Department
)
```

---

## SortOrder Options

| Value | Description |
|-------|-------------|
| `SortOrder.Ascending` | A→Z, 0→9, oldest→newest |
| `SortOrder.Descending` | Z→A, 9→0, newest→oldest |

---

## Column Names with Spaces

For SharePoint/Excel, replace spaces with `_x0020_`:

```powerfx
// Column named "First Name"
SortByColumns( SPList, "First_x0020_Name" )
```

---

## Common Patterns

### Gallery Default Sort

```powerfx
// Gallery Items property
Sort( DataSource, Name )

// With filter
Sort( Filter( Products, Category = "Electronics" ), Name )
```

### Toggle Sort Direction

```powerfx
// Button toggles sort direction
Set( varSortAsc, !varSortAsc )

// Gallery Items
If( varSortAsc,
    Sort( Data, Name, SortOrder.Ascending ),
    Sort( Data, Name, SortOrder.Descending )
)
```

### Sort by Multiple Criteria

```powerfx
// Sort tasks: incomplete first, then by due date
SortByColumns(
    Tasks,
    "IsComplete", SortOrder.Ascending,
    "DueDate", SortOrder.Ascending
)
```

### Sort with Blank Handling

```powerfx
// Blanks last (ascending)
Sort( Data, If( IsBlank( Field ), "ZZZZ", Field ) )

// Blanks last (descending)
Sort( Data, If( IsBlank( Field ), "", Field ), SortOrder.Descending )
```

### Dynamic Sort Column

```powerfx
// Based on dropdown selection
Switch( drpSortBy.Selected.Value,
    "Name", Sort( Data, Name ),
    "Date", Sort( Data, CreatedDate, SortOrder.Descending ),
    "Price", Sort( Data, Price, SortOrder.Descending ),
    Data  // Default unsorted
)
```

---

## Delegation

### Delegable
- `Sort` and `SortByColumns` are generally delegable
- Check your specific data source

### Not Delegable
- Sort by calculated formula (non-column)
- Custom sort order table

### Best Practice

```powerfx
// GOOD: Sort delegable column
SortByColumns( LargeTable, "Name" )

// CAUTION: May not be delegable
Sort( LargeTable, FirstName & LastName )
```

---

## Sort vs SortByColumns

| Feature | Sort | SortByColumns |
|---------|------|---------------|
| Column reference | Formula | String name |
| Calculated sort | Yes | No |
| Multi-column | Nested calls | Single call |
| Custom order | No | Yes |
| Dynamic column | Harder | Easier |

### When to Use Each

```powerfx
// Use Sort for calculated values
Sort( Products, Price * Quantity )

// Use SortByColumns for multi-column
SortByColumns( Data, "Col1", SortOrder.Ascending, "Col2", SortOrder.Descending )

// Use SortByColumns for custom order
SortByColumns( Tasks, "Priority", [ "High", "Medium", "Low" ] )
```

---

## Sources

- [Microsoft Learn: Sort and SortByColumns](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-sort)
