/**
 * Hosted-surface work bound — an operational limit of the Worker, not
 * validation semantics (the local CLI applies no such cap).
 *
 * Analysis CPU scales with control count (~2 ms per control for survey_app,
 * less for validate_yaml, measured 2026-09-24). Payloads past this bound are
 * refused before analysis with a pointer to the local CLI, so a caller gets a
 * clear tool error instead of a raw Cloudflare 1102 (CPU limit exceeded).
 * Chosen at ~3x the largest real app seen (1,522 controls) and well inside the
 * Worker's configured `limits.cpu_ms`.
 */
export const MAX_HOSTED_CONTROLS = 5_000;

const CONTROL_DECLARATION = /^[ \t]*Control:[ \t]*\S/gm;

/** Cheap pre-analysis count of `Control:` declarations; over-counts, never under-counts. */
export function countControlDeclarations(files: ReadonlyArray<{ content: string }>): number {
  let total = 0;
  for (const file of files) {
    CONTROL_DECLARATION.lastIndex = 0;
    while (CONTROL_DECLARATION.exec(file.content) !== null) total++;
  }
  return total;
}
