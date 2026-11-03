# Table Shaping Functions

Functions to reshape tables by adding, removing, renaming, or selecting columns.

**Key Point**: These functions return NEW tables - they don't modify the original.

> **Syntax Update (v3.24042+):** Column names are now **unquoted identifiers**, not strings. Old apps with quoted names were auto-updated.

---

## AddColumns

Adds calculated columns to a table.

### Syntax

```powerfx
AddColumns( Table, ColumnName1, Formula1 [, ColumnName2, Formula2, ... ] )
```

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| Table | Yes | Table to add columns to |
| ColumnName | Yes | Name of new column (unquoted identifier) |
| Formula | Yes | Formula evaluated for each record |

### Examples

```powerfx
// Add calculated column
AddColumns( Products, Total, Price * Quantity )

// Add multiple columns
AddColumns( Orders,
    Subtotal, Quantity * UnitPrice,
    Tax, Quantity * UnitPrice * 0.08,
    Total, Quantity * UnitPrice * 1.08
)

// Add lookup column
AddColumns( Orders,
    CustomerName, LookUp( Customers, ID = CustomerID, Name )
)

// Add formatted column
AddColumns( Users,
    FullName, FirstName & " " & LastName,
    DisplayDate, Text( CreatedDate, "mmm dd, yyyy" )
)
```

---

## DropColumns

Removes specified columns from a table.

### Syntax

```powerfx
DropColumns( Table, ColumnName1 [, ColumnName2, ... ] )
```

### Examples

```powerfx
// Remove single column
DropColumns( Users, Password )

// Remove multiple columns
DropColumns( Records, InternalID, CreatedBy, ModifiedBy )

// Chain with other operations
DropColumns(
    Filter( Products, Category = "Electronics" ),
    InternalSKU, CostPrice
)
```

---

## ShowColumns

Keeps only specified columns, drops all others.

### Syntax

```powerfx
ShowColumns( Table, ColumnName1 [, ColumnName2, ... ] )
```

### Examples

```powerfx
// Select single column (creates single-column table)
ShowColumns( Users, Email )

// Select multiple columns
ShowColumns( Products, Name, Price, Category )

// For dropdowns - show display and value columns
ShowColumns( Categories, Name, ID )
```

---

## RenameColumns

Renames columns in a table.

### Syntax

```powerfx
RenameColumns( Table, OldName1, NewName1 [, OldName2, NewName2, ... ] )
```

### Examples

```powerfx
// Rename single column
RenameColumns( Products, UnitPrice, Price )

// Rename multiple columns
RenameColumns( Data,
    col1, FirstName,
    col2, LastName,
    col3, Email
)

// SharePoint columns with spaces (use single quotes)
RenameColumns( SPList, 'First Name', FirstName )
```

---

## Chaining Functions

Combine shaping functions for complex transformations:

```powerfx
// Add, rename, then drop
DropColumns(
    RenameColumns(
        AddColumns( Sales,
            Revenue, Quantity * UnitPrice
        ),
        UnitPrice, Price
    ),
    InternalCode
)

// Using With for readability
With(
    { enhanced: AddColumns( Products, Margin, Price - Cost ) },
    ShowColumns( enhanced, Name, Price, Margin )
)
```

---

## Common Patterns

### Prepare Data for Gallery

```powerfx
AddColumns(
    ShowColumns( Orders, ID, CustomerID, Total, Date ),
    CustomerName, LookUp( Customers, ID = CustomerID, Name ),
    FormattedDate, Text( Date, "mmm dd" )
)
```

### Create Summary Table

```powerfx
AddColumns(
    Distinct( Orders, CustomerID ),
    CustomerName, LookUp( Customers, ID = Result, Name ),
    OrderCount, CountIf( Orders, CustomerID = Result ),
    TotalSpent, Sum( Filter( Orders, CustomerID = Result ), Total )
)
```

### Flatten Related Data

```powerfx
AddColumns( Orders,
    ProductName, LookUp( Products, ID = ProductID, Name ),
    CategoryName, LookUp( Categories, ID = LookUp( Products, ID = ProductID, CategoryID ), Name )
)
```

### Rename for API Compatibility

```powerfx
RenameColumns(
    ShowColumns( FormData, txtName, txtEmail, ddlCountry ),
    txtName, name,
    txtEmail, email,
    ddlCountry, country
)
```

---

## Delegation Notes

- Arguments (source table) can be delegated
- Output is limited to non-delegation limit (~500–10,000 records, per the data row limit)
- Filter before shaping for large datasets

```powerfx
// GOOD: Filter first (delegable), then shape
AddColumns(
    Filter( LargeTable, Status = "Active" ),
    "Calculated", Field1 + Field2
)
```

---

## Sources

- [Microsoft Learn: Table shaping functions](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-table-shaping)
