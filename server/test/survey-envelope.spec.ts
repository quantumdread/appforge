import { describe, expect, it } from 'vitest';
import { sha256 } from '../src/core/sha256';
import { analyze } from '../src/core/snapshot';
import { buildReport } from '../src/core/survey/build-report';
import {
  buildEnvelope,
  EnvelopeBuildError,
  serializeEnvelope,
} from '../src/core/survey/envelope';
import type {
  CatalogEnvelopeAllowlist,
  SurveyEnvelopeV1,
} from '../src/core/survey/envelope-types';
import {
  decodeCanonicalEnvelope,
  EnvelopeValidationError,
  validateEnvelope,
} from '../src/core/survey/validate-envelope';
import { ANALYZER_CATALOG_DATA } from '../src/lib/catalog-data';

const ID = '123e4567-e89b-42d3-a456-426614174000';
const SOURCE = `ComponentDefinitions:
  HemligKomponent:
    DefinitionType: CanvasComponent
    CustomProperties:
      HemligEgenskap:
        PropertyKind: Input
        DataType: Text
        Default: =If(true, "Hemligt vittnesvärde", First(HemligDatakälla).Title)
    Properties:
      Height: =40
      Width: =100
Screens:
  Kundskärm:
    Children:
      - kundEtikett:
          Control: Text
          Properties:
            Tet: ="Hemlig formel för kund"
            Wrap: =true
      - unknownCustomerControl:
          Control: Texx
          Properties:
            Text: ="okänd"
`;
const ALLOWLIST: CatalogEnvelopeAllowlist = {
  extractor_control_types: ['Text'],
  properties_by_control_type: { Text: ['Text', 'Wrap'] },
};

function fixture() {
  const files = [{ name: 'kundfil.pa.yaml', content: SOURCE }];
  const snapshot = analyze(files, ANALYZER_CATALOG_DATA);
  const report = buildReport(snapshot, {
    app_name: { value: 'Hemlig kundapp', resolved_by: 'manifest' },
    source_kind: 'directory',
    fingerprint_basis: 'directory/src-stripped/v1',
    files: [{ id: files[0].name, sha256: sha256(SOURCE) }],
    limitations: [],
    connections: {
      state: 'available',
      rows: [{ connector_type: 'HemligAnslutning', count: 1 }],
    },
    explicit_datasources: { HemligDatakälla: 'sharepoint' },
  }, {
    now: '2026-08-30T08:00:00.000Z',
    report_id: 'envelope-test-report',
    analyzer_version: '2.4.10-test',
  });
  return { snapshot, report };
}

function builtEnvelope() {
  const { snapshot, report } = fixture();
  return buildEnvelope(snapshot, report, { id: ID, catalog_allowlist: ALLOWLIST });
}

function minimalEnvelopeWithDelta(): SurveyEnvelopeV1 {
  return {
    envelope_schema: 'survey-envelope/1',
    privacy_schema: 'survey-minimization/1',
    id: ID,
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
    versions: { analyzer: '2.4.10-test', catalog: '2026-05-10T16:49:19.734Z' },
    source_kind: 'directory',
    size_buckets: { files: '1', controls: '1-25', findings: '1-10' },
    rule_counts: [{ rule_id: 'unknown-control', count: 1 }],
    opportunity_denominators: [{ rule_id: 'unknown-control', count: 2 }],
    delta_rule_counts: [{ rule_id: 'unknown-control', resolved: 1, persisted: 0 }],
    extractor_control_types: ['Text'],
    near_miss_buckets: [{
      rule_id: 'unknown-control',
      reason_code: 'case-mismatch',
      edit_distance_bucket: '0',
      known_candidate: 'Text',
      count: 1,
    }],
  };
}

function recursiveKeyShapes(value: unknown): string[] {
  const shapes = new Set<string>();
  const visit = (candidate: unknown, path: string): void => {
    if (Array.isArray(candidate)) {
      candidate.forEach(child => visit(child, `${path}[]`));
      return;
    }
    if (typeof candidate !== 'object' || candidate === null) return;
    const record = candidate as Record<string, unknown>;
    shapes.add(`${path}=${Object.keys(record).join(',')}`);
    Object.entries(record).forEach(([key, child]) => visit(child, `${path}.${key}`));
  };
  visit(value, '$');
  return [...shapes].sort();
}

describe('survey-envelope/1 builder', () => {
  it('builds the closed deterministic minimized wire from structured fields', () => {
    const envelope = builtEnvelope();

    expect(Object.keys(envelope)).toEqual([
      'envelope_schema',
      'privacy_schema',
      'id',
      'manifest',
      'versions',
      'source_kind',
      'size_buckets',
      'rule_counts',
      'opportunity_denominators',
      'extractor_control_types',
      'near_miss_buckets',
    ]);
    expect({
      manifest: Object.keys(envelope.manifest),
      versions: Object.keys(envelope.versions),
      sizes: Object.keys(envelope.size_buckets),
      rule: Object.keys(envelope.rule_counts[0]),
      opportunity: Object.keys(envelope.opportunity_denominators[0]),
      control_near_miss: Object.keys(envelope.near_miss_buckets[0]),
      property_near_miss: Object.keys(envelope.near_miss_buckets[1]),
    }).toEqual({
      manifest: ['included_field_kinds'],
      versions: ['analyzer', 'catalog'],
      sizes: ['files', 'controls', 'findings'],
      rule: ['rule_id', 'count'],
      opportunity: ['rule_id', 'count'],
      control_near_miss: [
        'rule_id', 'reason_code', 'edit_distance_bucket', 'known_candidate', 'count',
      ],
      property_near_miss: [
        'rule_id', 'control_type', 'reason_code', 'edit_distance_bucket',
        'known_candidate', 'count',
      ],
    });
    expect(envelope.manifest.included_field_kinds).toEqual([
      'rule_counts',
      'opportunity_denominators',
      'delta_rule_counts',
      'extractor_control_types',
      'versions',
      'source_kind',
      'coarse_size_buckets',
      'near_miss_buckets',
    ]);
    expect(envelope.rule_counts).toEqual([
      { rule_id: 'unknown-control', count: 1 },
      { rule_id: 'unknown-property', count: 1 },
    ]);
    expect(envelope.extractor_control_types).toEqual(['Text']);
    expect(envelope.near_miss_buckets).toEqual([
      {
        rule_id: 'unknown-control',
        reason_code: 'edit-distance',
        edit_distance_bucket: '1',
        known_candidate: 'Text',
        count: 1,
      },
      {
        rule_id: 'unknown-property',
        control_type: 'Text',
        reason_code: 'edit-distance',
        edit_distance_bucket: '1',
        known_candidate: 'Text',
        count: 1,
      },
    ]);
    expect(envelope.size_buckets).toEqual({
      files: '1',
      controls: '1-25',
      findings: '1-10',
    });
    expect(validateEnvelope(envelope, ALLOWLIST)).toEqual({ valid: true, errors: [] });
  });

  // The assertion is a poison-list check over one fixture, not a proof of
  // universal non-emission: it establishes that none of this fixture's own
  // customer vocabulary, fingerprints, group ids, report id, or source lines
  // (nor their SHA-256 digests) appear in the serialized envelope.
  it('does not mutate callers and emits none of this fixture\'s customer vocabulary or hashes', () => {
    const { snapshot, report } = fixture();
    const reportBefore = JSON.stringify(report);
    const allowlistBefore = JSON.stringify(ALLOWLIST);
    const envelope = buildEnvelope(snapshot, report, { id: ID, catalog_allowlist: ALLOWLIST });
    const serialized = serializeEnvelope(envelope, ALLOWLIST);
    const poison = [
      'Kundskärm', 'kundEtikett', 'unknownCustomerControl', 'kundfil.pa.yaml',
      'Hemlig kundapp', 'Hemlig formel för kund', 'HemligKomponent',
      'HemligEgenskap', 'HemligDatakälla', 'HemligAnslutning',
      'Hemligt vittnesvärde',
    ];
    const sensitiveDerivations = [
      ...poison,
      ...report.findings.flatMap(finding => [finding.fingerprint, finding.group_id]),
      report.report_id,
      ...snapshot.files.flatMap(file => file.lines),
    ];
    const leaked = sensitiveDerivations.filter(value => value.length > 0).some(value => (
      serialized.includes(value) || serialized.includes(sha256(value))
    ));

    expect(leaked).toBe(false);
    expect(serializeEnvelope(buildEnvelope(snapshot, report, {
      id: ID,
      catalog_allowlist: ALLOWLIST,
    }), ALLOWLIST)).toBe(serialized);
    expect(JSON.stringify(report)).toBe(reportBefore);
    expect(JSON.stringify(ALLOWLIST)).toBe(allowlistBefore);
  });

  it('counts delta rules through the report fingerprints without emitting identifiers', () => {
    const { snapshot, report } = fixture();
    const previous = structuredClone(report);
    const control = report.findings.find(finding => finding.rule === 'unknown-control')!;
    const property = report.findings.find(finding => finding.rule === 'unknown-property')!;
    report.delta = {
      resolved: [control.fingerprint],
      persisted: [property.fingerprint],
      new: [],
    };

    const envelope = buildEnvelope(snapshot, report, {
      id: ID,
      previous,
      catalog_allowlist: ALLOWLIST,
    });
    expect(envelope.delta_rule_counts).toEqual([
      { rule_id: 'unknown-control', resolved: 1, persisted: 0 },
      { rule_id: 'unknown-property', resolved: 0, persisted: 1 },
    ]);
    expect(serializeEnvelope(envelope, ALLOWLIST)).not.toContain(control.fingerprint);
    expect(serializeEnvelope(envelope, ALLOWLIST)).not.toContain(property.fingerprint);
    expect(recursiveKeyShapes(envelope)).toEqual([
      '$.delta_rule_counts[]=rule_id,resolved,persisted',
      '$.manifest=included_field_kinds',
      '$.near_miss_buckets[]=rule_id,control_type,reason_code,edit_distance_bucket,known_candidate,count',
      '$.near_miss_buckets[]=rule_id,reason_code,edit_distance_bucket,known_candidate,count',
      '$.opportunity_denominators[]=rule_id,count',
      '$.rule_counts[]=rule_id,count',
      '$.size_buckets=files,controls,findings',
      '$.versions=analyzer,catalog',
      '$=envelope_schema,privacy_schema,id,manifest,versions,source_kind,size_buckets,rule_counts,opportunity_denominators,delta_rule_counts,extractor_control_types,near_miss_buckets',
    ]);
  });

  it('refuses undeclared opportunity keys with a typed build error', () => {
    const { snapshot, report } = fixture();
    const poisoned = {
      ...snapshot,
      validation: {
        ...snapshot.validation,
        opportunities: () => ({ 'not-a-declared-rule': 1 }),
      },
    };

    expect(() => buildEnvelope(poisoned, report, {
      id: ID,
      catalog_allowlist: ALLOWLIST,
    })).toThrow(EnvelopeBuildError);
    try {
      buildEnvelope(poisoned, report, { id: ID, catalog_allowlist: ALLOWLIST });
    } catch (error) {
      expect(error).toMatchObject({ code: 'unknown-opportunity-rule' });
    }
  });

  it('deduplicates rule fingerprints and omits candidates lacking allowlist provenance', () => {
    const { snapshot, report } = fixture();
    report.findings.push(structuredClone(report.findings[0]));
    const unproven = {
      ...snapshot,
      validation: {
        ...snapshot.validation,
        issues: snapshot.validation.issues.map(issue => (
          issue.nearMissTelemetry === undefined
            ? issue
            : {
                ...issue,
                nearMissTelemetry: {
                  ...issue.nearMissTelemetry,
                  candidate: 'NotExtractorProven',
                },
              }
        )),
      },
    };
    const envelope = buildEnvelope(unproven, report, {
      id: ID,
      catalog_allowlist: ALLOWLIST,
    });

    expect(envelope.rule_counts.find(row => row.rule_id === report.findings[0].rule)?.count)
      .toBe(1);
    expect(envelope.near_miss_buckets.every(row => row.known_candidate === undefined)).toBe(true);
    expect(envelope.near_miss_buckets.map(row => [
      row.reason_code,
      row.edit_distance_bucket,
    ])).toEqual([
      ['edit-distance', '1'],
      ['edit-distance', '1'],
    ]);
  });

  it('preserves case-mismatch provenance from the analyzer producer', () => {
    const source = `Screens:\n  CaseScreen:\n    Children:\n      - caseLabel:\n          Control: Text\n          Properties:\n            text: ="case"\n`;
    const files = [{ name: 'case.pa.yaml', content: source }];
    const snapshot = analyze(files, ANALYZER_CATALOG_DATA);
    const report = buildReport(snapshot, {
      app_name: { value: null, resolved_by: 'unresolved' },
      source_kind: 'directory',
      fingerprint_basis: 'directory/src-stripped/v1',
      files: [{ id: files[0].name, sha256: sha256(source) }],
      limitations: [],
      connections: { state: 'empty', rows: [] },
    }, {
      now: '2026-08-30T08:00:00.000Z',
      report_id: 'case-report',
      analyzer_version: '2.4.10-test',
    });

    expect(buildEnvelope(snapshot, report, {
      id: ID,
      catalog_allowlist: ALLOWLIST,
    }).near_miss_buckets).toContainEqual({
      rule_id: 'unknown-property',
      control_type: 'Text',
      reason_code: 'case-mismatch',
      edit_distance_bucket: '0',
      known_candidate: 'Text',
      count: 1,
    });
  });

  it('pins every coarse-size bucket boundary', () => {
    const { snapshot, report } = fixture();
    const buckets = (files: number, controls: number, findings: number) => {
      const sizedReport = structuredClone(report);
      sizedReport.identity.files = Array.from({ length: files }, (_, index) => ({
        id: `file-${index}.pa.yaml`,
        sha256: '0'.repeat(64),
      }));
      sizedReport.findings = Array.from(
        { length: findings },
        () => structuredClone(report.findings[0]),
      );
      const sizedSnapshot = {
        ...snapshot,
        validation: {
          ...snapshot.validation,
          summary: { ...snapshot.validation.summary, controls_seen: controls },
        },
      };
      return buildEnvelope(sizedSnapshot, sizedReport, {
        id: ID,
        catalog_allowlist: ALLOWLIST,
      }).size_buckets;
    };

    expect([1, 2, 5, 6, 20, 21, 50, 51].map(value => buckets(value, 0, 0).files))
      .toEqual(['1', '2-5', '2-5', '6-20', '6-20', '21-50', '21-50', '51+']);
    expect([0, 1, 25, 26, 100, 101, 300, 301].map(value => buckets(1, value, 0).controls))
      .toEqual(['0', '1-25', '1-25', '26-100', '26-100', '101-300', '101-300', '301+']);
    expect([0, 1, 10, 11, 50, 51, 200, 201].map(value => buckets(1, 0, value).findings))
      .toEqual(['0', '1-10', '1-10', '11-50', '11-50', '51-200', '51-200', '201+']);
  });
});

describe('survey-envelope/1 runtime and canonical bytes', () => {
  it('round-trips only canonical two-space UTF-8 bytes with a final newline', () => {
    const envelope = minimalEnvelopeWithDelta();
    const bytes = serializeEnvelope(envelope, ALLOWLIST);

    expect(bytes).toBe(`{
  "envelope_schema": "survey-envelope/1",
  "privacy_schema": "survey-minimization/1",
  "id": "123e4567-e89b-42d3-a456-426614174000",
  "manifest": {
    "included_field_kinds": [
      "rule_counts",
      "opportunity_denominators",
      "delta_rule_counts",
      "extractor_control_types",
      "versions",
      "source_kind",
      "coarse_size_buckets",
      "near_miss_buckets"
    ]
  },
  "versions": {
    "analyzer": "2.4.10-test",
    "catalog": "2026-05-10T16:49:19.734Z"
  },
  "source_kind": "directory",
  "size_buckets": {
    "files": "1",
    "controls": "1-25",
    "findings": "1-10"
  },
  "rule_counts": [
    {
      "rule_id": "unknown-control",
      "count": 1
    }
  ],
  "opportunity_denominators": [
    {
      "rule_id": "unknown-control",
      "count": 2
    }
  ],
  "delta_rule_counts": [
    {
      "rule_id": "unknown-control",
      "resolved": 1,
      "persisted": 0
    }
  ],
  "extractor_control_types": [
    "Text"
  ],
  "near_miss_buckets": [
    {
      "rule_id": "unknown-control",
      "reason_code": "case-mismatch",
      "edit_distance_bucket": "0",
      "known_candidate": "Text",
      "count": 1
    }
  ]
}
`);

    expect(bytes.endsWith('\n')).toBe(true);
    expect(decodeCanonicalEnvelope(new TextEncoder().encode(bytes), ALLOWLIST)).toEqual(envelope);
    expect(() => decodeCanonicalEnvelope(new TextEncoder().encode(JSON.stringify(envelope)), ALLOWLIST))
      .toThrowError(expect.objectContaining({ code: 'noncanonical-envelope' }));
    expect(() => decodeCanonicalEnvelope(new Uint8Array([0xc3, 0x28]), ALLOWLIST))
      .toThrowError(expect.objectContaining({ code: 'invalid-envelope-encoding' }));
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(bytes)]);
    expect(() => decodeCanonicalEnvelope(withBom, ALLOWLIST)).toThrow();
  });

  it('rejects duplicate shadow keys, trailing data, and unknown keys without echoing poison', () => {
    const canonical = serializeEnvelope(builtEnvelope(), ALLOWLIST);
    const shadow = canonical.replace(
      `  "id": "${ID}",`,
      `  "id": "hemligt-skuggvärde",\n  "id": "${ID}",`,
    );
    const unknown = structuredClone(builtEnvelope()) as Record<string, unknown>;
    unknown.customer_name = 'must-not-be-accepted';
    const failures = [
      () => decodeCanonicalEnvelope(new TextEncoder().encode(shadow), ALLOWLIST),
      () => decodeCanonicalEnvelope(new TextEncoder().encode(`${canonical} `), ALLOWLIST),
      () => validateEnvelope(unknown, ALLOWLIST),
    ];
    const outcomes = failures.map(run => {
      try {
        const result = run();
        return 'valid' in Object(result) ? (result as { valid: boolean }).valid : true;
      } catch {
        return false;
      }
    });

    expect(outcomes).toEqual([false, false, false]);
  });

  it('rejects semantic poison across every bounded allowlist and ordering seam', () => {
    const poisoners: Array<(value: ReturnType<typeof builtEnvelope>) => void> = [
      value => { value.id = 'not-a-uuid'; },
      value => { value.versions.analyzer = 'Hemlig kundversion'; },
      value => { value.versions.catalog = 'Hemlig katalogversion'; },
      value => { value.rule_counts[0].count = -1; },
      value => { value.rule_counts[0].count = 1.5; },
      value => { value.rule_counts[0].rule_id = 'undeclared-rule'; },
      value => { value.rule_counts.reverse(); },
      value => { value.rule_counts.push({ ...value.rule_counts[0] }); },
      value => { value.extractor_control_types.push('SyntheticCustomerType'); },
      value => { value.size_buckets.files = 'many' as never; },
      value => { value.near_miss_buckets[0].edit_distance_bucket = '0'; },
      value => { value.near_miss_buckets[0].known_candidate = 'UnsafeCandidate'; },
      value => {
        const row = value.near_miss_buckets[1];
        if (row.rule_id === 'unknown-property') row.known_candidate = 'NotAProperty';
      },
      value => { value.near_miss_buckets.reverse(); },
    ];

    const accepted = poisoners.map(poison => {
      const value = structuredClone(builtEnvelope());
      poison(value);
      return validateEnvelope(value, ALLOWLIST).valid;
    });
    expect(accepted).toEqual(poisoners.map(() => false));
  });

  it('refuses invalid or noncanonical values at the only writer seam', () => {
    const unsorted = structuredClone(builtEnvelope());
    unsorted.rule_counts.reverse();
    const unsafe = structuredClone(builtEnvelope());
    unsafe.extractor_control_types.push('SyntheticCustomerType');

    expect(() => serializeEnvelope(unsorted, ALLOWLIST)).toThrow(EnvelopeValidationError);
    expect(() => serializeEnvelope(unsafe, ALLOWLIST)).toThrow(EnvelopeValidationError);
  });
});
