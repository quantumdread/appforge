# Canvas App Coding Rules

Make each formula's purpose visible in its names, layout, and failure path. Examples use English Power Fx separators and classic controls. Put each expression in the property named in its comment. Add the named tables and fields before using connector examples.

## Name Controls and State

### Control prefixes

Give controls a type prefix followed by their job. Rename controls when inserting them.

| Control | Prefix | Example name |
|---|---|---|
| Button | `btn` | `btnCreateOrder` |
| Label | `lbl` | `lblOrderHeading` |
| Text input | `txt` | `txtCustomerEmail` |
| Dropdown | `drp` | `drpOrderState` |
| Combo box | `cmb` | `cmbOrderOwner` |
| Gallery | `gal` | `galOrderQueue` |
| Form | `frm` | `frmOrderEntry` |
| Icon | `ico` | `icoArchiveOrder` |
| Image | `img` | `imgAccountPhoto` |
| Container | `con` | `conOrderToolbar` |
| Rectangle | `rec` | `recRowDivider` |
| Toggle | `tgl` | `tglEmailUpdates` |
| Checkbox | `chk` | `chkIncludeClosed` |
| Radio | `rad` | `radDeliveryMethod` |
| Date picker | `dte` | `dteRequestedDate` |
| Slider | `sld` | `sldQuantityLimit` |
| Timer | `tmr` | `tmrQueueRefresh` |
| Data table | `tbl` | `tblOrderTotals` |

End screen names with `Screen`: `OrderQueueScreen`, `OrderEntryScreen`, `PreferencesScreen`. Choose names that identify the destination in a navigation formula.

Technique credit: Matthew Devaney — [Power Apps Standards: Naming Conventions](https://www.matthewdevaney.com/power-apps-coding-standards-for-canvas-apps/power-apps-standards-naming-conventions/).

### State prefixes

Reserve `gbl` (or the existing app's `var`) for globals, `loc` for screen context, `col` for collections, `fx` for named formulas, and `udf` for functions. Never give a global and context value the same name: screen context takes precedence.

```powerfx
// A behavior property; this is a bounded preview, not a complete remote table
Set(gblSignedInAccount, User());
UpdateContext({locQueueBusy: true});
ClearCollect(colQueuePreview, Filter(Orders, StartsWith(Title, txtOrderPrefix.Text)));
UpdateContext({locQueueBusy: false})
```

```powerfx
// App.Formulas
fxAccountAddress = User().Email;
fxCalendarDate = Today();
udfMoneyLabel(NetAmount: Number): Text = Text(NetAmount, "[$-en-US]$#,##0.00");
```

Technique credit: Matthew Devaney — [Power Apps Coding Standards for Canvas Apps](https://www.matthewdevaney.com/power-apps-coding-standards-for-canvas-apps/).

## Lay Out Formulas for Review

Indent arguments when an expression contains branches or records. Alphabetize record fields in `Patch` and `UpdateContext` so changes are easy to find.

```powerfx
// btnCreateOrder.OnSelect; Orders has numeric Amount and text State/Title
Patch(
    Orders,
    Defaults(Orders),
    {
        Amount: Value(txtOrderAmount.Text),
        State: "Draft",
        Title: txtOrderTitle.Text
    }
)
```

Explain constraints in comments instead of narrating assignments. Use a block comment for the boundaries of a calculation.

```powerfx
/* Count weekdays inclusively; holidays need a separate calendar.
   Supply an ordered range spanning no more than 50,000 days. */
CountIf(
    AddColumns(
        Sequence(DateDiff(dteRangeFrom.SelectedDate, dteRangeTo.SelectedDate) + 1, 0) As Offset,
        WorkDate, DateAdd(dteRangeFrom.SelectedDate, Offset.Value, TimeUnit.Days)
    ),
    Weekday(WorkDate, StartOfWeek.Monday) <= 5
)
```

Technique credit: Matthew Devaney — [Power Apps Coding Standards for Canvas Apps](https://www.matthewdevaney.com/power-apps-coding-standards-for-canvas-apps/).

## Simplify Expressions

Use `Self` for the current control. Qualify colors with `Color`. A classic button's `Fill` can use:

```powerfx
If(Self.Pressed, Color.Navy, Color.Teal)
```

Name intermediate calculations with `With`; keep temporary arithmetic out of global state.

```powerfx
With(
    {lineAmount: Value(txtUnits.Text) * Value(txtUnitCost.Text)},
    If(lineAmount >= 750, lineAmount * 0.95, lineAmount)
)
```

Map one value to several outcomes with `Switch`. Supply missing text with `Coalesce`.

```powerfx
// A state label's Text
Switch(drpOrderState.Selected.Value, "D", "Draft", "R", "Ready", "C", "Closed", "Other")
```

```powerfx
// A name label's Text
Coalesce(txtCustomerName.Text, "Name not provided")
```

See [Microsoft Learn: code optimization](https://learn.microsoft.com/en-us/power-apps/guidance/coding-guidelines/code-optimization) for formula and startup guidance.

Technique credit: Matthew Devaney — [Power Apps Coding Standards for Canvas Apps](https://www.matthewdevaney.com/power-apps-coding-standards-for-canvas-apps/).

## Arrange Screens with Containers

Use a vertical root with header, content, and action containers. Configure alignment and flexible dimensions for resizing. Order dialogs above their launching controls, loading masks above content, and menus above ordinary rows in Tree view. Canvas controls have no general `ZIndex` property.

Technique credit: Matthew Devaney — [Power Apps Coding Standards for Canvas Apps](https://www.matthewdevaney.com/power-apps-coding-standards-for-canvas-apps/).

## Handle Writes and Connector Failures

Keep formula error management enabled; older apps may expose its switch under retired features. Wrap risky operations with `IfError`. Put success work in its default result and use compatible return types. `Customers` here has text `Name` and `Email` fields.

```powerfx
IfError(
    Patch(Customers, Defaults(Customers), {Name: txtCustomerName.Text, Email: txtCustomerEmail.Text}),
    Notify("Customer was not saved. " & FirstError.Message, NotificationType.Error); false,
    Notify("Customer saved.", NotificationType.Success); true
)
```

Project profile fields so a connector result and its fallback have matching shapes:

```powerfx
Set(
    gblProfileSummary,
    IfError(
        With({profile: Office365Users.MyProfile()}, {Name: profile.DisplayName, Email: profile.Mail}),
        {Name: "Account unavailable", Email: ""}
    )
)
```

Submit forms through their lifecycle. Use the following in the save button. Put confirmation and navigation in `frmOrderEntry.OnSuccess`; display `frmOrderEntry.Error` in `OnFailure`. The return from `SubmitForm` does not establish save success.

```powerfx
If(
    frmOrderEntry.Valid,
    SubmitForm(frmOrderEntry),
    Notify("Complete the highlighted fields.", NotificationType.Warning)
)
```

Technique credit: Matthew Devaney — [Power Apps Coding Standards for Canvas Apps](https://www.matthewdevaney.com/power-apps-coding-standards-for-canvas-apps/).

## Validate and Confirm Changes

Check required values and formats before writing. The predefined email pattern is `Match.Email`.

```powerfx
If(
    IsBlank(txtCustomerName.Text),
    Notify("Enter a customer name.", NotificationType.Warning),
    !IsMatch(txtCustomerEmail.Text, Match.Email),
    Notify("Enter an email address.", NotificationType.Warning),
    IfError(
        Patch(Customers, Defaults(Customers), {Email: txtCustomerEmail.Text, Name: txtCustomerName.Text}),
        Notify("Unable to save customer.", NotificationType.Error); false,
        true
    )
)
```

Open a delete dialog with a context flag; bind its `Visible` to that flag. Its cancel button clears the flag. Its confirm button performs the removal. This canvas pattern does not require `Confirm` support.

```powerfx
// Delete icon OnSelect
UpdateContext({locConfirmRemoval: true})
```

```powerfx
// Confirm button OnSelect
IfError(
    Remove(Orders, galOrderQueue.Selected),
    Notify("Unable to remove order.", NotificationType.Error); false,
    UpdateContext({locConfirmRemoval: false});
    Notify("Order removed.", NotificationType.Success); true
)
```

Check `frmOrderEntry.Unsaved` before leaving an editor. If true, open a discard dialog. Only its discard action should run `ResetForm(frmOrderEntry); Back()`. Otherwise call `Back()` directly.

Technique credit: Matthew Devaney — [Power Apps Coding Standards for Canvas Apps](https://www.matthewdevaney.com/power-apps-coding-standards-for-canvas-apps/).

## Configure for Scale

Keep explicit column selection, delayed screen loading, and error management enabled. Prefer modern controls where their supported properties meet the design. Locate settings in the app's Studio version.

Use the default 500-row local query limit for small sources. For medium sources this guide uses a bounded load of 1,000–2,000 rows; the setting itself allows up to 10,000. A higher limit never makes a formula delegable. Resolve delegation warnings and test at ten times the development data volume.

Centralize design tokens and deployment values in formulas or environment variables. Keep runtime choices in state. Review every filter against expected growth and test layouts on different screens.

Technique credit: Matthew Devaney — [Power Apps Coding Standards for Canvas Apps](https://www.matthewdevaney.com/power-apps-coding-standards-for-canvas-apps/).

## Prepare for Review and Release

Package the app in a solution. Use environment variables across deployments and the platform's supported source control integration.

Review naming, delegation, failure paths, shared configuration, comments, resizing, and measured performance. Exercise unsaved edits and failed saves before release.

Technique credit: Matthew Devaney — [Power Apps Coding Standards for Canvas Apps](https://www.matthewdevaney.com/power-apps-coding-standards-for-canvas-apps/).
