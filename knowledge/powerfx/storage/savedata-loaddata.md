# SaveData, LoadData, and ClearData Functions

Store and retrieve collections from local device storage for offline use and caching.

---

## Syntax

```powerfx
SaveData( Collection, Name )
LoadData( Collection, Name [, IgnoreNonexistentFile ] )
ClearData( [ Name ] )
```

## Parameters

| Parameter | Function | Required | Description |
|-----------|----------|----------|-------------|
| Collection | SaveData, LoadData | Yes | Collection to store or load |
| Name | All | Yes | Storage key (identifier) |
| IgnoreNonexistentFile | LoadData | No | Suppress error if not found (default: false) |

---

## Name Restrictions

Cannot contain these characters: `*".?:\<>|/`

---

## SaveData

Saves a collection to device storage.

```powerfx
// Save collection to local storage
SaveData( colOfflineData, "MyCache" )
```

- Names are **unique per app** (no conflicts between apps)
- Overwrites existing data with same name
- **Behavior formula only**

---

## LoadData

Loads a previously saved collection from storage.

```powerfx
// Load collection from storage
LoadData( colOfflineData, "MyCache" )

// Ignore if doesn't exist (no error)
LoadData( colOfflineData, "MyCache", true )
```

### Important: LoadData Appends

LoadData **appends** to existing collection data:

```powerfx
// BAD: Calling multiple times creates duplicates
LoadData( colData, "Cache" )
LoadData( colData, "Cache" )  // Data doubled!

// GOOD: Clear first to replace
Clear( colData );
LoadData( colData, "Cache" )
```

---

## ClearData

Removes saved data from storage.

```powerfx
// Clear specific storage key
ClearData( "MyCache" )

// Clear ALL app storage
ClearData()
```

---

## Storage Limits

| Platform | Limit |
|----------|-------|
| Power Apps in Teams | 1 MB |
| Web Browser | 1 MB |
| Mobile (iOS/Android) | No fixed limit (30-70 MB typical) |

Mobile limits depend on:
- Available device memory
- Memory used by Power Apps player
- App complexity (screens, controls)

---

## Platform Availability

| Platform | Available |
|----------|-----------|
| Power Apps Mobile (iOS/Android) | Yes |
| Power Apps in Teams | Yes (1 MB limit) |
| Web Browser (published) | Yes (1 MB limit) |
| Power Apps Studio | No |
| Web Browser (testing) | No |

**Always test on actual mobile device** for reliable results.

---

## Common Patterns

### App.OnStart - Load Cache

```powerfx
// Load cached data on app start
Clear( colProducts );
LoadData( colProducts, "ProductCache", true );
If(
    IsEmpty( colProducts ),
    // Cache empty - fetch from data source
    ClearCollect( colProducts, ProductsList );
    SaveData( colProducts, "ProductCache" )
)
```

### Offline Data Storage

```powerfx
// When online - save for offline use
ClearCollect( colCustomers, Customers );
SaveData( colCustomers, "CustomerCache" )

// When offline - use cached data
If(
    Connection.Connected,
    ClearCollect( colCustomers, Customers ),
    Clear( colCustomers );
    LoadData( colCustomers, "CustomerCache", true )
)
```

### Save User Preferences

```powerfx
// Save settings collection
SaveData(
    colUserSettings,
    "UserPreferences"
)

// Load on app start
LoadData( colUserSettings, "UserPreferences", true )
```

### Pending Changes Queue

```powerfx
// Save pending changes for later sync
Collect( colPendingChanges, { Action: "Update", RecordID: 123, Data: varData } );
SaveData( colPendingChanges, "PendingSync" )

// On reconnect - process queue
Clear( colPendingChanges );
LoadData( colPendingChanges, "PendingSync", true );
ForAll( colPendingChanges, /* sync logic */ );
ClearData( "PendingSync" )
```

---

## Security Considerations

| Issue | Recommendation |
|-------|----------------|
| Data stored in plain text | Don't store sensitive data in web apps |
| No encryption (web) | Use mobile device management for encryption |
| Persists across sign-outs | May persist for same OS user account |
| Device sharing | Consider shared device scenarios |

---

## Implicit Collection Definition

Collections don't need pre-definition:

```powerfx
// This automatically creates colMyData with correct structure
LoadData( colMyData, "StorageKey", true )
```

---

## Complete Offline Example

```powerfx
// App.OnStart
Clear( colItems );
LoadData( colItems, "ItemCache", true )

// Add Item Button
Collect( colItems, { Name: txtName.Text, Date: Now() } );
SaveData( colItems, "ItemCache" )

// Clear All Button
Clear( colItems );
ClearData( "ItemCache" )

// Refresh from Server Button
ClearCollect( colItems, ServerItems );
SaveData( colItems, "ItemCache" )
```

---

## Error Handling

```powerfx
// Safe load with error handling
IfError(
    LoadData( colData, "Cache" ),
    // Handle error
    Notify( "Failed to load cached data", NotificationType.Warning )
)

// Or use IgnoreNonexistentFile
LoadData( colData, "Cache", true )  // Silent if not found
```

---

## Common Mistakes

```powerfx
// BAD: Forgetting LoadData appends
LoadData( colData, "Key" )
LoadData( colData, "Key" )  // Duplicates!

// GOOD: Clear first
Clear( colData );
LoadData( colData, "Key" )

// BAD: Invalid characters in name
SaveData( col, "my/cache:file" )  // Error!

// GOOD: Simple alphanumeric names
SaveData( col, "MyCache" )

// BAD: Testing in browser/Studio
SaveData( col, "Test" )  // Won't work!

// GOOD: Test on mobile device

// BAD: Storing sensitive data in web app
SaveData( colPasswords, "Secrets" )

// GOOD: Only store non-sensitive data
SaveData( colPreferences, "Settings" )
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Data not saving | Test on mobile device, not browser |
| Data not loading | Check name matches exactly |
| Out of memory | Reduce collection size, check limits |
| Duplicates appearing | Use `Clear()` before `LoadData()` |
| Works in Studio but not published | SaveData only works in published apps |

---

## SaveData vs Patch/Collect

| SaveData | Patch/Collect |
|----------|---------------|
| Local device storage | Data source (cloud) |
| Works offline | Requires connection |
| Limited size | Server-side limits |
| Per-device | Shared across devices |
| For caching | For persistence |

---

## Sources

- [Microsoft Learn: SaveData, LoadData, ClearData](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-savedata-loaddata)
