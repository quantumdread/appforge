# Power Apps User Defined Functions (UDFs)

## Overview

UDFs enable custom, reusable functions with **typed parameters** and **return values**. Available in App.Formulas, app-scoped only.

**Status:** GA (September 2025)
**Requirement:** Power Apps version 3.24013+

---

## Syntax

### Declarative UDF (calculations)
```powerfx
FunctionName(param1: Type1, param2: Type2): ReturnType = Expression;
```

### Behavioral UDF (side effects)
```powerfx
FunctionName(param1: Type1): ReturnType = {
    Statement1;
    Statement2;
};
```

**Key:** Behavioral UDFs use `{ }` curly braces.

---

## Supported Types

| Type | Example |
|------|---------|
| `Boolean` | `true`, `false` |
| `Color` | `RGBA(255,0,0,1)` |
| `Date` | `Date(2025,12,7)` |
| `DateTime` | `Now()` |
| `GUID` | `GUID("...")` |
| `Number` | `42`, `3.14` |
| `Text` | `"Hello"` |
| `Void` | No return value |

---

## UDF vs Named Formulas

| Feature | Named Formulas | UDFs |
|---------|---------------|------|
| Parameters | None | Yes (typed) |
| Evaluation | Reactive (auto) | On-demand |
| Behavior functions | No | Yes (with `{}`) |
| Use case | Constants, globals | Parameterized logic |

---

## Common Patterns

### Calculation Functions
```yaml
App.Formulas: |-
  =// Temperature conversion
  CelsiusToFahrenheit(celsius: Number): Number =
      (celsius * 1.8) + 32;

  // Percentage calculation
  CalculatePercentage(value: Number, total: Number): Number =
      If(total = 0, 0, (value / total) * 100);

  // Currency formatting
  FormatCurrency(amount: Number): Text =
      Text(amount, "$ #,##0.00");
```

### Validation Functions
```yaml
App.Formulas: |-
  =IsValidEmail(email: Text): Boolean =
      IsMatch(email, "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$");

  IsValidPhone(phone: Text): Boolean =
      IsMatch(phone, "^\+?[1-9]\d{1,14}$");
```

### Filter Functions
```yaml
App.Formulas: |-
  =FilterByStatus(statusValue: Text): Table =
      Filter(Projects, Status.Value = statusValue);

  // Usage
  ActiveProjects = FilterByStatus("Active");
  CompletedProjects = FilterByStatus("Completed");
```

### Behavioral UDFs (with side effects)
```yaml
App.Formulas: |-
  =// Add item with notification
  AddToCart(productId: Text, quantity: Number): Void = {
      Collect(
          ShoppingCart,
          {
              ProductID: productId,
              Quantity: quantity,
              AddedOn: Now()
          }
      );
      Notify("Item added to cart", NotificationType.Success);
  };

  // Log activity
  LogActivity(action: Text, details: Text): Void = {
      Collect(
          AuditLog,
          {
              Timestamp: Now(),
              User: User().Email,
              Action: action,
              Details: details
          }
      );
  };
```

### Error Handling
```yaml
App.Formulas: |-
  =SafeDivide(numerator: Number, denominator: Number): Number =
      If(denominator = 0, 0, numerator / denominator);

  SafeUpdate(id: Number, newValue: Text): Void = {
      IfError(
          Patch(DataSource, LookUp(DataSource, ID = id), {Value: newValue}),
          Notify("Update failed: " & FirstError.Message, NotificationType.Error)
      );
  };
```

---

## Limitations

1. **No recursion** - Functions cannot call themselves
2. **App-scoped only** - Cannot share across apps (use ECPs for that)
3. **Strict type matching** - No implicit conversions
4. **No dynamic function selection** - Cannot use variables to select functions

---

## YAML Example

```yaml
App As App:
  Formulas: |-
    =// ============================================
    // UTILITY FUNCTIONS
    // ============================================

    FormatDateShort(date: Date): Text = Text(date, "mm/dd/yy");
    IsWeekend(date: Date): Boolean = Weekday(date) in [1, 7];

    // ============================================
    // FINANCIAL CALCULATIONS
    // ============================================

    CalculateEMI(principal: Number, annualRate: Number, months: Number): Number =
        With(
            {monthlyRate: (annualRate / 12) / 100},
            If(monthlyRate = 0,
                principal / months,
                (principal * monthlyRate * Power(1 + monthlyRate, months)) /
                (Power(1 + monthlyRate, months) - 1)
            )
        );

    CalculateTax(amount: Number, rate: Number): Number =
        amount * (rate / 100);

    // ============================================
    // DATA OPERATIONS
    // ============================================

    FilterByStatus(statusValue: Text): Table =
        Filter(Projects, Status.Value = statusValue);

    // ============================================
    // BEHAVIORAL FUNCTIONS
    // ============================================

    AddSale(customer: Text, amount: Number): Void = {
        Collect(Sales, {Customer: customer, Amount: amount, Date: Now()});
        Set(TotalSales, TotalSales + amount);
        Notify($"Sale to {customer} recorded!", NotificationType.Success);
    };
```

---

## Best Practices

1. **Single responsibility** - Each UDF does one thing well
2. **Clear naming** - `CalculateTaxAmount`, `ValidateEmail`, `FormatCurrency`
3. **Validate inputs** - Check for blanks, zeros, invalid values
4. **Document complex logic** - Add comments for clarity
5. **Test in isolation** - Verify with sample inputs before use
