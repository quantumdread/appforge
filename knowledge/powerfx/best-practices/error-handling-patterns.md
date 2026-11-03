# Error Paths for Canvas Apps

Make failure an explicit branch of every write and connector operation. Examples use classic controls and English separators. Connect the named sources with the specified schema; comments identify property destinations. Keep formula error management enabled.

## Choose the Test That Matches the Failure

Use `IsBlank` for blank or empty text, `IsError` for an error value, and `IsBlankOrError` when either should block the UI. A lookup with no match returns blank; that is not necessarily an error.

```powerfx
// Email validation label Text
If(IsBlank(txtContactEmail.Text), "Enter an email address.", "Email supplied")
```

```powerfx
// Numeric error test
IsError(Value(txtOrderValue.Text) / Value(txtOrderUnits.Text))
```

```powerfx
// Save button DisplayMode
If(IsBlankOrError(txtContactEmail.Text), DisplayMode.Disabled, DisplayMode.Edit)
```

Use `IfError` for a fallback of the same type. It does not interpret a blank as failure.

```powerfx
IfError(Value(txtOrderValue.Text) / Value(txtOrderUnits.Text), 0)
```

To try a second operation after the first fails, nest handlers. The third argument to `IfError` is a success default, not another fallback attempt. The following sources both have numeric ID and text Name fields.

```powerfx
IfError(
    LookUp(Customers, ID = gblCustomerKey, Name),
    IfError(LookUp(CustomerArchive, ID = gblCustomerKey, Name), "Name unavailable")
)
```

Reference: [Microsoft Learn: error functions](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-iferror).

Technique credit: Platforms of Power — [Power Apps Error Handling Essentials](https://platformsofpower.net/power-apps-error-handling-essentials/).

## Gate Patch Success and Dependencies

### One write

Supply error and success results explicitly. Do not place a success message after an unchecked `Patch`. `Customers` needs text Name and Email fields.

```powerfx
IfError(
    Patch(Customers, Defaults(Customers), {Email: txtContactEmail.Text, Name: txtContactName.Text}),
    Notify("Customer could not be saved. " & FirstError.Message, NotificationType.Error); false,
    Notify("Customer saved.", NotificationType.Success); true
)
```

Technique credit: Platforms of Power — [Power Apps Error Handling Essentials](https://platformsofpower.net/power-apps-error-handling-essentials/).

### Success navigation

Run navigation only in the success result. `Orders.Title` is text.

```powerfx
IfError(
    Patch(Orders, Defaults(Orders), {Title: txtOrderHeading.Text}),
    Notify("Order save failed. " & FirstError.Message, NotificationType.Error); false,
    Notify("Order saved.", NotificationType.Success);
    Navigate(OrderReceiptScreen, ScreenTransition.None); true
)
```

Technique credit: Platforms of Power — [Power Apps Error Handling Essentials](https://platformsofpower.net/power-apps-error-handling-essentials/).

### Parent followed by child

Pass dependent writes as separate tested expressions. A semicolon chain inside one test does not stop later statements when an earlier statement fails. `CustomerAddresses` has numeric CustomerID and text Street.

```powerfx
IfError(
    Set(gblCreatedCustomer, Patch(Customers, Defaults(Customers), {Name: txtContactName.Text})),
    Notify("Customer creation failed.", NotificationType.Error); false,
    Patch(CustomerAddresses, Defaults(CustomerAddresses), {CustomerID: gblCreatedCustomer.ID, Street: txtStreetLine.Text}),
    Notify("Address was not saved; the customer already exists.", NotificationType.Error); false,
    Notify("Customer and address saved.", NotificationType.Success); true
)
```

This is not a transaction: the parent remains if the child fails. Provide a repair path rather than retrying the entire sequence blindly.

Technique credit: Platforms of Power — [Power Apps Error Handling Essentials](https://platformsofpower.net/power-apps-error-handling-essentials/).

## Handle Unobserved Errors at App Level

Use `App.OnError` for unhandled errors. It can report and log; it cannot replace the failed expression's result or undo a completed write. Keep technical details in diagnostics and give users an actionable message.

```powerfx
// App.OnError
Notify("The action could not finish. Try again or contact support.", NotificationType.Error, 5000);
Trace(
    "Canvas operation failed",
    TraceSeverity.Error,
    {Message: FirstError.Message, Origin: FirstError.Source, ObservedAt: FirstError.Observed, Kind: Text(FirstError.Kind)}
)
```

| Error field | Use |
|---|---|
| `Message` | Inspect the error description |
| `Source` | Identify the expression where it began |
| `Observed` | Identify where it surfaced |
| `Kind` | Route by `ErrorKind` |
| `Details.HttpResponse` | Inspect an available network response body |
| `Details.HttpStatusCode` | Inspect an available HTTP status |

HTTP fields belong inside `Details`; they are not top-level `FirstError` properties. `AllErrors` holds the error records; `FirstError` selects the first.

Reference: [Microsoft Learn: App.OnError](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/controls/object-app#onerror-property).

Technique credit: Platforms of Power — [Power Apps Error Handling Essentials](https://platformsofpower.net/power-apps-error-handling-essentials/).

## Translate Error Kinds

Keep a reusable translation table in `App.Formulas` if diagnostics need stable numeric labels. Prefer enum comparisons in application logic. This table covers codes 0–28; connectors can also provide more specific messages.

```powerfx
// App.Formulas
fxErrorCatalog = Table(
    {Code: 0, Label: "None"},
    {Code: 1, Label: "Sync"},
    {Code: 2, Label: "MissingRequired"},
    {Code: 3, Label: "CreatePermission"},
    {Code: 4, Label: "EditPermission"},
    {Code: 5, Label: "DeletePermission"},
    {Code: 6, Label: "Conflict"},
    {Code: 7, Label: "NotFound"},
    {Code: 8, Label: "ConstraintViolated"},
    {Code: 9, Label: "GeneratedValue"},
    {Code: 10, Label: "ReadPermission"},
    {Code: 11, Label: "Validation"},
    {Code: 12, Label: "Unknown"},
    {Code: 13, Label: "Div0"},
    {Code: 14, Label: "BadLanguageCode"},
    {Code: 15, Label: "BadRegex"},
    {Code: 16, Label: "InvalidFunctionUsage"},
    {Code: 17, Label: "FileNotFound"},
    {Code: 18, Label: "AnalysisError"},
    {Code: 19, Label: "ReadOnlyValue"},
    {Code: 20, Label: "QuotaExceeded"},
    {Code: 21, Label: "Network"},
    {Code: 22, Label: "Numeric"},
    {Code: 23, Label: "InvalidArgument"},
    {Code: 24, Label: "Internal"},
    {Code: 25, Label: "NotApplicable"},
    {Code: 26, Label: "Timeout"},
    {Code: 27, Label: "ServiceUnavailable"},
    {Code: 28, Label: "Custom"}
);
```

Technique credit: Platforms of Power — [Power Apps Error Handling Essentials](https://platformsofpower.net/power-apps-error-handling-essentials/).

## Raise Validation Errors Deliberately

Use `Error` when a caller should receive a structured failure. For ordinary missing input, a validation label may be enough. Raising an error alone does not stop a subsequent semicolon statement: use branches or `IfError` to gate work.

```powerfx
// Date validation expression
If(
    dteDeliveryFrom.SelectedDate > dteDeliveryThrough.SelectedDate,
    Error({Kind: ErrorKind.Validation, Message: "Choose an end date on or after the start."})
)
```

```powerfx
// Quantity validation expression
If(
    Value(txtRequestedUnits.Text) > gblAvailableUnits,
    Error({Kind: ErrorKind.Validation, Message: "Requested quantity exceeds available stock."})
)
```

```powerfx
// Save button OnSelect
If(
    IsBlank(txtContactEmail.Text),
    Error({Kind: ErrorKind.MissingRequired, Message: "Supply an email address."}),
    !IsMatch(txtContactEmail.Text, Match.Email),
    Error({Kind: ErrorKind.Validation, Message: "Check the email format."}),
    SubmitForm(frmCustomerEntry)
)
```

Technique credit: Platforms of Power — [Power Apps Error Handling Essentials](https://platformsofpower.net/power-apps-error-handling-essentials/).

## Let Forms Own Their Submission Events

Use `frmCustomerEntry.Valid` to enable submission. `SubmitForm` is asynchronous; read its result through the form's events.

```powerfx
// btnSaveCustomer.DisplayMode
If(frmCustomerEntry.Valid, DisplayMode.Edit, DisplayMode.Disabled)
```

```powerfx
// frmCustomerEntry.OnFailure
Set(gblLastFormFailure, frmCustomerEntry.Error);
Notify("Customer was not saved. " & frmCustomerEntry.Error, NotificationType.Error)
```

```powerfx
// frmCustomerEntry.OnSuccess
Notify("Customer details saved.", NotificationType.Success);
Navigate(CustomerQueueScreen, ScreenTransition.None)
```

Technique credit: Platforms of Power — [Power Apps Error Handling Essentials](https://platformsofpower.net/power-apps-error-handling-essentials/).

## Cover Connector-Specific Failure Modes

### Profile photos

Use a fallback media asset for missing or inaccessible photos.

```powerfx
// imgAccountPhoto.Image
IfError(Office365Users.UserPhotoV2(gblAccountEmail), SampleImage)
```

Technique credit: Platforms of Power — [Power Apps Error Handling Essentials](https://platformsofpower.net/power-apps-error-handling-essentials/).

### Missing lookup records

Handle errors and absent matches separately. This example uses a SharePoint Customers list with `Title`.

```powerfx
IfError(
    Coalesce(LookUp(Customers, ID = gblCustomerKey, Title), "Customer no longer available"),
    "Customer lookup unavailable"
)
```

Technique credit: Platforms of Power — [Power Apps Error Handling Essentials](https://platformsofpower.net/power-apps-error-handling-essentials/).

### Flow calls

Connect `ConfirmOrderFlow` with one numeric argument. Treat successful transport separately from any business status returned by the flow.

```powerfx
IfError(
    ConfirmOrderFlow.Run(gblOrderKey),
    Notify("Order processing failed. " & FirstError.Message, NotificationType.Error); false,
    Notify("Order process returned.", NotificationType.Success); true
)
```

Technique credit: Platforms of Power — [Power Apps Error Handling Essentials](https://platformsofpower.net/power-apps-error-handling-essentials/).

## Persist Diagnostics Without Repeating Failures

For persistent logging, add `AppErrors` with text Title, Origin, AccountEmail, ScreenName, Details and date/time LoggedAt fields. In `App.OnError`, capture the original error before starting other work. Use a bounded logging volume; a failed logging connector must not cause a second unhandled reporting loop.

```powerfx
// App.OnError
With(
    {captured: FirstError, currentScreen: App.ActiveScreen.Name},
    Concurrent(
        Notify("The action failed. Please retry.", NotificationType.Error, 5000),
        Trace(
            "Unhandled canvas error",
            TraceSeverity.Error,
            {Message: captured.Message, Kind: Text(captured.Kind), Origin: captured.Source, Screen: currentScreen}
        ),
        IfError(
            Patch(
                AppErrors,
                Defaults(AppErrors),
                {
                    AccountEmail: User().Email,
                    Details: Text(captured.Kind) & ": " & captured.Message,
                    LoggedAt: Now(),
                    Origin: captured.Source,
                    ScreenName: currentScreen,
                    Title: captured.Message
                }
            ),
            false,
            true
        )
    )
)
```

Use `Trace` and Monitor for diagnosis, a concise notification for the user, and persistence only where support needs it. Avoid unconditional success messages, discarded Patch errors, unexplained generic failures, and raw network payloads in the UI.

Technique credit: Platforms of Power — [Power Apps Error Handling Essentials](https://platformsofpower.net/power-apps-error-handling-essentials/).

## Further Reading

The [Platforms of Power site](https://platformsofpower.net/) hosts the original community discussion. Function behavior is defined by the linked Microsoft Learn references above.
