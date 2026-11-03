import { sha256 } from '../../../src/core/sha256.js';
import { analyze } from '../../../src/core/snapshot.js';
import {
  buildReport,
  type SurveyInput,
  type SurveyOptions,
} from '../../../src/core/survey/build-report.js';
import type { AnalysisReportV1 } from '../../../src/core/survey/report-types.js';
import { ANALYZER_CATALOG_DATA } from '../../../src/lib/catalog-data.js';
import type { SurveyGoldenCase } from './cases.js';

const GOLDEN_NOW = '2026-08-29T12:00:00.000Z';

export function buildGoldenFixture(
  fixture: Readonly<SurveyGoldenCase>,
  content: string,
): AnalysisReportV1 {
  const files = [{ name: fixture.source_file, content }];
  const snapshot = analyze(files, ANALYZER_CATALOG_DATA, {
    now: () => Date.parse(GOLDEN_NOW),
  });
  const input: SurveyInput = {
    ...fixture.input,
    files: [{ id: fixture.source_file, sha256: sha256(content) }],
  };
  const options: SurveyOptions = {
    now: GOLDEN_NOW,
    report_id: `golden-${fixture.name}`,
    analyzer_version: 'golden',
  };
  const preliminary = buildReport(snapshot, input, options);
  if (fixture.accepted_rule === null) return preliminary;

  const accepted = preliminary.findings.find(finding =>
    finding.rule === fixture.accepted_rule && finding.severity !== 'BLOCK');
  if (accepted === undefined) {
    throw new Error(
      `golden fixture '${fixture.name}' did not emit accepted rule '${fixture.accepted_rule}'`,
    );
  }
  return buildReport(snapshot, input, {
    ...options,
    baseline: {
      baseline_schema: 'analysis-baseline/1',
      formula: 'finding-fingerprint/2',
      fingerprint_basis: fixture.input.fingerprint_basis,
      entries: [{
        fingerprint: accepted.fingerprint,
        rule: accepted.rule,
        accepted_at: GOLDEN_NOW,
        note: 'Accepted only to exercise the debt rendering stream.',
      }],
    },
  });
}
