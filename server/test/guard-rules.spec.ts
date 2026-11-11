import { describe, expect, it } from 'vitest';
import { validateFiles } from '../src/core/analyzer';
import { ANALYZER_CATALOG_DATA as catalog } from '../src/lib/catalog-data';

// v3.19: two field-report WARNs from a live dashboard build (2026-11-11).
const fixture = (properties: string, type = 'ModernText') => `Screens:
  Home:
    Children:
      - reader:
          Control: ${type}
          Properties:
${properties.split('\n').map(line => `            ${line}`).join('\n')}
`;
const hits = (content: string, rule: string, profile: 'worker' | 'cli' = 'worker') =>
  validateFiles([{name: 'Home.pa.yaml', content}], catalog, {lintProfile: profile})
    .issues.filter(issue => issue.rule === rule);

describe('zero-guard-misses-blank', () => {
  it.each([
    '=If(varTotal = 0, 0, varPresent / varTotal)',
    '=If(varTotal <> 0, varPresent / varTotal, 0)',
    '=If(0 = varTotal, 0, varPresent / varTotal)',
    '=If(colStats.Total = 0, 0, Round(colStats.Present / colStats.Total * 100, 0))',
    '=With({t: varTotal}, If(t = 0, 0, 72 / t))',
  ])('warns when a zero comparison is the only guard: %s', formula => {
    const issues = hits(fixture(`Text: ${formula}`), 'zero-guard-misses-blank');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({level: 'WARN', property: 'Text'});
    expect(issues[0].detail).toContain('blank');
  });
  it.each([
    '=If(varTotal > 0, varPresent / varTotal, 0)',
    '=If(Coalesce(varTotal, 0) = 0, 0, varPresent / varTotal)',
    '=If(IsBlank(varTotal) || varTotal = 0, 0, varPresent / varTotal)',
    '=IfError(varPresent / varTotal, 0)',
    '=varPresent / varTotal',
    '=If(varOther = 0, 0, varPresent / varTotal)',
    '=If(varTotal = 0, 0, varPresent / 2)',
    '="If(varTotal = 0, 0, a / varTotal)"',
    '=If(varTotal = 0.5, 0, varPresent / varTotal)',
    '=If(Sum(rows, n) = 0, 0, varPresent / Sum(rows, n))',
  ])('stays silent when blank is handled or nothing is zero-guarded: %s', formula => {
    expect(hits(fixture(`Text: ${formula}`), 'zero-guard-misses-blank')).toEqual([]);
  });
  it('runs in the CLI profile too', () => {
    expect(hits(fixture('Text: =If(varTotal = 0, 0, varPresent / varTotal)'), 'zero-guard-misses-blank', 'cli')).toHaveLength(1);
  });
});

describe('modern-text-width-below-text', () => {
  it.each(['ModernText', 'Text'])('warns when literal text cannot fit one line of %s', type => {
    const issues = hits(fixture('Text: ="Attendance"\nSize: =28\nWidth: =100\nHeight: =48', type), 'modern-text-width-below-text');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({level: 'WARN', property: 'Width'});
    expect(issues[0].detail).toContain('scrollbar');
  });
  it('counts horizontal padding', () => {
    expect(hits(fixture('Text: ="2000"\nSize: =40\nWidth: =100\nHeight: =60\nPaddingLeft: =15\nPaddingRight: =15'), 'modern-text-width-below-text')).toHaveLength(1);
    expect(hits(fixture('Text: ="2000"\nSize: =40\nWidth: =100\nHeight: =60'), 'modern-text-width-below-text')).toEqual([]);
  });
  it.each([
    'Text: ="Attendance"\nSize: =28\nWidth: =200\nHeight: =48',
    'Text: ="Attendance"\nSize: =28\nWidth: =100\nHeight: =100',
    'Text: ="Attendance"\nSize: =28\nWidth: =100\nHeight: =48\nAutoHeight: =true',
    'Text: =varTitle\nSize: =28\nWidth: =100\nHeight: =48',
    'Text: ="Attendance"\nSize: =28\nWidth: =Parent.Width\nHeight: =48',
    'Text: ="Attendance"\nSize: =28\nWidth: =100',
    'Text: ="Attendance"\nWidth: =100\nHeight: =48',
  ])('stays silent with room, wrapping space or unknown geometry: %s', properties => {
    expect(hits(fixture(properties), 'modern-text-width-below-text')).toEqual([]);
  });
  it('leaves classic labels alone', () => {
    expect(hits(fixture('Text: ="Attendance"\nSize: =28\nWidth: =100\nHeight: =48', 'Label'), 'modern-text-width-below-text')).toEqual([]);
  });
  it('stays silent inside auto-layout unless a horizontal parent fixes the width', () => {
    const inContainer = (direction: string, fill: string) => `Screens:
  Home:
    Children:
      - box:
          Control: GroupContainer
          Variant: AutoLayout
          Properties:
            LayoutDirection: =LayoutDirection.${direction}
          Children:
            - reader:
                Control: ModernText
                Properties:
                  Text: ="Attendance"
                  Size: =28
                  Width: =100
                  Height: =48
${fill ? `                  FillPortions: ${fill}\n` : ''}`;
    expect(hits(inContainer('Vertical', '=0'), 'modern-text-width-below-text')).toEqual([]);
    expect(hits(inContainer('Horizontal', ''), 'modern-text-width-below-text')).toEqual([]);
    expect(hits(inContainer('Horizontal', '=0'), 'modern-text-width-below-text')).toHaveLength(1);
  });
});
