# AppForge MCP overview

AppForge exposes a control catalog, source checks, references, and app analysis
to MCP clients. It has 21 tools. Run the committed local stdio bundle
or host the Worker yourself; see [installation](getting-started.md).
The [tool table](developer-guide.md#the-21-tools) lists every registered tool.

## A source review workflow

1. Start with a complete source snapshot. Keep the original app export and
   generated reports outside the shared repository.
2. Use `list_controls`, `get_control_info`, and `get_augmentation` to inspect
   control types, variants, properties, and their evidence. `search_controls`
   searches names, properties, and notes.
3. Discover references with `list_rule_documents`. Retrieve rules with
   `get_yaml_rules`, sizing with `get_sizing_reference`, design guidance with
   `get_design_principles`, and limitations with `check_limitation`.
4. Use `list_templates` and `get_template` for a starting layout, or consult
   `get_powerfx_function`, `search_powerfx`, and `list_powerfx_categories` for
   formula reference material.
5. Run `validate_yaml` on all app files together. Fix REFUSE findings, run it
   again, and review WARN findings before applying source to a tenant.

The catalog combines extracted metadata with a curated overlay. Not every entry
has the same evidence. A Studio-export property list is a lower bound, so an
unknown property on a dump-sourced control produces `partial-catalog-data` WARN
rather than REFUSE. This does not establish that the property is accepted.

Validation includes cross-file control-name collision checks and advisory
families for maintainability, accessibility, delegation, and performance. An
optional `datasources` map supplies backend types for source-specific delegation
checks. A clean result is source-check evidence, not proof of runtime behavior.

## Survey an existing app

Pass a complete inline file set to `survey_app`. It returns `AnalysisReportV1`,
technical Markdown, and a minimized survey envelope. The default profile is
`shared`; choose `existing-export` explicitly when assessing an export. That
profile turns eligible inline-formatting refusals into survey advice. It does
not change `validate_yaml` or establish compile or round-trip safety.

For filesystem or archive intake, use the
[local CLI](../cli/PIPELINE.md).
Local survey publication and explicit envelope submission are separate commands.
The MCP survey submits only when `submit_envelope: true`; local stdio has no
submission binding. Inspect envelopes before opting into hosted submission.
An inline HTTP survey sends the supplied source to the selected server.

The repository's [persona prompts](../knowledge/personas)
guide documentation, diagnosis, and bounded renovation using the existing tools.
They are instructions for a calling session, rather than additional MCP tools.

## Review transformations and round-trips

`modernize_controls` converts a selected classic-to-modern batch using the draft
mapping. It returns complete source, property/reference changes, open items, and
an analyzer self-check. Mechanical controls are selected by default. Compile in
a scratch app and visually check the result before relying on it.

`rename_controls` separates name proposals from explicit-map application. Review
and edit the map before applying it. Collisions and self-check failures reject
the map. Both transformation tools return source without accessing a tenant.

Microsoft's `compile_canvas` is a tenant write: it applies source even when
validation reports failure, and a partial folder deletes omitted screens. Run
AppForge validation first and obtain explicit authorization for each write.
After inserting controls, save in Studio, sync fresh source, and use
`compare_child_order` against the intended source. Repeat authorized compilation
while it reports `reordered`; check control types too. Before a push, the same
comparison can flag editor render risks from reparenting or same-name type changes.
See [compile safety](../CONTRIBUTING.md#applying-source-with-compile_canvas).

## Findings and evidence

`get_verification_queue` returns validation-health totals and findings sorted by
affected runs. Closed cases are excluded by default. This is prioritization
data, not a count of distinct apps or proof that a claim is correct.

Use `report_issue` to prepare a public issue URL and Markdown without making a
network request. Remove identifying data before submitting it. The
[field-report format](../CONTRIBUTING.md#field-reports) describes useful evidence.
The [verification doctrine](../knowledge/VERIFICATION-DOCTRINE.md)
and [campaign procedure](maintainers/VERIFICATION-CAMPAIGNS.md) explain how findings become
measured catalog decisions.

## Runtime boundaries

Worker and stdio clients use one tool dispatcher and the same analyzer core.
The CLI uses that core through a committed artifact. The
[architecture](../ARCHITECTURE.md) describes the adapters and build outputs.
Local verification counters use the [data directory](developer-guide.md#data-location).
Worker persistence belongs to the self-hosted deployment's KV and Durable Object.
