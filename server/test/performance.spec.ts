import { describe, expect, it } from 'vitest';
import { CONTROL_BUDGET_WARN, runLintRules, type LintContext } from '../src/lib/lint';
import { buildAppBundle } from '../src/lib/validator';

type File = { name: string; content: string };

const indent = (text: string, spaces: number) =>
  text.split('\n').map(line => (line ? `${' '.repeat(spaces)}${line}` : line)).join('\n');

/** Wrap control YAML in a single-screen `Screens:` root. */
const screen = (children: string, name = 'Main') => `Screens:
  ${name}:
    Children:
${indent(children, 6)}
`;

const lintIssues = (files: File[], context?: LintContext) =>
  runLintRules(buildAppBundle(files), context);
const perfIssues = (files: File[], context?: LintContext) =>
  lintIssues(files, context).filter(issue => issue.rule?.startsWith('perf-'));
const perfRules = (files: File[], context?: LintContext) =>
  perfIssues(files, context).map(issue => issue.rule);

const oneScreen = (children: string, context?: LintContext) =>
  perfRules([{ name: 'Main.pa.yaml', content: screen(children) }], context);

// ─── perf-lookup-in-gallery-template ──────────────────────────────────────
describe('perf-lookup-in-gallery-template', () => {
  const galleryChild = (childYaml: string) => `- galEmployees:
    Control: Gallery
    Properties:
      Items: =Anställda
    Children:
${indent(childYaml, 6)}`;

  it('fires on a LookUp in a direct gallery-template child', () => {
    const rules = oneScreen(galleryChild(`- lblManager:
    Control: Label
    Properties:
      Text: =LookUp(Chefer, Nummer = ThisItem.ChefNummer, Namn)`));

    expect(rules).toContain('perf-lookup-in-gallery-template');
  });

  it('fires on a Filter at gallery-template nesting depth 2', () => {
    const issues = perfIssues([{
      name: 'Main.pa.yaml',
      content: screen(galleryChild(`- grpRow:
    Control: GroupContainer
    Children:
      - lblCount:
          Control: Label
          Properties:
            Text: =CountRows(Filter(Ordrar, Anställd = ThisItem.Nummer))`)),
    }]).filter(issue => issue.rule === 'perf-lookup-in-gallery-template');

    expect(issues).toHaveLength(1);
    expect(issues[0].control).toBe('lblCount');
    expect(issues[0].property).toBe('Text');
    expect(issues[0].detail).toContain("'Ordrar'");
    expect(issues[0].level).toBe('WARN');
    expect(issues[0].fix).toContain('AddColumns');
  });

  it('stays silent outside a gallery, on the gallery Items itself, and on in-memory sources', () => {
    // Same formula, but on a control with no Gallery ancestor.
    expect(oneScreen(`- lblManager:
    Control: Label
    Properties:
      Text: =LookUp(Chefer, Nummer = 1, Namn)`)).toEqual([]);

    // The gallery's own bound query is the RIGHT place for a source query.
    expect(oneScreen(`- galEmployees:
    Control: Gallery
    Properties:
      Items: =Filter(Anställda, Aktiv = true)`)).toEqual([]);

    // In-memory first arguments never warn.
    expect(oneScreen(galleryChild(`- lblManager:
    Control: Label
    Properties:
      Text: =LookUp(colChefer, Nummer = ThisItem.ChefNummer, Namn)`))).toEqual([]);
    expect(oneScreen(galleryChild(`- lblManager:
    Control: Label
    Properties:
      Text: =LookUp(Gallery1.AllItems, Nummer = ThisItem.ChefNummer, Namn)`))).toEqual([]);
    expect(oneScreen(galleryChild(`- lblManager:
    Control: Label
    Properties:
      Text: =LookUp(Chefer, Nummer = ThisItem.ChefNummer, Namn)`), { datasources: { Chefer: 'collection' } }))
      .toEqual([]);
  });

  it('stays silent on formula-shaped prose inside a string literal or a comment', () => {
    // Correct code: the "call" is inside a double-quoted string, not a query.
    expect(oneScreen(galleryChild(`- lblHelp:
    Control: Label
    Properties:
      Text: ="call LookUp(Customers, y) here"`))).toEqual([]);

    // Correct code: the "call" is inside a // comment.
    expect(oneScreen(galleryChild(`- lblHelp2:
    Control: Label
    Properties:
      Text: |-
        =ThisItem.Namn
        // could pre-join with LookUp(Chefer, x) later`))).toEqual([]);

    // The real call on the same control still fires.
    expect(oneScreen(galleryChild(`- lblManager:
    Control: Label
    Properties:
      Text: |-
        =LookUp(Chefer, Nummer = ThisItem.ChefNummer, Namn)
        // pre-join in Items instead`))).toEqual(['perf-lookup-in-gallery-template']);
  });

  it('coexists with duplicate-formula-in-gallery on the same property', () => {
    const rules = lintIssues([{
      name: 'Main.pa.yaml',
      content: screen(galleryChild(`- lblManagerA:
    Control: Label
    Properties:
      Text: =LookUp(Chefer, Nummer = ThisItem.ChefNummer, Namn)
- lblManagerB:
    Control: Label
    Properties:
      Text: =LookUp(Chefer, Nummer = ThisItem.ChefNummer, Namn)`)),
    }]).map(issue => issue.rule);

    expect(rules).toContain('duplicate-formula-in-gallery');
    expect(rules.filter(rule => rule === 'perf-lookup-in-gallery-template')).toHaveLength(2);
  });
});

// ─── perf-onstart-no-concurrent ───────────────────────────────────────────
describe('perf-onstart-no-concurrent', () => {
  // Canonical compile-path App shape: properties nested under `Properties:`.
  const app = (onStart: string) => `App:
  Properties:
    OnStart: |-
${indent(onStart, 6)}
`;
  // Flat shape (properties directly under `App:`) stays supported.
  const flatApp = (onStart: string) => `App:
  OnStart: |-
${indent(onStart, 4)}
`;

  it('fires on three sequential ClearCollect calls with no Concurrent', () => {
    const load = '=ClearCollect(colA, Anställda); ClearCollect(colB, Möten); Collect(colC, Chefer)';
    const issues = perfIssues([{ name: 'App.pa.yaml', content: app(load) }]);

    expect(issues.map(issue => issue.rule)).toEqual(['perf-onstart-no-concurrent']);
    expect(issues[0].control).toBe('App');
    expect(issues[0].property).toBe('OnStart');
    expect(issues[0].detail).toContain('3');
    expect(issues[0].fix).toContain('Concurrent(');

    expect(perfRules([{ name: 'App.pa.yaml', content: flatApp(load) }])).toEqual(['perf-onstart-no-concurrent']);
  });

  it('merges the serial-load finding into heavy-onstart when both rules match', () => {
    const load = '=ClearCollect(colA, A); ClearCollect(colB, B); Collect(colC, C); Set(gblReady, true); Set(gblMode, "ready")';
    const issues = lintIssues([{ name: 'App.pa.yaml', content: app(load) }])
      .filter(issue => issue.rule === 'heavy-onstart' || issue.rule === 'perf-onstart-no-concurrent');

    expect(issues).toHaveLength(1);
    expect(issues[0].rule).toBe('heavy-onstart');
    expect(issues[0].detail).toContain('5 statements');
    expect(issues[0].detail).toContain('3 collections serially');
    expect(issues[0].detail).toContain('Concurrent()');
  });

  it('stays silent with Concurrent, under three loads, and outside App.OnStart', () => {
    expect(perfRules([{
      name: 'App.pa.yaml',
      content: app('=Concurrent(ClearCollect(colA, Anställda), ClearCollect(colB, Möten), ClearCollect(colC, Chefer))'),
    }])).toEqual([]);

    expect(perfRules([{
      name: 'App.pa.yaml',
      content: app('=ClearCollect(colA, Anställda); ClearCollect(colB, Möten)'),
    }])).toEqual([]);

    expect(oneScreen(`- btnLoad:
    Control: Classic/Button
    Properties:
      OnSelect: |-
        =ClearCollect(colA, Anställda); ClearCollect(colB, Möten); ClearCollect(colC, Chefer)`)).toEqual([]);
  });
});

// ─── perf-cross-screen-reference ───────────────────────────────────────────
describe('perf-cross-screen-reference', () => {
  const home: File = {
    name: 'Home.pa.yaml',
    content: screen(`- lblTitle:
    Control: Label
    Properties:
      Text: ="Hem"`, 'HomeScreen'),
  };

  it('fires when a control reaches into a control owned by another screen in the batch', () => {
    const detail: File = {
      name: 'Detail.pa.yaml',
      content: screen(`- lblEcho:
    Control: Label
    Properties:
      Text: =lblTitle.Text`, 'DetailScreen'),
    };

    const issues = perfIssues([home, detail]);

    expect(issues.map(issue => issue.rule)).toEqual(['perf-cross-screen-reference']);
    expect(issues[0].control).toBe('lblEcho');
    expect(issues[0].file).toBe('Detail.pa.yaml');
    expect(issues[0].detail).toContain('lblTitle');
    expect(issues[0].detail).toContain('Home.pa.yaml');
    expect(issues[0].level).toBe('WARN');
  });

  it('stays silent for a same-screen reference', () => {
    const sameScreen: File = {
      name: 'Home.pa.yaml',
      content: screen(`- lblTitle:
    Control: Label
    Properties:
      Text: ="Hem"
- lblEcho:
    Control: Label
    Properties:
      Text: =lblTitle.Text`, 'HomeScreen'),
    };

    expect(perfRules([sameScreen])).toEqual([]);
  });

  it('fires between two Screens roots in one multi-screen file', () => {
    const multiScreen: File = {
      name: 'Combined.pa.yaml',
      content: `Screens:
  HomeScreen:
    Children:
      - lblTitle:
          Control: Label
          Properties:
            Text: ="Hem"
  DetailScreen:
    Children:
      - lblEcho:
          Control: Label
          Properties:
            Text: =lblTitle.Text
`,
    };

    const issues = perfIssues([multiScreen]);
    expect(issues.map(issue => issue.rule)).toEqual(['perf-cross-screen-reference']);
    expect(issues[0].detail).toContain('HomeScreen');
  });

  it('skips names it cannot resolve to another screen\'s control', () => {
    const unresolvable: File = {
      name: 'Detail.pa.yaml',
      content: screen(`- lblEcho:
    Control: Label
    Properties:
      Text: =varTheme.Primary & ThisItem.Namn & Parent.Width & "lblTitle.Text"
      Color: =Color.Black`, 'DetailScreen'),
    };

    expect(perfRules([home, unresolvable])).toEqual([]);
  });

  it('Fix 11: a comment mentioning another screen\'s control is inert, a real reference is not', () => {
    // Only a `//` comment names lblTitle — nothing executes, so nothing to warn about.
    const commented: File = {
      name: 'Detail.pa.yaml',
      content: screen(`- lblEcho:
    Control: Label
    Properties:
      Text: |-
        ="Detalj"   // mirrors lblTitle.Text on the home screen`, 'DetailScreen'),
    };
    expect(perfRules([home, commented])).toEqual([]);

    // A block comment is inert too.
    const blockCommented: File = {
      name: 'Detail.pa.yaml',
      content: screen(`- lblEcho:
    Control: Label
    Properties:
      Text: =/* was lblTitle.Text */ "Detalj"`, 'DetailScreen'),
    };
    expect(perfRules([home, blockCommented])).toEqual([]);

    // The real reference still fires, even sitting right next to such a comment.
    const both: File = {
      name: 'Detail.pa.yaml',
      content: screen(`- lblEcho:
    Control: Label
    Properties:
      Text: |-
        =lblTitle.Text   // mirrors lblTitle.Text on the home screen`, 'DetailScreen'),
    };
    expect(perfRules([home, both])).toEqual(['perf-cross-screen-reference']);
  });

  it('treats a name declared in two files as ambiguous rather than cross-screen', () => {
    const duplicate: File = {
      name: 'Detail.pa.yaml',
      content: screen(`- lblTitle:
    Control: Label
    Properties:
      Text: ="Detalj"
- lblEcho:
    Control: Label
    Properties:
      Text: =lblTitle.Text`, 'DetailScreen'),
    };

    expect(perfRules([home, duplicate])).toEqual([]);
  });
});

// ─── perf-control-budget ───────────────────────────────────────────────────
describe('perf-control-budget', () => {
  const labels = (count: number) => Array.from({ length: count }, (_, i) => `- lbl${i}:
    Control: Label
    Properties:
      Text: ="x"`).join('\n');

  it('stays silent at exactly the budget and fires one control over it', () => {
    expect(CONTROL_BUDGET_WARN).toBe(300);
    expect(oneScreen(labels(CONTROL_BUDGET_WARN))).toEqual([]);

    const issues = perfIssues([{ name: 'Main.pa.yaml', content: screen(labels(CONTROL_BUDGET_WARN + 1)) }]);
    expect(issues.map(issue => issue.rule)).toEqual(['perf-control-budget']);
    expect(issues[0].detail).toContain('301');
    expect(issues[0].detail).toContain('300');
    expect(issues[0].property).toBeUndefined();
  });

  it('counts each screen separately rather than the whole batch', () => {
    const half = Math.ceil((CONTROL_BUDGET_WARN + 1) / 2);
    expect(perfRules([
      { name: 'A.pa.yaml', content: screen(labels(half), 'AScreen') },
      { name: 'B.pa.yaml', content: screen(labels(half).replace(/lbl/g, 'lblB'), 'BScreen') },
    ])).toEqual([]);
  });

  it('keeps a two-screen file with 200 controls per screen under budget', () => {
    const content = `Screens:
  FirstScreen:
    Children:
${indent(labels(200), 6)}
  SecondScreen:
    Children:
${indent(labels(200).replace(/lbl/g, 'secondLbl'), 6)}
`;

    expect(perfRules([{ name: 'Combined.pa.yaml', content }]))
      .not.toContain('perf-control-budget');
  });
});
