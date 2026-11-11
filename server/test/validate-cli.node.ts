import { describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { extractBoundSource as extractWorkerBoundSource } from '../src/lib/lint';
import {
  LEGACY_CLI_BASELINE_JSON,
  LEGACY_CLI_JSON,
  LEGACY_CLI_TEXT,
  NEAR_MISS_CLI_JSON,
  NEAR_MISS_CLI_TEXT,
  SURVEY_DATASOURCES_INVALID_STDERR,
  SURVEY_DATASOURCES_UNREADABLE_STDERR,
  materializeLegacyCliFixture,
} from './fixtures/legacy-bytes';
// Import the shebang-free helper module because Vite cannot parse validate.mjs's CLI shebang.
import { extractBoundSource as extractLocalBoundSource } from '../../cli/lib/bound-source.mjs';
import {
  ANALYZER_CORE_VERSION,
  FINDING_FINGERPRINT_HEX_WIDTH,
  findingFingerprint,
} from '../../cli/dist/analyzer-core.mjs';

const MCP = resolve(__dirname, '..');
const SCRIPT = resolve(MCP, '..', 'cli', 'validate.mjs');
const TEMPLATES = resolve(MCP, '..', 'knowledge', 'templates');
const LEGACY_BYTE_TARGET = resolve(MCP, 'test', 'fixtures', 'legacy-byte.yaml');
const NEAR_MISS_BYTE_TARGET = resolve(MCP, 'test', 'fixtures', 'near-miss-byte.yaml');
const LEGACY_BYTE_BASELINE = resolve(MCP, 'test', 'fixtures', 'legacy-byte.baseline.json');

function run(target: string, args: string[] = []) {
  return runTargets([target], args);
}

function runTargets(targets: string[], args: string[] = []) {
  try {
    const raw = execFileSync('node', [SCRIPT, ...targets, '--json', ...args], { encoding: 'utf8', stdio: 'pipe' });
    const out = `${JSON.stringify(JSON.parse(raw).reports, null, 2)}\n`;
    return { code: 0, out };
  } catch (error: any) {
    const stdout = String(error.stdout ?? '');
    try {
      const out = `${JSON.stringify(JSON.parse(stdout).reports, null, 2)}\n`;
      return { code: error.status ?? 1, out };
    } catch {
      return { code: error.status ?? 1, out: `${stdout}${error.stderr ?? ''}` };
    }
  }
}

function runProcess(target: string, args: string[] = [], options: { cwd?: string; json?: boolean } = {}) {
  const result = spawnSync('node', [SCRIPT, target, ...(options.json === false ? [] : ['--json']), ...args], {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  return { code: result.status ?? 1, out: result.stdout, err: result.stderr };
}

describe('local validate CLI file enumeration', () => {
  it('keeps branch-point JSON, text, version, and baseline bytes exact apart from the specified J3 pin inventory', () => {
    // Preserve frozen fixtures; only the specified pin-inventory prose changes.
    const oldAdvice = '1 control type(s) carry @version pins — observed, not judged: a suffix alone establishes neither lag nor incompatibility; see the version-lag inventory for evidence-backed migrations. This repository authors bare control types (generator convention). Pinned: pinned';
    const newAdvice = `1 control type(s) carry @version pins across 1 file(s) — observed, not judged: a suffix alone establishes neither lag nor incompatibility; see the version-lag inventory for evidence-backed migrations. Pins are optional in authored YAML: the compile path strips them, so new code can use bare control types. Files: ${LEGACY_BYTE_TARGET}. Pinned: pinned`;
    const expected = (fixture: string) => materializeLegacyCliFixture(fixture, LEGACY_BYTE_TARGET, ANALYZER_CORE_VERSION)
      .replaceAll(JSON.stringify(oldAdvice), JSON.stringify(newAdvice))
      .replaceAll(oldAdvice, newAdvice);
    const json = spawnSync('node', [SCRIPT, LEGACY_BYTE_TARGET, '--json'], {
      encoding: 'utf8', stdio: 'pipe',
    });
    expect(json.status).toBe(1);
    expect(json.stdout).toBe(expected(LEGACY_CLI_JSON));
    expect(json.stderr).toBe('');

    const text = spawnSync('node', [SCRIPT, LEGACY_BYTE_TARGET], {
      encoding: 'utf8', stdio: 'pipe',
    });
    expect(text.status).toBe(1);
    expect(text.stdout).toBe(expected(LEGACY_CLI_TEXT));
    expect(text.stderr).toBe('');

    const version = spawnSync('node', [SCRIPT, '--version'], {
      encoding: 'utf8', stdio: 'pipe',
    });
    expect(version.status).toBe(0);
    expect(version.stdout).toBe(`AppForge analyzer core v${ANALYZER_CORE_VERSION}\n`);
    expect(version.stderr).toBe('');

    const baseline = spawnSync('node', [
      SCRIPT, LEGACY_BYTE_TARGET, '--json', '--baseline', LEGACY_BYTE_BASELINE,
    ], { encoding: 'utf8', stdio: 'pipe' });
    expect(baseline.status).toBe(1);
    expect(baseline.stdout).toBe(expected(LEGACY_CLI_BASELINE_JSON));
    expect(baseline.stderr).toBe('');
  });

  it('keeps unknown-property near-miss JSON and text bytes exact on the CLI surface', () => {
    const json = spawnSync('node', [SCRIPT, NEAR_MISS_BYTE_TARGET, '--json'], {
      encoding: 'utf8', stdio: 'pipe',
    });
    expect(json.status).toBe(1);
    expect(json.stdout).toBe(materializeLegacyCliFixture(
      NEAR_MISS_CLI_JSON, NEAR_MISS_BYTE_TARGET, ANALYZER_CORE_VERSION,
    ));
    expect(json.stderr).toBe('');

    const text = spawnSync('node', [SCRIPT, NEAR_MISS_BYTE_TARGET], {
      encoding: 'utf8', stdio: 'pipe',
    });
    expect(text.status).toBe(1);
    expect(text.stdout).toBe(materializeLegacyCliFixture(
      NEAR_MISS_CLI_TEXT, NEAR_MISS_BYTE_TARGET, ANALYZER_CORE_VERSION,
    ));
    expect(text.stderr).toBe('');
  });

  it('keeps both invalid --datasources survey diagnostics byte-exact on stderr', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'appforge-validate-cli-datasources-'));
    try {
      const app = join(tmp, 'App');
      mkdirSync(app);
      writeFileSync(join(app, 'Screen.pa.yaml'), readFileSync(NEAR_MISS_BYTE_TARGET, 'utf8'), 'utf8');
      const reportDir = join(tmp, 'out');

      const unreadable = spawnSync('node', [
        SCRIPT, 'survey', app, '--datasources', join(tmp, 'absent.json'), '--report', reportDir,
      ], { cwd: tmp, encoding: 'utf8', stdio: 'pipe' });
      expect({ status: unreadable.status, stdout: unreadable.stdout, stderr: unreadable.stderr })
        .toEqual({ status: 2, stdout: '', stderr: SURVEY_DATASOURCES_UNREADABLE_STDERR });

      const mapPath = join(tmp, 'datasources.json');
      writeFileSync(mapPath, JSON.stringify({ Orders: 'mongodb' }), 'utf8');
      const invalid = spawnSync('node', [
        SCRIPT, 'survey', app, '--datasources', mapPath, '--report', reportDir,
      ], { cwd: tmp, encoding: 'utf8', stdio: 'pipe' });
      expect({ status: invalid.status, stdout: invalid.stdout, stderr: invalid.stderr })
        .toEqual({ status: 2, stdout: '', stderr: SURVEY_DATASOURCES_INVALID_STDERR });

      expect(existsSync(reportDir)).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('walks only .pa.yaml files in directories but validates an explicit .yaml path', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'appforge-validate-cli-enumeration-'));
    const scratch = join(tmp, 'scratch.yaml');
    try {
      writeFileSync(join(tmp, 'screen.pa.yaml'), `Screens:
  Main:
    Children:
      - btnSave:
          Control: Button
          Properties:
            OnSelect: =true
`, 'utf8');
      writeFileSync(scratch, `Screens:
  Scratch:
    Children:
      - ghost:
          Control: DefinitelyNotAControl
`, 'utf8');

      const directory = run(tmp);
      expect(directory.code).toBe(0);
      const directoryReports = JSON.parse(directory.out);
      expect(directoryReports).toHaveLength(1);
      expect(directoryReports[0].file).toContain('screen.pa.yaml');
      expect(directoryReports[0].summary.refuse).toBe(0);

      const explicit = run(scratch);
      expect(explicit.code).toBe(1);
      const explicitReports = JSON.parse(explicit.out);
      expect(explicitReports).toHaveLength(1);
      expect(explicitReports[0].issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ level: 'REFUSE', control: 'ghost', detail: 'control-type-not-in-manifest' }),
      ]));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('local validate CLI finding baselines', () => {
  const warningYaml = `Screens:
  Main:
    Children:
      - btnPinned:
          Control: Button@1.0.0
          Properties:
            OnSelect: =true
`;

  it('keeps fingerprints stable across line shifts', () => {
    const finding = {
      rule: 'version-pin-in-control-type',
      file: 'Screens/Main.pa.yaml',
      control: 'btnPinned',
      type: 'Button',
      line: 10,
    };
    const shifted = { ...finding, line: 900 };

    expect(findingFingerprint(finding)).toBe(findingFingerprint(shifted));
    expect(findingFingerprint(finding)).toBe('61caaf02492d');
  });

  it('uses sorted exact-set identity for aggregates', () => {
    const aggregate = {
      rule: 'a11y-inputs-missing-accessiblelabel',
      file: 'Screens/Main.pa.yaml',
      control: 'txt1',
      type: 'TextInput',
      controls: ['txt1', 'txt2', 'txt3'],
    };

    expect(findingFingerprint(aggregate)).toBe(findingFingerprint({
      ...aggregate,
      controls: ['txt3', 'txt1', 'txt2'],
    }));
    expect(findingFingerprint(aggregate)).not.toBe(findingFingerprint({
      ...aggregate,
      controls: [...aggregate.controls, 'txt4'],
    }));
  });

  it('keeps the built artifact synchronized with the Worker release constant', () => {
    const releaseSource = readFileSync(resolve(MCP, 'src', 'lib', 'release.ts'), 'utf8');
    const workerVersion = releaseSource.match(/export const WORKER_VERSION\s*=\s*['"]([^'"]+)['"]/u)?.[1];

    expect(workerVersion).toBeDefined();
    expect(ANALYZER_CORE_VERSION).toBe(workerVersion);
    expect(FINDING_FINGERPRINT_HEX_WIDTH).toBe(12);
  });

  it('round-trips WARN findings into the accepted section with = flag forms', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'appforge-validate-cli-baseline-'));
    try {
      const target = join(tmp, 'screen.pa.yaml');
      const baseline = join(tmp, 'accepted.json');
      writeFileSync(target, warningYaml, 'utf8');

      const written = runProcess(target, [`--write-baseline=${baseline}`]);
      expect(written.code).toBe(0);
      const baselineBody = JSON.parse(readFileSync(baseline, 'utf8'));
      expect(baselineBody).toMatchObject({ tool_version: ANALYZER_CORE_VERSION });
      expect(baselineBody.generated_at).toBeTypeOf('string');
      expect(baselineBody.findings).toHaveLength(1);
      expect(baselineBody.findings[0].file).toBe('screen.pa.yaml');

      const accepted = runProcess(target, [`--baseline=${baseline}`]);
      expect(accepted.code).toBe(0);
      const output = JSON.parse(accepted.out);
      expect(output.accepted_total).toBe(1);
      expect(output.stale_baseline_entries).toEqual([]);
      const [report] = output.reports;
      expect(report.summary).toMatchObject({ warn: 0, accepted: 1, refuse: 0 });
      expect(report.issues).toEqual([]);
      expect(report.accepted).toHaveLength(1);
      expect(report.accepted[0]).toMatchObject({
        level: 'WARN',
        rule: 'version-pin-in-control-type',
        fingerprint: baselineBody.findings[0].fingerprint,
      });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('reports stale baseline entries', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'appforge-validate-cli-stale-'));
    try {
      const target = join(tmp, 'screen.pa.yaml');
      const baseline = join(tmp, 'accepted.json');
      writeFileSync(target, warningYaml, 'utf8');
      writeFileSync(baseline, JSON.stringify({
        generated_at: new Date(0).toISOString(),
        tool_version: '2.4.4',
        findings: [{ fingerprint: '000000000000', rule: 'gone-rule', file: target, note: 'prune me' }],
      }), 'utf8');

      const result = runProcess(target, ['--baseline', baseline]);
      expect(result.code).toBe(0);
      const output = JSON.parse(result.out);
      const [report] = output.reports;
      expect(report.summary).toMatchObject({ warn: 1, accepted: 0 });
      expect(output.stale_baseline_entries).toEqual([
        expect.objectContaining({ fingerprint: '000000000000', rule: 'gone-rule', note: 'prune me' }),
      ]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('writes WARNs but never accepts a hand-inserted REFUSE fingerprint', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'appforge-validate-cli-refuse-baseline-'));
    try {
      const target = join(tmp, 'screen.pa.yaml');
      const baseline = join(tmp, 'accepted.json');
      writeFileSync(target, `${warningYaml.trimEnd()}
      - ghost:
          Control: DefinitelyNotAControl
`, 'utf8');

      const written = runProcess(target, ['--write-baseline', baseline]);
      expect(written.code).toBe(1);
      expect(written.err).toContain('REFUSE finding(s) were excluded and are never baselineable');
      const baselineBody = JSON.parse(readFileSync(baseline, 'utf8'));
      expect(baselineBody.findings).toHaveLength(1);

      const [initialReport] = JSON.parse(written.out).reports;
      const refusal = initialReport.issues.find((issue: any) => issue.level === 'REFUSE');
      const hostileEntry = {
        fingerprint: findingFingerprint({
          rule: refusal.rule ?? '',
          file: 'screen.pa.yaml',
          control: refusal.control,
          type: refusal.type,
          property: refusal.property,
        }),
        rule: refusal.rule ?? '',
        file: 'screen.pa.yaml',
        note: 'must not suppress the gate',
      };
      baselineBody.findings.push(hostileEntry);
      writeFileSync(baseline, JSON.stringify(baselineBody), 'utf8');

      const checked = runProcess(target, ['--baseline', baseline]);
      expect(checked.code).toBe(1);
      const output = JSON.parse(checked.out);
      const [report] = output.reports;
      expect(report.summary).toMatchObject({ warn: 0, accepted: 1, refuse: 1 });
      expect(report.issues).toContainEqual(expect.objectContaining({
        level: 'REFUSE', control: 'ghost', detail: 'control-type-not-in-manifest',
      }));
      expect(report.accepted.some((issue: any) => issue.control === 'ghost')).toBe(false);
      expect(output.stale_baseline_entries).toContainEqual(expect.objectContaining(hostileEntry));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('self-identifies in JSON and text while preserving the legacy report shape', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'appforge-validate-cli-output-shape-'));
    try {
      const target = join(tmp, 'empty.pa.yaml');
      writeFileSync(target, `Screens:
  Main:
    Children: []
`, 'utf8');

      const json = runProcess(target);
      expect(json.code).toBe(0);
      expect(json.out).toBe(`${JSON.stringify({
        tool: { name: 'analyzer-core', version: ANALYZER_CORE_VERSION },
        reports: [{
          file: target,
          issues: [],
          summary: { pass: 0, warn: 0, refuse: 0, controls_seen: 0 },
        }],
      }, null, 2)}\n`);

      const text = runProcess(target, [], { json: false });
      expect(text.code).toBe(0);
      expect(text.out.replaceAll('\r\n', '\n')).toBe(`
── ${target} ──

  pass=0  warn=0  refuse=0  controls=0

══ analyzer-core v${ANALYZER_CORE_VERSION} totals: refuse=0 warn=0 files=1 ══
`);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('makes directory-root fingerprints portable across cwd and target spelling', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'appforge-validate-cli-portable-'));
    try {
      const cwdA = join(tmp, 'cwd-a');
      const cwdB = join(tmp, 'cwd-b');
      const fixtures = join(cwdA, 'fixtures');
      const baseline = join(tmp, 'accepted.json');
      mkdirSync(fixtures, { recursive: true });
      mkdirSync(cwdB);
      writeFileSync(join(fixtures, 'screen.pa.yaml'), warningYaml, 'utf8');

      const written = runProcess('./fixtures', [`--write-baseline=${baseline}`], { cwd: cwdA });
      expect(written.code).toBe(0);
      const baselineBody = JSON.parse(readFileSync(baseline, 'utf8'));
      expect(baselineBody.findings).toHaveLength(1);
      expect(baselineBody.findings[0].file).toBe('screen.pa.yaml');

      const differentlySpelledFixtures = process.platform === 'win32'
        ? fixtures[0].toLowerCase() + fixtures.slice(1)
        : fixtures;
      const accepted = runProcess(differentlySpelledFixtures, [`--baseline=${baseline}`], { cwd: cwdB });
      expect(accepted.code).toBe(0);
      const output = JSON.parse(accepted.out);
      expect(output.accepted_total).toBe(1);
      expect(output.reports[0].summary).toMatchObject({ warn: 0, accepted: 1 });
      expect(output.stale_baseline_entries).toEqual([]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('resurfaces aggregate growth and marks the exact old offender set stale', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'appforge-validate-cli-aggregate-baseline-'));
    const aggregateYaml = (count: number) => `Screens:
  Main:
    Children:
${Array.from({ length: count }, (_, index) => `      - txt${index + 1}:
          Control: TextInput
          Properties:
            AccessibleLabel:
`).join('')}`;
    try {
      const target = join(tmp, 'screen.pa.yaml');
      const baseline = join(tmp, 'accepted.json');
      writeFileSync(target, aggregateYaml(3), 'utf8');

      expect(runProcess(target, [`--write-baseline=${baseline}`]).code).toBe(0);
      const unchanged = JSON.parse(runProcess(target, [`--baseline=${baseline}`]).out);
      expect(unchanged.accepted_total).toBe(1);
      expect(unchanged.reports[0].summary).toMatchObject({ warn: 0, accepted: 1 });
      expect(unchanged.stale_baseline_entries).toEqual([]);

      writeFileSync(target, aggregateYaml(4), 'utf8');
      const grownResult = runProcess(target, [`--baseline=${baseline}`]);
      expect(grownResult.code).toBe(0);
      const grown = JSON.parse(grownResult.out);
      expect(grown.accepted_total).toBe(0);
      expect(grown.reports[0].summary).toMatchObject({ warn: 1, accepted: 0 });
      expect(grown.reports[0].issues).toContainEqual(expect.objectContaining({
        rule: 'a11y-inputs-missing-accessiblelabel',
        controls: ['txt1', 'txt2', 'txt3', 'txt4'],
      }));
      expect(grown.stale_baseline_entries).toHaveLength(1);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('fails closed for malformed or missing baselines but accepts fingerprint-only entries', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'appforge-validate-cli-baseline-schema-'));
    try {
      const target = join(tmp, 'screen.pa.yaml');
      writeFileSync(target, warningYaml, 'utf8');

      const malformed = [
        ['truncated.json', '{"findings":['],
        ['non-array.json', JSON.stringify({ findings: {} })],
        ['bad-fingerprint.json', JSON.stringify({ findings: [{ fingerprint: 'ABC123' }] })],
      ];
      for (const [name, contents] of malformed) {
        const baseline = join(tmp, name);
        writeFileSync(baseline, contents, 'utf8');
        const result = runProcess(target, [`--baseline=${baseline}`]);
        expect(result.code).toBe(2);
        expect(result.err).toContain('Unable to load --baseline:');
      }

      const missing = runProcess(target, [`--baseline=${join(tmp, 'missing.json')}`]);
      expect(missing.code).toBe(2);
      expect(missing.err).toContain('Unable to load --baseline:');

      const emptyDir = join(tmp, 'empty');
      const fingerprintOnly = join(tmp, 'fingerprint-only.json');
      mkdirSync(emptyDir);
      writeFileSync(fingerprintOnly, JSON.stringify({ findings: [{ fingerprint: '000000000000' }] }), 'utf8');
      const valid = runProcess(emptyDir, [`--baseline=${fingerprintOnly}`]);
      expect(valid.code).toBe(0);
      expect(JSON.parse(valid.out)).toEqual({
        tool: { name: 'analyzer-core', version: ANALYZER_CORE_VERSION },
        reports: [],
        accepted_total: 0,
        stale_baseline_entries: [{ fingerprint: '000000000000' }],
      });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('returns exit 3 when the analyzer artifact is missing and the hook maps it fail-closed', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'appforge-validate-cli-infra-'));
    try {
      const tools = join(tmp, 'tools');
      mkdirSync(tools);
      const copiedValidator = join(tools, 'validate.mjs');
      const copiedHook = join(tools, 'precompile-hook.mjs');
      copyFileSync(SCRIPT, copiedValidator);
      copyFileSync(resolve(SCRIPT, '..', 'precompile-hook.mjs'), copiedHook);

      const direct = spawnSync('node', [copiedValidator, tmp], { encoding: 'utf8', stdio: 'pipe' });
      expect(direct.status).toBe(3);
      expect(direct.stderr).toContain('validator infrastructure error: unable to load analyzer core artifact');

      const hooked = spawnSync('node', [copiedHook], {
        encoding: 'utf8',
        input: JSON.stringify({ tool_input: { directoryPath: tmp } }),
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      expect(hooked.status).toBe(2);
      expect(hooked.stderr).toContain('validator infrastructure error — fix the toolchain before compiling');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it.each([
    ['clean', 'App:\n  Properties:\n    OnStart: =false\n', 0, 'PASS — proceeding'],
    ['refused', '- ghost:\n    Control: NotARealControl\n', 2, 'REFUSE — compile_canvas blocked'],
  ])('uses the current Node executable with an empty PATH for a %s fixture', (_name, content, status, detail) => {
    const tmp = mkdtempSync(join(tmpdir(), 'appforge-hook-empty-path-'));
    try {
      const copiedHook = join(tmp, 'precompile-hook.mjs');
      copyFileSync(resolve(SCRIPT, '..', 'precompile-hook.mjs'), copiedHook);
      copyFileSync(SCRIPT, join(tmp, 'validate.mjs'));
      mkdirSync(join(tmp, 'dist'));
      copyFileSync(resolve(SCRIPT, '..', 'dist', 'analyzer-core.mjs'), join(tmp, 'dist', 'analyzer-core.mjs'));
      const app = join(tmp, 'app');
      mkdirSync(app);
      writeFileSync(join(app, 'App.pa.yaml'), content);
      // Windows environment names are case-insensitive; remove any spelling.
      const env = { ...process.env };
      for (const key of Object.keys(env)) if (key.toLowerCase() === 'path') delete env[key];
      env.PATH = '';
      const hooked = spawnSync(process.execPath, [copiedHook], {
        env, encoding: 'utf8', stdio: 'pipe',
        input: JSON.stringify({ tool_input: { directoryPath: app } }),
      });
      expect(hooked.error).toBeUndefined();
      expect(hooked.status).toBe(status);
      expect(hooked.stderr).toContain(detail);
      expect(hooked.stderr).not.toContain('validator failed to launch');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it.each(['{}', '{"tool_input":{}}', 'not JSON'])('allows inapplicable or malformed input without launching validation: %s', input => {
    const tmp = mkdtempSync(join(tmpdir(), 'appforge-hook-inapplicable-'));
    try {
      const copiedHook = join(tmp, 'precompile-hook.mjs');
      copyFileSync(resolve(SCRIPT, '..', 'precompile-hook.mjs'), copiedHook);
      // No validator is present: applicability must return before trying to run it.
      const hooked = spawnSync(process.execPath, [copiedHook], { encoding: 'utf8', stdio: 'pipe', input });
      expect(hooked.status).toBe(0);
      expect(hooked.stderr).toContain('allowing');
      expect(hooked.stderr).not.toContain('validating');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it.each([
    ['launch error', "{ error: new Error('synthetic launch failure'), status: null, signal: null }", 'validator failed to launch: synthetic launch failure'],
    ['signal', "{ status: null, signal: 'SIGTERM' }", 'validator terminated without an exit status (signal: SIGTERM)'],
    ['null status', '{ status: null, signal: null }', 'validator terminated without an exit status'],
    ['unexpected exit', '{ status: 7, signal: null }', 'validator infrastructure error'],
  ])('blocks an applicable hook invocation on %s', (_name, result, detail) => {
    const tmp = mkdtempSync(join(tmpdir(), 'appforge-hook-launch-failure-'));
    try {
      const copiedHook = join(tmp, 'precompile-hook.mjs');
      copyFileSync(resolve(SCRIPT, '..', 'precompile-hook.mjs'), copiedHook);
      const preload = join(tmp, 'child-process-fixture.mjs');
      // Inject child results only into this test process; production needs no seam.
      writeFileSync(preload, `import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
childProcess.spawnSync = () => (${result});
syncBuiltinESMExports();
`);
      const hooked = spawnSync(process.execPath, ['--import', pathToFileURL(preload).href, copiedHook], {
        encoding: 'utf8', stdio: 'pipe',
        input: JSON.stringify({ tool_input: { directoryPath: tmp } }),
      });
      expect(hooked.status).toBe(2);
      expect(hooked.stderr).toContain(detail);
      expect(hooked.stderr).not.toContain('REFUSE');
      expect(hooked.stderr).not.toContain('allowing');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  // Consuming repositories own hook registration. Alongside behavioral coverage,
  // keep the byte tripwire: hook edits deliberately update this literal too.
  it('pins the exact precompile-hook bytes', () => {
    const hookPath = resolve(SCRIPT, '..', 'precompile-hook.mjs');
    expect(createHash('sha256').update(readFileSync(hookPath)).digest('hex'))
      .toBe('3df301be07b24065e25f689cf4d64b0259f211ea8fd4defd92a548ea89b97b02');
  });

  it('keeps legacy validation working when only the survey modules are missing', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'appforge-validate-cli-survey-libs-'));
    try {
      const tools = join(tmp, 'tools');
      const dist = join(tools, 'dist');
      const lib = join(tools, 'lib');
      mkdirSync(dist, { recursive: true });
      mkdirSync(lib, { recursive: true });
      const copiedValidator = join(tools, 'validate.mjs');
      copyFileSync(SCRIPT, copiedValidator);
      copyFileSync(
        resolve(SCRIPT, '..', 'dist', 'analyzer-core.mjs'),
        join(dist, 'analyzer-core.mjs'),
      );
      // Everything the survey path needs EXCEPT its own entrypoint module.
      for (const name of readdirSync(resolve(SCRIPT, '..', 'lib'))) {
        if (name === 'survey-command.mjs') continue;
        copyFileSync(resolve(SCRIPT, '..', 'lib', name), join(lib, name));
      }

      const target = join(tmp, 'screen.pa.yaml');
      writeFileSync(target, warningYaml, 'utf8');
      const legacy = spawnSync('node', [copiedValidator, target, '--json'], {
        encoding: 'utf8',
        stdio: 'pipe',
      });
      expect({ status: legacy.status, stderr: legacy.stderr }).toEqual({ status: 0, stderr: '' });
      expect(JSON.parse(legacy.stdout).reports).toHaveLength(1);

      const survey = spawnSync('node', [copiedValidator, 'survey', tmp, '--report', join(tmp, 'out')], {
        encoding: 'utf8',
        stdio: 'pipe',
      });
      expect(survey.status).toBe(3);
      expect(survey.stdout).toBe('');
      expect(survey.stderr).toContain(
        'survey infrastructure error: unable to load survey modules',
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('rejects unknown flags and using both baseline modes', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'appforge-validate-cli-flags-'));
    try {
      const target = join(tmp, 'screen.pa.yaml');
      const baseline = join(tmp, 'accepted.json');
      writeFileSync(target, warningYaml, 'utf8');

      const unknown = runProcess(target, ['--definitely-not-a-validator-flag']);
      expect(unknown.code).toBe(2);
      expect(unknown.err).toContain('Unknown option: --definitely-not-a-validator-flag');

      const both = runProcess(target, [`--baseline=${baseline}`, '--write-baseline', baseline]);
      expect(both.code).toBe(2);
      expect(both.err).toContain('--baseline and --write-baseline cannot be used together.');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('does not overwrite an existing baseline when --write-baseline matches zero files', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'appforge-validate-cli-zero-match-'));
    try {
      const emptyDir = join(tmp, 'empty');
      const baseline = join(tmp, 'accepted.json');
      const original = '{"consumer_owned":true}\n';
      mkdirSync(emptyDir);
      writeFileSync(baseline, original, 'utf8');

      const result = runProcess(emptyDir, [`--write-baseline=${baseline}`]);
      expect(result.code).toBe(2);
      expect(result.err).toContain('--write-baseline matched zero files; the baseline was not written.');
      expect(readFileSync(baseline, 'utf8')).toBe(original);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('local validate CLI datasource plumbing', () => {
  it.each([
    ['=Accounts', 'Accounts'],
    ['=Möten', 'Möten'],
    ['=Förfrågningar', 'Förfrågningar'],
    ['=Offertrader', 'Offertrader'],
    ['=Artiklar', 'Artiklar'],
    ['=Leveransrader', 'Leveransrader'],
    ['=Kontrollrapporter', 'Kontrollrapporter'],
    ['=Anställda', 'Anställda'],
    ["='Project Tasks'", 'Project Tasks'],
    ["='My-Source'", 'My-Source'],
    ["='My.Source'", 'My.Source'],
    ['=Filter(Accounts, Active = true)', 'Accounts'],
    ['=SortByColumns(Filter(Orders, Status = "Open"), "CreatedOn")', 'Orders'],
    ["=Sort(Search('Project Tasks', txtSearch.Value, Title), CreatedOn)", 'Project Tasks'],
    ["=Sort(SortByColumns(Search(Filter('Project Tasks', a), b, C), \"d\"), e)", 'Project Tasks'],
    ['=LookUp(Möten, x = 1)', 'Möten'],
    ['=FirstN(Artiklar, 10)', 'Artiklar'],
    ['=First(Förfrågningar)', 'Förfrågningar'],
    ['=Last(Offertrader)', 'Offertrader'],
    ['=LastN(Leveransrader, 10)', 'Leveransrader'],
    ['=AddColumns(Kontrollrapporter, Extra, 1)', 'Kontrollrapporter'],
    ['=ShowColumns(Anställda, Name)', 'Anställda'],
    ['=Table({a:1})', null],
    ['=Choices(Accounts.Status)', null],
    ['=colCache', null],
    ['=varSelectedAccounts', null],
    ['=gblOrders', null],
    ['=locSelected', null],
    ['=Global', 'Global'],
    ['=location', 'location'],
    ['=collection', 'collection'],
    ['=[@Accounts]', null],
    ['=Gallery1.AllItems', null],
    ['=ThisItem.Orders', null],
    ['=Office365Users.MyProfileV2()', null],
    ['=Search(Gallery1.AllItems, txt.Value, Title)', null],
    ["='Accounts'Extra", null],
    ['=filter(Accounts, Active = true)', null],
    ['=If(showAll, Accounts, Filter(Accounts, Active))', null],
  ])('matches the worker extraction result for %s', (value, expected) => {
    expect(extractLocalBoundSource(value)).toBe(expected);
    expect(extractLocalBoundSource(value)).toBe(extractWorkerBoundSource(value));
  });

  it('reports a clear error for an invalid --datasources map file', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'appforge-validate-cli-datasources-'));
    const target = join(tmp, 'screen.pa.yaml');
    const datasourceMap = join(tmp, 'datasources.json');

    try {
      writeFileSync(target, `Screens:\n  Main:\n    Children: []\n`);
      writeFileSync(datasourceMap, JSON.stringify({ Accounts: 'oracle' }));

      const result = run(target, ['--datasources', datasourceMap]);

      expect(result.code).toBe(2);
      expect(result.out).toContain("Unable to load --datasources: Invalid datasources value for 'Accounts': 'oracle'.");
      expect(result.out).toContain('Allowed values: dataverse, sharepoint, sql, excel, collection, other.');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('local validate CLI delegation parity', () => {
  const SCREEN = `App:
  OnStart: =false
Screens:
  Visits:
    Children:
      - galVisits:
          Control: Gallery
          Properties:
            Items: =Filter(Möten, txtSearch.Value in Titel)
      - galRecent:
          Control: Gallery
          Properties:
            Items: =FirstN(Möten, 10)
      - galSearch:
          Control: Gallery
          Properties:
            Items: =Search(Möten, txtSearch.Value, Titel)
      - galBlank:
          Control: Gallery
          Properties:
            Items: =Filter(Ordrar, IsBlank(Status))
`;

  function runScreen(datasources?: Record<string, string>) {
    const tmp = mkdtempSync(join(tmpdir(), 'appforge-validate-cli-delegation-'));
    try {
      const target = join(tmp, 'visits.pa.yaml');
      writeFileSync(target, SCREEN, 'utf8');
      const args: string[] = [];
      if (datasources) {
        const mapFile = join(tmp, 'datasources.json');
        writeFileSync(mapFile, JSON.stringify(datasources), 'utf8');
        args.push('--datasources', mapFile);
      }
      const result = run(target, args);
      expect(result.code).toBe(0);
      const reports = JSON.parse(result.out);
      const issues = reports.flatMap((report: any) => report.issues)
        .filter((issue: any) => typeof issue.rule === 'string' && issue.rule.startsWith('delegation-'));
      return { issues, rules: issues.map((issue: any) => issue.rule).sort() };
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }

  it('emits only the source-agnostic core rules with no --datasources map', () => {
    const { issues, rules } = runScreen();
    expect(rules).toEqual(['delegation-firstn-on-source', 'delegation-search-caveat']);
    expect(issues.find((issue: any) => issue.rule === 'delegation-search-caveat').detail)
      .toContain('matches none of the known variable prefixes (col, var, gbl, loc)');
  });

  it('sharpens into source-specific rules with a --datasources map, preserving the Swedish name', () => {
    const { issues, rules } = runScreen({ 'Möten': 'sharepoint', Ordrar: 'sql' });
    expect(rules).toEqual([
      'delegation-firstn-on-source',
      'delegation-sharepoint-in',
      'delegation-sharepoint-search',
      'delegation-sql-isblank',
    ]);
    expect(issues.find((issue: any) => issue.rule === 'delegation-sharepoint-in').detail).toContain("'Möten'");
    expect(issues.every((issue: any) => issue.level === 'WARN')).toBe(true);
  });

  it('excludes collection-mapped names from every delegation rule', () => {
    const { rules } = runScreen({ 'Möten': 'collection', Ordrar: 'collection' });
    expect(rules).toEqual([]);
  });

  it('keeps the Search caveat for a source a partial map does not cover', () => {
    // Ordrar is mapped, Möten is not — the caveat must survive for Möten.
    const { issues, rules } = runScreen({ Ordrar: 'sql' });
    expect(rules).toEqual([
      'delegation-firstn-on-source',
      'delegation-search-caveat',
      'delegation-sql-isblank',
    ]);
    // Same caveat wording as the worker: the SQL IsBlank claim is unverified.
    expect(issues.find((issue: any) => issue.rule === 'delegation-sql-isblank').detail)
      .toContain('unverified and queued for tenant verification');
  });
});

describe('local validate CLI no-false-WARN parity', () => {
  // Preserve v2.4's false-positive fixes (2, 3, 5, 6). R2 separately observes
  // possible source truncation even when ForAll writes only to a collection.
  const CORRECT = `Screens:
  Correct:
    Children:
      - lblHelp:
          Control: Label
          Properties:
            Text: ="Use Search(Products, x) to search"
      - btnFlatten:
          Control: Classic/Button
          Properties:
            OnSelect: =ForAll(Bokningar, Collect(colFlat, ThisRecord))
      - galInOut:
          Control: Gallery
          Properties:
            Items: |-
              =Filter(
                Filter(Anstallda, Created > DateAdd(Today(), -30, Days)),
                Lower(Title) = Lower(txtSearch.Text)
              )
      - galValuePosition:
          Control: Gallery
          Properties:
            Items: =Filter(Anstallda, StartsWith(Title, Trim(SearchText)))
      - galComment:
          Control: Gallery
          Properties:
            Items: |-
              =Filter(
                Anstallda,   // only the ones in scope
                Klar = true
              )
      - galTopN:
          Control: Gallery
          Properties:
            Items: =FirstN(Sort(Filter(Anstallda, Klar = true), Created), 10)
`;

  it('preserves the old guards while reporting source truncation, mapped and unmapped', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'appforge-validate-cli-nofalse-'));
    try {
      const target = join(tmp, 'correct.pa.yaml');
      writeFileSync(target, CORRECT, 'utf8');
      const mapFile = join(tmp, 'datasources.json');
      writeFileSync(mapFile, JSON.stringify({ Anstallda: 'sharepoint', Bokningar: 'dataverse' }), 'utf8');

      for (const args of [[], ['--datasources', mapFile]]) {
        const result = run(target, args);
        expect(result.code).toBe(0);
        const issues = JSON.parse(result.out).flatMap((report: any) => report.issues)
          .filter((issue: any) => typeof issue.rule === 'string'
            && (issue.rule.startsWith('delegation-') || issue.rule.startsWith('perf-')));
        expect(issues.map((issue: any) => issue.rule)).toEqual(['delegation-forall-truncation']);
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('local validate CLI accessibility parity', () => {
  const A11Y_FINDINGS = `Screens:
  Accessibility:
    Children:
      - imgAction:
          Control: Image@2.2.3
          Properties:
            OnSelect: =Set(gblOpen, true)
            TabIndex: =3
      - lblMouseOnly:
          Control: Label@2.5.1
          Properties:
            Text: ="Open"
            Wrap: =false
            OnSelect: =Set(gblOpen, true)
            TabIndex: =-1
      - txtName:
          Control: TextInput@0.0.54
          Properties:
            AccessibleLabel:
      - dateStart:
          Control: DatePicker@0.0.46
          Properties:
            AccessibleLabel: ="   "
`;

  const A11Y_CLEAN = `Screens:
  Accessibility:
    Children:
      - btnSave:
          Control: Button@0.0.45
          Properties:
            OnSelect: =Set(gblSaved, true)
      - imgDecoration:
          Control: Image@2.2.3
          Properties:
            AccessibleLabel: =""
            TabIndex: =-1
      - imgFormulaTab:
          Control: Image@2.2.3
          Properties:
            AccessibleLabel: ="Open"
            OnSelect: =Set(gblOpen, true)
            TabIndex: =gblTabIndex
      - imgSelectParent:
          Control: Image@2.2.3
          Properties:
            OnSelect: = Select ( Parent )
      - imgSelectParentSemi:
          Control: Image@2.2.3
          Properties:
            OnSelect: =Select(Parent);
      - imgTrue:
          Control: Image@2.2.3
          Properties:
            OnSelect: =true
      - lblAction:
          Control: Label@2.5.1
          Properties:
            Text: ="Open"
            Wrap: =false
            OnSelect: =Set(gblOpen, true)
            TabIndex: =0
      - modernAction:
          Control: ModernIcon@1.0.0
          Properties:
            AccessibleLabel: ="Open"
            OnSelect: =Set(gblOpen, true)
      - txtName:
          Control: TextInput@0.0.54
          Properties:
            AccessibleLabel: ="Customer name"
`;

  function runFixture(content: string) {
    const tmp = mkdtempSync(join(tmpdir(), 'appforge-validate-cli-a11y-'));
    try {
      // Deliberately use the bundled-template extension, not .pa.yaml: the v2.4.3
      // sweep must exercise knowledge/templates/*.yaml directly.
      const target = join(tmp, 'accessibility.yaml');
      writeFileSync(target, content, 'utf8');
      const result = run(target);
      const reports = JSON.parse(result.out);
      expect(reports).toHaveLength(1);
      return { result, report: reports[0] };
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }

  function runA11y(content: string) {
    const { result, report } = runFixture(content);
    expect(result.code).toBe(0);
    return report.issues.filter((issue: any) => issue.rule?.startsWith('a11y-'));
  }

  it('emits all four rules as WARN and aggregates two inputs into one issue', () => {
    const issues = runA11y(A11Y_FINDINGS);
    expect(issues.map((issue: any) => issue.rule).sort()).toEqual([
      'a11y-icon-button-no-label',
      'a11y-inputs-missing-accessiblelabel',
      'a11y-interactive-not-focusable',
      'a11y-tabindex-positive',
    ]);
    expect(issues.every((issue: any) => issue.level === 'WARN')).toBe(true);
    const aggregate = issues.find((issue: any) => issue.rule === 'a11y-inputs-missing-accessiblelabel');
    expect(aggregate.detail).toContain('2 control(s)');
    expect(aggregate.detail).toContain('txtName, dateStart');
    expect(aggregate.controls).toEqual(['txtName', 'dateStart']);
    expect(issues.find((issue: any) => issue.rule === 'a11y-tabindex-positive'))
      .not.toHaveProperty('controls');
  });

  it('caps aggregate accessibility prose at five names but carries all six controls at the boundary', () => {
    const yaml = `Screens:
  Main:
    Children:
${Array.from({ length: 6 }, (_, index) => `      - txt${index + 1}:
          Control: TextInput
          Properties:
            AccessibleLabel:
`).join('')}`;
    const aggregate = runA11y(yaml).find((issue: any) =>
      issue.rule === 'a11y-inputs-missing-accessiblelabel');

    expect(aggregate.detail).toContain('6 control(s)');
    expect(aggregate.detail).toContain('txt1, txt2, txt3, txt4, txt5, …');
    expect(aggregate.detail).not.toContain('txt6');
    expect(aggregate.controls).toEqual(['txt1', 'txt2', 'txt3', 'txt4', 'txt5', 'txt6']);
  });

  it('keeps every exemption and the clean real-app shape silent', () => {
    expect(runA11y(A11Y_CLEAN)).toEqual([]);
  });

  it('aggregates version-pin disclosure once per analyzed app', () => {
    const pinned = `Screens:
  Main:
    Children:
${Array.from({ length: 7 }, (_, index) => `      - btnPinned${index + 1}:
          Control: Button@${index + 1}.0.0
          Properties:
            OnSelect: =true
`).join('')}`;
    const { result, report } = runFixture(pinned);
    expect(result.code).toBe(0);
    const issues = report.issues.filter((issue: any) => issue.rule === 'version-pin-in-control-type');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ level: 'WARN', control: 'btnPinned1' });
    expect(issues[0].detail).toContain('7 control type(s) carry @version pins');
    expect(issues[0].detail).toContain('observed, not judged: a suffix alone establishes neither lag nor incompatibility');
    expect(issues[0].detail).toContain('version-lag inventory for evidence-backed migrations');
    expect(issues[0].detail).toContain('Pinned: btnPinned1, btnPinned2, btnPinned3, btnPinned4, btnPinned5, …');
    expect(issues[0].detail).not.toContain('mark staleness');
    expect(issues[0].controls).toEqual([
      'btnPinned1', 'btnPinned2', 'btnPinned3', 'btnPinned4', 'btnPinned5', 'btnPinned6', 'btnPinned7',
    ]);
    expect(Object.keys(issues[0])).toEqual([
      'level', 'line', 'control', 'type', 'rule', 'detail', 'controls',
    ]);
    expect(issues[0]).not.toHaveProperty('authoredTypePinned');
  });

  it('normalizes only non-empty pin bases and REFUSEs the ghost type', () => {
    const yaml = `Screens:
  Main:
    Children:
      - ghost:
          Control: @1.0.0
      - emptyPin:
          Control: Button@
      - textPin:
          Control: Button@abc
      - classicPin:
          Control: Classic/TextInput@2.3.2
          Properties:
            AccessibleLabel: ="Name"
`;
    const { result, report } = runFixture(yaml);
    expect(result.code).toBe(1);
    expect(report.summary.controls_seen).toBe(4);
    expect(report.summary.refuse).toBe(1);
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ level: 'REFUSE', control: 'ghost', type: '@1.0.0', detail: 'control-type-not-in-manifest' }),
      expect.objectContaining({ level: 'WARN', rule: 'version-pin-in-control-type' }),
    ]));
    expect(JSON.stringify(report)).not.toContain('authoredTypePinned');
  });

  it('checks every duplicate TabIndex property alongside duplicate-property REFUSE', () => {
    const yaml = `Screens:
  Main:
    Children:
      - lblDuplicate:
          Control: Label
          Properties:
            Text: ="Order"
            Wrap: =false
            TabIndex: =0
            TabIndex: =3
`;
    const { result, report } = runFixture(yaml);
    expect(result.code).toBe(1);
    expect(report.issues.filter((issue: any) => issue.rule === 'a11y-tabindex-positive')).toHaveLength(1);
    expect(report.issues.find((issue: any) => issue.rule === 'a11y-tabindex-positive').detail)
      .toContain('TabIndex 3');
    expect(report.issues.filter((issue: any) => issue.rule === 'duplicate-property')).toHaveLength(1);
    expect(report.issues.find((issue: any) => issue.rule === 'duplicate-property').level).toBe('REFUSE');
  });

  it('skips TabIndex lint on component definitions and CanvasComponent instances', () => {
    const yaml = `ComponentDefinitions:
  cStepper:
    DefinitionType: CanvasComponent
    CustomProperties:
      TabIndex:
        PropertyKind: Input
        DataType: Number
        Default: =3
    Properties:
      TabIndex: =3
Screens:
  Main:
    Children:
      - cmpStepper:
          Control: CanvasComponent
          ComponentName: cStepper
          Properties:
            TabIndex: =3
`;
    const { result, report } = runFixture(yaml);
    expect(result.code).toBe(0);
    expect(report.issues.filter((issue: any) => issue.rule === 'a11y-tabindex-positive')).toEqual([]);
  });

  it('accepts component host-layout properties without weakening custom or definition warnings', () => {
    const yaml = `ComponentDefinitions:
  cHostLayout:
    DefinitionType: CanvasComponent
    CustomProperties:
      DeclaredInput:
        PropertyKind: Input
        DataType: Number
        Default: =0
    Properties:
      AlignInContainer: =AlignInContainer.Stretch
Screens:
  Main:
    Children:
      - cmpHostLayout:
          Control: CanvasComponent
          ComponentName: cHostLayout
          Properties:
            AlignInContainer: =AlignInContainer.Stretch
            FillPortions: =1
            LayoutMinHeight: =40
            LayoutMinWidth: =80
            UndeclaredInput: =1
`;
    const { result, report } = runFixture(yaml);
    expect(result.code).toBe(0);
    expect(report.issues.filter((issue: any) => issue.rule === 'component-custom-property')
      .map((issue: any) => issue.property)).toEqual(['UndeclaredInput']);
    expect(report.issues).toContainEqual(expect.objectContaining({
      control: 'cHostLayout', property: 'AlignInContainer', rule: 'component-root-property', level: 'WARN',
    }));
  });

  it('accepts declared custom properties named AlignInContainer and FillPortions', () => {
    const yaml = `ComponentDefinitions:
  cNamedLikeHostProps:
    DefinitionType: CanvasComponent
    CustomProperties:
      AlignInContainer:
        PropertyKind: Input
        DataType: Text
        Default: ="Stretch"
      FillPortions:
        PropertyKind: Input
        DataType: Number
        Default: =1
    Properties:
      AlignInContainer: =cNamedLikeHostProps.AlignInContainer
      FillPortions: =cNamedLikeHostProps.FillPortions
Screens:
  Main:
    Children:
      - cmpNamedLikeHostProps:
          Control: CanvasComponent
          ComponentName: cNamedLikeHostProps
          Properties:
            AlignInContainer: ="Stretch"
            FillPortions: =1
`;
    const { result, report } = runFixture(yaml);

    expect(result.code).toBe(0);
    expect(report.issues.filter((issue: any) =>
      ['component-root-property', 'component-custom-property'].includes(issue.rule))).toEqual([]);
  });

  it('sweeps all 11 bundled templates as explicit paths with adjudicated WARN counts', () => {
    const templateFiles = readdirSync(TEMPLATES).filter(file => file.endsWith('.yaml')).sort();
    const result = runTargets(templateFiles.map(file => join(TEMPLATES, file)));
    expect(result.code).toBe(0);
    const reports = JSON.parse(result.out);
    expect(reports).toHaveLength(11);
    expect(reports.reduce((total: number, report: any) => total + report.summary.refuse, 0)).toBe(0);
    const issues = reports.flatMap((report: any) => report.issues);
    expect(issues.filter((issue: any) => issue.rule?.startsWith('a11y-'))).toEqual([]);
    expect(issues.filter((issue: any) => issue.rule === 'version-pin-in-control-type')).toHaveLength(1);
    const centralizationRules = new Set([
      'duplicate-formula', 'duplicate-formula-in-gallery', 'repeated-color-literal', 'heavy-onstart',
    ]);
    expect(issues.filter((issue: any) => centralizationRules.has(issue.rule))).toHaveLength(40);
  });
});

describe('local validate CLI performance parity', () => {
  function runDir(files: Record<string, string>) {
    const tmp = mkdtempSync(join(tmpdir(), 'appforge-validate-cli-perf-'));
    const target = join(tmp, 'app');
    mkdirSync(target);
    try {
      for (const [name, content] of Object.entries(files)) writeFileSync(join(target, name), content, 'utf8');
      const result = run(target);
      expect(result.code).toBe(0);
      const reports = JSON.parse(result.out);
      const issues = reports.flatMap((report: any) => report.issues)
        .filter((issue: any) => typeof issue.rule === 'string'
          && (issue.rule.startsWith('perf-') || issue.rule === 'heavy-onstart'));
      return { issues, rules: issues.map((issue: any) => issue.rule).sort() };
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }

  // Canonical compile-path App shape: properties nested under `Properties:`.
  const HOME = `App:
  Properties:
    OnStart: |-
      =ClearCollect(colA, Anställda); ClearCollect(colB, Möten); Collect(colC, Chefer)
Screens:
  HomeScreen:
    Children:
      - galEmployees:
          Control: Gallery
          Properties:
            Items: =Anställda
          Children:
            - grpRow:
                Control: GroupContainer
                Children:
                  - lblManager:
                      Control: Label
                      Properties:
                        Text: =LookUp(Chefer, Nummer = ThisItem.ChefNummer, Namn)
`;

  const DETAIL = `Screens:
  DetailScreen:
    Children:
      - lblEcho:
          Control: Label
          Properties:
            Text: =lblManager.Text
`;

  it('emits the gallery N+1, missing-Concurrent and cross-screen findings as WARN', () => {
    const { issues, rules } = runDir({ 'home.pa.yaml': HOME, 'detail.pa.yaml': DETAIL });

    expect(rules).toEqual([
      'perf-cross-screen-reference',
      'perf-lookup-in-gallery-template',
      'perf-onstart-no-concurrent',
    ]);
    expect(issues.every((issue: any) => issue.level === 'WARN')).toBe(true);
    expect(issues.find((issue: any) => issue.rule === 'perf-lookup-in-gallery-template').detail).toContain("'Chefer'");
    expect(issues.find((issue: any) => issue.rule === 'perf-cross-screen-reference').detail).toContain('lblManager');
  });

  it('keeps a same-screen reference, a Concurrent OnStart and an outside-gallery LookUp silent', () => {
    const { rules } = runDir({
      'clean.pa.yaml': `App:
  OnStart: |-
    =Concurrent(ClearCollect(colA, Anställda), ClearCollect(colB, Möten), ClearCollect(colC, Chefer))
Screens:
  CleanScreen:
    Children:
      - lblManager:
          Control: Label
          Properties:
            Text: =LookUp(Chefer, Nummer = 1, Namn)
      - lblEcho:
          Control: Label
          Properties:
            Text: =lblManager.Text
`,
    });

    expect(rules).toEqual([]);
  });

  it('does not resolve the App pseudo-object as a cross-screen control in the bundled core', () => {
    const { rules } = runDir({
      'app.pa.yaml': `App:
  Properties:
    StartScreen: =MainScreen
`,
      'main.pa.yaml': `Screens:
  MainScreen:
    Children:
      - galNavigation:
          Control: Gallery
          Properties:
            Items: |-
              =Table({ PageNavigation: App.ActiveScreen })
`,
    });

    expect(rules).toEqual([]);
  });

  it('merges a heavy serial-loading OnStart into one heavy-onstart warning', () => {
    const { issues, rules } = runDir({
      'heavy.pa.yaml': `App:
  OnStart: |-
    =ClearCollect(colA, Accounts); ClearCollect(colB, Orders); Collect(colC, People); Set(gblReady, true); Set(gblMode, "ready")
Screens:
  Main:
    Children: []
`,
    });

    expect(rules).toEqual(['heavy-onstart']);
    expect(issues).toHaveLength(1);
    expect(issues[0].detail).toContain('5 statements');
    expect(issues[0].detail).toContain('3 collections serially');
    expect(issues[0].detail).toContain('Concurrent()');
  });

  it('treats a comment naming another screen\'s control as inert (Fix 11)', () => {
    const { rules } = runDir({
      'home.pa.yaml': `Screens:
  HomeScreen:
    Children:
      - lblManager:
          Control: Label
          Properties:
            Text: ="Chef"
`,
      'detail.pa.yaml': `Screens:
  DetailScreen:
    Children:
      - lblEcho:
          Control: Label
          Properties:
            Text: |-
              ="Detalj"   // mirrors lblManager.Text from the home screen
`,
    });

    expect(rules).toEqual([]);
  });

  it('fires the control budget one control past 300 and stays silent at 300', () => {
    const labels = (count: number) => Array.from({ length: count }, (_, i) => `      - lbl${i}:
          Control: Label
          Properties:
            Text: ="x"`).join('\n');
    const budgetScreen = (count: number) => `Screens:
  BudgetScreen:
    Children:
${labels(count)}
`;

    expect(runDir({ 'budget.pa.yaml': budgetScreen(300) }).rules).toEqual([]);

    const over = runDir({ 'budget.pa.yaml': budgetScreen(301) });
    expect(over.rules).toEqual(['perf-control-budget']);
    expect(over.issues[0].detail).toContain('301');
  });

  it('strips rule-declared evidence from the CLI --json output (adapter boundary)', () => {
    // perf-control-budget attaches threshold evidence in core/lint.ts; the CLI
    // adapter (validate.mjs) must strip it before serialization so --json bytes
    // stay stable, the same way src/tools/validator.ts strips it for the worker.
    const labels = (count: number) => Array.from({ length: count }, (_, i) => `      - lbl${i}:
          Control: Label
          Properties:
            Text: ="x"`).join('\n');
    const budgetScreen = (count: number) => `Screens:
  BudgetScreen:
    Children:
${labels(count)}
`;
    const tmp = mkdtempSync(join(tmpdir(), 'appforge-validate-cli-evidence-'));
    const target = join(tmp, 'app');
    mkdirSync(target);
    try {
      writeFileSync(join(target, 'budget.pa.yaml'), budgetScreen(301), 'utf8');
      const result = run(target);
      expect(result.code).toBe(0);
      expect(result.out).not.toContain('"evidence"');
      const reports = JSON.parse(result.out);
      const budgetIssue = reports
        .flatMap((report: any) => report.issues)
        .find((issue: any) => issue.rule === 'perf-control-budget');
      expect(budgetIssue).toBeTruthy();
      expect(budgetIssue).not.toHaveProperty('evidence');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('strips evidence on the documented programmatic API too (validateYaml/validateCliFiles re-exports)', () => {
    // PIPELINE.md §Programmatic (library) documents:
    //   import { loadCatalog, validateYaml } from './cli/validate.mjs';
    //   const result = validateYaml(yamlText, catalog);
    // Both validateYaml and validateCliFiles are re-exported straight from the
    // core artifact (validate.mjs's own destructure/re-export block) — they
    // don't pass through main()'s allReports, so they must be proven
    // independently: they resolve through toLegacyCliReports in
    // src/core/compatibility.ts, the shared choke point, which is where the
    // strip actually lives.
    const labels = (count: number) => Array.from({ length: count }, (_, i) => `      - lbl${i}:
          Control: Label
          Properties:
            Text: ="x"`).join('\n');
    const budgetYaml = `Screens:
  BudgetScreen:
    Children:
${labels(301)}
`;
    const tmp = mkdtempSync(join(tmpdir(), 'appforge-validate-cli-programmatic-'));
    const runnerScript = join(tmp, 'runner.mjs');
    try {
      const scriptUrl = pathToFileURL(SCRIPT).href;
      writeFileSync(runnerScript, `
import { loadCatalog, validateYaml, validateCliFiles } from ${JSON.stringify(scriptUrl)};
const catalog = loadCatalog();
const yamlText = ${JSON.stringify(budgetYaml)};
const yamlResult = validateYaml(yamlText, catalog);
const cliResult = validateCliFiles([{ name: 'a.pa.yaml', content: yamlText }]);
process.stdout.write(JSON.stringify({ yamlResult, cliResult }));
`, 'utf8');
      const out = execFileSync('node', [runnerScript], { encoding: 'utf8', stdio: 'pipe' });
      expect(out).not.toContain('"evidence"');
      const { yamlResult, cliResult } = JSON.parse(out);
      const yamlIssue = yamlResult.issues.find((issue: any) => issue.rule === 'perf-control-budget');
      expect(yamlIssue).toBeTruthy();
      expect(yamlIssue).not.toHaveProperty('evidence');
      const cliIssue = cliResult
        .flatMap((report: any) => report.issues)
        .find((issue: any) => issue.rule === 'perf-control-budget');
      expect(cliIssue).toBeTruthy();
      expect(cliIssue).not.toHaveProperty('evidence');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('uses authored Screens roots inside one file for budgets and cross-screen resolution', () => {
    const labels = (prefix: string, count: number) => Array.from({ length: count }, (_, i) => `      - ${prefix}${i}:
          Control: Label`).join('\n');
    const { issues, rules } = runDir({
      'combined.pa.yaml': `Screens:
  FirstScreen:
    Children:
${labels('first', 200)}
  SecondScreen:
    Children:
${labels('second', 199)}
      - secondEcho:
          Control: Label
          Properties:
            Text: =first0.Text
`,
    });

    expect(rules).toEqual(['perf-cross-screen-reference']);
    expect(issues.find((issue: any) => issue.rule === 'perf-control-budget')).toBeUndefined();
    expect(issues[0].detail).toContain('FirstScreen');
  });
});

describe('local validate CLI centralization smoke', () => {
  it('counts a cross-file formula batch, gallery occurrence, and five-statement OnStart as WARN-only', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'appforge-validate-cli-'));
    const target = join(tmp, 'warnings');
    mkdirSync(target);

    try {
      writeFileSync(join(target, 'first.pa.yaml'), `App:
  OnError: =false
  OnStart: |-
    =Set(a, 1); Set(b, 2); Set(c, 3); Set(d, 4); Set(e, 5)
Screens:
  First:
    Children:
      - galOrders:
          Control: Gallery
          Properties:
            AccessibleLabel: ="Orders"
          Children:
            - lblGallery:
                Control: Label
                Properties:
                  Text: |-
                    =If(ThisItem.Status = "Open", "Active", "Closed")
      - lblOutside:
          Control: Label
          Properties:
            Text: '=If(ThisItem.Status = "Open", "Active", "Closed")'
`);
      writeFileSync(join(target, 'second.pa.yaml'), `Screens:
  Second:
    Children:
      - lblOther:
          Control: Label
          Properties:
            Text: =If(ThisItem.Status = "Open", "Active", "Closed") # same formula
`);

      const result = run(target);

      expect(result.code).toBe(0);
      expect(result.out).toContain('duplicate-formula');
      expect(result.out).toContain('heavy-onstart');
      const reports = JSON.parse(result.out);
      const issues = reports.flatMap((report: any) => report.issues);
      expect(issues.filter((issue: any) => issue.rule === 'duplicate-formula')).toHaveLength(1);
      expect(issues.find((issue: any) => issue.rule === 'duplicate-formula')?.detail).toContain('appears 3×');
      expect(issues.filter((issue: any) => issue.rule === 'heavy-onstart')).toHaveLength(1);
      expect(issues.find((issue: any) => issue.rule === 'heavy-onstart')?.detail).toContain('5 statements');
      expect(issues.filter((issue: any) => issue.rule === 'yaml-inline-comment-after-formula')).toHaveLength(1);
      expect(reports.reduce((total: number, report: any) => total + report.summary.warn, 0)).toBe(3);
      expect(reports.reduce((total: number, report: any) => total + report.summary.refuse, 0)).toBe(0);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('keeps a clean directory free of centralization warnings', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'appforge-validate-cli-clean-'));

    try {
      writeFileSync(join(tmp, 'clean.pa.yaml'), `App:
  OnError: =false
  OnStart: |-
    =Set(a, 1); Set(b, 2); Set(c, 3); Set(d, 4)
Screens:
  Main:
    Children:
      - lblTitle:
          Control: Label
          Properties:
            Text: =Parent.Width + Parent.Height
      - lblSubtitle:
          Control: Label
          Properties:
            Text: =Parent.Width + Parent.Height
      - lblFooter:
          Control: Label
          Properties:
            Text: =Parent.Width + Parent.Height
`);

      const result = run(tmp);

      expect(result.code).toBe(0);
      const reports = JSON.parse(result.out);
      const centralizationRules = new Set([
        'duplicate-formula',
        'duplicate-formula-in-gallery',
        'repeated-color-literal',
        'heavy-onstart',
      ]);
      expect(reports.flatMap((report: any) => report.issues)
        .filter((issue: any) => centralizationRules.has(issue.rule))).toEqual([]);
      expect(reports.reduce((total: number, report: any) => total + report.summary.warn, 0)).toBe(0);
      expect(reports.reduce((total: number, report: any) => total + report.summary.refuse, 0)).toBe(0);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
