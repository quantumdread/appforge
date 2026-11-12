import { describe, it, expect } from 'vitest';
import {
  MAX_CONTROL_TREE_DEPTH,
  controlNodes,
  walkPaYaml,
  validateFiles,
} from '../src/lib/validator';
import {
  CORE_LINT_RULE_IDS,
  CLI_RULE_IDS,
  LINT_RULES,
  bindLintRules,
  runLintRules,
  didYouMean,
  didYouMeanDetails,
  treeContext,
} from '../src/lib/lint';
import { ANALYZER_CATALOG_DATA } from '../src/lib/catalog-data';
import {
  buildAppBundle,
  validateFiles as validateCoreFiles,
} from '../src/core/analyzer';
import {
  runLintRules as runCoreLintRules,
  type LintRule as CoreLintRule,
} from '../src/core/lint';
import { SurveyOutputBudget } from '../src/core/survey/output-budget';
import { AUTOLAYOUT_FILLPORTIONS_ROW } from './fixtures/autolayout-fillportions-row';

const wrap = (props: string) => `- lblX:
    Control: Label
    Properties:
${props.split('\n').map(l => '      ' + l).join('\n')}
`;

const lint = (yaml: string) => runLintRules(walkPaYaml(yaml, 't.pa.yaml'));
const ids = (issues: { rule?: string }[]) => issues.map(i => i.rule);

describe('lint profile membership', () => {
  // Stable local-CLI contract. The coverage manifest independently trips if a
  // listed rule stops firing over the acceptance corpus.
  const EXPECTED_CLI_RULE_IDS = [
    'inline-formula-paste-hygiene',
    'duplicate-property',
    'duplicate-formula',
    'duplicate-formula-in-gallery',
    'repeated-color-literal',
    'heavy-onstart',
    'version-pin-in-control-type',
    'a11y-tabindex-positive',
    'a11y-interactive-not-focusable',
    'a11y-icon-button-no-label',
    'a11y-inputs-missing-accessiblelabel',
    'delegation-firstn-on-source',
    'delegation-forall-writes',
    'delegation-search-caveat',
    'delegation-sharepoint-search',
    'delegation-sharepoint-in',
    'delegation-sharepoint-isblank',
    'delegation-sharepoint-text-functions',
    'delegation-sharepoint-id-operator',
    'delegation-sql-isblank',
    'delegation-excel-any',
    'perf-lookup-in-gallery-template',
    'perf-onstart-no-concurrent',
    'perf-cross-screen-reference',
    'perf-control-budget',
    'delegation-forall-truncation',
    'app-onerror-missing',
    'navigate-to-unknown-screen',
    'unreachable-screen',
    'write-followed-by-unconditional-navigation',
    'submitform-navigation-not-in-onsuccess',
    'form-without-failure-path',
    'success-notification-not-gated',
    'unknown-output-reference',
    'layoutmaxwidth-collapses-children',
    'manual-group-may-stretch',
    'yaml-comment-truncates-formula',
    'yaml-inline-comment-after-formula',
    'component-input-called-as-function',
    'addcolumns-string-column-name',
    'sortbycolumns-on-added-column',
    'select-parent-in-gallery',
    'modern-text-height-below-size',
    'index-literal-position',
    'filter-constant-or-column',
    'zero-guard-misses-blank',
    'modern-text-width-below-text',
    'new-control-superseded-type',
    'datagrid-pagination-none',
    'datagrid-delegate-search-unused',
    'formula-missing-equals',
    'block-scalar-required',
    'enum-value-invalid',
    'bare-color-name',
  ];
  // v3.20: the four REFUSE rules moved into the CLI profile, which the compile
  // gate runs (gap logged 2026-10-06). The bundled superseded advice stays
  // Worker-only (frozen CLI bytes); the gate reports new controls instead.
  const WORKER_ONLY_ADDITIONS = [
    'superseded-control-type',
    'fillportions-with-fixed-size',
    'missing-layout-min',
    'missing-align-in-container',
    'label-missing-wrap',
    'scroll-child-fillportions',
    'long-inline-formula',
  ];

  it('pins the local CLI profile to its exact 54-rule contract', () => {
    expect(CLI_RULE_IDS).toEqual(EXPECTED_CLI_RULE_IDS);
    expect(bindLintRules(ANALYZER_CATALOG_DATA, 'cli').map(rule => rule.id))
      .toEqual(EXPECTED_CLI_RULE_IDS);
  });

  it('keeps the worker profile equal to the complete core registry and documents every addition', () => {
    const workerIds = LINT_RULES.map(rule => rule.id);
    expect(workerIds).toEqual(CORE_LINT_RULE_IDS);
    expect(workerIds.filter(id => !EXPECTED_CLI_RULE_IDS.includes(id)))
      .toEqual(WORKER_ONLY_ADDITIONS);
    expect(new Set(workerIds).size).toBe(workerIds.length);
  });
});

describe('lint output budgeting', () => {
  const bundle = buildAppBundle([{ name: 'empty.pa.yaml', content: '' }]);
  const finding = (rule: string) => ({
    level: 'WARN' as const,
    file: 'empty.pa.yaml',
    line: 1,
    control: 'probe',
    type: 'Button',
    property: undefined as string | undefined,
    rule,
    detail: rule,
  });
  const rule = (
    id: string,
    execute: () => void,
    issues = [finding(id)],
  ): CoreLintRule => ({
    id,
    level: 'WARN',
    docRef: 'test',
    check() {
      execute();
      return issues;
    },
  });

  it('collects rules sequentially and stops later rules when the budget saturates', () => {
    const executions = { first: 0, second: 0, later: 0 };
    const rules = [
      rule('first', () => { executions.first++; }),
      rule('second', () => { executions.second++; }),
      rule('later', () => { executions.later++; }),
    ];
    expect(runCoreLintRules(bundle, ANALYZER_CATALOG_DATA, undefined, rules)
      .map(issue => issue.rule)).toEqual(['first', 'second', 'later']);
    expect(executions).toEqual({ first: 1, second: 1, later: 1 });

    executions.first = 0;
    executions.second = 0;
    executions.later = 0;
    const budget = new SurveyOutputBudget(393 * 2);
    expect(() => runCoreLintRules(
      bundle,
      ANALYZER_CATALOG_DATA,
      undefined,
      rules,
      budget,
    )).toThrow('survey output lower bound reached its response budget');
    expect(executions).toEqual({ first: 1, second: 1, later: 0 });
  });

  it('counts perf-onstart only after merge suppression is known', () => {
    const executions = { heavy: 0, perf: 0, retained: 0, later: 0 };
    const heavy = finding('heavy-onstart');
    heavy.property = 'OnStart';
    const perf = finding('perf-onstart-no-concurrent');
    perf.property = 'OnStart';
    perf.detail = 'OnStart issues 3 Collect/ClearCollect calls';
    const rules = [
      rule('heavy-onstart', () => { executions.heavy++; }, [heavy]),
      rule('synthetic-perf-container', () => { executions.perf++; }, [perf]),
      rule('retained', () => { executions.retained++; }),
      rule('later', () => { executions.later++; }),
    ];
    const budget = new SurveyOutputBudget(393 * 2);
    expect(() => runCoreLintRules(
      bundle,
      ANALYZER_CATALOG_DATA,
      undefined,
      rules,
      budget,
    )).toThrow('survey output lower bound reached its response budget');
    expect(executions).toEqual({ heavy: 1, perf: 1, retained: 1, later: 0 });
  });

  it('does not count lint issues again when analyzer appends them', () => {
    const observed: Array<string | undefined> = [];
    const rules = [
      rule('first', () => {}),
      rule('second', () => {}),
    ];
    const result = validateCoreFiles(
      [{ name: 'empty.pa.yaml', content: '' }],
      ANALYZER_CATALOG_DATA,
      {
        lintRules: rules,
        detectDuplicateControlNames: false,
        outputBudget: {
          observeIssue(issue) { observed.push(issue.rule); },
        },
      },
    );
    expect(result.issues.map(issue => issue.rule)).toEqual(['first', 'second']);
    expect(observed).toEqual(['first', 'second']);
  });
});

describe('control-tree fuzz guards', () => {
  it('cuts cycles in downward traversal and parent ancestry', () => {
    const parsed = walkPaYaml(inAutoLayout('Text: ="x"'), 'cycle.pa.yaml');
    const root = parsed.screens[0].roots[0];
    const child = root.children[0];
    root.children.push(root);
    const detached = { ...parsed, screens: [{ ...parsed.screens[0], roots: [root] }] };

    expect([...controlNodes(detached)].map(node => node.name)).toEqual(['grpP', 'lblC']);
    child.parent = child;
    expect(treeContext(detached).ancestorsOf(child)).toEqual([child]);
  });

  it('caps downward traversal and ancestry depth', () => {
    const parsed = walkPaYaml(wrap('Text: ="x"'), 'deep.pa.yaml');
    const root = parsed.screens[0].roots[0];
    root.children = [];
    let tail = root;
    for (let index = 0; index < MAX_CONTROL_TREE_DEPTH + 10; index++) {
      const child = {
        ...root,
        name: `node${index}`,
        parent: tail,
        children: [],
        properties: [],
      };
      tail.children = [child];
      tail = child;
    }
    const detached = { ...parsed, screens: [{ ...parsed.screens[0], roots: [root] }] };

    expect([...controlNodes(detached)]).toHaveLength(MAX_CONTROL_TREE_DEPTH + 1);
    expect(treeContext(detached).ancestorsOf(tail)).toHaveLength(MAX_CONTROL_TREE_DEPTH);
  });
});

describe('REFUSE lint rules', () => {
  it('formula-missing-equals fires on bare values, not on = or block scalars', () => {
    expect(ids(lint(wrap('Text: "hello"')))).toContain('formula-missing-equals');
    expect(ids(lint(wrap('Text: ="hello"')))).not.toContain('formula-missing-equals');
  });

  it.each([
    ['=Set(a,1);Back()', ';'],
    ['=With({x:1},x)', '{'],
    ['=Set(x, "a;b"); Navigate(s)', ';'],
    ['={a:1}', '{'],
  ])('warns only for executable inline paste punctuation: %s', (value, char) => {
    const findings = lint(wrap(`Text: ${value}`));
    expect(findings).toContainEqual(expect.objectContaining({
      rule: 'inline-formula-paste-hygiene', level: 'WARN',
      detail: `Inline formula contains '${char}' outside a string literal. This compiles and syncs as-is (Studio writes it this way); it only matters when pasting YAML through Studio's code view.`,
      fix: `For paste, use a block scalar: Text: |-  (newline)  ${value}`,
    }));
    expect(findings.filter(finding => finding.level === 'REFUSE')).toEqual([]);
  });

  it.each(['="key: value"', '=Set(a,"b: c");Back()'])('refuses only raw colon-space: %s', value => {
    const findings = lint(wrap(`Text: ${value}`));
    expect(findings).toContainEqual(expect.objectContaining({
      rule: 'block-scalar-required', level: 'REFUSE',
      detail: "inline formula contains ': ' (Power Fx string quotes do not quote YAML) — breaks YAML parsing",
      fix: `use a block scalar: Text: |-  (newline)  ${value}`,
    }));
    expect(ids(findings)).not.toContain('inline-formula-paste-hygiene');
  });

  it.each(['="a;b"', '="{a}"', '="a""b;c"', '="plain"'])('allows punctuation in complete ordinary strings: %s', value => {
    const findings = ids(lint(wrap(`Text: ${value}`)));
    expect(findings).not.toContain('block-scalar-required');
    expect(findings).not.toContain('inline-formula-paste-hygiene');
  });

  it.each([
    '|-\n  =Set(a,"b: c");Back()',
    "'=Set(a,\"b: c\");Back()'",
    '"=Set(a,1);Back()"',
  ])('exempts YAML block scalars and quoted formulas: %s', value => {
    const findings = ids(lint(wrap(`Text: ${value}`)));
    expect(findings).not.toContain('block-scalar-required');
    expect(findings).not.toContain('inline-formula-paste-hygiene');
  });

  it.each(['=$"a;{x}"', '="unclosed;'])('warns for partial syntax punctuation: %s', value => {
    const findings = lint(wrap(`Text: ${value}`));
    expect(findings).toContainEqual(expect.objectContaining({
      rule: 'inline-formula-paste-hygiene', level: 'WARN',
      fix: `For paste, use a block scalar: Text: |-  (newline)  ${value}`,
    }));
    expect(ids(findings)).not.toContain('block-scalar-required');
  });

  it.each(['=$"a: {x}"', '=$"a: {x};"'])('refuses only colon-space in partial syntax: %s', value => {
    const findings = lint(wrap(`Text: ${value}`));
    expect(findings).toContainEqual(expect.objectContaining({
      rule: 'block-scalar-required', level: 'REFUSE',
      detail: "inline formula contains ': ' (Power Fx string quotes do not quote YAML) — breaks YAML parsing",
      fix: `use a block scalar: Text: |-  (newline)  ${value}`,
    }));
    expect(ids(findings)).not.toContain('inline-formula-paste-hygiene');
  });

  it('bare-color-name fires on Color-typed prop with unprefixed known color', () => {
    expect(ids(lint(wrap('Fill: =Transparent')))).toContain('bare-color-name');
    expect(ids(lint(wrap('Fill: =Color.Transparent')))).not.toContain('bare-color-name');
    expect(ids(lint(wrap('Fill: =varThemePrimary')))).not.toContain('bare-color-name'); // unknown ident → skip
    expect(ids(lint(wrap('Text: =Transparent')))).not.toContain('bare-color-name');     // not Color-typed
  });

  it('enum-value-invalid fires on unknown enum member, skips complex formulas', () => {
    const bad = `- txtA:
    Control: TextInput
    Properties:
      DisplayMode: =DisplayMode.Editt
`;
    const good = bad.replace('Editt', 'Edit');
    const complex = bad.replace('=DisplayMode.Editt', '=If(varLocked, DisplayMode.View, DisplayMode.Edit)');
    // Qualified refs whose qualifier is NOT the enum name (Parent/Self/ThisItem/vars)
    // are valid Power Fx — the member coincidentally matches a property name. Never flag.
    const inherited = bad.replace('=DisplayMode.Editt', '=Parent.DisplayMode');
    expect(ids(lint(bad))).toContain('enum-value-invalid');
    expect(ids(lint(good))).not.toContain('enum-value-invalid');
    expect(ids(lint(complex))).not.toContain('enum-value-invalid');
    expect(ids(lint(inherited))).not.toContain('enum-value-invalid');
  });

  it('duplicate-property fires on repeated keys in one control', () => {
    expect(ids(lint(wrap('Text: ="a"\nText: ="b"')))).toContain('duplicate-property');
  });

  it('quoted formula does not false-REFUSE (formula-missing-equals / block-scalar-required)', () => {
    // Mirrors cli/validator-test-fixture.pa.yaml lines ~30,37
    // (Items: '=Table({n: 1})') — a YAML-quoted formula whose parsed value starts
    // with '=' and contains '{', '}' and ': ', all neutralised by the quoting.
    const r = ids(lint(wrap("Items: '=Table({n: 1})'")));
    expect(r).not.toContain('formula-missing-equals');
    expect(r).not.toContain('block-scalar-required');
  });

  it('inline comment on a plain scalar does not false-REFUSE block-scalar-required', () => {
    // Mirrors the fixture's `WrapCount: =3   # verified: true (...)` — the comment
    // (which contains ': ') must not be captured as part of the value.
    const r = ids(lint(wrap('WrapCount: =3   # verified: true (2026-05-10 campaign)')));
    expect(r).not.toContain('block-scalar-required');
    expect(r).not.toContain('formula-missing-equals');
  });

  it('lint issues flow through validateFiles and set REFUSE in summary', () => {
    const r = validateFiles([{ name: 't.pa.yaml', content: wrap('Text: "no equals"') }]);
    expect(r.issues.some(i => i.rule === 'formula-missing-equals' && i.level === 'REFUSE')).toBe(true);
    expect(r.summary.refuse).toBeGreaterThan(0);
  });
});

const inAutoLayout = (childProps: string, parentProps = '') => `- grpP:
    Control: GroupContainer
    Variant: AutoLayout
    Properties:
${parentProps.split('\n').filter(Boolean).map(l => '      ' + l).join('\n') || '      Fill: =Color.White'}
    Children:
      - lblC:
          Control: Label
          Properties:
${childProps.split('\n').map(l => '            ' + l).join('\n')}
`;

describe('WARN lint rules', () => {
  it('reports pins as observations with a structured control list and keeps bare types silent', () => {
    const yaml = wrap('Text: ="hello"');
    expect(ids(lint(yaml))).not.toContain('version-pin-in-control-type');
    const pinned = lint(yaml.replace('Control: Label', 'Control: Label@1.0.0'))
      .find(issue => issue.rule === 'version-pin-in-control-type');
    expect(pinned).toMatchObject({ level: 'WARN', controls: ['lblX'] });
    expect(pinned!.detail).toBe('1 control type(s) carry @version pins across 1 file(s) — observed, not judged: a suffix alone establishes neither lag nor incompatibility; see the version-lag inventory for evidence-backed migrations. Pins are optional in authored YAML: the compile path strips them, so new code can use bare control types. Files: t.pa.yaml. Pinned: lblX');
    expect(pinned!.detail).not.toContain('mark staleness');
  });

  it('advises once per bundle on superseded control types and stays silent for Modern and classic ones', () => {
    const yaml = wrap('Text: ="hello"');
    expect(ids(lint(yaml))).not.toContain('superseded-control-type');
    expect(ids(lint(yaml.replace('Control: Label', 'Control: ModernText')))).not.toContain('superseded-control-type');
    const findings = lint(yaml.replace('Control: Label', 'Control: Text'))
      .filter(issue => issue.rule === 'superseded-control-type');
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ level: 'WARN', controls: ['lblX'] });
    expect(findings[0].detail).toBe('1 control(s) use types Microsoft has superseded: Text (1) → ModernText. Existing controls keep working; Microsoft recommends the Modern type for new controls. Controls: lblX');
  });

  it('keeps fillportions-with-fixed-size silent for an AutoLayout row with fixed heights', () => {
    const findings = (yaml: string) => lint(yaml)
      .filter(issue => issue.rule === 'fillportions-with-fixed-size');

    expect(findings(AUTOLAYOUT_FILLPORTIONS_ROW)).toEqual([]);
    expect(findings(inAutoLayout(
      'FillPortions: =1\nWidth: =240\nHeight: =40',
      'LayoutDirection: =LayoutDirection.Horizontal',
    ))).toHaveLength(1);
    expect(findings(inAutoLayout(
      'FillPortions: =1\nHeight: =40\nWidth: =240',
      'LayoutDirection: =LayoutDirection.Vertical',
    ))).toHaveLength(1);
  });

  it('fillportions-with-fixed-size skips unknown directions and formula-valued sizing facts', () => {
    const rules = (child: string, parent: string) => ids(lint(inAutoLayout(child, parent)));
    expect(rules('FillPortions: =1\nWidth: =240', 'Fill: =Color.White'))
      .not.toContain('fillportions-with-fixed-size');
    expect(rules('FillPortions: =1\nWidth: =240', 'LayoutDirection: =If(gblWide, LayoutDirection.Horizontal, LayoutDirection.Vertical)'))
      .not.toContain('fillportions-with-fixed-size');
    expect(rules('FillPortions: =If(gblWide, 1, 0)\nWidth: =240', 'LayoutDirection: =LayoutDirection.Horizontal'))
      .not.toContain('fillportions-with-fixed-size');
    expect(rules('FillPortions: =1\nWidth: =Parent.Width / 2', 'LayoutDirection: =LayoutDirection.Horizontal'))
      .not.toContain('fillportions-with-fixed-size');
  });

  it('missing-layout-min on AutoLayout children', () => {
    expect(ids(lint(inAutoLayout('Text: ="x"')))).toContain('missing-layout-min');
    expect(ids(lint(inAutoLayout('LayoutMinWidth: =0\nLayoutMinHeight: =0\nText: ="x"')))).not.toContain('missing-layout-min');
  });

  it('missing-align-in-container on AutoLayout children', () => {
    expect(ids(lint(inAutoLayout('Text: ="x"')))).toContain('missing-align-in-container');
    expect(ids(lint(inAutoLayout('AlignInContainer: =AlignInContainer.Start\nText: ="x"')))).not.toContain('missing-align-in-container');
  });

  it('label-missing-wrap', () => {
    expect(ids(lint(wrap('Text: ="x"')))).toContain('label-missing-wrap');
    expect(ids(lint(wrap('Text: ="x"\nWrap: =false')))).not.toContain('label-missing-wrap');
  });

  it('scroll-child-fillportions', () => {
    const y = inAutoLayout('FillPortions: =1', 'LayoutOverflowY: =LayoutOverflow.Scroll');
    expect(ids(lint(y))).toContain('scroll-child-fillportions');
    const ok = inAutoLayout('FillPortions: =0\nHeight: =600', 'LayoutOverflowY: =LayoutOverflow.Scroll');
    expect(ids(lint(ok))).not.toContain('scroll-child-fillportions');
  });

  it('long-inline-formula', () => {
    expect(ids(lint(wrap(`Text: ="${'x'.repeat(130)}"`)))).toContain('long-inline-formula');
  });

  it('WARN rules set gate_decision PROCEED_WITH_WARNINGS not BLOCK', () => {
    const r = validateFiles([{ name: 't.pa.yaml', content: inAutoLayout('Text: ="x"\nWrap: =false') }]);
    const lintWarns = r.issues.filter(i => i.rule && i.level === 'WARN');
    expect(lintWarns.length).toBeGreaterThan(0);
    expect(r.issues.filter(i => i.rule && i.level === 'REFUSE')).toHaveLength(0);
  });
});

describe('did-you-mean + PA2108 enrichment', () => {
  it('derives bounded reason and distance metadata without changing the public suggestion', () => {
    expect(didYouMeanDetails('onselect', ['OnSelect', 'OnChange'])).toEqual({
      candidate: 'OnSelect',
      reason_code: 'case-mismatch',
      edit_distance_bucket: '0',
    });
    expect(didYouMeanDetails('BoderColor', ['BorderColor', 'Fill'])).toEqual({
      candidate: 'BorderColor',
      reason_code: 'edit-distance',
      edit_distance_bucket: '1',
    });
    expect(didYouMeanDetails('Texd', ['Text', 'Texa'])).toEqual({
      candidate: 'Text',
      reason_code: 'edit-distance',
      edit_distance_bucket: '1',
    });
    expect(didYouMeanDetails('Zzzzz', ['BorderColor', 'Fill'])).toBeNull();
  });

  it('didYouMean prefers case-insensitive exact match', () => {
    expect(didYouMean('onselect', ['OnSelect', 'OnChange'])).toBe('OnSelect');
  });
  it('didYouMean finds distance<=2 matches, rejects far ones', () => {
    expect(didYouMean('BoderColor', ['BorderColor', 'Fill'])).toBe('BorderColor');
    expect(didYouMean('Zzzzz', ['BorderColor', 'Fill'])).toBeNull();
  });
  it('property-not-in-catalog issues carry did_you_mean', () => {
    const r = validateFiles([{ name: 't.pa.yaml', content: wrap('Texd: ="x"') }]);
    const iss = r.issues.find(i => i.detail === 'property-not-in-catalog' || i.property === 'Texd')!;
    expect(iss).toMatchObject({
      rule: 'unknown-property',
      did_you_mean: 'Text',
      nearMiss: true,
      nearMissTelemetry: {
        candidate: 'Text', reason_code: 'edit-distance', edit_distance_bucket: '1',
      },
    });
  });
  it('PA2108 trap pairs get the documented fix message', () => {
    const y = `- txtQ:
    Control: TextInput
    Properties:
      Default: ="x"
`;
    const r = validateFiles([{ name: 't.pa.yaml', content: y }]);
    const iss = r.issues.find(i => i.property === 'Default')!;
    expect(iss.level).toBe('REFUSE');
    expect(iss.rule).toBe('pa2108-trap');
    expect(iss.fix).toContain('Value');
  });
  it('unknown control type gets did_you_mean', () => {
    const y = `- b1:
    Control: Buton
    Properties:
      Text: ="x"
`;
    const r = validateFiles([{ name: 't.pa.yaml', content: y }]);
    const iss = r.issues.find(i => i.type === 'Buton')!;
    expect(iss).toMatchObject({
      rule: 'unknown-control',
      did_you_mean: 'Button',
      nearMiss: true,
      nearMissTelemetry: {
        candidate: 'Button', reason_code: 'edit-distance', edit_distance_bucket: '1',
      },
    });
  });
});
