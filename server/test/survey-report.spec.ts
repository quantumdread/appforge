import { describe, expect, it } from 'vitest';
import { analyze } from '../src/core/snapshot';
import {
  buildReport,
  ReportBuildError,
  type SurveyInput,
  type SurveyOptions,
} from '../src/core/survey/build-report';
import type { AnalysisReportV1 } from '../src/core/survey/report-types';
import type { SurveyEnvelopeV1 } from '../src/core/survey/envelope-types';
import {
  assertEmittableReport,
  EmittableReportError,
} from '../src/core/survey/emittable-report';
import { validateReport } from '../src/core/survey/validate-report';
import { ANALYZER_CATALOG_DATA } from '../src/lib/catalog-data';

const FILES = [{
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

const INPUT = {
  app_name: { value: 'Mixed fixture', resolved_by: 'manifest' as const },
  source_kind: 'directory' as const,
  fingerprint_basis: 'directory/src-stripped/v1',
  files: [{ id: 'mixed.pa.yaml', sha256: '0'.repeat(64) }],
  limitations: [],
  connections: { state: 'empty' as const, rows: [] },
};

const OPTIONS = {
  now: '2026-08-29T12:00:00.000Z',
  report_id: 'report-test-1',
  analyzer_version: '2.4.9-test',
};

export function buildMixedReport(options: SurveyOptions = OPTIONS) {
  return buildReport(analyze(FILES, ANALYZER_CATALOG_DATA), INPUT, options);
}

function annotationInvariantProjection(report: AnalysisReportV1) {
  return {
    gate: report.gate,
    findings: report.findings.map(finding => ({
      level: finding.level,
      rule: finding.rule,
      file: finding.file,
      line: finding.line,
      control: finding.control,
      property: finding.property,
      fingerprint: finding.fingerprint,
      severity: finding.severity,
      confidence: finding.confidence,
      group_id: finding.group_id,
    })),
    priority_inputs: report.root_causes.map(root => ({
      group_id: root.group_id,
      priority: root.priority,
      dominant_severity: root.dominant_severity,
    })),
    remediation_order: report.remediation_plan.map(row => ({
      group_id: row.group_id,
      band: row.band,
      score: row.score,
    })),
  };
}

function deltaFixture(names: readonly string[]) {
  return `Screens:
  Main:
    Children:
${names.map(name => `      - ${name}:
          Control: Label
          Properties:
            Text: ="${name}"
            TabIndex: =3`).join('\n')}
`;
}

function aggregateFixture(count: number) {
  return `Screens:
  Main:
    Children:
${Array.from({ length: count }, (_, index) => `      - txt${index + 1}:
          Control: TextInput`).join('\n')}
`;
}

function buildSingle(
  content: string,
  options: Partial<SurveyOptions> = {},
  inputOverrides: Partial<SurveyInput> = {},
  analyzeOptions: Parameters<typeof analyze>[2] = {},
) {
  const file = { name: 'screen.pa.yaml', content };
  const input: SurveyInput = {
    app_name: { value: 'Delta fixture', resolved_by: 'manifest' },
    source_kind: 'directory',
    fingerprint_basis: 'directory/root-posix-v1',
    files: [{ id: file.name, sha256: '1'.repeat(64) }],
    limitations: [],
    connections: { state: 'empty', rows: [] },
    ...inputOverrides,
  };
  return buildReport(analyze([file], ANALYZER_CATALOG_DATA, analyzeOptions), input, {
    ...OPTIONS,
    report_id: 'single-report',
    ...options,
  });
}

describe('AnalysisReportV1 assembly', () => {
  it('assembles every authoritative section without PASS findings', () => {
    const report = buildMixedReport();

    expect(Object.keys(report)).toEqual([
      'report_schema',
      'report_schema_minor',
      'report_id',
      'identity',
      'gate',
      'findings',
      'root_causes',
      'inventories',
      'coverage',
      'remediation_plan',
      'baseline',
      'suppressions',
      'policy',
      'envelope',
    ]);
    expect(report.identity).toMatchObject({
      app_id: 'mixed-fixture-cf8d98f4',
      completeness: 'full',
      files: INPUT.files,
      surveyed_at: OPTIONS.now,
      analyzer_version: OPTIONS.analyzer_version,
    });
    expect(report.gate.gate_decision).toBe('BLOCK');
    expect(report.gate.summary).toMatchObject({ pass: 4, warn: 2, refuse: 1 });
    expect(report.findings.map(finding => finding.level).sort()).toEqual([
      'REFUSE', 'WARN', 'WARN',
    ]);
    expect(report.findings.every(finding => (
      finding.origin === 'analyzer'
      && finding.edits.length === 0
      && finding.members_changed === null
    ))).toBe(true);
    expect(report.root_causes).toHaveLength(report.findings.length);
    expect(report.remediation_plan).toHaveLength(report.root_causes.length);
    expect(report.inventories).toMatchObject({
      datasources: { state: 'empty', rows: [] },
      backend_risks: { state: 'empty', rows: [] },
      version_lag: { state: 'empty', rows: [] },
      screens: { state: 'available' },
      components: { state: 'empty', rows: [] },
      connections: { state: 'empty', rows: [] },
    });
    expect(report.coverage.tiers).toEqual(analyze(FILES, ANALYZER_CATALOG_DATA).coverage.tiers);
    expect(report.envelope).toEqual({
      id: null,
      path: null,
      submission: { state: 'not_requested' },
    });
  });

  it('is byte-deterministic for identical inputs', () => {
    expect(JSON.stringify(buildMixedReport())).toBe(JSON.stringify(buildMixedReport()));
  });

  it('keeps a clean datasource inventory row after an unrelated warning disappears', () => {
    const clean = `Screens:
  Main:
    Children:
      - galOrders:
          Control: Gallery
          Properties:
            Items: =Orders
            AccessibleLabel: ="Orders"
`;
    const warning = clean.replace('            AccessibleLabel: ="Orders"\n', '');
    const before = buildSingle(warning);
    const after = buildSingle(clean);
    const expected = {
      state: 'available',
      rows: [{ name: 'Orders', backend: null, resolved_by: 'unresolved', confidence: 'none' }],
    };

    expect(before.findings).toHaveLength(1);
    expect(after.findings).toEqual([]);
    expect(before.inventories.datasources).toEqual(expected);
    expect(after.inventories.datasources).toEqual(expected);
    expect(after.gate.gate_decision).toBe('CLEAR');
    expect(validateReport(after)).toEqual({ valid: true, errors: [] });
  });

  it('unions collected candidates and unused declarations in exact provenance order', () => {
    const content = `Screens:
  Main:
    Children:
      - galOrders:
          Control: Gallery
          Properties:
            Items: =Orders
            AccessibleLabel: ="Orders"
      - galCache:
          Control: Gallery
          Properties:
            Items: =colCache
            AccessibleLabel: ="Cache"
`;
    const explicit = { Orders: 'sql', Unused: 'dataverse' } as const;
    const exported = { Orders: 'excel', ExportOnly: 'sharepoint' } as const;
    const report = buildSingle(content, {}, {
      explicit_datasources: explicit,
      export_datasources: exported,
    }, { lintContext: { datasources: explicit, exportDatasources: exported } });

    expect(report.findings).toEqual([]);
    expect(report.inventories.datasources).toEqual({
      state: 'available',
      rows: [
        { name: 'ExportOnly', backend: 'sharepoint', resolved_by: 'export-metadata', confidence: 'medium' },
        { name: 'Orders', backend: 'sql', resolved_by: 'explicit-input', confidence: 'high' },
        { name: 'Unused', backend: 'dataverse', resolved_by: 'explicit-input', confidence: 'high' },
        { name: 'colCache', backend: 'collection', resolved_by: 'naming-convention', confidence: 'low' },
      ],
    });
  });

  it('retains historical issue-bound rows when lexical collection cannot name an expression', () => {
    const files = [{ name: INPUT.files[0].id, content: `Screens:
  Main:
    Children:
      - galOrders:
          Control: Gallery
          Properties:
            Items: =Search(Orders + OtherRows, "text", Title)
            AccessibleLabel: ="Orders"
` }];
    const snapshot = analyze(files, ANALYZER_CATALOG_DATA);
    expect(snapshot.datasourceReferences).toEqual([]);
    const report = buildReport(snapshot, INPUT, OPTIONS);
    expect(report.inventories.datasources).toEqual({
      state: 'available',
      rows: [{ name: 'Orders', backend: null, resolved_by: 'unresolved', confidence: 'none' }],
    });
  });

  it('leaves gate, finding fingerprints and grouping unchanged when candidates add inventory rows', () => {
    const files = [{ name: INPUT.files[0].id, content: `${FILES[0].content}      - galOrders:
          Control: Gallery
          Properties:
            Items: =Orders
            AccessibleLabel: ="Orders"
` }];
    const snapshot = analyze(files, ANALYZER_CATALOG_DATA);
    const withoutCandidates = buildReport({ ...snapshot, datasourceReferences: [] }, INPUT, OPTIONS);
    const withCandidates = buildReport(snapshot, INPUT, OPTIONS);

    expect(withCandidates.inventories.datasources.state).toBe('available');
    expect(withoutCandidates.inventories.datasources.state).toBe('empty');
    expect(annotationInvariantProjection(withCandidates)).toEqual(annotationInvariantProjection(withoutCandidates));
    expect(withCandidates.baseline.formula).toBe('finding-fingerprint/2');
    expect(validateReport(withCandidates)).toEqual({ valid: true, errors: [] });
  });

  it('names a proven did-you-mean candidate in remediation and invents none otherwise', () => {
    const report = buildSingle(`Screens:
  Main:
    Children:
      - near:
          Control: Label
          Properties:
            Texd: ="near"
      - far:
          Control: Label
          Properties:
            DefinitelyUnknownProperty: ="far"
`);
    const near = report.findings.find(finding => finding.control === 'near')!;
    const far = report.findings.find(finding => finding.control === 'far')!;
    const nearRoot = report.root_causes.find(root => root.group_id === near.group_id)!;
    const farRoot = report.root_causes.find(root => root.group_id === far.group_id)!;

    expect(near.did_you_mean).toBe('Text');
    expect(nearRoot.remediation.how).toBe("Use the known catalog candidate 'Text'.");
    expect(far.did_you_mean).toBeNull();
    expect(farRoot.remediation.how).toBe('No rule-provided fix is available.');
  });

  it('derives group blast from distinct screens when one file contains multiple screens', () => {
    const report = buildSingle(`Screens:
  First:
    Children:
      - galFirst:
          Control: Gallery
          Properties:
            Items: =FirstN(Orders, 10)
      - galFirstAgain:
          Control: Gallery
          Properties:
            Items: =FirstN(Customers, 10)
      - galFirstAgainTwo:
          Control: Gallery
          Properties:
            Items: =FirstN(Customers, 10)
  Second:
    Children:
      - galSecond:
          Control: Gallery
          Properties:
            Items: =FirstN(Orders, 10)
`);
    const firstGroupId = report.findings.find(finding =>
      finding.rule === 'delegation-firstn-on-source'
      && finding.control === 'galFirst')!.group_id;
    const sameScreenGroupId = report.findings.find(finding =>
      finding.rule === 'delegation-firstn-on-source'
      && finding.control === 'galFirstAgain')!.group_id;

    expect(report.root_causes.find(root => root.group_id === firstGroupId)
      ?.priority.inputs.blast.screens).toBe(2);
    expect(report.root_causes.find(root => root.group_id === sameScreenGroupId)
      ?.priority.inputs.blast.screens).toBe(1);
  });

  it('carries the complete public finding shape without evidence', () => {
    const finding = buildMixedReport().findings[0];

    expect(Object.keys(finding)).toEqual([
      'level',
      'rule',
      'file',
      'line',
      'control',
      'type',
      'variant',
      'property',
      'detail',
      'fix',
      'did_you_mean',
      'controls',
      'near_miss',
      'origin',
      'fingerprint',
      'severity',
      'confidence',
      'confidence_basis',
      'claim_ref',
      'group_id',
      'baseline_status',
      'adjudication',
      'members_changed',
      'edits',
      'campaign_ref',
      'queue_refs',
    ]);
    expect(JSON.stringify(buildMixedReport())).not.toContain('"evidence"');
  });

  it('keeps baselines and suppressions annotation-only and lets suppression win state', () => {
    const plain = buildMixedReport();
    const target = plain.findings.find(finding => finding.rule === 'a11y-tabindex-positive')!;
    const block = plain.findings.find(finding => finding.severity === 'BLOCK')!;
    const acceptedAt = '2026-08-01T00:00:00.000Z';
    const baselineEntries = [target, block].map(finding => ({
      fingerprint: finding.fingerprint,
      rule: finding.rule,
      accepted_at: acceptedAt,
    })).sort((left, right) => (
      `${left.fingerprint}\u0000${left.rule}`.localeCompare(`${right.fingerprint}\u0000${right.rule}`)
    ));
    const annotated = buildMixedReport({
      ...OPTIONS,
      baseline: {
        baseline_schema: 'analysis-baseline/1',
        formula: 'finding-fingerprint/2',
        fingerprint_basis: INPUT.fingerprint_basis,
        entries: baselineEntries,
      },
      suppressions: [
        {
          rule: target.rule,
          scope: { file: target.file, control: target.control },
          rationale: 'accepted temporary debt',
          owner: 'architecture-board',
          expires: '2027-08-29T00:00:00.000Z',
        },
        {
          rule: block.rule,
          scope: {},
          rationale: 'must not affect a block',
          owner: 'architecture-board',
          expires: '2027-08-29T00:00:00.000Z',
        },
      ],
    });

    expect(annotationInvariantProjection(annotated)).toEqual(annotationInvariantProjection(plain));
    expect(annotated.findings.find(finding => finding.fingerprint === target.fingerprint))
      .toMatchObject({ baseline_status: 'accepted', suppressed_by: 'architecture-board' });
    expect(annotated.findings.find(finding => finding.fingerprint === block.fingerprint))
      .toMatchObject({ baseline_status: 'new' });
    expect(annotated.findings.find(finding => finding.fingerprint === block.fingerprint))
      .not.toHaveProperty('suppressed_by');
    expect(annotated.baseline).toMatchObject({ accepted_total: 1, migration_required: false });
    expect(annotated.baseline.stale_entries).toEqual([
      baselineEntries.find(entry => entry.fingerprint === block.fingerprint),
    ]);
    expect(annotated.suppressions.applied_count).toBe(1);
    expect(annotated.root_causes.find(root => root.group_id === target.group_id)?.action_state)
      .toBe('suppressed');
  });

  it('reports legacy baseline migration without matching or wholesale staleness', () => {
    const report = buildMixedReport({
      ...OPTIONS,
      baseline: {
        data: {
          tool_version: '2.4.8',
          findings: [{ fingerprint: '0123456789ab', rule: 'a11y-tabindex-positive' }],
        },
        source: 'legacy-cli-baseline.json',
      },
    });

    expect(report.baseline).toEqual({
      formula: 'finding-fingerprint/2',
      applied_from: 'legacy-cli-baseline.json',
      basis_matches: false,
      accepted_total: 0,
      stale_entries: [],
      migration_required: true,
    });
    expect(report.findings.every(finding => finding.baseline_status === 'new')).toBe(true);
  });

  it('reports expired and invalid suppressions without applying them', () => {
    const target = buildMixedReport().findings.find(finding => finding.level === 'WARN')!;
    const report = buildMixedReport({
      ...OPTIONS,
      suppressions: [
        {
          rule: target.rule,
          scope: {},
          rationale: 'expired approval',
          owner: 'old-owner',
          expires: '2026-08-28T00:00:00.000Z',
        },
        {
          rule: target.rule,
          scope: {},
          rationale: 'missing owner is invalid',
          expires: '2027-08-29T00:00:00.000Z',
        },
      ],
    });

    expect(report.suppressions).toMatchObject({ applied_count: 0 });
    expect(report.suppressions.expired).toHaveLength(1);
    expect(report.suppressions.invalid).toEqual([{
      index: 1,
      reason: 'owner is required and must be a non-empty string',
    }]);
    expect(report.findings.every(finding => finding.suppressed_by === undefined)).toBe(true);
  });

  it('echoes the policy inputs and records that blocking policy was applied', () => {
    const report = buildMixedReport({
      ...OPTIONS,
      policy: {
        profile_id: 'shared',
        severity_overrides: [{
          rule: 'a11y-tabindex-positive',
          severity: 'CORRECTNESS_RISK',
        }],
        priority_weights: { CONFIDENCE_MULT: { medium: 0.75 } },
      },
    });

    expect(report.policy).toEqual({
      profile_id: 'shared',
      blocking_policy_applied: true,
      severity_overrides: [{
        rule: 'a11y-tabindex-positive',
        severity: 'CORRECTNESS_RISK',
      }],
      priority_weights: { CONFIDENCE_MULT: { medium: 0.75 } },
    });
    expect(report.gate).toEqual(buildMixedReport().gate);
  });

  it('wraps malformed priority weights as an invalid-policy report build error', () => {
    let thrown: unknown;
    try {
      buildMixedReport({
        ...OPTIONS,
        policy: {
          priority_weights: { CONFIDENCE_MULT: { medium: 'heavy' as never } },
        },
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ReportBuildError);
    expect(thrown).toMatchObject({
      code: 'invalid-policy',
      message: 'priority_weights.CONFIDENCE_MULT.medium must be a finite number',
    });
  });

  it('computes resolved, persisted, and new fingerprints', () => {
    const previous = buildSingle(deltaFixture(['lblPersist', 'lblResolved']));
    const current = buildSingle(deltaFixture(['lblPersist', 'lblNew']), { previous });
    const previousByControl = new Map(previous.findings.map(finding => [finding.control, finding]));
    const currentByControl = new Map(current.findings.map(finding => [finding.control, finding]));

    expect(current.delta?.resolved).toHaveLength(2);
    expect(current.delta?.persisted).toHaveLength(2);
    expect(current.delta?.new).toHaveLength(2);
    expect(current.delta?.resolved).toContain(previousByControl.get('lblResolved')!.fingerprint);
    expect(current.delta?.persisted).toContain(currentByControl.get('lblPersist')!.fingerprint);
    expect(current.delta?.new).toContain(currentByControl.get('lblNew')!.fingerprint);
    expect(currentByControl.get('lblPersist')!.members_changed).toBe(false);
    expect(currentByControl.get('lblNew')!.members_changed).toBe(false);
  });

  it('marks aggregate membership changes without minting a new fingerprint', () => {
    const previous = buildSingle(aggregateFixture(3));
    const current = buildSingle(aggregateFixture(4), { previous });
    const aggregate = current.findings.find(
      finding => finding.rule === 'a11y-inputs-missing-accessiblelabel',
    )!;
    const previousAggregate = previous.findings.find(
      finding => finding.rule === 'a11y-inputs-missing-accessiblelabel',
    )!;

    expect(aggregate.fingerprint).toBe(previousAggregate.fingerprint);
    expect(aggregate.controls).toHaveLength(4);
    expect(aggregate.members_changed).toBe(true);
    expect(current.delta?.persisted).toContain(aggregate.fingerprint);
  });

  it('renders provenance churn as resolved plus new', () => {
    const yaml = `Screens:
  Main:
    Children:
      - galOrders:
          Control: Gallery
          Properties:
            Items: =Search(Orders, txtSearch.Value, Title)
`;
    const previous = buildSingle(yaml);
    const current = buildSingle(
      yaml,
      { previous },
      { explicit_datasources: { Orders: 'sharepoint' } },
      { lintContext: { datasources: { Orders: 'sharepoint' } } },
    );
    const oldFinding = previous.findings.find(finding => finding.rule === 'delegation-search-caveat')!;
    const sharpened = current.findings.find(
      finding => finding.rule === 'delegation-sharepoint-search',
    )!;

    expect(current.delta?.resolved).toContain(oldFinding.fingerprint);
    expect(current.delta?.new).toContain(sharpened.fingerprint);
    expect(sharpened.fingerprint).not.toBe(oldFinding.fingerprint);
  });

  it.each([
    ['fingerprint basis', (previous: AnalysisReportV1) => ({
      previous,
      input: { fingerprint_basis: 'a-different-basis' } as Partial<SurveyInput>,
    })],
    ['app id', (previous: AnalysisReportV1) => ({
      previous,
      input: {
        app_name: { value: 'Another app', resolved_by: 'manifest' as const },
      } as Partial<SurveyInput>,
    })],
    ['formula', (previous: AnalysisReportV1) => {
      const incompatible = structuredClone(previous);
      Object.assign(incompatible.baseline, { formula: 'finding-fingerprint/99' });
      return { previous: incompatible, input: {} as Partial<SurveyInput> };
    }],
  ] as const)('refuses a delta across a different %s', (_label, arrange) => {
    const previous = buildSingle(deltaFixture(['lblPersist']));
    const { previous: incompatible, input } = arrange(previous);

    expect(() => buildSingle(deltaFixture(['lblPersist']), {
      previous: incompatible,
    }, input)).toThrow(ReportBuildError);
    try {
      buildSingle(deltaFixture(['lblPersist']), { previous: incompatible }, input);
    } catch (error) {
      expect(error).toMatchObject({ code: 'delta-comparison-refused' });
    }
  });

  it('throws a typed error when snapshot and intake file id sets differ', () => {
    const snapshot = analyze(FILES, ANALYZER_CATALOG_DATA);
    const badInput = {
      ...INPUT,
      files: [{ id: 'different.pa.yaml', sha256: '0'.repeat(64) }],
    };

    expect(() => buildReport(snapshot, badInput, OPTIONS)).toThrow(ReportBuildError);
    try {
      buildReport(snapshot, badInput, OPTIONS);
    } catch (error) {
      expect(error).toMatchObject({ code: 'file-id-mismatch' });
    }
  });

  it('derives app_id from the resolved name and records the same-name collision limit', () => {
    const first = buildSingle(deltaFixture(['lblOne']));
    const differentRoot = buildSingle(deltaFixture(['lblOne']), {}, {
      fingerprint_basis: 'directory/a-different-root',
    });
    const unnamed = buildSingle(deltaFixture(['lblOne']), {}, {
      app_name: { value: null, resolved_by: 'unresolved' },
    });

    expect(first.identity.app_id).toBe(differentRoot.identity.app_id);
    expect(first.identity.app_id).toMatch(/^delta-fixture-[0-9a-f]{8}$/u);
    expect(unnamed.identity.app_id).toMatch(/^unnamed-[0-9a-f]{8}$/u);
    expect(unnamed.identity.app_id).not.toBe(first.identity.app_id);
  });

  it.each([
    ['skipped legacy source', { kind: 'skipped-legacy-source', source: 'dialect', detail: 'legacy' }],
    ['malformed metadata', { kind: 'metadata-malformed', source: 'connections', detail: 'bad json' }],
    ['skipped symlink', { kind: 'skipped-symlink', source: 'linked', detail: 'not followed' }],
  ] as const)('marks completeness partial for %s', (_label, limitation) => {
    expect(buildSingle(deltaFixture(['lblOne']), {}, { limitations: [limitation] })
      .identity.completeness).toBe('partial');
  });

  it.each([
    ['absent metadata', { kind: 'metadata-absent', source: 'connections', detail: 'absent' }],
    ['unsupported metadata', { kind: 'metadata-unsupported', source: 'connections', detail: 'future' }],
  ] as const)('does not mark source completeness partial for %s', (_label, limitation) => {
    expect(buildSingle(deltaFixture(['lblOne']), {}, { limitations: [limitation] })
      .identity.completeness).toBe('full');
  });

  it('marks zero recognized roots and unrecognized lines partial with coverage entries', () => {
    const unrecognized = buildSingle('FutureRoot:\n  Shape: 1\n');
    expect(unrecognized.identity.completeness).toBe('partial');
    expect(unrecognized.coverage.limitations).toEqual(expect.arrayContaining([
      { kind: 'unrecognized-file', file: 'screen.pa.yaml' },
      { kind: 'unrecognized-content', file: 'screen.pa.yaml', lines: [[1, 2]] },
    ]));

    const mixed = buildSingle(`${deltaFixture(['lblOne'])}FutureRoot:\n  Shape: 1\n`);
    expect(mixed.identity.completeness).toBe('partial');
    expect(mixed.coverage.limitations).toContainEqual({
      kind: 'unrecognized-content',
      file: 'screen.pa.yaml',
      lines: [[9, 10]],
    });
  });
});

describe('emitted report gate', () => {
  const ENVELOPE_ID = '123e4567-e89b-42d3-a456-426614174000';
  const EXPECTED_ENVELOPE = { id: ENVELOPE_ID } as SurveyEnvelopeV1;

  function emitted(surface: 'cli' | 'mcp', state: AnalysisReportV1['envelope']['submission']) {
    const report = buildMixedReport();
    report.report_id = '223e4567-e89b-42d3-a456-426614174000';
    report.envelope = {
      id: ENVELOPE_ID,
      path: surface === 'cli'
        ? 'C:\\reports\\appforge-survey\\envelope-123e4567-e89b-42d3-a456-426614174000.json'
        : null,
      submission: state,
    };
    return report;
  }

  it('keeps core drafts schema-valid but rejects them as non-emittable', () => {
    const draft = buildMixedReport();
    expect(validateReport(draft)).toEqual({ valid: true, errors: [] });
    expect(() => assertEmittableReport(draft, {
      surface: 'mcp',
      envelope: EXPECTED_ENVELOPE,
    })).toThrow(EmittableReportError);
  });

  it('accepts CLI and MCP path semantics with legal submission states', () => {
    const states: AnalysisReportV1['envelope']['submission'][] = [
      { state: 'not_requested' },
      { state: 'pending' },
      { state: 'acknowledged', attempted_at: '2026-08-30T08:00:00.000Z' },
      {
        state: 'failed',
        attempted_at: '2026-08-30T08:00:00.000Z',
        error_code: 'coordinator-unavailable',
      },
    ];

    for (const surface of ['cli', 'mcp'] as const) {
      for (const state of states) {
        expect(() => assertEmittableReport(emitted(surface, state), {
          surface,
          envelope: EXPECTED_ENVELOPE,
        })).not.toThrow();
      }
    }
  });

  it('rejects mismatched ids and non-normalized surface paths', () => {
    const badReportId = emitted('mcp', { state: 'not_requested' });
    badReportId.report_id = 'not-a-uuid';
    const reusedReportId = emitted('mcp', { state: 'not_requested' });
    reusedReportId.report_id = ENVELOPE_ID;
    const badId = emitted('mcp', { state: 'not_requested' });
    badId.envelope.id = 'not-a-uuid';
    const mismatch = emitted('mcp', { state: 'not_requested' });
    mismatch.envelope.id = '123e4567-e89b-42d3-a456-426614174001';
    const mcpPath = emitted('mcp', { state: 'not_requested' });
    mcpPath.envelope.path = '/tmp/envelope.json';
    const cliRelative = emitted('cli', { state: 'not_requested' });
    cliRelative.envelope.path = 'relative/envelope.json';
    const cliTraversal = emitted('cli', { state: 'not_requested' });
    cliTraversal.envelope.path = 'C:\\reports\\..\\secret\\envelope.json';

    for (const [surface, report] of [
      ['mcp', badReportId],
      ['mcp', reusedReportId],
      ['mcp', badId],
      ['mcp', mismatch],
      ['mcp', mcpPath],
      ['cli', cliRelative],
      ['cli', cliTraversal],
    ] as const) {
      expect(() => assertEmittableReport(report, {
        surface,
        envelope: EXPECTED_ENVELOPE,
      })).toThrow(EmittableReportError);
    }
  });

  it('rejects every illegal submission conditional-field combination', () => {
    const illegal: AnalysisReportV1['envelope']['submission'][] = [
      { state: 'not_requested', attempted_at: '2026-08-30T08:00:00.000Z' },
      { state: 'not_requested', error_code: 'unexpected' },
      { state: 'pending', attempted_at: '2026-08-30T08:00:00.000Z' },
      { state: 'pending', error_code: 'unexpected' },
      { state: 'acknowledged' },
      {
        state: 'acknowledged',
        attempted_at: '2026-08-30T08:00:00.000Z',
        error_code: 'unexpected',
      },
      { state: 'failed' },
      { state: 'failed', attempted_at: '2026-08-30T08:00:00.000Z' },
      { state: 'failed', error_code: 'coordinator-unavailable' },
      {
        state: 'failed',
        attempted_at: 'not-a-date',
        error_code: 'coordinator-unavailable',
      },
      {
        state: 'failed',
        attempted_at: '2026-08-30T08:00:00.000Z',
        error_code: 'Unstable error text!',
      },
    ];

    for (const surface of ['cli', 'mcp'] as const) {
      const accepted = illegal.map(state => {
        try {
          assertEmittableReport(emitted(surface, state), {
            surface,
            envelope: EXPECTED_ENVELOPE,
          });
          return true;
        } catch {
          return false;
        }
      });
      expect(accepted).toEqual(illegal.map(() => false));
    }
  });
});
