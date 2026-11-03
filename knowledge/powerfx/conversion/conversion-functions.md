# PowerFx Conversion Functions for Power Apps Canvas Apps

Complete documentation for type conversion and data transformation functions in Power Apps, based on official Microsoft Learn documentation.

---

## Table of Contents

1. [Boolean Function](#boolean-function)
2. [Dec2Hex Function](#dec2hex-function)
3. [Hex2Dec Function](#hex2dec-function)
4. [Float Function](#float-function)
5. [GUID Function](#guid-function)

---

## Boolean Function

Converts text, numbers, or dynamic values to Boolean values (`true`, `false`, or `blank`).

### Syntax

```powerfx
Boolean( Text )
Boolean( TextSingleColumnTable )

Boolean( Number )
Boolean( NumberSingleColumnTable )

Boolean( DynamicValue )
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| Text | Text | Yes | String(s) to convert. Accepts case-insensitive "true" or "false". Blank/empty text converts to blank. Other strings return error. |
| Number | Number | Yes | Number(s) to convert. 0 converts to false, all other numbers convert to true. Blank converts to blank. |
| DynamicValue | Dynamic | Yes | Dynamic value from provider (e.g., JSON). Accepts true, false, null, or follows text/number rules. |

### Return Value

Returns `true`, `false`, `blank`, or an error if conversion fails.

### Examples

#### Text Conversion

```powerfx
// Basic text conversion
Boolean("true")              // Returns: true
Boolean("false")             // Returns: false
Boolean("TRUE")              // Returns: true (case-insensitive)
Boolean("TrUe")              // Returns: true
Boolean("Truthful")          // Returns: Error (invalid argument)
Boolean(Blank())             // Returns: blank
Boolean("")                  // Returns: blank
```

#### Number Conversion

```powerfx
// Number to boolean
Boolean(0)                   // Returns: false
Boolean(1)                   // Returns: true
Boolean(-1234)               // Returns: true
Boolean(999.99)              // Returns: true
```

#### Dynamic Value Conversion (JSON)

```powerfx
// Parse JSON and convert to boolean
Boolean(ParseJSON("{ ""bool"": true }").bool)        // Returns: true
Boolean(ParseJSON("{ ""bool"": false }").bool)       // Returns: false
Boolean(ParseJSON("{ ""bool"": null }").bool)        // Returns: blank
Boolean(ParseJSON("{ ""bool"": ""true"" }").bool)    // Returns: Error (string in JSON)
```

#### Single Column Table Conversion

```powerfx
// Convert tables
Boolean(["true", "false", Blank()])    // Returns: [true, false, blank]
Boolean([1, 2, 0])                     // Returns: [true, true, false]
Boolean([-5, 0, 100])                  // Returns: [true, false, true]
```

### Common Patterns

#### Explicit Validation of User Input

```powerfx
// Validate checkbox-like text input
If(
    Boolean(TextInput1.Text),
    Notify("User confirmed", NotificationType.Success),
    Notify("User declined", NotificationType.Information)
)
```

#### Converting API Response to Boolean

```powerfx
// Handle API response with boolean flags
Set(
    varIsActive,
    Boolean(ParseJSON(APIResponse.body).is_active)
)
```

#### Processing Table of Boolean Strings

```powerfx
// Convert CSV-imported boolean strings
ClearCollect(
    colConvertedData,
    AddColumns(
        ImportedData,
        "IsActiveBoolean",
        Boolean(ThisRecord.IsActiveText)
    )
)
```

### Important Notes

1. **Automatic Type Coercion**: In most cases, type coercion happens automatically. For example, `If("true", 1, 0)` returns `1` without explicit Boolean conversion.

2. **Use Explicit Boolean() When**:
   - You want clear, readable type conversion
   - Working with dynamic values from APIs
   - Processing user input requiring validation
   - Debugging type-related issues

3. **Not Localized**: Text conversion is NOT localized. Only "true" and "false" (English) are recognized, not translated equivalents.

4. **Case Insensitivity**: Text conversion accepts any case variation: "TRUE", "True", "true", "TrUe" all work.

### Supported Platforms

Canvas apps, Copilot Studio, Desktop flows, Model-driven apps, Power Platform CLI, Dataverse functions, Power Pages

### Source

[Boolean function - Power Platform | Microsoft Learn](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-boolean)

---

## Dec2Hex Function

Converts a decimal number to a hexadecimal text string.

### Syntax

```powerfx
Dec2Hex( Number [, Places] )
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| Number | Number | Yes | The decimal number to convert to hexadecimal. Truncated to whole number. |
| Places | Number | No | Number of characters to pad with leading zeros (positive numbers only). Ignored for negative numbers. |

### Return Value

Returns a hexadecimal text string with uppercase characters (0-9, A-F).

### Supported Range

Works with **40-bit, two's-complement** whole numbers:
- **Decimal Range**: `-549,755,813,888` to `549,755,813,887`
- **Hexadecimal Range**: `8000000000` to `7FFFFFFFFF`

### Examples

#### Basic Conversions

```powerfx
// Simple decimal to hex conversion
Dec2Hex(165)                 // Returns: "A5"
Dec2Hex(255)                 // Returns: "FF"
Dec2Hex(3213)                // Returns: "C8D"
Dec2Hex(45780)               // Returns: "B2D4"
```

#### Negative Numbers

```powerfx
// Negative numbers use two's-complement
Dec2Hex(-165)                // Returns: "FFFFFFFF5B"
Dec2Hex(-1)                  // Returns: "FFFFFFFFFF"
Dec2Hex(-3.74)               // Returns: "FFFFFFFFFD" (truncated to -3)
```

#### Using Places Parameter

```powerfx
// Pad with leading zeros
Dec2Hex(165, 4)              // Returns: "00A5"
Dec2Hex(45780, 5)            // Returns: "0B2D4"
Dec2Hex(45780, 8)            // Returns: "0000B2D4"
Dec2Hex(10, 4)               // Returns: "000A"

// Error if Places too small
Dec2Hex(45780, 3)            // Returns: Error (not enough space)

// Places ignored for negative numbers
Dec2Hex(-165, 8)             // Returns: "FFFFFFFF5B" (padding ignored)
```

#### Decimal Truncation

```powerfx
// Decimals are truncated (not rounded)
Dec2Hex(3.74)                // Returns: "3" (truncated to 3)
Dec2Hex(3.99)                // Returns: "3" (truncated to 3)
Dec2Hex(99.1)                // Returns: "63" (truncated to 99)
```

#### Table Conversion

```powerfx
// Convert single-column table
Dec2Hex([10, 255, -16])              // Returns: ["A", "FF", "FFFFFFFFF0"]
Dec2Hex([10, 255, -16], 4)           // Returns: ["000A", "00FF", "FFFFFFFFF0"]
Dec2Hex([0, 128, 256, 1024])         // Returns: ["0", "80", "100", "400"]
```

#### Out of Range Error

```powerfx
// Numbers outside supported range
Dec2Hex(1e45)                // Returns: Error (out of range)
Dec2Hex(9999999999999)       // Returns: Error (exceeds maximum)
```

### Common Patterns

#### Convert to Lowercase Hex

```powerfx
// Use Lower() for lowercase hex
Lower(Dec2Hex(165))          // Returns: "a5"
Lower(Dec2Hex(45780))        // Returns: "b2d4"
```

#### Color Code Conversion

```powerfx
// Convert RGB values to hex color code
With(
    {R: 255, G: 165, B: 0},
    "#" & Dec2Hex(R, 2) & Dec2Hex(G, 2) & Dec2Hex(B, 2)
)
// Returns: "#FFA500" (orange color)
```

#### Fixed-Width Hex Output

```powerfx
// Always output 8-character hex (padded)
Dec2Hex(1000, 8)             // Returns: "000003E8"
Dec2Hex(100, 8)              // Returns: "00000064"
```

#### Convert Table of Decimal IDs

```powerfx
// Convert numeric IDs to hex format
ClearCollect(
    colHexIDs,
    AddColumns(
        Products,
        "HexID",
        Dec2Hex(ID, 6)
    )
)
```

### Important Notes

1. **Uppercase Output**: Dec2Hex always returns uppercase hex digits (A-F). Use `Lower()` to convert to lowercase.

2. **Truncation**: Input numbers are truncated to whole numbers (as if `Trunc()` was applied), not rounded.

3. **Places Parameter**: Only affects positive numbers. For negative numbers, the full 40-bit representation is always returned.

4. **Error Handling**: Returns `ErrorKind.Numeric` for:
   - Numbers out of supported range
   - Result doesn't fit in specified Places

5. **Table Support**: Works with single-column tables, processing each record individually.

### Supported Platforms

Canvas apps, Copilot Studio, Desktop flows, Model-driven apps, Power Platform CLI, Dataverse functions, Power Pages

### Source

[Hex2Dec and Dec2Hex functions - Power Platform | Microsoft Learn](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-hexdec)

---

## Hex2Dec Function

Converts a hexadecimal text string to a decimal number.

### Syntax

```powerfx
Hex2Dec( HexString )
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| HexString | Text | Yes | Hexadecimal string (0-9, A-F) to convert. Maximum 10 characters. Case-insensitive. |

### Return Value

Returns a decimal number. For values with the high bit set, returns a negative number using two's-complement notation.

### Supported Range

Works with **40-bit, two's-complement** whole numbers:
- **Hexadecimal Range**: `8000000000` to `7FFFFFFFFF`
- **Decimal Range**: `-549,755,813,888` to `549,755,813,887`

### Examples

#### Basic Conversions

```powerfx
// Simple hex to decimal conversion
Hex2Dec("A5")                // Returns: 165
Hex2Dec("FF")                // Returns: 255
Hex2Dec("C8D")               // Returns: 3213
Hex2Dec("B2D4")              // Returns: 45780
Hex2Dec("FFFF")              // Returns: 65535
```

#### Case Insensitivity

```powerfx
// Upper and lowercase both work
Hex2Dec("A5")                // Returns: 165
Hex2Dec("a5")                // Returns: 165
Hex2Dec("Ab")                // Returns: 171
Hex2Dec("AB")                // Returns: 171
```

#### Negative Numbers (Two's Complement)

```powerfx
// High bit set = negative number
Hex2Dec("FFFFFFFF5B")        // Returns: -165
Hex2Dec("FFFFFFFFFF")        // Returns: -1
Hex2Dec("FFFFFFFFF0")        // Returns: -16
Hex2Dec("FFFFFFF373")        // Returns: -3213
Hex2Dec("8000000000")        // Returns: -549755813888 (minimum)
```

#### Positive Range

```powerfx
// Maximum positive value
Hex2Dec("7FFFFFFFFF")        // Returns: 549755813887
Hex2Dec("0")                 // Returns: 0
Hex2Dec("1")                 // Returns: 1
Hex2Dec("A")                 // Returns: 10
```

#### Invalid Input Errors

```powerfx
// Invalid hexadecimal characters
Hex2Dec("43j")               // Returns: Error (invalid character 'j')
Hex2Dec("XYZ")               // Returns: Error (invalid characters)
Hex2Dec("G5")                // Returns: Error (invalid character 'G')

// Too many characters (>10)
Hex2Dec("FFFFFFFFFFFF")      // Returns: Error (out of range)
Hex2Dec("12345678901")       // Returns: Error (too many characters)
```

#### Table Conversion

```powerfx
// Convert single-column table of hex strings
Hex2Dec(["A", "12", "FFFF"])           // Returns: [10, 18, 65535]
Hex2Dec(["0", "FF", "100", "400"])     // Returns: [0, 255, 256, 1024]

// Mixed valid and invalid values
Hex2Dec(["3", "E", "I", "B"])          // Returns: [3, 14, Error, 11]
```

### Common Patterns

#### Parse Hex Color Codes

```powerfx
// Extract RGB values from hex color code
With(
    {HexColor: "FFA500"},  // Orange
    {
        Red: Hex2Dec(Left(HexColor, 2)),
        Green: Hex2Dec(Mid(HexColor, 3, 2)),
        Blue: Hex2Dec(Right(HexColor, 2))
    }
)
// Returns: {Red: 255, Green: 165, Blue: 0}
```

#### Convert Hex IDs to Decimal

```powerfx
// Convert hex product IDs back to decimal
ClearCollect(
    colDecimalIDs,
    AddColumns(
        HexProducts,
        "DecimalID",
        Hex2Dec(HexID)
    )
)
```

#### Validate Hex Input

```powerfx
// Check if user input is valid hex
Set(
    varIsValidHex,
    !IsError(Hex2Dec(TextInput1.Text)) &&
    Len(TextInput1.Text) <= 10
)
```

#### Convert MAC Address Component

```powerfx
// Parse part of MAC address (e.g., "A5:B3:2F:...")
Hex2Dec("A5")                // Returns: 165
Hex2Dec("B3")                // Returns: 179
```

#### Round-Trip Conversion

```powerfx
// Convert to hex and back
Hex2Dec(Dec2Hex(12345))      // Returns: 12345
Dec2Hex(Hex2Dec("3039"))     // Returns: "3039"
```

### Important Notes

1. **Case Insensitive**: Both uppercase and lowercase hex digits are accepted (A-F or a-f).

2. **Maximum Length**: Input string limited to 10 hexadecimal characters. Longer strings return an error.

3. **Two's Complement**: Hexadecimal values with the high bit set (starting with 8-F in the leftmost position) are interpreted as negative numbers.

4. **Error Handling**: Returns `ErrorKind.Numeric` for:
   - Invalid hexadecimal characters
   - Strings longer than 10 characters
   - Values outside supported range

5. **No Prefix Support**: Do not include "0x" or other hex prefixes. Use just the hex digits.

6. **Table Support**: Works with single-column tables, processing each record individually. Errors are embedded in output table.

### Supported Platforms

Canvas apps, Copilot Studio, Desktop flows, Model-driven apps, Power Platform CLI, Dataverse functions, Power Pages

### Source

[Hex2Dec and Dec2Hex functions - Power Platform | Microsoft Learn](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-hexdec)

---

## Float Function

Converts a string of text or dynamic value to a floating-point number with high range but limited precision.

### Syntax

```powerfx
Float( String [, LanguageTag ] )
Float( Dynamic )
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| String | Text | Yes | String to convert to a floating-point numeric value |
| LanguageTag | Text | No | Language tag for parsing (e.g., "en-US", "es-ES"). Uses current user's language if not specified. |
| Dynamic | Dynamic | Yes | Dynamic value representing a number (JSON number, boolean, or convertible text) |

### Return Value

Returns a **Float** type number with:
- **Range**: Up to 10^308 (very large numbers)
- **Precision**: Limited to ~15 decimal places
- **Base**: Binary (base-2), which cannot precisely represent all decimal values

### Platform Support

| Platform | Supported |
|----------|:---------:|
| Canvas apps | No (use Value() instead) |
| Copilot Studio | Yes |
| Desktop flows | Yes |
| Dataverse | Yes |
| Model-driven apps | No |
| Power Platform CLI | Yes |
| Power Pages | No |

> **Important**: Power Apps Canvas Apps currently only support the **Value()** function, which returns Float. Support for explicit **Float()** and **Decimal()** functions is coming soon.

### Examples

#### Basic Float Conversion

```powerfx
// Simple string to float
Float("123.456")             // Returns: 123.456 (Float)
Float("999.99")              // Returns: 999.99 (Float)
Float("12.34")               // Returns: 12.34 (Float)
```

#### Large Numbers (Float Advantage)

```powerfx
// Float supports very large numbers
Float("1e100")               // Returns: 1e100 (Float) - Success
Decimal("1e100")             // Returns: Error (exceeds Decimal range)

Float("1.23e308")            // Returns: 1.23e308 (Float)
Float("9.9e200")             // Returns: 9.9e200 (Float)
```

#### Precision Limitations

```powerfx
// Float has limited precision (~15 digits)
Float("10000000000.0000000001")
// Returns: 10000000000 (Float) - Lost precision beyond ~15 digits

Decimal("10000000000.0000000001")
// Returns: 10000000000.0000000001 (Decimal) - Maintains full precision
```

#### Language-Specific Parsing

```powerfx
// Default "en-US": period = decimal separator
Float("123.456")             // Returns: 123.456
Float("123,456")             // Returns: 123456 (comma = thousands separator)

// Spanish "es-ES": comma = decimal separator
Float("123.456", "es-ES")    // Returns: 123456 (period = thousands separator)
Float("123,456", "es-ES")    // Returns: 123.456 (comma = decimal separator)
```

#### Special Formats

```powerfx
// Percentage notation
Float("12.34%")              // Returns: 0.1234 (divided by 100)
Float("50%")                 // Returns: 0.5

// Currency symbols (ignored for current language)
Float("$ 12.34")             // Returns: 12.34
Float("€ 99.99")             // Returns: 99.99

// Scientific notation
Float("24e3")                // Returns: 24000
Float("1.5e-2")              // Returns: 0.015
Float("2.5e10")              // Returns: 25000000000
```

#### Boolean Conversion

```powerfx
// Convert boolean to float
Float(true)                  // Returns: 1 (Float)
Float(false)                 // Returns: 0 (Float)
```

### Float vs Decimal vs Value

| Feature | Float | Decimal | Value |
|---------|-------|---------|-------|
| **Range** | 10^-308 to 10^308 | 10^-28 to 10^28 | Depends on platform |
| **Precision** | ~15 digits | 28 digits | Platform default |
| **Base** | Binary (base-2) | Decimal (base-10) | Platform default |
| **Best for** | Scientific calculations | Financial/business | General use |
| **Canvas Apps** | Coming soon | Coming soon | Available now |
| **Performance** | Higher | Standard | Standard |

### Common Patterns

#### Scientific Calculations

```powerfx
// Float ideal for large scientific numbers
Set(varPlanckConstant, Float("6.62607015e-34"))
Set(varAvogadro, Float("6.02214076e23"))
Set(varSpeedOfLight, Float("299792458"))
```

#### Handle API Response Numbers

```powerfx
// Parse numeric values from JSON API
Set(
    varTemperature,
    Float(ParseJSON(WeatherAPI.body).temperature)
)
```

#### Convert with Locale Awareness

```powerfx
// Handle international number formats
Set(
    varPrice,
    Float(TextInput1.Text, "de-DE")  // German format
)
```

### Important Notes

1. **Canvas Apps Limitation**: Currently, Canvas Apps only support `Value()` function. Use `Value()` instead of `Float()` until Float support is added.

2. **Precision Issues**: Float uses binary representation, so some decimal values cannot be represented precisely:
   - `0.1` cannot be exactly represented in binary
   - May cause rounding errors in calculations
   - Use Decimal for financial calculations requiring exact precision

3. **Language/Locale**: Always specify `LanguageTag` when working with international data to avoid interpretation errors with commas and periods.

4. **Scientific Notation**: Supports standard scientific notation (e.g., "1.23e10")

5. **Currency Symbols**: Currency symbols for the current language are ignored. Symbols from other languages may cause errors.

6. **Error Handling**: Returns error for:
   - Invalid number format
   - Numbers exceeding Float range
   - Mixed formatting (e.g., "12.34%$")

### Supported Platforms

Copilot Studio, Desktop flows, Dataverse, Power Platform CLI

**Note**: For Canvas Apps, use `Value()` function instead.

### Source

[Decimal, Float, and Value functions - Power Platform | Microsoft Learn](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-value)

---

## GUID Function

Creates a new GUID (Globally Unique Identifier) or converts a GUID string to a GUID value for use with database systems like Microsoft Dataverse and SQL Server.

### Syntax

```powerfx
GUID( [ GUIDString ] )
GUID( Dynamic )
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| GUIDString | Text | No | Hexadecimal representation of a GUID (with or without hyphens). If omitted, creates a new GUID. |
| Dynamic | Dynamic | Yes (overload) | Dynamic value representing a GUID (e.g., from JSON) |

### Return Value

Returns a GUID value that can be:
- Passed to database operations (Patch, Filter, etc.)
- Converted to string format (lowercase with hyphens)
- Used as unique identifiers in your app

### GUID Format

**32 hexadecimal digits** in one of two formats:

```powerfx
// Standard format (with hyphens)
"123e4567-e89b-12d3-a456-426655440000"

// Compact format (without hyphens)
"123e4567e89b12d3a456426655440000"
```

- Case-insensitive (accepts uppercase or lowercase)
- Generated GUIDs are version 4 (IETF RFC 4122)

### Examples

#### Generate New GUIDs

```powerfx
// Generate a new GUID
GUID()
// Returns: New GUID like f9168c5e-ceb2-4faa-b6bf-329bf39fa1e4

// Generate multiple new GUIDs
GUID(); GUID(); GUID()
// Each call returns a different GUID
```

#### Convert String to GUID

```powerfx
// Standard format (with hyphens)
GUID("0f8fad5b-d9cb-469f-a165-70867728950e")
// Returns: GUID value

// Compact format (without hyphens)
GUID("0f8fad5bd9cb469fa16570867728950e")
// Returns: Same GUID value

// Case insensitive
GUID("F9168C5E-CEB2-4FAA-B6BF-329BF39FA1E4")
GUID("f9168c5e-ceb2-4faa-b6bf-329bf39fa1e4")
// Both return the same GUID value
```

#### Use in Database Operations

```powerfx
// Patch record with specific GUID status
Patch(
    Products,
    Defaults(Products),
    {
        Name: "New Product",
        Status: GUID("F9168C5E-CEB2-4faa-B6BF-329BF39FA1E4")
    }
)

// Filter by GUID
Filter(
    Products,
    Status = GUID("F9168C5E-CEB2-4faa-B6BF-329BF39FA1E4")
)

// Lookup by GUID
LookUp(
    Users,
    UserID = GUID("12345678-1234-1234-1234-123456789012")
)
```

#### Display GUID as Text

```powerfx
// GUID automatically converts to lowercase string with hyphens
First(Products).Status
// Returns: "f9168c5e-ceb2-4faa-b6bf-329bf39fa1e4"

// Display in label
Label1.Text = Text(First(Products).ProductID)
// Shows: "f9168c5e-ceb2-4faa-b6bf-329bf39fa1e4"
```

#### Create Collection of GUIDs

```powerfx
// Generate table with 5 new GUIDs
ClearCollect(
    colNewGUIDs,
    ForAll(Sequence(5), GUID())
)

// Result: Single-column table with 5 unique GUIDs
// {Value: f9168c5e-...}
// {Value: a3d2f6b8-...}
// {Value: 7c4e1a9d-...}
// etc.
```

#### Store Generated GUID

```powerfx
// Store new GUID in variable
Set(varNewUserID, GUID())

// Use stored GUID in multiple places
Patch(Users, Defaults(Users), {UserID: varNewUserID, Name: "John"});
Patch(Preferences, Defaults(Preferences), {UserID: varNewUserID, Theme: "Dark"})
```

#### Parse GUID from JSON

```powerfx
// Convert JSON GUID string to GUID value
Set(
    varProductID,
    GUID(ParseJSON(APIResponse.body).product_id)
)

// Or use Dynamic parameter directly
Set(
    varUserID,
    GUID(ParseJSON(UserData).user_guid)
)
```

### Volatile Function Behavior

**GUID()** without arguments is **volatile** - it returns a new value each evaluation:

#### In Data-Flow Formulas (Properties)

```powerfx
// Set Label Text property
Label1.Text = GUID()
// Returns SAME GUID while app is open
// Only changes when app restarts
```

#### In Behavior Formulas (Actions)

```powerfx
// OnSelect of Button
OnSelect = Set(varGUID, GUID())
// Returns NEW GUID each button click

// Concatenated with changing value
TextInput1.Text & " " & GUID()
// Returns NEW GUID each time TextInput changes
```

### Common Patterns

#### Generate Unique Record IDs

```powerfx
// Create record with client-generated GUID
Patch(
    Orders,
    Defaults(Orders),
    {
        OrderID: GUID(),
        OrderNumber: "ORD-" & Text(Now(), "yyyymmddhhmmss"),
        Customer: ComboBox1.Selected
    }
)
```

#### Batch Create with Unique IDs

```powerfx
// Generate multiple records with unique GUIDs
ForAll(
    Gallery1.AllItems,
    Patch(
        Enrollments,
        Defaults(Enrollments),
        {
            EnrollmentID: GUID(),
            StudentID: ThisRecord.StudentID,
            CourseID: varSelectedCourse
        }
    )
)
```

#### Link Related Records

```powerfx
// Create parent and child records with GUID relationship
With(
    {parentID: GUID()},

    // Create parent
    Patch(Customers, Defaults(Customers),
        {CustomerID: parentID, Name: TextInput1.Text});

    // Create related children with same parent ID
    ForAll(
        SelectedProducts,
        Patch(Orders, Defaults(Orders),
            {OrderID: GUID(), CustomerID: parentID, Product: ThisRecord})
    )
)
```

#### Validate GUID Format

```powerfx
// Check if text is valid GUID format
Set(
    varIsValidGUID,
    !IsError(GUID(TextInput1.Text)) &&
    Len(Substitute(TextInput1.Text, "-", "")) = 32
)
```

#### Compare GUIDs

```powerfx
// Compare GUID values (not strings)
If(
    First(Users).UserID = GUID("f9168c5e-ceb2-4faa-b6bf-329bf39fa1e4"),
    Navigate(AdminScreen),
    Navigate(UserScreen)
)
```

#### Offline Scenarios

```powerfx
// Generate client-side GUIDs for offline sync
Collect(
    colLocalOrders,
    {
        LocalID: GUID(),
        OrderDate: Now(),
        Items: Gallery1.AllItems,
        SyncStatus: "Pending"
    }
)
```

### Important Notes

1. **Version 4 GUIDs**: Generated GUIDs are version 4 (RFC 4122) using pseudo-random numbers.

2. **Case Handling**:
   - Input: Case-insensitive (accepts uppercase or lowercase)
   - Output: Always lowercase with hyphens when converted to string

3. **Format Flexibility**: Both hyphenated and non-hyphenated formats accepted for input.

4. **Volatile Behavior**: Without arguments, returns a new GUID on each evaluation in behavior formulas.

5. **String Conversion**: GUID values automatically convert to lowercase string format with hyphens in text contexts.

6. **Not for Display**: GUIDs are meant for internal IDs, not user-facing identifiers. Consider using human-readable formats for display.

7. **Database Keys**: Ideal for primary keys and foreign keys in Dataverse, SQL Server, and other systems using GUIDs.

8. **Uniqueness**: While highly unlikely, GUID collisions are theoretically possible (probability ~1 in 2^122).

### Supported Platforms

Canvas apps, Copilot Studio, Desktop flows, Model-driven apps, Power Platform CLI, Dataverse functions

### Source

[GUID function - Power Platform | Microsoft Learn](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-guid)

---

## Additional Resources

### Related Functions

- **Value()** - Convert string to number (default numeric type)
- **Decimal()** - Convert to decimal number (high precision)
- **Text()** - Convert to text string
- **DateValue()** - Convert to date
- **TimeValue()** - Convert to time
- **DateTimeValue()** - Convert to date/time

### Best Practices

1. **Use Explicit Conversion** when working with:
   - User input from text controls
   - API responses with dynamic types
   - Imported data from external sources
   - Type validation and error handling

2. **Choose the Right Function**:
   - **Boolean()** - For true/false logic
   - **Float()** - For scientific calculations (when available)
   - **Value()** - For general number conversion (Canvas Apps)
   - **Dec2Hex/Hex2Dec** - For hexadecimal operations
   - **GUID()** - For unique identifiers

3. **Error Handling**: Always consider invalid inputs:
   ```powerfx
   If(
       IsError(Boolean(UserInput.Text)),
       Notify("Invalid input", NotificationType.Error),
       /* Process valid input */
   )
   ```

4. **Locale Awareness**: Specify language tags when working with international data:
   ```powerfx
   Value(TextInput1.Text, User().Language)
   ```

5. **Performance**: Avoid excessive GUID() calls in galleries or frequently evaluated formulas.

### Documentation Sources

All content based on official Microsoft Learn documentation:

- [Boolean function - Power Platform](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-boolean)
- [Hex2Dec and Dec2Hex functions - Power Platform](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-hexdec)
- [Decimal, Float, and Value functions - Power Platform](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-value)
- [GUID function - Power Platform](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-guid)
- [Formula reference - canvas apps](https://learn.microsoft.com/en-us/power-platform/power-fx/formula-reference-canvas-apps)

---

**Document Version**: 1.0
**Last Updated**: 2025-12-12
**Based on**: Microsoft Learn documentation (current as of December 2025)

## Sources

- [Boolean function - Power Platform](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-boolean)
- [Hex2Dec and Dec2Hex functions - Power Platform](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-hexdec)
- [Decimal, Float, and Value functions - Power Platform](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-value)
- [GUID function - Power Platform](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-guid)
- [Formula reference - canvas apps](https://learn.microsoft.com/en-us/power-platform/power-fx/formula-reference-canvas-apps)
