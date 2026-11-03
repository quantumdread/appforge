# Remove and RemoveIf Functions

Delete records from data sources and collections.

---

## Remove Function

Remove specific records by reference.

### Syntax

```powerfx
Remove( DataSource, Record1 [, Record2, ... ] )
Remove( DataSource, Table )
Remove( DataSource, Record, RemoveFlags.All )
```

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| DataSource | Yes | Data source or collection |
| Record(s) | Yes | Specific record(s) to remove |
| Table | Yes | Table of records to remove |
| RemoveFlags.All | No | Remove all duplicates (collections) |

### Examples

```powerfx
// Remove single record by lookup
Remove( Products, LookUp( Products, ID = 123 ) )

// Remove gallery selection
Remove( Contacts, Gallery1.Selected )

// Remove current item (inside gallery)
Remove( [@Contacts], ThisItem )

// Remove multiple records
Remove( Products,
    LookUp( Products, ID = 1 ),
    LookUp( Products, ID = 2 )
)

// Remove all matching records in collection
Remove( colItems, ThisItem, RemoveFlags.All )
```

---

## RemoveIf Function

Remove records matching a condition.

### Syntax

```powerfx
RemoveIf( DataSource, Condition [, Condition2, ... ] )
```

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| DataSource | Yes | Data source or collection |
| Condition(s) | Yes | Boolean formula(s) - record removed if true |

### Multiple Conditions

Multiple conditions are combined with AND logic.

### Examples

```powerfx
// Remove by simple condition
RemoveIf( Products, Category = "Discontinued" )

// Remove by comparison
RemoveIf( Orders, Total < 10 )

// Remove with date condition
RemoveIf( Events, EndDate < Today() )

// Multiple conditions (AND)
RemoveIf( Products, Category = "Sale", Quantity = 0 )
// Removes where Category = "Sale" AND Quantity = 0

// Remove all records
RemoveIf( colTemp, true )
// Better: use Clear() for collections
Clear( colTemp )

// Remove with text matching
RemoveIf( Users, StartsWith( Email, "test" ) )
```

---

## Return Value

Both functions return the modified data source as a table.

```powerfx
// Can chain or check results
Set( varRemaining, Remove( Products, ThisItem ) )
```

---

## Common Patterns

### Delete Button in Gallery

```powerfx
// Icon OnSelect inside gallery
Remove( [@DataSource], ThisItem )

// With confirmation
If( varConfirmDelete,
    Remove( [@DataSource], ThisItem );
    UpdateContext( { varConfirmDelete: false } )
)
```

### Delete Selected Items

```powerfx
// Remove all selected items
ForAll( colSelected,
    Remove( DataSource, LookUp( DataSource, ID = ThisRecord.ID ) )
);
Clear( colSelected )

// Or using RemoveIf
RemoveIf( DataSource, ID in colSelected.ID )
```

### Cleanup Old Records

```powerfx
RemoveIf( AuditLog, CreatedDate < DateAdd( Today(), -90 ) )
```

### Remove Duplicates from Collection

```powerfx
// Keep first occurrence, remove duplicates
ForAll(
    Filter( colData As Item,
        CountIf( colData, UniqueField = Item.UniqueField ) > 1
    ),
    Remove( colData, Item, RemoveFlags.All );
    Collect( colData, Item )  // Add back once
)
```

### Batch Delete with Progress

```powerfx
Set( varTotal, CountRows( colToDelete ) );
Set( varDeleted, 0 );

ForAll( colToDelete,
    Remove( DataSource, LookUp( DataSource, ID = ThisRecord.ID ) );
    Set( varDeleted, varDeleted + 1 )
)
```

---

## RemoveFlags.All

For collections with duplicate records:

```powerfx
// Without flag - removes ONE copy
Remove( colItems, { Name: "Test" } )

// With flag - removes ALL copies
Remove( colItems, { Name: "Test" }, RemoveFlags.All )
```

---

## Using [@...] Disambiguation

Inside galleries for tables with relationships:

```powerfx
// May cause issues with related tables
Remove( Contacts, ThisItem )

// Use [@...] for global reference
Remove( [@Contacts], ThisItem )
```

---

## Delegation Notes

### RemoveIf

- Delegation varies by data source
- Non-delegable: retrieves first 500–10,000 records (the data row limit), then deletes
- For large deletes, may need multiple calls

### Best Practice for Large Datasets

```powerfx
// Loop until all removed (if not delegable)
ForAll( Sequence( 10 ),  // Repeat up to 10 times
    RemoveIf( LargeTable, Condition )
)
```

---

## Remove vs Clear

| Use | Function |
|-----|----------|
| Remove specific records | `Remove` |
| Remove by condition | `RemoveIf` |
| Remove all from collection | `Clear` |
| Remove all from data source | `RemoveIf( DS, true )` |

---

## Common Mistakes

```powerfx
// BAD: Remove without record reference
Remove( Products, { ID: 123 } )  // Won't work with data sources!

// GOOD: LookUp the actual record
Remove( Products, LookUp( Products, ID = 123 ) )

// BAD: Using RemoveIf on collection for specific record
RemoveIf( colItems, ID = varID )  // Works but slower

// GOOD: Use Remove with LookUp for single record
Remove( colItems, LookUp( colItems, ID = varID ) )

// BAD: Forgetting [@...] in gallery for related tables
Remove( Contacts, ThisItem )

// GOOD: Use global disambiguation
Remove( [@Contacts], ThisItem )
```

---

## Sources

- [Microsoft Learn: Remove and RemoveIf](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-remove-removeif)
