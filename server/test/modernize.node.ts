import { describe, expect, it } from 'vitest';
import { modernize } from '../src/core/modernize';
import { ANALYZER_CATALOG_DATA as catalog } from '../src/lib/catalog-data';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const app = (type = 'Label', properties = '            Text: ="Ready"\n', name = 'txtX') =>
  `# keep this comment\nScreens:\n  Home:\n    Children:\n      - ${name}:\n          Control: ${type}\n          Properties:\n${properties}`;
const files = (content: string) => [{ name: 'Home.pa.yaml', content }];
const labelAdditions = '            PaddingTop: =0\n            PaddingBottom: =0\n            VerticalAlign: =VerticalAlign.Middle\n';

describe('modernize complete app files', () => {
  it('converts a mechanical Label and leaves every other byte intact', () => {
    const content = app('Label@2.5.1', '            Text: |-\n              ="Ready"\n            Size: =14 # retained\n');
    const input = files(content);
    const result = modernize(input, catalog);
    expect(result.files).toEqual(files(content.replace('Label@2.5.1', 'ModernText').replace('Size: =14 #', 'Size: =19 #') + labelAdditions));
    expect(input).toEqual(files(content));
    expect(result.report.converted[0]).toMatchObject({ source_type: 'Label', target_type: 'ModernText', properties: expect.arrayContaining([expect.objectContaining({ property: 'Text', action: 'kept' }), expect.objectContaining({ property: 'Size', action: 'transformed', after: '=19' })]) });
    expect(result.report.self_check.new_refusals).toEqual([]);
    expect(result.report.self_check.output.summary.refuse).toBe(0);
    expect(result.report.caveat).toContain('verified: false');
  });
});

 it('renames enum properties, transforms only exact matches and reports computed formulas', () => {
   const exact = modernize(files(app('Classic/TextInput', '            Mode: =TextMode.MultiLine # keep\n')), catalog);
   expect(exact.files[0].content).toContain('Type: =TextInputType.Multiline # keep');
   expect(exact.report.converted[0].properties[0]).toMatchObject({ property: 'Mode', target_property: 'Type', action: 'transformed' });
   const formula = modernize(files(app('Classic/TextInput', '            Mode: =If(flag, TextMode.MultiLine, TextMode.SingleLine)\n')), catalog);
   expect(formula.files[0].content).toContain('Type: =If(flag, TextMode.MultiLine, TextMode.SingleLine)');
   expect(formula.report.converted[0].open_items[0].reason).toContain('exact');
 });

 it('scales only numeric literals from the injected map and reports formulas', () => {
   const scaled = { ...catalog, modernization: { ...catalog.modernization,
     Label: { ...catalog.modernization!.Label, properties: { ...catalog.modernization!.Label.properties, Size: { to: 'Size', scale: '4/3', basis: 'inferred' as const } } } } };
   const literal = modernize(files(app('Label', '            Size: =12 # size\n')), scaled);
   expect(literal.files[0].content).toContain('Size: =16 # size');
   const formula = modernize(files(app('Label', '            Size: =Parent.Height / 2\n')), scaled);
   expect(formula.files[0].content).toContain('Size: =Parent.Height / 2');
   expect(formula.report.summary.open_items).toBe(1);
 });

 it('removes a cosmetic block scalar completely and reports its impact and reason', () => {
   const result = modernize(files(app('Label', '            DisabledColor: |-\n              =RGBA(\n                1, 2, 3, 1)\n            # keep sibling comment\n            Text: ="OK"\n')), catalog);
   expect(result.files[0].content).toBe(app('ModernText', '            # keep sibling comment\n            Text: ="OK"\n' + labelAdditions));
   expect(result.report.converted[0].properties[0]).toMatchObject({ action: 'dropped', impact: 'cosmetic', after: null });
   expect(result.report.converted[0].properties[0].reason).toContain('appearance');
 });

 it('skips review controls by default and omits unsupported manual/behaviour properties with explicit open items', () => {
   const input = files(app('Classic/Toggle', '            OnChange: =Back()\n            Reset: =flag\n'));
   expect(modernize(input, catalog)).toMatchObject({ files: input, report: { summary: { converted: 0, skipped: 1 }, skipped: [{ reason: 'Needs review: OnChange, Reset.' }] } });
   const reviewed = modernize(input, catalog, { include_review: true });
   expect(reviewed.files[0].content).toBe(app('ModernToggle',''));
   expect(reviewed.report.converted[0].open_items.map(item => item.property)).toEqual(['OnChange', 'Reset']);
   expect(reviewed.report.self_check.regression).toBe(false);
   expect(reviewed.report.self_check.new_refusals).toEqual([]);
 });

 it('rewrites resolved cross-file reads, respecting literals, comments, chains and local bindings', () => {
   const mapped = { ...catalog, modernization: { ...catalog.modernization,
     'Classic/TextInput': { ...catalog.modernization!['Classic/TextInput'], references: { ...catalog.modernization!['Classic/TextInput'].references, Text: 'Value' } } } };
   const reader = app('ModernText', `            Text: |-
              =txtX.Text & "txtX.Text" & txtX.Text /* txtX.Text */ &
                With({txtX: {Text: "local"}}, txtX.Text) & record.txtX.Text
`, 'reader').replace('Home:', 'Other:');
   const result = modernize([...files(app('Classic/TextInput', '            Default: =""\n')), { name: 'Other.pa.yaml', content: reader }], mapped);
   expect(result.files[1].content).toBe(reader.replace('=txtX.Text', '=txtX.Value').replace('& txtX.Text /*', '& txtX.Value /*'));
   expect(result.report.summary.reference_rewrites).toBe(2);
   expect(result.report.converted[0].references[0]).toMatchObject({ file: 'Other.pa.yaml', control: 'reader', property: 'Text', before: 'txtX.Text', after: 'txtX.Value' });
 });

it('leaves null references unchanged and reports their locations', () => {
  const content = app('Classic/TextInput', '            Default: =""\n') + '      - reader:\n          Control: ModernText\n          Properties:\n            Text: =txtX.Tooltip\n';
  const result = modernize(files(content), catalog);
  expect(result.files[0].content).toContain('Text: =txtX.Tooltip');
  expect(result.report.converted[0].open_items).toEqual([expect.objectContaining({ control: 'reader', property: 'Text', reason: expect.stringContaining('(~)') })]);
});

it('intersects type and instance filters, including empty lists', () => {
  const input = files(app() + '      - other:\n          Control: Label\n      - check:\n          Control: Classic/CheckBox\n');
  const result = modernize(input, catalog, { types: ['Label'], controls: ['other', 'check'] });
  expect(result.report.converted.map(row => row.control)).toEqual(['other']);
  expect(result.report.skipped.map(row => row.reason)).toEqual(['Excluded by controls filter.', 'Excluded by types filter.']);
  expect(modernize(input, catalog, { controls: [] }).files).toEqual(input);
  expect(modernize(input, catalog, { types: [] }).files).toEqual(input);
});

it('uses the real current-generation TextInput.Text mapping unchanged', () => {
  const input = files(app('Classic/TextInput', '            Default: =""\n') + '      - reader:\n          Control: ModernText\n          Properties:\n            Text: =txtX.Text\n');
  const result = modernize(input, catalog);
  expect(result.files[0].content).toContain('Text: =txtX.Text');
  expect(result.report.summary.reference_rewrites).toBe(0);
});

it.each([
  '=With({txtX: {Value: true}}, txtX.Value)',
  '=ForAll(rows As txtX, txtX.Value)',
  '=Filter(rows, txtX.Value)',
  '=record.txtX.Value',
  '="txtX.Value" /* txtX.Value */',
  '=txtX.Value & (',
])('leaves unresolved or inert references untouched: %s', formula => {
  const input = files(app('Classic/CheckBox', '            Default: =true\n') + `      - reader:\n          Control: ModernText\n          Properties:\n            Text: ${formula}\n`);
  const result = modernize(input, catalog);
  expect(result.files[0].content).toContain(`Text: ${formula}`);
  expect(result.report.summary.reference_rewrites).toBe(0);
});

it('does not rewrite ambiguous duplicate instances or known variable names', () => {
  const input = files(app('Classic/CheckBox', '            Default: =true\n') + '      - reader:\n          Control: ModernText\n          Properties:\n            Text: =txtX.Value\n');
  const duplicate = { name: 'Other.pa.yaml', content: app('Classic/CheckBox', '', 'TXTX').replace('Home:', 'Other:') };
  expect(modernize([...input, duplicate], catalog).report.summary.reference_rewrites).toBe(0);
  const variable = { name: 'App.pa.yaml', content: 'App:\n  Properties:\n    OnStart: =Set(txtX, true)\n' };
  expect(modernize([...input, variable], catalog).report.summary.reference_rewrites).toBe(0);
});

it('rewrites quoted names and YAML scalars while preserving all original escaping', () => {
  const content = app('Classic/CheckBox', '            Default: =true\n') + `      - reader:
          Control: ModernText
          Properties:
            Text: "='TXTX'.'Value' & txtX.Value" # keep
            Tooltip: '=txtX.Value & ''txtX''.''Value'''
`;
  const result = modernize(files(content), catalog);
  expect(result.files[0].content).toContain(`Text: "='TXTX'.'Checked' & txtX.Checked" # keep`);
  expect(result.files[0].content).toContain(`Tooltip: '=txtX.Checked & ''txtX''.''Checked'''`);
  expect(result.report.summary.reference_rewrites).toBe(4);
});

it('rewrites App and Screen reads and opens omitted unsupported manual properties', () => {
  const content = app('Classic/CheckBox', '            Default: =true\n') + '      - toggle:\n          Control: Classic/Toggle\n          Properties:\n            OnChange: =Set(result, txtX.Value)\n';
  const other = 'App:\n  Properties:\n    OnStart: =Set(result, txtX.Value)\nScreens:\n  Other:\n    Properties:\n      OnVisible: =Set(result, txtX.Value)\n';
  const result = modernize([...files(content), { name: 'Other.pa.yaml', content: other }], catalog, { include_review: true });
  expect(result.files[1].content).toBe(other.replaceAll('txtX.Value', 'txtX.Checked'));
  expect(result.files[0].content).not.toContain('OnChange:');
  expect(result.report.converted.find(row=>row.control==='toggle')?.open_items).toEqual([expect.objectContaining({property:'OnChange'})]);
  expect(result.report.summary.reference_rewrites).toBe(2);
});

it('preserves CRLF and absence of final newline on untouched source', () => {
  const input = files(app().trimEnd().replaceAll('\n', '\r\n'));
  expect(modernize(input, catalog).files[0].content).toBe(input[0].content.replace('Label', 'ModernText') + '\r\n' + labelAdditions.trimEnd().replaceAll('\n', '\r\n'));
});

it('does not count an existing refusal again after a cosmetic drop moves lines', () => {
  const content = app('Label', '            DisabledColor: =Color.Red\n            Bogus: =1\n');
  const result = modernize(files(content), catalog);
  expect(result.report.self_check.input.summary.refuse).toBeGreaterThan(0);
  expect(result.report.self_check.new_refusals).toEqual([]);
});

it('retains duplicate-name refusals without calling changed diagnostic line numbers new', () => {
  const first = app('Label', '            DisabledColor: =Color.Red\n') + '      - duplicate:\n          Control: Label\n';
  const second = 'Screens:\n  Other:\n    Children:\n      - duplicate:\n          Control: Label\n';
  const result = modernize([...files(first), { name: 'Other.pa.yaml', content: second }], catalog);
  expect(result.report.self_check.input.summary.refuse).toBe(2);
  expect(result.report.self_check.output.summary.refuse).toBe(2);
  expect(result.report.self_check.new_refusals).toEqual([]);
});

const templates = resolve(__dirname, '../../knowledge/templates');
it('carries parent layout properties over without opening review items', () => {
  const content = `Screens:
Home:
  Children:
    - conRow:
        Control: GroupContainer
        Variant: AutoLayout
        Properties:
          LayoutDirection: =LayoutDirection.Horizontal
        Children:
          - lblCell:
              Control: Label
              Properties:
                AlignInContainer: =AlignInContainer.Center
                FillPortions: =1
                Text: ="Cell"
`;
  const result = modernize(files(content), catalog);
  const row = result.report.converted.find(entry => entry.control === 'lblCell');
  expect(row?.target_type).toBe('ModernText');
  expect(row?.open_items).toEqual([]);
  expect(result.files[0].content).toContain('AlignInContainer: =AlignInContainer.Center');
  expect(result.files[0].content).toContain('FillPortions: =1');
});

it.each(readdirSync(templates).filter(name => name.endsWith('.yaml')))('introduces no REFUSE in repository template %s', name => {
  const result = modernize([{ name, content: readFileSync(resolve(templates, name), 'utf8') }], catalog);
  expect(result.report.self_check.new_refusals).toEqual([]);
});

describe('M7d older modern generation', () => {
  it('keeps text Size and VerticalAlign while renaming color, weight and alignment', () => {
    const content = app('Text', '            Text: ="Ready"\n            FontColor: =Color.Red\n            Weight: ="Semibold"\n            Align: ="Center"\n            Size: =15\n            VerticalAlign: =VerticalAlign.Middle\n');
    const result = modernize(files(content), catalog);
    expect(result.files).toEqual(files(content.replace('Control: Text', 'Control: ModernText').replace('FontColor:', 'Color:').replace('Weight:', 'FontWeight:').replace('="Semibold"', '=FontWeight.Semibold').replace('="Center"', '=Align.Center')));
    expect(result.report.summary).toMatchObject({ converted: 1, open_items: 0 });
    expect(result.report.self_check.new_refusals).toEqual([]);
    expect(result.files[0].content).not.toContain('Select(Parent)');
  });
  it.each([['"Start"', 'Align.Left'], ['"End"', 'Align.Right'], ['"Justify"', 'Align.Justify']])('maps Text Align %s', (before, after) => {
    expect(modernize(files(app('Text', `            Align: =${before}\n`)), catalog).files[0].content).toContain(`Align: =${after}`);
  });
  it('uses Normal for Regular and keeps unsupported weight formulas as open items', () => {
    expect(modernize(files(app('Text', '            Weight: ="Regular"\n')), catalog).files[0].content).toContain('FontWeight: =FontWeight.Normal');
    const computed = modernize(files(app('Text', '            Weight: =If(flag, "Regular", "Semibold")\n')), catalog);
    expect(computed.report.summary.open_items).toBe(1);
    expect(computed.files[0].content).toContain('FontWeight: =If(flag, "Regular", "Semibold")');
  });
  it('skips TabList table defaults for manual First(...) review', () => {
    const input = files(app('TabList', '            Items: =Table({Value: "A"})\n            DefaultSelectedItems: =Table({Value: "A"})\n'));
    const result = modernize(input, catalog);
    expect(result.files).toEqual(input);
    expect(result.report.skipped[0].reason).toContain('DefaultSelectedItems');
    expect(catalog.modernization!.TabList.properties.DefaultSelectedItems).toMatchObject({ manual: expect.stringContaining('First('), targets: ['Default'], basis: 'studio-update-2026-10-06' });
  });
  it('rewrites TextInput.Value reads to Text, retaining checkbox Checked and tab Selected', () => {
    const content = app('TextInput', '            Value: ="Ready"\n', 'input')
      + '      - check:\n          Control: CheckBox\n          Properties:\n            Checked: =true\n'
      + '      - tabs:\n          Control: TabList\n          Properties:\n            Items: =Table({Value: "A"})\n'
      + '      - reader:\n          Control: ModernText\n          Properties:\n            Text: =input.Value & check.Checked & tabs.Selected.Value\n';
    const result = modernize(files(content), catalog);
    expect(result.files[0].content).toContain('Control: ModernTextInput\n          Properties:\n            Default: ="Ready"');
    expect(result.files[0].content).toContain('Control: ModernCheckbox\n          Properties:\n            Default: =true');
    expect(result.files[0].content).toContain('Text: =input.Text & check.Checked & tabs.Selected.Value');
    expect(result.report.summary.reference_rewrites).toBe(1);
    expect(result.report.self_check.new_refusals).toEqual([]);
  });
});

it('M7d applies version_knowledge to quoted Button appearance and font size', () => {
  const result = modernize(files(app('Button', "            Appearance: ='ButtonCanvas.Appearance'.Transparent\n            FontSize: =15\n")), catalog);
  expect(result.files[0].content).toContain('Appearance: =ButtonAppearance.Transparent');
  expect(result.files[0].content).toContain('Size: =15');
  expect(result.report.summary.open_items).toBe(0);
  expect(result.report.self_check.new_refusals).toEqual([]);
});
it('M7d preserves enum TabList size separately from the font size and its reads', () => {
  const content = app('TabList', '            Size: ="Large"\n            FontSize: =15\n') + '      - reader:\n          Control: ModernText\n          Properties:\n            Text: =txtX.Size\n';
  const result = modernize(files(content), catalog);
  expect(result.files[0].content).toContain('TabSize: =TabSize.Large');
  expect(result.files[0].content).toContain('Size: =15');
  expect(result.files[0].content).toContain('Text: =txtX.TabSize');
  expect(result.report.summary.reference_rewrites).toBe(1);
  expect(result.report.self_check.new_refusals).toEqual([]);
});
it('M7d uses a valid text enum formula for NumberInput numeric precision', () => {
  const result = modernize(files(app('NumberInput', '            Precision: ="2"\n')), catalog);
  expect(result.files[0].content).toContain('Precision: ="2"');
  expect(result.report.summary.open_items).toBe(0);
  expect(result.report.self_check.new_refusals).toEqual([]);
});
