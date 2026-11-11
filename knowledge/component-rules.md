# PowerApps Component YAML Rules
Generated from working component examples + MS Learn documentation

---

## Component Libraries (Recommended for Reuse)

### What Are Component Libraries
Centralized repositories of reusable components that enable:
- Discovery and sharing across organization
- Centralized publishing with version control
- Automatic update notifications to consuming apps
- Consistency enforcement across enterprise

### Creating a Component Library
1. Power Apps > Component libraries > New component library
2. Add components (same process as app components)
3. Test using screens within the library (testing-only)
4. **File > Save > Add Version Note** (critical for tracking)
5. **Publish > Publish component library version**

**CRITICAL:** Only published updates are visible to consuming apps.

### Importing Library Components
1. Open app > Insert > Get more components
2. Select individual components or "Select all"
3. Components appear under "Library components" in Insert pane

### Customization Setting
- **Allow customization ON:** Apps can create local copies (breaks library link)
- **Allow customization OFF:** Component can only be edited in source library

### Update Flow
1. Library owner publishes new version with notes
2. Consuming apps receive notification
3. Maker reviews version notes and updates

---

## Component Structure

```yaml
ComponentDefinitions:
  ComponentName:
    DefinitionType: CanvasComponent
    AccessAppScope: true  # Required if using Navigate(), Screen references, or User()
    CustomProperties:
      # Property definitions here
    Properties:
      # Output property VALUES here (NOT Input properties!)
      # Also component-level properties: Fill, Height, Width
    Children:
      # Component controls here
```

### Server-Canonical Component File Layout

<!-- verified: true, verified_at: 2026-07-19, verified_by: compile_canvas -->

Store each component in its own file at `Components/<cName>.pa.yaml`. Every component file has its own top-level `ComponentDefinitions:` block:

```text
Components/
  cHeader.pa.yaml
  cWizardSteps.pa.yaml
```

This one-file-per-component layout is the standard compile-path source layout. `sync_canvas` returns components in this shape.

## AccessAppScope Property

**When to use `AccessAppScope: true`:**
- Component uses `Navigate()` to switch screens
- Component references Screen names in properties
- Component uses `User()` function for current user info
- Component needs access to app-level context
- **CRITICAL: Component uses `Set()` for internal state management**

**Without AccessAppScope**, the component is isolated and cannot access screens, app-level functions, **or use Set() for global variables**.

### Self-Managing Components Pattern
Components can manage their own internal state using global variables with the `_prefix` convention:

```yaml
ComponentDefinitions:
  cMyComponent:
    AccessAppScope: true  # REQUIRED for Set()
    CustomProperties:
      SelectedItem:
        PropertyKind: Input
        DataType: Number
        Default: =1
      ClickedItem:
        PropertyKind: Output
        DataType: Number
    Properties:
      # Coalesce pattern: use internal state if set, otherwise fall back to input
      ClickedItem: =Coalesce(_mySelectedItem, cMyComponent.SelectedItem)
    Children:
      - btnSelect:
          Control: Classic/Button
          Properties:
            OnSelect: |-
              =Set(_mySelectedItem, 2); cMyComponent.OnSelect()
```

The `SelectedItem` Input in this example is read without parentheses: `cMyComponent.SelectedItem` (compile evidence, 2026-10-06).

**Key pattern:** `Coalesce(_internalVar, Component.InputProp)` allows the component to be either:
- Controlled by parent (parent sets SelectedItem)
- Self-managing (internal clicks update _mySelectedItem)

## PropertyKind Types

### Property Type Matrix

| Type | Direction | Purpose | Side Effects | Data Flow |
|------|-----------|---------|--------------|-----------|
| **Input** | Parent → Component | Pass values in | No | Yes |
| **Output** | Component → Parent | Expose state | No | Yes |
| **Event** | Component → Parent handler | Component raises, app handles | Depends | No |

### Validator Semantics

| Rule ID | Level | Meaning |
|---------|-------|---------|
| `component-name-required` | REFUSE | A `CanvasComponent` instance must declare `ComponentName`. |
| `component-custom-property` | WARN | A component-instance property cannot be verified because its definition is absent, or is not declared by the referenced component. |
| `custom-property-kind` | REFUSE | A custom-property definition has a missing or unknown `PropertyKind` (other than a recognized server-materialized kind), or an Event lacks `ReturnType`. |
| `materialized-property-kind` | WARN | A synced-back definition uses server-materialized `InputFunction`, `OutputFunction`, or `Action`; authored source should use `Input`, `Output`, or `Event`. |
| `output-property-default` | REFUSE | An Output definition declares `Default`; define its value in the component `Properties:` block instead. |
| `custom-property-datatype` | WARN | An Input or Output uses a `DataType` outside the validator's known-legal set. |
| `event-default-recommended` | WARN | An Event lacks the recommended `Default: =false`. |

### Input Properties
<!-- verified: true, verified_at: 2026-07-19, verified_by: compile_canvas -->
- **PropertyKind: Input** - Input values from parent
- Require: DisplayName, Description, DataType
- Optional: Default (with proper format)
- Input properties DO NOT go in Properties section

Inside a component definition, read an authored Input without parentheses using the definition name, for example `Text: =cMyComponent.InputText`. On a screen, read an instance Output without parentheses, for example `Text: =cMyComponent_1.OutputValue`. Use the definition name rather than `Parent.PropName` for its Input reads.

Compile evidence on 2026-10-06 (authoring service v3.26093.10): `cProbeParen.Msg()` was rejected as an unknown or unsupported function in the component namespace, while `cProbeBare.Msg` compiled; sync retained `PropertyKind: Input`. The July 2026 `()` form relied on server `InputFunction` materialization that no longer happens in this probe. Assignments on an instance remain plain property assignments, for example `ActiveStep: =3` and `BadgeText: ="text"`.

### Output Properties
- **PropertyKind: Output** - Output values to parent
- Require: DisplayName, Description, DataType
- Output property VALUES MUST be defined in Properties section
- **NEVER use Default in Output property definition** - causes error: `The schema keyword 'Default' is not known or allowed in this context`

```yaml
# WRONG - Default not allowed on Output
CustomProperties:
  ClickedItem:
    PropertyKind: Output
    DataType: Number
    Default: =0  # ERROR!

# CORRECT - Value goes in Properties section
CustomProperties:
  ClickedItem:
    PropertyKind: Output
    DataType: Number
Properties:
  ClickedItem: =Coalesce(_selectedItem, 0)
```


Compile evidence on 2026-10-06 (authoring service v3.26093.10): a screen Label calling an instance's authored Output as `crumbs_1.SelectedStep()` failed with an unknown or unsupported function in namespace `crumbs_1`, while `crumbs_1.SelectedStep` compiled in both a Label and the instance's `OnStepSelect` handler and Studio displayed the value.

### Event Properties
- **PropertyKind: Event** - Component raises, parent handles (Input direction)
- Require: DisplayName, Description, ReturnType
- Optional: Default
- Event values go in Properties section only when ReturnType is not None

**Event Pattern:**
```yaml
CustomProperties:
  OnButtonClicked:
    PropertyKind: Event
    DisplayName: On Button Clicked
    Description: Fired when button clicked
    ReturnType: None
    Default: =false
# Inside component: Button.OnSelect = Component1.OnButtonClicked()
# Parent assigns handler: OnButtonClicked: =Notify("Clicked!")
```

### Key Differences
- **Event** properties are invoked BY the component, handled BY the parent
- The authored source contract supports `Input`, `Output`, and `Event`
- Recognized server-materialized kinds (`InputFunction`, `OutputFunction`, and `Action`) WARN; unknown kinds REFUSE validation

## DataType Options

### Basic Types
- `Text` - String values (Default: ="Text")
- `Number` - Numeric values (Default: =100)
- `Boolean` - True/False (Default: =true)
- `Color` - Color values (Default: =RGBA(0, 0, 0, 1) or =Color.Transparent)
- `Currency` - Money values (Default: =100)

### Complex Types
- `Record` - Single record (Default: ={Field1: "Value", Field2: 10})
- `Table` - Table of records (Default: =Table({Field1: "Value"}))
- `Image` - Image reference (Default: =SampleImage)
- `VideoOrAudio` - Media reference (Default: =SampleAudio)
- `Screen` - Screen reference (Default: =App.ActiveScreen)

### Date/Time
- `DateAndTime` - DateTime value
- Default format: =DateTime(2000, 1, 1, 0, 0, 0)
- Note: Use `DateAndTime` not `DateTime` as DataType

---

## Behavior Properties (OnReset)

**OnReset** is the only production-ready behavior property. It executes formulas when `Reset()` is called on the component.

### Configuring OnReset (Studio UI Only)
OnReset **cannot be defined in YAML** - must be configured in Power Apps Studio:
1. Select the component master
2. Open properties dropdown (left side of formula bar)
3. Select "OnReset"
4. Enter formula(s)

### OnReset Patterns

**State Initialization:**
```powerfx
Set(_selectedHour, 12); Set(_selectedMinute, 0)
```

**Reset from Parent:**
```powerfx
// Parent button
OnSelect: =Reset(TimerComponent_1)
```

**Property-Triggered OnReset:**
1. Create custom input property (e.g., `DefaultValue`)
2. Enable "Raise OnReset when value changes" checkbox
3. OnReset formula responds to property changes:
```powerfx
Set(_numericValue, Component1.DefaultValue)
```

### Use With Control Default Property
```yaml
# Component control
Default: =If(IsBlank(_internalVariable), cComponent.DefaultValue, _internalVariable)
```

### YAML Comment Pattern
Since OnReset can't be defined in YAML, document requirements:
```yaml
ComponentDefinitions:
  cMyComponent:
    # STUDIO CONFIGURATION REQUIRED:
    # OnReset: Set(_selectedValue, cMyComponent.DefaultValue)
    # For DefaultValue property: enable "Raise OnReset when value changes"
```

---

## Control Versions — Legacy (Studio Paste Path Only)

This table records legacy Studio paste-path versions; it is not control-choice or generation guidance. Follow `generator-rules.md` §3a for new controls. Compile-path YAML uses bare control types such as `Control: Label` and `Control: Classic/Button`; version pins compile but are stripped on round-trip. Do not put version pins in document examples. <!-- verified: true, verified_at: 2026-07-19, verified_by: compile_canvas -->

### Unprefixed controls (legacy pins; never generate the superseded ones)
`Text`, `Button`, `Icon`, `TextInput`, `Radio`, `DatePicker`, `Slider` and `CheckBox` below are the superseded FluentV9 types. Do not generate them, with or without a pin: use `ModernText`, `ModernButton`, `ModernIcon` and the other `Modern*` types (see `generator-rules.md` §3a). Studio lists them under "controls that can be updated".

- `Text@0.0.51` - superseded by `ModernText`
- `Button@0.0.45` - Recorded superseded metadata; `ModernButton` is the separate React type
- `Icon@0.0.7`
- `TextInput@0.0.54`
- `Gallery@2.15.0`
- `Image@2.2.3`
- `Label@2.5.1`
- `Rectangle@2.3.0` - Recorded legacy metadata, not a generation recommendation
- `GroupContainer@1.4.0` - Recorded legacy metadata, not a generation recommendation
- `Radio@0.0.25`
- `DatePicker@0.0.46`
- `Slider@1.0.32`
- `CheckBox@0.0.30`

### Classic Controls (require Classic/ prefix)
- `Classic/ComboBox@2.4.0`
- `Classic/Icon@2.5.0`
- `Classic/Button@2.2.0`
- `Classic/DatePicker@2.3.1` - Superseded on the legacy paste path; use `@2.6.0`, not `@2.3.1`
- `Classic/DropDown@2.3.1`
- `Classic/TextInput@2.3.2`

## Properties Section Rules

### What goes in Properties section:
1. **Output property values** - ALL Output properties must have values here
2. **Event property values** - ONLY if ReturnType is not None

### What does NOT go in Properties section:
1. **Input properties** - Never put input properties here
2. **Events with ReturnType: None** - These don't get values

## Important Rules

### Component Self-References
<!-- Input-read syntax re-checked: 2026-10-06, evidence: compile_canvas probe -->
- Use the component name as defined in ComponentDefinitions
- Read authored Input properties without parentheses inside the definition; callable kinds and Events retain call syntax
- Example: For `cTextInput`, use `cTextInput.PropertyName` in formulas

### App-Scope Variables
<!-- verified: true, verified_at: 2026-07-19, verified_by: compile_canvas -->
- Components can use `Set()` when `AccessAppScope: true` is declared
- Without app scope, pass values through custom properties

### Block Scalars
- Use `|-` for multi-line formulas or formulas with special characters
- Required for: Tables, Records, complex formulas

### Radius Properties
**IMAGE controls** support individual radius properties:
- RadiusTopLeft
- RadiusTopRight
- RadiusBottomLeft
- RadiusBottomRight

**RECTANGLE controls** do NOT support radius properties (use Image with Fill instead for rounded corners)

### Gallery Variants
Galleries MUST have a Variant property. Options:
- `Variant: Vertical` - Simple vertical list (most common)
- `Variant: Horizontal` - Horizontal scrolling list
- `Variant: VariableHeight` - Vertical list with per-item height
- `Variant: BrowseLayout_Vertical_TwoTextOneImageVariant_ver5.0`, `BrowseLayout_Horizontal_TwoTextOneImageVariant_ver5.0`, `BrowseLayout_Flexible_SocialFeed_ver5.0` - Studio's current "Layout" presets (compile-verified 2026-10-06)

**Note:** The `ver5.0` presets are insert presets of the same `Gallery` control, not a modern gallery: Studio prefills them with classic children. Prefer `Vertical`, `Horizontal` or `VariableHeight` and author your own template.

### ✅ Gallery Inside Components - WORKS!
Galleries can be used inside components with Table() built from component properties:

```yaml
- galNavItems:
    Control: Gallery
    Variant: Vertical
    Properties:
      Items: |-
        =Table(
            {ID: 1, Label: cComponent.Nav1Label, Icon: cComponent.Nav1Icon},
            {ID: 2, Label: cComponent.Nav2Label, Icon: cComponent.Nav2Icon},
            {ID: 3, Label: cComponent.Nav3Label, Icon: cComponent.Nav3Icon}
        )
      TemplateSize: =48
      TemplatePadding: =0
    Children:
      - lblItem:
          Control: Label
          Properties:
            Text: |-
              =ThisItem.Label
      - btnItem:
          Control: Classic/Button
          Properties:
            OnSelect: |-
              =Set(_selectedItem, ThisItem.ID); cComponent.OnSelect()
```

**Key patterns:**
- Build Table() inline from component input properties
- Use ThisItem in Gallery children
- This classic example uses `Classic/Button` for click handling (can use Set() with AccessAppScope); new buttons follow `generator-rules.md` §3a.

### ✅ Nested GroupContainers - WORKS!
GroupContainers can be nested inside components for organization:

```yaml
- grpMain:
    Control: GroupContainer
    Variant: ManualLayout
    Properties:
      X: =0
      Y: =0
      Width: =Parent.Width
      Height: =Parent.Height
    Children:
      - grpHeader:
          Control: GroupContainer
          Variant: ManualLayout
          Properties:
            X: =0
            Y: =0
            Width: =Parent.Width
            Height: =64
          Children:
            - lblTitle:
                Control: Label
                Properties:
                  Text: |-
                    ="Header"
      - grpContent:
          Control: GroupContainer
          Variant: ManualLayout
          Properties:
            X: =0
            Y: =64
            Width: =Parent.Width
            Height: =Parent.Height - 64
```

**Key patterns:**
- Use `Variant: ManualLayout` for pixel-perfect positioning
- Nest containers for logical grouping (header, content, footer)
- Children positioned relative to their parent container

### Font References
- Use: `Font: =Font.'Segoe UI'` or `Font: =Font.'Open Sans'`
- Not: `Font: =varFont`

### Input Property with Table DataType (Navigation Example)
When creating navigation components, Table inputs can include Screen references:

```yaml
NavItems:
  PropertyKind: Input
  DisplayName: NavItems
  Description: Navigation items
  DataType: Table
  Default: |-
    =Table(
        {Title: "Home", Screen: HomeScreen, Icon: Icon.Home},
        {Title: "Settings", Screen: SettingsScreen, Icon: Icon.Settings}
    )
```

**Requirements for Screen references in Tables:**
- Component must have `AccessAppScope: true`
- Screen names must exist in the app
- Use `Navigate(ThisItem.Screen)` to navigate

### Event Handlers in Components
<!-- verified: true, verified_at: 2026-07-19, verified_by: compile_canvas -->
- Raise an Event from inside the component with function-call syntax: `OnSelect: =cModal.OnClose()`
- Assign the handler on the consuming instance as a plain property: `OnClose: =Notify("Closed")`

### Select() Function for Control Chaining
Use `Select(ControlName)` to programmatically trigger another control's OnSelect:
```yaml
- TextNavigation:
    Control: Label
    Properties:
      OnSelect: =Select(IconNavigation)  # Triggers IconNavigation.OnSelect
```
This allows multiple controls to share the same action without duplicating code.

### DateTime vs DateAndTime
- DataType should be: `DateAndTime`
- Default format: `=DateTime(2000, 1, 1, 0, 0, 0)`

## Example: Minimal Working Component

```yaml
ComponentDefinitions:
  MyComponent:
    DefinitionType: CanvasComponent
    CustomProperties:
      InputText:
        PropertyKind: Input
        DisplayName: Input Text
        Description: Text input from parent
        DataType: Text
        Default: ="Default"
      OutputValue:
        PropertyKind: Output
        DisplayName: Output Value
        Description: Value to parent
        DataType: Number
      OnChange:
        PropertyKind: Event
        DisplayName: On Change
        Description: Fired when changed
        ReturnType: None
        Default: =false
    Properties:
      OutputValue: =100
    Children:
      - lblMain:
          Control: Label
          Properties:
            Text: =MyComponent.InputText
            X: =0
            Y: =0
```

## Example: Navigation Menu Component (Working)

```yaml
ComponentDefinitions:
  LeftMenu:
    DefinitionType: CanvasComponent
    AccessAppScope: true
    CustomProperties:
      MenuWidth:
        PropertyKind: Output
        DisplayName: MenuWidth
        Description: The width of the component
        DataType: Number
      NavItems:
        PropertyKind: Input
        DisplayName: NavItems
        Description: Items for the navigation
        DataType: Table
        Default: |-
          =Table(
              {Title: "Home", Screen: HomeScreen, Icon: Icon.Home},
              {Title: "Settings", Screen: SettingsScreen, Icon: Icon.Settings}
          )
    Properties:
      Fill: =RGBA(38, 38, 38, 1)
      Height: =Max(App.Height) - 66
      MenuWidth: =If(varOpenMenu, 350, Max(App.Width, App.DesignWidth)/15)
      Width: =LeftMenu.MenuWidth
    Children:
      - IconHamburger:
          Control: Classic/Icon
          Properties:
            Color: =RGBA(255, 255, 255, 1)
            Icon: =If(varOpenMenu, Icon.Cancel, Icon.Hamburger)
            OnSelect: =Set(varOpenMenu, !varOpenMenu)
            Height: =91
            Width: =91
            Y: =84
      - GalleryNavigation:
          Control: Gallery
          Variant: Vertical
          Properties:
            Items: =LeftMenu.NavItems
            TemplateSize: =47
            Width: =If(varOpenMenu = false, 91, 350)
            Height: =500
            Y: =153
          Children:
            - IconNavigation:
                Control: Classic/Icon
                Properties:
                  Icon: =ThisItem.Icon
                  Color: =RGBA(255, 255, 255, 1)
                  OnSelect: =Navigate(ThisItem.Screen); Set(varOpenMenu, false)
                  Height: =26
                  Width: =26
                  X: =26
                  Y: =10
            - TextNavigation:
                Control: Label
                Properties:
                  Text: =ThisItem.Title
                  Color: =RGBA(255, 255, 255, 1)
                  OnSelect: =Select(IconNavigation)
                  PaddingLeft: =90
                  Height: =47
                  Width: =340
      - UserImage:
          Control: Image
          Properties:
            Image: =User().Image
            RadiusTopLeft: =50
            RadiusTopRight: =50
            RadiusBottomLeft: =50
            RadiusBottomRight: =50
            Height: =60
            Width: =60
            X: =15
            Y: =24
      - UserFullName:
          Control: Label
          Properties:
            Text: =User().FullName
            Color: =RGBA(255, 255, 255, 1)
            FontWeight: =FontWeight.Semibold
            X: =91
            Y: =42
```

**Key patterns from this working component:**
1. `AccessAppScope: true` enables Navigate() and User()
2. Component reads its Output without parentheses: `Width: =LeftMenu.MenuWidth`
3. App state variable `varOpenMenu` used for toggle state
4. Gallery Children reference `ThisItem` properties
5. `Select(IconNavigation)` triggers another control's OnSelect
6. Image radius properties create circular user avatar

## Example: Wizard Step Bar with Screen-Local Save Logic

<!-- verified: true, verified_at: 2026-10-06, verified_by: compile_canvas -->

This `cStepBar` is copied verbatim from the [compiled example](examples/cStepBar.pa.yaml). A single `ModernTabList` raises `OnStepSelect()` and exposes `SelectedStep`; the consuming screen reads that Output without parentheses and owns save-then-navigate behavior. Input and Output reads are bare; only Events use `()`.

```yaml
ComponentDefinitions:
  cStepBar:
    DefinitionType: CanvasComponent
    AccessAppScope: true
    CustomProperties:
      ActiveStep:
        PropertyKind: Input
        DisplayName: Active Step
        Description: Current wizard step (1-5)
        DataType: Number
        Default: =1
      OnStepSelect:
        PropertyKind: Event
        DisplayName: On Step Select
        Description: Raised when a step is tapped; read SelectedStep in the handler
        ReturnType: None
        Default: =false
      SelectedStep:
        PropertyKind: Output
        DisplayName: Selected Step
        Description: Step id the user tapped
        DataType: Number
    Properties:
      Height: =44
      SelectedStep: =Coalesce(_stepBarTapped, 0)
    Children:
      - tabStepBar:
          Control: ModernTabList
          Properties:
            AccessibleLabel: ="Wizard steps"
            Default: |-
              =LookUp(
                  ForAll(
                      Table({ID: 1, Name: "Details"}, {ID: 2, Name: "Product"}, {ID: 3, Name: "Settings"}, {ID: 4, Name: "Extras"}, {ID: 5, Name: "Finish"}),
                      {ID: ThisRecord.ID, Value: If(ThisRecord.ID < cStepBar.ActiveStep, "✓ ", "") & ThisRecord.Name}
                  ),
                  ID = cStepBar.ActiveStep
              )
            Height: =Parent.Height
            ItemDisplayText: =ThisItem.Value
            Items: |-
              =ForAll(
                  Table({ID: 1, Name: "Details"}, {ID: 2, Name: "Product"}, {ID: 3, Name: "Settings"}, {ID: 4, Name: "Extras"}, {ID: 5, Name: "Finish"}),
                  {ID: ThisRecord.ID, Value: If(ThisRecord.ID < cStepBar.ActiveStep, "✓ ", "") & ThisRecord.Name}
              )
            OnChange: |-
              =Set(_stepBarTapped, Self.Selected.ID);
              cStepBar.OnStepSelect()
            Width: =Parent.Width
```

The July `cWizardSteps` version used classic `Label`, `Rectangle`, and a classic `Button` tap overlay in a `Gallery`. It is superseded by this current-generation step bar. The `server/test/fixtures/cDemoWizard*` files remain corpus/regression inputs and are not generation guidance.

## Common Errors and Fixes

1. **"Unknown property for canvas component"** - Property in wrong section
2. **"PropertyKind is required"** - Missing PropertyKind on CustomProperty
3. **"Unknown control type"** - Missing `Classic/` prefix or unsupported control type
4. **YAML syntax error** - DateTime properties shouldn't have Default values in some cases
5. **Component not showing** - Check if Output properties are in Properties section
6. **"Unknown property RadiusTopLeft"** - Rectangle doesn't support radius properties
7. **"Unknown property MinDate/MaxDate"** - Classic/DatePicker doesn't support these

## CRITICAL RULES - DO NOT VIOLATE

### ⚠️ Global Variables in Components - CLARIFIED
**Theme variables are NOT allowed:**
- Cannot use: varColorPrimary, varFont, varColorText, varColorBorder, varTheme, etc.
- Must use explicit values:
  - Colors: RGBA(r, g, b, a) format
  - Sizes: Numeric values (10, 12, 14, 18)
  - Fonts: Font.'Segoe UI' or Font.'Open Sans'

**App state variables ARE allowed (with AccessAppScope: true):**
- Can use: varOpenMenu, varSelectedItem, varUserRole, etc.
- These are app-level state variables, not theme variables
- Requires `AccessAppScope: true` on the component

### ❌ NO Radius on Rectangle Controls
- Rectangle controls do NOT support: RadiusTopLeft, RadiusTopRight, etc.
- Only Image controls support radius properties
- For rounded corners: Use Image control with Fill color

### ✅ Event Invocation in Components
<!-- verified: true, verified_at: 2026-07-19, verified_by: compile_canvas -->
- A component raises an Event by calling it, for example `OnSelect: =cModal.OnConfirm()`
- The consuming instance assigns the handler as a plain property, for example `OnConfirm: =Notify("Confirmed")`
- Event invocation uses the component definition name; instance handlers read Outputs without parentheses

### ⚠️ OnSelect Property Handling (Testing)
- Interactive buttons and `ModernIcon` use `OnSelect`; current `ModernIcon` clicks were Preview-verified on 2026-10-06
- Option 1: Omit OnSelect entirely (testing in cToastTest)
- Option 2: Use `OnSelect: =false` (current approach in cModal/cToast)
- Note: cDatePicker has `OnSelect: =false` on iconHelp and works

### ❌ NO External Collections in Components
- Components cannot reference collections defined outside (e.g., colFieldHelp, colStatus)
- Components are isolated and can only use their own properties
- Pass needed data through Input properties instead
- Example: Instead of `LookUp(colFieldHelp, Field = HelpKey)`, pass the value in and read it as `cComponent.HelpKey`

### ❌ NO Inline Comments in YAML
- PowerApps YAML doesn't support inline comments
- Wrong: `Properties: {}  # Required section`
- Right: `Properties: {}`
- Comments on their own line may be okay, but avoid inline comments

### ⚠️ Label Text Block Scalars — Studio Paste Path Only
<!-- Historical paste-path evidence: 2026-07-19; Input-read syntax corrected from 2026-10-06 compile probe -->
- On the legacy Studio paste path, use block scalar `|-` format for Label `Text` properties to avoid the observed silent failure
- On the compile path, a single-line property reference such as `Text: =cComponent.Title` uses the bare Input-read syntax accepted by the 2026-10-06 compile probe

```yaml
# LEGACY STUDIO PASTE PATH - May cause silent failure
Text: =cComponent.Title
Text: ="Static Text"

# LEGACY STUDIO PASTE PATH - Use block scalar
Text: |-
  =cComponent.Title
Text: |-
  ="Static Text"
```

### ✅ Current ModernIcon and Classic Icon Names
Use `ModernIcon` for decorative and interactive icons. It has `OnSelect` (compile and Preview evidence, 2026-10-06), a text `Icon` name, and `IconColor`. Use `Classic/Icon` only when the required classic `Icon` enum value has no current text name. The bare FluentV9 `Icon` has no `OnSelect` and belongs to the previous generation; do not generate it. See the compile and Studio evidence, 2026-10-06.

### ✅ Properties Section Rules
- Properties section is REQUIRED even if empty (use `Properties: {}`)
- Output properties MUST have initial values in Properties section
- Input properties NEVER go in Properties section
- Event properties with ReturnType: None don't go in Properties section
- Events with ReturnType other than None need values in Properties

### ❌ NO Set() on Component Properties
- Components CANNOT use Set() on their own properties
- Component properties are not variables - they're component attributes
- Wrong: `=Set(cComponent.OutputProp, value)`
- Consider removing Output properties entirely
- Parent should manage state through Input properties with two-way binding

### ✅ Classic/DatePicker Requirements
- Classic/DatePicker does NOT support MinDate, MaxDate, or HoverBorderColor
- Use DateAndTime as DataType, not DateTime
- DateAndTime properties MUST have Default value (e.g., =Today())
- Use Format: =DateTimeFormat.ShortDate (not custom strings)
- On the compile path, use the bare `Classic/DatePicker` control type
- On the legacy Studio paste path, use `@2.6.0`, not `@2.3.1`
- Properties needed: DefaultDate, StartOfWeek, DateTimeZone, Format

### ✅ Compile-Path Control Types
- Timer: use the bare `Timer` control type
- Timer uses OnTimerEnd not OnEnd for completion event
- Classic/DatePicker: use the bare `Classic/DatePicker` control type
- Consult the legacy table above only for the Studio paste path

### ✅ Component Self-References
<!-- Input-read syntax re-checked: 2026-10-06, evidence: compile_canvas probe -->
- Use the exact component name and read Inputs without parentheses: `cTextInput.PropertyName`
- Be consistent with naming throughout the component
- Common mistake: using ccTextInput when component is named cTextInput
- Always use the exact name from ComponentDefinitions section

### ✅ ComboBox vs DropDown
- Owner practice (2026-10-06): prefer ComboBox over DropDown because it does the same job and more; use checkboxes rather than radios when several choices may apply.
- Default to `ModernCombobox` under `generator-rules.md` §3a. It still lacks `DisplayFields`/`SearchFields`; use `Classic/ComboBox` only when those field-list capabilities are required and name them in the spec. `ItemDisplayText` is a manual display-formula option, not a search-field list.
- `ModernCombobox` uses `DefaultSelectedItems`; `ModernDropdown` uses a `Default` record.

### ✅ Current ModernButton Properties
- New buttons default to `ModernButton` under `generator-rules.md` §3a.
- Cataloged properties include `BasePaletteColor`, `Color`, `Appearance` (`ButtonAppearance`), `Size`, `FontWeight`, `Tooltip`, and text `Icon`.
- Corners use `RadiusBottomLeft`, `RadiusBottomRight`, `RadiusTopLeft`, and `RadiusTopRight`.
- Exact `Fill`, `HoverFill`, or `PressedFill` overrides still need `Classic/Button`; name the required property. Use `Gallery.OnSelect` for row taps when that does the whole job.

### ✅ Transparent Button Overlay Pattern
This classic example uses `Classic/Button` because the overlay requires `Fill`, `HoverFill` and `PressedFill`, which `ModernButton` lacks in the catalog:

```yaml
# Background shape (not clickable)
- cirDay1:
    Control: Circle
    Properties:
      Fill: =RGBA(59, 108, 125, 1)
      X: =10
      Y: =10
      Width: =40
      Height: =40

# Label on top (not clickable)
- lblDay1:
    Control: Label
    Properties:
      Text: |-
        ="1"
      Align: =Align.Center
      X: =10
      Y: =10
      Width: =40
      Height: =40

# Invisible button overlay (handles click)
- btnDay1:
    Control: Classic/Button
    Properties:
      Text: |-
        =""
      Fill: =RGBA(0, 0, 0, 0)
      Color: =RGBA(0, 0, 0, 0)
      BorderColor: =RGBA(0, 0, 0, 0)
      HoverFill: =RGBA(0, 0, 0, 0)
      PressedFill: =RGBA(0, 0, 0, 0)
      OnSelect: =Set(_selectedDay, 1)
      X: =10
      Y: =10
      Width: =40
      Height: =40
```

**Key:** Match X/Y/Width/Height exactly with the target control.

### ✅ Classic/Icon State Properties
- Use bare `Classic/Icon`
- State properties (all optional but recommended for polish):
  - `Color`, `HoverColor`, `PressedColor`, `DisabledColor`
  - `Fill`, `HoverFill`, `PressedFill`, `DisabledFill` (typically transparent)
  - `BorderColor`, `HoverBorderColor`, `PressedBorderColor`, `DisabledBorderColor`
  - `FocusedBorderThickness` (for accessibility)
- Padding: `PaddingLeft`, `PaddingRight` (not PaddingTop/PaddingBottom)
- Icon property accepts: `=Icon.Home`, `=Icon.Settings`, `=ThisItem.Icon`, or conditional `=If(var, Icon.Cancel, Icon.Hamburger)`

### ✅ Component-Level Properties
Components can have their own properties in the Properties section:
- `Fill` - Background color of component
- `Height` - Height formula (can use `App.Height`, `Parent.Height`)
- `Width` - Width formula (can reference own Output: `=ComponentName.OutputProperty`) <!-- verified: true, verified_at: 2026-10-06, verified_by: compile_canvas (bare form; the 2026-07-19 stamp covered the () form, which now fails) -->
- These are set alongside Output property values

---

## Naming Conventions

### Component Naming
**Format:** `c` + PascalCase descriptive name
```
cNavigationMenu
cTextInput
cDatePicker
cModal
cToast
```

### Control Naming Inside Components
**Format:** Three-letter prefix + descriptive name
```
lbl = Label         (lblTitle, lblError)
btn = Button        (btnSubmit, btnCancel)
txt = TextInput     (txtEmail, txtSearch)
gal = Gallery       (galNavigation, galItems)
icn = Icon          (icnHelp, icnClose)
img = Image         (imgUser, imgLogo)
rec = Rectangle     (recBackground, recBorder)
grp = GroupContainer (grpHeader, grpContent)
chk = CheckBox      (chkAgree, chkActive)
drp = DropDown      (drpCategory, drpStatus)
cmb = ComboBox      (cmbUsers, cmbTags)
dat = DatePicker    (datStart, datEnd)
```

### Property Naming
- **Input properties:** Descriptive nouns (Title, DefaultValue, Items)
- **Output properties:** State nouns (SelectedItem, Value, IsValid)
- **Events:** `On` + verb (OnClick, OnChange, OnClose)
- **Actions:** Verbs (Reset, Clear, Submit)

### Internal Variables
Use underscore prefix for component-scoped variables:
```
_selectedValue
_isExpanded
_currentIndex
```

---

## Component vs UDF — decision guide

<!-- verified: true, verified_at: 2026-07-19, verified_by: compile_canvas -->

Use components for repeatable UI chrome when there are at least two consumers and placement is outside a gallery template: headers, navigation, wizard breadcrumbs, and static information rows.

Components cannot be placed in gallery templates. Centralize gallery-bound repetition—card styling, badge text/color logic, and formatting that depends on `ThisItem`—as UDFs or named formulas in `App.Formulas` instead.

| Situation | Use |
|-----------|-----|
| ≥2 consumers + static placement | Component |
| Any count + gallery template | UDF / named formula |
| 1 consumer | Neither; inline it |

---

## Component Library Limitations

### Known Limitations
1. **Cannot import locally saved libraries** - Must use cloud-saved
2. **Code components (PCF) not supported** in libraries
3. **Components cannot be pasted** from libraries in Code View
4. **Cannot delete library** if referenced by any app
5. **Power Automate flows** not supported in component libraries

### Component Placement Restrictions
Cannot insert components into:
- Gallery controls
- Forms (including SharePoint forms)

### Unsupported Functions in Components
- `UpdateContext()` - Use `Set()` instead
- External collections - Pass data through Input properties

---

## Using Components in Screens (Instantiation)

When placing a component instance on a screen, use this syntax:

```yaml
Children:
  - cMyComponent_1:
      Control: CanvasComponent
      ComponentName: cMyComponent
      Properties:
        Title: ="Page Title"
        OnClick: |-
          =Navigate(OtherScreen)
        X: =0
        Y: =0
        Width: =240
        Height: =Parent.Height
```

Instance assignments remain plain (`Title: ="Page Title"`, `ActiveStep: =3`). <!-- verified: true, verified_at: 2026-07-19, verified_by: compile_canvas -->

Formulas that read an instance Output use bare members, for example `Text: =cMyComponent_1.OutputValue`.

**Key rules:**
- `Control: CanvasComponent` - ALWAYS use this literal value
- `ComponentName: cMyComponent` - Reference the component definition name
- Instance name typically has `_1`, `_2` suffix for multiple instances

**WRONG:**
```yaml
- cMyComponent_1:
    Control: cMyComponent
    Properties:
```

**CORRECT:**
```yaml
- cMyComponent_1:
    Control: CanvasComponent
    ComponentName: cMyComponent
    Properties:
```

---

## Enhanced Component Properties (Experimental)

Power Apps Studio has an experimental "Enhanced component properties" setting, but this repository's authored source contract and validator support only `Input`, `Output`, and `Event`. Do not author `InputFunction`, `OutputFunction`, or `Action` as `PropertyKind` values. The `InputFunction` value observed after syncing in July 2026 was server materialization of an authored `Input`, not the source form to write; the 2026-10-06 probe retained `Input` instead.

### Validating synced-back files

Files returned by `sync_canvas` can carry server-materialized `InputFunction`, `OutputFunction`, or `Action` values. Validation reports these as `materialized-property-kind` WARN findings, not REFUSE findings; authored source should still use `Input`, `Output`, or `Event`.

---

## Input Field Mapping

When component schema differs from data source, use mapping functions.

### RenameColumns() - For Tables
```yaml
Items: |-
  =RenameColumns(
      Products,
      "cra56_productname", "Name",
      "cra56_price", "Price",
      "cra56_qty", "Quantity"
  )
```

### With() - For Single Records
```yaml
SelectedItem: |-
  =With(
      Gallery1.Selected,
      {
          Name: ProductTitle,
          Price: UnitPrice,
          Quantity: Stock
      }
  )
```

### ForAll() - For Table Transformation
```yaml
TransformedItems: |-
  =ForAll(
      Products,
      {
          Name: ProductTitle,
          Price: UnitPrice,
          Quantity: Stock
      }
  )
```

**Note:** Deprecated dropdown mapping method should not be used. Always use formula-based mapping.
