# Filter, LookUp, and Search Functions

## Filter Function

Returns a table containing records that match specified criteria.

### Syntax

```powerfx
Filter( Table, Formula1 [, Formula2, ... ] )
```

### Parameters

| Parameter | Required | Type | Description |
|-----------|----------|------|-------------|
| Table | Yes | Table | Data source to filter |
| Formula | Yes | Boolean | Condition evaluated for each record |

### Return Type

Table with same schema as input, containing only matching records.

### Rules

1. **Multiple formulas = AND**: Multiple formula arguments are combined with AND logic
2. **Record scope**: Use `ThisRecord` or field names directly within formulas
3. **Empty result**: Returns empty table if no matches (not blank)
4. **Delegation**: Check delegation support for your data source

### Delegation-Safe Operators

| Delegable | Non-Delegable |
|-----------|---------------|
| `=`, `<>`, `<`, `>`, `<=`, `>=` | `in` (for text contains) |
| `And`, `Or`, `Not` | Custom functions |
| `StartsWith` | `EndsWith` |
| `IsBlank` | `Search` within Filter |

### Examples

```powerfx
// Simple filter
Filter( Products, Category = "Electronics" )

// Multiple conditions (AND)
Filter( Products, Category = "Electronics", Price < 100 )

// OR conditions
Filter( Products, Category = "Electronics" || Category = "Computers" )

// With variables
Filter( Orders, Status = varSelectedStatus )

// Contains text (case-insensitive)
Filter( Customers, Lower(Name) in Lower(SearchBox.Text) )

// Date range
Filter( Events,
    StartDate >= DatePicker1.SelectedDate,
    EndDate <= DatePicker2.SelectedDate
)
```

---

## LookUp Function

Returns the first record that matches criteria, or a specific value from that record.

### Syntax

```powerfx
LookUp( Table, Formula [, ReductionFormula ] )
```

### Parameters

| Parameter | Required | Type | Description |
|-----------|----------|------|-------------|
| Table | Yes | Table | Data source to search |
| Formula | Yes | Boolean | Condition to match |
| ReductionFormula | No | Any | Expression to extract specific value |

### Return Type

- Without ReductionFormula: First matching record
- With ReductionFormula: Single value from that record
- No match: `blank`

### Rules

1. **First match only**: Stops at first matching record
2. **Returns blank**: Returns `blank` (not error) if no match
3. **Use reduction**: Always use ReductionFormula when you need a specific field
4. **Performance**: More efficient than Filter + First for single records

### Examples

```powerfx
// Get entire record
LookUp( Customers, ID = 123 )

// Get specific field
LookUp( Customers, ID = 123, Name )

// Get calculated value
LookUp( Orders, OrderID = varOrderID, Quantity * UnitPrice )

// With related data
LookUp( Orders, OrderID = varOrderID, Customer.Name )

// Fallback for no match
Coalesce( LookUp( Settings, Key = "Theme", Value ), "Default" )

// In a gallery item
LookUp( Categories, ID = ThisItem.CategoryID, CategoryName )
```

---

## Search Function

Finds records containing a string anywhere within specified columns.

### Syntax

```powerfx
Search( Table, SearchString, Column1 [, Column2, ... ] )
```

### Parameters

| Parameter | Required | Type | Description |
|-----------|----------|------|-------------|
| Table | Yes | Table | Data source to search |
| SearchString | Yes | Text | String to find (substring match) |
| Column | Yes | Column name | Column(s) to search within |

### Return Type

Table with same schema containing matching records.

### Rules

1. **Case-insensitive**: Always performs case-insensitive matching
2. **Substring match**: Finds string anywhere in column value
3. **Empty string**: Returns all records if SearchString is blank/empty
4. **Multiple columns**: Searches across all specified columns (OR logic)
5. **Not delegable**: Search is never delegable - use Filter + StartsWith for large datasets

### Examples

```powerfx
// Single column search
Search( Customers, SearchBox.Text, "Name" )

// Multiple columns
Search( Contacts, SearchBox.Text, "FirstName", "LastName", "Email" )

// Combined with Sort
Sort( Search( Products, SearchBox.Text, "Name" ), Name, SortOrder.Ascending )

// With fallback for empty search
If(
    IsBlank( SearchBox.Text ),
    Products,
    Search( Products, SearchBox.Text, "Name", "Description" )
)
```

---

## Comparison: Filter vs LookUp vs Search

| Feature | Filter | LookUp | Search |
|---------|--------|--------|--------|
| **Returns** | Table (multiple records) | Single record/value | Table (multiple records) |
| **Criteria** | Formula-based | Formula-based | String substring |
| **Case** | Depends on formula | Depends on formula | Always insensitive |
| **Delegable** | Partially | Partially | Never |
| **Use for** | Filtered lists | Single record retrieval | User search boxes |

---

## Best Practices

```powerfx
// GOOD: Use LookUp for single records
Set( varCustomer, LookUp( Customers, ID = varCustomerID ) )

// BAD: Filter + First for single record
Set( varCustomer, First( Filter( Customers, ID = varCustomerID ) ) )

// GOOD: Delegable search pattern
Filter( Products, StartsWith( Name, SearchBox.Text ) )

// BAD: Non-delegable for large datasets
Search( Products, SearchBox.Text, "Name" )

// GOOD: Check for results before using
If(
    !IsBlank( LookUp( Orders, ID = varID ) ),
    "Found",
    "Not found"
)
```

---

## Sources

- [Microsoft Learn: Filter, LookUp, and Search](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-filter-lookup)
