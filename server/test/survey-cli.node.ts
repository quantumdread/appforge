import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import * as nativeFs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as analyzerArtifact from '../../cli/dist/analyzer-core.mjs';
import {
  ANALYZER_CATALOG_ALLOWLIST,
  SurveyDatasourceMapError,
  analyzeSurveyFiles,
  assertSurveyPreviousReport,
  normalizeSurveyDatasourceMap,
} from '../src/lib/survey';
import { buildReport, ReportBuildError } from '../src/core/survey/build-report';
import { buildEnvelope, serializeEnvelope } from '../src/core/survey/envelope';
import { assertEmittableBaseline, parseAnalysisBaseline } from '../src/core/survey/baseline-input';
import { assertEmittableReport } from '../src/core/survey/emittable-report';
import { renderTechnical } from '../src/core/survey/render-technical';
import {
  assertValidEnvelope,
  decodeCanonicalEnvelope,
  validateEnvelope,
} from '../src/core/survey/validate-envelope';
import { assertValidReport } from '../src/core/survey/validate-report';
import { validateAnalysisReport } from '../src/core/survey/validate-report';
import {
  CONTROLS,
  CONTROL_PROPERTIES,
  DUMP_SOURCED,
  PARENT_CONTEXT_PROPERTIES,
  SYNTHETIC,
} from '../src/generated/catalog';
import { IntakeError, resolveIntake } from '../../cli/lib/intake.mjs';
import {
  executeSurvey,
  parseSurveyArgs,
  prepareSurvey,
} from '../../cli/lib/survey-command.mjs';
import { buildZip } from './helpers/build-zip';

const NOW = '2026-08-30T08:00:00.000Z';
const SCRIPT = resolve(
  __dirname,
  '..',
  '..',
  'cli',
  'validate.mjs',
);
const SCREEN = `Screens:\n  Main:\n    Children:\n      - lblOne:\n          Control: Text\n          Properties:\n            Text: ="hello"\n            Wrap: =true\n`;
const DUPLICATE_A = `Screens:\n  First:\n    Children:\n      - repeatedName:\n          Control: Text\n          Properties:\n            Text: ="one"\n`;
const DUPLICATE_B = `Screens:\n  Second:\n    Children:\n      - repeatedName:\n          Control: Text\n          Properties:\n            Text: ="two"\n`;
const DATASOURCE_SCREEN = `Screens:\n  Main:\n    Children:\n      - galOrders:\n          Control: Gallery\n          Properties:\n            AccessibleLabel: ="Orders"\n            Items: =Filter(Orders, IsBlank(Note))\n      - galArchive:\n          Control: Gallery\n          Properties:\n            AccessibleLabel: ="Archive"\n            Items: =Search(Archive, txtQuery.Text, "Name")\n`;

const REQUIRED_SURVEY_ARTIFACT_EXPORTS = [
  'ANALYZER_CATALOG_ALLOWLIST',
  'analyzeSurveyFiles',
  'assertSurveyPreviousReport',
  'normalizeSurveyDatasourceMap',
  'buildReport',
  'buildEnvelope',
  'serializeEnvelope',
  'assertValidEnvelope',
  'decodeCanonicalEnvelope',
  'validateEnvelope',
  'assertEmittableBaseline',
  'parseAnalysisBaseline',
  'assertEmittableReport',
  'assertValidReport',
  'validateAnalysisReport',
  'renderTechnical',
] as const;

const sourceCore = {
  ANALYZER_CORE_VERSION: '2.4.10-test',
  ANALYZER_CATALOG_ALLOWLIST,
  analyzeSurveyFiles,
  assertSurveyPreviousReport,
  assertValidReport,
  assertValidEnvelope,
  assertEmittableBaseline,
  assertEmittableReport,
  buildEnvelope,
  buildReport,
  decodeCanonicalEnvelope,
  normalizeSurveyDatasourceMap,
  parseAnalysisBaseline,
  renderTechnical,
  serializeEnvelope,
  validateAnalysisReport,
  validateEnvelope,
};

let root: string;
let appRoot: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'survey-cli-'));
  appRoot = join(root, 'App');
  mkdirSync(appRoot);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function prepare(argv: string[], overrides: Record<string, unknown> = {}) {
  return prepareSurvey(argv, {
    core: sourceCore,
    now: () => NOW,
    newReportId: () => 'draft-report-id',
    ...overrides,
  });
}

function execute(argv: string[], overrides: Record<string, unknown> = {}) {
  return executeSurvey(argv, {
    core: sourceCore,
    cwd: root,
    now: () => NOW,
    newReportId: () => '10000000-0000-4000-8000-000000000001',
    newEnvelopeId: () => '20000000-0000-4000-8000-000000000001',
    ...overrides,
  });
}

describe('survey-only datasource normalization', () => {
  it('copies only own enumerable keys into a null-prototype map, preserving special names', () => {
    const inherited = { inheritedCustomerSource: 'sql' };
    const value = Object.create(inherited) as Record<string, unknown>;
    Object.defineProperty(value, '__proto__', {
      value: 'sharepoint', enumerable: true, configurable: true, writable: true,
    });
    Object.defineProperty(value, 'constructor', {
      value: 'excel', enumerable: true, configurable: true, writable: true,
    });

    const normalized = normalizeSurveyDatasourceMap(value);

    expect(Object.getPrototypeOf(normalized)).toBeNull();
    expect(Object.keys(normalized)).toEqual(['__proto__', 'constructor']);
    expect(normalized.__proto__).toBe('sharepoint');
    expect(normalized.constructor).toBe('excel');
    expect(Object.hasOwn(normalized, 'inheritedCustomerSource')).toBe(false);
  });

  it.each([null, [], 'not-an-object', { Source: 1 }, { Source: 'unknown-backend' }])(
    'rejects invalid input %# before the core trust boundary',
    value => {
      expect(() => normalizeSurveyDatasourceMap(value)).toThrow(SurveyDatasourceMapError);
    },
  );
});

describe('shared survey analyzer composition', () => {
  it('derives and freezes the exact extractor-only type/property allowlist', () => {
    const excluded = new Set<string>([...DUMP_SOURCED, ...SYNTHETIC]);
    const expectedTypes = CONTROLS
      .map(control => control.type)
      .filter(type => !excluded.has(type))
      .sort();

    expect(ANALYZER_CATALOG_ALLOWLIST.extractor_control_types).toEqual(expectedTypes);
    expect(Object.isFrozen(ANALYZER_CATALOG_ALLOWLIST)).toBe(true);
    expect(Object.isFrozen(ANALYZER_CATALOG_ALLOWLIST.extractor_control_types)).toBe(true);
    expect(Object.isFrozen(ANALYZER_CATALOG_ALLOWLIST.properties_by_control_type)).toBe(true);
    expect(Object.getPrototypeOf(ANALYZER_CATALOG_ALLOWLIST.properties_by_control_type)).toBeNull();

    for (const type of expectedTypes) {
      const entry = CONTROL_PROPERTIES[type as keyof typeof CONTROL_PROPERTIES];
      const expectedProperties = new Set(Object.keys(entry?.input_properties ?? {}));
      for (const variant of Object.values(entry?.variant_input_properties ?? {})) {
        Object.keys(variant).forEach(property => expectedProperties.add(property));
      }
      for (const bundle of entry?.parent_context ?? []) {
        const parentProperties = PARENT_CONTEXT_PROPERTIES[
          bundle as keyof typeof PARENT_CONTEXT_PROPERTIES
        ];
        Object.keys(parentProperties ?? {}).forEach(property => expectedProperties.add(property));
      }
      expect(ANALYZER_CATALOG_ALLOWLIST.properties_by_control_type[type])
        .toEqual([...expectedProperties].sort());
      expect(Object.isFrozen(
        ANALYZER_CATALOG_ALLOWLIST.properties_by_control_type[type],
      )).toBe(true);
    }

    expect(ANALYZER_CATALOG_ALLOWLIST.properties_by_control_type.Gallery)
      .not.toContain('OnSelect');
    expect(ANALYZER_CATALOG_ALLOWLIST.properties_by_control_type.PowerBI)
      .toContain('WorkspaceId');
  });

  it('hard-wires both a worker-only lint rule and duplicate-name refusal', () => {
    const snapshot = analyzeSurveyFiles([
      { name: 'A.pa.yaml', content: DUPLICATE_A },
      { name: 'B.pa.yaml', content: DUPLICATE_B },
    ], { now: () => Date.parse(NOW) });

    expect(snapshot.validation.issues.filter(issue => issue.rule === 'duplicate-control-name'))
      .toHaveLength(2);
    expect(snapshot.validation.issues.filter(issue => issue.rule === 'label-missing-wrap'))
      .toHaveLength(2);
    expect(snapshot.validation.gateDecision).toBe('BLOCK');
  });

  it('propagates explicit and export datasource maps independently with explicit precedence', () => {
    const snapshot = analyzeSurveyFiles([{ name: 'Screen.pa.yaml', content: DATASOURCE_SCREEN }], {
      datasources: { Orders: 'sql' },
      exportDatasources: { Orders: 'sharepoint', Archive: 'sharepoint' },
      now: () => Date.parse(NOW),
    });

    const sql = snapshot.validation.issues.find(issue => issue.rule === 'delegation-sql-isblank');
    const exported = snapshot.validation.issues.find(
      issue => issue.rule === 'delegation-sharepoint-search',
    );
    expect(sql?.evidence).toMatchObject({
      resolvedBy: 'explicit-input',
      confidence: 'high',
      backend: 'sql',
    });
    expect(exported?.evidence).toMatchObject({
      resolvedBy: 'export-metadata',
      confidence: 'medium',
      backend: 'sharepoint',
    });
    expect(snapshot.validation.issues.find(
      issue => issue.rule === 'delegation-sharepoint-isblank',
    )).toBeUndefined();
  });
});

describe('survey argument contract', () => {
  it('parses exactly one target and every declared flag without crossing flag domains', () => {
    expect(parseSurveyArgs([
      'target.zip', '--app', 'Portal', '--datasources', 'datasources.json',
      '--baseline', 'baseline.json', '--write-baseline', '--suppressions', 'suppressions.json',
      '--previous', 'previous.json', '--report', 'out', '--json',
      '--emit-datasources-skeleton', 'sources.json',
      '--profile', 'existing-export',
    ])).toEqual({
      ok: true,
      value: {
        target: 'target.zip',
        app: 'Portal',
        profile: 'existing-export',
        datasources: 'datasources.json',
        baseline: 'baseline.json',
        write_baseline: true,
        suppressions: 'suppressions.json',
        previous: 'previous.json',
        report: 'out',
        json: true,
        emit_datasources_skeleton: 'sources.json',
      },
    });
  });

  it.each([
    { name: 'missing target', argv: [] },
    { name: 'empty target', argv: [''] },
    { name: 'extra target', argv: ['one', 'two'] },
    { name: 'unknown flag', argv: ['one', '--wat'] },
    { name: 'missing value', argv: ['one', '--app'] },
    { name: 'flag-shaped value', argv: ['one', '--app', '--json'] },
    { name: 'duplicate value flag', argv: ['one', '--app', 'A', '--app', 'B'] },
    { name: 'duplicate boolean flag', argv: ['one', '--json', '--json'] },
    { name: 'missing skeleton path', argv: ['one', '--emit-datasources-skeleton'] },
    { name: 'duplicate skeleton flag', argv: ['one', '--emit-datasources-skeleton', 'a.json', '--emit-datasources-skeleton', 'b.json'] },
    { name: 'legacy write-baseline value syntax', argv: ['one', '--write-baseline=old.json'] },
    { name: 'unknown profile', argv: ['one', '--profile', 'default'] },
    { name: 'case-mismatched profile', argv: ['one', '--profile', 'EXISTING-EXPORT'] },
    { name: 'empty profile', argv: ['one', '--profile', ''] },
    { name: 'missing profile', argv: ['one', '--profile'] },
    { name: 'flag-shaped profile', argv: ['one', '--profile', '--json'] },
    { name: 'duplicate profile', argv: ['one', '--profile', 'shared', '--profile', 'existing-export'] },
    { name: 'null profile', argv: ['one', '--profile', null] },
    { name: 'nonstring profile', argv: ['one', '--profile', 1] },
  ])('rejects $name as usage', ({ argv }) => {
    expect(parseSurveyArgs(argv)).toMatchObject({ ok: false, exit_code: 2 });
  });

  it('defaults to shared and accepts an explicit shared profile', () => {
    expect(parseSurveyArgs(['existing-export.msapp'])).toMatchObject({
      ok: true, value: { profile: 'shared' },
    });
    expect(parseSurveyArgs(['existing-export.msapp', '--profile', 'shared'])).toMatchObject({
      ok: true, value: { profile: 'shared' },
    });
  });
});

describe('prepared survey result and error table', () => {
  it('keeps identical paste advice for shared and existing-export prepared reports', () => {
    writeFileSync(join(appRoot, 'ExistingExport.pa.yaml'), 'Screens:\n  Main:\n    Children:\n      - Action:\n          Control: Button\n          Properties:\n            Text: ="existing-export"\n            OnSelect: =Set(gblReady, true);Back()\n');
    const implicit = prepare([appRoot]);
    const shared = prepare([appRoot, '--profile', 'shared']);
    const existing = prepare([appRoot, '--profile', 'existing-export']);
    for (const result of [implicit, shared, existing]) expect(result.ok).toBe(true);
    if (!implicit.ok || !shared.ok || !existing.ok) throw new Error('expected prepared profiles');

    expect(implicit.report_draft.policy.profile_id).toBe('shared');
    expect(shared.report_draft.policy.profile_id).toBe('shared');
    expect(shared.report_draft.findings).toEqual(implicit.report_draft.findings);
    expect(shared.report_draft.gate).toEqual(implicit.report_draft.gate);
    expect(existing.report_draft.policy.profile_id).toBe('existing-export');
    expect(existing.report_draft.findings.filter(row => row.rule === 'inline-formula-paste-hygiene'))
      .toMatchObject([{ level: 'WARN' }]);
    expect(implicit.report_draft.findings.filter(row => row.rule === 'inline-formula-paste-hygiene'))
      .toMatchObject([{ level: 'WARN' }]);
    expect(existing.report_draft.findings.map(row => row.fingerprint))
      .toEqual(implicit.report_draft.findings.map(row => row.fingerprint));
    expect(existing.snapshot.validation.issues.filter(row => row.rule === 'inline-formula-paste-hygiene'))
      .toMatchObject([{ level: 'WARN' }]);
  });

  it('rejects an unknown profile before intake or output', () => {
    let intakeCalls = 0;
    const result = prepare([appRoot, '--profile', 'future-profile'], {
      resolveIntake: () => { intakeCalls += 1; throw new Error('unexpected intake'); },
    });
    expect(result).toEqual({ ok: false, exit_code: 2, message: '--profile must be shared or existing-export' });
    expect(intakeCalls).toBe(0);
    expect(existsSync(join(root, 'appforge-survey'))).toBe(false);
  });

  it('returns a draft report at exit 0 even when duplicate-name findings BLOCK', () => {
    writeFileSync(join(appRoot, 'A.pa.yaml'), DUPLICATE_A);
    writeFileSync(join(appRoot, 'B.pa.yaml'), DUPLICATE_B);

    const result = prepare([appRoot, '--write-baseline', '--json']);

    expect(result).toMatchObject({
      ok: true,
      exit_code: 0,
      target: resolve(appRoot),
      write_baseline: true,
      json: true,
      report_draft: {
        gate: { gate_decision: 'BLOCK' },
        envelope: { id: null, path: null, submission: { state: 'not_requested' } },
      },
    });
    if (!result.ok) throw new Error('expected prepared result');
    expect(result.report_draft.findings.filter(row => row.rule === 'duplicate-control-name'))
      .toHaveLength(2);
    expect(result.intake.files.map(file => file.id)).toEqual(['A.pa.yaml', 'B.pa.yaml']);
    expect(result.report_draft.identity.files).toEqual(result.intake.files.map(file => ({
      id: file.id,
      sha256: file.sha256,
    })));
    expect(result.report_draft.inventories.connections.state).toBe('unavailable');
    expect(() => assertValidReport(result.report_draft)).not.toThrow();
  });

  it('keeps malformed suppression rows as report data and exits 0', () => {
    writeFileSync(join(appRoot, 'Screen.pa.yaml'), SCREEN);
    const suppressions = join(root, 'suppressions.json');
    writeFileSync(suppressions, JSON.stringify({ not: 'an array' }));

    const result = prepare([appRoot, '--suppressions', suppressions]);

    expect(result).toMatchObject({
      ok: true,
      exit_code: 0,
      report_draft: { suppressions: { invalid: [{ index: -1 }] } },
    });
  });

  it('normalizes both intake and post-analysis no-app-source to one usage message', () => {
    const target = resolve(appRoot);
    const expectedMessage = `no app source found at ${target}; accepted forms: an unpacked .pa.yaml directory, a .msapp archive, or a solution zip`;
    writeFileSync(join(appRoot, 'Junk.pa.yaml'), 'NotPowerApps:\n  Value: true\n');
    const postAnalysis = prepare([appRoot]);
    const earlyIntake = prepare([appRoot], {
      resolveIntake: () => {
        throw new IntakeError('usage', 'no-app-source', 'source-specific wording');
      },
    });

    for (const result of [postAnalysis, earlyIntake]) {
      expect(result).toEqual({
        ok: false,
        exit_code: 2,
        message: expectedMessage,
      });
      expect(result.message).not.toContain('source-specific wording');
    }
  });

  it('allows --app only when intake resolves a solution', () => {
    writeFileSync(join(appRoot, 'Screen.pa.yaml'), SCREEN);
    expect(prepare([appRoot, '--app', 'Portal'])).toMatchObject({
      ok: false,
      exit_code: 2,
      message: expect.stringContaining('--app'),
    });
  });

  it('uses outer solution connections and drops the selected inner connection limitation', () => {
    const intake = {
      source_kind: 'solution',
      app_name: { value: 'Portal', resolved_by: 'manifest' },
      files: [{ id: 'Screen.pa.yaml', content: SCREEN, sha256: 'a'.repeat(64) }],
      datasources: {},
      connections: [{ connector_type: 'shared_sharepointonline', count: 2 }],
      limitations: [
        { kind: 'metadata-unsupported', source: 'connections', detail: 'inner msapp poison' },
        { kind: 'skipped-legacy-source', source: 'dialect', detail: 'one legacy file' },
      ],
      fingerprint_basis: 'solution/Portal/src-stripped/v1',
    };

    const result = prepare(['solution.zip', '--app', 'Portal'], {
      resolveIntake: (_target: string, options: { appName?: string }) => {
        expect(options.appName).toBe('Portal');
        return intake;
      },
    });

    expect(result).toMatchObject({
      ok: true,
      report_draft: {
        inventories: {
          connections: {
            state: 'available',
            rows: [{ connector_type: 'shared_sharepointonline', count: 2 }],
          },
        },
        coverage: {
          limitations: [{ kind: 'skipped-legacy-source', source: 'dialect' }],
        },
      },
    });
  });

  it('reports an authoritatively parsed empty solution connection inventory as empty', () => {
    const intake = {
      source_kind: 'solution',
      app_name: { value: 'Portal', resolved_by: 'manifest' },
      files: [{ id: 'Screen.pa.yaml', content: SCREEN, sha256: 'a'.repeat(64) }],
      datasources: {},
      connections: [],
      limitations: [
        { kind: 'skipped-legacy-source', source: 'dialect', detail: 'one legacy file' },
      ],
      fingerprint_basis: 'solution/Portal/src-stripped/v1',
    };

    const result = prepare(['solution.zip', '--app', 'Portal'], {
      resolveIntake: () => intake,
    });

    expect(result).toMatchObject({
      ok: true,
      report_draft: {
        inventories: { connections: { state: 'empty', rows: [] } },
      },
    });
  });

  it.each([
    {
      name: 'malformed option JSON',
      setup: () => {
        const path = join(root, 'bad.json');
        writeFileSync(path, '{');
        return [appRoot, '--datasources', path];
      },
      exit_code: 2,
    },
    {
      name: 'invalid datasource option schema',
      setup: () => {
        const path = join(root, 'datasources.json');
        writeFileSync(path, JSON.stringify({ CustomerSource: 'not-a-backend' }));
        return [appRoot, '--datasources', path];
      },
      exit_code: 2,
    },
    {
      name: 'invalid baseline',
      setup: () => {
        const path = join(root, 'baseline.json');
        writeFileSync(path, JSON.stringify({ baseline_schema: 'analysis-baseline/1' }));
        return [appRoot, '--baseline', path];
      },
      exit_code: 2,
    },
    {
      name: 'invalid previous report',
      setup: () => {
        const path = join(root, 'previous.json');
        writeFileSync(path, JSON.stringify({ report_schema: 'analysis-report/1' }));
        return [appRoot, '--previous', path];
      },
      exit_code: 2,
    },
  ])('classifies $name as exit $exit_code', ({ setup, exit_code }) => {
    writeFileSync(join(appRoot, 'Screen.pa.yaml'), SCREEN);
    expect(prepare(setup())).toMatchObject({ ok: false, exit_code });
  });

  it('rejects direct/wrapper baseline basis disagreement as usage', () => {
    writeFileSync(join(appRoot, 'Screen.pa.yaml'), SCREEN);
    const path = join(root, 'baseline.json');
    writeFileSync(path, JSON.stringify({
      fingerprint_basis: 'msapp/src-stripped/v1',
      data: {
        baseline_schema: 'analysis-baseline/1',
        formula: 'finding-fingerprint/2',
        fingerprint_basis: 'directory/src-stripped/v1',
        entries: [],
      },
    }));

    expect(prepare([appRoot, '--baseline', path])).toMatchObject({
      ok: false,
      exit_code: 2,
    });
  });

  it('rejects an otherwise valid but incompatible previous report as usage', () => {
    writeFileSync(join(appRoot, 'Screen.pa.yaml'), SCREEN);
    const first = prepare([appRoot]);
    if (!first.ok) throw new Error('expected first prepared result');
    const previous = structuredClone(first.report_draft);
    previous.identity.fingerprint_basis = 'msapp/src-stripped/v1';
    const path = join(root, 'previous.json');
    writeFileSync(path, JSON.stringify(previous));

    expect(prepare([appRoot, '--previous', path])).toMatchObject({
      ok: false,
      exit_code: 2,
      message: expect.stringContaining('previous report must have the same'),
    });
  });

  it('classifies an invalid intake export datasource map as infrastructure', () => {
    writeFileSync(join(appRoot, 'Screen.pa.yaml'), SCREEN);
    const intake = { ...resolveIntake(appRoot), datasources: { Source: 'not-a-backend' } };

    expect(prepare([appRoot], { resolveIntake: () => intake })).toMatchObject({
      ok: false,
      exit_code: 3,
    });
  });

  it.each([
    ['usage intake', new IntakeError('usage', 'target-not-found', 'missing'), 2],
    ['infrastructure intake', new IntakeError('infra', 'crc-mismatch', 'broken'), 3],
    ['delta comparison', new ReportBuildError('delta-comparison-refused', 'mismatch'), 2],
    ['file id mismatch', new ReportBuildError('file-id-mismatch', 'poison'), 3],
    ['report invariant', new ReportBuildError('unknown-rule', 'poison'), 3],
  ])('maps %s through the explicit error table', (_name, error, exitCode) => {
    writeFileSync(join(appRoot, 'Screen.pa.yaml'), SCREEN);
    const overrides = error instanceof IntakeError
      ? { resolveIntake: () => { throw error; } }
      : { core: { ...sourceCore, buildReport: () => { throw error; } } };
    expect(prepare([appRoot], overrides)).toMatchObject({
      ok: false,
      exit_code: exitCode,
    });
  });

  it('preflights undeclared previous rule ids as invalid previous input', () => {
    writeFileSync(join(appRoot, 'A.pa.yaml'), DUPLICATE_A);
    writeFileSync(join(appRoot, 'B.pa.yaml'), DUPLICATE_B);
    const first = prepare([appRoot]);
    if (!first.ok) throw new Error('expected first prepared result');
    const previous = structuredClone(first.report_draft);
    previous.findings.push({
      ...previous.findings[0],
      rule: 'future-undeclared-rule',
      fingerprint: '0123456789abcdef',
    });
    const path = join(root, 'previous.json');
    writeFileSync(path, JSON.stringify(previous));

    expect(prepare([appRoot, '--previous', path])).toMatchObject({
      ok: false,
      exit_code: 2,
      message: expect.stringContaining('previous'),
    });
  });
});

describe('survey datasource skeleton output', () => {
  it('keeps exact byte order and special names, requires annotation, and omits unused declarations', () => {
    const bindings = ["Orders", "'__proto__'", "'O''Brien'", "'2'", "'10'", "Orders"];
    writeFileSync(join(appRoot, 'Screen.pa.yaml'), `Screens:\n  Main:\n    Children:\n${bindings.map((binding, index) => `      - gal${index}:
          Control: Gallery
          Properties:
            AccessibleLabel: ="Table"
            Items: =${binding}
`).join('')}`);
    const inputMap = join(root, 'annotated-input.json');
    writeFileSync(inputMap, '{"Orders":"sql","Unused":"excel"}');
    const result = execute([
      appRoot, '--datasources', inputMap, '--emit-datasources-skeleton', 'sources.json',
    ]);

    expect(result).toMatchObject({ ok: true });
    const skeleton = join(root, 'sources.json');
    expect(readFileSync(skeleton, 'utf8')).toBe(`{
  "10": "unresolved",
  "2": "unresolved",
  "O'Brien": "unresolved",
  "Orders": "unresolved",
  "__proto__": "unresolved"
}\n`);
    if (!result.ok) throw new Error('expected survey output');
    expect(result.report.inventories.datasources.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Unused', backend: 'excel', resolved_by: 'explicit-input' }),
      expect.objectContaining({ name: 'Orders', backend: 'sql', resolved_by: 'explicit-input' }),
    ]));
    expect(prepare([appRoot, '--datasources', skeleton])).toMatchObject({
      ok: false, exit_code: 2, message: expect.stringContaining('declared datasource backend types'),
    });

    const annotated = JSON.parse(readFileSync(skeleton, 'utf8')) as Record<string, string>;
    for (const name of Object.keys(annotated)) annotated[name] = 'sql';
    writeFileSync(skeleton, JSON.stringify(annotated));
    const roundTrip = prepare([appRoot, '--datasources', skeleton]);
    expect(roundTrip).toMatchObject({ ok: true });
    if (!roundTrip.ok) throw new Error('expected annotated input to load');
    expect(roundTrip.report_draft.inventories.datasources.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: '__proto__', backend: 'sql', resolved_by: 'explicit-input' }),
    ]));
  });

  it('emits an empty object into an existing report directory without changing stdout', () => {
    writeFileSync(join(appRoot, 'Screen.pa.yaml'), SCREEN);
    const reportDir = join(root, 'out');
    mkdirSync(reportDir);
    const result = execute([
      appRoot, '--report', reportDir, '--emit-datasources-skeleton', join(reportDir, 'sources.json'),
    ]);

    expect(result).toMatchObject({ ok: true });
    expect(readFileSync(join(reportDir, 'sources.json'), 'utf8')).toBe('{}\n');
    if (!result.ok) throw new Error('expected survey output');
    expect(result.stdout).toBe(`${readFileSync(join(reportDir, 'report-technical.md'), 'utf8')}\nArtifacts: ${realpathSync.native(reportDir)}\n`);
  });

  it('refuses a parent that aliases the app through a symlink or Windows junction', ({ skip }) => {
    writeFileSync(join(appRoot, 'Screen.pa.yaml'), SCREEN);
    const link = join(root, 'linked-app');
    try {
      symlinkSync(appRoot, link, process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') skip();
      throw error;
    }

    const result = execute([appRoot, '--emit-datasources-skeleton', join(link, 'sources.json')]);

    expect(result).toMatchObject({ ok: false, exit_code: 2 });
    expect(existsSync(join(root, 'appforge-survey'))).toBe(false);
    expect(readdirSync(appRoot)).toEqual(['Screen.pa.yaml']);
  });

  it('refuses archive input and all JSON option files without altering their bytes', () => {
    writeFileSync(join(appRoot, 'Screen.pa.yaml'), SCREEN);
    const archive = join(root, 'source.msapp');
    const archiveBytes = buildZip([{ path: 'Src/Screen.pa.yaml', data: SCREEN }]);
    writeFileSync(archive, archiveBytes);
    expect(execute([archive, '--emit-datasources-skeleton', archive])).toMatchObject({ ok: false, exit_code: 2 });
    expect(readFileSync(archive)).toEqual(archiveBytes);
    const previous = prepare([appRoot]);
    if (!previous.ok) throw new Error('expected previous report fixture');
    const inputs = [
      ['--datasources', '{}'],
      ['--suppressions', '[]'],
      ['--baseline', JSON.stringify({ baseline_schema: 'analysis-baseline/1', formula: 'finding-fingerprint/2', fingerprint_basis: 'directory/src-stripped/v1', entries: [] })],
      ['--previous', JSON.stringify(previous.report_draft)],
    ];
    for (const [flag, bytes] of inputs) {
      const input = join(root, `${flag.slice(2)}.json`);
      writeFileSync(input, bytes);
      expect(execute([appRoot, flag, input, '--emit-datasources-skeleton', input])).toMatchObject({ ok: false, exit_code: 2 });
      expect(readFileSync(input, 'utf8')).toBe(bytes);
    }
    expect(existsSync(join(root, 'appforge-survey'))).toBe(false);
  });

  it('classifies a denied parent as infrastructure before report publication', () => {
    writeFileSync(join(appRoot, 'Screen.pa.yaml'), SCREEN);
    const result = execute([appRoot, '--emit-datasources-skeleton', 'sources.json'], {
      skeletonOverrides: {
        fs: { ...nativeFs, accessSync: () => { throw Object.assign(new Error('denied parent'), { code: 'EACCES' }); } },
      },
    });
    expect(result).toMatchObject({ ok: false, exit_code: 3 });
    expect(existsSync(join(root, 'appforge-survey'))).toBe(false);
  });

  it.each(['write failure', 'raced destination'])('diagnoses %s after report publication without removing reports or competing data', scenario => {
    writeFileSync(join(appRoot, 'Screen.pa.yaml'), SCREEN);
    const skeleton = join(root, 'sources.json');
    const reportPath = join(root, 'appforge-survey', 'analysis-report.json');
    const skeletonFs = {
      ...nativeFs,
      writeFileSync: ((...args: Parameters<typeof nativeFs.writeFileSync>) => {
        expect(existsSync(reportPath)).toBe(true);
        if (scenario === 'raced destination') {
          writeFileSync(skeleton, '{"Keep":"sql"}\n');
          return nativeFs.writeFileSync(...args);
        }
        throw Object.assign(new Error('injected storage failure'), { code: 'EIO' });
      }) as typeof nativeFs.writeFileSync,
    };

    const result = execute([appRoot, '--emit-datasources-skeleton', skeleton], {
      skeletonOverrides: { fs: skeletonFs },
    });

    expect(result).toMatchObject({
      ok: false, exit_code: 3, message: expect.stringContaining('reports may already exist'),
    });
    expect(() => assertValidReport(JSON.parse(readFileSync(reportPath, 'utf8')))).not.toThrow();
    expect(readdirSync(join(root, 'appforge-survey')).filter(name => name.startsWith('.appforge-'))).toEqual([]);
    if (scenario === 'raced destination') {
      expect(readFileSync(skeleton, 'utf8')).toBe('{"Keep":"sql"}\n');
    } else {
      expect(existsSync(skeleton)).toBe(false);
    }
  });

  it('refuses an existing annotation file before publishing any report', () => {
    writeFileSync(join(appRoot, 'Screen.pa.yaml'), SCREEN);
    const skeleton = join(root, 'sources.json');
    const annotated = '{"Orders":"sql"}\n';
    writeFileSync(skeleton, annotated);

    const result = execute([appRoot, '--emit-datasources-skeleton', skeleton]);

    expect(result).toMatchObject({
      ok: false, exit_code: 2, message: expect.stringContaining('already exists'),
    });
    expect(readFileSync(skeleton, 'utf8')).toBe(annotated);
    expect(existsSync(join(root, 'appforge-survey'))).toBe(false);
  });

  it('emits a clean binding candidate beside byte-identical normal JSON output', () => {
    writeFileSync(join(appRoot, 'Screen.pa.yaml'), `Screens:
  Main:
    Children:
      - galOrders:
          Control: Gallery
          Properties:
            AccessibleLabel: ="Orders"
            Items: =Orders
`);
    const skeleton = join(root, 'sources.json');
    const result = execute([appRoot, '--emit-datasources-skeleton', skeleton, '--json']);

    expect(result).toMatchObject({ ok: true, exit_code: 0 });
    expect(readFileSync(skeleton, 'utf8')).toBe('{\n  "Orders": "unresolved"\n}\n');
    if (!result.ok) throw new Error('expected survey output');
    expect(result.report.findings).toEqual([]);
    expect(result.stdout).toBe(readFileSync(join(root, 'appforge-survey', 'analysis-report.json'), 'utf8'));
  });

  it.each([
    ['inside source', () => join(appRoot, 'sources.json')],
    ['source with alternate Windows casing', () => join(process.platform === 'win32' ? appRoot.toUpperCase() : appRoot, 'sources.json')],
    ['report JSON', () => join(root, 'out', 'analysis-report.json')],
    ['report Markdown', () => join(root, 'out', 'report-technical.md')],
    ['report baseline', () => join(root, 'out', 'analysis-baseline.json')],
    ['immutable envelope', () => join(root, 'out', 'envelope-20000000-0000-4000-8000-000000000002.json')],
    ['survey lock', () => join(root, 'out', '.appforge-survey.lock')],
    ['submit recovery journal', () => join(root, 'out', '.appforge-submit-journal-new.json')],
    ['infrastructure prefix', () => join(root, 'out', '.appforge-future-state')],
    ['missing parent', () => join(root, 'missing-parent', 'sources.json')],
  ])('refuses %s before publishing artifacts or touching the source', (_name, destination) => {
    writeFileSync(join(appRoot, 'Screen.pa.yaml'), SCREEN);
    const reportDir = join(root, 'out');
    mkdirSync(reportDir);
    const skeleton = destination();

    const result = execute([
      appRoot, '--report', reportDir, '--emit-datasources-skeleton', skeleton,
    ]);

    expect(result).toMatchObject({ ok: false, exit_code: 2 });
    expect(readdirSync(reportDir)).toEqual([]);
    expect(readdirSync(appRoot)).toEqual(['Screen.pa.yaml']);
    expect(existsSync(skeleton)).toBe(false);
  });
});

describe('rebuilt analyzer artifact contract', () => {
  it('exposes the complete survey surface and executes the bundled full-profile composition', () => {
    const missingExports = REQUIRED_SURVEY_ARTIFACT_EXPORTS.filter(
      name => analyzerArtifact[name] === undefined,
    );
    expect(missingExports).toEqual([]);
    for (const name of REQUIRED_SURVEY_ARTIFACT_EXPORTS) {
      if (name === 'ANALYZER_CATALOG_ALLOWLIST') continue;
      expect(typeof analyzerArtifact[name]).toBe('function');
    }

    const bundledAnalyze = analyzerArtifact.analyzeSurveyFiles as typeof analyzeSurveyFiles;
    const snapshot = bundledAnalyze([
      { name: 'A.pa.yaml', content: DUPLICATE_A },
      { name: 'B.pa.yaml', content: DUPLICATE_B },
    ], { now: () => Date.parse(NOW) });
    expect(snapshot.validation.issues.filter(issue => issue.rule === 'duplicate-control-name'))
      .toHaveLength(2);
    expect(snapshot.validation.issues.filter(issue => issue.rule === 'label-missing-wrap'))
      .toHaveLength(2);
  });
});

describe('survey process dispatch boundary', () => {
  it('rejects an unknown profile through the executable with empty stdout', () => {
    const result = spawnSync(process.execPath, [SCRIPT, 'survey', appRoot, '--profile', 'unknown', '--json'], {
      cwd: root, encoding: 'utf8', stdio: 'pipe',
    });
    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('--profile must be shared or existing-export\n');
    expect(existsSync(join(root, 'appforge-survey'))).toBe(false);
  });

  it('writes a datasource skeleton through the executable without contaminating JSON stdout', () => {
    writeFileSync(join(appRoot, 'Screen.pa.yaml'), `Screens:
  Main:
    Children:
      - galOrders:
          Control: Gallery
          Properties:
            AccessibleLabel: ="Orders"
            Items: =Orders
`);
    const skeleton = join(root, 'sources.json');
    const result = spawnSync(process.execPath, [
      SCRIPT, 'survey', appRoot, '--emit-datasources-skeleton', skeleton, '--json',
    ], { cwd: root, encoding: 'utf8', stdio: 'pipe' });

    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
    expect(readFileSync(skeleton, 'utf8')).toBe('{\n  "Orders": "unresolved"\n}\n');
    expect(result.stdout).toBe(readFileSync(join(root, 'appforge-survey', 'analysis-report.json'), 'utf8'));
  });

  it('requires the rebuilt artifact, writes a BLOCK report, and emits exact report bytes as JSON', () => {
    writeFileSync(join(appRoot, 'A.pa.yaml'), DUPLICATE_A);
    writeFileSync(join(appRoot, 'B.pa.yaml'), DUPLICATE_B);

    const result = spawnSync('node', [SCRIPT, 'survey', appRoot, '--json'], {
      cwd: root,
      encoding: 'utf8',
      stdio: 'pipe',
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    const reportDir = join(root, 'appforge-survey');
    const reportBytes = readFileSync(join(reportDir, 'analysis-report.json'), 'utf8');
    const report = JSON.parse(reportBytes);
    expect(result.stdout).toBe(reportBytes);
    expect(report).toMatchObject({
      gate: { gate_decision: 'BLOCK' },
      envelope: {
        id: expect.stringMatching(/^[0-9a-f-]{36}$/u),
        path: expect.stringMatching(/envelope-[0-9a-f-]{36}\.json$/u),
        submission: { state: 'not_requested' },
      },
    });
    expect(report.report_id).not.toBe(report.envelope.id);
    expect(existsSync(report.envelope.path)).toBe(true);
    expect(existsSync(join(reportDir, 'report-technical.md'))).toBe(true);

    const second = spawnSync('node', [SCRIPT, 'survey', appRoot, '--json'], {
      cwd: root,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    expect(second.status).toBe(0);
    expect(second.stderr).toBe('');
    const secondReportBytes = readFileSync(join(reportDir, 'analysis-report.json'), 'utf8');
    const secondReport = JSON.parse(secondReportBytes);
    expect(second.stdout).toBe(secondReportBytes);
    expect(secondReport.envelope.id).not.toBe(report.envelope.id);
    expect(existsSync(report.envelope.path)).toBe(true);
    expect(existsSync(secondReport.envelope.path)).toBe(true);
    expect(readdirSync(reportDir).filter(name => /^envelope-.*\.json$/u.test(name))).toHaveLength(2);
    expect(readdirSync(reportDir).filter(name => name.startsWith('.appforge-'))).toEqual([]);
  });

  it('emits exact technical markdown plus one artifact footer and writes a baseline on request', () => {
    writeFileSync(join(appRoot, 'Screen.pa.yaml'), SCREEN);
    const reportDir = join(root, 'outside-report');

    const result = spawnSync('node', [
      SCRIPT, 'survey', appRoot, '--report', reportDir, '--write-baseline',
    ], {
      cwd: appRoot,
      encoding: 'utf8',
      stdio: 'pipe',
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    const markdown = readFileSync(join(reportDir, 'report-technical.md'), 'utf8');
    expect(result.stdout).toBe(`${markdown}\nArtifacts: ${realpathSync.native(reportDir)}\n`);
    const baseline = JSON.parse(readFileSync(join(reportDir, 'analysis-baseline.json'), 'utf8'));
    expect(baseline).toMatchObject({
      baseline_schema: 'analysis-baseline/1',
      formula: 'finding-fingerprint/2',
      fingerprint_basis: 'directory/src-stripped/v1',
    });
    expect(baseline.entries.every((entry: { rule: string }) => entry.rule !== 'duplicate-control-name'))
      .toBe(true);
  });

  it('keeps every emitted BLOCK tuple out of a CLI-written advisory baseline', () => {
    writeFileSync(join(appRoot, 'A.pa.yaml'), DUPLICATE_A);
    writeFileSync(join(appRoot, 'B.pa.yaml'), DUPLICATE_B);
    const reportDir = join(root, 'block-baseline-report');

    const result = spawnSync('node', [
      SCRIPT, 'survey', appRoot, '--report', reportDir, '--write-baseline', '--json',
    ], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    const report = JSON.parse(result.stdout);
    const baseline = JSON.parse(readFileSync(join(reportDir, 'analysis-baseline.json'), 'utf8'));
    const blocked = new Set(report.findings
      .filter((finding: { severity: string }) => finding.severity === 'BLOCK')
      .map((finding: { fingerprint: string; rule: string }) => (
        `${finding.fingerprint}\0${finding.rule}`
      )));
    expect(blocked.size).toBeGreaterThan(0);
    expect(baseline.entries.some((entry: { fingerprint: string; rule: string }) => (
      blocked.has(`${entry.fingerprint}\0${entry.rule}`)
    ))).toBe(false);
  });

  it('rejects a conflicting implicit default before creating output or stdout', () => {
    writeFileSync(join(appRoot, 'Screen.pa.yaml'), SCREEN);

    const result = spawnSync('node', [SCRIPT, 'survey', appRoot, '--json'], {
      cwd: appRoot,
      encoding: 'utf8',
      stdio: 'pipe',
    });

    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('--report');
    expect(result.stderr).toContain('outside');
    expect(existsSync(join(appRoot, 'appforge-survey'))).toBe(false);
  });

  it('returns infrastructure exit 3 and empty stdout on a late recovery failure', () => {
    writeFileSync(join(appRoot, 'Screen.pa.yaml'), SCREEN);
    const reportDir = join(root, 'late-recovery-failure');
    mkdirSync(reportDir);
    const journal = '.appforge-survey-journal-b1000000-0000-4000-8000-000000000000.json';
    writeFileSync(join(reportDir, journal), '{malformed');

    const result = spawnSync('node', [SCRIPT, 'survey', appRoot, '--report', reportDir, '--json'], {
      cwd: root,
      encoding: 'utf8',
      stdio: 'pipe',
    });

    expect(result.status).toBe(3);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('recovery journal');
    expect(readdirSync(reportDir)).toEqual([journal]);
  });

  it('reconsumes a written directory baseline through equivalent msapp intake', () => {
    const directory = join(root, 'directory-source');
    const source = join(directory, 'Src');
    const msapp = join(root, 'equivalent.msapp');
    const directoryReportDir = join(root, 'directory-report');
    const msappReportDir = join(root, 'msapp-report');
    mkdirSync(source, { recursive: true });
    writeFileSync(join(source, 'A.pa.yaml'), DUPLICATE_A);
    writeFileSync(msapp, buildZip([{ path: 'Src/A.pa.yaml', data: DUPLICATE_A }]));

    const directoryRun = spawnSync('node', [
      SCRIPT,
      'survey',
      directory,
      '--write-baseline',
      '--report',
      directoryReportDir,
      '--json',
    ], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
    expect(directoryRun.status).toBe(0);
    const baselinePath = join(directoryReportDir, 'analysis-baseline.json');
    const msappRun = spawnSync('node', [
      SCRIPT,
      'survey',
      msapp,
      '--baseline',
      baselinePath,
      '--report',
      msappReportDir,
      '--json',
    ], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
    expect(msappRun.status).toBe(0);
    expect(directoryRun.stderr).toBe('');
    expect(msappRun.stderr).toBe('');

    const directoryReport = JSON.parse(directoryRun.stdout);
    const msappReport = JSON.parse(msappRun.stdout);
    expect([
      directoryReport.identity.source_kind,
      msappReport.identity.source_kind,
    ]).toEqual(['directory', 'msapp']);
    expect([
      directoryReport.identity.fingerprint_basis,
      msappReport.identity.fingerprint_basis,
    ]).toEqual(['directory/src-stripped/v1', 'msapp/src-stripped/v1']);
    expect(msappReport.baseline).toMatchObject({
      basis_matches: true,
      accepted_total: 1,
      migration_required: false,
    });
    expect(msappReport.gate).toEqual(directoryReport.gate);
    expect(msappReport.findings.map((finding: { fingerprint: string }) => finding.fingerprint))
      .toEqual(directoryReport.findings.map(
        (finding: { fingerprint: string }) => finding.fingerprint,
      ));
    expect(msappReport.root_causes.map((rootCause: { priority: { inputs: unknown } }) => (
      rootCause.priority.inputs
    ))).toEqual(directoryReport.root_causes.map(
      (rootCause: { priority: { inputs: unknown } }) => rootCause.priority.inputs,
    ));
  });

  // Pins the shipped archived-copy workaround documented in PIPELINE.md: a
  // directory survey's app_id derives from the target's basename as passed on
  // the argv, so two differently named archive folders of the SAME app cannot
  // be delta-compared, and the workaround is to survey both from directories
  // that share one basename.
  describe('archived-copy delta workaround', () => {
    const surveyDirectory = (target: string, reportDir: string, previous?: string) => spawnSync(
      'node',
      [
        SCRIPT,
        'survey',
        target,
        ...(previous === undefined ? [] : ['--previous', previous]),
        '--report',
        reportDir,
        '--json',
      ],
      { cwd: root, encoding: 'utf8', stdio: 'pipe' },
    );

    const seed = (directory: string) => {
      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, 'A.pa.yaml'), DUPLICATE_A);
    };

    it('refuses the delta when the two archive folders carry different names', () => {
      const live = join(root, 'App_Live');
      const fix = join(root, 'App_Fix');
      seed(live);
      seed(fix);
      const liveReportDir = join(root, 'app-live-report');

      const first = surveyDirectory(live, liveReportDir);
      expect({ status: first.status, stderr: first.stderr }).toEqual({ status: 0, stderr: '' });

      const second = surveyDirectory(
        fix,
        join(root, 'app-fix-report'),
        join(liveReportDir, 'analysis-report.json'),
      );

      expect(second.status).toBe(2);
      expect(second.stdout).toBe('');
      expect(second.stderr).toContain(
        'previous report must have the same fingerprint formula, fingerprint_basis, and app_id',
      );
    });

    it('produces a delta when both runs use one shared directory basename', () => {
      const shared = join(root, 'Shared');
      const firstReportDir = join(root, 'app-first-report');
      const secondReportDir = join(root, 'app-second-report');

      seed(shared);
      const first = surveyDirectory(shared, firstReportDir);
      expect({ status: first.status, stderr: first.stderr }).toEqual({ status: 0, stderr: '' });
      const firstReport = JSON.parse(first.stdout);

      // The workaround in practice: the second archived copy is restored into a
      // directory with the same basename before it is surveyed.
      rmSync(shared, { recursive: true, force: true });
      seed(shared);

      const second = surveyDirectory(
        shared,
        secondReportDir,
        join(firstReportDir, 'analysis-report.json'),
      );
      expect({ status: second.status, stderr: second.stderr }).toEqual({ status: 0, stderr: '' });
      const secondReport = JSON.parse(second.stdout);

      expect(secondReport.identity.app_id).toBe(firstReport.identity.app_id);
      expect(secondReport.delta).toEqual({
        resolved: [],
        persisted: firstReport.findings.map((finding: { fingerprint: string }) => finding.fingerprint),
        new: [],
      });
    });
  });

  it('emits only the exact normalized no-app diagnostic for a junk survey target', () => {
    const target = resolve(appRoot);
    writeFileSync(join(appRoot, 'Junk.pa.yaml'), 'NotPowerApps:\n  Value: true\n');

    const result = spawnSync('node', [SCRIPT, 'survey', appRoot], {
      cwd: root,
      encoding: 'utf8',
      stdio: 'pipe',
    });

    expect({ code: result.status, out: result.stdout, err: result.stderr }).toEqual({
      code: 2,
      out: '',
      err: `no app source found at ${target}; accepted forms: an unpacked .pa.yaml directory, a .msapp archive, or a solution zip\n`,
    });
  });

  it('reserves only the exact bare survey and submit-envelope words', () => {
    const survey = spawnSync('node', [SCRIPT, 'survey', appRoot, '--wat'], {
      cwd: root, encoding: 'utf8', stdio: 'pipe',
    });
    const submit = spawnSync('node', [SCRIPT, 'submit-envelope'], {
      cwd: root, encoding: 'utf8', stdio: 'pipe',
    });
    const relativeSurvey = spawnSync('node', [SCRIPT, './survey', '--json'], {
      cwd: root, encoding: 'utf8', stdio: 'pipe',
    });
    const relativeSubmit = spawnSync('node', [SCRIPT, './submit-envelope', '--json'], {
      cwd: root, encoding: 'utf8', stdio: 'pipe',
    });

    expect({ code: survey.status, out: survey.stdout, err: survey.stderr }).toEqual({
      code: 2,
      out: '',
      err: 'unknown survey option: --wat\n',
    });
    expect({ code: submit.status, out: submit.stdout, err: submit.stderr }).toEqual({
      code: 2,
      out: '',
      err: 'submit-envelope refused: invalid-arguments\n',
    });
    for (const result of [relativeSurvey, relativeSubmit]) {
      expect(result.status).toBe(2);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('Unable to enumerate target:');
      expect(result.stderr).not.toContain('survey requires exactly one target');
    }
  });

  it('preserves the legacy path-valued --write-baseline domain', () => {
    const target = join(root, 'legacy.pa.yaml');
    const baseline = join(root, 'legacy-baseline.json');
    writeFileSync(target, `Screens:\n  Main:\n    Children:\n      - pinned:\n          Control: Button@1.0.0\n`);

    const result = spawnSync('node', [SCRIPT, target, '--write-baseline', baseline, '--json'], {
      cwd: root, encoding: 'utf8', stdio: 'pipe',
    });

    expect(result.status).toBe(0);
    expect(existsSync(baseline)).toBe(true);
    expect(result.stderr).toBe('');
  });

  it('keeps duplicate control names out of the unchanged legacy CLI policy', () => {
    writeFileSync(join(appRoot, 'A.pa.yaml'), DUPLICATE_A);
    writeFileSync(join(appRoot, 'B.pa.yaml'), DUPLICATE_B);

    const result = spawnSync('node', [SCRIPT, appRoot, '--json'], {
      cwd: root,
      encoding: 'utf8',
      stdio: 'pipe',
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    const output = JSON.parse(result.stdout) as {
      reports: Array<{ issues: Array<{ rule: string }> }>;
    };
    const reports = output.reports;
    expect(reports.flatMap(report => report.issues)
      .filter(issue => issue.rule === 'duplicate-control-name')).toEqual([]);
  });
});
