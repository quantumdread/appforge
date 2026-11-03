import Ajv from 'ajv';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { analyze } from '../src/core/snapshot';
import { buildReport, type SurveyOptions } from '../src/core/survey/build-report';
import { validateReport } from '../src/core/survey/validate-report';
import { ANALYZER_CATALOG_DATA } from '../src/lib/catalog-data';

const schema = JSON.parse(readFileSync(fileURLToPath(new URL(
  '../src/core/survey/analysis-report.schema.json',
  import.meta.url,
)), 'utf8'));
const ajvValidate = new Ajv({ allErrors: true, strict: false }).compile(schema);

const OPTIONS = {
  now: '2026-08-29T12:00:00.000Z',
  report_id: 'schema-report',
  analyzer_version: '2.4.9-test',
};

function reportFor(content: string, suffix: string, optionOverrides: Partial<SurveyOptions> = {}) {
  const name = `${suffix}.pa.yaml`;
  return buildReport(
    analyze([{ name, content }], ANALYZER_CATALOG_DATA),
    {
      app_name: { value: `Schema ${suffix}`, resolved_by: 'manifest' },
      source_kind: 'inline',
      fingerprint_basis: `schema/${suffix}`,
      files: [{ id: name, sha256: suffix.padEnd(64, '0').slice(0, 64) }],
      limitations: [],
      connections: { state: 'empty', rows: [] },
    },
    { ...OPTIONS, report_id: `${OPTIONS.report_id}-${suffix}`, ...optionOverrides },
  );
}

const CLEAN_REPORT = reportFor(`Screens:
  Main:
    Children:
      - lblClean:
          Control: Label
          Properties:
            Text: ="Clean"
            Wrap: =true
`, 'a');
const WARNING_YAML = `Screens:
  Main:
    Children:
      - btnWarn:
          Control: ModernButton
          Properties:
            Text: ="Warn"
            TabIndex: =3
`;
const WARNING_REPORT = reportFor(WARNING_YAML, 'b');
const BLOCK_REPORT = reportFor(`Screens:
  Main:
    Children:
      - ghost:
          Control: NoSuchControl
`, 'c');
const VERSION_REPORT = reportFor(`Screens:
  Main:
    Children:
      - btnLegacy:
          Control: Button@0.0.45
`, 'd');
const WARNING_FINDING = WARNING_REPORT.findings.find(finding => finding.level === 'WARN')!;
const ANNOTATED_DELTA_REPORT = reportFor(WARNING_YAML, 'b', {
  report_id: 'schema-report-b-annotated',
  previous: WARNING_REPORT,
  baseline: {
    baseline_schema: 'analysis-baseline/1',
    formula: 'finding-fingerprint/2',
    fingerprint_basis: 'inline/test/v1',
    entries: [{
      fingerprint: WARNING_FINDING.fingerprint,
      rule: WARNING_FINDING.rule,
      accepted_at: '2026-08-01T00:00:00.000Z',
    }],
  },
  suppressions: [{
    rule: WARNING_FINDING.rule,
    scope: {},
    rationale: 'schema fixture',
    owner: 'test-owner',
    expires: '2027-08-29T00:00:00.000Z',
  }],
});
const ENUM_REPORT = structuredClone(WARNING_REPORT);
ENUM_REPORT.inventories.datasources = {
  state: 'available',
  rows: [{
    name: 'Orders',
    backend: 'sharepoint',
    resolved_by: 'explicit-input',
    confidence: 'high',
  }],
};

const REPORTS = [
  CLEAN_REPORT,
  WARNING_REPORT,
  BLOCK_REPORT,
  VERSION_REPORT,
  ANNOTATED_DELTA_REPORT,
  ENUM_REPORT,
];

const ENUM_POISON_TARGETS = [
  ['/findings/0', 'confidence'],
  ['/findings/0', 'confidence_basis'],
  ['/root_causes/0/priority', 'band'],
  ['/root_causes/0', 'effort_class'],
  ['/root_causes/0', 'descriptor_coverage'],
  ['/root_causes/0', 'action_state'],
  ['/identity/app_name', 'resolved_by'],
  ['/identity', 'source_kind'],
  ['/inventories/datasources/rows/0', 'backend'],
  ['/findings/0', 'baseline_status'],
  ['/findings/0', 'adjudication'],
  ['/root_causes/0', 'grouping_key'],
  ['/root_causes/0', 'dominant_severity'],
  ['/gate', 'gate_decision'],
  ['/findings/0', 'severity'],
] as const;

function ajvAccepts(value: unknown): boolean {
  return ajvValidate(value) as boolean;
}

function poisonEnumField(report: typeof ENUM_REPORT, pointer: string, field: string): unknown {
  const poisoned: unknown = structuredClone(report);
  let target = poisoned;
  for (const segment of pointer.split('/').filter(Boolean)) {
    if (Array.isArray(target)) {
      target = target[Number(segment)];
    } else if (typeof target === 'object' && target !== null) {
      target = (target as Record<string, unknown>)[segment];
    } else {
      throw new Error(`enum poison path does not resolve: ${pointer}`);
    }
  }
  if (typeof target !== 'object' || target === null || Array.isArray(target)) {
    throw new Error(`enum poison path does not resolve to an object: ${pointer}`);
  }
  (target as Record<string, unknown>)[field] = 'BOGUS_VALUE';
  return poisoned;
}

describe('AnalysisReportV1 schema and runtime validator', () => {
  it('validates every report emitted by the fixture matrix', () => {
    for (const report of REPORTS) {
      expect(validateReport(report), JSON.stringify(report)).toEqual({ valid: true, errors: [] });
      expect(ajvAccepts(report), JSON.stringify(ajvValidate.errors)).toBe(true);
    }
  });

  it('agrees for valid and invalid fixture sets', () => {
    const validUnknownFields = structuredClone(REPORTS[1]) as typeof REPORTS[number] & {
      future_root_field: { version: number };
    };
    validUnknownFields.future_root_field = { version: 2 };
    Object.assign(validUnknownFields.findings[0], { future_finding_field: true });

    const missingSection = structuredClone(REPORTS[1]) as unknown as Record<string, unknown>;
    delete missingSection.identity;
    const badCoverageClaimRef = structuredClone(REPORTS[1]);
    // Production has no unverified claims after extraction; inject the invalid row.
    badCoverageClaimRef.coverage.unverified_claims.push({
      claim_ref: 'augmentation:Fixture.Property', evidence_class: 'unverified-augmentation',
    });
    Object.assign(badCoverageClaimRef.coverage.unverified_claims[0], { claim_ref: 'free-form-claim' });
    const missingThresholdNote = structuredClone(REPORTS[0]);
    const firstScreen = missingThresholdNote.inventories.screens.state === 'available'
      ? missingThresholdNote.inventories.screens.rows[0]
      : null;
    if (firstScreen) delete firstScreen.note;
    const missingVersionQualifier = structuredClone(VERSION_REPORT);
    const knownVersion = missingVersionQualifier.inventories.version_lag.state === 'available'
      ? missingVersionQualifier.inventories.version_lag.rows[0]
      : null;
    if (knownVersion) delete knownVersion.lower_bound;
    const contradictoryUnresolvedVersion = structuredClone(VERSION_REPORT);
    const unresolvedVersion = contradictoryUnresolvedVersion.inventories.version_lag.state === 'available'
      ? contradictoryUnresolvedVersion.inventories.version_lag.rows[0]
      : null;
    if (!unresolvedVersion) throw new Error('version fixture lacks a row');
    unresolvedVersion.newest_known = 'unresolved';

    const enumPoisonFixtures = ENUM_POISON_TARGETS.map(([pointer, field]) => ({
      label: `${pointer}/${field}`,
      value: poisonEnumField(ENUM_REPORT, pointer, field),
      accepted: false,
    }));
    const fixtures: Array<{ label: string; value: unknown; accepted: boolean }> = [
      { label: 'valid report', value: REPORTS[0], accepted: true },
      { label: 'valid unknown fields', value: validUnknownFields, accepted: true },
      { label: 'missing section', value: missingSection, accepted: false },
      { label: 'bad coverage claim ref', value: badCoverageClaimRef, accepted: false },
      { label: 'missing threshold note', value: missingThresholdNote, accepted: false },
      { label: 'missing version lower-bound qualifier', value: missingVersionQualifier, accepted: false },
      {
        label: 'unresolved version with contradictory resolved provenance',
        value: contradictoryUnresolvedVersion,
        accepted: false,
      },
      ...enumPoisonFixtures,
    ];

    for (const fixture of fixtures) {
      const actual = {
        runtime: validateReport(fixture.value).valid,
        ajv: ajvAccepts(fixture.value),
      };
      expect(actual, `${fixture.label}: ${JSON.stringify(ajvValidate.errors)}`).toEqual({
        runtime: fixture.accepted,
        ajv: fixture.accepted,
      });
    }
  });

  it('rejects illegal §7 descriptors through both validators', () => {
    const finding = REPORTS[1].findings[0];
    const anchor = { line: 1, line_content_sha256: '0'.repeat(64) };
    const effects = {
      resolves: [finding.fingerprint],
      contributes_to: [],
    };
    const invalidDescriptors = [
      ['needs-human-value with non-null value', {
        kind: 'insert-property',
        file: finding.file,
        control: finding.control,
        property: 'AccessibleLabel',
        value: 'invented client copy',
        mode: 'needs-human-value',
        anchor,
        effects_when_completed: effects,
      }],
      ['deterministic insert-property with null value', {
        kind: 'insert-property',
        file: finding.file,
        control: finding.control,
        property: 'TabIndex',
        value: null,
        mode: 'deterministic',
        anchor,
        effects,
      }],
      ['rename-property carrying value', {
        kind: 'rename-property',
        file: finding.file,
        control: finding.control,
        from: 'Direction',
        to: 'LayoutDirection',
        value: '=LayoutDirection.Horizontal',
        mode: 'deterministic',
        anchor,
        effects,
      }],
      ['deterministic edit with both effect fields', {
        kind: 'insert-property',
        file: finding.file,
        control: finding.control,
        property: 'TabIndex',
        value: '=0',
        mode: 'deterministic',
        anchor,
        effects,
        effects_when_completed: effects,
      }],
    ] as const;

    for (const [label, descriptor] of invalidDescriptors) {
      const illegal = structuredClone(REPORTS[1]);
      illegal.findings[0].edits = [descriptor as never];
      const actual = {
        runtime: validateReport(illegal).valid,
        ajv: ajvAccepts(illegal),
      };
      expect(actual, `${label}: ${JSON.stringify(ajvValidate.errors)}`).toEqual({
        runtime: false,
        ajv: false,
      });
    }
  });

  it('accepts each legal §7 descriptor branch through both validators', () => {
    const finding = REPORTS[1].findings[0];
    const base = {
      file: finding.file,
      control: finding.control,
      anchor: { line: 1, line_content_sha256: '0'.repeat(64) },
      effects: { resolves: [finding.fingerprint], contributes_to: [] },
    };
    const descriptors = [
      {
        ...base,
        kind: 'insert-property',
        property: 'TabIndex',
        value: '=0',
        mode: 'deterministic',
      },
      {
        file: base.file,
        control: base.control,
        anchor: base.anchor,
        kind: 'set-property',
        property: 'AccessibleLabel',
        value: null,
        mode: 'needs-human-value',
        effects_when_completed: base.effects,
      },
      {
        ...base,
        kind: 'rename-property',
        from: 'Direction',
        to: 'LayoutDirection',
        mode: 'deterministic',
      },
      {
        ...base,
        kind: 'replace-control-type',
        from: 'Button@0.0.45',
        to: 'ModernButton',
        mode: 'deterministic',
      },
    ];

    for (const descriptor of descriptors) {
      const report = structuredClone(REPORTS[1]);
      report.findings[0].edits = [descriptor as never];
      expect(validateReport(report), JSON.stringify(descriptor)).toEqual({ valid: true, errors: [] });
      expect(ajvAccepts(report), JSON.stringify(ajvValidate.errors)).toBe(true);
    }
  });

  it('keeps submission conditional fields aligned in runtime and schema validation', () => {
    const fixtures = [
      { state: 'not_requested' },
      { state: 'pending' },
      { state: 'acknowledged', attempted_at: '2026-08-30T08:00:00.000Z' },
      {
        state: 'failed',
        attempted_at: '2026-08-30T08:00:00.000Z',
        error_code: 'coordinator-unavailable',
      },
      { state: 'not_requested', attempted_at: 'forbidden' },
      { state: 'pending', error_code: 'forbidden' },
      { state: 'acknowledged' },
      {
        state: 'acknowledged',
        attempted_at: '2026-08-30T08:00:00.000Z',
        error_code: 'forbidden',
      },
      { state: 'failed', attempted_at: '2026-08-30T08:00:00.000Z' },
      { state: 'failed', error_code: 'coordinator-unavailable' },
    ] as const;

    const accepted = [true, true, true, true, false, false, false, false, false, false];
    fixtures.forEach((submission, index) => {
      const report = structuredClone(REPORTS[0]);
      report.envelope.submission = submission as never;
      expect({
        runtime: validateReport(report).valid,
        ajv: ajvAccepts(report),
      }).toEqual({ runtime: accepted[index], ajv: accepted[index] });
    });
  });
});
