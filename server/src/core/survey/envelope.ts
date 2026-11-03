import { controlNodes } from '../model.js';
import { RULE_METADATA } from '../rule-metadata.js';
import type { ReadonlySnapshot } from './readonly.js';
import type { AnalysisReportV1 } from './report-types.js';
import {
  INCLUDED_FIELD_KINDS,
  SURVEY_ENVELOPE_SCHEMA,
  SURVEY_PRIVACY_SCHEMA,
  type CatalogEnvelopeAllowlist,
  type NearMissBucket,
  type SurveyEnvelopeV1,
} from './envelope-types.js';

export { serializeEnvelope } from './validate-envelope.js';

export type EnvelopeBuildErrorCode =
  | 'unknown-opportunity-rule'
  | 'invalid-opportunity-count'
  | 'unknown-finding-rule'
  | 'invalid-delta'
  | 'invalid-near-miss-provenance';

export class EnvelopeBuildError extends Error {
  constructor(
    public readonly code: EnvelopeBuildErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'EnvelopeBuildError';
  }
}

export type BuildEnvelopeOptions = {
  id: string;
  previous?: AnalysisReportV1;
  catalog_allowlist: CatalogEnvelopeAllowlist;
};

const compareLexically = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

function bucket(value: number, rows: readonly [number, string][], fallback: string): string {
  return rows.find(([maximum]) => value <= maximum)?.[1] ?? fallback;
}

function ruleCounts(findings: readonly AnalysisReportV1['findings'][number][]) {
  const byRule = new Map<string, Set<string>>();
  for (const finding of findings) {
    if (!Object.hasOwn(RULE_METADATA, finding.rule)) {
      throw new EnvelopeBuildError('unknown-finding-rule', 'report contains an undeclared rule');
    }
    const fingerprints = byRule.get(finding.rule) ?? new Set<string>();
    fingerprints.add(finding.fingerprint);
    byRule.set(finding.rule, fingerprints);
  }
  return [...byRule.entries()]
    .sort(([left], [right]) => compareLexically(left, right))
    .map(([rule_id, fingerprints]) => ({ rule_id, count: fingerprints.size }));
}

function opportunityCounts(snapshot: ReadonlySnapshot) {
  const opportunities = snapshot.validation.opportunities();
  return Object.entries(opportunities)
    .map(([rule_id, count]) => {
      if (!Object.hasOwn(RULE_METADATA, rule_id)) {
        throw new EnvelopeBuildError(
          'unknown-opportunity-rule',
          'opportunity producer returned an undeclared rule',
        );
      }
      if (!Number.isInteger(count) || count < 0) {
        throw new EnvelopeBuildError(
          'invalid-opportunity-count',
          'opportunity producer returned an invalid count',
        );
      }
      return { rule_id, count };
    })
    .sort((left, right) => compareLexically(left.rule_id, right.rule_id));
}

function extractorTypes(
  snapshot: ReadonlySnapshot,
  allowlist: CatalogEnvelopeAllowlist,
): string[] {
  const allowed = new Set(allowlist.extractor_control_types);
  return [...new Set(controlNodes(snapshot.bundle)
    .map(node => node.type)
    .filter((type): type is string => type !== null && allowed.has(type)))]
    .sort(compareLexically);
}

function nearMissKey(row: NearMissBucket): string {
  return [
    row.rule_id,
    row.rule_id === 'unknown-property' ? row.control_type : '',
    row.reason_code,
    row.edit_distance_bucket,
    row.known_candidate ?? '',
  ].join('\u0000');
}

function nearMissBuckets(
  snapshot: ReadonlySnapshot,
  allowlist: CatalogEnvelopeAllowlist,
): NearMissBucket[] {
  const allowedTypes = new Set(allowlist.extractor_control_types);
  const allowedProperties = new Map(Object.entries(allowlist.properties_by_control_type)
    .map(([type, properties]) => [type, new Set(properties)]));
  const grouped = new Map<string, NearMissBucket>();

  for (const issue of snapshot.validation.issues) {
    if (issue.rule !== 'unknown-control' && issue.rule !== 'unknown-property') continue;
    const telemetry = issue.nearMissTelemetry;
    if (!telemetry) continue;
    const legalPair = telemetry.reason_code === 'case-mismatch'
      ? telemetry.edit_distance_bucket === '0'
      : telemetry.reason_code === 'edit-distance'
        && (telemetry.edit_distance_bucket === '1' || telemetry.edit_distance_bucket === '2');
    if (!legalPair) {
      throw new EnvelopeBuildError(
        'invalid-near-miss-provenance',
        'near-miss producer returned an illegal reason-distance pair',
      );
    }

    let row: NearMissBucket;
    if (issue.rule === 'unknown-control') {
      row = {
        rule_id: 'unknown-control',
        reason_code: telemetry.reason_code,
        edit_distance_bucket: telemetry.edit_distance_bucket,
        ...(allowedTypes.has(telemetry.candidate)
          ? { known_candidate: telemetry.candidate }
          : {}),
        count: 1,
      } as NearMissBucket;
    } else {
      if (!allowedTypes.has(issue.type)) {
        throw new EnvelopeBuildError(
          'invalid-near-miss-provenance',
          'property near miss has no extractor-reachable control type',
        );
      }
      row = {
        rule_id: 'unknown-property',
        control_type: issue.type,
        reason_code: telemetry.reason_code,
        edit_distance_bucket: telemetry.edit_distance_bucket,
        ...(allowedProperties.get(issue.type)?.has(telemetry.candidate)
          ? { known_candidate: telemetry.candidate }
          : {}),
        count: 1,
      } as NearMissBucket;
    }
    const key = nearMissKey(row);
    const existing = grouped.get(key);
    if (existing) existing.count += 1;
    else grouped.set(key, row);
  }

  return [...grouped.values()].sort((left, right) => (
    compareLexically(nearMissKey(left), nearMissKey(right))
  ));
}

function deltaCounts(
  report: AnalysisReportV1,
  previous: AnalysisReportV1 | undefined,
): SurveyEnvelopeV1['delta_rule_counts'] {
  if (previous === undefined) {
    if (report.delta !== undefined) {
      throw new EnvelopeBuildError('invalid-delta', 'report delta requires a previous report');
    }
    return undefined;
  }
  if (report.delta === undefined) {
    throw new EnvelopeBuildError('invalid-delta', 'previous report requires a report delta');
  }

  const previousByFingerprint = new Map(previous.findings.map(finding => [
    finding.fingerprint,
    finding.rule,
  ]));
  const currentByFingerprint = new Map(report.findings.map(finding => [
    finding.fingerprint,
    finding.rule,
  ]));
  const counts = new Map<string, { resolved: Set<string>; persisted: Set<string> }>();
  const add = (
    disposition: 'resolved' | 'persisted',
    fingerprint: string,
    lookup: ReadonlyMap<string, string>,
  ) => {
    const rule = lookup.get(fingerprint);
    if (!rule || !Object.hasOwn(RULE_METADATA, rule)) {
      throw new EnvelopeBuildError('invalid-delta', 'delta fingerprint has no declared report rule');
    }
    const row = counts.get(rule) ?? { resolved: new Set(), persisted: new Set() };
    row[disposition].add(fingerprint);
    counts.set(rule, row);
  };
  report.delta.resolved.forEach(fingerprint => add('resolved', fingerprint, previousByFingerprint));
  report.delta.persisted.forEach(fingerprint => add('persisted', fingerprint, currentByFingerprint));

  return [...counts.entries()]
    .sort(([left], [right]) => compareLexically(left, right))
    .map(([rule_id, value]) => ({
      rule_id,
      resolved: value.resolved.size,
      persisted: value.persisted.size,
    }));
}

export function buildEnvelope(
  snapshot: ReadonlySnapshot,
  report: AnalysisReportV1,
  options: BuildEnvelopeOptions,
): SurveyEnvelopeV1 {
  const delta_rule_counts = deltaCounts(report, options.previous);
  return {
    envelope_schema: SURVEY_ENVELOPE_SCHEMA,
    privacy_schema: SURVEY_PRIVACY_SCHEMA,
    id: options.id,
    manifest: { included_field_kinds: [...INCLUDED_FIELD_KINDS] },
    versions: {
      analyzer: report.identity.analyzer_version,
      catalog: report.identity.catalog.version,
    },
    source_kind: report.identity.source_kind,
    size_buckets: {
      files: bucket(report.identity.files.length, [[1, '1'], [5, '2-5'], [20, '6-20'], [50, '21-50']], '51+') as SurveyEnvelopeV1['size_buckets']['files'],
      controls: bucket(snapshot.validation.summary.controls_seen, [[0, '0'], [25, '1-25'], [100, '26-100'], [300, '101-300']], '301+') as SurveyEnvelopeV1['size_buckets']['controls'],
      findings: bucket(report.findings.length, [[0, '0'], [10, '1-10'], [50, '11-50'], [200, '51-200']], '201+') as SurveyEnvelopeV1['size_buckets']['findings'],
    },
    rule_counts: ruleCounts(report.findings),
    opportunity_denominators: opportunityCounts(snapshot),
    ...(delta_rule_counts === undefined ? {} : { delta_rule_counts }),
    extractor_control_types: extractorTypes(snapshot, options.catalog_allowlist),
    near_miss_buckets: nearMissBuckets(snapshot, options.catalog_allowlist),
  };
}
