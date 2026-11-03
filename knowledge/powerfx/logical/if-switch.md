# If and Switch Functions

## If Function

### Syntax

```powerfx
If( Condition, ThenResult [, DefaultResult ] )
If( Condition1, ThenResult1 [, Condition2, ThenResult2, ... [, DefaultResult ] ] )
```

### Parameters

| Parameter | Required | Type | Description |
|-----------|----------|------|-------------|
| Condition | Yes | Boolean | Formula to test for `true` |
| ThenResult | Yes | Any | Value returned when condition is `true` |
| DefaultResult | No | Any | Value returned if no condition is `true`. Returns `blank` if omitted |

### Rules

1. **Short-circuit evaluation**: Conditions evaluate in order; stops at first `true`
2. **Type consistency**: All result values should be the same type for predictable behavior
3. **Blank default**: Returns `blank` if no condition matches and no DefaultResult provided
4. **Nesting limit**: Avoid deeply nested If statements - use Switch for value matching

### Examples

```powerfx
// Simple condition
If( Slider1.Value = 25, "Match" )

// With default
If( Slider1.Value > 100, "High", "Normal" )

// Multiple conditions
If(
    Status = "Active", Green,
    Status = "Pending", Yellow,
    Status = "Inactive", Red,
    Gray  // Default
)

// Behavior formula (navigation)
If( !IsBlank( FirstName.Text ), Navigate( Screen1 ) )
```

### Common Mistakes

```powerfx
// BAD: Redundant conditions
If( Value > 10, "High", Value <= 10, "Low" )

// GOOD: Use default for else case
If( Value > 10, "High", "Low" )

// BAD: Deep nesting
If( A, If( B, If( C, "ABC", "AB" ), "A" ), "None" )

// GOOD: Flatten with multiple conditions
If( A && B && C, "ABC", A && B, "AB", A, "A", "None" )
```

---

## Switch Function

### Syntax

```powerfx
Switch( Formula, Match1, Result1 [, Match2, Result2, ... [, DefaultResult ] ] )
```

### Parameters

| Parameter | Required | Type | Description |
|-----------|----------|------|-------------|
| Formula | Yes | Any | Value to match against (evaluated once) |
| Match | Yes | Any | Value to compare with Formula result |
| Result | Yes | Any | Value returned when match found |
| DefaultResult | No | Any | Value returned if no match. Returns `blank` if omitted |

### Rules

1. **Single evaluation**: Formula is evaluated only once, then compared to each Match
2. **Exact matching**: Uses exact equality comparison
3. **First match wins**: Returns result for first matching value
4. **More efficient**: Prefer Switch over nested If for value matching

### Examples

```powerfx
// Simple value matching
Switch(
    Status.Value,
    "Active", Green,
    "Pending", Yellow,
    "Inactive", Red,
    Gray  // Default
)

// Numeric matching
Switch(
    DayOfWeek,
    1, "Monday",
    2, "Tuesday",
    3, "Wednesday",
    4, "Thursday",
    5, "Friday",
    6, "Saturday",
    7, "Sunday",
    "Unknown"
)

// Behavior formula
Switch(
    SelectedOption,
    "Home", Navigate( HomeScreen ),
    "Settings", Navigate( SettingsScreen ),
    "Profile", Navigate( ProfileScreen )
)
```

### When to Use Switch vs If

| Scenario | Use |
|----------|-----|
| Single value matching multiple options | **Switch** |
| Range comparisons (>, <, >=) | **If** |
| Multiple unrelated conditions | **If** |
| Complex boolean logic | **If** |
| Enum/Choice column matching | **Switch** |

---

## Sources

- [Microsoft Learn: If and Switch functions](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-if)
