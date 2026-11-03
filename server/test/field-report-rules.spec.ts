import { describe, expect, it } from 'vitest';
import { validateFiles, buildAppBundle } from '../src/core/analyzer';
import { ANALYZER_CATALOG_DATA as catalog } from '../src/lib/catalog-data';
import { analyzeSurveyFiles } from '../src/lib/survey';
import { snapshotForProfile } from '../src/core/survey/profile';
import { buildReport } from '../src/core/survey/build-report';
import { validateYaml } from '../src/tools/validator';

const fixture = (formula: string, property = 'Text', type = 'Label', name = 'reader', variant = '') => `Screens:
  Home:
    Children:
      - ${name}:
          Control: ${type}
${variant ? `          Variant: ${variant}\n` : ''}          Properties:
            ${property}: ${formula}
`;
const all = (content: string, lintProfile: 'worker' | 'cli' = 'worker') =>
  validateFiles([{ name: 'Home.pa.yaml', content }], catalog, { lintProfile }).issues;
const hits = (content: string, rule: string, profile: 'worker' | 'cli' = 'worker') => all(content, profile).filter(issue => issue.rule === rule);

describe('unknown property name hints through validate_yaml', () => {
  it.each([
    ['ModernButton', 'FontSize', 'ModernButton names this property Size, not FontSize; use Size'],
    ['ModernText', 'FontColor', 'ModernText names this property Color, not FontColor; use Color'],
    ['Button', 'Size', 'Button names this property FontSize, not Size; use FontSize'],
  ])('suggests the catalog alias for %s.%s', (type, property, fix) => {
    const response = validateYaml.handler({ files: [{ name: 'Home.pa.yaml', content: fixture('=1', property, type) }] });
    expect(response.isError).not.toBe(true);
    const body = JSON.parse(response.content[0].text);
    expect(body.gate_decision).toBe('BLOCK');
    const issue = body.issues.refuse.find((issue: { rule: string }) => issue.rule === 'unknown-property');
    expect(issue).toMatchObject({ level: 'REFUSE', detail: 'property-not-in-catalog', type, property, fix });
    // All three had no did_you_mean before the alias hint was added.
    expect(issue).not.toHaveProperty('did_you_mean');
  });
  it('does not suggest an alias absent from ModernSlider\'s catalog', () => {
    const response = validateYaml.handler({ files: [{ name: 'Home.pa.yaml', content: fixture('=1', 'FontColor', 'ModernSlider') }] });
    const body = JSON.parse(response.content[0].text);
    const issue = body.issues.refuse.find((issue: { rule: string }) => issue.rule === 'unknown-property');
    expect(issue).toMatchObject({ level: 'REFUSE', detail: 'property-not-in-catalog', type: 'ModernSlider', property: 'FontColor' });
    expect(issue).not.toHaveProperty('fix');
    expect(issue).not.toHaveProperty('did_you_mean');
  });
});

describe('YAML formula comments', () => {
  it.each(['worker', 'cli'] as const)('refuses a string cut by YAML in %s', profile => {
    const issues = hits(fixture('="Price #1 item"'), 'yaml-comment-truncates-formula', profile);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ level: 'REFUSE', property: 'Text', line: 7 });
    expect(issues[0].detail).toBe(`YAML treats ' #' as a comment, so the formula is cut at '#': '="Price'`);
    expect(issues[0].fix).toContain('|-');
  });
  it('keeps the parsed value and records the YAML comment', () => {
    const property = buildAppBundle([{name: 'Home.pa.yaml', content: fixture('=Price #1')}]).screens[0].roots[0].properties[0];
    expect(property.value).toBe('=Price');
    expect(property).toMatchObject({inlineComment: '#1'});
  });
  it.each(['=If(true, # tail', '=Table([1, # tail', '=Table({Value: 1 # tail'])('refuses incomplete nesting %s', formula => {
    expect(hits(fixture(formula), 'yaml-comment-truncates-formula')).toHaveLength(1);
  });
  it.each(['="escaped "" # tail', '=$"Price #1 item"', '=If(true, /* balanced-looking () */ # tail'])('detects string escapes, interpolation and unmatched nesting %s', formula => {
    expect(hits(fixture(formula), 'yaml-comment-truncates-formula')).toHaveLength(1);
  });
  it('checks App, Screen and definition-root properties', () => {
    const files = [
      {name: 'App.pa.yaml', content: 'App:\n  Properties:\n    OnStart: =Notify("Price #1")\n'},
      {name: 'Screen.pa.yaml', content: 'Screens:\n  Home:\n    Properties:\n      OnVisible: =Notify("Price #1")\n'},
      {name: 'Component.pa.yaml', content: component('Input', '=Max(1, # tail', false, true)},
    ];
    expect(validateFiles(files, catalog).issues.filter(issue => issue.rule === 'yaml-comment-truncates-formula')).toHaveLength(3);
  });
  it.each(['=Price #1', '="Price" # deliberate comment', '=Sum(1, 2) # note'])('warns on a complete truncated formula %s', formula => {
    expect(hits(fixture(formula), 'yaml-inline-comment-after-formula')[0]?.level).toBe('WARN');
    expect(hits(fixture(formula), 'yaml-comment-truncates-formula')).toEqual([]);
  });
  it.each(['=$"Price" # deliberate comment', '=If(true, $"Price {1}", "other") # note'])('warns after complete opaque interpolation %s', formula => {
    expect(hits(fixture(formula), 'yaml-inline-comment-after-formula')[0]?.level).toBe('WARN');
    expect(hits(fixture(formula), 'yaml-comment-truncates-formula')).toEqual([]);
  });
  it.each(['=$"Price" + ` # note', '=$"Price" + /* unfinished # note', "=$\"Price\" + 'unfinished # note"])('does not claim unsupported or unfinished syntax is complete %s', formula => {
    expect(hits(fixture(formula), 'yaml-inline-comment-after-formula')).toEqual([]);
  });
  it.each([`'="Price #1 item"'`, '"=Price #1" # comment', '|-\n              ="Price #1 item"', 'Price #1', '="Price#1 item"'])('accepts quoted, block, nonformula or noncomment %s', formula => {
    expect(all(fixture(formula)).filter(issue => issue.rule.startsWith('yaml-comment') || issue.rule.startsWith('yaml-inline-comment'))).toEqual([]);
  });
});

const component = (kind: string, formula: string, parameters = false, root = false) => `ComponentDefinitions:
  cExample:
    DefinitionType: CanvasComponent
    CustomProperties:
      Value:
        PropertyKind: ${kind}
        DataType: Number
        Default: =1
${parameters ? '        Parameters:\n          Amount:\n            DataType: Number\n' : ''}${root ? `    Properties:\n      Height: ${formula}\n` : `    Children:\n      - child:\n          Control: Label\n          Properties:\n            Text: ${formula}\n`}`;

const instanceScreen = (formula: string, instanceProperties = '            Value: =2', extraControls = '') => `${fixture(formula)}      - instance:
          Control: CanvasComponent
          ComponentName: cExample
          Properties:
${instanceProperties}
${extraControls}`;

describe('screen-side component value calls', () => {
  it('refuses a Label calling an Output on an instance with a bundled definition', () => {
    const issues = validateFiles([
      {name: 'Component.pa.yaml', content: component('Output', '=1')},
      {name: 'Home.pa.yaml', content: instanceScreen('=instance.Value()')},
    ], catalog).issues.filter(issue => issue.rule === 'component-input-called-as-function');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({level: 'REFUSE', control: 'reader', property: 'Text'});
    expect(issues[0].detail).toBe("`instance.Value()` calls an `Input`/`Output` property as a function; `compile_canvas` rejects this ('unknown or unsupported function in namespace'). read it without parentheses: `instance.Value`.");
    expect(issues[0].fix).toBe('read it without parentheses: `instance.Value`');
  });
  it('refuses an authored Input read through an instance', () => {
    expect(hits(component('Input', '=1') + instanceScreen('=instance.Value()'), 'component-input-called-as-function')[0]?.level).toBe('REFUSE');
  });
  it('resolves quoted instance, member and definition names case-insensitively in CLI', () => {
    const screen = instanceScreen("='INSTANCE'.'vAlUe'()").replace('ComponentName: cExample', 'ComponentName: CEXAMPLE');
    expect(hits(component('Output', '=1') + screen, 'component-input-called-as-function', 'cli')[0]?.fix).toBe('read it without parentheses: `instance.Value`');
  });
  it('accepts a bare Output read in a Label and on the instance handler', () => {
    const screen = instanceScreen('=instance.Value', '            OnStepSelect: =Notify(Text(instance.Value))');
    expect(hits(component('Output', '=1') + screen, 'component-input-called-as-function')).toEqual([]);
  });
  it('refuses an Output call in the instance handler', () => {
    const issues = hits(component('Output', '=1') + instanceScreen('=1', '            OnStepSelect: =Notify(Text(instance.Value()))'), 'component-input-called-as-function');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({level: 'REFUSE', control: 'instance', property: 'OnStepSelect'});
  });
  it('stays silent when the instance definition is not in the bundle', () => {
    expect(hits(instanceScreen('=instance.Value()'), 'component-input-called-as-function')).toEqual([]);
  });
  it.each(['InputFunction', 'OutputFunction', 'Action', 'Event', 'input', 'output'])('does not refuse a screen call to authored kind %s', kind => {
    expect(hits(component(kind, '=1') + instanceScreen('=instance.Value()'), 'component-input-called-as-function')).toEqual([]);
  });
  it.each(['Input', 'Output'])('accepts a parameterized %s call through the instance', kind => {
    expect(hits(component(kind, '=1', true) + instanceScreen('=instance.Value(1)'), 'component-input-called-as-function')).toEqual([]);
  });
  it('accepts an instance event handler invoking that instance event', () => {
    const definition = component('Event', '=1').replaceAll('Value:', 'OnStepSelect:');
    expect(hits(definition + instanceScreen('=1', '            OnStepSelect: =instance.OnStepSelect()'), 'component-input-called-as-function')).toEqual([]);
  });
  it.each(['=instance.Value', '=instance.Unknown()', '=record.instance.Value()', '="instance.Value()"', '=instance.Value( /* partial', '=With({instance: {Value: 1}}, instance.Value())', '=ForAll(rows, instance.Value())', '=With(rows As instance, instance.Value())'])('ignores unresolved, inert, partial or shadowed %s', formula => {
    expect(hits(component('Output', '=1') + instanceScreen(formula), 'component-input-called-as-function')).toEqual([]);
  });
  it.each(['Label', 'CanvasComponent'])('ignores an instance name duplicated by a %s', type => {
    const duplicate = `      - INSTANCE:\n          Control: ${type}\n          Properties:\n            Text: =1\n`;
    expect(hits(component('Output', '=1') + instanceScreen('=instance.Value()', '            Value: =2', duplicate), 'component-input-called-as-function')).toEqual([]);
  });
  it('ignores an ambiguous bundled definition', () => {
    const definitions = component('Output', '=1') + component('Output', '=1').replace('cExample:', 'CEXAMPLE:');
    expect(hits(definitions + instanceScreen('=instance.Value()'), 'component-input-called-as-function')).toEqual([]);
  });
  it('requires CanvasComponent rather than just a ComponentName', () => {
    const screen = instanceScreen('=instance.Value()').replace('Control: CanvasComponent', 'Control: Label');
    expect(hits(component('Output', '=1') + screen, 'component-input-called-as-function')).toEqual([]);
  });
  it('ignores an instance name shadowed by an app variable', () => {
    const screen = instanceScreen('=instance.Value()').replace('Text: =instance.Value()', 'Text: =Set(instance, 1); instance.Value()');
    expect(hits(component('Output', '=1') + screen, 'component-input-called-as-function')).toEqual([]);
  });
  it('ignores an instance name shadowed by a named formula', () => {
    const app = 'App:\n  Properties:\n    Formulas: |-\n      =instance = 1;\n';
    expect(hits(app + component('Output', '=1') + instanceScreen('=instance.Value()'), 'component-input-called-as-function')).toEqual([]);
  });
  it('ignores reserved Self even if an instance has that name', () => {
    expect(hits(component('Output', '=1') + instanceScreen('=instance.Value()').replaceAll('instance', 'Self'), 'component-input-called-as-function')).toEqual([]);
  });
});

describe('component value properties called as functions', () => {
  it.each(['Input', 'Output'])('refuses a function call to authored %s', kind => {
    const issues = hits(component(kind, '=cExample.Value()'), 'component-input-called-as-function');
    expect(issues).toHaveLength(1);
    expect(issues[0].level).toBe('REFUSE');
    expect(issues[0].detail).toBe("`cExample.Value()` calls an `Input`/`Output` property as a function; `compile_canvas` rejects this ('unknown or unsupported function in namespace').");
    expect(issues[0].fix).toBe("read it without parentheses: `cExample.Value`");
  });
  it('checks definition root and CLI formulas with quoted names', () => {
    const issues = hits(component('Input', "='CEXAMPLE'.'Value'()", false, true), 'component-input-called-as-function', 'cli');
    expect(issues).toHaveLength(1);
    expect(issues[0].level).toBe('REFUSE');
  });
  it.each(['shared', 'existing-export'] as const)('classifies the rejected call as BLOCK under %s', profile => {
    const snapshot = analyzeSurveyFiles([{ name: 'Component.pa.yaml', content: component('Input', '=cExample.Value()') }]);
    const report = buildReport(snapshot, {
      app_name: {value: null, resolved_by: 'unresolved'}, source_kind: 'inline', fingerprint_basis: 'fixture',
      files: [{id: 'Component.pa.yaml', sha256: '0'.repeat(64)}], limitations: [], connections: {state: 'empty', rows: []},
    }, {now: '2026-10-06T00:00:00.000Z', report_id: 'r1-r3-fixture', analyzer_version: 'test', policy: {profile_id: profile}});
    expect(report.findings.find(issue => issue.rule === 'component-input-called-as-function')).toMatchObject({level: 'REFUSE', severity: 'BLOCK'});
  });
  it.each(['InputFunction', 'OutputFunction', 'Action', 'Event'])('accepts callable %s', kind => {
    expect(hits(component(kind, '=cExample.Value()'), 'component-input-called-as-function')).toEqual([]);
  });
  it('accepts properties declaring parameters', () => {
    expect(hits(component('Input', '=cExample.Value(1)', true), 'component-input-called-as-function')).toEqual([]);
  });
  it.each(['=cExample.Value', '=other.Value()', '=record.cExample.Value()', '="cExample.Value()"', '=cExample.Value( /* partial', '=With({cExample: {Value: 1}}, cExample.Value())'])('ignores inert, local, incomplete or unrelated %s', formula => {
    expect(hits(component('Input', formula), 'component-input-called-as-function')).toEqual([]);
  });
  it('ignores screen instance calls', () => {
    expect(hits(component('Input', '=1') + fixture('=instance.Value()'), 'component-input-called-as-function')).toEqual([]);
    expect(hits(component('Input', '=1') + fixture('=cExample.Value()'), 'component-input-called-as-function')).toEqual([]);
  });
});

describe('AddColumns column-name arguments', () => {
  it.each(['worker', 'cli'] as const)('refuses a string name in %s', profile => {
    const issues = hits(fixture('=AddColumns(src, "NewValue", 1)', 'Items', 'Gallery'), 'addcolumns-string-column-name', profile);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({level: 'REFUSE', property: 'Items'});
    expect(issues[0].detail).toContain('Expected identifier name');
    expect(issues[0].fix).toContain('identifier');
  });
  it.each(['=AddColumns(src, First, 1, "Second", Sum(1, 2))', '=If(true, AddColumns(src, "NewValue", 1))', '=AddColumns(src, First, AddColumns(src, "Inner", 2))'])('checks all column slots and nested calls %s', formula => {
    expect(hits(fixture(formula), 'addcolumns-string-column-name')).toHaveLength(1);
  });
  it.each(['=AddColumns(src, NewValue, "string expression")', "=AddColumns(src, 'Display Name', 1)", '=record.AddColumns(src, "NewValue", 1)', '="AddColumns(src, ""NewValue"", 1)"', '=AddColumns(src, "NewValue", ('])('accepts identifiers and ignores unrelated/inert/partial calls %s', formula => {
    expect(hits(fixture(formula), 'addcolumns-string-column-name')).toEqual([]);
  });
  it('projects the same finding to WARN for existing-export', () => {
    const snapshot = analyzeSurveyFiles([{name: 'Home.pa.yaml', content: fixture('=AddColumns(src, "NewValue", 1)')}]);
    const strict = snapshot.validation.issues.find(issue => issue.rule === 'addcolumns-string-column-name');
    expect(strict?.level).toBe('REFUSE');
    const projected = snapshotForProfile(snapshot, 'existing-export');
    expect(projected.validation.issues.find(issue => issue.rule === 'addcolumns-string-column-name')).toEqual({...strict, level: 'WARN'});
    expect(projected.validation.summary.refuse).toBe(snapshot.validation.summary.refuse - 1);
    expect(projected.validation.summary.warn).toBe(snapshot.validation.summary.warn + 1);
    expect(projected.validation.per_file[0].refuse).toBe(snapshot.validation.per_file[0].refuse - 1);
    expect(snapshot.validation.issues.find(issue => issue.rule === 'addcolumns-string-column-name')?.level).toBe('REFUSE');
  });
  it('classifies existing-export advice as a correctness risk in the final survey', () => {
    const snapshot = analyzeSurveyFiles([{name: 'Home.pa.yaml', content: fixture('=AddColumns(src, "NewValue", 1)')}]);
    const report = buildReport(snapshot, {
      app_name: {value: null, resolved_by: 'unresolved'}, source_kind: 'inline', fingerprint_basis: 'fixture',
      files: [{id: 'Home.pa.yaml', sha256: '0'.repeat(64)}], limitations: [], connections: {state: 'empty', rows: []},
    }, {now: '2026-10-06T00:00:00.000Z', report_id: 'r1-fixture', analyzer_version: 'test', policy: {profile_id: 'existing-export'}});
    expect(report.findings.find(issue => issue.rule === 'addcolumns-string-column-name')).toMatchObject({level: 'WARN', severity: 'CORRECTNESS_RISK'});
  });
});

describe('SortByColumns on directly added columns', () => {
  it.each(['worker', 'cli'] as const)('warns about an added column in %s', profile => {
    const issues = hits(fixture('=SortByColumns(AddColumns(src, NewValue, 1), "NewValue")'), 'sortbycolumns-on-added-column', profile);
    expect(issues).toHaveLength(1);
    expect(issues[0].level).toBe('WARN');
    expect(issues[0].fix).toContain('AddColumns(Sort(');
  });
  it.each([
    '=SortByColumns(AddColumns(src, First, 1, NewValue, 2), Old, SortOrder.Ascending, NewValue, SortOrder.Descending)',
    "=SortByColumns(AddColumns(src, 'Display Name', 1), \"display name\")",
    '=SortByColumns(AddColumns(src, "NewValue", 1), NewValue)',
    '=If(true, SortByColumns(AddColumns(src, NewValue, Sum(1, 2)), NewValue))',
  ])('matches every literal/identifier name slot %s', formula => {
    expect(hits(fixture(formula), 'sortbycolumns-on-added-column')).toHaveLength(1);
  });
  it.each([
    '=SortByColumns(AddColumns(src, NewValue, 1), OldValue)',
    '=SortByColumns(Filter(AddColumns(src, NewValue, 1), true), NewValue)',
    '=SortByColumns(src, NewValue)',
    '=record.SortByColumns(AddColumns(src, NewValue, 1), NewValue)',
    '=SortByColumns(record.AddColumns(src, NewValue, 1), NewValue)',
    '=SortByColumns(AddColumns(src, NewValue, 1), If(true, NewValue, Other))',
    '=SortByColumns(AddColumns(src, NewValue, 1), Other, NewValue)',
    '=SortByColumns(AddColumns(src, NewValue, 1), NewValue',
  ])('ignores indirect sources, direction slots and unrelated/partial calls %s', formula => {
    expect(hits(fixture(formula), 'sortbycolumns-on-added-column')).toEqual([]);
  });
});

const gallery = (formula: string, property = 'OnSelect', nested = false) => `Screens:
  Home:
    Children:
      - rows:
          Control: Gallery
          Children:
${nested ? '            - box:\n                Control: GroupContainer\n                Children:\n' : ''}${nested ? '                  ' : '            '}- tap:
${nested ? '                      ' : '                '}Control: Classic/Button
${nested ? '                      ' : '                '}Properties:
${nested ? '                        ' : '                  '}${property}: ${formula}
`;
describe('Select Parent in a gallery template', () => {
  it.each(['worker', 'cli'] as const)('warns in %s', profile => {
    const issues = hits(gallery('=Select(Parent)', 'OnSelect', true), 'select-parent-in-gallery', profile);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({level: 'WARN', control: 'tap', property: 'OnSelect'});
    expect(issues[0].fix).toContain('UDF');
  });
  it('checks nested template controls and complete behavior chains', () => {
    expect(hits(gallery('=If(true, Select(Parent); Notify("done"))', 'OnSelect', true), 'select-parent-in-gallery')).toHaveLength(1);
  });
  it.each(['worker', 'cli'] as const)('accepts a direct gallery child in %s', profile => {
    expect(hits(gallery('=Select(Parent)'), 'select-parent-in-gallery', profile)).toEqual([]);
  });
  it.each(['=Select(Self)', '=record.Select(Parent)', '=Select(Parent.Child)', '=Select(Parent, 1)', '="Select(Parent)"', '=Select(Parent', '=With({Parent: 1}, Select(Parent))'])('ignores unrelated, inert, local or partial %s', formula => {
    expect(hits(gallery(formula, 'OnSelect', true), 'select-parent-in-gallery')).toEqual([]);
  });
  it('ignores a nonbehavior formula, controls outside galleries and the gallery itself', () => {
    expect(hits(gallery('=Select(Parent)', 'Text', true), 'select-parent-in-gallery')).toEqual([]);
    expect(hits(fixture('=Select(Parent)', 'OnSelect', 'Classic/Button'), 'select-parent-in-gallery')).toEqual([]);
    expect(hits(fixture('=Select(Parent)', 'OnSelect', 'Gallery'), 'select-parent-in-gallery')).toEqual([]);
  });
});

describe('Object.prototype authored names', () => {
  const names = Object.getOwnPropertyNames(Object.prototype);
  it.each(names)('reports property %s as an ordinary unknown property', name => {
    const issues = all(fixture('=1', name, 'GroupContainer'));
    expect(issues.find(issue => issue.property === name && issue.rule === 'unknown-property')?.level).toBe('REFUSE');
  });
  it.each(names)('reports type %s as an ordinary unknown control', name => {
    expect(all(fixture('=1', 'Text', name)).find(issue => issue.rule === 'unknown-control')?.level).toBe('REFUSE');
  });
  it.each(names)('reports variant %s as an ordinary unknown variant', name => {
    expect(all(fixture('=1', 'Height', 'GroupContainer', 'reader', name)).find(issue => issue.rule === 'unknown-variant')?.level).toBe('REFUSE');
  });
  it.each(names)('accepts control name %s without crashing or changing verdicts', name => {
    expect(all(fixture('=1', 'Text', 'Label', name)).map(issue => ({...issue, control: 'reader'}))).toEqual(all(fixture('=1')));
  });
});

describe('unknown property classic counterpart remedy', () => {
  it('names Classic/Icon only in the fix for Icon.OnSelect', () => {
    const issue = hits(fixture('=Notify("done")', 'OnSelect', 'Icon'), 'unknown-property')[0];
    expect(issue).toMatchObject({level: 'REFUSE', detail: 'property-not-in-catalog', property: 'OnSelect'});
    expect(issue.fix).toBe('Classic/Icon has OnSelect; use Classic/Icon if this control needs it');
  });
  it('uses a modernization source pair before the Classic/type fallback', () => {
    const injected = {...catalog, modernization: {'Label': {
      target: 'Icon', properties: {}, references: {}, verified: false,
    }}};
    const issues = validateFiles([{name: 'Home.pa.yaml', content: fixture('=1', 'Text', 'Icon')}], injected).issues;
    expect(issues.find(issue => issue.rule === 'unknown-property')?.fix).toBe('Label has Text; use Label if this control needs it');
  });
  it('falls back to Classic/type when no mapping exists', () => {
    const injected = {...catalog, modernization: {}};
    const issues = validateFiles([{name: 'Home.pa.yaml', content: fixture('=1', 'OnSelect', 'Icon')}], injected).issues;
    expect(issues.find(issue => issue.rule === 'unknown-property')?.fix).toBe('Classic/Icon has OnSelect; use Classic/Icon if this control needs it');
  });
  it('does not invent a counterpart property or change ordinary unknown results', () => {
    const issue = hits(fixture('=1', 'NoSuchProperty', 'Icon'), 'unknown-property')[0];
    expect(issue).toMatchObject({level: 'REFUSE', detail: 'property-not-in-catalog'});
    expect(issue.fix).toBeUndefined();
  });
  it('does not fall back when the mapped counterpart lacks the property', () => {
    const injected = {...catalog, modernization: {'Text': {target: 'Icon', properties: {}, references: {}, verified: false}}};
    const issues = validateFiles([{name: 'Home.pa.yaml', content: fixture('=1', 'OnSelect', 'Icon')}], injected).issues;
    expect(issues.find(issue => issue.rule === 'unknown-property')?.fix).toBeUndefined();
  });
});
