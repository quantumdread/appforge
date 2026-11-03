# Diagnostician artifact guide

A bounded **local Markdown contract**, not a new public schema or telemetry
format. Read with `persona-diagnostician`, fetched through `get_yaml_rules`.

## Private packet

| File | Required content |
|---|---|
| `diagnosis.md` | Short owner decision page; reviewed basis/status, at most three useful batches or unranked choices, retain/defer decisions, main prerequisites, actual selection or pending state. |
| `diagnosis-items.md` | Full items, opportunity-family coverage, rejected/deferred candidates and AppForge-owned limitations. Stable IDs within this packet. |
| `evidence-index.md` | Inspected source anchors and inherited claim IDs, owner-record references and dated primary platform practices, each with claim scope and limits. |
| `owner-record.md` | Exact intake questions/answers and report selection, author/date/channel, source basis, corrections and outstanding questions. |
| `review-record.md` | Declared cases and actual outcomes, source/practice audit, preservation/link/privacy checks, evaluator roles, failed attempts, missing evidence and five-criterion verdict. |

Keep manifests, raw supplied inputs and unchanged survey artifacts alongside the
packet. A private audit helper may support mechanical checks; it is not a shipped
runner. Preserve Unicode and use relative links where they remain valid. Copied
historical documents can retain original links; identify their original base and
resolve them there during audit rather than silently modifying preserved bytes.

## Recommendation fields

Each item must contain the following fields, whether as a table or paragraphs
with these labels:

| Field | Meaning |
|---|---|
| ID / class / disposition | Packet ID; defect, risk or improvement; recommend, conditional, defer or retain-as-is. |
| Task and selection basis | Named user workflow or maintenance activity; owner/usage evidence or explicit unranked status. |
| Observed pattern and evidence | Bounded source fact; exact file/control/property/line anchors or inherited evidence IDs. Keep inference separate. |
| Applicable practice and rationale | Primary source with date checked; why the practice applies and its preconditions. |
| Consequence and expected benefit | What matters to that task; distinguish observed harm from possible risk and expected maintenance benefit. No invented savings or runtime improvement. |
| Proposed change | Concrete bounded change in behavior/responsibility, expressed as a proposal; no app edit or apply script. |
| Affected locations and scope | Exact intended sites and explicit excluded sites; coarse small/medium/large effort with the reason. |
| Behavior to preserve | Inputs, timing, state, error handling, data ownership and meaningful variations that must remain. |
| Uncertainty and dependencies | Unresolved behavior/evidence, authoring/tenant prerequisites and who can resolve them. |
| Falsifier | Specific comparison/observation whose result would disprove or narrow the recommendation; who can perform it. Distinguish already assessed evidence from pending checks. |
| Priority rationale | Consequence, benefit, confidence, effort and prerequisites considered together; no ranking before requested owner intake. |

Small means a bounded local expression/handler change with a narrow regression
surface; medium spans several properties, contexts or asynchronous paths; large
crosses component/workflow/data boundaries. These are estimates, not durations.
An item may become conditional or retained after its falsifier is evaluated.

For **retain-as-is/defer**, record the tempting change, counterevidence, protected
behavior, reason to leave it now and the evidence that would reopen it. Do not
invent a replacement proposal simply to fill recommendation fields.

## Evidence records

Source references identify the captured file, its hash in the private manifest,
one-based inclusive line range, a literal anchor and the claim it supports. Check
the enclosing control/property and enough neighboring code to establish context.
Whole-file searches must record their scope and limits; absence of a text match
does not prove absence of indirect writes or dynamic dependencies.

Inherited M1 claims cite the original ID and preserved package. New source
observations get distinct IDs. Supplied worklogs and owner answers carry
`owner-record`, date and relay provenance. Superseded claims remain recognizable;
the corrected account controls current recommendations. A platform reference is
guidance, not local compile/runtime proof.

Report finding counts are analysis context. Candidate decisions do not change
finding fingerprints, levels, baselines, suppressions or the original gate.
Tooling limitations have their own section and owner, separate from app items.

## Owner selection and acceptance

The decision page must be understandable without opening the raw survey. Each
option names the task, expected benefit, coarse effort/reason, key dependencies
and what would invalidate it. Detailed source and rule evidence sits behind item
IDs. Record whether the owner could choose from that page and which batch they
selected or rejected. Record requests for explanation as report feedback.

Keep the five M2 acceptance criteria (`ROADMAP.md`, M2, in the AppForge repository)
separate: functioning-code improvement; workflow and architecture traces;
counterexamples; tooling/app separation; actual useful owner selection. A
synthetic owner or the producing agent cannot supply the last criterion.

Integrity checks are necessary but insufficient. Review the substance of every
recommendation and retain outcome, record which falsifiers were exercised, and
state independent-review and tenant/runtime limits honestly.
