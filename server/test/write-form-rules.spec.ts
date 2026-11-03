import { describe, expect, it } from 'vitest';
import { walkPaYaml } from '../src/core/analyzer';
import { runLintRules, type LintContext } from '../src/core/lint';
import { WRITE_FORM_RULES } from '../src/core/write-form-rules';
import { ANALYZER_CATALOG_DATA } from '../src/lib/catalog-data';

function behavior(formula: string, property = 'OnSelect'): string {
  return `Screens:
  Main:
    Children:
      - btnSave:
          Control: ModernButton
          Properties:
            ${property}: |-
${formula.split('\n').map(line => `              ${line}`).join('\n')}
`;
}

function findings(yaml: string, context: LintContext = {}) {
  return runLintRules(walkPaYaml(yaml, 'write-form.pa.yaml'), ANALYZER_CATALOG_DATA, context, WRITE_FORM_RULES);
}

function submitted(formProperties = '', extraControls = '', formula = '=SubmitForm(frmOrders)'): string {
  return `${behavior(formula)}      - frmOrders:
          Control: Form
${formProperties ? `          Properties:\n${formProperties.split('\n').map(line => `            ${line}`).join('\n')}\n` : ''}${extraControls}`;
}

function display(type: string, property: string, formula: string): string {
  return `      - errorDisplay:
          Control: ${type}
          Properties:
            ${property}: |-
              ${formula}
`;
}

describe('write and form lifecycle warnings', () => {
  it('warns when a direct datasource Patch is immediately followed by navigation', () => {
    const issues = findings(behavior('=Patch(Orders, Defaults(Orders), {Title: "New"}); Navigate(Done)'), {
      datasources: { Orders: 'sql' },
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      level: 'WARN', rule: 'write-followed-by-unconditional-navigation',
      control: 'btnSave', property: 'OnSelect',
    });
    expect(issues[0].evidence).toBeUndefined();
  });

  it('ties SubmitForm navigation advice to the submitted form lifecycle', () => {
    const yaml = `${behavior('=SubmitForm(frmOrders); Back()')}      - frmOrders:
          Control: Form
          Properties:
            OnFailure: =false
`;
    const issues = findings(yaml);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      level: 'WARN', rule: 'submitform-navigation-not-in-onsuccess',
      control: 'btnSave', property: 'OnSelect',
    });
    expect(issues[0].fix).toContain('frmOrders.OnSuccess');
  });

  it('examines an authored screen OnVisible without adding it to legacy control traversal', () => {
    const yaml = `Screens:
  Main:
    Properties:
      OnVisible: |-
        =Patch(Orders, Defaults(Orders), {}); Back()
`;
    const issues = findings(yaml, { datasources: { Orders: 'sql' } });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      level: 'WARN', rule: 'write-followed-by-unconditional-navigation',
      control: 'Main', type: 'Screen', property: 'OnVisible', line: 4,
    });
  });

  it('warns for a submitted Form with no explicit failure handler or recognized error display', () => {
    const yaml = `${behavior('=SubmitForm(frmOrders)')}      - frmOrders:
          Control: Form
`;
    expect(findings(yaml)).toEqual([expect.objectContaining({
      level: 'WARN', rule: 'form-without-failure-path', control: 'frmOrders',
    })]);
  });

  it('warns on an exact success notification immediately after a synchronous write', () => {
    const issues = findings(behavior('=Patch(Orders, {}, {}); Notify("Saved", NotificationType.Success)'), {
      datasources: { Orders: 'sql' },
    });
    expect(issues).toEqual([expect.objectContaining({
      level: 'WARN', rule: 'success-notification-not-gated', control: 'btnSave', property: 'OnSelect',
    })]);
    expect(issues[0].fix).toContain('synchronous');
  });

  it.each([
    ['scalar barrier', '=Patch(Orders, {}, {}); true; Back()'],
    ['assignment barrier', '=Patch(Orders, {}, {}); value := 1; Back()'],
    ['assignment containing write', '=value := Patch(Orders, {}, {}); Back()'],
    ['conditional write', '=If(valid, Patch(Orders, {}, {})); Back()'],
    ['concurrent write', '=Concurrent(Patch(Orders, {}, {})); Back()'],
    ['IfError continuation', '=IfError(Patch(Orders, {}, {}), false, Back())'],
    ['With local scope', '=With({Orders: {}}, Patch(Orders, {}, {})); Back()'],
    ['qualified write', '=Connector.Patch(Orders, {}, {}); Back()'],
    ['qualified continuation', '=Patch(Orders, {}, {}); Connector.Back()'],
    ['record merge', '=Patch(Orders, {}); Back()'],
    ['record literal merge', '=Patch({a: 1}, {b: 2}, {c: 3}); Back()'],
    ['compound target', '=Patch(Orders.Data, {}, {}); Back()'],
    ['call result projection', '=Patch(Orders, {}, {}).ID; Back()'],
    ['empty argument', '=Patch(Orders, , {}); Back()'],
    ['string', '="Patch(Orders, {}, {}); Back()"'],
    ['missing formula marker', 'Patch(Orders, {}, {}); Back()'],
    ['comment', '=false // Patch(Orders, {}, {}); Back()'],
    ['partial', '=Patch(Orders, {}, {}); Back('],
    ['interpolation', '=Patch(Orders, {}, {}); Back(); $"{value}"'],
    ['locale arguments', '=Patch(Orders; {}; {}); Back()'],
    ['locale chaining', '=Patch(Orders, {}, {});; Back()'],
    ['ClearCollect', '=ClearCollect(Orders, {}); Back()'],
  ] as const)('does not infer an unsafe write chain through %s', (_label, formula) => {
    expect(findings(behavior(formula), { datasources: { Orders: 'sql' } })).toEqual([]);
  });

  it.each([
    ['Set', '=Set(Orders, {}); Patch(Orders, {}, {}); Back()'],
    ['case-folded Set', '=Set(orders, {}); Patch(Orders, {}, {}); Back()'],
    ['context record', '=UpdateContext({Orders: {ID: 1}}); Patch(Orders, {}, {}); Back()'],
    ['navigation context', '=Navigate(Main, ScreenTransition.None, {Orders: {ID: 1}}); Patch(Orders, {}, {}); Back()'],
    ['Clear', '=Clear(Orders); Patch(Orders, {}, {}); Back()'],
    ['ClearCollect', '=ClearCollect(Orders, {}); Patch(Orders, {}, {}); Back()'],
  ] as const)('excludes known %s targets even when a datasource map collides', (_label, formula) => {
    expect(findings(behavior(formula), { datasources: { Orders: 'sql' } })).toEqual([]);
  });

  it('excludes an App named formula even when its datasource map collides', () => {
    const yaml = `App:
  Properties:
    Formulas: |-
      =Orders = {};
${behavior('=Patch(Orders, {}, {}); Back()')}`;
    expect(findings(yaml, { datasources: { Orders: 'sql' } })).toEqual([]);
  });

  it.each(['Collect', 'Remove', 'RemoveIf'])('requires authoritative noncollection identity for %s', verb => {
    const yaml = behavior(`=${verb}(Orders, {}); Back()`);
    expect(findings(yaml)).toEqual([]);
    expect(findings(yaml, { datasources: { Orders: 'collection' } })).toEqual([]);
    expect(findings(yaml, { exportDatasources: { Orders: 'collection' } })).toEqual([]);
    expect(findings(yaml, { exportDatasources: { Orders: 'sql' } })).toHaveLength(1);
  });

  it('keeps unresolved Patch advice conditional and excludes exported collections', () => {
    const yaml = behavior('=Patch(Orders, {}, {}); Back()');
    expect(findings(yaml)[0].detail).toContain('If Orders is a datasource');
    expect(findings(yaml, { exportDatasources: { Orders: 'collection' } })).toEqual([]);
    expect(findings(behavior('=Patch(colOrders, {}, {}); Back()'))).toEqual([]);
  });

  it('limits each write-chain warning to one finding per property', () => {
    const yaml = behavior('=pAtCh(Orders, {}, {}); bAcK(); Patch(Orders, {}, {}); Back()');
    expect(findings(yaml, { datasources: { Orders: 'sql' } })).toHaveLength(1);
    expect(findings(behavior('=Patch(Orders, {}, {}); Back()', 'Text'))).toEqual([]);
  });

  it.each([
    ['Label', 'Text'], ['Text', 'Text'], ['ModernText', 'Text'], ['HtmlViewer', 'HtmlText'],
  ] as const)('recognizes executable form-error display in %s.%s', (type, property) => {
    const yaml = submitted('', display(type, property, '=Coalesce(\'frmOrders\'.Error, "")'));
    expect(findings(yaml)).toEqual([]);
  });

  it.each([
    ['nondisplay property', 'Label', 'Visible', '=frmOrders.Error'],
    ['behavior read', 'Label', 'OnSelect', '=frmOrders.Error'],
    ['string lookalike', 'Label', 'Text', '="frmOrders.Error"'],
    ['comment lookalike', 'Label', 'Text', '=false /* frmOrders.Error */'],
    ['nonformula text', 'Label', 'Text', 'frmOrders.Error'],
    ['qualified form name', 'Label', 'Text', '=Other.frmOrders.Error'],
    ['With alias', 'Label', 'Text', '=With({frmOrders: {}}, frmOrders.Error)'],
    ['ForAll row scope', 'Label', 'Text', '=ForAll(Rows, frmOrders.Error)'],
    ['As alias', 'Label', 'Text', '=Concat(Rows As frmOrders, frmOrders.Error)'],
    ['partial display', 'Label', 'Text', '=Coalesce(frmOrders.Error,'],
    ['prototype-like control type', '__proto__', 'Text', '=frmOrders.Error'],
    ['constructor-like control type', 'constructor', 'Text', '=frmOrders.Error'],
  ] as const)('does not count %s as form-error presentation', (_label, type, property, formula) => {
    expect(findings(submitted('', display(type, property, formula))).map(issue => issue.rule)).toEqual(['form-without-failure-path']);
  });

  it.each(['=false', '=Blank()', '=""', '=Notify("Review")', '=First('])('does not grade a nonempty or unknown OnFailure: %s', handler => {
    expect(findings(submitted(`OnFailure: ${handler}`))).toEqual([]);
  });

  it.each(['', '=', '= /* comment */'])('recognizes a lexically empty OnFailure: %s', handler => {
    expect(findings(submitted(`OnFailure: ${handler}`)).map(issue => issue.rule)).toEqual(['form-without-failure-path']);
  });

  it('skips repeated handler properties and does not trust repeated display properties', () => {
    expect(findings(submitted('OnFailure: =\nOnFailure: ='))).toEqual([]);
    const duplicateDisplay = `      - errorDisplay:
          Control: Label
          Properties:
            Text: =frmOrders.Error
            Text: ="Different"
`;
    expect(findings(submitted('', duplicateDisplay)).map(issue => issue.rule)).toEqual(['form-without-failure-path']);
    const duplicateBehavior = behavior('=SubmitForm(frmOrders); Back()').replace('            OnSelect: |-', '            OnSelect: =false\n            OnSelect: |-');
    expect(findings(`${duplicateBehavior}      - frmOrders:\n          Control: Form\n`)).toEqual([]);
  });

  it('does not require a failure path on an unsubmitted Form', () => {
    expect(findings(submitted('', '', '=Back()'))).toEqual([]);
  });

  it.each(['FormViewer', 'EntityForm', 'CustomForm'])('does not resolve %s as a Form lifecycle target', type => {
    const yaml = submitted('', '', '=SubmitForm(frmOrders); Back(); SubmitForm(frmOrders); Notify("Saved", NotificationType.Success)')
      .replace('Control: Form', `Control: ${type}`);
    expect(findings(yaml)).toEqual([]);
  });

  it('uses the same unique Form resolution for navigation, failure and notifications', () => {
    const duplicate = `      - frmOrders:
          Control: Label
`;
    const sequence = '=SubmitForm(frmOrders); Back(); SubmitForm(frmOrders); Notify("Saved", NotificationType.Success)';
    expect(findings(submitted('', duplicate, sequence))).toEqual([]);
    expect(findings(submitted('', '', sequence.replaceAll('frmOrders', 'MissingForm')))).toEqual([]);
    expect(findings(submitted('', '', sequence.replaceAll('frmOrders', 'If(valid, frmOrders, OtherForm)')))).toEqual([]);
  });

  it('recognizes a conditional submission for failure presentation without treating it as a direct chain', () => {
    expect(findings(submitted('', '', '=If(valid, SubmitForm(frmOrders)); Back()')).map(issue => issue.rule))
      .toEqual(['form-without-failure-path']);
  });

  it('does not blanket-exempt OnSuccess when it submits another Form', () => {
    const yaml = `Screens:
  Main:
    Children:
      - firstForm:
          Control: Form
          Properties:
            OnSuccess: |-
              =SubmitForm(frmOrders); Back()
      - frmOrders:
          Control: Form
          Properties:
            OnFailure: =false
`;
    expect(findings(yaml)).toEqual([expect.objectContaining({
      rule: 'submitform-navigation-not-in-onsuccess', control: 'firstForm', property: 'OnSuccess',
    })]);
    expect(findings(submitted('OnFailure: =false\nOnSuccess: =Back()'))).toEqual([]);
  });

  it('tailors success notification advice to the uniquely submitted Form', () => {
    const yaml = submitted('OnFailure: =false', '', '=SubmitForm(\'frmOrders\'); Notify("Saved", NotificationType.Success)');
    const issues = findings(yaml);
    expect(issues).toEqual([expect.objectContaining({ rule: 'success-notification-not-gated' })]);
    expect(issues[0].fix).toContain('frmOrders.OnSuccess');
    expect(findings(submitted('OnFailure: =false\nOnSuccess: =Notify("Saved", NotificationType.Success)'))).toEqual([]);
  });

  it.each([
    'Notify("Success", NotificationType.Error)',
    'Notify("Success")',
    'Notify("Saved", "NotificationType.Success")',
    'Notify("Saved", Other.NotificationType.Success)',
    'Notify("Saved", NotificationType.SuccessExtra)',
    'Notify("Saved", If(valid, NotificationType.Success, NotificationType.Error))',
    'Connector.Notify("Saved", NotificationType.Success)',
    'If(valid, Notify("Saved", NotificationType.Success))',
    'true; Notify("Saved", NotificationType.Success)',
  ])('does not infer gated-success semantics from %s', continuation => {
    expect(findings(behavior(`=Patch(Orders, {}, {}); ${continuation}`), { datasources: { Orders: 'sql' } })).toEqual([]);
  });

  it('deduplicates write warnings for repeated control/property identities', () => {
    const yaml = `${behavior('=Patch(Orders, {}, {}); Back()')}      - btnSave:
          Control: ModernButton
          Properties:
            OnSelect: |-
              =Patch(Orders, {}, {}); Back()
`;
    expect(findings(yaml, { datasources: { Orders: 'sql' } })).toHaveLength(1);
  });
});
