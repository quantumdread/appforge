# Pending verification campaign — 2026-09-08

Generated with the v2.6.0 installed artifact from the actual authenticated, bounded queue capture. No tenant compilation, runtime test, catalog promotion or queue stamp has been performed.

Campaign: campaign-82ad77b7b12116e503fff92a.
Full private manifest SHA-256: c62b171462be8c0ae2f155669fbf9a114550e4cc4502b05bde5ebe801ec1347b.
Analyzer SHA-256: 4d7db8edba88b81173bc13aaee716fc05a4fc45217e95c1a8fdf2a2bb9dc8016.

The listing contains 100 selected keys. Six synthetic cases cover six keys; 95 keys have non-generated rows. These sets overlap at the SQL key, whose aggregate context is incomplete. Five exact property keys have reviewed property-existence coverage only. Queue counts are per-key priority signals, not distinct apps or runs across keys.

The complete manifest and WORKLIST.md are retained locally in gitignored assets/verification-campaigns/2026-09-08-final; its exact captured input is assets/verification-campaigns/2026-09-08.queue.json. The full queue includes private custom property names, so those files are not committed. This public summary and byte-identical synthetic repros do not replace that manifest for result binding. Preserve the complete private package when handing the tenant session to the maintainer.

| Claim hypothesis | Queue count | Local CLI gate | Synthetic repro |
|---|---:|---|---|
| dump-property:Circle.Height | 12 | 0 PASS / 1 WARN / 0 REFUSE | [case-4a58575356958ea788026774](case-4a58575356958ea788026774.pa.yaml) |
| dump-property:Circle.Width | 12 | 0 PASS / 1 WARN / 0 REFUSE | [case-e66a543be7d9e837891eea3d](case-e66a543be7d9e837891eea3d.pa.yaml) |
| dump-property:Classic/Icon.TabIndex | 4 | 0 PASS / 1 WARN / 0 REFUSE | [case-3fcba22b547d5f46db578700](case-3fcba22b547d5f46db578700.pa.yaml) |
| dump-property:Classic/Icon.FocusedBorderColor | 3 | 0 PASS / 1 WARN / 0 REFUSE | [case-e274ec260befcbbc95bb72e8](case-e274ec260befcbbc95bb72e8.pa.yaml) |
| dump-property:ModernCheckbox.Checked | 1 | 0 PASS / 2 WARN / 0 REFUSE | [case-fa9a06932f3bf0e6de76857f](case-fa9a06932f3bf0e6de76857f.pa.yaml) |
| rule:delegation-sql-isblank | 1 | 1 PASS / 2 WARN / 0 REFUSE | [case-40dc857568fdf2046d264c6d](case-40dc857568fdf2046d264c6d.pa.yaml) |

All six cases are pending tenant evidence. The five property probes use explicit reviewed literals; they do not establish every accepted value. SQL uses the reviewed VerificationRows:sql context, controlled rows beyond the configured nondelegation window and a separate runtime falsifier. Successful compilation cannot resolve SQL delegation or close its incompletely mapped aggregate key.

Before execution, review the complete private worklist, fulfill its tenant prerequisites and preserve the exact input hashes. Any required repro or binding edit needs regeneration and review before collecting evidence. Use the [operator guide](../../VERIFICATION-CAMPAIGNS.md) and [tenant worklist](../../../TENANT-SESSION-WORKLIST.md). Dump-property outcomes remain explicit per-claim catalog decisions; the generator authorizes none.

Regenerate into a fresh directory using the private captured input and tracked recipes. A changed artifact changes the campaign identity; do not transplant results to a new manifest.

The earlier private package without the -final suffix preceded normalization of the new companion index's line endings. Use this final manifest; its source pin and manifest hash include the canonical LF index. The historical disproof register and all index entries are unchanged.
