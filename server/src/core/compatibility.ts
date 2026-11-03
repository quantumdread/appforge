import type { Issue, ValidationResult } from './analyzer.js';

export type LegacyCliReport = {
  file: string;
  issues: Array<Omit<Issue, 'file' | 'nearMiss' | 'nearMissTelemetry' | 'evidence'>>;
  summary: { pass: number; warn: number; refuse: number; controls_seen: number };
};

/**
 * Preserve the local CLI's public issue shape while all semantics execute in
 * the shared core. This is deliberately a one-release compatibility profile.
 *
 * This is the single choke point for every CLI-facing legacy-report path —
 * validateCliFiles, validateYaml, and validate.mjs's main() all resolve
 * through here — so `evidence` (rule-declared survey-input metadata; see
 * core/evidence.ts) is stripped once, here, rather than in each caller.
 * ValidationResult.issues from analyzer.ts itself is NOT touched: a later
 * task's survey consumer reads `evidence` from the core result directly.
 */
export function toLegacyCliReports(result: ValidationResult): LegacyCliReport[] {
  return result.per_file.map(fileSummary => ({
    file: fileSummary.file,
    issues: result.issues
      .filter(issue => issue.file === fileSummary.file)
      .map(toLegacyCliIssue),
    summary: {
      pass: fileSummary.pass,
      warn: fileSummary.warn,
      refuse: fileSummary.refuse,
      controls_seen: fileSummary.controls_seen,
    },
  }));
}

function toLegacyCliIssue(
  issue: Issue,
): Omit<Issue, 'file' | 'nearMiss' | 'nearMissTelemetry' | 'evidence'> {
  const {
    file: _file,
    nearMiss: _nearMiss,
    nearMissTelemetry: _nearMissTelemetry,
    did_you_mean: _didYouMean,
    evidence: _evidence,
    ...legacy
  } = issue;

  switch (legacy.rule) {
    case 'unknown-control':
      delete legacy.rule;
      legacy.detail = 'control-type-not-in-manifest';
      break;
    case 'unknown-variant':
      delete legacy.rule;
      legacy.detail = 'variant-not-in-catalog';
      break;
    case 'unknown-property':
    case 'pa2108-trap':
      delete legacy.rule;
      delete legacy.fix;
      legacy.detail = 'property-not-in-catalog';
      break;
    case 'event-return-type-required':
      legacy.rule = 'custom-property-kind';
      break;
  }

  return legacy;
}
