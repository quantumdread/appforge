# User and Param Functions

Get current user information and app launch parameters.

---

## User Function

Returns information about the currently signed-in user.

### Syntax

```powerfx
User()
```

### Properties Returned

| Property | Type | Description |
|----------|------|-------------|
| `User().Email` | Text | User's email (UPN format) |
| `User().FullName` | Text | User's display name |
| `User().Image` | Image | User's profile photo URL |
| `User().EntraObjectId` | GUID | Microsoft Entra Object ID |

### Examples

```powerfx
// Get email
User().Email                    // "john.doe@contoso.com"

// Get full name
User().FullName                 // "John Doe"

// Get Entra ID (for API calls)
User().EntraObjectId            // GUID value

// Display profile image
// Set Image control's Image property to:
User().Image
```

---

## Common User Patterns

### Filter by Current User

```powerfx
Filter( Orders, CreatedBy = User().Email )
Filter( Tasks, AssignedTo = User().Email )
```

### Check User Permissions

```powerfx
// Named formula for admin check
IsCurrentUserAdmin = !IsBlank(
    LookUp( Admins, Email = User().Email )
)

// Check role
Set( varUserRole,
    LookUp( UserRoles, Email = User().Email, Role )
)
```

### Personalized Welcome

```powerfx
"Welcome, " & User().FullName
"Hello, " & First( Split( User().FullName, " " ) ).Value
```

### Audit Trail

```powerfx
Patch( Records,
    Defaults( Records ),
    {
        Title: txtTitle.Text,
        CreatedBy: User().Email,
        CreatedByName: User().FullName,
        CreatedDate: Now()
    }
)
```

---

## Param Function

Retrieves parameters passed to the app at launch.

### Syntax

```powerfx
Param( "ParameterName" )
```

### Return Type

Always returns **Text** (even for numbers)

### Returns Blank If

- Parameter was not passed
- Parameter name doesn't match (case-sensitive)

---

## Passing Parameters

### From Another Canvas App

```powerfx
Launch(
    "https://apps.powerapps.com/play/e/env-id/a/app-id",
    { RecordID: "123", Mode: "Edit" }
)
```

### From URL (Web Link)

```
https://apps.powerapps.com/play/e/env-id/a/app-id?tenantId=xxx&RecordID=123&Mode=Edit
```

### From Power Automate

Use "Run a Power App" action with parameters.

---

## Param Examples

### Basic Usage

```powerfx
// Get parameter
Param( "RecordID" )              // "123" (text)
Param( "Mode" )                  // "Edit"
Param( "MissingParam" )          // Blank

// Convert to number
Value( Param( "RecordID" ) )     // 123 (number)

// Check if provided
!IsBlank( Param( "RecordID" ) )  // true/false
```

### Deep Link Navigation

```powerfx
// App.OnStart or App.StartScreen
If( !IsBlank( Param( "RecordID" ) ),
    // Navigate to detail screen with record
    Set( varRecordID, Value( Param( "RecordID" ) ) );
    Navigate( DetailScreen ),
    // Default to home
    Navigate( HomeScreen )
)
```

### Conditional Screen

```powerfx
// App.StartScreen
Switch( Param( "Screen" ),
    "Settings", SettingsScreen,
    "Profile", ProfileScreen,
    "Reports", ReportsScreen,
    HomeScreen  // Default
)
```

### Load Record from Parameter

```powerfx
// Screen.OnVisible
If( !IsBlank( Param( "ID" ) ),
    Set( varRecord,
        LookUp( DataSource, ID = Value( Param( "ID" ) ) )
    )
)
```

---

## Common Patterns

### App Initialization with Params

```powerfx
// App.OnStart
Set( varRecordID,
    If( !IsBlank( Param( "id" ) ),
        Value( Param( "id" ) ),
        Blank()
    )
);

Set( varMode,
    Coalesce( Param( "mode" ), "view" )
);
```

### Create Shareable Link

```powerfx
// Generate link to current record
Set( varShareLink,
    "https://apps.powerapps.com/play/e/" &
    Environment().Name & "/a/" &
    App.ID & "?RecordID=" &
    EncodeUrl( Text( Gallery1.Selected.ID ) )
)
```

### Form Mode from Parameter

```powerfx
// Screen.OnVisible
Switch( Param( "mode" ),
    "new", NewForm( EditForm1 ),
    "edit", EditForm( EditForm1 ),
    ViewForm( EditForm1 )
)
```

---

## Reserved Parameters

Do not use these as custom parameter names:
- `tenantId`
- `source`
- `screenColor`
- `locale`
- `authmode`
- `debug`
- `theme`
- (and others used by the platform)

---

## Parameter Best Practices

```powerfx
// GOOD: Check before using
If( !IsBlank( Param( "ID" ) ),
    Value( Param( "ID" ) ),
    -1
)

// GOOD: Use Coalesce for defaults
Coalesce( Param( "View" ), "List" )

// GOOD: URL encode when building links
EncodeUrl( Param( "SearchTerm" ) )

// BAD: Assume parameter exists
Value( Param( "ID" ) )  // Error if blank!

// BAD: Case mismatch (params are case-sensitive)
Param( "recordid" )  // Won't match "RecordID"
```

---

## Mobile Considerations

- Parameters don't refresh if app already running
- Use `Launch()` with new parameters requires app reload
- Consider `SaveData`/`LoadData` for persistent state

---

## Sources

- [Microsoft Learn: User function](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-user)
- [Microsoft Learn: Param function](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-param)
