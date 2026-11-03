# Developer guide

Technical reference for people who run AppForge outside an AI assistant, self-host it, or work on it. If you just want
to use AppForge with your assistant, start with [Getting started](getting-started.md) instead.

## Run the MCP server over stdio

Clone [the repository](https://github.com/quantumdread/appforge), then configure
your MCP client to launch this command, replacing `<clone>` with its absolute path:

```sh
node <clone>/server/dist-local/appforge-mcp.mjs
```

For clients that accept a JSON server configuration:

```json
{
  "mcpServers": {
    "appforge": {
      "command": "node",
      "args": ["<clone>/server/dist-local/appforge-mcp.mjs"]
    }
  }
}
```

Use forward slashes or escaped backslashes in JSON paths. The bundle is committed;
no `npm install` or build is needed to run it. The local server uses stdin/stdout
for JSON-RPC and needs no Worker token.

## Command-line validator

From the repository root:

```sh
node cli/validate.mjs <app-directory> --json
```

The CLI reads the committed analyzer bundle. Pass all app files together for
cross-file checks. It also accepts individual files and multiple file targets.

For a survey, write the report outside the app directory:

```sh
node cli/validate.mjs survey <app-directory> --report <report-directory> --json
```

See [CLI usage](../cli/PIPELINE.md) for
archive intake, survey profiles, baselines, and transformation commands.

## Optional: self-host on Cloudflare Workers

Use your own Cloudflare account and resources. From `server`:

```sh
npm ci
npx wrangler kv namespace create VERIFICATION_QUEUE
```

Put the returned namespace ID in `kv_namespaces` in `wrangler.jsonc`, replacing
the placeholder. Keep the `SURVEY_TELEMETRY` Durable Object binding and migration.
Then set a bearer token and deploy:

```sh
npx wrangler secret put MCP_AUTH_TOKEN
npm run deploy
```

`npm run deploy` builds the catalog and shared core before deploying the Worker.
Connect an HTTP MCP client to your Worker's `/mcp` endpoint with
`Authorization: Bearer <your-token>`. `GET /` and `/healthz` expose discovery
information without authentication.

## The 21 tools

The server registers these tools in the following groups. The
[MCP overview](MCP-OVERVIEW.md) explains how they fit into a workflow.

| Group | Tools | Purpose |
|---|---|---|
| Catalog | `list_controls` | List controls, optionally filtered by category. |
| Catalog | `get_control_info` | Read merged properties, variants, augmentation status, and optional enum values. |
| Catalog | `search_controls` | Search control names, properties, and augmentation notes. |
| Catalog | `get_augmentation` | Read a control's hand-curated additions and verification status. |
| Validation | `validate_yaml` | Check files against the catalog and lint rules, including cross-file name collisions. |
| Child order | `compare_child_order` | Compare complete intended and synced file sets for child order, membership, moves, and editor render risks. |
| Modernization | `modernize_controls` | Convert a selected classic-to-modern batch and return complete source, a report, open items, and a self-check. |
| Renaming | `rename_controls` | Propose names or apply an explicit rename map to the complete file set. |
| Templates | `list_templates` | Discover layout templates, optionally filtered by tag. |
| Templates | `get_template` | Retrieve a template's full source. |
| Rules | `list_rule_documents` | Discover bundled rules, guides, and persona prompts. |
| Rules | `get_yaml_rules` | Retrieve a document or a selected section. |
| Rules | `get_sizing_reference` | Retrieve control sizing and spacing data. |
| Rules | `get_design_principles` | Retrieve layout, typography, color, and theming guidance. |
| Rules | `check_limitation` | Search known canvas app limitations and workarounds. |
| Power Fx | `get_powerfx_function` | Retrieve a function reference. |
| Power Fx | `search_powerfx` | Search the function reference by keyword and optional category. |
| Power Fx | `list_powerfx_categories` | List categories, function counts, and names. |
| Survey | `survey_app` | Analyze complete inline app source and return a structured report, technical Markdown, and a minimized envelope. |
| Verification queue | `get_verification_queue` | Read validation totals and queued findings, sorted by affected runs; closed cases are hidden by default. |
| Issue reporting | `report_issue` | Prepare a GitHub issue URL and Markdown without making a network request. |

Modernization and renaming return source for review; they do not access a tenant.
Test modernization in a scratch app and check its appearance before relying on it.

## Validate before applying

Run `validate_yaml` on the complete source before calling Microsoft's
`compile_canvas`. A REFUSE is a hard stop: fix the finding and validate again.
Review and surface WARN findings even when there are no refusals.

**`compile_canvas` applies source even when validation reports failure.** It is
a tenant write and needs explicit authorization. A partial source folder deletes
omitted screens. Use a complete, freshly synced app folder.

After inserting controls, save in Studio, sync to a fresh folder, and run
`compare_child_order` against the intended source. Repeat the authorized compile
and comparison while the result reports `reordered`. Also check control types.

Never resume an expired Studio session after a compile; reload the app fresh.
After a bulk rename, inspect every screen's Studio tree for leftover temporary
names, including controls absent from the synced source.

## The compile gate

The Claude Code plugin registers two hooks (`hooks/hooks.json`) on any MCP tool
named `compile_canvas` (matcher `^mcp__.*__compile_canvas$`):

- **Before the compile,** `cli/precompile-hook.mjs` validates the whole
  `directoryPath`.
  - In `block` mode, the default, a REFUSE or a validator failure blocks the call
    and returns the findings to the assistant.
  - In `warn` mode it never blocks, but returns the findings and tells the user.
  - In `off` mode it does nothing.
  - WARN-only results pass, with the warnings added as context.
- **After the compile,** `cli/postcompile-hook.mjs` adds a reminder to re-sync to a
  fresh folder, run `compare_child_order`, and check control types.

The plugin setting is `compile_gate` (shown in `/config`). Without the plugin, add the
hooks to your own `.claude/settings.json`, using the absolute path of your clone, and
set `APPFORGE_COMPILE_GATE` to `block`, `warn` or `off` to choose the mode:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "^mcp__.*__compile_canvas$",
        "hooks": [
          { "type": "command", "command": "node", "args": ["C:/path/to/appforge/cli/precompile-hook.mjs"], "timeout": 120 }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "^mcp__.*__compile_canvas$",
        "hooks": [
          { "type": "command", "command": "node", "args": ["C:/path/to/appforge/cli/postcompile-hook.mjs"], "timeout": 10 }
        ]
      }
    ]
  }
}
```

`skills/edit-app/SKILL.md` describes the full change workflow with Microsoft's
canvas-apps plugin; other assistants can follow the same steps.

## Verification doctrine

The [verification doctrine](../knowledge/VERIFICATION-DOCTRINE.md)
sets the evidence requirements:

- Give every component a gate before relying on its output.
- Keep extracted catalog facts separate from the hand-maintained overlay; never
  set `verified: true` from reasoning alone.
- Record the actual evidence class: compile round-trip, dated Studio export,
  or runtime observation. Rendering evidence does not establish compiler acceptance.
- Treat Studio-export property lists as lower bounds; unknown entries on these
  controls need investigation and WARN rather than invented certainty.
- Record falsified claims in the disproofs register and run the acceptance corpus
  when releasing rules.

## Data location

The local verification queue is stored under `%LOCALAPPDATA%\AppForge` on Windows.
Elsewhere it uses `$XDG_DATA_HOME/appforge`, or `~/.local/share/appforge` when that
variable is unset. Set `APPFORGE_DATA_DIR` to override the data directory.

The local server has no survey-envelope submission binding. A hosted survey
returns its envelope for inspection and submits only with `submit_envelope: true`.

## More

- [MCP overview](MCP-OVERVIEW.md): how the tools fit into a workflow.
- [CONTRIBUTING](../CONTRIBUTING.md): setup, the release gate, evidence rules and the field-report format.
- [ARCHITECTURE](../ARCHITECTURE.md): how the pieces fit together.
