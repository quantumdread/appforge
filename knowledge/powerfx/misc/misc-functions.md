# Miscellaneous Functions

Utility functions for testing, clipboard operations, app control, environment detection, localization, NFC reading, record metadata, and diagnostic tracing.

---

## Assert Function

Validates test assertions in Power Apps Test Studio.

### Platform Availability

- Canvas apps (Test Studio only)
- Not available in runtime apps

### Syntax

```powerfx
Assert( Expression, Message )
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `Expression` | Boolean | Yes | Expression that evaluates to true or false |
| `Message` | Text | No | Descriptive message explaining the assertion failure |

### Return Value

- Assertions that fail cause the test case to fail
- Both passed and failed assertion messages are stored in the **Traces** table within the **TestCaseResult** record

### Examples

```powerfx
// Validate label text
Assert(
    lblResult.Text = "Success",
    "lblResult value Expected: Success, Actual: " & lblResult.Text
)

// Validate ListBox selection
Assert(
    ListBox1.Selected.Value = "Success",
    "ListBox1 selection Expected: Success, Actual: " & ListBox1.Selected.Value
)

// Validate numeric values
Assert(
    kudosAfterTest = kudosBeforeTest + 1,
    "Kudos count. Expected: " & kudosBeforeTest + 1 & " Actual: " & kudosAfterTest
)

// Validate control visibility
Assert(
    btnSubmit.Visible = true,
    "Submit button should be visible"
)
```

### Best Practices

```powerfx
// GOOD: Descriptive messages with expected vs actual
Assert(
    Gallery1.AllItemsCount = 5,
    "Item count - Expected: 5, Actual: " & Gallery1.AllItemsCount
)

// GOOD: Test state before and after
Set( countBefore, CountRows(Orders) );
Patch( Orders, Defaults(Orders), { Title: "Test" } );
Assert(
    CountRows(Orders) = countBefore + 1,
    "Order count should increase by 1"
)

// BAD: No message
Assert( lblStatus.Text = "Done" )  // What failed? Why?
```

---

## Copy Function

Copies text to the clipboard on the device where the app is running.

### Platform Availability

- Canvas apps
- Not supported in embedded scenarios (SharePoint, Power BI, Teams)

### Syntax

```powerfx
Copy( Text )
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `Text` | Text | Yes | Text to copy to clipboard (plain text only) |

### Return Value

Side-effects function - no return value (behavior formulas only)

### Platform Limitations

The Copy function has limited clipboard access in embedded scenarios:
- Power Apps in SharePoint
- Embedded apps in Power BI
- Teams
- Other embedded contexts

**Recommendation:** Use `IfError()` to handle failures and alert users.

### Examples

```powerfx
// Basic text copy
Copy( "Hello, World!" )

// Copy from text input
Copy( TextInput1.Text )

// Copy formatted employee data
Copy(
    $"{employeeRecord.FirstName} {employeeRecord.LastName} ({employeeRecord.Title})"
)

// Copy record ID with label
Copy( "Record ID: " & Gallery1.Selected.ID )

// Copy JSON data
Copy( JSON( Gallery1.Selected ) )

// Copy multi-line text
Copy(
    "Name: " & varRecord.Name & Char(10) &
    "Email: " & varRecord.Email & Char(10) &
    "Phone: " & varRecord.Phone
)
```

### Common Patterns

```powerfx
// Copy button with confirmation
// Button.OnSelect:
Copy( txtInvoiceNumber.Text );
Notify( "Invoice number copied to clipboard", NotificationType.Success )

// Copy with error handling
IfError(
    Copy( txtData.Text );
    Notify( "Copied to clipboard", NotificationType.Success ),
    Notify( "Copy failed. Clipboard not available.", NotificationType.Error )
)

// Copy shareable link
Copy(
    "https://apps.powerapps.com/play/..." &
    "?RecordID=" & EncodeUrl( Text( Gallery1.Selected.ID ) )
);
Notify( "Link copied!", NotificationType.Success )
```

---

## Exit Function

Exits the currently running app and optionally signs out the current user.

### Platform Availability

- Canvas apps
- Power Platform CLI

### Syntax

```powerfx
Exit( [SignOut] )
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `SignOut` | Boolean | No | If `true`, signs out the current user. Default: `false` |

### Return Value

None - terminates app execution and stops all further formula evaluation

### Behavior

- Exits app and returns user to the app list
- Stops any further formula evaluation (functions chained after `Exit` won't execute)
- In authoring mode (Power Apps Studio): stops formula evaluation but doesn't actually exit
- Can only be used in behavior formulas

### Examples

```powerfx
// Exit without signing out
Exit()

// Exit and sign out user
Exit( true )

// Conditional exit
If( !IsBlank( varCriticalError ),
    Notify( "Critical error occurred. Exiting app.", NotificationType.Error );
    Exit()
)

// Exit after timeout
If( DateDiff( varLastActivity, Now(), Minutes ) > 30,
    Notify( "Session expired", NotificationType.Warning );
    Exit( true )
)
```

### Common Patterns

```powerfx
// Logout button
// Button.OnSelect:
Exit( true )

// Exit with confirmation
If(
    Confirm( "Are you sure you want to exit?" ),
    Exit()
)

// Exit on unauthorized access
If( !IsBlank( LookUp( Admins, Email = User().Email ) ),
    // Allow access
    Navigate( DashboardScreen ),
    // Unauthorized - exit
    Notify( "Unauthorized access", NotificationType.Error );
    Exit( true )
)
```

### Best Practices

```powerfx
// GOOD: Sign out on shared devices
Exit( true )

// GOOD: Clear sensitive data before exit
Clear( colSensitiveData );
Set( varUserToken, Blank() );
Exit()

// NOTE: Code after Exit() never executes
Exit();
Notify( "This will never show" )  // Not executed!
```

---

## Host Object

Provides information about the current host device, operating system, and player running the app.

### Platform Availability

- Canvas apps
- Custom pages

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `Host.BrowserUserAgent` | Text | Complete browser user agent string |
| `Host.OSType` | Text | Operating system name (Windows, Mac OS, iOS, Android, Linux) |
| `Host.SessionID` | GUID | Current session identifier |
| `Host.TenantID` | GUID | Microsoft Entra tenant ID of authenticated user |
| `Host.Version` | Text | Power Apps player version (empty in Studio) |
| `Host.OfflineEnabled` | Boolean | Offline mode enabled status |

### Syntax

```powerfx
Host.PropertyName
```

### Property Details

#### BrowserUserAgent

Returns the complete user agent string from the browser.

```powerfx
Host.BrowserUserAgent

// Example output:
// "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36
//  (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36 Edg/109.0.1518.78"
```

#### OSType

Returns the operating system name (determined from user agent string).

```powerfx
Host.OSType

// Possible values:
// "Windows", "Mac OS", "iOS", "Android", "Linux"
```

**Warning:** Do NOT use OSType to change app experience based on OS. Use `Screen.Size` instead for responsive design.

#### SessionID

Returns a GUID identifying the current session.

```powerfx
Host.SessionID

// Example: "ee2eed1a-8455-4e68-a433-a709302d0c71"

// Use in error reports
"Session ID: " & Host.SessionID
```

#### TenantID

Returns the Microsoft Entra tenant ID.

```powerfx
Host.TenantID

// Example: "aaaabbbb-0000-cccc-1111-dddd2222eeee"
```

#### Version

Returns the Power Apps player version identification.

```powerfx
Host.Version

// Examples:
// "PowerApps-Native/3.23084.8(iOS)"
// "PowerApps-Web/3.23084.6(Windows)"
// "" (empty in Power Apps Studio)
```

#### OfflineEnabled

Returns offline mode status.

```powerfx
Host.OfflineEnabled

// Returns:
// false - App not enabled for offline OR running on web
// true - Offline-enabled on iOS/Android/Windows
```

### Examples

```powerfx
// Display all host information
Label1.Text: "OS: " & Host.OSType
Label2.Text: "Session: " & Host.SessionID
Label3.Text: "Version: " & Host.Version
Label4.Text: "Offline: " & Host.OfflineEnabled

// Log session info for debugging
Patch( ErrorLogs,
    Defaults( ErrorLogs ),
    {
        SessionID: Host.SessionID,
        TenantID: Host.TenantID,
        OSType: Host.OSType,
        Version: Host.Version,
        UserAgent: Host.BrowserUserAgent,
        ErrorMessage: varErrorMessage,
        Timestamp: Now()
    }
)

// Check if running on mobile
If( Host.OSType in ["iOS", "Android"],
    Set( varIsMobile, true ),
    Set( varIsMobile, false )
)

// Offline mode indicator
If( Host.OfflineEnabled,
    Set( iconOffline.Visible, true )
)
```

### Best Practices

```powerfx
// GOOD: Use for debugging and logging
Trace( "Host: " & Host.OSType & " v" & Host.Version )

// GOOD: Include in error reports
Set( varDiagnostics,
    {
        Session: Host.SessionID,
        OS: Host.OSType,
        Version: Host.Version
    }
)

// BAD: Don't use for UI adaptation
If( Host.OSType = "iOS",
    // iOS-specific layout
)
// Instead use: Screen.Size, Screen.Width, Screen.Height

// GOOD: Use Screen properties for responsive design
If( Screen.Size = ScreenSize.Small,
    // Mobile layout
)
```

### Important Warnings

**Do not use Host.OSType to change app functionality based on operating system.**

Power Apps runs on diverse hardware/software platforms that change over time. Use abstracted, platform-agnostic approaches:
- Use `Screen.Size` for responsive layouts
- Use `Screen.Width` and `Screen.Height` for dimension-based adaptations
- Reorganize content for smaller screens, not specific OS types

---

## Language Function

Returns the language tag of the current user for localization purposes.

### Platform Availability

- Canvas apps
- Copilot Studio
- Desktop flows
- Power Platform CLI
- Dataverse functions
- Power Pages

### Syntax

```powerfx
Language()
```

### Return Value

Returns a language tag string following the [IETF BCP-47 standard](https://tools.ietf.org/html/bcp47):

| Format | Description | Examples |
|--------|-------------|----------|
| `lg-RE` | Language + Region (most common) | `"en-US"`, `"pt-BR"`, `"fr-FR"` |
| `lg` | Language only | `"en"`, `"pt"` |
| `lg-scrp-RE` | Language + Script + Region | `"sr-cyrl-RS"`, `"sr-latn-RS"` |

### Examples

```powerfx
// Get current language
Language()

// Examples by location:
// Lisbon, Portugal:        "pt-PT"
// Rio de Janeiro, Brazil:  "pt-BR"
// Atlanta, USA:            "en-US"
// Manchester, UK:          "en-GB"
// Paris, France:           "fr-FR"
// Roseau, Dominica:        "en"
// Belgrade, Serbia:        "sr-cyrl-RS" or "sr-latn-RS"
```

### Localization Patterns

```powerfx
// Simple language check
If( Left( Language(), 2 ) = "fr",
    Set( varGreeting, "Bonjour" ),
    Set( varGreeting, "Hello" )
)

// Lookup translated text from table
LookUp(
    Translations,
    TextID = "WelcomeMessage" &&
    (LanguageTag = Left( Language(), 2 ) || IsBlank( LanguageTag ))
).LocalizedText

// Use with Microsoft Translator
MicrosoftTranslator.Translate( "Hello", Language() )

// Region-specific formatting
Switch( Language(),
    "en-US", Text( varDate, "mm/dd/yyyy" ),
    "en-GB", Text( varDate, "dd/mm/yyyy" ),
    "fr-FR", Text( varDate, "dd/mm/yyyy" ),
    Text( varDate )  // Default
)

// Currency formatting by language
Switch( Left( Language(), 2 ),
    "en", Text( varAmount, "[$-en-US]$#,##0.00" ),
    "fr", Text( varAmount, "[$-fr-FR]#,##0.00 €" ),
    "pt", Text( varAmount, "[$-pt-BR]R$ #,##0.00" ),
    Text( varAmount, "$#,##0.00" )
)
```

### Multi-Language Apps

```powerfx
// Named formula for user language
App.Formulas:
    UserLanguage = Left( Language(), 2 );

// Localization lookup function
App.Formulas:
    Localize( TextKey: Text ): Text =
        Coalesce(
            LookUp( LocalizationTable,
                Key = TextKey && Lang = UserLanguage
            ).Value,
            LookUp( LocalizationTable,
                Key = TextKey && Lang = "en"
            ).Value,
            TextKey
        );

// Usage in app
Label1.Text: Localize( "WelcomeMessage" )
Button1.Text: Localize( "Submit" )

// Welcome message by language
Switch( Left( Language(), 2 ),
    "en", "Welcome",
    "es", "Bienvenido",
    "fr", "Bienvenue",
    "de", "Willkommen",
    "pt", "Bem-vindo",
    "it", "Benvenuto",
    "ja", "ようこそ",
    "zh", "欢迎",
    "Welcome"  // Default
)
```

### Localization Table Pattern

Create a **LocalizationTable** with this structure:

| Key | Lang | Value |
|-----|------|-------|
| WelcomeMessage | en | Welcome to our app |
| WelcomeMessage | fr | Bienvenue dans notre application |
| WelcomeMessage | es | Bienvenido a nuestra aplicación |
| Submit | en | Submit |
| Submit | fr | Soumettre |
| Submit | es | Enviar |

```powerfx
// App.OnStart
ClearCollect( LocalizationTable,
    // Welcome messages
    { Key: "WelcomeMessage", Lang: "en", Value: "Welcome to our app" },
    { Key: "WelcomeMessage", Lang: "fr", Value: "Bienvenue dans notre application" },
    { Key: "WelcomeMessage", Lang: "es", Value: "Bienvenido a nuestra aplicación" },
    { Key: "WelcomeMessage", Lang: "pt", Value: "Bem-vindo ao nosso aplicativo" },

    // Button text
    { Key: "Submit", Lang: "en", Value: "Submit" },
    { Key: "Submit", Lang: "fr", Value: "Soumettre" },
    { Key: "Submit", Lang: "es", Value: "Enviar" },
    { Key: "Submit", Lang: "pt", Value: "Enviar" }
)
```

---

## ReadNFC Function

Reads Near Field Communication (NFC) tags on supported mobile devices.

### Platform Availability

- Canvas apps (native mobile apps only)
- Requires iOS or Android Power Apps mobile app
- NOT supported in Power Apps Studio or web browsers
- Requires device with NFC hardware
- Requires NFC enabled in device settings

### Syntax

```powerfx
ReadNFC()
```

### Return Value Structure

Returns a record with the following structure:

| Column | Type | Description |
|--------|------|-------------|
| `Identifier` | Text | NFC tag identifier (if available) |
| `NDEFRecords` | Table | Table of supported NDEF records |

### NDEFRecord Structure

| Column | Type | Description |
|--------|------|-------------|
| `RTD` | Text | Record Type Definition: `"Text"` or `"URI"` |
| `TNF` | Number | Type Name Format: `1` (Well Known) |
| `Text` | Text | Text payload (populated if RTD is "Text", otherwise blank) |
| `URI` | Hyperlink | URI payload (populated if RTD is "URI", otherwise blank) |

### Examples

```powerfx
// Get tag identifier
ReadNFC().Identifier
// Returns: "04A1C301314003"

// Get all NDEF records
ReadNFC().NDEFRecords

// Store NFC data in collection
// Button.OnSelect:
ClearCollect( colNFCData, ReadNFC() )

// Extract identifier and records
With( ReadNFC(),
    Set( varTagID, Coalesce( Identifier, "No ID" ) );
    ForAll( NDEFRecords,
        Collect( colNFCRecords,
            {
                TagID: varTagID,
                Type: RTD,
                TextValue: Text,
                URIValue: URI,
                Timestamp: Now()
            }
        )
    )
)

// Process text records
ForAll(
    Filter( ReadNFC().NDEFRecords, !IsBlank( Text ) ),
    Collect( colTextRecords, { Content: Text } )
)

// Process URI records
ForAll(
    Filter( ReadNFC().NDEFRecords, !IsBlank( URI ) ),
    Collect( colURIRecords, { Link: URI } )
)
```

### Complete Implementation Example

```powerfx
// Screen with NFC reader button
// Button.Text: "Read NFC Tag"
// Button.OnSelect:

With( ReadNFC(),
    If( !IsBlank( Identifier ),
        // Tag successfully read
        Set( varNFCID, Identifier );

        // Process all records
        ForAll( NDEFRecords,
            If( !IsBlank( Text ),
                Collect( colNFCData,
                    {
                        ID: varNFCID,
                        Type: "Text",
                        Value: Text,
                        ReadTime: Now()
                    }
                )
            );
            If( !IsBlank( URI ),
                Collect( colNFCData,
                    {
                        ID: varNFCID,
                        Type: "URI",
                        Value: URI,
                        ReadTime: Now()
                    }
                )
            )
        );

        Notify( "NFC tag read successfully", NotificationType.Success ),

        // No tag data
        Notify( "No NFC tag detected", NotificationType.Warning )
    )
)
```

### Error Handling

```powerfx
// With formula-level error management
IfError(
    With( ReadNFC(),
        Set( varNFCID, Identifier );
        Notify( "Tag ID: " & Identifier, NotificationType.Success )
    ),
    Notify(
        "NFC read failed: " & FirstError.Message,
        NotificationType.Error
    )
)

// Check for NFC support
If( Host.OSType in ["iOS", "Android"],
    // Attempt NFC read
    ReadNFC(),
    // Not supported
    Notify( "NFC only available on mobile devices", NotificationType.Warning )
)
```

### Best Practices

```powerfx
// GOOD: Always check for blank values
With( ReadNFC(),
    If( !IsBlank( Identifier ),
        // Process tag
    )
)

// GOOD: Use IsBlank before accessing payload
ForAll( ReadNFC().NDEFRecords,
    If( !IsBlank( Text ),
        // Process text payload
    )
)

// GOOD: Inform users about requirements
If( Host.OSType in ["iOS", "Android"],
    // Show NFC button
    Set( btnReadNFC.Visible, true ),
    // Hide on web/desktop
    Set( btnReadNFC.Visible, false )
)

// NOTE: Can only be used in behavior formulas
// Cannot use in: Label.Text, Gallery.Items, etc.
```

### Platform Limitations

- Only works in native Power Apps mobile app (iOS/Android)
- Device must have NFC hardware capability
- NFC must be enabled in device settings
- Only supports Well Known NDEF record types
- Only supports Text and URI record type definitions
- Unsupported NDEF records are excluded from results
- Function displays scanning UI and waits for tag or timeout

---

## RecordInfo Function

Provides information about a record from a data source, primarily for checking user permissions.

### Platform Availability

- Canvas apps
- Model-driven apps

### Syntax

```powerfx
RecordInfo( Record, Information )
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `Record` | Record | Yes | The record to test |
| `Information` | RecordInfo enum | Yes | The desired information type |

### Information Types

| Information Type | Description |
|-----------------|-------------|
| `RecordInfo.DeletePermission` | Does the user have permission to delete this record? |
| `RecordInfo.EditPermission` | Does the user have permission to modify this record? |
| `RecordInfo.ReadPermission` | Does the user have permission to read this record? |

### Return Value

| Value | Description |
|-------|-------------|
| `true` | User has the specified permission |
| `false` | User does not have permission, or record is blank |

### Data Source Requirements

- Only **Microsoft Dataverse** is currently supported
- Data source must be tabular and compatible with `Remove()` and `Patch()` functions
- Records from other data sources will result in a formula error
- Records must originate from a data source (not ad-hoc collections)

### Permission Levels

RecordInfo considers permissions at **both** record and table levels:
- If user has record-level permission but lacks table-level permission → returns `false`
- Both levels must grant permission for function to return `true`

### Examples

```powerfx
// Check if user can edit first account
RecordInfo( First(Accounts), RecordInfo.EditPermission )

// Check delete permission for selected record
RecordInfo( Gallery1.Selected, RecordInfo.DeletePermission )

// Check read permission
RecordInfo( varCurrentRecord, RecordInfo.ReadPermission )

// Using with With function
With( { MyRecord: First( Accounts ) },
    RecordInfo( MyRecord, RecordInfo.EditPermission )
)

// Works with collections from data sources
Collect( MyAccounts, FirstN( Accounts, 10 ) );
RecordInfo( First( MyAccounts ), RecordInfo.EditPermission )
```

### UI Control Patterns

```powerfx
// Show/hide Edit button based on permission
EditButton.Visible:
    RecordInfo( Gallery1.Selected, RecordInfo.EditPermission )

// Show/hide Delete button
DeleteButton.Visible:
    RecordInfo( Gallery1.Selected, RecordInfo.DeletePermission )

// Disable form based on edit permission
EditForm1.DisplayMode:
    If(
        RecordInfo( Gallery1.Selected, RecordInfo.EditPermission ),
        DisplayMode.Edit,
        DisplayMode.View
    )

// Conditional icon color
Icon1.Color:
    If(
        RecordInfo( ThisItem, RecordInfo.EditPermission ),
        Color.Blue,
        Color.Gray
    )

// Combined permissions check
Set( varCanModify,
    RecordInfo( varRecord, RecordInfo.EditPermission ) ||
    RecordInfo( varRecord, RecordInfo.DeletePermission )
)
```

### Advanced Patterns

```powerfx
// Check all permission types
Set( varPermissions,
    {
        CanRead: RecordInfo( varRecord, RecordInfo.ReadPermission ),
        CanEdit: RecordInfo( varRecord, RecordInfo.EditPermission ),
        CanDelete: RecordInfo( varRecord, RecordInfo.DeletePermission )
    }
)

// Conditional actions based on permissions
If(
    RecordInfo( Gallery1.Selected, RecordInfo.EditPermission ),
    EditForm( Form1 ),
    Notify( "You don't have permission to edit this record", NotificationType.Warning )
)

// Batch permission check
ClearCollect( colEditableRecords,
    Filter( Accounts,
        RecordInfo( ThisRecord, RecordInfo.EditPermission )
    )
)
```

### Error Cases

```powerfx
// ERROR: Collection not from data source
Collect( MyCollection, [ 1, 2, 3 ] );
RecordInfo( First(MyCollection), RecordInfo.DeletePermission )
// Returns error - records must originate from data source

// ERROR: Non-Dataverse source (currently)
RecordInfo( First(SharePointList), RecordInfo.EditPermission )
// Returns error - only Dataverse supported

// VALID: Blank record returns false
RecordInfo( Blank(), RecordInfo.EditPermission )
// Returns: false
```

### Best Practices

```powerfx
// GOOD: Use for button visibility
btnEdit.Visible: RecordInfo( Gallery1.Selected, RecordInfo.EditPermission )

// GOOD: Use for conditional navigation
If(
    RecordInfo( varRecord, RecordInfo.ReadPermission ),
    Navigate( DetailScreen ),
    Notify( "Access denied", NotificationType.Error )
)

// GOOD: Use with DataSourceInfo for table-level checks
If(
    DataSourceInfo( Accounts, DataSourceInfo.CreatePermission ),
    // User can create at table level
    Set( btnNew.Visible, true )
)

// BAD: Don't use on non-Dataverse sources
RecordInfo( First(ExcelTable), RecordInfo.EditPermission )  // Error!

// BAD: Don't use on ad-hoc collections
RecordInfo( First(colLocalData), RecordInfo.DeletePermission )  // Error!
```

### Related Functions

Use **DataSourceInfo** to check table-level permissions:

```powerfx
// Check if user can create records (table-level)
DataSourceInfo( Accounts, DataSourceInfo.CreatePermission )

// Check if user can edit ANY record (table-level)
DataSourceInfo( Accounts, DataSourceInfo.EditPermission )

// Combine table and record permissions
If(
    DataSourceInfo( Accounts, DataSourceInfo.CreatePermission ),
    // Show "New" button
    Set( btnNew.Visible, true )
);
If(
    RecordInfo( Gallery1.Selected, RecordInfo.EditPermission ),
    // Show "Edit" button
    Set( btnEdit.Visible, true )
)
```

---

## Trace Function

Records diagnostic information for debugging and monitoring Power Apps.

### Platform Availability

- Canvas apps
- Copilot Studio
- Model-driven apps
- Power Platform CLI
- Dataverse functions

### Syntax

```powerfx
Trace( Message [, TraceSeverity [, CustomRecord [, TraceOptions ] ] ] )
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `Message` | Text | Yes | Information to be traced (accepts numbers, dates, booleans, any type coercible to text) |
| `TraceSeverity` | Enum | No | Severity level: `Information` (default), `Warning`, `Error`, `Critical` |
| `CustomRecord` | Record | No | Custom data to be recorded in Monitor or Application Insights |
| `TraceOptions` | Enum | No | `None` (default) or `IgnoreUnsupportedTypes` (ignores non-serializable data types) |

### Severity Levels

| Severity | Usage |
|----------|-------|
| `TraceSeverity.Information` | General informational messages (default) |
| `TraceSeverity.Warning` | Warnings and potential issues |
| `TraceSeverity.Error` | Errors and failures |
| `TraceSeverity.Critical` | Critical failures requiring immediate attention |

### Output Destinations

**1. Power Apps Monitor**
- Real-time display of trace output
- Shows trace calls with formulas and initiation points
- Access: Advanced tools > Open monitor

**2. Azure Application Insights**
- If telemetry enabled, traces sent to Application Insights resource
- Enables long-term analysis and custom queries

**3. Test Studio**
- Traces appear in `Traces` table of `TestCaseResult` record
- Contains `Message` and `Timestamp` properties

### Examples

```powerfx
// Basic trace
Trace( "User clicked submit button" )

// Trace with severity
Trace( "API call failed", TraceSeverity.Error )

// Trace variable value
Trace( "Current count: " & varCount )

// Trace with custom data
Trace(
    "Record updated",
    TraceSeverity.Information,
    {
        RecordID: Gallery1.Selected.ID,
        User: User().Email,
        Timestamp: Now()
    }
)

// Trace with all parameters
Trace(
    "Processing batch",
    TraceSeverity.Warning,
    {
        BatchSize: CountRows(colBatch),
        Status: varStatus
    },
    TraceOptions.IgnoreUnsupportedTypes
)
```

### Debugging Patterns

```powerfx
// Track variable changes
Set( x, x + 1 );
Trace( "x incremented to: " & x )

// Track function execution
Trace( "Starting data load" );
ClearCollect( colData, DataSource );
Trace( "Data loaded: " & CountRows(colData) & " records" )

// Track conditional paths
If( varCondition,
    Trace( "Condition TRUE - Path A executed" ),
    Trace( "Condition FALSE - Path B executed" )
)

// Track loop iterations
ForAll( Sequence(10),
    Trace( "Processing item " & Value )
)

// Track errors
IfError(
    Patch( DataSource, varRecord, { Status: "Updated" } ),
    Trace(
        "Patch failed: " & FirstError.Message,
        TraceSeverity.Error,
        { Record: varRecord }
    )
)
```

### Performance Monitoring

```powerfx
// Measure operation duration
Set( varStartTime, Now() );
ClearCollect( colLargeData, Filter( DataSource, Status = "Active" ) );
Trace(
    "Data load completed",
    TraceSeverity.Information,
    {
        Duration: DateDiff( varStartTime, Now(), Milliseconds ),
        RecordCount: CountRows(colLargeData)
    }
)

// Track API calls
Trace( "Calling external API" );
Set( varResponse, ExternalAPI.GetData() );
Trace(
    "API response received",
    TraceSeverity.Information,
    {
        StatusCode: varResponse.StatusCode,
        RecordCount: CountRows(varResponse.Data)
    }
)
```

### User Activity Tracking

```powerfx
// Track screen navigation
Trace(
    "User navigated to Detail Screen",
    TraceSeverity.Information,
    {
        User: User().Email,
        FromScreen: App.ActiveScreen.Name,
        RecordID: Gallery1.Selected.ID
    }
)

// Track button clicks
Trace(
    "Submit button clicked",
    TraceSeverity.Information,
    {
        User: User().Email,
        FormData: Form1.LastSubmit
    }
)

// Track search queries
Trace(
    "Search performed",
    TraceSeverity.Information,
    {
        SearchTerm: txtSearch.Text,
        ResultCount: CountRows(Gallery1.AllItems)
    }
)
```

### Error Logging

```powerfx
// Log errors to Application Insights
IfError(
    Patch( Orders, Defaults(Orders), Form1.Updates ),
    Trace(
        "Order creation failed",
        TraceSeverity.Error,
        {
            User: User().Email,
            ErrorMessage: FirstError.Message,
            FormData: JSON(Form1.Updates)
        }
    );
    Notify( "Failed to create order", NotificationType.Error )
)

// Track validation failures
If(
    IsBlank(txtName.Text),
    Trace(
        "Validation failed: Name is required",
        TraceSeverity.Warning,
        { User: User().Email }
    );
    Notify( "Name is required", NotificationType.Warning )
)
```

### Best Practices

```powerfx
// GOOD: Meaningful messages with context
Trace(
    "Record patched successfully",
    TraceSeverity.Information,
    { RecordID: varRecord.ID, UpdatedBy: User().Email }
)

// GOOD: Use appropriate severity levels
Trace( "Info message", TraceSeverity.Information )
Trace( "Potential issue", TraceSeverity.Warning )
Trace( "Operation failed", TraceSeverity.Error )
Trace( "Critical system failure", TraceSeverity.Critical )

// GOOD: Include relevant data in CustomRecord
Trace(
    "Data processing completed",
    TraceSeverity.Information,
    {
        RecordsProcessed: CountRows(colProcessed),
        Duration: varDuration,
        User: User().Email,
        Timestamp: Now()
    }
)

// BAD: Vague messages
Trace( "Done" )  // What's done?
Trace( "Error" )  // What error?

// BAD: Missing severity for errors
Trace( "Critical failure occurred" )  // Should use TraceSeverity.Error or Critical

// NOTE: Can only be used in behavior formulas
// Cannot use in: Label.Text, Gallery.Items, etc.
```

### Monitor Usage

**Setup:**
1. Open Power Apps Studio
2. Click Advanced tools icon (left pane)
3. Click "Open monitor"
4. Play your app
5. Monitor displays all trace events in real-time

**Analysis:**
- Click trace events to see details
- View formula that triggered trace
- See custom data in event details
- Filter by severity level
- Search trace messages

### Application Insights Integration

```powerfx
// Custom properties for AI analysis
Trace(
    "User action tracked",
    TraceSeverity.Information,
    {
        Action: "RecordCreated",
        Module: "OrderManagement",
        User: User().Email,
        SessionID: Host.SessionID,
        AppVersion: varAppVersion,
        CustomDimension1: varCategory,
        CustomDimension2: varPriority
    }
)
```

### Test Studio Integration

Trace events are included in test results:

```powerfx
// In test case
Assert( lblStatus.Text = "Success", "Status check" );
Trace( "Status assertion passed" )
```

Trace messages appear in `TestCaseResult.Traces` table with:
- `Message` - The trace message
- `Timestamp` - When trace was recorded

---

## Summary Comparison

| Function | Purpose | Platform | Return Type |
|----------|---------|----------|-------------|
| **Assert** | Validate test conditions | Test Studio only | Test pass/fail |
| **Copy** | Copy text to clipboard | Canvas (not embedded) | None (side-effect) |
| **Exit** | Exit app / sign out user | Canvas, CLI | None (terminates) |
| **Host** | Get device/environment info | Canvas, Custom pages | Object properties |
| **Language** | Get user language tag | All platforms | Text |
| **ReadNFC** | Read NFC tags | Mobile apps only | Record with table |
| **RecordInfo** | Check record permissions | Canvas, Model-driven | Boolean |
| **Trace** | Log diagnostic messages | All platforms | None (side-effect) |

---

## Sources

- [Assert function - Microsoft Learn](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-assert)
- [Copy function - Microsoft Learn](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-copy)
- [Exit function - Microsoft Learn](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-exit)
- [Host object - Microsoft Learn](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/object-host)
- [Language function - Microsoft Learn](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-language)
- [ReadNFC function - Microsoft Learn](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-readnfc)
- [RecordInfo function - Microsoft Learn](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-recordinfo)
- [Trace function - Microsoft Learn](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-trace)
- [Formula reference - Canvas apps](https://learn.microsoft.com/en-us/power-platform/power-fx/formula-reference-canvas-apps)
