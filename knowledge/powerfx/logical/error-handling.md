# Error Handling Functions

IfError, IsError, IsBlankOrError, Error - Functions for detecting and handling errors.

---

## IfError Function

Tests for errors and provides replacement values.

### Syntax

```powerfx
IfError( Value1, Replacement1 [, Value2, Replacement2, ... [, DefaultResult ] ] )
```

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| Value | Yes | Formula to test for errors |
| Replacement | Yes | Value/formula if Value has error |
| DefaultResult | No | Value if no errors found |

### How It Works

1. Evaluates Value1
2. If error → returns Replacement1, stops
3. If no error → evaluates Value2 (if exists)
4. Continues until error found or all values tested
5. Returns DefaultResult if no errors (or last successful value)

### Examples

```powerfx
// Simple error replacement
IfError( 1/0, 0 )                    // Returns 0 (division by zero)
IfError( Value( "abc" ), -1 )        // Returns -1 (can't convert)

// Chain operations (stops on first error)
IfError(
    Patch( Table1, ... ), Notify( "Table1 failed" ),
    Patch( Table2, ... ), Notify( "Table2 failed" ),
    Notify( "All succeeded" )
)

// With default
IfError(
    LookUp( Data, ID = varID ).Value,
    "Not found"
)
```

---

## Error Information

Inside replacement formulas, access error details:

### FirstError Record

| Field | Type | Description |
|-------|------|-------------|
| Kind | ErrorKind | Category of error |
| Message | Text | Error message |
| Source | Text | Where error originated |
| Observed | Text | Where error surfaced |
| Details | Record | Additional info |

### AllErrors Table

Table containing all error records.

### Examples

```powerfx
// Display error message
IfError(
    SomeOperation(),
    Notify( "Error: " & FirstError.Message, NotificationType.Error )
)

// Log error details
IfError(
    RiskyOperation(),
    Collect( colErrorLog, {
        Time: Now(),
        Kind: FirstError.Kind,
        Message: FirstError.Message,
        Source: FirstError.Source
    })
)

// Handle specific error types
IfError(
    1/x,
    If( FirstError.Kind = ErrorKind.Div0,
        0,  // Handle division by zero
        Error( FirstError )  // Re-throw other errors
    )
)
```

---

## ErrorKind Values

| ErrorKind | Description |
|-----------|-------------|
| `ErrorKind.Div0` | Division by zero |
| `ErrorKind.InvalidArgument` | Invalid function argument |
| `ErrorKind.NotFound` | Record not found |
| `ErrorKind.Network` | Network/connection error |
| `ErrorKind.Validation` | Validation error |
| `ErrorKind.Sync` | Synchronization error |
| `ErrorKind.Custom` | Custom error |

---

## IsError Function

Tests if a value is an error.

### Syntax

```powerfx
IsError( Value )
```

### Return Type

Boolean

### Examples

```powerfx
IsError( 1/0 )              // true
IsError( 1/1 )              // false
IsError( Value( "123" ) )   // false
IsError( Value( "abc" ) )   // true
IsError( Blank() )          // false

// Conditional logic
If( IsError( Result ), "Error occurred", "Success" )

// Filter valid results
Filter( Results, !IsError( ProcessedValue ) )
```

---

## IsBlankOrError Function

Tests for blank OR error values.

### Syntax

```powerfx
IsBlankOrError( Value )
```

### Equivalent To

```powerfx
Or( IsBlank( Value ), IsError( Value ) )
```

### Examples

```powerfx
IsBlankOrError( Blank() )         // true
IsBlankOrError( 1/0 )             // true
IsBlankOrError( "Hello" )         // false
IsBlankOrError( 0 )               // false

// Safe value check
If( IsBlankOrError( Result ), "No data", Text( Result ) )
```

---

## Error Function

Create custom errors or re-throw errors.

### Syntax

```powerfx
Error( ErrorRecord )
Error( ErrorTable )
```

### ErrorRecord Fields

| Field | Required | Description |
|-------|----------|-------------|
| Kind | Yes | ErrorKind value |
| Message | No | Error message text |

### Examples

```powerfx
// Custom validation error
If( StartDate > EndDate,
    Error( { Kind: ErrorKind.Validation, Message: "Start must be before End" } )
)

// Re-throw an error
IfError(
    Operation(),
    If( FirstError.Kind <> ErrorKind.NotFound,
        Error( FirstError )  // Re-throw non-NotFound errors
    )
)

// Throw multiple errors
Error( Filter( AllErrors, Kind <> ErrorKind.Validation ) )
```

---

## Common Patterns

### Safe Data Operations

```powerfx
// Safe LookUp
IfError(
    LookUp( DataSource, ID = varID ),
    Notify( "Record not found", NotificationType.Error );
    Blank()
)

// Safe Patch
IfError(
    Patch( DataSource, ThisItem, { Status: "Complete" } ),
    Notify( "Save failed: " & FirstError.Message, NotificationType.Error )
)
```

### Form Validation

```powerfx
// Validate before save
If(
    IsBlankOrError( txtEmail.Text ) || !IsMatch( txtEmail.Text, Match.Email ),
    Error( { Kind: ErrorKind.Validation, Message: "Valid email required" } )
);

IfError(
    SubmitForm( Form1 ),
    Notify( FirstError.Message, NotificationType.Error )
)
```

### Chain Operations with Rollback Intent

```powerfx
IfError(
    // Try first operation
    Set( varResult1, Patch( Table1, ... ) ),
    Notify( "Step 1 failed" ); false,

    // Try second operation
    Set( varResult2, Patch( Table2, ... ) ),
    Notify( "Step 2 failed" ); false,

    // All succeeded
    Notify( "Saved successfully" ); true
)
```

### Safe Type Conversion

```powerfx
// Safe number conversion
IfError( Value( txtInput.Text ), 0 )

// Safe date conversion
IfError( DateValue( txtDate.Text ), Today() )

// With user feedback
IfError(
    Value( txtPrice.Text ),
    Notify( "Please enter a valid number" ); Blank()
)
```

### Network Error Handling

```powerfx
IfError(
    MyConnector.GetData(),
    If( FirstError.Kind = ErrorKind.Network,
        Notify( "Check your internet connection", NotificationType.Warning ),
        Notify( "Error: " & FirstError.Message, NotificationType.Error )
    )
)
```

---

## Important Notes

1. **Enable Feature**: Error handling must be enabled in Settings > Updates > Retired
2. **Type Compatibility**: All return values must be same type
3. **Error Prevention**: Using `IsError` prevents error from propagating

---

## Sources

- [Microsoft Learn: IfError, IsError, IsBlankOrError, Error](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-iferror)
