# Text Function - Formatting and Conversion

Converts values to formatted text strings.

## Syntax

### Predefined Format

```powerfx
Text( DateTimeValue, DateTimeFormatEnum [, LanguageTag ] )
```

### Custom Format

```powerfx
Text( NumberOrDateTime, FormatString [, LanguageTag ] )
```

### Basic Conversion

```powerfx
Text( AnyValue )
```

---

## Predefined Date/Time Formats

| Format | Example (en-US) | Description |
|--------|-----------------|-------------|
| `DateTimeFormat.LongDate` | "Monday, November 23, 2015" | Full date with weekday |
| `DateTimeFormat.ShortDate` | "11/23/2015" | Numeric date |
| `DateTimeFormat.LongTime` | "2:37:47 PM" | Time with seconds |
| `DateTimeFormat.ShortTime` | "2:37 PM" | Time without seconds |
| `DateTimeFormat.LongDateTime` | "Monday, November 23, 2015 2:37:47 PM" | Full date and time |
| `DateTimeFormat.ShortDateTime` | "11/23/2015 2:37 PM" | Short date and time |
| `DateTimeFormat.LongTime24` | "14:37:47" | 24-hour with seconds |
| `DateTimeFormat.ShortTime24` | "14:37" | 24-hour without seconds |
| `DateTimeFormat.LongDateTime24` | "Monday, November 23, 2015 14:37:47" | Full with 24-hour time |
| `DateTimeFormat.ShortDateTime24` | "11/23/2015 14:37" | Short with 24-hour time |
| `DateTimeFormat.UTC` | "2015-11-23T22:37:47.000Z" | ISO 8601 UTC format |

### Examples

```powerfx
Text( Now(), DateTimeFormat.ShortDate )       // "12/12/2025"
Text( Now(), DateTimeFormat.LongDateTime )    // "Friday, December 12, 2025 2:30:45 PM"
Text( Now(), DateTimeFormat.UTC )             // "2025-12-12T22:30:45.000Z"
```

---

## Custom Date/Time Placeholders

| Placeholder | Description | Example |
|-------------|-------------|---------|
| `d` | Day (no leading zero) | 1-31 |
| `dd` | Day (with leading zero) | 01-31 |
| `ddd` | Day abbreviation | Mon, Tue |
| `dddd` | Full day name | Monday |
| `m` | Month (no leading zero)* | 1-12 |
| `mm` | Month (with leading zero)* | 01-12 |
| `mmm` | Month abbreviation | Jan, Feb |
| `mmmm` | Full month name | January |
| `yy` | 2-digit year | 25 |
| `yyyy` | 4-digit year | 2025 |
| `h` | Hour 12-hr (no zero) | 1-12 |
| `hh` | Hour 12-hr (with zero) | 01-12 |
| `H` | Hour 24-hr (no zero) | 0-23 |
| `HH` | Hour 24-hr (with zero) | 00-23 |
| `m` | Minute (no zero)* | 0-59 |
| `mm` | Minute (with zero)* | 00-59 |
| `s` | Second (no zero) | 0-59 |
| `ss` | Second (with zero) | 00-59 |
| `f`-`fff` | Fractions of second | 0-999 |
| `AM/PM` | AM/PM indicator | AM, PM |
| `am/pm` | Lowercase | am, pm |
| `A/P` | Single letter | A, P |

*Note: `m`/`mm` means month unless it follows `h`/`hh` or precedes `s`/`ss`, then it means minute.

### Examples

```powerfx
Text( Now(), "yyyy-mm-dd" )                   // "2025-12-12"
Text( Now(), "dd/mm/yyyy" )                   // "12/12/2025"
Text( Now(), "mmmm d, yyyy" )                 // "December 12, 2025"
Text( Now(), "dddd, mmmm d" )                 // "Friday, December 12"
Text( Now(), "hh:mm:ss AM/PM" )               // "02:30:45 PM"
Text( Now(), "HH:mm:ss" )                     // "14:30:45"
Text( Now(), "d-mmm-yy" )                     // "12-Dec-25"
```

---

## Number Placeholders

| Placeholder | Description | Example |
|-------------|-------------|---------|
| `0` | Display digit (shows zeros) | 08.90 |
| `#` | Display digit (hides zeros) | 8.9 |
| `.` | Decimal separator | |
| `,` | Thousands separator | |
| `%` | Percentage (multiplies by 100) | |

### Number Format Examples

```powerfx
Text( 1234.5, "#,##0.00" )                    // "1,234.50"
Text( 1234.5, "0.00" )                        // "1234.50"
Text( 8.9, "#.000" )                          // "8.900"
Text( 0.25, "0%" )                            // "25%"
Text( 0.256, "0.0%" )                         // "25.6%"
Text( 1234567, "#,###" )                      // "1,234,567"
Text( 42, "000" )                             // "042"
```

---

## Currency Formatting

```powerfx
// US Dollar
Text( 1234.56, "$#,##0.00" )                  // "$1,234.56"

// Euro (with language tag)
Text( 1234.56, "[$-de-DE]#.##0,00 €" )        // "1.234,56 €"

// Negative currency
Text( -1234.56, "$#,##0.00;($#,##0.00)" )     // "($1,234.56)"
```

---

## Language/Locale Tags

Use `[$-LanguageTag]` in format string for locale-specific formatting.

```powerfx
// French formatting
Text( 1234.56, "[$-fr-FR]# ##0,00 €" )        // "1 234,56 €"

// German date
Text( Today(), "[$-de-DE]d. mmmm yyyy" )      // "12. Dezember 2025"

// Spanish day names
Text( Today(), "dddd", "es-ES" )              // "viernes"
```

### Common Language Tags

| Tag | Language/Region |
|-----|-----------------|
| `en-US` | English (US) |
| `en-GB` | English (UK) |
| `fr-FR` | French |
| `de-DE` | German |
| `es-ES` | Spanish |
| `ja-JP` | Japanese |
| `zh-CN` | Chinese (Simplified) |

---

## Type Conversion

```powerfx
Text( 1234567.89 )                            // "1234567.89"
Text( true )                                  // "true"
Text( false )                                 // "false"
Text( GUID() )                                // "f8b10550-0f12-4f08-..."
Text( Today() )                               // "12/12/2025" (locale default)
Text( Color.Red )                             // "RGBA(255,0,0,1)"
```

---

## Common Patterns

### ISO Date for APIs

```powerfx
Text( Now(), "yyyy-mm-ddThh:mm:ss" )
// "2025-12-12T14:30:45"
```

### Padded Numbers

```powerfx
Text( RecordNumber, "0000" )                  // "0042"
Text( Month( Today() ), "00" )                // "12"
```

### File Timestamp

```powerfx
"Report_" & Text( Now(), "yyyymmdd_hhmmss" ) & ".pdf"
// "Report_20251212_143045.pdf"
```

### Display Blank as Dash

```powerfx
If( IsBlank( Value ), "-", Text( Value, "#,##0" ) )
```

### Ordinal Dates

```powerfx
Text( Day( Today() ) ) &
Switch(
    Mod( Day( Today() ), 10 ),
    1, If( Day( Today() ) <> 11, "st", "th" ),
    2, If( Day( Today() ) <> 12, "nd", "th" ),
    3, If( Day( Today() ) <> 13, "rd", "th" ),
    "th"
) & " " & Text( Today(), "mmmm yyyy" )
// "12th December 2025"
```

---

## Sources

- [Microsoft Learn: Text function](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-text)
