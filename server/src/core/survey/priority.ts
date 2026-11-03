import type { RemedyKind, SeverityClass } from '../rule-metadata.js';
import type { ClassifiedIssue } from './grouping.js';
import type { FindingConfidence } from './severity.js';
import {
  DEFAULT_PRIORITY_WEIGHTS,
  type EffortClass,
  type PriorityWeights,
} from './priority-weights.js';

export type DescriptorCoverage = 'full' | 'partial' | 'none';
export type PriorityBand = 'now' | 'verify-first' | 'next' | 'later';

export const PRIORITY_APP_TYPE = '__App';
export const PRIORITY_COMPONENT_DEFINITION_TYPE = '__ComponentDefinition';

export type PriorityCalculationInputs = {
  severity: SeverityClass;
  confidence: FindingConfidence;
  blast: {
    controls: number;
    screens: number;
  };
  effort_class: EffortClass;
  descriptor_coverage: DescriptorCoverage;
};

export type Priority = {
  band: PriorityBand;
  score: number;
  inputs: {
    severity: SeverityClass;
    confidence: FindingConfidence;
    blast: {
      controls: number;
      screens: number;
      factor: number;
    };
    effort_class: EffortClass;
    descriptor_coverage: DescriptorCoverage;
  };
  formula: 'priority/1';
};

export type PriorityGroupMember = Readonly<ClassifiedIssue & {
  confidence: FindingConfidence;
  baseline_status?: 'new' | 'accepted';
  suppressed_by?: string;
}>;

/** The priority seam consumes Task 3's already-derived dominant severity. */
export type PriorityGroup = {
  readonly dominant_severity: SeverityClass;
  readonly members: readonly PriorityGroupMember[];
};

const CONFIDENCE_ORDER: Readonly<Record<FindingConfidence, number>> = Object.freeze({
  low: 1,
  medium: 2,
  high: 3,
});

/**
 * Plan 5 can promote deterministic remedies when descriptors ship. In v2.4.9
 * descriptor coverage is always `none`, so every documented remedy requires
 * judgment and only an undocumented remedy remains `unknown`.
 */
export const EFFORT_CLASS_BY_REMEDY_KIND: Readonly<Record<RemedyKind, EffortClass>> = Object.freeze({
  deterministic: 'judgment',
  'human-value': 'judgment',
  prose: 'judgment',
  none: 'unknown',
});

export function groupConfidence(group: Readonly<PriorityGroup>): FindingConfidence {
  const dominantMembers = group.members.filter(
    member => member.severity === group.dominant_severity,
  );
  if (dominantMembers.length === 0) {
    throw new Error('priority group has no member with its dominant severity');
  }
  return dominantMembers.reduce<FindingConfidence>(
    (lowest, member) => CONFIDENCE_ORDER[member.confidence] < CONFIDENCE_ORDER[lowest]
      ? member.confidence
      : lowest,
    'high',
  );
}

export function blastForGroup(
  group: Readonly<PriorityGroup>,
  totalScreenCount: number,
  screenByControl: ReadonlyMap<string, string>,
): { controls: number; screens: number } {
  const controls = new Set<string>();
  const screens = new Set<string>();
  let appWide = false;

  for (const member of group.members) {
    const offenders = member.controls && member.controls.length > 0
      ? member.controls
      : [member.control];
    for (const offender of offenders) controls.add(`${member.file}\u0000${offender}`);

    if (
      member.type === PRIORITY_APP_TYPE
      || member.type === PRIORITY_COMPONENT_DEFINITION_TYPE
    ) appWide = true;
    else screens.add(screenByControl.get(member.control) ?? member.file);
  }

  return {
    controls: appWide ? Math.max(1, controls.size) : controls.size,
    screens: appWide ? totalScreenCount : screens.size,
  };
}

export function effortClassForRemedy(remedyKind: RemedyKind): EffortClass {
  return EFFORT_CLASS_BY_REMEDY_KIND[remedyKind];
}

export function priorityInputsForGroup(
  group: Readonly<PriorityGroup>,
  remedyKind: RemedyKind,
  totalScreenCount: number,
  screenByControl: ReadonlyMap<string, string>,
): PriorityCalculationInputs {
  return {
    severity: group.dominant_severity,
    confidence: groupConfidence(group),
    blast: blastForGroup(group, totalScreenCount, screenByControl),
    effort_class: effortClassForRemedy(remedyKind),
    descriptor_coverage: 'none',
  };
}

export type RemediationOrderItem = {
  readonly band: PriorityBand;
  readonly score: number;
  readonly group_id: string;
  readonly severity: SeverityClass;
};

const BAND_ORDER: Readonly<Record<PriorityBand, number>> = Object.freeze({
  now: 4,
  'verify-first': 3,
  next: 2,
  later: 1,
});

export function compareRemediation(
  left: Readonly<RemediationOrderItem>,
  right: Readonly<RemediationOrderItem>,
): number {
  const bandOrder = BAND_ORDER[right.band] - BAND_ORDER[left.band];
  if (bandOrder !== 0) return bandOrder;

  if (left.band === 'now') {
    const leftBlock = left.severity === 'BLOCK';
    const rightBlock = right.severity === 'BLOCK';
    if (leftBlock !== rightBlock) return leftBlock ? -1 : 1;
  }

  const scoreOrder = right.score - left.score;
  if (scoreOrder !== 0) return scoreOrder;
  return left.group_id < right.group_id ? -1 : left.group_id > right.group_id ? 1 : 0;
}

export type ActionStateMember = {
  readonly severity: SeverityClass;
  readonly baseline_status?: 'new' | 'accepted';
  readonly suppressed_by?: string;
};

export type ActionStateResult =
  | { action_state: 'active' | 'accepted' | 'suppressed' }
  | { action_state: 'mixed'; accepted_count: number; suppressed_count: number };

export function actionState(members: readonly ActionStateMember[]): ActionStateResult {
  if (members.some(member => member.severity === 'BLOCK')) {
    return { action_state: 'active' };
  }

  let acceptedCount = 0;
  let suppressedCount = 0;
  for (const member of members) {
    // Suppression wins when an invalid input marks a finding both ways.
    if (member.suppressed_by !== undefined) suppressedCount++;
    else if (member.baseline_status === 'accepted') acceptedCount++;
  }

  if (members.length > 0 && suppressedCount === members.length) {
    return { action_state: 'suppressed' };
  }
  if (members.length > 0 && acceptedCount === members.length) {
    return { action_state: 'accepted' };
  }
  if (acceptedCount === 0 && suppressedCount === 0) {
    return { action_state: 'active' };
  }
  return {
    action_state: 'mixed',
    accepted_count: acceptedCount,
    suppressed_count: suppressedCount,
  };
}

const clamp = (minimum: number, maximum: number, value: number): number =>
  Math.min(maximum, Math.max(minimum, value));

export function computePriority(
  inputs: Readonly<PriorityCalculationInputs>,
  weights: Readonly<PriorityWeights> = DEFAULT_PRIORITY_WEIGHTS,
): Priority {
  const controlsTerm = Math.min(
    1,
    Math.log10(1 + inputs.blast.controls) / Math.log10(1 + weights.CONTROLS_SAT),
  );
  const screensTerm = Math.min(1, inputs.blast.screens / weights.SCREENS_SAT);
  const factor = weights.BLAST_W.controls * controlsTerm
    + weights.BLAST_W.screens * screensTerm;
  const blastMult = weights.BLAST_RANGE.min + weights.BLAST_RANGE.span * factor;
  const computedScore = clamp(0, 100, Math.round(
    weights.SEVERITY_ORDINAL[inputs.severity]
      * weights.CONFIDENCE_MULT[inputs.confidence]
      * weights.EFFORT_MULT[inputs.effort_class]
      * blastMult,
  ));
  const score = inputs.severity === 'BLOCK' ? 100 : computedScore;
  const band: PriorityBand = inputs.severity === 'BLOCK'
    ? 'now'
    : inputs.severity === 'UNCERTAINTY'
      ? 'verify-first'
      : score >= weights.BAND_MIN.now
        ? 'now'
        : score >= weights.BAND_MIN.next
          ? 'next'
          : 'later';

  return {
    band,
    score,
    inputs: {
      severity: inputs.severity,
      confidence: inputs.confidence,
      blast: {
        controls: inputs.blast.controls,
        screens: inputs.blast.screens,
        factor,
      },
      effort_class: inputs.effort_class,
      descriptor_coverage: inputs.descriptor_coverage,
    },
    formula: 'priority/1',
  };
}
