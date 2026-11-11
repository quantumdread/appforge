import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as analyzerArtifact from '../../cli/dist/analyzer-core.mjs';
import { evaluateBaseline } from '../src/core/survey/baseline';
import {
  assertEmittableBaseline,
  baselineCompatibilityClass,
  parseAnalysisBaseline,
} from '../src/core/survey/baseline-input';
import { assertEmittableReport } from '../src/core/survey/emittable-report';
import type { AnalysisReportV1 } from '../src/core/survey/report-types';
import type { SurveyEnvelopeV1 } from '../src/core/survey/envelope-types';
import {
  assertValidEnvelope,
  decodeCanonicalEnvelope,
  serializeEnvelope,
} from '../src/core/survey/validate-envelope';
import { assertValidReport } from '../src/core/survey/validate-report';
import { ANALYZER_CATALOG_ALLOWLIST, analyzeSurveyFiles } from '../src/lib/survey';
import { surveyApp, type SurveyToolResult } from '../src/tools/survey';
import { buildZip } from './helpers/build-zip';

/**
 * Task 7 cross-surface acceptance: one customer-free invented fixture surveyed
 * four ways (CLI directory, CLI msapp, CLI solution, in-process MCP survey_app).
 *
 * Redaction discipline (survey-real.node.ts): every assertion in this file
 * compares derived booleans, counts, fingerprints, or fixed vocabulary. No
 * absolute path, captured stdout, or captured stderr is ever placed in an
 * assertion value or a thrown message.
 */

const SCRIPT = resolve(
  __dirname,
  '..',
  '..',
  'cli',
  'validate.mjs',
);

// The same guard survey-cli.node.ts uses: a stale committed dist artifact must
// make these spawned-CLI tests fail rather than silently exercise old code.
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

const OVERVIEW = `Screens:
  Overview:
    Children:
      - lblOverviewTitle:
          Control: Text
          Properties:
            Text: ="Overview"
      - galOverviewOrders:
          Control: Gallery
          Properties:
            AccessibleLabel: ="Orders"
            Items: =Filter(WidgetOrders, IsBlank(Note))
            OnSelect: =Set(gblReady, true);Back()
`;

const DETAIL = `Screens:
  Detail:
    Children:
      - lblDetailHeading:
          Control: Text
          Properties:
            Text: ="Detail"
      - lblDetailBody:
          Control: Text
          Properties:
            Text: ="Body"
      - galDetailOrders:
          Control: Gallery
          Properties:
            AccessibleLabel: ="Detail orders"
            Items: =Filter(WidgetOrders, IsBlank(Remark))
`;

const LEGACY = `Screens:
  Legacy:
    Children:
      - ctlLegacyWidget:
          Control: NotARealControlType
`;

/** Canonical `Src/`-stripped ids: identical under all four intakes. */
const FIXTURE_FILES = [
  { name: 'Screens/Detail.pa.yaml', content: DETAIL },
  { name: 'Screens/Legacy.pa.yaml', content: LEGACY },
  { name: 'Screens/Overview.pa.yaml', content: OVERVIEW },
] as const;

const FIXTURE_DATASOURCES = { WidgetOrders: 'sql' } as const;
const APP_DIRECTORY_NAME = 'existing-export-fixture';
const NOW = '2026-08-30T08:00:00.000Z';
const ENVELOPE_FILE = /^envelope-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.json$/u;

type CliSurface = {
  kind: 'directory' | 'msapp' | 'solution';
  report: AnalysisReportV1 & Record<string, any>;
  envelope: SurveyEnvelopeV1;
  reportDir: string;
  envelopeFiles: string[];
};

let root: string;
let directoryTarget: string;
let msappTarget: string;
let solutionTarget: string;
let datasourcesPath: string;
let baselinePath: string;

let directorySurvey: CliSurface;
let msappSurvey: CliSurface;
let solutionSurvey: CliSurface;
let msappWithBaseline: CliSurface;
let solutionWithBaseline: CliSurface;
let mcpPayload: SurveyToolResult & { report: AnalysisReportV1 & Record<string, any> };
let existingExportSurveys: CliSurface[];
let existingExportMcpPayload: SurveyToolResult;
let writtenBaseline: unknown;

function projectGate(snapshot: ReturnType<typeof analyzeSurveyFiles>) {
  return {
    summary: { ...snapshot.validation.summary },
    per_file: snapshot.validation.per_file.map(file => ({ ...file })),
    gate_decision: snapshot.validation.gateDecision,
  };
}

function freshCliGate() {
  return projectGate(analyzeSurveyFiles(
    FIXTURE_FILES.map(file => ({ name: file.name, content: file.content })),
    {
      datasources: { ...FIXTURE_DATASOURCES },
      exportDatasources: {},
      now: () => Date.parse(NOW),
    },
  ));
}

function freshMcpGate() {
  return projectGate(analyzeSurveyFiles(
    FIXTURE_FILES.map(file => ({ name: file.name, content: file.content })),
    { datasources: { ...FIXTURE_DATASOURCES }, now: () => Date.parse(NOW) },
  ));
}

function runSurveyCli(
  kind: CliSurface['kind'],
  target: string,
  reportDir: string,
  extra: readonly string[] = [],
): CliSurface {
  const result = spawnSync('node', [
    SCRIPT, 'survey', target,
    '--datasources', datasourcesPath,
    '--report', reportDir,
    '--json',
    ...extra,
  ], { cwd: root, encoding: 'utf8', stdio: 'pipe' });

  if (result.status !== 0 || result.stderr.length > 0) {
    throw new Error(
      `[cross-surface][REDACTED] ${kind} survey CLI failed `
      + `status=${result.status} stdout_nonempty=${result.stdout.length > 0} `
      + `stderr_nonempty=${result.stderr.length > 0}`,
    );
  }

  let report: AnalysisReportV1 & Record<string, any>;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    throw new Error(`[cross-surface][REDACTED] ${kind} survey stdout was not JSON`);
  }
  if (readFileSync(join(reportDir, 'analysis-report.json'), 'utf8') !== result.stdout) {
    throw new Error(`[cross-surface][REDACTED] ${kind} --json stdout is not the report bytes`);
  }

  const envelopeFiles = readdirSync(reportDir).filter(name => ENVELOPE_FILE.test(name));
  if (envelopeFiles.length !== 1) {
    throw new Error(
      `[cross-surface][REDACTED] ${kind} produced ${envelopeFiles.length} envelope files`,
    );
  }
  const envelope = decodeCanonicalEnvelope(
    readFileSync(join(reportDir, envelopeFiles[0])),
    ANALYZER_CATALOG_ALLOWLIST,
  );
  return { kind, report, envelope, reportDir, envelopeFiles };
}

async function callSurveyApp(args: unknown) {
  return surveyApp.handler(args as any, {
    env: {} as any,
    ctx: { waitUntil() {} } as any,
  });
}

function sortedFingerprints(report: { findings: Array<{ fingerprint: string }> }) {
  return report.findings.map(finding => finding.fingerprint).sort();
}

beforeAll(async () => {
  root = realpathSync.native(mkdtempSync(join(tmpdir(), 'survey-cross-')));
  directoryTarget = join(root, APP_DIRECTORY_NAME);
  for (const file of FIXTURE_FILES) {
    const absolute = join(directoryTarget, 'Src', file.name);
    mkdirSync(join(absolute, '..'), { recursive: true });
    writeFileSync(absolute, file.content, 'utf8');
  }

  const msappBytes = buildZip(FIXTURE_FILES.map(file => ({
    path: `Src/${file.name}`,
    data: file.content,
  })));
  msappTarget = join(root, `${APP_DIRECTORY_NAME}.msapp`);
  writeFileSync(msappTarget, msappBytes);

  solutionTarget = join(root, 'FixtureSolution.zip');
  writeFileSync(solutionTarget, buildZip([
    { path: 'solution.xml', data: '<ImportExportXml />' },
    {
      path: 'customizations.xml',
      data: '<ImportExportXml><ConnectionReferences>{}</ConnectionReferences></ImportExportXml>',
    },
    { path: `CanvasApps/${APP_DIRECTORY_NAME}.msapp`, data: msappBytes },
  ]));

  datasourcesPath = join(root, 'datasources.json');
  writeFileSync(datasourcesPath, JSON.stringify(FIXTURE_DATASOURCES), 'utf8');

  directorySurvey = runSurveyCli(
    'directory',
    directoryTarget,
    join(root, 'out-directory'),
    ['--write-baseline'],
  );
  baselinePath = join(directorySurvey.reportDir, 'analysis-baseline.json');
  writtenBaseline = JSON.parse(readFileSync(baselinePath, 'utf8'));

  msappSurvey = runSurveyCli('msapp', msappTarget, join(root, 'out-msapp'));
  solutionSurvey = runSurveyCli('solution', solutionTarget, join(root, 'out-solution'));
  msappWithBaseline = runSurveyCli(
    'msapp',
    msappTarget,
    join(root, 'out-msapp-baseline'),
    ['--baseline', baselinePath],
  );
  solutionWithBaseline = runSurveyCli(
    'solution',
    solutionTarget,
    join(root, 'out-solution-baseline'),
    ['--baseline', baselinePath],
  );

  const toolResult = await callSurveyApp({
    files: FIXTURE_FILES.map(file => ({ name: file.name, content: file.content })),
    datasources: { ...FIXTURE_DATASOURCES },
  });
  if (toolResult.isError === true) {
    throw new Error('[cross-surface][REDACTED] survey_app returned an error result');
  }
  mcpPayload = JSON.parse(toolResult.content[0].text);

  existingExportSurveys = [
    runSurveyCli('directory', directoryTarget, join(root, 'out-directory-existing-export'), ['--profile', 'existing-export']),
    runSurveyCli('msapp', msappTarget, join(root, 'out-msapp-existing-export'), ['--profile', 'existing-export']),
    runSurveyCli('solution', solutionTarget, join(root, 'out-solution-existing-export'), ['--profile', 'existing-export']),
  ];
  const existingExportToolResult = await callSurveyApp({
    files: FIXTURE_FILES.map(file => ({ name: file.name, content: file.content })),
    datasources: { ...FIXTURE_DATASOURCES },
    profile: 'existing-export',
  });
  if (existingExportToolResult.isError === true) {
    throw new Error('[cross-surface][REDACTED] existing-export survey_app returned an error result');
  }
  existingExportMcpPayload = JSON.parse(existingExportToolResult.content[0].text);
}, 180_000);

afterAll(() => {
  if (root !== undefined) rmSync(root, { recursive: true, force: true });
});

describe('cross-surface fixture preconditions', () => {
  it('requires a rebuilt analyzer artifact exposing the full survey surface', () => {
    const missingExports = REQUIRED_SURVEY_ARTIFACT_EXPORTS.filter(
      name => (analyzerArtifact as Record<string, unknown>)[name] === undefined,
    );
    expect(missingExports).toEqual([]);
  });

  it('exercises a WARN-family bound-source aggregate and a REFUSE finding', () => {
    const report = directorySurvey.report;
    const boundSource = report.root_causes.filter(
      rootCause => rootCause.grouping_key === 'bound-source',
    );
    const shape = {
      screens: new Set(FIXTURE_FILES.map(file => file.name)).size,
      warn_findings: report.findings.filter(finding => finding.level === 'WARN').length,
      refuse_findings: report.findings.filter(finding => finding.level === 'REFUSE').length,
      bound_source_groups: boundSource.length,
      bound_source_members: boundSource[0]?.member_fingerprints.length ?? 0,
      datasource_bound: report.inventories.datasources.state === 'available'
        && report.inventories.datasources.rows.some((row: Record<string, unknown>) => (
          row.backend === 'sql' && row.resolved_by === 'explicit-input' && row.confidence === 'high'
        )),
      gate_decision: report.gate.gate_decision,
    };
    expect(shape).toEqual({
      screens: 3,
      // v3.1.5: the Overview inline `;` handler is now WARN inline-formula-paste-hygiene.
      warn_findings: 7, // 3.18: + superseded-control-type
      refuse_findings: 1,
      bound_source_groups: 1,
      bound_source_members: 2,
      datasource_bound: true,
      gate_decision: 'BLOCK',
    });
  });
});

describe('cross-surface fingerprint equality', () => {
  it('produces identical finding fingerprint sets through directory, msapp, and solution intake', () => {
    const directory = sortedFingerprints(directorySurvey.report);
    expect(directory.length).toBeGreaterThan(0);
    expect(sortedFingerprints(msappSurvey.report)).toEqual(directory);
    expect(sortedFingerprints(solutionSurvey.report)).toEqual(directory);
  });

  it('keeps the three CLI source kinds and fingerprint bases distinct but compatible', () => {
    expect([
      directorySurvey.report.identity.source_kind,
      msappSurvey.report.identity.source_kind,
      solutionSurvey.report.identity.source_kind,
    ]).toEqual(['directory', 'msapp', 'solution']);
    expect([
      directorySurvey.report.identity.fingerprint_basis,
      msappSurvey.report.identity.fingerprint_basis,
      solutionSurvey.report.identity.fingerprint_basis,
    ]).toEqual([
      'directory/src-stripped/v1',
      'msapp/src-stripped/v1',
      `solution/${APP_DIRECTORY_NAME}/src-stripped/v1`,
    ]);
    expect([
      baselineCompatibilityClass(directorySurvey.report.identity.fingerprint_basis),
      baselineCompatibilityClass(msappSurvey.report.identity.fingerprint_basis),
      baselineCompatibilityClass(solutionSurvey.report.identity.fingerprint_basis),
      baselineCompatibilityClass(mcpPayload.report.identity.fingerprint_basis),
    ]).toEqual(['src-stripped/v1', 'src-stripped/v1', 'src-stripped/v1', null]);
  });

  it('reaches the same fingerprint set through the in-process MCP survey_app composition', () => {
    expect(mcpPayload.report.identity.source_kind).toBe('inline');
    expect(sortedFingerprints(mcpPayload.report)).toEqual(sortedFingerprints(directorySurvey.report));
  });
});

describe('cross-surface gate projection equality', () => {
  it('matches a fresh in-process analyzeSurveyFiles projection on every CLI surface', () => {
    const fresh = freshCliGate();
    for (const surface of [
      directorySurvey, msappSurvey, solutionSurvey, msappWithBaseline, solutionWithBaseline,
    ]) {
      expect(surface.report.gate, `gate projection for ${surface.kind}`).toEqual(fresh);
    }
  });

  it('matches a fresh in-process projection on the MCP surface', () => {
    expect(mcpPayload.report.gate).toEqual(freshMcpGate());
  });
});

describe('cross-surface explicit profile selection', () => {
  it('keeps shared as the default regardless of export names, archive shape, or MCP intake', () => {
    const reference = directorySurvey.report;
    for (const report of [reference, msappSurvey.report, solutionSurvey.report, mcpPayload.report]) {
      expect(report.policy.profile_id).toBe('shared');
      expect(report.findings.filter(finding => finding.rule === 'inline-formula-paste-hygiene')
        .map(finding => finding.level)).toEqual(['WARN']);
      expect(JSON.stringify(report.findings) === JSON.stringify(reference.findings)).toBe(true);
      expect(JSON.stringify(report.gate) === JSON.stringify(reference.gate)).toBe(true);
    }
  });

  it('emits identical existing-export findings and gates through every real intake', () => {
    const reference = existingExportSurveys[0].report;
    for (const report of [...existingExportSurveys.map(surface => surface.report), existingExportMcpPayload.report]) {
      expect(report.policy.profile_id).toBe('existing-export');
      expect(report.findings.filter(finding => finding.rule === 'inline-formula-paste-hygiene')
        .map(finding => ({ level: finding.level, severity: finding.severity })))
        .toEqual([{ level: 'WARN', severity: 'MAINTAINABILITY' }]);
      expect(report.findings.filter(finding => finding.rule === 'unknown-control')
        .map(finding => finding.level)).toEqual(['REFUSE']);
      expect(JSON.stringify(report.findings) === JSON.stringify(reference.findings)).toBe(true);
      expect(JSON.stringify(report.gate) === JSON.stringify(reference.gate)).toBe(true);
      expect(sortedFingerprints(report)).toEqual(sortedFingerprints(directorySurvey.report));
      expect(report.gate.gate_decision).toBe('BLOCK');
    }
  });

  it('preserves level-independent envelope counts across profiles and surfaces', () => {
    const reference = directorySurvey.envelope;
    for (const envelope of [
      msappSurvey.envelope, solutionSurvey.envelope, mcpPayload.envelope,
      ...existingExportSurveys.map(surface => surface.envelope), existingExportMcpPayload.envelope,
    ]) {
      for (const field of ['rule_counts', 'opportunity_denominators', 'size_buckets', 'near_miss_buckets'] as const) {
        expect(envelope[field]).toEqual(reference[field]);
      }
      expect(envelope.rule_counts.find(row => row.rule_id === 'inline-formula-paste-hygiene')?.count).toBe(1);
    }
  });
});

describe('cross-surface baseline compatibility class', () => {
  it('emits a directory baseline that passes the emitted baseline gate', () => {
    expect(() => assertEmittableBaseline(writtenBaseline)).not.toThrow();
    const parsed = parseAnalysisBaseline(writtenBaseline);
    expect({
      basis: parsed.fingerprint_basis,
      compatibility_class: parsed.compatibility_class,
      entries_nonzero: parsed.entries.length > 0,
      excludes_block: parsed.entries.every(entry => entry.rule !== 'unknown-control'),
    }).toEqual({
      basis: 'directory/src-stripped/v1',
      compatibility_class: 'src-stripped/v1',
      entries_nonzero: true,
      excludes_block: true,
    });
  });

  it('accepts that directory baseline through msapp and solution intake', () => {
    const parsed = parseAnalysisBaseline(writtenBaseline);
    const acceptedKeys = new Set(parsed.entries.map(entry => (
      `${entry.fingerprint}\u0000${entry.rule}`
    )));

    for (const surface of [msappWithBaseline, solutionWithBaseline]) {
      const accepted = surface.report.findings.filter(
        finding => finding.baseline_status === 'accepted',
      );
      expect({
        kind: surface.kind,
        basis_matches: surface.report.baseline.basis_matches,
        migration_required: surface.report.baseline.migration_required,
        accepted_total: surface.report.baseline.accepted_total,
        stale_entries: surface.report.baseline.stale_entries.length,
        accepted_findings: accepted.length,
        all_accepted_are_baseline_entries: accepted.every(finding => acceptedKeys.has(
          `${finding.fingerprint}\u0000${finding.rule}`,
        )),
        block_stays_new: surface.report.findings
          .filter(finding => finding.severity === 'BLOCK')
          .every(finding => finding.baseline_status === 'new'),
      }).toEqual({
        kind: surface.kind,
        basis_matches: true,
        migration_required: false,
        accepted_total: parsed.entries.length,
        stale_entries: 0,
        accepted_findings: parsed.entries.length,
        all_accepted_are_baseline_entries: true,
        block_stays_new: true,
      });
    }
  });

  it('refuses that baseline on the caller-supplied MCP basis', () => {
    // 1. survey_app has no baseline input at all: the closed schema refuses it.
    // 2. The inline basis is outside every src-stripped/v1 compatibility class.
    // 3. Applying the emitted baseline against that basis accepts nothing.
    const parsed = parseAnalysisBaseline(writtenBaseline);
    const candidates = mcpPayload.report.findings.map(finding => ({
      fingerprint: finding.fingerprint,
      rule: finding.rule,
      severity: finding.severity,
    }));
    const evaluated = evaluateBaseline(
      writtenBaseline as never,
      candidates,
      mcpPayload.report.identity.fingerprint_basis,
    );

    expect({
      inline_basis: mcpPayload.report.identity.fingerprint_basis,
      inline_compatibility_class: baselineCompatibilityClass(
        mcpPayload.report.identity.fingerprint_basis,
      ),
      baseline_entries_nonzero: parsed.entries.length > 0,
      candidate_overlap: parsed.entries.filter(entry => candidates.some(
        candidate => candidate.fingerprint === entry.fingerprint
          && candidate.rule === entry.rule,
      )).length,
      evaluated_basis_matches: evaluated.section.basis_matches,
      evaluated_accepted_total: evaluated.section.accepted_total,
      evaluated_accepted_fingerprints: evaluated.accepted_fingerprints.size,
      report_basis_matches: mcpPayload.report.baseline.basis_matches,
      report_applied_from: mcpPayload.report.baseline.applied_from,
      report_accepted_total: mcpPayload.report.baseline.accepted_total,
      all_findings_new: mcpPayload.report.findings.every(
        finding => finding.baseline_status === 'new',
      ),
    }).toEqual({
      inline_basis: 'caller-supplied',
      inline_compatibility_class: null,
      baseline_entries_nonzero: true,
      // The tuples DO exist in the current inline findings; only the basis
      // refusal keeps them out, which is exactly the property under test.
      candidate_overlap: parsed.entries.length,
      evaluated_basis_matches: false,
      evaluated_accepted_total: 0,
      evaluated_accepted_fingerprints: 0,
      report_basis_matches: false,
      report_applied_from: null,
      report_accepted_total: 0,
      all_findings_new: true,
    });
  });

  it('rejects a baseline argument on the closed survey_app input schema', async () => {
    const result = await callSurveyApp({
      files: FIXTURE_FILES.map(file => ({ name: file.name, content: file.content })),
      baseline: writtenBaseline,
    });
    expect({
      is_error: result.isError === true,
      names_unsupported_field: result.content[0].text
        === 'survey input error: arguments contains an unsupported field',
    }).toEqual({ is_error: true, names_unsupported_field: true });
  });
});

describe('cross-surface report and envelope gates', () => {
  it('passes structural and emitted report gates on every surface', () => {
    for (const surface of [
      directorySurvey, msappSurvey, solutionSurvey, msappWithBaseline, solutionWithBaseline,
    ]) {
      expect(() => assertValidReport(surface.report), `valid report ${surface.kind}`).not.toThrow();
      expect(
        () => assertEmittableReport(surface.report, { surface: 'cli', envelope: surface.envelope }),
        `emittable cli report ${surface.kind}`,
      ).not.toThrow();
    }
    expect(() => assertValidReport(mcpPayload.report)).not.toThrow();
    expect(() => assertEmittableReport(mcpPayload.report, {
      surface: 'mcp',
      envelope: mcpPayload.envelope,
    })).not.toThrow();
  });

  it('passes canonical decode and catalog allowlist validation on every envelope', () => {
    const encoder = new TextEncoder();
    for (const surface of [
      directorySurvey, msappSurvey, solutionSurvey, msappWithBaseline, solutionWithBaseline,
    ]) {
      expect(
        () => assertValidEnvelope(surface.envelope, ANALYZER_CATALOG_ALLOWLIST),
        `valid envelope ${surface.kind}`,
      ).not.toThrow();
      const reserialized = encoder.encode(
        serializeEnvelope(surface.envelope, ANALYZER_CATALOG_ALLOWLIST),
      );
      expect(
        decodeCanonicalEnvelope(reserialized, ANALYZER_CATALOG_ALLOWLIST),
        `canonical round trip ${surface.kind}`,
      ).toEqual(surface.envelope);
    }

    assertValidEnvelope(mcpPayload.envelope, ANALYZER_CATALOG_ALLOWLIST);
    const mcpBytes = encoder.encode(
      serializeEnvelope(mcpPayload.envelope, ANALYZER_CATALOG_ALLOWLIST),
    );
    expect(decodeCanonicalEnvelope(mcpBytes, ANALYZER_CATALOG_ALLOWLIST))
      .toEqual(mcpPayload.envelope);
  });

  it('declares the surveyed source kind in every envelope', () => {
    expect([
      directorySurvey.envelope.source_kind,
      msappSurvey.envelope.source_kind,
      solutionSurvey.envelope.source_kind,
      mcpPayload.envelope.source_kind,
    ]).toEqual(['directory', 'msapp', 'solution', 'inline']);
  });

  it('keeps report and envelope identifiers distinct and bound per surface', () => {
    const checks: Record<string, boolean> = {};
    for (const surface of [
      directorySurvey, msappSurvey, solutionSurvey, msappWithBaseline, solutionWithBaseline,
    ]) {
      const key = `${surface.kind}-${surface.report.report_id}`;
      checks[`${key}-report-id-distinct`] = surface.report.report_id !== surface.envelope.id;
      checks[`${key}-envelope-id-bound`] = surface.report.envelope.id === surface.envelope.id;
      checks[`${key}-envelope-file-matches-id`] =
        surface.envelopeFiles[0] === `envelope-${surface.envelope.id}.json`;
    }
    checks['mcp-report-id-distinct'] = mcpPayload.report.report_id !== mcpPayload.envelope.id;
    checks['mcp-envelope-id-bound'] = mcpPayload.report.envelope.id === mcpPayload.envelope.id;
    expect(checks).toEqual(Object.fromEntries(
      Object.keys(checks).map(key => [key, true]),
    ));
  });

  it('carries a normalized absolute envelope path on CLI and null on MCP', () => {
    const checks: Record<string, boolean> = {};
    for (const surface of [
      directorySurvey, msappSurvey, solutionSurvey, msappWithBaseline, solutionWithBaseline,
    ]) {
      const path = surface.report.envelope.path;
      const key = `${surface.kind}-${surface.report.report_id}`;
      checks[`${key}-path-is-string`] = typeof path === 'string';
      checks[`${key}-path-is-absolute`] = typeof path === 'string' && isAbsolute(path);
      checks[`${key}-path-is-normalized-native`] = typeof path === 'string'
        && path === resolve(path)
        && path === join(
          realpathSync.native(surface.reportDir),
          `envelope-${surface.envelope.id}.json`,
        );
      checks[`${key}-path-file-decodes`] = typeof path === 'string'
        && decodeCanonicalEnvelope(readFileSync(path), ANALYZER_CATALOG_ALLOWLIST).id
          === surface.envelope.id;
    }
    checks['mcp-path-is-null'] = mcpPayload.report.envelope.path === null;
    checks['mcp-submission-not-requested'] =
      mcpPayload.report.envelope.submission.state === 'not_requested';
    expect(checks).toEqual(Object.fromEntries(
      Object.keys(checks).map(key => [key, true]),
    ));
  });

  it('reports solution connection state from customizations only', () => {
    expect([
      directorySurvey.report.inventories.connections.state,
      msappSurvey.report.inventories.connections.state,
      solutionSurvey.report.inventories.connections.state,
      mcpPayload.report.inventories.connections.state,
    ]).toEqual(['unavailable', 'unavailable', 'empty', 'unavailable']);
  });
});
