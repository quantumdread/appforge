import { FINDING_FINGERPRINT_V2_FORMULA } from '../fingerprint.js';
import type { SeverityClass } from '../rule-metadata.js';
import type {
  AnalysisBaselineV1,
  BaselineSection,
  SuppressionEntry,
  SuppressionsSection,
} from './report-types.js';
import {
  baselineCompatibilityClass,
  BaselineInputError,
  parseAnalysisBaseline,
} from './baseline-input.js';

export type { AnalysisBaselineV1, SuppressionEntry } from './report-types.js';
export { BaselineInputError } from './baseline-input.js';
export type SurveyBaseline = AnalysisBaselineV1;
export type SuppressionInput = SuppressionEntry;

const HEX_12 = /^[0-9a-f]{12}$/u;
const ANALYSIS_BASELINE_KEYS = [
  'baseline_schema', 'formula', 'migrated_from', 'fingerprint_basis', 'entries',
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export type BaselineCandidate = {
  fingerprint: string;
  rule: string;
  severity: SeverityClass;
};

export type AnalysisBaselineReadV1 = Omit<AnalysisBaselineV1, 'fingerprint_basis'> & {
  fingerprint_basis?: string;
};

export type BaselineInput = AnalysisBaselineReadV1 | {
  source?: string;
  fingerprint_basis?: string;
  data: unknown;
};

export type BaselineEvaluation = {
  section: BaselineSection;
  accepted_fingerprints: ReadonlySet<string>;
};

type BaselineEnvelope = {
  source: string | null;
  fingerprintBasis?: string;
  data: unknown;
};

function unwrapBaseline(input: BaselineInput): BaselineEnvelope {
  if (isRecord(input) && Object.hasOwn(input, 'data')) {
    const wrapped = input as Record<string, unknown>;
    const unknown = Object.keys(wrapped).find(key => ![
      'source', 'fingerprint_basis', 'data',
    ].includes(key));
    if (unknown !== undefined) throw new BaselineInputError('baseline wrapper has an unknown field');
    if (wrapped.source !== undefined && typeof wrapped.source !== 'string') {
      throw new BaselineInputError('baseline wrapper source must be a string');
    }
    if (wrapped.fingerprint_basis !== undefined
      && (typeof wrapped.fingerprint_basis !== 'string'
        || wrapped.fingerprint_basis.length === 0)) {
      throw new BaselineInputError('baseline wrapper fingerprint_basis must be a non-empty string');
    }
    return {
      source: typeof wrapped.source === 'string' ? wrapped.source : null,
      ...(wrapped.fingerprint_basis === undefined
        ? {}
        : { fingerprintBasis: wrapped.fingerprint_basis as string }),
      data: wrapped.data,
    };
  }
  return { source: null, data: input };
}

function recognizesLegacyCliBaseline(value: unknown): boolean {
  return isRecord(value)
    && !ANALYSIS_BASELINE_KEYS.some(key => Object.hasOwn(value, key))
    && Array.isArray(value.findings)
    && value.findings.every(entry => isRecord(entry)
      && typeof entry.fingerprint === 'string'
      && HEX_12.test(entry.fingerprint));
}

export function evaluateBaseline(
  input: BaselineInput | undefined,
  candidates: readonly BaselineCandidate[],
  fingerprintBasis: string,
): BaselineEvaluation {
  if (input === undefined) {
    return {
      section: {
        formula: FINDING_FINGERPRINT_V2_FORMULA,
        applied_from: null,
        basis_matches: false,
        accepted_total: 0,
        stale_entries: [],
        migration_required: false,
      },
      accepted_fingerprints: new Set(),
    };
  }

  const envelope = unwrapBaseline(input);
  const appliedFrom = envelope.source;
  if (recognizesLegacyCliBaseline(envelope.data)) {
    return {
      section: {
        formula: FINDING_FINGERPRINT_V2_FORMULA,
        applied_from: appliedFrom,
        basis_matches: false,
        accepted_total: 0,
        stale_entries: [],
        migration_required: true,
      },
      accepted_fingerprints: new Set(),
    };
  }

  const parsed = parseAnalysisBaseline(envelope.data, {
    ...(envelope.fingerprintBasis === undefined
      ? {}
      : { wrapperBasis: envelope.fingerprintBasis }),
  });
  const currentCompatibility = baselineCompatibilityClass(fingerprintBasis);
  const basisMatches = parsed.compatibility_class !== null
    && currentCompatibility !== null
    && parsed.compatibility_class === currentCompatibility;
  const candidateKeys = new Set(candidates
    .filter(candidate => candidate.severity !== 'BLOCK')
    .map(candidate => `${candidate.fingerprint}\u0000${candidate.rule}`));
  const accepted = new Set<string>();

  if (basisMatches) {
    for (const entry of parsed.entries) {
      if (candidateKeys.has(`${entry.fingerprint}\u0000${entry.rule}`)) {
        accepted.add(entry.fingerprint);
      }
    }
  }

  return {
    section: {
      formula: FINDING_FINGERPRINT_V2_FORMULA,
      applied_from: appliedFrom ?? 'analysis-baseline/1',
      basis_matches: basisMatches,
      accepted_total: accepted.size,
      stale_entries: basisMatches
        ? parsed.entries.filter(entry => !candidateKeys.has(`${entry.fingerprint}\u0000${entry.rule}`))
        : [],
      migration_required: false,
    },
    accepted_fingerprints: accepted,
  };
}

export type SuppressionCandidate = BaselineCandidate & {
  file: string;
  control: string;
};

export type SuppressionEvaluation = {
  section: SuppressionsSection;
  suppressed_by_fingerprint: ReadonlyMap<string, string>;
};

function parseSuppression(value: unknown, index: number):
  | { valid: true; entry: SuppressionEntry; expiresAt: number }
  | { valid: false; reason: string } {
  if (!isRecord(value)) return { valid: false, reason: 'entry must be an object' };
  if (typeof value.rule !== 'string' || value.rule.length === 0) {
    return { valid: false, reason: 'rule is required and must be a non-empty string' };
  }
  if (!isRecord(value.scope)) return { valid: false, reason: 'scope is required and must be an object' };
  if (value.scope.file !== undefined && typeof value.scope.file !== 'string') {
    return { valid: false, reason: 'scope.file must be a string' };
  }
  if (value.scope.control !== undefined && typeof value.scope.control !== 'string') {
    return { valid: false, reason: 'scope.control must be a string' };
  }
  for (const field of ['rationale', 'owner', 'expires'] as const) {
    if (typeof value[field] !== 'string' || value[field].length === 0) {
      return { valid: false, reason: `${field} is required and must be a non-empty string` };
    }
  }
  const expiresAt = Date.parse(value.expires as string);
  if (!Number.isFinite(expiresAt)) return { valid: false, reason: 'expires must be a date-time string' };

  return {
    valid: true,
    expiresAt,
    entry: {
      rule: value.rule,
      scope: {
        ...(value.scope.file === undefined ? {} : { file: value.scope.file }),
        ...(value.scope.control === undefined ? {} : { control: value.scope.control }),
      },
      rationale: value.rationale as string,
      owner: value.owner as string,
      expires: value.expires as string,
    },
  };
}

function suppressionRows(input: unknown): unknown[] | null {
  if (Array.isArray(input)) return input;
  if (!isRecord(input)) return null;
  if (Array.isArray(input.suppressions)) return input.suppressions;
  if (Array.isArray(input.entries)) return input.entries;
  return null;
}

export function evaluateSuppressions(
  input: unknown,
  candidates: readonly SuppressionCandidate[],
  now: string,
): SuppressionEvaluation {
  if (input === undefined) {
    return {
      section: { applied_count: 0, expired: [], invalid: [] },
      suppressed_by_fingerprint: new Map(),
    };
  }

  const rows = suppressionRows(input);
  if (rows === null) {
    return {
      section: {
        applied_count: 0,
        expired: [],
        invalid: [{ index: -1, reason: 'suppressions must be an array' }],
      },
      suppressed_by_fingerprint: new Map(),
    };
  }

  const nowAt = Date.parse(now);
  const expired: SuppressionEntry[] = [];
  const invalid: Array<{ index: number; reason: string }> = [];
  const active: SuppressionEntry[] = [];
  rows.forEach((row, index) => {
    const parsed = parseSuppression(row, index);
    if (!parsed.valid) invalid.push({ index, reason: parsed.reason });
    else if (parsed.expiresAt <= nowAt) expired.push(parsed.entry);
    else active.push(parsed.entry);
  });

  const suppressed = new Map<string, string>();
  for (const candidate of candidates) {
    if (candidate.severity === 'BLOCK') continue;
    const matching = active.find(entry => entry.rule === candidate.rule
      && (entry.scope.file === undefined || entry.scope.file === candidate.file)
      && (entry.scope.control === undefined || entry.scope.control === candidate.control));
    if (matching) suppressed.set(candidate.fingerprint, matching.owner);
  }

  return {
    section: { applied_count: suppressed.size, expired, invalid },
    suppressed_by_fingerprint: suppressed,
  };
}
