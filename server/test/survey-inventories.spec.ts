import { describe, expect, it } from 'vitest';
import { analyze } from '../src/core/snapshot';
import { buildReport, type SurveyInput } from '../src/core/survey/build-report';
import { BACKEND_LIMITS } from '../src/core/survey/backend-limits';
import { assertValidReport } from '../src/core/survey/validate-report';
import { ANALYZER_CATALOG_DATA } from '../src/lib/catalog-data';

const DELEGATION_URL = 'https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/delegation-overview';
const EXPECTED_BACKEND_LIMITS = {
  dataverse: {
    documented_limits: [
      {
        limit: 'Nondelegable query row limit: 500 records by default; 10,000 maximum.',
        source_url: DELEGATION_URL,
      },
      {
        limit: 'Power Apps connector class: Premium.',
        source_url: 'https://learn.microsoft.com/en-us/connectors/commondataserviceforapps/',
      },
    ],
    premium: true,
  },
  sharepoint: {
    documented_limits: [
      {
        limit: 'Nondelegable query row limit: 500 records by default; 10,000 maximum.',
        source_url: DELEGATION_URL,
      },
      {
        limit: 'Power Apps connector class: Standard.',
        source_url: 'https://learn.microsoft.com/en-us/connectors/sharepointonline/',
      },
    ],
    premium: false,
  },
  sql: {
    documented_limits: [
      {
        limit: 'Nondelegable query row limit: 500 records by default; 10,000 maximum.',
        source_url: DELEGATION_URL,
      },
      {
        limit: 'Power Apps connector class: Premium.',
        source_url: 'https://learn.microsoft.com/en-us/connectors/sql/',
      },
    ],
    premium: true,
  },
  excel: {
    documented_limits: [
      {
        limit: 'Nondelegable query row limit: 500 records by default; 10,000 maximum.',
        source_url: DELEGATION_URL,
      },
      {
        limit: 'Power Apps connector class: Standard.',
        source_url: 'https://learn.microsoft.com/en-us/connectors/excelonlinebusiness/',
      },
    ],
    premium: false,
  },
} as const;

const OPTIONS = {
  now: '2026-08-29T12:00:00.000Z',
  report_id: 'inventory-report',
  analyzer_version: '2.4.9-test',
};

function reportFor(
  content: string,
  input: Partial<SurveyInput> = {},
  analyzeOptions: Parameters<typeof analyze>[2] = {},
) {
  const file = { name: 'inventory.pa.yaml', content };
  const surveyInput: SurveyInput = {
    app_name: { value: 'Inventory fixture', resolved_by: 'manifest' },
    source_kind: 'inline',
    fingerprint_basis: 'inline/inventory-test',
    files: [{ id: file.name, sha256: '4'.repeat(64) }],
    limitations: [],
    connections: { state: 'empty', rows: [] },
    ...input,
  };
  return buildReport(
    analyze([file], ANALYZER_CATALOG_DATA, analyzeOptions),
    surveyInput,
    OPTIONS,
  );
}

function labels(count: number): string {
  return Array.from({ length: count }, (_, index) => `      - lbl${index + 1}:
          Control: Label`).join('\n');
}

describe('survey inventories', () => {
  it('keeps the backend facts byte-equal to the independently field-verified table', () => {
    expect(BACKEND_LIMITS).toEqual(EXPECTED_BACKEND_LIMITS);
    expect(JSON.stringify(BACKEND_LIMITS)).not.toMatch(
      /\b(?:should|recommend|use|avoid|consider|update|fix)\b/iu,
    );
  });

  it('reports known pin migrations and never claims lag for unknown knowledge', () => {
    const report = reportFor(`Screens:
  Main:
    Children:
      - btnKnown:
          Control: Button@0.0.45
      - btnUnknown:
          Control: Button@0.0.44
`);

    expect(report.inventories.version_lag).toEqual({
      state: 'available',
      rows: [
        {
          control: 'btnKnown',
          file: 'inventory.pa.yaml',
          observed: 'Button@0.0.45',
          newest_known: 'ModernButton@1.0.0',
          lower_bound: true,
          evidence: 'studio-export-2026-08-26',
          observed_at: '2026-08-26',
          migration: {
            target_type: 'ModernButton',
            target_version: '1.0.0',
            note: 'Studio: update control versions',
          },
        },
        {
          control: 'btnUnknown',
          file: 'inventory.pa.yaml',
          observed: 'Button@0.0.44',
          newest_known: 'unresolved',
        },
      ],
    });
    expect(() => assertValidReport(report)).not.toThrow();
  });

  it('unions explicit, export, and evidence-bound datasource names by provenance', () => {
    const report = reportFor(`Screens:
  Main:
    Children:
      - galOrders:
          Control: Gallery
          Properties:
            Items: =Search(Orders, txtSearch.Value, Title)
`, {
      explicit_datasources: { ExplicitOnly: 'dataverse', Shared: 'sql' },
      export_datasources: { ExportOnly: 'sharepoint', Shared: 'excel' },
    });

    expect(report.inventories.datasources).toEqual({
      state: 'available',
      rows: [
        {
          name: 'ExplicitOnly',
          backend: 'dataverse',
          resolved_by: 'explicit-input',
          confidence: 'high',
        },
        {
          name: 'ExportOnly',
          backend: 'sharepoint',
          resolved_by: 'export-metadata',
          confidence: 'medium',
        },
        {
          name: 'Orders',
          backend: null,
          resolved_by: 'unresolved',
          confidence: 'none',
        },
        {
          name: 'Shared',
          backend: 'sql',
          resolved_by: 'explicit-input',
          confidence: 'high',
        },
      ],
    });
  });

  it('preserves connection states and merges backend rows per connector type', () => {
    const unavailable = reportFor('Screens:\n  Main:\n', {
      connections: { state: 'unavailable', rows: [] },
    });
    expect(unavailable.inventories.connections).toEqual({ state: 'unavailable' });
    expect(unavailable.inventories.backend_risks).toEqual({ state: 'unavailable' });

    const available = reportFor('Screens:\n  Main:\n', {
      explicit_datasources: { Orders: 'sharepoint', Customers: 'dataverse' },
      connections: {
        state: 'available',
        rows: [
          { connector_type: 'sharepoint', count: 2 },
          { connector_type: 'sql', count: 1 },
          { connector_type: 'sharepoint', count: 3 },
        ],
      },
    });
    expect(available.inventories.connections).toEqual({
      state: 'available',
      rows: [
        { connector_type: 'sharepoint', count: 5 },
        { connector_type: 'sql', count: 1 },
      ],
    });
    expect(available.inventories.backend_risks).toEqual({
      state: 'available',
      rows: [
        {
          connector_type: 'dataverse',
          count: null,
          ...EXPECTED_BACKEND_LIMITS.dataverse,
          confidence: 'high',
          unknowns: ['Connection count unavailable from this intake.'],
        },
        {
          connector_type: 'sharepoint',
          count: 5,
          ...EXPECTED_BACKEND_LIMITS.sharepoint,
          confidence: 'high',
          unknowns: [],
        },
        {
          connector_type: 'sql',
          count: 1,
          ...EXPECTED_BACKEND_LIMITS.sql,
          confidence: 'medium',
          unknowns: [],
        },
      ],
    });
    expect(JSON.stringify(
      available.inventories.backend_risks.state === 'available'
        ? available.inventories.backend_risks.rows
        : [],
    )).not.toMatch(/\b(?:should|recommend|use|avoid|consider|update|fix)\b/iu);
  });

  it('keeps explicit backend identification high when a heuristic finding is capped to medium', () => {
    const report = reportFor(`Screens:
  Main:
    Children:
      - galOrders:
          Control: Gallery
          Properties:
            Items: =Filter(Orders, IsBlank(varSearch) || Title = varSearch)
`, { explicit_datasources: { Orders: 'sharepoint' } }, {
      lintContext: { datasources: { Orders: 'sharepoint' } },
    });

    expect(report.findings).toContainEqual(expect.objectContaining({
      rule: 'delegation-sharepoint-isblank',
      confidence: 'medium', confidence_basis: 'rule-family-default', edits: [],
    }));
    expect(report.inventories.datasources).toEqual({
      state: 'available',
      rows: [{ name: 'Orders', backend: 'sharepoint', resolved_by: 'explicit-input', confidence: 'high' }],
    });
    expect(() => assertValidReport(report)).not.toThrow();
  });

  it('reports screen counts with only exercised evidence thresholds', () => {
    const report = reportFor(`Screens:
  Crowded:
    Children:
${labels(301)}
  Sparse:
    Children:
      - btnOne:
          Control: Button
`);

    expect(report.inventories.screens).toEqual({
      state: 'available',
      rows: [
        {
          screen: 'Crowded',
          file: 'inventory.pa.yaml',
          controls: 301,
          threshold: 300,
        },
        {
          screen: 'Sparse',
          file: 'inventory.pa.yaml',
          controls: 1,
          threshold: null,
          note: 'threshold not exercised',
        },
      ],
    });
  });

  it('uses matching threshold evidence even when its observed recount is stale', () => {
    const content = `Screens:
  Crowded:
    Children:
${labels(301)}
`;
    const file = { name: 'inventory.pa.yaml', content };
    const snapshot = analyze([file], ANALYZER_CATALOG_DATA);
    const issue = snapshot.validation.issues.find(candidate =>
      candidate.rule === 'perf-control-budget');
    if (issue?.evidence?.kind !== 'threshold') {
      throw new Error('fixture did not emit perf-control-budget threshold evidence');
    }
    issue.evidence = { ...issue.evidence, observed: 999 };

    const report = buildReport(snapshot, {
      app_name: { value: 'Inventory fixture', resolved_by: 'manifest' },
      source_kind: 'inline',
      fingerprint_basis: 'inline/inventory-test',
      files: [{ id: file.name, sha256: '4'.repeat(64) }],
      limitations: [],
      connections: { state: 'empty', rows: [] },
    }, OPTIONS);

    expect(report.inventories.screens).toEqual({
      state: 'available',
      rows: [{
        screen: 'Crowded',
        file: 'inventory.pa.yaml',
        controls: 301,
        threshold: 300,
      }],
    });
  });

  it('counts component definitions and instances through the readonly control graph', () => {
    const report = reportFor(`ComponentDefinitions:
  cKnown:
    DefinitionType: CanvasComponent
Screens:
  Main:
    Children:
      - cmpKnownOne:
          Control: CanvasComponent
          ComponentName: cKnown
      - cmpKnownTwo:
          Control: CanvasComponent
          ComponentName: cKnown
      - cmpMissing:
          Control: CanvasComponent
          ComponentName: cMissing
`);

    expect(report.inventories.components).toEqual({
      state: 'available',
      rows: [
        {
          component: 'cKnown',
          file: 'inventory.pa.yaml',
          definitions: 1,
          instances: 2,
        },
        {
          component: 'cMissing',
          file: 'inventory.pa.yaml',
          definitions: 0,
          instances: 1,
        },
      ],
    });
  });

  it('uses explicit empty states instead of authoritative-looking bare arrays', () => {
    const report = reportFor('App:\n  Properties:\n    OnStart: =true\n');

    expect(report.inventories.datasources).toEqual({ state: 'empty', rows: [] });
    expect(report.inventories.backend_risks).toEqual({ state: 'empty', rows: [] });
    expect(report.inventories.version_lag).toEqual({ state: 'empty', rows: [] });
    expect(report.inventories.screens).toEqual({ state: 'empty', rows: [] });
    expect(report.inventories.components).toEqual({ state: 'empty', rows: [] });
    expect(report.inventories.connections).toEqual({ state: 'empty', rows: [] });
  });

  it('carries catalog evidence classes into the coverage claim summary', () => {
    const report = reportFor('Screens:\n  Main:\n');

    expect(report.coverage).toMatchObject({
      unit: 'classified property occurrences',
      exclusions: 'Occurrences on unrecognized control types, unknown variants, and the App pseudo-control enter no tier.',
      unverified_claims: ANALYZER_CATALOG_DATA.evidenceClasses,
    });
    expect(report.coverage.unverified_claims).toEqual([
      { claim_ref: 'dump_sourced:ComboBoxDataField', evidence_class: 'dump-sourced-lower-bound' },
      { claim_ref: 'dump_sourced:TableDataField', evidence_class: 'dump-sourced-lower-bound' },
    ]);
  });
});
