# Master PowerFx Function List

Complete list of all PowerFx functions available in Power Apps Canvas Apps.

**Legend:**
- ✅ Documented
- 🔄 In Progress
- ⬜ Not Yet Documented

---

## Mathematical Functions

| Function | Status | Description |
|----------|--------|-------------|
| Abs | ✅ | Absolute value of a number |
| Acos | ✅ | Arccosine in radians |
| Acot | ✅ | Arccotangent in radians |
| Asin | ✅ | Arcsine in radians |
| Atan | ✅ | Arctangent in radians |
| Atan2 | ✅ | Arctangent from (x,y) coordinates |
| Average | ✅ | Average of numbers |
| Cos | ✅ | Cosine of angle in radians |
| Cot | ✅ | Cotangent of angle in radians |
| Count | ✅ | Count records with numbers |
| CountA | ✅ | Count non-empty records |
| CountIf | ✅ | Count records matching condition |
| CountRows | ✅ | Count all records in table |
| Degrees | ✅ | Convert radians to degrees |
| Exp | ✅ | e raised to a power |
| Int | ✅ | Round down to integer |
| Ln | ✅ | Natural logarithm |
| Log | ✅ | Logarithm in any base |
| Max | ✅ | Maximum value |
| Min | ✅ | Minimum value |
| Mod | ✅ | Remainder after division |
| Pi | ✅ | Value of π |
| Power | ✅ | Number raised to power |
| Radians | ✅ | Convert degrees to radians |
| Rand | ✅ | Random number 0-1 |
| RandBetween | ✅ | Random number in range |
| Round | ✅ | Round to nearest |
| RoundDown | ✅ | Round down |
| RoundUp | ✅ | Round up |
| Sin | ✅ | Sine of angle in radians |
| Sqrt | ✅ | Square root |
| StdevP | ✅ | Standard deviation |
| Sum | ✅ | Sum of numbers |
| Tan | ✅ | Tangent of angle in radians |
| Trunc | ✅ | Truncate to integer |
| VarP | ✅ | Variance |

---

## Text Functions

| Function | Status | Description |
|----------|--------|-------------|
| Char | ✅ | Character from code |
| Concat | ✅ | Concatenate table column |
| Concatenate | ✅ | Join strings |
| EncodeHTML | ✅ | HTML encode special characters |
| EncodeUrl | ✅ | URL encode special characters |
| EndsWith | ✅ | Check string ending |
| Find | ✅ | Find substring position |
| HashTags | ✅ | Extract hashtags from string |
| IsMatch | ✅ | Test string against pattern |
| Left | ✅ | Left portion of string |
| Len | ✅ | String length |
| Lower | ✅ | Convert to lowercase |
| Match | ✅ | Extract substring by pattern |
| MatchAll | ✅ | Extract all matches by pattern |
| Mid | ✅ | Middle portion of string |
| PlainText | ✅ | Remove HTML/XML tags |
| Proper | ✅ | Title case |
| Replace | ✅ | Replace by position |
| Right | ✅ | Right portion of string |
| Split | ✅ | Split string to table |
| StartsWith | ✅ | Check string beginning |
| Substitute | ✅ | Replace by matching text |
| Text | ✅ | Format value as text |
| Trim | ✅ | Remove extra spaces |
| TrimEnds | ✅ | Remove leading/trailing spaces |
| UniChar | ✅ | Character from Unicode |
| Upper | ✅ | Convert to uppercase |
| Value | ✅ | Convert text to number |

---

## Date & Time Functions

| Function | Status | Description |
|----------|--------|-------------|
| Calendar | ✅ | Calendar info for locale |
| Clock | ✅ | Clock info for locale |
| Date | ✅ | Create date from Y/M/D |
| DateAdd | ✅ | Add time to date |
| DateDiff | ✅ | Difference between dates |
| DateTime | ✅ | Create date/time value |
| DateTimeValue | ✅ | Parse date/time string |
| DateValue | ✅ | Parse date string |
| Day | ✅ | Day component |
| EDate | ✅ | Add months to date |
| EOMonth | ✅ | End of month date |
| Hour | ✅ | Hour component |
| IsToday | ✅ | Check if date is today |
| ISOWeekNum | ✅ | ISO week number |
| Minute | ✅ | Minute component |
| Month | ✅ | Month component |
| Now | ✅ | Current date/time |
| Second | ✅ | Second component |
| Time | ✅ | Create time value |
| TimeValue | ✅ | Parse time string |
| TimeZoneOffset | ✅ | UTC offset in minutes |
| Today | ✅ | Current date |
| UTCNow | ✅ | Current UTC date/time |
| UTCToday | ✅ | Current UTC date |
| Weekday | ✅ | Day of week |
| WeekNum | ✅ | Week number |
| Year | ✅ | Year component |

---

## Logical Functions

| Function | Status | Description |
|----------|--------|-------------|
| And | ✅ | Boolean AND |
| Coalesce | ✅ | First non-blank value |
| If | ✅ | Conditional logic |
| IfError | ✅ | Error handling |
| IsBlank | ✅ | Check for blank |
| IsBlankOrError | ✅ | Check for blank or error |
| IsEmpty | ✅ | Check for empty table |
| IsError | ✅ | Check for error |
| IsMatch | ✅ | Pattern matching (see text/match-functions.md) |
| IsNumeric | ✅ | Check if numeric |
| IsToday | ✅ | Check if today |
| IsType | ✅ | Check record type (see references/object-references.md) |
| Not | ✅ | Boolean NOT |
| Or | ✅ | Boolean OR |
| Switch | ✅ | Value matching |

---

## Table Functions

| Function | Status | Description |
|----------|--------|-------------|
| AddColumns | ✅ | Add calculated columns |
| Clear | ✅ | Clear collection |
| ClearCollect | ✅ | Clear and add records |
| Collect | ✅ | Add records to collection |
| CountRows | ✅ | Count table rows |
| Distinct | ✅ | Remove duplicates |
| DropColumns | ✅ | Remove columns |
| Filter | ✅ | Filter table by condition |
| First | ✅ | First record |
| FirstN | ✅ | First N records |
| ForAll | ✅ | Apply formula to all records |
| GroupBy | ✅ | Group records |
| Index | ✅ | Record by position |
| Last | ✅ | Last record |
| LastN | ✅ | Last N records |
| LookUp | ✅ | Find single record |
| Patch | ✅ | Create/modify records |
| Remove | ✅ | Remove specific records |
| RemoveIf | ✅ | Remove by condition |
| RenameColumns | ✅ | Rename columns |
| Search | ✅ | Substring search |
| Sequence | ✅ | Generate number sequence |
| Shuffle | ✅ | Randomize order |
| ShowColumns | ✅ | Select columns |
| Sort | ✅ | Sort by formula |
| SortByColumns | ✅ | Sort by columns |
| Table | ✅ | Create inline table |
| Ungroup | ✅ | Flatten grouped table |
| Update | ✅ | Replace record |
| UpdateIf | ✅ | Update by condition |

---

## Data Source Functions

| Function | Status | Description |
|----------|--------|-------------|
| Choices | ✅ | Get choice column options |
| DataSourceInfo | ✅ | Data source metadata |
| Defaults | ✅ | Default values for record |
| Errors | ✅ | Data source errors |
| IsType | ✅ | Check record type |
| Refresh | ✅ | Refresh data source |
| Relate | ✅ | Create relationship |
| Revert | ✅ | Revert record changes |
| Unrelate | ✅ | Remove relationship |
| Validate | ✅ | Validate record |

---

## Variable Functions

| Function | Status | Description |
|----------|--------|-------------|
| Set | ✅ | Set global variable |
| UpdateContext | ✅ | Set context variables |
| With | ✅ | Inline scope variables |

---

## Navigation & Screen Functions

| Function | Status | Description |
|----------|--------|-------------|
| Back | ✅ | Return to previous screen |
| Navigate | ✅ | Go to screen |
| Param | ✅ | Get launch parameter |
| App.ActiveScreen | ✅ | Current screen reference |
| App.StartScreen | ✅ | Initial screen |

---

## Form Functions

| Function | Status | Description |
|----------|--------|-------------|
| EditForm | ✅ | Set form to edit mode |
| NewForm | ✅ | Set form to new mode |
| ResetForm | ✅ | Reset form to defaults |
| SubmitForm | ✅ | Save form data |
| ViewForm | ✅ | Set form to view mode |

---

## User Interface Functions

| Function | Status | Description |
|----------|--------|-------------|
| Notify | ✅ | Show notification |
| Print | ✅ | Open print dialog |
| Reset | ✅ | Reset control to default |
| RequestHide | ✅ | Hide SharePoint form |
| Select | ✅ | Simulate control selection |
| SetFocus | ✅ | Move focus to control |
| SetProperty | ✅ | Set control property |

---

## Color Functions

| Function | Status | Description |
|----------|--------|-------------|
| Color | ✅ | Built-in color value |
| ColorFade | ✅ | Fade color |
| ColorValue | ✅ | Parse color string |
| RGBA | ✅ | Create color from RGB |

---

## Media Functions

| Function | Status | Description |
|----------|--------|-------------|
| Download | ✅ | Download file |
| Launch | ✅ | Open URL or app |
| PDF | ✅ | Export to PDF |

---

## Device & Signal Functions

| Function | Status | Description |
|----------|--------|-------------|
| Acceleration | ✅ | Device acceleration |
| Compass | ✅ | Compass heading |
| Connection | ✅ | Network connection info |
| Location | ✅ | GPS location |

---

## JSON & Data Conversion Functions

| Function | Status | Description |
|----------|--------|-------------|
| Boolean | ✅ | Convert to boolean |
| Dec2Hex | ✅ | Decimal to hex |
| Float | ✅ | Convert to float |
| GUID | ✅ | Create/parse GUID |
| Hex2Dec | ✅ | Hex to decimal |
| JSON | ✅ | Convert to JSON string |
| ParseJSON | ✅ | Parse JSON to record |
| Text | ✅ | Convert to text |
| Value | ✅ | Convert to number |

---

## Error Handling Functions

| Function | Status | Description |
|----------|--------|-------------|
| Error | ✅ | Create custom error |
| IfError | ✅ | Handle errors |
| IsError | ✅ | Check for error |
| IsBlankOrError | ✅ | Check blank or error |

---

## Storage Functions

| Function | Status | Description |
|----------|--------|-------------|
| ClearData | ✅ | Clear saved data |
| LoadData | ✅ | Load from local storage |
| SaveData | ✅ | Save to local storage |

---

## AI Builder Functions

| Function | Status | Description |
|----------|--------|-------------|
| AIClassify | ✅ | Classify text |
| AIExtract | ✅ | Extract entities |
| AIReply | ✅ | Generate reply |
| AISentiment | ✅ | Detect sentiment |
| AISummarize | ✅ | Summarize text |
| AITranslate | ✅ | Translate text |

---

## Object References

| Function | Status | Description |
|----------|--------|-------------|
| As | ✅ | Name current record |
| AsType | ✅ | Cast to type |
| IsType | ✅ | Check record type |
| Parent | ✅ | Parent control reference |
| Self | ✅ | Current control reference |
| ThisItem | ✅ | Current gallery item |
| ThisRecord | ✅ | Current record in scope |

---

## App Object Properties

| Property | Status | Description |
|----------|--------|-------------|
| App.ActiveScreen | ✅ | Current screen |
| App.BackEnabled | ✅ | Back gesture enabled |
| App.ConfirmExit | ✅ | Show exit confirmation |
| App.ConfirmExitMessage | ✅ | Exit confirmation text |
| App.Formulas | ✅ | Named formulas & UDFs |
| App.OnError | ✅ | Global error handler |
| App.OnStart | ✅ | App startup formula |
| App.StartScreen | ✅ | Initial screen |

---

## Operators

| Operator | Status | Description |
|----------|--------|-------------|
| & | ✅ | String concatenation |
| && | ✅ | Boolean AND |
| \|\| | ✅ | Boolean OR |
| ! | ✅ | Boolean NOT |
| = | ✅ | Equality |
| <> | ✅ | Inequality |
| < > <= >= | ✅ | Comparison |
| + - * / | ✅ | Arithmetic |
| ^ | ✅ | Power |
| % | ✅ | Percentage |
| in | ✅ | Contains (case insensitive) |
| exactin | ✅ | Contains (case sensitive) |
| @ | ✅ | Disambiguation |
| . | ✅ | Property access |
| ; | ✅ | Statement separator |
| :: | ✅ | Scope resolution |

---

## Miscellaneous Functions

| Function | Status | Description |
|----------|--------|-------------|
| Assert | ✅ | Test assertion |
| Concurrent | ✅ | Run formulas in parallel |
| Copy | ✅ | Copy to clipboard |
| Exit | ✅ | Exit the app |
| Host | ✅ | Host environment info |
| Language | ✅ | Current language tag |
| ReadNFC | ✅ | Read NFC tag |
| RecordInfo | ✅ | Record metadata |
| ShowHostInfo | ✅ | Display host info |
| Trace | ✅ | Log trace message |
| User | ✅ | Current user info |

---

## Summary

| Category | Total | Documented | Remaining |
|----------|-------|------------|-----------|
| Mathematical | 35 | 35 | 0 |
| Text | 28 | 28 | 0 |
| Date & Time | 27 | 27 | 0 |
| Logical | 15 | 15 | 0 |
| Table | 29 | 29 | 0 |
| Data Source | 10 | 10 | 0 |
| Variable | 3 | 3 | 0 |
| Navigation | 5 | 5 | 0 |
| Form | 5 | 5 | 0 |
| UI | 7 | 7 | 0 |
| Color | 4 | 4 | 0 |
| Media | 3 | 3 | 0 |
| Device | 4 | 4 | 0 |
| JSON/Conversion | 9 | 9 | 0 |
| Error Handling | 4 | 4 | 0 |
| Storage | 3 | 3 | 0 |
| AI Builder | 6 | 6 | 0 |
| Object References | 7 | 7 | 0 |
| App Object | 8 | 8 | 0 |
| Operators | 16 | 16 | 0 |
| Miscellaneous | 11 | 11 | 0 |
| **TOTAL** | **~239** | **~239** | **0** |

---

## Documentation Status

### All Categories Complete (100%)
- ✅ Mathematical Functions (35/35)
- ✅ Text Functions (28/28)
- ✅ Date & Time Functions (27/27)
- ✅ Logical Functions (15/15)
- ✅ Table Functions (29/29)
- ✅ Data Source Functions (10/10)
- ✅ Variable Functions (3/3)
- ✅ Navigation Functions (5/5)
- ✅ Form Functions (5/5)
- ✅ UI Functions (7/7)
- ✅ Color Functions (4/4)
- ✅ Media Functions (3/3)
- ✅ Device Functions (4/4)
- ✅ JSON/Conversion (9/9)
- ✅ Error Handling (4/4)
- ✅ Storage Functions (3/3)
- ✅ AI Builder Functions (6/6)
- ✅ Object References (7/7)
- ✅ App Object Properties (8/8)
- ✅ Operators (16/16)
- ✅ Miscellaneous Functions (11/11)

**Documentation Complete: ~239/239 PowerFx functions documented.**
