import { describe, expect, it } from 'vitest';
import { controlNodes, validateFiles, walkPaYaml } from '../src/lib/validator';
import { APP_FORMULAS_SHAPE } from './fixtures/app-formulas-shape';

const CENTRALIZATION_RULES = new Set([
  'duplicate-formula',
  'duplicate-formula-in-gallery',
  'repeated-color-literal',
  'heavy-onstart',
]);

const centralizationIssues = (files: Array<{ name: string; content: string }>) =>
  validateFiles(files).issues.filter(issue => issue.rule && CENTRALIZATION_RULES.has(issue.rule));

const screenWithLabels = (screen: string, entries: Array<{ name: string; property?: string; value: string }>) => `Screens:
  ${screen}:
    Children:
${entries.map(({ name, property = 'Text', value }) => `      - ${name}:
          Control: Label
          Properties:
            ${property}: ${value}`).join('\n')}
`;

// The canonical compile-path shape: App properties nest under `Properties:`.
const APP_WITH_SCREEN = `App:
  Properties:
    OnError: =false
    OnStart: |-
      =ClearCollect(colA, T1); ClearCollect(colB, T2)
    Formulas: |-
      =FmtKr(v: Number = Max(1, 2)): Text = Text(v) & " kr";
      nfToday = Today();
Screens:
  MainScreen:
    Children:
      - lblTitle:
          Control: Label
          Properties:
            Text: =nfToday
            Wrap: =false
`;

describe('App block awareness', () => {
  it('emits an __App pseudo-control with properties and named-formula names without affecting screens or validation', () => {
    const controls = [...controlNodes(walkPaYaml(APP_WITH_SCREEN, 'App.pa.yaml'))];

    const app = controls.find(c => c.type === '__App');
    expect(app).toBeDefined();
    expect(app).toMatchObject({ name: 'App', type: '__App' });
    expect(app!.properties.find(p => p.name === 'OnStart')).toMatchObject({
      value: '=ClearCollect(colA, T1); ClearCollect(colB, T2)',
      isBlockScalar: true,
    });
    expect(app!.appFormulaNames).toEqual(['FmtKr', 'nfToday']);

    expect(controls).toContainEqual(expect.objectContaining({
      name: 'lblTitle',
      type: 'Label',
    }));

    const result = validateFiles([
      { name: 'App.pa.yaml', content: APP_WITH_SCREEN },
      // Flat shape (properties directly under `App:`) stays supported.
      { name: 'OtherApp.pa.yaml', content: 'App:\n  OnError: =false\n  OnStart: =false\n' },
    ]);
    expect(result.issues).toEqual([]);
  });

  it('captures the flat shape and the documented `App As App:` heading variant', () => {
    for (const heading of ['App', 'App As App']) {
      const app = [...controlNodes(walkPaYaml(`${heading}:\n  OnStart: =Set(a, 1)\n  Formulas: |-\n    =nfToday = Today();\n`, 'App.pa.yaml'))]
        .find(c => c.type === '__App');

      expect(app, heading).toBeDefined();
      expect(app!.properties.map(p => p.name)).toEqual(['OnStart', 'Formulas']);
      expect(app!.appFormulaNames).toEqual(['nfToday']);
    }
  });

  it('reads the synthetic App.pa.yaml shape: nested properties and every named formula/UDF', () => {
    const app = [...controlNodes(walkPaYaml(APP_FORMULAS_SHAPE, 'App.pa.yaml'))].find(c => c.type === '__App');

    expect(app).toBeDefined();
    expect(app!.properties.map(p => p.name)).toEqual(['Theme', 'StartScreen', 'BackEnabled', 'Formulas', 'OnError']);
    expect(app!.properties.find(p => p.name === 'Theme')!.value).toBe('=PowerAppsTheme');
    expect(app!.properties.find(p => p.name === 'Formulas')!.isBlockScalar).toBe(true);
    // Named formulas + typed UDFs, in declaration order.
    expect(app!.appFormulaNames!.slice(0, 3)).toEqual(['ThemeBg', 'ThemeSurface', 'ThemeSurface2']);
    expect(app!.appFormulaNames).toContain('AssignedJobs');
    expect(app!.appFormulaNames).toContain('FormatScore');
    expect(app!.appFormulaNames).toContain('JobStateColor');
    expect(app!.appFormulaNames).toHaveLength(44);

    // A correct synthetic App block must not produce a single finding.
    expect(validateFiles([{ name: 'App.pa.yaml', content: APP_FORMULAS_SHAPE }]).issues).toEqual([]);
  });

  it('fires heavy-onstart on the nested App shape (the shape real apps actually use)', () => {
    const nested = `App:
  Properties:
    OnStart: |-
      =Set(a, 1); Set(b, 2); Set(c, 3); Set(d, 4); Set(e, 5)
`;

    const issues = centralizationIssues([{ name: 'nested.pa.yaml', content: nested }]);

    expect(issues.map(issue => issue.rule)).toEqual(['heavy-onstart']);
    expect(issues[0].detail).toContain('5 statements');
  });
});

describe('centralization lint', () => {
  it.each([
    '=Set(a; 1);; Set(b; 2);; Set(c; 3);; Set(d; 4);; Set(e; 5)',
    '=Set(a, "a;b;c;d;e")',
    '=Set(a, "a""b;c;d;e")',
    '=If(flag, Set(a, 1); Set(b, 2); Set(c, 3); Set(d, 4); Set(e, 5))',
    '=Concurrent(Set(a, 1), Set(b, 2)); Set(c, 3); Set(d, 4); Set(e, 5);',
    '=Set(a, 1); Set(b, 2); Set(c, 3); Set(d, 4);',
    '=Set(a, $"value {x}"); Set(b, 2); Set(c, 3); Set(d, 4); Set(e, 5)',
    '=Set(a, "unclosed; Set(b, 2); Set(c, 3); Set(d, 4); Set(e, 5)',
    '=Set(a, [{b:1}, {c:2}]); /* ; ; ; */ Set(b, 2); Set(c, 3); Set(d, 4);',
  ])('skips ambiguous syntax and avoids counting nested or literal separators: %s', formula => {
    const content = `App:\n  Properties:\n    OnStart: |-\n      ${formula}\n`;
    expect(centralizationIssues([{ name: 'App.pa.yaml', content }]))
      .not.toContainEqual(expect.objectContaining({ rule: 'heavy-onstart' }));
  });

  it.each([
    '=Set(a, "a;;b"); Set(b, 2); Set(c, 3); Set(d, 4); Set(e, 5);',
    '=Set(a, 1); // ; ; ; ignored\nSet(b, 2); Set(c, 3); Set(d, 4); Set(e, 5); // no extra statement',
  ])('counts five real statements using the original text: %s', formula => {
    const content = `App:\n  Properties:\n    OnStart: |-\n${formula.split('\n').map(line => `      ${line}`).join('\n')}\n`;
    const issues = centralizationIssues([{ name: 'App.pa.yaml', content }]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ rule: 'heavy-onstart', level: 'WARN' });
    expect(issues[0].detail).toContain('5 statements');
    expect(issues[0].detail).toContain('statement-count heuristic');
    expect(issues[0].detail).toContain('App.Formulas');
    expect(issues[0].detail).toContain('StartScreen');
    expect(issues[0].detail).not.toContain('performance/anti-pattern hotspot');
  });

  it('counts a normalized duplicate formula across files, anchors the first occurrence, and enriches the suggestion for App.Formulas', () => {
    const formula = `'=If(ThisItem.Status = "Open",  "Active", "Closed")'`;
    const files = [
      {
        name: 'first.pa.yaml',
        content: `App:
  Formulas: |-
    =nfToday = Today();
${screenWithLabels('First', [
          { name: 'lblFirst', value: formula },
          { name: 'lblSecond', value: `'=If(ThisItem.Status = "Open", "Active", "Closed")'` },
        ])}`,
      },
      {
        name: 'second.pa.yaml',
        content: screenWithLabels('Second', [{ name: 'lblThird', value: formula }]),
      },
    ];

    const issues = centralizationIssues(files);

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      level: 'WARN',
      rule: 'duplicate-formula',
      file: 'first.pa.yaml',
      control: 'lblFirst',
      property: 'Text',
    });
    expect(issues[0].detail).toContain('appears 3×');
    expect(issues[0].detail).toContain('first.pa.yaml:');
    expect(issues[0].detail).toContain('second.pa.yaml:');
    expect(issues[0].detail).toContain('add to your existing App.Formulas');
  });

  it('stays silent below the duplicate threshold and for excluded or trivial formulas', () => {
    const content = screenWithLabels('Main', [
      { name: 'lblBelowA', value: '=If(flag, "yes", "no")' },
      { name: 'lblBelowB', value: '=If(flag, "yes", "no")' },
      { name: 'lblX1', property: 'X', value: '=Parent.Width + 20' },
      { name: 'lblX2', property: 'X', value: '=Parent.Width + 20' },
      { name: 'lblX3', property: 'X', value: '=Parent.Width + 20' },
      { name: 'lblY1', property: 'Y', value: '=Parent.Height + 20' },
      { name: 'lblY2', property: 'Y', value: '=Parent.Height + 20' },
      { name: 'lblY3', property: 'Y', value: '=Parent.Height + 20' },
      ...['Width', 'Height', 'LayoutMinWidth', 'LayoutMinHeight', 'FillPortions'].flatMap(property =>
        Array.from({ length: 3 }, (_, index) => ({
          name: `lbl${property}${index + 1}`,
          property,
          value: '=If(flag, 100 + 20, 80 + 20)',
        }))),
      { name: 'lblVisible1', property: 'Visible', value: '=true' },
      { name: 'lblVisible2', property: 'Visible', value: '=true' },
      { name: 'lblVisible3', property: 'Visible', value: '=true' },
      { name: 'lblParent1', value: '=Parent.Width + Parent.Height' },
      { name: 'lblParent2', value: '=Parent.Width + Parent.Height' },
      { name: 'lblParent3', value: '=Parent.Width + Parent.Height' },
      { name: 'lblSelf1', value: '=Self.Width + Self.Height' },
      { name: 'lblSelf2', value: '=Self.Width + Self.Height' },
      { name: 'lblSelf3', value: '=Self.Width + Self.Height' },
      { name: 'lblTrivial1', value: '=Parent.DisplayMode' },
      { name: 'lblTrivial2', value: '=Parent.DisplayMode' },
      { name: 'lblTrivial3', value: '=Parent.DisplayMode' },
    ]);

    expect(centralizationIssues([{ name: 'quiet.pa.yaml', content }])).toEqual([]);
  });

  it('uses the gallery rule at its two-occurrence boundary instead of the general duplicate rule', () => {
    const content = `Screens:
  Main:
    Children:
      - galOrders:
          Control: Gallery
          Children:
            - lblOne:
                Control: Label
                Properties:
                  Text: '=If(ThisItem.Active, "Enabled", "Disabled")'
            - lblTwo:
                Control: Label
                Properties:
                  Text: '=If(ThisItem.Active, "Enabled", "Disabled")'
`;

    const issues = centralizationIssues([{ name: 'gallery.pa.yaml', content }]);

    expect(issues.map(issue => issue.rule)).toEqual(['duplicate-formula-in-gallery']);
    expect(issues[0].detail).toContain('appears 2×');
    expect(issues[0].detail).toContain('components cannot live in gallery templates');
  });

  it('uses the general rule for three mixed gallery and screen occurrences', () => {
    const content = `Screens:
  Main:
    Children:
      - galOrders:
          Control: Gallery
          Children:
            - lblOne:
                Control: Label
                Properties:
                  Text: '=If(ThisItem.Active, "Enabled", "Disabled")'
            - lblTwo:
                Control: Label
                Properties:
                  Text: '=If(ThisItem.Active, "Enabled", "Disabled")'
      - lblOutside:
          Control: Label
          Properties:
            Text: '=If(ThisItem.Active, "Enabled", "Disabled")'
`;

    expect(centralizationIssues([{ name: 'mixed.pa.yaml', content }]).map(issue => issue.rule))
      .toEqual(['duplicate-formula']);
  });

  it('finds an embedded color literal at the five-occurrence boundary and lists only three other locations', () => {
    const entries = Array.from({ length: 5 }, (_, index) => ({
      name: `lblColor${index + 1}`,
      property: 'Fill',
      value: index === 2
        ? `=If(flag${index}, RGBA(12,  34, 56, 0.5), Color.Red)`
        : `=If(flag${index}, RGBA(12, 34, 56, 0.5), Color.Red)`,
    }));

    const issues = centralizationIssues([{ name: 'colors.pa.yaml', content: screenWithLabels('Main', entries) }]);

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ rule: 'repeated-color-literal', control: 'lblColor1', property: 'Fill' });
    expect(issues[0].detail).toContain('appears 5×');
    expect(issues[0].detail.match(/colors\.pa\.yaml:/g)).toHaveLength(3);
    expect(issues[0].detail).toContain('define a theme token (varTheme.X) or named formula');
  });

  it('stays silent below the color threshold and for transparent and white', () => {
    const entries = [
      ...Array.from({ length: 4 }, (_, index) => ({ name: `lblBelow${index}`, property: 'Fill', value: `=If(flag${index}, RGBA(1, 2, 3, 1), Color.Red)` })),
      ...Array.from({ length: 5 }, (_, index) => ({ name: `lblTransparent${index}`, property: 'Fill', value: `=If(transparent${index}, RGBA(0, 0, 0, 0), Color.Red)` })),
      ...Array.from({ length: 5 }, (_, index) => ({ name: `lblWhite${index}`, property: 'Fill', value: `=If(white${index}, RGBA(255, 255, 255, 1), Color.Red)` })),
    ];

    expect(centralizationIssues([{ name: 'excluded-colors.pa.yaml', content: screenWithLabels('Main', entries) }])).toEqual([]);
  });

  it('fires heavy-onstart at five statements and stays silent at four', () => {
    const files = [
      {
        name: 'heavy.pa.yaml',
        content: `App:
  Properties:
    OnStart: |-
      =Set(a, 1); Set(b, 2); Set(c, 3); Set(d, 4); Set(e, 5)
`,
      },
      {
        // Flat shape, one statement under the threshold.
        name: 'light.pa.yaml',
        content: `App:
  OnStart: |-
    =Set(a, 1); Set(b, 2); Set(c, 3); Set(d, 4)
`,
      },
    ];

    const issues = centralizationIssues(files);

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ rule: 'heavy-onstart', file: 'heavy.pa.yaml', control: 'App', property: 'OnStart' });
    expect(issues[0].detail).toContain('5 statements');
    expect(issues[0].detail).toContain('App.Formulas');
    expect(issues[0].detail).toContain('StartScreen');
  });
});
