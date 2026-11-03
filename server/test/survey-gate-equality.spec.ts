import { describe, expect, expectTypeOf, it } from 'vitest';
import type { Issue, ValidationResult } from '../src/core/analyzer';
import { controlNodes } from '../src/core/model';
import { analyze } from '../src/core/snapshot';
import { buildReport } from '../src/core/survey/build-report';
import type { ReadonlySnapshot } from '../src/core/survey/readonly';
import { ANALYZER_CATALOG_DATA } from '../src/lib/catalog-data';
import { analyzeSurveyFiles } from '../src/lib/survey';
import { ANALYZER_CATALOG_ALLOWLIST } from '../src/lib/survey';
import { buildEnvelope } from '../src/core/survey/envelope';
import { assertValidReport } from '../src/core/survey/validate-report';

const files = [{
  name: 'mixed.pa.yaml',
  content: `Screens:
  Main:
    Children:
      - btnGo:
          Control: ModernButton
          Properties:
            Text: ="Go"
            OnSelect: =Back()
      - lblWarning:
          Control: Label
          Properties:
            Text: ="Needs review"
            TabIndex: =3
      - unknownControl:
          Control: NoSuchControlType
          Properties:
            Text: ="Rejected"
`,
}];

const input = {
  app_name: { value: 'Mixed fixture', resolved_by: 'manifest' as const },
  source_kind: 'inline' as const,
  fingerprint_basis: 'inline/test/v1',
  files: [{ id: 'mixed.pa.yaml', sha256: '0'.repeat(64) }],
  limitations: [],
  connections: { state: 'empty' as const, rows: [] },
};

const options = {
  now: '2026-08-29T12:00:00.000Z',
  report_id: 'report-test-1',
  analyzer_version: '2.4.9-test',
};

function issueMultiset(issues: ReadonlyArray<{
  readonly level: Issue['level'];
  readonly rule?: string;
  readonly file: string;
  readonly line: number;
  readonly control: string;
  readonly property?: string;
}>): string[] {
  return issues.map(issue => JSON.stringify([
    issue.level,
    issue.rule ?? null,
    issue.file,
    issue.line,
    issue.control,
    issue.property ?? null,
  ])).sort();
}

function integrityProjection(snapshot: ReadonlySnapshot): string {
  return JSON.stringify({
    validation: {
      summary: snapshot.validation.summary,
      gate_decision: snapshot.validation.gateDecision,
      per_file: snapshot.validation.per_file,
      issues: snapshot.validation.issues,
      coverage: snapshot.validation.coverage,
    },
    coverage: snapshot.coverage,
    catalog_metadata: snapshot.catalogMetadata,
    bundle: controlNodes(snapshot.bundle).map(node => ({
      name: node.name,
      type: node.type,
      screen: node.screen?.name ?? null,
    })),
  });
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

expectTypeOf<ReadonlySnapshot['validation']['opportunities']>()
  .toEqualTypeOf<ValidationResult['opportunities']>();

function assertReadonlyControlNodesType(bundle: ReadonlySnapshot['bundle']): void {
  expectTypeOf(controlNodes(bundle))
    .toEqualTypeOf<ReadonlyArray<ReadonlySnapshot['bundle']['app'][number]>>();
}
void assertReadonlyControlNodesType;

// Pins DeepReadonly's object/array branch: dropping `readonly` from the mapped
// type must break this file's compile (Task 1 review finding — the function
// guard was type-asserted, the readonly guarantee itself was not).
function assertDeepReadonlyIsEnforced(snapshot: ReadonlySnapshot): void {
  // @ts-expect-error — issue fields on a readonly snapshot are not assignable
  snapshot.validation.issues[0].level = 'REFUSE';
  // @ts-expect-error — nested readonly arrays expose no mutators
  snapshot.validation.per_file.push(snapshot.validation.per_file[0]);
  // @ts-expect-error — the bundle graph is readonly too
  snapshot.bundle.app[0].name = 'mutated';
}
void assertDeepReadonlyIsEnforced;

describe('survey report gate seam', () => {
  it('both profiles keep an inline chain as paste advice with a warning gate', () => {
    const source = [{ name: 'mixed.pa.yaml', content: '- Probe:\n    Control: Button\n    Properties:\n      OnSelect: =Set(a,1);Back()\n' }];
    const snapshot = analyzeSurveyFiles(source);
    const before = integrityProjection(snapshot);
    const shared = buildReport(snapshot, input, options);
    const exported = buildReport(snapshot, input, { ...options, policy: { profile_id: 'existing-export' } });
    expect(shared.gate.summary.refuse).toBe(0);
    expect(exported.gate.summary.refuse).toBe(0);
    expect(exported.gate.summary.warn).toBe(shared.gate.summary.warn);
    expect(exported.gate.gate_decision).toBe('PROCEED_WITH_WARNINGS');
    expect(exported.findings.find(finding => finding.rule === 'inline-formula-paste-hygiene')).toMatchObject({
      level: 'WARN', severity: 'MAINTAINABILITY', fingerprint: shared.findings[0].fingerprint,
    });
    expect(exported.policy.profile_id).toBe('existing-export');
    expect(integrityProjection(snapshot)).toBe(before);
  });

  it.each([
    ['behavior chain', '=Set(a,1);Back()', 0, 1],
    ['compact record', '={A:1}', 0, 1],
    ['record in call', '=With({A:1}, A)', 0, 1],
    ['closed ordinary string only', '="semi;{}"', 0, 0],
    ['doubled quotes inside string', '="say "";{}"""', 0, 0],
    ['string punctuation beside real chain', '=Set(a,";;{}");Back()', 0, 1],
    ['comment-only hazard follows exact outside-string bound', '=1 /* ;{} */', 0, 1],
    ['quoted identifier follows exact outside-string bound', "='Field;name'", 0, 1],
    ['raw colon-space in string', '="x: y"', 1, 0],
    ['raw colon-space plus executable hazard', '=Set(a,"x: y");Back()', 1, 0],
    ['record with raw colon-space', '={A: 1}', 1, 0],
    ['unbalanced formula', '=Set(a,1;Back()', 0, 1],
    ['unclosed ordinary string', '="a;{}', 0, 1],
    ['interpolated string', '=$"value {a}"', 0, 1],
    ['locale behavior separator', '=Set(a,1);;Back()', 0, 1],
    ['locale separator separated by comment', '=Set(a,1);/* note */;Back()', 0, 1],
    ['locale call arguments', '=Set(a;1)', 0, 1],
    ['locale record fields', '={A:1;B:2}', 0, 1],
    ['locale table items', '=[1;2]', 0, 1],
    ['locale grouped expressions', '=(1;2)', 0, 1],
    ['quoted YAML is already exempt', "'=Set(a,1);Back()'", 0, 0],
    ['block YAML is already exempt', '|-\n        =Set(a,1);Back()', 0, 0],
  ])('%s preserves identical profile findings', (_label, value, expectedRefuse, expectedWarn) => {
    const snapshot = analyzeSurveyFiles([{ name: 'mixed.pa.yaml', content:
      `- Probe:\n    Control: Button\n    Properties:\n      OnSelect: ${value}\n` }]);
    const shared = buildReport(snapshot, input, options);
    const exported = buildReport(snapshot, input, { ...options, policy: { profile_id: 'existing-export' } });
    for (const report of [shared, exported]) {
      expect(report.findings.filter(finding => finding.rule === 'block-scalar-required')).toHaveLength(expectedRefuse);
      const warnings = report.findings.filter(finding => finding.rule === 'inline-formula-paste-hygiene');
      expect(warnings).toHaveLength(expectedWarn);
      for (const finding of warnings) {
        expect(finding).toMatchObject({ level: 'WARN', severity: 'MAINTAINABILITY' });
        expect(finding.fix).toContain('For paste, use a block scalar');
      }
    }
    expect(exported.findings).toEqual(shared.findings);
    expect(exported.gate).toEqual(shared.gate);
    expect(() => assertValidReport(exported)).not.toThrow();
  });

  it('retains identical findings, inventories and gates across profiles, and treats findings as persisted', () => {
    const source = [
      { name: 'mixed.pa.yaml', content: '- Probe:\n    Control: Button\n    Properties:\n      OnSelect: =Set(a,1);Back()\n' },
      { name: 'other.pa.yaml', content: '- LabelProbe:\n    Control: Label\n    Properties:\n      Text: ="raw: colon"\n      Wrap: =true\n' },
    ];
    const reportInput = { ...input, files: source.map(file => ({ id: file.name, sha256: '0'.repeat(64) })) };
    const snapshot = analyzeSurveyFiles(source);
    const shared = buildReport(snapshot, reportInput, options);
    const exported = buildReport(snapshot, reportInput, { ...options, policy: { profile_id: 'existing-export' } });
    const previous = buildReport(snapshot, reportInput, { ...options, policy: { profile_id: 'existing-export' }, previous: shared });
    expect(exported.gate.summary).toEqual(shared.gate.summary);
    expect(exported.gate.per_file).toEqual(shared.gate.per_file);
    expect(exported.gate.gate_decision).toBe('BLOCK');
    expect(exported.inventories).toEqual(shared.inventories);
    expect(exported.coverage).toEqual(shared.coverage);
    expect(exported.findings.filter(finding => finding.file === 'other.pa.yaml')).toEqual(shared.findings.filter(finding => finding.file === 'other.pa.yaml'));
    expect(exported.root_causes.map(group => [group.group_id, group.member_fingerprints]).sort()).toEqual(shared.root_causes.map(group => [group.group_id, group.member_fingerprints]).sort());
    const pasteAdvice = shared.findings.find(finding => finding.rule === 'inline-formula-paste-hygiene')!;
    const sharedGroup = shared.root_causes.find(group => group.member_fingerprints.includes(pasteAdvice.fingerprint))!;
    const exportGroup = exported.root_causes.find(group => group.group_id === sharedGroup.group_id)!;
    expect(sharedGroup.dominant_severity).toBe('MAINTAINABILITY');
    expect(exportGroup.dominant_severity).toBe('MAINTAINABILITY');
    expect(exportGroup.priority.score).toBe(sharedGroup.priority.score);
    expect(previous.delta).toMatchObject({ new: [], resolved: [] });
    expect(previous.delta?.persisted).toEqual(shared.findings.map(finding => finding.fingerprint).sort());
    const envelopeOptions = { id: '11111111-1111-4111-8111-111111111111', catalog_allowlist: ANALYZER_CATALOG_ALLOWLIST };
    expect(buildEnvelope(snapshot, exported, envelopeOptions)).toEqual(buildEnvelope(snapshot, shared, envelopeOptions));
  });

  it('defaults to shared, rejects unknown selectors for new analysis, and still accepts historical report labels', () => {
    const snapshot = analyzeSurveyFiles(files);
    const implicit = buildReport(snapshot, input, options);
    expect(implicit).toEqual(buildReport(snapshot, input, { ...options, policy: { profile_id: 'shared' } }));
    expect(implicit.policy.profile_id).toBe('shared');
    for (const profile of ['', 'default', 'consultant-strict', null, 0, {}, []]) {
      expect(() => buildReport(snapshot, input, { ...options, policy: { profile_id: profile as never } })).toThrow('policy.profile_id must be shared or existing-export');
    }
    const historical = { ...implicit, policy: { ...implicit.policy, profile_id: 'consultant-strict' } };
    expect(() => assertValidReport(historical)).not.toThrow();
    expect(buildReport(snapshot, input, { ...options, previous: historical }).delta?.resolved).toEqual([]);
  });

  it('copies the fresh analyzer gate and issue multiset without mutating validation', async () => {
    const snapshot = analyze(files, ANALYZER_CATALOG_DATA);
    expect(snapshot.validation.summary.pass).toBeGreaterThan(0);
    expect(snapshot.validation.summary.warn).toBeGreaterThan(0);
    expect(snapshot.validation.summary.refuse).toBeGreaterThan(0);
    const before = await sha256(integrityProjection(snapshot));

    const report = buildReport(snapshot, input, options);
    const fresh = analyze(files, ANALYZER_CATALOG_DATA);

    expect(report.gate).toEqual({
      summary: fresh.validation.summary,
      per_file: fresh.validation.per_file,
      gate_decision: fresh.validation.gateDecision,
    });
    expect(issueMultiset(report.findings)).toEqual(issueMultiset(
      fresh.validation.issues.filter(issue => issue.level !== 'PASS'),
    ));
    expect(await sha256(integrityProjection(snapshot))).toBe(before);
  });
});
