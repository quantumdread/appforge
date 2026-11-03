# User Defined Functions (UDFs)

User Defined Functions allow you to create reusable, parameterized functions in Power Apps canvas apps.

> **Note**: UDFs are an experimental feature. Enable via **Settings > Upcoming features > Experimental**.

## Syntax

### Standard Function (No Side Effects)

```powerfx
FunctionName( Parameter1: Type1, Parameter2: Type2 ): ReturnType = Expression;
```

### Behavior Function (With Side Effects)

```powerfx
FunctionName( Parameter1: Type1 ): ReturnType = {
    Statement1;
    Statement2;
    ReturnExpression
};
```

Use `Void` as return type if function doesn't return a value.

---

## Basic Examples

### Simple Calculation

```powerfx
App.Formulas:
    // Add two numbers
    Add( a: Number, b: Number ): Number = a + b;

    // Calculate percentage
    Percentage( value: Number, total: Number ): Number =
        If( total = 0, 0, (value / total) * 100 );

    // Format currency
    FormatCurrency( amount: Number ): Text =
        Text( amount, "$#,##0.00" );
```

### Usage

```powerfx
Add( 5, 3 )                    // 8
Percentage( 25, 100 )          // 25
FormatCurrency( 1234.5 )       // "$1,234.50"
```

---

## Parameter Types

| Type | Description | Example |
|------|-------------|---------|
| `Text` | String values | `name: Text` |
| `Number` | Numeric values | `amount: Number` |
| `Boolean` | True/false | `isActive: Boolean` |
| `Date` | Date values | `startDate: Date` |
| `DateTime` | Date and time | `timestamp: DateTime` |
| `Time` | Time only | `duration: Time` |
| `Color` | Color values | `bgColor: Color` |
| `Record` | Single record | `item: Record` |
| `Table` | Table of records | `items: Table` |
| Custom Type | User defined | `book: BookType` |

---

## User Defined Types

Create custom types to use with UDFs:

```powerfx
App.Formulas:
    // Define types with :=
    PersonType := Type( { Name: Text, Age: Number, Email: Text } );
    AddressType := Type( { Street: Text, City: Text, Zip: Text } );

    // Use in functions
    FormatPerson( person: PersonType ): Text =
        person.Name & " (" & Text( person.Age ) & ")";

    GetFullAddress( addr: AddressType ): Text =
        addr.Street & ", " & addr.City & " " & addr.Zip;
```

### Table Types

```powerfx
App.Formulas:
    // Define table type
    BookTableType := Type( [ { Title: Text, Author: Text, Genre: Text } ] );

    // Function returning filtered table
    FilterByGenre( books: BookTableType, genre: Text ): BookTableType =
        Filter( books, Genre = genre );

    // Usage
    FictionBooks = FilterByGenre( Library, "Fiction" );
```

---

## Behavior Functions

Functions that cause side effects (Set, Collect, Notify, etc.) must use curly braces:

### Syntax

```powerfx
FunctionName( params ): ReturnType = {
    Statement1;
    Statement2;
    FinalExpression
};
```

### Examples

```powerfx
App.Formulas:
    // Function with side effects
    LogAction( action: Text ): Void = {
        Collect( colAuditLog, {
            Action: action,
            User: User().Email,
            Timestamp: Now()
        })
    };

    // Function that modifies state and returns value
    IncrementCounter(): Number = {
        Set( varCounter, varCounter + 1 );
        varCounter
    };

    // Function with validation
    SaveRecord( data: Record ): Boolean = {
        If( IsBlank( data.Name ),
            Notify( "Name is required", NotificationType.Error );
            false,
            Patch( DataSource, Defaults( DataSource ), data );
            Notify( "Saved successfully", NotificationType.Success );
            true
        )
    };
```

---

## Error Handling in UDFs

```powerfx
App.Formulas:
    // Function with error handling
    SafeDivide( numerator: Number, denominator: Number ): Number =
        IfError(
            numerator / denominator,
            0  // Return 0 on error
        );

    // Behavior function with error handling
    TrySave( record: Record ): Boolean = {
        IfError(
            Patch( DataSource, Defaults( DataSource ), record );
            true,
            Notify( "Save failed: " & FirstError.Message, NotificationType.Error );
            false
        )
    };
```

---

## Common UDF Patterns

### Validation Functions

```powerfx
App.Formulas:
    IsValidEmail( email: Text ): Boolean =
        IsMatch( email, Match.Email );

    IsValidPhone( phone: Text ): Boolean =
        IsMatch( phone, "^\d{3}-\d{3}-\d{4}$" );

    IsInRange( value: Number, min: Number, max: Number ): Boolean =
        value >= min && value <= max;

    RequiredField( value: Text, fieldName: Text ): Text =
        If( IsBlank( value ), fieldName & " is required", "" );
```

### Formatting Functions

```powerfx
App.Formulas:
    FormatPhone( phone: Text ): Text =
        "(" & Left( phone, 3 ) & ") " & Mid( phone, 4, 3 ) & "-" & Right( phone, 4 );

    FormatName( first: Text, last: Text ): Text =
        Proper( Trim( first ) ) & " " & Proper( Trim( last ) );

    Pluralize( count: Number, singular: Text, plural: Text ): Text =
        Text( count ) & " " & If( count = 1, singular, plural );

    // Usage: Pluralize( 5, "item", "items" ) -> "5 items"
```

### Date Functions

```powerfx
App.Formulas:
    DaysUntil( targetDate: Date ): Number =
        DateDiff( Today(), targetDate );

    IsOverdue( dueDate: Date ): Boolean =
        dueDate < Today();

    FormatRelativeDate( d: Date ): Text =
        Switch(
            DateDiff( Today(), d ),
            0, "Today",
            -1, "Yesterday",
            1, "Tomorrow",
            Text( d, DateTimeFormat.ShortDate )
        );

    GetQuarter( d: Date ): Number =
        RoundUp( Month( d ) / 3, 0 );
```

### Business Logic Functions

```powerfx
App.Formulas:
    CalculateDiscount( subtotal: Number, customerType: Text ): Number =
        Switch(
            customerType,
            "Premium", subtotal * 0.2,
            "Gold", subtotal * 0.15,
            "Silver", subtotal * 0.1,
            0
        );

    CalculateTax( amount: Number, state: Text ): Number =
        amount * LookUp( TaxRates, State = state, Rate );

    GetPriorityColor( priority: Text ): Color =
        Switch(
            priority,
            "High", Color.Red,
            "Medium", Color.Orange,
            "Low", Color.Green,
            Color.Gray
        );
```

---

## UDF Limitations

| Limitation | Details |
|------------|---------|
| **Experimental** | Feature may change |
| **No recursion** | Function cannot call itself |
| **No mutual recursion** | Functions cannot call each other in a cycle |
| **Defined in App.Formulas** | Cannot define elsewhere |
| **Side effects need braces** | Must use `{ }` for behavior functions |

---

## Best Practices

1. **Keep functions focused** - Single responsibility
2. **Use descriptive names** - `CalculateTax` not `CalcT`
3. **Type all parameters** - Explicit types prevent errors
4. **Handle edge cases** - Check for blanks, zeros, empty tables
5. **Document complex logic** - Use comments
6. **Prefer pure functions** - Avoid side effects when possible

---

## Combining Named Formulas and UDFs

```powerfx
App.Formulas:
    // Types
    OrderType := Type( { Product: Text, Quantity: Number, UnitPrice: Number } );

    // Named formulas (data)
    TaxRate = 0.08;
    ShippingThreshold = 50;

    // UDFs (logic)
    CalculateLineTotal( order: OrderType ): Number =
        order.Quantity * order.UnitPrice;

    CalculateOrderTotal( orders: Table ): Number =
        Sum( orders, CalculateLineTotal( ThisRecord ) );

    CalculateShipping( subtotal: Number ): Number =
        If( subtotal >= ShippingThreshold, 0, 5.99 );

    CalculateGrandTotal( orders: Table ): Number =
        With(
            { subtotal: CalculateOrderTotal( orders ) },
            subtotal + (subtotal * TaxRate) + CalculateShipping( subtotal )
        );
```

---

## Sources

- [Microsoft Learn: App object - User Defined Functions](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/object-app)
- [Microsoft Learn: Reuse Power Fx formulas with UDFs](https://learn.microsoft.com/en-us/power-platform/release-plan/2023wave1/power-apps/reuse-power-fx-formulas-user-defined-functions)
