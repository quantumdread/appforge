# Gallery Control Reference - Comprehensive Guide

## Overview
A **Gallery** control displays multiple records from a data source. Each record can contain multiple data types, with each field appearing in a separate control within the gallery template. The template (first item) defines how all items render.

---

## Gallery Variants

| Variant | Description | Use Case |
|---------|-------------|----------|
| **Vertical** | Fixed-height items, vertical scroll | Most common; predictable performance |
| **Horizontal** | Fixed-width items, horizontal scroll | Image carousels, horizontal lists |
| **Flexible Height** | Variable-height items based on content | Dynamic content (has limitations) |

---

## Core Properties

| Property | Type | Description |
|----------|------|-------------|
| **Items** | Table | Data source for gallery |
| **Default** | Record | Item selected when app starts |
| **Selected** | Record | Currently selected item (read-only) |
| **AllItems** | Table | All items currently loaded |
| **AllItemsCount** | Number | Count of loaded items |
| **TemplateSize** | Number | Height (vertical) or width (horizontal) |
| **TemplateFill** | Color | Background color of items |
| **TemplatePadding** | Number | Spacing between items |
| **WrapCount** | Number | Items per row/column |
| **Selectable** | Boolean | Whether items can be selected |
| **ShowNavigation** | Boolean | Display navigation arrows |
| **ShowScrollbar** | Boolean | Display scrollbar on hover |
| **DelayItemLoading** | Boolean | Delay loading until screen loads |
| **LoadingSpinner** | Enum | None, Controls, or Data |

---

## Items Property Patterns

### Basic Data Binding
```yaml
Items: =Accounts
```

### Filtering
```yaml
Items: =Filter(Accounts, Status = "Active")
```

### Searching
```yaml
Items: |-
  =Filter(
      Accounts,
      IsBlank(txtSearch.Text) || txtSearch.Text in Text(Name)
  )
```

### Sorting
```yaml
Items: =Sort(Accounts, Name, SortOrder.Ascending)
```

### Combined Filter + Sort + Search
```yaml
Items: |-
  =Sort(
      Filter(
          Products,
          IsBlank(txtSearch.Text) || txtSearch.Text in Text(Name)
      ),
      Name,
      If(varSortDesc, SortOrder.Descending, SortOrder.Ascending)
  )
```

---

## Selection Handling

### Highlight Selected Item
```yaml
TemplateFill: =If(ThisItem.IsSelected, RGBA(230,243,255,1), RGBA(255,255,255,1))
```

### Set Default Selection
```yaml
Default: =LookUp(Accounts, Category = "Primary")
```

### Access Selected Item
```yaml
# In control outside gallery
Text: =Gallery1.Selected.Name
```

---

## Common Template Formulas

### Conditional Formatting
```yaml
Color: =If(ThisItem.Status = "Urgent", RGBA(255,0,0,1), RGBA(0,0,0,1))
```

### Button Inside Gallery
```yaml
OnSelect: =Select(Parent)
```

### Alternating Row Colors
```yaml
Fill: =If(Mod(Value(ThisItem.ID), 2) = 0, RGBA(0,0,0,0.05), RGBA(255,255,255,1))
```

---

## Performance Best Practices

1. **Set DelayItemLoading = true** - Improves initial screen load
2. **Use LoadingSpinner** - Better UX during data load
3. **Avoid Flexible Height for large datasets**
4. **Limit Items with FirstN()** - `Items: =FirstN(Accounts, 100)`
5. **Use ShowColumns()** - Reduce columns retrieved

### Critical Warning
**NEVER use OnChange with ComboBox/DatePicker/Slider/Toggle inside galleries when they patch the gallery's data source.** Creates infinite loops.

---

## Limitations

- **Unsupported controls inside Gallery:** Forms, PDF viewer, Power BI, Rich text editor
- **Maximum 2 levels** of gallery nesting
- **Flexible Height:** Items may shift when loading completes
- **TemplateSize minimum:** 1
- **ThisItem is NOT available in TemplateSize.** `TemplateSize` is a gallery-level property, not a template-level property, so `ThisItem` cannot be referenced. Use a fixed numeric value. If you need variable-height rows (e.g. category headers interleaved with data rows), insert header records into the data source with a distinguishing column (e.g. `Role: "CategoryHeader"`) and use a fixed `TemplateSize`. Then use `ThisItem.Role` inside template child controls to show/hide header vs data content.

---

## YAML Generation Rules

1. Always specify Items property
2. Use `ThisItem.FieldName` for template controls
3. Set TemplateFill for selection highlighting
4. Include AccessibleLabel for accessibility
5. Set ShowScrollbar = true for keyboard users
6. Use block scalar `|-` for complex Items formulas
