import { describe, expect, it } from 'vitest';
import { modernize, modernizeSummary } from '../src/core/modernize';
import { applyRenames, renderRenameReport } from '../src/core/rename';
import { buildAppBundle } from '../src/core/analyzer';
import { controlNodes } from '../src/core/model';
import { ANALYZER_CATALOG_DATA as catalog } from '../src/lib/catalog-data';

const file = (props: string, type = 'Label') => [{ name: 'Home.pa.yaml', content:
  `Screens:\n  Home:\n    Children:\n      - label:\n          Control: ${type}\n          Properties:\n${props}` }];
const props = (text: string) => text.split('\n').map(line => '            ' + line).join('\n') + '\n';
const parsed = (content: string) => controlNodes(buildAppBundle([{ name: 'Home.pa.yaml', content }]));
const row = (direction: string, height: string, label = 'Size: =14\nHeight: =20') => [{ name: 'Home.pa.yaml', content:
  `Screens:\n  Home:\n    Children:\n      - row:\n          Control: GroupContainer\n          Variant: AutoLayout\n          Properties:\n            LayoutDirection: =LayoutDirection.${direction}\n            Height: ${height}\n          Children:\n            - label:\n                Control: Label\n                Properties:\n${label.split('\n').map(line => '                  ' + line).join('\n')}\n` }];

describe('M7e-1 additions', () => {
  it.each(['Text: ="Ready"', 'Text: |-\n  ="Ready"', 'Text: "=\\\"Ready\\\""'])('adds missing properties after the final scalar: %s', text => {
    const result = modernize(file(props(text)), catalog);
    const node = parsed(result.files[0].content)[0];
    expect(Object.fromEntries(node.properties.map(p => [p.name, p.value]))).toMatchObject({
      Text: '="Ready"', PaddingTop: '=0', PaddingBottom: '=0', VerticalAlign: '=VerticalAlign.Middle',
    });
    expect(result.report.converted[0].properties.filter(p => p.action === 'added')).toHaveLength(3);
    expect(result.report.self_check.regression).toBe(false);
  });
  it('preserves authored padding and vertical alignment', () => {
    const result = modernize(file(props('PaddingTop: =2\nPaddingBottom: =3\nVerticalAlign: =VerticalAlign.Bottom')), catalog);
    expect(result.report.converted[0].properties.filter(p => p.action === 'added')).toEqual([]);
    expect(result.files[0].content).toContain('PaddingTop: =2');
    expect(result.files[0].content).toContain('VerticalAlign: =VerticalAlign.Bottom');
  });
  it('creates a missing Properties section without attaching additions to a sibling', () => {
    const input = file(props('Text: ="Ready"'));
    input[0].content = input[0].content.replace('          Properties:\n            Text: ="Ready"\n', '')
      + '      - sibling:\n          Control: ModernText\n          Properties:\n            Text: ="Keep"\n';
    const result = modernize(input, catalog);
    const nodes = parsed(result.files[0].content);
    expect(nodes[0].properties.map(p => p.name)).toEqual(['PaddingTop', 'PaddingBottom', 'VerticalAlign']);
    expect(nodes[1].properties.map(p => p.name)).toEqual(['Text']);
    expect(result.report.self_check.regression).toBe(false);
  });
});

describe('M7e-1 catalog additions', () => {
  it('parses and gates additions, and rejects an unknown target property', async () => {
    const modulePath = '../scripts/lib/modernization-catalog.mjs';
    const { parseModernization, validateModernization } = await import(modulePath);
    const source = `schema_version: 1
last_reviewed: 2026-10-08
modernization:
  Label:
    target: ModernText
    add:
      - property: PaddingTop
        value: "=0"
        basis: field-report-2026-10-08#2
    properties:
      Text: same
    references:
      Text: Text
    verified: false
`;
    const data = {
      manifestControls: [{ type: 'Label', family: 'Classic' }, { type: 'ModernText', family: 'React' }],
      controlProperties: { Label: { input_properties: { Text: 'Text' } }, ModernText: { input_properties: { Text: 'Text', PaddingTop: 'Number' } } },
    };
    const map = parseModernization(source);
    expect(map.modernization.Label.add).toEqual([{ property: 'PaddingTop', value: '=0', basis: 'field-report-2026-10-08#2' }]);
    expect(() => validateModernization(map, data)).not.toThrow();
    expect(() => validateModernization(parseModernization(source.replace('property: PaddingTop', 'property: Unknown')), data)).toThrow(/target input property 'Unknown'/);
  });
});

describe('M7e-1 text heights and integer sizes', () => {
  it.each([['Vertical', '=100', '=109'], ['Horizontal', '=24', '=29']])('grows the %s parent and records every edit', (direction, height, expected) => {
    const result = modernize(row(direction, height), catalog);
    const nodes = parsed(result.files[0].content);
    expect(nodes[0].properties.find(p => p.name === 'Height')?.value).toBe(expected);
    expect(Object.fromEntries(nodes[1].properties.map(p => [p.name, p.value]))).toMatchObject({ Size: '=19', Height: '=29' });
    expect(result.report.converted[0].layout_edits).toEqual([expect.objectContaining({ control: 'row', property: 'Height', before: height, after: expected })]);
    expect(result.report.converted[0].properties.find(p => p.property === 'Height')).toMatchObject({ action: 'transformed', before: '=20', after: '=29' });
  });
  it('stops at a formula-height parent', () => {
    const result = modernize(row('Vertical', '=Parent.Height'), catalog);
    expect(result.files[0].content).toContain('Height: =Parent.Height');
    expect(result.report.converted[0].layout_edits).toEqual([]);
  });
  it.each([['=50', '=45.5'], ['=Parent.Y + 50', '=(Parent.Y + 50) - 4.5']])('grows around the manual-layout centre for Y %s', (y, expected) => {
    const result = modernize(file(props('Size: =14\nHeight: =20\nY: ' + y)), catalog);
    expect(result.files[0].content).toContain('Y: ' + expected);
    expect(result.report.converted[0].properties.find(p => p.property === 'Y')).toMatchObject({ action: 'transformed', before: y, after: expected });
  });
  it('counts authored padding in the required height', () => {
    const result = modernize(file(props('Size: =14\nHeight: =20\nPaddingTop: =2\nPaddingBottom: =3')), catalog);
    expect(result.files[0].content).toContain('Height: =34');
  });
  it('opens an unsized label naming the fixed horizontal row without editing row height', () => {
    const result = modernize(row('Horizontal', '=24', 'Size: =14'), catalog);
    expect(result.files[0].content).toContain('Height: =24');
    expect(result.report.converted[0].open_items).toEqual([expect.objectContaining({ property: 'Height', reason: expect.stringContaining('row') })]);
  });
  it('keeps bare modern sizes unscaled', () => {
    const result = modernize(file(props('FontSize: =14\nText: ="Go"'), 'Button'), catalog);
    expect(result.files[0].content).toContain('Size: =14');
  });
  it('accumulates vertical sibling growth through numeric ancestors', () => {
    const input = row('Vertical', '=100');
    input[0].content += '            - second:\n                Control: Label\n                Properties:\n                  Size: =14\n                  Height: =20\n';
    input[0].content = input[0].content.replace('      - row:', '      - outer:\n          Control: GroupContainer\n          Variant: AutoLayout\n          Properties:\n            LayoutDirection: =LayoutDirection.Vertical\n            Height: =200\n          Children:\n            - row:');
    const lines = input[0].content.split('\n');
    const rowIndex = lines.findIndex(line => line.includes('- row:'));
    input[0].content = lines.map((line, i) => i > rowIndex && line ? '      ' + line : line).join('\n');
    const result = modernize(input, catalog);
    const nodes = parsed(result.files[0].content);
    expect(nodes.find(n => n.name === 'row')?.properties.find(p => p.name === 'Height')?.value).toBe('=118');
    expect(nodes.find(n => n.name === 'outer')?.properties.find(p => p.name === 'Height')?.value).toBe('=218');
    expect(result.report.converted.map(r => r.layout_edits.length)).toEqual([2, 2]);
    expect(result.report.converted[1].layout_edits[0]).toMatchObject({ control: 'row', before: '=109', after: '=118' });
  });
  it('wraps multiline formula Y and preserves literal formula heights', () => {
    const result = modernize(file(props('Size: =14\nHeight: =20\nY: |-\n  =Parent.Y +\n    50')), catalog);
    expect(result.files[0].content).toContain('=(Parent.Y +\n                50) - 4.5');
    const formulaHeight = modernize(file(props('Size: =14\nHeight: =Parent.Height\nY: =50')), catalog);
    expect(formulaHeight.files[0].content).toContain('Height: =Parent.Height\n            Y: =50');
  });
});

describe('M7e-1 conditional drops and never-convert guards', () => {
  it('drops TabIndex cosmetically without OnSelect, and retains manual review with it', () => {
    const plain = modernize(file(props('TabIndex: =0')), catalog);
    expect(plain.report.converted[0].properties[0]).toMatchObject({ action: 'dropped', impact: 'cosmetic', reason: expect.any(String) });
    expect(plain.report.summary.open_items).toBe(0);
    const input = file(props('TabIndex: =0\nOnSelect: =Back()'));
    expect(modernize(input, catalog).report.summary.converted).toBe(0);
    const reviewed = modernize(input, catalog, { include_review: true });
    expect(reviewed.files[0].content).not.toContain('TabIndex:');
    expect(reviewed.report.converted[0].open_items[0]).toMatchObject({ property: 'TabIndex' });
  });
  it.each([false, true])('always skips filled buttons and overlays with include_review=%s', include_review => {
    for (const text of ['Text: =""', 'Text: ', '']) {
      const input = file(props(text + '\nFill: =RGBA(0,0,0,0)'), 'Classic/Button');
      const result = modernize(input, catalog, { include_review });
      expect(result.files).toEqual(input);
      expect(result.report.skipped[0].reason).toBe('Tap overlay: use the parent gallery or container OnSelect instead of a button.');
    }
    const filled = modernize(file(props('Text: ="Go"\nFill: =Color.Red'), 'Classic/Button'), catalog, { include_review });
    expect(filled.report.skipped[0].reason).toBe('ModernButton has no Fill; Fluent derives its own shades, so custom fills and pills render differently. Keep Classic/Button.');
    expect(modernize(file(props('Text: ="Go"'), 'Classic/Button'), catalog, { include_review }).report.summary.converted).toBe(1);
  });
  it('parses and gates conditions, rejecting invalid predicates and source properties', async () => {
    const modulePath = '../scripts/lib/modernization-catalog.mjs';
    const { parseModernization, validateModernization } = await import(modulePath);
    const source = `schema_version: 1
last_reviewed: 2026-10-08
modernization:
  Label:
    target: ModernText
    never_convert_when:
      - property: Text
        condition: empty
        reason: "Keep overlays."
        basis: field-report-2026-10-08#11
    properties:
      Text: same
      TabIndex:
        drop: "Focus override lost."
        impact: cosmetic
        unless_present: [OnSelect]
        fallback_manual: "Review focus traversal."
        basis: field-report-2026-10-08#8
      OnSelect: same
    references:
      Text: Text
    verified: false
`;
    const data = {
      manifestControls: [{ type: 'Label', family: 'Classic' }, { type: 'ModernText', family: 'React' }],
      controlProperties: { Label: { input_properties: { Text: 'Text', TabIndex: 'Number', OnSelect: 'Behavior' } }, ModernText: { input_properties: { Text: 'Text', OnSelect: 'Behavior' } } },
    };
    expect(() => validateModernization(parseModernization(source), data)).not.toThrow();
    expect(() => parseModernization(source.replace('condition: empty', 'condition: unknown'))).toThrow(/condition/);
    expect(() => validateModernization(parseModernization(source.replace('[OnSelect]', '[Unknown]')), data)).toThrow(/source input/);
    expect(() => validateModernization(parseModernization(source.replace('property: Text', 'property: Unknown')), data)).toThrow(/source input/);
    expect(() => parseModernization(source.replace('        fallback_manual: "Review focus traversal."\n', ''))).toThrow(/fallback_manual/);
  });
});

describe('M7e-1 warnings', () => {
  it('shows the reorder notice in summaries after a conversion', () => {
    const result = modernize(file(props('Text: ="Ready"')), catalog);
    expect(modernizeSummary(result.report)).toContain('Type changes are re-inserted by the server and can move to the end of their container. After compiling, save in Studio, sync and run compare_child_order.');
  });
  it.each(['Filter(rows, label.Text = "label")', 'LookUp(rows, Name = label.Text)', 'With(record, label.Text)', 'ForAll(rows, label.Text)'])('renames unique control reads in %s with a warning', formula => {
    const result = applyRenames(file(props('Text: =' + formula)), catalog, { label: 'lblTitle' });
    expect(result.files[0].content).toContain(formula.replace('label.Text', 'lblTitle.Text'));
    expect(result.report.warnings).toEqual([expect.objectContaining({ file: 'Home.pa.yaml', line: 7, identifier: 'label', reason: 'row field with the same name would shadow this control' })]);
    expect(renderRenameReport(result.report)).toContain('row field with the same name would shadow this control');
    expect(result.report.self_check.regression).toBe(false);
  });
  it('retains explicit With locals, As aliases and names with no control', () => {
    const result = applyRenames(file(props('Text: =With({label: "local"}, label) & ForAll(rows As label, label.Name) & Filter(rows, OtherField)')), catalog, { label: 'lblTitle' });
    expect(result.files[0].content).toContain('With({label: "local"}, label) & ForAll(rows As label, label.Name) & Filter(rows, OtherField)');
    expect(result.report.warnings).toEqual([]);
  });
  it('locates a warning on the actual block-scalar reference line', () => {
    const result = applyRenames(file(props('Text: |-\n  =Filter(rows,\n    label.Text = Name)')), catalog, { label: 'lblTitle' });
    expect(result.report.warnings[0]).toMatchObject({ file: 'Home.pa.yaml', line: 9, identifier: 'label' });
  });
});
