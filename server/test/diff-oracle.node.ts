import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyAdjudications,
  compareExternalGolden,
  compareInternalGolden,
  corpusPathReplacements,
  coverageResult,
  discrepancyIdentity,
  goldenGatePassed,
  loadAdjudications,
  oracleCalibrationResult,
  parseArgs,
  portableReportedText,
} from '../../cli/diff-oracle.mjs';
import { resolveExternalGolden } from '../../cli/lib/appforge-data-paths.mjs';

const issue = (detail = 'cause one') => ({
  level: 'WARN',
  rule: 'perf-control-budget',
  file: 'coverage/two-screens.pa.yaml',
  control: 'first001',
  type: 'Label',
  property: null,
  did_you_mean: null,
  detail,
  fix: 'split the screen',
  line: 3,
});

const summary = { pass: 0, warn: 1, refuse: 0, controls_seen: 400 };
const snapshotEntry = (issues = [issue()]) => ({
  sha256: 'a'.repeat(64),
  issues,
  summary,
});

describe('golden-snapshot gate', () => {
  it('calibrates all nine permanent Microsoft screens and excludes the private App block', async () => {
    const oracle = resolve(__dirname, '../../cli/corpus/oracle-ms-templates');
    const names = readdirSync(oracle).filter(name => name.endsWith('.pa.yaml')).sort();
    expect(names).toHaveLength(9);
    expect(names.every(name => /^Screen.*\.pa\.yaml$/u.test(name))).toBe(true);
    const { analyze, loadCatalog } = await import('../../cli/dist/analyzer-core.mjs');
    const validation = analyze(names.map(name => ({ name, content: readFileSync(join(oracle, name), 'utf8') })),
      loadCatalog(), { lintProfile: 'worker', captureFileLines: false }).validation;
    expect(validation.summary).toMatchObject({ controls_seen: 249, refuse: 0 });
    expect(oracleCalibrationResult(validation).gate_passed).toBe(true);
    expect(validation.issues.filter(issue => issue.rule === 'manual-group-may-stretch')).toEqual([]);
  });
  it('enforces the oracle threshold even when golden and coverage gates pass', () => {
    const calibration = oracleCalibrationResult({ summary: { controls_seen: 15 },
      issues: Array.from({ length: 4 }, () => issue()) });
    expect(calibration.violations).toEqual([{ rule: 'perf-control-budget', count: 4, share: 4 / 15 }]);
    expect(goldenGatePassed(applyAdjudications([], {}), { missing_expected_rules: [] }, calibration)).toBe(false);
    const boundary = oracleCalibrationResult({ summary: { controls_seen: 16 },
      issues: [...Array.from({ length: 4 }, () => issue()), { ...issue(), level: 'REFUSE' }] });
    expect(boundary.rules).toEqual([{ rule: 'perf-control-budget', count: 4, share: 0.25 }]);
    expect(goldenGatePassed(applyAdjudications([], {}), { missing_expected_rules: [] }, boundary)).toBe(true);
  });
  it('fails closed for an empty oracle or a WARN without a rule identifier', () => {
    expect(() => oracleCalibrationResult({ summary: { controls_seen: 0 }, issues: [] })).toThrow('zero controls');
    expect(() => oracleCalibrationResult({ summary: { controls_seen: 1 }, issues: [{ level: 'WARN' }] })).toThrow('no rule id');
  });
  it('treats detail/fix/line drift as reported but non-fatal', () => {
    const golden = {
      run: { exit_code: 0, files: { 'coverage/a.pa.yaml': snapshotEntry() } },
    };
    const current = {
      run: {
        exit_code: 0,
        files: {
          'coverage/a.pa.yaml': snapshotEntry([{ ...issue('rewritten prose'), line: 9 }]),
        },
      },
    };

    const compared = compareInternalGolden(golden, current);
    expect(compared.discrepancies).toEqual([]);
    expect(compared.reportedDifferences).toHaveLength(1);
    expect(compared.reportedDifferences[0].differences).toEqual({
      detail: { golden: 'cause one', current: 'rewritten prose' },
      line: { golden: 3, current: 9 },
    });
  });

  it('pins issue detail in a fatal discrepancy identity', () => {
    const discrepancy = {
      kind: 'current-only-issue',
      comparison: { subject: 'coverage/a.pa.yaml', occurrence: 1 },
      golden: null,
      current: issue(),
    };
    const identity = discrepancyIdentity(discrepancy);
    expect(discrepancyIdentity({ ...discrepancy, current: issue('different cause') }))
      .not.toBe(identity);
  });

  it('covers only exact identities and fails on unused adjudications', () => {
    const discrepancy = {
      kind: 'summary-mismatch',
      comparison: { subject: 'coverage/a.pa.yaml', fields: ['pass', 'warn', 'refuse', 'controls_seen'] },
      golden: summary,
      current: { ...summary, warn: 0 },
    };
    const identity = discrepancyIdentity(discrepancy);
    const adjudication = {
      reference: 'docs/maintainers/design/centralization-lint-design.md',
      note: 'Intentional test change.',
    };
    const covered = applyAdjudications([discrepancy], { [identity]: adjudication });

    expect(covered.covered[0]).toMatchObject({
      identity,
      classification: 'intended',
      adjudication,
    });
    expect(goldenGatePassed(covered, { missing_expected_rules: [] })).toBe(true);
    expect(goldenGatePassed(
      applyAdjudications([], { [identity]: adjudication }),
      { missing_expected_rules: [] },
    )).toBe(false);
  });

  it('accepts design paths and exact CHANGELOG headings, rejecting malformed references and entries', () => {
    const temp = mkdtempSync(join(tmpdir(), 'appforge-golden-adjudications-'));
    const identity = `summary-mismatch:${'a'.repeat(24)}`;
    try {
      const validPath = join(temp, 'valid.json');
      writeFileSync(validPath, JSON.stringify({
        schema_version: 1,
        adjudications: {
          [identity]: {
            reference: 'docs/maintainers/design/centralization-lint-design.md#1. `duplicate-formula`',
            note: 'Design-backed change.',
          },
        },
      }));
      expect(loadAdjudications(validPath)).toHaveProperty(identity);

      const changelogPath = join(temp, 'changelog.json');
      writeFileSync(changelogPath, JSON.stringify({
        schema_version: 1,
        adjudications: {
          [identity]: {
            reference: 'CHANGELOG.md#Changelog',
            note: 'Recorded decision.',
          },
        },
      }));
      expect(loadAdjudications(changelogPath)).toHaveProperty(identity);

      for (const [name, adjudications] of [
        ['bad-identity.json', { nope: { reference: 'docs/maintainers/design/centralization-lint-design.md', note: 'x' } }],
        ['bad-reference.json', { [identity]: { reference: 'docs/README.md', note: 'x' } }],
        ['bad-shape.json', { [identity]: 'docs/maintainers/design/centralization-lint-design.md' }],
        ['missing-fragment.json', { [identity]: { reference: 'docs/maintainers/design/centralization-lint-design.md#No such heading', note: 'x' } }],
        ['missing-file.json', { [identity]: { reference: 'docs/maintainers/design/no-such-design.md', note: 'x' } }],
        ['extra-fragment.json', { [identity]: { reference: 'docs/maintainers/design/centralization-lint-design.md#1.#extra', note: 'x' } }],
        ['changelog-without-fragment.json', { [identity]: { reference: 'CHANGELOG.md', note: 'x' } }],
        ['traversal.json', { [identity]: { reference: 'docs/maintainers/design/../design/centralization-lint-design.md', note: 'x' } }],
        ['backslash.json', { [identity]: { reference: 'docs\\maintainers\\design\\centralization-lint-design.md', note: 'x' } }],
        ['wrong-root.json', { [identity]: { reference: 'centralization-lint-design.md', note: 'x' } }],
        ['former-design-root.json', { [identity]: { reference: 'docs/design/centralization-lint-design.md', note: 'x' } }],
        ['project-log.json', { [identity]: { reference: 'PROJECT-CHANGELOG.md#Changelog', note: 'x' } }],
        ['private-spec.json', { [identity]: { reference: 'docs/private/specs/2026-08-28-design.md', note: 'x' } }],
      ] as const) {
        const path = join(temp, name);
        writeFileSync(path, JSON.stringify({ schema_version: 1, adjudications }));
        expect(() => loadAdjudications(path)).toThrow();
      }
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it('makes same-hash output drift fatal and classifies unknown/absent hashes without failing', () => {
    const known = 'a'.repeat(64);
    const stale = 'b'.repeat(64);
    const changed = 'c'.repeat(64);
    const golden = {
      files: {
        [known]: { issues: [issue()], summary },
        [stale]: { issues: [], summary: { ...summary, warn: 0 } },
      },
    };
    const current = {
      files: {
        [known]: { issues: [], summary: { ...summary, warn: 0 } },
        [changed]: { issues: [], summary: { ...summary, warn: 0 } },
      },
      pathsByHash: { [changed]: ['delivery-repositories-1-copy/Screens/Home.pa.yaml'] },
    };

    const compared = compareExternalGolden(golden, current);
    expect(compared.discrepancies.map(entry => entry.kind)).toEqual([
      'summary-mismatch',
      'golden-only-issue',
    ]);
    expect(compared.inputChanged).toEqual([{
      classification: 'input-changed',
      file_hash: changed,
      files: ['delivery-repositories-1-copy/Screens/Home.pa.yaml'],
    }]);
    expect(compared.stale).toEqual([{ classification: 'stale', file_hash: stale }]);
  });

  it('keeps unrelated drift fail-closed when release adjudications exist', () => {
    const path = resolve(__dirname, '..', '..', 'cli', 'corpus', 'adjudications.json');
    const adjudications = loadAdjudications(path);
    const discrepancy = {
      kind: 'current-only-issue',
      comparison: { subject: 'coverage/a.pa.yaml', occurrence: 1 },
      golden: null,
      current: issue(),
    };
    expect(goldenGatePassed(applyAdjudications([discrepancy], adjudications), {
      missing_expected_rules: [],
    })).toBe(false);
  });

  it('does not let an unexpected constructor rule corrupt the coverage table', () => {
    const coverage = coverageResult(
      ['expected-rule'],
      [{ issues: [{ rule: 'constructor', detail: 'not-an-expected-rule' }] }],
    );

    expect(coverage.rule_counts).toEqual({ 'expected-rule': 0 });
    expect(Object.hasOwn(coverage.rule_counts, 'constructor')).toBe(false);
    expect(coverage.missing_expected_rules).toEqual(['expected-rule']);
  });
});

describe('corpus analysis grouping', () => {
  it('analyzes isolated-root files individually while retaining cross-file context for ordinary roots', () => {
    const temp = mkdtempSync(join(tmpdir(), 'appforge-corpus-analysis-mode-'));
    try {
      for (const [root, prefix] of [['batch', 'Batch'], ['isolated', 'Isolated']]) {
        const directory = join(temp, root);
        mkdirSync(directory);
        writeFileSync(join(directory, 'a.pa.yaml'), `Screens:
  ${prefix}Home:
    Children:
      - ${prefix}Label:
          Control: Label
          Properties:
            Text: =${prefix}Other.Text
`, 'utf8');
        writeFileSync(join(directory, 'b.pa.yaml'), `Screens:
  ${prefix}Details:
    Children:
      - ${prefix}Other:
          Control: Label
          Properties:
            Text: ="Example"
`, 'utf8');
      }
      const manifest = join(temp, 'manifest.json');
      const golden = join(temp, 'golden.json');
      const adjudications = join(temp, 'adjudications.json');
      writeFileSync(manifest, JSON.stringify({
        schema_version: 1,
        expected_rules: ['perf-cross-screen-reference'],
        roots: [
          { id: 'batch-source', scope: 'internal', path: 'batch/a.pa.yaml', include: ['**/*.pa.yaml'] },
          { id: 'isolated', scope: 'internal', path: 'isolated', include: ['**/*.pa.yaml'], analysis_mode: 'isolated' },
          { id: 'batch-target', scope: 'internal', path: 'batch/b.pa.yaml', include: ['**/*.pa.yaml'] },
          { id: 'overlapping-isolated', scope: 'internal', path: 'batch/a.pa.yaml', include: ['**/*.pa.yaml'], analysis_mode: 'isolated' },
        ],
      }));
      writeFileSync(adjudications, JSON.stringify({ schema_version: 1, adjudications: {} }));
      const result = spawnSync(process.execPath, [
        resolve(__dirname, '../../cli/diff-oracle.mjs'),
        '--manifest', manifest,
        '--golden-internal', golden,
        '--adjudications', adjudications,
        '--internal-only', '--write-golden', '--json',
      ], { encoding: 'utf8', windowsHide: true, timeout: 30_000 });

      expect(result.status, result.stderr).toBe(0);
      const report = JSON.parse(result.stdout);
      expect(report.coverage.rule_counts['perf-cross-screen-reference']).toBe(1);
      expect(report.schema_version).toBe(4);
      expect(report.gate_passed).toBe(true);
      expect(report.current_core.internal_chunks).toBe(3);
      expect(report.current_core.external_chunks).toBe(0);
      expect(report.summary.files).toBe(4);
      expect(report.corpus.roots.map((root: { file_count: number }) => root.file_count)).toEqual([1, 2, 1, 0]);
      const files = JSON.parse(readFileSync(golden, 'utf8')).run.files;
      expect(Object.keys(files).sort()).toEqual([
        'batch-source/a.pa.yaml', 'batch-target/b.pa.yaml', 'isolated/a.pa.yaml', 'isolated/b.pa.yaml',
      ]);
      expect(files['batch-source/a.pa.yaml'].issues.some((issue: { rule: string }) => issue.rule === 'perf-cross-screen-reference')).toBe(true);
      expect(files['isolated/a.pa.yaml'].issues.some((issue: { rule: string }) => issue.rule === 'perf-cross-screen-reference')).toBe(false);

      const allBatch = JSON.parse(readFileSync(manifest, 'utf8'));
      allBatch.roots[1].analysis_mode = 'batch';
      writeFileSync(manifest, JSON.stringify(allBatch));
      const batchResult = spawnSync(process.execPath, [
        resolve(__dirname, '../../cli/diff-oracle.mjs'),
        '--manifest', manifest,
        '--golden-internal', golden,
        '--adjudications', adjudications,
        '--internal-only', '--write-golden', '--json',
      ], { encoding: 'utf8', windowsHide: true, timeout: 30_000 });
      expect(batchResult.status, batchResult.stderr).toBe(0);
      const batchReport = JSON.parse(batchResult.stdout);
      expect(batchReport.current_core.internal_chunks).toBe(1);
      expect(batchReport.coverage.rule_counts['perf-cross-screen-reference']).toBe(2);
      expect(batchReport.summary.files).toBe(4);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it.each(['per-file', null, 1, {}])('rejects unsupported root analysis mode %j even when that external root is skipped', mode => {
    const temp = mkdtempSync(join(tmpdir(), 'appforge-corpus-invalid-mode-'));
    try {
      const manifest = join(temp, 'manifest.json');
      writeFileSync(manifest, JSON.stringify({
        schema_version: 1,
        expected_rules: ['perf-cross-screen-reference'],
        roots: [{
          id: 'invalid', scope: 'external', paths_from_env: 'APPFORGE_TEST_UNUSED_ROOTS',
          include: ['**/*.pa.yaml'], analysis_mode: mode,
        }],
      }));
      const result = spawnSync(process.execPath, [
        resolve(__dirname, '../../cli/diff-oracle.mjs'),
        '--manifest', manifest, '--internal-only', '--json',
      ], { encoding: 'utf8', windowsHide: true, timeout: 30_000 });
      expect(result.status).toBe(2);
      expect(result.stderr).toContain("root 'invalid' analysis_mode must be batch or isolated");
      expect(result.stdout).toBe('');
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it('still rejects an isolated corpus with no matching source files', () => {
    const temp = mkdtempSync(join(tmpdir(), 'appforge-corpus-empty-isolated-'));
    try {
      const manifest = join(temp, 'manifest.json');
      writeFileSync(manifest, JSON.stringify({
        schema_version: 1,
        expected_rules: ['perf-cross-screen-reference'],
        roots: [{ id: 'empty', scope: 'internal', path: '.', include: ['**/*.pa.yaml'], analysis_mode: 'isolated' }],
      }));
      const result = spawnSync(process.execPath, [
        resolve(__dirname, '../../cli/diff-oracle.mjs'),
        '--manifest', manifest, '--internal-only', '--json',
      ], { encoding: 'utf8', windowsHide: true, timeout: 30_000 });
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('acceptance corpus matched zero files');
      expect(result.stdout).toBe('');
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });
});


describe('external golden paths', () => {
  const home = resolve('synthetic-home');
  const goldenIn = (directory: string) => join(directory, 'corpus', 'golden-external.json');

  it('prefers the external golden override over every data directory', () => {
    const external = resolve('external.json');
    expect(resolveExternalGolden({ home, env: {
      APPFORGE_CORPUS_EXTERNAL_GOLDEN: external, APPFORGE_DATA_DIR: resolve('data'),
      LOCALAPPDATA: resolve('local'), XDG_DATA_HOME: resolve('xdg'),
    } })).toBe(external);
  });

  it('prefers the explicit AppForge data directory over platform directories', () => {
    const data = resolve('data');
    expect(resolveExternalGolden({ home, env: {
      APPFORGE_DATA_DIR: data, LOCALAPPDATA: resolve('local'), XDG_DATA_HOME: resolve('xdg'),
    } })).toBe(goldenIn(data));
  });

  it('uses LOCALAPPDATA/AppForge before XDG_DATA_HOME', () => {
    const local = resolve('local');
    expect(resolveExternalGolden({ home, env: { LOCALAPPDATA: local, XDG_DATA_HOME: resolve('xdg') } }))
      .toBe(goldenIn(join(local, 'AppForge')));
  });

  it('uses XDG_DATA_HOME/appforge before the home fallback', () => {
    const xdg = resolve('xdg');
    expect(resolveExternalGolden({ home, env: { XDG_DATA_HOME: xdg } }))
      .toBe(goldenIn(join(xdg, 'appforge')));
  });

  it('falls back to ~/.local/share/appforge', () => {
    expect(resolveExternalGolden({ home, env: {} }))
      .toBe(goldenIn(join(home, '.local', 'share', 'appforge')));
  });

  it('lets --golden-external override the configured default', () => {
    const external = resolve('flag-override.json');
    expect(parseArgs(['--golden-external', external]).externalGolden).toBe(external);
  });
});

describe('configured external corpus roots', () => {
  it('fails the corpus calibration for a Worker-only WARN above 25 percent', () => {
    const temp = mkdtempSync(join(tmpdir(), 'appforge-oracle-calibration-'));
    try {
      const source = `Screens:
  Home:
    Children:
      - outer:
          Control: GroupContainer
          Variant: AutoLayout
          Properties:
            LayoutDirection: =LayoutDirection.Vertical
          Children:
${Array.from({ length: 4 }, (_, i) => `            - item${i}:
                Control: ModernText
                Properties:
                  Text: ="Example"
                  LayoutMinWidth: =16
                  LayoutMinHeight: =16`).join('\n')}
`;
      writeFileSync(join(temp, 'Screen1.pa.yaml'), source);
      const manifest = join(temp, 'manifest.json');
      writeFileSync(manifest, JSON.stringify({ schema_version: 1,
        expected_rules: ['missing-align-in-container'], roots: [{
          id: 'oracle-ms-templates', scope: 'internal', path: '.', include: ['Screen*.pa.yaml'],
        }] }));
      const result = spawnSync(process.execPath, [
        resolve(__dirname, '../../cli/diff-oracle.mjs'),
        '--manifest', manifest, '--internal-only', '--json',
      ], { encoding: 'utf8', windowsHide: true, timeout: 30_000 });
      expect(result.status).toBe(1);
      const report = JSON.parse(result.stdout);
      expect(report.oracle_calibration).toMatchObject({
        profile: 'worker', controls: 5, max_share: 0.25, gate_passed: false,
      });
      expect(report.oracle_calibration.violations).toContainEqual({
        rule: 'missing-align-in-container', count: 4, share: 0.8,
      });
      expect(report.gate_passed).toBe(false);
    } finally { rmSync(temp, { recursive: true, force: true }); }
  });
  it.each(['missing alone', 'present then missing'])('fails with a named missing root (%s)', mode => {
    const temp = mkdtempSync(join(tmpdir(), 'appforge-missing-root-'));
    const missing = join(temp, 'missing');
    try {
      const result = spawnSync(process.execPath, [
        resolve(__dirname, '../../cli/diff-oracle.mjs'), '--json',
      ], {
        encoding: 'utf8', windowsHide: true, timeout: 30_000,
        env: { ...process.env, APPFORGE_CORPUS_EXTERNAL_ROOTS: mode === 'missing alone' ? missing : `${temp}${delimiter}${missing}` },
      });
      expect(result.status).toBe(2);
      expect(result.stderr).toContain(`configured external corpus root does not exist: ${missing}`);
      expect(result.stdout).toBe('');
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });
});

describe('portable reported text', () => {
  const files = [
    { path: String.raw`C:\work\appforge\templates\a.yaml`, file: 'templates/a.yaml' },
    { path: String.raw`C:\work\appforge\templates\a.yaml.bak\b.yaml`, file: 'templates/a.yaml.bak/b.yaml' },
    { path: '/home/dev/appforge/fixtures/c.pa.yaml', file: 'mcp-test-fixtures/c.pa.yaml' },
  ];

  it('replaces every corpus path in detail text with its corpus id, longest path first', () => {
    const replacements = corpusPathReplacements(files, 'win32');
    expect(portableReportedText(
      String.raw`appears 3× — other locations: C:\work\appforge\templates\a.yaml:175, `
        + 'c:/work/appforge/templates/a.yaml.bak/b.yaml:9', replacements))
      .toBe('appears 3× — other locations: templates/a.yaml:175, templates/a.yaml.bak/b.yaml:9');
  });

  it('is case-sensitive off Windows and leaves non-string values alone', () => {
    const replacements = corpusPathReplacements(files, 'linux');
    expect(portableReportedText('see /home/dev/appforge/fixtures/c.pa.yaml:3', replacements))
      .toBe('see mcp-test-fixtures/c.pa.yaml:3');
    expect(portableReportedText('see /HOME/dev/appforge/fixtures/c.pa.yaml:3', replacements))
      .toBe('see /HOME/dev/appforge/fixtures/c.pa.yaml:3');
    expect(portableReportedText(null, replacements)).toBeNull();
    expect(portableReportedText(12, replacements)).toBe(12);
  });
});
