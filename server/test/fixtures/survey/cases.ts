import type { SurveyInput } from '../../../src/core/survey/build-report.js';

export type SurveyGoldenCase = {
  name: 'clean' | 'dirty';
  source_file: `${string}.pa.yaml`;
  input: Omit<SurveyInput, 'files'>;
  accepted_rule: string | null;
};

export const SURVEY_GOLDEN_CASES: readonly SurveyGoldenCase[] = [
  {
    name: 'clean',
    source_file: 'clean.pa.yaml',
    input: {
      app_name: { value: 'Pattern Workshop', resolved_by: 'manifest' },
      source_kind: 'directory',
      fingerprint_basis: 'directory/src-stripped/v1',
      limitations: [],
      connections: { state: 'empty', rows: [] },
    },
    accepted_rule: null,
  },
  {
    name: 'dirty',
    source_file: 'dirty.pa.yaml',
    input: {
      app_name: { value: 'Component Laboratory', resolved_by: 'manifest' },
      source_kind: 'directory',
      fingerprint_basis: 'directory/src-stripped/v1',
      limitations: [{
        kind: 'metadata-absent',
        source: 'Connections.json',
        detail: 'The internal fixture intentionally omits connection metadata.',
      }],
      connections: { state: 'unavailable', rows: [] },
    },
    accepted_rule: 'a11y-tabindex-positive',
  },
];
