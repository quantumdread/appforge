import { FINDING_FINGERPRINT_V2_FORMULA } from '../fingerprint.js';
import type { AnalysisBaselineEntry, AnalysisBaselineV1 } from './report-types.js';

export type ParsedAnalysisBaseline = {
  baseline_schema: 'analysis-baseline/1';
  formula: 'finding-fingerprint/2';
  migrated_from?: 'finding-fingerprint/1';
  fingerprint_basis: string | null;
  compatibility_class: 'src-stripped/v1' | null;
  entries: AnalysisBaselineEntry[];
};

export class BaselineInputError extends Error {
  readonly code = 'invalid-baseline';

  constructor(message: string) {
    super(message);
    this.name = 'BaselineInputError';
  }
}

const HEX_16 = /^[0-9a-f]{16}$/u;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const compareLexically = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

function assertExactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
): void {
  const unknown = Object.keys(value).find(key => !allowed.includes(key));
  if (unknown !== undefined) {
    throw new BaselineInputError(`${path} contains an unknown field`);
  }
}

function parseEntry(value: unknown, index: number): AnalysisBaselineEntry {
  if (!isRecord(value)) throw new BaselineInputError(`baseline entry ${index} must be an object`);
  assertExactKeys(value, ['fingerprint', 'rule', 'accepted_at', 'note'], `baseline entry ${index}`);
  if (typeof value.fingerprint !== 'string' || !HEX_16.test(value.fingerprint)) {
    throw new BaselineInputError(`baseline entry ${index}.fingerprint must be 16 lowercase hex`);
  }
  if (typeof value.rule !== 'string' || value.rule.length === 0) {
    throw new BaselineInputError(`baseline entry ${index}.rule must be a non-empty string`);
  }
  if (typeof value.accepted_at !== 'string' || !Number.isFinite(Date.parse(value.accepted_at))) {
    throw new BaselineInputError(`baseline entry ${index}.accepted_at must be a date-time string`);
  }
  if (value.note !== undefined && typeof value.note !== 'string') {
    throw new BaselineInputError(`baseline entry ${index}.note must be a string`);
  }
  return {
    fingerprint: value.fingerprint,
    rule: value.rule,
    accepted_at: value.accepted_at,
    ...(value.note === undefined ? {} : { note: value.note }),
  };
}

export function baselineCompatibilityClass(value: string): 'src-stripped/v1' | null {
  if (value === 'directory/src-stripped/v1' || value === 'msapp/src-stripped/v1') {
    return 'src-stripped/v1';
  }
  if (/^solution\/.+\/src-stripped\/v1$/u.test(value)) return 'src-stripped/v1';
  return null;
}

export function parseAnalysisBaseline(
  value: unknown,
  { wrapperBasis }: { wrapperBasis?: unknown } = {},
): ParsedAnalysisBaseline {
  if (!isRecord(value)) throw new BaselineInputError('baseline must be an object');
  assertExactKeys(
    value,
    ['baseline_schema', 'formula', 'migrated_from', 'fingerprint_basis', 'entries'],
    'baseline',
  );
  if (value.baseline_schema !== 'analysis-baseline/1') {
    throw new BaselineInputError("baseline_schema must be 'analysis-baseline/1'");
  }
  if (value.formula !== FINDING_FINGERPRINT_V2_FORMULA) {
    throw new BaselineInputError(`baseline formula must be '${FINDING_FINGERPRINT_V2_FORMULA}'`);
  }
  if (value.migrated_from !== undefined && value.migrated_from !== 'finding-fingerprint/1') {
    throw new BaselineInputError("migrated_from must be 'finding-fingerprint/1'");
  }
  if (value.fingerprint_basis !== undefined
    && (typeof value.fingerprint_basis !== 'string' || value.fingerprint_basis.length === 0)) {
    throw new BaselineInputError('fingerprint_basis must be a non-empty string');
  }
  if (wrapperBasis !== undefined && (typeof wrapperBasis !== 'string' || wrapperBasis.length === 0)) {
    throw new BaselineInputError('wrapper fingerprint_basis must be a non-empty string');
  }
  if (wrapperBasis !== undefined && wrapperBasis !== value.fingerprint_basis) {
    throw new BaselineInputError('wrapper fingerprint_basis must equal document fingerprint_basis');
  }
  if (!Array.isArray(value.entries)) {
    throw new BaselineInputError('baseline entries must be an array');
  }
  const entries = value.entries.map(parseEntry);
  const keys = entries.map(entry => `${entry.fingerprint}\u0000${entry.rule}`);
  for (let index = 1; index < keys.length; index += 1) {
    if (compareLexically(keys[index - 1], keys[index]) >= 0) {
      throw new BaselineInputError('baseline entries must be a unique lexical tuple set');
    }
  }
  const fingerprintBasis = typeof value.fingerprint_basis === 'string'
    ? value.fingerprint_basis
    : null;
  return {
    baseline_schema: 'analysis-baseline/1',
    formula: FINDING_FINGERPRINT_V2_FORMULA,
    ...(value.migrated_from === undefined ? {} : { migrated_from: value.migrated_from }),
    fingerprint_basis: fingerprintBasis,
    compatibility_class: fingerprintBasis === null
      ? null
      : baselineCompatibilityClass(fingerprintBasis),
    entries,
  };
}

export function assertEmittableBaseline(value: unknown): asserts value is AnalysisBaselineV1 {
  const parsed = parseAnalysisBaseline(value);
  if (parsed.fingerprint_basis === null || parsed.compatibility_class === null) {
    throw new BaselineInputError(
      'emitted baseline requires an exact src-stripped/v1 fingerprint_basis',
    );
  }
}
