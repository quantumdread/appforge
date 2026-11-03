# Distinct Function

Returns unique values from a table column or formula.

---

## Syntax

```powerfx
Distinct( Table, Formula )
```

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| Table | Yes | Table to evaluate |
| Formula | Yes | Formula evaluated for each record |

## Return Type

Single-column table with column named `Value`.

---

## Basic Examples

```powerfx
// Get unique categories
Distinct( Products, Category )
// { Value: "Electronics" }, { Value: "Clothing" }, { Value: "Food" }

// Get unique countries
Distinct( Customers, Country )

// Get unique years from dates
Distinct( Orders, Year( OrderDate ) )
```

---

## Accessing Results

The result column is always named `Value`:

```powerfx
// Use in dropdown
Distinct( Products, Category )
// Set dropdown's Items to this
// Use Value column for display

// Access specific value
First( Distinct( Products, Category ) ).Value

// Sort results
Sort( Distinct( Products, Category ), Value )
```

---

## Common Patterns

### Dropdown Filter Options

```powerfx
// Items property of dropdown
Distinct( DataSource, FilterColumn )

// With "All" option
Ungroup(
    Table(
        { Items: Table( { Value: "All" } ) },
        { Items: Distinct( DataSource, Category ) }
    ),
    "Items"
)
```

### Count Unique Values

```powerfx
CountRows( Distinct( Orders, CustomerID ) )
```

### Distinct with Calculated Values

```powerfx
// Distinct first letters
Distinct( Contacts, Upper( Left( LastName, 1 ) ) )

// Distinct year-month combinations
Distinct( Events, Text( StartDate, "yyyy-mm" ) )
```

### Grouped Aggregation

```powerfx
// Sum per category
AddColumns(
    Distinct( Products, Category ),
    "Total", Sum( Filter( Products, Category = Value ), Price ),
    "Count", CountIf( Products, Category = Value )
)
```

### Filter by Distinct Selection

```powerfx
// Gallery filtered by dropdown
Filter( Products,
    drpCategory.Selected.Value = "All" ||
    Category = drpCategory.Selected.Value
)
```

---

## With Sort

```powerfx
// Alphabetical
Sort( Distinct( Products, Category ), Value, SortOrder.Ascending )

// Descending
Sort( Distinct( Products, Category ), Value, SortOrder.Descending )
```

---

## Combined with Other Functions

### Distinct + First

```powerfx
// Get first unique value alphabetically
First( Sort( Distinct( Data, Field ), Value ) ).Value
```

### Distinct + CountRows

```powerfx
// Number of unique customers
CountRows( Distinct( Orders, CustomerID ) )
```

### Distinct + ForAll

```powerfx
// Process each unique value
ForAll( Distinct( Products, Category ),
    {
        Category: Value,
        ProductCount: CountIf( Products, Category = Value ),
        TotalValue: Sum( Filter( Products, Category = Value ), Price )
    }
)
```

---

## Nested Distinct

```powerfx
// Distinct combinations (using concatenation)
Distinct( Data, Region & "-" & Category )

// Then split if needed
AddColumns(
    Distinct( Data, Region & "|" & Category ),
    "Region", First( Split( Value, "|" ) ).Value,
    "Category", Last( Split( Value, "|" ) ).Value
)
```

---

## Delegation Warning

**Distinct is NOT delegable**:
- Only first 500–10,000 records (the data row limit) retrieved
- May miss unique values in large datasets
- Consider filtering first with delegable functions

```powerfx
// Better for large datasets
Distinct(
    Filter( LargeTable, Year = 2024 ),  // Delegable filter first
    Category
)
```

---

## Common Use Cases

| Use Case | Formula |
|----------|---------|
| Filter dropdown | `Distinct( Table, Column )` |
| Count unique | `CountRows( Distinct( T, Col ) )` |
| Alphabetical list | `Sort( Distinct( T, Col ), Value )` |
| Category totals | `AddColumns( Distinct(...), "Sum", Sum(...) )` |

---

## Common Mistakes

```powerfx
// BAD: Expecting original column names
Distinct( Products, Category ).Category    // Error!

// GOOD: Use Value
Distinct( Products, Category ).Value       // Error - it's a table
First( Distinct( Products, Category ) ).Value  // Correct

// BAD: Using directly without sort
// Results may be in any order

// GOOD: Sort for consistent order
Sort( Distinct( Products, Category ), Value )
```

---

## Sources

- [Microsoft Learn: Distinct function](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-distinct)
