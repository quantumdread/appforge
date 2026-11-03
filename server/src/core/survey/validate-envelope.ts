import { RULE_METADATA } from '../rule-metadata.js';
import {
  INCLUDED_FIELD_KINDS,
  MAX_SURVEY_METRIC_COUNT,
  type CatalogEnvelopeAllowlist,
  type NearMissBucket,
  type SurveyEnvelopeV1,
} from './envelope-types.js';

export type EnvelopeValidationResult = { valid: boolean; errors: string[] };

export class EnvelopeValidationError extends Error {
  readonly code = 'invalid-envelope';

  constructor(public readonly errors: readonly string[]) {
    super(`Invalid SurveyEnvelopeV1: ${errors.join('; ')}`);
    this.name = 'EnvelopeValidationError';
  }
}

export class CanonicalEnvelopeError extends Error {
  constructor(
    public readonly code:
      | 'invalid-envelope-encoding'
      | 'invalid-envelope-json'
      | 'noncanonical-envelope',
    message: string,
  ) {
    super(message);
    this.name = 'CanonicalEnvelopeError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const compareLexically = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const ANALYZER_VERSION = /^(?:0|[1-9][0-9]{0,4})\.(?:0|[1-9][0-9]{0,4})\.(?:0|[1-9][0-9]{0,4})(?:-[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?$/u;
const CATALOG_VERSION = /^[0-9]{4}-(?:0[1-9]|1[0-2])-(?:[0-2][0-9]|3[01])T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\.[0-9]{3}Z$/u;

class Validation {
  readonly errors: string[] = [];

  fail(path: string, message: string): void {
    this.errors.push(`${path} ${message}`);
  }

  object(
    value: unknown,
    path: string,
    required: readonly string[],
    allowed: readonly string[] = required,
  ): Record<string, unknown> | null {
    if (!isRecord(value)) {
      this.fail(path, 'must be an object');
      return null;
    }
    for (const key of required) {
      if (!Object.hasOwn(value, key)) this.fail(`${path}.${key}`, 'is required');
    }
    for (const key of Object.keys(value)) {
      if (!allowed.includes(key)) this.fail(`${path}.${key}`, 'is not allowed');
    }
    return value;
  }

  array(value: unknown, path: string): unknown[] | null {
    if (!Array.isArray(value)) {
      this.fail(path, 'must be an array');
      return null;
    }
    return value;
  }

  string(value: unknown, path: string, nonempty = true): value is string {
    if (typeof value !== 'string' || (nonempty && value.length === 0)) {
      this.fail(path, nonempty ? 'must be a non-empty string' : 'must be a string');
      return false;
    }
    return true;
  }

  patternedString(value: unknown, path: string, maximum: number, pattern: RegExp): void {
    if (this.string(value, path)
      && ((value as string).length > maximum || !pattern.test(value as string))) {
      this.fail(path, 'must use the bounded version syntax');
    }
  }

  integer(value: unknown, path: string, minimum: number): value is number {
    if (!Number.isSafeInteger(value)
      || (value as number) < minimum
      || (value as number) > MAX_SURVEY_METRIC_COUNT) {
      this.fail(
        path,
        `must be a safe integer between ${minimum} and ${MAX_SURVEY_METRIC_COUNT}`,
      );
      return false;
    }
    return true;
  }

  enumeration(value: unknown, path: string, allowed: readonly unknown[]): void {
    if (!allowed.includes(value)) this.fail(path, 'must be an allowed value');
  }
}

function sortedUnique(v: Validation, rows: readonly string[], path: string): void {
  for (let index = 1; index < rows.length; index += 1) {
    if (compareLexically(rows[index - 1], rows[index]) >= 0) {
      v.fail(path, 'must be strictly sorted and unique');
      return;
    }
  }
}

function validateRuleRows(
  v: Validation,
  value: unknown,
  path: string,
  countFields: readonly string[],
  minimum: number,
): void {
  const rows = v.array(value, path);
  const keys: string[] = [];
  rows?.forEach((valueRow, index) => {
    const rowPath = `${path}[${index}]`;
    const required = ['rule_id', ...countFields];
    const row = v.object(valueRow, rowPath, required);
    if (!row) return;
    if (v.string(row.rule_id, `${rowPath}.rule_id`)) {
      keys.push(row.rule_id);
      if (!Object.hasOwn(RULE_METADATA, row.rule_id)) {
        v.fail(`${rowPath}.rule_id`, 'must be a declared rule');
      }
    }
    for (const field of countFields) v.integer(row[field], `${rowPath}.${field}`, minimum);
  });
  sortedUnique(v, keys, path);
}

function nearMissTuple(row: Record<string, unknown>): string | null {
  if (typeof row.rule_id !== 'string'
    || typeof row.reason_code !== 'string'
    || typeof row.edit_distance_bucket !== 'string') return null;
  return [
    row.rule_id,
    typeof row.control_type === 'string' ? row.control_type : '',
    row.reason_code,
    row.edit_distance_bucket,
    typeof row.known_candidate === 'string' ? row.known_candidate : '',
  ].join('\u0000');
}

function validateNearMisses(
  v: Validation,
  value: unknown,
  allowlist: CatalogEnvelopeAllowlist,
): void {
  const path = '$.near_miss_buckets';
  const rows = v.array(value, path);
  const allowedTypes = new Set(allowlist.extractor_control_types);
  const allowedProperties = new Map(Object.entries(allowlist.properties_by_control_type)
    .map(([type, properties]) => [type, new Set(properties)]));
  const tuples: string[] = [];

  rows?.forEach((valueRow, index) => {
    const rowPath = `${path}[${index}]`;
    if (!isRecord(valueRow)) {
      v.fail(rowPath, 'must be an object');
      return;
    }
    const isProperty = valueRow.rule_id === 'unknown-property';
    const required = [
      'rule_id',
      ...(isProperty ? ['control_type'] : []),
      'reason_code',
      'edit_distance_bucket',
      'count',
    ];
    const allowed = [...required, 'known_candidate'];
    const row = v.object(valueRow, rowPath, required, allowed);
    if (!row) return;
    v.enumeration(row.rule_id, `${rowPath}.rule_id`, ['unknown-control', 'unknown-property']);
    v.integer(row.count, `${rowPath}.count`, 1);

    const legalPair = row.reason_code === 'case-mismatch'
      ? row.edit_distance_bucket === '0'
      : row.reason_code === 'edit-distance'
        && (row.edit_distance_bucket === '1' || row.edit_distance_bucket === '2');
    if (!legalPair) v.fail(rowPath, 'must carry a legal reason-distance pair');

    if (row.rule_id === 'unknown-control') {
      if (Object.hasOwn(row, 'control_type')) v.fail(`${rowPath}.control_type`, 'is not allowed');
      if (Object.hasOwn(row, 'known_candidate')
        && (!v.string(row.known_candidate, `${rowPath}.known_candidate`)
          || !allowedTypes.has(row.known_candidate as string))) {
        v.fail(`${rowPath}.known_candidate`, 'must be extractor-reachable');
      }
    } else if (row.rule_id === 'unknown-property') {
      if (v.string(row.control_type, `${rowPath}.control_type`)
        && !allowedTypes.has(row.control_type)) {
        v.fail(`${rowPath}.control_type`, 'must be extractor-reachable');
      }
      if (Object.hasOwn(row, 'known_candidate')) {
        const candidateValid = v.string(row.known_candidate, `${rowPath}.known_candidate`);
        if (candidateValid && typeof row.control_type === 'string'
          && !allowedProperties.get(row.control_type)?.has(row.known_candidate as string)) {
          v.fail(`${rowPath}.known_candidate`, 'must belong to the control property table');
        }
      }
    }
    const tuple = nearMissTuple(row);
    if (tuple !== null) tuples.push(tuple);
  });
  sortedUnique(v, tuples, path);
}

function canonicalNearMiss(row: NearMissBucket): NearMissBucket {
  if (row.rule_id === 'unknown-control') {
    return {
      rule_id: row.rule_id,
      reason_code: row.reason_code,
      edit_distance_bucket: row.edit_distance_bucket,
      ...(row.known_candidate === undefined ? {} : { known_candidate: row.known_candidate }),
      count: row.count,
    } as NearMissBucket;
  }
  return {
    rule_id: row.rule_id,
    control_type: row.control_type,
    reason_code: row.reason_code,
    edit_distance_bucket: row.edit_distance_bucket,
    ...(row.known_candidate === undefined ? {} : { known_candidate: row.known_candidate }),
    count: row.count,
  } as NearMissBucket;
}

function serializeCanonicalEnvelope(value: SurveyEnvelopeV1): string {
  const canonical: SurveyEnvelopeV1 = {
    envelope_schema: value.envelope_schema,
    privacy_schema: value.privacy_schema,
    id: value.id,
    manifest: { included_field_kinds: [...value.manifest.included_field_kinds] },
    versions: { analyzer: value.versions.analyzer, catalog: value.versions.catalog },
    source_kind: value.source_kind,
    size_buckets: {
      files: value.size_buckets.files,
      controls: value.size_buckets.controls,
      findings: value.size_buckets.findings,
    },
    rule_counts: value.rule_counts.map(row => ({ rule_id: row.rule_id, count: row.count })),
    opportunity_denominators: value.opportunity_denominators.map(row => ({
      rule_id: row.rule_id,
      count: row.count,
    })),
    ...(value.delta_rule_counts === undefined ? {} : {
      delta_rule_counts: value.delta_rule_counts.map(row => ({
        rule_id: row.rule_id,
        resolved: row.resolved,
        persisted: row.persisted,
      })),
    }),
    extractor_control_types: [...value.extractor_control_types],
    near_miss_buckets: value.near_miss_buckets.map(canonicalNearMiss),
  };
  return `${JSON.stringify(canonical, null, 2)}\n`;
}

export function validateEnvelope(
  value: unknown,
  allowlist: CatalogEnvelopeAllowlist,
): EnvelopeValidationResult {
  const v = new Validation();
  const required = [
    'envelope_schema', 'privacy_schema', 'id', 'manifest', 'versions', 'source_kind',
    'size_buckets', 'rule_counts', 'opportunity_denominators', 'extractor_control_types',
    'near_miss_buckets',
  ];
  const envelope = v.object(value, '$', required, [...required, 'delta_rule_counts']);
  if (!envelope) return { valid: false, errors: v.errors };

  if (envelope.envelope_schema !== 'survey-envelope/1') {
    v.fail('$.envelope_schema', 'must identify survey-envelope/1');
  }
  if (envelope.privacy_schema !== 'survey-minimization/1') {
    v.fail('$.privacy_schema', 'must identify survey-minimization/1');
  }
  if (!v.string(envelope.id, '$.id') || !UUID_V4.test(envelope.id as string)) {
    v.fail('$.id', 'must be a lowercase UUIDv4');
  }
  const manifest = v.object(envelope.manifest, '$.manifest', ['included_field_kinds']);
  if (manifest) {
    const fields = v.array(manifest.included_field_kinds, '$.manifest.included_field_kinds');
    if (fields && (fields.length !== INCLUDED_FIELD_KINDS.length
      || fields.some((field, index) => field !== INCLUDED_FIELD_KINDS[index]))) {
      v.fail('$.manifest.included_field_kinds', 'must equal the privacy manifest');
    }
  }
  const versions = v.object(envelope.versions, '$.versions', ['analyzer', 'catalog']);
  if (versions) {
    v.patternedString(versions.analyzer, '$.versions.analyzer', 64, ANALYZER_VERSION);
    v.patternedString(versions.catalog, '$.versions.catalog', 24, CATALOG_VERSION);
  }
  v.enumeration(envelope.source_kind, '$.source_kind', [
    'directory', 'msapp', 'solution', 'inline',
  ]);
  const sizes = v.object(envelope.size_buckets, '$.size_buckets', [
    'files', 'controls', 'findings',
  ]);
  if (sizes) {
    v.enumeration(sizes.files, '$.size_buckets.files', ['1', '2-5', '6-20', '21-50', '51+']);
    v.enumeration(sizes.controls, '$.size_buckets.controls', [
      '0', '1-25', '26-100', '101-300', '301+',
    ]);
    v.enumeration(sizes.findings, '$.size_buckets.findings', [
      '0', '1-10', '11-50', '51-200', '201+',
    ]);
  }
  validateRuleRows(v, envelope.rule_counts, '$.rule_counts', ['count'], 1);
  validateRuleRows(
    v,
    envelope.opportunity_denominators,
    '$.opportunity_denominators',
    ['count'],
    0,
  );
  if (Object.hasOwn(envelope, 'delta_rule_counts')) {
    validateRuleRows(
      v,
      envelope.delta_rule_counts,
      '$.delta_rule_counts',
      ['resolved', 'persisted'],
      0,
    );
  }
  const types = v.array(envelope.extractor_control_types, '$.extractor_control_types');
  const typeNames: string[] = [];
  const allowedTypes = new Set(allowlist.extractor_control_types);
  types?.forEach((type, index) => {
    if (v.string(type, `$.extractor_control_types[${index}]`)) {
      typeNames.push(type);
      if (!allowedTypes.has(type)) {
        v.fail(`$.extractor_control_types[${index}]`, 'must be extractor-reachable');
      }
    }
  });
  sortedUnique(v, typeNames, '$.extractor_control_types');
  validateNearMisses(v, envelope.near_miss_buckets, allowlist);

  return { valid: v.errors.length === 0, errors: v.errors };
}

export function assertValidEnvelope(
  value: unknown,
  allowlist: CatalogEnvelopeAllowlist,
): asserts value is SurveyEnvelopeV1 {
  const result = validateEnvelope(value, allowlist);
  if (!result.valid) throw new EnvelopeValidationError(result.errors);
}

export function serializeEnvelope(
  value: SurveyEnvelopeV1,
  allowlist: CatalogEnvelopeAllowlist,
): string {
  assertValidEnvelope(value, allowlist);
  return serializeCanonicalEnvelope(value);
}

export function decodeCanonicalEnvelope(
  bytes: Uint8Array,
  allowlist: CatalogEnvelopeAllowlist,
): SurveyEnvelopeV1 {
  let text: string;
  try {
    // Preserve a leading BOM as U+FEFF so JSON parsing/canonical comparison
    // rejects it instead of silently normalizing distinct input bytes.
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new CanonicalEnvelopeError(
      'invalid-envelope-encoding',
      'Envelope bytes are not valid UTF-8',
    );
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new CanonicalEnvelopeError('invalid-envelope-json', 'Envelope bytes are not valid JSON');
  }
  assertValidEnvelope(value, allowlist);
  if (serializeCanonicalEnvelope(value) !== text) {
    throw new CanonicalEnvelopeError(
      'noncanonical-envelope',
      'Envelope bytes are not in the canonical representation',
    );
  }
  return value;
}
