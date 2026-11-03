# Power Apps App Object Reference

## App Properties

### ActiveScreen
```yaml
# Returns currently displayed screen
Text: =App.ActiveScreen.Name
Visible: =App.ActiveScreen = DetailScreen
```

### BackEnabled
Controls device back button behavior (Android hardware, iOS swipe):
```yaml
App.BackEnabled: =true   # Goes to previous screen (like Back())
App.BackEnabled: =false  # Returns to app list
```

### ConfirmExit & ConfirmExitMessage
Show confirmation before app closes:
```yaml
App.ConfirmExit: =EditForm1.Unsaved
App.ConfirmExitMessage: ="You have unsaved changes. Discard?"
```

**Triggers:** Exit(), browser close, Launch(Self), app switching

**Limitations:** Not supported in embedded apps (Power BI, SharePoint) or custom pages.

### StudioVersion
```yaml
# Version of Power Apps Studio used to publish
Text: =App.StudioVersion
```

---

## App.OnStart

Runs when user starts the app. Use for initial data loading.

```yaml
App.OnStart: |-
  =Set(varUserEmail, User().Email);
  ClearCollect(colSettings, Settings)
```

**Limitations:**
- Cannot use `UpdateContext()` (no screen loaded yet)
- `Navigate()` in OnStart is **retired** - use `StartScreen` instead

**Testing:** Tree view > App > ... > "Run OnStart"

---

## App.StartScreen

Declaratively sets which screen displays first. **Better than Navigate() in OnStart.**

```yaml
# Simple
App.StartScreen: =HomeScreen

# Conditional
App.StartScreen: =If(Param("admin") = "1", AdminScreen, HomeScreen)

# With LookUp
App.StartScreen: |-
  =If(
      LookUp(Users, Email = User().Email).IsAdmin,
      AdminScreen,
      HomeScreen
  )

# With error handling
App.StartScreen: |-
  =IfError(
      If(CustomConnector.CheckRole() = "Admin", AdminScreen, UserScreen),
      ErrorScreen
  )
```

**Allowed functions:** Param(), User(), LookUp(), Filter(), CountRows(), Max(), Connection, Compass, App signals

**Not available:** Global variables, collections from OnStart, named formulas

---

## App.Formulas (Named Formulas)

See `named-formulas.md` for full reference.

```yaml
App.Formulas: |-
  =UserEmail = User().Email;
  UserInfo = LookUp(Users, 'Primary Email' = UserEmail);
  IsAdmin = UserInfo.Role = "Administrator";
  ActiveProjects = Filter(Projects, Status.Value = "Active");
```

---

## App.OnError

Custom error handling. Receives `FirstError` and `AllErrors` scope variables.

```yaml
# Log and rethrow (shows default banner)
App.OnError: |-
  =Trace($"Error {FirstError.Message} in {FirstError.Source}");
  Error(FirstError)

# Custom handling (suppresses default banner)
App.OnError: |-
  =Notify(
      "An error occurred: " & FirstError.Message,
      NotificationType.Error
  )

# Selective handling
App.OnError: |-
  =If(
      FirstError.Kind = ErrorKind.Network,
      Notify("Network error - check connection"),
      Error(FirstError)
  )
```

**Notes:**
- Default (empty): Shows error banner with FirstError.Message
- Custom handler overrides default behavior
- Use `With()` for local values (concurrent evaluation)
- Rethrow with `Error(FirstError)` to show default banner

---

## App Dimensions

```yaml
# Design dimensions (set in app settings)
Width: =App.DesignWidth    # e.g., 1366
Height: =App.DesignHeight  # e.g., 768

# Actual runtime dimensions
Width: =App.Width
Height: =App.Height

# Responsive patterns
Width: =Max(App.Width, App.DesignWidth)
Height: =Max(App.Height, App.DesignHeight) - 66
```

---

## User-Defined Types (Experimental)

Requires: Settings > Upcoming features > Experimental > "User-defined types"

```yaml
App.Formulas: |-
  =// Define types with :=
  BookType := Type({Title: Text, Author: Text, Year: Number});
  LibraryType := Type([BookType]);

  // Use in functions
  FilterByAuthor(books: LibraryType, author: Text): LibraryType =
      Filter(books, Author = author);

  // Extract record type
  SingleBook := Type(RecordOf(LibraryType));
```

---

## Application Insights Integration

Export system-generated logs:
1. Open app in Power Apps Studio
2. Select App object
3. Enter Connection string in properties pane

---

## YAML Template

```yaml
App As App:
  BackEnabled: =true
  ConfirmExit: =EditForm1.Unsaved
  ConfirmExitMessage: ="Discard unsaved changes?"
  StartScreen: =If(Param("admin") = "1", AdminScreen, HomeScreen)

  Formulas: |-
    =// Constants
    AppTitle = "My Application";

    // User context
    CurrentUserEmail = User().Email;
    CurrentUser = LookUp(Users, Email = CurrentUserEmail);
    IsAdmin = CurrentUser.Role = "Admin";

    // Data
    ActiveItems = Filter(Items, Status = "Active");

  OnStart: |-
    =// Only mutable state
    Set(varFormMode, FormMode.New);
    Set(varShowPanel, false)

  OnError: |-
    =Trace($"Error: {FirstError.Message}");
    Error(FirstError)
```

---

## Best Practices

1. **Use StartScreen** instead of Navigate() in OnStart
2. **Use App.Formulas** instead of Set() in OnStart for constants
3. **Keep OnStart minimal** - only mutable state initialization
4. **Use OnError** for centralized error logging
5. **Set ConfirmExit** when forms have unsaved data
6. **Test OnStart** via Tree view menu to start with empty collections
