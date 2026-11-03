import { describe, expect, it } from 'vitest';
import { validateFiles } from '../src/core/analyzer';
import { ANALYZER_CATALOG_DATA } from '../src/lib/catalog-data';

const fixture = (childProps = 'Text: ="Example"', parentProps = '', type = 'ModernText', variant = '') => `Screens:
  Home:
    Children:
      - outer:
          Control: GroupContainer
          Variant: AutoLayout
          Properties:
            LayoutDirection: =LayoutDirection.Vertical
${parentProps.split('\n').filter(Boolean).map(p => '            '+p).join('\n')}
          Children:
            - child:
                Control: ${type}
${variant ? '                Variant: '+variant+'\n' : ''}                Properties:
${childProps.split('\n').map(p => '                  '+p).join('\n')}
`;
const findings = (content: string, rule: string, lintProfile: 'worker' | 'cli' = 'worker') =>
  validateFiles([{ name: 'Home.pa.yaml', content }], ANALYZER_CATALOG_DATA, { lintProfile })
    .issues.filter(i => i.rule === rule);

describe('J3 design calibration', () => {
  it('retains advice when neither alignment level is authored', () => {
    const issues = findings(fixture(), 'missing-align-in-container');
    expect(issues).toHaveLength(1);
    expect(issues[0].detail).toContain("parent 'outer' has no LayoutAlignItems");
  });
  it.each(['=LayoutAlignItems.Stretch', '=If(App.Width < 640, LayoutAlignItems.Start, LayoutAlignItems.Center)'])(
    'accepts the explicit parent alignment %s', alignment => {
      expect(findings(fixture('Text: ="Example"', `LayoutAlignItems: ${alignment}`), 'missing-align-in-container')).toEqual([]);
    });
  it('accepts explicit child alignment without parent alignment', () => {
    expect(findings(fixture('AlignInContainer: =AlignInContainer.Start'), 'missing-align-in-container')).toEqual([]);
  });
  it('accepts explicit alignment inherited from the direct parent', () => {
    expect(findings(fixture('Text: ="Example"', 'LayoutAlignItems: =LayoutAlignItems.Center'),
      'missing-align-in-container')).toEqual([]);
  });
  it('skips fixed main-axis sizing when the other size responds to Parent.Width', () => {
    expect(findings(fixture('FillPortions: =1\nHeight: =100\nWidth: =If(Parent.Width < 640, 200, 400)'),
      'fillportions-with-fixed-size')).toEqual([]);
  });
  it.each([
    '=If(App.Width < 640, 200, 400)', '=If(parent . width < 640, 200, 400)',
    "=If('App'.'Width' < 640, 200, 400)", '=Switch(App.Width, 640, 200, 400)',
    '=If(If(App.Width < 640, true, false), 200, 400)',
    '=If(App /* guard */ . Width < 640, 200, 400)',
  ])('recognizes width-dependent size branches: %s', width => {
    expect(findings(fixture(`FillPortions: =1\nHeight: =100\nWidth: ${width}`), 'fillportions-with-fixed-size')).toEqual([]);
  });
  it.each([
    '=If(varCompact, 200, 400)', '=If(App.Height < 640, 200, 400)',
    '=If(true, App.Width, 400)', '=App.Width', '=If(Other.Width < 640, 200, 400)',
    '=If(true, 200, 400) /* App.Width */', '=If("App.Width" = "x", 200, 400)',
    '=record.If(App.Width, 200, 400)', '=If(App.Width < 640, 200',
    '=With({App: {Width: 100}}, If(App.Width < 640, 200, 400))',
  ])('retains static-axis advice without an unshadowed width guard: %s', width => {
    expect(findings(fixture(`FillPortions: =1\nHeight: =100\nWidth: ${width}`), 'fillportions-with-fixed-size')).toHaveLength(1);
  });
  it('treats a zero main-axis size as flex-owned (Microsoft template idiom), not a fixed size', () => {
    expect(findings(fixture('FillPortions: =1\nHeight: =0'), 'fillportions-with-fixed-size')).toEqual([]);
    expect(findings(fixture('FillPortions: =1\nHeight: =100'), 'fillportions-with-fixed-size')).toHaveLength(1);
  });
  it.each([
    'FillPortions: =If(App.Width < 640, 1, 0)\nHeight: =100',
    'FillPortions: =1\nHeight: =If(Parent.Width < 640, 100, 200)',
    'FillPortions: =If(Parent.Width < 640, 1, 0)\nHeight: =If(Parent.Width < 640, 100, 200)',
  ])('keeps responsive flex/main-axis sizing silent: %s', props => {
    expect(findings(fixture(props), 'fillportions-with-fixed-size')).toEqual([]);
  });
  it.each(['worker', 'cli'] as const)('asks about manual group stretching without an edit in %s', profile => {
    const issues = findings(fixture('Height: =100', '', 'GroupContainer', 'ManualLayout'),
      'manual-group-may-stretch', profile);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ level: 'WARN', control: 'child' });
    expect(issues[0].detail).toContain('is this group meant to stretch?');
    expect(issues[0]).not.toHaveProperty('fix');
  });
  it.each(['=0', '=1', '=varFill', '=If(App.Width < 640, 0, 1)'])(
    'respects an explicit FillPortions even when it is %s', value => {
      expect(findings(fixture(`Height: =100\nFillPortions: ${value}`, '', 'GroupContainer', 'ManualLayout'), 'manual-group-may-stretch')).toEqual([]);
    });
  it.each(['GridLayout', 'AutoLayout'])('excludes the %s variant', variant => {
    expect(findings(fixture('Height: =100', '', 'GroupContainer', variant), 'manual-group-may-stretch')).toEqual([]);
  });
  it.each(['=LayoutMode.Auto', '=LayoutMode.Grid', '=varMode'])(
    'excludes nonmanual or unresolved LayoutMode %s', mode => {
      expect(findings(fixture(`Height: =100\nLayoutMode: ${mode}`, '', 'GroupContainer'), 'manual-group-may-stretch')).toEqual([]);
    });
  it('excludes a horizontal or unresolved parent direction', () => {
    for (const direction of ['=LayoutDirection.Horizontal', '=If(App.Width < 640, LayoutDirection.Vertical, LayoutDirection.Horizontal)']) {
      expect(findings(fixture('Height: =100', '', 'GroupContainer', 'ManualLayout')
        .replace('=LayoutDirection.Vertical', direction), 'manual-group-may-stretch')).toEqual([]);
    }
  });
  it('accepts an omitted manual variant and does not require an authored Height', () => {
    expect(findings(fixture('Width: =100', '', 'GroupContainer'), 'manual-group-may-stretch')).toHaveLength(1);
  });
  it('excludes other child control types and children that declare layout direction', () => {
    expect(findings(fixture('Height: =100'), 'manual-group-may-stretch')).toEqual([]);
    expect(findings(fixture('LayoutDirection: =LayoutDirection.Vertical', '', 'GroupContainer'), 'manual-group-may-stretch')).toEqual([]);
  });
  it.each(['worker', 'cli'] as const)('aggregates version pins across app files at the first occurrence in %s', profile => {
    const files = [
      { name: 'first.pa.yaml', content: '- first:\n    Control: ModernText@1.0\n- second:\n    Control: ModernText@1.0\n' },
      { name: 'other.pa.yaml', content: '- third:\n    Control: ModernText@1.0\n' },
    ];
    const issues = validateFiles(files, ANALYZER_CATALOG_DATA, { lintProfile: profile }).issues
      .filter(i => i.rule === 'version-pin-in-control-type');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ file: 'first.pa.yaml', line: 1, control: 'first',
      controls: ['first', 'second', 'third'] });
    expect(issues[0].detail).toContain('3 control type(s)');
    expect(issues[0].detail).toContain('first.pa.yaml, other.pa.yaml');
  });
  it('is silent when an app has no authored version pins', () => {
    expect(findings(fixture(), 'version-pin-in-control-type')).toEqual([]);
  });
});
