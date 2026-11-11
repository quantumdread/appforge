# SVG Images and Animation in Canvas Apps

Tested on 2026-11-11 in a dev app. The YAML below was compiled with `compile_canvas`, and the maker watched it render in
Studio.

## What renders

| Route | Static SVG | SVG animation (`<animate>`) | CSS `@keyframes` inside the SVG |
|---|---|---|---|
| `Image` control, `Image: ="data:image/svg+xml;utf8," & EncodeUrl(svg)` | yes | yes | yes |
| `HtmlViewer` (HTML text) with `<img src='data:image/svg+xml;utf8,…'>` | yes | yes | not tested |
| `HtmlViewer` with the `<svg>` written inline in `HtmlText` | **no: renders blank** | — | — |

<!-- verified: true, verified_at: 2026-11-11, verified_by: compile_canvas; rendering observed in Studio by the maker -->

Rules that follow from this:
- **Never put inline `<svg>` in `HtmlText`.** It compiles, but it shows nothing. Wrap it in an `<img>` data URI, or use
  an `Image` control.
- **Always wrap the SVG in `EncodeUrl(...)`** inside the data URI. It escapes `#` in colours and in `url(#id)`, `%`,
  and spaces.
- **Use single quotes inside the SVG.** Power Fx strings use double quotes, so `fill='#FFFFFF'` needs no escaping.
- **Keep numbers integer or format them yourself.** `Text(x, "0")` avoids a locale decimal comma, which would break
  the SVG.
- **Build the SVG once** in a hidden label, a named formula or a variable, and point each image at it. This keeps a long
  string out of several controls.
- **Guard chart maths against blank.** Studio evaluates formulas before data has loaded, and `If(total = 0, …)` does
  not catch a blank total (blank is not equal to 0, but division treats it as 0). Use `Coalesce(total, 0) = 0` or
  `total > 0`; AppForge warns with `zero-guard-misses-blank`.
- **The image needs its own `AccessibleLabel`.** Screen readers do not read text inside the SVG.

## Static chart from a formula

The ring's dash length is the percentage times the circumference (2πr ≈ 314 for r = 50). Change `p` to move it.

<!-- verified: true, verified_at: 2026-11-11, verified_by: compile_canvas; rendering observed in Studio by the maker -->
```yaml
- lblSvgSource:
    Control: Label
    Properties:
      Visible: =false
      Width: =10
      Height: =10
      Text: |-
        =With(
            {p: 72, c: 314},
            "<svg xmlns='http://www.w3.org/2000/svg' width='360' height='200' viewBox='0 0 360 200'>" &
            "<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>" &
            "<stop offset='0' stop-color='#0F6CBD'/><stop offset='1' stop-color='#6B2FBA'/></linearGradient></defs>" &
            "<rect x='0' y='0' width='360' height='200' rx='16' fill='url(#g)'/>" &
            "<text x='20' y='34' font-family='Segoe UI, sans-serif' font-size='16' font-weight='600' fill='#FFFFFF'>Sprint progress</text>" &
            "<circle cx='90' cy='118' r='50' fill='none' stroke='#FFFFFF' stroke-opacity='0.25' stroke-width='12'/>" &
            "<circle cx='90' cy='118' r='50' fill='none' stroke='#FFFFFF' stroke-width='12' stroke-linecap='round' stroke-dasharray='" &
            Text(Round(p / 100 * c, 0), "0") & " " & Text(c, "0") & "' transform='rotate(-90 90 118)'/>" &
            "<text x='90' y='126' text-anchor='middle' font-family='Segoe UI, sans-serif' font-size='24' font-weight='700' fill='#FFFFFF'>" &
            Text(p, "0") & "%</text>" &
            "<rect x='190' y='120' width='22' height='50' rx='4' fill='#FFFFFF' fill-opacity='0.85'/>" &
            "<rect x='222' y='95' width='22' height='75' rx='4' fill='#FFFFFF' fill-opacity='0.85'/>" &
            "<rect x='254' y='75' width='22' height='95' rx='4' fill='#FFFFFF' fill-opacity='0.85'/>" &
            "<rect x='286' y='105' width='22' height='65' rx='4' fill='#FFFFFF' fill-opacity='0.85'/>" &
            "<rect x='318' y='60' width='22' height='110' rx='4' fill='#FFD335'/>" &
            "<text x='190' y='190' font-family='Segoe UI, sans-serif' font-size='11' fill='#FFFFFF' fill-opacity='0.8'>Mon  Tue  Wed  Thu  Fri</text>" &
            "</svg>"
        )
- imgSvg:
    Control: Image
    Properties:
      AccessibleLabel: ="Sprint progress chart"
      Image: ="data:image/svg+xml;utf8," & EncodeUrl(lblSvgSource.Text)
      Width: =360
      Height: =200
- htmImgTag:
    Control: HtmlViewer
    Properties:
      HtmlText: ="<img src='data:image/svg+xml;utf8," & EncodeUrl(lblSvgSource.Text) & "' width='360' height='200'/>"
      Width: =420
      Height: =260
```

## Loading spinner (CSS keyframes, loops forever)

<!-- verified: true, verified_at: 2026-11-11, verified_by: compile_canvas; animation observed in Studio by the maker -->
```yaml
- lblSvgSpinner:
    Control: Label
    Properties:
      Visible: =false
      Width: =10
      Height: =10
      Text: |-
        =
        "<svg xmlns='http://www.w3.org/2000/svg' width='360' height='200' viewBox='0 0 360 200'>" &
        "<style>@keyframes spin{to{transform:rotate(360deg)}} @keyframes pulse{0%,100%{opacity:0.35}50%{opacity:1}}" &
        " .spin{transform-origin:90px 100px;animation:spin 1s linear infinite} .dot{animation:pulse 1.2s ease-in-out infinite}" &
        " .d2{animation-delay:0.2s} .d3{animation-delay:0.4s}</style>" &
        "<rect x='0' y='0' width='360' height='200' rx='16' fill='#FFFFFF' stroke='#E1DFDD'/>" &
        "<circle cx='90' cy='100' r='36' fill='none' stroke='#E1DFDD' stroke-width='8'/>" &
        "<circle class='spin' cx='90' cy='100' r='36' fill='none' stroke='#0F6CBD' stroke-width='8' stroke-linecap='round' stroke-dasharray='60 226'/>" &
        "<text x='160' y='96' font-family='Segoe UI, sans-serif' font-size='18' font-weight='600' fill='#242424'>Loading data</text>" &
        "<circle class='dot' cx='166' cy='118' r='5' fill='#0F6CBD'/>" &
        "<circle class='dot d2' cx='184' cy='118' r='5' fill='#0F6CBD'/>" &
        "<circle class='dot d3' cx='202' cy='118' r='5' fill='#0F6CBD'/>" &
        "</svg>"
- imgSvgSpinner:
    Control: Image
    Properties:
      AccessibleLabel: ="Loading"
      Image: ="data:image/svg+xml;utf8," & EncodeUrl(lblSvgSpinner.Text)
      Width: =360
      Height: =200
```

Show it while data loads, for example with `Visible: =varLoading`.

## Animated chart (SVG `<animate>`, plays once)

`fill='freeze'` keeps the end state. Staggered `begin` values make the bars grow one after another. Each bar animates
`height` and `y` together, so it grows upwards from a fixed baseline (y = 170).

<!-- verified: true, verified_at: 2026-11-11, verified_by: compile_canvas; animation observed in Studio by the maker (Image and HtmlViewer <img>) -->
```yaml
- lblSvgAnim:
    Control: Label
    Properties:
      Visible: =false
      Width: =10
      Height: =10
      Text: |-
        =With(
            {p: 72},
            "<svg xmlns='http://www.w3.org/2000/svg' width='360' height='200' viewBox='0 0 360 200'>" &
            "<!-- run " & Text(Coalesce(varSvgRun, 0), "0") & " -->" &
            "<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>" &
            "<stop offset='0' stop-color='#0F6CBD'/><stop offset='1' stop-color='#6B2FBA'/></linearGradient></defs>" &
            "<rect x='0' y='0' width='360' height='200' rx='16' fill='url(#g)'/>" &
            "<text x='20' y='34' font-family='Segoe UI, sans-serif' font-size='16' font-weight='600' fill='#FFFFFF'>Sprint progress (animated)</text>" &
            "<circle cx='90' cy='118' r='50' fill='none' stroke='#FFFFFF' stroke-opacity='0.25' stroke-width='12'/>" &
            "<circle cx='90' cy='118' r='50' fill='none' stroke='#FFFFFF' stroke-width='12' stroke-linecap='round' stroke-dasharray='0 314' transform='rotate(-90 90 118)'>" &
            "<animate attributeName='stroke-dasharray' from='0 314' to='" & Text(Round(p / 100 * 314, 0), "0") & " 314' dur='1.4s' fill='freeze' calcMode='spline' keyTimes='0;1' keySplines='0.2 0.8 0.2 1'/></circle>" &
            "<text x='90' y='126' text-anchor='middle' font-family='Segoe UI, sans-serif' font-size='24' font-weight='700' fill='#FFFFFF' opacity='0'>" & Text(p, "0") & "%<animate attributeName='opacity' from='0' to='1' begin='0.6s' dur='0.8s' fill='freeze'/></text>" &
            "<rect x='190' y='170' width='22' height='0' rx='4' fill='#FFFFFF' fill-opacity='0.85'><animate attributeName='height' from='0' to='50' begin='0.20s' dur='0.7s' fill='freeze'/><animate attributeName='y' from='170' to='120' begin='0.20s' dur='0.7s' fill='freeze'/></rect>" &
            "<rect x='222' y='170' width='22' height='0' rx='4' fill='#FFFFFF' fill-opacity='0.85'><animate attributeName='height' from='0' to='75' begin='0.35s' dur='0.7s' fill='freeze'/><animate attributeName='y' from='170' to='95' begin='0.35s' dur='0.7s' fill='freeze'/></rect>" &
            "<rect x='254' y='170' width='22' height='0' rx='4' fill='#FFFFFF' fill-opacity='0.85'><animate attributeName='height' from='0' to='95' begin='0.50s' dur='0.7s' fill='freeze'/><animate attributeName='y' from='170' to='75' begin='0.50s' dur='0.7s' fill='freeze'/></rect>" &
            "<rect x='286' y='170' width='22' height='0' rx='4' fill='#FFFFFF' fill-opacity='0.85'><animate attributeName='height' from='0' to='65' begin='0.65s' dur='0.7s' fill='freeze'/><animate attributeName='y' from='170' to='105' begin='0.65s' dur='0.7s' fill='freeze'/></rect>" &
            "<rect x='318' y='170' width='22' height='0' rx='4' fill='#FFD335'><animate attributeName='height' from='0' to='110' begin='0.80s' dur='0.7s' fill='freeze'/><animate attributeName='y' from='170' to='60' begin='0.80s' dur='0.7s' fill='freeze'/></rect>" &
            "<text x='190' y='190' font-family='Segoe UI, sans-serif' font-size='11' fill='#FFFFFF' fill-opacity='0.8'>Mon  Tue  Wed  Thu  Fri</text>" &
            "</svg>"
        )
- imgSvgAnim:
    Control: Image
    Properties:
      AccessibleLabel: ="Animated sprint progress chart"
      Image: ="data:image/svg+xml;utf8," & EncodeUrl(lblSvgAnim.Text)
      Width: =360
      Height: =200
- btnReplay:
    Control: ModernButton
    Properties:
      Text: ="Replay"
      OnSelect: =Set(varSvgRun, Coalesce(varSvgRun, 0) + 1)
```

**Replaying** <!-- verified: false — compiled, but replay on click not yet observed -->: the `<!-- run n -->` comment
changes the SVG text whenever `varSvgRun` changes. The intent is that the image reloads and the animation plays again.
It compiles, but nobody has yet watched it replay.
