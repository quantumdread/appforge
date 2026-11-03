# Patch Function

Creates or modifies records in a data source, or merges records outside a data source.

## Syntax

### Single Record - Modify

```powerfx
Patch( DataSource, BaseRecord, ChangeRecord1 [, ChangeRecord2, ... ] )
```

### Single Record - Create

```powerfx
Patch( DataSource, Defaults( DataSource ), ChangeRecord )
```

### Multiple Records - Batch

```powerfx
Patch( DataSource, BaseRecordsTable, ChangeRecordTable )
```

### Merge Records (No Data Source)

```powerfx
Patch( Record1, Record2 [, ... ] )
```

## Parameters

| Parameter | Required | Type | Description |
|-----------|----------|------|-------------|
| DataSource | Yes | Data source | Target data source |
| BaseRecord | Yes | Record | Record to modify (from data source) or `Defaults()` for new |
| ChangeRecord | Yes | Record | Properties to change/set |
| BaseRecordsTable | Yes | Table | Table of records to modify |
| ChangeRecordTable | Yes | Table | Table of changes (matched by position) |

## Return Type

- Single record operations: The modified/created record
- Batch operations: Table of modified/created records

## Rules

1. **Partial updates**: Only specified fields are modified; others unchanged
2. **Defaults() for new**: Use `Defaults( DataSource )` as BaseRecord to create new records
3. **Later values win**: When multiple ChangeRecords provided, later values override earlier
4. **Primary key required**: For modifications, BaseRecord must contain the primary key
5. **No related fields**: Return value doesn't include related table fields

## Creating Records

```powerfx
// Basic create
Patch(
    Customers,
    Defaults( Customers ),
    { Name: "Contoso", Email: "info@contoso.com" }
)

// Create and capture result
Set(
    varNewCustomer,
    Patch(
        Customers,
        Defaults( Customers ),
        {
            Name: TextInput1.Text,
            Email: TextInput2.Text,
            CreatedDate: Now()
        }
    )
)

// Create with lookup reference
Patch(
    Orders,
    Defaults( Orders ),
    {
        CustomerID: varSelectedCustomer.ID,
        OrderDate: Today(),
        Status: "Pending"
    }
)
```

## Modifying Records

```powerfx
// Modify by lookup
Patch(
    Customers,
    LookUp( Customers, ID = varCustomerID ),
    { Phone: "555-1234" }
)

// Modify current gallery item
Patch(
    Products,
    ThisItem,
    { Quantity: ThisItem.Quantity - 1 }
)

// Modify with multiple changes
Patch(
    Orders,
    Gallery1.Selected,
    {
        Status: "Shipped",
        ShippedDate: Now(),
        ModifiedBy: User().Email
    }
)
```

## Batch Operations

```powerfx
// Update multiple records
Patch(
    Products,
    Filter( Products, Category = "Clearance" ),
    { OnSale: true, Discount: 0.25 }
)

// Create multiple records from collection
Patch(
    Inventory,
    colNewItems
)

// Batch with calculated values
ForAll(
    colItemsToUpdate,
    Patch(
        Products,
        LookUp( Products, ID = ThisRecord.ProductID ),
        { Stock: ThisRecord.NewStock }
    )
)
```

## Merging Records (No Data Source)

```powerfx
// Merge two records
Patch(
    { Name: "Contoso", City: "Seattle" },
    { Name: "Contoso Corp", State: "WA" }
)
// Result: { Name: "Contoso Corp", City: "Seattle", State: "WA" }

// Build record from multiple sources
Patch(
    varBaseSettings,
    varUserOverrides,
    { LastModified: Now() }
)
```

## Error Handling

```powerfx
// Check for errors after Patch
Set( varResult, Patch( Customers, Defaults(Customers), { Name: TextInput1.Text } ) );
If(
    IsError( varResult ),
    Notify( "Failed to save", NotificationType.Error ),
    Notify( "Saved successfully", NotificationType.Success )
)

// Using IfError
IfError(
    Patch( Orders, ThisItem, { Status: "Complete" } ),
    Notify( "Update failed: " & FirstError.Message, NotificationType.Error )
)

// Check Errors() function for details
If(
    !IsEmpty( Errors( Customers ) ),
    Notify( First( Errors( Customers ) ).Message )
)
```

## Common Patterns

### Toggle Boolean Field

```powerfx
Patch( Tasks, ThisItem, { IsComplete: !ThisItem.IsComplete } )
```

### Increment Counter

```powerfx
Patch( Products, ThisItem, { ViewCount: ThisItem.ViewCount + 1 } )
```

### Update with Form Values

```powerfx
Patch(
    Contacts,
    EditForm1.LastSubmit,
    {
        ModifiedDate: Now(),
        ModifiedBy: User().Email
    }
)
```

### Conditional Field Update

```powerfx
Patch(
    Orders,
    ThisItem,
    If(
        varNewStatus = "Shipped",
        { Status: varNewStatus, ShippedDate: Now() },
        { Status: varNewStatus }
    )
)
```

## Common Mistakes

```powerfx
// BAD: Missing Defaults() for new record
Patch( Customers, { Name: "Test" } )

// GOOD: Use Defaults() to create
Patch( Customers, Defaults( Customers ), { Name: "Test" } )

// BAD: Using wrong data source with Defaults
Patch( Orders, Defaults( Customers ), { ... } )

// GOOD: Match data sources
Patch( Orders, Defaults( Orders ), { ... } )

// BAD: Expecting related data in return
Set( varOrder, Patch( Orders, Defaults(Orders), { CustomerID: 1 } ) );
varOrder.Customer.Name  // Won't work!

// GOOD: LookUp related data separately
LookUp( Customers, ID = varOrder.CustomerID, Name )
```

## Related Functions

| Function | Use Case |
|----------|----------|
| `Update` | Replace entire record (all fields) |
| `UpdateIf` | Modify multiple records by condition |
| `Collect` | Add records to collection |
| `Remove` | Delete records |
| `SubmitForm` | Save form data (simpler for forms) |

---

## Sources

- [Microsoft Learn: Patch function](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-patch)
