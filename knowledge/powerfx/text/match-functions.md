# IsMatch, Match, and MatchAll Functions

Pattern matching and text extraction using regular expressions.

---

## Overview

| Function | Returns | Description |
|----------|---------|-------------|
| `IsMatch` | Boolean | Tests if text matches pattern |
| `Match` | Record | Extracts first match |
| `MatchAll` | Table | Extracts all matches |

---

## Syntax

```powerfx
IsMatch( Text, Pattern [, Options ] )
Match( Text, Pattern [, Options ] )
MatchAll( Text, Pattern [, Options ] )
```

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| Text | Yes | Text string to test/match |
| Pattern | Yes | Pattern (must be constant) |
| Options | No | MatchOptions (see below) |

---

## IsMatch Function

Tests whether text matches a pattern.

### Examples

```powerfx
// Simple match
IsMatch( "Hello", "Hello" )                    // true

// Case insensitive
IsMatch( "hello", "HELLO", IgnoreCase )        // true

// Validate email
IsMatch( txtEmail.Text, Match.Email )          // true/false

// Check for digits only
IsMatch( "12345", "\d+" )                      // true

// Validate phone format
IsMatch( "555-1234", "\d{3}-\d{4}" )           // true
```

---

## Match Function

Extracts the first matching text.

### Return Value

Record with columns:
- `FullMatch` - Complete matched text
- `StartMatch` - Starting position (1-indexed)
- Named submatches as columns (from `(?<name>...)`)

### Examples

```powerfx
// Extract first number
Match( "Order 12345 shipped", "\d+" )
// { FullMatch: "12345", StartMatch: 7 }

// Extract email from text
Match(
    "Contact: bob@example.com",
    "(?<email>" & Match.Email & ")"
)
// { email: "bob@example.com", FullMatch: "bob@example.com", StartMatch: 10 }

// Parse duration "PT2H30M"
Match(
    "PT2H30M",
    "PT(?:(?<hours>\d+)H)?(?:(?<minutes>\d+)M)?"
)
// { hours: "2", minutes: "30", FullMatch: "PT2H30M", StartMatch: 1 }
```

---

## MatchAll Function

Extracts all matching text.

### Return Value

Table of records (same structure as Match).

### Examples

```powerfx
// Find all numbers
MatchAll( "Items: 10, 20, 30", "\d+" )
// Table with FullMatch: "10", "20", "30"

// Find all email addresses
MatchAll( TextInput.Text, Match.Email )

// Find all words starting with "A"
MatchAll( "Apple and Avocado are Amazing", "\bA\w+", IgnoreCase )
// Table with FullMatch: "Apple", "and", "Avocado", "are", "Amazing"
```

---

## Predefined Patterns (Match Enum)

| Pattern | Matches | Regex |
|---------|---------|-------|
| `Match.Any` | Any character | `.` |
| `Match.Comma` | Comma | `,` |
| `Match.Digit` | Single digit (0-9) | `\d` |
| `Match.Email` | Email address | Complex pattern |
| `Match.Hyphen` | Hyphen | `-` |
| `Match.LeftParen` | Left parenthesis | `\(` |
| `Match.RightParen` | Right parenthesis | `\)` |
| `Match.Letter` | Single letter | `\p{L}` |
| `Match.MultipleDigits` | One or more digits | `\d+` |
| `Match.MultipleLetters` | One or more letters | `\p{L}+` |
| `Match.MultipleNonSpaces` | One or more non-whitespace | `\S+` |
| `Match.MultipleSpaces` | One or more whitespace | `\s+` |
| `Match.NonSpace` | Single non-whitespace | `\S` |
| `Match.OptionalDigits` | Zero or more digits | `\d*` |
| `Match.OptionalLetters` | Zero or more letters | `\p{L}*` |
| `Match.OptionalNonSpaces` | Zero or more non-whitespace | `\S*` |
| `Match.OptionalSpaces` | Zero or more whitespace | `\s*` |
| `Match.Period` | Period/dot | `\.` |
| `Match.Space` | Whitespace character | `\s` |
| `Match.Tab` | Tab character | `\t` |

---

## Regular Expression Syntax

### Character Classes

| Pattern | Matches |
|---------|---------|
| `\d` | Digit (0-9) |
| `\D` | Non-digit |
| `\w` | Word character (letter, digit, _) |
| `\W` | Non-word character |
| `\s` | Whitespace |
| `\S` | Non-whitespace |
| `.` | Any character (except newline) |
| `[abc]` | Any of a, b, or c |
| `[^abc]` | Not a, b, or c |
| `[a-z]` | Any lowercase letter |

### Quantifiers

| Pattern | Matches |
|---------|---------|
| `*` | Zero or more |
| `+` | One or more |
| `?` | Zero or one (optional) |
| `{n}` | Exactly n times |
| `{n,}` | n or more times |
| `{n,m}` | Between n and m times |

### Anchors

| Pattern | Matches |
|---------|---------|
| `^` | Start of string |
| `$` | End of string |
| `\b` | Word boundary |

### Groups

| Pattern | Description |
|---------|-------------|
| `(...)` | Capturing group |
| `(?<name>...)` | Named capture group |
| `(?:...)` | Non-capturing group |
| `\|` | Alternation (or) |

---

## MatchOptions

Combine options with `&`:

| Option | Description |
|--------|-------------|
| `MatchOptions.Complete` | Match entire string (default for IsMatch) |
| `MatchOptions.Contains` | Match anywhere (default for Match/MatchAll) |
| `MatchOptions.BeginsWith` | Match at start |
| `MatchOptions.EndsWith` | Match at end |
| `MatchOptions.IgnoreCase` | Case-insensitive |
| `MatchOptions.Multiline` | `^`/`$` match line breaks |

### Examples

```powerfx
// Case insensitive match
IsMatch( "Hello", "HELLO", IgnoreCase )

// Combine options
IsMatch( "Hello World", "hello", IgnoreCase & Contains )

// Match at start only
IsMatch( "Hello World", "Hello", BeginsWith )
```

---

## Common Patterns

### Email Validation

```powerfx
IsMatch( txtEmail.Text, Match.Email )
```

### Phone Number (US)

```powerfx
IsMatch( txtPhone.Text, "\d{3}[-.]?\d{3}[-.]?\d{4}" )
// Matches: 555-123-4567, 555.123.4567, 5551234567
```

### ZIP Code

```powerfx
IsMatch( txtZip.Text, "\d{5}(-\d{4})?" )
// Matches: 12345, 12345-6789
```

### URL

```powerfx
IsMatch( txtUrl.Text, "https?://\S+" )
```

### Strong Password

```powerfx
// At least 8 chars, mix of letters and numbers
IsMatch(
    txtPassword.Text,
    "(?!^[0-9]*$)(?!^[a-zA-Z]*$)([a-zA-Z0-9]{8,})"
)
```

---

## Named Capture Groups

Extract specific parts using `(?<name>...)`:

```powerfx
// Parse contact info
With(
    Match(
        "John Doe <john@example.com>",
        "(?<name>[^<]+)<(?<email>[^>]+)>"
    ),
    {
        Name: Trim( name ),
        Email: email
    }
)
// { Name: "John Doe", Email: "john@example.com" }
```

### Parse Date

```powerfx
With(
    Match(
        "2025-03-15",
        "(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})"
    ),
    Date(
        Value( year ),
        Value( month ),
        Value( day )
    )
)
```

---

## Important Limitations

1. **Pattern must be constant** - Cannot use variables
   ```powerfx
   // BAD: Dynamic pattern
   IsMatch( Text, varPattern )

   // GOOD: Constant pattern
   IsMatch( Text, "\d+" )
   ```

2. **Reserved characters need escaping**: `. ? * + ( ) [ ] ^ $ | \`
   ```powerfx
   // Match literal period
   IsMatch( "3.14", "\d+\.\d+" )
   ```

3. **Default behaviors differ**:
   - `IsMatch`: Complete match (entire string)
   - `Match`/`MatchAll`: Contains (anywhere in string)

---

## Common Mistakes

```powerfx
// BAD: Missing escape for special character
IsMatch( "file.txt", "file.txt" )  // . matches any char!

// GOOD: Escape the period
IsMatch( "file.txt", "file\.txt" )

// BAD: Expecting partial match with IsMatch
IsMatch( "Hello World", "Hello" )  // false (Complete default)

// GOOD: Use Contains option
IsMatch( "Hello World", "Hello", Contains )  // true

// BAD: Dynamic pattern
Set( varPattern, "\d+" );
IsMatch( Text, varPattern )  // Won't work

// GOOD: Use constant pattern
IsMatch( Text, "\d+" )
```

---

## Performance Tips

- Use `IsMatch` for validation (faster than Match)
- Use `Split` instead of `MatchAll` when just splitting text
- Named submatches are preferred over numbered ones

---

## Sources

- [Microsoft Learn: IsMatch, Match, MatchAll](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-ismatch)
