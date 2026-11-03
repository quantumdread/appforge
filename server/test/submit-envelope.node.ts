import { spawn, spawnSync } from 'node:child_process';
import * as nativeFs from 'node:fs';
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sha256 } from '../src/core/sha256';
import { assertEmittableReport } from '../src/core/survey/emittable-report';
import { decodeCanonicalEnvelope } from '../src/core/survey/validate-envelope';
import { assertValidReport } from '../src/core/survey/validate-report';
import { ANALYZER_CATALOG_ALLOWLIST } from '../src/lib/survey';
import { executeEnvelopeSubmission } from '../../cli/lib/submit-envelope.mjs';
import {
  replaceSubmissionReport,
  SurveyOutputError,
} from '../../cli/lib/survey-output.mjs';

const SCRIPT = resolve(
  __dirname,
  '..',
  '..',
  'cli',
  'validate.mjs',
);
const SCREEN = `Screens:\n  Main:\n    Children:\n      - lblOne:\n          Control: Text\n          Properties:\n            Text: ="hello"\n            Wrap: =true\n`;
const EXPECTED_MAX_SURVEY_ENVELOPE_BYTES = 262_144;

type CliResult = {
  status: number | null;
  stdout: string;
  stderr: string;
};

type CapturedRequest = {
  body: Buffer;
  headers: IncomingMessage['headers'];
  method: string | undefined;
  url: string | undefined;
};

let root: string;
let appRoot: string;
let reportDir: string;
let envelopePath: string;
let reportPath: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'submit-envelope-'));
  appRoot = join(root, 'App');
  reportDir = join(root, 'survey-output');
  mkdirSync(appRoot);
  writeFileSync(join(appRoot, 'Screen.pa.yaml'), SCREEN);
  const survey = spawnSync(process.execPath, [
    SCRIPT,
    'survey',
    appRoot,
    '--report',
    reportDir,
  ], {
    cwd: root,
    encoding: 'utf8',
  });
  expect({ status: survey.status, stderr: survey.stderr }).toEqual({ status: 0, stderr: '' });
  const envelopeName = readdirSync(reportDir).find(name => /^envelope-.*\.json$/u.test(name));
  expect(envelopeName).toBeDefined();
  envelopePath = join(reportDir, envelopeName!);
  reportPath = join(reportDir, 'analysis-report.json');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function runCli(args: string[], extraEnv: NodeJS.ProcessEnv = {}): Promise<CliResult> {
  return new Promise((resolveResult, reject) => {
    const childEnv = { ...process.env };
    delete childEnv.APPFORGE_SURVEY_ENDPOINT;
    delete childEnv.APPFORGE_SURVEY_TOKEN;
    Object.assign(childEnv, extraEnv);
    const child = spawn(process.execPath, [SCRIPT, ...args], {
      cwd: root,
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on('data', chunk => stdout.push(Buffer.from(chunk)));
    child.stderr.on('data', chunk => stderr.push(Buffer.from(chunk)));
    child.once('error', reject);
    child.once('close', status => resolveResult({
      status,
      stdout: Buffer.concat(stdout).toString('utf8'),
      stderr: Buffer.concat(stderr).toString('utf8'),
    }));
  });
}

async function startServer(
  responder: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<{ endpoint: string; close(): Promise<void> }> {
  const server = createServer(responder);
  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('expected TCP server address');
  return {
    endpoint: `http://127.0.0.1:${address.port}/survey/envelope`,
    close: () => new Promise<void>((resolveClose, reject) => {
      server.close(error => error ? reject(error) : resolveClose());
    }),
  };
}

async function captureServer(
  status = 200,
  responseBody = '{"acknowledged":true,"duplicate":false}',
  headers: Record<string, string> = { 'content-type': 'application/json' },
) {
  const requests: CapturedRequest[] = [];
  const server = await startServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', chunk => chunks.push(Buffer.from(chunk)));
    request.on('end', () => {
      requests.push({
        body: Buffer.concat(chunks),
        headers: request.headers,
        method: request.method,
        url: request.url,
      });
      response.writeHead(status, headers);
      const middle = Math.floor(responseBody.length / 2);
      response.write(responseBody.slice(0, middle));
      response.end(responseBody.slice(middle));
    });
  });
  return { ...server, requests };
}

function submissionEnv(endpoint: string, token = 'submission-test-token'): NodeJS.ProcessEnv {
  return {
    APPFORGE_SURVEY_ENDPOINT: endpoint,
    APPFORGE_SURVEY_TOKEN: token,
  };
}

function report(): any {
  return JSON.parse(readFileSync(reportPath, 'utf8'));
}

describe('submit-envelope actual CLI', () => {
  it('posts exact inspected bytes including the final newline and acknowledges only the report', async () => {
    const server = await captureServer();
    const beforeEnvelope = readFileSync(envelopePath);
    const technicalPath = join(reportDir, 'report-technical.md');
    const beforeTechnical = readFileSync(technicalPath);
    const started = Date.now();
    try {
      const result = await runCli(
        ['submit-envelope', envelopePath],
        submissionEnv(server.endpoint),
      );
      const finished = Date.now();
      expect(result).toEqual({
        status: 0,
        stdout: 'survey envelope acknowledged\n',
        stderr: '',
      });
      expect(server.requests).toHaveLength(1);
      const captured = server.requests[0];
      expect(captured.body).toEqual(beforeEnvelope);
      expect(captured.body.at(-1)).toBe(0x0a);
      expect(sha256(captured.body)).toBe(sha256(beforeEnvelope));
      expect(captured.method).toBe('POST');
      expect(captured.url).toBe('/survey/envelope');
      expect(captured.headers.authorization).toBe('Bearer submission-test-token');
      expect(captured.headers['content-type']).toBe('application/json');
      expect(readFileSync(envelopePath)).toEqual(beforeEnvelope);
      expect(readFileSync(technicalPath)).toEqual(beforeTechnical);
      expect(report().envelope.submission.state).toBe('acknowledged');
      const attemptedAt = Date.parse(report().envelope.submission.attempted_at);
      expect(attemptedAt).toBeGreaterThanOrEqual(started);
      expect(attemptedAt).toBeLessThanOrEqual(finished);
    } finally {
      await server.close();
    }
  });

  it('accepts a duplicate replay without rewriting an already acknowledged report', async () => {
    const first = await captureServer();
    try {
      expect((await runCli(
        ['submit-envelope', envelopePath],
        submissionEnv(first.endpoint),
      )).status).toBe(0);
    } finally {
      await first.close();
    }
    const acknowledged = readFileSync(reportPath);
    const replay = await captureServer(200, '{"acknowledged":true,"duplicate":true}');
    try {
      const result = await runCli(
        ['submit-envelope', envelopePath],
        submissionEnv(replay.endpoint),
      );
      expect(result).toEqual({
        status: 0,
        stdout: 'survey envelope already acknowledged\n',
        stderr: '',
      });
      expect(replay.requests).toHaveLength(1);
      expect(readFileSync(reportPath)).toEqual(acknowledged);
    } finally {
      await replay.close();
    }
  });

  it('lets two preflighted clients converge on one acknowledged report', async () => {
    const waiting: ServerResponse[] = [];
    let requestCount = 0;
    const server = await startServer((request, response) => {
      request.resume();
      request.once('end', () => {
        requestCount += 1;
        waiting.push(response);
        if (waiting.length !== 2) return;
        waiting[0].writeHead(200, { 'content-type': 'application/json' });
        waiting[0].end('{"acknowledged":true,"duplicate":false}');
        const deadline = Date.now() + 5_000;
        const releaseReplay = () => {
          let acknowledged = false;
          try {
            acknowledged = report().envelope.submission.state === 'acknowledged';
          } catch {
            // The first client may be between atomic report generations.
          }
          if (!acknowledged && Date.now() < deadline) {
            setTimeout(releaseReplay, 10);
            return;
          }
          waiting[1].writeHead(200, { 'content-type': 'application/json' });
          waiting[1].end('{"acknowledged":true,"duplicate":true}');
        };
        releaseReplay();
      });
    });
    try {
      const [first, second] = await Promise.all([
        runCli(['submit-envelope', envelopePath], submissionEnv(server.endpoint)),
        runCli(['submit-envelope', envelopePath], submissionEnv(server.endpoint)),
      ]);
      const observations = [first, second].map(value => ({
        status: value.status,
        stderrEmpty: value.stderr === '',
        stderrCode: /^submit-envelope (?:failed|refused): ([a-z-]+)/u.exec(value.stderr)?.[1] ?? '',
      }));
      expect(observations).toEqual([
        { status: 0, stderrEmpty: true, stderrCode: '' },
        { status: 0, stderrEmpty: true, stderrCode: '' },
      ]);
      expect(requestCount).toBe(2);
      expect(report().envelope.submission.state).toBe('acknowledged');
      expect(readdirSync(reportDir).filter(name => name.startsWith('.appforge-'))).toEqual([]);
    } finally {
      await server.close();
    }
  });

  it('preserves a stale client remote failure after a concurrent acknowledgement', async () => {
    const waiting: ServerResponse[] = [];
    const server = await startServer((request, response) => {
      request.resume();
      request.once('end', () => {
        waiting.push(response);
        if (waiting.length !== 2) return;
        waiting[0].writeHead(200, { 'content-type': 'application/json' });
        waiting[0].end('{"acknowledged":true,"duplicate":false}');
        const deadline = Date.now() + 5_000;
        const releaseFailure = () => {
          let acknowledged = false;
          try {
            acknowledged = report().envelope.submission.state === 'acknowledged';
          } catch {
            // The successful client may be between atomic report generations.
          }
          if (!acknowledged && Date.now() < deadline) {
            setTimeout(releaseFailure, 10);
            return;
          }
          waiting[1].writeHead(401, { 'content-type': 'application/json' });
          waiting[1].end('{"error":"ignored"}');
        };
        releaseFailure();
      });
    });
    try {
      const results = await Promise.all([
        runCli(['submit-envelope', envelopePath], submissionEnv(server.endpoint)),
        runCli(['submit-envelope', envelopePath], submissionEnv(server.endpoint)),
      ]);
      const observations = results.map(value => ({
        status: value.status,
        stdout: value.stdout,
        stderr: value.stderr,
      })).sort((left, right) => left.status - right.status);
      expect(observations).toEqual([
        {
          status: 0,
          stdout: 'survey envelope acknowledged\n',
          stderr: '',
        },
        {
          status: 3,
          stdout: '',
          stderr: 'submit-envelope failed: unauthorized\n',
        },
      ]);
      expect(report().envelope.submission.state).toBe('acknowledged');
      expect(readdirSync(reportDir).filter(name => name.startsWith('.appforge-'))).toEqual([]);
    } finally {
      await server.close();
    }
  });

  it.each([
    [400, 'invalid-envelope'],
    [401, 'unauthorized'],
    [409, 'envelope-conflict'],
    [413, 'payload-too-large'],
    [415, 'unsupported-media-type'],
    [503, 'telemetry-unavailable'],
    [500, 'unexpected-status'],
  ])('records stable failure %s as %s without changing envelope bytes', async (status, code) => {
    const poison = 'CustomerSecret ScreenOne formula/path';
    const server = await captureServer(status, JSON.stringify({ error: poison }));
    const beforeEnvelope = readFileSync(envelopePath);
    try {
      const result = await runCli(
        ['submit-envelope', envelopePath],
        submissionEnv(server.endpoint, `${poison}-token`),
      );
      const safeObservation = {
        status: result.status,
        stdoutEmpty: result.stdout === '',
        diagnosticExact: result.stderr === `submit-envelope failed: ${code}\n`,
        poisonAbsent: !result.stdout.includes(poison) && !result.stderr.includes(poison),
      };
      expect(safeObservation).toEqual({
        status: 3,
        stdoutEmpty: true,
        diagnosticExact: true,
        poisonAbsent: true,
      });
      expect(readFileSync(envelopePath)).toEqual(beforeEnvelope);
      expect(report().envelope.submission).toMatchObject({
        state: 'failed',
        error_code: code,
      });
    } finally {
      await server.close();
    }
  });

  it('does not follow redirects and never sends the bearer token to the redirect target', async () => {
    const target = await captureServer();
    let redirectRequests = 0;
    const redirect = await startServer((_request, response) => {
      redirectRequests += 1;
      response.writeHead(307, { location: target.endpoint });
      response.end();
    });
    try {
      const result = await runCli(
        ['submit-envelope', envelopePath],
        submissionEnv(redirect.endpoint),
      );
      expect(result).toEqual({
        status: 3,
        stdout: '',
        stderr: 'submit-envelope failed: redirect-refused\n',
      });
      expect(redirectRequests).toBe(1);
      expect(target.requests).toHaveLength(0);
      expect(report().envelope.submission.error_code).toBe('redirect-refused');
    } finally {
      await redirect.close();
      await target.close();
    }
  });

  it.each([
    '{"acknowledged":false,"acknowledged":true,"duplicate":false}',
    '{"acknowledged":true}',
    'not-json',
  ])('rejects an ambiguous or malformed 200 acknowledgement', async responseBody => {
    const server = await captureServer(200, responseBody);
    try {
      const result = await runCli(
        ['submit-envelope', envelopePath],
        submissionEnv(server.endpoint),
      );
      expect(result).toEqual({
        status: 3,
        stdout: '',
        stderr: 'submit-envelope failed: invalid-response\n',
      });
      expect(report().envelope.submission.error_code).toBe('invalid-response');
    } finally {
      await server.close();
    }
  });

  it.each(['pending', 'failed'] as const)(
    'acknowledges a legal retry from %s',
    async state => {
      const value = report();
      value.envelope.submission = state === 'pending'
        ? { state: 'pending' }
        : {
            state: 'failed',
            attempted_at: '2026-08-30T08:00:00.000Z',
            error_code: 'network-error',
          };
      writeFileSync(reportPath, `${JSON.stringify(value, null, 2)}\n`);
      const server = await captureServer();
      try {
        expect((await runCli(
          ['submit-envelope', envelopePath],
          submissionEnv(server.endpoint),
        )).status).toBe(0);
        expect(report().envelope.submission.state).toBe('acknowledged');
      } finally {
        await server.close();
      }
    },
  );

  it.each(['pending', 'failed'] as const)(
    'records a stable attempted failure from %s',
    async state => {
      const value = report();
      value.envelope.submission = state === 'pending'
        ? { state: 'pending' }
        : {
            state: 'failed',
            attempted_at: '2026-08-30T08:00:00.000Z',
            error_code: 'network-error',
          };
      writeFileSync(reportPath, `${JSON.stringify(value, null, 2)}\n`);
      const server = await captureServer(401, '{"error":"ignored"}');
      try {
        const result = await runCli(
          ['submit-envelope', envelopePath],
          submissionEnv(server.endpoint),
        );
        expect(result.stderr).toBe('submit-envelope failed: unauthorized\n');
        expect(report().envelope.submission).toMatchObject({
          state: 'failed',
          error_code: 'unauthorized',
        });
      } finally {
        await server.close();
      }
    },
  );

  it('preserves an acknowledged report when a later replay request fails', async () => {
    const success = await captureServer();
    try {
      expect((await runCli(
        ['submit-envelope', envelopePath],
        submissionEnv(success.endpoint),
      )).status).toBe(0);
    } finally {
      await success.close();
    }
    const acknowledged = readFileSync(reportPath);
    const failure = await captureServer(401, '{"error":"ignored"}');
    try {
      const result = await runCli(
        ['submit-envelope', envelopePath],
        submissionEnv(failure.endpoint),
      );
      expect(result.stderr).toBe('submit-envelope failed: unauthorized\n');
      expect(readFileSync(reportPath)).toEqual(acknowledged);
    } finally {
      await failure.close();
    }
  });

  it.each([
    ['missing token', (env: string) => ({ APPFORGE_SURVEY_ENDPOINT: env })],
    ['missing endpoint', () => ({ APPFORGE_SURVEY_TOKEN: 'token' })],
    ['empty endpoint', () => ({ APPFORGE_SURVEY_ENDPOINT: '', APPFORGE_SURVEY_TOKEN: 'token' })],
    ['blank endpoint', () => ({ APPFORGE_SURVEY_ENDPOINT: '   ', APPFORGE_SURVEY_TOKEN: 'token' })],
    ['empty token', (env: string) => ({ APPFORGE_SURVEY_ENDPOINT: env, APPFORGE_SURVEY_TOKEN: '' })],
    ['invalid endpoint', () => ({ APPFORGE_SURVEY_ENDPOINT: 'ftp://invalid.test/submit', APPFORGE_SURVEY_TOKEN: 'token' })],
  ])('refuses %s before network', async (_label, makeEnv) => {
    const server = await captureServer();
    const before = readFileSync(reportPath);
    try {
      const result = await runCli(['submit-envelope', envelopePath], makeEnv(server.endpoint));
      expect(result.status).toBe(2);
      expect(result.stdout).toBe('');
      expect(result.stderr).toMatch(/^submit-envelope refused: /u);
      if (_label.endsWith('endpoint')) expect(result.stderr).toBe('submit-envelope refused: invalid-config\n');
      expect(server.requests).toHaveLength(0);
      expect(readFileSync(reportPath)).toEqual(before);
    } finally {
      await server.close();
    }
  });

  it('refuses missing/extra arguments before network', async () => {
    const server = await captureServer();
    try {
      for (const args of [
        ['submit-envelope'],
        ['submit-envelope', envelopePath, 'extra'],
      ]) {
        const result = await runCli(args, submissionEnv(server.endpoint));
        expect(result.status).toBe(2);
        expect(result.stderr).toBe('submit-envelope refused: invalid-arguments\n');
      }
      expect(server.requests).toHaveLength(0);
    } finally {
      await server.close();
    }
  });

  it.each([
    ['noncanonical', 'invalid-envelope'],
    ['exact-boundary', 'invalid-envelope'],
    ['oversized', 'payload-too-large'],
    ['copied', 'envelope-not-current'],
    ['old', 'invalid-report'],
    ['mismatched-report', 'invalid-report'],
  ] as const)(
    'refuses a %s current-envelope preflight as %s without a request',
    async (kind, expectedCode) => {
      const server = await captureServer();
      const originalEnvelope = readFileSync(envelopePath);
      const originalReport = readFileSync(reportPath);
      let submittedPath = envelopePath;
      if (kind === 'noncanonical') writeFileSync(envelopePath, Buffer.concat([originalEnvelope, Buffer.from('\n')]));
      if (kind === 'exact-boundary') {
        writeFileSync(envelopePath, Buffer.alloc(EXPECTED_MAX_SURVEY_ENVELOPE_BYTES));
      }
      if (kind === 'oversized') {
        writeFileSync(envelopePath, Buffer.alloc(EXPECTED_MAX_SURVEY_ENVELOPE_BYTES + 1));
      }
      if (kind === 'copied') {
        const copied = join(root, 'copied');
        mkdirSync(copied);
        submittedPath = join(copied, basename(envelopePath));
        copyFileSync(envelopePath, submittedPath);
        copyFileSync(reportPath, join(copied, 'analysis-report.json'));
      }
      if (kind === 'old') {
        const oldEnvelope = JSON.parse(originalEnvelope.toString('utf8'));
        oldEnvelope.id = '40000000-0000-4000-8000-000000000001';
        submittedPath = join(reportDir, `envelope-${oldEnvelope.id}.json`);
        writeFileSync(submittedPath, `${JSON.stringify(oldEnvelope, null, 2)}\n`);
      }
      if (kind === 'mismatched-report') {
        const value = JSON.parse(originalReport.toString('utf8'));
        value.envelope.id = '40000000-0000-4000-8000-000000000001';
        writeFileSync(reportPath, `${JSON.stringify(value, null, 2)}\n`);
      }
      try {
        const result = await runCli(
          ['submit-envelope', submittedPath],
          submissionEnv(server.endpoint),
        );
        expect(result.status).toBe(2);
        expect(result.stdout).toBe('');
        expect(result.stderr).toBe(`submit-envelope refused: ${expectedCode}\n`);
        expect(server.requests).toHaveLength(0);
      } finally {
        await server.close();
      }
    },
  );

  it('refuses a symlinked envelope before network', async ({ skip }) => {
    const target = join(root, 'envelope-target.json');
    renameSync(envelopePath, target);
    try {
      symlinkSync(target, envelopePath, 'file');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') skip();
      throw error;
    }
    const server = await captureServer();
    try {
      expect(lstatSync(envelopePath).isSymbolicLink()).toBe(true);
      const result = await runCli(
        ['submit-envelope', envelopePath],
        submissionEnv(server.endpoint),
      );
      expect(result.status).toBe(2);
      expect(result.stderr).toBe('submit-envelope refused: unsafe-envelope-path\n');
      expect(server.requests).toHaveLength(0);
    } finally {
      await server.close();
    }
  });

  it('refuses a symlinked report before network', async ({ skip }) => {
    const target = join(root, 'report-target.json');
    renameSync(reportPath, target);
    try {
      symlinkSync(target, reportPath, 'file');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') skip();
      throw error;
    }
    const server = await captureServer();
    try {
      expect(lstatSync(reportPath).isSymbolicLink()).toBe(true);
      const result = await runCli(
        ['submit-envelope', envelopePath],
        submissionEnv(server.endpoint),
      );
      expect(result.status).toBe(2);
      expect(result.stderr).toBe('submit-envelope refused: unsafe-report-path\n');
      expect(server.requests).toHaveLength(0);
    } finally {
      await server.close();
    }
  });
});

describe('submit-envelope injected failure seams', () => {
  const core = {
    ANALYZER_CATALOG_ALLOWLIST,
    assertEmittableReport,
    assertValidReport,
    decodeCanonicalEnvelope,
  };

  it.each([undefined, '', '   '])('requires an explicit endpoint before calling fetch (%j)', async endpoint => {
    let calls = 0;
    const before = readFileSync(reportPath);
    const result = await executeEnvelopeSubmission([envelopePath], {
      core,
      env: { APPFORGE_SURVEY_ENDPOINT: endpoint, APPFORGE_SURVEY_TOKEN: 'secret-token' },
      fetchImpl: async () => {
        calls += 1;
        throw new Error('must not reach fetch');
      },
    });
    expect(result).toEqual({ exit_code: 2, stdout: '', stderr: 'submit-envelope refused: invalid-config\n' });
    expect(calls).toBe(0);
    expect(readFileSync(reportPath)).toEqual(before);
  });

  it('times out through AbortSignal and records only the stable timeout code', async () => {
    const result = await executeEnvelopeSubmission([envelopePath], {
      core,
      env: {
        APPFORGE_SURVEY_ENDPOINT: 'https://submission.test/survey/envelope',
        APPFORGE_SURVEY_TOKEN: 'secret-token',
      },
      timeoutMs: 5,
      fetchImpl: (_url: string | URL | Request, init?: RequestInit) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('poison timeout', 'AbortError')));
      }),
    });
    expect(result).toEqual({
      exit_code: 3,
      stdout: '',
      stderr: 'submit-envelope failed: request-timeout\n',
    });
    expect(report().envelope.submission.error_code).toBe('request-timeout');
  });

  it('classifies a timeout while reading a 200 response body as request-timeout', async () => {
    const result = await executeEnvelopeSubmission([envelopePath], {
      core,
      env: {
        APPFORGE_SURVEY_ENDPOINT: 'https://submission.test/survey/envelope',
        APPFORGE_SURVEY_TOKEN: 'secret-token',
      },
      timeoutMs: 5,
      fetchImpl: async (_url: string | URL | Request, init?: RequestInit) => new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            init?.signal?.addEventListener('abort', () => {
              controller.error(new DOMException('response timeout', 'AbortError'));
            });
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    });
    expect(result).toEqual({
      exit_code: 3,
      stdout: '',
      stderr: 'submit-envelope failed: request-timeout\n',
    });
    expect(report().envelope.submission.error_code).toBe('request-timeout');
  });

  it('routes an already-acknowledged replay through the locked report seam', async () => {
    const value = report();
    value.envelope.submission = {
      state: 'acknowledged',
      attempted_at: '2026-08-30T08:00:00.000Z',
    };
    writeFileSync(reportPath, `${JSON.stringify(value, null, 2)}\n`);
    const before = readFileSync(reportPath);
    let replacements = 0;
    const result = await executeEnvelopeSubmission([envelopePath], {
      core,
      env: {
        APPFORGE_SURVEY_ENDPOINT: 'https://submission.test/survey/envelope',
        APPFORGE_SURVEY_TOKEN: 'secret-token',
      },
      fetchImpl: async () => new Response(
        '{"acknowledged":true,"duplicate":true}',
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
      replaceReport(input: Parameters<typeof replaceSubmissionReport>[0]) {
        replacements += 1;
        return replaceSubmissionReport(input);
      },
    });
    expect(result.exit_code).toBe(0);
    expect(replacements).toBe(1);
    expect(readFileSync(reportPath)).toEqual(before);
  });

  it('retries a successful acknowledgement that meets a live output lock', async () => {
    let replacements = 0;
    let retries = 0;
    const result = await executeEnvelopeSubmission([envelopePath], {
      core,
      env: {
        APPFORGE_SURVEY_ENDPOINT: 'https://submission.test/survey/envelope',
        APPFORGE_SURVEY_TOKEN: 'secret-token',
      },
      fetchImpl: async () => new Response(
        '{"acknowledged":true,"duplicate":false}',
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
      reportUpdateMaxRetries: 1,
      waitForReportRetry: async () => { retries += 1; },
      replaceReport(input: Parameters<typeof replaceSubmissionReport>[0]) {
        replacements += 1;
        if (replacements === 1) {
          throw new SurveyOutputError('output-busy', 'simulated live writer', 3);
        }
        return replaceSubmissionReport(input);
      },
    });
    expect(result).toEqual({
      exit_code: 0,
      stdout: 'survey envelope acknowledged\n',
      stderr: '',
    });
    expect({ replacements, retries }).toEqual({ replacements: 2, retries: 1 });
    expect(report().envelope.submission.state).toBe('acknowledged');
  });

  it('keeps a remote failure when a live writer acknowledges before retry', async () => {
    let replacements = 0;
    let retries = 0;
    const result = await executeEnvelopeSubmission([envelopePath], {
      core,
      env: {
        APPFORGE_SURVEY_ENDPOINT: 'https://submission.test/survey/envelope',
        APPFORGE_SURVEY_TOKEN: 'secret-token',
      },
      fetchImpl: async () => new Response('', { status: 401 }),
      reportUpdateMaxRetries: 1,
      waitForReportRetry: async () => { retries += 1; },
      replaceReport(input: Parameters<typeof replaceSubmissionReport>[0]) {
        replacements += 1;
        if (replacements === 1) {
          replaceSubmissionReport({
            ...input,
            transition: {
              state: 'acknowledged',
              attempted_at: '2026-08-30T08:00:00.000Z',
            },
            acceptAcknowledgedAsTerminal: false,
          });
          throw new SurveyOutputError('output-busy', 'simulated finishing writer', 3);
        }
        return replaceSubmissionReport(input);
      },
    });
    expect(result).toEqual({
      exit_code: 3,
      stdout: '',
      stderr: 'submit-envelope failed: unauthorized\n',
    });
    expect({ replacements, retries }).toEqual({ replacements: 2, retries: 1 });
    expect(report().envelope.submission.state).toBe('acknowledged');
  });

  it('does not replace a classified remote failure with exhausted output-busy', async () => {
    let replacements = 0;
    let retries = 0;
    const result = await executeEnvelopeSubmission([envelopePath], {
      core,
      env: {
        APPFORGE_SURVEY_ENDPOINT: 'https://submission.test/survey/envelope',
        APPFORGE_SURVEY_TOKEN: 'secret-token',
      },
      fetchImpl: async () => new Response('', { status: 401 }),
      reportUpdateMaxRetries: 0,
      waitForReportRetry: async () => { retries += 1; },
      replaceReport: () => {
        replacements += 1;
        throw new SurveyOutputError('output-busy', 'simulated live writer', 3);
      },
    });
    expect(result).toEqual({
      exit_code: 3,
      stdout: '',
      stderr: 'submit-envelope failed: unauthorized\n',
    });
    expect({ replacements, retries }).toEqual({ replacements: 1, retries: 0 });
    expect(report().envelope.submission.state).toBe('not_requested');
  });

  it('pins the default output-busy retry count and delay without sleeping', async () => {
    let replacements = 0;
    const retryDelays: number[] = [];
    const result = await executeEnvelopeSubmission([envelopePath], {
      core,
      env: {
        APPFORGE_SURVEY_ENDPOINT: 'https://submission.test/survey/envelope',
        APPFORGE_SURVEY_TOKEN: 'secret-token',
      },
      fetchImpl: async () => new Response('', { status: 401 }),
      waitForReportRetry: async (delay: number) => { retryDelays.push(delay); },
      replaceReport: () => {
        replacements += 1;
        throw new SurveyOutputError('output-busy', 'simulated live writer', 3);
      },
    });
    expect(result).toEqual({
      exit_code: 3,
      stdout: '',
      stderr: 'submit-envelope failed: unauthorized\n',
    });
    expect(replacements).toBe(101);
    expect(retryDelays).toEqual(Array.from({ length: 100 }, () => 10));
    expect(report().envelope.submission.state).toBe('not_requested');
  });

  it('states remote truth when acknowledgement succeeds but report replacement fails', async () => {
    const beforeEnvelope = readFileSync(envelopePath);
    const result = await executeEnvelopeSubmission([envelopePath], {
      core,
      env: {
        APPFORGE_SURVEY_ENDPOINT: 'https://submission.test/survey/envelope',
        APPFORGE_SURVEY_TOKEN: 'secret-token',
      },
      fetchImpl: async () => new Response(
        '{"acknowledged":true,"duplicate":false}',
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
      replaceReport: () => {
        throw new Error('poison local path');
      },
    });
    expect(result).toEqual({
      exit_code: 3,
      stdout: 'survey envelope acknowledged remotely\n',
      stderr: 'submit-envelope failed: report-update-failed\n',
    });
    expect(readFileSync(envelopePath)).toEqual(beforeEnvelope);
  });

  it('refuses a header-invalid token before calling fetch', async () => {
    let calls = 0;
    const result = await executeEnvelopeSubmission([envelopePath], {
      core,
      env: {
        APPFORGE_SURVEY_ENDPOINT: 'https://submission.test/survey/envelope',
        APPFORGE_SURVEY_TOKEN: 'secret\r\npoison',
      },
      fetchImpl: async () => {
        calls += 1;
        return new Response('{"acknowledged":true,"duplicate":false}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    });
    expect(result).toEqual({
      exit_code: 2,
      stdout: '',
      stderr: 'submit-envelope refused: invalid-token\n',
    });
    expect(calls).toBe(0);
  });

  it('reports an unexpected preflight throw as infrastructure, never as a refusal code', async () => {
    let calls = 0;
    const result = await executeEnvelopeSubmission([envelopePath], {
      core,
      env: {
        APPFORGE_SURVEY_ENDPOINT: 'https://submission.test/survey/envelope',
        get APPFORGE_SURVEY_TOKEN(): string {
          throw new TypeError('injected non-refusal preflight failure');
        },
      },
      fetchImpl: async () => {
        calls += 1;
        throw new Error('must not reach fetch');
      },
    });
    expect(result).toEqual({
      exit_code: 3,
      stdout: '',
      stderr: 'survey infrastructure error: submit-envelope preflight failed\n',
    });
    expect(calls).toBe(0);
  });

  it('detects a same-identity, same-size metadata change around the one envelope read', async () => {
    let envelopeFstats = 0;
    let calls = 0;
    const fs = {
      ...nativeFs,
      fstatSync(descriptor: number) {
        const value = nativeFs.fstatSync(descriptor);
        envelopeFstats += 1;
        if (envelopeFstats === 2) {
          return {
            ...value,
            mtimeMs: value.mtimeMs + 1,
            isFile: () => true,
          };
        }
        return value;
      },
    };
    const result = await executeEnvelopeSubmission([envelopePath], {
      core,
      fs,
      env: {
        APPFORGE_SURVEY_ENDPOINT: 'https://submission.test/survey/envelope',
        APPFORGE_SURVEY_TOKEN: 'secret-token',
      },
      fetchImpl: async () => {
        calls += 1;
        throw new Error('must not reach fetch');
      },
    });
    expect(result).toEqual({
      exit_code: 2,
      stdout: '',
      stderr: 'submit-envelope refused: envelope-changed\n',
    });
    expect(calls).toBe(0);
  });

  it.each(['envelope', 'report'] as const)(
    'refuses a same-name %s generation replaced between lstat and open',
    async kind => {
      const targetPath = kind === 'envelope' ? envelopePath : reportPath;
      let replaced = false;
      let calls = 0;
      const fs = {
        ...nativeFs,
        openSync(pathValue: nativeFs.PathLike, flags: string | number, mode?: number) {
          if (!replaced
            && basename(String(pathValue)).toLowerCase() === basename(targetPath).toLowerCase()) {
            const replacement = readFileSync(targetPath);
            renameSync(targetPath, `${targetPath}.prior`);
            writeFileSync(targetPath, replacement);
            replaced = true;
          }
          return nativeFs.openSync(pathValue, flags as any, mode);
        },
      };
      const result = await executeEnvelopeSubmission([envelopePath], {
        core,
        fs,
        env: {
          APPFORGE_SURVEY_ENDPOINT: 'https://submission.test/survey/envelope',
          APPFORGE_SURVEY_TOKEN: 'secret-token',
        },
        fetchImpl: async () => {
          calls += 1;
          throw new Error('must not reach fetch');
        },
      });
      expect(replaced).toBe(true);
      expect(result).toEqual({
        exit_code: 2,
        stdout: '',
        stderr: `submit-envelope refused: ${kind}-changed\n`,
      });
      expect(calls).toBe(0);
    },
  );

  it.each([
    [307, 'redirect-refused'],
    [401, 'unauthorized'],
  ] as const)('keeps status %i classification when response cancellation rejects', async (status, code) => {
    const responseBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1]));
      },
      cancel() {
        throw new Error('cleanup failure');
      },
    });
    const result = await executeEnvelopeSubmission([envelopePath], {
      core,
      env: {
        APPFORGE_SURVEY_ENDPOINT: 'https://submission.test/survey/envelope',
        APPFORGE_SURVEY_TOKEN: 'secret-token',
      },
      fetchImpl: async () => new Response(responseBody, { status }),
    });
    expect(result.stderr).toBe(`submit-envelope failed: ${code}\n`);
    expect(report().envelope.submission.error_code).toBe(code);
  });

  it.each(['envelope', 'report'] as const)(
    'pins symlinked %s refusal through the injected filesystem',
    async kind => {
    let calls = 0;
    const unsafePath = kind === 'envelope' ? envelopePath : reportPath;
    const fs = {
      ...nativeFs,
      lstatSync(pathValue: nativeFs.PathLike) {
        const value = nativeFs.lstatSync(pathValue);
        if (basename(String(pathValue)).toLowerCase() === basename(unsafePath).toLowerCase()) {
          return {
            ...value,
            isFile: () => true,
            isSymbolicLink: () => true,
          };
        }
        return value;
      },
    };
    const result = await executeEnvelopeSubmission([envelopePath], {
      core,
      fs,
      env: {
        APPFORGE_SURVEY_ENDPOINT: 'https://submission.test/survey/envelope',
        APPFORGE_SURVEY_TOKEN: 'secret-token',
      },
      fetchImpl: async () => {
        calls += 1;
        throw new Error('must not reach fetch');
      },
    });
    expect(result).toEqual({
      exit_code: 2,
      stdout: '',
      stderr: `submit-envelope refused: unsafe-${kind}-path\n`,
    });
    expect(calls).toBe(0);
    },
  );
});
