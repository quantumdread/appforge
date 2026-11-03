# Accessibility rules — Canvas Apps

> Added 2026-08-27 (v2.4.3). Evidence class: **documented-consensus** — every rule below is grounded in Microsoft's published canvas-app accessibility guidance (links per section), not tenant-verified behavior. The lint tier mechanizes the checkable subset; everything here is WARN-only (accessibility findings are advisory, never compile-breakers). Relevant beyond good practice: public-sector Swedish deliveries fall under DOS-lagen (EU Web Accessibility Directive), which makes WCAG conformance contractual.

## The four machine-checked rules

### 1. Never set `TabIndex` greater than zero — `a11y-tabindex-positive`

Custom tab indexes are a **retired feature**: values greater than zero are treated as zero at runtime, and Microsoft's own Accessibility Checker flags them ("highly discouraged as it is hard to get right, maintain, and can break screen readers"). Navigation order should come from logical control/container structure instead.

- Use `0` (focusable) or `-1` (skipped). Nothing else.
- Source: [Organize controls in accessible canvas apps — custom tab indexes (retired)](https://learn.microsoft.com/power-apps/maker/canvas-apps/accessible-apps-structure#logical-keyboard-navigation-order), [Accessibility Checker issue types](https://learn.microsoft.com/power-apps/maker/canvas-apps/accessibility-checker#types-of-issues).

### 2. Interactive classic controls must be keyboard-reachable — `a11y-interactive-not-focusable`

A `Label`, `Image`, `Classic/Icon`, or shape control used as a button (it has an `OnSelect` behavior) defaults to `TabIndex: -1` — mouse users can click it, **keyboard users cannot reach it at all**. Microsoft: "Label, Image, Icon, Shape controls: Set TabIndex to 0 if they are meant to be interactive."

- Applies to classic-era controls, where `TabIndex` is the mechanism. Modern controls handle focus via `AcceptsFocus` with per-type defaults and are out of scope here. "Icon" here means `Classic/Icon` — the modern display `Icon` has no `OnSelect` in the catalog, and `Icon.AccessibleLabel` is a registered disproof (`disproofs.md`); nothing in this family may imply it exists.
- The `OnSelect: =Select(Parent)` click-through idiom inside galleries is exempt — the docs' recommended gallery-selection pattern routes activation through the row, and the row-level control carries the focus.
- Also set `FocusedBorderColor`/`FocusedBorderThickness` so the focus indicator is visible (not machine-checked — value judgment).
- Source: [Create accessible canvas apps — Keyboard](https://learn.microsoft.com/power-apps/maker/canvas-apps/accessible-apps), [Label control accessibility guidelines](https://learn.microsoft.com/power-apps/maker/canvas-apps/controls/control-text-box#accessibility-guidelines).

### 3. An icon/image/shape used as a button needs an `AccessibleLabel` — `a11y-icon-button-no-label`

"If a picture or an icon is used as a button, then set TabIndex to 0 and AccessibleLabel to the link description." An empty `AccessibleLabel` on Image/Icon/Shape controls **hides the control from screen readers** — correct for decoration, catastrophic for a button: the screen-reader user cannot know the button exists.

- A `Label` used as a button is exempt — screen readers announce its visible `Text`.
- Deliberately-empty `AccessibleLabel` on a *non-interactive* image/icon is correct practice (decorative), and no rule fires.
- Source: [Create accessible canvas apps — Screen readers](https://learn.microsoft.com/power-apps/maker/canvas-apps/accessible-apps#screen-readers), [Accessibility properties](https://learn.microsoft.com/power-apps/maker/canvas-apps/controls/properties-accessibility), [Image control accessibility guidelines](https://learn.microsoft.com/power-apps/maker/canvas-apps/controls/control-image#accessibility-guidelines).

### 4. Input controls should carry `AccessibleLabel` — `a11y-inputs-missing-accessiblelabel`

"Ensure all input controls have the AccessibleLabel property set" — the property defines what the screen reader announces when the user lands on the input. A visually adjacent Label is *not* programmatically associated with the input in canvas apps; without `AccessibleLabel` the screen reader announces only the control type. Galleries likewise: "AccessibleLabel must be present" (it contextualizes item-change announcements).

- To keep the signal readable, the lint reports this **aggregated per file** (one WARN naming the count and the first few control names), not one WARN per control.
- Catalog-gated: fires only for control types whose catalog entry actually has `AccessibleLabel`.
- Source: [Create accessible canvas apps — Layout and color / Screen readers](https://learn.microsoft.com/power-apps/maker/canvas-apps/accessible-apps), [Gallery control accessibility guidelines](https://learn.microsoft.com/power-apps/maker/canvas-apps/controls/control-gallery#accessibility-guidelines).

## Documented guidance NOT machine-checked (and why)

| Guidance | Why not a lint rule |
|---|---|
| One `Role: Heading1` Label per screen | Needs screen identity (file ≠ screen until the v2.4.5 AppBundle); revisit then. |
| 4.5:1 color contrast | Computable only for literal color pairs against the *effective* background — resolving fills through containers/themes needs the whole-app model; queued behind the tokenizer + AppBundle. |
| `PenInput` requires an alternative input method | Whether a nearby TextInput is the alternative is a semantic judgment, not a property check. |
| Meaningful screen names, captions/transcripts for media, `Live` regions for dynamic text | Content judgments; a validator asserting them would fabricate confidence. |
| `ShowValue` on toggles/sliders | Candidate for a later rule — deferred until the family earns trust in the field. |

## Authoring defaults (for generation, not enforcement)

- Every input control the generator emits should include a meaningful `AccessibleLabel`.
- Icon-as-button: `TabIndex: =0` + `AccessibleLabel` describing the **action** ("Stäng dialogen"), not the glyph ("kryss").
- Decorative icons/images: leave `AccessibleLabel` unset/empty and `TabIndex: =-1` — hidden from screen readers by design.
- Never emit `TabIndex` above 0.
