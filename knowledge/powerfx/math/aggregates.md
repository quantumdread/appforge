# Aggregate Functions

Sum, Average, Min, Max, Count, CountA, CountIf, CountRows - Calculate values across records.

---

## Two Usage Patterns

### Pattern 1: Individual Arguments

```powerfx
Sum( Value1, Value2, Value3 )
Average( Value1, Value2, Value3 )
Min( Value1, Value2 )
Max( Value1, Value2 )
```

### Pattern 2: Table + Formula

```powerfx
Sum( Table, Formula )
Average( Table, Formula )
Min( Table, Formula )
Max( Table, Formula )
```

---

## Sum Function

Calculates the sum of values.

### Syntax

```powerfx
Sum( Value1 [, Value2, ... ] )
Sum( Table, Formula )
```

### Examples

```powerfx
// Individual values
Sum( 1, 2, 3 )                          // 6
Sum( Slider1.Value, Slider2.Value )

// Table column
Sum( Products, Price )                  // Sum of all prices
Sum( Orders, Quantity * UnitPrice )     // Sum of calculated values

// With filter
Sum( Filter( Orders, Status = "Paid" ), Amount )
```

---

## Average Function

Calculates the arithmetic mean.

### Syntax

```powerfx
Average( Value1 [, Value2, ... ] )
Average( Table, Formula )
```

### Examples

```powerfx
// Individual values
Average( 10, 20, 30 )                   // 20

// Table column
Average( Products, Price )              // Average price
Average( Reviews, Rating )              // Average rating

// With filter
Average( Filter( Employees, Department = "Sales" ), Salary )
```

---

## Min and Max Functions

Find minimum or maximum values.

### Syntax

```powerfx
Min( Value1 [, Value2, ... ] )
Min( Table, Formula )

Max( Value1 [, Value2, ... ] )
Max( Table, Formula )
```

### Examples

```powerfx
// Individual values
Min( 5, 10, 3 )                         // 3
Max( 5, 10, 3 )                         // 10

// Table columns
Min( Products, Price )                  // Cheapest price
Max( Products, Price )                  // Highest price

// Dates
Min( Events, StartDate )                // Earliest event
Max( Events, EndDate )                  // Latest event

// With calculations
Max( Orders, Quantity * UnitPrice )     // Largest order total
```

---

## Count Functions Overview

| Function | Counts |
|----------|--------|
| `CountRows` | All records in table |
| `Count` | Records with numeric values |
| `CountA` | Records with non-blank values |
| `CountIf` | Records matching condition |

---

## CountRows Function

Counts all records in a table.

### Syntax

```powerfx
CountRows( Table )
```

### Examples

```powerfx
CountRows( Products )                   // Total products
CountRows( Filter( Orders, Status = "Pending" ) )  // Pending orders
CountRows( Gallery1.AllItems )          // Items in gallery

// Check if empty
CountRows( Results ) = 0
// Better: use IsEmpty
IsEmpty( Results )
```

---

## Count Function

Counts records with numeric values in a column.

### Syntax

```powerfx
Count( SingleColumnTable )
Count( Value1 [, Value2, ... ] )
```

### Examples

```powerfx
// Count numeric values
Count( [1, 2, Blank(), 4] )             // 3 (excludes blank)
Count( ShowColumns( Data, NumericField ) )
```

---

## CountA Function

Counts non-blank values.

### Syntax

```powerfx
CountA( SingleColumnTable )
CountA( Value1 [, Value2, ... ] )
```

### Examples

```powerfx
// Count non-blank values
CountA( ["a", "", "b", Blank()] )       // 2 (excludes blank and "")
CountA( ShowColumns( Users, Email ) ) // Users with emails
```

---

## CountIf Function

Counts records matching a condition.

### Syntax

```powerfx
CountIf( Table, Condition )
```

### Examples

```powerfx
// Simple condition
CountIf( Products, InStock )            // Products in stock
CountIf( Orders, Status = "Complete" )  // Completed orders

// Multiple conditions (use &&)
CountIf( Tasks, Status = "Open" && Priority = "High" )

// Date conditions
CountIf( Events, StartDate > Today() )  // Future events

// Text conditions
CountIf( Users, StartsWith( Email, "admin" ) )
```

---

## Common Patterns

### Summary Statistics

```powerfx
// Named formulas for dashboard
TotalRevenue = Sum( Orders, Amount );
AverageOrderValue = Average( Orders, Amount );
LargestOrder = Max( Orders, Amount );
SmallestOrder = Min( Orders, Amount );
OrderCount = CountRows( Orders );
```

### Percentage Calculations

```powerfx
// Completion percentage
CountIf( Tasks, IsComplete ) / CountRows( Tasks ) * 100

// Percentage with formatting
Text( CountIf( Tasks, IsComplete ) / CountRows( Tasks ), "0%" )
```

### Conditional Counts

```powerfx
// Status breakdown
Set( varStatusCounts, {
    Pending: CountIf( Orders, Status = "Pending" ),
    Processing: CountIf( Orders, Status = "Processing" ),
    Shipped: CountIf( Orders, Status = "Shipped" ),
    Delivered: CountIf( Orders, Status = "Delivered" )
})
```

### Running Totals

```powerfx
// Not directly supported - use collection approach
ForAll( Sequence( CountRows( SortedData ) ),
    {
        Item: Index( SortedData, Value ),
        RunningTotal: Sum( FirstN( SortedData, Value ), Amount )
    }
)
```

### Grouped Aggregates

```powerfx
// Total per category
AddColumns(
    Distinct( Products, Category ),
    "TotalValue", Sum( Filter( Products, Category = Result ), Price )
)
```

---

## Delegation

| Function | Delegable |
|----------|-----------|
| Sum | Yes (with supported sources) |
| Average | Yes (with supported sources) |
| Min | Yes (with supported sources) |
| Max | Yes (with supported sources) |
| Count | No |
| CountA | No |
| CountIf | Yes (limited) |
| CountRows | Depends on source |

### Best Practice for Large Data

```powerfx
// Apply delegable filter first
Sum( Filter( LargeTable, Year = 2024 ), Amount )

// Rather than
Sum( LargeTable, If( Year = 2024, Amount, 0 ) )  // Not delegable!
```

---

## Sources

- [Microsoft Learn: Aggregate functions](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-aggregates)
