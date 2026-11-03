# Style Exemplar (with Theming)

This file shows minimal, pasteable **Canvas YAML** patterns the generator should imitate, **including theming**.  
Keep YAML compact, use `|-` for long/event formulas, and **do not reformat Power Fx**.

---

## 1) Theme bootstrap (hidden screen)

Use a dedicated screen to initialize a **theme record** once. Reference it everywhere (no hardcoded colors).

```yaml
Screens:
  ThemeInit:
    Properties:
      OnVisible: |-
        =Set(
          varTheme,
          {
            Primary: ColorValue("#3860B2"),
            PrimaryHover: ColorFade(ColorValue("#3860B2"), -20%),
            PrimaryText: RGBA(255,255,255,1),
            Text: RGBA(50,49,48,1),
            MutedText: RGBA(98,100,167,1),
            Surface: RGBA(255,255,255,1),
            SurfaceAlt: RGBA(248,248,248,1),
            Accent: ColorValue("#6BB700"),
            Danger: ColorValue("#D13438"),
            Warning: ColorValue("#FFB900"),
            Border: RGBA(0,18,107,1)
          }
        )
    Children: []
```

**Notes**
- `varTheme` is a **record**; use `varTheme.Primary`, `varTheme.Text`, etc.
- Keep this screen first so `OnVisible` runs when the app opens. (Or navigate to it in your own flow.)

---

## 2) Minimal themed home screen

Only use properties allowed by your catalogs. For **ModernButton**, avoid unsupported color props; use a themed **Classic/Button** when you need its legacy styling surface.

```yaml
Screens:
  Home:
    Properties:
      Fill: =varTheme.Surface
    Children:
      - Header:
          Control: GroupContainer@1.4.0
          Variant: ManualLayout
          Properties:
            Width: =Parent.Width
            Height: =80
            Fill: =varTheme.Surface
          Children:
            - lblTitle:
                Control: Label@2.5.1
                Properties:
                  Text: ="Themed App"
                  Font: =Font.'Open Sans'
                  Size: =20
                  Color: =varTheme.Text
                  X: =20
                  Y: =22
            - btnPrimary:
                Control: Classic/Button@2.2.0
                Properties:
                  X: =Parent.Width-160
                  Y: =20
                  Text: ="Do Thing"
                  BorderColor: =ColorFade(varTheme.Primary, -15%)
                  Color: =varTheme.PrimaryText
                  Fill: =varTheme.Primary
                  HoverBorderColor: =ColorFade(varTheme.Primary, 20%)
                  HoverColor: =varTheme.PrimaryText
                  HoverFill: =varTheme.PrimaryHover
                  PressedBorderColor: =varTheme.Primary
                  PressedColor: =varTheme.Primary
                  PressedFill: =varTheme.PrimaryText
                  OnSelect: |-
                    =Notify("Action: started", NotificationType.Information)
```

---

## 3) Themed gallery (flexible) with templated children

```yaml
Screens:
  ListScreen:
    Properties:
      Fill: =varTheme.Surface
    Children:
      - galItems:
          Control: Gallery@2.15.0
          Variant: Flexible
          Properties:
            Items: =colItems
            TemplateSize: =110
            Width: =Min(Parent.Width-40, 600)
            Height: =600
            X: =20
            Y: =60
          Children:
            - rectBg:
                Control: Rectangle@2.3.0
                Properties:
                  X: =5
                  Y: =5
                  Width: =Parent.TemplateWidth-10
                  Height: =Parent.TemplateHeight-10
                  Fill: =varTheme.SurfaceAlt
            - lblTitle:
                Control: Label@2.5.1
                Properties:
                  Text: =ThisItem.Title
                  Size: =16
                  Color: =varTheme.Text
                  X: =15
                  Y: =15
            - lblMeta:
                Control: Label@2.5.1
                Properties:
                  Text: =ThisItem.Category
                  Size: =12
                  Color: =varTheme.MutedText
                  X: =15
                  Y: =45
```

---

## 4) Themed status pill examples

```yaml
Screens:
  StatusExamples:
    Properties:
      Fill: =varTheme.Surface
    Children:
      - pillSuccess:
          Control: Rectangle@2.3.0
          Properties:
            X: =20
            Y: =20
            Width: =120
            Height: =28
            Fill: =varTheme.Accent
      - pillWarn:
          Control: Rectangle@2.3.0
          Properties:
            X: =160
            Y: =20
            Width: =120
            Height: =28
            Fill: =varTheme.Warning
      - pillDanger:
          Control: Rectangle@2.3.0
          Properties:
            X: =300
            Y: =20
            Width: =120
            Height: =28
            Fill: =varTheme.Danger
```

---

## 5) Event formulas with colons — block scalar pattern

Do **not** reformat Power Fx; keep one line under `|-`.

```yaml
- btnNotify:
    Control: Classic/Button@2.2.0
    Properties:
      Text: ="Say Hi"
      X: =20
      Y: =120
      OnSelect: |-
        =Notify("Note: themed action ran", NotificationType.Success)
```

---

## 6) Quick checklist for the generator

- Always reference theme tokens (`varTheme.*`); avoid hardcoded colors.
- Use `|-` for any event formula with `;`, `{`, `}`, `:` or >120 chars.
- Keep formulas **single-line** unless explicitly asked to pretty-print.
- Only emit properties that exist for the control per your catalogs.
- Use modern controls for simple interactions; switch to classic controls when you need richer style props present in the catalog.
