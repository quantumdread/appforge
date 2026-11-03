import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validateFiles } from '../src/core/analyzer';
import type { DatasourceMap } from '../src/core/datasource';
import { ruleMetadata } from '../src/core/rule-metadata';
import { analyze } from '../src/core/snapshot';
import { buildReport } from '../src/core/survey/build-report';
import { ANALYZER_CATALOG_DATA } from '../src/lib/catalog-data';

const coverageRoot = fileURLToPath(new URL(
  '../../cli/corpus/coverage',
  import.meta.url,
));
const analyzerPath = fileURLToPath(new URL('../src/core/analyzer.ts', import.meta.url));

describe('analyzer rule metadata contract', () => {
  it('classifies the omitted-variant warning consistently across profiles and survey output', () => {
    const files = [{ name: 'variant.pa.yaml', content: 'Screens:\n  S:\n    Children:\n      - FixtureGallery:\n          Control: Gallery\n          Properties:\n            WrapCount: =1\n' }];
    const snapshot = analyze(files, ANALYZER_CATALOG_DATA);
    const cli = validateFiles(files, ANALYZER_CATALOG_DATA, { lintProfile: 'cli' });
    const findings = (issues: typeof cli.issues) => issues.filter(issue => issue.rule === 'variant-unspecified-property');
    expect(findings(cli.issues)).toEqual(findings(snapshot.validation.issues));
    expect(findings(cli.issues)).toHaveLength(1);
    const report = buildReport(snapshot, {
      app_name: { value: 'Fixture', resolved_by: 'manifest' }, source_kind: 'directory',
      fingerprint_basis: 'directory/src-stripped/v1', files: [{ id: files[0].name, sha256: '0'.repeat(64) }],
      limitations: [], connections: { state: 'empty', rows: [] },
    }, { now: '2026-09-20T00:00:00.000Z', report_id: 'variant-fixture', analyzer_version: 'test' });
    expect(report.findings.find(finding => finding.rule === 'variant-unspecified-property')).toMatchObject({
      level: 'WARN', severity: 'UNCERTAINTY', confidence: 'low',
    });
  });

  it('emits all eight structural warnings consistently in both profiles and classifies the survey findings', () => {
    const isolatedRoot = join(coverageRoot, '..', 'isolated');
    const expectedSeverity: Record<string, string> = {
      'delegation-forall-truncation': 'CORRECTNESS_RISK',
      'app-onerror-missing': 'MAINTAINABILITY',
      'write-followed-by-unconditional-navigation': 'CORRECTNESS_RISK',
      'submitform-navigation-not-in-onsuccess': 'CORRECTNESS_RISK',
      'form-without-failure-path': 'CORRECTNESS_RISK',
      'success-notification-not-gated': 'CORRECTNESS_RISK',
      'navigate-to-unknown-screen': 'CORRECTNESS_RISK',
      'unreachable-screen': 'MAINTAINABILITY',
    };
    const observed = new Set<string>();
    for (const name of ['90-write-form-navigation.pa.yaml', '91-unknown-screen.pa.yaml']) {
      const files = [{ name, content: readFileSync(join(isolatedRoot, name), 'utf8') }];
      const lintContext = { datasources: { CoverageSharePoint: 'sharepoint' as const } };
      const snapshot = analyze(files, ANALYZER_CATALOG_DATA, { lintContext });
      const cli = validateFiles(files, ANALYZER_CATALOG_DATA, { lintContext, lintProfile: 'cli' });
      const project = (issues: typeof cli.issues) => issues
        .filter(issue => issue.rule && Object.hasOwn(expectedSeverity, issue.rule))
        .map(issue => ({ rule: issue.rule, level: issue.level, file: issue.file,
          line: issue.line, control: issue.control, property: issue.property, detail: issue.detail }))
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
      expect(project(cli.issues)).toEqual(project(snapshot.validation.issues));
      const report = buildReport(snapshot, {
        app_name: { value: name, resolved_by: 'manifest' }, source_kind: 'directory',
        fingerprint_basis: 'directory/src-stripped/v1',
        files: [{ id: name, sha256: '0'.repeat(64) }], limitations: [],
        connections: { state: 'empty', rows: [] },
      }, { now: '2026-09-08T00:00:00.000Z', report_id: 'structural-rules', analyzer_version: 'test' });
      for (const finding of report.findings) {
        if (!Object.hasOwn(expectedSeverity, finding.rule)) continue;
        observed.add(finding.rule);
        expect(finding.level).toBe('WARN');
        expect(finding.severity).toBe(expectedSeverity[finding.rule]);
        if (finding.rule !== 'delegation-forall-truncation') {
          expect(finding.confidence).toBe('medium');
          expect(finding.confidence_basis).toBe('rule-family-default');
        }
      }
    }
    expect([...observed].sort()).toEqual(Object.keys(expectedSeverity).sort());
  });

  it('resolves every rule literal in analyzer.ts through ruleMetadata', () => {
    const source = readFileSync(analyzerPath, 'utf8');
    const emittedRuleIds = [...source.matchAll(/\brule:\s*'([^']+)'/gu)]
      .map(match => match[1]);

    expect(emittedRuleIds.length).toBeGreaterThan(0);
    for (const id of emittedRuleIds) {
      expect(ruleMetadata(id), `analyzer rule literal '${id}' has no metadata`).not.toBeNull();
    }
  });

  it('gives every non-PASS issue from the coverage corpus a declared rule', () => {
    const files = readdirSync(coverageRoot)
      .filter(name => name.endsWith('.pa.yaml'))
      .sort()
      .map(name => ({ name, content: readFileSync(join(coverageRoot, name), 'utf8') }));
    const datasources = JSON.parse(
      readFileSync(join(coverageRoot, 'datasources.json'), 'utf8'),
    ) as DatasourceMap;
    const result = validateFiles(files, ANALYZER_CATALOG_DATA, {
      lintContext: { datasources },
    });
    const emitted = result.issues.filter(issue => issue.level !== 'PASS');

    expect(emitted.length).toBeGreaterThan(0);
    for (const issue of emitted) {
      const site = `${issue.file}:${issue.line} ${issue.control}`;
      expect(issue.rule, `${site} emitted ${issue.level} without a rule`).toBeTruthy();
      expect(ruleMetadata(issue.rule!), `${site} emitted unknown rule '${issue.rule}'`).not.toBeNull();
    }
  });
});
