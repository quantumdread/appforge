# Sequence Function

Generates a table of sequential numbers.

---

## Syntax

```powerfx
Sequence( Records [, Start [, Step ] ] )
```

## Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| Records | Yes | - | Number of records (max 50,000) |
| Start | No | 1 | Starting value |
| Step | No | 1 | Increment (can be negative) |

## Return Type

Single-column table with `Value` column.

---

## Basic Examples

```powerfx
Sequence( 5 )                    // 1, 2, 3, 4, 5
Sequence( 5, 0 )                 // 0, 1, 2, 3, 4
Sequence( 5, 10 )                // 10, 11, 12, 13, 14
Sequence( 5, 10, 2 )             // 10, 12, 14, 16, 18
Sequence( 5, 5, -1 )             // 5, 4, 3, 2, 1
Sequence( 4, -100, 0.5 )         // -100, -99.5, -99, -98.5
```

---

## Common Patterns

### Generate Date Range

```powerfx
// Next 7 days
ForAll( Sequence( 7 ),
    DateAdd( Today(), Value - 1, TimeUnit.Days )
)

// Next 12 months
ForAll( Sequence( 12 ),
    DateAdd( Today(), Value - 1, TimeUnit.Months )
)
```

### Create Number Options

```powerfx
// Dropdown with 1-10
Sequence( 10 )

// Dropdown with 0, 5, 10, 15, 20
Sequence( 5, 0, 5 )

// Years dropdown (last 10 years)
ForAll( Sequence( 10, Year( Today() ), -1 ),
    { Year: Value }
)
```

### Pagination

```powerfx
// Page numbers
Sequence( TotalPages )

// Records for current page
ForAll( Sequence( PageSize, (CurrentPage - 1) * PageSize + 1 ),
    Index( SortedData, Value )
)
```

### Repeat Action N Times

```powerfx
// Execute something 5 times
ForAll( Sequence( 5 ),
    Collect( colResults, { Iteration: Value, Random: Rand() } )
)
```

### Generate Test Data

```powerfx
ClearCollect( colTestData,
    ForAll( Sequence( 100 ),
        {
            ID: Value,
            Name: "Item " & Value,
            Price: RandBetween( 10, 100 ),
            Date: DateAdd( Today(), -RandBetween( 0, 365 ), TimeUnit.Days )
        }
    )
)
```

---

## Character/String Generation

```powerfx
// Alphabet (A-Z)
ForAll( Sequence( 26, 65 ),
    Char( Value )
)

// Numbers as text with padding
ForAll( Sequence( 10 ),
    Text( Value, "000" )
)
// "001", "002", "003", ...

// Repeat character
Concat( Sequence( 10 ), "*" )
// "**********"
```

---

## Time Slots

```powerfx
// Hour slots 9 AM - 5 PM
ForAll( Sequence( 9, 9 ),
    {
        Hour: Value,
        Display: Text( Time( Value, 0, 0 ), "h:mm AM/PM" )
    }
)

// 15-minute intervals
ForAll( Sequence( 32, 0 ),
    Time( 9 + Int( Value / 4 ), Mod( Value, 4 ) * 15, 0 )
)
```

---

## Grid/Matrix Generation

```powerfx
// 3x3 grid
ForAll( Sequence( 3 ) As Row,
    ForAll( Sequence( 3 ) As Col,
        { Row: Row.Value, Col: Col.Value }
    )
)

// Flatten with Ungroup
Ungroup(
    ForAll( Sequence( 3 ) As Row,
        { Cells: ForAll( Sequence( 3 ) As Col,
            { Row: Row.Value, Col: Col.Value }
        )}
    ),
    "Cells"
)
```

---

## Index-Based Operations

```powerfx
// Access items by index
ForAll( Sequence( CountRows( MyTable ) ),
    Index( MyTable, Value )
)

// Every other record
ForAll( Sequence( RoundUp( CountRows( Data ) / 2, 0 ), 1, 2 ),
    Index( Data, Value )
)

// Reverse a table
ForAll( Sequence( CountRows( Data ), CountRows( Data ), -1 ),
    Index( Data, Value )
)
```

---

## Limits

- Maximum 50,000 records
- Records parameter rounded down to integer
- `Sequence( 0 )` returns empty table
- `Sequence( 0.9 )` returns empty table (rounds to 0)

---

## Sequence vs Manual Table

```powerfx
// Manual (limited)
[ 1, 2, 3, 4, 5 ]

// Sequence (flexible)
Sequence( 5 )

// Sequence with transform
ForAll( Sequence( 5 ), { Num: Value, Square: Value * Value } )
```

---

## Sources

- [Microsoft Learn: Sequence function](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-sequence)
