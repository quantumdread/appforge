import { describe, expect, it } from 'vitest';
import { validateFiles } from '../src/core/analyzer';
import { ANALYZER_CATALOG_DATA as catalog } from '../src/lib/catalog-data';
import { getMergedControl } from '../src/lib/catalog';
import { assertValidAugmentationCatalog } from '../src/core/catalog';
import { analyzeSurveyFiles } from '../src/lib/survey';
import { buildReport } from '../src/core/survey/build-report';

const fixture = (properties: string, type = 'ModernText') => `Screens:
  Home:
    Children:
      - reader:
          Control: ${type}
          Properties:
${properties.split('\n').map(line => `            ${line}`).join('\n')}
`;
const gallery = (nested = false) => `ComponentDefinitions:
  cRows:
    DefinitionType: CanvasComponent
    Children:
      - rows:
          Control: Gallery
          Children:
${nested ? '            - box:\n                Control: GroupContainer\n                Children:\n' : ''}${nested ? '                  ' : '            '}- tap:
${nested ? '                      ' : '                '}Control: ModernText
${nested ? '                      ' : '                '}Properties:
${nested ? '                        ' : '                  '}OnSelect: =Select(Parent)
`;
const hits = (content: string, rule: string, profile: 'worker' | 'cli' = 'worker', datasources = {}) =>
  validateFiles([{name: 'Home.pa.yaml', content}], catalog, {lintProfile: profile, lintContext: {datasources}})
    .issues.filter(issue => issue.rule === rule);
const autoLayoutText = (fill = '') => `Screens:
  Home:
    Children:
      - box:
          Control: GroupContainer
          Variant: AutoLayout
          Properties:
            LayoutDirection: =LayoutDirection.Vertical
          Children:
            - reader:
                Control: ModernText
                Properties:
                  Height: =20
                  Size: =14
${fill ? `                  FillPortions: ${fill}\n` : ''}`;

describe('coauthoring runtime errata', () => {
  it.each(['shared', 'existing-export'] as const)('classifies all four runtime findings as WARN correctness risks under %s', profile => {
    const files = [{name: 'Home.pa.yaml', content: gallery() + fixture('Text: =Index(Filter(Src, "all" = varX || Col = varX), 2)\nHeight: =28\nSize: =20')}];
    const report = buildReport(analyzeSurveyFiles(files), {
      app_name: {value: null, resolved_by: 'unresolved'}, source_kind: 'inline', fingerprint_basis: 'fixture',
      files: [{id: 'Home.pa.yaml', sha256: '0'.repeat(64)}], limitations: [], connections: {state: 'empty', rows: []},
    }, {now: '2026-10-06T00:00:00.000Z', report_id: 'r2-fixture', analyzer_version: 'test', policy: {profile_id: profile}});
    for (const rule of ['select-parent-in-gallery', 'filter-constant-or-column', 'index-literal-position', 'modern-text-height-below-size']) {
      expect(report.findings.find(finding => finding.rule === rule)).toMatchObject({level: 'WARN', severity: 'CORRECTNESS_RISK'});
    }
  });
  it.each(['', '=1', '=varFill'])('does not infer fixed rendered height for vertical auto-layout FillPortions %s', fill => {
    expect(hits(autoLayoutText(fill), 'modern-text-height-below-size')).toEqual([]);
  });
  it('still warns for an explicitly fixed-height vertical auto-layout child', () => {
    expect(hits(autoLayoutText('=0'), 'modern-text-height-below-size')).toHaveLength(1);
  });
  it.each([
    {verified: false}, {verified_at: '2026-02-30'}, {verified_by: 'runtime_observation'},
    {name: ''}, {verified_at: null},
  ])('rejects malformed injected current-preset evidence: %j', fields => {
    const injected = JSON.parse(JSON.stringify(catalog));
    injected.augmentations.Gallery = {current_variants: [{name: 'CurrentPreset', verified: true,
      verified_at: '2026-10-06', verified_by: 'compile_canvas', ...fields}]};
    expect(() => assertValidAugmentationCatalog(injected)).toThrow(/current_variants/);
  });
  it('rejects injected current names duplicated or overlapping accepted vocabularies', () => {
    const injected = JSON.parse(JSON.stringify(catalog));
    const entry = {name: 'CurrentPreset', verified: true, verified_at: '2026-10-06', verified_by: 'compile_canvas'};
    injected.augmentations.Gallery = {current_variants: [entry, entry]};
    expect(() => assertValidAugmentationCatalog(injected)).toThrow(/repeats/);
    injected.augmentations.Gallery = {current_variants: [entry], legacy_variants: ['CurrentPreset']};
    expect(() => assertValidAugmentationCatalog(injected)).toThrow(/overlaps/);
    injected.augmentations.Gallery = {current_variants: [{...entry, name: 'Vertical'}]};
    expect(() => assertValidAugmentationCatalog(injected)).toThrow(/retire/);
  });
  it.each(['worker', 'cli'] as const)('keeps all three current Studio gallery presets accepted in %s', profile => {
    const names = ['BrowseLayout_Flexible_SocialFeed_ver5.0', 'BrowseLayout_Horizontal_TwoTextOneImageVariant_ver5.0', 'BrowseLayout_Vertical_TwoTextOneImageVariant_ver5.0'];
    const merged = getMergedControl('Gallery')!;
    expect(merged.current_variants.map(entry => entry.name).sort()).toEqual(names);
    for (const name of names) {
      expect(merged.variants).toContain(name);
      expect(merged.legacy_variants).not.toContain(name);
      const content = fixture('Height: =100\nTemplateSize: =40\nAccessibleLabel: ="Rows"', 'Gallery').replace('          Properties:', `          Variant: ${name}\n          Properties:`);
      expect(validateFiles([{name: 'Home.pa.yaml', content}], catalog, {lintProfile: profile}).issues).toEqual([]);
    }
    expect(merged.legacy_variants).toEqual(['BrowseLayout_Vertical_TwoTextOneImageVariant_ver4.0', 'BrowseLayout_Vertical_TwoTextVariant_ver4.0']);
  });
  it.each(['worker', 'cli'] as const)('warns at either depth in component galleries in %s', profile => {
    for (const nested of [false, true]) expect(hits(gallery(nested), 'select-parent-in-gallery', profile)).toHaveLength(1);
  });
  it.each([
    '=Filter(Src, Or("all" = varX, Col = varX))',
    '=Filter(Src, (varX = "all") || Col = varX)',
    '=Filter(Src, Active && (Or(Col = varX, "all" = varX)))',
    '=Filter(Src, "all" = "all" || Col = varX)',
    '=Filter(Src, varX = gblY || Col = varX)',
    '=Filter(Src As row, Or(row.Col = varX, "all" = varX))',
    '=Filter(Src, Active, 1 = 2 || Col = varX)',
    '=Filter(Sort(Src, Col), "all" = varX || Col = varX)',
    '=Filter(Filter(Src, Active), "all" = varX || Col = varX)',
    '=If(true, Filter(Src, Or("all" = varX, Col = varX)))',
    "=Filter('Data Source', Or(\"all\" = varX, 'Display Column' = varX))",
  ])('warns on a non-column OR operand: %s', formula => {
    expect(hits(fixture(`Text: ${formula}`), 'filter-constant-or-column')).toHaveLength(1);
  });
  it.each([
    '=Filter(colRows, "all" = varX || Col = varX)',
    '=Filter(varRows, "all" = varX || Col = varX)',
    '=Filter(Sort(colRows, Col), "all" = varX || Col = varX)',
    '=Filter(Src, Col = varX || Other = varY)',
    '=Filter(Src, ThisRecord.Col = varX || "all" = ThisRecord.Col)',
    '=Filter(Src, "all" = varX && Col = varX)',
    '=Or("all" = varX, Col = varX)',
    '=record.Filter(Src, "all" = varX || Col = varX)',
    '=Filter(Src, record.Or("all" = varX, Col = varX))',
    '=Filter(Src, Col = If(Or("all" = varX, true), 1, 2))',
    '=Filter(Src, "Filter(Src, all = varX || Col = varX)" = Col)',
    '=Filter(Src, "all" = unknownName || Col = varX)',
    '=Filter(Src, Or("all" = varX, Col = varX)',
  ])('ignores collections, column operands and unrelated syntax: %s', formula => {
    expect(hits(fixture(`Text: ${formula}`), 'filter-constant-or-column')).toEqual([]);
  });
  it('honors explicit and exported collections, and explicit sources over naming', () => {
    const content = fixture('Text: =Filter(Src, "all" = varX || Col = varX)');
    expect(hits(content, 'filter-constant-or-column', 'cli', {Src: 'collection'})).toEqual([]);
    expect(validateFiles([{name: 'Home.pa.yaml', content}], catalog, {lintContext: {exportDatasources: {Src: 'collection'}}})
      .issues.filter(issue => issue.rule === 'filter-constant-or-column')).toEqual([]);
    expect(hits(content.replace('Filter(Src,', 'Filter(colRows,'), 'filter-constant-or-column', 'cli', {colRows: 'sql'})).toHaveLength(1);
  });
  it('recognizes a declared non-prefix global variable', () => {
    const content = 'App:\n  Properties:\n    OnStart: =Set(choice, "all")\n' + fixture('Text: =Filter(Src, "all" = choice || Col = choice)');
    expect(hits(content, 'filter-constant-or-column')).toHaveLength(1);
  });
  it.each(['worker', 'cli'] as const)('runs every new WARN in %s', profile => {
    for (const [properties, rule] of [
      ['Text: =Filter(Src, "all" = varX || Col = varX)', 'filter-constant-or-column'],
      ['Text: =Index(rows, 2)', 'index-literal-position'],
      ['Height: =28\nSize: =20', 'modern-text-height-below-size'],
    ]) expect(hits(fixture(properties), rule, profile)[0]?.level).toBe('WARN');
  });
  it.each([
    '=Index(rows, 3)', '=If(true, Index(rows, 2))', '=Index(rows, +2)',
    '=Index(Table({Value: 1}), 2)', '=Index([1], 2)', '=Index([], 2)',
    '=Index(Table(), 2)', '=Index(Table(otherRows), 2)',
    '=Index([1] & [2], 2)',
  ])('warns when the literal Index position is not proven safe: %s', formula => {
    expect(hits(fixture(`Text: ${formula}`), 'index-literal-position')).toHaveLength(1);
  });
  it.each([
    '=Index(rows, 1)', '=Index(rows, n)', '=Index(rows, ThisRecord.Value)',
    '=ForAll(Sequence(CountRows(rows)), Index(rows, Value))',
    '=Index(Table({Value: 1}, {Value: 2}), 2)', '=Index([1, 2], 2)',
    '=Index([1, 2, 3], 3)', '=Index(Table({Value: Sum(1, 2)}, {Value: 2}), 2)',
    '=record.Index(rows, 2)', '="Index(rows, 2)"', '=Index(rows, 2', '=Index(rows, 1 + 1)',
  ])('accepts safe literal tables and dynamic positions: %s', formula => {
    expect(hits(fixture(`Text: ${formula}`), 'index-literal-position')).toEqual([]);
  });
  it.each(['ModernText', 'Text'])('warns for short %s with literal or formula-literal sizes', type => {
    expect(hits(fixture('Height: =28\nSize: =20', type), 'modern-text-height-below-size')).toHaveLength(1);
    expect(hits(fixture('Height: 28\nSize: 20', type), 'modern-text-height-below-size')).toHaveLength(1);
  });
  it.each([
    'Height: =30\nSize: =20', 'Height: =32\nSize: =20\nPaddingTop: =1\nPaddingBottom: =1',
    'Height: =31\nSize: =20', 'Height: =20\nSize: =20\nAutoHeight: =true',
    'Height: =20\nSize: =20\nAutoHeight: true', 'Height: =Parent.Height\nSize: =20',
    'Height: =20\nSize: =varSize', 'Height: =20\nSize: =20\nPaddingTop: =varPadding',
    'Height: =20', 'Size: =20',
  ])('avoids a height claim with sufficient, automatic or unknown geometry: %s', properties => {
    expect(hits(fixture(properties), 'modern-text-height-below-size')).toEqual([]);
  });
  it('leaves classic labels outside the modern text rule', () => {
    expect(hits(fixture('Height: =28\nSize: =20', 'Label'), 'modern-text-height-below-size')).toEqual([]);
  });
  it('accepts an evidence-bearing current variant through the injected catalog', () => {
    const injected = {...catalog, augmentations: {...catalog.augmentations, Gallery: {
      current_variants: [{name: 'CurrentPreset', verified: true as const, verified_at: '2026-10-06', verified_by: 'compile_canvas' as const}],
    }}};
    const content = fixture('Height: =100', 'Gallery').replace('          Properties:', '          Variant: CurrentPreset\n          Properties:');
    const issues = validateFiles([{name: 'Home.pa.yaml', content}], injected).issues;
    expect(issues.filter(issue => issue.rule === 'unknown-variant' || issue.rule === 'partial-catalog-data')).toEqual([]);
  });
  it('warns when modern text is shorter than a padded line', () => {
    const issues = hits(fixture('Height: =31\nSize: =20\nPaddingTop: =1\nPaddingBottom: =1'), 'modern-text-height-below-size');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({level: 'WARN', property: 'Height'});
    expect(issues[0].detail).toContain('scrollbar');
  });
  it('warns about literal Index positions even on hidden controls', () => {
    const issues = hits(fixture('Text: =Index(rows, 2).Value\nVisible: =false'), 'index-literal-position');
    expect(issues).toHaveLength(1);
    expect(issues[0].level).toBe('WARN');
    expect(issues[0].detail).toContain('hidden controls still evaluate');
    expect(issues[0].fix).toContain('Last(FirstN(t, n))');
  });
  it('warns about a constant-or-variable equality in a delegated Filter disjunction', () => {
    const issues = hits(fixture('Text: =Filter(Src, "all" = varX || Col = varX)'), 'filter-constant-or-column');
    expect(issues).toHaveLength(1);
    expect(issues[0].level).toBe('WARN');
    expect(issues[0].detail).toContain("The left side of the 'Equal' operator must be a property of the entity");
    expect(issues[0].fix).toContain('If(varX = "all", Src, Filter(Src, Col = varX))');
  });
  it('warns for a direct gallery child inside a component definition', () => {
    const issues = hits(gallery(), 'select-parent-in-gallery');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({level: 'WARN', control: 'tap', property: 'OnSelect'});
    expect(issues[0].detail).toContain('component');
    expect(issues[0].fix).toContain('OnSelect');
  });
});
