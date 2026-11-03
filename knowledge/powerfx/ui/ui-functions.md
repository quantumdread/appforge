# UI Control Functions

Functions for interacting with user interface elements including control selection, focus management, property modifications, and dialog operations.

---

## Select Function

Simulate a user clicking or tapping a control, causing the OnSelect formula to be evaluated.

### Syntax

```powerfx
Select( Control )
```

**Gallery Extended Syntax:**
```powerfx
Select( Control, RowOrColumn )
Select( Control, RowOrColumn, ChildControl )
```

### Parameters

| Parameter | Required | Type | Description |
|-----------|----------|------|-------------|
| Control | Yes | Control | The control to select on behalf of the user |
| RowOrColumn | No | Number | The number of row or column (starting with 1) in a gallery control to select |
| ChildControl | No | Control | The child control within the specified row/column to select |

### Return Value

No return value. The function queues the OnSelect action for later processing.

---

### Rules

1. **Triggers OnSelect**: The control's OnSelect formula IS evaluated (queued for processing)
2. **Queued execution**: OnSelect is queued for later processing, not executed immediately
3. **Gallery support**: Works with gallery controls using extended syntax for row/column selection
4. **Parent propagation**: In galleries, default OnSelect is `Select(Parent)` to forward actions
5. **Behavior formulas only**: Can only be used in behavior formulas

### Use Cases

- Propagate select actions from child controls to parent controls
- Programmatically trigger button actions
- Select gallery rows or columns from code
- Override default gallery behavior for specific controls
- Create custom navigation or workflow patterns

### Examples

```powerfx
// Simple selection
Select( Button1 )

// Select gallery row
Select( Gallery1, 1 )

// Select child control in gallery row
Select( Gallery1, 1, ChildButton )

// Conditional selection
If( User().Email = "admin@contoso.com",
    Select( AdminButton )
)

// Select in timer for delayed action
// Timer.OnTimerEnd
Select( SubmitButton )

// Select based on dropdown
Switch( OptionsDropdown.Value,
    "Save", Select( SaveButton ),
    "Cancel", Select( CancelButton ),
    "Delete", Select( DeleteButton )
)
```

### Common Patterns

**Gallery Item Selection**

```powerfx
// Select first gallery item
Button.OnSelect:
    Select( Gallery1, 1 )

// Select specific gallery row
Button.OnSelect:
    Select( Gallery1, 3 )

// Select child control in gallery
Button.OnSelect:
    Select( Gallery1, 2, EditButton )
```

**Programmatic Button Clicks**

```powerfx
// Trigger save button from keyboard shortcut
Screen.OnKeyDown:
If( Key = "S" && CtrlKey,
    Select( SaveButton )
)

// Chain button actions
Button1.OnSelect:
    Select( Button2 );

Button2.OnSelect:
    Select( Button3 )
```

**Auto-Submit on Completion**

```powerfx
// Trigger submission when last field is valid
TextInput3.OnChange:
If(
    IsValid( Form1 ),
    Select( SubmitButton )
)
```

### Limitations

1. **Cannot use across screens**: Select only works on the same screen
2. **No circular selection**: A control cannot select itself directly or indirectly
3. **Queued execution**: OnSelect does not execute immediately; it's queued
4. **Behavior formulas only**: Cannot be used in value formulas
5. **No blocking**: Does not wait for OnSelect to complete

### Important Notes

- The Select function causes the OnSelect formula to be evaluated (different from previous understanding)
- OnSelect execution is queued, not immediate
- Commonly used in galleries where `Select(Parent)` is the default OnSelect behavior
- Cannot create circular selection chains
- Works only on current screen

---

## SetFocus Function

Move keyboard focus to a specific control to enable keyboard interaction.

### Syntax

```powerfx
SetFocus( Control )
```

### Parameters

| Parameter | Required | Type | Description |
|-----------|----------|------|-------------|
| Control | Yes | Control | The control to receive keyboard focus |

### Return Value

No return value. This is a behavior function.

---

### Rules

1. **Keyboard focus**: Moves the input focus to the specified control
2. **Keystrokes received**: User keystrokes are received by the focused control
3. **Visual indicator**: Shows focus ring based on FocusedBorderColor and FocusedBorderThickness properties
4. **TabIndex respected**: Works with TabIndex property for Tab key navigation
5. **Behavior formulas only**: Can only be used in behavior formulas
6. **Same screen only**: Only works on controls on the current screen

### Supported Controls

SetFocus can **only** be used with:
- Button
- Icon
- Image
- Label
- TextInput

### Use Cases

- Direct user to next required field after validation
- Focus on newly exposed or enabled controls for faster data entry
- Accessibility improvements for keyboard-only users
- Focus on error fields during form validation
- Auto-focus first input on screen display

### Examples

```powerfx
// Simple focus
SetFocus( FirstName )

// Focus on error field
If( IsBlank( EmailField.Value ),
    Notify( "Email required", NotificationType.Error );
    SetFocus( EmailField );
    false,
    true
)

// Focus after form submit
Button_Submit.OnSelect:
If(
    IsValid,
    SubmitForm( Form1 );
    Navigate( SuccessScreen ),
    Notify( "Fix errors", NotificationType.Error );
    SetFocus( FirstErrorField )
)

// Focus on screen load
Screen.OnVisible:
SetFocus( FirstNameInput )

// Focus next field on change
TextInput1.OnChange:
If(
    Len( TextInput1.Value ) = TextInput1.MaxLength,
    SetFocus( TextInput2 )
)
```

### Common Patterns

**Form Validation with Focus**

```powerfx
// Validate and focus first error
Button_Submit.OnSelect:
If(
    IsBlank( NameField.Value ),
    Notify( "Name requires a value", NotificationType.Error );
    SetFocus( NameField ),
    IsBlank( EmailField.Value ),
    Notify( "Email requires a value", NotificationType.Error );
    SetFocus( EmailField ),
    IsBlank( CityField.Value ),
    Notify( "City requires a value", NotificationType.Error );
    SetFocus( CityField ),
    Notify( "Form is Complete", NotificationType.Success );
    SubmitForm( Form1 )
)
```

**Focus on Newly Enabled Controls**

```powerfx
// Checkbox to enable billing address
Checkbox_DifferentBilling.OnUncheck:
SetFocus( BillingName )

// When checkbox is unchecked, focus moves to billing name field
// Combined with DisplayMode property:
BillingName.DisplayMode:
If( Checkbox_DifferentBilling.Value = false,
    DisplayMode.Edit,
    DisplayMode.Disabled
)
```

**Tab-Order Navigation**

```powerfx
// Create custom tab order
TextInput1.OnChange:
If( Len( TextInput1.Value ) > 0,
    SetFocus( TextInput2 )
);

TextInput2.OnChange:
If( Len( TextInput2.Value ) > 0,
    SetFocus( TextInput3 )
);

TextInput3.OnChange:
If( Len( TextInput3.Value ) > 0,
    SetFocus( SubmitButton )
)
```

**Accessible Search Pattern**

```powerfx
// Focus search when user types Ctrl+K
Screen.OnKeyDown:
If( Key = "K" && CtrlKey,
    SetFocus( SearchField )
)
```

### Accessibility Benefits

1. **Keyboard Navigation**: Essential for users who cannot use a mouse
2. **Screen Reader Compatibility**: Works with assistive technologies
3. **Clear Focus Indicator**: Visual feedback for current input location
4. **Improved Form Usability**: Guides users through forms naturally

### Limitations

1. **Cannot set focus on controls in Gallery**: Does not work with controls inside Gallery control
2. **Cannot set focus on controls in Edit form**: Does not work with controls inside Edit form control
3. **Cannot set focus on controls in Component**: Does not work with controls inside Component
4. **Cannot set focus on controls in Container**: Does not work with controls inside Container control
5. **Same screen only**: Focus only works on controls on the same screen
6. **Disabled controls**: Has no effect if control's DisplayMode is Disabled
7. **Mobile iOS limitation**: Soft keyboard only displays if SetFocus was initiated by direct user action (e.g., button OnSelect), not from OnVisible
8. **Supported controls only**: Only works with Button, Icon, Image, Label, and TextInput controls

### Important Notes

- Always test SetFocus behavior on target platforms (web, mobile, tablet)
- Combine with validation for better user experience
- Consider accessibility guidelines when directing focus
- iOS soft keyboard behavior differs based on how SetFocus is triggered
- Cannot use with controls in Gallery, Edit form, Component, or Container

---

## SetProperty Function

**Test Studio Only** - Simulates user interactions with input controls by programmatically setting property values. This function is exclusively available in Power Apps Test Studio for automated testing.

### Syntax

```powerfx
SetProperty( ControlProperty, Value )
```

### Parameters

| Parameter | Required | Type | Description |
|-----------|----------|------|-------------|
| ControlProperty | Yes | Property reference | The control property to set on behalf of the user |
| Value | Yes | Varies | The value to assign to the control property |

### Return Value

No return value specified. This is a testing utility function.

---

### Rules

1. **Test Studio only**: Only available in Power Apps Test Studio
2. **Simulates user input**: Acts as if the user interacted with the control
3. **Testing purposes**: Used exclusively for automated testing
4. **Property-specific**: Different controls support different properties

### Use Cases

- Automated testing of canvas apps
- Simulating user input in test scenarios
- Setting control values programmatically during tests
- Testing form validation and control interactions

### Examples

```powerfx
// Set text input value
SetProperty( TextInput1.Text, "Sample text" )

// Set rich text editor content
SetProperty( RichTextEditor1.HtmlText, "<p>Sample text</p>" )

// Set toggle value
SetProperty( Toggle1.Value, false )

// Set checkbox value
SetProperty( Checkbox1.Value, false )

// Set slider value
SetProperty( Slider1.Value, 10 )

// Set rating value
SetProperty( Rating1.Value, 5 )

// Set date picker
SetProperty( DatePicker1.SelectedDate, Date(2020,3,10) )

// Set radio button
SetProperty( Radio1.Selected, "Yes" )

// Set dropdown selection
SetProperty( Dropdown1.Selected, {Value:"Sample value"} )

// Set combo box items
SetProperty( ComboBox1.SelectedItems, Table({Value:"Sample value"},{Value:"Sample value"}) )

// Set listbox items
SetProperty( Listbox1.SelectedItems, Table({Value:"Sample value"},{Value:"Sample value"}) )
```

### Supported Controls and Properties

| Control | Property | Example Value |
|---------|----------|---------------|
| TextInput | Text | "Sample text" |
| RichTextEditor | HtmlText | "<p>Sample text</p>" |
| Toggle | Value | false |
| Checkbox | Value | false |
| Slider | Value | 10 |
| Rating | Value | 5 |
| DatePicker | SelectedDate | Date(2020,3,10) |
| Radio | Selected/SelectedText | "Yes" |
| Dropdown | Selected/SelectedText | {Value:"Sample value"} |
| ComboBox | Selected/SelectedItems | Table({Value:"Sample"}) |
| ListBox | Selected/SelectedItems | Table({Value:"Sample"}) |

### Limitations

1. **Test Studio exclusive**: Cannot be used in regular app formulas or production apps
2. **Testing only**: Only available in Power Apps Test Studio environment
3. **Property-specific**: Only certain properties can be set for each control type

### Important Notes

- This function is designed for automated testing, not production use
- Works with the Assert function for comprehensive test coverage
- Simulates user input rather than directly setting property values
- Available exclusively in Test Studio as of documentation date (March 2024)

---

## Print Function

Open the browser's print dialog to allow the user to print the current screen or save as PDF.

### Syntax

```powerfx
Print()
```

### Parameters

This function takes no parameters.

### Return Value

No return value. The function triggers the browser's native print dialog.

---

### Rules

1. **Opens browser dialog**: Shows the browser/device print dialog
2. **User control**: User can cancel, select printer, or save as PDF
3. **Current screen only**: Prints only the screen where the Print button is located
4. **Single page**: Cannot print multiple pages
5. **Visual state**: Prints the current visual state of the screen

### Use Cases

- Generate reports for printing
- Print forms or records with current data
- Export screens to PDF
- Create invoices or documents
- Print confirmations or receipts

### Examples

```powerfx
// Simple print button
Button_Print.OnSelect:
Print()

// Conditional print
Button_Export.OnSelect:
If( varDataReady,
    Print(),
    Notify( "Please generate report first", NotificationType.Warning )
)

// Print with confirmation
Button_Print.OnSelect:
If(
    Confirm( "Ready to print?" ),
    Print()
)
```

### Common Patterns

**Hide Print Button When Printing**

```powerfx
// Button Visible property
Button_Print.Visible:
Not Screen1.Printing

// This hides the print button when printing
```

**Using Print Templates**

```powerfx
// Create screen with print template
// In Power Apps Studio:
// 1. Select New Screen
// 2. Select Portrait print option
// 3. Screen is automatically sized for Letter portrait (816 x 1056)

// Print button already included in template
```

**Screen Sizes for Common Print Formats**

| Print Size | Height | Width |
|------------|--------|-------|
| A4 portrait | 1123 | 794 |
| A4 landscape | 794 | 1123 |
| Letter portrait | 1056 | 816 |
| Letter landscape | 816 | 1056 |

**Generate and Print Report**

```powerfx
// Generate report button
Button_GenerateReport.OnSelect:
ClearCollect( colReportData,
    Filter( Orders,
        OrderDate >= varStartDate && OrderDate <= varEndDate
    )
);
Set( varReportReady, true );
Notify( "Report ready. Click Print to output.", NotificationType.Success )

// Print button
Button_Print.OnSelect:
If( varReportReady,
    Print(),
    Notify( "Please generate report first", NotificationType.Warning )
)
```

**Control Visibility During Print**

```powerfx
// Hide certain controls when printing
EditButton.Visible:
Not Screen1.Printing

DeleteButton.Visible:
Not Screen1.Printing

// Show print-only elements
PrintHeader.Visible:
Screen1.Printing

PrintFooter.Visible:
Screen1.Printing
```

### Screen.Printing Property

The **Printing** property is available on screens and returns `true` when printing is active.

```powerfx
// Use in control visibility
Control.Visible: Not Screen1.Printing

// Use in conditional formatting
Label.Text: If( Screen1.Printing, "Printed on: " & Now(), "" )
```

### Web vs. Mobile Behavior

| Platform | Behavior |
|----------|----------|
| Web (Chrome/Edge) | Opens browser print dialog; user can save as PDF |
| Web (Safari) | Opens browser print dialog; can export to PDF |
| Mobile (iOS) | Does NOT work |
| Mobile (Android) | Does NOT work |
| SharePoint forms | Does NOT work |

### Limitations

1. **No mobile support**: Does NOT work on mobile devices
2. **No SharePoint forms**: Does NOT work on SharePoint forms
3. **Current screen only**: Can only print the screen where the Print button is located
4. **Single page**: Cannot print multiple pages
5. **Browser printers only**: Uses default browser printers
6. **Background graphics**: Some browsers require "Background graphics" setting enabled to show all images and colors
7. **User cancellation**: Cannot force printing without user interaction

### Important Notes

- Print function only works on the screen where it's triggered (e.g., button on Screen2 only prints Screen2)
- Test print output across browsers
- Use `Screen.Printing` property to control visibility during printing
- Fixed screens fit to page size; template screens fit content to print size
- Consider using print screen templates for best results
- Browser print settings affect final output

---

## RequestHide Function

Hide a SharePoint form in a Power Apps canvas app (embedded in SharePoint).

### Syntax

```powerfx
RequestHide()
```

### Parameters

This function takes no parameters.

### Return Value

No return value specified. The function executes the action of hiding the form.

---

### Rules

1. **SharePoint embedded only**: Only works when app is embedded in SharePoint
2. **Hides form container**: Collapses the Power Apps iframe/container in SharePoint
3. **Default OnSuccess behavior**: By default assigned to OnSuccess property of SharePoint forms
4. **Not needed for OnCancel**: SharePoint automatically hides form on Cancel
5. **SharePointIntegration control**: Only reacts to SharePoint forms with SharePointIntegration control

### Use Cases

- Hide form after successful submission in embedded SharePoint apps
- Auto-hide form when user completes task
- Minimize form to show SharePoint list view
- Hide form after quick action completion
- Standard behavior for SharePoint form customization

### Examples

```powerfx
// Simple hide after save
Form1.OnSuccess:
RequestHide()

// Hide with notification
Form1.OnSuccess:
Notify( "Changes saved successfully", NotificationType.Success );
RequestHide()

// Conditional hide based on validation
Button_Submit.OnSelect:
If( IsValid,
    SubmitForm( Form1 );
    RequestHide(),
    Notify( "Please complete all required fields", NotificationType.Error )
)
```

### Common Patterns

**Default SharePoint Form Behavior**

```powerfx
// EditForm.OnSuccess (default)
RequestHide()

// This is the default behavior for customized SharePoint forms
```

**Hide with Delay for User Feedback**

```powerfx
// Form.OnSuccess
Notify( "Record saved successfully", NotificationType.Success );
// Note: Delay function not available in Power Fx
// RequestHide will execute after notification
RequestHide()
```

**Conditional Hide Based on User Role**

```powerfx
// Form.OnSuccess
If( User().Email in AdminEmails,
    Notify( "Record saved. Form will remain open for admin review.", NotificationType.Success ),
    RequestHide()
)
```

**Hide After Data Refresh**

```powerfx
// Button.OnSelect
SubmitForm( EditForm );
Refresh( SharePointList );
Notify( "List synchronized", NotificationType.Success );
RequestHide()
```

### SharePoint Integration

When embedded in SharePoint:

```
SharePoint Page
├── List View
└── Power Apps Control (embedded)
    └── Canvas App with Form
        └── RequestHide() called
```

After RequestHide is called:
```
SharePoint Page
├── List View (visible)
└── Power Apps Control (hidden/collapsed)
```

### Behavior in Different Contexts

| Context | Behavior |
|---------|----------|
| Embedded in SharePoint | Hides form container |
| Web (standalone) | No effect |
| Mobile (standalone) | No effect |
| SharePoint mobile view | Hides form if supported |

### Limitations

1. **SharePoint only**: Does not work in standalone canvas apps
2. **Embedding required**: Requires app to be embedded in SharePoint page/list
3. **SharePointIntegration control**: Depends on SharePointIntegration control being present
4. **No parameters**: Cannot specify what to hide or customize behavior
5. **OnCancel not needed**: Not required for OnCancel event as SharePoint handles this automatically

### Important Notes

- RequestHide is the default OnSuccess behavior for customized SharePoint forms
- Not needed for OnCancel event - SharePoint automatically hides on cancel
- Only works with SharePointIntegration control
- Test only in SharePoint-embedded scenarios
- In standalone apps, use Navigate or visibility controls instead
- Include RequestHide in OnSuccess formula for all SharePoint forms
- Without RequestHide, SharePoint doesn't know when to hide the form

### Troubleshooting

| Issue | Solution |
|-------|----------|
| RequestHide has no effect | Verify app is embedded in SharePoint |
| Form not hiding after submit | Ensure RequestHide() is in OnSuccess formula |
| Works on web but not mobile | Test on SharePoint mobile view |
| Form doesn't hide on cancel | No action needed - SharePoint handles cancel automatically |

---

## Comparison Table

| Function | Purpose | Parameters | Return Type | Platform |
|----------|---------|------------|------------|----------|
| **Select** | Simulate control selection, triggers OnSelect | Control, optional RowOrColumn, optional ChildControl | None | All |
| **SetFocus** | Move keyboard focus | Control | None | Web/Mobile (limited controls) |
| **SetProperty** | Set control properties for testing | ControlProperty, Value | None | Test Studio Only |
| **Print** | Open print dialog | None | None | Web only (not mobile/SharePoint) |
| **RequestHide** | Hide SharePoint embedded form | None | None | SharePoint Only |

---

## Common UI Control Interaction Patterns

### Form Validation and Focus

```powerfx
// Validate and focus on first error
Button_Submit.OnSelect:
If(
    IsBlank( FirstNameField.Value ),
    Notify( "First name requires a value", NotificationType.Error );
    SetFocus( FirstNameField ),
    IsBlank( LastNameField.Value ),
    Notify( "Last name requires a value", NotificationType.Error );
    SetFocus( LastNameField ),
    IsBlank( EmailField.Value ),
    Notify( "Email requires a value", NotificationType.Error );
    SetFocus( EmailField ),
    Notify( "Form is complete", NotificationType.Success );
    SubmitForm( Form1 )
)
```

### Progressive Form Flow

```powerfx
// Move to next field when current is complete
Email.OnChange:
If(
    IsMatch( Email.Value, Match.Email ),
    SetFocus( PhoneNumber )
)

PhoneNumber.OnChange:
If(
    Len( PhoneNumber.Value ) >= 10,
    SetFocus( SubmitButton )
)
```

### Print with Confirmation

```powerfx
// Show confirmation before printing
Button_Print.OnSelect:
If(
    Confirm( "Print current report?" ),
    Print()
)
```

### SharePoint Form with Validation

```powerfx
// Submit button
Button_Submit.OnSelect:
If(
    Form1.Valid,
    SubmitForm( Form1 ),
    Notify( "Please complete required fields", NotificationType.Error )
)

// Form OnSuccess
Form1.OnSuccess:
Notify( "Saved successfully", NotificationType.Success );
RequestHide()
```

---

## Best Practices

1. **Select function**: Use to trigger OnSelect formulas programmatically (OnSelect IS evaluated)
2. **SetFocus accessibility**: Ensure keyboard navigation works for all users
3. **SetFocus validation**: Always focus on first error field during validation
4. **Print visibility**: Use `Not Screen.Printing` to hide buttons when printing
5. **Print templates**: Use built-in print screen templates for consistent sizing
6. **RequestHide feedback**: Provide user notification before hiding SharePoint forms
7. **Test platform differences**: Verify behavior on web, mobile, and SharePoint
8. **Use appropriate events**: OnSelect for actions, OnChange for input validation
9. **SetProperty testing**: Remember it's Test Studio only - not for production
10. **SharePoint forms**: Always include RequestHide() in OnSuccess formula

---

## Sources

- [Microsoft Learn: Select function](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-select)
- [Microsoft Learn: SetFocus function](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-setfocus)
- [Microsoft Learn: SetProperty function](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-setproperty)
- [Microsoft Learn: Print function](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-print)
- [Microsoft Learn: RequestHide function](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-requesthide)

---

**Last verified**: 2025-12-12
**Documentation source**: Microsoft Learn (learn.microsoft.com)
