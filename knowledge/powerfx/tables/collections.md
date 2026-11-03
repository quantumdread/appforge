# Collection Functions: Collect, Clear, ClearCollect

Collections are in-memory tables that store data temporarily within your app.

## Overview

| Function | Purpose |
|----------|---------|
| `Collect` | Add records to collection or data source |
| `Clear` | Remove all records from collection |
| `ClearCollect` | Clear then add records (combined operation) |

---

## Collect Function

Adds records to a data source or collection.

### Syntax

```powerfx
Collect( DataSource, Item [, Item2, ... ] )
```

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| DataSource | Yes | Collection or data source to add to |
| Item | Yes | Records, values, or tables to add |

### Rules

1. **Creates if missing**: Collection created automatically if doesn't exist
2. **Adds columns**: New columns created for collection as needed
3. **Returns table**: Returns the modified data source
4. **Behavior only**: Only works in behavior formulas

### Examples

```powerfx
// Add single record
Collect( colOrders, { Product: "Widget", Quantity: 5 } )

// Add multiple records
Collect( colOrders,
    { Product: "Widget", Quantity: 5 },
    { Product: "Gadget", Quantity: 3 }
)

// Add from another table
Collect( colOrders, Filter( Orders, Status = "Pending" ) )

// Add gallery selection
Collect( colSelected, Gallery1.Selected )

// Add simple values (creates Value column)
Collect( colNumbers, 1, 2, 3, 4, 5 )

// Add with current user/time
Collect( colAuditLog, {
    Action: "Login",
    User: User().Email,
    Timestamp: Now()
})
```

---

## Clear Function

Removes all records from a collection.

### Syntax

```powerfx
Clear( Collection )
```

### Rules

1. **Collections only**: Only works on collections, not external data sources
2. **Preserves schema**: Column structure remains after clearing
3. **No return value**: Doesn't return anything

### Examples

```powerfx
// Clear collection
Clear( colSelectedItems )

// Clear before navigation
Clear( colTempData );
Navigate( HomeScreen )

// Reset form state
Clear( colFormErrors );
Reset( Form1 )
```

---

## ClearCollect Function

Clears a collection and adds new records in one operation.

### Syntax

```powerfx
ClearCollect( Collection, Item [, Item2, ... ] )
```

### Rules

1. **Atomic operation**: More efficient than Clear + Collect
2. **Complete replacement**: All existing records removed first
3. **Returns table**: Returns the new collection contents

### Examples

```powerfx
// Replace collection contents
ClearCollect( colProducts, Products )

// Refresh filtered data
ClearCollect( colActiveUsers,
    Filter( Users, Status = "Active" )
)

// Initialize with defaults
ClearCollect( colSettings,
    { Key: "Theme", Value: "Light" },
    { Key: "Language", Value: "en-US" }
)

// Cache lookup data on app start
ClearCollect( colCategories, Categories );
ClearCollect( colStatuses, Statuses )
```

---

## Common Collection Patterns

### Shopping Cart

```powerfx
// Add to cart
Collect( colCart, {
    ProductID: ThisItem.ID,
    Name: ThisItem.Name,
    Price: ThisItem.Price,
    Quantity: 1
})

// Remove from cart
Remove( colCart, LookUp( colCart, ProductID = ThisItem.ID ) )

// Clear cart
Clear( colCart )

// Update quantity
Patch( colCart,
    LookUp( colCart, ProductID = varProductID ),
    { Quantity: Quantity + 1 }
)
```

### Multi-Select Pattern

```powerfx
// Toggle selection
If(
    ThisItem.ID in colSelected.ID,
    Remove( colSelected, LookUp( colSelected, ID = ThisItem.ID ) ),
    Collect( colSelected, ThisItem )
)

// Check if selected
ThisItem.ID in colSelected.ID

// Get selected items
colSelected

// Clear selection
Clear( colSelected )
```

### Offline Data Cache

```powerfx
// App.OnStart - Load cached data
If(
    Connection.Connected,
    ClearCollect( colCustomers, Customers ),
    LoadData( colCustomers, "CustomersCache", true )
);

// Periodically save
SaveData( colCustomers, "CustomersCache" )
```

### Form Validation Errors

```powerfx
// Validate and collect errors
Clear( colErrors );

If( IsBlank( txtName.Text ),
    Collect( colErrors, { Field: "Name", Message: "Name is required" } )
);

If( !IsMatch( txtEmail.Text, Match.Email ),
    Collect( colErrors, { Field: "Email", Message: "Invalid email format" } )
);

// Check if valid
IsEmpty( colErrors )

// Display errors
Concat( colErrors, Message, Char(10) )
```

### Undo/Redo Stack

```powerfx
// Save state before change
Collect( colUndoStack, { State: JSON( currentData ) } );

// Undo
Set( varCurrentData, ParseJSON( Last( colUndoStack ).State ) );
Remove( colUndoStack, Last( colUndoStack ) )
```

---

## Collection vs Data Source

| Feature | Collection | Data Source |
|---------|------------|-------------|
| Scope | App session only | Persistent |
| Speed | Very fast | Network dependent |
| Size | Limited by memory | Can be large |
| Delegation | Not applicable | Important |
| Use for | Temp storage, local state | Persistent data |

---

## Performance Tips

```powerfx
// GOOD: Single ClearCollect instead of Clear + Collect
ClearCollect( colData, SourceData )

// BAD: Two separate operations
Clear( colData );
Collect( colData, SourceData )

// GOOD: Batch add records
Collect( colItems, Table1, Table2, Table3 )

// BAD: Multiple Collect calls
Collect( colItems, Table1 );
Collect( colItems, Table2 );
Collect( colItems, Table3 )

// GOOD: Filter at source when possible
ClearCollect( colActive, Filter( DataSource, Status = "Active" ) )

// BAD: Load everything then filter locally
ClearCollect( colAll, DataSource );
ClearCollect( colActive, Filter( colAll, Status = "Active" ) )
```

---

## Related Functions

| Function | Use Case |
|----------|----------|
| `Remove` | Remove specific records |
| `RemoveIf` | Remove records matching condition |
| `Update` | Replace entire record |
| `UpdateIf` | Update records matching condition |
| `Patch` | Modify specific fields |
| `SaveData` | Persist collection locally |
| `LoadData` | Load persisted collection |

---

## Delegation Warning

Collections are NOT subject to delegation limits, but:

```powerfx
// WARNING: Only gets first 500–10,000 records (the data row limit)
ClearCollect( colAllData, LargeDataSource )

// BETTER: Apply delegable filter first
ClearCollect( colData,
    Filter( LargeDataSource,
        CreatedDate > DateAdd( Today(), -30 )
    )
)
```

---

## Sources

- [Microsoft Learn: Collect, Clear, ClearCollect](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-clear-collect-clearcollect)
