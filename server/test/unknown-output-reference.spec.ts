import { describe, expect, it } from 'vitest';
import { validateFiles } from '../src/core/analyzer';
import type { AnalyzerCatalogData } from '../src/core/catalog';
import { bindLintRules } from '../src/core/lint';
import { ANALYZER_CATALOG_DATA } from '../src/lib/catalog-data';

const RULE = 'unknown-output-reference';
const fixture = (type: string, formula: string, name = 'txtName', extra = '') => `Screens:
  Home:
    Children:
      - ${name}:
          Control: ${type}
${extra}      - reader:
          Control: Label
          Properties:
            Text: ${formula}
`;

function findings(content: string, catalog: AnalyzerCatalogData = ANALYZER_CATALOG_DATA) {
  // Negative cases must exercise the installed rule, not pass because it is absent.
  expect(bindLintRules(catalog).some(rule => rule.id === RULE), 'J1 rule is registered').toBe(true);
  return validateFiles([{ name: 'Home.pa.yaml', content }], catalog).issues.filter(issue => issue.rule === RULE);
}

describe('unknown-output-reference J1 acceptance', () => {
  it('warns on FluentV9 TextInput.Text and suggests Value', () => {
    const issues = findings(fixture('TextInput', '=txtName.Text'));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ level: 'WARN', control: 'reader', property: 'Text', did_you_mean: 'Value' });
    expect(issues[0].detail).toContain('TextInput');
    expect(issues[0].detail).toContain('txtName.Text');
    expect(issues[0].detail).toContain('Value');
  });
  it('accepts FluentV9 TextInput.Value', () => {
    expect(findings(fixture('TextInput', '=txtName.Value'))).toEqual([]);
  });
  it('accepts Classic/TextInput.Text', () => {
    expect(findings(fixture('Classic/TextInput', '=txtName.Text'))).toEqual([]);
  });
  it('accepts Gallery.Selected and its record fields', () => {
    expect(findings(fixture('Gallery', '=txtName.Selected.Title'))).toEqual([]);
  });
  it('skips dump-sourced instances', () => {
    const catalog = { ...ANALYZER_CATALOG_DATA, dumpSourced: ['TextInput'] };
    expect(findings(fixture('TextInput', '=txtName.Nonexistent'), catalog)).toEqual([]);
  });
  it('skips component instances', () => {
    expect(findings(fixture('CanvasComponent', '=txtName.Nonexistent', 'txtName', '          ComponentName: cExample\n'))).toEqual([]);
  });
});

describe('unknown-output-reference resolution and catalog boundaries', () => {
  it.each(['AllItems', 'AllItemsCount', 'Selected', 'TemplateWidth', 'TemplateHeight', 'Valid'])('accepts Gallery.%s', member => {
    expect(findings(fixture('Gallery', `=txtName.${member}`))).toEqual([]);
  });
  it.each(['Updates', 'LastSubmit', 'Error', 'ErrorKind', 'Unsaved', 'Valid'])('accepts Form.%s', member => {
    expect(findings(fixture('Form', `=txtName.${member}`))).toEqual([]);
  });
  it.each([
    '=Self.Nonexistent & Parent.Nonexistent & ThisItem.Nonexistent & ThisRecord.Nonexistent',
    '=With({txtName: {Text: "local"}}, txtName.Text)',
    '=ForAll(Table({Text: "local"}) As txtName, txtName.Text)',
    '=Filter(Table({Text: "local"}), txtName.Text = "local")',
    '=record.txtName.Text',
    '="txtName.Text" /* txtName.Text */',
    '=$"{txtName.Text}"',
    '=txtName.Text & (',
    '=unresolved.Text',
  ])('skips local, nested, inert, partial or unresolved reference %s', formula => {
    expect(findings(fixture('TextInput', formula))).toEqual([]);
  });
  it('resolves case-insensitive and quoted identifiers', () => {
    expect(findings(fixture('TextInput', "='TXT NAME'.'Text'", 'txt Name'))[0]?.did_you_mean).toBe('Value');
    expect(findings(fixture('TextInput', '=TXTNAME.value'))).toEqual([]);
  });
  it('accepts input properties as readable members', () => {
    expect(findings(fixture('TextInput', '=txtName.Placeholder'))).toEqual([]);
  });
  it('checks complete nested behavior chains', () => {
    expect(findings(fixture('TextInput', '=If(true, Set(a, txtName.Text); Set(b, txtName.Value))'))).toHaveLength(1);
  });
  it('checks unshadowed controls inside With', () => {
    expect(findings(fixture('TextInput', '=With({other: 1}, txtName.Text)'))).toHaveLength(1);
  });
  it('checks control references in With binding values before the local name is bound', () => {
    expect(findings(fixture('TextInput', '=With({txtName: txtName.Text}, txtName.Value)'))).toHaveLength(1);
  });
  it('skips injected catalogs without an output list', () => {
    const { output_properties: _outputs, ...inputs } = ANALYZER_CATALOG_DATA.controlProperties.TextInput;
    const catalog = { ...ANALYZER_CATALOG_DATA, controlProperties: {
      ...ANALYZER_CATALOG_DATA.controlProperties, TextInput: inputs,
    } };
    expect(findings(fixture('TextInput', '=txtName.Text'), catalog)).toEqual([]);
  });
  it('suggests a near miss and names an unknown member without one', () => {
    expect(findings(fixture('TextInput', '=txtName.Valu'))[0]?.did_you_mean).toBe('Value');
    const issue = findings(fixture('TextInput', '=txtName.TotallyMissing'))[0];
    expect(issue.detail).toContain('TextInput');
    expect(issue.did_you_mean).toBeUndefined();
  });
  it('skips synthetic and source-tagged controls', () => {
    const catalog = { ...ANALYZER_CATALOG_DATA, controls: ANALYZER_CATALOG_DATA.controls.map(control =>
      control.type === 'TextInput' ? { ...control, source: 'synthetic' } : control) };
    expect(findings(fixture('TextInput', '=txtName.Text'), catalog)).toEqual([]);
  });
  it('skips ambiguous names across files', () => {
    findings(fixture('TextInput', '=txtName.Value'));
    const files = ['a.pa.yaml', 'b.pa.yaml'].map(name => ({ name, content: fixture('TextInput', '=txtName.Text') }));
    expect(validateFiles(files, ANALYZER_CATALOG_DATA).issues.filter(issue => issue.rule === RULE)).toEqual([]);
  });
  it('checks App and Screen formulas and references across files in both profiles', () => {
    const input = fixture('TextInput', '=txtName.Value');
    findings(input);
    const files = [{ name: 'Home.pa.yaml', content: input }, { name: 'App.pa.yaml', content: 'App:\n  Properties:\n    OnStart: =Set(result, txtName.Text)\n' },
      { name: 'Other.pa.yaml', content: 'Screens:\n  Other:\n    Properties:\n      OnVisible: =Set(other, txtName.Text)\n' }];
    for (const lintProfile of ['worker', 'cli'] as const) {
      expect(validateFiles(files, ANALYZER_CATALOG_DATA, { lintProfile }).issues.filter(issue => issue.rule === RULE)).toHaveLength(2);
    }
  });
});
