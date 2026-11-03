# ForAll Function

Evaluates a formula for all records in a table and returns a table of results.

## Syntax

```powerfx
ForAll( Table, Formula )
```

## Parameters

| Parameter | Required | Type | Description |
|-----------|----------|------|-------------|
| Table | Yes | Table | Table to iterate over |
| Formula | Yes | Any | Formula evaluated for each record |

## Return Type

- Returns a table with results in same order as input
- Single value formula → single-column table with `Value` column
- Record formula → table with same columns as result record
- Blank results → record omitted from output

---

## Basic Examples

```powerfx
// Calculate square root for each value
ForAll( Numbers, Sqrt( Value ) )

// Transform records
ForAll( Products,
    {
        Name: Upper( ProductName ),
        Total: Price * Quantity
    }
)

// With translation connector
ForAll( Phrases, MicrosoftTranslator.Translate( Text, "es" ) )
```

---

## Record Scope

Access current record fields directly or via `ThisRecord`:

```powerfx
// Direct field access
ForAll( Orders, Quantity * UnitPrice )

// Using ThisRecord
ForAll( Orders, ThisRecord.Quantity * ThisRecord.UnitPrice )

// Using As for clarity (especially nested)
ForAll( Orders As O,
    ForAll( Filter( OrderDetails, OrderID = O.ID ) As D,
        O.CustomerName & ": " & D.ProductName
    )
)
```

---

## Behavior Functions (Side Effects)

ForAll can execute actions, not just return values:

```powerfx
// Patch multiple records
ForAll( SelectedItems,
    Patch( Products, ThisRecord, { Status: "Archived" } )
)

// Send emails to all recipients
ForAll( Recipients,
    Office365Outlook.SendEmailV2( Email, Subject, Body )
)

// Collect results (order undefined)
Clear( colResults );
ForAll( DataSource,
    Collect( colResults, { ID: ID, Processed: Now() } )
)
```

---

## Rules and Limitations

### Cannot Use Inside ForAll
- `UpdateContext` - context variables
- `Clear` - clearing collections
- `ClearCollect` - clear and collect

### Can Use (But Order Undefined)
- `Collect` - records added in undefined order
- `Patch` - records modified
- `Remove` - records removed

### Processing Order
- Records may process in **any order**
- Processing may happen **in parallel**
- First record might process after last record
- **Never rely on processing order**

### Delegation
- **ForAll is NOT delegable**
- Only first 500–10,000 records (the data row limit) retrieved
- Use `Filter` first to reduce dataset

---

## Common Patterns

### Transform and Collect

```powerfx
ClearCollect( colTransformed,
    ForAll( SourceData,
        {
            FullName: FirstName & " " & LastName,
            Age: DateDiff( BirthDate, Today(), TimeUnit.Years )
        }
    )
)
```

### Conditional Processing

```powerfx
ForAll( Products,
    If( Quantity < ReorderLevel,
        Patch( Products, ThisRecord, { NeedsReorder: true } )
    )
)
```

### Batch Updates

```powerfx
ForAll( Gallery1.AllItems,
    Patch( Orders, ThisRecord, { Status: "Shipped", ShippedDate: Now() } )
)
```

### Generate Sequence

```powerfx
// Create numbered list
ForAll( Sequence( 10 ),
    { Number: Value, Square: Value * Value }
)
```

### Nested ForAll

```powerfx
ForAll( Categories As Cat,
    ForAll( Filter( Products, CategoryID = Cat.ID ) As Prod,
        {
            Category: Cat.Name,
            Product: Prod.Name,
            Price: Prod.Price
        }
    )
)
```

---

## ForAll vs Other Functions

| Use Case | Function |
|----------|----------|
| Transform each record | `ForAll` |
| Filter records | `Filter` (delegable) |
| Get single value from each | `AddColumns` |
| Aggregate (sum, count) | `Sum`, `Count`, etc. |
| Single record lookup | `LookUp` |

---

## Performance Tips

```powerfx
// BAD: ForAll on large data source
ForAll( LargeDataSource, ... )

// GOOD: Filter first, then ForAll
ForAll( Filter( LargeDataSource, Status = "Active" ), ... )

// BAD: Nested data calls
ForAll( Orders,
    LookUp( Customers, ID = CustomerID )  // N+1 queries!
)

// GOOD: Join with AddColumns first
ForAll(
    AddColumns( Orders, Customer, LookUp( Customers, ID = CustomerID ) ),
    ...
)
```

---

## Sources

- [Microsoft Learn: ForAll function](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-forall)
