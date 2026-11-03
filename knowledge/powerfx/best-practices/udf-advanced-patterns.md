# Reusable Power Fx Functions

Define UDFs in `App.Formulas`. Use a pure expression for a calculated value and a behavior body for actions. All definitions below use English separators. Calls belong in the consuming property, not beside the definition in App.Formulas.

## Availability and Types

Microsoft's GA announcement identifies version 2508.3: UDFs share the new analysis engine switch and no longer have a separate preview switch. New apps enable that engine by default. For an older app, inspect Settings > General for the analysis engine option, enable it if needed, then save and reload. The announcement also describes faster Studio load/save behavior.

The announcement described user defined record/table types as forthcoming. Current documentation supports named types; check the target app's engine and feature availability before adopting them. The JSON patterns here remain useful for a scalar-only baseline.

Reference: [Microsoft: Power Apps User Defined Functions GA](https://www.microsoft.com/en-us/power-platform/blog/power-apps/power-apps-user-defined-functions-ga/).

Reference: [Microsoft: UDFs, UDTs and enhanced component properties](https://www.microsoft.com/en-us/power-platform/blog/power-apps/user-defined-functions-user-defined-types-and-enhanced-component-properties-move-forward/).

| Type | Intended use |
|---|---|
| `Number` | Numeric arithmetic |
| `Text` | Strings and serialized payloads |
| `Boolean` | Predicates |
| `DateTime` | Dates and timestamps |
| `Color` | Style values |
| Currency/money | Use `Number` for these canvas examples; do not assume `Currency` is a portable UDF signature type |
| `Dynamic` | Values obtained from ParseJSON or other dynamic sources |
| `Void` | Behavior function with no result |

Do not use bare `Table` or `Record` as a complete structural signature. Where supported, define a type with `Type` and refer to its name. The older baseline excludes `DateTimeNoTimeZone`, `Decimal`, and `ObjNull` from its UDF signatures; verify host support before using additional types. Use `Dynamic` in new signatures; it replaced the older `UntypedObject` name in 2025.

Reference: [Microsoft Learn: Power Fx](https://learn.microsoft.com/en-us/power-platform/power-fx/).

## Scalar Definitions

Name every parameter and return type. Use app-specific names that do not collide with built-ins.

```powerfx
// App.Formulas
udfCentimeters(Inches: Number): Number = Inches * 2.54;
udfLineAmount(Units: Number, UnitCost: Number): Number = Round(Units * UnitCost, 2);
udfContactCaption(Given: Text, Family: Text): Text = Trim(Proper(Given) & " " & Upper(Family));
udfPayloadTitle(Payload: Dynamic): Text = Text(Payload.title);
```

For example, `udfLineAmount(3, 14.5)` evaluates to 43.5. Use the same typed contract from any consuming property.

Technique credit: Matthew Devaney — [Power Apps User Defined Functions: Write Code Once and Reuse](https://www.matthewdevaney.com/power-apps-user-defined-functions-write-code-once-and-reuse/).

## Work Within the Function Contract

### Pass table data through JSON when necessary

For an app that cannot use named table/record types, accept serialized text and convert dynamic fields explicitly. `JSON` belongs in a behavior property; do not call it from a pure value property.

```powerfx
// App.Formulas
udfPayloadRowCount(PayloadJson: Text): Number = CountRows(Table(ParseJSON(PayloadJson)));
```

```powerfx
// Button OnSelect; colOrderLines is an existing collection
Set(gblPayloadCount, udfPayloadRowCount(JSON(colOrderLines)))
```

Technique credit: Matthew Devaney — [Power Apps User Defined Functions: Write Code Once and Reuse](https://www.matthewdevaney.com/power-apps-user-defined-functions-write-code-once-and-reuse/).

### Use With for intermediate values

Pure UDFs cannot assign globals or screen context. A behavior UDF can change state, but `With` is the right scope for temporary arithmetic.

```powerfx
// App.Formulas
udfDiscountedAmount(ListAmount: Number, RatePercent: Number): Number =
    With({reduction: ListAmount * RatePercent / 100}, Round(ListAmount - reduction, 2));
```

Technique credit: Matthew Devaney — [Power Apps User Defined Functions: Write Code Once and Reuse](https://www.matthewdevaney.com/power-apps-user-defined-functions-write-code-once-and-reuse/).

### Supply every parameter

UDF calls have no optional-argument default syntax. Use a documented sentinel, or define differently named convenience functions. Do not rely on same-name overloads.

```powerfx
// App.Formulas; -1 means omitted tax or rebate
udfPayableAmount(NetAmount: Number, TaxAmount: Number, RebateAmount: Number): Number =
    NetAmount + If(TaxAmount = -1, 0, TaxAmount) - If(RebateAmount = -1, 0, RebateAmount);
udfPayableWithoutExtras(NetAmount: Number): Number = udfPayableAmount(NetAmount, -1, -1);
```

Technique credit: Matthew Devaney — [Power Apps User Defined Functions: Write Code Once and Reuse](https://www.matthewdevaney.com/power-apps-user-defined-functions-write-code-once-and-reuse/).

### Put side effects in a behavior body

Wrap actions in braces. Use `Void` when callers need no returned value. Call these functions from behavior properties. The first example creates a local audit collection; it does not persist business data.

```powerfx
// App.Formulas
udfRecordOrderAction(OrderKey: Number, ActionText: Text): Void = {
    Collect(colOrderAudit, {OrderID: OrderKey, Action: ActionText, OccurredAt: Now()});
    Notify("Order action recorded.", NotificationType.Information)
};
udfRecordAndConfirm(ActionText: Text): Boolean = {
    Collect(colOrderNotes, {Note: ActionText, LoggedAt: Now()});
    Notify("Note recorded.", NotificationType.Success);
    true
};
```

Technique credit: Matthew Devaney — [Power Apps User Defined Functions: Write Code Once and Reuse](https://www.matthewdevaney.com/power-apps-user-defined-functions-write-code-once-and-reuse/).

### Replace recursion with bounded table operations

Recursive UDF calls are unsupported. `ForAll` and `Sequence` suit independent work over a known range; they are not an ordered mutable loop. Power Fx has no general `Product` aggregate. A factorial illustration can use a logarithmic sum for a small integer domain:

```powerfx
// App.Formulas; floating-point approximation, restricted to 0..10
udfSmallFactorial(Count: Number): Number =
    If(
        Count < 0 || Count > 10 || Count <> RoundDown(Count, 0),
        Error({Kind: ErrorKind.Validation, Message: "Use a whole number from zero through ten."}),
        Count = 0,
        1,
        Round(Exp(Sum(Sequence(Count) As Factor, Ln(Factor.Value))), 0)
    );
```

Technique credit: Matthew Devaney — [Power Apps User Defined Functions: Write Code Once and Reuse](https://www.matthewdevaney.com/power-apps-user-defined-functions-write-code-once-and-reuse/).

## Compose Pure Helpers

### Nested scopes

Use nested `With` expressions when a later intermediate depends on an earlier one. Fields in the same record initializer cannot consume their newly introduced siblings.

```powerfx
// App.Formulas
udfForecastAmount(CurrentAmount: Number, AnnualPercent: Number, Periods: Number): Number =
    With(
        {growthFactor: 1 + AnnualPercent / 100},
        With({futureFactor: Power(growthFactor, Periods)}, Round(CurrentAmount * futureFactor, 2))
    );
```

Technique credit: Matthew Devaney — [Power Apps User Defined Functions: Write Code Once and Reuse](https://www.matthewdevaney.com/power-apps-user-defined-functions-write-code-once-and-reuse/).

### Calls between helpers

Build a small dependency chain with distinct purposes. Avoid deeply nested helpers that obscure network or computation costs.

```powerfx
// App.Formulas
udfCleanCaption(Caption: Text): Text = Trim(Substitute(Caption, Char(9), " "));
udfDeliveryCaption(Street: Text, City: Text, Region: Text): Text =
    udfCleanCaption(Street) & ", " & udfCleanCaption(City) & " " & Upper(Region);
```

Technique credit: Matthew Devaney — [Power Apps User Defined Functions: Write Code Once and Reuse](https://www.matthewdevaney.com/power-apps-user-defined-functions-write-code-once-and-reuse/).

### Numeric fallbacks

Choose whether zero represents a meaningful fallback; otherwise return a validation error to the caller.

```powerfx
// App.Formulas
udfUnitsPerPack(Units: Number, Packs: Number): Number = If(Packs = 0, 0, Units / Packs);
udfSafeRatio(PartAmount: Number, WholeAmount: Number): Number = IfError(PartAmount / WholeAmount, 0);
```

Technique credit: Matthew Devaney — [Power Apps User Defined Functions: Write Code Once and Reuse](https://www.matthewdevaney.com/power-apps-user-defined-functions-write-code-once-and-reuse/).

### Count weekdays

Count an inclusive range, excluding Saturday and Sunday. Holidays require a separate exclusion table. Normalize timestamps and bound the sequence to its 50,000-row maximum.

```powerfx
// App.Formulas
udfWeekdayCount(FromDate: DateTime, ThroughDate: DateTime): Number =
    With(
        {firstDay: Date(Year(FromDate), Month(FromDate), Day(FromDate)),
         lastDay: Date(Year(ThroughDate), Month(ThroughDate), Day(ThroughDate))},
        With(
            {span: DateDiff(firstDay, lastDay, TimeUnit.Days) + 1},
            If(
                span <= 0, 0,
                span > 50000,
                Error({Kind: ErrorKind.Validation, Message: "Date range is too long."}),
                CountIf(
                    AddColumns(Sequence(span, 0) As Offset, WorkDate, DateAdd(firstDay, Offset.Value, TimeUnit.Days)),
                    Weekday(WorkDate, StartOfWeek.Monday) <= 5
                )
            )
        )
    );
```

Technique credit: Matthew Devaney — [Power Apps User Defined Functions: Write Code Once and Reuse](https://www.matthewdevaney.com/power-apps-user-defined-functions-write-code-once-and-reuse/).

### Style and message helpers

Return a Color for a status, and use nested substitutions for a small two-slot message template.

```powerfx
// App.Formulas
udfQueueColor(State: Text): Color =
    Switch(State, "Ready", Color.Teal, "Waiting", Color.GoldenRod, "Closed", Color.Gray, "Failed", Color.FireBrick, Color.Black);
udfTwoPartMessage(TemplateText: Text, FirstPart: Text, SecondPart: Text): Text =
    Substitute(Substitute(TemplateText, "{first}", FirstPart), "{second}", SecondPart);
udfDollarAmount(Amount: Number): Text = Text(Amount, "[$-en-US]$#,##0.00");
```

A label can call `udfTwoPartMessage("Order {first} is assigned to {second}.", "84", "Alex")`.

Technique credit: Matthew Devaney — [Power Apps User Defined Functions: Write Code Once and Reuse](https://www.matthewdevaney.com/power-apps-user-defined-functions-write-code-once-and-reuse/).

## Keep Repeated Calls Cheap

Use pure arithmetic or local lookups in template properties only when their per-row cost is small. Precompute expensive results over a complete local table. Avoid connectors and repeated JSON parsing in functions invoked for every row or every render. A stored result requires an invalidation policy.

If an older signature needs JSON, load the small profile cache once. Suppose its objects have text `account` and `caption` fields. This helper illustrates explicit dynamic conversion; for a hot path, parse once into a typed local collection instead.

```powerfx
// App.Formulas
udfCachedAccountCaption(AccountKey: Text, CacheJson: Text): Text =
    With(
        {profiles: Table(ParseJSON(CacheJson))},
        Coalesce(LookUp(profiles As ProfileRow, Text(ProfileRow.Value.account) = AccountKey, Text(ProfileRow.Value.caption)), "Account unavailable")
    );
```

Technique credit: Matthew Devaney — [Power Apps User Defined Functions: Write Code Once and Reuse](https://www.matthewdevaney.com/power-apps-user-defined-functions-write-code-once-and-reuse/).

## Reserve Names and Scope Prefixes

Do not shadow built-ins such as `Type`, `IsType`, `AsType`, `Set`, `UpdateContext`, `Navigate`, `Back`, `And`, `Or`, `Not`, `If`, or `Switch`. Prefix custom functions with `udf`. Use `fx` for values, `gbl`/`var` for globals, `loc` for context, and `col` for collections. Make parameter names distinct from fields used in nested record scopes.

Technique credit: Matthew Devaney — [Power Apps User Defined Functions: Write Code Once and Reuse](https://www.matthewdevaney.com/power-apps-user-defined-functions-write-code-once-and-reuse/).
