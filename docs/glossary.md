# Glossary

Plain explanations of the words you'll meet when using AppForge.

**AI assistant.** The chat-based tool you work with, such as Claude Code or GitHub Copilot. AppForge gives it extra
Power Apps tools and knowledge.

**MCP (Model Context Protocol).** The standard way AI assistants plug in extra tools. AppForge is an *MCP server*: a
small program on your computer that your assistant can call.

**Plugin.** A packaged add-on for Claude Code. The AppForge plugin installs the AppForge server, the automatic
safety check and the `/appforge:edit-app` and `/appforge:report-issue` commands in one step.

**Node.js.** A free program that runs AppForge in the background. You install it once and never open it yourself.

**Canvas app.** The kind of Power Apps app where you place controls freely on screens. AppForge is about canvas apps.

**Power Apps Studio.** The browser editor where you build canvas apps.

**YAML (`.pa.yaml`).** The text form of your app. Every screen, control and formula can be written as YAML, which is
how AI assistants read and write apps. In Studio you can see it with **View code**.

**Compile.** Applying YAML to your app in Studio, through Microsoft's canvas-apps plugin. It is a real change to your
app, so your assistant should ask before doing it. AppForge checks first; it never compiles anything itself.

**Sync.** Reading your live app from Studio into YAML files, also through Microsoft's plugin. Studio has to have the
app open.

**Validate / check.** Running AppForge's rules over YAML before it is applied. The result is a list of findings.

**REFUSE.** A finding that would break or be rejected. Fix it before applying.

**WARN.** A finding worth a look that doesn't stop anything, such as a slow pattern or a risk of missing rows.

**Control.** Anything you place on a screen: a button, label, gallery, text input and so on.

**Property.** A setting on a control, such as `Text`, `Fill` or `OnSelect`. Each can hold a value or a formula.

**Classic and modern controls.** Power Apps has two generations of controls. Modern ones (ModernButton,
ModernTextInput…) are newer and Fluent-styled. AppForge can convert classic controls to modern ones for you to review.

**Power Fx.** The formula language of Power Apps, as in `Filter(Orders, Status = "Open")`.

**Delegation.** Whether a formula's work is done by the data source, such as SharePoint or Dataverse, or by the app
itself. When it isn't delegated, the app only sees the first rows. That's 500 by default, adjustable up to 10,000 in
Settings → General → Data row limit. Everything after that limit is silently ignored, which is one of the most common
causes of "missing" records.

**Named formula.** A formula defined once in the app (in `App.Formulas`) and reused everywhere, such as a theme colour
or the current user's details.

**User-defined function (UDF).** A reusable formula with inputs, like a small custom function, also defined in
`App.Formulas`.

**Data source.** Where your app's data lives: a SharePoint list, a Dataverse table, an Excel file, a SQL table and so
on.

**Catalog.** AppForge's list of every control, its properties and allowed values, taken from Microsoft's own tools
and extended with checked findings.

**Evidence / verified.** How sure AppForge is about a fact: accepted by Studio when compiled, seen in Studio, documented
by Microsoft, or only inferred. Facts are marked *verified* only with real evidence, never from reasoning alone.

**Survey.** A full read-through of an app that produces a report: what's in it, which risks it has, and what to fix
first.

**Template.** A ready-made screen layout, such as cards, a table, KPI tiles or a side menu, that your assistant can
start from.

**Child order.** The order of controls inside a container. After changes are applied it can occasionally come out
wrong, and AppForge can check it.
