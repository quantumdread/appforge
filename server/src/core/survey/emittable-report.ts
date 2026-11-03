import type { SurveyEnvelopeV1 } from './envelope-types.js';
import type { AnalysisReportV1 } from './report-types.js';
import { assertValidReport } from './validate-report.js';

export class EmittableReportError extends Error {
  readonly code = 'non-emittable-analysis-report';

  constructor(public readonly errors: readonly string[]) {
    super(`Analysis report is not emittable: ${errors.join('; ')}`);
    this.name = 'EmittableReportError';
  }
}

export type EmittableReportOptions = {
  surface: 'cli' | 'mcp';
  envelope: SurveyEnvelopeV1;
};

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const STABLE_ERROR_CODE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

function hasTraversal(segments: readonly string[]): boolean {
  return segments.some(segment => segment === '' || segment === '.' || segment === '..');
}

function isNormalizedAbsolutePath(value: string): boolean {
  if (value.startsWith('/')) {
    if (value.includes('\\')) return false;
    if (value === '/') return true;
    return !hasTraversal(value.slice(1).split('/'));
  }
  if (/^[A-Za-z]:\\/u.test(value)) {
    if (value.includes('/')) return false;
    const remainder = value.slice(3);
    return remainder.length === 0 || !hasTraversal(remainder.split('\\'));
  }
  if (value.startsWith('\\\\')) {
    if (value.includes('/')) return false;
    const segments = value.slice(2).split('\\');
    return segments.length >= 2 && !hasTraversal(segments);
  }
  return false;
}

function validateSubmission(
  submission: AnalysisReportV1['envelope']['submission'],
  errors: string[],
): void {
  const hasAttempt = submission.attempted_at !== undefined;
  const hasError = submission.error_code !== undefined;
  if (submission.state === 'not_requested' || submission.state === 'pending') {
    if (hasAttempt || hasError) errors.push('submission state forbids attempt and error fields');
    return;
  }
  if (!hasAttempt || !Number.isFinite(Date.parse(submission.attempted_at!))) {
    errors.push('completed submission state requires a valid attempted_at');
  }
  if (submission.state === 'acknowledged') {
    if (hasError) errors.push('acknowledged submission forbids error_code');
    return;
  }
  if (!hasError || !STABLE_ERROR_CODE.test(submission.error_code!)) {
    errors.push('failed submission requires a stable error_code');
  }
}

export function assertEmittableReport(
  value: unknown,
  options: EmittableReportOptions,
): asserts value is AnalysisReportV1 {
  assertValidReport(value);
  const errors: string[] = [];
  const id = value.envelope.id;
  if (!UUID_V4.test(value.report_id)) errors.push('report_id must be a lowercase UUIDv4');
  if (id === null || !UUID_V4.test(id)) errors.push('envelope.id must be a lowercase UUIDv4');
  if (value.report_id === id) errors.push('report_id and envelope.id must be distinct');
  if (id !== options.envelope.id) errors.push('report and envelope ids must match');
  if (options.surface === 'mcp') {
    if (value.envelope.path !== null) errors.push('MCP report envelope.path must be null');
  } else if (value.envelope.path === null || !isNormalizedAbsolutePath(value.envelope.path)) {
    errors.push('CLI report envelope.path must be a normalized absolute native path');
  }
  validateSubmission(value.envelope.submission, errors);
  if (errors.length > 0) throw new EmittableReportError(errors);
}
