# Data Source Functions

Functions for managing, querying, and validating data sources.

---

## Overview

| Function | Description |
|----------|-------------|
| `Refresh` | Reload data from data source |
| `Defaults` | Get default values for new record |
| `Errors` | Get errors from data operations |
| `DataSourceInfo` | Get data source metadata |
| `Choices` | Get lookup column options |
| `Validate` | Validate values before submitting |

---

## Refresh Function

Retrieves fresh data from a data source to see changes by other users.

### Syntax

```powerfx
Refresh( DataSource )
```

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| DataSource | Yes | Data source to refresh |

### Return Value

None - used for side effect only.

### Examples

```powerfx
// Refresh a SharePoint list
Refresh( MySharePointList )

// Refresh button
Button.OnSelect = Refresh( Customers )

// Refresh after edit
Patch( Products, Record, { Price: NewPrice } );
Refresh( Products )
```

### Key Notes

- **Behavior formula only** - Cannot use in calculated properties
- Updates all controls bound to that data source
- Essential for multi-user scenarios

---

## Defaults Function

Returns default values for a data source, typically for new records.

### Syntax

```powerfx
Defaults( DataSource )
```

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| DataSource | Yes | Data source to get defaults from |

### Return Value

Record with default column values.

### Examples

```powerfx
// Create new record with defaults
Patch( Products, Defaults( Products ), { Name: "New Product" } )

// Use in form context
EditForm1.DefaultMode = FormMode.New;
EditForm1.Item = Defaults( MyDataSource )
```

### Key Notes

- Columns without defaults won't be in returned record
- Collections return empty record (no defaults)
- Often combined with `Patch` to create new records

---

## Errors Function

Returns error information from data operations.

### Syntax

```powerfx
Errors( DataSource [, Record ] )
```

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| DataSource | Yes | Data source to check for errors |
| Record | No | Specific record to check (optional) |

### Return Value

Table with columns:

| Column | Description |
|--------|-------------|
| Record | Record that had error |
| Column | Column that caused error |
| Message | Human-readable error message |
| Error | ErrorKind value |

### ErrorKind Values

| ErrorKind | Description |
|-----------|-------------|
| `ErrorKind.Conflict` | Another user changed the record |
| `ErrorKind.ConstraintViolation` | Constraint violated |
| `ErrorKind.CreatePermission` | No create permission |
| `ErrorKind.DeletePermission` | No delete permission |
| `ErrorKind.EditPermission` | No edit permission |
| `ErrorKind.GeneratedValue` | Tried to change auto-generated column |
| `ErrorKind.MissingRequired` | Required value missing |
| `ErrorKind.NotFound` | Record not found |
| `ErrorKind.ReadOnlyValue` | Tried to change read-only column |
| `ErrorKind.Sync` | Data source reported error |
| `ErrorKind.Validation` | Validation failed |
| `ErrorKind.None` | No error |
| `ErrorKind.Unknown` | Unknown error |

### Examples

```powerfx
// Display first error message
First( Errors( MyDataSource, EditRecord ) ).Message

// Check if any errors exist
IsEmpty( Errors( MyDataSource ) )

// Check for specific error type
!IsEmpty(
    Filter(
        Errors( MyDataSource, Record ),
        Error = ErrorKind.Conflict
    )
)

// Show error in label
If(
    !IsEmpty( Errors( Products, varRecord ) ),
    First( Errors( Products, varRecord ) ).Message,
    "No errors"
)
```

### Key Notes

- Returns empty table if no errors
- Errors cleared by next data operation
- Works with Patch, Collect, Remove, Update, SubmitForm

---

## DataSourceInfo Function

Returns metadata about a data source.

### Syntax

```powerfx
DataSourceInfo( DataSource, Information [, ColumnName ] )
```

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| DataSource | Yes | Data source to query |
| Information | Yes | Type of information to get |
| ColumnName | No | Column name (for column-level info) |

### Column-Level Information

| Information | Returns | Description |
|-------------|---------|-------------|
| `DataSourceInfo.DisplayName` | Text | Display name of column |
| `DataSourceInfo.MaxLength` | Number | Max characters for text |
| `DataSourceInfo.MaxValue` | Number | Maximum numeric value |
| `DataSourceInfo.MinValue` | Number | Minimum numeric value |
| `DataSourceInfo.Required` | Boolean | Is field required |

### Data Source-Level Information

| Information | Returns | Description |
|-------------|---------|-------------|
| `DataSourceInfo.CreatePermission` | Boolean | Can user create records |
| `DataSourceInfo.DeletePermission` | Boolean | Can user delete records |
| `DataSourceInfo.EditPermission` | Boolean | Can user edit records |
| `DataSourceInfo.ReadPermission` | Boolean | Can user read records |

### Examples

```powerfx
// Check if field is required
DataSourceInfo( Products, DataSourceInfo.Required, Name )

// Get max length for validation
DataSourceInfo( Customers, DataSourceInfo.MaxLength, Email )

// Hide button if no permission
Visible = DataSourceInfo( Orders, DataSourceInfo.CreatePermission )

// Show character limit
"Max: " & DataSourceInfo( Notes, DataSourceInfo.MaxLength, Content ) & " characters"
```

### Key Notes

- Collections provide no information
- Returns default or blank if info not available
- Permissions only fully supported with Dataverse

---

## Choices Function

Returns possible values for a lookup column.

### Syntax

```powerfx
Choices( ColumnReference [, TextFilter ] )
```

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| ColumnReference | Yes | Lookup column reference (e.g., `Table.Column`) |
| TextFilter | No | Filter to choices starting with text |

### Return Value

Table of all possible values including all columns from related table.

### Examples

```powerfx
// Get all choices for lookup column
Choices( Accounts.'Primary Contact' )

// Filter choices starting with "A"
Choices( Accounts.'Primary Contact', "A" )

// Use in Combo box Items property
Choices( Orders.Status )

// Sort choices
Sort( Choices( Products.Category ), Value )
```

### Key Notes

- **Not delegable** - Consider using data source directly for large tables
- Column reference must be direct (not through function/control)
- Commonly used with dropdown and combo box controls

---

## Validate Function

Validates values against data source constraints.

### Syntax

```powerfx
// Single column
Validate( DataSource, Column, Value )

// Complete record
Validate( DataSource, OriginalRecord, Updates )
```

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| DataSource | Yes | Data source to validate against |
| Column | Yes | Column to validate (single column) |
| Value | Yes | Value to validate |
| OriginalRecord | Yes | Record being updated |
| Updates | Yes | Changes to validate |

### Return Value

- **Blank** if valid
- **Error message** if invalid

### Examples

```powerfx
// Validate single value
Validate( Scores, Percentage, 150 )
// Returns: "Values must be between 0 and 100."

// Validate before submit
If(
    IsBlank( Validate( Products, Record, Updates ) ),
    Patch( Products, Record, Updates ),
    Notify( "Validation failed", NotificationType.Error )
)

// Show validation error
If(
    !IsBlank( Validate( MyData, Column, txtInput.Text ) ),
    Validate( MyData, Column, txtInput.Text )
)
```

### Key Notes

- Only validates based on info data source provides
- Even if valid, submission may fail for other reasons
- Collections always validate as valid (no constraints)

---

## Common Patterns

### Create New Record with Defaults

```powerfx
Patch(
    Products,
    Defaults( Products ),
    {
        Name: txtName.Text,
        Price: Value( txtPrice.Text )
    }
)
```

### Validate Before Submit

```powerfx
If(
    IsBlank( Validate( DataSource, Record, Updates ) ),
    Patch( DataSource, Record, Updates );
    Notify( "Saved successfully", NotificationType.Success ),
    Notify( Validate( DataSource, Record, Updates ), NotificationType.Error )
)
```

### Handle Errors After Submit

```powerfx
Patch( Orders, Record, Updates );
If(
    !IsEmpty( Errors( Orders, Record ) ),
    Notify(
        First( Errors( Orders, Record ) ).Message,
        NotificationType.Error
    )
)
```

### Permission-Based UI

```powerfx
// Button Visible property
Visible = DataSourceInfo( Products, DataSourceInfo.CreatePermission )

// Button DisplayMode property
DisplayMode = If(
    DataSourceInfo( Products, DataSourceInfo.EditPermission ),
    DisplayMode.Edit,
    DisplayMode.Disabled
)
```

### Refresh After Change

```powerfx
SubmitForm( EditForm1 );
Refresh( MyDataSource );
Navigate( ListScreen )
```

---

## Sources

- [Microsoft Learn: Refresh](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-refresh)
- [Microsoft Learn: Defaults](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-defaults)
- [Microsoft Learn: Errors](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-errors)
- [Microsoft Learn: DataSourceInfo](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-datasourceinfo)
- [Microsoft Learn: Choices](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-choices)
- [Microsoft Learn: Validate](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-validate)
