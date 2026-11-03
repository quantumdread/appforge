# Named Formulas

Named formulas are reusable, immutable expressions defined in `App.Formulas` that serve as a single source of truth throughout your app.

## Syntax

```powerfx
App.Formulas:
    FormulaName1 = Expression1;
    FormulaName2 = Expression2;
    FormulaName3 = Expression3;
```

Each formula ends with a semicolon.

---

## Basic Examples

```powerfx
App.Formulas:
    // Constants
    AppThemeColor = RGBA(0, 120, 212, 1);
    AppName = "My Application";
    MaxRecords = 500;

    // User information
    CurrentUserEmail = User().Email;
    CurrentUserName = User().FullName;

    // Lookups
    CurrentUserRecord = LookUp( Users, Email = User().Email );
    IsAdmin = CurrentUserRecord.Role = "Admin";

    // Derived values
    TodayFormatted = Text( Today(), DateTimeFormat.LongDate );

    // Collections/Tables
    ActiveProducts = Filter( Products, Status = "Active" );
    CategoryOptions = Distinct( Products, Category );
```

---

## Key Advantages

| Feature | Benefit |
|---------|---------|
| **Always Available** | No timing dependency on OnStart |
| **Always Up to Date** | Auto-recalculates when dependencies change |
| **Immutable** | Single source of truth, can't be modified |
| **Deferred Calculation** | Only calculated when needed |
| **Performance** | Up to 80% faster Studio load times |
| **Excel-like** | Familiar spreadsheet-style formulas |

---

## Named Formulas vs App.OnStart

### Bad: Using App.OnStart

```powerfx
App.OnStart:
    Set( varThemeColor, RGBA(0, 120, 212, 1) );
    Set( varCurrentUser, User() );
    Set( varIsAdmin, LookUp( Admins, Email = User().Email ) );
    ClearCollect( colProducts, Filter( Products, Active ) );
```

Problems:
- Must wait for OnStart to complete
- Order matters
- Can be accidentally overwritten
- All evaluated at startup

### Good: Using Named Formulas

```powerfx
App.Formulas:
    ThemeColor = RGBA(0, 120, 212, 1);
    CurrentUser = User();
    IsAdmin = !IsBlank( LookUp( Admins, Email = User().Email ) );
    ActiveProducts = Filter( Products, Active );
```

Benefits:
- Available immediately
- Order doesn't matter
- Cannot be modified elsewhere
- Evaluated only when needed

---

## Rules and Limitations

### Can Use
- Any pure function (no side effects)
- Calculations and transformations
- Lookups and filters
- Conditional logic (If, Switch)
- Text formatting

### Cannot Use
- `Set()` - use for mutable state only
- `Collect()`, `ClearCollect()` - use for mutable collections
- `Navigate()` - behavior function
- `Notify()` - behavior function
- `Patch()` - causes side effects
- Circular references (A depends on B which depends on A)

---

## Common Patterns

### Theme/Style Configuration

```powerfx
App.Formulas:
    // Colors
    PrimaryColor = RGBA(0, 120, 212, 1);
    SecondaryColor = RGBA(0, 90, 158, 1);
    ErrorColor = RGBA(209, 52, 56, 1);
    SuccessColor = RGBA(16, 124, 16, 1);

    // Styles
    FormStyle = {
        DataCardHeight: 70,
        TitleSize: 21,
        ControlSize: 18,
        LabelColor: RGBA(50, 50, 50, 1)
    };

    // Usage: FormStyle.TitleSize
```

### User Context

```powerfx
App.Formulas:
    CurrentUser = User();
    UserEmail = CurrentUser.Email;
    UserProfile = LookUp( Employees, Email = UserEmail );
    UserDepartment = UserProfile.Department;
    UserRole = UserProfile.Role;

    IsManager = UserRole = "Manager" || UserRole = "Director";
    IsAdmin = UserRole = "Admin";

    UserPermissions = Filter( Permissions, Role = UserRole );
```

### App Parameters (Deep Links)

```powerfx
App.Formulas:
    ParamRecordID = Param( "recordId" );
    ParamMode = Param( "mode" );

    // Convert and validate
    RecordIDValue = If( !IsBlank( ParamRecordID ), Value( ParamRecordID ) );
    IsEditMode = ParamMode = "edit";

    // Load record if ID provided
    LinkedRecord = If( !IsBlank( RecordIDValue ),
        LookUp( Records, ID = RecordIDValue )
    );
```

### Lookup Data (Reference Tables)

```powerfx
App.Formulas:
    // Cache reference data
    StatusOptions = Choices( Records.Status );
    CategoryList = Sort( Distinct( Products, Category ), Value );
    CountryList = Sort( Countries, Name );

    // Formatted for dropdowns
    PriorityOptions = [
        { Value: "High", Display: "High Priority" },
        { Value: "Medium", Display: "Medium Priority" },
        { Value: "Low", Display: "Low Priority" }
    ];
```

### Computed Values

```powerfx
App.Formulas:
    // Statistics
    TotalOrders = CountRows( Orders );
    PendingOrders = CountIf( Orders, Status = "Pending" );
    TotalRevenue = Sum( Orders, Amount );

    // Dates
    CurrentQuarterStart = Date( Year(Today()),
        (RoundDown((Month(Today())-1)/3, 0) * 3) + 1, 1 );
    FiscalYearStart = Date( If( Month(Today()) >= 4, Year(Today()), Year(Today()) - 1 ), 4, 1 );
```

---

## Breaking Up Long Formulas

### Before (Too Long)

```powerfx
ComplexResult = LookUp(
    Filter(
        AddColumns(
            Table1,
            "Calculated", Column1 * Column2
        ),
        Status = "Active"
    ),
    ID = ParamID
).Calculated * TaxRate;
```

### After (Named Formulas)

```powerfx
App.Formulas:
    EnhancedTable = AddColumns( Table1, Calculated, Column1 * Column2 );
    ActiveRecords = Filter( EnhancedTable, Status = "Active" );
    SelectedRecord = LookUp( ActiveRecords, ID = ParamID );
    FinalResult = SelectedRecord.Calculated * TaxRate;
```

---

## Using With() for Intermediate Values

When you need intermediate values within a single formula:

```powerfx
App.Formulas:
    OrderSummary = With(
        {
            TotalItems: Sum( OrderItems, Quantity ),
            TotalPrice: Sum( OrderItems, Quantity * UnitPrice ),
            DiscountRate: If( Sum( OrderItems, Quantity ) > 10, 0.1, 0 )
        },
        {
            Items: TotalItems,
            Subtotal: TotalPrice,
            Discount: TotalPrice * DiscountRate,
            Total: TotalPrice * (1 - DiscountRate)
        }
    );

    // Usage: OrderSummary.Total
```

---

## When to Use Named Formulas vs Variables

| Use Named Formulas | Use Set/UpdateContext |
|-------------------|----------------------|
| Values that shouldn't change | Values that need to be modified |
| Derived/calculated values | User input state |
| Configuration/constants | Toggle states (show/hide) |
| Cached lookups | Counter values |
| Theme/styling | Form mode (edit/view) |

---

## Performance Tips

1. **Split large OnStart** into multiple named formulas
2. **Reference other named formulas** to build complex values
3. **Avoid redundant calculations** - define once, use everywhere
4. **Lazy evaluation** means unused formulas don't slow down app

---

## Sources

- [Microsoft Learn: App object](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/object-app)
- [Microsoft Learn: Build large and complex canvas apps](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/working-with-large-apps)
