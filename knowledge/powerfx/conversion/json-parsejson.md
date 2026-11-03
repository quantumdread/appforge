# JSON and ParseJSON Functions

Convert between Power Apps data and JSON text.

---

## JSON Function

Converts tables, records, or values to JSON text.

### Syntax

```powerfx
JSON( DataStructure [, Format ] )
```

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| DataStructure | Yes | Table, record, or value to convert |
| Format | No | JSONFormat enum (default: Compact) |

---

### JSONFormat Options

Combine multiple with `&` operator.

| Format | Description |
|--------|-------------|
| `JSONFormat.Compact` | Default. No whitespace |
| `JSONFormat.IndentFour` | Readable with 4-space indent |
| `JSONFormat.FlattenValueTables` | `[1,2,3]` instead of `[{"Value":1}...]` |
| `JSONFormat.IncludeBinaryData` | Include images as base64 |
| `JSONFormat.IgnoreBinaryData` | Exclude binary columns |
| `JSONFormat.IgnoreUnsupportedTypes` | Skip unsupported types |

### Examples

```powerfx
// Simple record
JSON( { Name: "John", Age: 30 } )
// {"Name":"John","Age":30}

// Formatted output
JSON( MyRecord, JSONFormat.IndentFour )

// Flatten simple arrays
JSON( [1, 2, 3], JSONFormat.FlattenValueTables )
// [1,2,3] instead of [{"Value":1},{"Value":2},{"Value":3}]

// Include images
JSON( ProductWithImage, JSONFormat.IncludeBinaryData )

// Combine formats
JSON( Data, JSONFormat.IndentFour & JSONFormat.IgnoreBinaryData )
```

---

### Data Type Conversions

| Type | JSON Output |
|------|-------------|
| Boolean | `true` / `false` |
| Number | `1.345` |
| Text | `"string"` |
| Date | `"2025-12-12"` (ISO 8601) |
| DateTime | `"2025-12-12T14:30:00.000Z"` (UTC) |
| Time | `"14:30:00.000"` |
| GUID | `"751b58ac-..."` |
| Color | `"#102030ff"` |
| Record | `{ "Field": "Value" }` |
| Table | `[ { "Field": "Value" }, ... ]` |

---

### Common Patterns

```powerfx
// Send to API
Set( varJSON, JSON( SubmitData ) );
MyConnector.PostData( varJSON )

// Store in text field
Patch( Records, ThisItem, { JSONData: JSON( FormData ) } )

// Select specific columns
JSON( ShowColumns( Data, ID, Name ) )

// Exclude sensitive data
JSON( DropColumns( UserData, Password, SSN ) )
```

---

## ParseJSON Function

Converts JSON text to usable data.

### Syntax

```powerfx
ParseJSON( JSONString [, Type ] )
```

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| JSONString | Yes | JSON text to parse |
| Type | No | (Experimental) Type definition |

---

### Accessing Values

ParseJSON returns "dynamic" values - must convert to specific types.

```powerfx
// Given: { "name": "John", "age": 30, "active": true }

Text( ParseJSON( jsonStr ).name )           // "John"
Value( ParseJSON( jsonStr ).age )           // 30
Boolean( ParseJSON( jsonStr ).active )      // true
```

### Type Conversion Functions

| Target Type | Function |
|-------------|----------|
| Text | `Text( )` |
| Number | `Value( )` |
| Boolean | `Boolean( )` |
| Date | `DateValue( )` |
| DateTime | `DateTimeValue( )` |
| GUID | `GUID( )` |

---

### Nested Objects

```powerfx
// Given: { "user": { "profile": { "name": "John" } } }

Text( ParseJSON( jsonStr ).user.profile.name )
```

### Special Field Names

Use quotes for invalid identifiers:

```powerfx
// Given: { "first-name": "John", "2nd": "value" }

Text( ParseJSON( jsonStr ).'first-name' )
Text( ParseJSON( jsonStr ).'2nd' )
```

---

### Arrays

```powerfx
// Given: { "items": [1, 2, 3] }

// Access by index (1-based)
Value( Index( ParseJSON( jsonStr ).items, 1 ) )    // 1

// Convert to table
ForAll( ParseJSON( jsonStr ).items,
    { Number: Value( ThisRecord ) }
)
```

### Array of Objects

```powerfx
// Given: { "users": [{ "id": 1, "name": "John" }, { "id": 2, "name": "Jane" }] }

ForAll( ParseJSON( jsonStr ).users,
    {
        ID: Value( ThisRecord.id ),
        Name: Text( ThisRecord.name )
    }
)
```

---

### Null/Blank Handling

```powerfx
// Missing fields return Blank
IsBlank( ParseJSON( "{}" ).missing )            // true

// JSON null is Blank
IsBlank( ParseJSON( "{ \"val\": null }" ).val ) // true

// Safe access with Coalesce
Coalesce( Text( ParseJSON( jsonStr ).optional ), "default" )
```

---

### Common Patterns

#### API Response Handling

```powerfx
Set( varResponse, MyConnector.GetData() );
ClearCollect( colUsers,
    ForAll( ParseJSON( varResponse ).data,
        {
            ID: Value( ThisRecord.id ),
            Name: Text( ThisRecord.name ),
            Email: Text( ThisRecord.email )
        }
    )
)
```

#### Configuration from JSON

```powerfx
Set( varConfig, ParseJSON( ConfigText ) );
Set( varTheme, Text( varConfig.theme ) );
Set( varMaxItems, Value( varConfig.maxItems ) );
```

#### Error Response Parsing

```powerfx
IfError(
    ParseJSON( Response ).data,
    Notify( Text( ParseJSON( Response ).error.message ) )
)
```

---

### Round-Trip Example

```powerfx
// Original data
Set( varOriginal, { Name: "Test", Count: 42 } );

// Convert to JSON
Set( varJSON, JSON( varOriginal ) );
// {"Name":"Test","Count":42}

// Parse back
Set( varParsed, {
    Name: Text( ParseJSON( varJSON ).Name ),
    Count: Value( ParseJSON( varJSON ).Count )
});
```

---

## Sources

- [Microsoft Learn: JSON function](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-json)
- [Microsoft Learn: ParseJSON function](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-parsejson)
