# Text Encoding and Processing Functions

Char, UniChar, EncodeHTML, EncodeUrl, EndsWith, HashTags, PlainText - Character encoding, URL/HTML encoding, and text processing functions.

---

## Char Function

Converts a numeric character code to its corresponding character.

### Syntax

```powerfx
Char( CharacterCode )
Char( CharacterCodeTable )
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| CharacterCode | Number | ASCII character code (0-127, extended to 255) |
| CharacterCodeTable | Single-column Table | Table of ASCII codes to translate |

### Return Value

- Single number input: Text string containing the single character represented by the code
- Single-column table input: Single-column table with results in a `Value` column

### Examples

```powerfx
// Basic ASCII characters
Char( 65 )         // "A"
Char( 97 )         // "a"
Char( 32 )         // Space character
Char( 48 )         // "0"
Char( 57 )         // "9"

// Special characters
Char( 33 )         // "!"
Char( 63 )         // "?"
Char( 64 )         // "@"
Char( 35 )         // "#"

// Control characters
Char( 9 )          // Tab
Char( 10 )         // Line feed (newline)
Char( 13 )         // Carriage return

// Common symbols
Char( 36 )         // "$"
Char( 37 )         // "%"
Char( 42 )         // "*"
Char( 43 )         // "+"
Char( 45 )         // "-"
Char( 47 )         // "/"
Char( 58 )         // ":"
Char( 59 )         // ";"
Char( 61 )         // "="

// Building strings with special formatting
Concatenate( "Hello", Char( 10 ), "World" )  // Multi-line string

// Table input examples
Char( [65, 105] )         // Single-column table: "A", "i"
Char( [35, 52] )          // Single-column table: "#", "4"
```

### Common Use Cases

- Building formatted strings with special characters
- Creating line breaks in text (Char(10) for LF, Char(13) for CR)
- Inserting tab characters for alignment
- Generating control characters for data processing
- Creating currency or symbol-based strings
- Building dynamic HTML/XML with special characters

### Notes

- Supports ASCII character codes (0-127, extended to 255)
- For Unicode characters beyond 255, use UniChar function
- Char(10) and Char(13) are useful for multi-line text boxes
- Some control characters (0-31) have special meanings and may appear as small squares (non-printable)
- Can accept single-column table as input, returning a table of results

### Related Functions

- `UniChar` - For Unicode characters
- `Code` - Returns the character code (reverse of Char)
- `Concatenate` - Combine text with special characters

---

## UniChar Function

Converts a numeric Unicode code point to its corresponding character.

### Syntax

```powerfx
UniChar( UnicodeCode )
UniChar( UnicodeCodeTable )
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| UnicodeCode | Number | Unicode code point (full Unicode range supported) |
| UnicodeCodeTable | Single-column Table | Table of Unicode codes to translate |

### Return Value

- Single number input: Text string containing the single character represented by the Unicode code point
- Single-column table input: Single-column table with results in a `Value` column

### Examples

```powerfx
// Basic Latin (same as Char)
UniChar( 65 )         // "A"
UniChar( 97 )         // "a"

// Extended Latin
UniChar( 225 )        // "á"
UniChar( 233 )        // "é"
UniChar( 241 )        // "ñ"
UniChar( 252 )        // "ü"

// Greek characters
UniChar( 913 )        // "Α" (Greek Alpha)
UniChar( 945 )        // "α" (Greek alpha)
UniChar( 977 )        // "β" (Greek beta)

// Cyrillic characters
UniChar( 1040 )       // "А" (Cyrillic A)
UniChar( 1072 )       // "а" (Cyrillic a)

// Arabic characters
UniChar( 1575 )       // "ا" (Arabic Alef)
UniChar( 1576 )       // "ب" (Arabic Beh)

// CJK (Chinese, Japanese, Korean) characters
UniChar( 20013 )      // "中" (Chinese for "middle")
UniChar( 26085 )      // "日" (Japanese/Chinese for "day")
UniChar( 54620 )      // "한" (Korean "han")

// Emoji and symbols
UniChar( 128512 )     // "😀" (Grinning face)
UniChar( 128526 )     // "😎" (Smiling face with sunglasses)
UniChar( 9829 )       // "♥" (Heart symbol)
UniChar( 9733 )       // "★" (Star)

// Mathematical symbols
UniChar( 8721 )       // "∑" (Summation)
UniChar( 8734 )       // "∞" (Infinity)
UniChar( 8730 )       // "√" (Square root)

// Building multilingual strings
Concatenate( "Hello ", UniChar( 4698 ) )  // "Hello ท" (Thai consonant)
Concatenate( UniChar( 20013 ), UniChar( 25991 ) )  // "中文" (Chinese for "Chinese language")

// Table input examples
UniChar( [71, 97, 114, 231, 111, 110] )  // Single-column table: "G", "a", "r", "ç", "o", "n"
UniChar( [9829, 9733] )                   // Single-column table: "♥", "★"
```

### Common Use Cases

- Displaying international characters without typing them directly
- Building multilingual UI elements
- Creating mathematical or scientific notation
- Inserting emoji and symbols
- Generating currency symbols from different locales
- Building character maps or language references
- Working with special Unicode symbols

### Notes

- Supports full Unicode range (all Unicode characters)
- Can represent emoji, symbols, and international characters
- More versatile than Char function for non-ASCII characters
- Unicode code points can be found online or in Unicode documentation
- Some characters may not display correctly depending on font support
- Can accept single-column table as input, returning a table of results
- Not supported in Dataverse formula columns (unlike Char)

### Common Unicode Ranges

| Range | Description | Example |
|-------|-------------|---------|
| 0-127 | ASCII | A, B, C |
| 128-255 | Extended Latin | á, é, ñ, ü |
| 256-383 | Latin Extended-A | Ā, ā, Ă, ă |
| 384-591 | Latin Extended-B | ƀ, ƁƂ, ƃ |
| 880-1023 | Greek | Α, β, γ, δ |
| 1024-1279 | Cyrillic | А, Б, В, а |
| 1280-1327 | Georgian | ა, ბ, გ |
| 1536-1791 | Arabic | ا, ب, ت |
| 8192-8303 | General Punctuation | –, —, ', ', ", " |
| 9472-9679 | Box Drawing | ─, │, ├, ┤ |
| 9728-9983 | Dingbats | ✀, ✁, ✂ |
| 128000-128767 | Emoticons & Emoji | 😀, 😎, 🎉 |

### Related Functions

- `Char` - For ASCII characters (0-255)
- Code functions - Returns character codes (reverse operations)

---

## EncodeHTML Function

Encodes special characters in text to HTML entities for safe HTML display.

### Syntax

```powerfx
EncodeHTML( String )
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| String | Text | String to HTML-encode (Required) |

### Return Value

Text with special characters converted to HTML entities (encoded string).

### Examples

```powerfx
// Basic HTML entities
EncodeHTML( "Hello & goodbye" )           // "Hello &amp; goodbye"
EncodeHTML( "5 < 10" )                   // "5 &lt; 10"
EncodeHTML( "10 > 5" )                   // "10 &gt; 5"

// Combining multiple special characters
EncodeHTML( "Bread & Butter" )           // "Bread &amp; Butter"
EncodeHTML( "A < B & B > C" )            // "A &lt; B &amp; B &gt; C"

// HTML tags (encoded for safe display)
EncodeHTML( "<script>alert('xss')</script>" )
// "&lt;script&gt;alert('xss')&lt;/script&gt;"

// URLs with special characters
EncodeHTML( "https://example.com?param=1&other=2" )
// "https://example.com?param=1&amp;other=2"

// User input with HTML-like content
EncodeHTML( "<b>Important</b>" )         // "&lt;b&gt;Important&lt;/b&gt;"
EncodeHTML( "50% off & free shipping!" ) // "50% off &amp; free shipping!"

// Form input display
EncodeHTML( FirstName.Value )            // Safe to display in HTML context
```

### Common Use Cases

- Safely displaying user input in HTML labels or text boxes
- Preventing XSS (Cross-Site Scripting) attacks
- Preparing text for HTML output or export
- Encoding special characters in data that will be rendered as HTML
- Converting user-entered text for safe web display
- Building HTML content with untrusted data
- Encoding attribute values for HTML elements

### HTML Entity Reference

| Character | Entity | Notes |
|-----------|--------|-------|
| & | `&amp;` | Ampersand |
| < | `&lt;` | Less than |
| > | `&gt;` | Greater than |

### Security Notes

- Use EncodeHTML when displaying user-generated content
- Encoding prevents scripts from executing
- Always encode untrusted input before displaying
- XSS protection is critical for web applications
- Encoding is lossy for display purposes only

### Related Functions

- `EncodeUrl` - For URL encoding
- `PlainText` - Removes HTML/XML tags

---

## EncodeUrl Function

Encodes special characters in text for use in URLs using percent-encoding.

### Syntax

```powerfx
EncodeUrl( String )
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| String | Text | String to URL-encode (Required) |

### Return Value

Text with special nonalphanumeric characters converted to percent-encoded format (% and hexadecimal number).

### Examples

```powerfx
// Basic URL encoding
EncodeUrl( "hello world" )                  // "hello%20world"
EncodeUrl( "user@email.com" )              // "user%40email.com"
EncodeUrl( "path/to/file" )                // "path%2Fto%2Ffile"
EncodeUrl( "100%" )                        // "100%25"

// Query parameters
EncodeUrl( "coffee & tea" )                // "coffee%20%26%20tea"
EncodeUrl( "price=$100" )                  // "price%3D%24100"

// Search terms with special characters
EncodeUrl( "C++ Programming" )             // "C%2B%2B%20Programming"
EncodeUrl( "what?" )                       // "what%3F"
EncodeUrl( "hello!" )                      // "hello%21"

// Building query strings
Concatenate(
    "https://search.example.com?q=",
    EncodeUrl( SearchBox.Value )
)
// If SearchBox contains "Power Apps", result is:
// "https://search.example.com?q=Power%20Apps"

// Email in URL parameter
Concatenate(
    "https://api.example.com/notify?email=",
    EncodeUrl( "user@company.com" )
)
// "https://api.example.com/notify?email=user%40company.com"

// File path with spaces
Concatenate(
    "https://documents.example.com/files/",
    EncodeUrl( "My Document.pdf" )
)
// "https://documents.example.com/files/My%20Document.pdf"

// Building navigation URLs
Navigate(
    Concatenate(
        Screen2,
        "?name=" & EncodeUrl( NameInput.Value )
    ),
    ScreenTransition.None
)
```

### Common URL Encoding Reference

| Character | Encoded | Notes |
|-----------|---------|-------|
| Space | %20 | Most common encoding |
| ! | %21 | |
| # | %23 | Fragment identifier |
| $ | %24 | |
| % | %25 | |
| & | %26 | Parameter separator |
| ( | %28 | |
| ) | %29 | |
| * | %2A | |
| + | %2B | Alternative space encoding |
| , | %2C | |
| / | %2F | Path separator |
| : | %3A | Protocol separator |
| ; | %3B | Parameter separator |
| = | %3D | Parameter assignment |
| ? | %3F | Query string start |
| @ | %40 | User info separator |
| [ | %5B | |
| ] | %5D | |
| { | %7B | |
| } | %7D | |

### Common Use Cases

- Building query parameters for web APIs
- Encoding search terms for URLs
- Creating email addresses in URL parameters
- Encoding file paths or document names in URLs
- Preparing data for HTTP requests
- Building navigation URLs with parameters
- Encoding special characters in REST API calls

### Notes

- Encodes nonalphanumeric characters with % and hexadecimal number
- Use EncodeUrl for parameter values, not for the entire URL structure
- Some services may have additional encoding requirements
- Always encode user input before including in URLs
- Particularly useful when building dynamic URLs with user-provided data

### Related Functions

- `EncodeHTML` - For HTML encoding
- `Concatenate` - Often used with EncodeUrl for URL building

---

## EndsWith Function

Tests whether a text string ends with another text string.

### Syntax

```powerfx
EndsWith( Text, EndText )
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| Text | Text | The text to test (Required) |
| EndText | Text | The text to search for at the end of Text (Required) |

### Return Value

Boolean: `true` if Text ends with EndText, `false` otherwise. Returns `true` if EndText is an empty string.

### Examples

```powerfx
// Basic file extension checking
EndsWith( "Document.pdf", ".pdf" )         // true
EndsWith( "Image.jpg", ".pdf" )            // false
EndsWith( "Spreadsheet.xlsx", ".xlsx" )   // true

// Case-insensitive matching (default behavior with supported datasources)
EndsWith( "HELLO", "lo" )                  // true (case-insensitive)
EndsWith( "Good bye", "BYE" )              // true (case-insensitive)

// Email validation (partial)
EndsWith( "user@example.com", "@example.com" )  // true
EndsWith( UserInput.Value, ".com" )             // Check if valid domain

// URL checking
EndsWith( TextInput.Value, ".pdf" )        // Check if PDF link
EndsWith( "https://example.com", ".com" ) // true

// Phone number format
EndsWith( PhoneNumber.Value, "000" )       // Check if ends with specific digits

// User ID or code validation
EndsWith( EmployeeID.Value, "-ACTIVE" )   // Check status suffix

// Filtering in galleries
Filter(
    DataSource,
    EndsWith( Email, "@company.com" )
)  // Find all company email addresses

// Conditional formatting
If(
    EndsWith( FileName.Value, ".exe" ),
    Color.Red,  // Warn about executable
    Color.Green
)

// Multiple condition checking
Or(
    EndsWith( FileType, ".pdf" ),
    EndsWith( FileType, ".docx" ),
    EndsWith( FileType, ".xlsx" )
) // Check if any document type

// Empty string behavior
EndsWith( "Any text", "" )             // true (empty string always matches)

// Removing suffix pattern check
If(
    EndsWith( Status.Value, "-EXPIRED" ),
    Substitute( Status.Value, "-EXPIRED", "" ),
    Status.Value
)
```

### Common Use Cases

- Validating file extensions
- Checking email domain suffixes
- Validating URL formats
- Pattern matching for status codes or IDs
- Filtering records by suffix patterns
- Conditional logic based on string endings
- Input validation for forms
- Building dynamic file type checks

### Notes

- **Case-insensitive** by default when back-end datasource supports it (Collections, Dataverse, SharePoint, SQL Server)
- Oracle datasource does not support case insensitivity by default
- Returns `true` if EndText is an empty string (useful for Filter expressions)
- Useful for validation and filtering
- Works with any text string, not just file extensions
- May show delegation warning if function cannot be delegated to datasource

### Related Functions

- `StartsWith` - Check string beginning
- `Search` - Multi-column search alternative
- `in operator` - Search anywhere within text
- `Filter` - Combine with EndsWith for data filtering

---

## HashTags Function

Extracts hashtags (#strings) from a text string.

### Syntax

```powerfx
HashTags( String )
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| String | Text | The text string to scan for hashtags (Required) |

### Return Value

One-column table containing all hashtags found (without the # symbol). Returns an empty table if no hashtags are present.

### Examples

```powerfx
// Basic hashtag extraction
HashTags( "I love #PowerApps and #PowerFx" )
// Returns table: { Value: "PowerApps" }, { Value: "PowerFx" }

// Hashtag with numbers
HashTags( "Check out #SharePoint2024" )
// Returns: { Value: "SharePoint2024" }

// Hashtags with underscores and currency symbols
HashTags( "This #app is #AMAZING and can #coUnt123 or #123abc" )
// Returns: { Value: "app" }, { Value: "AMAZING" }, { Value: "coUnt123" }, { Value: "123abc" }

// Hashtags stop at invalid characters (hyphen not allowed)
HashTags( "#1-23" )
// Returns: { Value: "1" } (stops at hyphen)

// No hashtags
HashTags( "This text has no hashtags" )
// Returns empty table

// Special characters and symbols (not allowed)
HashTags( "#$*(#@\")" )
// Returns empty table (no valid hashtag characters after #)

// Social media content parsing
HashTags( TextInput1.Value )  // Extract from user input

// Displaying extracted hashtags
ForAll(
    HashTags( FeedPost.Content ),
    Concatenate( "#", Value )
)
// Reconstructs hashtags with # symbol

// Filtering gallery to show posts with specific tag
Filter(
    SocialPosts,
    Value in ForAll( HashTags( Content ), Value )
)

// Creating clickable hashtag links
Concatenate(
    "https://twitter.com/search?q=",
    EncodeUrl( "#" & FirstN( HashTags( PostText ), 1 ).Value )
)

// Storing extracted hashtags in collection
ClearCollect(
    TagCollection,
    ForAll(
        HashTags( PostText.Value ),
        { Tag: "#" & Value }
    )
)

// Counting hashtags in a post
CountRows( HashTags( PostContent ) )

// Validating hashtag format
Filter(
    HashTags( UserPost.Value ),
    Len( Value ) > 2  // Only tags longer than 2 characters
)
```


### Common Use Cases

- Extracting hashtags from social media posts
- Parsing user-generated content for tags
- Creating tag clouds or tag analytics
- Validating hashtag format in content
- Organizing posts by hashtags
- Building hashtag-based search functionality
- Content moderation and filtering
- Analytics on trending hashtags

### Hashtag Parsing Rules

HashTags are identified by:
- **Starting character:** # (pound/hash symbol)
- **Valid characters:** Uppercase and lowercase letters (A-Z, a-z), numerals (0-9), underscores (_), currency symbols ($)
- **Invalid characters:** Hyphens (-), special characters like `*(@")`
- When a hashtag encounters an invalid character, extraction stops at that point

### Notes

- Returns hashtags **without** the # symbol
- Returns one-column table with column named "Value"
- Empty table if no hashtags found
- Case-sensitive in returned values
- Numbers can be part of hashtags
- **Not supported** in Dataverse formula columns

### Related Functions

- `Filter` - To filter hashtags by criteria
- `ForAll` - To process each hashtag
- `Concatenate` - To reconstruct with # symbol
- `EncodeUrl` - For URL encoding hashtags

---

## PlainText Function

Removes HTML and XML tags from a text string, converting certain tags to appropriate symbols.

### Syntax

```powerfx
PlainText( String )
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| String | Text | String from which HTML and XML tags are stripped (Required) |

### Return Value

Text with HTML/XML tags removed. Converts certain HTML entities to symbols (`&nbsp;` to space, `&quot;` to `"`).

### Examples

```powerfx
// Basic HTML removal
PlainText( "<b>Hello</b> World" )                  // "Hello World"
PlainText( "<p>This is a paragraph</p>" )          // "This is a paragraph"
PlainText( "<div>Content</div>" )                  // "Content"

// Multiple tags
PlainText( "<h1>Title</h1><p>Body text</p>" )
// "TitleBody text"

// Nested HTML
PlainText( "<div><span>Nested</span> content</div>" )
// "Nested content"

// HTML with attributes (attributes are ignored)
PlainText( "<p class='text' id='para1'>Content</p>" )
// "Content"

// Links
PlainText( "<a href='http://example.com'>Click here</a>" )
// "Click here"

// HTML entities (some are converted)
PlainText( "We have done an unusually&nbsp;&quot;deep&quot; work" )
// "We have done an unusually "deep" work"
// (&nbsp; converts to space, &quot; converts to ")

// Line breaks and formatting
PlainText( "<p>Line 1</p><p>Line 2</p>" )
// "Line 1Line 2" (no new lines added)

// Complex HTML document
PlainText(
    "<html><head><title>Page</title></head><body><h1>Header</h1><p>Text</p></body></html>"
)
// "PageHeaderText"

// Rich text from SharePoint
PlainText( RichTextField )  // Extract plain text from rich column

// Removing formatting tags
PlainText( "<b>Bold</b> and <i>italic</i> text" )
// "Bold and italic text"

// Script tags (completely removed)
PlainText( "<script>alert('xss')</script>Safe text" )
// "Safe text"

// Style tags and CSS
PlainText( "<style>body{color:red}</style>Visible content" )
// "Visible content"

// Cleaning user-provided HTML
PlainText( HtmlInput.Value )  // Sanitize input for display

// Extracting text from SharePoint HTML field
ForAll(
    DataSource,
    {
        PlainContent: PlainText( HtmlContent ),
        Original: HtmlContent
    }
)

// Displaying preview of HTML content (first 100 chars)
Left(
    PlainText( ArticleBody ),
    100
) & "..."

// Checking if content exists after removing tags
If(
    Len( PlainText( RichText ) ) > 0,
    "Content present",
    "Empty after removing tags"
)
```

### Tag Handling

| Tag Type | Example | Result |
|----------|---------|--------|
| Paragraph | `<p>Text</p>` | Removes `<p>` tags, keeps "Text" |
| Emphasis | `<b>Bold</b>` | Removes tags, keeps "Bold" |
| Headers | `<h1>Title</h1>` | Removes tags, keeps "Title" |
| Links | `<a href="...">Text</a>` | Keeps "Text", removes link tag |
| Line breaks | `<br>` `<br/>` | Removes tags |
| Dividers | `<hr>` | Removes tags |
| Lists | `<li>Item</li>` | Keeps item text, removes tags |
| Scripts | `<script>...</script>` | Removes completely |
| Styles | `<style>...</style>` | Removes completely |
| Comments | `<!-- comment -->` | Removes completely |

### Common Use Cases

- Extracting plain text from HTML-rich fields
- Removing formatting from rich text editors
- Creating text previews from HTML content
- Text-only export of formatted content
- Sanitizing HTML content for plain text display
- Converting SharePoint rich text to plain text
- Extracting data from web scraping results
- Text analysis on HTML-formatted content
- Creating summaries from formatted text

### Notes

- Removes HTML and XML tags from strings
- **Converts some HTML entities:** `&nbsp;` → space, `&quot;` → `"`
- **Does NOT** remove all HTML and XML tags (has limitations)
- Does NOT add line breaks between removed tags
- All tag attributes are removed with the tags
- Script and style content are completely removed
- Result is plain text only, no formatting preserved
- Can significantly reduce text length due to tag removal
- Useful for displaying RSS feeds or user-generated content in labels

### Combining with Other Functions

```powerfx
// Get plain text preview (first 150 chars)
Left( PlainText( RichContent ), 150 ) & "..."

// Count words in HTML content
CountA( Split( PlainText( ArticleBody ), " " ) )

// Search in HTML content
Contains( Lower( PlainText( PageContent ) ), Lower( SearchTerm ) )
```

### Related Functions

- `EncodeHTML` - Opposite operation (encode to HTML entities)
- `EncodeUrl` - For URL encoding
- `Left`, `Right` - For extracting text portions
- `Contains` - For searching in plain text

---

## Common Patterns

### URL and HTML Safe Display Pattern

```powerfx
// Safe display in label from user input
Label1.Text:
    PlainText( UserInput.Value )  // Remove HTML tags first

Label2.Text:
    EncodeHTML( PlainText( UserInput.Value ) )  // Remove tags AND encode entities
```

### Hashtag Processing Pattern

```powerfx
// Extract and process hashtags
ClearCollect(
    ExtractedTags,
    ForAll(
        HashTags( PostText ),
        {
            Tag: Value,
            SearchUrl: Concatenate(
                "https://twitter.com/search?q=",
                EncodeUrl( "#" & Value )
            )
        }
    )
)
```

### File Type Validation Pattern

```powerfx
// Validate file extension
If(
    Or(
        EndsWith( FileName, ".pdf" ),
        EndsWith( FileName, ".docx" ),
        EndsWith( FileName, ".xlsx" )
    ),
    "Valid file",
    "Invalid file type"
)
```

### Character Building Pattern

```powerfx
// Build formatted text with special characters
Concatenate(
    "Name: ", FirstName,
    Char( 10 ),  // Line break
    "Email: ", Email,
    Char( 10 ),
    "Country: ", Country
)
```

### Multilingual Content Pattern

```powerfx
// Support multiple languages with Unicode
Switch(
    Language,
    "en", "Hello",
    "es", "Hola",
    "fr", "Bonjour",
    "zh", UniChar( 20320 ),  // 你 (nǐ - you in Chinese)
    "ja", UniChar( 12371 ),  // あ (a in Japanese)
    "ar", UniChar( 1605 ),   // م (meem in Arabic)
    "Hello"
)
```

---

## Character Code Quick References

### Common ASCII Codes

| Code | Character | Code | Character | Code | Character |
|------|-----------|------|-----------|------|-----------|
| 9 | Tab | 32 | Space | 48-57 | 0-9 |
| 10 | Line Feed (LF) | 33 | ! | 65-90 | A-Z |
| 13 | Carriage Return (CR) | 46 | . | 97-122 | a-z |
| 32 | Space | 45 | - | 95 | _ |

### Common Unicode Categories

| Range | Category | Examples |
|-------|----------|----------|
| 0-127 | ASCII | Letters, numbers, punctuation |
| 128-255 | Latin-1 Supplement | Accented characters |
| 256-383 | Latin Extended-A | Additional Latin variants |
| 880-1023 | Greek | Greek alphabet |
| 1024-1279 | Cyrillic | Russian, Ukrainian, Serbian |
| 1536-1791 | Arabic | Arabic script |
| 4096-4255 | Georgian | Georgian script |
| 8192-8303 | General Punctuation | Dashes, quotes, ellipsis |
| 9472-9679 | Box Drawing | Lines and corners |
| 128000-128767 | Emoji | Faces, symbols, objects |

---

## Sources

- [Char and UniChar functions - Microsoft Learn](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-char)
- [EncodeHTML, EncodeUrl, and PlainText functions - Microsoft Learn](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-encode-decode)
- [EndsWith and StartsWith functions - Microsoft Learn](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-startswith)
- [HashTags function - Microsoft Learn](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-hashtags)
