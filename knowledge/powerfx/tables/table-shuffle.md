# Table and Shuffle Functions

Create inline tables and randomize record order.

---

## Table Function

Creates a temporary table from records or other tables.

### Syntax

```powerfx
Table( RecordOrTable1 [, RecordOrTable2, ... ] )
```

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| RecordOrTable | Yes | Records or tables to combine |

### Key Behaviors

- **Temporary** - Table exists only for the operation
- **Column union** - All columns from all records are included
- **Blank values** - Missing columns filled with blanks
- Does not modify source data

---

## Table Examples

### Single-Column Table

```powerfx
// Create simple list
Table( { Color: "Red" }, { Color: "Green" }, { Color: "Blue" } )
```

### Inline Array Syntax

```powerfx
// Shorthand for single-column table with Value column
[ "Red", "Green", "Blue" ]

// Equivalent to:
Table( { Value: "Red" }, { Value: "Green" }, { Value: "Blue" } )
```

### Multi-Column Table

```powerfx
Table(
    { Name: "Alice", Age: 30, City: "Seattle" },
    { Name: "Bob", Age: 25, City: "Denver" },
    { Name: "Carol", Age: 35, City: "Austin" }
)
```

### Mixed Records (Column Union)

```powerfx
Table(
    { Item: "Laptop", Price: 999 },
    { Item: "Mouse", Price: 25, Color: "Black" }
)
// Result has 3 columns: Item, Price, Color
// First record has Color = blank
```

### Combining Records and Arrays

```powerfx
Table(
    { Value: "XS" },
    [ "S", "M", "L" ],     // Inline array
    { Value: "XL" }
)
// Creates single-column table with 5 rows
```

---

## Common Table Patterns

### Dropdown Options

```powerfx
// Items property of dropdown
Table(
    { Text: "Option 1", Value: 1 },
    { Text: "Option 2", Value: 2 },
    { Text: "Option 3", Value: 3 }
)
```

### Status List

```powerfx
Table(
    { Status: "Pending", Icon: Icon.Clock },
    { Status: "In Progress", Icon: Icon.Rocket },
    { Status: "Complete", Icon: Icon.Check }
)
```

### Combine Multiple Sources

```powerfx
Table(
    { Source: "Local", Data: colLocalItems },
    { Source: "Remote", Data: colRemoteItems }
)
```

### Rating Options

```powerfx
[ 1, 2, 3, 4, 5 ]
// or
Table( {Value:1}, {Value:2}, {Value:3}, {Value:4}, {Value:5} )
```

---

## Shuffle Function

Randomly reorders records in a table.

### Syntax

```powerfx
Shuffle( Table )
```

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| Table | Yes | Table to randomize |

### Return Value

New table with same structure but randomized record order.

### Key Behaviors

- Returns a **copy** - original unchanged
- Same columns and row count
- Random order each time called

---

## Shuffle Examples

### Randomize Collection

```powerfx
// Shuffle a deck of cards
Shuffle( colDeck )
```

### Random Quiz Questions

```powerfx
// Randomize question order
ClearCollect( colRandomQuestions, Shuffle( Questions ) )
```

### Random Selection

```powerfx
// Pick random item
First( Shuffle( MyTable ) )
```

### Random Subset

```powerfx
// Get 5 random records
FirstN( Shuffle( Products ), 5 )
```

---

## Common Shuffle Patterns

### Card Game

```powerfx
// Shuffle and deal
ClearCollect( colShuffledDeck, Shuffle( colDeck ) );
Set( varCurrentCard, First( colShuffledDeck ) )
```

### Random Order Display

```powerfx
// Gallery Items property
Shuffle( SurveyQuestions )
```

### Random Sample

```powerfx
// Get 10% random sample
FirstN(
    Shuffle( AllRecords ),
    RoundUp( CountRows( AllRecords ) * 0.1, 0 )
)
```

### Random Daily Item

```powerfx
// Seed with today's date for consistent daily pick
// (Note: True seeded randomness requires workaround)
First( Shuffle( DailyTips ) )
```

---

## Table vs Other Functions

| Function | Purpose |
|----------|---------|
| `Table` | Create inline table from records |
| `Collect` | Add to collection (persists) |
| `ClearCollect` | Replace collection contents |
| `[ ]` array | Shorthand single-column table |

```powerfx
// Table - temporary, for immediate use
Table( { Name: "Test" } )

// Collect - adds to persistent collection
Collect( colItems, { Name: "Test" } )
```

---

## Common Mistakes

```powerfx
// BAD: Expecting Table to persist
Table( { Item: "New" } )
// Table is temporary - not stored anywhere

// GOOD: Store in collection if needed
ClearCollect( colItems, Table( { Item: "New" } ) )

// BAD: Assuming Shuffle modifies original
Shuffle( colDeck )
// Original colDeck unchanged

// GOOD: Store shuffled result
ClearCollect( colShuffledDeck, Shuffle( colDeck ) )
```

---

## Performance Notes

- `Table` is efficient for small inline data
- For large datasets, prefer data source or collection
- `Shuffle` processes entire table - may be slow for large tables

---

## Sources

- [Microsoft Learn: Table function](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-table)
- [Microsoft Learn: Shuffle function](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-shuffle)
