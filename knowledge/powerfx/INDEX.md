# PowerFx Formula Rules Index

This index provides quick access to all PowerFx formula documentation in this library.

---

## App-Level Formulas

| File | Description |
|------|-------------|
| [app-object.md](app-formulas/app-object.md) | App object properties (ActiveScreen, OnStart, StartScreen, etc.) |
| [named-formulas.md](app-formulas/named-formulas.md) | Named formulas in App.Formulas property |
| [user-defined-functions.md](app-formulas/user-defined-functions.md) | User Defined Functions (UDFs) |

---

## Operators

| File | Description |
|------|-------------|
| [operators.md](operators/operators.md) | Complete operator reference: arithmetic (+, -, *, /, ^, %), comparison (=, <>, <, >, <=, >=), logical (&&, \|\|, !), string (&), membership (in, exactin), property access (.), disambiguation (@), structural (; , .) |

---

## Logical & Control Flow

| File | Description |
|------|-------------|
| [if-switch.md](logical/if-switch.md) | If and Switch conditional functions |
| [boolean-operators.md](logical/boolean-operators.md) | And, Or, Not, IsNumeric functions |
| [blank-empty-coalesce.md](logical/blank-empty-coalesce.md) | Blank, IsBlank, IsEmpty, Coalesce functions |
| [error-handling.md](logical/error-handling.md) | Error, IfError, IsError, IsBlankOrError functions |

---

## Table & Data Operations

| File | Description |
|------|-------------|
| [filter-lookup-search.md](tables/filter-lookup-search.md) | Filter, LookUp, Search functions |
| [patch.md](tables/patch.md) | Patch function for creating/modifying records |
| [collections.md](tables/collections.md) | Collect, Clear, ClearCollect functions |

---

## Text Functions

| File | Description |
|------|-------------|
| [string-functions.md](text/string-functions.md) | Len, Left, Right, Mid, Trim, etc. |
| [concatenate.md](text/concatenate.md) | Concatenate and Concat functions |
| [text-formatting.md](text/text-formatting.md) | Text function for formatting |

---

## Date & Time Functions

| File | Description |
|------|-------------|
| [date-functions.md](datetime/date-functions.md) | Now, Today, DateAdd, DateDiff, etc. |

---

## Device & Sensor Functions

| File | Description |
|------|-------------|
| [device-signals.md](device/device-signals.md) | Acceleration, Compass, Connection, Location |

---

## Variables

| File | Description |
|------|-------------|
| [set-updatecontext.md](variables/set-updatecontext.md) | Set and UpdateContext functions |

---

## Navigation

| File | Description |
|------|-------------|
| [navigate-back.md](navigation/navigate-back.md) | Navigate and Back functions |
| [deep-linking.md](navigation/deep-linking.md) | Deep linking via Param + App.StartScreen + screen OnVisible (modern pattern, replaces Navigate-in-OnStart) |

---

## AI Builder Functions

| File | Description |
|------|-------------|
| [ai-builder-functions.md](ai/ai-builder-functions.md) | AIClassify, AIExtract, AIReply, AISentiment, AISummarize, AITranslate |

---

## UI Control Functions

| File | Description |
|------|-------------|
| [ui-functions.md](ui/ui-functions.md) | Select, SetFocus, SetProperty, Print, RequestHide |

---

## Miscellaneous Functions

| File | Description |
|------|-------------|
| [remaining-functions.md](misc/remaining-functions.md) | PDF (export to PDF), Relate/Unrelate (Dataverse relationships), Revert (refresh data), ShowHostInfo (display host info) |

---

## Quick Reference by Function

### Operators
- **& (string concatenation)** → [operators/operators.md](operators/operators.md)
- **&& (AND)** → [operators/operators.md](operators/operators.md)
- **|| (OR)** → [operators/operators.md](operators/operators.md)
- **! (NOT)** → [operators/operators.md](operators/operators.md)
- **+ (addition)** → [operators/operators.md](operators/operators.md)
- **- (subtraction)** → [operators/operators.md](operators/operators.md)
- **\* (multiplication)** → [operators/operators.md](operators/operators.md)
- **/ (division)** → [operators/operators.md](operators/operators.md)
- **^ (exponentiation)** → [operators/operators.md](operators/operators.md)
- **% (percentage)** → [operators/operators.md](operators/operators.md)
- **= (equal)** → [operators/operators.md](operators/operators.md)
- **<> (not equal)** → [operators/operators.md](operators/operators.md)
- **< (less than)** → [operators/operators.md](operators/operators.md)
- **> (greater than)** → [operators/operators.md](operators/operators.md)
- **<= (less than or equal)** → [operators/operators.md](operators/operators.md)
- **>= (greater than or equal)** → [operators/operators.md](operators/operators.md)
- **. (property access)** → [operators/operators.md](operators/operators.md)
- **@ (disambiguation)** → [operators/operators.md](operators/operators.md)
- **; (statement separator)** → [operators/operators.md](operators/operators.md)
- **in (membership)** → [operators/operators.md](operators/operators.md)
- **exactin (membership)** → [operators/operators.md](operators/operators.md)
- **As** → [operators/operators.md](operators/operators.md)

### A-C
- **Acceleration** → [device/device-signals.md](device/device-signals.md)
- **AIClassify** → [ai/ai-builder-functions.md](ai/ai-builder-functions.md)
- **AIExtract** → [ai/ai-builder-functions.md](ai/ai-builder-functions.md)
- **AIReply** → [ai/ai-builder-functions.md](ai/ai-builder-functions.md)
- **AISentiment** → [ai/ai-builder-functions.md](ai/ai-builder-functions.md)
- **AISummarize** → [ai/ai-builder-functions.md](ai/ai-builder-functions.md)
- **AITranslate** → [ai/ai-builder-functions.md](ai/ai-builder-functions.md)
- **And** → [logical/boolean-operators.md](logical/boolean-operators.md)
- **App.ActiveScreen** → [app-formulas/app-object.md](app-formulas/app-object.md)
- **App.BackEnabled** → [app-formulas/app-object.md](app-formulas/app-object.md)
- **App.ConfirmExit** → [app-formulas/app-object.md](app-formulas/app-object.md)
- **App.ConfirmExitMessage** → [app-formulas/app-object.md](app-formulas/app-object.md)
- **App.Formulas** → [app-formulas/named-formulas.md](app-formulas/named-formulas.md)
- **App.OnError** → [app-formulas/app-object.md](app-formulas/app-object.md)
- **App.OnStart** → [app-formulas/app-object.md](app-formulas/app-object.md)
- **App.StartScreen** → [app-formulas/app-object.md](app-formulas/app-object.md)
- **Back** → [navigation/navigate-back.md](navigation/navigate-back.md)
- **Blank** → [logical/blank-empty-coalesce.md](logical/blank-empty-coalesce.md)
- **Clear** → [tables/collections.md](tables/collections.md)
- **ClearCollect** → [tables/collections.md](tables/collections.md)
- **Coalesce** → [logical/blank-empty-coalesce.md](logical/blank-empty-coalesce.md)
- **Collect** → [tables/collections.md](tables/collections.md)
- **Compass** → [device/device-signals.md](device/device-signals.md)
- **Concat** → [text/concatenate.md](text/concatenate.md)
- **Concatenate** → [text/concatenate.md](text/concatenate.md)
- **Connection** → [device/device-signals.md](device/device-signals.md)

### D-F
- **Date** → [datetime/date-functions.md](datetime/date-functions.md)
- **DateAdd** → [datetime/date-functions.md](datetime/date-functions.md)
- **DateDiff** → [datetime/date-functions.md](datetime/date-functions.md)
- **DateValue** → [datetime/date-functions.md](datetime/date-functions.md)
- **Day** → [datetime/date-functions.md](datetime/date-functions.md)
- **Filter** → [tables/filter-lookup-search.md](tables/filter-lookup-search.md)
- **Find** → [text/string-functions.md](text/string-functions.md)

### G-L
- **Hour** → [datetime/date-functions.md](datetime/date-functions.md)
- **If** → [logical/if-switch.md](logical/if-switch.md)
- **IsBlank** → [logical/blank-empty-coalesce.md](logical/blank-empty-coalesce.md)
- **IsEmpty** → [logical/blank-empty-coalesce.md](logical/blank-empty-coalesce.md)
- **IsNumeric** → [logical/boolean-operators.md](logical/boolean-operators.md)
- **IsToday** → [datetime/date-functions.md](datetime/date-functions.md)
- **Left** → [text/string-functions.md](text/string-functions.md)
- **Len** → [text/string-functions.md](text/string-functions.md)
- **Location** → [device/device-signals.md](device/device-signals.md)
- **LookUp** → [tables/filter-lookup-search.md](tables/filter-lookup-search.md)
- **Lower** → [text/string-functions.md](text/string-functions.md)

### M-O
- **Mid** → [text/string-functions.md](text/string-functions.md)
- **Minute** → [datetime/date-functions.md](datetime/date-functions.md)
- **Month** → [datetime/date-functions.md](datetime/date-functions.md)
- **Named Formulas** → [app-formulas/named-formulas.md](app-formulas/named-formulas.md)
- **Navigate** → [navigation/navigate-back.md](navigation/navigate-back.md)
- **Not** → [logical/boolean-operators.md](logical/boolean-operators.md)
- **Now** → [datetime/date-functions.md](datetime/date-functions.md)
- **Or** → [logical/boolean-operators.md](logical/boolean-operators.md)

### P-S
- **Param** → [navigation/deep-linking.md](navigation/deep-linking.md)
- **Patch** → [tables/patch.md](tables/patch.md)
- **PDF** → [misc/remaining-functions.md](misc/remaining-functions.md)
- **Print** → [ui/ui-functions.md](ui/ui-functions.md)
- **Proper** → [text/string-functions.md](text/string-functions.md)
- **Relate** → [misc/remaining-functions.md](misc/remaining-functions.md)
- **Replace** → [text/string-functions.md](text/string-functions.md)
- **RequestHide** → [ui/ui-functions.md](ui/ui-functions.md)
- **Revert** → [misc/remaining-functions.md](misc/remaining-functions.md)
- **Right** → [text/string-functions.md](text/string-functions.md)
- **Search** → [tables/filter-lookup-search.md](tables/filter-lookup-search.md)
- **Second** → [datetime/date-functions.md](datetime/date-functions.md)
- **Select** → [ui/ui-functions.md](ui/ui-functions.md)
- **Set** → [variables/set-updatecontext.md](variables/set-updatecontext.md)
- **SetFocus** → [ui/ui-functions.md](ui/ui-functions.md)
- **SetProperty** → [ui/ui-functions.md](ui/ui-functions.md)
- **ShowHostInfo** → [misc/remaining-functions.md](misc/remaining-functions.md)
- **Split** → [text/string-functions.md](text/string-functions.md)
- **StartsWith** → [text/string-functions.md](text/string-functions.md)
- **Substitute** → [text/string-functions.md](text/string-functions.md)
- **Switch** → [logical/if-switch.md](logical/if-switch.md)

### T-Z
- **Text** → [text/text-formatting.md](text/text-formatting.md)
- **Time** → [datetime/date-functions.md](datetime/date-functions.md)
- **TimeValue** → [datetime/date-functions.md](datetime/date-functions.md)
- **Today** → [datetime/date-functions.md](datetime/date-functions.md)
- **Trim** → [text/string-functions.md](text/string-functions.md)
- **TrimEnds** → [text/string-functions.md](text/string-functions.md)
- **UDF** → [app-formulas/user-defined-functions.md](app-formulas/user-defined-functions.md)
- **Unrelate** → [misc/remaining-functions.md](misc/remaining-functions.md)
- **UpdateContext** → [variables/set-updatecontext.md](variables/set-updatecontext.md)
- **Upper** → [text/string-functions.md](text/string-functions.md)
- **User Defined Functions** → [app-formulas/user-defined-functions.md](app-formulas/user-defined-functions.md)
- **Weekday** → [datetime/date-functions.md](datetime/date-functions.md)
- **Year** → [datetime/date-functions.md](datetime/date-functions.md)

---

## Best Practices & Community Tips

Expert-sourced guidelines from Matthew Devaney, Shane Young, and the Power Apps community.

| File | Description |
|------|-------------|
| [udf-advanced-patterns.md](best-practices/udf-advanced-patterns.md) | Advanced UDF patterns, workarounds, and best practices |
| [named-formulas-patterns.md](best-practices/named-formulas-patterns.md) | 6+ use cases for Named Formulas with examples |
| [performance-optimization.md](best-practices/performance-optimization.md) | Performance tips: OnStart, collections, queries |
| [delegation-cheatsheet.md](best-practices/delegation-cheatsheet.md) | Complete delegation reference by data source |
| [coding-standards.md](best-practices/coding-standards.md) | Naming conventions, code organization |
| [common-pitfalls.md](best-practices/common-pitfalls.md) | 17 common mistakes and how to avoid them |
| [gallery-patterns.md](best-practices/gallery-patterns.md) | Complete gallery guide: performance, pagination, selection, forms integration |
| [error-handling-patterns.md](best-practices/error-handling-patterns.md) | IfError, IsError, App.OnError, error logging patterns |
| [real-world-patterns.md](best-practices/real-world-patterns.md) | Production-tested UDFs: lookup helpers, relative dates, smart due dates, dashboard metrics |

---

## Source Attribution

Best practices content sourced from:
- [Matthew Devaney](https://www.matthewdevaney.com/) - MVP, coding standards, UDFs, gallery patterns
- [Shane Young / PowerApps911](https://www.powerapps911.com/) - MVP, tutorials, nested galleries
- [Reza Dorrani](https://rezadorrani.com/) - Microsoft PM, Power Fx, pagination patterns
- [April Dunnam](https://www.sharepointsiren.com/) - Microsoft Cloud Advocate, templates, gallery UI
- [Platforms of Power](https://platformsofpower.net/) - Error handling, SharePoint filtering, functions
- [Microsoft Learn](https://learn.microsoft.com/en-us/power-platform/power-fx/) - Official documentation

## Sources

- [Microsoft Learn](https://learn.microsoft.com/en-us/power-platform/power-fx/)
