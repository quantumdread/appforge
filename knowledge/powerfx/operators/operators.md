# PowerFx Operators Reference - Power Apps Canvas Apps

Complete reference for all operators in Microsoft Power Fx formula language for Power Apps Canvas Apps.

## Overview

Microsoft Power Fx supports various operator categories for building expressions. Operators enable arithmetic calculations, text concatenation, logical operations, comparisons, and more. Some operators are language-dependent based on the authoring language.

---

## Table of Contents

1. [Arithmetic Operators](#arithmetic-operators)
2. [Comparison Operators](#comparison-operators)
3. [Logical Operators](#logical-operators)
4. [String Operators](#string-operators)
5. [Membership Operators](#membership-operators)
6. [Property Access Operators](#property-access-operators)
7. [Disambiguation Operators](#disambiguation-operators)
8. [Structural Operators](#structural-operators)
9. [Operator Precedence](#operator-precedence)
10. [Language Dependencies](#language-dependencies)

---

## Arithmetic Operators

### Addition (+)

**Syntax:** `Number1 + Number2`

**Description:** Adds two numbers together.

**Examples:**
```powerfx
1 + 2                           // 3
Price + Tax                     // 105.50 (if Price = 100, Tax = 5.50)
Quantity.Value + 10             // Adds 10 to slider value
Sum(Sales, Amount) + Bonus      // Total sales plus bonus

// Date arithmetic
Today() + 7                     // 7 days from today
DatePicker1.SelectedDate + 30   // Add 30 days
```

**Common Patterns:**
```powerfx
// Calculate total price
Total = Subtotal + Tax + Shipping

// Increment counter
Set(varCounter, varCounter + 1)

// Add days to date
DueDate = StartDate + Duration
```

---

### Subtraction (-)

**Syntax:**
- `Number1 - Number2` (binary operator)
- `-Number` (unary operator for negative sign)

**Description:** Subtracts one number from another, or denotes a negative number.

**Examples:**
```powerfx
10 - 3                          // 7
Price - Discount                // 90 (if Price = 100, Discount = 10)
-42                             // Negative forty-two
Slider1.Value - Slider2.Value   // Difference between sliders

// Date arithmetic
Today() - 7                     // 7 days ago
EndDate - StartDate             // Duration in days (returns number)
DateDiff(StartDate, EndDate, Days) // More explicit date difference
```

**Common Patterns:**
```powerfx
// Calculate discount
Savings = OriginalPrice - SalePrice

// Countdown
RemainingDays = DueDate - Today()

// Decrement counter
Set(varCount, varCount - 1)
```

---

### Multiplication (*)

**Syntax:** `Number1 * Number2`

**Description:** Multiplies two numbers.

**Examples:**
```powerfx
2 * 3                           // 6
Price * Quantity                // 500 (if Price = 50, Quantity = 10)
Hours.Value * HourlyRate        // Calculate pay
Length * Width                  // Area calculation

// Convert units
Miles * 1.60934                 // Miles to kilometers
Celsius * 9/5 + 32              // Celsius to Fahrenheit
```

**Common Patterns:**
```powerfx
// Calculate line item total
LineTotal = Quantity * UnitPrice

// Apply percentage
DiscountAmount = Price * DiscountPercent / 100

// Scale values
ScaledValue = Original * ScaleFactor
```

---

### Division (/)

**Syntax:** `Number1 / Number2`

**Description:** Divides one number by another. Returns decimal result.

**Examples:**
```powerfx
10 / 2                          // 5
100 / 3                         // 33.333333...
Total / Count                   // Average
Revenue / Costs                 // Profit margin ratio

// Percentage calculation
(Completed / Total) * 100       // Completion percentage
(Sales / Target) * 100          // Target achievement

// Time conversion
Minutes / 60                    // Convert to hours
```

**Common Patterns:**
```powerfx
// Calculate average
Average = Sum(Data, Amount) / CountRows(Data)

// Split equally
ShareAmount = TotalAmount / NumberOfPeople

// Percentage
PercentComplete = (CompletedTasks / TotalTasks) * 100

// Note: Use Mod() function for remainder
Remainder = Mod(17, 5)          // 2
```

---

### Exponentiation (^)

**Syntax:** `Base ^ Exponent`

**Description:** Raises a number to a power. Equivalent to the `Power()` function.

**Examples:**
```powerfx
2 ^ 3                           // 8 (2 cubed)
10 ^ 2                          // 100 (10 squared)
Base.Value ^ Exponent.Value     // Dynamic calculation
Power(2, 3)                     // Same as 2 ^ 3

// Square root using fractional exponent
16 ^ 0.5                        // 4 (square root)
27 ^ (1/3)                      // 3 (cube root)

// Scientific calculations
1.5 ^ 2.5                       // 2.755676
```

**Common Patterns:**
```powerfx
// Area of square
Area = Side ^ 2

// Compound interest
FutureValue = Principal * (1 + Rate) ^ Years

// Volume of cube
Volume = EdgeLength ^ 3

// Distance formula (Pythagorean theorem)
Distance = (DeltaX ^ 2 + DeltaY ^ 2) ^ 0.5
```

---

### Percentage (%)

**Syntax:** `Number%`

**Description:** Postfix operator equivalent to multiplying by 0.01 (dividing by 100).

**Examples:**
```powerfx
20%                             // 0.20
100 * 20%                       // 20
Price * 15%                     // 15% of price
50%                             // 0.5

// Tax calculation
TotalPrice = Price * (1 + TaxRate%)

// Discount application
DiscountedPrice = Price * (100% - DiscountRate%)
```

**Common Patterns:**
```powerfx
// Apply tax
FinalPrice = BasePrice + (BasePrice * 8.5%)

// Calculate discount
Savings = OriginalPrice * 25%

// Tip calculation
Tip = BillAmount * 18%

// Completion percentage display
Text(CompletionRate%, "0.0%")   // Format as percentage
```

---

## Comparison Operators

### Equal To (=)

**Syntax:** `Value1 = Value2`

**Description:** Returns `true` if values are equal, `false` otherwise. Works with numbers, text, dates, booleans, and records.

**Examples:**
```powerfx
5 = 5                           // true
"Hello" = "Hello"               // true
"Hello" = "hello"               // false (case-sensitive)
Status.Value = "Approved"       // Check dropdown value
Today() = DatePicker1.SelectedDate  // Compare dates

// Null/Blank comparison
FirstName = ""                  // Check if empty string
IsBlank(FirstName)              // Better for null/blank checks

// Boolean comparison
Toggle1.Value = true
CheckBox1.Value = false
```

**Common Patterns:**
```powerfx
// Filter by exact match
Filter(Orders, Status = "Pending")

// Conditional visibility
ErrorLabel.Visible = ErrorMessage <> ""

// Button state
SubmitButton.DisplayMode = If(
    Status = "Draft",
    DisplayMode.Edit,
    DisplayMode.Disabled
)

// Match current user
Filter(Tasks, AssignedTo = User().Email)
```

---

### Not Equal To (<>)

**Syntax:** `Value1 <> Value2`

**Description:** Returns `true` if values are not equal, `false` if they are equal.

**Examples:**
```powerfx
5 <> 3                          // true
"Yes" <> "No"                   // true
"Yes" <> "yes"                  // true (case-sensitive)
Status.Value <> "Completed"     // Check if not completed

// Filter exclusions
Filter(Products, Category <> "Discontinued")

// Validation
Name.Text <> ""                 // Not empty (but use IsBlank instead)
Not(IsBlank(Name.Text))         // Preferred method
```

**Common Patterns:**
```powerfx
// Show warning if changed
WarningLabel.Visible = CurrentValue <> OriginalValue

// Filter out specific status
Filter(Records, Status <> "Deleted" && Status <> "Archived")

// Validate required field (better use IsBlank)
If(
    Name.Text <> "",
    "Valid",
    "Name required"
)

// Hide when specific value
Panel.Visible = SelectedTab <> "Settings"
```

---

### Greater Than (>)

**Syntax:** `Value1 > Value2`

**Description:** Returns `true` if left value is greater than right value.

**Examples:**
```powerfx
10 > 5                          // true
Age.Value > 18                  // Check if over 18
Price > Budget                  // Over budget check
Today() > DueDate               // Past due

// String comparison (lexicographic)
"B" > "A"                       // true
"apple" > "Banana"              // true (lowercase > uppercase in ASCII)
```

**Common Patterns:**
```powerfx
// Filter by threshold
Filter(Sales, Amount > 1000)

// Validation
If(Quantity.Value > 0, "Valid", "Must be positive")

// Conditional formatting
If(
    Temperature > 100,
    RGBA(255, 0, 0, 1),     // Red
    RGBA(0, 255, 0, 1)      // Green
)

// Date validation
If(EndDate > StartDate, true, false)
```

---

### Greater Than or Equal To (>=)

**Syntax:** `Value1 >= Value2`

**Description:** Returns `true` if left value is greater than or equal to right value.

**Examples:**
```powerfx
10 >= 10                        // true
Age.Value >= 21                 // Legal drinking age
Score >= PassingScore           // Pass/fail check
RemainingStock >= OrderQuantity // Sufficient inventory

// Date range
Today() >= StartDate && Today() <= EndDate
```

**Common Patterns:**
```powerfx
// Range validation
If(
    Age.Value >= 18 && Age.Value <= 65,
    "Valid age",
    "Out of range"
)

// Inventory check
If(
    StockLevel >= MinimumStock,
    "Sufficient",
    "Reorder needed"
)

// Permission level
UserLevel >= RequiredLevel
```

---

### Less Than (<)

**Syntax:** `Value1 < Value2`

**Description:** Returns `true` if left value is less than right value.

**Examples:**
```powerfx
5 < 10                          // true
Price < Budget                  // Under budget
Quantity.Value < MinimumOrder   // Below minimum
Today() < StartDate             // Before start date
```

**Common Patterns:**
```powerfx
// Filter low values
Filter(Inventory, StockLevel < ReorderPoint)

// Early bird pricing
If(
    Today() < EarlyBirdDeadline,
    EarlyPrice,
    RegularPrice
)

// Validation
ErrorLabel.Visible = Password.Text.Length < 8
```

---

### Less Than or Equal To (<=)

**Syntax:** `Value1 <= Value2`

**Description:** Returns `true` if left value is less than or equal to right value.

**Examples:**
```powerfx
5 <= 10                         // true
10 <= 10                        // true
Score <= 100                    // Valid score range
Age.Value <= 17                 // Minor

// Date range check
RequestDate <= Today()          // Not future date
```

**Common Patterns:**
```powerfx
// Range filter
Filter(
    Products,
    Price >= MinPrice && Price <= MaxPrice
)

// Capacity check
If(
    Attendees <= MaxCapacity,
    "Registration open",
    "Event full"
)

// Percentage validation
If(
    DiscountRate <= 50,
    "Valid discount",
    "Discount too high"
)
```

---

## Logical Operators

### AND (&&)

**Syntax:**
- `Condition1 && Condition2` (JavaScript syntax)
- `Condition1 And Condition2` (Visual Basic syntax)
- `And(Condition1, Condition2, ...)` (Function syntax - supports multiple arguments)

**Description:** Logical conjunction. Returns `true` only if ALL conditions are `true`.

**Examples:**
```powerfx
// Operator syntax
true && true                    // true
true && false                   // false
Price < 100 && Quantity > 10    // Both must be true

// Function syntax
And(a, b, c, d)                 // All must be true
And(
    Not(IsBlank(Name.Text)),
    IsMatch(Email.Text, Email),
    Age.Value >= 18
)

// Multiple conditions
Status = "Approved" &&
Budget > Cost &&
StartDate <= Today()
```

**Common Patterns:**
```powerfx
// Form validation
FormIsValid = And(
    Not(IsBlank(FirstName.Text)),
    Not(IsBlank(LastName.Text)),
    IsMatch(Email.Text, Email),
    Age.Value >= 18
)

// Button enable/disable
SubmitButton.DisplayMode = If(
    Name.Text <> "" && Email.Text <> "" && AgreeCheckbox.Value,
    DisplayMode.Edit,
    DisplayMode.Disabled
)

// Complex filter
Filter(
    Orders,
    Status = "Pending" &&
    Priority = "High" &&
    AssignedTo = User().Email
)

// Range validation
ValidInput = Value >= MinValue && Value <= MaxValue
```

**Short-Circuit Evaluation:**
```powerfx
// Stops at first false condition
varEnabled && ExpensiveFunction()  // ExpensiveFunction only runs if varEnabled is true

// Safe null checking
Not(IsBlank(Record)) && Record.Status = "Active"
```

---

### OR (||)

**Syntax:**
- `Condition1 || Condition2` (JavaScript syntax)
- `Condition1 Or Condition2` (Visual Basic syntax)
- `Or(Condition1, Condition2, ...)` (Function syntax - supports multiple arguments)

**Description:** Logical disjunction. Returns `true` if ANY condition is `true`.

**Examples:**
```powerfx
// Operator syntax
true || false                   // true
false || false                  // false
Status = "Draft" || Status = "Pending"

// Function syntax
Or(a, b, c)                     // Any can be true
Or(
    User().Email = Admin1,
    User().Email = Admin2,
    UserRole = "Administrator"
)

// Multiple status check
Status = "Approved" ||
Status = "Pending" ||
Status = "In Review"
```

**Common Patterns:**
```powerfx
// Access control
UserHasAccess = Or(
    User().Email in Admins.Email,
    User().Email in Managers.Email,
    varUserRole = "Owner"
)

// Search multiple fields
Or(
    SearchTerm in Title,
    SearchTerm in Description,
    SearchTerm in Category
)

// Status filtering
Filter(
    Tasks,
    Status = "Open" || Status = "In Progress" || Status = "Pending"
)

// Alternative: Use in operator with table
Filter(
    Tasks,
    Status in ["Open", "In Progress", "Pending"]
)

// Emergency access
Or(varIsEmergency, varOverrideEnabled, User().Email = "admin@company.com")
```

**Short-Circuit Evaluation:**
```powerfx
// Stops at first true condition
varCacheHit || ExpensiveAPICall()  // API only called if cache miss
```

---

### NOT (!)

**Syntax:**
- `!Condition` (JavaScript syntax - prefix)
- `Not Condition` (Visual Basic syntax - prefix)
- `Not(Condition)` (Function syntax)

**Description:** Logical negation. Inverts boolean value - returns `true` if condition is `false`, and vice versa.

**Examples:**
```powerfx
// Operator syntax
!true                           // false
!false                          // true
!(x > 10)                       // true if x <= 10
!IsBlank(Name.Text)             // Name is NOT blank

// Function syntax
Not(true)                       // false
Not(Status = "Completed")       // Status is not completed
Not(IsBlank(Email.Text))        // Email is not blank

// Negating comparisons
!(Price > 100)                  // Same as: Price <= 100
!varShowPanel                   // Panel is hidden
```

**Common Patterns:**
```powerfx
// Validate NOT blank
If(
    !IsBlank(Name.Text),
    "Valid",
    "Name required"
)

// Toggle boolean variable
Set(varShowPanel, !varShowPanel)

// Filter exclusions
Filter(Products, !Discontinued)
Filter(Orders, Not(Status = "Cancelled"))

// Disable button when invalid
SubmitButton.DisplayMode = If(
    !(IsBlank(Name.Text) || IsBlank(Email.Text)),
    DisplayMode.Edit,
    DisplayMode.Disabled
)

// Show error on validation failure
ErrorLabel.Visible = !FormIsValid

// Hide completed items
Filter(Tasks, Not(IsComplete))
```

**De Morgan's Laws (Logical Equivalence):**
```powerfx
// These pairs are equivalent:
Not(A && B)  =  !A || !B
Not(A || B)  =  !A && !B

// Example:
Not(Status = "Closed" && Priority = "Low")
// Is same as:
Status <> "Closed" || Priority <> "Low"
```

**Prefer Direct Comparison:**
```powerfx
// Instead of:
Not(Status = "Active")

// Prefer:
Status <> "Active"

// Instead of:
!(x > 10)

// Prefer:
x <= 10
```

---

## String Operators

### String Concatenation (&)

**Syntax:** `String1 & String2 & String3 ...`

**Description:** Concatenates (joins) multiple text strings into a single string. Equivalent to Excel's ampersand operator.

**Examples:**
```powerfx
// Basic concatenation
"Hello" & " " & "World"         // "Hello World"
"Total: " & "100"               // "Total: 100"
FirstName.Text & " " & LastName.Text  // "John Doe"

// With variables
"Order #" & varOrderNumber      // "Order #12345"
"Welcome, " & User().FullName   // "Welcome, John Smith"

// Numeric to string conversion (automatic)
"Quantity: " & Quantity.Value   // "Quantity: 42"
"Price: $" & Price              // "Price: $99.99"

// Multi-line with Char(10)
"Line 1" & Char(10) & "Line 2"  // Two lines

// Date concatenation
"Due Date: " & Text(DueDate, "mm/dd/yyyy")
```

**Common Patterns:**
```powerfx
// Full name
FullName = FirstName.Text & " " & LastName.Text

// Address formatting
FullAddress =
    Street & ", " &
    City & ", " &
    State & " " &
    ZipCode

// Build URL
APIUrl = BaseURL & "/api/v1/" & ResourceType & "/" & RecordID

// Email subject
EmailSubject = "[" & Priority & "] " & Title

// Display message
"Hello " & User().FullName & ", you have " &
CountRows(Notifications) & " new messages."

// Build filter display
FilterText = "Showing: " &
    If(varFilterActive, FilterName, "All Items") &
    " (" & CountRows(FilteredData) & " items)"

// Dynamic label
StatusLabel.Text =
    "Status: " &
    If(IsBlank(Status), "Unknown", Status) &
    " | Last Updated: " &
    Text(LastModified, ShortDateTime)
```

**vs Concatenate Function:**
```powerfx
// & operator (preferred for simple cases)
FirstName & " " & LastName

// Concatenate function (for dynamic lists)
Concatenate(FirstName, " ", LastName)

// Concat function (for collections)
Concat(Users, Name, ", ")       // "John, Jane, Bob"
```

**Type Coercion:**
```powerfx
// Numbers automatically convert to text
"Total: " & 100                 // "Total: 100"
"Count: " & Slider1.Value       // "Count: 50"

// Dates must be formatted explicitly
"Today: " & Text(Today(), "mm/dd/yyyy")

// Booleans convert to lowercase text
"Active: " & Toggle1.Value      // "Active: true" or "Active: false"

// Format numbers with Text()
"Price: $" & Text(Price, "[$-en-US]$#,##0.00")  // "Price: $1,234.56"
```

---

### String Interpolation ($"...")

**Syntax:** `$"Text with {Expression} embedded"`

**Description:** Embeds formula expressions within text strings using curly braces. Modern alternative to concatenation.

**Examples:**
```powerfx
// Basic interpolation
$"Hello {User().FullName}"
$"Total: {Sum(Cart, Price)}"
$"Order #{varOrderID}"

// Multiple expressions
$"Welcome, {FirstName}! You have {CountRows(Notifications)} new messages."

// With formatting
$"Price: {Text(Price, '[$-en-US]$#,##0.00')}"
$"Due: {Text(DueDate, 'mm/dd/yyyy')}"

// Complex expressions
$"Status: {If(IsComplete, 'Done', 'Pending')} ({CompletionPercent}%)"

// Multi-line
$"Order Summary
Total Items: {CountRows(OrderItems)}
Subtotal: ${Subtotal}
Tax: ${Tax}
Total: ${Total}"
```

**Common Patterns:**
```powerfx
// Notification messages
Notify(
    $"Record '{RecordName}' has been {If(varIsNew, 'created', 'updated')} successfully.",
    NotificationType.Success
)

// Dynamic labels
Label1.Text = $"Showing {CountRows(Filtered)} of {CountRows(AllData)} records"

// API endpoints
APICall = $"{BaseURL}/api/customers/{CustomerId}/orders"

// Email templates
EmailBody = $"Dear {CustomerName},

Your order #{OrderNumber} has been {Status}.

Order Total: {Text(Total, '[$-en-US]$#,##0.00')}
Estimated Delivery: {Text(DeliveryDate, 'longdate')}

Thank you!"

// Validation messages
$"Value must be between {MinValue} and {MaxValue}"
```

---

## Membership Operators

### in (case-insensitive)

**Syntax:**
- `Item in Collection` (membership test)
- `SubString in String` (substring test)

**Description:** Tests if an item exists in a collection/table or if a substring exists in a string. Case-INSENSITIVE.

**Examples:**
```powerfx
// Substring search (case-insensitive)
"the" in "The quick brown fox"      // true
"WORLD" in "Hello World"            // true (case-insensitive)
"xyz" in "alphabet"                 // false
SearchBox.Text in ProductName       // Search products

// Collection membership
Gallery1.Selected in SavedItems     // Check if selected item is saved
User().Email in AdminList.Email     // Check if user is admin

// Value in list
Status in ["Pending", "Approved", "In Progress"]

// Table field search
"error" in LogEntry.Message         // Find error in logs
```

**Common Patterns:**
```powerfx
// Search filter (case-insensitive)
Filter(
    Products,
    SearchBox.Text in ProductName || SearchBox.Text in Description
)

// Permission checking
If(
    User().Email in Administrators.Email,
    Navigate(AdminScreen),
    Notify("Access denied", NotificationType.Error)
)

// Tag search
Filter(
    Articles,
    "powerapps" in Tags
)

// Multi-field search
Filter(
    Contacts,
    SearchTerm in FirstName ||
    SearchTerm in LastName ||
    SearchTerm in Email
)

// Favorite/bookmark check
FavoriteIcon.Icon = If(
    ThisItem in FavoritesList,
    Icon.HeartFill,
    Icon.Heart
)

// Status validation
If(
    Status.Selected.Value in ["Draft", "Pending", "Rejected"],
    DisplayMode.Edit,
    DisplayMode.View
)
```

**Limitations:**
```powerfx
// Case-insensitive
"Hello" in "hello world"            // true (matches despite case)

// Delegation Warning: 'in' may not be delegable with all data sources
// Check for blue underline in formula bar
Filter(SharePointList, SearchTerm in Title)  // May not delegate
```

---

### exactin (case-sensitive)

**Syntax:**
- `Item exactin Collection` (membership test)
- `SubString exactin String` (substring test)

**Description:** Tests if an item exists in a collection/table or if a substring exists in a string. Case-SENSITIVE.

**Examples:**
```powerfx
// Substring search (case-sensitive)
"The" exactin "The quick brown fox"    // true
"the" exactin "The quick brown fox"    // false (case matters!)
"WORLD" exactin "Hello World"          // false
"World" exactin "Hello World"          // true

// Collection membership (case-sensitive)
Gallery1.Selected exactin SavedItems
User().Email exactin AdminList.Email

// Exact value matching
"Pending" exactin ["Pending", "Approved"]  // true
"pending" exactin ["Pending", "Approved"]  // false (case matters)
```

**Common Patterns:**
```powerfx
// Case-sensitive search
Filter(
    Products,
    SearchBox.Text exactin ProductSKU  // Exact SKU match
)

// Code/ID validation
Filter(
    Records,
    "ERR" exactin StatusCode           // Find error codes
)

// Case-sensitive tag search
Filter(
    Documents,
    "PowerApps" exactin Tags           // Exact tag match
)

// Username validation (case-sensitive)
If(
    InputUsername.Text exactin ValidUsernames.Username,
    "Valid",
    "Invalid username (case-sensitive)"
)

// Password checking (always use exactin for passwords)
If(
    EnteredPassword.Text exactin StoredPassword,
    // Login successful
    // Note: Never store passwords in plain text in production!
)
```

**in vs exactin Decision Guide:**
```powerfx
// Use 'in' for:
- User search (flexible matching)
- General text search
- Tag/category search (when case doesn't matter)
- Email search

// Use 'exactin' for:
- SKUs, Product Codes, Part Numbers
- Case-sensitive identifiers
- Passwords (in secure contexts)
- Exact code matching
- Case-sensitive languages/terms

// Example comparison:
"error" in "Error occurred"              // true (flexible search)
"error" exactin "Error occurred"         // false (case mismatch)
"Error" exactin "Error occurred"         // true (exact match)
```

---

## Property Access Operators

### Dot Operator (.)

**Syntax:**
- `Control.Property`
- `Record.Field`
- `Enumeration.Value`
- `Signal.Property`

**Description:** Accesses properties from controls, record fields, enumerations, and signals.

**Examples:**
```powerfx
// Control properties
Slider1.Value                   // Get slider value
TextInput1.Text                 // Get text input
Gallery1.Selected               // Get selected item
Button1.DisplayMode             // Get button display mode

// Record fields
ThisItem.Title                  // Gallery item field
FirstRow(Products).Name         // First product name
LookUp(Users, ID = 1).Email     // Specific user's email

// Enumerations
Color.Red                       // Color enumeration
DisplayMode.Edit                // DisplayMode enumeration
Layout.Vertical                 // Layout enumeration
Icon.AddUser                    // Icon enumeration

// Signals
Acceleration.X                  // Device acceleration X-axis
Location.Latitude               // GPS latitude
Connection.Connected            // Network connection status
Compass.Heading                 // Device compass heading

// Nested properties
Gallery1.Selected.Manager.Email  // Nested navigation
ThisItem.Customer.Address.City   // Multi-level nesting
```

**Common Patterns:**
```powerfx
// Get control values
Set(varName, TextInput_Name.Text)
Set(varDate, DatePicker1.SelectedDate)
Set(varAmount, Slider_Amount.Value)

// Access gallery selected item
Navigate(
    DetailScreen,
    ScreenTransition.Cover,
    { SelectedRecord: Gallery1.Selected }
)

// Set control properties
UpdateContext({
    _buttonColor: Button1.Fill,
    _buttonText: Button1.Text
})

// Record field access in formulas
Filter(
    Orders,
    Customer.Status = "Active" &&
    Customer.CreditLimit > ThisItem.OrderTotal
)

// Enumeration usage
If(
    Status = "Error",
    Notify("An error occurred", NotificationType.Error, Color.Red),
    Notify("Success", NotificationType.Success, Color.Green)
)

// Signal monitoring
If(
    Connection.Connected,
    "Online - Sync enabled",
    "Offline - Changes saved locally"
)
```

**Backward Compatibility:**
```powerfx
// Old syntax (still works but deprecated)
TextInput1!Text                 // ! instead of .
Gallery1!Selected               // Not recommended

// Modern syntax (preferred)
TextInput1.Text
Gallery1.Selected
```

**Disambiguation:**
```powerfx
// When field name conflicts with global
// Use @ operator (see Disambiguation section)
Table[@FieldName]
```

---

## Disambiguation Operators

### @ Operator (Field Disambiguation)

**Syntax:**
- `Table[@FieldName]` - Access field from outer scope
- `[@GlobalVariable]` - Access global variable

**Description:** Resolves naming conflicts when field names in record scopes override variables or fields from outer scopes.

**Examples:**
```powerfx
// Access global variable in record scope
ForAll(
    Products,
    Price * [@TaxRate]  // Use global TaxRate variable
)

// Access outer table field when name conflicts
ForAll(
    Orders,
    Patch(
        OrderDetails,
        Defaults(OrderDetails),
        {
            OrderID: Orders[@ID],      // Order's ID
            ProductID: Products.ID      // Product's ID (inner scope)
        }
    )
)

// Access context variable
ForAll(
    CheckedItems,
    Patch(
        DataSource,
        LookUp(DataSource, ID = CheckedItems[@ID]),  // Disambiguate ID
        { Status: "Done" }
    )
)
```

**Common Patterns:**
```powerfx
// Scenario: ForAll with field name matching collection name
ForAll(
    Products,
    Patch(
        OrderItems,
        Defaults(OrderItems),
        {
            ProductID: Products[@ID],        // Outer scope
            Quantity: QuantityInput.Value,
            UnitPrice: [@DefaultPrice]       // Global variable
        }
    )
)

// Global variable disambiguation
UpdateContext({ Value: 100 });  // Context variable named "Value"
Set(Value, 200);                // Global variable named "Value"

ForAll(
    Collection,
    Collection[@Value] + [@Value]  // Context var + Global var
)

// Nested ForAll with same field names
ForAll(
    Categories As Cat,                    // Outer loop
    ForAll(
        Products,
        Filter(
            Products,
            CategoryID = Cat[@ID]         // Access outer Category ID
        )
    )
)

// Data source disambiguation (avoid Contacts conflict)
Patch(
    [@Contacts],                          // Global data source
    ThisRecord,
    { Status: "Updated" }
)
```

**When to Use @ Operator:**

```powerfx
// 1. Context variable conflicts with field name
UpdateContext({ Status: "Draft" });     // Context var
ForAll(
    Records,
    Records.Status & ": " & [@Status]   // Record field : Context var
)

// 2. Field name shadows global variable
Set(Total, 1000);                       // Global var
ForAll(
    LineItems,
    LineItems.Total + [@Total]          // Line total + Global total
)

// 3. Nested record scopes
ForAll(
    Orders As Order,
    ForAll(
        OrderDetails,
        {
            OrderID: Order[@ID],          // Outer OrderID
            DetailID: OrderDetails.ID      // Inner DetailID
        }
    )
)

// 4. Using sample Contacts table (Microsoft-specific)
// Must use [@...] to avoid Dataverse relationship conflicts
Collect(
    myContacts,
    [@Contacts]                           // Required for sample data
)
```

**Without Disambiguation (Error):**
```powerfx
// This will fail if 'Value' exists in both scopes
ForAll(
    Collection,
    Collection.Value + Value  // Ambiguous!
)

// This will fail with nested identical field names
ForAll(
    Table1,
    ForAll(
        Table2,
        Table1.ID + Table2.ID  // Which Table1 if nested?
    )
)
```

---

## Structural Operators

### Parentheses ( )

**Syntax:** `(Expression)`

**Description:** Groups expressions and enforces precedence order. Also used for function arguments.

**Examples:**
```powerfx
// Precedence enforcement
(1 + 2) * 3                     // 9 (not 7)
1 + (2 * 3)                     // 7

// Complex logical expressions
(Age > 18 && Age < 65) || varOverride

// Multi-line grouping
(
    FirstName.Text <> "" &&
    LastName.Text <> "" &&
    IsMatch(Email.Text, Email)
)

// Function arguments
Filter(Products, Category = "Electronics")
Patch(Orders, Record, { Status: "Shipped" })
```

---

### Comma (,)

**Syntax:** `Element1, Element2, Element3`

**Description:** List separator for function arguments, record fields, and table records. Language-dependent (some locales use semicolon).

**Examples:**
```powerfx
// Function arguments
If(x > 10, "High", "Low")
Patch(DataSource, Record, { Name: "John", Age: 30 })
Filter(Table, Status = "Active", Priority = "High")  // Wrong! Use &&

// Record fields
{
    Name: "John",
    Age: 30,
    Email: "john@company.com"
}

// Table definition
Table(
    { ID: 1, Name: "Alice" },
    { ID: 2, Name: "Bob" },
    { ID: 3, Name: "Charlie" }
)

// Multiple function arguments
Concatenate("Hello", ", ", "World", "!")
RGBA(255, 0, 0, 1)
```

**Language Dependency:**
```powerfx
// English (US) uses comma
If(x > 10, "High", "Low")

// Some European locales use semicolon
If(x > 10; "High"; "Low")

// Power Apps automatically adjusts based on authoring language
```

---

### Semicolon (;)

**Syntax:** `Statement1; Statement2; Statement3`

**Description:** Formula chaining separator for behavior properties. Executes statements sequentially. Language-dependent (some locales use double semicolon).

**Examples:**
```powerfx
// Chain multiple actions
Collect(MyCollection, NewRecord);
Navigate(SuccessScreen, ScreenTransition.Fade);
Notify("Record saved", NotificationType.Success)

// Button OnSelect
UpdateContext({ _loading: true });
Patch(DataSource, Record, Form1.Updates);
UpdateContext({ _loading: false });
Navigate(HomeScreen)

// Variable initialization
Set(varTotal, 0);
Set(varCount, 0);
Set(varAverage, 0)

// Complex workflow
If(
    IsBlank(Name.Text),
    Notify("Name required", NotificationType.Error),
    UpdateContext({ _saving: true });
    Patch(Customers, Defaults(Customers), Form1.Updates);
    UpdateContext({ _saving: false });
    Navigate(HomeScreen)
)
```

**Common Patterns:**
```powerfx
// Multi-step save operation
// Button.OnSelect
UpdateContext({ _isSaving: true });
Set(varResult, Patch(Orders, Defaults(Orders), {
    CustomerID: Dropdown_Customer.Selected.ID,
    OrderDate: Today(),
    Status: "Pending"
}));
If(
    IsBlank(varResult),
    Notify("Failed to save", NotificationType.Error),
    Notify("Order created successfully", NotificationType.Success);
    Navigate(OrderDetailsScreen, ScreenTransition.Cover, { Order: varResult })
);
UpdateContext({ _isSaving: false })

// Data refresh chain
ClearCollect(Products, '[dbo].[Products]');
ClearCollect(Categories, '[dbo].[Categories]');
ClearCollect(Suppliers, '[dbo].[Suppliers]');
UpdateContext({ _lastRefresh: Now() })

// Reset form and navigate
ResetForm(Form1);
Clear(TempCollection);
Navigate(HomeScreen, ScreenTransition.Fade)
```

**Language Dependency:**
```powerfx
// English (US) uses semicolon
Statement1; Statement2; Statement3

// Some locales use double semicolon
Statement1;; Statement2;; Statement3
```

---

### Decimal Separator (.)

**Syntax:** `WholeNumber.FractionalPart`

**Description:** Separates whole and fractional parts of numbers. Language-dependent (some locales use comma).

**Examples:**
```powerfx
// English (US) uses period
1.23
99.99
0.5
3.14159

// Some European locales use comma
// 1,23  (would be 1.23 in US)
```

---

### As Operator

**Syntax:** `Collection As Alias`

**Description:** Names a record in galleries or record scope functions, overriding default `ThisItem` or `ThisRecord`. Improves readability and enables nested scope access.

**Examples:**
```powerfx
// Gallery with As operator
Gallery1.Items = Products As Product

// In gallery controls, use:
Product.Name                    // Instead of ThisItem.Name
Product.Price                   // Instead of ThisItem.Price

// ForAll with As operator
ForAll(
    Employees As Emp,
    Emp.FirstName & " " & Emp.LastName
)

// Nested scopes
ForAll(
    Customers As Cust,
    ForAll(
        Orders,
        Filter(
            OrderDetails,
            OrderID = Orders.ID &&
            CustomerID = Cust.ID    // Access outer scope
        )
    )
)
```

**Common Patterns:**
```powerfx
// Improved gallery readability
Gallery_Products.Items = AllProducts As Product

// Label in gallery
Label_Name.Text = Product.Name
Label_Price.Text = Text(Product.Price, "[$-en-US]$#,##0.00")

// Complex nested iteration
ForAll(
    Categories As Cat,
    {
        CategoryName: Cat.Name,
        Products: ForAll(
            Filter(Products, CategoryID = Cat.ID) As Prod,
            {
                ProductName: Prod.Name,
                Price: Prod.Price,
                CategoryName: Cat.Name  // Access outer scope
            }
        )
    }
)

// Filter with As
Filter(
    Orders As Ord,
    Ord.Status = "Pending" && Ord.Total > 100
)

// With function
With(
    Gallery1.Selected As Selected,
    Patch(
        Orders,
        Selected,
        { Status: "Approved", ApprovedDate: Today() }
    )
)
```

**Benefits:**
- Clearer than `ThisItem` or `ThisRecord`
- Required for nested record scopes
- Self-documenting code
- Easier debugging

---

## Operator Precedence

Power Fx evaluates operators in specific order (precedence). Use parentheses to override default precedence.

### Precedence Table (Highest to Lowest)

| Precedence | Operator | Type | Example |
|------------|----------|------|---------|
| 1 | `( )` | Parentheses | `(1 + 2) * 3` |
| 2 | `^` | Exponentiation | `2 ^ 3` |
| 3 | `%` | Percentage | `20%` |
| 4 | `*` `/` | Multiplication, Division | `2 * 3` `10 / 2` |
| 5 | `+` `-` | Addition, Subtraction | `1 + 2` `5 - 3` |
| 6 | `&` | String concatenation | `"Hello" & " World"` |
| 7 | `=` `<>` `<` `>` `<=` `>=` | Comparison | `x > 10` |
| 8 | `in` `exactin` | Membership | `"a" in "apple"` |
| 9 | `!` `Not` | Logical NOT | `!true` `Not(condition)` |
| 10 | `&&` `And` | Logical AND | `a && b` |
| 11 | `||` `Or` | Logical OR | `a || b` |

### Precedence Examples

```powerfx
// Arithmetic precedence
1 + 2 * 3                       // 7 (multiplication first)
(1 + 2) * 3                     // 9 (parentheses override)
2 ^ 3 * 4                       // 32 (exponentiation first: 8 * 4)
(2 ^ 3) * 4                     // Same as above
2 ^ (3 * 4)                     // 4096 (multiplication first: 2^12)

// Comparison and logical
10 > 5 && 20 < 30               // true (comparisons first, then AND)
10 > 5 && 20 > 30 || 5 = 5      // true (AND before OR)
10 > 5 && (20 > 30 || 5 = 5)    // true (parentheses force OR first)

// String concatenation
"Total: " & 10 + 5              // Error! Need parentheses
"Total: " & (10 + 5)            // "Total: 15"
"Value: " & 10 * 2              // "Value: 20" (multiplication first)

// Complex example
5 + 3 * 2 > 10 && "test" in "testing"
// Evaluation order:
// 1. 3 * 2 = 6
// 2. 5 + 6 = 11
// 3. 11 > 10 = true
// 4. "test" in "testing" = true
// 5. true && true = true

// Negation precedence
!x > 10                         // Parsed as: (!x) > 10
!(x > 10)                       // Negates the comparison result
Not x > 10                      // Parsed as: (Not x) > 10
Not(x > 10)                     // Negates the comparison (preferred)
```

### Best Practices

```powerfx
// BAD: Relying on implicit precedence
Price * Quantity + Shipping > Budget

// GOOD: Use parentheses for clarity
(Price * Quantity) + Shipping > Budget

// BAD: Complex expression without grouping
Status = "Active" && Priority = "High" || Priority = "Critical" && Not IsBlank(Owner)

// GOOD: Group logical operations
(Status = "Active") && (Priority = "High" || Priority = "Critical") && !IsBlank(Owner)

// BAD: Ambiguous negation
!Status = "Active"              // Unclear intent

// GOOD: Explicit negation
!(Status = "Active")            // NOT (Status equals Active)
Status <> "Active"              // Status NOT equals Active (preferred)
```

---

## Language Dependencies

Some operators vary based on the authoring language setting in Power Apps.

### Language-Dependent Elements

| Element | English (US) | Some European Locales | Example |
|---------|-------------|---------------------|---------|
| **Decimal separator** | `.` (period) | `,` (comma) | `1.23` vs `1,23` |
| **List separator** | `,` (comma) | `;` (semicolon) | `If(x, a, b)` vs `If(x; a; b)` |
| **Formula chaining** | `;` (semicolon) | `;;` (double semicolon) | `A; B; C` vs `A;; B;; C` |

### English (US) Syntax

```powerfx
// Decimal: period
Price = 99.99

// List separator: comma
If(Status = "Active", "Yes", "No")
{Name: "John", Age: 30}
Filter(Products, Category = "Electronics")

// Chaining: semicolon
Set(varX, 10);
Navigate(Screen1);
Notify("Done")
```

### European Locale Example (German)

```powerfx
// Decimal: comma
Price = 99,99

// List separator: semicolon
If(Status = "Active"; "Yes"; "No")
{Name: "John"; Age: 30}
Filter(Products; Category = "Electronics")

// Chaining: double semicolon
Set(varX; 10);;
Navigate(Screen1);;
Notify("Done")
```

### How Power Apps Handles This

- **Authoring Language**: Set in app settings (File > Settings > General)
- **Auto-conversion**: Power Apps displays formulas in your language
- **Storage**: Formulas stored in neutral format internally
- **Sharing**: Users see formulas in their language when editing

### Best Practices

1. Be aware of your app's authoring language
2. Test with users in different locales if international
3. Documentation should note language-specific syntax
4. Use Power Apps' built-in localization features

---

## Common Patterns and Recipes

### Form Validation

```powerfx
// Complete form validation
FormIsValid = And(
    Not(IsBlank(Name.Text)),
    Not(IsBlank(Email.Text)),
    IsMatch(Email.Text, Email),
    Phone.Text <> "" && Len(Phone.Text) = 10,
    Age.Value >= 18,
    Terms.Value = true
)

// Enable submit button
SubmitButton.DisplayMode = If(FormIsValid, DisplayMode.Edit, DisplayMode.Disabled)
```

### Complex Filtering

```powerfx
// Multi-criteria filter
Filter(
    Orders,
    (Status = "Pending" || Status = "Approved") &&
    OrderDate >= StartDate && OrderDate <= EndDate &&
    Total > MinAmount &&
    (IsBlank(SearchTerm) || SearchTerm in CustomerName)
)
```

### Dynamic Text Building

```powerfx
// Complex message with string interpolation
$"Order #{OrderID} for {CustomerName}
Total: {Text(Total, '[$-en-US]$#,##0.00')}
Status: {Status}
Items: {CountRows(OrderItems)}
Due: {Text(DueDate, 'mm/dd/yyyy')}"

// Alternative with & operator
"Order #" & OrderID & " for " & CustomerName & Char(10) &
"Total: $" & Text(Total, "#,##0.00") & Char(10) &
"Status: " & Status
```

### Conditional Calculations

```powerfx
// Tiered pricing
Price = If(
    Quantity >= 100,
    BasePrice * 0.80,           // 20% discount
    Quantity >= 50,
    BasePrice * 0.90,           // 10% discount
    Quantity >= 10,
    BasePrice * 0.95,           // 5% discount
    BasePrice                   // No discount
)

// Tax calculation
TaxAmount = Subtotal * If(
    IsTaxExempt,
    0%,
    State = "CA",
    9.5%,
    State = "NY",
    8.875%,
    6.5%                        // Default tax rate
)
```

### Permission Checking

```powerfx
// Multi-level access control
UserHasAccess = Or(
    User().Email = "admin@company.com",
    User().Email in Administrators.Email,
    And(
        Department.Value = "IT",
        Role.Value in ["Manager", "Director"]
    ),
    And(
        IsOwner,
        Status <> "Locked"
    )
)
```

---

## Comparison with Excel

Power Fx is based on Excel formulas. Here are the operator equivalents:

| Operation | Power Fx | Excel | Notes |
|-----------|----------|-------|-------|
| Addition | `+` | `+` | Same |
| Subtraction | `-` | `-` | Same |
| Multiplication | `*` | `*` | Same |
| Division | `/` | `/` | Same |
| Exponentiation | `^` | `^` | Same |
| String concatenation | `&` | `&` | Same |
| Equal | `=` | `=` | Same |
| Not equal | `<>` | `<>` | Same |
| Greater than | `>` | `>` | Same |
| Less than | `<` | `<` | Same |
| Greater/equal | `>=` | `>=` | Same |
| Less/equal | `<=` | `<=` | Same |
| Property access | `.` | N/A | Power Fx only |
| Percentage | `%` | `%` | Same |
| Membership | `in` | N/A | Power Fx only |

**Logical Operators:**
- Power Fx supports both `&&`/`||`/`!` (JavaScript) and `And`/`Or`/`Not` (Excel style)
- Excel only has function style: `AND()`, `OR()`, `NOT()`

---

## Performance Considerations

### Short-Circuit Evaluation

```powerfx
// AND (&&): Stops at first false
varEnabled && ExpensiveAPICall()        // API only called if varEnabled = true

// OR (||): Stops at first true
varCacheHit || ExpensiveDatabaseQuery() // Query skipped if cache hit

// Order matters for performance
// GOOD: Cheap check first
varLocalCheck && ExpensiveRemoteCheck()

// BAD: Expensive check first (wastes time if local fails)
ExpensiveRemoteCheck() && varLocalCheck
```

### Operator Delegation

```powerfx
// Delegable comparison operators (with most data sources)
Filter(LargeTable, Amount > 1000)       // Delegable
Filter(LargeTable, Status = "Active")   // Delegable
Filter(LargeTable, Date >= StartDate)   // Delegable

// Non-delegable operators (warning: blue underline)
Filter(LargeTable, "test" in Description)   // May not delegate
Filter(LargeTable, Name exactin SearchTerm) // May not delegate

// String concatenation doesn't affect delegation
Filter(
    LargeTable,
    FirstName & " " & LastName = "John Doe"  // May not delegate
)

// Better: Filter each field separately
Filter(
    LargeTable,
    FirstName = "John" && LastName = "Doe"   // Delegable
)
```

### Optimization Tips

```powerfx
// Cache expensive calculations
Set(varExpensiveResult, ComplexCalculation());
Use varExpensiveResult multiple times

// Minimize property access in loops
// BAD: Access property repeatedly
ForAll(Items, Control.Property * Price)

// GOOD: Store in variable
Set(varProp, Control.Property);
ForAll(Items, varProp * Price)

// Use && for required conditions, || for alternatives
// More efficient than nested If statements
Status = "Active" && Budget > Cost && StartDate <= Today()
```

---

## Common Mistakes and Solutions

### String Concatenation vs Addition

```powerfx
// MISTAKE: Expecting numeric addition with text input
TextInput1.Text + TextInput2.Text
// If inputs are "10" and "5", result is "105" (string concat)

// SOLUTION: Convert to numbers first
Value(TextInput1.Text) + Value(TextInput2.Text)  // 15

// SOLUTION: Check numeric before converting
If(
    IsNumeric(TextInput1.Text) && IsNumeric(TextInput2.Text),
    Value(TextInput1.Text) + Value(TextInput2.Text),
    0
)
```

### Comparison Operator Misuse

```powerfx
// MISTAKE: Using = for assignment (no assignment in expressions)
Set(Status = "Active")          // Wrong!

// SOLUTION: Set function syntax
Set(Status, "Active")           // Correct

// MISTAKE: Case-sensitive comparison without exactin
Filter(Users, Username = "ADMIN")  // Won't match "admin" or "Admin"

// SOLUTION: Use Lower() for case-insensitive
Filter(Users, Lower(Username) = Lower("admin"))
```

### Logical Operator Confusion

```powerfx
// MISTAKE: Using OR when all conditions required
FirstName <> "" || LastName <> ""  // Wrong for "both required"

// SOLUTION: Use AND for "all required"
FirstName <> "" && LastName <> ""  // Both must be filled

// MISTAKE: Multiple equals
Status = "Open" || "Pending"       // Syntax error!

// SOLUTION: Repeat comparison
Status = "Open" || Status = "Pending"

// ALTERNATIVE: Use in operator
Status in ["Open", "Pending"]
```

### Precedence Errors

```powerfx
// MISTAKE: Ignoring operator precedence
Price * Quantity + Shipping > 100 // Might be ambiguous

// SOLUTION: Use parentheses
(Price * Quantity + Shipping) > 100

// MISTAKE: Negation precedence
!Status = "Active"                 // Parsed as: (!Status) = "Active"

// SOLUTION: Parenthesize comparison
!(Status = "Active")               // NOT (Status equals Active)
// OR use not-equal operator
Status <> "Active"                 // Clearer
```

### Missing Disambiguation

```powerfx
// MISTAKE: Ambiguous field reference in nested scope
ForAll(
    Collection1,
    ForAll(
        Collection2,
        Collection1.ID  // Might refer to inner scope!
    )
)

// SOLUTION: Use As operator
ForAll(
    Collection1 As C1,
    ForAll(
        Collection2 As C2,
        C1.ID           // Clear reference to outer scope
    )
)
```

---

## Debugging Tips

### Formula Bar Indicators

- **Red wavy underline**: Syntax error
- **Blue wavy underline**: Delegation warning (may not work with large datasets)
- **Yellow triangle**: Warning (formula works but may have issues)

### Testing Operators

```powerfx
// Use labels to test expressions
Label_Test.Text = Text(Expression)

// Test boolean expressions
Label_Result.Text = If(BooleanExpression, "TRUE", "FALSE")

// Test numeric calculations
Label_Calc.Text = Text(NumericExpression, "#,##0.00")

// Debug concatenation
Label_Debug.Text =
    "Value1: " & Value1 & Char(10) &
    "Value2: " & Value2 & Char(10) &
    "Result: " & Result
```

### Common Debug Patterns

```powerfx
// Check if value is blank
Label_IsBlank.Text = Text(IsBlank(Variable))

// Check variable type
Label_Type.Text =
    If(IsBlank(Var), "Blank",
    IsNumeric(Var), "Number",
    "Text")

// Show evaluation results
Label_Debug.Text =
    "A: " & Text(A) & Char(10) &
    "B: " & Text(B) & Char(10) &
    "A && B: " & Text(A && B) & Char(10) &
    "A || B: " & Text(A || B)
```

---

## Sources

This documentation is based on official Microsoft Learn documentation:

- [Operators and Identifiers in Power Apps - Microsoft Learn](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/operators)
- [Operators and Identifiers in Microsoft Power Fx - Microsoft Learn](https://learn.microsoft.com/en-us/power-platform/power-fx/operators)
- [Microsoft Power Fx Expression Grammar - Microsoft Learn](https://learn.microsoft.com/en-us/power-platform/power-fx/expression-grammar)
- [And, Or, and Not Functions - Microsoft Learn](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-logicals)
- [Concat and Concatenate Functions - Microsoft Learn](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-concatenate)
- [Global Support in Microsoft Power Fx - Microsoft Learn](https://learn.microsoft.com/en-us/power-platform/power-fx/global)
- [Power Fx Formula Reference - Microsoft Learn](https://learn.microsoft.com/en-us/power-platform/power-fx/formula-reference-canvas-apps)

Last Updated: 2025-12-12
