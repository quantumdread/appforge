import type { AnalysisReportV1 } from './report-types.js';

export type ReportValidationResult = {
  valid: boolean;
  errors: string[];
};

export class ReportValidationError extends Error {
  readonly code = 'invalid-analysis-report';

  constructor(public readonly errors: readonly string[]) {
    super(`Invalid AnalysisReportV1: ${errors.join('; ')}`);
    this.name = 'ReportValidationError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const owns = (value: Record<string, unknown>, key: string): boolean => Object.hasOwn(value, key);

class Validation {
  readonly errors: string[] = [];

  fail(path: string, message: string): void {
    this.errors.push(`${path} ${message}`);
  }

  object(value: unknown, path: string, required: readonly string[] = []): Record<string, unknown> | null {
    if (!isRecord(value)) {
      this.fail(path, 'must be an object');
      return null;
    }
    for (const key of required) {
      if (!owns(value, key)) this.fail(`${path}.${key}`, 'is required');
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

  string(value: unknown, path: string, nonempty = false): void {
    if (typeof value !== 'string' || (nonempty && value.length === 0)) {
      this.fail(path, nonempty ? 'must be a non-empty string' : 'must be a string');
    }
  }

  nullableString(value: unknown, path: string): void {
    if (value !== null && typeof value !== 'string') this.fail(path, 'must be a string or null');
  }

  boolean(value: unknown, path: string): void {
    if (typeof value !== 'boolean') this.fail(path, 'must be a boolean');
  }

  number(value: unknown, path: string, minimum?: number, maximum?: number): void {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      this.fail(path, 'must be a finite number');
      return;
    }
    if (minimum !== undefined && value < minimum) this.fail(path, `must be >= ${minimum}`);
    if (maximum !== undefined && value > maximum) this.fail(path, `must be <= ${maximum}`);
  }

  integer(value: unknown, path: string, minimum?: number): void {
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      this.fail(path, 'must be an integer');
      return;
    }
    if (minimum !== undefined && value < minimum) this.fail(path, `must be >= ${minimum}`);
  }

  enumeration(value: unknown, path: string, values: readonly unknown[]): void {
    if (!values.includes(value)) this.fail(path, `must be one of ${values.map(String).join(', ')}`);
  }

  pattern(value: unknown, path: string, pattern: RegExp): void {
    if (typeof value !== 'string' || !pattern.test(value)) this.fail(path, `must match ${pattern}`);
  }
}

const SEVERITIES = [
  'BLOCK',
  'CORRECTNESS_RISK',
  'PERFORMANCE_RISK',
  'MAINTAINABILITY',
  'UNCERTAINTY',
] as const;
const CONFIDENCES = ['high', 'medium', 'low'] as const;
const BANDS = ['now', 'verify-first', 'next', 'later'] as const;
const EFFORT_CLASSES = ['mechanical', 'mixed', 'judgment', 'unknown'] as const;
const DESCRIPTOR_COVERAGES = ['full', 'partial', 'none'] as const;
const ACTION_STATES = ['active', 'accepted', 'suppressed', 'mixed'] as const;
const FINGERPRINT = /^[0-9a-f]{16}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;

function validateStringArray(v: Validation, value: unknown, path: string, pattern?: RegExp): void {
  const rows = v.array(value, path);
  rows?.forEach((row, index) => {
    if (pattern) v.pattern(row, `${path}[${index}]`, pattern);
    else v.string(row, `${path}[${index}]`);
  });
}

function validateCounts(
  v: Validation,
  value: unknown,
  path: string,
  withFiles: boolean,
): void {
  const required = withFiles
    ? ['pass', 'warn', 'refuse', 'controls_seen', 'files']
    : ['file', 'pass', 'warn', 'refuse', 'controls_seen'];
  const object = v.object(value, path, required);
  if (!object) return;
  if (!withFiles) v.string(object.file, `${path}.file`);
  for (const key of ['pass', 'warn', 'refuse', 'controls_seen', ...(withFiles ? ['files'] : [])]) {
    v.integer(object[key], `${path}.${key}`, 0);
  }
}

function validateIdentity(v: Validation, value: unknown): void {
  const path = '$.identity';
  const identity = v.object(value, path, [
    'app_name', 'app_id', 'source_kind', 'completeness', 'files', 'fingerprint_basis',
    'surveyed_at', 'analyzer_version', 'catalog',
  ]);
  if (!identity) return;
  const appName = v.object(identity.app_name, `${path}.app_name`, ['value', 'resolved_by']);
  if (appName) {
    v.nullableString(appName.value, `${path}.app_name.value`);
    v.enumeration(appName.resolved_by, `${path}.app_name.resolved_by`, [
      'manifest', 'directory', 'archive-entry', 'unresolved',
    ]);
  }
  v.pattern(identity.app_id, `${path}.app_id`, /^[a-z0-9]+(?:-[a-z0-9]+)*-[0-9a-f]{8}$/u);
  v.enumeration(identity.source_kind, `${path}.source_kind`, [
    'directory', 'msapp', 'solution', 'inline',
  ]);
  v.enumeration(identity.completeness, `${path}.completeness`, ['full', 'partial']);
  const files = v.array(identity.files, `${path}.files`);
  files?.forEach((file, index) => {
    const rowPath = `${path}.files[${index}]`;
    const row = v.object(file, rowPath, ['id', 'sha256']);
    if (!row) return;
    v.string(row.id, `${rowPath}.id`, true);
    v.pattern(row.sha256, `${rowPath}.sha256`, SHA256);
  });
  v.string(identity.fingerprint_basis, `${path}.fingerprint_basis`, true);
  v.string(identity.surveyed_at, `${path}.surveyed_at`, true);
  v.string(identity.analyzer_version, `${path}.analyzer_version`, true);
  const catalog = v.object(identity.catalog, `${path}.catalog`, [
    'version', 'extracted_at', 'staleness_days',
  ]);
  if (catalog) {
    v.string(catalog.version, `${path}.catalog.version`, true);
    v.string(catalog.extracted_at, `${path}.catalog.extracted_at`, true);
    v.integer(catalog.staleness_days, `${path}.catalog.staleness_days`, 0);
  }
}

function validateGate(v: Validation, value: unknown): void {
  const path = '$.gate';
  const gate = v.object(value, path, ['summary', 'per_file', 'gate_decision']);
  if (!gate) return;
  validateCounts(v, gate.summary, `${path}.summary`, true);
  const perFile = v.array(gate.per_file, `${path}.per_file`);
  perFile?.forEach((row, index) => validateCounts(v, row, `${path}.per_file[${index}]`, false));
  v.enumeration(gate.gate_decision, `${path}.gate_decision`, [
    'CLEAR', 'PROCEED_WITH_WARNINGS', 'BLOCK',
  ]);
}

function validateEffects(v: Validation, value: unknown, path: string): void {
  const effects = v.object(value, path, ['resolves', 'contributes_to']);
  if (!effects) return;
  const resolves = v.array(effects.resolves, `${path}.resolves`);
  if (resolves && resolves.length === 0) v.fail(`${path}.resolves`, 'must not be empty');
  resolves?.forEach((row, index) => v.pattern(row, `${path}.resolves[${index}]`, FINGERPRINT));
  validateStringArray(v, effects.contributes_to, `${path}.contributes_to`, FINGERPRINT);
}

function validateEdit(v: Validation, value: unknown, path: string): void {
  const edit = v.object(value, path, ['kind', 'file', 'control', 'mode', 'anchor']);
  if (!edit) return;
  v.enumeration(edit.kind, `${path}.kind`, [
    'insert-property', 'set-property', 'rename-property', 'replace-control-type',
  ]);
  v.string(edit.file, `${path}.file`);
  v.string(edit.control, `${path}.control`);
  v.enumeration(edit.mode, `${path}.mode`, ['deterministic', 'needs-human-value']);
  const anchor = v.object(edit.anchor, `${path}.anchor`, ['line', 'line_content_sha256']);
  if (anchor) {
    v.integer(anchor.line, `${path}.anchor.line`, 1);
    v.pattern(anchor.line_content_sha256, `${path}.anchor.line_content_sha256`, SHA256);
  }

  const valueBearing = edit.kind === 'insert-property' || edit.kind === 'set-property';
  const nonValue = edit.kind === 'rename-property' || edit.kind === 'replace-control-type';
  if (valueBearing) {
    if (!owns(edit, 'property')) v.fail(`${path}.property`, 'is required');
    else v.string(edit.property, `${path}.property`);
    if (!owns(edit, 'value')) v.fail(`${path}.value`, 'is required');
    if (owns(edit, 'from')) v.fail(`${path}.from`, 'is forbidden for a value-bearing edit');
    if (owns(edit, 'to')) v.fail(`${path}.to`, 'is forbidden for a value-bearing edit');

    if (edit.mode === 'deterministic') {
      if (edit.value === null || !['string', 'number', 'boolean'].includes(typeof edit.value)) {
        v.fail(`${path}.value`, 'must be a non-null scalar in deterministic mode');
      } else if (typeof edit.value === 'number' && !Number.isFinite(edit.value)) {
        v.fail(`${path}.value`, 'must be a finite scalar');
      }
    } else if (edit.mode === 'needs-human-value' && edit.value !== null) {
      v.fail(`${path}.value`, 'must be null in needs-human-value mode');
    }
  }
  if (nonValue) {
    for (const key of ['from', 'to']) {
      if (!owns(edit, key)) v.fail(`${path}.${key}`, 'is required');
      else v.string(edit[key], `${path}.${key}`);
    }
    if (edit.mode !== 'deterministic') v.fail(`${path}.mode`, 'must be deterministic');
    if (owns(edit, 'value')) v.fail(`${path}.value`, 'is forbidden for a non-value edit');
    if (owns(edit, 'property')) v.fail(`${path}.property`, 'is forbidden for a non-value edit');
  }

  if (edit.mode === 'deterministic') {
    if (!owns(edit, 'effects')) v.fail(`${path}.effects`, 'is required in deterministic mode');
    else validateEffects(v, edit.effects, `${path}.effects`);
    if (owns(edit, 'effects_when_completed')) {
      v.fail(`${path}.effects_when_completed`, 'is forbidden in deterministic mode');
    }
  } else if (edit.mode === 'needs-human-value') {
    if (!owns(edit, 'effects_when_completed')) {
      v.fail(`${path}.effects_when_completed`, 'is required in needs-human-value mode');
    } else {
      validateEffects(v, edit.effects_when_completed, `${path}.effects_when_completed`);
    }
    if (owns(edit, 'effects')) v.fail(`${path}.effects`, 'is forbidden in needs-human-value mode');
  }
}

function validateFinding(v: Validation, value: unknown, path: string): void {
  const finding = v.object(value, path, [
    'level', 'rule', 'file', 'line', 'control', 'type', 'variant', 'property', 'detail', 'fix',
    'did_you_mean', 'controls', 'near_miss', 'origin', 'fingerprint', 'severity', 'confidence',
    'confidence_basis', 'claim_ref', 'group_id', 'baseline_status', 'adjudication',
    'members_changed', 'edits', 'campaign_ref', 'queue_refs',
  ]);
  if (!finding) return;
  v.enumeration(finding.level, `${path}.level`, ['WARN', 'REFUSE']);
  v.string(finding.rule, `${path}.rule`, true);
  v.string(finding.file, `${path}.file`);
  v.integer(finding.line, `${path}.line`, 1);
  v.string(finding.control, `${path}.control`);
  v.string(finding.type, `${path}.type`);
  v.nullableString(finding.variant, `${path}.variant`);
  v.nullableString(finding.property, `${path}.property`);
  v.string(finding.detail, `${path}.detail`);
  v.nullableString(finding.fix, `${path}.fix`);
  v.nullableString(finding.did_you_mean, `${path}.did_you_mean`);
  validateStringArray(v, finding.controls, `${path}.controls`);
  v.boolean(finding.near_miss, `${path}.near_miss`);
  v.enumeration(finding.origin, `${path}.origin`, ['analyzer', 'survey']);
  v.pattern(finding.fingerprint, `${path}.fingerprint`, FINGERPRINT);
  v.enumeration(finding.severity, `${path}.severity`, SEVERITIES);
  v.enumeration(finding.confidence, `${path}.confidence`, CONFIDENCES);
  v.enumeration(finding.confidence_basis, `${path}.confidence_basis`, [
    'provenance', 'rule-family-default', 'claim',
  ]);
  if (finding.claim_ref !== null) {
    v.pattern(
      finding.claim_ref,
      `${path}.claim_ref`,
      /^(augmentation:[^.]+\..+|dump_sourced:.+|catalog:[^.]+\..+)$/u,
    );
  }
  v.pattern(finding.group_id, `${path}.group_id`, FINGERPRINT);
  v.enumeration(finding.baseline_status, `${path}.baseline_status`, ['new', 'accepted']);
  if (owns(finding, 'suppressed_by')) v.string(finding.suppressed_by, `${path}.suppressed_by`, true);
  v.enumeration(finding.adjudication, `${path}.adjudication`, [
    null, 'fixed', 'accepted_risk', 'false_positive', 'not_applicable', 'deferred',
  ]);
  if (finding.members_changed !== null) v.boolean(finding.members_changed, `${path}.members_changed`);
  const edits = v.array(finding.edits, `${path}.edits`);
  edits?.forEach((edit, index) => validateEdit(v, edit, `${path}.edits[${index}]`));
  v.nullableString(finding.campaign_ref, `${path}.campaign_ref`);
  validateStringArray(v, finding.queue_refs, `${path}.queue_refs`);
}

function validatePriority(v: Validation, value: unknown, path: string): void {
  const priority = v.object(value, path, ['band', 'score', 'inputs', 'formula']);
  if (!priority) return;
  v.enumeration(priority.band, `${path}.band`, BANDS);
  v.number(priority.score, `${path}.score`, 0, 100);
  if (priority.formula !== 'priority/1') v.fail(`${path}.formula`, "must equal 'priority/1'");
  const inputs = v.object(priority.inputs, `${path}.inputs`, [
    'severity', 'confidence', 'blast', 'effort_class', 'descriptor_coverage',
  ]);
  if (!inputs) return;
  v.enumeration(inputs.severity, `${path}.inputs.severity`, SEVERITIES);
  v.enumeration(inputs.confidence, `${path}.inputs.confidence`, CONFIDENCES);
  v.enumeration(inputs.effort_class, `${path}.inputs.effort_class`, EFFORT_CLASSES);
  v.enumeration(
    inputs.descriptor_coverage,
    `${path}.inputs.descriptor_coverage`,
    DESCRIPTOR_COVERAGES,
  );
  const blast = v.object(inputs.blast, `${path}.inputs.blast`, ['controls', 'screens', 'factor']);
  if (blast) {
    v.integer(blast.controls, `${path}.inputs.blast.controls`, 0);
    v.integer(blast.screens, `${path}.inputs.blast.screens`, 0);
    v.number(blast.factor, `${path}.inputs.blast.factor`);
  }
}

function validateRemediationText(v: Validation, value: unknown, path: string): void {
  const text = v.object(value, path, ['what', 'why', 'how']);
  if (!text) return;
  v.string(text.what, `${path}.what`);
  v.string(text.why, `${path}.why`);
  v.string(text.how, `${path}.how`);
}

function validateRootCause(v: Validation, value: unknown, path: string): void {
  const root = v.object(value, path, [
    'group_id', 'grouping_key', 'member_fingerprints', 'dominant_severity', 'family',
    'priority', 'descriptor_coverage', 'effort_class', 'remediation_summary', 'remediation',
    'action_state',
  ]);
  if (!root) return;
  v.pattern(root.group_id, `${path}.group_id`, FINGERPRINT);
  v.enumeration(root.grouping_key, `${path}.grouping_key`, [
    'none', 'bound-source', 'formula-identity', 'color-literal', 'file',
  ]);
  const fingerprints = v.array(root.member_fingerprints, `${path}.member_fingerprints`);
  if (fingerprints && fingerprints.length === 0) {
    v.fail(`${path}.member_fingerprints`, 'must not be empty');
  }
  fingerprints?.forEach((row, index) => v.pattern(
    row,
    `${path}.member_fingerprints[${index}]`,
    FINGERPRINT,
  ));
  v.enumeration(root.dominant_severity, `${path}.dominant_severity`, SEVERITIES);
  v.string(root.family, `${path}.family`);
  validatePriority(v, root.priority, `${path}.priority`);
  v.enumeration(root.descriptor_coverage, `${path}.descriptor_coverage`, DESCRIPTOR_COVERAGES);
  v.enumeration(root.effort_class, `${path}.effort_class`, EFFORT_CLASSES);
  v.string(root.remediation_summary, `${path}.remediation_summary`);
  validateRemediationText(v, root.remediation, `${path}.remediation`);
  v.enumeration(root.action_state, `${path}.action_state`, ACTION_STATES);
  if (root.action_state === 'mixed') {
    if (!owns(root, 'accepted_count')) v.fail(`${path}.accepted_count`, 'is required for mixed');
    else v.integer(root.accepted_count, `${path}.accepted_count`, 0);
    if (!owns(root, 'suppressed_count')) v.fail(`${path}.suppressed_count`, 'is required for mixed');
    else v.integer(root.suppressed_count, `${path}.suppressed_count`, 0);
  } else {
    if (owns(root, 'accepted_count')) v.integer(root.accepted_count, `${path}.accepted_count`, 0);
    if (owns(root, 'suppressed_count')) v.integer(root.suppressed_count, `${path}.suppressed_count`, 0);
  }
}

function validateDatasourceRow(v: Validation, value: unknown, path: string): void {
  const row = v.object(value, path, ['name', 'backend', 'resolved_by', 'confidence']);
  if (!row) return;
  v.string(row.name, `${path}.name`);
  v.enumeration(row.backend, `${path}.backend`, [
    null, 'dataverse', 'sharepoint', 'sql', 'excel', 'collection', 'other',
  ]);
  v.enumeration(row.resolved_by, `${path}.resolved_by`, [
    'explicit-input', 'export-metadata', 'naming-convention', 'unresolved',
  ]);
  v.enumeration(row.confidence, `${path}.confidence`, ['high', 'medium', 'low', 'none']);
}

function validateBackendRiskRow(v: Validation, value: unknown, path: string): void {
  const row = v.object(value, path, [
    'connector_type', 'count', 'documented_limits', 'premium', 'confidence', 'unknowns',
  ]);
  if (!row) return;
  v.string(row.connector_type, `${path}.connector_type`);
  if (row.count !== null) v.integer(row.count, `${path}.count`, 0);
  const limits = v.array(row.documented_limits, `${path}.documented_limits`);
  limits?.forEach((limit, index) => {
    const itemPath = `${path}.documented_limits[${index}]`;
    const item = v.object(limit, itemPath, ['limit', 'source_url']);
    if (item) {
      v.string(item.limit, `${itemPath}.limit`);
      v.string(item.source_url, `${itemPath}.source_url`);
    }
  });
  if (row.premium !== null) v.boolean(row.premium, `${path}.premium`);
  v.enumeration(row.confidence, `${path}.confidence`, CONFIDENCES);
  validateStringArray(v, row.unknowns, `${path}.unknowns`);
}

function validateVersionLagRow(v: Validation, value: unknown, path: string): void {
  const row = v.object(value, path, [
    'control', 'file', 'observed', 'newest_known',
  ]);
  if (!row) return;
  for (const key of ['control', 'file', 'observed', 'newest_known']) v.string(row[key], `${path}.${key}`);
  if (row.newest_known !== 'unresolved') {
    for (const key of ['lower_bound', 'evidence', 'observed_at']) {
      if (!owns(row, key)) v.fail(`${path}.${key}`, 'is required when newest_known is resolved');
    }
  } else {
    for (const key of ['lower_bound', 'evidence', 'observed_at', 'migration']) {
      if (owns(row, key)) v.fail(`${path}.${key}`, 'is forbidden when newest_known is unresolved');
    }
  }
  if (owns(row, 'lower_bound')) {
    v.boolean(row.lower_bound, `${path}.lower_bound`);
    if (row.lower_bound !== true) v.fail(`${path}.lower_bound`, 'must equal true');
  }
  if (owns(row, 'evidence')) v.string(row.evidence, `${path}.evidence`);
  if (owns(row, 'observed_at')) v.string(row.observed_at, `${path}.observed_at`);
  if (owns(row, 'migration')) {
    const migration = v.object(row.migration, `${path}.migration`, ['target_type', 'target_version']);
    if (migration) {
      v.string(migration.target_type, `${path}.migration.target_type`);
      v.string(migration.target_version, `${path}.migration.target_version`);
      if (owns(migration, 'note')) v.string(migration.note, `${path}.migration.note`);
    }
  }
}

function validateScreenRow(v: Validation, value: unknown, path: string): void {
  const row = v.object(value, path, ['screen', 'file', 'controls', 'threshold']);
  if (!row) return;
  v.string(row.screen, `${path}.screen`);
  v.string(row.file, `${path}.file`);
  v.integer(row.controls, `${path}.controls`, 0);
  if (row.threshold !== null) v.number(row.threshold, `${path}.threshold`);
  else if (row.note !== 'threshold not exercised') {
    v.fail(`${path}.note`, "must equal 'threshold not exercised' when threshold is null");
  }
  if (owns(row, 'note')) v.string(row.note, `${path}.note`);
}

function validateModernizationRow(v: Validation, value: unknown, path: string): void {
  const row = v.object(value, path, [
    'source_type', 'target_type', 'verified', 'controls', 'mechanical', 'needs_review',
    'authored', 'review_reasons', 'reference_rewrites', 'references_unmapped',
    'sample_review_controls', 'review_controls_total', 'note',
  ]);
  if (!row) return;
  v.string(row.source_type, `${path}.source_type`);
  v.nullableString(row.target_type, `${path}.target_type`);
  v.boolean(row.verified, `${path}.verified`);
  v.string(row.note, `${path}.note`);
  for (const key of ['controls', 'mechanical', 'needs_review', 'reference_rewrites', 'references_unmapped', 'review_controls_total']) {
    v.integer(row[key], `${path}.${key}`, 0);
  }
  const kinds = ['same', 'renamed', 'manual', 'dropped_cosmetic', 'dropped_behaviour'];
  const authored = v.object(row.authored, `${path}.authored`, kinds);
  if (authored) for (const key of kinds) v.integer(authored[key], `${path}.authored.${key}`, 0);
  v.array(row.review_reasons, `${path}.review_reasons`)?.forEach((value, index) => {
    const reasonPath = `${path}.review_reasons[${index}]`;
    const reason = v.object(value, reasonPath, ['property', 'controls']);
    if (!reason) return;
    v.string(reason.property, `${reasonPath}.property`);
    v.integer(reason.controls, `${reasonPath}.controls`, 0);
  });
  validateStringArray(v, row.sample_review_controls, `${path}.sample_review_controls`);
  if (Array.isArray(row.sample_review_controls) && row.sample_review_controls.length > 10) {
    v.fail(`${path}.sample_review_controls`, 'must contain at most 10 names');
  }
}

function validateComponentRow(v: Validation, value: unknown, path: string): void {
  const row = v.object(value, path, ['component', 'file', 'definitions', 'instances']);
  if (!row) return;
  v.string(row.component, `${path}.component`);
  v.string(row.file, `${path}.file`);
  v.integer(row.definitions, `${path}.definitions`, 0);
  v.integer(row.instances, `${path}.instances`, 0);
}

function validateConnectionRow(v: Validation, value: unknown, path: string): void {
  const row = v.object(value, path, ['connector_type', 'count']);
  if (!row) return;
  v.string(row.connector_type, `${path}.connector_type`);
  v.integer(row.count, `${path}.count`, 0);
}

type RowValidator = (v: Validation, value: unknown, path: string) => void;

function validateInventory(
  v: Validation,
  value: unknown,
  path: string,
  validateRow: RowValidator,
): void {
  const section = v.object(value, path, ['state']);
  if (!section) return;
  v.enumeration(section.state, `${path}.state`, ['available', 'unavailable', 'empty']);
  if (section.state === 'unavailable') {
    if (owns(section, 'rows')) v.fail(`${path}.rows`, 'is forbidden when unavailable');
    if (owns(section, 'note')) v.string(section.note, `${path}.note`);
    return;
  }
  if (!owns(section, 'rows')) {
    v.fail(`${path}.rows`, 'is required');
    return;
  }
  const rows = v.array(section.rows, `${path}.rows`);
  if (section.state === 'empty' && rows && rows.length !== 0) {
    v.fail(`${path}.rows`, 'must be empty when state is empty');
  }
  if (section.state === 'available') {
    rows?.forEach((row, index) => validateRow(v, row, `${path}.rows[${index}]`));
  }
}

function validateInventories(v: Validation, value: unknown): void {
  const path = '$.inventories';
  const inventories = v.object(value, path, [
    'datasources', 'backend_risks', 'version_lag', 'modernization', 'screens', 'components', 'connections',
  ]);
  if (!inventories) return;
  validateInventory(v, inventories.datasources, `${path}.datasources`, validateDatasourceRow);
  validateInventory(v, inventories.backend_risks, `${path}.backend_risks`, validateBackendRiskRow);
  validateInventory(v, inventories.version_lag, `${path}.version_lag`, validateVersionLagRow);
  validateInventory(v, inventories.modernization, `${path}.modernization`, validateModernizationRow);
  validateInventory(v, inventories.screens, `${path}.screens`, validateScreenRow);
  validateInventory(v, inventories.components, `${path}.components`, validateComponentRow);
  validateInventory(v, inventories.connections, `${path}.connections`, validateConnectionRow);
}

function validateLimitation(v: Validation, value: unknown, path: string): void {
  const limitation = v.object(value, path, ['kind']);
  if (!limitation) return;
  const intakeKinds = [
    'skipped-legacy-source', 'metadata-malformed', 'metadata-absent',
    'metadata-unsupported', 'skipped-symlink',
  ];
  if (intakeKinds.includes(limitation.kind as string)) {
    for (const key of ['source', 'detail']) {
      if (!owns(limitation, key)) v.fail(`${path}.${key}`, 'is required');
      else v.string(limitation[key], `${path}.${key}`);
    }
    return;
  }
  if (limitation.kind === 'unrecognized-file') {
    if (!owns(limitation, 'file')) v.fail(`${path}.file`, 'is required');
    else v.string(limitation.file, `${path}.file`);
    return;
  }
  if (limitation.kind === 'unrecognized-content') {
    if (!owns(limitation, 'file')) v.fail(`${path}.file`, 'is required');
    else v.string(limitation.file, `${path}.file`);
    const lines = owns(limitation, 'lines') ? v.array(limitation.lines, `${path}.lines`) : null;
    if (!owns(limitation, 'lines')) v.fail(`${path}.lines`, 'is required');
    lines?.forEach((span, index) => {
      const spanPath = `${path}.lines[${index}]`;
      const tuple = v.array(span, spanPath);
      if (!tuple) return;
      if (tuple.length !== 2) v.fail(spanPath, 'must contain exactly two entries');
      tuple.forEach((line, lineIndex) => v.integer(line, `${spanPath}[${lineIndex}]`, 1));
    });
    return;
  }
  v.fail(`${path}.kind`, 'must be a closed coverage limitation kind');
}

function validateCoverage(v: Validation, value: unknown): void {
  const path = '$.coverage';
  const coverage = v.object(value, path, [
    'tiers', 'unit', 'exclusions', 'limitations', 'catalog_staleness', 'unverified_claims',
  ]);
  if (!coverage) return;
  const tiers = v.object(coverage.tiers, `${path}.tiers`, [
    'extractor_verified', 'augmentation_verified', 'dump_sourced_lower_bound',
    'component_defined', 'unknown',
  ]);
  if (tiers) {
    for (const key of [
      'extractor_verified', 'augmentation_verified', 'dump_sourced_lower_bound',
      'component_defined', 'unknown',
    ]) v.integer(tiers[key], `${path}.tiers.${key}`, 0);
  }
  if (coverage.unit !== 'classified property occurrences') {
    v.fail(`${path}.unit`, "must equal 'classified property occurrences'");
  }
  v.string(coverage.exclusions, `${path}.exclusions`, true);
  const limitations = v.array(coverage.limitations, `${path}.limitations`);
  limitations?.forEach((row, index) => validateLimitation(v, row, `${path}.limitations[${index}]`));
  const staleness = v.object(coverage.catalog_staleness, `${path}.catalog_staleness`, [
    'days', 'stale',
  ]);
  if (staleness) {
    v.integer(staleness.days, `${path}.catalog_staleness.days`, 0);
    v.boolean(staleness.stale, `${path}.catalog_staleness.stale`);
  }
  const claims = v.array(coverage.unverified_claims, `${path}.unverified_claims`);
  claims?.forEach((claim, index) => {
    const claimPath = `${path}.unverified_claims[${index}]`;
    const row = v.object(claim, claimPath, ['claim_ref', 'evidence_class']);
    if (row) {
      v.pattern(
        row.claim_ref,
        `${claimPath}.claim_ref`,
        /^(augmentation:[^.]+\..+|dump_sourced:.+|catalog:[^.]+\..+)$/u,
      );
      v.string(row.evidence_class, `${claimPath}.evidence_class`);
      if (owns(row, 'falsifier')) v.string(row.falsifier, `${claimPath}.falsifier`);
    }
  });
}

function validateRemediationEntry(v: Validation, value: unknown, path: string): void {
  const row = v.object(value, path, [
    'group_id', 'band', 'score', 'action_state', 'what', 'why', 'how',
    'descriptor_coverage', 'effort_class', 'dependency_notes',
  ]);
  if (!row) return;
  v.pattern(row.group_id, `${path}.group_id`, FINGERPRINT);
  v.enumeration(row.band, `${path}.band`, BANDS);
  v.number(row.score, `${path}.score`, 0, 100);
  v.enumeration(row.action_state, `${path}.action_state`, ACTION_STATES);
  for (const key of ['what', 'why', 'how']) v.string(row[key], `${path}.${key}`);
  v.enumeration(row.descriptor_coverage, `${path}.descriptor_coverage`, DESCRIPTOR_COVERAGES);
  v.enumeration(row.effort_class, `${path}.effort_class`, EFFORT_CLASSES);
  validateStringArray(v, row.dependency_notes, `${path}.dependency_notes`);
}

function validateDelta(v: Validation, value: unknown): void {
  const path = '$.delta';
  const delta = v.object(value, path, ['resolved', 'persisted', 'new']);
  if (!delta) return;
  for (const key of ['resolved', 'persisted', 'new']) {
    validateStringArray(v, delta[key], `${path}.${key}`, FINGERPRINT);
  }
}

function validateBaselineEntry(v: Validation, value: unknown, path: string): void {
  const row = v.object(value, path, ['fingerprint', 'rule', 'accepted_at']);
  if (!row) return;
  v.pattern(row.fingerprint, `${path}.fingerprint`, FINGERPRINT);
  v.string(row.rule, `${path}.rule`, true);
  v.string(row.accepted_at, `${path}.accepted_at`, true);
  if (owns(row, 'note')) v.string(row.note, `${path}.note`);
}

function validateBaseline(v: Validation, value: unknown): void {
  const path = '$.baseline';
  const baseline = v.object(value, path, [
    'formula', 'applied_from', 'basis_matches', 'accepted_total', 'stale_entries',
    'migration_required',
  ]);
  if (!baseline) return;
  if (baseline.formula !== 'finding-fingerprint/2') {
    v.fail(`${path}.formula`, "must equal 'finding-fingerprint/2'");
  }
  v.nullableString(baseline.applied_from, `${path}.applied_from`);
  v.boolean(baseline.basis_matches, `${path}.basis_matches`);
  v.integer(baseline.accepted_total, `${path}.accepted_total`, 0);
  const stale = v.array(baseline.stale_entries, `${path}.stale_entries`);
  stale?.forEach((row, index) => validateBaselineEntry(v, row, `${path}.stale_entries[${index}]`));
  v.boolean(baseline.migration_required, `${path}.migration_required`);
}

function validateSuppressionEntry(v: Validation, value: unknown, path: string): void {
  const row = v.object(value, path, ['rule', 'scope', 'rationale', 'owner', 'expires']);
  if (!row) return;
  v.string(row.rule, `${path}.rule`, true);
  const scope = v.object(row.scope, `${path}.scope`);
  if (scope) {
    if (owns(scope, 'file')) v.string(scope.file, `${path}.scope.file`);
    if (owns(scope, 'control')) v.string(scope.control, `${path}.scope.control`);
  }
  v.string(row.rationale, `${path}.rationale`, true);
  v.string(row.owner, `${path}.owner`, true);
  v.string(row.expires, `${path}.expires`, true);
}

function validateSuppressions(v: Validation, value: unknown): void {
  const path = '$.suppressions';
  const block = v.object(value, path, ['applied_count', 'expired', 'invalid']);
  if (!block) return;
  v.integer(block.applied_count, `${path}.applied_count`, 0);
  const expired = v.array(block.expired, `${path}.expired`);
  expired?.forEach((row, index) => validateSuppressionEntry(v, row, `${path}.expired[${index}]`));
  const invalid = v.array(block.invalid, `${path}.invalid`);
  invalid?.forEach((row, index) => {
    const rowPath = `${path}.invalid[${index}]`;
    const item = v.object(row, rowPath, ['index', 'reason']);
    if (item) {
      v.integer(item.index, `${rowPath}.index`, -1);
      v.string(item.reason, `${rowPath}.reason`, true);
    }
  });
}

function validatePolicy(v: Validation, value: unknown): void {
  const path = '$.policy';
  const policy = v.object(value, path, [
    'profile_id', 'blocking_policy_applied', 'severity_overrides',
  ]);
  if (!policy) return;
  v.string(policy.profile_id, `${path}.profile_id`, true);
  v.boolean(policy.blocking_policy_applied, `${path}.blocking_policy_applied`);
  const overrides = v.array(policy.severity_overrides, `${path}.severity_overrides`);
  overrides?.forEach((override, index) => {
    const rowPath = `${path}.severity_overrides[${index}]`;
    const row = v.object(override, rowPath, ['rule', 'severity']);
    if (row) {
      v.string(row.rule, `${rowPath}.rule`, true);
      v.enumeration(row.severity, `${rowPath}.severity`, SEVERITIES);
    }
  });
  if (owns(policy, 'priority_weights')) v.object(policy.priority_weights, `${path}.priority_weights`);
}

function validateEnvelope(v: Validation, value: unknown): void {
  const path = '$.envelope';
  const envelope = v.object(value, path, ['id', 'path', 'submission']);
  if (!envelope) return;
  v.nullableString(envelope.id, `${path}.id`);
  v.nullableString(envelope.path, `${path}.path`);
  const submission = v.object(envelope.submission, `${path}.submission`, ['state']);
  if (!submission) return;
  v.enumeration(submission.state, `${path}.submission.state`, [
    'not_requested', 'pending', 'acknowledged', 'failed',
  ]);
  if (owns(submission, 'attempted_at')) {
    v.string(submission.attempted_at, `${path}.submission.attempted_at`);
  }
  if (owns(submission, 'error_code')) v.string(submission.error_code, `${path}.submission.error_code`);
  const hasAttempt = owns(submission, 'attempted_at');
  const hasError = owns(submission, 'error_code');
  if (submission.state === 'not_requested' || submission.state === 'pending') {
    if (hasAttempt) v.fail(`${path}.submission.attempted_at`, 'is forbidden for this state');
    if (hasError) v.fail(`${path}.submission.error_code`, 'is forbidden for this state');
  } else if (submission.state === 'acknowledged') {
    if (!hasAttempt) v.fail(`${path}.submission.attempted_at`, 'is required for this state');
    if (hasError) v.fail(`${path}.submission.error_code`, 'is forbidden for this state');
  } else if (submission.state === 'failed') {
    if (!hasAttempt) v.fail(`${path}.submission.attempted_at`, 'is required for this state');
    if (!hasError) v.fail(`${path}.submission.error_code`, 'is required for this state');
  }
}

export function validateReport(value: unknown): ReportValidationResult {
  const v = new Validation();
  const report = v.object(value, '$', [
    'report_schema', 'report_schema_minor', 'report_id', 'identity', 'gate', 'findings',
    'root_causes', 'inventories', 'coverage', 'remediation_plan', 'baseline',
    'suppressions', 'policy', 'envelope',
  ]);
  if (!report) return { valid: false, errors: v.errors };

  if (report.report_schema !== 'analysis-report/1') {
    v.fail('$.report_schema', "must equal 'analysis-report/1'");
  }
  v.integer(report.report_schema_minor, '$.report_schema_minor', 0);
  v.string(report.report_id, '$.report_id', true);
  validateIdentity(v, report.identity);
  validateGate(v, report.gate);
  const findings = v.array(report.findings, '$.findings');
  findings?.forEach((finding, index) => validateFinding(v, finding, `$.findings[${index}]`));
  const rootCauses = v.array(report.root_causes, '$.root_causes');
  rootCauses?.forEach((root, index) => validateRootCause(v, root, `$.root_causes[${index}]`));
  validateInventories(v, report.inventories);
  validateCoverage(v, report.coverage);
  const plan = v.array(report.remediation_plan, '$.remediation_plan');
  plan?.forEach((row, index) => validateRemediationEntry(v, row, `$.remediation_plan[${index}]`));
  if (owns(report, 'delta')) validateDelta(v, report.delta);
  validateBaseline(v, report.baseline);
  validateSuppressions(v, report.suppressions);
  validatePolicy(v, report.policy);
  validateEnvelope(v, report.envelope);
  return { valid: v.errors.length === 0, errors: v.errors };
}

export function isAnalysisReportV1(value: unknown): value is AnalysisReportV1 {
  return validateReport(value).valid;
}

export function validateAnalysisReport(value: unknown): ReportValidationResult {
  return validateReport(value);
}

export function assertValidReport(value: unknown): asserts value is AnalysisReportV1 {
  const result = validateReport(value);
  if (!result.valid) throw new ReportValidationError(result.errors);
}
