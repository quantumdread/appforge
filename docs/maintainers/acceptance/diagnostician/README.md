# Diagnostician acceptance scenarios

These controlled interpretation inputs exercise the Sprint 2 cases declared
before implementation (scenario specification, 2026-09-09).
They are synthetic scenarios, not emitted PA-YAML examples, tenant fixtures or
claims of executed app behavior. Use with the [prompt](../../../../knowledge/personas/diagnostician.md).

## Method

For each scenario, apply the prompt to the input and record an actual decision,
reason, evidence limit and falsifier in the acceptance report. The expected
outcome is an oracle to compare afterward, not a claim that the case was run.
Record whether the evaluator is the producing controller or independent.
Manual scenario reasoning does not measure another model's prompt compliance.
Never count a synthetic owner as real owner acceptance.

| Case | Synthetic input | Expected decision and failure signal |
|---|---|---|
| A1 | Three calendar entry actions independently calculate the Monday of the same current date. Each captures that value into mutable navigation state. The maintainer wants one place to maintain the calendar convention; all three work today. | Propose sharing only the pure base calculation while retaining the capture/state boundaries. A selected-week or rollover mismatch falsifies the proposed scope. Invented defects/speedups or making navigation state live fail. |
| A2 | An app captures its opening instant for an audit event. A later refresh must not change that instant. A long-OnStart warning nominates the assignment. | Retain the snapshot and one-time write. Moving to a live clock formula fails. Reopen only if the audit requirement changes or equal capture semantics can be demonstrated. |
| A3 | Two labels use the same record field spelling. One is in a current-order gallery; the other is in a nested history gallery. Empty history must stay blank. | Reject a shared unparameterized expression. Explicit record/blank contracts would be prerequisite for a later parameterized proposal. Comparing same-looking text is insufficient. |
| A4 | Two Save controls look alike. One directly writes a new draft and resets inputs; the other submits an edit form whose callbacks own completion and errors. Their headers already use one component. | Retain separate Save behavior and existing header reuse. No new generic Save component or second header extraction on appearance alone. Reopen with a demonstrated common event/state contract. |
| A5 | OnStart defines a build label, seeds a user-editable period, captures a version-check value, loads a teacher list and writes a startup log. Later controls change the period. | Split responsibility analysis. Only immutable calculation/configuration is a potential named formula; do not remove mutable period writes, live-recompute captured checks or repeat the log side effect. Performance remains unmeasured. |
| A6 | A form's submit handler clears an edit flag immediately after submission; its OnSuccess callback reads that flag to decide whether to create child records. An owner reports inconsistent historical outcomes, but no current run was supplied. | Diagnose callback-state risk with source-to-consequence trace; propose preserving operation intent until terminal handling. Do not claim every edit duplicates records. A controlled trace proving stable intent on both paths would disprove/narrow the risk. |
| A7 | A real Form's exported property is absent from a dump-derived catalog, a source row is unresolved, and an external operation's definition was not exported. | Separate catalog incompleteness, unresolved identity and missing evidence. None proves an invalid app property, an incorrect backend choice or an absent external operation. |
| A8 | A Save control is always enabled. Its trailing inert expression compares changed fields and refers to another editor; an adjacent prose comment describes removed processing. | Report live behavior and commented intent separately. Do not call it required-field validation or recommend blindly restoring the wrong-context expression. |
| A9 | The real owner receives the compact private report with no more than three explained choices, after providing maintenance priorities and change appetite. | Actual useful selection/rejection plus reason, or pending. Producer preference, synthetic response, silence and assumed approval cannot pass this case. |

The real app must also supply one workflow trace, one functioning-code
architecture opportunity and reasoned retained/deferred candidates. Passing
these scenarios alone does not close M2.
