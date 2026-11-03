# GroupBy and Ungroup Functions

Group records by column values and flatten grouped tables.

> **Syntax Note (v3.24042+):** Column names are unquoted identifiers, not strings.

---

## GroupBy Function

Groups table records by one or more columns.

### Syntax

```powerfx
GroupBy( Table, Column1 [, Column2, ... ], GroupColumnName )
```

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| Table | Yes | Table to group |
| Column(s) | Yes | Columns to group by |
| GroupColumnName | Yes | Name for nested table column |

### Return Type

Table with grouping columns + one column containing nested tables.

---

## Ungroup Function

Flattens grouped tables back to individual records.

### Syntax

```powerfx
Ungroup( Table, GroupColumnName )
```

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| Table | Yes | Grouped table to flatten |
| GroupColumnName | Yes | Column containing nested tables |

---

## Basic Example

### Original Data

```
| City      | Country | Population |
|-----------|---------|------------|
| London    | UK      | 8615000    |
| Berlin    | Germany | 3562000    |
| Munich    | Germany | 1494000    |
| Madrid    | Spain   | 3165000    |
```

### Group By Country

```powerfx
GroupBy( Cities, Country, CityData )
```

### Result

```
| Country | CityData (nested table)              |
|---------|--------------------------------------|
| UK      | [{ City: "London", Population: ... }] |
| Germany | [{ City: "Berlin", ... }, { City: "Munich", ... }] |
| Spain   | [{ City: "Madrid", Population: ... }] |
```

---

## Common Patterns

### Group and Aggregate

```powerfx
// Group then add aggregates
AddColumns(
    GroupBy( Orders, CustomerID, OrderData ),
    TotalOrders, CountRows( OrderData ),
    TotalAmount, Sum( OrderData, Amount ),
    AverageOrder, Average( OrderData, Amount )
)
```

### Group, Filter, Ungroup

```powerfx
// Remove all orders from certain customers
Ungroup(
    Filter(
        GroupBy( Orders, CustomerID, OrderData ),
        !( CustomerID in colBlockedCustomers.ID )
    ),
    OrderData
)
```

### Category Summary

```powerfx
// Products grouped by category with stats
AddColumns(
    GroupBy( Products, Category, Items ),
    ProductCount, CountRows( Items ),
    MinPrice, Min( Items, Price ),
    MaxPrice, Max( Items, Price ),
    TotalInventory, Sum( Items, Quantity )
)
```

---

## Multi-Column Grouping

```powerfx
// Group by multiple columns
GroupBy( Sales, Region, Year, SalesData )

// Result has Region, Year columns + SalesData nested table
```

---

## Working with Nested Tables

### Access Nested Data

```powerfx
// In gallery showing grouped data
// ThisItem.GroupColumn is the nested table

// Show first item from group
First( ThisItem.CityData ).City

// Show count
CountRows( ThisItem.CityData )

// Show all cities in group (nested gallery)
// Set inner gallery Items to: ThisItem.CityData
```

### Aggregate in Display

```powerfx
// Gallery showing groups
// Text property showing aggregate
"Total: " & Text( Sum( ThisItem.OrderData, Amount ), "$#,##0" )
```

---

## Ungroup Examples

```powerfx
// Flatten grouped data
Ungroup( GroupedTable, NestedColumn )

// Filter then ungroup
Ungroup(
    Filter( GroupedByRegion, Region = "West" ),
    "Data"
)
```

---

## Combining Multiple Tables

```powerfx
// Use Ungroup to combine tables
Ungroup(
    Table(
        { Source: "Table1", Data: Table1 },
        { Source: "Table2", Data: Table2 },
        { Source: "Table3", Data: Table3 }
    ),
    "Data"
)
```

---

## Performance Considerations

- GroupBy creates nested tables in memory
- Large datasets may impact performance
- Consider filtering before grouping
- Not delegable - subject to data limits

---

## GroupBy vs AddColumns + Distinct

```powerfx
// Alternative to GroupBy for simple aggregates
AddColumns(
    Distinct( Orders, CustomerID ),
    OrderCount, CountIf( Orders, CustomerID = Value ),
    Total, Sum( Filter( Orders, CustomerID = Value ), Amount )
)

// GroupBy approach (nested tables)
AddColumns(
    GroupBy( Orders, CustomerID, OrderData ),
    OrderCount, CountRows( OrderData ),
    Total, Sum( OrderData, Amount )
)
```

---

## Sources

- [Microsoft Learn: GroupBy and Ungroup](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-groupby)
