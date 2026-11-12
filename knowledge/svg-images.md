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

**Replaying by changing the SVG text does not work** <!-- verified: true, verified_at: 2026-11-12, verified_by: compile_canvas; observed in Studio by the maker, mode (edit or Play) not recorded -->.
The `<!-- run n -->` comment above was meant to make the image reload when `varSvgRun` changes. A Timer that raised
the counter every 6 seconds left the chart still: the animation did not play again. Make the SVG loop itself instead
(next section). The comment and `btnReplay` are harmless but do nothing; leave them out of new work.

## Looping animation (replays on its own)

Two ways, both verified. Neither needs a Timer or any Power Fx.

**SMIL: restart from the animation's own end.** Give the first animation an `id` and set
`begin='0s;a0.end+4s'`: it starts at load, then again 4 seconds after each run ends. Every other animation in the
chart starts from it (`begin='a0.begin+0.20s'`), so the whole chart rebuilds together. A fixed begin such as `0.20s`
plays only once, so the ring would loop while the bars stand still.

<!-- verified: true, verified_at: 2026-11-12, verified_by: compile_canvas; looping observed in Studio by the maker -->
```yaml
- lblLoopSmil:
    Control: Label
    Properties:
      Height: =10
      Text: |-
        =With(
            {p: 72},
            "<svg xmlns='http://www.w3.org/2000/svg' width='360' height='200' viewBox='0 0 360 200'>" &
            "<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>" &
            "<stop offset='0' stop-color='#0F6CBD'/><stop offset='1' stop-color='#6B2FBA'/></linearGradient></defs>" &
            "<rect x='0' y='0' width='360' height='200' rx='16' fill='url(#g)'/>" &
            "<text x='20' y='34' font-family='Segoe UI, sans-serif' font-size='16' font-weight='600' fill='#FFFFFF'>A. SMIL loops itself (4 s hold)</text>" &
            "<circle cx='90' cy='118' r='50' fill='none' stroke='#FFFFFF' stroke-opacity='0.25' stroke-width='12'/>" &
            "<circle cx='90' cy='118' r='50' fill='none' stroke='#FFFFFF' stroke-width='12' stroke-linecap='round' stroke-dasharray='0 314' transform='rotate(-90 90 118)'>" &
            "<animate id='a0' begin='0s;a0.end+4s' attributeName='stroke-dasharray' from='0 314' to='" & Text(Round(p / 100 * 314, 0), "0") & " 314' dur='1.4s' fill='freeze' calcMode='spline' keyTimes='0;1' keySplines='0.2 0.8 0.2 1'/></circle>" &
            "<text x='90' y='126' text-anchor='middle' font-family='Segoe UI, sans-serif' font-size='24' font-weight='700' fill='#FFFFFF' opacity='0'>" & Text(p, "0") & "%<animate begin='a0.begin+0.60s' attributeName='opacity' from='0' to='1' dur='0.8s' fill='freeze'/></text>" &
            "<rect x='190' y='170' width='22' height='0' rx='4' fill='#FFFFFF' fill-opacity='0.85'><animate begin='a0.begin+0.20s' attributeName='height' from='0' to='50' dur='0.7s' fill='freeze'/><animate begin='a0.begin+0.20s' attributeName='y' from='170' to='120' dur='0.7s' fill='freeze'/></rect>" &
            "<rect x='222' y='170' width='22' height='0' rx='4' fill='#FFFFFF' fill-opacity='0.85'><animate begin='a0.begin+0.35s' attributeName='height' from='0' to='75' dur='0.7s' fill='freeze'/><animate begin='a0.begin+0.35s' attributeName='y' from='170' to='95' dur='0.7s' fill='freeze'/></rect>" &
            "<rect x='254' y='170' width='22' height='0' rx='4' fill='#FFFFFF' fill-opacity='0.85'><animate begin='a0.begin+0.50s' attributeName='height' from='0' to='95' dur='0.7s' fill='freeze'/><animate begin='a0.begin+0.50s' attributeName='y' from='170' to='75' dur='0.7s' fill='freeze'/></rect>" &
            "<rect x='286' y='170' width='22' height='0' rx='4' fill='#FFFFFF' fill-opacity='0.85'><animate begin='a0.begin+0.65s' attributeName='height' from='0' to='65' dur='0.7s' fill='freeze'/><animate begin='a0.begin+0.65s' attributeName='y' from='170' to='105' dur='0.7s' fill='freeze'/></rect>" &
            "<rect x='318' y='170' width='22' height='0' rx='4' fill='#FFD335'><animate begin='a0.begin+0.80s' attributeName='height' from='0' to='110' dur='0.7s' fill='freeze'/><animate begin='a0.begin+0.80s' attributeName='y' from='170' to='60' dur='0.7s' fill='freeze'/></rect>" &
            "<text x='190' y='190' font-family='Segoe UI, sans-serif' font-size='11' fill='#FFFFFF' fill-opacity='0.8'>Mon  Tue  Wed  Thu  Fri</text>" &
            "</svg>"
        )
      Visible: =false
      Width: =10
- imgLoopA:
    Control: Image
    Properties:
      AccessibleLabel: ="Looping progress chart, SMIL"
      Height: =200
      Image: ="data:image/svg+xml;utf8," & EncodeUrl(lblLoopSmil.Text)
      Width: =360
      X: =20
      Y: =70
```

**CSS: a long cycle that grows and holds.** One `infinite` animation per element, with the growth in the first part
of the cycle (`0%` to `15%`) and the end state held for the rest. `transform-box: fill-box` with
`transform-origin: 50% 100%` makes each bar grow up from its own baseline. Stagger elements with `animation-delay`.

<!-- verified: true, verified_at: 2026-11-12, verified_by: compile_canvas; looping and the Pause button observed in Studio by the maker -->
```yaml
- lblLoopCss:
    Control: Label
    Properties:
      Height: =10
      Text: |-
        =
        "<svg xmlns='http://www.w3.org/2000/svg' width='360' height='200' viewBox='0 0 360 200'>" &
        If(Coalesce(varLoopPaused, false), "",
        "<style>@keyframes grow{0%{transform:scaleY(0)}15%,100%{transform:scaleY(1)}}" &
        " @keyframes pop{0%,4%{opacity:0.25}12%,100%{opacity:1}}" &
        " .b{transform-box:fill-box;transform-origin:50% 100%;animation:grow 6s ease-out infinite}" &
        " .d{opacity:1;animation:pop 6s linear infinite}</style>") &
        "<rect x='0' y='0' width='360' height='200' rx='16' fill='#4B2B9F'/>" &
        "<text x='20' y='34' font-family='Segoe UI, sans-serif' font-size='16' font-weight='600' fill='#FFFFFF'>B. CSS cycle (6 s, pausable)</text>" &
        "<rect class='b' style='animation-delay:0.00s' x='20' y='120' width='22' height='50' rx='4' fill='#FFFFFF' fill-opacity='0.85'/>" &
        "<rect class='b' style='animation-delay:0.12s' x='52' y='95' width='22' height='75' rx='4' fill='#FFFFFF' fill-opacity='0.85'/>" &
        "<rect class='b' style='animation-delay:0.24s' x='84' y='75' width='22' height='95' rx='4' fill='#FFFFFF' fill-opacity='0.85'/>" &
        "<rect class='b' style='animation-delay:0.36s' x='116' y='105' width='22' height='65' rx='4' fill='#FFFFFF' fill-opacity='0.85'/>" &
        "<rect class='b' style='animation-delay:0.48s' x='148' y='60' width='22' height='110' rx='4' fill='#FFD335'/>" &
        "<circle class='d' style='animation-delay:0.00s' cx='200' cy='80' r='6' fill='#FFFFFF'/>" &
        "<circle class='d' style='animation-delay:0.04s' cx='218' cy='80' r='6' fill='#FFFFFF'/>" &
        "<circle class='d' style='animation-delay:0.08s' cx='236' cy='80' r='6' fill='#FFFFFF'/>" &
        "<circle class='d' style='animation-delay:0.12s' cx='254' cy='80' r='6' fill='#FFFFFF'/>" &
        "<circle class='d' style='animation-delay:0.16s' cx='272' cy='80' r='6' fill='#FFFFFF'/>" &
        "<circle class='d' style='animation-delay:0.20s' cx='290' cy='80' r='6' fill='#FFFFFF'/>" &
        "<circle class='d' style='animation-delay:0.24s' cx='308' cy='80' r='6' fill='#FFFFFF'/>" &
        "<circle class='d' style='animation-delay:0.28s' cx='326' cy='80' r='6' fill='#FFFFFF'/>" &
        "<circle class='d' style='animation-delay:0.32s' cx='200' cy='102' r='6' fill='#FFFFFF'/>" &
        "<circle class='d' style='animation-delay:0.36s' cx='218' cy='102' r='6' fill='#FFFFFF'/>" &
        "<circle class='d' style='animation-delay:0.40s' cx='236' cy='102' r='6' fill='#FFFFFF'/>" &
        "<circle class='d' style='animation-delay:0.44s' cx='254' cy='102' r='6' fill='#FFFFFF'/>" &
        "<circle class='d' style='animation-delay:0.48s' cx='272' cy='102' r='6' fill='#FFFFFF'/>" &
        "<circle class='d' style='animation-delay:0.52s' cx='290' cy='102' r='6' fill='#FFFFFF'/>" &
        "<circle class='d' style='animation-delay:0.56s' cx='308' cy='102' r='6' fill='#FFFFFF'/>" &
        "<circle class='d' style='animation-delay:0.60s' cx='326' cy='102' r='6' fill='#FFFFFF'/>" &
        "<circle class='d' style='animation-delay:0.64s' cx='200' cy='124' r='6' fill='#FFFFFF'/>" &
        "<circle class='d' style='animation-delay:0.68s' cx='218' cy='124' r='6' fill='#FFFFFF'/>" &
        "<circle class='d' style='animation-delay:0.72s' cx='236' cy='124' r='6' fill='#FFFFFF'/>" &
        "<circle class='d' style='animation-delay:0.76s' cx='254' cy='124' r='6' fill='#FFFFFF'/>" &
        "<circle cx='272' cy='124' r='6' fill='#FFFFFF' fill-opacity='0.3'/>" &
        "<circle cx='290' cy='124' r='6' fill='#FFFFFF' fill-opacity='0.3'/>" &
        "<circle cx='308' cy='124' r='6' fill='#FFFFFF' fill-opacity='0.3'/>" &
        "<circle cx='326' cy='124' r='6' fill='#FFFFFF' fill-opacity='0.3'/>" &
        "<circle cx='200' cy='146' r='6' fill='#FFFFFF' fill-opacity='0.3'/>" &
        "<circle cx='218' cy='146' r='6' fill='#FFFFFF' fill-opacity='0.3'/>" &
        "<circle cx='236' cy='146' r='6' fill='#FFFFFF' fill-opacity='0.3'/>" &
        "<circle cx='254' cy='146' r='6' fill='#FFFFFF' fill-opacity='0.3'/>" &
        "<circle cx='272' cy='146' r='6' fill='#FFFFFF' fill-opacity='0.3'/>" &
        "<circle cx='290' cy='146' r='6' fill='#FFFFFF' fill-opacity='0.3'/>" &
        "<circle cx='308' cy='146' r='6' fill='#FFFFFF' fill-opacity='0.3'/>" &
        "<circle cx='326' cy='146' r='6' fill='#FFFFFF' fill-opacity='0.3'/>" &
        "<text x='200' y='185' font-family='Segoe UI, sans-serif' font-size='12' font-weight='600' fill='#FFFFFF'>63% present</text>" &
        "</svg>"
      Visible: =false
      Width: =10
- imgLoopB:
    Control: Image
    Properties:
      AccessibleLabel: ="Looping attendance chart, CSS"
      Height: =200
      Image: ="data:image/svg+xml;utf8," & EncodeUrl(lblLoopCss.Text)
      Width: =360
      X: =470
      Y: =70
- btnLoopPause:
    Control: ModernButton
    Properties:
      OnSelect: =Set(varLoopPaused, !Coalesce(varLoopPaused, false))
      Text: =If(Coalesce(varLoopPaused, false), "Play", "Pause")
      Width: =160
      X: =470
      Y: =290
```

**Let people stop it.** Motion that runs for more than 5 seconds needs a way to pause it (WCAG 2.2.2). In the CSS
example, `varLoopPaused` drops the `<style>` block, which leaves a still, complete chart. A long hold between runs
also keeps the page calmer. The same applies to anything that spins forever, such as a rotating cogwheel.
