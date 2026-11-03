import type { Issue } from '../analyzer.js';
import type { DatasourceResolution } from '../datasource.js';
import type { RuleMetadata, SeverityClass } from '../rule-metadata.js';

export type SeverityOverride = {
  rule: string;
  severity: SeverityClass;
};

export type SeverityPolicy = {
  profile_id?: string;
  severity_overrides: readonly SeverityOverride[];
};

export type FindingConfidence = 'high' | 'medium' | 'low';
export type ConfidenceBasis = 'provenance' | 'rule-family-default';
export type ConfidenceResult = {
  confidence: FindingConfidence;
  confidence_basis: ConfidenceBasis;
};

/**
 * v2.4.9 declared confidence data. `claim` is reserved for a future release
 * with claim-reference infrastructure and is intentionally never emitted here.
 */
const CONFIDENCE_BY_PROVENANCE: Readonly<Record<DatasourceResolution, FindingConfidence>> = {
  'explicit-input': 'high',
  'export-metadata': 'medium',
  'naming-convention': 'low',
  unresolved: 'low',
};

const FORCED_RULE_CONFIDENCE: Readonly<Record<string, FindingConfidence>> = {
  'partial-catalog-data': 'low',
  'variant-unspecified-property': 'low',
  'unverified-augmentation': 'low',
};

/**
 * A pattern is not proven non-delegation: this ceiling distinguishes a
 * limitation of the rule from a limitation of source identification.
 */
const HEURISTIC_CONFIDENCE_CEILING: ReadonlySet<string> = new Set([
  'delegation-search-caveat',
  'delegation-sharepoint-search',
  'delegation-sharepoint-isblank',
  'delegation-sql-isblank',
]);

export function severityOf(
  issue: Readonly<Issue>,
  registryRow: Readonly<RuleMetadata>,
  policy: Readonly<SeverityPolicy>,
): SeverityClass {
  if (issue.level === 'REFUSE') return 'BLOCK';
  const override = policy.severity_overrides.find(entry => entry.rule === issue.rule);
  const baseSeverity = policy.profile_id === 'existing-export' && issue.rule === 'block-scalar-required'
    ? 'MAINTAINABILITY'
    : policy.profile_id === 'existing-export' && issue.rule === 'addcolumns-string-column-name'
      ? 'CORRECTNESS_RISK' : registryRow.baseSeverity;
  const severity = override?.severity ?? baseSeverity;
  const provenance = issue.evidence?.kind === 'bound-source'
    ? issue.evidence.resolvedBy
    : null;
  const uncertainProvenance = provenance === 'naming-convention' || provenance === 'unresolved';

  // parseConfidence: partial is deferred because no production issue carries a
  // parse-confidence signal; the tokenizer is shadow-only and feeds no verdict.
  return registryRow.uncertaintyDowngrade && uncertainProvenance
    ? 'UNCERTAINTY'
    : severity;
}

export function confidenceOf(issue: Readonly<Issue>): ConfidenceResult {
  if (issue.rule && Object.hasOwn(FORCED_RULE_CONFIDENCE, issue.rule)) {
    return {
      confidence: FORCED_RULE_CONFIDENCE[issue.rule],
      confidence_basis: 'rule-family-default',
    };
  }
  if (issue.evidence?.kind !== 'bound-source') {
    return { confidence: 'medium', confidence_basis: 'rule-family-default' };
  }
  const result: ConfidenceResult = {
    confidence: CONFIDENCE_BY_PROVENANCE[issue.evidence.resolvedBy],
    confidence_basis: 'provenance',
  };
  if (issue.rule && HEURISTIC_CONFIDENCE_CEILING.has(issue.rule) && result.confidence === 'high') {
    return { confidence: 'medium', confidence_basis: 'rule-family-default' };
  }
  return result;
}
