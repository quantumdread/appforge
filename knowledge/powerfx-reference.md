# Power Fx Formula Reference

## Data Filtering & Lookup

### Filter
```yaml
# Basic filter
Items: =Filter(Products, Status = "Active")

# Multiple conditions
Items: =Filter(Products, Status = "Active" && Quantity > 0)

# Text search
Items: =Filter(Products, "chocolate" in Lower(Name))
```

### LookUp
```yaml
# Get single record
Default: =LookUp(Products, ID = 123)

# Get specific field
Text: =LookUp(Products, ID = 123, ProductName)

# With condition
Value: =LookUp(Users, Email = User().Email, Department)
```

Dataverse choice literals can resolve in assignment but fail in `Filter`/`LookUp` comparisons for some global option sets. Use a data-derived `OptionSetValue` or the verified positional `Choices(...)` pattern; see [A Dataverse choice works in `Patch` but fails in `Filter` or `LookUp`](troubleshooting.md#a-dataverse-choice-works-in-patch-but-fails-in-filter-or-lookup).
<!-- verified: true, verified_at: 2026-07-19, verified_by: compile_canvas -->

### Search
```yaml
# Search across columns (case-insensitive)
Items: =Search(Customers, txtSearch.Text, "Name", "Company", "Email")
```

---

## Data Modification

### Patch - Update Record
```yaml
OnSelect: |-
  =Patch(
      Customers,
      LookUp(Customers, ID = Gallery1.Selected.ID),
      {Name: txtName.Text, Email: txtEmail.Text}
  )
```

### Patch - Create Record
```yaml
OnSelect: |-
  =Patch(
      Customers,
      Defaults(Customers),
      {Name: txtName.Text, Email: txtEmail.Text}
  )
```

The record returned by `Patch()` does not lazy-load related columns. After storing the result, re-hydrate it with `LookUp`; see [Related lookup fields are blank after `Set(varRecord, Patch(...))`](troubleshooting.md#related-lookup-fields-are-blank-after-setvarrecord-patch).
<!-- verified: true, verified_at: 2026-07-19, verified_by: compile_canvas -->

### Collect
```yaml
# Add to collection
OnSelect: =Collect(colCart, {Product: "Widget", Qty: 2})
```

### ClearCollect
```yaml
# Replace collection contents
OnStart: =ClearCollect(colProducts, Filter(Products, Active = true))
```

---

## Variables

### Set (Global)
```yaml
# Available across all screens
OnSelect: =Set(varCurrentUser, User().Email)
OnSelect: =Set(varCounter, varCounter + 1)
```

### UpdateContext (Screen-local)
```yaml
# Available only on current screen
OnSelect: =UpdateContext({ShowDialog: true, SelectedTab: "Home"})
```

---

## Conditional Logic

### If
```yaml
# Simple
Color: =If(Status = "Active", Green, Red)

# Multiple conditions
Text: =If(Score > 90, "A", Score > 80, "B", Score > 70, "C", "F")
```

### Switch
```yaml
# Multiple exact matches
Fill: |-
  =Switch(
      Status,
      "New", Blue,
      "In Progress", Yellow,
      "Complete", Green,
      Gray
  )
```

### Coalesce
```yaml
# First non-blank value
Text: =Coalesce(txtInput.Text, "Default Value")
```

For reusable formatting, status/badge triplets, and fallback wrappers—including formulas used inside gallery templates—see [Centralize with named formulas & UDFs](named-formulas.md#centralize-with-named-formulas--udfs).
<!-- verified: true, verified_at: 2026-07-19, verified_by: compile_canvas -->

---

## Text & Formatting

### Text (Date formatting)
```yaml
Text: =Text(Now(), "dddd, mmmm dd, yyyy")
Text: =Text(Today(), "mm/dd/yyyy")
```

### Text (Number formatting)
```yaml
Text: =Text(1234.59, "$ #,###.00")
Text: =Text(0.15, "0%")
```

### Value
```yaml
# Convert text to number
Value: =Value(txtQuantity.Text)
```

---

## Table Operations

### First / Last
```yaml
Default: =First(Products)
Recent: =Last(Sort(Orders, OrderDate, Ascending))
```

### CountRows
```yaml
Text: ="Total: " & CountRows(Gallery1.AllItems)
```

### CountIf
```yaml
Text: =CountIf(Tasks, Status = "Complete")
```

### Sort
```yaml
Items: =Sort(Products, Name, SortOrder.Ascending)
Items: =Sort(Products, Price, SortOrder.Descending)
```

### SortByColumns
```yaml
Items: |-
  =SortByColumns(
      Products,
      "Category", SortOrder.Ascending,
      "Price", SortOrder.Descending
  )
```

---

## Validation

### IsBlank
```yaml
Valid: =!IsBlank(txtName.Text)
DisplayMode: =If(IsBlank(txtEmail.Text), DisplayMode.Disabled, DisplayMode.Edit)
```

### IsEmpty
```yaml
Visible: =!IsEmpty(Filter(Products, Category = "Test"))
```

---

## User Information

### User()
```yaml
Text: =User().Email
Text: =User().FullName
Filter: =Filter(Tasks, AssignedTo = User().Email)
```

---

## Navigation

### Navigate
```yaml
OnSelect: =Navigate(DetailScreen, ScreenTransition.Fade)
OnSelect: =Navigate(EditScreen, None, {RecordID: Gallery1.Selected.ID})
```

### Back
```yaml
OnSelect: =Back()
```

---

## Common Patterns

### Form Validation
```yaml
DisplayMode: |-
  =If(
      !IsBlank(txtName.Text) && !IsBlank(txtEmail.Text),
      DisplayMode.Edit,
      DisplayMode.Disabled
  )
```

### Search + Filter + Sort
```yaml
Items: |-
  =Sort(
      Filter(
          Search(Products, txtSearch.Text, "Name"),
          Category = ddCategory.Selected.Value
      ),
      Name,
      SortOrder.Ascending
  )
```

### Save New Record
```yaml
OnSelect: |-
  =Patch(
      Customers,
      Defaults(Customers),
      {
          Name: txtName.Text,
          Email: txtEmail.Text,
          CreatedBy: User().Email,
          CreatedDate: Now()
      }
  )
```

### Conditional Visibility
```yaml
Visible: =CountRows(Filter(Products, Category = ddCategory.Selected.Value)) > 0
```

---

## Best Practices

1. Always start formulas with `=`
2. Use `|-` block scalar for multi-line formulas
3. Prefer delegation-friendly functions (Filter, Sort)
4. Use `LookUp` for single records, `Filter` for multiple
5. Use `Coalesce` instead of nested `If(IsBlank())`
6. Use `UpdateContext` for screen state, `Set` for global

### Index and hidden controls

Hidden controls still evaluate formulas. A literal `Index(t, 2)` or higher can therefore fail on a short table even when `Visible` is false ([runtime errata A2, 2026-10-06](../docs/delivery-errata/2026-10-06-canvas-coauthoring-errata.md)). Use `First(t)` or `Last(FirstN(t, n))` for a safe short-table fallback. The WARN `index-literal-position` excludes literal tables with enough rows and dynamic positions such as `Value` from `Sequence(CountRows(t))`.
