# Advanced Date and Time Functions

Advanced date/time operations including locale information, timezone handling, and specialized date calculations.

---

## Calendar Function

Returns locale-specific calendar information for the current user.

### Syntax

```powerfx
Calendar.MonthsLong()
Calendar.MonthsShort()
Calendar.WeekdaysLong()
Calendar.WeekdaysShort()
```

### Parameters

None

### Return Value

Single-column tables containing locale-specific calendar information:

| Function | Type | Description |
|----------|------|-------------|
| Calendar.MonthsLong() | Single-column table | Full month names starting with "January" |
| Calendar.MonthsShort() | Single-column table | Abbreviated month names starting with "Jan" |
| Calendar.WeekdaysLong() | Single-column table | Full weekday names starting with "Sunday" |
| Calendar.WeekdaysShort() | Single-column table | Abbreviated weekday names starting with "Sun" |

### Examples

```powerfx
// Get full month names
Calendar.MonthsLong()
// Returns: ["January", "February", "March", ...]

// Get abbreviated month names
Calendar.MonthsShort()
// Returns: ["Jan", "Feb", "Mar", ...]

// Get full weekday names
Calendar.WeekdaysLong()
// Returns: ["Sunday", "Monday", "Tuesday", ...]

// Get abbreviated weekday names
Calendar.WeekdaysShort()
// Returns: ["Sun", "Mon", "Tue", ...]

// Populate dropdown with month names
Set( varMonths, Calendar.MonthsLong() );
Dropdown1.Items = varMonths

// Get specific month name
Index( Calendar.MonthsLong(), 3 ).Value
// Returns: "March"

// Format date using locale names
Concatenate(
    Index( Calendar.WeekdaysShort(), Weekday( Today() ) ).Value,
    " ",
    Index( Calendar.MonthsShort(), Month( Today() ) ).Value,
    " ",
    Day( Today() ),
    ", ",
    Year( Today() )
)
// Returns: "Tue Dec 12, 2025"
```

### Common Patterns

```powerfx
// Create month dropdown for data entry
ForAll( Sequence( 12 ),
    {
        MonthNumber: Value,
        MonthName: Index( Calendar.MonthsLong(), Value ).Value
    }
)

// Display localized date
With(
    { varDate: Today() },
    Concatenate(
        Index( Calendar.WeekdaysLong(), Weekday( varDate ) ).Value,
        ", ",
        Index( Calendar.MonthsLong(), Month( varDate ) ).Value,
        " ",
        Day( varDate ),
        ", ",
        Year( varDate )
    )
)
```

### Notes

- Calendar function is not currently supported in Dataverse functions
- Applies to Canvas apps and Model-driven apps
- Returns values based on user's current language settings

---

## Clock Function

Returns locale-specific time information for the current user.

### Syntax

```powerfx
Clock.AmPm()
Clock.AmPmShort()
Clock.IsClock24()
```

### Parameters

None

### Return Value

Locale-specific clock information:

| Function | Type | Description |
|----------|------|-------------|
| Clock.AmPm() | Single-column table | Uppercase "AM" and "PM" designations (empty for 24-hour locales) |
| Clock.AmPmShort() | Single-column table | Uppercase "A" and "P" designations (empty for 24-hour locales) |
| Clock.IsClock24() | Boolean | Returns true if locale uses 24-hour clock format |

### Examples

```powerfx
// Check if 24-hour format
Clock.IsClock24()
// Returns: false (for US), true (for many European locales)

// Get AM/PM designations
Clock.AmPm()
// Returns: ["AM", "PM"] (US), [] (24-hour locales)

// Get short AM/PM designations
Clock.AmPmShort()
// Returns: ["A", "P"] (US), [] (24-hour locales)

// Display time based on locale
If( Clock.IsClock24(),
    Text( Now(), "HH:mm:ss" ),
    Text( Now(), "h:mm:ss AM/PM" )
)

// Create hour dropdown based on locale
If( Clock.IsClock24(),
    Sequence( 24, 0 ),
    Sequence( 12, 1 )
)
```

### Common Patterns

```powerfx
// Locale-aware time validation
Set( varHour, Value( HourInput.Text ) );
If( Clock.IsClock24(),
    And( varHour >= 0, varHour < 24 ),
    And( varHour >= 1, varHour <= 12 )
)

// Format time according to locale preference
If( Clock.IsClock24(),
    Text( Now(), "HH:mm" ),
    Text( Now(), "h:mm AM/PM" )
)

// Display AM/PM selector only for 12-hour locales
If( Not( Clock.IsClock24() ),
    Dropdown2.Items = Clock.AmPm(),
    Dropdown2.Visible = false
)
```

### Notes

- Clock function is not currently supported in Dataverse functions
- Applies to Canvas apps and Model-driven apps
- Returns values based on user's current language settings

---

## DateTime Function

Creates a datetime value from separate date and time components.

### Syntax

```powerfx
DateTime( Year, Month, Day, Hour, Minute, Second [, Milliseconds ] )
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| Year | Number | Yes | Numbers > 1899 are absolute (1980 = 1980); numbers 0-1899 are relative to 1900 (e.g., 80 = 1980) |
| Month | Number | Yes | Month (1-12) |
| Day | Number | Yes | Day (1-31) |
| Hour | Number | Yes | Hour (usually 0-23, where 0 = 12:00 AM) |
| Minute | Number | Yes | Minute (usually 0-59) |
| Second | Number | Yes | Second (usually 0-59) |
| Milliseconds | Number | No | Millisecond (usually 0-999), default 0 |

### Return Value

A Date/Time value representing the specified date and time.

### Examples

```powerfx
// Create specific datetime
DateTime( 2024, 12, 25, 14, 30, 45 )
// Returns: December 25, 2024 at 2:30:45 PM

// With milliseconds
DateTime( 2024, 12, 25, 14, 30, 45, 500 )
// Returns: December 25, 2024 at 2:30:45.500 PM

// Format with milliseconds
Text(
    DateTime( 2023, 10, 28, 13, 14, 5, 231 ),
    "yy/mm/dd hh:mm:ss.000 AM/PM"
)
// Returns: "23/10/28 01:14:05.231 PM"

// Create start of day
DateTime( Year( Today() ), Month( Today() ), Day( Today() ), 0, 0, 0 )

// Create end of day
DateTime( Year( Today() ), Month( Today() ), Day( Today() ), 23, 59, 59 )

// From form inputs
DateTime(
    Value( YearInput.Text ),
    Value( MonthInput.Text ),
    Value( DayInput.Text ),
    Value( HourInput.Text ),
    Value( MinuteInput.Text ),
    Value( SecondInput.Text )
)
```

### Common Patterns

```powerfx
// Combine date and time inputs
Set( varDateTime,
    DateTime(
        Year( DatePicker1.SelectedDate ),
        Month( DatePicker1.SelectedDate ),
        Day( DatePicker1.SelectedDate ),
        Value( HourInput.Text ),
        Value( MinuteInput.Text ),
        0
    )
)

// Create business hours timestamps
Set( varBusinessStart, DateTime( Year( Today() ), Month( Today() ), Day( Today() ), 9, 0, 0 ) );
Set( varBusinessEnd, DateTime( Year( Today() ), Month( Today() ), Day( Today() ), 17, 0, 0 ) )

// Build datetime with validation
With(
    {
        y: Value( YearInput.Text ),
        m: Value( MonthInput.Text ),
        d: Value( DayInput.Text ),
        h: Value( HourInput.Text ),
        min: Value( MinuteInput.Text )
    },
    If(
        And( m >= 1, m <= 12, d >= 1, d <= 31, h >= 0, h <= 23, min >= 0, min <= 59 ),
        DateTime( y, m, d, h, min, 0 ),
        Blank()
    )
)
```

### Notes

- Year values 0-1899 are relative to 1900 (e.g., 80 becomes 1980)
- Year values > 1899 are used as-is
- Applies to Canvas apps, Copilot Studio, Desktop flows, Model-driven apps, Power Platform CLI, Dataverse functions, and Power Pages

---

## DateTimeValue Function

Converts text strings to datetime values, parsing various formats.

### Syntax

```powerfx
DateTimeValue( DateTimeText [, Language ] )
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| DateTimeText | Text | Yes | Text string containing a date and time value |
| Language | Text | No | Language code (e.g., "en", "fr"). Default: current user's language |

### Return Value

A date/time value parsed from the input text, or Blank() if parsing fails.

### Supported Formats

Common date formats recognized:
- MM/DD/YYYY or MM-DD-YYYY
- DD/MM/YYYY or DD-MM-YYYY
- YYYY/MM/DD or YYYY-MM-DD
- MM/DD/YY or MM-DD-YY
- DD/MM/YY or DD-MM-YY
- DD Mon YYYY
- Month DD, YYYY

Combined with time information (e.g., "12:13 AM", "1:50:24.765 PM")

### Examples

```powerfx
// Parse US format with time
DateTimeValue( "10/11/2014 1:50:24.765 PM" )
// Returns: October 11, 2014 at 1:50:24 PM (in "en" locale)

// Parse with explicit language
DateTimeValue( "10/11/2014 1:50:24.765 PM", "fr" )
// Returns: November 10, 2014 at 1:50:24 PM (in French, day/month reversed)

// Format result
Text( DateTimeValue( "10/11/2014 1:50:24.765 PM" ), DateTimeFormat.LongDateTime )
// Returns: "Saturday, October 11, 2014 1:50:24 PM" (en locale)

// Custom format with fractional seconds
Text( DateTimeValue( "10/11/2014 1:50:24.765 PM" ), "dddd, mmmm dd, yyyy hh:mm:ss.fff AM/PM" )
// Returns: "Saturday, October 11, 2014 01:50:24.765 PM"

// Parse user input with fallback
Coalesce(
    DateTimeValue( UserInput.Text ),
    Now()
)

// Parse with error handling
IfError(
    DateTimeValue( TextInput.Text ),
    Notify( "Invalid date/time format", NotificationType.Error ),
    Success
)
```

### Common Patterns

```powerfx
// Parse datetime from API response
Set( varEventDateTime,
    IfError(
        DateTimeValue( ApiResponse.created_at ),
        Now()
    )
)

// Validate and convert user input
Set( varUserDateTime,
    IfError(
        DateTimeValue( UserDateInput.Text ),
        Blank()
    )
);
If( IsBlank( varUserDateTime ),
    Notify( "Please enter valid date/time", NotificationType.Error )
)

// Handle different locales
Set( varDateTime,
    Coalesce(
        IfError( DateTimeValue( TextInput.Text, "en-US" ), Blank() ),
        IfError( DateTimeValue( TextInput.Text, "en-GB" ), Blank() ),
        Now()
    )
)

// Parse multiple formats
Set( varDateTime,
    Coalesce(
        DateTimeValue( InputText.Text ),
        DateValue( InputText.Text ),
        Now()
    )
)
```

### Notes

- "10/1/1920" is interpreted as October 1 in "en" locale, January 10 in "fr" locale
- For JSON dynamic values, ISO 8601 format is expected
- Language parameter overrides user's default language setting
- Applies to Canvas apps, Copilot Studio, Desktop flows, Model-driven apps, Power Platform CLI, Dataverse functions, and Power Pages

---

## EDate Function

Adds or subtracts a specified number of months from a date.

### Syntax

```powerfx
EDate( DateTime, NumberOfMonths )
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| DateTime | Date or DateTime | Yes | Starting date |
| NumberOfMonths | Number | Yes | Number of months to add (positive) or subtract (negative) |

### Return Value

A date that is the specified number of months before or after the base date. Returns a Date value (no time component, even if input included time).

### Examples

```powerfx
// Add 4 months
EDate( Date( 2023, 5, 15 ), 4 )
// Returns: 9/15/2023

// Add 1 month (day exceeds month max)
EDate( Date( 2023, 5, 31 ), 1 )
// Returns: 6/30/2023 (June has only 30 days)

// Subtract 3 months
EDate( Date( 2023, 5, 15 ), -3 )
// Returns: 2/15/2023

// Zero months (no change)
EDate( Date( 2023, 5, 15 ), 0 )
// Returns: 5/15/2023

// Large month calculation
EDate( Date( 2023, 5, 15 ), -1002 )
// Returns: 11/15/1939

// Calculate contract renewal (1 year)
EDate( ContractStartDate, 12 )

// Calculate quarterly dates
Set( varQ1End, EDate( Today(), 3 ) );
Set( varQ2End, EDate( Today(), 6 ) );
Set( varQ3End, EDate( Today(), 9 ) )
```

### Common Patterns

```powerfx
// Calculate warranty expiration (2 years = 24 months)
Set( varWarrantyEnd, EDate( PurchaseDate, 24 ) );
If( Today() > varWarrantyEnd,
    "Warranty expired",
    "Under warranty"
)

// Check if within 90 days (approximately 3 months)
Set( varTargetDate, EDate( Today(), 3 ) );
If( DueDate <= varTargetDate,
    "Coming due soon",
    "Time remaining"
)

// Subscription renewal reminder
Set( varRenewalDate, EDate( SubscriptionDate, 12 ) );
Set( varReminderDate, EDate( varRenewalDate, -1 ) );
If( Today() >= varReminderDate,
    Notify( "Send renewal notice" )
)

// Multi-month project phases
Set( varPhase1End, EDate( ProjectStart, 3 ) );
Set( varPhase2End, EDate( ProjectStart, 6 ) );
Set( varPhase3End, EDate( ProjectStart, 9 ) )
```

### Notes

- Day of month is preserved unless it exceeds the maximum days in the resulting month
- Returns Date value only (time component is removed)
- Useful for same day-of-month calculations (e.g., monthly billing on the 15th)
- Applies to Canvas apps, Copilot Studio, Desktop flows, Model-driven apps, Power Platform CLI, Dataverse functions, and Power Pages

---

## EOMonth Function

Returns the last day of the month for a date, with optional month offset.

### Syntax

```powerfx
EOMonth( DateTime, NumberOfMonths )
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| DateTime | Date or DateTime | Yes | Any date in the target month |
| NumberOfMonths | Number | Yes | Number of months to add (positive) or subtract (negative) |

### Return Value

A date representing the last day of the specified month. Returns a Date value (no time component, even if input included time).

### Examples

```powerfx
// Last day of same month
EOMonth( Date( 2023, 5, 15 ), 0 )
// Returns: 5/31/2023

// Last day 4 months in future
EOMonth( Date( 2023, 5, 15 ), 4 )
// Returns: 9/30/2023

// Last day of next month
EOMonth( Date( 2023, 5, 31 ), 1 )
// Returns: 6/30/2023

// Last day of previous month
EOMonth( Date( 2023, 5, 15 ), -1 )
// Returns: 4/30/2023

// Large month calculation
EOMonth( Date( 2023, 5, 15 ), -1002 )
// Returns: 11/30/1939

// Last day of February (handles leap years)
EOMonth( Date( 2024, 2, 1 ), 0 )
// Returns: 2/29/2024 (leap year)

// Last day of current month
EOMonth( Today(), 0 )

// Last day of year
EOMonth( Date( Year( Today() ), 12, 1 ), 0 )
// Returns: 12/31/[current year]
```

### Common Patterns

```powerfx
// Check if today is last day of month
If( Today() = EOMonth( Today(), 0 ),
    "Last day of month",
    "Not last day"
)

// Calculate days remaining in month
Set( varDaysRemaining,
    Day( EOMonth( Today(), 0 ) ) - Day( Today() )
)

// Month-end reporting trigger
Set( varMonthEnd, EOMonth( Today(), 0 ) );
If( Today() = varMonthEnd,
    ClearCollect( colMonthlyReport, Accounts );
    Notify( "Running month-end process" )
)

// Generate date range for current month
Set( varMonthStart, Date( Year( Today() ), Month( Today() ), 1 ) );
Set( varMonthEnd, EOMonth( Today(), 0 ) );
Filter( Transactions,
    DateColumn >= varMonthStart &&
    DateColumn <= varMonthEnd
)

// Get last day of each quarter month
With(
    { varStartMonth: Date( Year( Today() ), 1, 1 ) },
    [
        EOMonth( varStartMonth, 2 ),  // March 31
        EOMonth( varStartMonth, 5 ),  // June 30
        EOMonth( varStartMonth, 8 ),  // September 30
        EOMonth( varStartMonth, 11 )  // December 31
    ]
)

// Schedule task for first day of next month
Set( varTaskDate, EOMonth( Today(), 0 ) + 1 );
Patch( Tasks, Task, { DueDate: varTaskDate } )
```

### Notes

- Always moves to the last day of the resulting month
- Returns Date value only (time component is removed)
- Useful for month-end calculations and fiscal period boundaries
- With NumberOfMonths = 0, normalizes any date to its month-end
- Applies to Canvas apps, Copilot Studio, Desktop flows, Model-driven apps, Power Platform CLI, Dataverse functions, and Power Pages

---

## ISOWeekNum Function

Returns the ISO week number (1-53) for a given date based on ISO 8601 standard.

### Syntax

```powerfx
ISOWeekNum( DateTime )
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| DateTime | Date or DateTime | Yes | Date to get week number for |

### Return Value

A number (1-53) representing the ISO week number.

### Notes

- ISO week 1 is the week containing the first Thursday of the year
- Weeks always start on Monday
- Used internationally, especially in Europe
- May return 52 or 53 for early January dates (they belong to previous year's last week)
- ISO 8601 standard for week numbering

### Examples

```powerfx
// Get ISO week number for today
ISOWeekNum( Today() )
// Returns: 1-53

// Get ISO week for specific date
ISOWeekNum( Date( 2021, 1, 1 ) )
// Returns: 53 (Friday, Jan 1, 2021 belongs to week 53 of 2020)

ISOWeekNum( Date( 2021, 1, 4 ) )
// Returns: 1 (Monday, Jan 4, 2021 is first Monday of 2021)

// Check if in first week of year
If( ISOWeekNum( Today() ) = 1,
    "First week",
    "Other week"
)

// Create ISO week label
Concatenate(
    Text( Year( Today() ), "0000" ),
    "-W",
    Text( ISOWeekNum( Today() ), "00" )
)
// Returns: "2025-W50"

// Filter by ISO week
Set( varWeek, ISOWeekNum( Today() ) );
Filter( Tasks, ISOWeekNum( DueDate ) = varWeek )
```

### Common Patterns

```powerfx
// Create ISO week report grouping
ClearCollect( colWeeklyData,
    AddColumns(
        GroupBy(
            Filter( AllData, Year( DateColumn ) = Year( Today() ) ),
            "ISOWeek",
            ISOWeekNum( DateColumn ),
            "GroupedData"
        ),
        "TotalAmount", Sum( GroupedData, Amount ),
        "RecordCount", CountRows( GroupedData )
    )
)

// Compare ISO weeks year-over-year
Set( varThisWeek, ISOWeekNum( Today() ) );
Set( varThisYear, Year( Today() ) );
Set( varLastYear, varThisYear - 1 );
With(
    {
        ThisYearData: Filter( Sales,
            ISOWeekNum( SaleDate ) = varThisWeek &&
            Year( SaleDate ) = varThisYear
        ),
        LastYearData: Filter( Sales,
            ISOWeekNum( SaleDate ) = varThisWeek &&
            Year( SaleDate ) = varLastYear
        )
    },
    {
        ThisYearTotal: Sum( ThisYearData, Amount ),
        LastYearTotal: Sum( LastYearData, Amount )
    }
)

// Assign work based on ISO week (alternating weeks)
If( Mod( ISOWeekNum( Today() ), 2 ) = 0,
    "Team A",
    "Team B"
)

// Create ISO 8601 week format
Concatenate(
    Text( Year( Today() ), "0000" ),
    "-W",
    If( ISOWeekNum( Today() ) < 10, "0", "" ),
    Text( ISOWeekNum( Today() ) )
)
// Returns: "2025-W09" format
```

### Notes

- Not currently supported in Dataverse functions
- Applies to Canvas apps, Model-driven apps, Power Pages, and Dataverse formula columns
- Accepts single values or single-column tables

---

## WeekNum Function

Returns the week number (1-54) for a given date, with configurable start day.

### Syntax

```powerfx
WeekNum( DateTime [, StartOfWeek ] )
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| DateTime | Date or DateTime | Yes | Date to get week number for |
| StartOfWeek | Number or Enum | No | Day week starts (default: 1 = Sunday) |

### Return Value

A number (1-54) representing the week number.

### StartOfWeek Values

| Excel Code | Enumeration | Day |
|-----------|-------------|-----|
| 1, 17 | StartOfWeek.Sunday | Sunday (default) |
| 2, 11 | StartOfWeek.Monday | Monday |
| 12 | StartOfWeek.Tuesday | Tuesday |
| 13 | StartOfWeek.Wednesday | Wednesday |
| 14 | StartOfWeek.Thursday | Thursday |
| 15 | StartOfWeek.Friday | Friday |
| 16 | StartOfWeek.Saturday | Saturday |

### Examples

```powerfx
// Week starting Sunday (default)
WeekNum( Today() )
// Returns: 1-54

// Week starting Monday
WeekNum( Today(), StartOfWeek.Monday )
// or
WeekNum( Today(), 2 )

// Week starting Wednesday
WeekNum( Date( 2021, 1, 1 ), StartOfWeek.Wednesday )
// Returns: 1

// Compare different start days for same date
WeekNum( Date( 2021, 1, 1 ) )  // Sunday start
// Returns: 1

WeekNum( Date( 2021, 1, 1 ), StartOfWeek.Monday )  // Monday start
// Returns: 1 (different from ISO which returns 53)

// Filter by week number
Set( varWeek, WeekNum( Today(), StartOfWeek.Monday ) );
Filter( Tasks, WeekNum( DueDate, StartOfWeek.Monday ) = varWeek )
```

### Common Patterns

```powerfx
// Create week-based rotation
Set( varWeek, WeekNum( Today(), StartOfWeek.Monday ) );
Switch( Mod( varWeek, 3 ),
    1, "Team A on duty",
    2, "Team B on duty",
    0, "Team C on duty"
)

// Display week info with custom start day
Set( varWeekStart, StartOfWeek.Monday );
Set( varWeekNum, WeekNum( Today(), varWeekStart ) );
Concatenate(
    "Week ",
    Text( varWeekNum ),
    " of ",
    Text( WeekNum( Date( Year( Today() ), 12, 31 ), varWeekStart ) )
)

// Filter data by current week
Set( varCurrentWeek, WeekNum( Today(), StartOfWeek.Monday ) );
Set( varCurrentYear, Year( Today() ) );
Filter( DataTable,
    WeekNum( DateColumn, StartOfWeek.Monday ) = varCurrentWeek &&
    Year( DateColumn ) = varCurrentYear
)

// Calculate week-over-week comparison
Set( varThisWeek, WeekNum( Today(), StartOfWeek.Monday ) );
Set( varLastWeek, varThisWeek - 1 );
{
    ThisWeek: Sum(
        Filter( Sales, WeekNum( SaleDate, StartOfWeek.Monday ) = varThisWeek ),
        Amount
    ),
    LastWeek: Sum(
        Filter( Sales, WeekNum( SaleDate, StartOfWeek.Monday ) = varLastWeek ),
        Amount
    )
}

// Shift rotation based on week
With(
    { varWeek: WeekNum( Today(), StartOfWeek.Monday ) },
    If( Mod( varWeek, 2 ) = 1,
        "Morning shift",
        "Evening shift"
    )
)
```

### Notes

- Week 1 is defined as the week containing January 1
- Can return 1-54 (vs ISOWeekNum which returns 1-53)
- StartOfWeek parameter allows flexibility for regional preferences
- Excel code 21 is not supported; use ISOWeekNum instead for ISO 8601 compliance
- Applies to Canvas apps, Copilot Studio, Desktop flows, Dataverse, Model-driven apps, Power Platform CLI, and Power Pages
- Accepts single values or single-column tables

---

## TimeZoneOffset Function

Returns the time difference between UTC and the current user's time zone, in minutes.

### Syntax

```powerfx
TimeZoneOffset( [ DateTime ] )
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| DateTime | Date or DateTime | No | Date to calculate offset for (accounts for DST). Default: current date/time |

### Return Value

A number representing the offset from UTC in minutes.

### Notes

- Returns offset in minutes (not hours)
- Positive values indicate time zones east of UTC
- Negative values indicate time zones west of UTC
- Automatically accounts for Daylight Saving Time based on DateTime parameter
- Default is current date/time when DateTime is not provided

### Examples

```powerfx
// Get current timezone offset in minutes
TimeZoneOffset()
// Returns: -480 (PST, UTC-8), -420 (PDT, UTC-7), 0 (UTC), 60 (CET), etc.

// Get offset for specific date (handles DST)
TimeZoneOffset( Date( 2024, 1, 15 ) )
// Returns: -480 (PST winter time)

TimeZoneOffset( Date( 2024, 7, 15 ) )
// Returns: -420 (PDT summer time)

// Convert local time to UTC
DateAdd( Now(), TimeZoneOffset(), TimeUnit.Minutes )
// Example: If Now() = July 15, 2013, 1:02 PM PDT
// Returns: July 15, 2013, 8:02 PM UTC

// Convert UTC to local time
Set( varUTCTime, /* some UTC datetime */ );
DateAdd( varUTCTime, -TimeZoneOffset( varUTCTime ), TimeUnit.Minutes )
// Note: negative sign subtracts the offset

// Check if DST is active
If(
    TimeZoneOffset( Date( 2024, 1, 15 ) ) <>
    TimeZoneOffset( Date( 2024, 7, 15 ) ),
    "DST active in summer",
    "No DST"
)

// Display timezone offset as hours
Concatenate(
    "UTC",
    If( TimeZoneOffset() >= 0, "+", "" ),
    Text( TimeZoneOffset() / 60, "0.0" )
)
// Returns: "UTC-8.0" or "UTC+1.0"
```

### Common Patterns

```powerfx
// Store times in UTC, display in user timezone
Set( varStoredUTC, UTCNow() );
Set( varDisplayLocal,
    DateAdd( varStoredUTC, -TimeZoneOffset(), TimeUnit.Minutes )
);
Text( varDisplayLocal, "mm/dd/yyyy hh:mm AM/PM" )

// Convert user input to UTC for storage
Set( varUserTime, Now() );
Set( varUTCTime,
    DateAdd( varUserTime, TimeZoneOffset(), TimeUnit.Minutes )
);
Patch( Database, Record, { UTCTimestamp: varUTCTime } )

// Calculate meeting time across timezones
With(
    {
        varLocalOffset: TimeZoneOffset(),
        varNYOffset: -300,  // EST is UTC-5 hours = -300 minutes
        varTokyoOffset: 540  // JST is UTC+9 hours = 540 minutes
    },
    {
        LocalTime: Text( Now(), "hh:mm AM/PM" ),
        NYTime: Text(
            DateAdd( Now(), varLocalOffset - varNYOffset, TimeUnit.Minutes ),
            "hh:mm AM/PM"
        ),
        TokyoTime: Text(
            DateAdd( Now(), varLocalOffset - varTokyoOffset, TimeUnit.Minutes ),
            "hh:mm AM/PM"
        )
    }
)

// Handle DST transitions
With(
    {
        varWinterOffset: TimeZoneOffset( Date( 2024, 1, 15 ) ),
        varSummerOffset: TimeZoneOffset( Date( 2024, 7, 15 ) )
    },
    If( varWinterOffset <> varSummerOffset,
        Notify( "Daylight Saving Time affects this region" ),
        Notify( "No DST in this timezone" )
    )
)

// Verify timestamp is within UTC window
With(
    {
        varLocalTime: Now(),
        varUTCEquivalent: DateAdd( varLocalTime, TimeZoneOffset(), TimeUnit.Minutes )
    },
    If(
        varUTCEquivalent >= TargetUTCStart &&
        varUTCEquivalent <= TargetUTCEnd,
        "Within window",
        "Outside window"
    )
)
```

### Notes

- Returns offset in **minutes** (use `/60` to convert to hours)
- TimeZoneOffset defaults to current time when no parameter provided
- Use with DateAdd and TimeUnit.Minutes for conversions
- Applies to Canvas apps, Copilot Studio, Desktop flows, Model-driven apps, Power Platform CLI, Dataverse functions, and Power Pages

---

## UTCNow Function

Returns the current date and time in UTC (Coordinated Universal Time).

### Syntax

```powerfx
UTCNow()
```

### Parameters

None

### Return Value

Current date and time in UTC/GMT.

### Examples

```powerfx
// Get current UTC time
UTCNow()
// Returns: current date/time in UTC

// Format UTC time
Text( UTCNow(), "mm/dd/yyyy hh:mm:ss" )
// Example result: "07/12/2021 04:58:00"
// (If local time is 8:58 PM on July 11, 2021 in Pacific Time UTC-8)

// Extract hour from UTC time
Hour( UTCNow() )
// Returns: current hour in UTC (0-23)

// Compare with local time
{
    LocalTime: Now(),
    UTCTime: UTCNow(),
    DifferenceHours: DateDiff( Now(), UTCNow(), TimeUnit.Hours )
}

// Log activity timestamp in UTC
Patch( ActivityLog, Defaults( ActivityLog ), {
    Timestamp: UTCNow(),
    User: User().Email,
    Action: "FormSubmitted"
} )

// Convert UTC to user's local time
Set( varLocalTime,
    DateAdd( UTCNow(), -TimeZoneOffset(), TimeUnit.Minutes )
)

// Check if UTC deadline passed
If( UTCNow() > TargetUTCDate,
    "UTC deadline passed",
    "Still time remaining"
)
```

### Common Patterns

```powerfx
// Store all timestamps in UTC for consistency
Patch( Records, ThisItem, {
    CreatedUTC: UTCNow(),
    ModifiedUTC: UTCNow()
} )

// Display time in both UTC and local
With(
    {
        varUTC: UTCNow(),
        varLocal: DateAdd( UTCNow(), -TimeZoneOffset(), TimeUnit.Minutes )
    },
    Concatenate(
        "UTC: ", Text( varUTC, "hh:mm AM/PM" ),
        " | Local: ", Text( varLocal, "hh:mm AM/PM" )
    )
)

// Enforce UTC for API calls
Set( varPayload,
    {
        timestamp: Text( UTCNow(), "yyyy-mm-dd'T'hh:mm:ss'Z'" ),
        event: "FormSubmitted",
        data: FormData
    }
);
MyAPI.Post( varPayload )

// Calculate expiration in UTC
Set( varExpires, DateAdd( UTCNow(), 24, TimeUnit.Hours ) );
Patch( Tokens, Token, { ExpiresUTC: varExpires } )

// Log timezone-aware events
Patch( EventLog, Defaults( EventLog ), {
    UTCTime: UTCNow(),
    LocalTime: Now(),
    TimeZoneOffset: TimeZoneOffset(),
    Event: EventName
} )

// Verify UTC time is within service window
Set( varNowUTC, UTCNow() );
If(
    Hour( varNowUTC ) >= 6 &&
    Hour( varNowUTC ) <= 22,
    "Within service hours (6 AM - 10 PM UTC)",
    "Outside service hours"
)

// Create ISO 8601 timestamp
Text( UTCNow(), "yyyy-mm-dd'T'hh:mm:ss'Z'" )
// Returns: "2025-12-12T14:30:45Z"
```

### Volatile Function Behavior

- UTCNow is a volatile function - returns different value for each evaluation
- In data flow formulas, only returns new value when formula is reevaluated
- In behavior formulas, evaluated each time the behavior runs
- Label with `Label1.Text = UTCNow()` will not update while app is active

### Notes

- Returns time zone-independent value in UTC
- Only available in **Dataverse for Teams formula columns** for time-independent fields
- NOT available in PAC CLI `pac power-fx` commands
- NOT currently supported in Dataverse functions
- Applies to Dataverse formula columns and Power Pages

---

## UTCToday Function

Returns today's date in UTC (Coordinated Universal Time).

### Syntax

```powerfx
UTCToday()
```

### Parameters

None

### Return Value

Current date in UTC, with time set to 00:00:00 (midnight).

### Examples

```powerfx
// Get today's date in UTC
UTCToday()
// Returns: today's date in UTC at midnight

// Extract day from UTC date
Day( UTCToday() )
// Example: If UTC date is July 12, returns 12
// (even if local date is July 11)

// Compare with local today
If( UTCToday() = Today(),
    "Same day in both zones",
    "Different days (timezone difference)"
)

// Store date in UTC
Patch( Records, Record, {
    DateUTC: UTCToday(),
    DateLocal: Today()
} )

// Check if date is before today (UTC)
If( EventDate < UTCToday(),
    "Event is past",
    "Event is future"
)

// Get date range for today in UTC
Set( varStartUTC, UTCToday() );
Set( varEndUTC, DateAdd( UTCToday(), 1, TimeUnit.Days ) - Time( 0, 0, 1 ) );
Filter( Transactions,
    DateColumn >= varStartUTC &&
    DateColumn <= varEndUTC
)

// Calculate days until deadline (UTC-based)
DateDiff( UTCToday(), DeadlineDate, TimeUnit.Days )

// Check if today is UTC today
IsUTCToday( UTCToday() )
// Returns: true
```

### Common Patterns

```powerfx
// Ensure consistent date handling across timezones
With(
    {
        varUTCToday: UTCToday(),
        varLocalToday: Today(),
        varOffset: TimeZoneOffset() / 60
    },
    If( varUTCToday <> varLocalToday,
        Concatenate(
            "Time zone difference: ",
            Text( Abs( varOffset ) ),
            " hours"
        ),
        "Same date in UTC and local timezone"
    )
)

// Track all events for UTC today
ClearCollect( colTodayUTC,
    Filter( AllEvents,
        DateValue( EventDate ) = UTCToday()
    )
)

// Daily report generation in UTC
Set( varReportDate, UTCToday() );
ClearCollect( colDailyReport,
    Filter( Transactions,
        DateValue( DateColumn ) = varReportDate
    )
)

// Create 30-day window from UTC today
Set( varStart, UTCToday() );
Set( varEnd, DateAdd( UTCToday(), 30, TimeUnit.Days ) );
Filter( UpcomingEvents,
    EventDate >= varStart &&
    EventDate <= varEnd
)

// Compare UTC today with local today
With(
    {
        varUTC: UTCToday(),
        varLocal: Today()
    },
    {
        UtcDate: Text( varUTC, "mm/dd/yyyy" ),
        LocalDate: Text( varLocal, "mm/dd/yyyy" ),
        DayDifference: DateDiff( varUTC, varLocal, TimeUnit.Days ),
        Note: If( varUTC = varLocal, "Same date", "Different dates" )
    }
)

// Perform daily reconciliation at month-end
If( Day( UTCToday() ) = 1,
    ClearCollect( colMonthlyData, Transactions );
    Patch( ProcessLog, Defaults( ProcessLog ), {
        Status: "Month-end Complete",
        ProcessedUTC: UTCNow()
    } );
    Notify( "Running month-end process..." )
)

// Archive old records based on UTC date
Set( varCutoffUTC, DateAdd( UTCToday(), -365, TimeUnit.Days ) );
Remove(
    Filter( ArchiveTable, DateColumn < varCutoffUTC )
)
```

### Volatile Function Behavior

- UTCToday is a volatile function - returns different value for each evaluation
- In data flow formulas, only returns new value when formula is reevaluated
- In behavior formulas, evaluated each time the behavior runs

### Notes

- Returns time zone-independent date value in UTC
- Only available in **Dataverse for Teams formula columns** for time-independent fields
- NOT available in PAC CLI `pac power-fx` commands
- NOT currently supported in Dataverse functions
- Applies to Dataverse formula columns and Power Pages
- Returns date only (time = midnight 00:00:00)

---

## Cross-Function Usage Examples

### Scenario 1: International Meeting Scheduler

```powerfx
// Schedule a meeting across time zones
Set( varMeetingUTC, DateTime( 2024, 12, 25, 14, 0, 0 ) );
Set( varMeetingLocal,
    DateAdd( varMeetingUTC, -TimeZoneOffset(), TimeUnit.Minutes )
);

// Display in multiple formats
{
    UTCTime: Text( varMeetingUTC, "hh:mm AM/PM" ),
    LocalTime: Text( varMeetingLocal, "hh:mm AM/PM" ),
    FullDisplay: Concatenate(
        "Meeting at ",
        Text( varMeetingLocal, "hh:mm AM/PM" ),
        " your time (UTC: ",
        Text( varMeetingUTC, "hh:mm AM/PM" ),
        ")"
    )
}
```

### Scenario 2: Business Quarter Report

```powerfx
// Generate Q4 report (Oct-Dec)
Set( varQuarterStart, Date( Year( Today() ), 10, 1 ) );
Set( varQuarterEnd, EOMonth( varQuarterStart, 2 ) );

ClearCollect( colQ4Report,
    Filter( Transactions,
        TransactionDate >= varQuarterStart &&
        TransactionDate <= varQuarterEnd
    )
);

// Summary by month
{
    OctoberTotal: Sum( Filter( colQ4Report, Month( TransactionDate ) = 10 ), Amount ),
    NovemberTotal: Sum( Filter( colQ4Report, Month( TransactionDate ) = 11 ), Amount ),
    DecemberTotal: Sum( Filter( colQ4Report, Month( TransactionDate ) = 12 ), Amount )
}
```

### Scenario 3: Localized Date Display

```powerfx
// Display date in user's locale format
Set( varDate, Today() );
Concatenate(
    Index( Calendar.WeekdaysLong(), Weekday( varDate ) ).Value,
    ", ",
    Index( Calendar.MonthsLong(), Month( varDate ) ).Value,
    " ",
    Text( Day( varDate ) ),
    ", ",
    Text( Year( varDate ) )
)
// Returns: "Thursday, December 12, 2024"

// With time in locale format
If( Clock.IsClock24(),
    Text( Now(), "HH:mm" ),
    Text( Now(), "h:mm AM/PM" )
)
```

### Scenario 4: Subscription Management

```powerfx
// Track subscription with month-based renewal
Set( varStartDate, SubscriptionStart );
Set( varRenewalDate, EDate( varStartDate, 12 ) );  // 1 year
Set( varMonthEnd, EOMonth( varRenewalDate, 0 ) );
Set( varDaysRemaining, DateDiff( Today(), varRenewalDate, TimeUnit.Days ) );

{
    SubscriptionStart: varStartDate,
    RenewalDate: varRenewalDate,
    MonthEndRenewal: varMonthEnd,
    DaysUntilRenewal: varDaysRemaining,
    Status: If( Today() > varMonthEnd, "Expired", "Active" ),
    Alert: If( varDaysRemaining <= 30 && varDaysRemaining > 0,
        "Renewal due soon",
        ""
    )
}
```

### Scenario 5: Week-Based Task Assignment

```powerfx
// Assign tasks based on ISO week rotation
Set( varCurrentWeek, ISOWeekNum( Today() ) );
Set( varRotation, Mod( varCurrentWeek, 4 ) );

Set( varAssignedTeam,
    Switch( varRotation,
        1, "Team Alpha",
        2, "Team Beta",
        3, "Team Gamma",
        0, "Team Delta"
    )
);

// Display week info
Concatenate(
    "ISO Week ", Text( varCurrentWeek ),
    " - Assigned to ", varAssignedTeam
)
```

---

## Sources

- [Microsoft Learn: Calendar and Clock functions](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-clock-calendar)
- [Microsoft Learn: Date, DateTime, and Time functions](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-date-time)
- [Microsoft Learn: DateValue, TimeValue, and DateTimeValue functions](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-datevalue-timevalue)
- [Microsoft Learn: EDate and EOMonth functions](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-edate-eomonth)
- [Microsoft Learn: WeekNum and ISOWeekNum functions](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-weeknum)
- [Microsoft Learn: DateAdd, DateDiff, and TimeZoneOffset functions](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-dateadd-datediff)
- [Microsoft Learn: Now, Today, IsToday, UTCNow, and UTCToday functions](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-now-today-istoday)
