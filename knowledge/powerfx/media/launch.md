# Launch Function

Open webpages, canvas apps, or URI schemes from Power Apps.

---

## Syntax

### Basic (Argument List)

```powerfx
Launch( Address [, ParameterName1, ParameterValue1, ... ] )
```

### Record Notation (With LaunchTarget)

```powerfx
Launch( Address, { Parameter1: Value1, ... } [, LaunchTarget ] )
```

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| Address | Yes | URL or canvas app ID |
| ParameterName | No | Name of parameter |
| ParameterValue | No | Value of parameter |
| LaunchTarget | No | Window/tab target |

---

## LaunchTarget Options

| Value | Description |
|-------|-------------|
| `LaunchTarget.New` | Open in new window/tab (default) |
| `LaunchTarget.Replace` | Replace current window (web only) |
| `"CustomName"` | Named window - reuses if exists |

---

## Launch Webpages

### Basic URL

```powerfx
Launch( "https://www.microsoft.com" )
```

### With Parameters

```powerfx
// Argument list
Launch( "https://bing.com/search", "q", "Power Apps", "count", 1 )
// Opens: https://bing.com/search?q=Power%20Apps&count=1

// Record notation (preferred)
Launch( "https://bing.com/search", { q: "Power Apps", count: 1 } )
```

### With LaunchTarget

```powerfx
// New window (default)
Launch( "https://example.com", {}, LaunchTarget.New )

// Replace current window
Launch( "https://example.com", {}, LaunchTarget.Replace )

// Named window (reuses if exists)
Launch( "https://example.com", {}, "MySearchWindow" )
```

---

## Launch Canvas Apps

### Via Web Link

```powerfx
Launch( "https://apps.powerapps.com/e/{environment-id}/a/{app-id}?tenantId={tenant-id}" )
```

### Via App URI (Recommended)

```powerfx
Launch( "/providers/Microsoft.PowerApps/apps/{app-id}" )
```

### With Parameters

```powerfx
Launch(
    "/providers/Microsoft.PowerApps/apps/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    { Navigate: "DetailScreen", RecordID: 123 }
)
```

### Finding App ID

1. Go to Power Apps
2. Select **Apps** > Select your app > **Details**
3. Copy **Web link** or **App ID**

---

## Common URI Schemes

### Phone Call

```powerfx
Launch( "tel:" & varPhoneNumber )
Launch( "tel:+1-555-123-4567" )
```

### Email

```powerfx
Launch( "mailto:" & varEmail )
Launch( "mailto:support@example.com?subject=Help&body=Please%20help" )
```

### SMS

```powerfx
Launch( "sms:" & varPhoneNumber )
```

### Maps

```powerfx
// Google Maps
Launch( "https://www.google.com/maps/search/?api=1&query=" & EncodeUrl( Address ) )

// Bing Maps
Launch( "https://www.bing.com/maps?q=" & EncodeUrl( Address ) )
```

---

## Common Patterns

### Open External Link

```powerfx
// Button OnSelect
Launch( "https://docs.microsoft.com" )
```

### Search with User Input

```powerfx
Launch( "https://bing.com/search", { q: txtSearch.Text } )
```

### Open Related App

```powerfx
Launch(
    "/providers/Microsoft.PowerApps/apps/xxxxxxxx",
    {
        CustomerID: Gallery1.Selected.ID,
        Mode: "Edit"
    }
)
```

### Download File

```powerfx
Launch( varFileURL )
```

### Social Media Share

```powerfx
// Twitter
Launch( "https://twitter.com/intent/tweet", { text: varShareText } )

// LinkedIn
Launch( "https://www.linkedin.com/sharing/share-offsite/", { url: varPageURL } )
```

---

## Parameter Handling

- Parameters are **automatically URL encoded**
- Spaces become `%20`
- Special characters are escaped
- Values are converted to text

```powerfx
Launch( "https://example.com", { name: "John Doe", id: 123 } )
// Opens: https://example.com?name=John%20Doe&id=123
```

---

## Retrieving Parameters (Param Function)

In the launched app, use `Param` to retrieve values:

```powerfx
// App being launched receives:
Param( "Navigate" )   // Returns: "DetailScreen"
Param( "RecordID" )   // Returns: "123" (as text)
Param( "Missing" )    // Returns: blank
```

---

## Platform Considerations

| Platform | Behavior |
|----------|----------|
| Web browser | Opens in tab per LaunchTarget setting |
| Power BI | Only https: URLs supported |
| Mobile | May open native apps for certain schemes |
| SharePoint embedded | LaunchTarget.New recommended |

---

## Important Limitations

1. **Pop-up blockers** may block new windows
2. **Mobile**: Parameters don't refresh if app already running
3. **Native apps**: Cannot launch directly (use URI schemes)
4. **Embedded scenarios**: Avoid `LaunchTarget.Replace`
5. **https only**: Required for Power BI integration

---

## Reserved Parameter Names

Do NOT use these as custom parameters:

- `tenantId`, `locale`, `theme`, `authmode`
- `hidenavbar`, `isfullscreen`, `ispreviewmode`
- `debug`, `channeltype`, and others

---

## Common Mistakes

```powerfx
// BAD: Missing https
Launch( "example.com" )

// GOOD: Include protocol
Launch( "https://example.com" )

// BAD: Using query strings for canvas apps
Launch( "https://apps.powerapps.com/.../a/xxx?MyParam=123" )

// GOOD: Use parameter syntax
Launch( "/providers/Microsoft.PowerApps/apps/xxx", { MyParam: 123 } )

// BAD: Reserved parameter name
Launch( url, { tenantId: "abc" } )

// GOOD: Use custom parameter names
Launch( url, { myTenantRef: "abc" } )
```

---

## Sources

- [Microsoft Learn: Launch and Param functions](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-param)
