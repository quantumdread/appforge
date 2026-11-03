# Write and form error-path review

These shared analyzer rules emit WARN. They identify bounded patterns in analyzed source; they do not establish that a write failed, that data was lost, or that an entire app lacks error handling. They do not supply an automatic rewrite.

## Write navigation

`write-followed-by-unconditional-navigation` observes an adjacent direct datasource write and direct `Navigate` or `Back` in an `On*` behavior. Review whether navigation should depend on the write's success. Power Fx behavior chains can continue after an error; `IfError` supports conditional continuation. Check the app's error-management configuration when selecting the remedy. [Microsoft IfError reference](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-iferror).

The recognizer accepts `Patch` with at least three complete arguments and a plain or quoted target. It excludes known variables, named formulas, collections, compound targets, nested branches, assignments and error-gated composites. Patch also has record-merge overloads, so an unresolved name receives conditional wording rather than a claim that the call mutates a datasource. [Microsoft Patch reference](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-patch).

`Collect`, `Remove` and `RemoveIf` require explicit or export-derived noncollection identity. An unresolved `Collect` target may create a collection; `ClearCollect` is outside this rule. [Microsoft collection reference](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-clear-collect-clearcollect).

## SubmitForm navigation

`submitform-navigation-not-in-onsuccess` observes direct `SubmitForm` immediately followed by navigation. It resolves the submitted name to a unique authored `Form`, counting collisions across all controls. Review that form's `OnSuccess` event for the continuation. A property named `OnSuccess` is not a blanket exemption when it starts a fresh submission of another form. Standalone navigation in the submitted form's success event does not match.

Successful submission invokes the form's `OnSuccess`; an unsuccessful submission invokes `OnFailure` and sets its error properties. This lifecycle requires different advice from a synchronous write chain. [Microsoft form function reference](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-form).

## Form failure presentation

`form-without-failure-path` considers uniquely identified authored Forms reached by recognized `SubmitForm` calls. It warns when analyzed source contains neither a nonempty `OnFailure` handler nor a recognized display of that form's `Error`. Microsoft documents a valid pattern with a blank failure handler and an error label. [Microsoft form example](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-form#examples).

Recognized display pairs are `Label.Text`, `Text.Text`, `ModernText.Text` and `HtmlViewer.HtmlText`. The check recognizes executable, unqualified form-error references, including quoted form names. It does not prove that the display is visible. References in nondisplay properties, strings, comments and ambiguous local scopes do not establish presentation. App-level error handling alone does not establish form-error presentation.

Absent and lexically empty handlers are considered empty. Any complete nonempty authored value counts as configured, including `=false`, `=Blank()` and `=""`; the rule does not grade handler usefulness. Partial formulas and duplicate properties are unknown and skipped. Unsubmitted forms, ambiguous names, dynamic targets, FormViewer and custom controls are outside the bound.

## Success notification

`success-notification-not-gated` observes a recognized direct write or uniquely resolved `SubmitForm` immediately followed by direct `Notify` whose entire second argument is `NotificationType.Success`. Message text is not used to infer success. Review synchronous write success handling or the submitted form's success event, as applicable. A standalone notification inside a success event does not match.

## Shared syntax limits

Calls require a leading `=` after YAML scalar decoding. The rules use original property text, ignore strings/comments, reject partial/interpolated or locale-ambiguous formulas, and distinguish built-ins from qualified lookalikes. Every substantive statement remains an adjacency barrier. Known symbol and enclosing `With`/`ForAll`/`As` exclusions are conservative; they are not a full scope or type system. Screen behavior properties are considered only when their authored property block was captured unambiguously. Existing validation, including REFUSE findings, remains independently authoritative.

Primary references checked 2026-09-08. Documentation establishes these WARN recommendations; no tenant compile evidence or catalog verification is claimed.
