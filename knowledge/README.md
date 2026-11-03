# AppForge knowledge

This folder contains the knowledge AppForge uses to check and explain Power Apps
source. It is for contributors maintaining rules, reference material and catalogs.
The server bundles the rules and reference content during its build.

- The Markdown files here describe YAML rules, patterns, sizing and troubleshooting.
- `catalogs/` contains extracted control metadata, verified additions and provenance.
- `templates/` contains example layouts in PA-YAML.
- `personas/` contains prompts for understanding, diagnosis, documentation and renovation.
- `examples/` contains worked source examples.
- `powerfx/` contains the Power Fx function and best-practice reference.

Read the [verification doctrine](VERIFICATION-DOCTRINE.md) before changing rules or
catalog claims. Extracted catalogs are regenerated with
[the extractor](../cli/extractor.mjs); never edit them by hand.
Use `get_control_info` or [the manifest](catalogs/control-manifest.yml) for control
and version knowledge. See [contributing](../CONTRIBUTING.md) for the review gates.
