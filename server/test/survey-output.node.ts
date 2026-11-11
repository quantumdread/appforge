import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  cpSync,
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
import { isAbsolute, join, parse, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createAnalysisBaseline,
  replaceSubmissionReport,
  SurveyOutputError,
  resolveSurveyReportDirectory,
  writeSurveyArtifacts,
} from '../../cli/lib/survey-output.mjs';
import {
  ANALYZER_CATALOG_ALLOWLIST,
  analyzeSurveyFiles,
} from '../src/lib/survey';
import { buildReport } from '../src/core/survey/build-report';
import { buildEnvelope, serializeEnvelope } from '../src/core/survey/envelope';
import { assertEmittableBaseline } from '../src/core/survey/baseline-input';
import { assertEmittableReport } from '../src/core/survey/emittable-report';
import { renderTechnical } from '../src/core/survey/render-technical';
import {
  assertValidEnvelope,
  decodeCanonicalEnvelope,
} from '../src/core/survey/validate-envelope';
import { assertValidReport } from '../src/core/survey/validate-report';

const NOW = '2026-08-30T08:00:00.000Z';
const SCREEN = `Screens:\n  Main:\n    Children:\n      - lblOne:\n          Control: Text\n          Properties:\n            Text: ="hello"\n`;
const REPORT_ID = '10000000-0000-4000-8000-000000000001';
const ENVELOPE_A = '20000000-0000-4000-8000-000000000001';
const ENVELOPE_B = '20000000-0000-4000-8000-000000000002';
const ENVELOPE_C = '20000000-0000-4000-8000-000000000003';
const outputCore = {
  assertEmittableBaseline,
  assertEmittableReport,
  assertValidEnvelope,
  assertValidReport,
  decodeCanonicalEnvelope,
  renderTechnical,
  serializeEnvelope,
};

let root: string;
let project: string;
let outside: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'survey-output-'));
  project = join(root, 'Project');
  outside = join(root, 'Project-report');
  mkdirSync(project);
  mkdirSync(outside);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('survey output path boundary', () => {
  it('accepts a sibling-prefix directory but rejects explicit containment segment-safely', () => {
    expect(resolveSurveyReportDirectory({
      target: project,
      reportValue: outside,
      cwd: root,
    })).toBe(realpathSync.native(outside));

    expect(() => resolveSurveyReportDirectory({
      target: project,
      reportValue: join(project, 'reports'),
      cwd: root,
    })).toThrow(SurveyOutputError);
  });

  it('requires an explicit outside report for a conflicting implicit default, including roots', () => {
    expect(() => resolveSurveyReportDirectory({
      target: project,
      reportValue: null,
      cwd: project,
    })).toThrow(/--report.*outside/u);

    const volumeRoot = parse(root).root;
    expect(() => resolveSurveyReportDirectory({
      target: volumeRoot,
      reportValue: null,
      cwd: root,
    })).toThrow(/--report.*outside/u);
  });

  it('allows the cwd default for an archive target and never derives it from the archive name', () => {
    const archive = join(project, 'CustomerName.msapp');
    writeFileSync(archive, 'fixture');

    expect(resolveSurveyReportDirectory({
      target: archive,
      reportValue: null,
      cwd: root,
    })).toBe(join(realpathSync.native(root), 'appforge-survey'));
  });

  it('rejects output traversal through a symlink or Windows junction', ({ skip }) => {
    const link = join(root, 'linked-output');
    try {
      symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') skip();
      throw error;
    }

    expect(() => resolveSurveyReportDirectory({
      target: project,
      reportValue: join(link, 'artifacts'),
      cwd: root,
    })).toThrow(/symbolic link|junction|reparse/u);
  });

  it('splits output-path I/O failures the way intake does: denied is exit 3, absent is exit 2', () => {
    const reportValue = join(outside, 'artifacts');
    const denyingFs = (errorCode: string) => ({
      ...nativeFs,
      lstatSync: ((pathValue: nativeFs.PathLike, ...rest: unknown[]) => {
        if (String(pathValue).startsWith(outside)) {
          const failure = new Error(`${errorCode}: injected`) as NodeJS.ErrnoException;
          failure.code = errorCode;
          throw failure;
        }
        return (nativeFs.lstatSync as (...args: unknown[]) => unknown)(pathValue, ...rest);
      }) as typeof nativeFs.lstatSync,
    });

    let denied: unknown;
    try {
      resolveSurveyReportDirectory({
        target: project,
        reportValue,
        cwd: root,
        fs: denyingFs('EACCES'),
      });
    } catch (error) {
      denied = error;
    }
    expect(denied).toBeInstanceOf(SurveyOutputError);
    expect(denied).toMatchObject({ code: 'output-path-unreadable', exit_code: 3 });

    let absent: unknown;
    try {
      resolveSurveyReportDirectory({
        target: project,
        reportValue,
        cwd: root,
        fs: denyingFs('ENOENT'),
      });
    } catch (error) {
      absent = error;
    }
    expect(absent).toMatchObject({ code: 'unsafe-output-path', exit_code: 2 });

    // Neither classification writes anything: the refusal happens before any
    // artifact directory is created.
    expect(existsSync(reportValue)).toBe(false);
  });

  it('keeps containment and junction refusals at exit 2 regardless of the I/O split', () => {
    let contained: unknown;
    try {
      resolveSurveyReportDirectory({
        target: project,
        reportValue: join(project, 'reports'),
        cwd: root,
      });
    } catch (error) {
      contained = error;
    }
    expect(contained).toMatchObject({ code: 'unsafe-output-containment', exit_code: 2 });
  });

  it('canonicalizes case variants and keeps sibling projects on explicit distinct outputs', () => {
    const secondProject = join(root, 'SecondProject');
    const secondOutput = join(root, 'Second-report');
    mkdirSync(secondProject);
    mkdirSync(secondOutput);

    const firstResolved = resolveSurveyReportDirectory({
      target: process.platform === 'win32' ? project.toUpperCase() : project,
      reportValue: outside,
      cwd: root,
    });
    const secondResolved = resolveSurveyReportDirectory({
      target: secondProject,
      reportValue: secondOutput,
      cwd: root,
    });

    expect(firstResolved).toBe(realpathSync.native(outside));
    expect(secondResolved).toBe(realpathSync.native(secondOutput));
    expect(firstResolved).not.toBe(secondResolved);
  });

  it('canonicalizes a relative outside report and treats a copied report directory independently', () => {
    const cwd = join(root, 'invocation');
    mkdirSync(cwd);
    const relativeOutput = resolveSurveyReportDirectory({
      target: project,
      reportValue: join('..', 'relative-report'),
      cwd,
    });
    expect(relativeOutput).toBe(join(realpathSync.native(root), 'relative-report'));

    const original = resolveSurveyReportDirectory({
      target: project,
      reportValue: join(outside, 'original'),
      cwd: root,
    });
    writeCase(original, ENVELOPE_A);
    const copied = join(outside, 'copied');
    cpSync(original, copied, { recursive: true });
    const canonicalCopy = realpathSync.native(copied);
    writeCase(canonicalCopy, ENVELOPE_B);
    expect(JSON.parse(readFileSync(join(copied, 'analysis-report.json'), 'utf8')).envelope.id)
      .toBe(ENVELOPE_B);
    expect(existsSync(join(original, `envelope-${ENVELOPE_B}.json`))).toBe(false);
    expect(existsSync(join(copied, `envelope-${ENVELOPE_A}.json`))).toBe(true);
  });
});

function outputCase(reportDir: string, envelopeId: string) {
  const snapshot = analyzeSurveyFiles(
    [{ name: 'Screen.pa.yaml', content: SCREEN }],
    { now: () => Date.parse(NOW) },
  );
  const draft = buildReport(snapshot, {
    app_name: { value: 'Fixture', resolved_by: 'directory' },
    source_kind: 'directory',
    fingerprint_basis: 'directory/src-stripped/v1',
    files: [{ id: 'Screen.pa.yaml', sha256: 'a'.repeat(64) }],
    limitations: [],
    connections: { state: 'unavailable', rows: [] },
    export_datasources: {},
  }, {
    now: NOW,
    report_id: REPORT_ID,
    analyzer_version: '2.4.10-test',
  });
  const envelopePath = join(reportDir, `envelope-${envelopeId}.json`);
  const report = structuredClone(draft);
  report.envelope = {
    id: envelopeId,
    path: envelopePath,
    submission: { state: 'not_requested' },
  };
  const envelope = buildEnvelope(snapshot, report, {
    id: envelopeId,
    catalog_allowlist: ANALYZER_CATALOG_ALLOWLIST,
  });
  return { snapshot, report, envelope };
}

function writeCase(
  reportDir: string,
  envelopeId: string,
  overrides: Record<string, unknown> = {},
) {
  const value = outputCase(reportDir, envelopeId);
  return writeSurveyArtifacts({
    target: project,
    reportDir,
    report: value.report,
    snapshot: value.snapshot,
    envelope: value.envelope,
    baseline: createAnalysisBaseline(value.report, NOW),
    catalogAllowlist: ANALYZER_CATALOG_ALLOWLIST,
    core: outputCore,
  }, overrides);
}

function directoryBytes(directory: string) {
  return Object.fromEntries(readdirSync(directory).sort().map(name => [
    name,
    readFileSync(join(directory, name)).toString('base64'),
  ]));
}

const digest = (value: nativeFs.BinaryLike) => createHash('sha256').update(value).digest('hex');

async function waitUntil(
  predicate: () => boolean,
  timeoutMs = 30_000,
  failureDetails: () => string = () => '',
) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error(`timed out waiting for child-process barrier ${failureDetails()}`);
    }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 10));
  }
}

function childResult(child: ReturnType<typeof spawn>) {
  let stdout = '';
  let stderr = '';
  child.stdout?.setEncoding('utf8');
  child.stderr?.setEncoding('utf8');
  child.stdout?.on('data', chunk => { stdout += chunk; });
  child.stderr?.on('data', chunk => { stderr += chunk; });
  return new Promise<{ status: string; operations: string[]; stderr: string }>((resolvePromise, reject) => {
    child.once('error', reject);
    child.once('close', code => {
      if (code !== 0) {
        reject(new Error(`lock contender exited ${code}: ${stderr}`));
        return;
      }
      const parsed = JSON.parse(stdout);
      resolvePromise({ status: parsed.status, operations: parsed.operations, stderr });
    });
  });
}

function plantedOutputJournal(invocationId: string, final: string) {
  const prefix = `.appforge-survey-${invocationId}`;
  return {
    journal_schema: 'survey-output-journal/1',
    report_final: 'analysis-report.json',
    report_temp: `${prefix}-analysis-report.json.tmp`,
    report_sha256: '0'.repeat(64),
    envelope_final: `envelope-${ENVELOPE_B}.json`,
    envelope_temp: `${prefix}-envelope.tmp`,
    mutable: [{
      final,
      temp: `${prefix}-${final}.tmp`,
      backup: `${prefix}-${final}.bak`,
      had_existing: false,
    }],
  };
}

describe('survey artifact publication', () => {
  it('publishes validated files with report last and retains immutable envelopes across runs', () => {
    const reportDir = resolveSurveyReportDirectory({
      target: project,
      reportValue: join(outside, 'artifacts'),
      cwd: root,
    });
    const first = outputCase(reportDir, ENVELOPE_A);
    const firstBaseline = createAnalysisBaseline(first.report, NOW);
    const firstResult = writeSurveyArtifacts({
      target: project,
      reportDir,
      report: first.report,
      snapshot: first.snapshot,
      envelope: first.envelope,
      baseline: firstBaseline,
      catalogAllowlist: ANALYZER_CATALOG_ALLOWLIST,
      core: outputCore,
    });

    expect(readFileSync(firstResult.reportPath, 'utf8'))
      .toBe(`${JSON.stringify(first.report, null, 2)}\n`);
    expect(readFileSync(firstResult.markdownPath, 'utf8')).toBe(renderTechnical(first.report));
    expect(readFileSync(firstResult.envelopePath, 'utf8'))
      .toBe(serializeEnvelope(first.envelope, ANALYZER_CATALOG_ALLOWLIST));
    expect(JSON.parse(readFileSync(firstResult.baselinePath!, 'utf8'))).toEqual(firstBaseline);

    const second = outputCase(reportDir, ENVELOPE_B);
    const secondResult = writeSurveyArtifacts({
      target: project,
      reportDir,
      report: second.report,
      snapshot: second.snapshot,
      envelope: second.envelope,
      catalogAllowlist: ANALYZER_CATALOG_ALLOWLIST,
      core: outputCore,
    });

    expect(JSON.parse(readFileSync(secondResult.reportPath, 'utf8')).envelope.id).toBe(ENVELOPE_B);
    expect(existsSync(join(reportDir, `envelope-${ENVELOPE_A}.json`))).toBe(true);
    expect(existsSync(join(reportDir, `envelope-${ENVELOPE_B}.json`))).toBe(true);
    expect(readdirSync(reportDir).filter(name => name.startsWith('.appforge-'))).toEqual([]);
  });

  it('restores the exact previous set for failures at every precommit filesystem operation', () => {
    const probeDir = resolveSurveyReportDirectory({
      target: project,
      reportValue: join(outside, 'probe'),
      cwd: root,
    });
    writeCase(probeDir, ENVELOPE_A);
    const operations: string[] = [];
    writeCase(probeDir, ENVELOPE_B, {
      invocationId: () => '30000000-0000-4000-8000-000000000000',
      onOperation: (name: string) => operations.push(name),
    });
    const reportPublish = operations.indexOf('analysis-report.json:publish-rename');
    expect(reportPublish).toBeGreaterThan(0);
    const precommitOperations = operations.slice(0, reportPublish + 1);
    for (const stage of [
      'journal',
      'envelope',
      'report-technical.md',
      'analysis-baseline.json',
      'analysis-report.json',
    ]) {
      for (const action of ['open', 'write', 'flush', 'close']) {
        expect(precommitOperations).toContain(`${stage}:${action}`);
      }
    }
    expect(precommitOperations).toEqual(expect.arrayContaining([
      'journal:link',
      'journal:unlink-temp',
      'envelope:link',
      'report-technical.md:backup-rename',
      'report-technical.md:publish-rename',
      'analysis-baseline.json:backup-rename',
      'analysis-baseline.json:publish-rename',
      'analysis-report.json:backup-rename',
      'analysis-report.json:publish-rename',
    ]));

    precommitOperations.forEach((failedOperation, index) => {
      const reportDir = resolveSurveyReportDirectory({
        target: project,
        reportValue: join(outside, `failure-${index}`),
        cwd: root,
      });
      writeCase(reportDir, ENVELOPE_A);
      const before = directoryBytes(reportDir);
      let injected = false;

      expect(() => writeCase(reportDir, ENVELOPE_B, {
        invocationId: () => `40000000-0000-4000-8000-${index.toString().padStart(12, '0')}`,
        onOperation: (name: string) => {
          if (!injected && name === failedOperation) {
            injected = true;
            throw new Error('injected output failure');
          }
        },
      })).toThrow(SurveyOutputError);

      expect(injected).toBe(true);
      expect(directoryBytes(reportDir)).toEqual(before);
      expect(existsSync(join(reportDir, `envelope-${ENVELOPE_B}.json`))).toBe(false);
      expect(readdirSync(reportDir).filter(name => name.startsWith('.appforge-'))).toEqual([]);
    });
  });

  it('leaves a recoverable journal when rollback fails, then restores before the next write', () => {
    const reportDir = resolveSurveyReportDirectory({
      target: project,
      reportValue: join(outside, 'rollback-recovery'),
      cwd: root,
    });
    writeCase(reportDir, ENVELOPE_A);

    expect(() => writeCase(reportDir, ENVELOPE_B, {
      invocationId: () => '50000000-0000-4000-8000-000000000000',
      onOperation: (name: string) => {
        if (name === 'analysis-baseline.json:backup-rename'
          || name === 'rollback:report-technical.md:restore') {
          throw new Error('injected rollback failure');
        }
      },
    })).toThrow(expect.objectContaining({ code: 'output-rollback-failed' }));
    expect(readdirSync(reportDir).some(name => name.includes('journal'))).toBe(true);

    writeCase(reportDir, ENVELOPE_B, {
      invocationId: () => '50000000-0000-4000-8000-000000000001',
    });

    expect(JSON.parse(readFileSync(join(reportDir, 'analysis-report.json'), 'utf8')).envelope.id)
      .toBe(ENVELOPE_B);
    expect(existsSync(join(reportDir, `envelope-${ENVELOPE_A}.json`))).toBe(true);
    expect(existsSync(join(reportDir, `envelope-${ENVELOPE_B}.json`))).toBe(true);
    expect(readdirSync(reportDir).filter(name => name.startsWith('.appforge-'))).toEqual([]);
  });

  it('keeps every rollback failure recoverable on the next invocation', () => {
    const probeDir = resolveSurveyReportDirectory({
      target: project,
      reportValue: join(outside, 'rollback-probe'),
      cwd: root,
    });
    writeCase(probeDir, ENVELOPE_A);
    const observed: string[] = [];
    expect(() => writeCase(probeDir, ENVELOPE_B, {
      invocationId: () => '51000000-0000-4000-8000-000000000000',
      onOperation: (name: string) => {
        observed.push(name);
        if (name === 'analysis-report.json:publish-rename') {
          throw new Error('start rollback probe');
        }
      },
    })).toThrow(SurveyOutputError);
    const rollbackOperations = observed.filter(name => name.startsWith('rollback:'));
    expect(rollbackOperations.length).toBeGreaterThan(0);

    rollbackOperations.forEach((rollbackOperation, index) => {
      const reportDir = resolveSurveyReportDirectory({
        target: project,
        reportValue: join(outside, `rollback-failure-${index}`),
        cwd: root,
      });
      writeCase(reportDir, ENVELOPE_A);
      expect(() => writeCase(reportDir, ENVELOPE_B, {
        invocationId: () => `52000000-0000-4000-8000-${index.toString().padStart(12, '0')}`,
        onOperation: (name: string) => {
          if (name === 'analysis-report.json:publish-rename' || name === rollbackOperation) {
            throw new Error('injected rollback point failure');
          }
        },
      })).toThrow(expect.objectContaining({ code: 'output-rollback-failed' }));

      writeCase(reportDir, ENVELOPE_C, {
        invocationId: () => `53000000-0000-4000-8000-${index.toString().padStart(12, '0')}`,
      });
      expect(JSON.parse(readFileSync(join(reportDir, 'analysis-report.json'), 'utf8')).envelope.id)
        .toBe(ENVELOPE_C);
      expect(existsSync(join(reportDir, `envelope-${ENVELOPE_B}.json`))).toBe(false);
      expect(readdirSync(reportDir).filter(name => name.startsWith('.appforge-'))).toEqual([]);
    });
  });

  it('never overwrites an existing immutable envelope on UUID collision', () => {
    const reportDir = resolveSurveyReportDirectory({
      target: project,
      reportValue: join(outside, 'collision'),
      cwd: root,
    });
    writeCase(reportDir, ENVELOPE_A);
    const collisionPath = join(reportDir, `envelope-${ENVELOPE_B}.json`);
    writeFileSync(collisionPath, 'collision sentinel', { flag: 'wx' });
    const before = directoryBytes(reportDir);

    expect(() => writeCase(reportDir, ENVELOPE_B, {
      invocationId: () => '60000000-0000-4000-8000-000000000000',
    })).toThrow(SurveyOutputError);

    expect(readFileSync(collisionPath, 'utf8')).toBe('collision sentinel');
    expect(directoryBytes(reportDir)).toEqual(before);
  });

  it.each(['backup', 'final'] as const)(
    'never overwrites a whole-output %s destination inserted at publication',
    (kind) => {
      const reportDir = resolveSurveyReportDirectory({
        target: project,
        reportValue: join(outside, `whole-publication-${kind}-generation`),
        cwd: root,
      });
      writeCase(reportDir, ENVELOPE_A);
      const invocationId = kind === 'backup'
        ? '60500000-0000-4000-8000-000000000000'
        : '60600000-0000-4000-8000-000000000000';
      const destination = kind === 'backup'
        ? join(reportDir, `.appforge-survey-${invocationId}-analysis-report.json.bak`)
        : join(reportDir, 'analysis-report.json');
      const operation = kind === 'backup'
        ? 'analysis-report.json:backup-rename'
        : 'analysis-report.json:publish-rename';
      const sentinel = Buffer.from(`unowned whole-output ${kind} destination`, 'utf8');
      let inserted = false;
      const fs = {
        ...nativeFs,
        renameSync(oldPath: nativeFs.PathLike, newPath: nativeFs.PathLike) {
          if (inserted && resolve(String(newPath)) === destination && existsSync(destination)) {
            // Emulate POSIX rename-overwrite semantics on the Windows test host.
            nativeFs.unlinkSync(destination);
          }
          return nativeFs.renameSync(oldPath, newPath);
        },
      };

      expect(() => writeCase(reportDir, ENVELOPE_B, {
        fs,
        invocationId: () => invocationId,
        onOperation: (name: string) => {
          if (!inserted && name === operation) {
            inserted = true;
            nativeFs.writeFileSync(destination, sentinel, { flag: 'wx' });
          }
        },
      })).toThrow(SurveyOutputError);
      expect(inserted).toBe(true);
      expect(readFileSync(destination)).toEqual(sentinel);
    },
  );

  it('removes a freshly published generation when temp unlink fails after link', () => {
    const reportDir = resolveSurveyReportDirectory({
      target: project,
      reportValue: join(outside, 'whole-publish-temp-unlink-failure'),
      cwd: root,
    });
    mkdirSync(reportDir, { recursive: true });
    const before = directoryBytes(reportDir);
    const invocationId = '60700000-0000-4000-8000-000000000000';
    const tempPath = join(
      reportDir,
      `.appforge-survey-${invocationId}-report-technical.md.tmp`,
    );
    const quarantineGeneration = join(`${tempPath}.delete`, 'generation');
    let armed = false;
    let injected = false;
    const fs = {
      ...nativeFs,
      unlinkSync(pathValue: nativeFs.PathLike) {
        if (!injected
          && armed
          && [tempPath, quarantineGeneration].includes(resolve(String(pathValue)))) {
          injected = true;
          throw new Error('injected temp unlink failure after exclusive link');
        }
        return nativeFs.unlinkSync(pathValue);
      },
    };

    expect(() => writeCase(reportDir, ENVELOPE_A, {
      fs,
      invocationId: () => invocationId,
      onOperation: (name: string) => {
        armed = name === 'report-technical.md:publish-rename';
      },
    })).toThrow(SurveyOutputError);
    expect(injected).toBe(true);
    expect(directoryBytes(reportDir)).toEqual(before);
  });

  it('preserves a replacement installed inside whole-output temp cleanup', () => {
    const reportDir = resolveSurveyReportDirectory({
      target: project,
      reportValue: join(outside, 'whole-publish-temp-cleanup-aba'),
      cwd: root,
    });
    const invocationId = '60750000-0000-4000-8000-000000000000';
    const tempPath = join(
      reportDir,
      `.appforge-survey-${invocationId}-report-technical.md.tmp`,
    );
    const quarantineGeneration = join(`${tempPath}.delete`, 'generation');
    const replacement = Buffer.from('replacement whole-output temp generation', 'utf8');
    let armed = false;
    let replaced = false;
    const replaceSource = () => {
      nativeFs.unlinkSync(tempPath);
      nativeFs.writeFileSync(tempPath, replacement, { flag: 'wx' });
      replaced = true;
    };
    const fs = {
      ...nativeFs,
      unlinkSync(pathValue: nativeFs.PathLike) {
        if (!replaced && armed && resolve(String(pathValue)) === tempPath) replaceSource();
        return nativeFs.unlinkSync(pathValue);
      },
      renameSync(oldPath: nativeFs.PathLike, newPath: nativeFs.PathLike) {
        if (!replaced
          && armed
          && resolve(String(oldPath)) === tempPath
          && resolve(String(newPath)) === quarantineGeneration) replaceSource();
        return nativeFs.renameSync(oldPath, newPath);
      },
    };

    expect(() => writeCase(reportDir, ENVELOPE_A, {
      fs,
      invocationId: () => invocationId,
      onOperation: (name: string) => {
        armed = name === 'report-technical.md:publish-rename';
      },
    })).toThrow(SurveyOutputError);
    expect(replaced).toBe(true);
    expect(readFileSync(tempPath)).toEqual(replacement);
  });

  it('preserves a replacement installed after whole-output temp quarantine capture', () => {
    const reportDir = resolveSurveyReportDirectory({
      target: project,
      reportValue: join(outside, 'whole-publish-temp-post-capture-aba'),
      cwd: root,
    });
    const invocationId = '60775000-0000-4000-8000-000000000000';
    const tempPath = join(
      reportDir,
      `.appforge-survey-${invocationId}-report-technical.md.tmp`,
    );
    const quarantineGeneration = join(`${tempPath}.delete`, 'generation');
    const replacement = Buffer.from('post-capture whole-output temp generation', 'utf8');
    let inserted = false;
    const fs = {
      ...nativeFs,
      unlinkSync(pathValue: nativeFs.PathLike) {
        if (!inserted && resolve(String(pathValue)) === quarantineGeneration) {
          nativeFs.writeFileSync(tempPath, replacement, { flag: 'wx' });
          inserted = true;
        }
        return nativeFs.unlinkSync(pathValue);
      },
    };

    expect(() => writeCase(reportDir, ENVELOPE_A, {
      fs,
      invocationId: () => invocationId,
    })).toThrow(SurveyOutputError);
    expect(inserted).toBe(true);
    expect(readFileSync(tempPath)).toEqual(replacement);
  });

  it('finishes whole-output backup capture before immediate rollback', () => {
    const reportDir = resolveSurveyReportDirectory({
      target: project,
      reportValue: join(outside, 'whole-backup-capture-cleanup-failure'),
      cwd: root,
    });
    writeCase(reportDir, ENVELOPE_A);
    const before = directoryBytes(reportDir);
    const invocationId = '60800000-0000-4000-8000-000000000000';
    const generationPath = join(
      reportDir,
      `.appforge-survey-${invocationId}-report-technical.md.bak.capture`,
      'generation',
    );
    let armed = false;
    let injected = false;
    const fs = {
      ...nativeFs,
      unlinkSync(pathValue: nativeFs.PathLike) {
        if (!injected && armed && resolve(String(pathValue)) === generationPath) {
          injected = true;
          throw new Error('injected backup capture cleanup failure');
        }
        return nativeFs.unlinkSync(pathValue);
      },
    };

    expect(() => writeCase(reportDir, ENVELOPE_B, {
      fs,
      invocationId: () => invocationId,
      onOperation: (name: string) => {
        armed = name === 'report-technical.md:backup-rename';
      },
    })).toThrow(SurveyOutputError);
    expect(injected).toBe(true);
    expect(directoryBytes(reportDir)).toEqual(before);
  });

  it('revalidates staged bytes and removes every invocation-owned file on sabotage', () => {
    const reportDir = resolveSurveyReportDirectory({
      target: project,
      reportValue: join(outside, 'sabotage'),
      cwd: root,
    });
    let sabotaged = false;
    const fs = {
      ...nativeFs,
      readFileSync(pathValue: nativeFs.PathOrFileDescriptor, options?: unknown) {
        if (!sabotaged
          && typeof pathValue === 'string'
          && pathValue.endsWith('analysis-report.json.tmp')) {
          sabotaged = true;
          return '{"sabotaged":true}\n';
        }
        return nativeFs.readFileSync(pathValue, options as never);
      },
    };

    expect(() => writeCase(reportDir, ENVELOPE_A, {
      invocationId: () => '70000000-0000-4000-8000-000000000000',
      fs,
    })).toThrow(expect.objectContaining({ code: 'output-validation-failed' }));
    expect(sabotaged).toBe(true);
    expect(readdirSync(reportDir)).toEqual([]);
  });

  it('treats report-last as committed when cleanup fails and finishes cleanup next run', () => {
    const reportDir = resolveSurveyReportDirectory({
      target: project,
      reportValue: join(outside, 'commit-recovery'),
      cwd: root,
    });
    writeCase(reportDir, ENVELOPE_A);
    writeCase(reportDir, ENVELOPE_B, {
      invocationId: () => '80000000-0000-4000-8000-000000000000',
      onOperation: (name: string) => {
        if (name === 'commit:report-technical.md:remove-backup') {
          throw new Error('injected postcommit cleanup failure');
        }
      },
    });

    expect(JSON.parse(readFileSync(join(reportDir, 'analysis-report.json'), 'utf8')).envelope.id)
      .toBe(ENVELOPE_B);
    expect(readdirSync(reportDir).some(name => name.includes('journal'))).toBe(true);

    writeCase(reportDir, ENVELOPE_C, {
      invocationId: () => '80000000-0000-4000-8000-000000000001',
    });
    expect(JSON.parse(readFileSync(join(reportDir, 'analysis-report.json'), 'utf8')).envelope.id)
      .toBe(ENVELOPE_C);
    expect(readdirSync(reportDir).filter(name => name.startsWith('.appforge-'))).toEqual([]);
  });

  it('preserves a replacement installed inside recovery journal cleanup', () => {
    const reportDir = resolveSurveyReportDirectory({
      target: project,
      reportValue: join(outside, 'recovery-journal-cleanup-aba'),
      cwd: root,
    });
    const priorInvocation = '80500000-0000-4000-8000-000000000000';
    writeCase(reportDir, ENVELOPE_A);
    writeCase(reportDir, ENVELOPE_B, {
      invocationId: () => priorInvocation,
      onOperation: (name: string) => {
        if (name === 'commit:report-technical.md:remove-backup') {
          throw new Error('leave a committed journal for recovery');
        }
      },
    });
    const journalPath = join(
      reportDir,
      `.appforge-survey-journal-${priorInvocation}.json`,
    );
    const quarantineGeneration = join(`${journalPath}.delete`, 'generation');
    const replacement = Buffer.from('replacement recovery journal generation', 'utf8');
    let armed = false;
    let replaced = false;
    const replaceSource = () => {
      nativeFs.unlinkSync(journalPath);
      nativeFs.writeFileSync(journalPath, replacement, { flag: 'wx' });
      replaced = true;
    };
    const fs = {
      ...nativeFs,
      unlinkSync(pathValue: nativeFs.PathLike) {
        if (!replaced && armed && resolve(String(pathValue)) === journalPath) replaceSource();
        return nativeFs.unlinkSync(pathValue);
      },
      renameSync(oldPath: nativeFs.PathLike, newPath: nativeFs.PathLike) {
        if (!replaced
          && armed
          && resolve(String(oldPath)) === journalPath
          && resolve(String(newPath)) === quarantineGeneration) replaceSource();
        return nativeFs.renameSync(oldPath, newPath);
      },
    };

    let caughtCode: string | null = null;
    try {
      writeCase(reportDir, ENVELOPE_C, {
        fs,
        invocationId: () => '80500000-0000-4000-8000-000000000001',
        onOperation: (name: string) => {
          armed = name === 'recovery:journal:remove';
        },
      });
    } catch (error) {
      caughtCode = (error as SurveyOutputError).code;
    }
    expect({ replaced, caughtCode }).toEqual({
      replaced: true,
      caughtCode: 'output-recovery-failed',
    });
    expect(readFileSync(journalPath)).toEqual(replacement);
  });

  it('reconstructs a journal captured before quarantined cleanup completed', () => {
    const reportDir = resolveSurveyReportDirectory({
      target: project,
      reportValue: join(outside, 'recovery-journal-delete-crash'),
      cwd: root,
    });
    const priorInvocation = '80600000-0000-4000-8000-000000000000';
    writeCase(reportDir, ENVELOPE_A);
    writeCase(reportDir, ENVELOPE_B, {
      invocationId: () => priorInvocation,
      onOperation: (name: string) => {
        if (name === 'commit:report-technical.md:remove-backup') {
          throw new Error('leave a committed journal for crash reconstruction');
        }
      },
    });
    const journalPath = join(
      reportDir,
      `.appforge-survey-journal-${priorInvocation}.json`,
    );
    const quarantineDirectory = `${journalPath}.delete`;
    mkdirSync(quarantineDirectory, { mode: 0o700 });
    nativeFs.renameSync(journalPath, join(quarantineDirectory, 'generation'));

    writeCase(reportDir, ENVELOPE_C, {
      invocationId: () => '80600000-0000-4000-8000-000000000001',
    });
    expect(JSON.parse(readFileSync(join(reportDir, 'analysis-report.json'), 'utf8')).envelope.id)
      .toBe(ENVELOPE_C);
    expect(readdirSync(reportDir).filter(name => name.startsWith('.appforge-'))).toEqual([]);
  });

  it('recovers a whole-output journal temp stranded inside deletion quarantine', () => {
    const reportDir = resolveSurveyReportDirectory({
      target: project,
      reportValue: join(outside, 'recovery-journal-temp-delete-crash'),
      cwd: root,
    });
    const invocationId = '80700000-0000-4000-8000-000000000000';
    const journalTempPath = join(
      reportDir,
      `.appforge-survey-journal-${invocationId}.tmp`,
    );
    const generationPath = join(`${journalTempPath}.delete`, 'generation');
    let stranded = false;
    const fs = {
      ...nativeFs,
      unlinkSync(pathValue: nativeFs.PathLike) {
        if (!stranded && resolve(String(pathValue)) === generationPath) {
          stranded = true;
          throw new Error('simulate process loss after journal-temp capture');
        }
        return nativeFs.unlinkSync(pathValue);
      },
    };

    expect(() => writeCase(reportDir, ENVELOPE_A, {
      fs,
      invocationId: () => invocationId,
      onOperation: (name: string) => {
        if (name === 'journal:link') throw new Error('force pre-journal rollback');
      },
    })).toThrow(SurveyOutputError);
    expect(stranded).toBe(true);
    expect(readFileSync(generationPath).length).toBeGreaterThan(0);

    writeCase(reportDir, ENVELOPE_A, {
      invocationId: () => '80700000-0000-4000-8000-000000000001',
    });
    expect(readdirSync(reportDir).filter(name => name.startsWith('.appforge-'))).toEqual([]);
  });

  it('fails closed on a malformed recovery journal without touching its bytes', () => {
    const reportDir = resolveSurveyReportDirectory({
      target: project,
      reportValue: join(outside, 'malformed-journal'),
      cwd: root,
    });
    mkdirSync(reportDir);
    const journal = join(
      reportDir,
      '.appforge-survey-journal-90000000-0000-4000-8000-000000000000.json',
    );
    writeFileSync(journal, '{malformed');
    const before = directoryBytes(reportDir);

    expect(() => writeCase(reportDir, ENVELOPE_A)).toThrow(expect.objectContaining({
      code: 'output-recovery-failed',
    }));
    expect(directoryBytes(reportDir)).toEqual(before);
  });

  it('rejects forged journal manifests without deleting unrelated or immutable files', () => {
    for (const [index, valuableName] of ['valuable.txt', `envelope-${ENVELOPE_A}.json`].entries()) {
      const reportDir = resolveSurveyReportDirectory({
        target: project,
        reportValue: join(outside, `forged-journal-${index}`),
        cwd: root,
      });
      mkdirSync(reportDir);
      writeFileSync(join(reportDir, valuableName), `sentinel-${index}`);
      const invocationId = `91000000-0000-4000-8000-${index.toString().padStart(12, '0')}`;
      writeFileSync(
        join(reportDir, `.appforge-survey-journal-${invocationId}.json`),
        `${JSON.stringify(plantedOutputJournal(invocationId, valuableName), null, 2)}\n`,
      );
      const before = directoryBytes(reportDir);

      expect(() => writeCase(reportDir, ENVELOPE_B)).toThrow(expect.objectContaining({
        code: 'output-recovery-failed',
      }));
      expect(directoryBytes(reportDir)).toEqual(before);
    }
  });

  it('serializes same-directory writers and never recovers a live invocation', () => {
    const reportDir = resolveSurveyReportDirectory({
      target: project,
      reportValue: join(outside, 'concurrent-writers'),
      cwd: root,
    });
    let nestedError: unknown;
    let attempted = false;

    writeCase(reportDir, ENVELOPE_A, {
      invocationId: () => '92000000-0000-4000-8000-000000000000',
      onOperation: (name: string) => {
        if (!attempted && name === 'journal:link') {
          attempted = true;
          try {
            writeCase(reportDir, ENVELOPE_B, {
              invocationId: () => '92000000-0000-4000-8000-000000000001',
            });
          } catch (error) {
            nestedError = error;
          }
        }
      },
    });

    expect(attempted).toBe(true);
    expect(nestedError).toMatchObject({ code: 'output-busy' });
    expect(JSON.parse(readFileSync(join(reportDir, 'analysis-report.json'), 'utf8')).envelope.id)
      .toBe(ENVELOPE_A);
    expect(existsSync(join(reportDir, `envelope-${ENVELOPE_B}.json`))).toBe(false);
    expect(readdirSync(reportDir).filter(name => name.startsWith('.appforge-'))).toEqual([]);
  });

  it('reclaims only a canonical dead-owner lock and its same-file witness', () => {
    const reportDir = resolveSurveyReportDirectory({
      target: project,
      reportValue: join(outside, 'stale-lock'),
      cwd: root,
    });
    mkdirSync(reportDir);
    const invocationId = '92500000-0000-4000-8000-000000000000';
    const witness = join(reportDir, `.appforge-survey-lock-${invocationId}.tmp`);
    writeFileSync(witness, `${JSON.stringify({
      lock_schema: 'survey-output-lock/1',
      pid: 2_147_483_647,
      invocation_id: invocationId,
    }, null, 2)}\n`);
    nativeFs.linkSync(witness, join(reportDir, '.appforge-survey.lock'));

    writeCase(reportDir, ENVELOPE_A);
    expect(readdirSync(reportDir).filter(name => name.startsWith('.appforge-'))).toEqual([]);
  });

  it('admits only one of two child reclaimers racing on the same dead legacy lock', async () => {
    const reportDir = resolveSurveyReportDirectory({
      target: project,
      reportValue: join(outside, 'stale-lock-race'),
      cwd: root,
    });
    const value = outputCase(reportDir, ENVELOPE_A);
    const written = writeCase(reportDir, ENVELOPE_A);
    const staleInvocation = '92600000-0000-4000-8000-000000000000';
    const witness = join(reportDir, `.appforge-survey-lock-${staleInvocation}.tmp`);
    writeFileSync(witness, `${JSON.stringify({
      lock_schema: 'survey-output-lock/1',
      pid: 2_147_483_647,
      invocation_id: staleInvocation,
    }, null, 2)}\n`);
    nativeFs.linkSync(witness, join(reportDir, '.appforge-survey.lock'));

    const start = join(root, 'start-contenders');
    const release = join(root, 'release-winner');
    const readyA = join(root, 'ready-a');
    const readyB = join(root, 'ready-b');
    const ticketA = join(root, 'ticket-a');
    const ticketB = join(root, 'ticket-b');
    const legacyA = join(root, 'legacy-a');
    const legacyB = join(root, 'legacy-b');
    const legacyRemoveA = join(root, 'legacy-remove-a');
    const legacyRemoveB = join(root, 'legacy-remove-b');
    const witnessRemoveA = join(root, 'witness-remove-a');
    const witnessRemoveB = join(root, 'witness-remove-b');
    const probeA = join(root, 'probe-a');
    const probeB = join(root, 'probe-b');
    const moduleUrl = new URL(
      '../../cli/lib/survey-output.mjs',
      import.meta.url,
    ).href;
    const script = `
      import fs from 'node:fs';
      import { replaceSubmissionReport } from ${JSON.stringify(moduleUrl)};
      const [start, ready, release, reportPath, envelopeId, invocationId,
        ticketReady, peerTicketReady, legacyReady, peerLegacyReady,
        probeReady, peerProbeReady, legacyRemoveReady, peerLegacyRemoveReady,
        witnessRemoveReady, peerWitnessRemoveReady] = process.argv.slice(1);
      const pause = () => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
      const barrier = (own, peer) => {
        fs.writeFileSync(own, 'ready', { flag: 'wx' });
        while (!fs.existsSync(peer)) pause();
      };
      let simulatedRemovalError = false;
      const raceFs = {
        ...fs,
        unlinkSync(pathValue) {
          if (!simulatedRemovalError
            && String(pathValue).includes('.appforge-survey-lock')) {
            simulatedRemovalError = true;
            fs.unlinkSync(pathValue);
            const raced = new Error('simulated Windows completed unlink');
            raced.code = 'EPERM';
            throw raced;
          }
          return fs.unlinkSync(pathValue);
        },
      };
      const operations = [];
      while (!fs.existsSync(start)) pause();
      try {
        replaceSubmissionReport({
          reportPath,
          expectedEnvelope: { id: envelopeId },
          transition: { state: 'acknowledged', attempted_at: ${JSON.stringify(NOW)} },
          core: { assertValidReport() {}, assertEmittableReport() {} },
        }, {
          fs: raceFs,
          invocationId: () => invocationId,
          onOperation(name) {
            operations.push(name);
            if (name === 'lock:legacy-probe') barrier(probeReady, peerProbeReady);
            if (name === 'lock:legacy-observed') barrier(legacyReady, peerLegacyReady);
            if (name === 'lock:remove-legacy') {
              barrier(legacyRemoveReady, peerLegacyRemoveReady);
            }
            if (name === 'lock:remove-legacy-witness') {
              barrier(witnessRemoveReady, peerWitnessRemoveReady);
            }
            if (name === 'lock:ticket-scan') barrier(ticketReady, peerTicketReady);
            if (name === 'report-update:current:read') {
              fs.writeFileSync(ready, 'ready', { flag: 'wx' });
              while (!fs.existsSync(release)) pause();
            }
          },
        });
        process.stdout.write(JSON.stringify({ status: 'ok', operations }));
      } catch (error) {
        process.stdout.write(JSON.stringify({ status: error.code ?? 'unknown', operations }));
      }
    `;
    const contender = (
      ready: string,
      invocationId: string,
      ticketReady: string,
      peerTicketReady: string,
      legacyReady: string,
      peerLegacyReady: string,
      probeReady: string,
      peerProbeReady: string,
      legacyRemoveReady: string,
      peerLegacyRemoveReady: string,
      witnessRemoveReady: string,
      peerWitnessRemoveReady: string,
    ) => spawn(
      process.execPath,
      ['--input-type=module', '-e', script, start, ready, release,
        written.reportPath, value.envelope.id, invocationId,
        ticketReady, peerTicketReady, legacyReady, peerLegacyReady,
        probeReady, peerProbeReady, legacyRemoveReady, peerLegacyRemoveReady,
        witnessRemoveReady, peerWitnessRemoveReady],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const childA = contender(
      readyA,
      '92600000-0000-4000-8000-000000000001',
      ticketA,
      ticketB,
      legacyA,
      legacyB,
      probeA,
      probeB,
      legacyRemoveA,
      legacyRemoveB,
      witnessRemoveA,
      witnessRemoveB,
    );
    const childB = contender(
      readyB,
      '92600000-0000-4000-8000-000000000002',
      ticketB,
      ticketA,
      legacyB,
      legacyA,
      probeB,
      probeA,
      legacyRemoveB,
      legacyRemoveA,
      witnessRemoveB,
      witnessRemoveA,
    );
    const resultA = childResult(childA);
    const resultB = childResult(childB);
    let results: Awaited<typeof resultA>[];
    try {
      writeFileSync(start, 'start', { flag: 'wx' });
      const barrierState = () => ({
        exits: [childA.exitCode, childB.exitCode],
        markers: {
          ready: [existsSync(readyA), existsSync(readyB)],
          ticket: [existsSync(ticketA), existsSync(ticketB)],
          legacy: [existsSync(legacyA), existsSync(legacyB)],
          legacy_remove: [existsSync(legacyRemoveA), existsSync(legacyRemoveB)],
          witness_remove: [existsSync(witnessRemoveA), existsSync(witnessRemoveB)],
          probe: [existsSync(probeA), existsSync(probeB)],
        },
      });
      const bothExited = Promise.all([resultA, resultB]).then(earlyResults => {
        if (!existsSync(readyA) && !existsSync(readyB)) {
          throw new Error(`both lock contenders exited before a winner: ${JSON.stringify({
            ...barrierState(),
            results: earlyResults,
          })}`);
        }
      });
      const invalidEarlyExit = Promise.race([resultA, resultB]).then(earlyResult => {
        if (earlyResult.status !== 'output-busy') {
          throw new Error(`lock contender exited before ticket arbitration: ${JSON.stringify({
            ...barrierState(),
            result: earlyResult,
          })}`);
        }
        return new Promise<never>(() => {});
      });
      await Promise.race([
        waitUntil(
          () => existsSync(readyA) || existsSync(readyB),
          30_000,
          () => JSON.stringify(barrierState()),
        ),
        bothExited,
        invalidEarlyExit,
      ]);

      const loser = await Promise.race([resultA, resultB]);
      expect(loser.status).toBe('output-busy');
      writeFileSync(release, 'release', { flag: 'wx' });
      results = await Promise.all([resultA, resultB]);
    } finally {
      if (!existsSync(release)) writeFileSync(release, 'release');
      if (childA.exitCode === null) childA.kill();
      if (childB.exitCode === null) childB.kill();
      await Promise.allSettled([resultA, resultB]);
    }

    expect(results.map(result => result.status).sort()).toEqual(['ok', 'output-busy']);
    expect(results.every(result => result.operations.includes('lock:legacy-probe'))).toBe(true);
    expect(results.every(result => result.operations.includes('lock:legacy-observed'))).toBe(true);
    expect(results.every(result => result.operations.includes('lock:remove-legacy'))).toBe(true);
    expect(results.every(result => result.operations.includes('lock:remove-legacy-witness')))
      .toBe(true);
    expect(results.every(result => result.operations.includes('lock:ticket-scan'))).toBe(true);
    expect(results.some(result => result.operations.includes('lock:claim-scan'))).toBe(true);
    expect(JSON.parse(readFileSync(written.reportPath, 'utf8')).envelope.submission.state)
      .toBe('acknowledged');
    expect(readdirSync(reportDir).filter(name => name.startsWith('.appforge-'))).toEqual([]);
  });

  it('reclaims a same-process claim stranded after committed release failure', () => {
    const reportDir = resolveSurveyReportDirectory({
      target: project,
      reportValue: join(outside, 'stranded-local-claim'),
      cwd: root,
    });
    writeCase(reportDir, ENVELOPE_A, {
      invocationId: () => '92700000-0000-4000-8000-000000000000',
      onOperation: (name: string) => {
        if (name === 'lock:release') throw new Error('strand the committed claim');
      },
    });
    expect(readdirSync(reportDir).some(name => name.includes('-lock-claim-'))).toBe(true);

    writeCase(reportDir, ENVELOPE_B, {
      invocationId: () => '92700000-0000-4000-8000-000000000001',
    });
    expect(JSON.parse(readFileSync(join(reportDir, 'analysis-report.json'), 'utf8')).envelope.id)
      .toBe(ENVELOPE_B);
    expect(readdirSync(reportDir).filter(name => name.startsWith('.appforge-'))).toEqual([]);
  });

  it('fails closed when a committed report with a leftover journal is temporarily unreadable', () => {
    const reportDir = resolveSurveyReportDirectory({
      target: project,
      reportValue: join(outside, 'unreadable-commit'),
      cwd: root,
    });
    writeCase(reportDir, ENVELOPE_A);
    writeCase(reportDir, ENVELOPE_B, {
      invocationId: () => '93000000-0000-4000-8000-000000000000',
      onOperation: (name: string) => {
        if (name === 'commit:report-technical.md:remove-backup') {
          throw new Error('leave committed journal');
        }
      },
    });
    const before = directoryBytes(reportDir);
    const fs = {
      ...nativeFs,
      readFileSync(pathValue: nativeFs.PathOrFileDescriptor, options?: unknown) {
        if (typeof pathValue === 'string'
          && resolve(pathValue) === join(reportDir, 'analysis-report.json')) {
          const error = new Error('temporarily unreadable') as NodeJS.ErrnoException;
          error.code = 'EPERM';
          throw error;
        }
        return nativeFs.readFileSync(pathValue, options as never);
      },
    };

    expect(() => writeCase(reportDir, ENVELOPE_C, { fs })).toThrow(expect.objectContaining({
      code: 'output-recovery-failed',
    }));
    expect(directoryBytes(reportDir)).toEqual(before);
  });

  it('rejects valid but noncanonical staged report and baseline bytes', () => {
    for (const artifact of ['analysis-report.json', 'analysis-baseline.json']) {
      const reportDir = resolveSurveyReportDirectory({
        target: project,
        reportValue: join(outside, `noncanonical-${artifact}`),
        cwd: root,
      });
      let sabotaged = false;
      const fs = {
        ...nativeFs,
        readFileSync(pathValue: nativeFs.PathOrFileDescriptor, options?: unknown) {
          if (!sabotaged
            && typeof pathValue === 'string'
            && pathValue.endsWith(`${artifact}.tmp`)) {
            sabotaged = true;
            const value = JSON.parse(nativeFs.readFileSync(pathValue, 'utf8'));
            nativeFs.writeFileSync(pathValue, JSON.stringify(value));
          }
          return nativeFs.readFileSync(pathValue, options as never);
        },
      };

      expect(() => writeCase(reportDir, ENVELOPE_A, { fs })).toThrow(expect.objectContaining({
        code: 'output-validation-failed',
      }));
      expect(sabotaged).toBe(true);
      expect(readdirSync(reportDir)).toEqual([]);
    }
  });

  it('revalidates exact bytes from final paths before returning success', () => {
    const reportDir = resolveSurveyReportDirectory({
      target: project,
      reportValue: join(outside, 'final-reread'),
      cwd: root,
    });
    let sabotaged = false;
    const fs = {
      ...nativeFs,
      linkSync(oldPath: nativeFs.PathLike, newPath: nativeFs.PathLike) {
        nativeFs.linkSync(oldPath, newPath);
        if (!sabotaged
          && typeof newPath === 'string'
          && resolve(newPath) === join(reportDir, 'analysis-report.json')) {
          sabotaged = true;
          const value = JSON.parse(nativeFs.readFileSync(newPath, 'utf8'));
          nativeFs.writeFileSync(newPath, JSON.stringify(value));
        }
      },
    };

    expect(() => writeCase(reportDir, ENVELOPE_A, { fs })).toThrow(expect.objectContaining({
      code: 'output-rollback-failed',
    }));
    expect(sabotaged).toBe(true);
    expect(readFileSync(join(reportDir, 'analysis-report.json'), 'utf8').endsWith('\n')).toBe(false);
    expect(readdirSync(reportDir).some(name => name.startsWith('.appforge-survey-journal-')))
      .toBe(true);
  });

  it('preserves an unowned final report generation instead of rolling it back', () => {
    const reportDir = resolveSurveyReportDirectory({
      target: project,
      reportValue: join(outside, 'unowned-final-generation'),
      cwd: root,
    });
    writeCase(reportDir, ENVELOPE_A);
    const thirdGeneration = Buffer.from('unowned third-generation report', 'utf8');
    let armed = false;
    let replaced = false;
    const fs = {
      ...nativeFs,
      readFileSync(pathValue: nativeFs.PathOrFileDescriptor, options?: unknown) {
        if (!replaced
          && armed
          && typeof pathValue === 'string'
          && resolve(pathValue) === join(reportDir, 'analysis-report.json')) {
          replaced = true;
          nativeFs.writeFileSync(pathValue, thirdGeneration);
        }
        return nativeFs.readFileSync(pathValue, options as never);
      },
    };

    expect(() => writeCase(reportDir, ENVELOPE_B, {
      fs,
      invocationId: () => '94000000-0000-4000-8000-000000000000',
      onOperation: (name: string) => {
        armed = name === 'analysis-report.json:final-verify:read';
      },
    })).toThrow(expect.objectContaining({ code: 'output-rollback-failed' }));
    expect(replaced).toBe(true);
    expect(readFileSync(join(reportDir, 'analysis-report.json'))).toEqual(thirdGeneration);
    expect(readdirSync(reportDir).some(name => name.startsWith('.appforge-survey-journal-')))
      .toBe(true);
    expect(readdirSync(reportDir).some(name => name.endsWith('analysis-report.json.bak')))
      .toBe(true);
  });

  it('rechecks final ownership inside the whole-output rollback removal action', () => {
    const reportDir = resolveSurveyReportDirectory({
      target: project,
      reportValue: join(outside, 'rollback-remove-generation'),
      cwd: root,
    });
    writeCase(reportDir, ENVELOPE_A);
    const thirdGeneration = Buffer.from('late whole-output rollback generation', 'utf8');
    let forced = false;
    let replaced = false;

    expect(() => writeCase(reportDir, ENVELOPE_B, {
      invocationId: () => '94100000-0000-4000-8000-000000000000',
      onOperation: (name: string) => {
        if (!forced && name === 'analysis-report.json:final-verify:read') {
          forced = true;
          throw new Error('force rollback after publication');
        }
        if (!replaced && name === 'rollback:analysis-report.json:remove-new') {
          replaced = true;
          nativeFs.writeFileSync(join(reportDir, 'analysis-report.json'), thirdGeneration);
        }
      },
    })).toThrow(expect.objectContaining({ code: 'output-rollback-failed' }));
    expect({ forced, replaced }).toEqual({ forced: true, replaced: true });
    expect(readFileSync(join(reportDir, 'analysis-report.json'))).toEqual(thirdGeneration);
    expect(readdirSync(reportDir).some(name => name.startsWith('.appforge-survey-journal-')))
      .toBe(true);
    expect(readdirSync(reportDir).some(name => name.endsWith('analysis-report.json.bak')))
      .toBe(true);
  });

  it('retains whole-output recovery metadata when a final appears after quarantine capture', () => {
    const reportDir = resolveSurveyReportDirectory({
      target: project,
      reportValue: join(outside, 'rollback-post-capture-generation'),
      cwd: root,
    });
    writeCase(reportDir, ENVELOPE_A);
    const invocationId = '94125000-0000-4000-8000-000000000000';
    const finalPath = join(reportDir, 'analysis-report.json');
    const quarantineGeneration = join(
      `${join(reportDir, `.appforge-survey-${invocationId}-analysis-report.json.tmp`)}.remove`,
      'generation',
    );
    const thirdGeneration = Buffer.from('post-capture whole-output generation', 'utf8');
    let forced = false;
    let inserted = false;
    const fs = {
      ...nativeFs,
      unlinkSync(pathValue: nativeFs.PathLike) {
        if (!inserted && resolve(String(pathValue)) === quarantineGeneration) {
          nativeFs.writeFileSync(finalPath, thirdGeneration, { flag: 'wx' });
          inserted = true;
        }
        return nativeFs.unlinkSync(pathValue);
      },
    };

    expect(() => writeCase(reportDir, ENVELOPE_B, {
      fs,
      invocationId: () => invocationId,
      onOperation: (name: string) => {
        if (!forced && name === 'analysis-report.json:final-verify:read') {
          forced = true;
          throw new Error('force rollback after publication');
        }
      },
    })).toThrow(expect.objectContaining({ code: 'output-rollback-failed' }));
    expect({ forced, inserted }).toEqual({ forced: true, inserted: true });
    expect(readFileSync(finalPath)).toEqual(thirdGeneration);
    expect(readdirSync(reportDir).some(name => name.startsWith('.appforge-survey-journal-')))
      .toBe(true);
    expect(readdirSync(reportDir).some(name => name.endsWith('analysis-report.json.bak')))
      .toBe(true);
  });

  it('never overwrites a newer final while restoring an unowned quarantine', () => {
    const reportDir = resolveSurveyReportDirectory({
      target: project,
      reportValue: join(outside, 'rollback-quarantine-restore-race'),
      cwd: root,
    });
    writeCase(reportDir, ENVELOPE_A);
    const invocationId = '94150000-0000-4000-8000-000000000000';
    const finalPath = join(reportDir, 'analysis-report.json');
    const quarantineBase = join(
      reportDir,
      `.appforge-survey-${invocationId}-analysis-report.json.tmp`,
    );
    const quarantinePath = join(`${quarantineBase}.remove`, 'generation');
    const thirdGeneration = Buffer.from('quarantined third generation', 'utf8');
    const fourthGeneration = Buffer.from('newer public fourth generation', 'utf8');
    let forced = false;
    let armed = false;
    let createdFourth = false;
    const createFourth = () => {
      if (!armed || createdFourth) return;
      createdFourth = true;
      nativeFs.writeFileSync(finalPath, fourthGeneration, { flag: 'wx' });
    };
    const fs = {
      ...nativeFs,
      existsSync(pathValue: nativeFs.PathLike) {
        const exists = nativeFs.existsSync(pathValue);
        if (!exists
          && typeof pathValue === 'string'
          && resolve(pathValue) === finalPath) {
          createFourth();
        }
        return exists;
      },
      linkSync(existingPath: nativeFs.PathLike, newPath: nativeFs.PathLike) {
        if (typeof existingPath === 'string'
          && typeof newPath === 'string'
          && resolve(existingPath) === quarantinePath
          && resolve(newPath) === finalPath) {
          createFourth();
        }
        return nativeFs.linkSync(existingPath, newPath);
      },
    };

    expect(() => writeCase(reportDir, ENVELOPE_B, {
      fs,
      invocationId: () => invocationId,
      onOperation: (name: string) => {
        if (!forced && name === 'analysis-report.json:final-verify:read') {
          forced = true;
          throw new Error('force rollback after publication');
        }
        if (!armed && name === 'rollback:analysis-report.json:remove-new') {
          nativeFs.writeFileSync(finalPath, thirdGeneration);
          armed = true;
        }
      },
    })).toThrow(expect.objectContaining({ code: 'output-rollback-failed' }));
    expect({ forced, armed, createdFourth }).toEqual({
      forced: true,
      armed: true,
      createdFourth: true,
    });
    expect(readFileSync(finalPath)).toEqual(fourthGeneration);
    expect(readFileSync(quarantinePath)).toEqual(thirdGeneration);
    expect(readdirSync(reportDir).some(name => name.startsWith('.appforge-survey-journal-')))
      .toBe(true);
    expect(readdirSync(reportDir).some(name => name.endsWith('analysis-report.json.bak')))
      .toBe(true);
  });

  it('never overwrites a quarantine destination created inside the removal action', () => {
    const reportDir = resolveSurveyReportDirectory({
      target: project,
      reportValue: join(outside, 'rollback-quarantine-destination-race'),
      cwd: root,
    });
    writeCase(reportDir, ENVELOPE_A);
    const invocationId = '94155000-0000-4000-8000-000000000000';
    const finalPath = join(reportDir, 'analysis-report.json');
    const legacyQuarantine = join(
      reportDir,
      `.appforge-survey-${invocationId}-analysis-report.json.tmp`,
    );
    const directoryQuarantine = `${legacyQuarantine}.remove`;
    const sentinel = Buffer.from('unowned quarantine destination generation', 'utf8');
    let forced = false;
    let collided = false;
    let collisionPath = '';
    const fs = {
      ...nativeFs,
      mkdirSync(pathValue: nativeFs.PathLike, options?: nativeFs.MakeDirectoryOptions) {
        if (!collided && resolve(String(pathValue)) === directoryQuarantine) {
          collided = true;
          collisionPath = directoryQuarantine;
          nativeFs.writeFileSync(pathValue, sentinel, { flag: 'wx' });
        }
        return nativeFs.mkdirSync(pathValue, options);
      },
      renameSync(oldPath: nativeFs.PathLike, newPath: nativeFs.PathLike) {
        if (!collided
          && resolve(String(oldPath)) === finalPath
          && resolve(String(newPath)) === legacyQuarantine) {
          collided = true;
          collisionPath = legacyQuarantine;
          nativeFs.writeFileSync(newPath, sentinel, { flag: 'wx' });
          // Emulate POSIX rename-overwrite semantics on the Windows test host.
          nativeFs.unlinkSync(newPath);
        }
        return nativeFs.renameSync(oldPath, newPath);
      },
    };

    expect(() => writeCase(reportDir, ENVELOPE_B, {
      fs,
      invocationId: () => invocationId,
      onOperation: (name: string) => {
        if (!forced && name === 'analysis-report.json:final-verify:read') {
          forced = true;
          throw new Error('force rollback after publication');
        }
      },
    })).toThrow(SurveyOutputError);
    expect({ forced, collided }).toEqual({ forced: true, collided: true });
    expect(readFileSync(collisionPath)).toEqual(sentinel);
  });

  it('never overwrites a newer final during whole-output rollback restore', () => {
    const reportDir = resolveSurveyReportDirectory({
      target: project,
      reportValue: join(outside, 'rollback-restore-race'),
      cwd: root,
    });
    writeCase(reportDir, ENVELOPE_A);
    const finalPath = join(reportDir, 'analysis-report.json');
    const thirdGeneration = Buffer.from('newer whole-output rollback generation', 'utf8');
    let forced = false;
    let replaced = false;

    expect(() => writeCase(reportDir, ENVELOPE_B, {
      invocationId: () => '94160000-0000-4000-8000-000000000000',
      onOperation: (name: string) => {
        if (!forced && name === 'analysis-report.json:final-verify:read') {
          forced = true;
          throw new Error('force rollback after publication');
        }
        if (!replaced && name === 'rollback:analysis-report.json:restore') {
          replaced = true;
          nativeFs.writeFileSync(finalPath, thirdGeneration, { flag: 'wx' });
        }
      },
    })).toThrow(expect.objectContaining({ code: 'output-rollback-failed' }));
    expect({ forced, replaced }).toEqual({ forced: true, replaced: true });
    expect(readFileSync(finalPath)).toEqual(thirdGeneration);
    expect(readdirSync(reportDir).some(name => name.startsWith('.appforge-survey-journal-')))
      .toBe(true);
    expect(readdirSync(reportDir).some(name => name.endsWith('analysis-report.json.bak')))
      .toBe(true);
  });

  it('never overwrites a newer final during whole-output recovery restore', () => {
    const reportDir = resolveSurveyReportDirectory({
      target: project,
      reportValue: join(outside, 'recovery-restore-race'),
      cwd: root,
    });
    writeCase(reportDir, ENVELOPE_A);
    let forced = false;
    let stranded = false;
    expect(() => writeCase(reportDir, ENVELOPE_B, {
      invocationId: () => '94170000-0000-4000-8000-000000000000',
      onOperation: (name: string) => {
        if (!forced && name === 'analysis-report.json:publish-rename') {
          forced = true;
          throw new Error('force rollback before report publication');
        }
        if (!stranded && name === 'rollback:analysis-report.json:restore') {
          stranded = true;
          throw new Error('leave report backup for recovery');
        }
      },
    })).toThrow(expect.objectContaining({ code: 'output-rollback-failed' }));
    expect({ forced, stranded }).toEqual({ forced: true, stranded: true });

    const finalPath = join(reportDir, 'analysis-report.json');
    const thirdGeneration = Buffer.from('newer whole-output recovery generation', 'utf8');
    let replaced = false;
    expect(() => writeCase(reportDir, ENVELOPE_C, {
      invocationId: () => '94170000-0000-4000-8000-000000000001',
      onOperation: (name: string) => {
        if (!replaced && name === 'recovery:analysis-report.json:restore') {
          replaced = true;
          nativeFs.writeFileSync(finalPath, thirdGeneration, { flag: 'wx' });
        }
      },
    })).toThrow(expect.objectContaining({ code: 'output-recovery-failed' }));
    expect(replaced).toBe(true);
    expect(readFileSync(finalPath)).toEqual(thirdGeneration);
    expect(readdirSync(reportDir).some(name => name.startsWith('.appforge-survey-journal-')))
      .toBe(true);
    expect(readdirSync(reportDir).some(name => name.endsWith('analysis-report.json.bak')))
      .toBe(true);
  });

  it('never restores or deletes a backup replaced inside whole-output recovery', () => {
    const reportDir = resolveSurveyReportDirectory({
      target: project,
      reportValue: join(outside, 'recovery-backup-generation'),
      cwd: root,
    });
    writeCase(reportDir, ENVELOPE_A);
    const invocationId = '94175000-0000-4000-8000-000000000000';
    let forced = false;
    let stranded = false;
    expect(() => writeCase(reportDir, ENVELOPE_B, {
      invocationId: () => invocationId,
      onOperation: (name: string) => {
        if (!forced && name === 'analysis-report.json:publish-rename') {
          forced = true;
          throw new Error('force rollback before report publication');
        }
        if (!stranded && name === 'rollback:analysis-report.json:restore') {
          stranded = true;
          throw new Error('leave report backup for recovery');
        }
      },
    })).toThrow(expect.objectContaining({ code: 'output-rollback-failed' }));
    const finalPath = join(reportDir, 'analysis-report.json');
    const backupPath = join(
      reportDir,
      `.appforge-survey-${invocationId}-analysis-report.json.bak`,
    );
    const replacement = Buffer.from('unowned whole-output recovery backup', 'utf8');
    let replaced = false;

    expect(() => writeCase(reportDir, ENVELOPE_C, {
      invocationId: () => '94175000-0000-4000-8000-000000000001',
      onOperation: (name: string) => {
        if (!replaced && name === 'recovery:analysis-report.json:restore') {
          replaced = true;
          nativeFs.unlinkSync(backupPath);
          nativeFs.writeFileSync(backupPath, replacement, { flag: 'wx' });
        }
      },
    })).toThrow(expect.objectContaining({ code: 'output-recovery-failed' }));
    expect({ forced, stranded, replaced }).toEqual({
      forced: true,
      stranded: true,
      replaced: true,
    });
    expect(existsSync(finalPath)).toBe(false);
    expect(readFileSync(backupPath)).toEqual(replacement);
    expect(readdirSync(reportDir).some(name => name.startsWith('.appforge-survey-journal-')))
      .toBe(true);
  });

  it.each(['remove', 'restore'] as const)(
    'recovers a whole-output crash after the %s helper has changed filesystem state',
    (state) => {
      const reportDir = resolveSurveyReportDirectory({
        target: project,
        reportValue: join(outside, `whole-helper-crash-${state}`),
        cwd: root,
      });
      writeCase(reportDir, ENVELOPE_A);
      const invocationId = state === 'remove'
        ? '94178000-0000-4000-8000-000000000000'
        : '94179000-0000-4000-8000-000000000000';
      let forced = false;
      let stranded = false;
      expect(() => writeCase(reportDir, ENVELOPE_B, {
        invocationId: () => invocationId,
        onOperation: (name: string) => {
          if (!forced && name === (state === 'remove'
            ? 'analysis-report.json:final-verify:read'
            : 'analysis-report.json:publish-rename')) {
            forced = true;
            throw new Error('start helper crash fixture');
          }
          if (!stranded && name === (state === 'remove'
            ? 'rollback:analysis-report.json:remove-new'
            : 'rollback:analysis-report.json:restore')) {
            stranded = true;
            throw new Error('strand helper input');
          }
        },
      })).toThrow(expect.objectContaining({ code: 'output-rollback-failed' }));
      const finalPath = join(reportDir, 'analysis-report.json');
      const tempPath = join(
        reportDir,
        `.appforge-survey-${invocationId}-analysis-report.json.tmp`,
      );
      const backupPath = join(
        reportDir,
        `.appforge-survey-${invocationId}-analysis-report.json.bak`,
      );
      const quarantine = state === 'remove' ? `${tempPath}.remove` : `${backupPath}.restore`;
      const generation = join(quarantine, 'generation');
      nativeFs.mkdirSync(quarantine, { mode: 0o700 });
      nativeFs.renameSync(state === 'remove' ? finalPath : backupPath, generation);
      if (state === 'restore') nativeFs.linkSync(generation, finalPath);

      writeCase(reportDir, ENVELOPE_C, {
        invocationId: () => state === 'remove'
          ? '94178000-0000-4000-8000-000000000001'
          : '94179000-0000-4000-8000-000000000001',
      });
      expect(JSON.parse(readFileSync(finalPath, 'utf8')).envelope.id).toBe(ENVELOPE_C);
      expect(readdirSync(reportDir).filter(name => name.startsWith('.appforge-'))).toEqual([]);
    },
  );

  it.each(['temp', 'backup'] as const)(
    'never deletes a replacement committed whole-output %s generation',
    (kind) => {
      const reportDir = resolveSurveyReportDirectory({
        target: project,
        reportValue: join(outside, `committed-whole-${kind}-generation`),
        cwd: root,
      });
      writeCase(reportDir, ENVELOPE_A);
      const invocationId = kind === 'temp'
        ? '94176000-0000-4000-8000-000000000000'
        : '94177000-0000-4000-8000-000000000000';
      writeCase(reportDir, ENVELOPE_B, {
        invocationId: () => invocationId,
        onOperation: (name: string) => {
          if (name === 'commit:report-technical.md:remove-backup') {
            throw new Error('leave committed survey journal');
          }
        },
      });
      const suffix = kind === 'temp' ? 'tmp' : 'bak';
      const auxiliaryPath = join(
        reportDir,
        `.appforge-survey-${invocationId}-report-technical.md.${suffix}`,
      );
      if (kind === 'temp') {
        nativeFs.writeFileSync(auxiliaryPath, readFileSync(join(reportDir, 'report-technical.md')), {
          flag: 'wx',
        });
      }
      expect(existsSync(auxiliaryPath)).toBe(true);
      const replacement = Buffer.from(`unowned committed whole-output ${kind}`, 'utf8');
      let replaced = false;

      expect(() => writeCase(reportDir, ENVELOPE_C, {
        invocationId: () => kind === 'temp'
          ? '94176000-0000-4000-8000-000000000001'
          : '94177000-0000-4000-8000-000000000001',
        onOperation: (name: string) => {
          if (!replaced && name === `recovery:report-technical.md:remove-${kind}`) {
            replaced = true;
            nativeFs.unlinkSync(auxiliaryPath);
            nativeFs.writeFileSync(auxiliaryPath, replacement, { flag: 'wx' });
          }
        },
      })).toThrow(expect.objectContaining({ code: 'output-recovery-failed' }));
      expect(replaced).toBe(true);
      expect(readFileSync(auxiliaryPath)).toEqual(replacement);
    },
  );

  it('never deletes a replacement committed envelope-temp generation', () => {
    const reportDir = resolveSurveyReportDirectory({
      target: project,
      reportValue: join(outside, 'committed-envelope-temp-generation'),
      cwd: root,
    });
    writeCase(reportDir, ENVELOPE_A);
    const invocationId = '94177500-0000-4000-8000-000000000000';
    writeCase(reportDir, ENVELOPE_B, {
      invocationId: () => invocationId,
      onOperation: (name: string) => {
        if (name === 'commit:envelope-temp:remove') {
          throw new Error('leave committed envelope temp and journal');
        }
      },
    });
    const envelopeTemp = join(reportDir, `.appforge-survey-${invocationId}-envelope.tmp`);
    expect(existsSync(envelopeTemp)).toBe(true);
    const replacement = Buffer.from('unowned committed envelope temp', 'utf8');
    let replaced = false;

    expect(() => writeCase(reportDir, ENVELOPE_C, {
      invocationId: () => '94177500-0000-4000-8000-000000000001',
      onOperation: (name: string) => {
        if (!replaced && name === 'recovery:envelope:remove-temp') {
          replaced = true;
          nativeFs.unlinkSync(envelopeTemp);
          nativeFs.writeFileSync(envelopeTemp, replacement, { flag: 'wx' });
        }
      },
    })).toThrow(expect.objectContaining({ code: 'output-recovery-failed' }));
    expect(replaced).toBe(true);
    expect(readFileSync(envelopeTemp)).toEqual(replacement);
  });

  it('never deletes a replacement envelope during whole-output rollback', () => {
    const reportDir = resolveSurveyReportDirectory({
      target: project,
      reportValue: join(outside, 'rollback-envelope-generation'),
      cwd: root,
    });
    writeCase(reportDir, ENVELOPE_A);
    const envelopePath = join(reportDir, `envelope-${ENVELOPE_B}.json`);
    const thirdGeneration = Buffer.from('replacement rollback envelope generation', 'utf8');
    let forced = false;
    let replaced = false;

    expect(() => writeCase(reportDir, ENVELOPE_B, {
      invocationId: () => '94180000-0000-4000-8000-000000000000',
      onOperation: (name: string) => {
        if (!forced && name === 'analysis-report.json:final-verify:read') {
          forced = true;
          throw new Error('force rollback after publication');
        }
        if (!replaced && name === 'rollback:envelope:remove-final') {
          replaced = true;
          nativeFs.unlinkSync(envelopePath);
          nativeFs.writeFileSync(envelopePath, thirdGeneration, { flag: 'wx' });
        }
      },
    })).toThrow(expect.objectContaining({ code: 'output-rollback-failed' }));
    expect({ forced, replaced }).toEqual({ forced: true, replaced: true });
    expect(readFileSync(envelopePath)).toEqual(thirdGeneration);
    expect(readdirSync(reportDir).some(name => name.startsWith('.appforge-survey-journal-')))
      .toBe(true);
    expect(readdirSync(reportDir).some(name => name.endsWith('-envelope.tmp'))).toBe(true);
  });

  it('never deletes a replacement envelope during whole-output recovery', () => {
    const reportDir = resolveSurveyReportDirectory({
      target: project,
      reportValue: join(outside, 'recovery-envelope-generation'),
      cwd: root,
    });
    writeCase(reportDir, ENVELOPE_A);
    let forced = false;
    let stranded = false;
    expect(() => writeCase(reportDir, ENVELOPE_B, {
      invocationId: () => '94190000-0000-4000-8000-000000000000',
      onOperation: (name: string) => {
        if (!forced && name === 'analysis-report.json:publish-rename') {
          forced = true;
          throw new Error('force rollback before report publication');
        }
        if (!stranded && name === 'rollback:envelope:remove-final') {
          stranded = true;
          throw new Error('leave envelope generation for recovery');
        }
      },
    })).toThrow(expect.objectContaining({ code: 'output-rollback-failed' }));
    expect({ forced, stranded }).toEqual({ forced: true, stranded: true });

    const envelopePath = join(reportDir, `envelope-${ENVELOPE_B}.json`);
    const thirdGeneration = Buffer.from('replacement recovery envelope generation', 'utf8');
    let replaced = false;
    expect(() => writeCase(reportDir, ENVELOPE_C, {
      invocationId: () => '94190000-0000-4000-8000-000000000001',
      onOperation: (name: string) => {
        if (!replaced && name === 'recovery:envelope:remove-final') {
          replaced = true;
          nativeFs.unlinkSync(envelopePath);
          nativeFs.writeFileSync(envelopePath, thirdGeneration, { flag: 'wx' });
        }
      },
    })).toThrow(expect.objectContaining({ code: 'output-recovery-failed' }));
    expect(replaced).toBe(true);
    expect(readFileSync(envelopePath)).toEqual(thirdGeneration);
    expect(readdirSync(reportDir).some(name => name.startsWith('.appforge-survey-journal-')))
      .toBe(true);
    expect(readdirSync(reportDir).some(name => name.endsWith('-envelope.tmp'))).toBe(true);
  });

  it('preserves a final replaced inside the crash-recovery removal action', () => {
    const reportDir = resolveSurveyReportDirectory({
      target: project,
      reportValue: join(outside, 'recovery-remove-generation'),
      cwd: root,
    });
    writeCase(reportDir, ENVELOPE_A);
    let forced = false;
    let stranded = false;

    expect(() => writeCase(reportDir, ENVELOPE_B, {
      invocationId: () => '94200000-0000-4000-8000-000000000000',
      onOperation: (name: string) => {
        if (!forced && name === 'analysis-report.json:publish-rename') {
          forced = true;
          throw new Error('force rollback before the commit marker');
        }
        if (!stranded && name === 'rollback:report-technical.md:remove-new') {
          stranded = true;
          throw new Error('leave an uncommitted generation for recovery');
        }
      },
    })).toThrow(expect.objectContaining({ code: 'output-rollback-failed' }));
    expect({ forced, stranded }).toEqual({ forced: true, stranded: true });

    const thirdGeneration = Buffer.from('late crash-recovery generation', 'utf8');
    let replaced = false;
    expect(() => writeCase(reportDir, ENVELOPE_C, {
      invocationId: () => '94200000-0000-4000-8000-000000000001',
      onOperation: (name: string) => {
        if (!replaced && name === 'recovery:report-technical.md:remove-new') {
          replaced = true;
          nativeFs.writeFileSync(join(reportDir, 'report-technical.md'), thirdGeneration);
        }
      },
    })).toThrow(expect.objectContaining({ code: 'output-recovery-failed' }));
    expect(replaced).toBe(true);
    expect(readFileSync(join(reportDir, 'report-technical.md'))).toEqual(thirdGeneration);
    expect(readdirSync(reportDir).some(name => name.startsWith('.appforge-survey-journal-')))
      .toBe(true);
    expect(readdirSync(reportDir).some(name => name.endsWith('report-technical.md.bak')))
      .toBe(true);
  });

  it('calls the actual exclusive open, write, fsync, close, link, and quarantine syscalls', () => {
    const reportDir = resolveSurveyReportDirectory({
      target: project,
      reportValue: join(outside, 'syscall-proof'),
      cwd: root,
    });
    const opened: Array<{ path: string; flags: unknown; mode: unknown }> = [];
    const quarantineDirectories: Array<{ path: string; mode: unknown }> = [];
    const calls = { write: 0, fsync: 0, close: 0, link: 0, rename: 0 };
    const fs = {
      ...nativeFs,
      mkdirSync(pathValue: nativeFs.PathLike, options?: nativeFs.MakeDirectoryOptions) {
        if (/\.(?:capture|delete|remove|restore)$/u.test(String(pathValue))) {
          quarantineDirectories.push({ path: String(pathValue), mode: options?.mode });
        }
        return nativeFs.mkdirSync(pathValue, options);
      },
      openSync(pathValue: nativeFs.PathLike, flags: nativeFs.OpenMode, mode?: nativeFs.Mode) {
        opened.push({ path: String(pathValue), flags, mode });
        return nativeFs.openSync(pathValue, flags, mode);
      },
      writeFileSync(...args: Parameters<typeof nativeFs.writeFileSync>) {
        calls.write += 1;
        return (nativeFs.writeFileSync as (...values: unknown[]) => void)(...args);
      },
      fsyncSync(descriptor: number) {
        calls.fsync += 1;
        return nativeFs.fsyncSync(descriptor);
      },
      closeSync(descriptor: number) {
        calls.close += 1;
        return nativeFs.closeSync(descriptor);
      },
      linkSync(existingPath: nativeFs.PathLike, newPath: nativeFs.PathLike) {
        calls.link += 1;
        return nativeFs.linkSync(existingPath, newPath);
      },
      renameSync(oldPath: nativeFs.PathLike, newPath: nativeFs.PathLike) {
        calls.rename += 1;
        return nativeFs.renameSync(oldPath, newPath);
      },
    };

    writeCase(reportDir, ENVELOPE_A, { fs });
    expect(opened.length).toBeGreaterThanOrEqual(6);
    expect(opened.every(row => row.flags === 'wx' && row.mode === 0o600)).toBe(true);
    expect(opened.every(row => !isAbsolute(row.path))).toBe(true);
    const markerOpens = opened.filter(row => row.path.endsWith('.lock'));
    expect(markerOpens).toHaveLength(2);
    expect(markerOpens.every(row => !isAbsolute(row.path))).toBe(true);
    expect(calls.write).toBe(opened.length - markerOpens.length);
    expect(calls.fsync).toBe(opened.length);
    expect(calls.close).toBe(opened.length);
    expect(calls.link).toBeGreaterThanOrEqual(5);
    expect(calls.rename).toBeGreaterThanOrEqual(1);
    expect(quarantineDirectories.length).toBeGreaterThan(0);
    expect(quarantineDirectories.every(row => row.mode === 0o700)).toBe(true);
    expect(quarantineDirectories.every(row => !isAbsolute(row.path))).toBe(true);
  });

  it('rolls back partial writes and actual fsync or close syscall failures', () => {
    for (const failure of ['partial-write', 'fsync', 'close'] as const) {
      const reportDir = resolveSurveyReportDirectory({
        target: project,
        reportValue: join(outside, `syscall-failure-${failure}`),
        cwd: root,
      });
      const paths = new Map<number, string>();
      let injected = false;
      const fs = {
        ...nativeFs,
        openSync(pathValue: nativeFs.PathLike, flags: nativeFs.OpenMode, mode?: nativeFs.Mode) {
          const descriptor = nativeFs.openSync(pathValue, flags, mode);
          paths.set(descriptor, String(pathValue));
          return descriptor;
        },
        writeFileSync(descriptor: nativeFs.PathOrFileDescriptor, data: string | NodeJS.ArrayBufferView) {
          const pathValue = typeof descriptor === 'number' ? paths.get(descriptor) : undefined;
          if (!injected && failure === 'partial-write' && pathValue?.endsWith('analysis-report.json.tmp')) {
            injected = true;
            const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data as never);
            nativeFs.writeFileSync(descriptor, buffer.subarray(0, Math.max(1, buffer.length / 2)));
            throw new Error('actual partial write failure');
          }
          nativeFs.writeFileSync(descriptor, data);
        },
        fsyncSync(descriptor: number) {
          const pathValue = paths.get(descriptor);
          if (!injected && failure === 'fsync' && pathValue?.endsWith('analysis-report.json.tmp')) {
            injected = true;
            throw new Error('actual fsync failure');
          }
          nativeFs.fsyncSync(descriptor);
        },
        closeSync(descriptor: number) {
          const pathValue = paths.get(descriptor);
          if (!injected && failure === 'close' && pathValue?.endsWith('analysis-report.json.tmp')) {
            injected = true;
            nativeFs.closeSync(descriptor);
            paths.delete(descriptor);
            throw new Error('actual close failure');
          }
          paths.delete(descriptor);
          nativeFs.closeSync(descriptor);
        },
      };

      expect(() => writeCase(reportDir, ENVELOPE_A, { fs })).toThrow(SurveyOutputError);
      expect(injected).toBe(true);
      expect(readdirSync(reportDir)).toEqual([]);
    }
  });

  it('checks the injected directory identity after the operation hook and before the syscall', () => {
    const reportDir = resolveSurveyReportDirectory({
      target: project,
      reportValue: join(outside, 'directory-swap'),
      cwd: root,
    });
    let swapOnce = false;
    let injected = false;
    const fakeRealpath = ((pathValue: nativeFs.PathLike) => (
      nativeFs.realpathSync(pathValue)
    )) as typeof nativeFs.realpathSync;
    fakeRealpath.native = (pathValue: nativeFs.PathLike) => {
      const actual = nativeFs.realpathSync.native(pathValue);
      if (swapOnce
        && isAbsolute(String(pathValue))
        && resolve(String(pathValue)) === reportDir) {
        swapOnce = false;
        injected = true;
        return `${actual}-replaced`;
      }
      return actual;
    };
    const fs = {
      ...nativeFs,
      realpathSync: fakeRealpath,
    };

    expect(() => writeCase(reportDir, ENVELOPE_A, {
      fs,
      onOperation: (name: string) => {
        if (name === 'journal:open') swapOnce = true;
      },
    })).toThrow(expect.objectContaining({ code: 'unsafe-output-path' }));
    expect(injected).toBe(true);
    expect(readdirSync(reportDir)).toEqual([]);
  });

  it('checks directory identity again immediately after each filesystem syscall', () => {
    const reportDir = resolveSurveyReportDirectory({
      target: project,
      reportValue: join(outside, 'directory-postcondition'),
      cwd: root,
    });
    let armed = false;
    let absoluteChecks = 0;
    let injected = false;
    const fakeRealpath = ((pathValue: nativeFs.PathLike) => (
      nativeFs.realpathSync(pathValue)
    )) as typeof nativeFs.realpathSync;
    fakeRealpath.native = (pathValue: nativeFs.PathLike) => {
      const actual = nativeFs.realpathSync.native(pathValue);
      if (armed
        && isAbsolute(String(pathValue))
        && resolve(String(pathValue)) === reportDir) {
        absoluteChecks += 1;
        if (absoluteChecks === 2) {
          injected = true;
          return `${actual}-postcondition-mismatch`;
        }
      }
      return actual;
    };
    const fs = { ...nativeFs, realpathSync: fakeRealpath };

    expect(() => writeCase(reportDir, ENVELOPE_A, {
      fs,
      onOperation: (name: string) => {
        if (name === 'journal:open') {
          armed = true;
          absoluteChecks = 0;
        } else if (armed) {
          armed = false;
        }
      },
    })).toThrow(expect.objectContaining({ code: 'unsafe-output-path' }));
    expect(injected).toBe(true);
    expect(absoluteChecks).toBe(2);
    expect(readdirSync(reportDir).some(name => name.startsWith('.appforge-survey-journal-')))
      .toBe(true);
  });

  it('keeps a late filesystem call bound to the entered directory during a rename race', () => {
    const reportDir = resolveSurveyReportDirectory({
      target: project,
      reportValue: join(outside, 'bound-directory-race'),
      cwd: root,
    });
    const moved = `${reportDir}-moved`;
    let attempted = false;
    let swapped = false;
    let deniedCode: string | undefined;
    const fs = {
      ...nativeFs,
      openSync(pathValue: nativeFs.PathLike, flags: nativeFs.OpenMode, mode?: nativeFs.Mode) {
        if (!attempted && String(pathValue).endsWith('.lock')) {
          attempted = true;
          try {
            nativeFs.renameSync(reportDir, moved);
            nativeFs.mkdirSync(reportDir);
            swapped = true;
          } catch (error) {
            deniedCode = (error as NodeJS.ErrnoException).code;
          }
        }
        return nativeFs.openSync(pathValue, flags, mode);
      },
    };
    let failure: unknown;
    try {
      writeCase(reportDir, ENVELOPE_A, { fs });
    } catch (error) {
      failure = error;
    }

    expect(attempted).toBe(true);
    if (swapped) {
      expect(failure).toMatchObject({ code: 'unsafe-output-path' });
      expect(readdirSync(reportDir)).toEqual([]);
      expect(readdirSync(moved).some(name => name.endsWith('.lock'))).toBe(true);
    } else {
      expect(['EBUSY', 'EPERM']).toContain(deniedCode);
      expect(failure).toBeUndefined();
      expect(existsSync(join(reportDir, 'analysis-report.json'))).toBe(true);
      expect(readdirSync(reportDir).filter(name => name.startsWith('.appforge-'))).toEqual([]);
    }
  });

  it('builds a unique lexical advisory-only baseline and excludes BLOCK findings', () => {
    const value = outputCase(realpathSync.native(outside), ENVELOPE_A);
    const warning = value.report.findings.find(finding => finding.severity !== 'BLOCK');
    expect(warning).toBeDefined();
    // Keep one advisory finding (3.18 added a second, superseded-control-type,
    // to this fixture) so the duplicate and BLOCK cases below stay isolated.
    value.report.findings = value.report.findings
      .filter(finding => finding === warning || finding.severity === 'BLOCK');
    value.report.findings.push(structuredClone(warning!));
    value.report.findings.push({
      ...structuredClone(warning!),
      fingerprint: 'ffffffffffffffff',
      severity: 'BLOCK',
    });

    const baseline = createAnalysisBaseline(value.report, NOW);
    expect(baseline.entries).toEqual([
      {
        fingerprint: warning!.fingerprint,
        rule: warning!.rule,
        accepted_at: NOW,
      },
    ]);
    expect(() => assertEmittableBaseline(baseline)).not.toThrow();
  });

  // On Windows a report written through a case-divergent --report spelling
  // stores an envelope path that names the same file with different casing.
  // Exact string equality would refuse that submission; the preflight already
  // compares with a case-folding pathKey, and the update seam must agree.
  it.skipIf(process.platform !== 'win32')(
    'accepts a case-divergent stored envelope path the way the submit preflight does',
    () => {
      const reportDir = resolveSurveyReportDirectory({
        target: project,
        reportValue: join(outside, 'case-divergent-submit'),
        cwd: root,
      });
      const value = outputCase(reportDir, ENVELOPE_A);
      const written = writeCase(reportDir, ENVELOPE_A);

      const stored = JSON.parse(readFileSync(written.reportPath, 'utf8'));
      const divergent = stored.envelope.path.replace(
        'case-divergent-submit',
        'CASE-DIVERGENT-SUBMIT',
      );
      expect(divergent).not.toBe(stored.envelope.path);
      expect(divergent.toLowerCase()).toBe(stored.envelope.path.toLowerCase());
      stored.envelope.path = divergent;
      writeFileSync(written.reportPath, `${JSON.stringify(stored, null, 2)}\n`, 'utf8');

      const updated = replaceSubmissionReport({
        reportPath: written.reportPath,
        expectedEnvelope: value.envelope,
        transition: { state: 'acknowledged', attempted_at: NOW },
        core: outputCore,
      }, {
        invocationId: () => 'c0000000-0000-4000-8000-000000000000',
      });

      expect(updated.report.envelope.submission).toEqual({
        state: 'acknowledged',
        attempted_at: NOW,
      });
      expect(updated.report.envelope.path).toBe(divergent);
    },
  );

  it('atomically replaces only submission state and preserves envelope bytes', () => {
    const reportDir = resolveSurveyReportDirectory({
      target: project,
      reportValue: join(outside, 'submission-update'),
      cwd: root,
    });
    const value = outputCase(reportDir, ENVELOPE_A);
    const written = writeCase(reportDir, ENVELOPE_A);
    const envelopeBefore = readFileSync(written.envelopePath).toString('base64');
    const beforeUnknownTransition = directoryBytes(reportDir);

    expect(() => replaceSubmissionReport({
      reportPath: written.reportPath,
      expectedEnvelope: value.envelope,
      transition: {
        state: 'acknowledged',
        attempted_at: NOW,
        raw_response: 'customer-secret',
      },
      core: outputCore,
    })).toThrow(expect.objectContaining({ code: 'report-update-refused' }));
    expect(directoryBytes(reportDir)).toEqual(beforeUnknownTransition);

    const updated = replaceSubmissionReport({
      reportPath: written.reportPath,
      expectedEnvelope: value.envelope,
      transition: { state: 'acknowledged', attempted_at: NOW },
      core: outputCore,
    }, {
      invocationId: () => 'a0000000-0000-4000-8000-000000000000',
    });

    expect(readFileSync(written.reportPath, 'utf8')).toBe(updated.reportBytes);
    expect(updated.report.envelope.submission).toEqual({
      state: 'acknowledged',
      attempted_at: NOW,
    });
    expect(readFileSync(written.envelopePath).toString('base64')).toBe(envelopeBefore);
    for (const transition of [
      { state: 'acknowledged', attempted_at: 'not-a-timestamp' },
      { state: 'acknowledged', attempted_at: 17 },
    ]) {
      const beforeMalformedReplay = directoryBytes(reportDir);
      expect(() => replaceSubmissionReport({
        reportPath: written.reportPath,
        expectedEnvelope: value.envelope,
        transition,
        core: outputCore,
      })).toThrow(expect.objectContaining({ code: 'report-update-refused' }));
      expect(directoryBytes(reportDir)).toEqual(beforeMalformedReplay);
    }
    const beforeIdempotentReplay = directoryBytes(reportDir);
    const idempotentReplay = replaceSubmissionReport({
      reportPath: written.reportPath,
      expectedEnvelope: value.envelope,
      transition: {
        state: 'acknowledged',
        attempted_at: '2026-08-30T09:00:00.000Z',
      },
      core: outputCore,
    });
    expect(idempotentReplay.reportBytes).toBe(updated.reportBytes);
    expect(directoryBytes(reportDir)).toEqual(beforeIdempotentReplay);

    const beforeTerminalFailure = directoryBytes(reportDir);
    const terminalGeneration = (() => {
      const stat = nativeFs.lstatSync(written.reportPath);
      return {
        dev: stat.dev,
        ino: stat.ino,
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        ctimeMs: stat.ctimeMs,
      };
    })();
    const terminalOperations: string[] = [];
    const terminalFailure = replaceSubmissionReport({
      reportPath: written.reportPath,
      expectedEnvelope: value.envelope,
      transition: { state: 'failed', attempted_at: NOW, error_code: 'network-error' },
      acceptAcknowledgedAsTerminal: true,
      core: outputCore,
    }, {
      onOperation: (name: string) => terminalOperations.push(name),
    });
    expect(terminalFailure.report.envelope.submission.state).toBe('acknowledged');
    expect((() => {
      const stat = nativeFs.lstatSync(written.reportPath);
      return {
        dev: stat.dev,
        ino: stat.ino,
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        ctimeMs: stat.ctimeMs,
      };
    })()).toEqual(terminalGeneration);
    expect(directoryBytes(reportDir)).toEqual(beforeTerminalFailure);
    expect(terminalOperations.filter(name => (
      /^report-update:(?:journal|report|backup-rename|publish-rename|verify|final-verify|commit|rollback)(?::|$)/u
        .test(name)
    ))).toEqual([]);

    const beforeIllegal = directoryBytes(reportDir);
    expect(() => replaceSubmissionReport({
      reportPath: written.reportPath,
      expectedEnvelope: value.envelope,
      transition: { state: 'failed', attempted_at: NOW, error_code: 'network-error' },
      core: outputCore,
    })).toThrow(expect.objectContaining({ code: 'report-update-refused' }));
    expect(directoryBytes(reportDir)).toEqual(beforeIllegal);
  });

  it('enforces every submission-state transition and treats acknowledged replay as a no-op', () => {
    const states = ['not_requested', 'pending', 'acknowledged', 'failed'] as const;
    const legal = new Set([
      'not_requested>pending',
      'not_requested>acknowledged',
      'not_requested>failed',
      'pending>acknowledged',
      'pending>failed',
      'failed>pending',
      'failed>acknowledged',
      'failed>failed',
      'acknowledged>acknowledged',
    ]);
    const submission = (state: typeof states[number]) => ({
      not_requested: { state: 'not_requested' },
      pending: { state: 'pending' },
      acknowledged: { state: 'acknowledged', attempted_at: NOW },
      failed: { state: 'failed', attempted_at: NOW, error_code: 'network-error' },
    })[state];

    for (const [fromIndex, from] of states.entries()) {
      for (const [toIndex, to] of states.entries()) {
        const reportDir = resolveSurveyReportDirectory({
          target: project,
          reportValue: join(outside, `transition-${fromIndex}-${toIndex}`),
          cwd: root,
        });
        const value = outputCase(reportDir, ENVELOPE_A);
        const written = writeCase(reportDir, ENVELOPE_A);
        const current = JSON.parse(readFileSync(written.reportPath, 'utf8'));
        current.envelope.submission = submission(from);
        writeFileSync(written.reportPath, `${JSON.stringify(current, null, 2)}\n`);
        const before = directoryBytes(reportDir);
        const update = () => replaceSubmissionReport({
          reportPath: written.reportPath,
          expectedEnvelope: value.envelope,
          transition: submission(to),
          core: outputCore,
        });
        const key = `${from}>${to}`;
        if (legal.has(key)) {
          const updated = update();
          expect(updated.report.envelope.submission.state).toBe(to);
          if (key === 'acknowledged>acknowledged') {
            expect(directoryBytes(reportDir)).toEqual(before);
          }
        } else {
          expect(update).toThrow(expect.objectContaining({ code: 'report-update-refused' }));
          expect(directoryBytes(reportDir)).toEqual(before);
        }
      }
    }
  });

  it.each(['backup', 'final'] as const)(
    'never overwrites a report-update %s destination inserted at publication',
    (kind) => {
      const reportDir = resolveSurveyReportDirectory({
        target: project,
        reportValue: join(outside, `report-update-publication-${kind}-generation`),
        cwd: root,
      });
      const value = outputCase(reportDir, ENVELOPE_A);
      const written = writeCase(reportDir, ENVELOPE_A);
      const invocationId = kind === 'backup'
        ? 'a0050000-0000-4000-8000-000000000000'
        : 'a0060000-0000-4000-8000-000000000000';
      const destination = kind === 'backup'
        ? join(reportDir, `.appforge-submit-${invocationId}-analysis-report.json.bak`)
        : written.reportPath;
      const operation = kind === 'backup'
        ? 'report-update:backup-rename'
        : 'report-update:publish-rename';
      const sentinel = Buffer.from(`unowned report-update ${kind} destination`, 'utf8');
      let inserted = false;
      const fs = {
        ...nativeFs,
        renameSync(oldPath: nativeFs.PathLike, newPath: nativeFs.PathLike) {
          if (inserted && resolve(String(newPath)) === destination && existsSync(destination)) {
            // Emulate POSIX rename-overwrite semantics on the Windows test host.
            nativeFs.unlinkSync(destination);
          }
          return nativeFs.renameSync(oldPath, newPath);
        },
      };

      expect(() => replaceSubmissionReport({
        reportPath: written.reportPath,
        expectedEnvelope: value.envelope,
        transition: { state: 'acknowledged', attempted_at: NOW },
        core: outputCore,
      }, {
        fs,
        invocationId: () => invocationId,
        onOperation: (name: string) => {
          if (!inserted && name === operation) {
            inserted = true;
            nativeFs.writeFileSync(destination, sentinel, { flag: 'wx' });
          }
        },
      })).toThrow(SurveyOutputError);
      expect(inserted).toBe(true);
      expect(readFileSync(destination)).toEqual(sentinel);
    },
  );

  it('finishes report-update backup capture before immediate rollback', () => {
    const reportDir = resolveSurveyReportDirectory({
      target: project,
      reportValue: join(outside, 'report-update-backup-capture-cleanup-failure'),
      cwd: root,
    });
    const value = outputCase(reportDir, ENVELOPE_A);
    const written = writeCase(reportDir, ENVELOPE_A);
    const before = directoryBytes(reportDir);
    const invocationId = 'a0070000-0000-4000-8000-000000000000';
    const generationPath = join(
      reportDir,
      `.appforge-submit-${invocationId}-analysis-report.json.bak.capture`,
      'generation',
    );
    let armed = false;
    let injected = false;
    const fs = {
      ...nativeFs,
      unlinkSync(pathValue: nativeFs.PathLike) {
        if (!injected && armed && resolve(String(pathValue)) === generationPath) {
          injected = true;
          throw new Error('injected report-update backup capture cleanup failure');
        }
        return nativeFs.unlinkSync(pathValue);
      },
    };

    expect(() => replaceSubmissionReport({
      reportPath: written.reportPath,
      expectedEnvelope: value.envelope,
      transition: { state: 'acknowledged', attempted_at: NOW },
      core: outputCore,
    }, {
      fs,
      invocationId: () => invocationId,
      onOperation: (name: string) => {
        armed = name === 'report-update:backup-rename';
      },
    })).toThrow(SurveyOutputError);
    expect(injected).toBe(true);
    expect(directoryBytes(reportDir)).toEqual(before);
  });

  it('recovers a report-update journal temp stranded inside deletion quarantine', () => {
    const reportDir = resolveSurveyReportDirectory({
      target: project,
      reportValue: join(outside, 'report-update-journal-temp-delete-crash'),
      cwd: root,
    });
    const value = outputCase(reportDir, ENVELOPE_A);
    const written = writeCase(reportDir, ENVELOPE_A);
    const invocationId = 'a0072500-0000-4000-8000-000000000000';
    const journalTempPath = join(
      reportDir,
      `.appforge-submit-journal-${invocationId}.tmp`,
    );
    const generationPath = join(`${journalTempPath}.delete`, 'generation');
    let stranded = false;
    const fs = {
      ...nativeFs,
      unlinkSync(pathValue: nativeFs.PathLike) {
        if (!stranded && resolve(String(pathValue)) === generationPath) {
          stranded = true;
          throw new Error('simulate process loss after report journal-temp capture');
        }
        return nativeFs.unlinkSync(pathValue);
      },
    };

    expect(() => replaceSubmissionReport({
      reportPath: written.reportPath,
      expectedEnvelope: value.envelope,
      transition: { state: 'acknowledged', attempted_at: NOW },
      core: outputCore,
    }, {
      fs,
      invocationId: () => invocationId,
      onOperation: (name: string) => {
        if (name === 'report-update:journal:link') {
          throw new Error('force report-update pre-journal rollback');
        }
      },
    })).toThrow(SurveyOutputError);
    expect(stranded).toBe(true);
    expect(readFileSync(generationPath).length).toBeGreaterThan(0);

    replaceSubmissionReport({
      reportPath: written.reportPath,
      expectedEnvelope: value.envelope,
      transition: { state: 'acknowledged', attempted_at: NOW },
      core: outputCore,
    }, {
      invocationId: () => 'a0072500-0000-4000-8000-000000000001',
    });
    expect(readdirSync(reportDir).filter(name => name.startsWith('.appforge-'))).toEqual([]);
  });

  it('preserves a replacement installed inside report-update temp cleanup', () => {
    const reportDir = resolveSurveyReportDirectory({
      target: project,
      reportValue: join(outside, 'report-update-publish-temp-cleanup-aba'),
      cwd: root,
    });
    const value = outputCase(reportDir, ENVELOPE_A);
    const written = writeCase(reportDir, ENVELOPE_A);
    const reportBefore = readFileSync(written.reportPath);
    const invocationId = 'a0075000-0000-4000-8000-000000000000';
    const tempPath = join(
      reportDir,
      `.appforge-submit-${invocationId}-analysis-report.json.tmp`,
    );
    const quarantineGeneration = join(`${tempPath}.delete`, 'generation');
    const replacement = Buffer.from('replacement report-update temp generation', 'utf8');
    let armed = false;
    let replaced = false;
    const replaceSource = () => {
      nativeFs.unlinkSync(tempPath);
      nativeFs.writeFileSync(tempPath, replacement, { flag: 'wx' });
      replaced = true;
    };
    const fs = {
      ...nativeFs,
      unlinkSync(pathValue: nativeFs.PathLike) {
        if (!replaced && armed && resolve(String(pathValue)) === tempPath) replaceSource();
        return nativeFs.unlinkSync(pathValue);
      },
      renameSync(oldPath: nativeFs.PathLike, newPath: nativeFs.PathLike) {
        if (!replaced
          && armed
          && resolve(String(oldPath)) === tempPath
          && resolve(String(newPath)) === quarantineGeneration) replaceSource();
        return nativeFs.renameSync(oldPath, newPath);
      },
    };

    expect(() => replaceSubmissionReport({
      reportPath: written.reportPath,
      expectedEnvelope: value.envelope,
      transition: { state: 'acknowledged', attempted_at: NOW },
      core: outputCore,
    }, {
      fs,
      invocationId: () => invocationId,
      onOperation: (name: string) => {
        armed = name === 'report-update:publish-rename';
      },
    })).toThrow(SurveyOutputError);
    expect(replaced).toBe(true);
    expect(readFileSync(written.reportPath)).toEqual(reportBefore);
    expect(readFileSync(tempPath)).toEqual(replacement);
  });

  it('reconciles a committed survey journal before a report-only transition', () => {
    const reportDir = resolveSurveyReportDirectory({
      target: project,
      reportValue: join(outside, 'survey-then-submit-recovery'),
      cwd: root,
    });
    writeCase(reportDir, ENVELOPE_A);
    const value = outputCase(reportDir, ENVELOPE_B);
    const written = writeCase(reportDir, ENVELOPE_B, {
      invocationId: () => 'a0100000-0000-4000-8000-000000000000',
      onOperation: (name: string) => {
        if (name === 'commit:report-technical.md:remove-backup') {
          throw new Error('leave committed survey journal');
        }
      },
    });
    expect(readdirSync(reportDir).some(name => name.startsWith('.appforge-survey-journal-')))
      .toBe(true);

    replaceSubmissionReport({
      reportPath: written.reportPath,
      expectedEnvelope: value.envelope,
      transition: { state: 'acknowledged', attempted_at: NOW },
      core: outputCore,
    });

    expect(JSON.parse(readFileSync(written.reportPath, 'utf8')).envelope).toMatchObject({
      id: ENVELOPE_B,
      submission: { state: 'acknowledged', attempted_at: NOW },
    });
    expect(readdirSync(reportDir).filter(name => name.startsWith('.appforge-'))).toEqual([]);
  });

  it('reconciles a committed report-update journal before a whole artifact publication', () => {
    const reportDir = resolveSurveyReportDirectory({
      target: project,
      reportValue: join(outside, 'submit-then-survey-recovery'),
      cwd: root,
    });
    const value = outputCase(reportDir, ENVELOPE_A);
    const written = writeCase(reportDir, ENVELOPE_A);
    replaceSubmissionReport({
      reportPath: written.reportPath,
      expectedEnvelope: value.envelope,
      transition: { state: 'acknowledged', attempted_at: NOW },
      core: outputCore,
    }, {
      invocationId: () => 'a0200000-0000-4000-8000-000000000000',
      onOperation: (name: string) => {
        if (name === 'report-update:commit:remove-backup') {
          throw new Error('leave committed report-update journal');
        }
      },
    });
    expect(readdirSync(reportDir).some(name => name.startsWith('.appforge-submit-journal-')))
      .toBe(true);

    writeCase(reportDir, ENVELOPE_B);

    expect(JSON.parse(readFileSync(written.reportPath, 'utf8')).envelope).toMatchObject({
      id: ENVELOPE_B,
      submission: { state: 'not_requested' },
    });
    expect(readdirSync(reportDir).filter(name => name.startsWith('.appforge-'))).toEqual([]);
  });

  it('fails closed when report-update recovery sees a third-generation report', () => {
    const reportDir = resolveSurveyReportDirectory({
      target: project,
      reportValue: join(outside, 'third-generation-report'),
      cwd: root,
    });
    const first = outputCase(reportDir, ENVELOPE_A);
    const written = writeCase(reportDir, ENVELOPE_A);
    replaceSubmissionReport({
      reportPath: written.reportPath,
      expectedEnvelope: first.envelope,
      transition: { state: 'acknowledged', attempted_at: NOW },
      core: outputCore,
    }, {
      invocationId: () => 'a0300000-0000-4000-8000-000000000000',
      onOperation: (name: string) => {
        if (name === 'report-update:commit:remove-backup') {
          throw new Error('leave committed report-update journal');
        }
      },
    });
    const third = outputCase(reportDir, ENVELOPE_B);
    writeFileSync(written.reportPath, `${JSON.stringify(third.report, null, 2)}\n`);
    const before = directoryBytes(reportDir);

    expect(() => replaceSubmissionReport({
      reportPath: written.reportPath,
      expectedEnvelope: third.envelope,
      transition: { state: 'acknowledged', attempted_at: NOW },
      core: outputCore,
    })).toThrow(expect.objectContaining({ code: 'report-update-recovery-failed' }));
    expect(directoryBytes(reportDir)).toEqual(before);
  });

  it('fails closed when a report-update recovery temp does not match its journal', () => {
    const reportDir = resolveSurveyReportDirectory({
      target: project,
      reportValue: join(outside, 'mismatched-report-update-temp'),
      cwd: root,
    });
    const value = outputCase(reportDir, ENVELOPE_A);
    const written = writeCase(reportDir, ENVELOPE_A);
    const invocationId = 'a0400000-0000-4000-8000-000000000000';
    const prefix = `.appforge-submit-${invocationId}`;
    const tempName = `${prefix}-analysis-report.json.tmp`;
    const journalName = `.appforge-submit-journal-${invocationId}.json`;
    writeFileSync(join(reportDir, tempName), 'tampered recovery temp');
    writeFileSync(join(reportDir, journalName), `${JSON.stringify({
      journal_schema: 'survey-report-update-journal/1',
      report_final: 'analysis-report.json',
      report_temp: tempName,
      report_backup: `${prefix}-analysis-report.json.bak`,
      old_sha256: digest(readFileSync(written.reportPath)),
      new_sha256: '1'.repeat(64),
    }, null, 2)}\n`);
    const before = directoryBytes(reportDir);

    expect(() => replaceSubmissionReport({
      reportPath: written.reportPath,
      expectedEnvelope: value.envelope,
      transition: { state: 'acknowledged', attempted_at: NOW },
      core: outputCore,
    })).toThrow(expect.objectContaining({ code: 'report-update-recovery-failed' }));
    expect(directoryBytes(reportDir)).toEqual(before);
  });

  it('rolls back every report-update filesystem syscall and never changes the envelope', () => {
    const failures = [
      ['report-update:journal:open', 'openSync'],
      ['report-update:journal:write', 'writeFileSync'],
      ['report-update:journal:flush', 'fsyncSync'],
      ['report-update:journal:close', 'closeSync'],
      ['report-update:journal:link', 'linkSync'],
      ['report-update:journal:unlink-temp', 'unlinkSync'],
      ['report-update:report:open', 'openSync'],
      ['report-update:report:write', 'writeFileSync'],
      ['report-update:report:flush', 'fsyncSync'],
      ['report-update:report:close', 'closeSync'],
      ['report-update:verify:read', 'readFileSync'],
      ['report-update:backup-rename', 'renameSync'],
      ['report-update:publish-rename', 'linkSync'],
      ['report-update:final-verify:read', 'readFileSync'],
    ] as const;

    failures.forEach(([failedOperation, method], index) => {
      const reportDir = resolveSurveyReportDirectory({
        target: project,
        reportValue: join(outside, `report-update-failure-${index}`),
        cwd: root,
      });
      const value = outputCase(reportDir, ENVELOPE_A);
      const written = writeCase(reportDir, ENVELOPE_A);
      const before = directoryBytes(reportDir);
      const envelopeBefore = readFileSync(written.envelopePath).toString('base64');
      let armed = false;
      let injected = false;
      const fail = <T extends (...args: any[]) => any>(
        methodName: string,
        implementation: T,
      ): T => ((...args: Parameters<T>) => {
        if (!injected && armed && method === methodName) {
          injected = true;
          if (methodName === 'closeSync') implementation(...args);
          throw new Error(`actual ${methodName} failure`);
        }
        return implementation(...args);
      }) as T;
      const fs = {
        ...nativeFs,
        openSync: fail('openSync', nativeFs.openSync),
        writeFileSync: fail('writeFileSync', nativeFs.writeFileSync),
        fsyncSync: fail('fsyncSync', nativeFs.fsyncSync),
        closeSync: fail('closeSync', nativeFs.closeSync),
        linkSync: fail('linkSync', nativeFs.linkSync),
        unlinkSync: fail('unlinkSync', nativeFs.unlinkSync),
        readFileSync: fail('readFileSync', nativeFs.readFileSync),
        renameSync: fail('renameSync', nativeFs.renameSync),
      };

      expect(() => replaceSubmissionReport({
        reportPath: written.reportPath,
        expectedEnvelope: value.envelope,
        transition: { state: 'acknowledged', attempted_at: NOW },
        core: outputCore,
      }, {
        fs,
        invocationId: () => `a1000000-0000-4000-8000-${index.toString().padStart(12, '0')}`,
        onOperation: (name: string) => {
          armed = name === failedOperation;
        },
      })).toThrow(SurveyOutputError);
      expect(injected).toBe(true);
      expect(readFileSync(written.envelopePath).toString('base64')).toBe(envelopeBefore);
      expect(directoryBytes(reportDir)).toEqual(before);
    });
  });

  it('preserves an unowned final report generation during report-update rollback', () => {
    const reportDir = resolveSurveyReportDirectory({
      target: project,
      reportValue: join(outside, 'unowned-report-update-generation'),
      cwd: root,
    });
    const value = outputCase(reportDir, ENVELOPE_A);
    const written = writeCase(reportDir, ENVELOPE_A);
    const envelopeBefore = readFileSync(written.envelopePath).toString('base64');
    const thirdGeneration = Buffer.from('unowned report-update generation', 'utf8');
    let armed = false;
    let replaced = false;
    const fs = {
      ...nativeFs,
      readFileSync(pathValue: nativeFs.PathOrFileDescriptor, options?: unknown) {
        if (!replaced
          && armed
          && typeof pathValue === 'string'
          && resolve(pathValue) === written.reportPath) {
          replaced = true;
          nativeFs.writeFileSync(pathValue, thirdGeneration);
        }
        return nativeFs.readFileSync(pathValue, options as never);
      },
    };

    expect(() => replaceSubmissionReport({
      reportPath: written.reportPath,
      expectedEnvelope: value.envelope,
      transition: { state: 'acknowledged', attempted_at: NOW },
      core: outputCore,
    }, {
      fs,
      invocationId: () => 'a1100000-0000-4000-8000-000000000000',
      onOperation: (name: string) => {
        armed = name === 'report-update:final-verify:read';
      },
    })).toThrow(expect.objectContaining({ code: 'report-update-rollback-failed' }));
    expect(replaced).toBe(true);
    expect(readFileSync(written.reportPath)).toEqual(thirdGeneration);
    expect(readFileSync(written.envelopePath).toString('base64')).toBe(envelopeBefore);
    expect(readdirSync(reportDir).some(name => name.startsWith('.appforge-submit-journal-')))
      .toBe(true);
    expect(readdirSync(reportDir).some(name => name.endsWith('analysis-report.json.bak')))
      .toBe(true);
  });

  it('rechecks final ownership inside the report-update rollback removal action', () => {
    const reportDir = resolveSurveyReportDirectory({
      target: project,
      reportValue: join(outside, 'report-update-remove-generation'),
      cwd: root,
    });
    const value = outputCase(reportDir, ENVELOPE_A);
    const written = writeCase(reportDir, ENVELOPE_A);
    const thirdGeneration = Buffer.from('late report-update rollback generation', 'utf8');
    let forced = false;
    let replaced = false;

    expect(() => replaceSubmissionReport({
      reportPath: written.reportPath,
      expectedEnvelope: value.envelope,
      transition: { state: 'acknowledged', attempted_at: NOW },
      core: outputCore,
    }, {
      invocationId: () => 'a1200000-0000-4000-8000-000000000000',
      onOperation: (name: string) => {
        if (!forced && name === 'report-update:final-verify:read') {
          forced = true;
          throw new Error('force report-update rollback after publication');
        }
        if (!replaced && name === 'report-update:rollback:remove-new') {
          replaced = true;
          nativeFs.writeFileSync(written.reportPath, thirdGeneration);
        }
      },
    })).toThrow(expect.objectContaining({ code: 'report-update-rollback-failed' }));
    expect({ forced, replaced }).toEqual({ forced: true, replaced: true });
    expect(readFileSync(written.reportPath)).toEqual(thirdGeneration);
    expect(readdirSync(reportDir).some(name => name.startsWith('.appforge-submit-journal-')))
      .toBe(true);
    expect(readdirSync(reportDir).some(name => name.endsWith('analysis-report.json.bak')))
      .toBe(true);
  });

  it('retains report-update recovery metadata when a final appears after quarantine capture', () => {
    const reportDir = resolveSurveyReportDirectory({
      target: project,
      reportValue: join(outside, 'report-update-post-capture-generation'),
      cwd: root,
    });
    const value = outputCase(reportDir, ENVELOPE_A);
    const written = writeCase(reportDir, ENVELOPE_A);
    const invocationId = 'a1205000-0000-4000-8000-000000000000';
    const quarantineGeneration = join(
      `${join(reportDir, `.appforge-submit-${invocationId}-analysis-report.json.tmp`)}.remove`,
      'generation',
    );
    const thirdGeneration = Buffer.from('post-capture report-update generation', 'utf8');
    let forced = false;
    let inserted = false;
    const fs = {
      ...nativeFs,
      unlinkSync(pathValue: nativeFs.PathLike) {
        if (!inserted && resolve(String(pathValue)) === quarantineGeneration) {
          nativeFs.writeFileSync(written.reportPath, thirdGeneration, { flag: 'wx' });
          inserted = true;
        }
        return nativeFs.unlinkSync(pathValue);
      },
    };

    expect(() => replaceSubmissionReport({
      reportPath: written.reportPath,
      expectedEnvelope: value.envelope,
      transition: { state: 'acknowledged', attempted_at: NOW },
      core: outputCore,
    }, {
      fs,
      invocationId: () => invocationId,
      onOperation: (name: string) => {
        if (!forced && name === 'report-update:final-verify:read') {
          forced = true;
          throw new Error('force report-update rollback after publication');
        }
      },
    })).toThrow(expect.objectContaining({ code: 'report-update-rollback-failed' }));
    expect({ forced, inserted }).toEqual({ forced: true, inserted: true });
    expect(readFileSync(written.reportPath)).toEqual(thirdGeneration);
    expect(readdirSync(reportDir).some(name => name.startsWith('.appforge-submit-journal-')))
      .toBe(true);
    expect(readdirSync(reportDir).some(name => name.endsWith('analysis-report.json.bak')))
      .toBe(true);
  });

  it('never overwrites a newer final during report-update rollback restore', () => {
    const reportDir = resolveSurveyReportDirectory({
      target: project,
      reportValue: join(outside, 'report-update-rollback-restore-race'),
      cwd: root,
    });
    const value = outputCase(reportDir, ENVELOPE_A);
    const written = writeCase(reportDir, ENVELOPE_A);
    const thirdGeneration = Buffer.from('newer report-update rollback generation', 'utf8');
    let forced = false;
    let replaced = false;

    expect(() => replaceSubmissionReport({
      reportPath: written.reportPath,
      expectedEnvelope: value.envelope,
      transition: { state: 'acknowledged', attempted_at: NOW },
      core: outputCore,
    }, {
      invocationId: () => 'a1210000-0000-4000-8000-000000000000',
      onOperation: (name: string) => {
        if (!forced && name === 'report-update:final-verify:read') {
          forced = true;
          throw new Error('force report-update rollback after publication');
        }
        if (!replaced && name === 'report-update:rollback:restore') {
          replaced = true;
          nativeFs.writeFileSync(written.reportPath, thirdGeneration, { flag: 'wx' });
        }
      },
    })).toThrow(expect.objectContaining({ code: 'report-update-rollback-failed' }));
    expect({ forced, replaced }).toEqual({ forced: true, replaced: true });
    expect(readFileSync(written.reportPath)).toEqual(thirdGeneration);
    expect(readdirSync(reportDir).some(name => name.startsWith('.appforge-submit-journal-')))
      .toBe(true);
    expect(readdirSync(reportDir).some(name => name.endsWith('analysis-report.json.bak')))
      .toBe(true);
  });

  it('never overwrites a newer final during report-update recovery restore', () => {
    const reportDir = resolveSurveyReportDirectory({
      target: project,
      reportValue: join(outside, 'report-update-recovery-restore-race'),
      cwd: root,
    });
    const value = outputCase(reportDir, ENVELOPE_A);
    const written = writeCase(reportDir, ENVELOPE_A);
    let forced = false;
    let stranded = false;
    expect(() => replaceSubmissionReport({
      reportPath: written.reportPath,
      expectedEnvelope: value.envelope,
      transition: { state: 'acknowledged', attempted_at: NOW },
      core: outputCore,
    }, {
      invocationId: () => 'a1220000-0000-4000-8000-000000000000',
      onOperation: (name: string) => {
        if (!forced && name === 'report-update:publish-rename') {
          forced = true;
          throw new Error('force rollback before report-update publication');
        }
        if (!stranded && name === 'report-update:rollback:restore') {
          stranded = true;
          throw new Error('leave report-update backup for recovery');
        }
      },
    })).toThrow(expect.objectContaining({ code: 'report-update-rollback-failed' }));
    expect({ forced, stranded }).toEqual({ forced: true, stranded: true });

    const thirdGeneration = Buffer.from('newer report-update recovery generation', 'utf8');
    let replaced = false;
    expect(() => writeCase(reportDir, ENVELOPE_B, {
      invocationId: () => 'a1220000-0000-4000-8000-000000000001',
      onOperation: (name: string) => {
        if (!replaced && name === 'report-update:recovery:restore') {
          replaced = true;
          nativeFs.writeFileSync(written.reportPath, thirdGeneration, { flag: 'wx' });
        }
      },
    })).toThrow(expect.objectContaining({ code: 'report-update-recovery-failed' }));
    expect(replaced).toBe(true);
    expect(readFileSync(written.reportPath)).toEqual(thirdGeneration);
    expect(readdirSync(reportDir).some(name => name.startsWith('.appforge-submit-journal-')))
      .toBe(true);
    expect(readdirSync(reportDir).some(name => name.endsWith('analysis-report.json.bak')))
      .toBe(true);
  });

  it('never restores or deletes a backup replaced inside report-update recovery', () => {
    const reportDir = resolveSurveyReportDirectory({
      target: project,
      reportValue: join(outside, 'report-update-recovery-backup-generation'),
      cwd: root,
    });
    const value = outputCase(reportDir, ENVELOPE_A);
    const written = writeCase(reportDir, ENVELOPE_A);
    const invocationId = 'a1230000-0000-4000-8000-000000000000';
    let forced = false;
    let stranded = false;
    expect(() => replaceSubmissionReport({
      reportPath: written.reportPath,
      expectedEnvelope: value.envelope,
      transition: { state: 'acknowledged', attempted_at: NOW },
      core: outputCore,
    }, {
      invocationId: () => invocationId,
      onOperation: (name: string) => {
        if (!forced && name === 'report-update:publish-rename') {
          forced = true;
          throw new Error('force rollback before report-update publication');
        }
        if (!stranded && name === 'report-update:rollback:restore') {
          stranded = true;
          throw new Error('leave report-update backup for recovery');
        }
      },
    })).toThrow(expect.objectContaining({ code: 'report-update-rollback-failed' }));
    const backupPath = join(
      reportDir,
      `.appforge-submit-${invocationId}-analysis-report.json.bak`,
    );
    const replacement = Buffer.from('unowned report-update recovery backup', 'utf8');
    let replaced = false;

    expect(() => writeCase(reportDir, ENVELOPE_B, {
      invocationId: () => 'a1230000-0000-4000-8000-000000000001',
      onOperation: (name: string) => {
        if (!replaced && name === 'report-update:recovery:restore') {
          replaced = true;
          nativeFs.unlinkSync(backupPath);
          nativeFs.writeFileSync(backupPath, replacement, { flag: 'wx' });
        }
      },
    })).toThrow(expect.objectContaining({ code: 'report-update-recovery-failed' }));
    expect({ forced, stranded, replaced }).toEqual({
      forced: true,
      stranded: true,
      replaced: true,
    });
    expect(existsSync(written.reportPath)).toBe(false);
    expect(readFileSync(backupPath)).toEqual(replacement);
    expect(readdirSync(reportDir).some(name => name.startsWith('.appforge-submit-journal-')))
      .toBe(true);
  });

  it.each(['remove', 'restore'] as const)(
    'recovers a report-update crash after the %s helper has changed filesystem state',
    (state) => {
      const reportDir = resolveSurveyReportDirectory({
        target: project,
        reportValue: join(outside, `report-update-helper-crash-${state}`),
        cwd: root,
      });
      const value = outputCase(reportDir, ENVELOPE_A);
      const written = writeCase(reportDir, ENVELOPE_A);
      const invocationId = state === 'remove'
        ? 'a1260000-0000-4000-8000-000000000000'
        : 'a1270000-0000-4000-8000-000000000000';
      let forced = false;
      let stranded = false;
      expect(() => replaceSubmissionReport({
        reportPath: written.reportPath,
        expectedEnvelope: value.envelope,
        transition: { state: 'acknowledged', attempted_at: NOW },
        core: outputCore,
      }, {
        invocationId: () => invocationId,
        onOperation: (name: string) => {
          if (!forced && name === (state === 'remove'
            ? 'report-update:final-verify:read'
            : 'report-update:publish-rename')) {
            forced = true;
            throw new Error('start report-update helper crash fixture');
          }
          if (!stranded && name === (state === 'remove'
            ? 'report-update:rollback:remove-new'
            : 'report-update:rollback:restore')) {
            stranded = true;
            throw new Error('strand report-update helper input');
          }
        },
      })).toThrow(expect.objectContaining({ code: 'report-update-rollback-failed' }));
      const tempPath = join(
        reportDir,
        `.appforge-submit-${invocationId}-analysis-report.json.tmp`,
      );
      const backupPath = join(
        reportDir,
        `.appforge-submit-${invocationId}-analysis-report.json.bak`,
      );
      const quarantine = state === 'remove' ? `${tempPath}.remove` : `${backupPath}.restore`;
      const generation = join(quarantine, 'generation');
      nativeFs.mkdirSync(quarantine, { mode: 0o700 });
      nativeFs.renameSync(state === 'remove' ? written.reportPath : backupPath, generation);
      if (state === 'restore') nativeFs.linkSync(generation, written.reportPath);

      writeCase(reportDir, ENVELOPE_B, {
        invocationId: () => state === 'remove'
          ? 'a1260000-0000-4000-8000-000000000001'
          : 'a1270000-0000-4000-8000-000000000001',
      });
      expect(JSON.parse(readFileSync(written.reportPath, 'utf8')).envelope.id).toBe(ENVELOPE_B);
      expect(readdirSync(reportDir).filter(name => name.startsWith('.appforge-'))).toEqual([]);
    },
  );

  it.each(['temp', 'backup'] as const)(
    'never deletes a replacement committed report-update %s generation',
    (kind) => {
      const reportDir = resolveSurveyReportDirectory({
        target: project,
        reportValue: join(outside, `committed-report-update-${kind}-generation`),
        cwd: root,
      });
      const value = outputCase(reportDir, ENVELOPE_A);
      const written = writeCase(reportDir, ENVELOPE_A);
      const invocationId = kind === 'temp'
        ? 'a1240000-0000-4000-8000-000000000000'
        : 'a1250000-0000-4000-8000-000000000000';
      replaceSubmissionReport({
        reportPath: written.reportPath,
        expectedEnvelope: value.envelope,
        transition: { state: 'acknowledged', attempted_at: NOW },
        core: outputCore,
      }, {
        invocationId: () => invocationId,
        onOperation: (name: string) => {
          if (name === 'report-update:commit:remove-backup') {
            throw new Error('leave committed report-update journal');
          }
        },
      });
      const suffix = kind === 'temp' ? 'tmp' : 'bak';
      const auxiliaryPath = join(
        reportDir,
        `.appforge-submit-${invocationId}-analysis-report.json.${suffix}`,
      );
      if (kind === 'temp') {
        nativeFs.writeFileSync(auxiliaryPath, readFileSync(written.reportPath), { flag: 'wx' });
      }
      expect(existsSync(auxiliaryPath)).toBe(true);
      const replacement = Buffer.from(`unowned committed report-update ${kind}`, 'utf8');
      let replaced = false;

      expect(() => writeCase(reportDir, ENVELOPE_B, {
        invocationId: () => kind === 'temp'
          ? 'a1240000-0000-4000-8000-000000000001'
          : 'a1250000-0000-4000-8000-000000000001',
        onOperation: (name: string) => {
          if (!replaced && name === `report-update:recovery:remove-${kind}`) {
            replaced = true;
            nativeFs.unlinkSync(auxiliaryPath);
            nativeFs.writeFileSync(auxiliaryPath, replacement, { flag: 'wx' });
          }
        },
      })).toThrow(expect.objectContaining({ code: 'report-update-recovery-failed' }));
      expect(replaced).toBe(true);
      expect(readFileSync(auxiliaryPath)).toEqual(replacement);
    },
  );

  it('rejects a forged report-update journal without touching any file', () => {
    const reportDir = resolveSurveyReportDirectory({
      target: project,
      reportValue: join(outside, 'forged-report-update'),
      cwd: root,
    });
    const value = outputCase(reportDir, ENVELOPE_A);
    const written = writeCase(reportDir, ENVELOPE_A);
    const invocationId = 'a2000000-0000-4000-8000-000000000000';
    writeFileSync(join(reportDir, 'valuable.txt'), 'valuable');
    writeFileSync(
      join(reportDir, `.appforge-submit-journal-${invocationId}.json`),
      `${JSON.stringify({
        journal_schema: 'survey-report-update-journal/1',
        report_final: 'valuable.txt',
        report_temp: `.appforge-submit-${invocationId}-valuable.txt.tmp`,
        report_backup: `.appforge-submit-${invocationId}-valuable.txt.bak`,
        old_sha256: '0'.repeat(64),
        new_sha256: '1'.repeat(64),
      }, null, 2)}\n`,
    );
    const before = directoryBytes(reportDir);

    expect(() => replaceSubmissionReport({
      reportPath: written.reportPath,
      expectedEnvelope: value.envelope,
      transition: { state: 'acknowledged', attempted_at: NOW },
      core: outputCore,
    })).toThrow(expect.objectContaining({ code: 'report-update-recovery-failed' }));
    expect(directoryBytes(reportDir)).toEqual(before);
  });
});
