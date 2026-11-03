# Update and UpdateIf Functions

Update records in data sources and collections.

---

## Overview

| Function | Description |
|----------|-------------|
| `Update` | Replace entire record |
| `UpdateIf` | Modify specific fields by condition |
| `Patch` | Modify specific fields by record |

---

## Update Function

Replaces an entire record with a new record.

### Syntax

```powerfx
Update( DataSource, OldRecord, NewRecord [, RemoveFlags.All ] )
```

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| DataSource | Yes | Data source or collection |
| OldRecord | Yes | Record to replace |
| NewRecord | Yes | Complete replacement record |
| RemoveFlags.All | No | Update all copies (collections) |

### Key Behavior

- **Replaces ENTIRE record**
- Missing fields in NewRecord become **Blank**
- Must include all fields you want to keep

### Examples

```powerfx
// Replace entire record
Update( Products,
    LookUp( Products, ID = 123 ),
    { ID: 123, Name: "New Name", Price: 99.99, Stock: 50 }
)

// WARNING: Missing fields become Blank!
Update( Products,
    LookUp( Products, ID = 123 ),
    { ID: 123, Name: "New Name" }  // Price and Stock become Blank!
)
```

---

## UpdateIf Function

Modifies specific fields in records matching a condition.

### Syntax

```powerfx
UpdateIf( DataSource, Condition, ChangeRecord [, Condition2, ChangeRecord2, ... ] )
```

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| DataSource | Yes | Data source or collection |
| Condition | Yes | Boolean formula |
| ChangeRecord | Yes | Fields to modify |

### Key Behavior

- **Modifies only specified fields**
- Other fields remain unchanged
- Can reference current field values
- Updates ALL matching records

### Examples

```powerfx
// Update by condition
UpdateIf( Products, Category = "Sale", { OnSale: true } )

// Update with calculation
UpdateIf( Products, Stock < 10, { NeedsReorder: true } )

// Update using current values
UpdateIf( Products, OnSale, { Price: Price * 0.9 } )

// Update all records
UpdateIf( Inventory, true, { LastChecked: Now() } )

// Multiple conditions/updates
UpdateIf( Tasks,
    Priority = "High" && Status = "Open", { Urgent: true },
    Priority = "Low" && DueDate < Today(), { Status: "Overdue" }
)
```

---

## Update vs UpdateIf vs Patch

| Aspect | Update | UpdateIf | Patch |
|--------|--------|----------|-------|
| Scope | Single record | Multiple records | Single/Multiple |
| Fields | All (replaces) | Specified only | Specified only |
| Selection | By record | By condition | By record |
| Use for | Full replacement | Bulk updates | Partial updates |

---

## Common Patterns

### Toggle Field

```powerfx
// Toggle boolean
UpdateIf( Tasks, ID = varTaskID, { IsComplete: !IsComplete } )
```

### Increment Counter

```powerfx
UpdateIf( Products, ID = varProductID, { ViewCount: ViewCount + 1 } )
```

### Bulk Status Change

```powerfx
// Mark selected as complete
UpdateIf( Tasks,
    ID in colSelected.ID,
    { Status: "Complete", CompletedDate: Now() }
)
```

### Reset Values

```powerfx
// Reset all to default
UpdateIf( Settings, true, { Value: DefaultValue } )
```

### Conditional Calculation

```powerfx
// Apply discount to sale items
UpdateIf( Products,
    Category = "Clearance",
    { SalePrice: Price * 0.5, OnSale: true }
)
```

### Timestamp Updates

```powerfx
// Update modified timestamp
UpdateIf( Records,
    ID = varCurrentID,
    {
        ModifiedDate: Now(),
        ModifiedBy: User().Email
    }
)
```

---

## Delegation Warning

**UpdateIf is NOT delegable**:
- Only first 500–10,000 records (the data row limit) retrieved
- May not update all matching records
- Filter to smaller set first if possible

```powerfx
// May miss records in large dataset
UpdateIf( LargeTable, Status = "Pending", { ... } )

// Better: use Power Automate for large bulk updates
```

---

## Collections vs Data Sources

### Collections

```powerfx
// Works immediately in memory
UpdateIf( colItems, ID = 1, { Name: "New" } )
```

### Data Sources

```powerfx
// Network operation - may take time
UpdateIf( SharePointList, ID = 1, { Name: "New" } )

// Consider Patch for single record updates
Patch( SharePointList,
    LookUp( SharePointList, ID = 1 ),
    { Name: "New" }
)
```

---

## Common Mistakes

```powerfx
// BAD: Using Update when you want partial update
Update( Products, OldRecord, { Name: "New" } )
// All other fields become Blank!

// GOOD: Use UpdateIf or Patch for partial updates
UpdateIf( Products, ID = OldRecord.ID, { Name: "New" } )
Patch( Products, OldRecord, { Name: "New" } )

// BAD: Forgetting UpdateIf updates ALL matching
UpdateIf( Products, true, { Price: 0 } )
// Updates EVERY record!

// GOOD: Be specific with conditions
UpdateIf( Products, ID = varSelectedID, { Price: 0 } )
```

---

## Return Value

Both functions return the modified data source as a table.

---

## Sources

- [Microsoft Learn: Update and UpdateIf](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-update-updateif)
