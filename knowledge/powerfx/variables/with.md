# With Function

Create inline named values for cleaner formulas.

---

## Syntax

```powerfx
With( Record, Formula )
```

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| Record | Yes | Record of named values |
| Formula | Yes | Formula using those values |

---

## Basic Usage

```powerfx
// Calculate with named values
With(
    { radius: 10, height: 15 },
    Pi() * radius * radius * height
)
// 4712.39 (cylinder volume)

// Multiple intermediate values
With(
    {
        subtotal: Quantity * UnitPrice,
        taxRate: 0.08
    },
    {
        Subtotal: subtotal,
        Tax: subtotal * taxRate,
        Total: subtotal * (1 + taxRate)
    }
)
```

---

## Why Use With

### Without With (Repetitive)

```powerfx
(Quantity * UnitPrice) + (Quantity * UnitPrice * 0.08)
```

### With With (Cleaner)

```powerfx
With(
    { subtotal: Quantity * UnitPrice },
    subtotal + subtotal * 0.08
)
```

---

## Common Patterns

### Complex Calculations

```powerfx
// Mortgage payment calculation
With(
    {
        P: LoanAmount,
        r: AnnualRate / 12,
        n: Years * 12
    },
    (P * r * Power(1 + r, n)) / (Power(1 + r, n) - 1)
)
```

### Data Transformation

```powerfx
// Parse and format
With(
    { parts: Split( FullName, " " ) },
    {
        FirstName: First( parts ).Value,
        LastName: Last( parts ).Value,
        Initials: Left( First( parts ).Value, 1 ) & Left( Last( parts ).Value, 1 )
    }
)
```

### Lookup Results

```powerfx
// Store lookup result for multiple uses
With(
    { customer: LookUp( Customers, ID = Order.CustomerID ) },
    {
        OrderID: Order.ID,
        CustomerName: customer.Name,
        CustomerEmail: customer.Email,
        CustomerTier: customer.Tier
    }
)
```

---

## Nested With

Inner With can access outer values:

```powerfx
With(
    { basePrice: 100, quantity: 5 },
    With(
        {
            subtotal: basePrice * quantity,
            discount: If( quantity >= 5, 0.1, 0 )
        },
        subtotal * (1 - discount)
    )
)
// 450 (100 * 5 * 0.9)
```

---

## With + Patch

Store created record for use:

```powerfx
With(
    Patch( Orders, Defaults( Orders ), { Status: "New" } ),
    ForAll( LineItems,
        Patch( OrderDetails, Defaults( OrderDetails ),
            {
                OrderID: ID,  // ID from created order
                ProductID: ThisRecord.ProductID,
                Quantity: ThisRecord.Quantity
            }
        )
    )
)
```

---

## With + Match (Regex)

```powerfx
// Parse duration string "PT2H30M"
With(
    Match( Duration, "PT(?:(?<hours>\d+)H)?(?:(?<minutes>\d+)M)?" ),
    Time( Value( hours ), Value( minutes ), 0 )
)
```

---

## With in Named Formulas

```powerfx
App.Formulas:
    OrderSummary = With(
        {
            orders: Filter( Orders, CustomerID = varCustomerID ),
            products: Products
        },
        {
            TotalOrders: CountRows( orders ),
            TotalAmount: Sum( orders, Amount ),
            UniqueProducts: CountRows( Distinct( orders, ProductID ) )
        }
    );
```

---

## Error Handling

If Record contains an error, With returns that error:

```powerfx
// Safe usage
With(
    { result: IfError( RiskyOperation(), Blank() ) },
    If( IsBlank( result ), "Error occurred", Text( result ) )
)
```

---

## With vs Variables

| With | Set/UpdateContext |
|------|-------------------|
| Scoped to formula | Scoped to app/screen |
| Declarative | Imperative |
| Self-contained | Side effects |
| Auto-recalculates | Manual update |
| Better for calculations | Better for state |

### Prefer With When

- Calculating intermediate values
- Breaking up complex formulas
- Values only needed in one place
- No side effects needed

### Use Variables When

- Value needed across multiple controls
- Value changes based on user action
- State needs to persist

---

## Performance

With doesn't create actual variables - values are calculated inline:

```powerfx
// This calculates LookUp once
With(
    { item: LookUp( Products, ID = 123 ) },
    item.Name & " - " & item.Description
)

// This calculates LookUp twice!
LookUp( Products, ID = 123 ).Name & " - " & LookUp( Products, ID = 123 ).Description
```

---

## Common Use Cases

| Use Case | Example |
|----------|---------|
| Avoid repeated calculation | `With( { x: ExpensiveCalc() }, x + x )` |
| Store lookup result | `With( { rec: LookUp(...) }, rec.A & rec.B )` |
| Break up complex formula | `With( { part1: ..., part2: ... }, ... )` |
| Named constants | `With( { taxRate: 0.08 }, ... )` |

---

## Sources

- [Microsoft Learn: With function](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-with)
