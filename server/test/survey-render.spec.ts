import { describe, expect, it } from 'vitest';
import { renderTechnical } from '../src/core/survey/render-technical';
import type {
  AnalysisReportV1,
  ReportFinding,
  RemediationPlanEntry,
  RootCause,
} from '../src/core/survey/report-types';

type RootAction =
  | { action_state: 'active' | 'accepted' | 'suppressed' }
  | { action_state: 'mixed'; accepted_count: number; suppressed_count: number };

function priority(
  band: RemediationPlanEntry['band'],
  score: number,
  severity: RootCause['dominant_severity'],
): RootCause['priority'] {
  return {
    band,
    score,
    inputs: {
      severity,
      confidence: 'medium',
      blast: { controls: 1, screens: 1, factor: 0.25 },
      effort_class: 'judgment',
      descriptor_coverage: 'none',
    },
    formula: 'priority/1',
  };
}

function rootCause(
  group_id: string,
  band: RemediationPlanEntry['band'],
  score: number,
  action: RootAction,
  severity: RootCause['dominant_severity'] = 'MAINTAINABILITY',
): RootCause {
  return {
    group_id,
    grouping_key: 'none',
    member_fingerprints: [],
    dominant_severity: severity,
    family: 'fixture',
    priority: priority(band, score, severity),
    descriptor_coverage: 'none',
    effort_class: 'judgment',
    remediation_summary: `${group_id} summary`,
    remediation: {
      what: `${group_id} what`,
      why: `${group_id} why`,
      how: `${group_id} how`,
    },
    ...action,
  } as RootCause;
}

function remediation(
  group_id: string,
  band: RemediationPlanEntry['band'],
  score: number,
  action_state: RemediationPlanEntry['action_state'],
): RemediationPlanEntry {
  return {
    group_id,
    band,
    score,
    action_state,
    what: `${group_id} what`,
    why: `${group_id} why`,
    how: `${group_id} how`,
    descriptor_coverage: 'none',
    effort_class: 'judgment',
    dependency_notes: [],
  };
}

function finding(overrides: Partial<ReportFinding> = {}): ReportFinding {
  return {
    level: 'WARN',
    rule: 'fixture-rule',
    file: 'fixture.pa.yaml',
    line: 8,
    control: 'ctlFixture',
    type: 'Button',
    variant: null,
    property: 'Text',
    detail: 'Fixture finding detail.',
    fix: 'Fixture finding fix.',
    did_you_mean: null,
    controls: [],
    near_miss: false,
    origin: 'analyzer',
    fingerprint: '0123456789abcdef',
    severity: 'MAINTAINABILITY',
    confidence: 'medium',
    confidence_basis: 'rule-family-default',
    claim_ref: null,
    group_id: 'fixture-group',
    baseline_status: 'new',
    adjudication: null,
    members_changed: null,
    edits: [],
    campaign_ref: null,
    queue_refs: [],
    ...overrides,
  };
}

function reportWith(
  root_causes: RootCause[],
  remediation_plan: RemediationPlanEntry[],
): AnalysisReportV1 {
  return {
    report_schema: 'analysis-report/1',
    report_schema_minor: 0,
    report_id: 'render-fixture',
    identity: {
      app_name: { value: 'Renderer fixture', resolved_by: 'manifest' },
      app_id: 'renderer-fixture-00000000',
      source_kind: 'inline',
      completeness: 'full',
      files: [{ id: 'fixture.pa.yaml', sha256: '0'.repeat(64) }],
      fingerprint_basis: 'inline/render-fixture',
      surveyed_at: '2026-08-29T12:00:00.000Z',
      analyzer_version: 'fixture',
      catalog: {
        version: 'fixture-catalog',
        extracted_at: '2026-08-01',
        staleness_days: 28,
      },
    },
    gate: {
      summary: { pass: 1, warn: 0, refuse: 0, controls_seen: 1, files: 1 },
      per_file: [{
        file: 'fixture.pa.yaml',
        pass: 1,
        warn: 0,
        refuse: 0,
        controls_seen: 1,
      }],
      gate_decision: 'CLEAR',
    },
    findings: [],
    root_causes,
    inventories: {
      datasources: { state: 'empty', rows: [] },
      backend_risks: { state: 'empty', rows: [] },
      version_lag: { state: 'empty', rows: [] },
      modernization: { state: 'empty', rows: [] },
      screens: { state: 'empty', rows: [] },
      components: { state: 'empty', rows: [] },
      connections: { state: 'empty', rows: [] },
    },
    coverage: {
      tiers: {
        extractor_verified: 1,
        augmentation_verified: 0,
        dump_sourced_lower_bound: 0,
        component_defined: 0,
        unknown: 0,
      },
      unit: 'classified property occurrences',
      exclusions: 'Fixture exclusions.',
      limitations: [],
      catalog_staleness: { days: 28, stale: false },
      unverified_claims: [],
    },
    remediation_plan,
    baseline: {
      formula: 'finding-fingerprint/2',
      applied_from: null,
      basis_matches: false,
      accepted_total: 0,
      stale_entries: [],
      migration_required: false,
    },
    suppressions: { applied_count: 0, expired: [], invalid: [] },
    policy: {
      profile_id: 'default',
      blocking_policy_applied: true,
      severity_overrides: [],
    },
    envelope: { id: null, path: null, submission: { state: 'not_requested' } },
  };
}

function section(markdown: string, heading: string): string {
  const marker = `## ${heading}`;
  const start = markdown.indexOf(marker);
  expect(start, `missing section ${heading}`).toBeGreaterThanOrEqual(0);
  const rest = markdown.slice(start + marker.length);
  const next = rest.indexOf('\n## ');
  return next === -1 ? rest : rest.slice(0, next);
}

function groupEntry(markdown: string, groupId: string): string {
  const lines = markdown.split('\n');
  const start = lines.findIndex(line => line.startsWith('- **') && line.includes(groupId));
  expect(start, `missing group entry ${groupId}`).toBeGreaterThanOrEqual(0);
  const next = lines.findIndex((line, index) =>
    index > start && (line.startsWith('- **') || line.startsWith('## ')));
  return lines.slice(start, next === -1 ? undefined : next).join('\n');
}

describe('technical report rendering', () => {
  it('keeps fully accepted groups out of Active remediation', () => {
    const report = reportWith(
      [
        rootCause('accepted-group', 'now', 99, { action_state: 'accepted' }),
        rootCause('active-group', 'next', 40, { action_state: 'active' }),
      ],
      [
        remediation('accepted-group', 'now', 99, 'accepted'),
        remediation('active-group', 'next', 40, 'active'),
      ],
    );

    const markdown = renderTechnical(report);

    expect(section(markdown, 'Active remediation')).toContain('active-group what');
    expect(section(markdown, 'Active remediation')).not.toContain('accepted-group what');
    expect(section(markdown, 'Accepted & suppressed debt')).toContain('accepted-group what');
  });

  it('preserves remediation_plan band-major order within Active remediation', () => {
    const ordered = [
      remediation('now-group', 'now', 70, 'active'),
      remediation('next-high-group', 'next', 58, 'active'),
      remediation('next-low-group', 'next', 31, 'active'),
      remediation('later-group', 'later', 12, 'active'),
    ];
    const report = reportWith(
      ordered.map(entry => rootCause(
        entry.group_id,
        entry.band,
        entry.score,
        { action_state: entry.action_state },
      )),
      ordered,
    );

    const active = section(renderTechnical(report), 'Active remediation');

    const positions = ordered.map(entry => active.indexOf(entry.what));
    expect(positions.every(position => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
  });

  it('renders every BLOCK with its catalog-staleness caveat and near-miss flag', () => {
    const report = reportWith([], []);
    report.identity.catalog.staleness_days = 55;
    report.coverage.catalog_staleness = { days: 55, stale: true };
    report.findings = [finding({
      level: 'REFUSE',
      rule: 'unknown-property',
      severity: 'BLOCK',
      near_miss: true,
      did_you_mean: 'Text',
    })];

    const findings = section(renderTechnical(report), 'Findings');

    expect(findings).toContain(
      'BLOCK is against catalog fixture-catalog, extracted 2026-08-01 (55 days stale)',
    );
    expect(findings).toContain('Near miss: yes');
  });

  it("frames an UNCERTAINTY group as verification and never says 'fix' in its entry", () => {
    const entry = remediation('uncertain-group', 'verify-first', 9, 'active');
    entry.what = 'Fix uncertain-group immediately.';
    entry.how = 'Fix the authored property.';
    const report = reportWith(
      [rootCause(
        'uncertain-group',
        'verify-first',
        9,
        { action_state: 'active' },
        'UNCERTAINTY',
      )],
      [entry],
    );

    const markdown = renderTechnical(report);
    const uncertainEntry = groupEntry(markdown, 'uncertain-group');

    expect(uncertainEntry).toMatch(/verification/iu);
    expect(uncertainEntry).not.toMatch(/\bfix\b/iu);
  });

  it('routes mixed UNCERTAINTY verify-first groups only to Verify first with counts', () => {
    const report = reportWith(
      [rootCause('mixed-uncertain-group', 'verify-first', 11, {
        action_state: 'mixed',
        accepted_count: 3,
        suppressed_count: 2,
      }, 'UNCERTAINTY')],
      [remediation('mixed-uncertain-group', 'verify-first', 11, 'mixed')],
    );

    const markdown = renderTechnical(report);
    const mixedEntry = groupEntry(markdown, 'mixed-uncertain-group');

    expect(section(markdown, 'Verify first')).toContain('mixed-uncertain-group');
    expect(section(markdown, 'Active remediation')).not.toContain('mixed-uncertain-group');
    expect(section(markdown, 'Accepted & suppressed debt')).not.toContain('mixed-uncertain-group');
    expect(mixedEntry).toContain('accepted_count: 3');
    expect(mixedEntry).toContain('suppressed_count: 2');
  });

  it("renders unavailable inventories as 'not available from this intake'", () => {
    const report = reportWith([], []);
    report.inventories.connections = { state: 'unavailable' };

    const inventories = section(renderTechnical(report), 'Inventories');

    expect(inventories).toContain('Connections: not available from this intake');
    expect(inventories).not.toMatch(/Connections: (?:0|empty|none)/iu);
  });

  it('shows accepted_count and suppressed_count for mixed groups', () => {
    const report = reportWith(
      [rootCause('mixed-group', 'next', 44, {
        action_state: 'mixed',
        accepted_count: 2,
        suppressed_count: 1,
      })],
      [remediation('mixed-group', 'next', 44, 'mixed')],
    );

    const active = section(renderTechnical(report), 'Active remediation');

    expect(active).toContain('accepted_count: 2');
    expect(active).toContain('suppressed_count: 1');
  });

  it('renders finding detail and rule-provided fix text', () => {
    const report = reportWith([], []);
    report.findings = [finding({
      detail: 'The authored value needs review.',
      fix: 'Use the catalog-backed value.',
    })];

    const findings = section(renderTechnical(report), 'Findings');

    expect(findings).toContain('Detail: The authored value needs review.');
    expect(findings).toContain('Fix: Use the catalog-backed value.');
  });

  it('states that unresolved version knowledge does not cover the type', () => {
    const report = reportWith([], []);
    report.inventories.version_lag = {
      state: 'available',
      rows: [{
        control: 'ctlFuture',
        file: 'fixture.pa.yaml',
        observed: 'FutureControl@0.1.0',
        newest_known: 'unresolved',
      }],
    };

    expect(section(renderTechnical(report), 'Inventories'))
      .toContain('Catalog knowledge does not cover the type.');
  });

  it('qualifies resolved version knowledge as a provenance-bearing lower bound', () => {
    const report = reportWith([], []);
    report.inventories.version_lag = {
      state: 'available',
      rows: [{
        control: 'btnLegacy',
        file: 'fixture.pa.yaml',
        observed: 'Button@0.0.45',
        newest_known: 'ModernButton@1.0.0',
        lower_bound: true,
        evidence: 'studio-export-2026-08-26',
        observed_at: '2026-08-26',
      }],
    };

    expect(section(renderTechnical(report), 'Inventories'))
      .toContain('newest known (lower bound; studio-export-2026-08-26): ModernButton@1.0.0');
  });

  it('renders the delta section only when a previous report produced one', () => {
    const withoutDelta = renderTechnical(reportWith([], []));
    const report = reportWith([], []);
    report.delta = {
      resolved: ['1111111111111111'],
      persisted: ['2222222222222222'],
      new: ['3333333333333333'],
    };

    const withDelta = renderTechnical(report);

    expect(withoutDelta).not.toContain('## Delta');
    expect(section(withDelta, 'Delta')).toContain('Resolved (1): 1111111111111111');
    expect(section(withDelta, 'Delta')).toContain('Persisted (1): 2222222222222222');
    expect(section(withDelta, 'Delta')).toContain('New (1): 3333333333333333');
  });
});
