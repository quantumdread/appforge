# Concurrent Function

Run multiple formulas simultaneously for better performance.

---

## Syntax

```powerfx
Concurrent( Formula1, Formula2 [, Formula3, ... ] )
```

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| Formula1, Formula2, ... | Yes | Formulas to evaluate in parallel (minimum 2) |

## Return Value

- Returns `true` if all formulas succeed
- Returns `blank` or first error if any formula fails

---

## Key Behaviors

- **Parallel execution** - All formulas start at same time
- **Completion wait** - Function completes when ALL formulas finish
- **No order guarantee** - Cannot predict which finishes first
- **Behavior formulas only** - Cannot use in calculated properties

---

## When to Use

Best for **independent operations** that don't depend on each other:

- Loading multiple data sources
- Multiple API calls
- App.OnStart initialization
- Multiple Collect/ClearCollect operations

---

## Performance Example

### Without Concurrent (Sequential)

```powerfx
// Total time = Time1 + Time2 + Time3 + Time4
ClearCollect( colProducts, Products );
ClearCollect( colCustomers, Customers );
ClearCollect( colOrders, Orders );
ClearCollect( colCategories, Categories )
```

### With Concurrent (Parallel)

```powerfx
// Total time = Max(Time1, Time2, Time3, Time4)
Concurrent(
    ClearCollect( colProducts, Products ),
    ClearCollect( colCustomers, Customers ),
    ClearCollect( colOrders, Orders ),
    ClearCollect( colCategories, Categories )
)
```

**Result**: ~50% faster if all calls take similar time.

---

## Dependency Rules

### NOT Allowed - Internal Dependencies

```powerfx
// ERROR: b depends on a
Concurrent(
    Set( a, 1 ),
    Set( b, a + 1 )
)
```

### Allowed - External Dependencies

```powerfx
// OK: a is set before Concurrent starts
Set( a, 1 );
Concurrent(
    Set( b, a + 1 ),
    Set( c, a + 2 )
)
```

### Allowed - Downstream Dependencies

```powerfx
// OK: d depends on results after Concurrent completes
Concurrent(
    ClearCollect( col1, Source1 ),
    ClearCollect( col2, Source2 )
);
Set( totalCount, CountRows( col1 ) + CountRows( col2 ) )
```

---

## Chaining Within Arguments

Use `;` to chain dependent formulas within a single argument:

```powerfx
Concurrent(
    Set( a, 1 ); Set( b, a + 1 ),     // Chain 1: b depends on a
    Set( x, 10 ); Set( y, x + 10 )    // Chain 2: y depends on x
)
// a=1, b=2, x=10, y=20
```

---

## Common Patterns

### App.OnStart - Load Data

```powerfx
Concurrent(
    ClearCollect( colUsers, Users ),
    ClearCollect( colProducts, Products ),
    ClearCollect( colSettings, Settings ),
    Set( varUserInfo, User() )
)
```

### Multiple API Calls

```powerfx
Concurrent(
    Set( varWeather, MyWeatherAPI.GetWeather() ),
    Set( varNews, MyNewsAPI.GetHeadlines() ),
    Set( varStocks, MyStockAPI.GetPrices() )
)
```

### Refresh Multiple Sources

```powerfx
Concurrent(
    Refresh( Products ),
    Refresh( Customers ),
    Refresh( Orders )
)
```

---

## Error Handling

- When one formula fails, others continue
- First error (by argument order) is returned
- Check individual results if needed

```powerfx
Concurrent(
    IfError(
        ClearCollect( col1, Source1 ),
        Notify( "Source1 failed", NotificationType.Error )
    ),
    IfError(
        ClearCollect( col2, Source2 ),
        Notify( "Source2 failed", NotificationType.Error )
    )
)
```

---

## Limitations

| Limitation | Description |
|------------|-------------|
| No internal dependencies | Formulas within Concurrent cannot depend on each other |
| Behavior formulas only | Cannot use in calculated properties |
| Device dependent | Actual parallelism depends on device/browser |
| No order control | Cannot control execution order |

---

## Best Practices

1. **Group independent operations** together
2. **Avoid side effects** that could conflict
3. **Don't create race conditions** between formulas
4. **Test performance** to verify improvement
5. **Use for network operations** where parallel execution helps most

---

## Sources

- [Microsoft Learn: Concurrent function](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-concurrent)
