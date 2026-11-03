import type { DatasourceConfidence, DatasourceResolution, DatasourceType } from '../datasource.js';
import type { GroupingKey, SeverityClass } from '../rule-metadata.js';
import type { CoverageTier } from '../analyzer.js';
import type { PriorityWeightOverrides } from './priority-weights.js';
import type {
  ActionStateResult,
  DescriptorCoverage,
  Priority,
  PriorityBand,
} from './priority.js';
import type { ConfidenceBasis, FindingConfidence, SeverityOverride } from './severity.js';

export const ANALYSIS_REPORT_SCHEMA = 'analysis-report/1' as const;
export const ANALYSIS_REPORT_SCHEMA_MINOR = 0 as const;

export type CatalogClaimRef =
  | `augmentation:${string}.${string}`
  | `dump_sourced:${string}`
  | `catalog:${string}.${string}`;

export type AppName = {
  value: string | null;
  resolved_by: 'manifest' | 'directory' | 'archive-entry' | 'unresolved';
};

export type IdentitySection = {
  app_name: AppName;
  /** Name-derived until a platform app id is available; equal names can collide. */
  app_id: string;
  source_kind: 'directory' | 'msapp' | 'solution' | 'inline';
  completeness: 'full' | 'partial';
  files: Array<{ id: string; sha256: string }>;
  fingerprint_basis: string;
  surveyed_at: string;
  analyzer_version: string;
  catalog: {
    version: string;
    extracted_at: string;
    staleness_days: number;
  };
};

export type GateSection = {
  summary: {
    pass: number;
    warn: number;
    refuse: number;
    controls_seen: number;
    files: number;
  };
  per_file: Array<{
    file: string;
    pass: number;
    warn: number;
    refuse: number;
    controls_seen: number;
  }>;
  gate_decision: 'CLEAR' | 'PROCEED_WITH_WARNINGS' | 'BLOCK';
};

export type ScalarValue = string | number | boolean;

export type EditAnchor = {
  line: number;
  line_content_sha256: string;
};

export type EditEffects = {
  resolves: string[];
  contributes_to: string[];
};

type EditBase = {
  file: string;
  control: string;
  anchor: EditAnchor;
};

type DeterministicEffects = {
  mode: 'deterministic';
  effects: EditEffects;
  effects_when_completed?: never;
};

type HumanValueEffects = {
  mode: 'needs-human-value';
  effects?: never;
  effects_when_completed: EditEffects;
};

export type EditDescriptor =
  | (EditBase & DeterministicEffects & {
      kind: 'insert-property' | 'set-property';
      property: string;
      value: ScalarValue;
      from?: never;
      to?: never;
    })
  | (EditBase & HumanValueEffects & {
      kind: 'insert-property' | 'set-property';
      property: string;
      value: null;
      from?: never;
      to?: never;
    })
  | (EditBase & DeterministicEffects & {
      kind: 'rename-property';
      from: string;
      to: string;
      property?: never;
      value?: never;
    })
  | (EditBase & DeterministicEffects & {
      kind: 'replace-control-type';
      from: string;
      to: string;
      property?: never;
      value?: never;
    });

export type FindingAdjudication =
  | 'fixed' | 'accepted_risk' | 'false_positive' | 'not_applicable' | 'deferred';

export type ReportFinding = {
  level: 'WARN' | 'REFUSE';
  rule: string;
  file: string;
  line: number;
  control: string;
  type: string;
  variant: string | null;
  property: string | null;
  detail: string;
  fix: string | null;
  did_you_mean: string | null;
  controls: string[];
  near_miss: boolean;
  origin: 'analyzer' | 'survey';
  fingerprint: string;
  severity: SeverityClass;
  confidence: FindingConfidence;
  confidence_basis: ConfidenceBasis | 'claim';
  claim_ref: CatalogClaimRef | null;
  group_id: string;
  baseline_status: 'new' | 'accepted';
  suppressed_by?: string;
  adjudication: FindingAdjudication | null;
  members_changed: boolean | null;
  edits: EditDescriptor[];
  campaign_ref: string | null;
  queue_refs: string[];
};

export type RootCause = {
  group_id: string;
  grouping_key: GroupingKey;
  member_fingerprints: string[];
  dominant_severity: SeverityClass;
  family: string;
  priority: Priority;
  descriptor_coverage: DescriptorCoverage;
  effort_class: Priority['inputs']['effort_class'];
  remediation_summary: string;
  remediation: {
    what: string;
    why: string;
    how: string;
  };
} & ActionStateResult;

export type InventoryState = 'available' | 'unavailable' | 'empty';

export type StatefulInventory<TRow> =
  | { state: 'unavailable'; note?: string }
  | { state: 'empty'; rows: [] }
  | { state: 'available'; rows: TRow[] };

export type DatasourceInventoryRow = {
  name: string;
  backend: DatasourceType | null;
  resolved_by: DatasourceResolution;
  confidence: DatasourceConfidence;
};

export type BackendRiskInventoryRow = {
  connector_type: string;
  count: number | null;
  documented_limits: Array<{ limit: string; source_url: string }>;
  premium: boolean | null;
  confidence: FindingConfidence;
  unknowns: string[];
};

type VersionLagInventoryRowBase = {
  control: string;
  file: string;
  observed: string;
};

type VersionLagMigration = {
  target_type: string;
  target_version: string;
  note?: string;
};

export type VersionLagInventoryRow = VersionLagInventoryRowBase & ({
  newest_known: 'unresolved';
} | {
  newest_known: string;
  lower_bound: true;
  evidence: string;
  observed_at: string;
  migration?: VersionLagMigration;
});

export type ScreenInventoryRow = {
  screen: string;
  file: string;
  controls: number;
  threshold: number | null;
  note?: string;
};

export type ModernizationInventoryRow = {
  source_type: string;
  target_type: string | null;
  verified: boolean;
  controls: number;
  mechanical: number;
  needs_review: number;
  authored: {
    same: number;
    renamed: number;
    manual: number;
    dropped_cosmetic: number;
    dropped_behaviour: number;
  };
  review_reasons: Array<{ property: string; controls: number }>;
  reference_rewrites: number;
  references_unmapped: number;
  sample_review_controls: string[];
  review_controls_total: number;
  note: string;
};

export type ComponentInventoryRow = {
  component: string;
  file: string;
  definitions: number;
  instances: number;
};

export type ConnectionInventoryRow = {
  connector_type: string;
  count: number;
};

export type InventoriesSection = {
  datasources: StatefulInventory<DatasourceInventoryRow>;
  backend_risks: StatefulInventory<BackendRiskInventoryRow>;
  version_lag: StatefulInventory<VersionLagInventoryRow>;
  modernization: StatefulInventory<ModernizationInventoryRow>;
  screens: StatefulInventory<ScreenInventoryRow>;
  components: StatefulInventory<ComponentInventoryRow>;
  connections: StatefulInventory<ConnectionInventoryRow>;
};

export type IntakeCoverageLimitation = {
  kind:
    | 'skipped-legacy-source'
    | 'metadata-malformed'
    | 'metadata-absent'
    | 'metadata-unsupported'
    | 'skipped-symlink';
  source: string;
  detail: string;
};

export type RecognitionCoverageLimitation =
  | { kind: 'unrecognized-content'; file: string; lines: readonly (readonly [number, number])[] }
  | { kind: 'unrecognized-file'; file: string };

export type CoverageSection = {
  tiers: Record<CoverageTier, number>;
  unit: 'classified property occurrences';
  exclusions: string;
  limitations: Array<IntakeCoverageLimitation | RecognitionCoverageLimitation>;
  catalog_staleness: {
    days: number;
    stale: boolean;
  };
  unverified_claims: Array<{
    claim_ref: CatalogClaimRef;
    evidence_class: string;
    falsifier?: string;
  }>;
};

export type RemediationPlanEntry = {
  group_id: string;
  band: PriorityBand;
  score: number;
  action_state: ActionStateResult['action_state'];
  what: string;
  why: string;
  how: string;
  descriptor_coverage: DescriptorCoverage;
  effort_class: Priority['inputs']['effort_class'];
  dependency_notes: string[];
};

export type DeltaSection = {
  resolved: string[];
  persisted: string[];
  new: string[];
};

export type AnalysisBaselineEntry = {
  fingerprint: string;
  rule: string;
  accepted_at: string;
  note?: string;
};

export type AnalysisBaselineV1 = {
  baseline_schema: 'analysis-baseline/1';
  formula: 'finding-fingerprint/2';
  migrated_from?: 'finding-fingerprint/1';
  fingerprint_basis: string;
  entries: AnalysisBaselineEntry[];
};

export type BaselineSection = {
  formula: 'finding-fingerprint/2';
  applied_from: string | null;
  basis_matches: boolean;
  accepted_total: number;
  stale_entries: AnalysisBaselineEntry[];
  migration_required: boolean;
};

export type SuppressionEntry = {
  rule: string;
  scope: { file?: string; control?: string };
  rationale: string;
  owner: string;
  expires: string;
};

export type SuppressionsSection = {
  applied_count: number;
  expired: SuppressionEntry[];
  invalid: Array<{ index: number; reason: string }>;
};

export type ReportPolicy = {
  profile_id: string;
  blocking_policy_applied: boolean;
  severity_overrides: SeverityOverride[];
  priority_weights?: PriorityWeightOverrides;
};

export type EnvelopeSection = {
  /** Filled with a write-time UUIDv4 by Plan 4. */
  id: string | null;
  /** Filled with the envelope artifact path at write time by Plan 4. */
  path: string | null;
  submission: {
    state: 'not_requested' | 'pending' | 'acknowledged' | 'failed';
    attempted_at?: string;
    error_code?: string;
  };
};

export type AnalysisReportV1 = {
  report_schema: 'analysis-report/1';
  report_schema_minor: number;
  report_id: string;
  identity: IdentitySection;
  gate: GateSection;
  findings: ReportFinding[];
  root_causes: RootCause[];
  inventories: InventoriesSection;
  coverage: CoverageSection;
  remediation_plan: RemediationPlanEntry[];
  delta?: DeltaSection;
  baseline: BaselineSection;
  suppressions: SuppressionsSection;
  policy: ReportPolicy;
  envelope: EnvelopeSection;
};
