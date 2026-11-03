# Boolean Operators - And, Or, Not, IsNumeric

## And Function

### Syntax

```powerfx
And( LogicalFormula1, LogicalFormula2 [, LogicalFormula3, ... ] )

// Alternative operators:
LogicalFormula1 && LogicalFormula2        // JavaScript syntax
LogicalFormula1 And LogicalFormula2       // Visual Basic syntax
```

### Parameters

| Parameter | Required | Type | Description |
|-----------|----------|------|-------------|
| LogicalFormula | Yes | Boolean | One or more logical formulas to evaluate |

### Return Value

| Type | Description |
|------|-------------|
| Boolean | Returns `true` if **all** arguments are `true`, otherwise returns `false` |

### Rules

1. **All must be true**: Returns `true` only when all logical formulas evaluate to `true`
2. **Boolean arguments only**: Cannot pass numbers or strings directly; must use comparisons (e.g., `x > 1`)
3. **Multiple arguments**: Can accept any number of logical formulas as arguments
4. **Operator alternatives**: Use `&&` (JavaScript) or `And` (Visual Basic) between two conditions
5. **Short-circuit evaluation**: Evaluation stops at first `false` argument (performance optimization)

### Examples

```powerfx
// Basic usage
And( true, true )          // true
And( true, false )         // false
And( false, false )        // false

// With variables (given a = false, b = true)
And( a, b )                // false
a && b                     // false (JavaScript syntax)
a And b                    // false (Visual Basic syntax)

// Multiple conditions
And( x > 0, x < 100, y > 0, y < 100 )    // true if x and y both between 0-100

// Common validation pattern
And( Not(IsBlank(FirstName.Text)), Not(IsBlank(LastName.Text)), Not(IsBlank(Email.Text)) )

// String validation
And( Len(Password.Text) >= 8, Len(Password.Text) <= 20, Not(IsBlank(Password.Text)) )

// Form validation with multiple controls
And(
    Len(NameInput.Text) > 0,
    IsMatch(EmailInput.Text, Email),
    AgeInput.Value >= 18
)

// Range checking
And( Temperature > 0, Temperature < 100 )    // Between 0 and 100
x > 0 && x < 100                             // Shorthand syntax
```

### Common Patterns

```powerfx
// Enable submit button when all required fields filled
Button.DisplayMode = If(
    And(
        Not(IsBlank(Name.Text)),
        Not(IsBlank(Email.Text)),
        Not(IsBlank(Phone.Text))
    ),
    DisplayMode.Edit,
    DisplayMode.Disabled
)

// Visibility based on multiple conditions
Gallery.Visible = And(
    varShowGallery,
    CountRows(DataSource) > 0,
    Not(IsBlank(SearchBox.Text))
)

// Complex business rule validation
And(
    User().Email in AllowedUsers.Email,
    Status.Value = "Approved",
    Budget >= TotalCost
)
```

### Common Mistakes

```powerfx
// BAD: Passing non-boolean values directly
And( 5, 10 )                    // Error: arguments must be boolean

// GOOD: Use comparison operators
And( x = 5, y = 10 )

// BAD: Too many nested Ands (hard to read)
And( And( And( a, b ), c ), d )

// GOOD: Flatten to single And
And( a, b, c, d )
```

---

## Or Function

### Syntax

```powerfx
Or( LogicalFormula1, LogicalFormula2 [, LogicalFormula3, ... ] )

// Alternative operators:
LogicalFormula1 || LogicalFormula2        // JavaScript syntax
LogicalFormula1 Or LogicalFormula2        // Visual Basic syntax
```

### Parameters

| Parameter | Required | Type | Description |
|-----------|----------|------|-------------|
| LogicalFormula | Yes | Boolean | One or more logical formulas to evaluate |

### Return Value

| Type | Description |
|------|-------------|
| Boolean | Returns `true` if **any** argument is `true`, otherwise returns `false` |

### Rules

1. **Any can be true**: Returns `true` when at least one logical formula evaluates to `true`
2. **Boolean arguments only**: Cannot pass numbers or strings directly; must use comparisons
3. **Multiple arguments**: Can accept any number of logical formulas as arguments
4. **Operator alternatives**: Use `||` (JavaScript) or `Or` (Visual Basic) between two conditions
5. **Short-circuit evaluation**: Evaluation stops at first `true` argument (performance optimization)

### Examples

```powerfx
// Basic usage
Or( true, false )          // true
Or( false, false )         // false
Or( true, true )           // true

// With variables (given a = false, b = true, x = 10, y = 100)
Or( a, b )                 // true
a || b                     // true (JavaScript syntax)
a Or b                     // true (Visual Basic syntax)

// Multiple conditions
Or( x > 100, y < 50, z = 0 )    // true if any condition is true

// Permission checking
Or(
    User().Email = "admin@company.com",
    User().Email in Administrators.Email,
    varUserRole = "Admin"
)

// Status validation
Or(
    Status = "Approved",
    Status = "Pending Approval",
    Status = "In Review"
)

// Search across multiple fields
Or(
    SearchTerm in Title,
    SearchTerm in Description,
    SearchTerm in Tags
)
```

### Common Patterns

```powerfx
// Show warning if any validation fails
WarningLabel.Visible = Or(
    IsBlank(Name.Text),
    Not(IsMatch(Email.Text, Email)),
    Age.Value < 18
)

// Allow access to multiple user roles
ScreenAccess.Visible = Or(
    varUserRole = "Admin",
    varUserRole = "Manager",
    varUserRole = "Supervisor"
)

// Filter by multiple status values
Filter(
    Orders,
    Or(
        Status = "Open",
        Status = "In Progress",
        Status = "Pending"
    )
)

// Emergency override conditions
AllowAction = Or(
    varIsEmergency,
    varIsOverride,
    User().Email in EmergencyContacts.Email
)
```

### Common Mistakes

```powerfx
// BAD: Using Or when all conditions must be true
Or( FirstName.Text <> "", LastName.Text <> "" )    // Wrong for "both required"

// GOOD: Use And for "all required"
And( FirstName.Text <> "", LastName.Text <> "" )

// BAD: Combining too many unrelated conditions (hard to read)
Or( cond1, cond2, cond3, cond4, cond5, cond6, cond7 )

// GOOD: Break into logical groups or use table lookup
User().Email in AllowedUsers.Email
```

---

## Not Function

### Syntax

```powerfx
Not( LogicalFormula )

// Alternative operators:
! LogicalFormula                          // JavaScript syntax
Not LogicalFormula                        // Visual Basic syntax
```

### Parameters

| Parameter | Required | Type | Description |
|-----------|----------|------|-------------|
| LogicalFormula | Yes | Boolean | Logical formula to negate |

### Return Value

| Type | Description |
|------|-------------|
| Boolean | Returns `true` if argument is `false`, returns `false` if argument is `true` |

### Rules

1. **Negation operator**: Inverts the boolean value of the argument
2. **Single argument**: Takes exactly one logical formula
3. **Boolean only**: Argument must evaluate to a boolean value
4. **Operator alternatives**: Use `!` (JavaScript) or `Not` (Visual Basic) prefix

### Examples

```powerfx
// Basic usage (given a = false)
Not( a )                   // true
Not a                      // true (Visual Basic syntax)
! a                        // true (JavaScript syntax)
Not( true )                // false
Not( false )               // true

// Common validation patterns
Not( IsBlank(Name.Text) )                    // Name is NOT blank
!IsBlank(Email.Text)                         // Email is NOT blank

// Double negation (avoid this pattern)
Not( Not( IsBlank(x) ) )                     // Same as IsBlank(x)

// Combined with other operators
And( Not(IsBlank(Name.Text)), Len(Name.Text) > 2 )

// Visibility toggle
Gallery.Visible = Not( varHideGallery )

// Disable button when form is NOT valid
SubmitButton.DisplayMode = If(
    Not( And(
        Not(IsBlank(Name.Text)),
        IsMatch(Email.Text, Email)
    )),
    DisplayMode.Disabled,
    DisplayMode.Edit
)

// Filter excluding specific values
Filter( Products, Not(Category = "Discontinued") )

// Check if user is NOT in a specific group
Not( User().Email in RestrictedUsers.Email )
```

### Common Patterns

```powerfx
// Enable save button when form is valid (not invalid)
SaveButton.DisplayMode = If(
    Not(Or(
        IsBlank(FirstName.Text),
        IsBlank(LastName.Text),
        Not(IsMatch(Email.Text, Email))
    )),
    DisplayMode.Edit,
    DisplayMode.Disabled
)

// Show error when validation fails
ErrorLabel.Visible = Not( FormValid )

// Invert boolean variable
Set( varShowPanel, Not(varShowPanel) )    // Toggle

// Filter out completed items
Filter( Tasks, Not(Status = "Completed") )

// Hide when condition is true
Panel.Visible = Not( varIsPanelHidden )

// Check if NOT empty
If( Not(IsEmpty(MyCollection)), Navigate(ResultsScreen) )
```

### Common Mistakes

```powerfx
// BAD: Double negation (confusing)
Not( Not( IsBlank(x) ) )

// GOOD: Use the direct boolean
IsBlank(x)

// BAD: Complex nested Not statements
Not( Or( Not(a), Not(b) ) )

// GOOD: Apply De Morgan's Law or simplify
And( a, b )

// BAD: Using Not when direct comparison is clearer
Not( Status = "Active" )

// GOOD: Use not-equal operator
Status <> "Active"
```

---

## IsNumeric Function

### Syntax

```powerfx
IsNumeric( Value )
```

### Parameters

| Parameter | Required | Type | Description |
|-----------|----------|------|-------------|
| Value | Yes | Any | The value to test for numeric type |

### Return Value

| Type | Description |
|------|-------------|
| Boolean | Returns `true` if the value is numeric, `false` otherwise |

### Rules

1. **Type testing**: Tests whether a value is of numeric type
2. **String conversion**: Text representations of numbers (e.g., `"1"`) return `true`
3. **Expression evaluation**: Mathematical expressions evaluate to their result type
4. **Other types return false**: Boolean, string, table, record types return `false` (unless string is numeric)

### Examples

```powerfx
// Numeric literals
IsNumeric( 1 )                  // true
IsNumeric( 3.14 )               // true
IsNumeric( -42 )                // true
IsNumeric( 0 )                  // true

// String representations of numbers
IsNumeric( "1" )                // true
IsNumeric( "123" )              // true
IsNumeric( "3.14" )             // true
IsNumeric( "-42" )              // true

// Non-numeric strings
IsNumeric( "A" )                // false
IsNumeric( "Hello" )            // false
IsNumeric( "ABC123" )           // false

// Mathematical expressions
IsNumeric( 1 + 1 )              // true (evaluates to 2)
IsNumeric( "1+1" )              // false (text string)
IsNumeric( 10 * 5 )             // true (evaluates to 50)

// User input validation
IsNumeric( TextInput1.Text )    // true if user entered a number
IsNumeric( Slider1.Value )      // true (slider always returns number)

// Control values
IsNumeric( DatePicker1.SelectedDate )    // false (Date type)
IsNumeric( Toggle1.Value )               // false (Boolean type)
```

### Common Patterns

```powerfx
// Validate numeric input before processing
If(
    IsNumeric( AgeInput.Text ),
    Set( varAge, Value(AgeInput.Text) ),
    Notify( "Please enter a valid number", NotificationType.Error )
)

// Enable submit button only for numeric input
SubmitButton.DisplayMode = If(
    IsNumeric( QuantityInput.Text ),
    DisplayMode.Edit,
    DisplayMode.Disabled
)

// Conditional conversion
If(
    IsNumeric( UserInput.Text ),
    Value( UserInput.Text ) * 1.1,    // Apply 10% increase
    0                                  // Default to 0 if not numeric
)

// Filter collection by numeric values
Filter(
    ImportedData,
    IsNumeric( Amount )
)

// Validation with error message
ErrorLabel.Visible = And(
    Not(IsBlank(PriceInput.Text)),
    Not(IsNumeric(PriceInput.Text))
)
ErrorLabel.Text = "Price must be a number"

// Complex validation
If(
    And(
        IsNumeric( QuantityInput.Text ),
        Value( QuantityInput.Text ) > 0,
        Value( QuantityInput.Text ) <= 1000
    ),
    // Process order
    Patch( Orders, Defaults(Orders), { Quantity: Value(QuantityInput.Text) } ),
    // Show error
    Notify( "Quantity must be a number between 1 and 1000" )
)

// Safe numeric conversion
Coalesce(
    If( IsNumeric(TextInput.Text), Value(TextInput.Text) ),
    0    // Default value if not numeric
)
```

### Common Mistakes

```powerfx
// BAD: Not checking before conversion
Set( varTotal, Value(UserInput.Text) )    // May error if not numeric

// GOOD: Validate first
If(
    IsNumeric( UserInput.Text ),
    Set( varTotal, Value(UserInput.Text) ),
    Set( varTotal, 0 )
)

// BAD: Assuming numeric strings are numbers
TextInput.Text + 5    // "105" if TextInput.Text = "10" (string concatenation)

// GOOD: Convert explicitly
If( IsNumeric(TextInput.Text), Value(TextInput.Text) + 5 )    // 15

// BAD: Forgetting edge cases
IsNumeric( "" )                  // false (empty string)
IsNumeric( Blank() )             // false

// GOOD: Handle blanks explicitly
If(
    And( Not(IsBlank(Input.Text)), IsNumeric(Input.Text) ),
    Value(Input.Text),
    0
)
```

### Validation Scenarios

```powerfx
// Phone number validation (check if all digits)
If(
    And(
        Len(PhoneInput.Text) = 10,
        IsNumeric(PhoneInput.Text)
    ),
    "Valid phone number",
    "Invalid format"
)

// ZIP code validation
If(
    And(
        Len(ZipInput.Text) = 5,
        IsNumeric(ZipInput.Text)
    ),
    "Valid ZIP code",
    "ZIP must be 5 digits"
)

// Age validation
If(
    And(
        IsNumeric(AgeInput.Text),
        Value(AgeInput.Text) >= 0,
        Value(AgeInput.Text) <= 120
    ),
    true,
    false
)

// Currency amount validation
If(
    And(
        IsNumeric(AmountInput.Text),
        Value(AmountInput.Text) > 0,
        Len(Right(AmountInput.Text, Len(AmountInput.Text) - Find(".", AmountInput.Text))) <= 2
    ),
    "Valid amount",
    "Invalid currency format"
)
```

---

## Combining Operators

### Complex Logical Expressions

```powerfx
// Multiple And/Or combinations
And(
    Or( Status = "Active", Status = "Pending" ),
    Or( Priority = "High", Priority = "Critical" ),
    Not( IsBlank(AssignedTo) )
)

// Form validation with all operators
FormIsValid = And(
    Not(IsBlank(Name.Text)),
    Or(
        IsMatch(Email.Text, Email),
        IsMatch(Phone.Text, "\\d{10}")
    ),
    IsNumeric(Age.Text),
    Value(Age.Text) >= 18
)

// Access control
UserHasAccess = Or(
    User().Email = "admin@company.com",
    And(
        User().Email in Managers.Email,
        Department = "IT"
    ),
    And(
        IsNumeric(EmployeeID.Text),
        Value(EmployeeID.Text) < 1000
    )
)
```

### De Morgan's Laws

```powerfx
// These are equivalent:
Not( And(a, b) )    =    Or( Not(a), Not(b) )
Not( Or(a, b) )     =    And( Not(a), Not(b) )

// Example - Simplification
// Instead of:
Not( Or( Status = "Closed", Status = "Cancelled" ) )

// Consider:
And( Status <> "Closed", Status <> "Cancelled" )
```

### Best Practices

1. **Use parentheses** for clarity in complex expressions
2. **Prefer operator syntax** (`&&`, `||`, `!`) for simple expressions
3. **Use function syntax** (`And`, `Or`, `Not`) for multiple arguments or clarity
4. **Validate input types** before using `Value()` conversion
5. **Keep expressions readable** - break complex logic into named formulas

```powerfx
// Named Formulas for clarity (in App.Formulas)
IsValidEmail = IsMatch( EmailInput.Text, Email );
IsValidAge = And( IsNumeric(AgeInput.Text), Value(AgeInput.Text) >= 18 );
FormIsComplete = And( IsValidEmail, IsValidAge, Not(IsBlank(NameInput.Text)) );

// Then use in controls
SubmitButton.DisplayMode = If( FormIsComplete, DisplayMode.Edit, DisplayMode.Disabled )
```

---

## Comparison with Excel

These functions work identically to their Excel counterparts:

| Power Fx | Excel | Description |
|----------|-------|-------------|
| `And(a, b, c)` | `AND(A1, B1, C1)` | All must be true |
| `Or(a, b, c)` | `OR(A1, B1, C1)` | Any can be true |
| `Not(a)` | `NOT(A1)` | Inverts boolean |
| `IsNumeric(a)` | `ISNUMBER(A1)` | Tests for numeric type |

---

## Performance Considerations

1. **Short-circuit evaluation**: `And` stops at first `false`, `Or` stops at first `true`
2. **Order matters**: Place most likely condition first for `Or`, least likely first for `And`
3. **Delegation**: Boolean operators are delegable when used with delegable data source operations

```powerfx
// GOOD: Cheap check first (short-circuits if false)
And( varCacheEnabled, CountRows(LargeDataSource) > 0 )

// GOOD: Common case first (short-circuits if true)
Or( varIsAdmin, User().Email in Admins.Email )
```

---

## Sources

- [And, Or, and Not functions - Microsoft Learn](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-logicals)
- [IsNumeric function - Microsoft Learn](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-isnumeric)
- [Operators and Identifiers - Microsoft Learn](https://learn.microsoft.com/en-us/power-platform/power-fx/operators)
- [Formula reference - Canvas apps - Microsoft Learn](https://learn.microsoft.com/en-us/power-platform/power-fx/formula-reference-canvas-apps)
