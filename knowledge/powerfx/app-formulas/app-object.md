# App Object - PowerFx Canvas Apps

The **App** object provides information about the currently running canvas app and controls its behavior. Every canvas app has an App object accessible from the Tree view pane.

---

## Properties Overview

| Property | Type | Purpose | Context |
|----------|------|---------|---------|
| `ActiveScreen` | Object | Reference to currently displayed screen | Read-only |
| `BackEnabled` | Boolean | Controls device back gesture behavior | Power Apps Mobile |
| `ConfirmExit` | Boolean | Shows exit confirmation dialog | All platforms |
| `ConfirmExitMessage` | Text | Custom exit confirmation message | All platforms |
| `OnError` | Formula | Global error handler | Behavior formula |
| `OnStart` | Formula | App initialization code | Behavior formula |
| `StartScreen` | Formula | Determines first screen to show | Data flow formula |
| `Formulas` | Declarations | Named formulas and UDFs | Declarative |

---

## App.ActiveScreen

### Description
Returns a reference to the screen currently displayed to the user.

### Type
Screen object (read-only)

### Syntax

```powerfx
App.ActiveScreen
App.ActiveScreen.Name
App.ActiveScreen = ScreenName
```

### Examples

#### Get Current Screen Name

```powerfx
// Display current screen name in a label
Label1.Text: App.ActiveScreen.Name
```

#### Check if Specific Screen is Active

```powerfx
// Conditional logic based on current screen
If(
    App.ActiveScreen = HomeScreen,
    "You are on the home screen",
    "You are on another screen"
)
```

#### Use in Button Visibility

```powerfx
// Show button only on specific screens
Button1.Visible: App.ActiveScreen = DetailScreen || App.ActiveScreen = EditScreen
```

### Best Practices

- Use `App.ActiveScreen.Name` for debugging and analytics
- Compare with screen objects, not string names
- Use for conditional UI logic based on navigation state
- Navigate using `Back()` or `Navigate()` functions

### Related Functions
- `Navigate()` - Change active screen
- `Back()` - Return to previous screen

---

## App.BackEnabled

### Description
Controls how the device back gesture responds when running in Power Apps Mobile.

### Type
Boolean

### Platform Support
- **Android**: Hardware back button or swipe gesture
- **iOS**: Swipe from left edge
- **Web/Desktop**: Not applicable

### Behavior

| Value | Behavior |
|-------|----------|
| `true` (default) | Back gesture returns to most recently shown screen (like `Back()` function) |
| `false` | Back gesture exits app to app list |

### Syntax

```powerfx
App.BackEnabled: boolean_expression
```

### Examples

#### Disable Back Navigation

```powerfx
// Force users to use custom navigation
App.BackEnabled: false
```

#### Conditional Back Control

```powerfx
// Disable back on login screen
App.BackEnabled: App.ActiveScreen <> LoginScreen
```

### Important Warning

> **EXPERIMENTAL PROPERTY**: Microsoft documentation states that `BackEnabled` is experimental and may be removed from the App object eventually. Avoid using in production environments.

### Best Practices

- Test behavior on both Android and iOS devices
- Consider user experience when disabling
- Provide alternative navigation methods if disabled
- Check for deprecation notices before using

---

## App.ConfirmExit

### Description
When set to `true`, displays a confirmation dialog before the app closes, preventing accidental data loss.

### Type
Boolean (default: `false`)

### Syntax

```powerfx
App.ConfirmExit: boolean_expression
```

### When Dialog Appears

The confirmation dialog shows when:

**Browser:**
- Closing browser tab or window
- Clicking browser back button
- Using `Launch()` function with `Self` parameter
- Navigating away from app page

**Power Apps Mobile:**
- Swiping to switch apps
- Pressing back button (Android)
- Launching another canvas app

**When NOT Used:**
- `Exit()` function called
- App embedded in Power BI or SharePoint
- Custom pages (not supported)

### Examples

#### Basic Exit Confirmation

```powerfx
// Always confirm exit
App.ConfirmExit: true
```

#### Conditional Based on Unsaved Changes

```powerfx
// Confirm only when form has unsaved changes
App.ConfirmExit: AccountForm.Unsaved Or ContactForm.Unsaved
```

#### Multiple Form Check

```powerfx
// Check multiple forms for unsaved changes
App.ConfirmExit: Or(
    EditForm1.Unsaved,
    EditForm2.Unsaved,
    !IsBlank(varDraftText)
)
```

#### Custom Variable Tracking

```powerfx
// Track changes with variable
App.ConfirmExit: varHasUnsavedChanges

// Set variable when data changes
TextInput1.OnChange: Set(varHasUnsavedChanges, true)

// Clear after save
Button_Save.OnSelect:
    Patch(DataSource, Defaults(DataSource), {Field: TextInput1.Text});
    Set(varHasUnsavedChanges, false)
```

### Limitations

- **Not shown in Power Apps Studio** - Only works in published apps
- **Not supported in embedded apps** (Power BI, SharePoint, Teams)
- **Not supported in custom pages**
- **Delayed load restriction**: Can only reference controls on the first screen when **Delayed load** preview feature is enabled (default for new apps)
  - **Workaround**: Disable Delayed load in **Settings → Upcoming features → Preview**
  - If referencing other screens, app may not open in Power Apps Mobile or browser

### Browser Behavior Note

Some browsers may show their own generic exit message instead of the custom message. This is browser-dependent and cannot be controlled by Power Apps.

### Best Practices

- Use `Form.Unsaved` property for edit forms
- Track changes with variables for custom forms
- Test in both browser and mobile
- Keep confirmation logic simple
- Clear "unsaved" state after successful save

---

## App.ConfirmExitMessage

### Description
Custom message displayed in the exit confirmation dialog box.

### Type
Text (optional)

### Default
Generic message: "You may have unsaved changes." (localized to user's language)

### Syntax

```powerfx
App.ConfirmExitMessage: text_expression
```

### Examples

#### Static Custom Message

```powerfx
App.ConfirmExitMessage: "You have unsaved work. Are you sure you want to exit?"
```

#### Dynamic Message Based on Form

```powerfx
App.ConfirmExitMessage: If(
    AccountsForm.Unsaved,
    "Accounts form has unsaved changes. Exit anyway?",
    "Contacts form has unsaved changes. Exit anyway?"
)
```

#### Multiple Forms with Details

```powerfx
App.ConfirmExitMessage:
    With(
        {
            accountChanges: AccountsForm.Unsaved,
            contactChanges: ContactsForm.Unsaved
        },
        If(
            accountChanges && contactChanges,
            "Both forms have unsaved changes. Continue?",
            accountChanges,
            "Account form has unsaved changes. Continue?",
            contactChanges,
            "Contact form has unsaved changes. Continue?",
            "You may have unsaved changes. Exit?"
        )
    )
```

#### Blank Message (Use Default)

```powerfx
// Empty string uses default localized message
App.ConfirmExitMessage: ""
```

### Message Truncation

Messages are automatically truncated to fit within the confirmation dialog box. Keep messages concise (2-3 lines maximum).

### Browser Limitations

Some browsers ignore custom messages and display their own generic confirmation. This is a browser security feature and cannot be overridden.

### Best Practices

- Keep messages brief and clear
- Use simple, non-technical language
- Test message length in actual dialog
- Provide actionable information
- Consider localization for multi-language apps

---

## App.OnError

### Description
Global error handler that evaluates when errors occur anywhere in the app. Provides error interception before displaying error banners.

### Type
Behavior formula

### Syntax

```powerfx
App.OnError: error_handling_formula
```

### Scope Variables

| Variable | Type | Description |
|----------|------|-------------|
| `FirstError` | Record | First error encountered |
| `AllErrors` | Table | All errors that occurred |

### FirstError Properties

| Property | Description |
|----------|-------------|
| `FirstError.Message` | Error message text |
| `FirstError.Kind` | Error type (ErrorKind enumeration) |
| `FirstError.Source` | Control/formula where error originated |
| `FirstError.Observed` | Where error was observed/surfaced |

### Examples

#### Basic Error Logging

```powerfx
// Log errors to Application Insights
App.OnError: Trace($"Error: {FirstError.Message} in {FirstError.Source}", TraceSeverity.Error)
```

#### Log and Display Default Error

```powerfx
// Log to trace AND show error banner
App.OnError:
    Trace($"Error {FirstError.Message} in {FirstError.Source}", TraceSeverity.Error);
    Error(FirstError)
```

#### Conditional Error Handling

```powerfx
// Handle specific control errors differently
App.OnError:
    If(
        FirstError.Source = "Slider1",
        Notify("Slider value is invalid", NotificationType.Error),
        Error(FirstError) // Show default for others
    )
```

#### Write Errors to Database

```powerfx
// Log errors to SharePoint list
App.OnError:
    Patch(
        ErrorLog,
        Defaults(ErrorLog),
        {
            ErrorMessage: FirstError.Message,
            ErrorSource: FirstError.Source,
            ErrorKind: Text(FirstError.Kind),
            UserEmail: User().Email,
            ScreenName: App.ActiveScreen.Name,
            Timestamp: Now()
        }
    );
    Error(FirstError)
```

#### Silent Error Suppression (Use with Caution)

```powerfx
// Suppress errors from specific control
App.OnError:
    If(
        FirstError.Source = "Gallery1",
        false, // Suppress error
        Error(FirstError) // Show all other errors
    )
```

#### Handle Multiple Errors

```powerfx
// Log all errors, display first
App.OnError:
    ForAll(
        AllErrors,
        Trace($"Error: {Message} from {Source}", TraceSeverity.Error)
    );
    Error(FirstError)
```

### Important Limitations

- **Cannot replace errors**: Unlike `IfError()`, `App.OnError` cannot replace error values with alternatives
- **Controls reporting only**: Only determines if/how errors are reported to users
- **Concurrent evaluation**: Formulas evaluate concurrently (use `With()` for named local values)
- **Error deduplication**: Error banners automatically deduplicate to prevent spam
- **No screen loaded**: Errors in `OnStart` may not have screen context

### Use Cases

- Centralized error logging
- Send errors to Application Insights
- Write errors to database/web service
- Custom error notifications
- Suppress specific non-critical errors
- Debug and troubleshooting

### Error Rethrowing

To pass errors to the next handler or display them:

```powerfx
// Rethrow first error
Error(FirstError)

// Rethrow all errors
Error(AllErrors)
```

### Best Practices

- Always log errors for debugging
- Use `Trace()` for Application Insights integration
- Don't suppress errors silently without logging
- Include context (screen, user, timestamp)
- Test error handling in both Studio and published app
- Consider user experience when customizing error display

### Related Functions
- `IfError()` - Local error handling with replacement
- `Error()` - Throw/rethrow errors
- `IsError()` - Check if value is error
- `Trace()` - Log to Application Insights

---

## App.OnStart

### Description
Behavior formula that runs when the user starts the app, before the first screen appears.

### Type
Behavior formula

### Syntax

```powerfx
App.OnStart: initialization_formula
```

### Common Uses

| Use Case | Function |
|----------|----------|
| **Load reference data** | `ClearCollect(colCategories, Categories)` |
| **Set global variables** | `Set(varTheme, "Blue")` |
| **Get user context** | `Set(varCurrentUser, User())` |
| **Initialize app state** | `Set(varAppMode, "Normal")` |
| **Load parameters** | `Set(varRecordID, Param("id"))` |

### Examples

#### Basic Initialization

```powerfx
App.OnStart:
    // Load user information
    Set(varCurrentUser, User());
    Set(varUserEmail, User().Email);

    // Load reference data
    ClearCollect(colCategories, Categories);
    ClearCollect(colCountries, Countries);

    // Set theme
    Set(varPrimaryColor, RGBA(0, 120, 212, 1))
```

#### Load Data with Error Handling

```powerfx
App.OnStart:
    Set(varLoadError, false);
    IfError(
        ClearCollect(colProducts, Products);
        ClearCollect(colCustomers, Customers),
        Set(varLoadError, true);
        Notify("Failed to load data", NotificationType.Error)
    )
```

#### User Role-Based Setup

```powerfx
App.OnStart:
    // Get user info
    Set(varCurrentUser, User());

    // Look up user role
    Set(
        varUserRole,
        LookUp(Employees, Email = varCurrentUser.Email).Role
    );

    // Set permissions
    Set(varIsAdmin, varUserRole = "Admin");
    Set(varCanEdit, varUserRole in ["Admin", "Manager", "Editor"])
```

#### Concurrent Data Loading

```powerfx
App.OnStart:
    Concurrent(
        ClearCollect(colProducts, Products),
        ClearCollect(colOrders, Orders),
        ClearCollect(colCustomers, Customers),
        Set(varCurrentUser, User())
    )
```

### Important Limitations

#### Cannot Use UpdateContext

`UpdateContext()` requires a loaded screen. Use `Set()` for global variables or pass context variables via `Navigate()`:

```powerfx
// ❌ WRONG - No screen loaded yet
App.OnStart: UpdateContext({locScreenMode: "View"})

// ✅ CORRECT - Use Set for global
App.OnStart: Set(varScreenMode, "View")

// ✅ CORRECT - Pass to Navigate (deprecated approach)
App.OnStart: Navigate(HomeScreen, None, {locScreenMode: "View"})
```

#### Navigate in OnStart is RETIRED

Using `Navigate()` in `OnStart` is deprecated. Use `App.StartScreen` instead:

```powerfx
// ❌ DEPRECATED - Don't use Navigate in OnStart
App.OnStart: Navigate(
    If(Param("admin") = "1", AdminScreen, HomeScreen),
    None
)

// ✅ CORRECT - Use StartScreen property
App.StartScreen: If(Param("admin") = "1", AdminScreen, HomeScreen)
```

#### Performance Impact

`OnStart` blocks the first screen from loading. Heavy operations cause delays:

```powerfx
// ❌ BAD - Blocks app load
App.OnStart:
    ClearCollect(colOrders, Orders); // Large dataset
    ClearCollect(colCustomers, Customers);
    ClearCollect(colProducts, Products)

// ✅ BETTER - Use Named Formulas (lazy load)
App.Formulas:
    ActiveOrders = Filter(Orders, Status = "Active");
    CustomerList = Customers;
    ProductCatalog = Products
```

#### Nonblocking OnStart (Default)

By default, `OnStart` runs concurrently with other app formulas. Variables may not be initialized when first referenced:

```powerfx
// OnStart sets variable
App.OnStart: Set(varTheme, LookUp(Settings, User = User().Email).Theme)

// Other controls may execute before OnStart completes
Label1.Fill: If(varTheme = "Dark", Black, White) // varTheme may be blank initially
```

**Solution:** Use Named Formulas instead:

```powerfx
App.Formulas:
    UserTheme = LookUp(Settings, User = User().Email).Theme;

Label1.Fill: If(UserTheme = "Dark", Black, White) // Always available
```

### Testing OnStart

In Power Apps Studio:
1. Right-click **App** object in Tree view
2. Select **Run OnStart**
3. Preserves existing collections and variables

### Migration to Named Formulas

#### Before (OnStart)

```powerfx
App.OnStart:
    Set(varThemeColor, RGBA(0, 120, 212, 1));
    Set(varCurrentUser, User());
    Set(varIsAdmin, LookUp(Admins, Email = User().Email));
    ClearCollect(colActiveProducts, Filter(Products, Active))
```

**Problems:**
- Blocks app startup
- Order-dependent execution
- Variables can be overwritten
- All evaluated at startup

#### After (Named Formulas)

```powerfx
App.Formulas:
    ThemeColor = RGBA(0, 120, 212, 1);
    CurrentUser = User();
    IsAdmin = !IsBlank(LookUp(Admins, Email = User().Email));
    ActiveProducts = Filter(Products, Active)
```

**Benefits:**
- Available immediately
- Order-independent
- Immutable (cannot be overwritten)
- Lazy evaluation (only when needed)

### When to Still Use OnStart

Use `OnStart` only when you need:
- Mutable global state (`Set()` required)
- Collections that need to be modified (`Collect()`, `Remove()`)
- One-time startup actions with side effects
- Compatibility with older app patterns

### Best Practices

- **Migrate to Named Formulas** whenever possible
- **Keep OnStart minimal** - only truly necessary code
- **Use `Concurrent()`** for parallel data loading
- **Handle errors** with `IfError()` or `App.OnError`
- **Avoid heavy data loads** - defer to screen `OnVisible`
- **Don't use `Navigate()`** - use `StartScreen` instead
- **Test performance** - monitor app load time

---

## App.StartScreen

### Description
Determines which screen displays first when the app loads. Evaluated once at startup and returns a screen object.

### Type
Data flow formula (no behavior functions allowed)

### Default Behavior
If not set, the first screen in the Studio Tree view displays first.

### Syntax

```powerfx
App.StartScreen: screen_expression
```

### Allowed in StartScreen

| Category | Functions |
|----------|-----------|
| **Parameters** | `Param()` |
| **User Info** | `User()` |
| **Data Queries** | `LookUp()`, `Filter()`, `CountRows()`, `Max()` |
| **Connectors** | API calls (must return quickly) |
| **Signals** | `Connection`, `Compass`, `App` |
| **Named Formulas** | Any named formula |
| **Conditionals** | `If()`, `Switch()`, `Coalesce()` |
| **Error Handling** | `IfError()` |

### NOT Allowed in StartScreen

| Restricted | Reason |
|------------|--------|
| `Navigate()`, `Back()` | Behavior functions |
| `Set()`, `UpdateContext()` | Behavior functions |
| `Collect()`, `Patch()` | Behavior functions |
| Global variables from `OnStart` | Not available yet |
| Collections from `OnStart` | Not available yet |

### Examples

#### Simple Screen Selection

```powerfx
// Always start on specific screen
App.StartScreen: DashboardScreen
```

#### Parameter-Based Navigation

```powerfx
// Check deep link parameter
App.StartScreen: If(
    Param("admin-mode") = "1",
    AdminScreen,
    HomeScreen
)
```

#### User Role-Based Routing

```powerfx
// Route based on user role from database
App.StartScreen: If(
    LookUp(Attendees, Email = User().Email).Staff,
    StaffPortal,
    HomeScreen
)
```

#### Deep Linking with Record ID

```powerfx
// Navigate to detail screen if ID provided
App.StartScreen: If(
    !IsBlank(Param("recordId")),
    DetailScreen,
    BrowseScreen
)

// Use Param value in DetailScreen.OnVisible:
DetailScreen.OnVisible: Set(
    varSelectedRecord,
    LookUp(Records, ID = Value(Param("recordId")))
)
```

#### Multi-Parameter Routing

```powerfx
App.StartScreen: Switch(
    Param("mode"),
    "admin", AdminScreen,
    "reports", ReportsScreen,
    "settings", SettingsScreen,
    HomeScreen // Default
)
```

#### API-Based Routing with Error Handling

```powerfx
// Call API to determine screen, fallback on error
App.StartScreen: IfError(
    If(
        CustomConnector.GetUserPreference() = "Forest",
        ForestScreen,
        OceanScreen
    ),
    ErrorScreen // Show if API fails
)
```

#### Complex Conditional Logic

```powerfx
App.StartScreen:
    With(
        {
            userEmail: User().Email,
            recordId: Param("recordId")
        },
        If(
            // Admin users
            !IsBlank(LookUp(Admins, Email = userEmail)),
            AdminDashboard,

            // Deep link with record ID
            !IsBlank(recordId),
            DetailScreen,

            // Regular users
            HomeScreen
        )
    )
```

#### Connection Status Check

```powerfx
App.StartScreen: If(
    Connection.Connected,
    OnlineHomeScreen,
    OfflineScreen
)
```

### Named Formula Integration

Since global variables aren't available, use named formulas:

```powerfx
// Define in App.Formulas
App.Formulas:
    UserInfo = LookUp(Employees, Email = User().Email);
    IsManager = UserInfo.Role = "Manager";
    DefaultScreen = If(IsManager, ManagerDashboard, EmployeeHome);

// Use in StartScreen
App.StartScreen: DefaultScreen
```

### Testing StartScreen

In Power Apps Studio:
1. Right-click **App** object in Tree view
2. Select **Navigate to StartScreen**
3. Tests as if app just loaded

### Important Considerations

#### Race Conditions with OnStart

Variables set in `OnStart` are NOT available in `StartScreen`:

```powerfx
// ❌ WRONG - varUserRole not available yet
App.OnStart: Set(varUserRole, LookUp(Users, Email = User().Email).Role)
App.StartScreen: If(varUserRole = "Admin", AdminScreen, HomeScreen)

// ✅ CORRECT - Use named formula
App.Formulas: UserRole = LookUp(Users, Email = User().Email).Role
App.StartScreen: If(UserRole = "Admin", AdminScreen, HomeScreen)
```

#### Performance Considerations

- API calls must return quickly (avoid slow connectors)
- Complex lookups may delay app start
- Consider caching in named formulas
- Use `IfError()` to handle timeouts

### Benefits Over OnStart Navigation

| App.StartScreen | Navigate in OnStart (Deprecated) |
|----------------|----------------------------------|
| Non-blocking | Blocks app load |
| Declarative | Imperative |
| No timing issues | Race conditions possible |
| Better performance | Slower startup |
| Recommended | Retired |

### Best Practices

- **Use Named Formulas** for complex logic
- **Add error handling** with `IfError()`
- **Keep logic simple** to avoid delays
- **Test deep linking** scenarios
- **Avoid slow API calls**
- **Document routing logic** for maintainability
- **Never reference OnStart variables** - use named formulas

### Common Patterns

#### Admin Mode Toggle

```powerfx
App.StartScreen: If(Param("debug") = "true", DebugScreen, HomeScreen)
```

#### Maintenance Mode

```powerfx
App.Formulas:
    MaintenanceMode = LookUp(AppSettings, Setting = "Maintenance").Enabled;

App.StartScreen: If(MaintenanceMode, MaintenanceScreen, HomeScreen)
```

#### First-Time User Experience

```powerfx
App.Formulas:
    IsFirstTimeUser = IsBlank(LookUp(UserProfiles, Email = User().Email));

App.StartScreen: If(IsFirstTimeUser, OnboardingScreen, HomeScreen)
```

---

## App.Formulas

The `App.Formulas` property defines named formulas and user-defined functions. See dedicated documentation:

- [Named Formulas](named-formulas.md) - Immutable app-level expressions
- [User-Defined Functions](user-defined-functions.md) - Reusable parameterized functions

### Quick Example

```powerfx
App.Formulas:
    // Named Formulas
    ThemeColor = RGBA(0, 120, 212, 1);
    CurrentUser = User();
    ActiveProducts = Filter(Products, Active);

    // User-Defined Function
    CalculateTax(Amount: Number): Number = Amount * 0.08;
```

---

## Additional App Properties

### App.StudioVersion

**Type:** Text (read-only)

**Description:** Version of Power Apps Studio used to publish the app.

```powerfx
Label1.Text: App.StudioVersion
```

**Note:** Format may change over time. Treat as opaque whole value.

### Connection String (Application Insights)

**Purpose:** Export system-generated app logs to Azure Application Insights.

**Setup:**
1. Open app in Power Apps Studio
2. Select **App** object in Tree view
3. Enter **Connection string** in properties pane

**Troubleshooting:**
- Contact Power Platform admin if data not sent
- Check if App Insights disabled at tenant level

---

## Best Practices Summary

### Do's

✅ **Use `StartScreen`** instead of `Navigate()` in `OnStart`
✅ **Prefer Named Formulas** over global variables
✅ **Use `IfError()`** in `StartScreen` for error handling
✅ **Keep `ConfirmExitMessage`** concise (2-3 lines max)
✅ **Log errors** in `App.OnError` for debugging
✅ **Test on mobile** when using `BackEnabled` or `ConfirmExit`
✅ **Migrate from OnStart** to Named Formulas when possible

### Don'ts

❌ **Don't use `Navigate()`** in `OnStart` (retired)
❌ **Don't create circular references** in named formulas
❌ **Don't reference OnStart variables** in `StartScreen`
❌ **Don't suppress errors silently** without logging
❌ **Don't load heavy data** in `OnStart` - use lazy loading
❌ **Don't use `BackEnabled`** in production (experimental)

---

## Migration Guide: OnStart to Modern Patterns

### Old Pattern (OnStart-Heavy)

```powerfx
App.OnStart:
    // Theme
    Set(varPrimaryColor, RGBA(0, 120, 212, 1));
    Set(varSecondaryColor, RGBA(0, 90, 158, 1));

    // User
    Set(varCurrentUser, User());
    Set(varUserEmail, User().Email);
    Set(varUserRole, LookUp(Employees, Email = User().Email).Role);

    // Data
    ClearCollect(colProducts, Products);
    ClearCollect(colCategories, Categories);

    // Navigation
    If(
        varUserRole = "Admin",
        Navigate(AdminScreen, None),
        Navigate(HomeScreen, None)
    )
```

### Modern Pattern (Recommended)

```powerfx
// Named Formulas for immutable values
App.Formulas:
    PrimaryColor = RGBA(0, 120, 212, 1);
    SecondaryColor = RGBA(0, 90, 158, 1);

    CurrentUser = User();
    UserEmail = User().Email;
    UserInfo = LookUp(Employees, Email = UserEmail);
    UserRole = UserInfo.Role;

    ActiveProducts = Filter(Products, Status = "Active");
    CategoryList = Categories;

// StartScreen for navigation
App.StartScreen: If(UserRole = "Admin", AdminScreen, HomeScreen)

// OnStart only for mutable state (if needed)
App.OnStart:
    // Only if collections need to be modified later
    ClearCollect(colCart, Blank())
```

---

## Performance Optimization

### App Load Performance

| Approach | Load Time Impact |
|----------|------------------|
| Heavy `OnStart` | Blocks app load (slow) |
| Named Formulas | Lazy evaluation (fast) |
| `StartScreen` | Non-blocking (fast) |
| Screen `OnVisible` | Deferred loading (fast) |

### Recommendations

1. **Move constants to Named Formulas** (evaluated on-demand)
2. **Use `StartScreen` for navigation** (non-blocking)
3. **Defer data loading to screens** (only load what's needed)
4. **Use `Concurrent()`** if `OnStart` necessary (parallel loading)

---

## Error Handling Comparison

| Feature | App.OnError | IfError |
|---------|-------------|---------|
| **Scope** | Global (app-wide) | Local (formula-level) |
| **Can replace errors** | No | Yes |
| **Use case** | Logging, reporting | Error recovery |
| **Available variables** | `FirstError`, `AllErrors` | `FirstError`, `AllErrors` |

### Example: Combined Error Handling

```powerfx
// Global error logging
App.OnError:
    Trace($"Error: {FirstError.Message} from {FirstError.Source}", TraceSeverity.Error);
    Error(FirstError)

// Local error recovery
Button1.OnSelect:
    IfError(
        Patch(Orders, Defaults(Orders), {Amount: Value(TextInput1.Text)}),
        Notify("Invalid amount entered", NotificationType.Error);
        false // Return false on error
    )
```

---

## Testing Checklist

When implementing App object properties, test:

- [ ] `ActiveScreen` reflects current screen correctly
- [ ] `BackEnabled` works on Android and iOS devices
- [ ] `ConfirmExit` shows dialog before exit (browser and mobile)
- [ ] `ConfirmExitMessage` displays custom text
- [ ] `OnError` logs errors to monitoring system
- [ ] `OnStart` completes without blocking too long
- [ ] `StartScreen` navigates correctly based on parameters
- [ ] Named Formulas available immediately on app start
- [ ] Deep linking parameters work in `StartScreen`
- [ ] Error handling covers expected failure scenarios

---

## Related Documentation

- [Named Formulas](named-formulas.md)
- [User-Defined Functions](user-defined-functions.md)
- [Navigate and Back Functions](../navigation/navigate-back.md)
- [Error Handling](../logical/error-handling.md)
- [Set and UpdateContext](../variables/set-updatecontext.md)
- [User and Param Functions](../device/user-param.md)

## Sources

Official Microsoft Learn Documentation:

- [App object in Power Apps](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/object-app)
- [Handling errors in Power Apps](https://learn.microsoft.com/en-us/power-apps/guidance/coding-guidelines/error-handling)
- [Error, IfError, IsError, and IsBlankOrError functions](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-iferror)
- [Understand errors in Power Fx](https://learn.microsoft.com/en-us/power-platform/power-fx/error-handling)
- [Power Apps code optimization](https://learn.microsoft.com/en-us/power-apps/guidance/coding-guidelines/code-optimization)
- [Back and Navigate functions](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-navigate)
- [Screen control in Power Apps](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/controls/control-screen)

---
