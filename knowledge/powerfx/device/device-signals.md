# Device and Signal Functions

Power Apps Canvas Apps can access device sensors and connectivity information through Device and Signal functions. These functions provide real-time data about the device's physical state, orientation, location, and network connectivity.

---

## Acceleration Signal

### Overview

The **Acceleration** signal returns the current acceleration of the device in three-dimensional space as measured by the device's accelerometer. Acceleration is measured in _g_ units of 9.81 m/s² (or 32.2 ft/s²), which represents the acceleration that Earth imparts to objects at its surface due to gravity.

### Syntax

```powerfx
Acceleration.X
Acceleration.Y
Acceleration.Z
Acceleration  // Returns entire record
```

### Properties

The Acceleration signal provides the following properties:

| Property | Type | Description |
|----------|------|-------------|
| Acceleration.X | Number | Right/left acceleration. Positive values indicate rightward motion |
| Acceleration.Y | Number | Forward/back acceleration. Positive values indicate forward motion |
| Acceleration.Z | Number | Up/down acceleration. Positive values indicate upward motion |

### Platform Availability

| Platform | Supported |
|----------|-----------|
| Canvas Apps (Browser) | No - Returns zero values during app creation/modification |
| Canvas Apps (Android) | Yes - Accurate values in native player |
| Canvas Apps (iOS) | Yes - Accurate values in native player |
| Model-driven Apps | Not available |

### Permission Requirements

- **Android**: ACCELEROMETER permission (typically granted automatically)
- **iOS**: Motion & Fitness permission (accessed through device settings)

### Rules

1. **Signal behavior**: Values change automatically and independently of user interaction. Formulas based on Acceleration automatically recalculate as values change
2. **Native player requirement**: Returns accurate values only in Power Apps mobile (iOS/Android). Returns zero values in browser during app creation/modification
3. **Constant updates**: Acceleration values update continuously as device moves
4. **Reference frame**: Measured relative to device's screen orientation, not world coordinates
5. **Null when unavailable**: Returns blank if device lacks accelerometer or sensor is disabled
6. **g-unit measurement**: Values expressed in g units (9.81 m/s² or 32.2 ft/s²)

### Examples

```powerfx
// Display X-axis acceleration
Text(
    Acceleration.X,
    "0.00"
) & " g"

// Get entire acceleration record
Acceleration
// Returns: { X: 0, Y: 264, Z: 0 }

// Example: Ball throwing motion detection
// Forward acceleration while throwing
Acceleration.Y = 8.2

// No acceleration while ball is in air
Acceleration.Y = 0

// Backward acceleration when catching
Acceleration.Y = -8.2

// Detect if device is being shaken (high acceleration)
If(
    Sqrt( Acceleration.X^2 + Acceleration.Y^2 + Acceleration.Z^2 ) > 20,
    "Device is being shaken",
    "Device is still"
)

// Monitor vertical acceleration (tilt detection)
If(
    Acceleration.Z > 8,
    "Device tilted upward",
    If(
        Acceleration.Z < -8,
        "Device tilted downward",
        "Device level"
    )
)

// Track acceleration over time (collect for analysis)
Patch(
    DeviceMetrics,
    Defaults(DeviceMetrics),
    {
        Timestamp: Now(),
        AccelX: Acceleration.X,
        AccelY: Acceleration.Y,
        AccelZ: Acceleration.Z
    }
)
```

### Common Use Cases

1. **Motion-based interactions**: Shake detection for triggering actions
2. **Tilt detection**: Responsive UI based on device orientation
3. **Activity tracking**: Detecting movement patterns
4. **Gesture recognition**: Custom gestures based on acceleration patterns
5. **Game mechanics**: Physics-based mobile games
6. **Form input alternative**: Device motion as alternative to buttons

### Performance Notes

- Acceleration values update frequently; consider throttling updates
- High polling rates can impact battery life
- Store only necessary data points in collections

---

## Compass Signal

### Overview

The **Compass** signal returns the direction the top of the device's screen is pointing relative to magnetic north. It provides a heading value in degrees (0-360).

### Syntax

```powerfx
Compass.Heading
```

### Property

Returns a number representing the heading in degrees:

| Value | Direction |
|-------|-----------|
| 0 (or 360) | North |
| 90 | East |
| 180 | South |
| 270 | West |
| 45 | Northeast |
| 135 | Southeast |

### Platform Availability

| Platform | Supported |
|----------|-----------|
| Canvas Apps (Browser) | No - Returns zero values during app creation/modification |
| Canvas Apps (Android) | Yes - Accurate values in native player |
| Canvas Apps (iOS) | Yes - Accurate values in native player |
| Model-driven Apps | Not available |

### Permission Requirements

- **Android**: Device sensor permissions (typically granted by default)
- **iOS**: Device motion permissions (typically granted by default)
- May require location services on some devices

### Rules

1. **Signal behavior**: Value changes automatically and independently of user interaction. Formulas based on Compass automatically recalculate as heading changes
2. **Native player requirement**: Returns accurate values only in Power Apps mobile (iOS/Android). Returns zero values in browser during app creation/modification
3. **Magnetic north reference**: Heading is relative to magnetic north, not true north
4. **Degree range**: Value between 0 and 360 degrees (0 = North, 90 = East, 180 = South, 270 = West)
5. **Continuous update**: Changes dynamically as device orientation changes
6. **Null when unavailable**: Returns blank if device lacks compass sensor
7. **Interference sensitivity**: Accuracy affected by magnetic interference (metal objects, electronics)

### Examples

```powerfx
// Display current heading
Text(Compass.Heading, "0.0") & "°"
// Example output: "230.25°"

// Determine cardinal direction
Switch(
    Int(Compass.Heading / 45) Mod 8,
    0, "North",
    1, "Northeast",
    2, "East",
    3, "Southeast",
    4, "South",
    5, "Southwest",
    6, "West",
    7, "Northwest",
    "Unknown"
)

// Visual compass indicator (rotating image)
// Set image rotation property:
Compass.Heading

// Check if pointing toward specific direction (within 30 degree tolerance)
If(
    Abs( Compass.Heading - 90 ) < 30 Or Abs( Compass.Heading - 90 ) > 330,
    "Pointing roughly East",
    "Not pointing East"
)

// Map-based heading indicator
With(
    {heading: Compass.Heading},
    // Display arrow pointing in device direction
    Shape1.Rotation = heading
)

// Navigation guidance
If(
    Compass.Heading > 350 Or Compass.Heading < 10,
    "Maintain North heading",
    If(
        Compass.Heading > 10,
        "Turn left to reach North",
        "Turn right to reach North"
    )
)
```

### Common Use Cases

1. **Map applications**: Display map rotated to match device heading
2. **Navigation apps**: Heading-up map display
3. **Compass tools**: Direct compass functionality
4. **AR applications**: Orienting augmented reality overlays
5. **Location-based services**: Determining approach direction
6. **Outdoor/hiking apps**: Trail navigation assistance

### Accuracy Considerations

- Magnetic declination varies by geographic location
- Accuracy affected by proximity to magnetic sources
- Requires device calibration for optimal accuracy
- May need filtering for smooth heading display

---

## Connection Signal

### Overview

The **Connection** signal returns information about the device's current network connectivity status, including whether the device is connected, if the connection is metered, and the synchronization state for offline-enabled apps.

### Syntax

```powerfx
Connection.Connected
Connection.Metered
Connection.Sync
```

### Properties

Returns a record with the following properties:

| Property | Type | Description |
|----------|------|-------------|
| Connection.Connected | Boolean | `true` if device has active network connection (Wi-Fi or cellular) |
| Connection.Metered | Boolean | `true` if connection is metered (uses data quota/limits) |
| Connection.Sync | ConnectionSync enum | Current synchronization state (for offline-enabled apps) |

### Connection.Sync Enum Values

For apps configured for offline use, the `Connection.Sync` property returns one of these values:

| Enum Value | Description |
|------------|-------------|
| ConnectionSync.Connected | Device connected to network; app ready for offline use |
| ConnectionSync.ConnectedWithWarning | Device connected but with a warning condition |
| ConnectionSync.ConnectedPendingUpsync | Device online with data waiting to be synchronized to server |
| ConnectionSync.ConnectedError | Error occurred during last synchronization attempt |
| ConnectionSync.ConnectedRefresh | App is currently synchronizing data |
| ConnectionSync.NotConnected | Device not connected to service |
| ConnectionSync.NotConnectedWithWarning | Device offline with warning from last synchronization |
| ConnectionSync.NotConnectedPendingUpsync | Device offline with updates waiting to be synchronized |
| ConnectionSync.NotConnectedSyncError | Device offline with error from last synchronization |

### Platform Availability

| Platform | Supported |
|----------|-----------|
| Canvas Apps (Browser) | Yes |
| Canvas Apps (Android) | Yes |
| Canvas Apps (iOS) | Yes |
| Model-driven Apps | Yes (Canvas apps only) |

### Permission Requirements

- **Android**: ACCESS_NETWORK_STATE permission (typically granted automatically)
- **iOS**: No specific permission needed (basic connectivity check)
- **Web**: Browser's Network Information API (when available)

### Rules

1. **Signal behavior**: Values change automatically and independently of user interaction. Formulas based on Connection automatically recalculate as connectivity changes
2. **Cross-platform support**: Available on web browsers and mobile platforms
3. **Real-time status**: Updates dynamically when connectivity changes
4. **Metered definition**: Metered typically means cellular data or mobile hotspot connection
5. **Offline handling**: `Connected = false` when device is offline
6. **Sync state for offline apps**: `Connection.Sync` provides detailed synchronization status for apps enabled for offline use
7. **Limited connection details**: Does not specify exact connection type (Wi-Fi vs 4G vs 5G)

### Examples

```powerfx
// Check if device is connected
If(
    Connection.Connected,
    "Online - Ready to sync",
    "Offline - Changes will sync when reconnected"
)

// Example output: Connection.Connected = true

// Adjust data loading based on connection type
If(
    !Connection.Connected,
    ClearCollect(LocalData, Filter(CachedData, Offline = true)),
    ClearCollect(LocalData, Filter(DefaultData, true))
)

// Warn about metered connection
If(
    Connection.Connected && Connection.Metered,
    "Warning: Using cellular data",
    ""
)

// Example: Check if metered
Connection.Metered = true

// Disable heavy operations on metered connections
Button1.OnSelect: If(
    !Connection.Metered,
    SyncLargeDataset(),
    Notify("Use Wi-Fi for this operation", NotificationType.Warning)
)

// Monitor connection status
Set(
    IsOnline,
    Connection.Connected
);
If(
    IsOnline && !IsBlank(PendingSyncQueue),
    SyncData()
)

// Check synchronization state for offline-enabled apps
Connection.Sync = ConnectionSync.Connected

// Display sync status message
Switch(
    Connection.Sync,
    ConnectionSync.ConnectedPendingUpsync, "Data waiting to sync...",
    ConnectionSync.ConnectedRefresh, "Syncing now...",
    ConnectionSync.ConnectedError, "Sync error occurred",
    ConnectionSync.NotConnected, "Offline mode",
    "Ready"
)

// Offline-first pattern
If(
    Connection.Connected,
    Patch(CloudData, ...),
    Patch(LocalOfflineData, ...)
)
```

### Common Use Cases

1. **Offline detection**: Determine if features requiring internet should be enabled
2. **Data sync**: Automatically sync data when connection restored
3. **Connection warnings**: Alert users on metered connections before data-heavy operations
4. **Offline mode**: Provide offline-first functionality when disconnected
5. **Feature availability**: Enable/disable cloud features based on connectivity
6. **Upload/download control**: Restrict large transfers to Wi-Fi
7. **Offline-first apps**: Local-first data architecture

### Practical Patterns

```powerfx
// Pattern 1: Offline-first synchronization
If(
    Connection().Connected,
    Set(NeedsSync, true);
    // Sync pending changes
    ForAll(PendingChanges, Patch(OnlineData, ...));
    ,
    Set(NeedsSync, false)
    // Queue changes for later
)

// Pattern 2: Progressive enhancement
Set(
    LoadingStrategy,
    Switch(
        true,
        !Connection().Connected, "CacheOnly",
        Connection().Metered, "SmallImages",
        "FullQuality"
    )
)

// Pattern 3: Connection state monitoring with sync status
If(
    Connection.Connected,
    Switch(
        Connection.Sync,
        ConnectionSync.ConnectedRefresh, Notify("Syncing...", NotificationType.Information),
        ConnectionSync.ConnectedError, Notify("Sync failed", NotificationType.Error),
        ConnectionSync.ConnectedPendingUpsync, Notify("Changes pending", NotificationType.Warning)
    )
)
```

### Limitations

- Does not indicate specific connection type (Wi-Fi vs cellular)
- Does not show signal strength or quality
- May have slight delay detecting connection changes
- Browser-based web apps depend on browser API support

---

## Location Signal

### Overview

The **Location** signal returns the device's current geographic position using GPS, cellular triangulation, IP address, or Wi-Fi positioning. It provides latitude, longitude, and altitude information. On first access, the user is prompted to grant location permissions.

### Syntax

```powerfx
Location.Latitude
Location.Longitude
Location.Altitude
Location  // Returns entire record
```

### Properties

Returns a record with the following properties:

| Property | Type | Description | Range |
|----------|------|-------------|-------|
| Location.Latitude | Number | Geographic latitude from equator in decimal degrees | -90 to 90 (positive = north of equator) |
| Location.Longitude | Number | Geographic longitude from Greenwich in decimal degrees | -180 to 180 (positive = east of Greenwich) |
| Location.Altitude | Number | Altitude above sea level in meters (may be blank) | N/A |

### Platform Availability

| Platform | Supported |
|----------|-----------|
| Canvas Apps (Browser) | Yes (if browser supports Geolocation API and user grants permission) |
| Canvas Apps (Android) | Yes |
| Canvas Apps (iOS) | Yes |
| Model-driven Apps | Yes (Canvas apps only) |

### Permission Requirements

- **Android**: ACCESS_FINE_LOCATION permission (GPS) or ACCESS_COARSE_LOCATION (network-based)
- **iOS**: Location Services must be enabled; app requires location usage description
- **Web**: User must grant location permission via browser prompt (HTTPS required)
- **User prompt**: First access to Location triggers permission request

### Rules

1. **Signal behavior**: Values change automatically and independently of user interaction. Formulas based on Location automatically recalculate as position changes
2. **Permission prompt**: First access prompts user to allow location access
3. **Asynchronous on web**: May return blank initially while acquiring position
4. **Continuous updates**: Location updates as device moves
5. **Null when unavailable**: Returns blank if location services disabled or permission denied
6. **Multiple sources**: Uses GPS (most accurate), cell towers, Wi-Fi networks, or IP address
7. **Battery consumption**: Location updates consume battery power; consider using Enable() and Disable() functions
8. **Auto-disable**: Location automatically disables when current screen has no location-dependent formulas
9. **Altitude may be blank**: Not all positioning methods provide altitude data

### Examples

```powerfx
// Display current location
Text(Location.Latitude, "0.000000") & ", " & Text(Location.Longitude, "0.000000")

// Example output
Location.Latitude = 47.591
Location.Longitude = 122.333

// Get entire location record
Location
// Returns: { Latitude: 47.591, Longitude: 122.333, Altitude: <meters> }

// Check if location available
If(
    IsBlank(Location.Latitude),
    "Location unavailable - enable location services",
    "Location active: " & Text(Location.Latitude, "0.00°")
)

// Display on map control
Map1.Items = [{
    Latitude: Location.Latitude,
    Longitude: Location.Longitude,
    Label: "You are here",
    Color: Blue
}]

// Format location for display or sharing
{
    Latitude: Text(Location.Latitude, "0.000000"),
    Longitude: Text(Location.Longitude, "0.000000"),
    Altitude: Text(Location.Altitude, "0") & "m",
    Timestamp: Now()
}

// Store location history
Patch(
    LocationHistory,
    Defaults(LocationHistory),
    {
        UserID: User().Email,
        Latitude: Location.Latitude,
        Longitude: Location.Longitude,
        Altitude: Location.Altitude,
        Timestamp: Now()
    }
)

// Display altitude
If(
    !IsBlank(Location.Altitude),
    "Altitude: " & Text(Location.Altitude, "0") & " meters",
    "Altitude unavailable"
)
```

### Common Use Cases

1. **Maps**: Display current location on map controls
2. **Location-based services**: Filtering data by proximity
3. **Check-in apps**: Recording visit locations
4. **Delivery tracking**: Following routes and locations
5. **Geofencing**: Triggering actions at specific locations
6. **Location history**: Tracking movement over time
7. **Local search**: Finding nearby places/services
8. **Field service apps**: Recording work location

### Practical Patterns

```powerfx
// Pattern 1: Location with permission check
Set(
    CurrentLocation,
    If(
        !IsBlank(Location.Latitude),
        Location,
        {
            Latitude: 0,
            Longitude: 0,
            Altitude: Blank()
        }
    )
);

// Pattern 2: Haversine distance calculation (km)
With(
    {
        R: 6371,  // Earth radius in km
        lat1: Location.Latitude * Pi() / 180,
        lon1: Location.Longitude * Pi() / 180,
        lat2: TargetLatitude * Pi() / 180,
        lon2: TargetLongitude * Pi() / 180,
        dlat: (TargetLatitude - Location.Latitude) * Pi() / 180,
        dlon: (TargetLongitude - Location.Longitude) * Pi() / 180
    },
    2 * R * Asin(
        Sqrt(
            Power(Sin(dlat / 2), 2) +
            Cos(lat1) * Cos(lat2) * Power(Sin(dlon / 2), 2)
        )
    )
)

// Pattern 3: Location tracking with intervals
Set(
    LocationTracker,
    true
);
If(
    LocationTracker && Mod(Value(Time(Now())), 5) = 0,
    // Record location every 5 seconds
    Patch(
        Locations,
        Defaults(Locations),
        {
            Latitude: Location.Latitude,
            Longitude: Location.Longitude,
            Timestamp: Now()
        }
    )
)

// Pattern 4: Enable/Disable Location signal manually
Enable(Location);
// ... use location ...
Disable(Location);
```

### Location Sources

The Location signal uses multiple sources to determine position:

| Method | Description | Availability |
|--------|-------------|--------------|
| GPS | Most accurate outdoor positioning | Mobile devices with GPS hardware |
| Cell towers | Network-based triangulation | Areas with cellular coverage |
| Wi-Fi | Position based on nearby Wi-Fi networks | Areas with known Wi-Fi networks |
| IP address | Approximate location from internet connection | All internet-connected devices |

### Performance Considerations

- Location updates consume battery power
- Use `Enable(Location)` and `Disable(Location)` to control updates manually
- Location automatically disables when no formulas on current screen depend on it
- First location request may take several seconds to acquire position
- Subsequent requests are typically faster

### Web-Specific Notes

- Browser geolocation is asynchronous; initial result may be blank
- User must grant permission via browser prompt
- HTTPS required for web apps requesting location
- Some browsers block location on insecure contexts

---

## Comparison Table

| Signal | Properties | Platform | Browser Support | Use Case |
|--------|------------|----------|----------------|----------|
| Acceleration | X, Y, Z | Mobile only | Returns zero values | Motion detection, gestures |
| Compass | Heading | Mobile only | Returns zero values | Direction, navigation, maps |
| Connection | Connected, Metered, Sync | Web & Mobile | Full support | Offline detection, sync control |
| Location | Latitude, Longitude, Altitude | Web & Mobile | Full support (with permission) | Maps, geofencing, tracking |

---

## Best Practices

### Battery Optimization

1. Only request Acceleration/Compass when needed
2. Implement throttling for high-frequency updates
3. Stop monitoring when app backgrounded
4. Use appropriate polling intervals

### Privacy & Permissions

1. Always request permissions explicitly
2. Explain to users why permissions are needed
3. Handle permission denial gracefully
4. Minimize data retention of location information

### Offline-First Design

1. Utilize Connection() function for offline detection
2. Queue changes when offline, sync when reconnected
3. Provide offline UI feedback
4. Cache frequently needed data

### Location Reliability

1. Always check for blank values before relying on location data
2. Implement fallback for when location is unavailable
3. Use appropriate distance calculations (Haversine formula)
4. Account for acquisition time on first request
5. Use Enable() and Disable() functions to control battery usage

---

## Microsoft Learn References

- [Acceleration, App, Compass, Connection, and Location signals - Official Reference](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/signals)
- [Enable and Disable functions for Location control](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-enable-disable)
- [Create an app that uses mobile sensors](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/how-to/mobile-sensors)
- [Power Fx Formula Reference - Canvas Apps](https://learn.microsoft.com/en-us/power-platform/power-fx/formula-reference-canvas-apps)
- [Develop offline-capable canvas apps](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/offline-apps)

---

## Related Signals and Functions

- **Acceleration** - Device acceleration signal (X, Y, Z axes)
- **Compass** - Magnetic heading signal
- **Connection** - Network connectivity and sync status signal
- **Location** - GPS coordinates signal
- **App** - App environment signal (ActiveScreen, etc.)
- **Enable()** - Enable a signal (currently works with Location only)
- **Disable()** - Disable a signal (currently works with Location only)
- **Map** - Control for displaying locations
- **Time(), Now(), Today()** - Time-based functions
- **User()** - Current user information

---

## Version History

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2025-12-12 | Initial documentation for Acceleration, Compass, Connection, Location |
| 1.1 | 2025-12-12 | Updated with official Microsoft Learn documentation: corrected property syntax (dot notation), added Connection.Sync enum, removed Accuracy property from Location, verified all examples and platform availability |

## Sources

- [Acceleration, App, Compass, Connection, and Location signals - Official Reference](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/signals)
- [Enable and Disable functions for Location control](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-enable-disable)
- [Create an app that uses mobile sensors](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/how-to/mobile-sensors)
- [Power Fx Formula Reference - Canvas Apps](https://learn.microsoft.com/en-us/power-platform/power-fx/formula-reference-canvas-apps)
- [Develop offline-capable canvas apps](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/offline-apps)
