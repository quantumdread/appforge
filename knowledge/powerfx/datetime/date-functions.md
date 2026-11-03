# Date and Time Functions

## Now Function

Returns the current date and time in the user's local time zone.

### Syntax

```powerfx
Now()
```

### Rules

1. **Volatile**: Returns different values each time evaluated
2. **Local time**: Uses current user's time zone
3. **No auto-refresh**: Labels don't auto-update; use Timer for real-time

### Examples

```powerfx
Now()                                         // 12/12/2025 2:30:45 PM
Text( Now(), DateTimeFormat.ShortDateTime )   // "12/12/2025 2:30 PM"
```

---

## Today Function

Returns the current date with time set to midnight.

### Syntax

```powerfx
Today()
```

### Rules

1. **Time is midnight**: Always returns 12:00:00 AM
2. **Local time zone**: Based on user's time zone
3. **Use for date-only**: When time component is not needed

### Examples

```powerfx
Today()                                       // 12/12/2025 12:00:00 AM
Text( Today(), DateTimeFormat.ShortDate )     // "12/12/2025"
```

---

## IsToday Function

Checks if a date/time value falls within today.

### Syntax

```powerfx
IsToday( DateTime )
```

### Rules

1. **Range check**: True if between midnight today and midnight tomorrow
2. **Time zone aware**: Uses user's local time zone

### Examples

```powerfx
IsToday( Now() )                              // true
IsToday( Today() )                            // true
IsToday( DateAdd( Today(), 1 ) )              // false
IsToday( DateAdd( Today(), -1 ) )             // false
```

---

## DateAdd Function

Adds or subtracts time from a date/time value.

### Syntax

```powerfx
DateAdd( DateTime, Addition [, Units ] )
```

### Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| DateTime | Yes | - | Starting date/time |
| Addition | Yes | - | Number to add (negative to subtract) |
| Units | No | TimeUnit.Days | Unit of time |

### TimeUnit Options

| Unit | Description |
|------|-------------|
| `TimeUnit.Milliseconds` | Milliseconds |
| `TimeUnit.Seconds` | Seconds |
| `TimeUnit.Minutes` | Minutes |
| `TimeUnit.Hours` | Hours |
| `TimeUnit.Days` | Days (default) |
| `TimeUnit.Months` | Months |
| `TimeUnit.Quarters` | Quarters (3 months) |
| `TimeUnit.Years` | Years |

### Examples

```powerfx
// Add days (default)
DateAdd( Today(), 7 )                         // 7 days from now
DateAdd( Today(), -30 )                       // 30 days ago

// Add specific units
DateAdd( Now(), 2, TimeUnit.Hours )           // 2 hours from now
DateAdd( Now(), -15, TimeUnit.Minutes )       // 15 minutes ago
DateAdd( Today(), 1, TimeUnit.Months )        // 1 month from now
DateAdd( Today(), 1, TimeUnit.Years )         // 1 year from now
DateAdd( Today(), 1, TimeUnit.Quarters )      // 3 months from now

// Due date calculation
DateAdd( OrderDate, 30 )                      // 30 days after order

// Expiration
DateAdd( CreatedDate, 1, TimeUnit.Years )     // 1 year expiration
```

---

## DateDiff Function

Calculates the difference between two dates.

### Syntax

```powerfx
DateDiff( Start, End [, Units ] )
```

### Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| Start | Yes | - | Starting date/time |
| End | Yes | - | Ending date/time |
| Units | No | TimeUnit.Days | Unit for result |

### Rules

1. **Returns whole numbers**: Fractional results truncated
2. **Negative for past**: Returns negative if End is before Start
3. **For fractions**: Use smaller units and divide

### Examples

```powerfx
// Days difference
DateDiff( Today(), DateValue("12/31/2025") )  // Days until end of year

// Age calculation
DateDiff( BirthDate, Today(), TimeUnit.Years )

// Hours between times
DateDiff( StartTime, EndTime, TimeUnit.Hours )

// Minutes remaining
DateDiff( Now(), DueDate, TimeUnit.Minutes )

// Fractional hours (workaround)
DateDiff( Start, End, TimeUnit.Minutes ) / 60 // 1.5 for 90 minutes
```

---

## Date Function

Creates a date/time value from year, month, day components.

### Syntax

```powerfx
Date( Year, Month, Day )
```

### Rules

1. **Overflow handling**: Month > 12 or Day > days in month rolls over
2. **Time is midnight**: Returns time as 12:00:00 AM

### Examples

```powerfx
Date( 2025, 12, 25 )                          // December 25, 2025
Date( 2025, 1, 1 )                            // January 1, 2025
Date( Year( Today() ), 1, 1 )                 // First day of current year
Date( Year( Today() ), 12, 31 )               // Last day of current year

// Overflow example
Date( 2025, 13, 1 )                           // January 1, 2026
Date( 2025, 1, 32 )                           // February 1, 2025
```

---

## Time Function

Creates a time value from hour, minute, second components.

### Syntax

```powerfx
Time( Hour, Minute, Second )
```

### Examples

```powerfx
Time( 14, 30, 0 )                             // 2:30:00 PM
Time( 0, 0, 0 )                               // Midnight
Time( 23, 59, 59 )                            // 11:59:59 PM
```

---

## Component Extraction Functions

| Function | Returns | Example |
|----------|---------|---------|
| `Year( DateTime )` | Year number | `Year( Today() )` → 2025 |
| `Month( DateTime )` | Month (1-12) | `Month( Today() )` → 12 |
| `Day( DateTime )` | Day (1-31) | `Day( Today() )` → 12 |
| `Hour( DateTime )` | Hour (0-23) | `Hour( Now() )` → 14 |
| `Minute( DateTime )` | Minute (0-59) | `Minute( Now() )` → 30 |
| `Second( DateTime )` | Second (0-59) | `Second( Now() )` → 45 |
| `Weekday( DateTime )` | Day of week (1-7) | `Weekday( Today() )` → 6 (Friday) |

### Weekday Values

| Value | Day (Sunday start) |
|-------|-------------------|
| 1 | Sunday |
| 2 | Monday |
| 3 | Tuesday |
| 4 | Wednesday |
| 5 | Thursday |
| 6 | Friday |
| 7 | Saturday |

---

## DateValue and TimeValue Functions

Convert text strings to date/time values.

### Syntax

```powerfx
DateValue( String [, Language ] )
TimeValue( String [, Language ] )
DateTimeValue( String [, Language ] )
```

### Examples

```powerfx
DateValue( "12/25/2025" )                     // December 25, 2025
DateValue( "December 25, 2025" )              // December 25, 2025
TimeValue( "2:30 PM" )                        // 2:30:00 PM
TimeValue( "14:30" )                          // 2:30:00 PM
DateTimeValue( "12/25/2025 2:30 PM" )         // Full date/time
```

---

## Common Patterns

### Start of Month

```powerfx
Date( Year( Today() ), Month( Today() ), 1 )
```

### End of Month

```powerfx
DateAdd( Date( Year( Today() ), Month( Today() ) + 1, 1 ), -1 )
// Or use EOMonth:
EOMonth( Today(), 0 )
```

### Start of Year

```powerfx
Date( Year( Today() ), 1, 1 )
```

### Is Weekend

```powerfx
Weekday( DateValue ) = 1 || Weekday( DateValue ) = 7
```

### Business Days Only (Mon-Fri)

```powerfx
Weekday( DateValue ) >= 2 && Weekday( DateValue ) <= 6
```

### Age Calculation

```powerfx
DateDiff( BirthDate, Today(), TimeUnit.Years )
```

### Days Until Event

```powerfx
DateDiff( Today(), EventDate )
```

### Relative Date Display

```powerfx
Switch(
    DateDiff( Today(), ItemDate ),
    0, "Today",
    -1, "Yesterday",
    1, "Tomorrow",
    Text( ItemDate, DateTimeFormat.ShortDate )
)
```

---

## UTC Functions (Dataverse/Power Pages)

| Function | Description |
|----------|-------------|
| `UTCNow()` | Current UTC date/time |
| `UTCToday()` | Current UTC date |
| `IsUTCToday( DateTime )` | Is date today in UTC |

---

## Sources

- [Microsoft Learn: DateAdd and DateDiff](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-dateadd-datediff)
- [Microsoft Learn: Now, Today, IsToday](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-now-today-istoday)
