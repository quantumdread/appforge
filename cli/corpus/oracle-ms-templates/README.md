# Microsoft first-party Studio template oracle

These nine `Screen*.pa.yaml` files are Microsoft's first-party Power Apps Studio
"New screen" templates, © Microsoft. They are not covered by AppForge's licence.
They are included unchanged, with line endings normalised to LF, only as test
input for corpus calibration. Together they contain 249 controls.

To re-capture them, open a scratch app in Power Apps Studio, add the nine
templates from "New screen", and fetch the screens with `sync_canvas`. Keep only
the template screens; exclude the capture's own `App.pa.yaml` and editor state.
The initial vocabulary capture is recorded in
[`studio-export-2026-09-09-ms-templates.yaml`](../../../knowledge/catalogs/sources/studio-export-2026-09-09-ms-templates.yaml).
The complete screens were synced on 2026-09-20.

The corpus analyzes these screens as one independent app using the complete
Worker profile. No WARN rule may emit more than 25% as many occurrences as the
249 controls. Exactly 25% passes, with no exemptions. This calibration is
independent of golden adjudication and cannot be accepted away by updating a
golden. Template warnings are advisory investigation signals.
