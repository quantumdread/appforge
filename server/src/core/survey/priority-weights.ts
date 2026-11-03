import type { SeverityClass } from '../rule-metadata.js';
import type { FindingConfidence } from './severity.js';

export type EffortClass = 'mechanical' | 'mixed' | 'judgment' | 'unknown';

export const SEVERITY_ORDINAL: Readonly<Record<SeverityClass, number>> = Object.freeze({
  BLOCK: 100,
  CORRECTNESS_RISK: 80,
  PERFORMANCE_RISK: 55,
  MAINTAINABILITY: 30,
  UNCERTAINTY: 10,
});

export const CONFIDENCE_MULT: Readonly<Record<FindingConfidence, number>> = Object.freeze({
  high: 1,
  medium: 0.85,
  low: 0.6,
});

export const EFFORT_MULT: Readonly<Record<EffortClass, number>> = Object.freeze({
  mechanical: 1.15,
  mixed: 1.05,
  unknown: 1,
  judgment: 0.95,
});

export const CONTROLS_SAT = 100;
export const SCREENS_SAT = 10;

export const BLAST_W = Object.freeze({ controls: 0.7, screens: 0.3 });
export const BLAST_RANGE = Object.freeze({ min: 0.5, span: 1 });
export const BAND_MIN = Object.freeze({ now: 60, next: 35 });

export type PriorityWeights = {
  readonly SEVERITY_ORDINAL: Readonly<Record<SeverityClass, number>>;
  readonly CONFIDENCE_MULT: Readonly<Record<FindingConfidence, number>>;
  readonly EFFORT_MULT: Readonly<Record<EffortClass, number>>;
  readonly CONTROLS_SAT: number;
  readonly SCREENS_SAT: number;
  readonly BLAST_W: Readonly<{ controls: number; screens: number }>;
  readonly BLAST_RANGE: Readonly<{ min: number; span: number }>;
  readonly BAND_MIN: Readonly<{ now: number; next: number }>;
};

export const DEFAULT_PRIORITY_WEIGHTS: Readonly<PriorityWeights> = Object.freeze({
  SEVERITY_ORDINAL,
  CONFIDENCE_MULT,
  EFFORT_MULT,
  CONTROLS_SAT,
  SCREENS_SAT,
  BLAST_W,
  BLAST_RANGE,
  BAND_MIN,
});

export type PriorityWeightOverrides = {
  SEVERITY_ORDINAL?: Partial<Record<SeverityClass, number>>;
  CONFIDENCE_MULT?: Partial<Record<FindingConfidence, number>>;
  EFFORT_MULT?: Partial<Record<EffortClass, number>>;
  CONTROLS_SAT?: number;
  SCREENS_SAT?: number;
  BLAST_W?: Partial<{ controls: number; screens: number }>;
  BLAST_RANGE?: Partial<{ min: number; span: number }>;
  BAND_MIN?: Partial<{ now: number; next: number }>;
};

/** Typed survey-side policy seam; `SurveyOptions.policy` stays unknown until Task 5. */
export type PriorityPolicy = {
  readonly priority_weights?: PriorityWeightOverrides;
};

export class PriorityWeightsError extends Error {
  readonly code = 'INVALID_PRIORITY_WEIGHTS';

  constructor(message: string) {
    super(message);
    this.name = 'PriorityWeightsError';
  }
}

type WeightTree = number | { readonly [key: string]: WeightTree };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function mergeWeightTree(
  defaults: WeightTree,
  override: unknown,
  path: string,
  provided: boolean,
): WeightTree {
  if (typeof defaults === 'number') {
    const value = provided ? override : defaults;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new PriorityWeightsError(`${path} must be a finite number`);
    }
    return value;
  }

  if (provided && !isRecord(override)) {
    throw new PriorityWeightsError(`${path} must be an object`);
  }
  const supplied = provided ? override as Record<string, unknown> : {};
  for (const key of Object.keys(supplied)) {
    if (!Object.hasOwn(defaults, key)) {
      throw new PriorityWeightsError(`unknown priority weight: ${path}.${key}`);
    }
  }

  const merged: Record<string, WeightTree> = {};
  for (const [key, defaultValue] of Object.entries(defaults)) {
    const hasOverride = Object.hasOwn(supplied, key);
    merged[key] = mergeWeightTree(
      defaultValue,
      hasOverride ? supplied[key] : undefined,
      `${path}.${key}`,
      hasOverride,
    );
  }
  return Object.freeze(merged);
}

export function mergePriorityWeights(overrides?: unknown): PriorityWeights {
  if (overrides !== undefined && !isRecord(overrides)) {
    throw new PriorityWeightsError('priority_weights must be an object');
  }
  return mergeWeightTree(
    DEFAULT_PRIORITY_WEIGHTS as unknown as WeightTree,
    overrides,
    'priority_weights',
    overrides !== undefined,
  ) as PriorityWeights;
}
