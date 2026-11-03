# Changelog

Release notes for AppForge. Version numbers continue from the project's private development history; this
repository starts at 3.16.0.

## 3.16.0 — first public release (2026-11-03)

What this release contains:

- **21 MCP tools** over stdio (`server/dist-local/appforge-mcp.mjs`, committed, no install step), available as a
  Claude Code plugin or for any MCP client, plus an optional self-hosted Cloudflare Worker. They are grouped as
  catalog, validation, child-order comparison, modernization, renaming, templates, rules, Power Fx, survey,
  verification queue and issue reporting. See the [developer guide](docs/developer-guide.md) for the list.
- **A control catalog** (`knowledge/catalogs/`) of 127 extracted and 2 Studio-dump-sourced controls, extracted
  2026-09-20 from Microsoft's canvas-authoring MCP server, with a hand-maintained augmentation overlay that records the
  evidence class of every addition.
- **PA-YAML validation** with three states (PASS, WARN, REFUSE), shared by the MCP server and the command-line
  validator (`cli/validate.mjs`). It covers catalog conformance, YAML hazards, delegation, centralization,
  accessibility, navigation, write-error handling and layout rules.
- **Source tools:** `compare_child_order` checks child order, membership and editor render risk after a compile.
  `modernize_controls` converts classic controls to the Modern* family. `rename_controls` proposes or applies names
  across a complete file set.
- **App survey:** a structured report, technical Markdown and a minimized envelope for an existing app, from a
  directory, an `.msapp` file or a solution `.zip`.
- **Power Fx reference** (`knowledge/powerfx/`): 203 function entries, each with its Microsoft Learn sources. Answers
  carry the CC BY 4.0 attribution.
- **Rule documents, templates and personas** (`knowledge/`): 36 served documents, including the diagnostician,
  documenter and renovator prompts, plus 11 layout templates.
- **A safety net for Microsoft's canvas-apps plugin:** with the AppForge plugin installed, every `compile_canvas` is
  checked first (block, warn or off, set in `/config`), and the assistant is reminded to verify the result after each
  compile. `/appforge:edit-app` walks a whole change through both plugins.
- **Issue reporting:** `report_issue`, five GitHub issue forms with a containment checklist, and the Claude Code plugin
  skill `/appforge:report-issue`.
- **Plain-language guides** in `docs/`: getting started, things you can ask, FAQ and glossary.
- **Release gate:** `npm run release:check` in `server/` builds the catalog, the core and the local bundle, then runs
  the Worker and Node test suites, TypeScript and the acceptance corpus. The corpus includes the calibration against
  Microsoft's Studio templates.

Factual note carried into this release: the nondelegable data row limit is documented as 500 by default, configurable
from 1 to 10,000 (Microsoft Learn, delegation overview). AppForge's lint notes, survey text and docs state it that way.
