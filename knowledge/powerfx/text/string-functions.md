# String Functions

## Len Function

Returns the length of a text string.

### Syntax

```powerfx
Len( String )
Len( SingleColumnTable )
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| String | Text | String to measure |
| SingleColumnTable | Table | Single-column table of strings |

### Return Type

- Single string: Number
- Table: Single-column table with `Value` column containing lengths

### Rules

1. **Empty string**: Returns 0 for empty strings
2. **Blank**: Returns 0 for blank values
3. **Table input**: Returns table of lengths when given table input

### Examples

```powerfx
Len( "Hello" )                    // 5
Len( "" )                         // 0
Len( TextInput1.Text )            // Length of user input
Len( [ "a", "bb", "ccc" ] )       // Table: { 1, 2, 3 }
```

---

## Left Function

Returns characters from the beginning of a string.

### Syntax

```powerfx
Left( String, NumberOfCharacters )
Left( SingleColumnTable, NumberOfCharacters )
```

### Examples

```powerfx
Left( "Hello World", 5 )          // "Hello"
Left( "Power Apps", 5 )           // "Power"
Left( Phone, 3 )                  // Area code (first 3 digits)
```

---

## Right Function

Returns characters from the end of a string.

### Syntax

```powerfx
Right( String, NumberOfCharacters )
Right( SingleColumnTable, NumberOfCharacters )
```

### Examples

```powerfx
Right( "Hello World", 5 )         // "World"
Right( Phone, 4 )                 // Last 4 digits
Right( "12345", 2 )               // "45"
```

---

## Mid Function

Returns characters from the middle of a string.

### Syntax

```powerfx
Mid( String, StartingPosition, NumberOfCharacters )
Mid( SingleColumnTable, StartingPosition, NumberOfCharacters )
```

### Rules

1. **1-based indexing**: First character is position 1
2. **Exceeds length**: Returns available characters if request exceeds string length

### Examples

```powerfx
Mid( "Hello World", 1, 5 )        // "Hello"
Mid( "Hello World", 7, 5 )        // "World"
Mid( "123-456-7890", 5, 3 )       // "456"
Mid( SSN, 1, 3 )                  // First 3 digits of SSN
```

---

## Trim and TrimEnds Functions

Remove extra spaces from text.

### Syntax

```powerfx
Trim( String )           // Removes leading, trailing, AND internal extra spaces
TrimEnds( String )       // Removes leading and trailing spaces only
```

### Difference

| Function | Input | Output |
|----------|-------|--------|
| Trim | "  Hello   World  " | "Hello World" |
| TrimEnds | "  Hello   World  " | "Hello   World" |

### Examples

```powerfx
Trim( "  Hello  World  " )        // "Hello World"
TrimEnds( "  Hello  World  " )    // "Hello  World"
Trim( UserInput.Text )            // Clean user input
```

---

## Upper, Lower, Proper Functions

Change text case.

### Syntax

```powerfx
Upper( String )     // ALL UPPERCASE
Lower( String )     // all lowercase
Proper( String )    // Title Case
```

### Examples

```powerfx
Upper( "hello" )                  // "HELLO"
Lower( "HELLO" )                  // "hello"
Proper( "hello world" )           // "Hello World"
Proper( "mcdonald" )              // "Mcdonald" (not McDonald)
```

---

## Substitute and Replace Functions

Replace parts of strings.

### Syntax

```powerfx
Substitute( String, OldString, NewString [, InstanceNum ] )
Replace( String, StartingPosition, NumberOfChars, NewString )
```

### Difference

| Function | Use Case |
|----------|----------|
| Substitute | Replace by matching text |
| Replace | Replace by position |

### Examples

```powerfx
// Substitute - by text match
Substitute( "Hello World", "World", "Universe" )    // "Hello Universe"
Substitute( "aaa", "a", "b" )                       // "bbb" (all instances)
Substitute( "aaa", "a", "b", 2 )                    // "aba" (2nd instance only)

// Replace - by position
Replace( "Hello World", 7, 5, "Universe" )          // "Hello Universe"
Replace( "123-456-7890", 1, 3, "555" )              // "555-456-7890"
```

---

## Find Function

Finds position of one string within another.

### Syntax

```powerfx
Find( FindString, WithinString [, StartingPosition ] )
```

### Rules

1. **Case-sensitive**: Find is case-sensitive
2. **Not found**: Returns blank if not found
3. **1-based**: Returns 1-based position

### Examples

```powerfx
Find( "World", "Hello World" )        // 7
Find( "world", "Hello World" )        // blank (case-sensitive)
Find( "@", "user@email.com" )         // 5
Find( "x", "Hello" )                  // blank
```

---

## StartsWith and EndsWith Functions

Check string beginning or ending.

### Syntax

```powerfx
StartsWith( Text, StartText )
EndsWith( Text, EndText )
```

### Rules

1. **Case-insensitive**: Both functions are case-insensitive
2. **Empty string**: Returns true if search text is empty
3. **Delegable**: StartsWith is delegable for many data sources

### Examples

```powerfx
StartsWith( "Hello World", "Hello" )      // true
StartsWith( "Hello World", "hello" )      // true (case-insensitive)
EndsWith( "Hello World", "World" )        // true
EndsWith( "file.pdf", ".pdf" )            // true

// Delegable filter pattern
Filter( Customers, StartsWith( Name, SearchBox.Text ) )
```

---

## Split Function

Splits a string into a table of substrings.

### Syntax

```powerfx
Split( Text, Separator )
```

### Return Type

Single-column table with `Value` column.

### Examples

```powerfx
Split( "a,b,c", "," )                     // Table: "a", "b", "c"
Split( "Hello World", " " )               // Table: "Hello", "World"
Split( Tags, ";" )                        // Split semicolon-separated tags

// Access specific part
Index( Split( "a,b,c", "," ), 2 ).Value   // "b"
First( Split( FullName, " " ) ).Value     // First name
Last( Split( FullName, " " ) ).Value      // Last name
```

---

## Common Patterns

### Extract Domain from Email

```powerfx
Mid(
    Email,
    Find( "@", Email ) + 1,
    Len( Email ) - Find( "@", Email )
)
```

### Format Phone Number

```powerfx
"(" & Left( Phone, 3 ) & ") " & Mid( Phone, 4, 3 ) & "-" & Right( Phone, 4 )
```

### Get File Extension

```powerfx
Right( FileName, Len( FileName ) - Find( ".", FileName ) )
// Or using Split:
Last( Split( FileName, "." ) ).Value
```

### Truncate with Ellipsis

```powerfx
If( Len( Text ) > 50, Left( Text, 47 ) & "...", Text )
```

---

## Sources

- [Microsoft Learn: Text functions](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-len)
