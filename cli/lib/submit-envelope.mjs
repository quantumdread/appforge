import * as nativeFs from 'node:fs';
import { constants as fsConstants } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { replaceSubmissionReport } from './survey-output.mjs';

export const MAX_SURVEY_ENVELOPE_BYTES = 256 * 1024;
const MAX_RESPONSE_BYTES = 64 * 1024;
const DEFAULT_TIMEOUT_MS = 10_000;
const REPORT_UPDATE_RETRY_DELAY_MS = 10;
const REPORT_UPDATE_MAX_RETRIES = 100;

class SubmissionRefusal extends Error {
  constructor(code) {
    super(code);
    this.name = 'SubmissionRefusal';
    this.code = code;
  }
}

const refuse = code => {
  throw new SubmissionRefusal(code);
};

const pathKey = value => process.platform === 'win32' ? value.toLowerCase() : value;

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function sameGenerationMetadata(left, right) {
  return sameIdentity(left, right)
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs;
}

function nativeRealpath(fs, value) {
  const realpath = fs.realpathSync.native ?? fs.realpathSync;
  return realpath(value);
}

function readBoundRegularFile(fs, inputPath, options) {
  const lexicalPath = resolve(inputPath);
  let initial;
  try {
    initial = fs.lstatSync(lexicalPath);
  } catch {
    refuse(options.missingCode);
  }
  if (!initial.isFile() || initial.isSymbolicLink()) refuse(options.unsafeCode);

  let canonicalPath;
  try {
    canonicalPath = nativeRealpath(fs, lexicalPath);
  } catch {
    refuse(options.unsafeCode);
  }
  let descriptor;
  try {
    const noFollow = typeof fsConstants.O_NOFOLLOW === 'number' ? fsConstants.O_NOFOLLOW : 0;
    descriptor = fs.openSync(canonicalPath, fsConstants.O_RDONLY | noFollow);
    const before = fs.fstatSync(descriptor);
    if (!before.isFile() || !sameGenerationMetadata(initial, before)) {
      refuse(options.changedCode);
    }
    if (options.maximum !== undefined && before.size > options.maximum) {
      refuse(options.tooLargeCode);
    }
    const bytes = fs.readFileSync(descriptor);
    const after = fs.fstatSync(descriptor);
    const named = fs.lstatSync(canonicalPath);
    if (!named.isFile()
      || named.isSymbolicLink()
      || !sameGenerationMetadata(before, after)
      || !sameIdentity(before, named)
      || before.size !== after.size
      || bytes.byteLength !== after.size) {
      refuse(options.changedCode);
    }
    if (options.maximum !== undefined && bytes.byteLength > options.maximum) {
      refuse(options.tooLargeCode);
    }
    return { bytes, path: canonicalPath };
  } catch (error) {
    if (error instanceof SubmissionRefusal) throw error;
    refuse(options.changedCode);
  } finally {
    if (descriptor !== undefined) {
      try {
        fs.closeSync(descriptor);
      } catch {
        refuse(options.changedCode);
      }
    }
  }
}

function configuredEndpoint(env) {
  const configured = env.APPFORGE_SURVEY_ENDPOINT;
  if (typeof configured !== 'string' || configured.length === 0) refuse('invalid-config');
  let endpoint;
  try {
    endpoint = new URL(configured);
  } catch {
    refuse('invalid-config');
  }
  const loopback = endpoint.hostname === 'localhost'
    || endpoint.hostname === '127.0.0.1'
    || endpoint.hostname === '[::1]';
  if ((endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && loopback))
    || endpoint.username !== ''
    || endpoint.password !== ''
    || endpoint.hash !== '') {
    refuse('invalid-config');
  }
  return endpoint;
}

function configuredToken(env) {
  const token = env.APPFORGE_SURVEY_TOKEN;
  if (typeof token !== 'string' || token.length === 0) refuse('missing-token');
  if (/[\r\n]/u.test(token)) refuse('invalid-token');
  return token;
}

export function parseSubmitEnvelopeArgs(argv) {
  if (!Array.isArray(argv) || argv.length !== 1 || typeof argv[0] !== 'string' || argv[0] === '') {
    refuse('invalid-arguments');
  }
  return { envelopePath: argv[0] };
}

export function preflightEnvelopeSubmission(argv, dependencies) {
  const fs = dependencies.fs ?? nativeFs;
  const parsed = parseSubmitEnvelopeArgs(argv);
  const endpoint = configuredEndpoint(dependencies.env ?? process.env);
  const token = configuredToken(dependencies.env ?? process.env);
  const capturedEnvelope = readBoundRegularFile(fs, parsed.envelopePath, {
    maximum: MAX_SURVEY_ENVELOPE_BYTES,
    missingCode: 'invalid-envelope-path',
    unsafeCode: 'unsafe-envelope-path',
    changedCode: 'envelope-changed',
    tooLargeCode: 'payload-too-large',
  });

  let envelope;
  try {
    envelope = dependencies.core.decodeCanonicalEnvelope(
      capturedEnvelope.bytes,
      dependencies.core.ANALYZER_CATALOG_ALLOWLIST,
    );
  } catch {
    refuse('invalid-envelope');
  }
  if (basename(capturedEnvelope.path) !== `envelope-${envelope.id}.json`) {
    refuse('envelope-not-current');
  }

  const reportPath = resolve(dirname(capturedEnvelope.path), 'analysis-report.json');
  const capturedReport = readBoundRegularFile(fs, reportPath, {
    missingCode: 'invalid-report',
    unsafeCode: 'unsafe-report-path',
    changedCode: 'report-changed',
  });
  let report;
  try {
    report = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(capturedReport.bytes));
    dependencies.core.assertValidReport(report);
    dependencies.core.assertEmittableReport(report, { surface: 'cli', envelope });
  } catch {
    refuse('invalid-report');
  }
  if (report.envelope.id !== envelope.id
    || typeof report.envelope.path !== 'string'
    || pathKey(resolve(report.envelope.path)) !== pathKey(capturedEnvelope.path)) {
    refuse('envelope-not-current');
  }

  return {
    endpoint,
    token,
    envelope,
    envelopeBytes: capturedEnvelope.bytes,
    envelopePath: capturedEnvelope.path,
    report,
    reportPath: capturedReport.path,
  };
}

async function readBoundedResponse(response) {
  if (response.body === null) return null;
  const reader = response.body.getReader();
  const chunks = [];
  let retained = 0;
  while (retained <= MAX_RESPONSE_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value.byteLength === 0) continue;
    const remaining = MAX_RESPONSE_BYTES + 1 - retained;
    const captured = value.byteLength > remaining ? value.subarray(0, remaining) : value;
    chunks.push(captured);
    retained += captured.byteLength;
    if (retained > MAX_RESPONSE_BYTES) {
      try {
        await reader.cancel();
      } catch {
        // Cleanup is best-effort after the response is already classified invalid.
      }
      return null;
    }
  }
  const bytes = new Uint8Array(retained);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function validJsonResponseType(response) {
  const contentType = response.headers.get('content-type');
  return contentType !== null
    && /^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/iu.test(contentType);
}

async function acknowledgement(response) {
  if (!validJsonResponseType(response)) return null;
  const bytes = await readBoundedResponse(response);
  if (bytes === null) return null;
  let value;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (text !== '{"acknowledged":true,"duplicate":false}'
      && text !== '{"acknowledged":true,"duplicate":true}') return null;
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const keys = Object.keys(value).sort();
  if (keys.length !== 2 || keys[0] !== 'acknowledged' || keys[1] !== 'duplicate') return null;
  return value.acknowledged === true && typeof value.duplicate === 'boolean'
    ? value
    : null;
}

function statusCode(status) {
  return ({
    400: 'invalid-envelope',
    401: 'unauthorized',
    409: 'envelope-conflict',
    413: 'payload-too-large',
    415: 'unsupported-media-type',
    503: 'telemetry-unavailable',
  })[status] ?? 'unexpected-status';
}

function result(exitCode, stdout, stderr) {
  return { exit_code: exitCode, stdout, stderr };
}

function updateReport(preflight, transition, dependencies, options = {}) {
  const replaceReport = dependencies.replaceReport ?? replaceSubmissionReport;
  replaceReport({
    reportPath: preflight.reportPath,
    expectedEnvelope: preflight.envelope,
    transition,
    acceptAcknowledgedAsTerminal: options.acceptAcknowledgedAsTerminal === true,
    core: dependencies.core,
  });
}

function outputBusy(error) {
  return error !== null
    && typeof error === 'object'
    && error.code === 'output-busy';
}

async function updateReportAfterContention(
  preflight,
  transition,
  dependencies,
  options = {},
) {
  const configuredRetries = dependencies.reportUpdateMaxRetries;
  const maxRetries = Number.isSafeInteger(configuredRetries)
    && configuredRetries >= 0
    && configuredRetries <= REPORT_UPDATE_MAX_RETRIES
    ? configuredRetries
    : REPORT_UPDATE_MAX_RETRIES;
  const waitForRetry = dependencies.waitForReportRetry
    ?? (delay => new Promise(resolvePromise => setTimeout(resolvePromise, delay)));
  for (let retries = 0; ; retries += 1) {
    try {
      return updateReport(preflight, transition, dependencies, options);
    } catch (error) {
      if (!outputBusy(error) || retries >= maxRetries) throw error;
      await waitForRetry(REPORT_UPDATE_RETRY_DELAY_MS);
    }
  }
}

export async function executeEnvelopeSubmission(argv, dependencies) {
  let preflight;
  try {
    preflight = preflightEnvelopeSubmission(argv, dependencies);
  } catch (error) {
    // A refusal is an adjudicated, caller-fixable outcome (exit 2). Anything
    // else escaping preflight is unplanned: report it as infrastructure (exit
    // 3) rather than mislabelling it as the `invalid-config` refusal.
    if (error instanceof SubmissionRefusal) {
      return result(2, '', `submit-envelope refused: ${error.code}\n`);
    }
    return result(3, '', 'survey infrastructure error: submit-envelope preflight failed\n');
  }

  const fetchImpl = dependencies.fetchImpl ?? globalThis.fetch;
  const timeoutMs = dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const attemptedAt = new Date((dependencies.now ?? Date.now)()).toISOString();
  let response;
  let failureCode;
  let remoteAcknowledged = false;
  let duplicate = false;
  try {
    response = await fetchImpl(preflight.endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${preflight.token}`,
        'content-type': 'application/json',
      },
      body: preflight.envelopeBytes,
      redirect: 'manual',
      signal: controller.signal,
    });
    if (response.status >= 300 && response.status <= 399) {
      failureCode = 'redirect-refused';
      try {
        await response.body?.cancel();
      } catch {
        // Preserve the status classification; cancellation is only cleanup.
      }
    } else if (response.status !== 200) {
      failureCode = statusCode(response.status);
      try {
        await response.body?.cancel();
      } catch {
        // Preserve the status classification; cancellation is only cleanup.
      }
    } else {
      const accepted = await acknowledgement(response);
      if (accepted === null) failureCode = 'invalid-response';
      else {
        remoteAcknowledged = true;
        duplicate = accepted.duplicate;
      }
    }
  } catch {
    failureCode = timedOut ? 'request-timeout' : 'network-error';
  } finally {
    clearTimeout(timeout);
  }

  if (remoteAcknowledged) {
    try {
      await updateReportAfterContention(
        preflight,
        { state: 'acknowledged', attempted_at: attemptedAt },
        dependencies,
      );
    } catch {
      return result(
        3,
        'survey envelope acknowledged remotely\n',
        'submit-envelope failed: report-update-failed\n',
      );
    }
    return result(
      0,
      duplicate
        ? 'survey envelope already acknowledged\n'
        : 'survey envelope acknowledged\n',
      '',
    );
  }

  if (preflight.report.envelope.submission.state !== 'acknowledged') {
    try {
      await updateReportAfterContention(
        preflight,
        {
          state: 'failed',
          attempted_at: attemptedAt,
          error_code: failureCode,
        },
        dependencies,
        { acceptAcknowledgedAsTerminal: true },
      );
    } catch (error) {
      if (outputBusy(error)) return result(3, '', `submit-envelope failed: ${failureCode}\n`);
      return result(3, '', 'submit-envelope failed: report-update-failed\n');
    }
  }
  return result(3, '', `submit-envelope failed: ${failureCode}\n`);
}
