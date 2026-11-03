export const SURVEY_ENVELOPE_SCHEMA = 'survey-envelope/1' as const;
export const SURVEY_PRIVACY_SCHEMA = 'survey-minimization/1' as const;
// A metric occurrence requires source material. Bound one submitted increment to
// the archive intake's 200 MiB actual-inflation budget; directory surveys above
// this telemetry bound must not create an aggregate-overflow payload.
export const MAX_SURVEY_METRIC_COUNT = 200 * 1024 * 1024;

export const INCLUDED_FIELD_KINDS = [
  'rule_counts',
  'opportunity_denominators',
  'delta_rule_counts',
  'extractor_control_types',
  'versions',
  'source_kind',
  'coarse_size_buckets',
  'near_miss_buckets',
] as const;

export type CatalogEnvelopeAllowlist = {
  extractor_control_types: readonly string[];
  properties_by_control_type: Readonly<Record<string, readonly string[]>>;
};

export type NearMissReason =
  | { reason_code: 'case-mismatch'; edit_distance_bucket: '0' }
  | { reason_code: 'edit-distance'; edit_distance_bucket: '1' | '2' };

export type UnknownControlNearMissBucket = NearMissReason & {
  rule_id: 'unknown-control';
  known_candidate?: string;
  count: number;
};

export type UnknownPropertyNearMissBucket = NearMissReason & {
  rule_id: 'unknown-property';
  control_type: string;
  known_candidate?: string;
  count: number;
};

export type NearMissBucket = UnknownControlNearMissBucket | UnknownPropertyNearMissBucket;

export type SurveyEnvelopeV1 = {
  envelope_schema: typeof SURVEY_ENVELOPE_SCHEMA;
  privacy_schema: typeof SURVEY_PRIVACY_SCHEMA;
  id: string;
  manifest: { included_field_kinds: [...typeof INCLUDED_FIELD_KINDS] };
  versions: { analyzer: string; catalog: string };
  source_kind: 'directory' | 'msapp' | 'solution' | 'inline';
  size_buckets: {
    files: '1' | '2-5' | '6-20' | '21-50' | '51+';
    controls: '0' | '1-25' | '26-100' | '101-300' | '301+';
    findings: '0' | '1-10' | '11-50' | '51-200' | '201+';
  };
  rule_counts: Array<{ rule_id: string; count: number }>;
  opportunity_denominators: Array<{ rule_id: string; count: number }>;
  delta_rule_counts?: Array<{ rule_id: string; resolved: number; persisted: number }>;
  extractor_control_types: string[];
  near_miss_buckets: NearMissBucket[];
};
