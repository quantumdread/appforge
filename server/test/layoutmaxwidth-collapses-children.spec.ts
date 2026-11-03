import { describe, expect, it } from 'vitest';
import { validateFiles } from '../src/core/analyzer';
import { ANALYZER_CATALOG_DATA } from '../src/lib/catalog-data';

const RULE = 'layoutmaxwidth-collapses-children';
type Fixture = {
  parentVariant?: string;
  groupVariant?: string;
  groupProperties?: string;
  width?: string;
  children?: string;
  groupType?: string;
};
const fixture = ({ parentVariant = 'AutoLayout', groupVariant = 'ManualLayout',
  groupProperties = 'LayoutMaxWidth: =600', width = '=Parent.Width - 16',
  groupType = 'GroupContainer', children }: Fixture = {}) => `Screens:
  Home:
    Children:
      - outer:
          Control: GroupContainer
          Variant: ${parentVariant}
          Properties:
            LayoutDirection: =LayoutDirection.Vertical
          Children:
            - card:
                Control: ${groupType}
${groupVariant ? `                Variant: ${groupVariant}\n` : ''}                Properties:
${groupProperties.split('\n').map(line => `                  ${line}`).join('\n')}
                Children:
${children ?? `                  - caption:
                      Control: Label
                      Properties:
                        Width: |-
${width.split('\n').map(line => `                          ${line}`).join('\n')}
                        Text: ="Caption"
                        Wrap: =false`}
`;

function findings(content: string, lintProfile: 'worker' | 'cli' = 'worker') {
  return validateFiles([{ name: 'Home.pa.yaml', content }], ANALYZER_CATALOG_DATA, { lintProfile })
    .issues.filter(issue => issue.rule === RULE);
}

describe('layoutmaxwidth-collapses-children J2 acceptance', () => {
  it.each(['worker', 'cli'] as const)('warns at the manual group cap in the %s profile', profile => {
    const issues = findings(fixture(), profile);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ level: 'WARN', file: 'Home.pa.yaml', control: 'card',
      type: 'GroupContainer', property: 'LayoutMaxWidth', line: 14 });
    expect(issues[0].detail).toContain('Parent.Width');
    expect(issues[0].detail).toContain('caption');
    expect(issues[0].detail).toContain('AutoLayout');
  });
  it('ships the same WARN through the generated CLI artifact', async () => {
    const { validateCliFiles } = await import('../../cli/dist/analyzer-core.mjs');
    const [report] = validateCliFiles([{ name: 'Home.pa.yaml', content: fixture() }]);
    expect(report.issues.filter((issue: { rule?: string }) => issue.rule === RULE)).toHaveLength(1);
  });
  it.each([
    ['AutoLayout variant', { groupVariant: 'AutoLayout' }],
    ['LayoutDirection', { groupProperties: 'LayoutMaxWidth: =600\nLayoutDirection: =LayoutDirection.Vertical' }],
    ['LayoutMode.Auto', { groupProperties: 'LayoutMaxWidth: =600\nLayoutMode: =LayoutMode.Auto' }],
    ['quoted Auto mode', { groupProperties: 'LayoutMaxWidth: =600\nLayoutMode: ="Auto"' }],
    ['manual parent', { parentVariant: 'ManualLayout' }],
    ['no cap', { groupProperties: 'Width: =600' }],
    ['different control type', { groupType: 'Gallery', groupVariant: 'Vertical' }],
  ] satisfies [string, Fixture][])('is silent for %s', (_name, options) => {
    expect(findings(fixture(options))).toEqual([]);
  });
  it('accepts a manual group with no explicit variant', () => {
    expect(findings(fixture({ groupVariant: '' }))).toHaveLength(1);
  });
  it('accepts explicit manual LayoutMode', () => {
    expect(findings(fixture({ groupProperties: 'LayoutMaxWidth: =600\nLayoutMode: =LayoutMode.Manual' }))).toHaveLength(1);
  });
  it.each([
    '=parent . width / 2',
    "='Parent'.'Width' - 8",
    '=Max(100, Parent.Width - 20)',
    '=Parent /* spacing */ . Width',
    '=With({size: Parent.Width}, size)',
    '=With({size: 10}, Parent.Width - size)',
  ])('detects the complete width reference %s', width => {
    expect(findings(fixture({ width }))).toHaveLength(1);
  });
  it.each([
    '=100', '=Self.Width', '=Parent.Height', '=OtherParent.Width', '=Parent.WidthExtra',
    '="Parent.Width"', '=100 /* Parent.Width */', '=100 // Parent.Width',
    '=record.Parent.Width', '=If(true, Parent.Width',
    '=$"{Parent.Width}"', '=With({Parent: {Width: 100}}, Parent.Width)',
    '=With(record, Parent.Width)',
  ])('is silent without a complete unshadowed parent width reference: %s', width => {
    expect(findings(fixture({ width }))).toEqual([]);
  });
  it('does not treat a descendant reference as a direct child reference', () => {
    const children = `                  - nested:
                      Control: GroupContainer
                      Variant: ManualLayout
                      Properties:
                        Width: =100
                      Children:
                        - descendant:
                            Control: Label
                            Properties:
                              Width: =Parent.Width`;
    expect(findings(fixture({ children }))).toEqual([]);
  });
  it('emits one finding for the group even when multiple children depend on its width', () => {
    const children = ['first', 'second'].map(name => `                  - ${name}:
                      Control: Label
                      Properties:
                        Width: =Parent.Width`).join('\n');
    const issues = findings(fixture({ children }));
    expect(issues).toHaveLength(1);
    expect(issues[0].detail).toContain('first, second');
  });
});
