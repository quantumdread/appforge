# Power Apps Performance Optimization Rules

> **Machine-checked (v2.3–v2.4, updated 2026-08-10):** the AppForge MCP `validate_yaml` flags heavy `App.OnStart` blocks (`heavy-onstart`, ≥5 statements, rule family: centralization), per-row gallery queries (`perf-lookup-in-gallery-template`), heavy `OnStart` without `Concurrent()` (`perf-onstart-no-concurrent`), cross-screen control references, and per-screen control budgets — all as advisory WARNs. Supply the optional `datasources` map (`{name: dataverse|sharepoint|sql|excel|collection|other}`) to unlock the source-specific checks; without it only the source-agnostic core fires. Never REFUSEs. See CHANGELOG.

## Core Principles

1. **Optimize Page Loads** - Minimize/delay actions that prevent fast load
2. **Small Data Payloads** - Keep bulk-retrieved data small
3. **Optimize Query Patterns** - Do mashups on server, not in app
4. **Fast Calculations** - Work with Power Fx, not against it

---

## Delegation

### What is Delegation?
When Power Fx queries translate to server-side queries. Only matching rows returned.

### Limits
- **Default:** 500 records
- **Maximum:** 10,000 records (Settings > General > Data row limit; older guidance cites 2,000)
- **Testing:** Set to 1 during development to catch issues

### Delegable Functions
```yaml
Delegable:
  - Filter()
  - Search()
  - LookUp()
  - Sort() (single column)
  - StartsWith()
  - EndsWith()
  - IsBlank()
  - =, <>, >, <, >=, <=
  - &&, ||, !
  - Sum(), Average(), Min(), Max(), CountRows()

NOT Delegable:
  - First(), Last(), FirstN(), LastN()
  - If(), Switch()
  - Text(), Value(), Lower(), Upper()
  - Len(), Left(), Mid(), Right()
  - Concat(), Concatenate()
```

### Warning Signs
- Yellow triangle next to control
- Blue wavy underline in formula

---

## Data Loading

### Avoid ClearCollect for Large Data
```yaml
# BAD - Blocks UI, loads all data
OnStart: =ClearCollect(colAllCustomers, Customers)

# GOOD - Direct access
Items: =Customers
```

### Use Explicit Column Selection
```yaml
# Reduce columns retrieved
ClearCollect: |-
  =ClearCollect(
      colAccounts,
      ShowColumns(
          Filter(Accounts, Status = "Active"),
          "name", "email", "phone"
      )
  )
```

### Use Concurrent for Parallel Loading
```yaml
# SEQUENTIAL (slow)
OnStart: |-
  =ClearCollect(col1, Source1);
  ClearCollect(col2, Source2);
  ClearCollect(col3, Source3)

# CONCURRENT (fast)
OnStart: |-
  =Concurrent(
      ClearCollect(col1, Source1),
      ClearCollect(col2, Source2),
      ClearCollect(col3, Source3)
  )
```

---

## OnStart Optimization

### Use App.StartScreen
```yaml
# BAD - Blocks screen display
App.OnStart: =Navigate(HomeScreen)

# GOOD - Declarative, non-blocking
App.StartScreen: =If(Param("Admin") = "1", AdminScreen, HomeScreen)
```

### Use App.Formulas
```yaml
# Move constants and lookups out of OnStart
App.Formulas: |-
  =UserEmail = User().Email;
  UserInfo = LookUp(Users, Email = User().Email);
  ThemeColor = RGBA(0, 120, 212, 1)
```

---

## Gallery Performance

### Enable Delayed Loading
```yaml
DelayItemLoading: =true
LoadingSpinner: =LoadingSpinner.Controls
```

### Limit Data
```yaml
Items: =FirstN(Sort(Orders, OrderDate, Descending), 100)
```

### Critical: Avoid OnChange Patch Loops
```yaml
# BAD - Creates infinite loop
ComboBox.OnChange: =Patch(Gallery1.Items, ThisItem, {Status: ComboBox.Selected})

# GOOD - Use button
Button.OnSelect: =Patch(DataSource, Gallery1.Selected, {Status: ComboBox.Selected})
```

---

## Control Optimization

### Minimize Control Count
- **Threshold:** 500+ controls causes degradation
- Replace multiple buttons with gallery
- Remove unused controls
- Use components for reuse

### DelayOutput for TextInput
```yaml
# Wait for user to finish typing
DelayOutput: =true
```

### Low-Dependency Start Screen
- First screen: Welcome/logo only
- No galleries or data references
- Allows deferred calculations

---

## Collections Best Practices

### When to Use
- Small datasets (<500 records)
- Frequent calculations on same data
- Shopping cart / temporary state
- Offline scenarios

### When to Avoid
- Large datasets
- Read-only data (access directly)
- Data that needs to stay current

### Optimize Size
```yaml
# Reduce columns AND rows
ClearCollect: |-
  =ClearCollect(
      colOrders,
      ShowColumns(
          Filter(Orders, Status = "Active"),
          "ID", "Name", "Total"
      )
  )
```

---

## Formula Optimization

### Use With() for Multiple Lookups
```yaml
# BAD - Multiple API calls
Text: |-
  =LookUp(Users, ID = 1, FirstName) & " " &
   LookUp(Users, ID = 1, LastName)

# GOOD - Single lookup
Text: |-
  =With(
      {user: LookUp(Users, ID = 1)},
      user.FirstName & " " & user.LastName
  )
```

### Use Coalesce
```yaml
# BAD
=If(IsBlank(value1), If(IsBlank(value2), "default", value2), value1)

# GOOD
=Coalesce(value1, value2, "default")
```

---

## Data Source Tips

### Dataverse (Fastest)
- Direct connection, no API Management overhead
- Access related tables: `ThisItem.Account.'Account Name'`

### SharePoint
- Limit lookup columns (Person, Group)
- Avoid picture columns
- Use ShowColumns() to limit fields
- Create indexed columns for filtering

### SQL Server
- Monitor CPU at ~75% threshold
- Create indexes on filtered columns
- Use views for complex queries

---

## Performance Checklist

```yaml
App Initialization:
  - [ ] Use App.Formulas for constants
  - [ ] Use App.StartScreen instead of Navigate
  - [ ] Use Concurrent() for parallel loading
  - [ ] Keep OnStart minimal

Data Loading:
  - [ ] Use delegation whenever possible
  - [ ] Use ShowColumns() to limit columns
  - [ ] Use Filter() at source to limit rows
  - [ ] Limit connections to 30 or fewer

Galleries:
  - [ ] DelayItemLoading = true
  - [ ] LoadingSpinner enabled
  - [ ] Avoid nested galleries (max 2)
  - [ ] No OnChange patches to same data source

Screens:
  - [ ] Control count < 500
  - [ ] Minimal cross-screen references
  - [ ] Low-dependency first screen
  - [ ] DelayOutput = true for search inputs
```

---

## Performance Targets

| Metric | Target |
|--------|--------|
| App load time | < 3 seconds |
| Screen transition | < 1 second |
| Gallery rendering | < 2 seconds |
| Formula execution | < 500ms |
