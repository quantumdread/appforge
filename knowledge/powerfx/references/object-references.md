# PowerFx Object Reference Functions and Keywords

## Overview

PowerFx provides several object reference keywords that allow you to access the current context within different scopes in Power Apps Canvas Apps. These keywords are essential for working with galleries, forms, loops, and components.

**Source**: [Microsoft Learn - Operators and Identifiers in Power Apps](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/operators)

---

## Quick Reference Table

| Keyword | Scope | Use Case | Returns |
|---------|-------|----------|---------|
| **ThisItem** | Galleries, Edit form, Display form | Current gallery/form item | Record with all columns |
| **ThisRecord** | ForAll, Filter, Sort, With, etc. | Current record in iteration | Record in scope |
| **Self** | Any control | Current control reference | Control object |
| **Parent** | Any control | Parent container/control | Parent control object |
| **As** | Gallery, iteration functions | Name current record with custom alias | Record with custom alias |
| **AsType** | Record references, dynamic values | Cast to specific type | Typed record |
| **IsType** | Record references, dynamic values | Check record type | Boolean |

---

## ThisItem - Current Gallery/Form Item

### Syntax

```powerfx
ThisItem
```

### Description

**ThisItem** represents the record from the data source that corresponds to the current item being displayed in a gallery, edit form, or display form control. It provides access to all fields/columns in that record.

**Key Characteristic**: ThisItem is the **default name** for the current record and is **always required** in gallery and form controls—it cannot be omitted.

### When to Use

- Inside gallery controls to reference the current row
- In edit form or display form controls
- In list boxes or combo boxes to access the current item
- When you need to display or manipulate data from a gallery row
- Most common in gallery item templates and nested controls

### Scope and Context

- Available only within gallery and form contexts
- Automatically provides the row data without explicit parameter passing
- Cannot be used outside of a gallery, list box, combo box, or form control
- Each nested level in a gallery has its own ThisItem context
- Always refers to the **innermost scope** when nesting

### Examples in Context

#### Basic Gallery Display

```powerfx
// Gallery items property
Gallery.Items = Products

// Inside gallery labels
Label1.Text = ThisItem.ProductName
Label2.Text = ThisItem.Price
Label3.Text = ThisItem.Description
```

#### Gallery with Calculated Values

```powerfx
// Show product with tax calculation
Text1.Text = ThisItem.ProductName & " - $" & Text(ThisItem.Price * 1.08, "$0.00")

// Conditional formatting
Label.Color = If(ThisItem.InStock, Green, Red)
```

#### Nested Galleries

```powerfx
// Outer gallery: Categories
Gallery1.Items = Categories

// Inner gallery: Products in category
// IMPORTANT: Must explicitly reference outer gallery
Gallery2.Items = Filter(Products, CategoryID = Gallery1.ThisItem.CategoryID)

// In inner gallery label
Label.Text = Gallery2.ThisItem.ProductName

// Note: ThisItem alone refers to innermost gallery (Gallery2)
// To access outer gallery, use: Gallery1.ThisItem
```

#### Gallery with Buttons

```powerfx
// Button in gallery to delete current item
Button.OnSelect = Remove(DataSource, ThisItem)

// Button to navigate with current item
Button.OnSelect = Navigate(DetailScreen, {Item: ThisItem})
```

#### List Box Item Reference

```powerfx
// List box items
ListBox.Items = Employees
ListBox.Value = ThisItem.EmployeeID

// Display selected item info
Label.Text = "Selected: " & ThisItem.FirstName & " " & ThisItem.LastName
```

#### Gallery Selection Pattern

```powerfx
// Gallery setup with highlighting
Gallery.Items = Employees
Gallery.TemplateFill = If(ThisItem.ID = SelectedEmployeeID, LightBlue, White)

// Select button in gallery
SelectButton.OnSelect = UpdateContext({SelectedEmployeeID: ThisItem.ID})
```

### Common Patterns

**Pattern 1: Gallery Row Selection**
```powerfx
// Highlight selected row
Gallery.TemplateFill = If(ThisItem.EmployeeID = SelectedEmployee.Value, LightBlue, White)
```

**Pattern 2: Conditional Display**
```powerfx
// Show details only if condition met
Container.Visible = ThisItem.Status = "Active"
```

**Pattern 3: Item Navigation**
```powerfx
// Open detail view with gallery item
OnSelect = Navigate(DetailsScreen, {ItemID: ThisItem.ID})
```

**Pattern 4: Edit Gallery Item**
```powerfx
// Edit form with current gallery item
EditForm.Item = ThisItem
EditForm.Mode = EditMode
```

### Key Characteristics

- Always required in galleries and forms—cannot be omitted
- Read-only access to all fields in the record
- Cannot be modified directly
- Provides clean, intuitive syntax for gallery operations
- Refers to innermost scope in nested galleries

---

## ThisRecord - Current Record in Scope (ForAll, Filter, etc.)

### Syntax

```powerfx
ThisRecord
```

### Description

**ThisRecord** represents the current record being processed in iteration functions like ForAll, Filter, Sort, GroupBy, AddColumns, DropColumns, With, Sum, and other table manipulation functions.

**Key Characteristic**: ThisRecord is **optional** in most contexts—you can reference fields directly by name. However, it's **required** when using functions like `Patch`, `Collect`, and other operations that need to reference the **whole record** rather than individual fields.

### When to Use

- In ForAll loops to reference the current record
- Within Filter, Sort, With, Sum, and other table functions
- In AddColumns and DropColumns for calculated columns
- When iterating through table data
- When you need to reference the whole record (required with Patch, Collect)
- As a best practice for clarity in complex formulas

### Scope and Context

- Available within function parameters where iteration occurs
- Each iteration provides a new ThisRecord context
- Explicit and self-documenting compared to implicit field access
- Works with any function that iterates through records
- Optional in most cases—fields can be accessed directly

### Important Note

In many record scope functions, **ThisRecord is optional**. You can reference fields directly:

```powerfx
// These are equivalent:
Filter(Employees, ThisRecord.'First Name' = "John")
Filter(Employees, 'First Name' = "John")
```

However, **ThisRecord is required** when you need to reference the whole record:

```powerfx
// Required: ThisRecord references the whole record for Patch
ForAll(InactiveEmployees,
    Patch(Employees, ThisRecord, {Status: "Active"})
)
```

### Examples in Context

#### Basic ForAll Loop

```powerfx
// Process each record in table
ForAll(
    Employees,
    Notify(ThisRecord.FirstName & " - " & ThisRecord.Department)
)

// Alternative: Fields can be referenced directly
ForAll(
    Employees,
    Notify(FirstName & " - " & Department)
)
```

#### Filter with ThisRecord

```powerfx
// Get employees in specific department (explicit)
Filter(Employees, ThisRecord.Department = "Sales")

// Alternative (implicit - fields accessed directly)
Filter(Employees, Department = "Sales")

// Complex filter condition
Filter(
    Employees,
    ThisRecord.Status = "Active" And ThisRecord.Salary > 50000
)
```

#### Sort with ThisRecord

```powerfx
// Sort employees by last name
Sort(Employees, ThisRecord.LastName, Ascending)

// Alternative (implicit)
Sort(Employees, LastName, Ascending)

// Custom sort logic
Sort(Employees, ThisRecord.Salary * 1.1, Descending)
```

#### AddColumns with ThisRecord

```powerfx
// Add calculated column to table
AddColumns(
    Employees,
    "AnnualSalary",
    ThisRecord.MonthlySalary * 12
)

// Add multiple calculated columns
AddColumns(
    Products,
    "TaxedPrice", ThisRecord.Price * 1.08,
    "Discount", ThisRecord.Price * 0.1,
    "FinalPrice", ThisRecord.Price * 0.9
)
```

#### ForAll with Patch (ThisRecord Required)

```powerfx
// Process multiple records with status update
// IMPORTANT: ThisRecord is REQUIRED here to reference the whole record
ForAll(
    Filter(Orders, Status = "Pending"),
    Patch(Orders, ThisRecord, {Status: "Processing"})
)
```

#### Nested ForAll

```powerfx
// Process nested data
// Note: ThisRecord refers to innermost scope
ForAll(
    Categories,
    {
        CatName: ThisRecord.Name,
        Products: ForAll(
            Filter(Products, CategoryID = ThisRecord.ID),
            {
                ProdName: ThisRecord.ProductName,
                ProdPrice: ThisRecord.Price
            }
        )
    }
)
```

### Common Patterns

**Pattern 1: Collection Population**
```powerfx
// Build collection from data source
ForAll(
    Employees,
    Collect(EmployeeList, {
        ID: ThisRecord.EmployeeID,
        Name: ThisRecord.FirstName & " " & ThisRecord.LastName,
        Dept: ThisRecord.Department
    })
)
```

**Pattern 2: Batch Update (ThisRecord Required)**
```powerfx
// Update multiple records - ThisRecord references whole record
ForAll(
    Filter(Orders, Status = "Pending"),
    Patch(Orders, ThisRecord, {Status: "Confirmed"})
)
```

**Pattern 3: Calculated Table**
```powerfx
// Create table with calculated values
AddColumns(
    Filter(Products, Available = true),
    "TaxedPrice", ThisRecord.Price * 1.08,
    "StockValue", ThisRecord.Price * ThisRecord.Quantity
)
```

**Pattern 4: Conditional Collection**
```powerfx
// Build filtered collection
ForAll(
    Employees,
    If(
        ThisRecord.Status = "Active",
        Collect(ActiveEmployees, ThisRecord)
    )
)
```

### Key Characteristics

- Optional in most contexts—fields can be accessed directly
- Required when referencing the whole record with Patch, Collect, etc.
- Explicit, self-documenting syntax
- Works with all iteration/table manipulation functions
- Provides clear variable scope
- Recommended best practice for clarity
- May be required in ambiguous situations (e.g., field name matches relationship name)

### Relationship with As Keyword

ThisRecord is the implicit current record reference. The **As** operator allows you to create an explicit custom name, overriding ThisRecord. Both serve similar purposes, but As provides more control in nested scenarios.

---

## Self - Current Control Reference

### Syntax

```powerfx
Self
```

### Description

**Self** provides an easy relative reference to the current control's own properties within its formula. This allows a control to reference its own properties without using the absolute control name, avoiding circular dependencies and improving portability.

**Key Characteristic**: Self is an **operator**, not a property. You cannot chain it (e.g., `Self.Parent` is not supported).

### When to Use

- In control formulas that need to reference the control's own properties
- To avoid circular dependency issues
- When control name might change but formula should adapt
- In dynamic property formulas
- To create more portable, reusable formulas

### Scope and Context

- Available in any control's property formulas
- Useful for self-referential calculations
- Helps avoid hard-coding control names
- Can reference any property of the control
- More portable than using absolute control names

### Examples in Context

#### Self-Referential Calculations

```powerfx
// Button that increases its own font size on click
Button.OnSelect = UpdateContext({ButtonFontSize: Self.FontSize + 2})
Button.FontSize = If(ButtonFontSize, ButtonFontSize, 12)
```

#### Conditional Self Properties

```powerfx
// Label that changes color based on its own value
Label.Color = If(Value(Self.Text) > 100, Green, Red)

// Container that shows/hides based on own content
Container.Visible = Self.Height > 50
```

#### Dynamic Width Calculation

```powerfx
// Image scales based on container size
Image.Width = Self.Parent.Width * 0.8

// Text wraps with dynamic width
TextInput.Width = Self.Parent.Width - 20
```

#### Error Validation

```powerfx
// Input field shows error if Self is empty
ErrorLabel.Visible = IsBlank(Self.Value)

// Input with custom validation
TextInput.BorderColor = If(IsBlank(Self.Value), Red, Gray)
```

#### Responsive Layout

```powerfx
// Control positions itself based on screen
Button.X = If(Self.Parent.Width > 800, 100, 50)

// Dynamic sizing
Gallery.Height = Self.Parent.Height - 100
```

### Common Patterns

**Pattern 1: Input Validation**
```powerfx
// Show validation message based on control value
ValidationLabel.Text =
    If(
        IsBlank(Self.Value),
        "This field is required",
        If(Len(Self.Value) < 5, "Minimum 5 characters", "")
    )
```

**Pattern 2: Dynamic Styling**
```powerfx
// Control applies style based on content
TextInput.BorderColor = If(IsBlank(Self.Value), Orange, Green)
TextInput.BorderThickness = If(Self.Focused, 3, 1)
```

**Pattern 3: Self-Contained Component**
```powerfx
// Control expands/collapses itself
Toggle.OnChange = UpdateContext({IsExpanded: Self.Value})
Container.Height = If(IsExpanded, 400, 100)
```

**Pattern 4: Relative Positioning**
```powerfx
// Control positions relative to parent
Control.X = Self.Parent.Width - Self.Width - 10
Control.Y = Self.Parent.Height - Self.Height - 10
```

### Key Characteristics

- Provides control self-reference without circular dependencies
- Enables name-independent formulas
- Useful for generic, reusable components
- Avoids hard-coding control names
- Essential for complex dynamic layouts
- Is an operator, not a property (no chaining like `Self.Parent`)

---

## Parent - Parent Control Reference

### Syntax

```powerfx
Parent
```

### Description

**Parent** provides an easy relative reference to the control's parent container or hosting control. This allows child controls to access and respond to parent properties without hard-coding parent names.

**Key Characteristic**: Parent is an **operator**, not a property. You cannot chain it (e.g., `Parent.Parent` is not supported).

### When to Use

- Child controls need to reference parent container properties
- Dynamic sizing based on parent dimensions
- Accessing parent control values
- Building responsive layouts
- Creating flexible, reusable components
- Positioning controls relative to their container

### Scope and Context

- Available in any control within a container or parent control
- Refers to the immediate parent container
- Cannot be chained (use absolute references for grandparent access)
- Works with all standard control properties

### Important Gallery Context Note

For controls within a gallery template:
- Use `Parent.TemplateHeight` and `Parent.TemplateWidth` for template sizing
- Don't use `Parent.Width` and `Parent.Height` (these refer to the overall gallery size)

For a control placed directly on a screen:
- `Parent` refers to the screen itself
- `Parent.Width` and `Parent.Height` reference screen dimensions

### Examples in Context

#### Parent-Responsive Sizing

```powerfx
// Child control takes 90% of parent width
Button.Width = Parent.Width * 0.9

// Label takes 80% of parent width with margin
Label.Width = Parent.Width * 0.8

// Image fills parent height minus spacing
Image.Height = Parent.Height - 20
```

#### Control Positioned on Screen

```powerfx
// For a control placed directly on a screen:
// X = 0, Y = 0 (upper-left corner)
Control.X = 0
Control.Y = 0

// Width and Height match the screen
Control.Width = Parent.Width
Control.Height = Parent.Height
```

#### Gallery Template Sizing

```powerfx
// For controls within a gallery template
Label.Width = Parent.TemplateWidth - 20

// For a checkbox in a gallery template
Checkbox.X = Parent.TemplateWidth - Self.Width - 5
```

#### Parent Value Access

```powerfx
// Access parent data property
Label.Text = Parent.ItemData.ProductName

// Parent is form - get form value
Input.Default = Parent.EditFormValue.EmployeeName
```

#### Responsive Layout Example

```powerfx
// Layout adapts to parent size
Gallery.Height = Parent.Height - 60
Gallery.Width = Parent.Width - 20

// Nested container sizing
InnerContainer.Width = Parent.Width * 0.95
```

#### Parent Container Visibility

```powerfx
// Control shows based on parent visibility
Button.Visible = Parent.Visible And Parent.IsEditing

// Nested visibility control
Label.Color = If(Parent.IsSelected, Blue, Gray)
```

#### Parent Gallery Context

```powerfx
// In nested control within gallery
Label.Text = Parent.ThisItem.ProductName

// Access gallery row data from nested control
Button.OnSelect = Navigate(Details, {Item: Parent.ThisItem})
```

#### Default Select Behavior in Gallery

```powerfx
// By default, OnSelect of controls in a gallery is:
OnSelect = Select(Parent)

// This propagates the select action to the gallery itself
```

#### Relative Positioning to Parent

```powerfx
// Position at right side of parent
Button.X = Parent.Width - Self.Width - 10

// Center in parent
Control.X = (Parent.Width - Self.Width) / 2

// Bottom alignment
Control.Y = Parent.Height - Self.Height
```

### Common Patterns

**Pattern 1: Responsive Container**
```powerfx
// Controls adapt to parent dimensions
ListBox.Width = Parent.Width - 20
ListBox.Height = Parent.Height - 100

Button.X = Parent.Width - 120
Button.Y = Parent.Height - 50
```

**Pattern 2: Parent-Data Binding**
```powerfx
// Control gets data from parent property
Label.Text = Parent.DataItem.Name
Label.Visible = Parent.ShowDetails

// Form data synchronization
DataCard.Value = Parent.FormData.Field1
```

**Pattern 3: Dynamic Child Behavior**
```powerfx
// Child control behavior depends on parent state
Button.Visible = Parent.IsEditing
Input.ReadOnly = Not Parent.IsEditing
Label.Color = If(Parent.HasError, Red, Black)
```

**Pattern 4: Flexible Component Layout**
```powerfx
// Container scales with parent
ButtonContainer.Width = Parent.Width
ButtonContainer.Height = Parent.Height * 0.15

// Buttons distribute across parent width
Button1.Width = Parent.Width / 3
Button2.Width = Parent.Width / 3
Button3.Width = Parent.Width / 3
```

### Key Characteristics

- Enables responsive, flexible layouts
- Avoids hard-coding parent control names
- Essential for reusable components
- Works with nested controls
- Is an operator, not a property (no chaining like `Parent.Parent`)
- Different behavior in gallery templates (use TemplateHeight/TemplateWidth)

---

## As - Name Current Record in Iteration

### Syntax

```powerfx
DataSource As CustomName
```

### Description

**As** explicitly names the current record in iteration contexts, creating a custom alias that replaces the default **ThisItem** (in galleries) or **ThisRecord** (in functions). This provides an alternative to using implicit context and is essential for nested iterations where you need to access multiple scope levels.

**Key Characteristic**: The As operator **overrides** the default ThisItem or ThisRecord with your custom name. This makes formulas easier to understand and is **required** in nested situations to access records in outer scopes.

### When to Use

- When you want to explicitly name the iteration variable
- In complex ForAll operations for clarity
- To distinguish between nested iterations
- For self-documenting code
- When you need to access multiple record scopes simultaneously
- In nested galleries or nested record scope functions

### Scope and Context

- Creates a scoped variable for the iteration
- Variable exists only within the function
- Cannot be accessed outside the function
- Essential for nested iterations with clear naming
- Without As, ThisItem and ThisRecord always refer to the **innermost scope**, making outer scopes inaccessible

### Critical Nesting Rule

**Without As operator**: ThisItem and ThisRecord always refer to the innermost scope, leaving records in outer scopes unavailable.

**With As operator**: All record scopes become available by giving each a unique name.

### Examples in Context

#### Basic As Usage

```powerfx
// Named iteration variable in gallery
Gallery.Items = Employees As Emp

// In gallery template, use the custom name
Label.Text = Emp.FirstName

// Named iteration in ForAll
ForAll(
    Employees As Emp,
    Notify("Processing: " & Emp.FirstName)
)
```

#### As with Filter

```powerfx
// Filter with named variable
Filter(
    Employees As Emp,
    Emp.Department = "Sales" And Emp.Status = "Active"
)

// Multiple conditions with clear naming
Filter(
    Products As Prod,
    Prod.Price > 100 And Prod.InStock = true
)
```

#### As with Sort

```powerfx
// Sort with named variable
Sort(Employees As Emp, Emp.LastName, Ascending)

// Complex sort with named variable
Sort(
    Employees As Emp,
    Emp.Department & Emp.LastName,
    Ascending
)
```

#### Nested As Iterations (Critical Pattern)

```powerfx
// Clear distinction with nested named variables
// Without As, you cannot access outer scope records
ForAll(
    Categories As Category,
    {
        CategoryName: Category.Name,
        Products: ForAll(
            Filter(Products, CategoryID = Category.ID) As Product,
            {
                ProductName: Product.ProductName,
                Price: Product.Price,
                CategoryRef: Category.Name  // Access outer scope!
            }
        )
    }
)
```

#### Nested Gallery Example

```powerfx
// Outer gallery: Use As to name the record
OuterGallery.Items = Categories As Category

// Inner gallery: Can reference outer scope
InnerGallery.Items = Filter(Products, CategoryID = Category.ID)

// In inner gallery label: Access both scopes
Label.Text = Category.CategoryName & " - " & ThisItem.ProductName
```

#### Chessboard Pattern with As

```powerfx
// Complex nested iteration with clear variable names
Concat(
    ForAll(Sequence(8) As Rank,
        Concat(
            ForAll(Sequence(8) As File,
                If(Mod(Rank.Value + File.Value, 2) = 1, " X ", " . ")
            ),
            Value
        ) & Char(10)
    ),
    Value
)
```

#### As with AddColumns

```powerfx
// Add calculated column with named iteration
AddColumns(
    Employees As Emp,
    "YearlyBonus", Emp.Salary * 0.1
)

// Multiple calculated columns
AddColumns(
    Orders As Order,
    "SubTotal", Order.ItemPrice * Order.Quantity,
    "Tax", Order.ItemPrice * Order.Quantity * 0.08,
    "Total", Order.ItemPrice * Order.Quantity * 1.08
)
```

#### As with Patch

```powerfx
// Update records with named iteration
With(
    {InactiveEmployees: Filter(Employees, Status = "Inactive")},
    ForAll(
        InactiveEmployees As Employee,
        Patch(Employees, Employee, {Status: "Active"})
    )
)
```

#### As with Complex Operations

```powerfx
// Complex operation with clear naming
ForAll(
    Orders As Order,
    {
        Summary: Notify(
            Order.OrderID & " - Total: $" &
            Text(Order.Amount * 1.08, "$0.00")
        ),
        Update: Patch(Orders, Order, {ProcessedDate: Today()})
    }
)
```

### Common Patterns

**Pattern 1: Nested Named Iterations**
```powerfx
// Clear nested loops with explicit naming
ForAll(
    Departments As Dept,
    ForAll(
        Filter(Employees, DeptID = Dept.ID) As Employee,
        Collect(EmployeesByDept, {
            Department: Dept.Name,
            Employee: Employee.FirstName & " " & Employee.LastName
        })
    )
)
```

**Pattern 2: Named Variable in Complex Formulas**
```powerfx
// Self-documenting named iteration
Filter(
    Employees As Employee,
    And(
        Employee.Status = "Active",
        Employee.YearsOfService > 5,
        Employee.Salary > Average(Employees As E, E.Salary)
    )
)
```

**Pattern 3: Named Iteration with Conditions**
```powerfx
// Clear condition with named variable
ForAll(
    Sales As Transaction,
    If(
        Transaction.Amount > 1000,
        Patch(Sales, Transaction, {Status: "HighValue"}),
        Patch(Sales, Transaction, {Status: "Standard"})
    )
)
```

**Pattern 4: Named Variable for Readability**
```powerfx
// Explicit naming improves readability
AddColumns(
    Products As Item,
    "RetailPrice", Item.CostPrice * 1.5,
    "SalePrice", Item.CostPrice * 1.3,
    "Margin", Item.CostPrice * 0.3
)
```

### Key Characteristics

- Provides explicit variable naming in iterations
- More readable in complex nested operations
- Creates scoped variables limited to function
- **Required for accessing outer scopes in nested iterations**
- Alternative to implicit context
- Useful for self-documenting code
- Overrides default ThisItem or ThisRecord

### Comparison with ThisRecord

- **As**: Explicitly named variable (user-defined name)
- **ThisRecord**: Implicit current record (default name)
- Both serve similar purposes in record scope functions
- As is more explicit; ThisRecord is built-in
- **As is required for nested scenarios** where you need to access multiple scope levels

---

## AsType - Cast Record to Type

### Syntax

```powerfx
AsType(RecordReference, TableType)
AsType(DynamicValue, TypeSpecification)
```

### Description

**AsType** casts a record reference or dynamic value to a specific type. This is essential for working with **polymorphic lookups** in Microsoft Dataverse (lookups that can reference multiple table types) and for converting dynamic values from APIs or ParseJSON to typed values.

**Key Characteristic**: AsType **requires** that you first determine the correct type (typically using IsType) to avoid errors. If the record doesn't match the specified type, AsType returns an error.

### When to Use

- Working with polymorphic lookups (Owner, Customer, Regarding fields)
- Accessing fields from record references
- Converting dynamic values from ParseJSON or web APIs to typed values
- Implementing type-safe component designs
- After verifying type with IsType function

### Polymorphic Lookups

Common polymorphic lookups in Dataverse:

| Lookup Field | Can Reference |
|--------------|---------------|
| **Owner** | Users or Teams |
| **Customer** | Accounts or Contacts |
| **Regarding** | Multiple activity/task related tables |

### Scope and Context

- Works with record references and dynamic values
- Requires matching structure or compatible fields
- Essential for accessing fields from polymorphic lookups
- Returns error if type is incompatible (use IsType first)
- Used in formulas expecting specific types

### Important: Add Data Sources

**You must add data sources** for each table type you want to use with AsType:
- Add Users table if checking Owner for Users
- Add Teams table if checking Owner for Teams
- Add Accounts and Contacts if checking Customer field

### Examples in Context

#### Basic AsType with Polymorphic Lookup

```powerfx
// Owner field can be User or Team
// Use IsType first to determine which, then AsType to access fields

If(IsType(ThisItem.Owner, Teams),
    "Team: " & AsType(ThisItem.Owner, Teams).'Team Name',
    "User: " & AsType(ThisItem.Owner, Users).'Full Name'
)
```

#### AsType with Error Handling (Formula-level Error Management)

```powerfx
// Alternative pattern using IfError
IfError(
    "Team: " & AsType(ThisItem.Owner, Teams).'Team Name',
    "User: " & AsType(ThisItem.Owner, Users).'Full Name'
)
```

#### AsType with Customer Field (Blank Handling)

```powerfx
// Customer field is optional and can be blank
If(IsBlank(ThisItem.'Company Name'), "",
    IsType(ThisItem.'Company Name', [@Accounts]),
        "Account: " & AsType(ThisItem.'Company Name', [@Accounts]).'Account Name',
    "Contact: " & AsType(ThisItem.'Company Name', [@Contacts]).'Full Name'
)

// Note: [@TableName] is the disambiguation operator for gallery/form contexts
```

#### AsType in Gallery with Disambiguation

```powerfx
// In a gallery or form context, use disambiguation operator
Gallery.Items = Contacts

// In gallery template:
Label.Text = If(
    IsType(ThisItem.'Company Name', [@Accounts]),
    AsType(ThisItem.'Company Name', [@Accounts]).'Account Name',
    AsType(ThisItem.'Company Name', [@Contacts]).'Full Name'
)
```

#### AsType with Regarding Field

```powerfx
// Regarding field can reference multiple table types
If(IsBlank(ThisItem.Regarding), "",
    IsType(ThisItem.Regarding, Accounts),
        "Account: " & AsType(ThisItem.Regarding, Accounts).'Account Name',
    IsType(ThisItem.Regarding, Contacts),
        "Contact: " & AsType(ThisItem.Regarding, Contacts).'Full Name',
    "Other"
)
```

#### AsType with Dynamic Values from ParseJSON

```powerfx
// Convert dynamic value to typed value
DynamicData = ParseJSON("{""name"":""John"", ""age"":30}")

// Explicitly type with AsType
TypedData = AsType(DynamicData, Type({name: Text, age: Number}))

// Access typed properties
Label1.Text = TypedData.name
Label2.Text = Text(TypedData.age)

// Alternative: Use ParseJSON with type argument
TypedData2 = ParseJSON("{""name"":""John"", ""age"":30}", Type({name: Text, age: Number}))
```

#### AsType in ForAll with Record References

```powerfx
// Process accounts with owner information
ForAll(
    Accounts As Account,
    {
        AccountName: Account.'Account Name',
        OwnerName: If(
            IsType(Account.Owner, Users),
            AsType(Account.Owner, Users).'Full Name',
            AsType(Account.Owner, Teams).'Team Name'
        )
    }
)
```

#### AsType for Component Type Safety

```powerfx
// Component receives polymorphic data
Component.InputData = SelectedRecord

// Inside component: Validate and cast
ValidatedData = If(
    IsType(InputData, ExpectedType),
    AsType(InputData, ExpectedType),
    Blank()
)

// Display with typed properties
Output = ValidatedData.ProcessedValue
Component.HasError = IsBlank(ValidatedData)
```

### Common Patterns

**Pattern 1: Type-Safe Polymorphic Access**
```powerfx
// Always check type before casting
If(IsType(Record.Owner, Users),
    AsType(Record.Owner, Users).'Full Name',
    AsType(Record.Owner, Teams).'Team Name'
)
```

**Pattern 2: Handling Optional Polymorphic Fields**
```powerfx
// Handle potentially blank Customer field
If(IsBlank(ThisItem.'Company Name'), "No customer",
    IsType(ThisItem.'Company Name', [@Accounts]),
        "Account: " & AsType(ThisItem.'Company Name', [@Accounts]).'Account Name',
    "Contact: " & AsType(ThisItem.'Company Name', [@Contacts]).'Full Name'
)
```

**Pattern 3: Dynamic Value Conversion**
```powerfx
// Convert ParseJSON result to typed object
JsonData = ParseJSON("{""id"":123, ""name"":""Product A""}")
TypedProduct = AsType(JsonData, Type({id: Number, name: Text}))

// Use typed properties
Label.Text = TypedProduct.name & " (ID: " & Text(TypedProduct.id) & ")"
```

**Pattern 4: Multi-Type Regarding Field**
```powerfx
// Handle multiple possible types for Regarding
Switch(
    true,
    IsType(ThisItem.Regarding, Accounts),
        AsType(ThisItem.Regarding, Accounts).'Account Name',
    IsType(ThisItem.Regarding, Contacts),
        AsType(ThisItem.Regarding, Contacts).'Full Name',
    IsType(ThisItem.Regarding, Opportunities),
        AsType(ThisItem.Regarding, Opportunities).'Topic',
    "Unknown"
)
```

### Key Characteristics

- Enables type casting for record references and dynamic values
- **Required for accessing fields from polymorphic lookups**
- Returns error if type is incompatible (use IsType first)
- Works with Dataverse record references
- Essential for working with Owner, Customer, Regarding fields
- Requires data sources to be added for target types
- Supports dynamic value conversion from ParseJSON and web APIs

### Important Notes

1. **Always use IsType first** to avoid errors from AsType
2. **Add all necessary data sources** before using AsType
3. **Use disambiguation operator `[@TableName]`** in gallery/form contexts
4. **Handle blank values** for optional polymorphic fields (like Customer)
5. **Dynamic value support is experimental** (not for production use)

---

## IsType - Check Record Type

### Syntax

```powerfx
IsType(RecordReference, TableType)
IsType(DynamicValue, TypeSpecification)
```

### Description

**IsType** checks whether a record reference or dynamic value matches a specific type. It returns a boolean value indicating type compatibility. This is essential for type-safe operations and should always be used before **AsType** to prevent errors.

**Key Characteristic**: IsType is **safe** to use—it never throws errors. It returns true if the record matches the type, false otherwise.

### When to Use

- Verifying record matches expected type before operations
- Type-safe conditional logic
- Preventing type mismatch errors
- Before using AsType to safely cast records
- Polymorphic data handling
- Validating component input
- Filtering records by type

### Scope and Context

- Works with record references and dynamic values
- Returns true if record matches type
- Returns false if incompatible or if record is blank
- No error thrown; safe to use for validation
- Useful for runtime type checking

### Examples in Context

#### Basic IsType Check

```powerfx
// Verify record is correct type
If(
    IsType(CurrentRecord, EmployeeType),
    Notify("Valid employee record"),
    Notify("Invalid record type")
)
```

#### IsType Before AsType (Recommended Pattern)

```powerfx
// Safe casting pattern: Always check with IsType first
If(
    IsType(ThisItem.Owner, Teams),
    AsType(ThisItem.Owner, Teams).'Team Name',
    AsType(ThisItem.Owner, Users).'Full Name'
)
```

#### IsType with Conditional Access

```powerfx
// Safe property access based on type
Label.Text = If(
    IsType(Record.Owner, Users),
    AsType(Record.Owner, Users).'Full Name',
    "Team: " & AsType(Record.Owner, Teams).'Team Name'
)
```

#### IsType in Gallery with Type Filtering

```powerfx
// Gallery shows only correctly-typed items
Gallery.Items = Filter(
    AllRecords,
    IsType(ThisRecord, EmployeeType)
)

// In gallery, safely access typed properties
Label.Text = ThisItem.EmployeeName
```

#### IsType with Multiple Type Check

```powerfx
// Check if record matches any of multiple types
If(
    Or(
        IsType(Record, EmployeeType),
        IsType(Record, ContractorType)
    ),
    "Valid staff member",
    "Invalid staff record"
)
```

#### IsType for Polymorphic Regarding Field

```powerfx
// Identify what type of record Regarding references
If(IsBlank(ThisItem.Regarding), "--",
    IsType(ThisItem.Regarding, Accounts),
        "Account: " & AsType(ThisItem.Regarding, Accounts).'Account Name',
    IsType(ThisItem.Regarding, Contacts),
        "Contact: " & AsType(ThisItem.Regarding, Contacts).'Full Name',
    IsType(ThisItem.Regarding, Opportunities),
        "Opportunity: " & AsType(ThisItem.Regarding, Opportunities).Topic,
    "Other"
)
```

#### IsType in ForAll for Selective Processing

```powerfx
// Process only records of specific type
ForAll(
    AllRecords,
    If(
        IsType(ThisRecord, OrderType),
        {
            ID: AsType(ThisRecord, OrderType).OrderID,
            Amount: AsType(ThisRecord, OrderType).Total
        }
    )
)
```

#### IsType with Component Input Validation

```powerfx
// Component validates input type
ValidData = If(
    IsType(InputData, ComponentDataType),
    AsType(InputData, ComponentDataType),
    Blank()
)

// Use validated data
Output = If(IsBlank(ValidData), "Invalid input", ValidData.ProcessedValue)
```

#### IsType for Type-Based Filtering

```powerfx
// Filter accounts by owner type
TeamOwnedAccounts = Filter(
    Accounts,
    IsType(Owner, Teams)
)

UserOwnedAccounts = Filter(
    Accounts,
    IsType(Owner, Users)
)
```

#### IsType with Dynamic Values

```powerfx
// Check if parsed JSON matches expected structure
JsonData = ParseJSON("{""a"":1}")
IsValidStructure = IsType(JsonData, Type({a: Number}))  // Returns: true

// Use conditional logic based on type check
If(IsValidStructure,
    "Valid: " & Text(AsType(JsonData, Type({a: Number})).a),
    "Invalid JSON structure"
)
```

### Common Patterns

**Pattern 1: Type-Safe Processing**
```powerfx
// Verify before processing
If(
    IsType(Record, EmployeeType),
    {
        Name: AsType(Record, EmployeeType).Name,
        Dept: AsType(Record, EmployeeType).Department,
        Status: "Valid"
    },
    {
        Name: "Unknown",
        Dept: "N/A",
        Status: "Invalid type"
    }
)
```

**Pattern 2: Polymorphic Filtering**
```powerfx
// Filter by specific type
EmployeesOnly = Filter(
    AllStaff,
    IsType(ThisRecord, Employees)
)

// Multiple type filter
StaffMembers = Filter(
    Contacts,
    IsType(ThisRecord, Employees) Or IsType(ThisRecord, Contractors)
)
```

**Pattern 3: Type-Aware Display**
```powerfx
// Display different content by type
Label.Text = Switch(
    true,
    IsType(Record.Owner, Users),
        AsType(Record.Owner, Users).'Full Name',
    IsType(Record.Owner, Teams),
        AsType(Record.Owner, Teams).'Team Name',
    "Unknown"
)
```

**Pattern 4: Safe Component Integration**
```powerfx
// Component only processes valid types
Component.Data = If(
    IsType(InputData, ComponentType),
    AsType(InputData, ComponentType),
    {Empty: true}
)

Component.OnError = Notify("Invalid data type provided")
```

### Key Characteristics

- Returns boolean (true/false)
- No error thrown; safe for validation
- Returns false if record is blank
- Works before AsType casting
- Enables type-safe conditional logic
- Essential for polymorphic data handling
- Supports runtime type checking
- Required pattern: IsType → AsType

### Best Practice: IsType Before AsType

**Always use IsType before AsType** to avoid runtime errors:

```powerfx
// Good: Check type first
If(IsType(Record.Owner, Teams),
    AsType(Record.Owner, Teams).'Team Name',
    AsType(Record.Owner, Users).'Full Name'
)

// Alternative with IfError (requires formula-level error management)
IfError(
    AsType(Record.Owner, Teams).'Team Name',
    AsType(Record.Owner, Users).'Full Name'
)
```

---

## When AsType/IsType Are Not Needed

You don't need IsType/AsType for certain operations:

### Filtering by Polymorphic Lookup
```powerfx
// No IsType/AsType needed - direct comparison works
Filter(Accounts, Owner = ComboBox1.Selected)
```

### Patching with Polymorphic Lookup
```powerfx
// No IsType/AsType needed - direct assignment works
Patch(Accounts, Gallery1.Selected, {Owner: First(Teams)})

// Conditional patch based on radio button
Patch(Accounts, Gallery1.Selected, {
    Owner: If(Radio1.Selected.Value = "Users",
        ComboBox1.Selected,
        ComboBox1_1.Selected
    )
})
```

### One-to-Many Relationships
```powerfx
// No IsType/AsType needed - relationship navigation works
Gallery2.Selected.Faxes     // All faxes for selected account
Gallery2.Selected.Activities // All activities
Gallery2.Selected.Notes      // All notes
```

---

## Comparison: ThisItem vs ThisRecord

### Key Differences

| Aspect | ThisItem | ThisRecord |
|--------|----------|-----------|
| **Availability** | Gallery, Edit form, Display form only | Any record scope function (ForAll, Filter, Sort, etc.) |
| **Required/Optional** | Always required | Optional (fields can be accessed directly) |
| **Scope** | Gallery/form control context | Function parameter context |
| **Use Case** | Displaying gallery/form rows | Processing table data in functions |
| **Can Be Overridden** | Yes (with As operator) | Yes (with As operator) |
| **Nested Behavior** | Refers to innermost gallery | Refers to innermost function scope |

### When to Use Each

**Use ThisItem:**
- You're working within a gallery, edit form, or display form
- You need the current gallery/form row data
- Displaying item properties in labels/buttons
- Gallery item navigation
- Always required—cannot be omitted

**Use ThisRecord:**
- You're in ForAll, Filter, Sort, With, or similar functions
- Processing/transforming table data
- Building collections from iteration
- Complex data manipulation
- Optional in most cases (can reference fields directly)
- Required when using Patch, Collect (to reference whole record)

### Example Comparison

```powerfx
// Using ThisItem in Gallery (REQUIRED)
Gallery.Items = Products
Label.Text = ThisItem.ProductName  // In gallery template

// Using ThisRecord in ForAll (OPTIONAL)
ForAll(
    Products,
    Collect(MyCollection, {
        Name: ThisRecord.ProductName,  // Explicit
        Price: Price                    // Implicit - same result
    })
)

// Using ThisRecord with Patch (REQUIRED)
ForAll(
    Products,
    Patch(Products, ThisRecord, {Status: "Active"})  // MUST use ThisRecord
)
```

### Modern Best Practices

- **ThisRecord** is recommended for clarity in complex formulas
- **As operator** is preferred for nested scenarios
- Always use **ThisItem** in galleries (required)
- Use **ThisRecord** with Patch/Collect (required)
- Consider readability when choosing implicit vs explicit field access

---

## Scoping Rules and Nesting

### Default Scoping Behavior

**Critical Rule**: Without the **As operator**, `ThisItem` and `ThisRecord` always refer to the **innermost scope**, making records in outer scopes inaccessible.

### Problem: Nested Galleries Without As

```powerfx
// Outer gallery
OuterGallery.Items = Categories

// Inner gallery (PROBLEM: Can't access outer scope)
InnerGallery.Items = Filter(Products, CategoryID = ???)
// ThisItem here refers to InnerGallery, not OuterGallery
// You CANNOT access the outer gallery's ThisItem
```

### Solution: Use As Operator

```powerfx
// Outer gallery: Use As to name the record
OuterGallery.Items = Categories As Category

// Inner gallery: Now you can reference outer scope
InnerGallery.Items = Filter(Products, CategoryID = Category.ID)

// In inner gallery label: Access both scopes
Label.Text = Category.CategoryName & " - " & ThisItem.ProductName
```

### Nested ForAll Example

```powerfx
// Without As: Cannot access outer scope
ForAll(
    Categories,
    ForAll(
        Products,
        // PROBLEM: Can only access inner Products scope
        // Cannot reference outer Categories scope
    )
)

// With As: All scopes accessible
ForAll(
    Categories As Cat,
    ForAll(
        Filter(Products, CategoryID = Cat.ID) As Prod,
        {
            CategoryName: Cat.Name,      // Outer scope
            ProductName: Prod.Name,      // Inner scope
            Combined: Cat.Name & " - " & Prod.Name
        }
    )
)
```

### Multiple Nesting Levels

```powerfx
// Three-level nesting with As
ForAll(
    Regions As Region,
    ForAll(
        Filter(Stores, RegionID = Region.ID) As Store,
        ForAll(
            Filter(Products, StoreID = Store.ID) As Product,
            {
                RegionName: Region.Name,      // Outer scope
                StoreName: Store.Name,        // Middle scope
                ProductName: Product.Name,    // Inner scope
                FullPath: Region.Name & " > " & Store.Name & " > " & Product.Name
            }
        )
    )
)
```

---

## Common Patterns and Best Practices

### Pattern 1: Gallery with Polymorphic Lookup Display

```powerfx
// Gallery showing accounts with owner information
Gallery.Items = Accounts

// In gallery label:
Label.Text = If(
    IsType(ThisItem.Owner, [@Teams]),
    "Team: " & AsType(ThisItem.Owner, [@Teams]).'Team Name',
    "User: " & AsType(ThisItem.Owner, [@Users]).'Full Name'
)
```

### Pattern 2: Nested Gallery with Parent Reference

```powerfx
// Outer gallery: Categories
OuterGallery.Items = Categories As Category

// Inner gallery: Products in selected category
InnerGallery.Items = Filter(Products, CategoryID = Category.ID)

// In inner gallery: Display with category name
Label.Text = Category.CategoryName & " - " & ThisItem.ProductName & " ($" & Text(ThisItem.Price, "0.00") & ")"
```

### Pattern 3: ForAll with Type-Safe Processing

```powerfx
// Process records with type validation
ForAll(
    Accounts As Account,
    If(
        IsType(Account.Owner, Teams),
        {
            AccountName: Account.'Account Name',
            OwnerType: "Team",
            OwnerName: AsType(Account.Owner, Teams).'Team Name'
        },
        {
            AccountName: Account.'Account Name',
            OwnerType: "User",
            OwnerName: AsType(Account.Owner, Users).'Full Name'
        }
    )
)
```

### Pattern 4: Responsive Container with Self and Parent

```powerfx
// Container scales to parent
Container.Width = Parent.Width - 20
Container.Height = Parent.Height - 100

// Child controls position relative to parent and self
Button.X = Parent.Width - Self.Width - 10
Button.Y = Parent.Height - Self.Height - 10

// Dynamic sizing based on parent
Gallery.Height = Self.Parent.Height - HeaderHeight.Height - ButtonContainer.Height
```

### Pattern 5: Component with Type Validation

```powerfx
// Component input property
Component.InputRecord = SelectedItem

// Inside component: Validate and cast
ValidatedData = If(
    IsBlank(InputRecord),
    Blank(),
    IsType(InputRecord, ExpectedType),
    AsType(InputRecord, ExpectedType),
    Blank()
)

// Display with error handling
Component.DisplayText = If(
    IsBlank(ValidatedData),
    "No data or invalid type",
    ValidatedData.Name
)

Component.HasError = IsBlank(ValidatedData) And Not IsBlank(InputRecord)
```

---

## Summary Table: When to Use What

| Scenario | Use | Required? | Reason |
|----------|-----|-----------|--------|
| Display gallery row data | **ThisItem** | Yes | Implicit gallery context |
| Process data in ForAll (general) | **ThisRecord** | No | Optional - can reference fields directly |
| Process with Patch/Collect | **ThisRecord** | Yes | Required to reference whole record |
| Explicit iteration naming | **As** alias | No | Self-documenting code |
| Nested galleries/iterations | **As** alias | Yes | Access outer scopes |
| Control self-reference | **Self** | No | Avoid circular dependencies |
| Child references parent | **Parent** | No | Responsive layouts |
| Access polymorphic lookup fields | **IsType + AsType** | Yes | Type-safe field access |
| Validate record type | **IsType** | Yes | Before using AsType |
| Convert dynamic values | **AsType** | No | Explicit type conversion |

---

## References and Additional Resources

### Microsoft Learn Documentation

1. **Operators and Identifiers in Power Apps**
   - https://learn.microsoft.com/en-us/power-platform/power-fx/reference/operators

2. **AsType and IsType functions**
   - https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-astype-istype

3. **Record references and polymorphic lookups**
   - https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/working-with-references

4. **ForAll function**
   - https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-forall

5. **Gallery control in Power Apps**
   - https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/controls/control-gallery

6. **Formula reference - canvas apps**
   - https://learn.microsoft.com/en-us/power-platform/power-fx/formula-reference-canvas-apps

7. **Create responsive layouts in canvas apps**
   - https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/create-responsive-layout

8. **Card control in Power Apps**
   - https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/controls/control-card

9. **Select function (Parent propagation)**
   - https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-select

---

## Glossary

**Record**: A structured collection of fields/properties, like a row in a table.

**Record Reference**: A pointer to a record without including a complete copy of the data.

**Polymorphic Lookup**: A lookup field that can reference records from multiple different tables (e.g., Owner can be User or Team).

**Type**: A structured definition of what properties a record should contain.

**Context**: The scope in which a formula is evaluated; different contexts have different available variables.

**Implicit Context**: Accessing the current record without explicit parameter (e.g., referencing fields directly in Filter).

**Explicit Context**: Using a named variable (As alias or ThisRecord) for the current record.

**Type Casting**: Converting a record to be treated as a specific type (AsType).

**Type Checking**: Verifying a record matches an expected type (IsType).

**Parent Container**: The control that contains the current control.

**Scoped Variable**: A variable that exists only within a specific formula or function.

**Operator**: A keyword that provides access to contextual information (ThisItem, Self, Parent are operators, not properties).

**Disambiguation Operator**: The `[@TableName]` syntax used in gallery/form contexts to distinguish between table names and one-to-many relationships.

---

## Document Information

- **Created**: 2025-12-12
- **Last Updated**: 2025-12-12
- **Document Version**: 2.0
- **Verification Date**: 2025-12-12
- **Source**: Microsoft Learn - Power Platform Power Fx Documentation
- **Format**: Markdown
- **Target Audience**: Power Apps makers, developers, formula authors

---

## Key Corrections Made in Version 2.0

Based on current Microsoft Learn documentation (verified 2025-12-12):

1. **ThisItem**: Clarified it's **always required** and cannot be omitted in galleries and forms
2. **ThisRecord**: Clarified it's **optional** in most contexts (fields can be accessed directly), but **required** with Patch/Collect to reference whole record
3. **As operator**: Emphasized it's **required for nested scenarios** to access outer scopes
4. **Self and Parent**: Clarified they are **operators**, not properties—cannot chain them
5. **AsType/IsType**: Added comprehensive polymorphic lookup documentation with Dataverse-specific examples
6. **Parent in galleries**: Added correct usage of `Parent.TemplateHeight` and `Parent.TemplateWidth`
7. **Scoping rules**: Added critical nesting behavior and As operator requirements
8. **Disambiguation operator**: Added `[@TableName]` syntax for gallery/form contexts
9. **When AsType/IsType not needed**: Added section on direct comparisons and Patch operations
10. **Dynamic values**: Added experimental feature notes for AsType/IsType with ParseJSON

All information verified against official Microsoft Learn documentation as of December 12, 2025.

## Sources

- [Microsoft Learn - Operators and Identifiers in Power Apps](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/operators)
- [Microsoft Learn: function-astype-istype](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-astype-istype)
- [Microsoft Learn: working-with-references](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/working-with-references)
- [Microsoft Learn: function-forall](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-forall)
- [Microsoft Learn: control-gallery](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/controls/control-gallery)
- [Microsoft Learn: formula-reference-canvas-apps](https://learn.microsoft.com/en-us/power-platform/power-fx/formula-reference-canvas-apps)
- [Microsoft Learn: create-responsive-layout](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/create-responsive-layout)
- [Microsoft Learn: control-card](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/controls/control-card)
- [Microsoft Learn: function-select](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-select)
