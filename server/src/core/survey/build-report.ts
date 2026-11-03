import type { DatasourceType } from '../datasource.js';
import { findingFingerprintV2, FINDING_FINGERPRINT_V2_FORMULA } from '../fingerprint.js';
import { controlNodes } from '../model.js';
import { RULE_METADATA, type SeverityClass } from '../rule-metadata.js';
import { sha256 } from '../sha256.js';
import {
  evaluateBaseline,
  evaluateSuppressions,
  type BaselineInput,
} from './baseline.js';
import { groupIssues, type ClassifiedIssue, type RootCauseGroup } from './grouping.js';
import {
  buildBackendRiskInventory,
  buildComponentInventory,
  buildConnectionInventory,
  buildDatasourceInventory,
  buildScreenInventory,
  buildVersionLagInventory,
  buildModernizationInventory,
} from './inventories.js';
import {
  actionState,
  compareRemediation,
  computePriority,
  priorityInputsForGroup,
} from './priority.js';
import {
  mergePriorityWeights,
  PriorityWeightsError,
  type PriorityWeightOverrides,
} from './priority-weights.js';
import type { ReadonlySnapshot } from './readonly.js';
import {
  ANALYSIS_REPORT_SCHEMA,
  ANALYSIS_REPORT_SCHEMA_MINOR,
  type AnalysisReportV1,
  type IntakeCoverageLimitation,
  type ReportFinding,
  type ReportPolicy,
  type RootCause,
} from './report-types.js';
import { confidenceOf, severityOf, type SeverityOverride } from './severity.js';
import type { SurveyOutputBudget } from './output-budget.js';
import { snapshotForProfile, type SurveyProfile } from './profile.js';

export type IntakeLimitation = IntakeCoverageLimitation;

export type SurveyInput = {
  app_name: {
    value: string | null;
    resolved_by: 'manifest' | 'directory' | 'archive-entry' | 'unresolved';
  };
  source_kind: 'directory' | 'msapp' | 'solution' | 'inline';
  fingerprint_basis: string;
  files: Array<{ id: string; sha256: string }>;
  limitations: IntakeLimitation[];
  connections: {
    state: 'available' | 'unavailable' | 'empty';
    rows: Array<{ connector_type: string; count: number }>;
  };
  explicit_datasources?: Record<string, DatasourceType>;
  export_datasources?: Record<string, DatasourceType>;
};

export type SurveyPolicyInput = {
  profile_id?: SurveyProfile;
  severity_overrides?: readonly SeverityOverride[];
  priority_weights?: PriorityWeightOverrides;
};

export type SurveyOptions = {
  now: string;
  report_id: string;
  analyzer_version: string;
  baseline?: BaselineInput;
  suppressions?: unknown;
  previous?: AnalysisReportV1;
  policy?: SurveyPolicyInput;
};

export type ReportBuildErrorCode =
  | 'file-id-mismatch'
  | 'delta-comparison-refused'
  | 'invalid-policy'
  | 'unknown-rule';

export class ReportBuildError extends Error {
  constructor(
    public readonly code: ReportBuildErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ReportBuildError';
  }
}

type AssembledIssue = ClassifiedIssue & {
  confidence: ReportFinding['confidence'];
  confidence_basis: ReportFinding['confidence_basis'];
  fingerprint: string;
};

const SEVERITIES = new Set<SeverityClass>([
  'BLOCK',
  'CORRECTNESS_RISK',
  'PERFORMANCE_RISK',
  'MAINTAINABILITY',
  'UNCERTAINTY',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function cloneWeightOverrides(value: PriorityWeightOverrides): PriorityWeightOverrides {
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [
    key,
    isRecord(child) ? { ...child } : child,
  ])) as PriorityWeightOverrides;
}

function policyFrom(input: SurveyPolicyInput | undefined): {
  report: ReportPolicy;
  profile: SurveyProfile;
  mergedWeights: ReturnType<typeof mergePriorityWeights>;
} {
  if (input !== undefined && !isRecord(input)) {
    throw new ReportBuildError('invalid-policy', 'policy must be an object');
  }
  const profileId = input?.profile_id === undefined ? 'shared' : input.profile_id;
  if (profileId !== 'shared' && profileId !== 'existing-export') {
    throw new ReportBuildError('invalid-policy', 'policy.profile_id must be shared or existing-export');
  }
  const overrides = input?.severity_overrides ?? [];
  if (!Array.isArray(overrides)) {
    throw new ReportBuildError('invalid-policy', 'policy.severity_overrides must be an array');
  }
  const severityOverrides: SeverityOverride[] = overrides.map((override, index) => {
    if (!isRecord(override)
      || typeof override.rule !== 'string'
      || override.rule.length === 0
      || typeof override.severity !== 'string'
      || !SEVERITIES.has(override.severity as SeverityClass)) {
      throw new ReportBuildError(
        'invalid-policy',
        `policy.severity_overrides[${index}] must carry a rule and closed severity`,
      );
    }
    return { rule: override.rule, severity: override.severity as SeverityClass };
  });
  let mergedWeights: ReturnType<typeof mergePriorityWeights>;
  try {
    mergedWeights = mergePriorityWeights(input?.priority_weights);
  } catch (error) {
    if (error instanceof PriorityWeightsError) {
      throw new ReportBuildError('invalid-policy', error.message);
    }
    throw error;
  }
  const priorityWeights = input?.priority_weights === undefined
    ? undefined
    : cloneWeightOverrides(input.priority_weights);

  return {
    profile: profileId,
    mergedWeights,
    report: {
      profile_id: profileId,
      blocking_policy_applied: true,
      severity_overrides: severityOverrides,
      ...(priorityWeights === undefined ? {} : { priority_weights: priorityWeights }),
    },
  };
}

function assertFileIdsMatch(snapshot: ReadonlySnapshot, input: SurveyInput): void {
  const snapshotIds = snapshot.files.map(file => file.id);
  const inputIds = input.files.map(file => file.id);
  const snapshotSet = new Set(snapshotIds);
  const inputSet = new Set(inputIds);
  const hasDuplicates = snapshotSet.size !== snapshotIds.length || inputSet.size !== inputIds.length;
  const missingFromInput = snapshotIds.filter(id => !inputSet.has(id));
  const missingFromSnapshot = inputIds.filter(id => !snapshotSet.has(id));
  if (hasDuplicates || missingFromInput.length > 0 || missingFromSnapshot.length > 0) {
    throw new ReportBuildError(
      'file-id-mismatch',
      `survey input file ids do not equal snapshot file ids; missing from input: ${missingFromInput.join(', ') || '(none)'}; missing from snapshot: ${missingFromSnapshot.join(', ') || '(none)'}`,
    );
  }
}

function copyIssue(
  issue: ReadonlySnapshot['validation']['issues'][number],
  rule: string,
  severity: SeverityClass,
): ClassifiedIssue {
  return {
    level: issue.level,
    rule,
    severity,
    file: issue.file,
    line: issue.line,
    control: issue.control,
    type: issue.type,
    ...(issue.variant === undefined ? {} : { variant: issue.variant }),
    ...(issue.property === undefined ? {} : { property: issue.property }),
    ...(issue.controls === undefined ? {} : { controls: [...issue.controls] }),
    detail: issue.detail,
    ...(issue.fix === undefined ? {} : { fix: issue.fix }),
    ...(issue.did_you_mean === undefined ? {} : { did_you_mean: issue.did_you_mean }),
    ...(issue.nearMiss === undefined ? {} : { nearMiss: issue.nearMiss }),
    ...(issue.evidence === undefined ? {} : { evidence: { ...issue.evidence } }),
  };
}

function classifyIssues(snapshot: ReadonlySnapshot, policy: ReportPolicy): AssembledIssue[] {
  return snapshot.validation.issues
    .filter(issue => issue.level !== 'PASS')
    .map(issue => {
      if (!issue.rule) {
        throw new ReportBuildError('unknown-rule', `${issue.level} finding has no rule`);
      }
      const registryRow = RULE_METADATA[issue.rule];
      if (!registryRow) {
        throw new ReportBuildError('unknown-rule', `no rule metadata for '${issue.rule}'`);
      }
      const copied = copyIssue(issue, issue.rule, registryRow.baseSeverity);
      const severity = severityOf(copied, registryRow, policy);
      const classified = { ...copied, severity };
      const confidence = confidenceOf(copied);
      return {
        ...classified,
        ...confidence,
        fingerprint: findingFingerprintV2(classified),
      };
    });
}

function sortedMembership(controls: readonly string[]): string[] {
  return [...new Set(controls)].sort();
}

function sameMembership(left: readonly string[], right: readonly string[]): boolean {
  const a = sortedMembership(left);
  const b = sortedMembership(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function deltaFromPrevious(
  previous: AnalysisReportV1 | undefined,
  appId: string,
  fingerprintBasis: string,
  current: readonly AssembledIssue[],
): {
  delta?: AnalysisReportV1['delta'];
  membersChanged: ReadonlyMap<string, boolean>;
} {
  if (previous === undefined) return { membersChanged: new Map() };
  if (previous.baseline?.formula !== FINDING_FINGERPRINT_V2_FORMULA
    || previous.identity?.fingerprint_basis !== fingerprintBasis
    || previous.identity?.app_id !== appId) {
    throw new ReportBuildError(
      'delta-comparison-refused',
      'previous report must have the same fingerprint formula, fingerprint_basis, and app_id',
    );
  }
  if (!Array.isArray(previous.findings)) {
    throw new ReportBuildError('delta-comparison-refused', 'previous report findings are malformed');
  }

  const previousByFingerprint = new Map(previous.findings.map(finding => [
    finding.fingerprint,
    finding,
  ]));
  const currentByFingerprint = new Map(current.map(issue => [issue.fingerprint, issue]));
  const previousFingerprints = [...previousByFingerprint.keys()];
  const currentFingerprints = [...currentByFingerprint.keys()];
  const persisted = currentFingerprints.filter(fingerprint => previousByFingerprint.has(fingerprint)).sort();
  const membersChanged = new Map<string, boolean>();
  for (const fingerprint of currentFingerprints) {
    const previousFinding = previousByFingerprint.get(fingerprint);
    const currentIssue = currentByFingerprint.get(fingerprint)!;
    membersChanged.set(
      fingerprint,
      previousFinding === undefined
        ? false
        : !sameMembership(previousFinding.controls, currentIssue.controls ?? []),
    );
  }

  return {
    delta: {
      resolved: previousFingerprints.filter(fingerprint => !currentByFingerprint.has(fingerprint)).sort(),
      persisted,
      new: currentFingerprints.filter(fingerprint => !previousByFingerprint.has(fingerprint)).sort(),
    },
    membersChanged,
  };
}

function dominantIssue(group: RootCauseGroup, issues: readonly AssembledIssue[]): AssembledIssue {
  const memberFingerprints = new Set(group.member_fingerprints);
  const candidates = issues
    .filter(issue => memberFingerprints.has(issue.fingerprint)
      && issue.severity === group.dominant_severity)
    .sort((left, right) => left.fingerprint.localeCompare(right.fingerprint));
  if (!candidates[0]) {
    throw new ReportBuildError('unknown-rule', `root cause ${group.group_id} has no dominant member`);
  }
  return candidates[0];
}

function remediationText(issue: AssembledIssue): RootCause['remediation'] {
  const family = RULE_METADATA[issue.rule].family;
  return {
    what: issue.detail,
    why: `Rule family: ${family}.`,
    how: issue.fix
      ?? (issue.did_you_mean
        ? `Use the known catalog candidate '${issue.did_you_mean}'.`
        : 'No rule-provided fix is available.'),
  };
}

function assembleInventories(
  snapshot: ReadonlySnapshot,
  input: SurveyInput,
): AnalysisReportV1['inventories'] {
  const datasources = buildDatasourceInventory(snapshot, {
    explicit: input.explicit_datasources,
    exported: input.export_datasources,
  });
  const connections = buildConnectionInventory(input.connections);
  return {
    datasources,
    backend_risks: buildBackendRiskInventory(datasources, connections),
    version_lag: buildVersionLagInventory(snapshot),
    modernization: buildModernizationInventory(snapshot),
    screens: buildScreenInventory(snapshot),
    components: buildComponentInventory(snapshot),
    connections,
  };
}

function slug(value: string): string {
  const normalized = value.normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
  return normalized || 'unnamed';
}

function appIdFor(input: SurveyInput): string {
  const slugSource = input.app_name.value ?? 'unnamed';
  const hashSource = input.app_name.value ?? input.fingerprint_basis;
  return `${slug(slugSource)}-${sha256(hashSource).slice(0, 8)}`;
}

function completenessOf(snapshot: ReadonlySnapshot, input: SurveyInput): 'full' | 'partial' {
  const knowinglySkipped = new Set([
    'skipped-legacy-source',
    'metadata-malformed',
    'skipped-symlink',
  ]);
  return input.limitations.some(limitation => knowinglySkipped.has(limitation.kind))
    || snapshot.coverage.files.some(file => file.recognizedRoots === 0 || file.unrecognizedLines > 0)
    ? 'partial'
    : 'full';
}

function coverageFrom(snapshot: ReadonlySnapshot, input: SurveyInput): AnalysisReportV1['coverage'] {
  const limitations: AnalysisReportV1['coverage']['limitations'] = input.limitations.map(
    limitation => ({ ...limitation }),
  );
  for (const file of snapshot.coverage.files) {
    if (file.recognizedRoots === 0) {
      limitations.push({ kind: 'unrecognized-file', file: file.file });
    }
    if (file.unrecognizedLines > 0) {
      limitations.push({
        kind: 'unrecognized-content',
        file: file.file,
        // Analyzer constructs and freezes two-number tuples; DeepReadonly widens
        // their static type but the report can safely share them without cloning.
        lines: file.unrecognizedSpans as readonly (readonly [number, number])[],
      });
    }
  }
  return {
    tiers: { ...snapshot.coverage.tiers },
    unit: 'classified property occurrences',
    exclusions: 'Occurrences on unrecognized control types, unknown variants, and the App pseudo-control enter no tier.',
    limitations,
    catalog_staleness: {
      days: snapshot.catalogMetadata.stalenessDays,
      stale: snapshot.catalogMetadata.stalenessDays >= 45,
    },
    unverified_claims: snapshot.catalogMetadata.evidenceClasses.map(claim => ({ ...claim })),
  };
}

export function buildReport(
  snapshot: ReadonlySnapshot,
  input: SurveyInput,
  options: SurveyOptions,
  outputBudget?: SurveyOutputBudget,
): AnalysisReportV1 {
  assertFileIdsMatch(snapshot, input);
  if (outputBudget !== undefined) {
    let emittedFindings = 0;
    for (const issue of snapshot.validation.issues) {
      if (issue.level !== 'PASS') emittedFindings++;
    }
    outputBudget.observeReportInput(emittedFindings);
  }
  const { report: policy, profile, mergedWeights } = policyFrom(options.policy);
  snapshot = snapshotForProfile(snapshot, profile);
  const classified = classifyIssues(snapshot, policy);
  const appId = appIdFor(input);
  const baseline = evaluateBaseline(options.baseline, classified, input.fingerprint_basis);
  const suppressions = evaluateSuppressions(options.suppressions, classified, options.now);
  const groups = groupIssues(classified, RULE_METADATA);
  const groupByFingerprint = new Map<string, string>();
  for (const group of groups) {
    for (const fingerprint of group.member_fingerprints) {
      groupByFingerprint.set(fingerprint, group.group_id);
    }
  }
  const { delta, membersChanged } = deltaFromPrevious(
    options.previous,
    appId,
    input.fingerprint_basis,
    classified,
  );

  const findings: ReportFinding[] = classified.map(issue => {
    const suppressedBy = suppressions.suppressed_by_fingerprint.get(issue.fingerprint);
    return {
      level: issue.level as 'WARN' | 'REFUSE',
      rule: issue.rule,
      file: issue.file,
      line: issue.line,
      control: issue.control,
      type: issue.type,
      variant: issue.variant ?? null,
      property: issue.property ?? null,
      detail: issue.detail,
      fix: issue.fix ?? null,
      did_you_mean: issue.did_you_mean ?? null,
      controls: issue.controls ? [...issue.controls] : [],
      near_miss: issue.nearMiss ?? false,
      origin: 'analyzer',
      fingerprint: issue.fingerprint,
      severity: issue.severity,
      confidence: issue.confidence,
      confidence_basis: issue.confidence_basis,
      claim_ref: null,
      group_id: groupByFingerprint.get(issue.fingerprint)!,
      baseline_status: baseline.accepted_fingerprints.has(issue.fingerprint) ? 'accepted' : 'new',
      ...(suppressedBy === undefined ? {} : { suppressed_by: suppressedBy }),
      adjudication: null,
      members_changed: options.previous === undefined
        ? null
        : membersChanged.get(issue.fingerprint) ?? false,
      edits: [],
      campaign_ref: null,
      queue_refs: [],
    };
  });
  const findingByFingerprint = new Map(findings.map(finding => [finding.fingerprint, finding]));
  const assembledByFingerprint = new Map(classified.map(issue => [issue.fingerprint, issue]));
  const totalScreenCount = snapshot.bundle.screens.length;
  const screenByControl = new Map<string, string>();
  for (const node of controlNodes(snapshot.bundle)) {
    if (node.screen !== null) screenByControl.set(node.name, node.screen.name);
  }
  const rootCauses: RootCause[] = groups.map(group => {
    const members = group.member_fingerprints.map(fingerprint => findingByFingerprint.get(fingerprint)!);
    const dominant = dominantIssue(group, classified);
    const priorityMembers = group.member_fingerprints.map(fingerprint => {
      const assembled = assembledByFingerprint.get(fingerprint)!;
      const finding = findingByFingerprint.get(assembled.fingerprint)!;
      return {
        ...assembled,
        confidence: assembled.confidence,
        baseline_status: finding.baseline_status,
        ...(finding.suppressed_by === undefined ? {} : { suppressed_by: finding.suppressed_by }),
      };
    });
    const inputs = priorityInputsForGroup({
      dominant_severity: group.dominant_severity,
      members: priorityMembers,
    }, RULE_METADATA[dominant.rule].remedyKind, totalScreenCount, screenByControl);
    const priority = computePriority(inputs, mergedWeights);
    const state = actionState(members);
    return {
      group_id: group.group_id,
      grouping_key: group.grouping_key,
      member_fingerprints: [...group.member_fingerprints],
      dominant_severity: group.dominant_severity,
      family: RULE_METADATA[dominant.rule].family,
      priority,
      descriptor_coverage: 'none',
      effort_class: priority.inputs.effort_class,
      remediation_summary: dominant.fix ?? dominant.detail,
      remediation: remediationText(dominant),
      ...state,
    };
  });
  const rootById = new Map(rootCauses.map(rootCause => [rootCause.group_id, rootCause]));
  const remediationPlan = rootCauses.map(rootCause => ({
    group_id: rootCause.group_id,
    band: rootCause.priority.band,
    score: rootCause.priority.score,
    action_state: rootCause.action_state,
    what: rootCause.remediation.what,
    why: rootCause.remediation.why,
    how: rootCause.remediation.how,
    descriptor_coverage: rootCause.descriptor_coverage,
    effort_class: rootCause.effort_class,
    dependency_notes: [],
  })).sort((left, right) => compareRemediation(
    { ...left, severity: rootById.get(left.group_id)!.dominant_severity },
    { ...right, severity: rootById.get(right.group_id)!.dominant_severity },
  ));

  return {
    report_schema: ANALYSIS_REPORT_SCHEMA,
    report_schema_minor: ANALYSIS_REPORT_SCHEMA_MINOR,
    report_id: options.report_id,
    identity: {
      app_name: { ...input.app_name },
      app_id: appId,
      source_kind: input.source_kind,
      completeness: completenessOf(snapshot, input),
      files: input.files.map(file => ({ ...file })),
      fingerprint_basis: input.fingerprint_basis,
      surveyed_at: options.now,
      analyzer_version: options.analyzer_version,
      catalog: {
        version: snapshot.catalogMetadata.catalogVersion,
        extracted_at: snapshot.catalogMetadata.extractedAt,
        staleness_days: snapshot.catalogMetadata.stalenessDays,
      },
    },
    gate: {
      summary: { ...snapshot.validation.summary },
      per_file: snapshot.validation.per_file.map(file => ({ ...file })),
      gate_decision: snapshot.validation.gateDecision,
    },
    findings,
    root_causes: rootCauses,
    inventories: assembleInventories(snapshot, input),
    coverage: coverageFrom(snapshot, input),
    remediation_plan: remediationPlan,
    ...(delta === undefined ? {} : { delta }),
    baseline: baseline.section,
    suppressions: suppressions.section,
    policy,
    envelope: {
      id: null,
      path: null,
      submission: { state: 'not_requested' },
    },
  };
}
