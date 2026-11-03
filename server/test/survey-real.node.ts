import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ANALYZER_CATALOG_ALLOWLIST } from '../src/lib/survey';
import { assertEmittableBaseline } from '../src/core/survey/baseline-input';
import { assertEmittableReport } from '../src/core/survey/emittable-report';
import { decodeCanonicalEnvelope } from '../src/core/survey/validate-envelope';
import { assertValidReport } from '../src/core/survey/validate-report';

const SCRIPT = resolve(
  __dirname,
  '..',
  '..',
  'cli',
  'validate.mjs',
);
const REPO = resolve(__dirname, '..', '..');
const REAL_MSAPP = process.env.APPFORGE_REAL_MSAPP;
const REAL_SOLUTION = process.env.APPFORGE_REAL_SOLUTION;
const REAL_SOLUTION_APP = process.env.APPFORGE_REAL_SOLUTION_APP;
const REQUIRE_REAL = process.env.APPFORGE_REQUIRE_REAL_SURVEY === '1';
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function bytesHash(pathValue: string) {
  try {
    return createHash('sha256').update(readFileSync(pathValue)).digest('hex');
  } catch {
    throw new Error('[real-survey][REDACTED] unable to hash configured input');
  }
}

function repoContentHash() {
  const result = spawnSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], {
    cwd: REPO,
    encoding: 'buffer',
    stdio: 'pipe',
  });
  if (result.status !== 0) throw new Error('[real-survey][REDACTED] unable to inspect repo bytes');
  const digest = createHash('sha256');
  const paths = result.stdout.toString('utf8').split('\0').filter(Boolean).sort();
  try {
    for (const relativePath of paths) {
      const pathBytes = Buffer.from(relativePath, 'utf8');
      const absolutePath = join(REPO, relativePath);
      const stat = lstatSync(absolutePath);
      const body = stat.isFile()
        ? readFileSync(absolutePath)
        : stat.isSymbolicLink()
          ? Buffer.from(readlinkSync(absolutePath), 'utf8')
          : Buffer.from(`mode:${stat.mode}`);
      const length = Buffer.alloc(8);
      length.writeBigUInt64BE(BigInt(pathBytes.length));
      digest.update(length).update(pathBytes).update(body);
    }
  } catch {
    throw new Error('[real-survey][REDACTED] unable to hash repo bytes');
  }
  return digest.digest('hex');
}

function configured(value: string | undefined, name: string) {
  if (value === undefined || !existsSync(value)) {
    throw new Error(`[real-survey][REDACTED] ${name} is not a configured existing file`);
  }
  return value;
}

function runReal(kind: 'msapp' | 'solution', targetValue: string, app?: string) {
  const root = mkdtempSync(join(tmpdir(), 'survey-real-'));
  roots.push(root);
  const cwd = join(root, 'cwd');
  const reportDir = join(root, 'output');
  mkdirSync(cwd);
  const targetBefore = bytesHash(targetValue);
  const repoBefore = repoContentHash();
  const args = [
    SCRIPT, 'survey', targetValue, '--report', reportDir, '--write-baseline', '--json',
  ];
  if (app !== undefined) args.push('--app', app);
  const result = spawnSync('node', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
  if (result.status !== 0) {
    throw new Error(
      `[real-survey][REDACTED] ${kind} CLI failed status=${result.status} `
      + `stdout_nonempty=${result.stdout.length > 0} stderr_nonempty=${result.stderr.length > 0}`,
    );
  }

  let report: Record<string, any>;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    throw new Error(`[real-survey][REDACTED] ${kind} stdout was not JSON`);
  }
  const reportPath = join(reportDir, 'analysis-report.json');
  const envelopePath = typeof report.envelope?.path === 'string' ? report.envelope.path : '';
  let gates = false;
  try {
    const envelope = decodeCanonicalEnvelope(
      readFileSync(envelopePath),
      ANALYZER_CATALOG_ALLOWLIST,
    );
    assertValidReport(report);
    assertEmittableReport(report, { surface: 'cli', envelope });
    const baseline = JSON.parse(readFileSync(join(reportDir, 'analysis-baseline.json'), 'utf8'));
    assertEmittableBaseline(baseline);
    gates = true;
  } catch {
    throw new Error(`[real-survey][REDACTED] ${kind} artifact gate failed`);
  }
  const checks = {
    source_kind: report.identity?.source_kind === kind,
    files_nonzero: Number(report.gate?.summary?.files) > 0,
    roots_nonzero: Number(report.gate?.summary?.controls_seen) > 0,
    report_exists: existsSync(reportPath),
    markdown_exists: existsSync(join(reportDir, 'report-technical.md')),
    baseline_exists: existsSync(join(reportDir, 'analysis-baseline.json')),
    envelope_exists: envelopePath.length > 0 && existsSync(envelopePath),
    gates,
    stdout_exact: existsSync(reportPath) && readFileSync(reportPath, 'utf8') === result.stdout,
    stderr_empty: result.stderr.length === 0,
    target_unchanged: bytesHash(targetValue) === targetBefore,
    repo_unchanged: repoContentHash() === repoBefore,
  };
  expect(checks).toEqual(Object.fromEntries(Object.keys(checks).map(key => [key, true])));
  console.log(`[real-survey][REDACTED] ${kind} ${JSON.stringify({
    source_kind: kind,
    files_nonzero: checks.files_nonzero,
    roots_nonzero: checks.roots_nonzero,
    artifacts: 4,
  })}`);
}

describe('real survey CLI gate status', () => {
  it('reports only configured/skipped state', () => {
    if (REQUIRE_REAL && (REAL_MSAPP === undefined || REAL_SOLUTION === undefined)) {
      throw new Error('[real-survey][REDACTED] required real survey inputs are not configured');
    }
    console.log(`[real-survey][REDACTED] gate-state ${JSON.stringify({
      msapp: REAL_MSAPP === undefined ? 'EXPERIMENTAL-skipped' : 'configured',
      solution: REAL_SOLUTION === undefined ? 'EXPERIMENTAL-skipped' : 'configured',
      solution_app_selector_configured: REAL_SOLUTION_APP !== undefined,
      required: REQUIRE_REAL,
    })}`);
  });
});

describe.skipIf(REAL_MSAPP === undefined)('real msapp survey CLI', () => {
  it('writes only to fresh output and leaves target/repo state unchanged', () => {
    runReal('msapp', configured(REAL_MSAPP, 'APPFORGE_REAL_MSAPP'));
  });
});

describe.skipIf(REAL_SOLUTION === undefined)('real solution survey CLI', () => {
  it('writes only to fresh output and leaves target/repo state unchanged', () => {
    runReal(
      'solution',
      configured(REAL_SOLUTION, 'APPFORGE_REAL_SOLUTION'),
      REAL_SOLUTION_APP,
    );
  });
});

describe('real-gate failure redaction', () => {
  it('does not expose captured target/app/file/control/datasource vocabulary on sabotage', () => {
    const root = mkdtempSync(join(tmpdir(), 'survey-real-redaction-'));
    roots.push(root);
    const poison = [
      'KundSökvägHemlig',
      'HemligApp',
      'HemligFil',
      'HemligKontroll',
      'HemligDatakälla',
    ];
    const target = join(root, poison[0], poison[1]);
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, `${poison[2]}.pa.yaml`), `Screens:\n  Main:\n    Children:\n      - ${poison[3]}:\n          Control: Gallery\n          Properties:\n            AccessibleLabel: ="safe"\n            Items: =Filter(${poison[4]}, ID > 0)\n`);
    const datasources = join(root, 'datasources.json');
    writeFileSync(datasources, JSON.stringify({ [poison[4]]: 'sharepoint' }));
    const reportDir = join(root, 'output');
    mkdirSync(reportDir);
    writeFileSync(
      join(reportDir, '.appforge-survey-journal-b0000000-0000-4000-8000-000000000000.json'),
      '{malformed',
    );

    const result = spawnSync('node', [
      SCRIPT,
      'survey',
      target,
      '--datasources',
      datasources,
      '--report',
      reportDir,
    ], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
    const captured = `${result.stdout}${result.stderr}`;
    expect(result.status).toBe(3);
    expect(poison.some(value => captured.includes(value))).toBe(false);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('recovery journal');
  });
});
