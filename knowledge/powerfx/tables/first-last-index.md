# First, Last, FirstN, LastN, Index Functions

Retrieve specific records from a table by position.

---

## Function Overview

| Function | Returns | Description |
|----------|---------|-------------|
| `First` | Record | First record of table |
| `Last` | Record | Last record of table |
| `FirstN` | Table | First N records |
| `LastN` | Table | Last N records |
| `Index` | Record | Record at specific position |

---

## First and Last

### Syntax

```powerfx
First( Table )
Last( Table )
```

### Return Type

Single record (or blank if table is empty)

### Examples

```powerfx
// Get first record
First( Products )
// { ID: 1, Name: "Widget", Price: 10 }

// Get first record's field
First( Products ).Name
// "Widget"

// Get last record
Last( SortedByDate )

// Get most recent (sort descending, take first)
First( Sort( Orders, CreatedDate, SortOrder.Descending ) )

// With filter
First( Filter( Users, Role = "Admin" ) )
```

---

## FirstN and LastN

### Syntax

```powerfx
FirstN( Table [, NumberOfRecords ] )
LastN( Table [, NumberOfRecords ] )
```

### Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| Table | Yes | - | Source table |
| NumberOfRecords | No | 1 | Number of records to return |

### Return Type

Table (even for single record)

### Examples

```powerfx
// Get first 5 records
FirstN( Products, 5 )

// Get top 10 by price
FirstN( Sort( Products, Price, SortOrder.Descending ), 10 )

// Get last 3 records
LastN( AuditLog, 3 )

// Recent activity
LastN( Sort( Activities, Timestamp ), 10 )

// Pagination pattern
FirstN( Skip( SortedData, (PageNumber - 1) * PageSize ), PageSize )
```

---

## Index

### Syntax

```powerfx
Index( Table, RecordIndex )
```

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| Table | Yes | Source table |
| RecordIndex | Yes | 1-based position |

### Return Type

Single record (or error if out of bounds)

### Rules

- Index is **1-based** (first record is index 1)
- Returns **error** if index < 1 or > table size
- Returns **error** if table is empty

### Examples

```powerfx
// Get third record
Index( Products, 3 )

// Get specific field
Index( Products, 3 ).Name

// Get by variable
Index( Items, varSelectedIndex )

// Middle record
Index( Data, RoundUp( CountRows( Data ) / 2, 0 ) )
```

---

## Common Patterns

### Safe Index Access

```powerfx
// Check bounds first
If( varIndex > 0 && varIndex <= CountRows( Data ),
    Index( Data, varIndex ),
    Blank()
)

// Using IfError
IfError( Index( Data, varIndex ), Blank() )
```

### Top N Records

```powerfx
// Top 5 by sales
FirstN( Sort( Products, Sales, SortOrder.Descending ), 5 )

// Top 3 per category
ForAll( Distinct( Products, Category ) As Cat,
    {
        Category: Cat.Result,
        TopProducts: FirstN(
            Sort( Filter( Products, Category = Cat.Result ), Sales, SortOrder.Descending ),
            3
        )
    }
)
```

### Most Recent Record

```powerfx
// Most recent by date
First( Sort( Records, CreatedDate, SortOrder.Descending ) )

// Most recent per user
First( Sort( Filter( Records, UserID = varUserID ), CreatedDate, SortOrder.Descending ) )
```

### Pagination

```powerfx
// Variables
Set( varPageSize, 10 );
Set( varCurrentPage, 1 );

// Get current page data
FirstN(
    LastN( SortedData, CountRows( SortedData ) - (varCurrentPage - 1) * varPageSize ),
    varPageSize
)

// Alternative with custom Skip function
With(
    { startIndex: (varCurrentPage - 1) * varPageSize + 1 },
    ForAll( Sequence( varPageSize, startIndex ),
        Index( SortedData, Value )
    )
)
```

### Get Nth Item from Split

```powerfx
// Get domain from email
Index( Split( Email, "@" ), 2 ).Value

// Get second word
Index( Split( Sentence, " " ), 2 ).Value

// Get file extension
Last( Split( FileName, "." ) ).Value
```

### Random Record

```powerfx
Index( Data, RandBetween( 1, CountRows( Data ) ) )
```

---

## Comparison

| Function | Empty Table | Out of Bounds |
|----------|-------------|---------------|
| `First` | Blank | N/A |
| `Last` | Blank | N/A |
| `FirstN` | Empty table | Returns available |
| `LastN` | Empty table | Returns available |
| `Index` | Error | Error |

---

## Delegation Warning

These functions are **not delegable**:
- Only first 500–10,000 records (the data row limit) retrieved from data source
- Filter and sort before using these functions

```powerfx
// GOOD: Filter first (delegable)
First( Filter( LargeTable, Status = "Active" ) )

// BAD: Gets first of limited subset
First( LargeTable )  // May not be actual first record
```

---

## Sources

- [Microsoft Learn: First, FirstN, Index, Last, LastN](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-first-last)
