# Documenter acceptance cases

These synthetic fixtures exercise evidence and interpretation boundaries for
the [Documenter](../../../../knowledge/personas/documenter.md).
They are analysis inputs, including deliberately broken variants. They are not
tenant-verified examples or templates for app generation.

## Repeatable procedure

1. Read the prompt and its artifact contract. Copy `base/` into a fresh case
   directory outside this repository; preserve its manifest.
2. Apply exactly the named case in `cases.json`: file deletion, replacement,
   or supplied synthetic owner answer. Keep each case independent.
3. Run the existing CLI on the entire case directory, with a report directory
   outside it: `node <installed-tools>/validate.mjs survey <case-source>
   --profile shared --report <case-output>/survey --json`.
4. Inspect source and the report, and produce a small interpretation with source
   references, claims, uncertainties, and a task outline. Do not infer semantics
   from a case's expected result. The source and actual report are evidence.
5. Audit the resulting claims against the expected boundaries in `cases.json`.
   In the stale-evidence case, capture evidence before the second mutation;
   check it again afterward and require renewed inspection.
6. Record what actually happened, including failures and prompt corrections.
   Separate mechanical reference checks from semantic judgments. A valid source
   anchor does not prove that an invented approval claim is correct.

The base app has a button with an approval-like identifier that appends a local
draft, and a separate return-home action. Its limited structure is intentional.
Counterexamples cover misleading names, missing screens, partial formulas,
unavailable external-operation definitions, conflicting owner intent, stale
source references, and unavailable/absent inventory. Owner answers in fixtures
are explicitly synthetic; they do not count as real owner acceptance.

[Actual 2026-09-09 observations](observed-2026-09-09.md) record the survey outputs,
produced interpretations, and manual source-audit outcomes. The
sprint acceptance report (2026-09-09) tracks the separate real-app and review gates. Neither fixtures nor expected
outcomes constitute an executed acceptance result by themselves.
