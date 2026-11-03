import { timingSafeEqual } from 'node:crypto';
import { sha256 } from '../core/sha256.js';
import type { SurveyEnvelopeV1 } from '../core/survey/envelope-types.js';
import { decodeCanonicalEnvelope } from '../core/survey/validate-envelope.js';
import { ANALYZER_CATALOG_ALLOWLIST } from './survey.js';

export const MAX_SURVEY_ENVELOPE_BYTES = 256 * 1024;
export const SURVEY_TELEMETRY_OBJECT_NAME = 'stats:survey';

export type SurveyMetric = readonly [metricKey: string, count: number];

export type SurveyTelemetryAcknowledgement = {
  acknowledged: true;
  duplicate: boolean;
};

export type SurveyTelemetryConflict = {
  acknowledged: false;
  conflict: true;
};

export type SurveyTelemetrySubmitResult =
  | SurveyTelemetryAcknowledgement
  | SurveyTelemetryConflict;

type SurveyTelemetryStub = {
  submit(canonicalEnvelopeBytes: Uint8Array, digest: string): Promise<SurveyTelemetrySubmitResult>;
};

type SurveyTelemetryNamespace = {
  idFromName(name: string): unknown;
  get(id: unknown): SurveyTelemetryStub;
};

export type SurveyTelemetryEnv = {
  MCP_AUTH_TOKEN?: string;
  MCP_USER_TOKENS?: string;
  SURVEY_TELEMETRY?: SurveyTelemetryNamespace;
};

export type ScheduledSurveyTelemetry = {
  digest: string;
  promise: Promise<SurveyTelemetrySubmitResult>;
};

export class SurveyTelemetryInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SurveyTelemetryInputError';
  }
}

const encodeMetricPart = (value: string): string => encodeURIComponent(value);

/**
 * Version metric keys carry only the leading `major.minor` so patch releases do
 * not fan out the metric key space. A version string with no leading
 * `major.minor` (the catalog's extraction timestamp) is emitted unchanged
 * rather than truncated to something it does not mean.
 */
const majorMinorKey = (version: string): string => {
  const match = /^(\d+)\.(\d+)/u.exec(version);
  return match === null ? version : `${match[1]}.${match[2]}`;
};

export function metricsForSurveyEnvelope(envelope: SurveyEnvelopeV1): SurveyMetric[] {
  const metrics: SurveyMetric[] = [['stats:survey', 1]];
  // Joint cohorts retain the exact catalog identity. Historic marginal version
  // counters cannot reconstruct these counts and remain unchanged below.
  const cohort = `survey:cohort:v1:catalog:${encodeMetricPart(envelope.versions.catalog)}`;
  metrics.push([`${cohort}:runs`, 1]);
  for (const row of envelope.rule_counts) {
    metrics.push([`${cohort}:rule:${encodeMetricPart(row.rule_id)}`, row.count]);
  }
  for (const row of envelope.rule_counts) {
    metrics.push([`survey:rule:${encodeMetricPart(row.rule_id)}`, row.count]);
  }
  for (const row of envelope.opportunity_denominators) {
    metrics.push([`survey:opportunity:${encodeMetricPart(row.rule_id)}`, row.count]);
  }
  for (const row of envelope.delta_rule_counts ?? []) {
    metrics.push([`survey:delta-resolved:${encodeMetricPart(row.rule_id)}`, row.resolved]);
    metrics.push([`survey:delta-persisted:${encodeMetricPart(row.rule_id)}`, row.persisted]);
  }
  for (const controlType of envelope.extractor_control_types) {
    metrics.push([`survey:extractor-type:${encodeMetricPart(controlType)}`, 1]);
  }
  for (const row of envelope.near_miss_buckets) {
    const controlType = row.rule_id === 'unknown-property' ? row.control_type : '';
    metrics.push([
      [
        'survey:near-miss',
        encodeMetricPart(row.rule_id),
        encodeMetricPart(row.reason_code),
        encodeMetricPart(row.edit_distance_bucket),
        `control=${encodeMetricPart(controlType)}`,
        `candidate=${encodeMetricPart(row.known_candidate ?? '')}`,
      ].join(':'),
      row.count,
    ]);
  }
  metrics.push(
    [`survey:version:analyzer:${encodeMetricPart(majorMinorKey(envelope.versions.analyzer))}`, 1],
    [`survey:version:catalog:${encodeMetricPart(majorMinorKey(envelope.versions.catalog))}`, 1],
    [`survey:source-kind:${encodeMetricPart(envelope.source_kind)}`, 1],
    [`survey:size:files:${encodeMetricPart(envelope.size_buckets.files)}`, 1],
    [`survey:size:controls:${encodeMetricPart(envelope.size_buckets.controls)}`, 1],
    [`survey:size:findings:${encodeMetricPart(envelope.size_buckets.findings)}`, 1],
  );
  return metrics;
}

/** Compare fixed-size token digests so even unequal token lengths use timingSafeEqual. */
export function tokenMatches(provided: string, expected: string): boolean {
  const encoder = new TextEncoder();
  return timingSafeEqual(
    encoder.encode(sha256(provided)),
    encoder.encode(sha256(expected)),
  );
}

/** The MCP_AUTH_TOKEN holder's caller label in logs. */
export const PRIMARY_CALLER = 'owner';
const CALLER_LABEL = /^[a-z0-9][a-z0-9_-]{0,31}$/u;

/**
 * Additional named callers come from the optional MCP_USER_TOKENS secret, a
 * JSON object of { label: token }. A malformed secret admits no extra caller;
 * MCP_AUTH_TOKEN keeps working. Every candidate is compared, so timing does not
 * reveal which one matched.
 */
export function resolveCaller(
  provided: string,
  env: Pick<SurveyTelemetryEnv, 'MCP_AUTH_TOKEN' | 'MCP_USER_TOKENS'>,
): string | null {
  const candidates: Array<[string, string]> = [];
  if (env.MCP_AUTH_TOKEN) candidates.push([PRIMARY_CALLER, env.MCP_AUTH_TOKEN]);
  if (env.MCP_USER_TOKENS) {
    try {
      const parsed: unknown = JSON.parse(env.MCP_USER_TOKENS);
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [label, token] of Object.entries(parsed)) {
          if (CALLER_LABEL.test(label) && label !== PRIMARY_CALLER
            && typeof token === 'string' && token.length >= 32) {
            candidates.push([label, token]);
          }
        }
      }
    } catch { /* malformed secret: no extra callers */ }
  }
  let caller: string | null = null;
  for (const [label, token] of candidates) {
    if (tokenMatches(provided, token) && caller === null) caller = label;
  }
  return caller;
}

function jsonResponse(value: unknown, status: number): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function hasJsonMediaType(request: Request): boolean {
  const contentType = request.headers.get('content-type');
  return contentType !== null
    && /^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/iu.test(contentType);
}

async function readBoundedBody(request: Request): Promise<Uint8Array | null> {
  const statedLength = request.headers.get('content-length');
  if (statedLength !== null && /^[0-9]+$/u.test(statedLength)
    && Number(statedLength) > MAX_SURVEY_ENVELOPE_BYTES) {
    return null;
  }
  if (request.body === null) return new Uint8Array();

  const limit = MAX_SURVEY_ENVELOPE_BYTES + 1;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let retained = 0;
  while (retained < limit) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value.byteLength === 0) continue;
    const remaining = limit - retained;
    const captured = value.byteLength > remaining ? value.subarray(0, remaining) : value;
    chunks.push(captured);
    retained += captured.byteLength;
    if (retained >= limit) {
      try {
        await reader.cancel();
      } catch {
        // Cleanup is best-effort after the payload has already been classified.
      }
      break;
    }
  }
  if (retained > MAX_SURVEY_ENVELOPE_BYTES) return null;
  const body = new Uint8Array(retained);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export function surveyTelemetryStub(env: SurveyTelemetryEnv): SurveyTelemetryStub | null {
  const binding = env.SURVEY_TELEMETRY;
  if (!binding) return null;
  return binding.get(binding.idFromName(SURVEY_TELEMETRY_OBJECT_NAME));
}

export function scheduleSurveyTelemetry(
  env: SurveyTelemetryEnv,
  canonicalEnvelopeBytes: Uint8Array,
): ScheduledSurveyTelemetry | null {
  if (canonicalEnvelopeBytes.byteLength > MAX_SURVEY_ENVELOPE_BYTES) {
    throw new RangeError('Survey envelope exceeds the submission limit');
  }
  // Compute over exact bytes before parsing, then validate before the RPC boundary.
  const digest = sha256(canonicalEnvelopeBytes);
  try {
    decodeCanonicalEnvelope(canonicalEnvelopeBytes, ANALYZER_CATALOG_ALLOWLIST);
  } catch {
    throw new SurveyTelemetryInputError('Survey envelope is invalid');
  }
  const stub = surveyTelemetryStub(env);
  if (stub === null) return null;
  return {
    digest,
    promise: stub.submit(canonicalEnvelopeBytes, digest),
  };
}

export async function handleSurveyEnvelopeRequest(
  request: Request,
  env: SurveyTelemetryEnv,
): Promise<Response> {
  const expected = env.MCP_AUTH_TOKEN;
  if (!expected || !env.SURVEY_TELEMETRY) {
    return jsonResponse({ error: 'server-not-configured' }, 503);
  }
  const authorization = request.headers.get('authorization') ?? '';
  if (!authorization.startsWith('Bearer ')
    || resolveCaller(authorization.slice(7), env) === null) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }
  if (!hasJsonMediaType(request)) {
    return jsonResponse({ error: 'unsupported-media-type' }, 415);
  }

  let captured: Uint8Array | null;
  try {
    captured = await readBoundedBody(request);
  } catch {
    return jsonResponse({ error: 'invalid-envelope' }, 400);
  }
  if (captured === null) return jsonResponse({ error: 'payload-too-large' }, 413);

  let scheduled: ScheduledSurveyTelemetry | null;
  try {
    scheduled = scheduleSurveyTelemetry(env, captured);
  } catch (error) {
    if (error instanceof SurveyTelemetryInputError) {
      return jsonResponse({ error: 'invalid-envelope' }, 400);
    }
    if (error instanceof RangeError) {
      return jsonResponse({ error: 'payload-too-large' }, 413);
    }
    return jsonResponse({ error: 'telemetry-unavailable' }, 503);
  }

  try {
    if (scheduled === null) return jsonResponse({ error: 'server-not-configured' }, 503);
    const result = await scheduled.promise;
    if (!result.acknowledged) {
      return jsonResponse({ error: 'envelope-conflict' }, 409);
    }
    return jsonResponse(result, 200);
  } catch {
    return jsonResponse({ error: 'telemetry-unavailable' }, 503);
  }
}
