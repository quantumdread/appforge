# AppForge roadmap

AppForge helps canvas app makers understand existing source, review improvements,
and explain apps to maintainers and users. Planned work has no promised dates.

## Available foundation

- Control catalog, rule documents, Power Fx references, and layout templates.
- Shared validation and survey core, with local CLI, stdio MCP, and Worker surfaces.
- Child-order comparison, classic-to-modern conversion, and explicit-map renaming.
- Repository prompts for app understanding and documentation, diagnosis, and
  bounded renovation.
- Verification queue, campaign and errata commands, and the release corpus gate.
- Public issue preparation through `report_issue` and the Claude Code plugin.

See the [README](README.md) for installation and current tools, and the
[architecture](ARCHITECTURE.md) for their boundaries.

## Next

**M3: renovation of formulas and components.** Build on reviewed app understanding
to select a bounded refactoring, explain its intended benefit, preserve behavior,
and produce a diff with validation and evidence. Working logic can be a useful
renovation target when duplicated formulas or repeated UI make maintenance harder.

**Interactive help.** Turn reviewed task-based guides into in-app task search,
steps, and navigation. Separate inferred purpose from confirmed intent and
measured behavior.

**Tracking app changes.** Detect when source or confirmed intent has changed,
identify affected documentation and help, and refresh the relevant artifacts
while retaining prior evidence.

## Standing reliability work

- Re-extract the catalog as Power Apps evolves, review differences, and retire
  lower-bound overlays when extraction covers them.
- Strengthen typed user-defined function guidance and checks with measured
  compiler and runtime evidence.
- Keep new rules calibrated against Microsoft templates and the acceptance corpus.

The [verification doctrine](knowledge/VERIFICATION-DOCTRINE.md)
and [contribution guide](CONTRIBUTING.md) govern this work.
