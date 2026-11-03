import Ajv from 'ajv';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RULE_METADATA } from '../src/core/rule-metadata';
import type { CatalogEnvelopeAllowlist, SurveyEnvelopeV1 } from '../src/core/survey/envelope-types';
import { validateEnvelope } from '../src/core/survey/validate-envelope';

const schema = JSON.parse(readFileSync(fileURLToPath(new URL(
  '../src/core/survey/survey-envelope.schema.json',
  import.meta.url,
)), 'utf8'));
const ajvValidate = new Ajv({ allErrors: true, strict: false }).compile(schema);
const ALLOWLIST: CatalogEnvelopeAllowlist = {
  extractor_control_types: ['Text'],
  properties_by_control_type: { Text: ['Text'] },
};

function validEnvelope(): SurveyEnvelopeV1 {
  return {
    envelope_schema: 'survey-envelope/1',
    privacy_schema: 'survey-minimization/1',
    id: '123e4567-e89b-42d3-a456-426614174000',
    manifest: {
      included_field_kinds: [
        'rule_counts',
        'opportunity_denominators',
        'delta_rule_counts',
        'extractor_control_types',
        'versions',
        'source_kind',
        'coarse_size_buckets',
        'near_miss_buckets',
      ],
    },
    versions: { analyzer: '2.4.10', catalog: '2026-05-10T16:49:19.734Z' },
    source_kind: 'directory',
    size_buckets: { files: '1', controls: '1-25', findings: '1-10' },
    rule_counts: [{ rule_id: 'unknown-property', count: 1 }],
    opportunity_denominators: [{ rule_id: 'unknown-property', count: 1 }],
    delta_rule_counts: [{ rule_id: 'unknown-property', resolved: 1, persisted: 1 }],
    extractor_control_types: ['Text'],
    near_miss_buckets: [{
      rule_id: 'unknown-property',
      control_type: 'Text',
      reason_code: 'edit-distance',
      edit_distance_bucket: '1',
      known_candidate: 'Text',
      count: 1,
    }],
  };
}

describe('survey envelope JSON Schema agreement', () => {
  it('pins the schema rule enum to the authoritative registry', () => {
    expect(schema.definitions.rule_id.enum).toEqual(Object.keys(RULE_METADATA));
  });

  it('agrees on the valid wire and structural poison matrix', () => {
    const extraTop = structuredClone(validEnvelope()) as Record<string, unknown>;
    extraTop.customer = 'forbidden';
    const extraNested = structuredClone(validEnvelope());
    Object.assign(extraNested.versions, { path: 'forbidden' });
    const missing = structuredClone(validEnvelope()) as Partial<SurveyEnvelopeV1>;
    delete missing.privacy_schema;
    const badManifest = structuredClone(validEnvelope());
    badManifest.manifest.included_field_kinds = ['rule_counts'] as never;
    const badCount = structuredClone(validEnvelope());
    badCount.rule_counts[0].count = -1;
    const badReason = structuredClone(validEnvelope());
    badReason.near_miss_buckets[0].edit_distance_bucket = '0';
    const poisonedAnalyzerVersion = structuredClone(validEnvelope());
    poisonedAnalyzerVersion.versions.analyzer = 'Hemlig kundversion';
    const poisonedCatalogVersion = structuredClone(validEnvelope());
    poisonedCatalogVersion.versions.catalog = 'Hemlig katalogversion';
    const countSetters = [
      (value: SurveyEnvelopeV1, count: number) => { value.rule_counts[0].count = count; },
      (value: SurveyEnvelopeV1, count: number) => {
        value.opportunity_denominators[0].count = count;
      },
      (value: SurveyEnvelopeV1, count: number) => {
        value.delta_rule_counts![0].resolved = count;
      },
      (value: SurveyEnvelopeV1, count: number) => {
        value.delta_rule_counts![0].persisted = count;
      },
      (value: SurveyEnvelopeV1, count: number) => { value.near_miss_buckets[0].count = count; },
    ];
    const countBoundaries = countSetters.flatMap(setCount => {
      const maximum = structuredClone(validEnvelope());
      setCount(maximum, 209_715_200);
      const overMaximum = structuredClone(validEnvelope());
      setCount(overMaximum, 209_715_201);
      return [
        { value: maximum, accepted: true },
        { value: overMaximum, accepted: false },
      ];
    });
    const controlNearMissBoundaries = [209_715_200, 209_715_201].map(count => {
      const value = structuredClone(validEnvelope());
      value.near_miss_buckets = [{
        rule_id: 'unknown-control',
        reason_code: 'case-mismatch',
        edit_distance_bucket: '0',
        known_candidate: 'Text',
        count,
      }];
      return { value, accepted: count === 209_715_200 };
    });
    const fixtures = [
      { value: validEnvelope(), accepted: true },
      { value: extraTop, accepted: false },
      { value: extraNested, accepted: false },
      { value: missing, accepted: false },
      { value: badManifest, accepted: false },
      { value: badCount, accepted: false },
      ...countBoundaries,
      ...controlNearMissBoundaries,
      { value: badReason, accepted: false },
      { value: poisonedAnalyzerVersion, accepted: false },
      { value: poisonedCatalogVersion, accepted: false },
    ];

    for (const fixture of fixtures) {
      expect({
        runtime: validateEnvelope(fixture.value, ALLOWLIST).valid,
        ajv: ajvValidate(fixture.value),
      }).toEqual({ runtime: fixture.accepted, ajv: fixture.accepted });
    }
  });

  it('allows the runtime to be stricter for catalog membership, never looser', () => {
    const semanticPoison = structuredClone(validEnvelope());
    semanticPoison.near_miss_buckets[0].known_candidate = 'UnsafeButSchemaShaped';

    expect(ajvValidate(semanticPoison)).toBe(true);
    expect(validateEnvelope(semanticPoison, ALLOWLIST).valid).toBe(false);
    expect(validateEnvelope(validEnvelope(), ALLOWLIST).valid && !ajvValidate(validEnvelope()))
      .toBe(false);
  });
});
