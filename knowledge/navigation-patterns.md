# Power Apps Navigation Reference

## Navigate Function

### Syntax
```yaml
Navigate(Screen, Transition, {ContextVariables})
```

### Parameters
| Parameter | Required | Description |
|-----------|----------|-------------|
| Screen | Yes | Target screen |
| Transition | No | Animation (default: None) |
| UpdateContextRecord | No | Context variables to pass |

---

## ScreenTransition Values

| Transition | Direction | Inverse |
|------------|-----------|---------|
| **None** | Instant | None |
| **Cover** | Right to left | UnCoverRight |
| **CoverRight** | Left to right | UnCover |
| **UnCover** | Right to left | CoverRight |
| **UnCoverRight** | Left to right | Cover |
| **Fade** | Crossfade | Fade |

---

## Back Function

```yaml
Back()                           # Auto inverse transition
Back(ScreenTransition.Fade)      # Explicit transition
```

---

## Navigation Patterns

### Basic Navigation
```yaml
OnSelect: =Navigate(DetailScreen, ScreenTransition.Cover)
```

### With Context Variables
```yaml
OnSelect: |-
  =Navigate(
      DetailScreen,
      ScreenTransition.Cover,
      {
          RecordID: Gallery1.Selected.ID,
          EditMode: false
      }
  )
```

### Conditional Navigation
```yaml
OnSelect: |-
  =If(
      User().Email = "admin@contoso.com",
      Navigate(AdminScreen, ScreenTransition.Fade),
      Navigate(UserScreen, ScreenTransition.Fade)
  )
```

### After Form Submission
```yaml
OnSelect: |-
  =If(
      Form1.Valid,
      SubmitForm(Form1); Navigate(ConfirmScreen, ScreenTransition.Fade),
      Notify("Please fix errors")
  )
```

### Tab Navigation
```yaml
# Tab buttons
Tab1.OnSelect: =Navigate(HomeScreen, ScreenTransition.Fade)
Tab2.OnSelect: =Navigate(SettingsScreen, ScreenTransition.Fade)
Tab3.OnSelect: =Navigate(ProfileScreen, ScreenTransition.Fade)
```

---

## Screen Lifecycle Events

### OnVisible
```yaml
# Initialize data when screen appears
OnVisible: |-
  =UpdateContext({CurrentDate: Today()});
  Refresh(DataSource)
```

### OnHidden
```yaml
# Cleanup when leaving screen
OnHidden: =Set(LastVisitedScreen, Self.Name)
```

---

## Context Variables

### Scope
- Context variables are **screen-scoped**
- Use Navigate's UpdateContextRecord to pass between screens
- Variables persist when returning to screen

### Access Pattern
```yaml
# Screen1: Pass data
Navigate(Screen2, None, {SelectedItem: Gallery1.Selected})

# Screen2: Use data
Label.Text: =SelectedItem.Name
```

---

## App.StartScreen

### Use Instead of Navigate in OnStart
```yaml
# BAD - Blocks screen display
App.OnStart: =Navigate(HomeScreen)

# GOOD - Declarative, non-blocking
App.StartScreen: =If(Param("Admin") = "1", AdminScreen, HomeScreen)
```

---

## Best Practices

1. Use `Fade` for smooth, non-directional transitions
2. Use `Cover` for forward navigation (drill-down)
3. Let `Back()` use automatic inverse transitions
4. Pass only necessary data via context
5. Use `App.StartScreen` instead of Navigate in OnStart
6. Keep navigation logic simple and predictable
