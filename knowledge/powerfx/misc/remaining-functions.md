# Additional PowerFx Functions

This document covers miscellaneous PowerFx functions that don't fit into other categories: media export, data source relationships, data refresh, and host information.

---

## PDF Function (Experimental)

Exports contents from the current screen or control to a PDF object (blob).

### Platform Availability

- **Canvas apps**: Yes (experimental)
- **Model-driven apps**: No
- **Status**: Experimental (not for production use)
- **Requirement**: Must be enabled in Settings > Upcoming features > Experimental tab

### Syntax

```powerfx
PDF( ScreenOrControl [, { Size, DPI, Margin, Orientation, ExpandContainers } ] )
```

### Parameters

| Parameter | Required | Type | Description | Default |
|-----------|----------|------|-------------|---------|
| ScreenOrControl | Yes | Screen or Control | Screen or control to export. Supported: Screen, Container, Vertical/Horizontal Layout Container, Vertical Gallery | — |
| Size | No | Text | PDF page dimensions: "Letter", "A4", "A3", etc. | "Letter" (US/Canada)<br>"A4" (others) |
| DPI | No | Number | Scaling/resolution (must be > 0). Higher DPI = higher quality but larger file | 96 |
| Margin | No | Text | Space between content and edge. Supports: in, cm, mm, pt, px. Can specify per side | "0.5in" (12.7mm) |
| Orientation | No | Text | "Portrait" (vertical) or "Landscape" (horizontal) | "Portrait" |
| ExpandContainers | No | Boolean | Expands containers to show all content when content exceeds allocated size | false |

### Return Type

PDF object (blob) - binary data that can be passed to connectors or flows.

### Examples

```powerfx
// Basic PDF with default settings
PDF( Screen1 )

// Send PDF via email using Office 365 Outlook connector
Office365Outlook.SendEmailV2(
    "recipient@contoso.com",
    "Report",
    "Please see attached report.",
    {
        Attachments: Table({
            Name: "Report.pdf",
            ContentBytes: PDF( Screen1 )
        })
    }
)

// A3-sized PDF with custom DPI
PDF( Container1, { Size: "A3", DPI: 150 } )

// Landscape orientation with custom margins
PDF(
    Screen1,
    {
        Orientation: "Landscape",
        Margin: "25mm",
        DPI: 72
    }
)

// Expand containers to show all content
PDF( Screen1, { ExpandContainers: true } )

// Different margins for each side (top, right, bottom, left)
PDF( Screen1, { Margin: "1in 0.5in 1in 0.5in" } )

// Pass to Power Automate flow
MyFlow.Run( PDF( Screen1 ) )
```

### Limitations

1. **Unsupported controls**: Charts, Power BI tiles, Map controls, some third-party PCF controls
2. **Nested galleries**: Not supported
3. **Fonts**: Non-Latin scripts and certain font styles (bold, italic) may not render correctly
4. **Fillable PDFs**: Cannot be created
5. **Device-dependent**: PDF generation happens on the device running the app (desktop vs. mobile have different capacities)
6. **File size**: Large files can cause app crashes, especially on mobile devices
7. **Screen limitation**: Can only generate PDFs from content on the screen where PDF() is invoked

### Best Practices

```powerfx
// Use Try/IfError for error handling
Set(
    varPDFResult,
    IfError(
        PDF( Screen1 ),
        Notify( "Failed to generate PDF: " & FirstError.Message, NotificationType.Error )
    )
)

// Show loading indicator during generation
UpdateContext({ varGenerating: true });
Set( varPDF, PDF( Screen1 ) );
UpdateContext({ varGenerating: false })

// Optimize for mobile - lower DPI, smaller margins
PDF(
    Screen1,
    {
        DPI: 72,
        Margin: "0.25in",
        Size: "Letter"
    }
)
```

### Important Notes

- This is an **experimental feature** not meant for production use
- Be cautious with image size, quantity, and data volume, especially for mobile apps
- PDF generation is synchronous and may freeze the UI for complex screens
- Test thoroughly on target devices before deployment

---

## Relate and Unrelate Functions

Creates or removes relationships between records in Microsoft Dataverse through one-to-many or many-to-many relationships.

### Platform Availability

- **Canvas apps**: Yes
- **Model-driven apps**: Yes
- **Data source**: Microsoft Dataverse only

### Syntax

```powerfx
// Create relationship
Relate( Table1RelatedTable, Table2Record )

// Remove relationship
Unrelate( Table1RelatedTable, Table2Record )
```

### Parameters

| Parameter | Required | Type | Description |
|-----------|----------|------|-------------|
| Table1RelatedTable | Yes | Table | For a record of Table1, the table of Table2 records related through a one-to-many or many-to-many relationship |
| Table2Record | Yes | Record | The Table2 record to add (Relate) or remove (Unrelate) from the relationship |

### Return Type

None - These functions have no return value and can only be used in behavior formulas.

### How They Work

#### One-to-Many Relationships

- The "Many" table has a foreign-key field pointing to a "One" table record
- **Relate**: Sets the foreign key to point to a specific "One" table record
- **Unrelate**: Sets the foreign key to blank
- If a link already exists, Relate replaces it with the new link
- Alternative: Can also use `Patch()` function or Edit form control

#### Many-to-Many Relationships

- System maintains a hidden join table
- Join table cannot be accessed directly
- Can be read through one-to-many projection
- Can be set only through Relate and Unrelate functions
- Relationships are **symmetric** (can be called from either direction)

### Examples

#### One-to-Many: Assign Reservation to Product

```powerfx
// Reassign a reservation to the selected product
Relate( ComboBox1.Selected.Reservations, ThisItem )

// Remove a reservation from any product
Unrelate( Gallery1.Selected.Reservations, ThisItem )

// Conditional: Unrelate if blank, otherwise relate
If(
    IsBlank( ComboBox1.Selected ),
    Unrelate( Gallery1.Selected.Reservations, ThisItem ),
    Relate( ComboBox1.Selected.Reservations, ThisItem )
);
Refresh( Reservations )
```

#### Many-to-Many: Manage Contacts and Products

```powerfx
// Add a contact to a product
Relate( Gallery1.Selected.Contacts, ComboBox1.Selected )

// Remove a contact from a product
Unrelate( Gallery1.Selected.Contacts, ThisItem )

// Symmetric operation - both work identically
Relate( First( Products ).Contacts, First( Contacts ) )
Relate( First( Contacts ).Products, First( Products ) )

// Add multiple contacts to a product
ForAll(
    colSelectedContacts,
    Relate( Gallery1.Selected.Contacts, ThisRecord )
)
```

#### Complete Workflow with Refresh

```powerfx
// Button OnSelect - Add contact to product
Relate( Gallery1.Selected.Contacts, ComboBox1.Selected );
Refresh( Products );
Notify( "Contact added successfully", NotificationType.Success )

// Screen OnVisible - Refresh data when navigating
Refresh( Contacts );
Refresh( Products )
```

### Data Refresh Behavior

| Table Position | Refresh Behavior |
|----------------|------------------|
| First argument table | Automatically refreshed |
| Second argument table | Must be manually refreshed using `Refresh()` |

```powerfx
// First argument (Products) auto-refreshes
// Second argument (Contacts) needs manual refresh
Relate( Products.Contacts, ComboBox1.Selected );
Refresh( Contacts )  // Manual refresh required
```

### Rules

1. **Records only**: These functions only relate/unrelate existing records - they never create or delete records
2. **Behavior formulas only**: Can only be used in behavior formulas (button OnSelect, screen OnVisible, etc.)
3. **No return value**: Cannot be used in data binding expressions
4. **Dataverse only**: Works only with Microsoft Dataverse data sources
5. **Existing records**: Both records must already exist in their respective tables

### Common Mistakes

```powerfx
// BAD: Trying to use in a formula property
Text1.Text = Relate( Products.Contacts, ComboBox1.Selected )

// GOOD: Use in behavior formula
Button1.OnSelect = Relate( Products.Contacts, ComboBox1.Selected )

// BAD: Forgetting to refresh second table
Relate( Products.Contacts, ComboBox1.Selected )
// Contacts table not refreshed - UI may be stale

// GOOD: Refresh both tables
Relate( Products.Contacts, ComboBox1.Selected );
Refresh( Contacts );
Refresh( Products )

// BAD: Using with non-Dataverse source
Relate( SharePointList.Items, ThisItem )

// GOOD: Only use with Dataverse
Relate( DataverseTable.RelatedRecords, ThisItem )
```

### Related Functions

| Function | Use Case |
|----------|----------|
| `Patch` | Create/modify records (can also set foreign keys) |
| `Refresh` | Refresh data source after relationship changes |
| `Collect` | Add records to collections |
| `Filter` | Retrieve related records |

---

## Revert Function

Refreshes and clears errors for records of a data source.

### Platform Availability

- **Canvas apps**: Yes
- **Model-driven apps**: No

### Syntax

```powerfx
Revert( DataSource [, Record ] )
```

### Parameters

| Parameter | Required | Type | Description |
|-----------|----------|------|-------------|
| DataSource | Yes | Data source | The data source to revert |
| Record | No | Record | The specific record to revert. If omitted, the entire data source is reverted |

### Return Type

None - Revert has no return value and can only be used in behavior formulas.

### What It Does

1. **Refreshes data**: Displays changes made by other users
2. **Clears errors**: Removes any errors from the `Errors()` function for reverted records
3. **Resolves conflicts**: Useful after `Patch()` operations that result in conflicts

### Examples

#### Basic Revert

```powerfx
// Revert entire data source
Revert( Customers )

// Revert specific record
Revert( Customers, Gallery1.Selected )

// Revert form's last edited record
Revert( Customers, EditForm1.LastSubmit )
```

#### Conflict Resolution Workflow

```powerfx
// Initial Patch that might cause a conflict
Patch(
    IceCream,
    LookUp( IceCream, Flavor = "Strawberry" ),
    { Quantity: 500 }
);

// Check for errors
If(
    !IsEmpty( Errors( IceCream, EditRecord ) ),
    Notify( "Update failed - revert to resolve", NotificationType.Warning )
)

// Button Visible property - show only when conflict exists
!IsEmpty(
    Lookup(
        Errors( IceCream, EditRecord ),
        Error = ErrorKind.Conflict
    )
)

// Reload button OnSelect - resolve conflict
Revert( IceCream, EditRecord );
Notify( "Record reverted to latest version", NotificationType.Success )
```

#### Complete Error Handling Pattern

```powerfx
// Attempt to save changes
Set( varSaveResult,
    Patch(
        Customers,
        Gallery1.Selected,
        { Status: "Active" }
    )
);

// Check for errors
If(
    !IsEmpty( Errors( Customers, Gallery1.Selected ) ),

    // Error occurred
    If(
        Lookup(
            Errors( Customers, Gallery1.Selected ),
            Error = ErrorKind.Conflict
        ).Error = ErrorKind.Conflict,

        // Conflict error - revert and notify
        Revert( Customers, Gallery1.Selected );
        Notify( "Record was modified by another user. Please try again.", NotificationType.Warning ),

        // Other error
        Notify( "Save failed: " & First( Errors( Customers, Gallery1.Selected ) ).Message, NotificationType.Error )
    ),

    // Success
    Notify( "Saved successfully", NotificationType.Success )
)
```

#### Refresh After Other Users' Changes

```powerfx
// Refresh button to get latest data
Revert( Products );
Notify( "Data refreshed", NotificationType.Information )

// Auto-refresh on screen visible
Screen1.OnVisible =
    Revert( Orders );
    ClearCollect( colOrders, Orders )

// Refresh before attempting update
Button1.OnSelect =
    Revert( Inventory, Gallery1.Selected );
    Patch( Inventory, Gallery1.Selected, { Quantity: TextInput1.Text } )
```

### Common Patterns

#### Discard Unsaved Changes

```powerfx
// Cancel button - revert to server version
Revert( DataSource, Form1.Item );
Back()
```

#### Retry After Conflict

```powerfx
// Retry button - revert then reapply changes
Revert( Customers, varEditedRecord );
Patch(
    Customers,
    varEditedRecord,
    { Email: TextInput1.Text }  // Reapply user's changes
)
```

#### Periodic Refresh

```powerfx
// Timer OnTimerEnd - refresh every 5 minutes
Revert( OrderQueue );
Notify( "Order queue refreshed", NotificationType.Information )
```

### Rules

1. **Behavior formulas only**: Can only be used in behavior formulas
2. **No return value**: Cannot be assigned to variables or used in expressions
3. **Clears errors**: The `Errors()` table becomes empty after successful revert
4. **Overwrites local changes**: Any unsaved edits to the reverted record(s) are lost
5. **Network required**: Requires connection to refresh from server

### Common Mistakes

```powerfx
// BAD: Trying to use in data binding
Text1.Text = Revert( Customers )

// GOOD: Use in behavior formula
Button1.OnSelect = Revert( Customers )

// BAD: Expecting return value
Set( varResult, Revert( Customers ) )

// GOOD: Just call the function
Revert( Customers );
Notify( "Refreshed", NotificationType.Success )

// BAD: Not handling user's unsaved changes
Revert( Customers, Form1.Item )  // User loses their edits!

// GOOD: Warn user first
If(
    Form1.Unsaved,
    Confirm( "Discard unsaved changes?" ) && Revert( Customers, Form1.Item ),
    Revert( Customers, Form1.Item )
)
```

### Related Functions

| Function | Use Case |
|----------|----------|
| `Refresh` | Refresh data source (doesn't clear errors) |
| `Errors` | Check for errors after data operations |
| `Patch` | Modify records (may cause conflicts) |
| `IsError` | Check if value is an error |
| `IfError` | Handle errors in expressions |

---

## ShowHostInfo Function

Displays host object information to users in a pop-up dialog.

### Platform Availability

- **Canvas apps**: Yes
- **Model-driven apps**: No
- **Use case**: Primarily for offline sync information in mobile apps

### Syntax

```powerfx
ShowHostInfo( HostInfo )
```

### Parameters

| Parameter | Required | Type | Description |
|-----------|----------|------|-------------|
| HostInfo | Yes | Object | The type of host information to display. Currently supports `HostInfo.OfflineSync` |

### Return Type

None - Displays information in a pop-up dialog.

### Examples

#### Offline Sync Information

```powerfx
// Show offline sync status
ShowHostInfo( HostInfo.OfflineSync )

// Sync button in mobile app
SyncButton.OnSelect =
    ShowHostInfo( HostInfo.OfflineSync );
    Notify( "Sync status displayed", NotificationType.Information )
```

#### Setup for Offline Apps

```powerfx
// Prerequisites:
// 1. Enable app for offline in Settings
// 2. Configure offline profile
// 3. Add Sync icon control to app

// Sync icon OnSelect property
Icon1.OnSelect = ShowHostInfo( HostInfo.OfflineSync )
```

### Information Displayed

When `ShowHostInfo(HostInfo.OfflineSync)` is called, the pop-up shows:

1. **Sync Status**: Current synchronization state
2. **Last Sync Date**: When the last sync occurred
3. **Downloaded Tables**: List of tables available offline
4. **Sync Errors**: Any synchronization issues (if applicable)

### Platform Behavior Differences

| Platform | Behavior |
|----------|----------|
| **Mobile** (iOS/Android) | Pop-up dialog with sync information |
| **Windows** | Loads in full screen instead of dialog |
| **Web browser** | May have limited functionality |

### Known Issues

1. **Table name vs. display name**: The table column shows the logical table name instead of the display name
2. **Windows display**: Pop-up appears full screen on Windows instead of as a contained dialog
3. **Limited parameters**: Currently only supports `HostInfo.OfflineSync`

### Common Patterns

#### Sync Button with Refresh

```powerfx
Button1.OnSelect =
    // Show sync status
    ShowHostInfo( HostInfo.OfflineSync );

    // Refresh data sources after user reviews status
    Refresh( Customers );
    Refresh( Orders )
```

#### Conditional Display

```powerfx
// Only show sync info if app is offline-enabled
If(
    Connection.Connected,
    Notify( "Online - sync not needed", NotificationType.Information ),
    ShowHostInfo( HostInfo.OfflineSync )
)
```

#### Help Button

```powerfx
// Info icon for users to check offline status
Icon_Help.OnSelect =
    ShowHostInfo( HostInfo.OfflineSync )
```

### Requirements

1. **Offline capability**: App must be enabled for offline use
2. **Mobile app**: Best experience on Power Apps Mobile
3. **Dataverse**: Requires Dataverse data sources
4. **Offline profile**: Must have offline profile configured

### Rules

1. **Behavior formulas only**: Can only be used in behavior formulas
2. **No return value**: Cannot be assigned to variables
3. **User interaction**: Displays modal pop-up - blocks interaction until dismissed
4. **Mobile-focused**: Designed primarily for mobile offline scenarios

### Related Objects and Functions

| Item | Description |
|------|-------------|
| `Host` object | Provides information about the current host (OSType, SessionID, TenantID) |
| `Connection` | Signal to check online/offline status |
| `Refresh` | Refresh data sources |
| `User` | Current user information |

### Best Practices

```powerfx
// Use with offline-enabled apps only
If(
    CountRows( OfflineData ) > 0,
    ShowHostInfo( HostInfo.OfflineSync ),
    Notify( "Offline mode not enabled", NotificationType.Warning )
)

// Combine with Connection signal
If(
    !Connection.Connected,
    ShowHostInfo( HostInfo.OfflineSync ),
    Notify( "Online - sync not required", NotificationType.Information )
)

// Add to app's help menu
Gallery_HelpMenu.OnSelect =
    Switch(
        ThisItem.Action,
        "SyncStatus", ShowHostInfo( HostInfo.OfflineSync ),
        "About", Navigate( AboutScreen ),
        "Help", Launch( "https://docs.microsoft.com/..." )
    )
```

---

## Sources

### Official Microsoft Learn Documentation

- [PDF function (experimental)](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-pdf)
- [Work with the PDF function](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/how-to/pdf-function)
- [Relate and Unrelate functions](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-relate-unrelate)
- [Revert function](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-revert)
- [ShowHostInfo object](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/showhostinfo)
- [Host object reference](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/object-host)
