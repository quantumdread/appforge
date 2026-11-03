import { describe, expect, it } from 'vitest';
import { analyze } from '../src/core/snapshot';
import { ANALYZER_CATALOG_DATA } from '../src/lib/catalog-data';
import type { LintContext } from '../src/core/lint';
import { controlNodes } from '../src/core/model';

const inspect = (content: string, context: LintContext = {}) => analyze(
  [{ name: 'App.pa.yaml', content }],
  ANALYZER_CATALOG_DATA,
  { lintContext: context },
).validation.issues;
const findings = (content: string, rule: string, context: LintContext = {}) => (
  inspect(content, context).filter(issue => issue.rule === rule)
);
const behavior = (formula: string, property = 'OnSelect') => `Screens:
  Main:
    Children:
      - btnRun:
          Control: Button
          Properties:
            Text: ="Run"
            ${property}: |-
              ${formula}
`;

describe('reserved local interpretation', () => {
  it.each(['Parent', 'sElF', 'ThisItem', 'ThisRecord'])(
    'does not interpret reserved local %s as a missing screen', name => {
      for (const context of [{}, { datasources: { [name]: 'sql' as const } }]) {
        expect(findings(behavior(`=Navigate(${name})`), 'navigate-to-unknown-screen', context)).toEqual([]);
      }
    },
  );

  it.each(['Parent', 'sElF', 'ThisItem', 'ThisRecord'])(
    'does not interpret reserved local %s as an external ForAll source despite a map collision', name => {
      for (const context of [{}, { datasources: { [name]: 'sql' as const } }]) {
        expect(findings(behavior(`=ForAll(${name}, Id)`), 'delegation-forall-truncation', context)).toEqual([]);
      }
    },
  );

  it.each(['Parent', 'sElF', 'ThisItem', 'ThisRecord'])(
    'does not interpret reserved local %s as a datasource write target despite a map collision', name => {
      const formula = `=Patch(${name}, {}, {}); Back(); Patch(${name}, {}, {}); Notify("Saved", NotificationType.Success)`;
      for (const context of [{}, { datasources: { [name]: 'sql' as const } }]) {
        expect(inspect(behavior(formula), context).filter(issue => [
          'write-followed-by-unconditional-navigation', 'success-notification-not-gated',
        ].includes(issue.rule ?? ''))).toEqual([]);
      }
    },
  );

  it.each(['Parent', 'sElF', 'ThisItem', 'ThisRecord'])(
    'does not resolve reserved local %s to a colliding authored Form', name => {
      const source = behavior(`=SubmitForm(${name}); Back(); SubmitForm(${name}); Notify("Saved", NotificationType.Success)`)
        + `      - ${name}:\n          Control: Form\n`;
      expect(inspect(source).filter(issue => [
        'submitform-navigation-not-in-onsuccess', 'form-without-failure-path', 'success-notification-not-gated',
      ].includes(issue.rule ?? ''))).toEqual([]);
    },
  );
});

describe('new navigation rule issue identity', () => {
  it.each([
    ['=ForAll(Orders, Id)', 'delegation-forall-truncation'],
    ['=Navigate(Missing)', 'navigate-to-unknown-screen'],
  ])('does not duplicate a new %s finding across repeated control declarations', (formula, rule) => {
    const source = behavior(formula) + behavior(formula).split('    Children:\n')[1];
    expect(findings(source, rule)).toHaveLength(1);
  });

  it('does not duplicate missing-OnError identity for repeated App declarations in one file', () => {
    const source = 'App:\n  OnStart: =false\nApp:\n  OnStart: =false\n';
    expect(findings(source, 'app-onerror-missing')).toHaveLength(1);
  });

  it('retains separate ForAll bound-source evidence at one property', () => {
    const source = behavior('=ForAll(Orders, Id); ForAll(Archive, Id)');
    expect(findings(source, 'delegation-forall-truncation')).toHaveLength(2);
  });
});

describe('ForAll source iteration', () => {
  it.each([undefined, { Lines: 'sql' as const }])('does not promote aggregate or Distinct row tables with map %j', datasources => {
    for (const formula of [
      '=Sum(Table({Lines: Table({Qty: 2})}), Sum(ForAll(Lines, Qty), Value))',
      '=Distinct(Table({Lines: Table({Qty: 2})}), CountRows(ForAll(Lines, Qty)))',
    ]) expect(findings(behavior(formula), 'delegation-forall-truncation', { datasources })).toEqual([]);
  });

  it.each([
    ['Average', 'Sum(ForAll(Lines, Qty), Value)'],
    ['Max', 'Sum(ForAll(Lines, Qty), Value)'],
    ['Min', 'Sum(ForAll(Lines, Qty), Value)'],
    ['StdevP', 'Sum(ForAll(Lines, Qty), Value)'],
    ['VarP', 'Sum(ForAll(Lines, Qty), Value)'],
    ['Concat', 'Text(CountRows(ForAll(Lines, Qty)))'],
    ['CountIf', 'CountRows(ForAll(Lines, Qty)) > 0'],
    ['UpdateIf', 'CountRows(ForAll(Lines, Qty)) > 0, {Total: 1}'],
  ])('excludes documented nonfirst row formulas in %s', (wrapper, tail) => {
    const formula = `=${wrapper}(Table({Lines: Table({Qty: 2})}), ${tail})`;
    expect(findings(behavior(formula), 'delegation-forall-truncation', { datasources: { Lines: 'sql' } })).toEqual([]);
  });

  it.each([
    ['Average', 'Qty'], ['Max', 'Qty'], ['Min', 'Qty'], ['StdevP', 'Qty'], ['Sum', 'Qty'], ['VarP', 'Qty'],
    ['Distinct', 'Qty'], ['Concat', 'Text(Qty)'], ['CountIf', 'Qty > 0'], ['UpdateIf', 'Qty > 0, {Qty: 1}'],
  ])('retains ForAll in the first source argument of documented row function %s', (wrapper, tail) => {
    expect(findings(behavior(`=${wrapper}(ForAll(Orders, ThisRecord), ${tail})`), 'delegation-forall-truncation')).toHaveLength(1);
  });

  it('does not classify Concatenate as Concat and conservatively skips ambiguous numeric aggregate overloads', () => {
    expect(findings(behavior('=Concatenate("total", Text(Sum(ForAll(Orders, Qty), Value)))'), 'delegation-forall-truncation')).toHaveLength(1);
    expect(findings(behavior('=Sum(1, Sum(ForAll(Orders, Qty), Value))'), 'delegation-forall-truncation')).toEqual([]);
  });

  it.each([undefined, { Lines: 'sql' as const }])('does not promote a nested AddColumns row table to an external source with map %j', datasources => {
    const formula = '=AddColumns(Table({Lines: Table({Qty: 2, Price: 3})}), RowTotal, Sum(ForAll(Lines, Qty * Price), Value))';
    expect(findings(behavior(formula), 'delegation-forall-truncation', { datasources })).toEqual([]);
  });

  it.each([
    '=Filter(Table({Lines: Table({Qty: 2})}), CountRows(ForAll(Lines, Qty)) > 0)',
    '=LookUp(Table({Lines: Table({Qty: 2})}), true, Sum(ForAll(Lines, Qty), Value))',
    '=Sort(Table({Lines: Table({Qty: 2})}), Sum(ForAll(Lines, Qty), Value))',
    '=RemoveIf(Table({Lines: Table({Qty: 2})}), CountRows(ForAll(Lines, Qty)) = 0)',
  ])('skips nested row-expression sources through the finite row-scope ancestor set: %s', formula => {
    expect(findings(behavior(formula), 'delegation-forall-truncation', { datasources: { Lines: 'sql' } })).toEqual([]);
  });

  it.each([['Filter', 'true'], ['LookUp', 'true'], ['Sort', 'Id'], ['RemoveIf', 'true'], ['AddColumns', 'Extra, 1']])('retains external ForAll in the source argument of %s', (wrapper, tail) => {
    const formula = `=${wrapper}(ForAll(Orders, ThisRecord), ${tail})`;
    expect(findings(behavior(formula), 'delegation-forall-truncation', { datasources: { Orders: 'sql' } })).toHaveLength(1);
  });

  it('warns about possible source truncation even when the body performs no write', () => {
    expect(findings(behavior('=ForAll(Orders, ThisRecord.Id)'), 'delegation-forall-truncation'))
      .toEqual([expect.objectContaining({
        level: 'WARN', property: 'OnSelect',
        detail: expect.stringContaining('possible row-limit truncation'),
        evidence: expect.objectContaining({ authoredName: 'Orders', resolvedBy: 'unresolved', confidence: 'none' }),
      })]);
  });

  it('retains Excel datasource iteration as external rather than in-memory', () => {
    expect(findings(behavior('=ForAll(Orders, ThisRecord.Id)'), 'delegation-forall-truncation', {
      datasources: { Orders: 'excel' },
    })).toEqual([expect.objectContaining({
      evidence: expect.objectContaining({ authoredName: 'Orders', backend: 'excel', resolvedBy: 'explicit-input' }),
    })]);
  });

  it.each([
    'Filter(Orders, true)', 'Search(Orders, "term", "Name")',
    'Sort(Orders, Name)', 'SortByColumns(Orders, "Name")',
    'ShowColumns(Orders, "Name")', 'AddColumns(Orders, "Alias", Name)',
  ])('follows the supported table wrapper %s', source => {
    expect(findings(behavior(`=ForAll(${source}, ThisRecord.Id)`), 'delegation-forall-truncation'))
      .toHaveLength(1);
  });

  it('retains exact quoted names and explicit-over-export provenance through nested table wrappers', () => {
    const rows = findings(behavior("=ForAll(Filter(Sort('Order Lines', Name), true), ThisRecord.Id)"), 'delegation-forall-truncation', {
      datasources: { 'Order Lines': 'sql' }, exportDatasources: { 'Order Lines': 'sharepoint' },
    });
    expect(rows).toEqual([expect.objectContaining({
      evidence: expect.objectContaining({ authoredName: 'Order Lines', backend: 'sql', resolvedBy: 'explicit-input', confidence: 'high' }),
    })]);
  });

  it.each([
    '=ForAll(First(Orders), ThisRecord.Id)', '=ForAll(LookUp(Orders, true), ThisRecord.Id)',
    '=ForAll(FirstN(Orders, 10), ThisRecord.Id)', '=ForAll(LastN(Orders, 10), ThisRecord.Id)',
    '=ForAll(Patch(Orders, Defaults(Orders), {}), ThisRecord.Id)',
    '=ForAll(Sequence(10), Value)', '=ForAll([1, 2], Value)',
    '=ForAll(Gallery1.Items, ThisRecord.Id)', '=ForAll(Connector.Filter(Orders, true), ThisRecord.Id)',
    '=Connector.ForAll(Orders, ThisRecord.Id)', '=ForAll(Orders As row, row.Id)',
    '=With({Orders: []}, ForAll(Orders, ThisRecord.Id))',
    '=ForAll(LocalRows, ForAll(Orders, ThisRecord.Id))',
    '=ForAll(Orders; ThisRecord.Id)', '=ForAll(Orders, ThisRecord.Id);; Back()',
    '=ForAll(Orders,', '=ForAll(Orders, $"{ThisRecord.Id}")',
    '="ForAll(Orders, ThisRecord.Id)"', '=true // ForAll(Orders, ThisRecord.Id)',
    'ForAll(Orders, ThisRecord.Id)',
  ])('skips unsupported or ambiguous source interpretation: %s', formula => {
    const context: LintContext = { datasources: { LocalRows: 'collection' } };
    expect(findings(behavior(formula), 'delegation-forall-truncation', context)).toEqual([]);
  });

  it('excludes known symbols and all collection provenance even when an external map collides', () => {
    for (const setup of ['Set(orders, [])', 'UpdateContext({Orders: []})', 'ClearCollect(Orders, [])']) {
      expect(findings(behavior(`=${setup}; ForAll(Orders, ThisRecord.Id)`), 'delegation-forall-truncation', { datasources: { Orders: 'sql' } }))
        .toEqual([]);
    }
    expect(findings(behavior('=ForAll(Orders, ThisRecord.Id)'), 'delegation-forall-truncation', { exportDatasources: { Orders: 'collection' } }))
      .toEqual([]);
    expect(findings(behavior('=ForAll(colOrders, ThisRecord.Id)'), 'delegation-forall-truncation')).toEqual([]);
    const named = 'App:\n  Properties:\n    Formulas: =Orders = Table({Id: 1});\n' + behavior('=ForAll(Orders, ThisRecord.Id)');
    expect(findings(named, 'delegation-forall-truncation', { datasources: { Orders: 'sql' } })).toEqual([]);
  });

  it('does not let a sibling binding hide an independent ForAll and deduplicates the same source per property', () => {
    const formula = '=With({Local: 1}, Local); ForAll(Orders, Id); ForAll(Orders, Name)';
    expect(findings(behavior(formula), 'delegation-forall-truncation')).toHaveLength(1);
  });
});

describe('App error reporting', () => {
  it('warns that an authored App has no configured global error reporting', () => {
    expect(findings('App:\n  Properties:\n    OnStart: =false\n', 'app-onerror-missing'))
      .toEqual([expect.objectContaining({
        level: 'WARN', control: 'App', rule: 'app-onerror-missing',
        detail: expect.stringContaining('default error banner'),
      })]);
  });

  it.each(['', '=', '= // nothing configured', '= /* nothing configured */'])(
    'treats lexically empty OnError %j as missing reporting', handler => {
      expect(findings(`App:\n  Properties:\n    OnError: |-\n      ${handler}\n`, 'app-onerror-missing'))
        .toHaveLength(1);
    },
  );

  it.each(['=false', '=Blank()', '=""', '=Notify("Review error")', '=Notify("unfinished']) (
    'does not audit nonempty or partially parsed OnError %j as missing', handler => {
      expect(findings(`App:\n  Properties:\n    OnError: |-\n      ${handler}\n`, 'app-onerror-missing'))
        .toEqual([]);
    },
  );

  it('does not invent a missing App or interpret duplicate OnError declarations', () => {
    expect(findings('Screens:\n  Main:\n    Children: []\n', 'app-onerror-missing')).toEqual([]);
    expect(findings('App:\n  Properties:\n    OnError: =false\n    OnError: =\n', 'app-onerror-missing'))
      .toEqual([]);
  });
});

describe('navigation target recognition', () => {
  it.each([
    [behavior('=Navigate(Missing)'), 'btnRun', 'OnSelect'],
    ['Screens:\n  Main:\n    Properties:\n      OnVisible: =If(flag, Navigate(\'Missing screen\'))\n    Children: []\n', 'Main', 'OnVisible'],
  ])('reports a literal target missing from analyzed screens at its actual source site', (source, control, property) => {
    expect(findings(source, 'navigate-to-unknown-screen')).toEqual([expect.objectContaining({
      level: 'WARN', control, property,
      detail: expect.stringContaining('not found among analyzed screens'),
    })]);
  });

  it.each([
    '=Navigate(Main)', "=Navigate('Main')", '=Navigate(main)',
    '=Navigate(If(flag, Main, Other))', '=Navigate(ThisItem.Screen)',
    '=With({Missing: Main}, Navigate(Missing))', '=ForAll(Orders, Navigate(Missing))',
    '=Connector.Navigate(Missing)', '=Navigate(Missing; ScreenTransition.None)',
    '=Navigate(Missing);; Back()', '=Navigate(Missing', '=Notify($"{Navigate(Missing)}")',
    '="Navigate(Missing)"', '=true // Navigate(Missing)', 'Navigate(Missing)',
    '=Set(Missing, Main); Navigate(Missing)', '=UpdateContext({Missing: Main}); Navigate(Missing)',
    '=Navigate(Main, ScreenTransition.None, {Missing: Main}); Navigate(Missing)',
  ])('skips present, dynamic, scoped, inert or ambiguous target interpretation: %s', formula => {
    expect(findings(behavior(formula), 'navigate-to-unknown-screen')).toEqual([]);
  });

  it('does not interpret named formulas, duplicate screens or duplicate handler properties as literal targets', () => {
    const named = 'App:\n  Properties:\n    Formulas: =Missing = Main;\n' + behavior('=Navigate(Missing)');
    expect(findings(named, 'navigate-to-unknown-screen')).toEqual([]);
    expect(findings(behavior('=Navigate(Missing)') + '  main:\n    Children: []\n', 'navigate-to-unknown-screen')).toEqual([]);
    expect(findings(behavior('=Navigate(Missing)') + '            OnSelect: =Back()\n', 'navigate-to-unknown-screen')).toEqual([]);
  });

  it('emits at most one unknown-target finding per control/property even for several missing literals', () => {
    expect(findings(behavior('=Navigate(Missing); Navigate(OtherMissing)'), 'navigate-to-unknown-screen')).toHaveLength(1);
  });
});

const graphApp = (mainBehavior = '=Navigate(Details)', extra = '') => `App:
  Properties:
    StartScreen: =Main
    OnError: =false
Screens:
  Main:
    Properties:
      OnVisible: |-
        ${mainBehavior}
    Children: []
  Details:
    Properties:
      OnVisible: =Back()
    Children: []
  Hidden:
    Children: []
${extra}`;

describe('static screen reachability', () => {
  it.each([
    '      Properties:\n        OnVisible: =Navigate(Hidden)\n    Children: []',
    '      Properties:\n        OnVisible: =Navigate(Hidden)\n      Children: []',
    '      Children: []\n      Properties:\n        OnVisible: =Navigate(Hidden)',
  ])('keeps unsupported screen section indentation unknown: %j', section => {
    const source = graphApp().replace('    Properties:\n      OnVisible: |-\n        =Navigate(Details)\n    Children: []', section);
    const snapshot = analyze([{ name: 'App.pa.yaml', content: source }], ANALYZER_CATALOG_DATA);
    expect(snapshot.validation.issues.filter(issue => issue.rule === 'unreachable-screen')).toEqual([]);
    expect(snapshot.bundle.screens[0].properties).toBeUndefined();
  });

  it('does not mistake nested control Properties for unsupported direct screen sections', () => {
    const source = graphApp().replace('    Properties:\n      OnVisible: |-\n        =Navigate(Details)\n    Children: []', `    Children:
      - lblNested:
          Control: Label
          Properties:
            Text: ="Nested"
            Wrap: =false
    Properties:
      OnVisible: =Navigate(Details)`);
    const snapshot = analyze([{ name: 'App.pa.yaml', content: source }], ANALYZER_CATALOG_DATA);
    expect(snapshot.validation.issues.filter(issue => issue.rule === 'unreachable-screen').map(issue => issue.control)).toEqual(['Hidden']);
    expect(snapshot.bundle.screens[0].properties).toEqual([
      expect.objectContaining({ name: 'OnVisible', value: '=Navigate(Details)' }),
    ]);
    expect(controlNodes(snapshot.bundle).filter(node => node.type !== '__App').map(node => node.name)).toEqual(['lblNested']);
  });

  it.each([undefined, 'FutureKind', 'Action', 'InputFunction', 'OutputFunction'])(
    'keeps an unknown or materialized component PropertyKind %j outside graph conclusions', kind => {
      const source = graphApp('=Navigate(Details)', `ComponentDefinitions:
  cNavigator:
    DefinitionType: CanvasComponent
    CustomProperties:
      Go:
${kind === undefined ? '' : `        PropertyKind: ${kind}\n`}        ReturnType: None
    Properties:
      Go: =If(flag, Navigate(Hidden)
`);
      const issues = inspect(source);
      expect(issues.filter(issue => issue.rule === 'unreachable-screen')).toEqual([]);
      const materialized = ['Action', 'InputFunction', 'OutputFunction'].includes(kind ?? '');
      expect(issues).toContainEqual(expect.objectContaining({
        control: 'cNavigator', property: 'Go',
        rule: materialized ? 'materialized-property-kind' : 'custom-property-kind',
        level: materialized ? 'WARN' : 'REFUSE',
      }));
    },
  );

  it('keeps duplicate component custom-property declarations ambiguous for graph analysis', () => {
    const source = graphApp('=Navigate(Details)', `ComponentDefinitions:
  cNavigator:
    DefinitionType: CanvasComponent
    CustomProperties:
      Go:
        PropertyKind: Input
        DataType: Text
      Go:
        PropertyKind: Input
        DataType: Text
    Properties:
      Go: =If(flag, Navigate(Hidden)
`);
    expect(findings(source, 'unreachable-screen')).toEqual([]);
  });

  it.each([
    '    "Properties":\n      OnVisible: =Navigate(Hidden)',
    "    'Properties':\n      OnVisible: =Navigate(Hidden)",
    '    Properties:\n      OnVisible: =Navigate(Details)\n    "Properties":\n      OnVisible: =Navigate(Hidden)',
    "    'Properties':\n      OnVisible: =Navigate(Hidden)\n    Properties:\n      OnVisible: =Navigate(Details)",
  ])('keeps quoted or mixed-duplicate screen property headers unknown rather than proving unreachable: %j', properties => {
    const source = graphApp().replace('    Properties:\n      OnVisible: |-\n        =Navigate(Details)', properties);
    const snapshot = analyze([{ name: 'App.pa.yaml', content: source }], ANALYZER_CATALOG_DATA);
    expect(snapshot.validation.issues.filter(issue => issue.rule === 'unreachable-screen')).toEqual([]);
    expect(snapshot.bundle.screens[0].properties).toBeUndefined();
  });

  it('uses explicit StartScreen and screen lifecycle edges without treating Back as another edge', () => {
    expect(findings(graphApp(), 'unreachable-screen')).toEqual([expect.objectContaining({
      level: 'WARN', control: 'Hidden', type: 'Screen', line: 15,
      detail: expect.stringContaining('no static path found from recognized entry points'),
    })]);
  });

  it('retains a literal navigation edge beside an unrelated sibling With binding', () => {
    expect(findings(graphApp('=Navigate(Details); With({x: 1}, false)'), 'unreachable-screen')
      .map(issue => issue.control)).toEqual(['Hidden']);
  });

  it.each([['Owner', ['Hidden']], ['OneShot', []]] as const)(
    'keeps the declared On* navigation-capable boundary for partial component property %s', (property, unreachable) => {
      const source = graphApp('=Navigate(Details)', `ComponentDefinitions:
  cExample:
    DefinitionType: CanvasComponent
    CustomProperties:
      ${property}:
        PropertyKind: Input
        DataType: Text
    Properties:
      ${property}: =If(
`);
      expect(findings(source, 'unreachable-screen').map(issue => issue.control)).toEqual(unreachable);
    },
  );

  it.each([
    '=If(flag, Navigate(Details), Navigate(Hidden))',
    '=Concurrent(Navigate(Details), Navigate(Hidden))',
  ])('retains nested literal Navigate edges: %s', formula => {
    expect(findings(graphApp(formula), 'unreachable-screen')).toEqual([]);
  });

  it.each([
    '=Navigate(If(flag, Details, Hidden))', '=Navigate(ThisItem.Screen)', '=Navigate(Missing)',
    '=With({Target: Details}, Navigate(Target))', '=ForAll(Orders, Navigate(Details))',
    '=Navigate(Details; ScreenTransition.None)', '=Navigate(Details);; Back()',
    '=If(flag, Navigate(Details)', '=Notify($"{Hidden}")',
    '=Set(Details, Hidden); Navigate(Details)',
  ])('suppresses graph warnings for dynamic, unknown, scoped, partial or ambiguous navigation: %s', formula => {
    expect(findings(graphApp(formula), 'unreachable-screen')).toEqual([]);
  });

  it('does not use Studio file order or a dynamic/ambiguous entry point', () => {
    for (const source of [
      graphApp().replace('    StartScreen: =Main\n', ''),
      graphApp().replace('StartScreen: =Main', 'StartScreen: =If(flag, Main, Details)'),
      graphApp().replace('StartScreen: =Main', 'StartScreen: =Missing'),
      graphApp().replace('StartScreen: =Main', 'StartScreen: =Main\n    StartScreen: =Details'),
      graphApp().replace('    OnError: =false', '    OnError: =false\n    Formulas: =Main = Details;'),
      graphApp() + '  main:\n    Children: []\n',
    ]) expect(findings(source, 'unreachable-screen')).toEqual([]);
    const multiApp = analyze([
      { name: 'App.pa.yaml', content: graphApp() },
      { name: 'SecondApp.pa.yaml', content: 'App:\n  Properties:\n    StartScreen: =Main\n' },
    ], ANALYZER_CATALOG_DATA);
    expect(multiApp.validation.issues.filter(issue => issue.rule === 'unreachable-screen')).toEqual([]);
  });

  it('keeps an unrelated partial Text formula outside graph invalidation', () => {
    const source = graphApp().replace('    Children: []', `    Children:
      - lblPartial:
          Control: Label
          Properties:
            Text: =If(
            Wrap: =false`);
    expect(findings(source, 'unreachable-screen').map(issue => issue.control)).toEqual(['Hidden']);
  });

  it('treats App-owned literal navigation as another possible entry', () => {
    const source = graphApp().replace('    OnError: =false', '    OnError: =false\n    OnStart: =Navigate(Hidden)');
    expect(findings(source, 'unreachable-screen')).toEqual([]);
  });

  it.each([
    '    Properties: {OnVisible: "=Navigate(Hidden)"}',
    '    Properties:\n      OnVisible: =Back()\n    Properties:\n      OnHidden: =Navigate(Hidden)',
    '    Properties:\n      OnVisible: =Navigate(Details)\n      OnVisible: =Back()',
  ])('suppresses graph conclusions from unknown or ambiguous screen properties: %j', properties => {
    const source = graphApp().replace('    Properties:\n      OnVisible: |-\n        =Navigate(Details)', properties);
    expect(findings(source, 'unreachable-screen')).toEqual([]);
  });

  it('suppresses graphs when a file-derived screen has no captured screen behavior', () => {
    const snapshot = analyze([
      { name: 'App.pa.yaml', content: 'App:\n  Properties:\n    StartScreen: =Main\n' },
      { name: 'Main.pa.yaml', content: '- lblLegacy:\n    Control: Label\n    Properties:\n      Text: ="Main"\n      Wrap: =false\n' },
      { name: 'Hidden.pa.yaml', content: 'Screens:\n  Hidden:\n    Children: []\n' },
    ], ANALYZER_CATALOG_DATA);
    expect(snapshot.validation.issues.filter(issue => issue.rule === 'unreachable-screen')).toEqual([]);
  });

  it('suppresses graph warnings when an unresolved custom component could hide navigation', () => {
    const source = graphApp().replace('    Children: []', `    Children:
      - cmpUnknown:
          Control: CanvasComponent
          ComponentName: MissingDefinition
          Properties:
            Go: =If(`);
    expect(findings(source, 'unreachable-screen')).toEqual([]);
  });

  it.each(['definition', 'instance'])('treats a declared non-On Event on a component %s as navigation-capable', location => {
    const definition = `ComponentDefinitions:
  cNavigator:
    DefinitionType: CanvasComponent
    CustomProperties:
      Go:
        PropertyKind: Event
        ReturnType: None
${location === 'definition' ? '    Properties:\n      Go: =If(\n' : ''}`;
    const source = graphApp('=Navigate(Details)', definition).replace('    Children: []', `    Children:
      - cmpNavigator:
          Control: CanvasComponent
          ComponentName: cNavigator
          Properties:
            Go: ${location === 'instance' ? '=If(' : '=false'}`);
    expect(findings(source, 'unreachable-screen')).toEqual([]);
  });

  it('includes a component-owned literal target as a possible root without guessing event execution', () => {
    const source = graphApp('=Navigate(Details)', `ComponentDefinitions:
  cNavigator:
    DefinitionType: CanvasComponent
    CustomProperties:
      Go:
        PropertyKind: Event
        ReturnType: None
    Properties:
      Go: =Navigate(Hidden)
`);
    expect(findings(source, 'unreachable-screen')).toEqual([]);
  });
});

describe('authored screen behavior capture', () => {
  it('captures screen scalar and block properties without adding catalog controls or changing old coverage', () => {
    const snapshot = analyze([{ name: 'Screen.pa.yaml', content: `Screens:
  Main:
    Properties:
      OnVisible: |-
        =Navigate(Hidden)
      OnHidden: "=Back()"
    Children:
      - lblTitle:
          Control: Label
          Properties:
            Text: ="Title"
            Wrap: =false
  Hidden:
    Children: []
` }], ANALYZER_CATALOG_DATA);

    expect(snapshot.bundle.screens[0]).toMatchObject({
      name: 'Main', line: 2,
      properties: [
        { name: 'OnVisible', line: 4, value: '=Navigate(Hidden)', isBlockScalar: true, wasQuoted: false },
        { name: 'OnHidden', line: 6, value: '=Back()', isBlockScalar: false, wasQuoted: true },
      ],
    });
    expect(snapshot.bundle.screens[1]).toMatchObject({ name: 'Hidden', line: 13, properties: [] });
    expect(controlNodes(snapshot.bundle).map(node => node.name)).toEqual(['lblTitle']);
    expect(snapshot.validation.summary).toEqual({ pass: 2, warn: 0, refuse: 0, controls_seen: 1, files: 1 });
    expect(snapshot.validation.per_file[0].controls_seen).toBe(1);
    expect(snapshot.coverage.tiers).toEqual({
      extractor_verified: 2, augmentation_verified: 0, dump_sourced_lower_bound: 0,
      component_defined: 0, unknown: 0,
    });
  });

  it.each([
    '    Properties: {OnVisible: "=Navigate(Hidden)"}',
    '    Properties:\n      OnVisible: =Back()\n    Properties:\n      OnHidden: =Back()',
    '    Properties:\n      OnVisible:\n        UnsupportedTree: =Navigate(Hidden)',
  ])('keeps unsupported or ambiguous screen property trees unknown: %j', properties => {
    const snapshot = analyze([{ name: 'Screen.pa.yaml', content: `Screens:\n  Main:\n${properties}\n    Children: []\n` }], ANALYZER_CATALOG_DATA);
    expect(snapshot.bundle.screens[0].properties).toBeUndefined();
  });
});
