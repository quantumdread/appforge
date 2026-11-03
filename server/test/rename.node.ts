import { describe, expect, it } from 'vitest';
import { proposeNames, applyRenames } from '../src/core/rename';
import { ANALYZER_CATALOG_DATA as catalog } from '../src/lib/catalog-data';
const control = (name: string, type: string, props = '') => `      - ${name}:\n          Control: ${type}\n          Properties:\n${props}`;
const files = (children: string, screen = 'scrDeviations') => [{ name: 'Screen.pa.yaml', content: `Screens:\n  ${screen}:\n    Children:\n${children}` }];
describe('apply explicit rename map', () => {
  it('renames the source before an As alias while keeping the alias local', () => {
    const input = files(control('Gallery1', 'Gallery', '            Items: =Accounts\n') + control('Label1', 'Label', '            Text: =Concat(Gallery1.AllItems As Gallery1, Gallery1.Title)\n'));
    expect(applyRenames(input, catalog, { Gallery1: 'galAccounts' }).files[0].content).toContain('Concat(galAccounts.AllItems As Gallery1, Gallery1.Title)');
  });
  it('keeps nested record keys distinct from With bindings', () => {
    const input = files(control('Label1', 'Label', '            Text: =With({settings: {Label1: 1}}, Label1.Text)\n'));
    expect(applyRenames(input, catalog, { Label1: 'lblTitle' }).files[0].content).toContain('With({settings: {Label1: 1}}, lblTitle.Text)');
  });
  it('does not rename UDF parameters that shadow a control name', () => {
    const input = [...files(control('Label1', 'Label')), { name: 'App.pa.yaml', content: 'App:\n  Properties:\n    Formulas: |-\n      Echo(Label1: Text): Text = Label1;\n      Title = Label1.Text;\n' }];
    const source = applyRenames(input, catalog, { Label1: 'lblTitle' }).files[1].content;
    expect(source).toContain('Echo(Label1: Text): Text = Label1;');
    expect(source).toContain('Title = lblTitle.Text;');
  });
  it('rejects a target that is an unresolved source in a conditional Items expression', () => {
    const input = files(control('Label1', 'Label') + control('Gallery1', 'Gallery', '            Items: =If(flag, Accounts, Contacts)\n'));
    expect(() => applyRenames(input, catalog, { Label1: 'Accounts' })).toThrow(/collision/);
  });
  it('rejects uninspectable syntax mentioning a target name', () => {
    const input = files(control('Label1', 'Label', '            OnSelect: =Set(lblTitle, 1) & (\n'));
    expect(() => applyRenames(input, catalog, { Label1: 'lblTitle' })).toThrow(/reference/);
  });
  it('permits simultaneous swaps and reports identical maps as no changes', () => {
    const input = files(control('Label1', 'Label', '            Text: =Label2.Text\n') + control('Label2', 'Label', '            Text: ="Second"\n'));
    expect(applyRenames(input, catalog, { Label1: 'Label2', Label2: 'Label1' }).files[0].content).toContain('Text: =Label1.Text');
    const result = applyRenames(input, catalog, { Label1: 'Label1' });
    expect(result.report.summary.renamed).toBe(0);
    expect(result.files).toEqual(input);
  });
  it('rewrites references in component custom-property defaults', () => {
    const input = [{ name: 'Components.pa.yaml', content: 'ComponentDefinitions:\n  Header:\n    DefinitionType: CanvasComponent\n    CustomProperties:\n      Caption:\n        PropertyKind: Input\n        DataType: Text\n        Default: |-\n          =Label1.Text\n    Children:\n      - Label1:\n          Control: Label\n' }];
    expect(applyRenames(input, catalog, { Label1: 'lblTitle' }).files[0].content).toContain('=lblTitle.Text');
  });
  it('rewrites explicit global disambiguation inside a row scope', () => {
    const input = files(control('Label1', 'Label', '            Text: =Filter(rows, [@Label1].Text)\n'));
    expect(applyRenames(input, catalog, { Label1: 'lblTitle' }).files[0].content).toContain('[@lblTitle].Text');
  });
  it('rejects a new name that captures a previously unresolved global read', () => {
    const input = files(control('Label1', 'Label', '            Text: =NewSource.Value\n'));
    expect(() => applyRenames(input, catalog, { Label1: 'NewSource' })).toThrow(/collision/);
  });
  it('renames component instances and definitions, including ComponentName links', () => {
    const input = [...files(control('CanvasComponent1', 'CanvasComponent').replace('          Properties:', '          ComponentName: Component1\n          Properties:') + control('Label1', 'Label', '            Text: =CanvasComponent1.Caption\n')),
      { name: 'Components.pa.yaml', content: 'ComponentDefinitions:\n  Component1:\n    DefinitionType: CanvasComponent\n    Properties:\n      Width: =100\n    Children:\n      - Label2:\n          Control: Label\n          Properties:\n            Text: ="Title"\n' }];
    const result = applyRenames(input, catalog, { CanvasComponent1: 'cmpHeader', Component1: 'Header' });
    expect(result.files[0].content).toContain('ComponentName: Header');
    expect(result.files[0].content).toContain('=cmpHeader.Caption');
    expect(result.files[1].content).toContain('  Header:');
  });
  it('supports quoted declarations and scalar escaping with multiple references', () => {
    const input = files(control("'Label 13'", 'Label') + control('reader', 'Label', `            Text: "='Label 13'.Text & 'Label 13'.Text" # keep\n`));
    const result = applyRenames(input, catalog, { 'Label 13': 'lblTitle' });
    expect(result.files[0].content).toContain("- 'lblTitle':");
    expect(result.files[0].content).toContain(`Text: "='lblTitle'.Text & 'lblTitle'.Text" # keep`);
  });
  it('leaves explicit As aliases and ThisRecord fields unchanged', () => {
    const input = files(control('Label1', 'Label', '            Text: =ForAll(rows As Label1, Label1.Text & ThisRecord.Label1) & Label1.Text\n'));
    expect(applyRenames(input, catalog, { Label1: 'lblTitle' }).files[0].content).toContain('ForAll(rows As Label1, Label1.Text & ThisRecord.Label1) & lblTitle.Text');
  });
  it.each(['=Label1.Text & (', '=$"value {Label1.Text}"'])('rejects an unsafe reference instead of silently breaking it: %s', value => {
    expect(() => applyRenames(files(control('Label1', 'Label', `            Text: ${value}\n`)), catalog, { Label1: 'lblTitle' })).toThrow(/reference|scope/);
  });
  it('preserves existing refusals under renamed identities and all untouched bytes', () => {
    const input = files(control('Label1', 'Label', '            Bogus: =1\n'));
    input[0].content = input[0].content.trimEnd().replaceAll('\n', '\r\n');
    const result = applyRenames(input, catalog, { Label1: 'lblTitle' });
    expect(result.files[0].content).toBe(input[0].content.replace('Label1:', 'lblTitle:'));
    expect(result.report.self_check.new_refusals).toEqual([]);
    expect(result.report.self_check.output.gate_decision).toBe('BLOCK');
  });
  it.each([
    ['variable', '=Set(taken, 1)'], ['context', '=UpdateContext({taken: 1})'],
    ['navigation context', '=Navigate(scrDeviations, ScreenTransition.None, {taken: 1})'],
    ['collection', '=Collect(taken, {x: 1})'], ['clear collection', '=ClearCollect(taken, {x: 1})'],
    ['data source', '=Filter(taken, true)'], ['nested source', '=Sort(Filter(taken, true), Name)'],
  ])('rejects %s collisions before returning any changed source', (_, formula) => {
    const input = files(control('Label1', 'Label', `            OnSelect: ${formula}\n`));
    expect(() => applyRenames(input, catalog, { Label1: 'taken' })).toThrow(/collision/i);
  });
  it.each(['Color', 'RGBA', 'If', 'Sum', 'Navigate', 'true', 'Self', '1bad', 'has space'])('rejects reserved or invalid identifier %s', name => {
    expect(() => applyRenames(files(control('Label1', 'Label')), catalog, { Label1: name })).toThrow();
  });
  it('lists all collisions and handles case-insensitive final-map collisions', () => {
    const input = files(control('Label1', 'Label') + control('Button1', 'Classic/Button') + control('taken', 'Label'));
    expect(() => applyRenames(input, catalog, { Label1: 'taken', Button1: 'TAKEN' })).toThrow(/Label1[\s\S]*Button1/i);
    expect(() => applyRenames(input, catalog, { Label1: 'scrDeviations' })).toThrow(/collision/);
    expect(() => applyRenames(input, catalog, { Missing: 'newName' })).toThrow(/unknown/);
  });
  it('rejects named formula and bare Items source collisions', () => {
    const input = [...files(control('Label1', 'Label') + control('Gallery1', 'Gallery', '            Items: =Accounts\n')),
      { name: 'App.pa.yaml', content: 'App:\n  Properties:\n    Formulas: |-\n      Total = 1;\n' }];
    for (const name of ['Total', 'Accounts']) expect(() => applyRenames(input, catalog, { Label1: name })).toThrow(/collision/);
  });
  it('detects newly shadowed references in its self-check', () => {
    const input = files(control('Label1', 'Label', '            Text: =With({lblNew: 1}, Label1.Text)\n'));
    expect(() => applyRenames(input, catalog, { Label1: 'lblNew' })).toThrow(/self-check/);
  });
  it('rewrites declarations and cross-file references, but preserves literals, comments and local fields', () => {
    const input = [...files(control('Label_13', 'Label'), 'Screen1'),
      { name: 'App.pa.yaml', content: `App:
  Properties:
    OnStart: |-
      =Select(Label_13); Reset(Label_13); SetFocus(Label_13); Navigate(Screen1); Back(Screen1);
      With({Label_13: 1}, Label_13); Set(answer, ThisRecord.Label_13);
      Set(message, "Label_13"); /* Label_13 */ Set(value, 'Label_13'.Text)
    Formulas: |-
      Named = Label_13.Text;
` }, { name: '_EditorState.pa.yaml', content: 'ScreensOrder:\n  - Screen1\n' }];
    // Screens are renamed in Studio: a screen rename through compile_canvas broke the Studio session (2026-10-07).
    expect(() => applyRenames(input, catalog, { Label_13: 'lblTitle', Screen1: 'scrHome' })).toThrow(/rename the screen in Studio/);
    const result = applyRenames(input, catalog, { Label_13: 'lblTitle' });
    expect(result.files[0].content).toContain('- lblTitle:');
    expect(result.files[0].content).toContain('  Screen1:');
    const source = result.files[1].content;
    expect(source).toContain('=Select(lblTitle); Reset(lblTitle); SetFocus(lblTitle); Navigate(Screen1); Back(Screen1);');
    expect(source).toContain('With({Label_13: 1}, Label_13)');
    expect(source).toContain('ThisRecord.Label_13');
    expect(source).toContain('"Label_13"');
    expect(source).toContain('/* Label_13 */');
    expect(source).toContain("'lblTitle'.Text");
    expect(source).toContain('Named = lblTitle.Text;');
    expect(result.files[2].content).toBe('ScreensOrder:\n  - Screen1\n');
    expect(result.report.possible_dynamic_references).toHaveLength(1);
    expect(result.report.self_check).toMatchObject({ regression: false, structure_preserved: true, unresolved_references: [] });
    expect(input[0].content).toContain('Label_13');
  });
});
describe('rename proposals: screens', () => {
  const screen = (name: string, children: string) => ({ name: `${name}.pa.yaml`, content: `Screens:\n  ${name}:\n    Children:\n${children}` });
  it('names a screen from its title or from a control that navigates to it, never from an arbitrary child', () => {
    const input = [
      screen('Screen1', control('lblTitle', 'Label', '            Text: ="Deviations"\n')
        + control('btnCustomers', 'Button', '            Text: ="Customers"\n            OnSelect: =Navigate(Screen2)\n')),
      screen('Screen2', control('lblRow', 'Label', '            Text: ="Row"\n')),
      // Only an arbitrary child's AccessibleLabel: it must not name the screen (real-app case, 2026-10-07).
      screen('Screen3', control('icoTap', 'ModernIcon', '            AccessibleLabel: ="Count a tap"\n')),
    ];
    const result = proposeNames(input, catalog);
    expect(result.proposals.find(p => p.old === 'Screen1')).toMatchObject({ new: 'scrDeviations', confidence: 'medium', apply_in: 'studio' });
    expect(result.proposals.find(p => p.old === 'Screen2')).toMatchObject({ new: 'scrCustomers', confidence: 'medium' });
    expect(result.proposals.find(p => p.old === 'Screen3')).toBeUndefined();
    expect(result.no_meaning).toEqual(expect.arrayContaining([expect.objectContaining({ control: 'Screen3' })]));
  });
});
describe('rename proposals', () => {
  it('uses a filtered gallery source and propagates evidenced parent context', () => {
    const input = files(control('Gallery1', 'Gallery', '            Items: =SortByColumns(Filter(Accounts, Active), "Name")\n') + '          Children:\n            - Label1:\n                Control: Label\n');
    const result = proposeNames(input, catalog);
    expect(result.proposals.map(p => p.new)).toEqual(['galAccounts', 'lblAccounts']);
    expect(result.proposals[1].confidence).toBe('low');
    expect(result.proposals[1].evidence[0].source).toContain('parent');
  });
  it('recognizes Modern type-number names and names derived from component types', () => {
    const input = files(control('ModernText1', 'ModernText', '            Text: ="Title"\n') + control('Header1', 'CanvasComponent', '            Caption: ="Title"\n').replace('          Properties:\n            Caption:', '          ComponentName: Header\n          Properties:\n            Caption:'));
    const result = proposeNames(input, catalog);
    expect(result.proposals).toMatchObject([{ old: 'ModernText1', new: 'lblTitle' }]);
    expect(result.no_meaning).toMatchObject([{ control: 'Header1' }]);
    expect(result.summary.generic_names).toBe(2);
  });
  it('keeps underscore and suffix naming conventions when they are the majority', () => {
    const underscore = files(control('label_title', 'Label') + control('label_footer', 'Label') + control('Label1', 'Label', '            Text: ="Customer name"\n'));
    expect(proposeNames(underscore, catalog).proposals[0].new).toBe('label_customer_name');
    const suffix = files(control('TitleLabel', 'Label') + control('FooterLabel', 'Label') + control('Label1', 'Label', '            Text: ="Customer name"\n'));
    expect(proposeNames(suffix, catalog).proposals[0].new).toBe('CustomerNameLabel');
  });
  it('avoids occupied variable names in proposals', () => {
    const input = files(control('Label1', 'Label', '            Text: ="Title"\n            OnSelect: =Set(lblTitle, 1)\n'));
    expect(proposeNames(input, catalog).proposals[0].new).toBe('lblTitle2');
  });
  it('uses component scope, unique abbreviations, fallback prefixes, and screen title evidence', () => {
    const input = [...files(control('Spinner1', 'Spinner', '            AccessibleLabel: ="Loading"\n'), 'Screen1'),
      { name: 'other.pa.yaml', content: 'Screens:\n  scrDevices:\n    Children: []\n' },
      { name: 'component.pa.yaml', content: 'ComponentDefinitions:\n  cmpHeader:\n    DefinitionType: CanvasComponent\n    Children:\n      - Label1:\n          Control: Label\n          Properties:\n            Text: ="Title"\n' }];
    const result = proposeNames(input, catalog, { screen_prefix: true });
    // A spinner's AccessibleLabel is not a screen title: Screen1 gets no proposal.
    expect(result.proposals).toEqual(expect.arrayContaining([expect.objectContaining({ old: 'Label1', new: 'heaLblTitle' })]));
    expect(result.proposals.some(p => p.old === 'Screen1')).toBe(false);
    expect(result.fallback_prefixes).toEqual({ Spinner: 'spi' });
    const duplicateScopes = [...files(control('Label1', 'Label', '            Text: ="Title"\n'), 'scrDeviations'), ...files(control('Label2', 'Label', '            Text: ="Title"\n'), 'scrDevices').map(f => ({ ...f, name: 'Other.pa.yaml' }))];
    expect(proposeNames(duplicateScopes, catalog, { screen_prefix: true }).abbreviations).toEqual({ scrDeviations: 'dev', scrDevices: 'dev2' });
    expect(proposeNames(duplicateScopes, catalog, { screen_prefix: 'auto' }).prefix_suggestion.suggested).toBe(true);
  });
  it('uses data sources, records Swedish folds, omits unsupported meaning and offers optional scope prefixes', () => {
    const input = files(control('Label_13', 'ModernText', '            Text: ="Åtgärd för öar"\n') + control('Gallery3', 'Gallery', '            Items: =Accounts\n') + control('Icon7', 'Classic/Icon'));
    const result = proposeNames(input, catalog);
    expect(result.proposals.map(p => p.new)).toEqual(['lblAtgardForOar', 'galAccounts']);
    expect(result.folds).toMatchObject([{ old: 'Label_13', before: 'Åtgärd för öar', after: 'AtgardForOar' }]);
    expect(result.no_meaning).toMatchObject([{ control: 'Icon7' }]);
    expect(proposeNames(input, catalog, { screen_prefix: true }).proposals[0].new).toBe('devLblAtgardForOar');
    expect(proposeNames(input, catalog, { screen_prefix: 'auto' }).proposals).toEqual(result.proposals);
    expect(proposeNames(input, catalog, { screen_prefix: 'auto' }).prefix_suggestion.reason).toContain('3 controls');
    expect(proposeNames(input, catalog, { screen_prefix: true, abbreviations: { scrDeviations: 'dv' } }).proposals[0].new).toBe('dvLblAtgardForOar');
  });
  it('keeps the majority existing type-prefix convention', () => {
    const input = files(control('labHeading', 'Label') + control('labFooter', 'Label') + control('Label1', 'Label', '            Text: ="Title"\n'));
    expect(proposeNames(input, catalog)).toMatchObject({ proposals: [{ new: 'labTitle' }], convention: { retained: true } });
  });
  it('uses literal meaning only for generic names', () => {
    const input = files(control('Label_13', 'Label', '            Text: ="Customer name"\n') + control('lblKeep', 'Label', '            Text: ="Keep"\n'));
    expect(proposeNames(input, catalog).proposals).toMatchObject([{ old: 'Label_13', new: 'lblCustomerName', confidence: 'high', evidence: expect.any(Array) }]);
  });
});
