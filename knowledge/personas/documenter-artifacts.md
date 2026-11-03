# Documenter artifact contract

Revision: `app-understanding/1`. This is a local documentation artifact, separate
from AnalysisReportV1 and the feedback envelope. It makes the first Documenter
workflow inspectable; it does not promise stable identity across app revisions.
Fetch the workflow as `persona-documenter` with `get_yaml_rules`. For an MCP-only
run, keep the saved `survey_app` report as the survey basis instead of requiring
CLI-generated `survey/` files; preserve the same report identity, hashes and
coverage records.

## Package and authority

The private package contains the original `survey/` artifacts,
`app-understanding.json`, `app-brief.md`, `maintainer-map.md`, `user-guide.md`, and
`review-record.md`. Generated headings and filenames use UTF-8. Preserve Unicode
identifiers when crossing shell/stdin boundaries and check final bytes.

The survey is authoritative for its own findings, inventories, and recorded
coverage. Captured source is evidence for observed implementation. Owner answers
are evidence for intended scope. Documentation renders these accounts with
their uncertainties; no interpretation label is a compile or runtime stamp.

## JSON fields

All top-level fields below are required. Empty arrays are permitted where the
reason is recorded in coverage or review. JSON must not contain duplicate keys.

| Field | Shape and meaning |
|---|---|
| `schema` | Exact string `app-understanding/1`. |
| `title` | App display title, with its basis recorded as a claim. Do not rewrite the survey's app identity to match it. |
| `language` | Language used by the readable documents, such as `sv` or `en`; `mixed` is allowed when the map and guide use different languages. |
| `source` | `root` (private snapshot path), `manifest` (`file_id`, `sha256` rows), `survey` (`path`, `sha256`, `report_id`, `app_id`, `analyzer_version`, `catalog_version`, `profile`), and `excluded_from_survey` (file IDs with reasons). |
| `coverage` | `inventory` (the survey's inventory object), `survey_limitations`, `workflow_limits`, and `runtime` (`not-exercised` unless a separately referenced observation establishes otherwise). |
| `evidence` | Evidence records as defined below. |
| `claims` | Claim records as defined below. |
| `scope` | `purpose_claim_ids`, `audience_claim_ids`, `workflow_ids`, and `exclusions`. New runs also record `workflow_selection`: `basis` (`owner-record`, `usage-data`, or `structural-unranked`), `evidence_ids`, and `reason`. |
| `workflows` | Workflow records as defined below. |
| `owner_review` | `status` (`pending`, `partial`, or `complete`), `questions`, and `answers`. |
| `documents` | Rows with relative `path` and `sections`; each section has the exact `heading`, `claim_ids`, and `workflow_ids`. |

Use the exact recorded report identifier and identity values, not new guesses.
Keep original/snapshot preservation checks in the session/review record. Include
all captured files in the manifest and explain files the survey does not admit.
Paths in shared examples must be synthetic. App-derived JSON stays private.

## Evidence and claims

Evidence records have a unique `id` and one of these shapes:

- `kind: source`: `file_id`, `sha256`, one-based inclusive `line_start` and
  `line_end`, and `anchor` (a literal string present within that range). The file
  belongs to the captured manifest. Use a range that includes enough context to
  assess the claim, not just a control's name.
- `kind: survey`: `pointer`, a JSON Pointer into the unchanged survey report;
  the report path/hash is in `source.survey`.
- `kind: supplied`: private `path`, `sha256`, line range, and `anchor`, with
  `description` explaining what was supplied. It establishes only what that
  material actually supports. Owner worklogs, decisions, incident records, and
  relayed owner reviews carry `evidence_class: owner-record`. Preserve a dated
  private copy. Describe any reported runtime-data provenance without claiming
  the producing agent repeated that observation. This additive annotation does
  not change the required top-level fields or invalidate earlier local artifacts.
- `kind: owner-answer`: `answer_id`, referencing a recorded owner answer.

Every claim has `id`, `statement`, `interpretation`, `evidence_ids`,
`basis_claim_ids`, and `uncertainty`. Interpretation is `observed`, `inferred`,
`owner-confirmed`, or `unknown`. Use empty arrays and an explicit explanation
where evidence is unavailable; never fabricate a source reference.

An observed claim needs inspected source, survey, or supplied evidence. An
inference needs evidence or existing basis claims and an explanation. An
owner-confirmed claim needs owner-answer evidence. An unknown needs a reason
and should reference the observed dependency or unanswered question when possible.
Basis references must resolve and must not form a cycle.
An owner record can settle a business rule or report a tested save guarantee;
it cannot by itself establish compilation, round-trip, or materialization.
Retain that distinction when rendering positive guidance from the owner's answer.

Answers have `id`, `question_id`, `text`, `recorded_at`, `claim_ids`, and
`disposition`. Questions have `id`, `text`, `claim_ids`, and `status`
(`pending` or `answered`). Preserve the earlier statement and its interpretation
when recording a correction; add the corrected claim and explain the relationship
in the answer disposition. Do not silently relabel an inference as observed.

## Workflows and document sections

A workflow has `id`, `title`, `entry_conditions`, `steps`, `outcomes`,
`claim_ids`, and `unknown_claim_ids`. Each step has `id`, `instruction`, and
`claim_ids`. Entry conditions and outcomes are readable statements grounded in
the workflow's claims. Missing steps stay explicitly unresolved.

Document sections point back to claims/workflows through `documents`. Every
asserted technical statement in a selected workflow must be traceable this way.
The map can show evidence IDs and exact source locations. The user guide should
show readable steps and review limitations without hash or schema details.

Recommended outlines:

| Document | Sections |
|---|---|
| `app-brief.md` | Status and source basis; reconstructed purpose; audience; available app inventory; two traced workflows; exclusions and owner questions. |
| `maintainer-map.md` | Reading route; source inventory; shared startup/state/formulas; workflow 1 locations; workflow 2 locations; external dependencies; unresolved assumptions. |
| `user-guide.md` | Draft/review status; workflow 1; workflow 2; unresolved policy questions and relevant recovery guidance. Use actual app vocabulary. |
| `review-record.md` | Source/report basis; integrity checks; technical claim audit; owner questions/answers; second-reader packet/result; corrections and remaining work. |

## Acceptance checklist

1. Parse JSON without duplicate keys; require the contract fields and unique IDs.
2. Check manifest bytes, report hash/context, source and supplied anchors, survey
   pointers, and every claim/workflow/document/answer reference.
3. Confirm document files and referenced headings exist. Compare source inventory
   with the captured manifest and account for exclusions.
4. Audit whether the evidence supports each observed statement in the selected
   workflows. Classify unsupported or conflicting interpretations honestly.
5. Record actual owner review and actual second-reader results separately from
   integrity checks. The reader gets only the frozen map and question; withhold
   source and the answer key. Preserve the actual attempt and any subsequent map
   fix separately. Pending feedback remains pending.
6. Verify originals are unchanged and private content is absent from shared output.

Session-local checks may implement mechanical checks. Their success does not
automatically satisfy the semantic audit or human review. Do not add automated
tests whose only assertion is that the prompt contains these words.
