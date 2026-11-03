import { describe, expect, it } from 'vitest';
import {
  LINT_RULES,
  getLintOpportunities,
  runLintRules,
} from '../src/lib/lint';
import { controlNodes, validateFiles, walkPaYaml } from '../src/lib/validator';
import { getYamlRules, listRuleDocuments } from '../src/tools/rules';
import { validateYaml } from '../src/tools/validator';

const control = (name: string, type: string, properties: string) => `      - ${name}:
          Control: ${type}
          Properties:
${properties.split('\n').map(line => `            ${line}`).join('\n')}
`;

const screen = (...controls: string[]) => `Screens:
  Main:
    Children:
${controls.join('')}`;

const a11yIssues = (yaml: string, file = 'screen.pa.yaml') =>
  runLintRules(walkPaYaml(yaml, file)).filter(issue => issue.rule?.startsWith('a11y-'));

describe('accessibility WARN family', () => {
  it('registers all four rules as WARN-only with the accessibility reference', () => {
    const rules = LINT_RULES.filter(rule => rule.id.startsWith('a11y-'));
    expect(rules.map(rule => rule.id)).toEqual([
      'a11y-tabindex-positive',
      'a11y-interactive-not-focusable',
      'a11y-icon-button-no-label',
      'a11y-inputs-missing-accessiblelabel',
    ]);
    expect(rules.every(rule => rule.level === 'WARN')).toBe(true);
    expect(rules.every(rule => rule.docRef === 'accessibility-rules.md')).toBe(true);
  });

  it('aggregates authored version pins once per file as a disclosed WARN', () => {
    const yaml = screen(
      ...Array.from({ length: 7 }, (_, index) =>
        control(`btnPinned${index + 1}`, `Button@${index + 1}.0.0`, 'OnSelect: =true')),
      control('btnBare', 'Button', 'OnSelect: =true'),
    );
    const bundle = walkPaYaml(yaml, 'pinned.pa.yaml');
    const parsed = [...controlNodes(bundle)];
    expect(parsed.filter(item => item.authoredTypePinned).map(item => item.name)).toEqual([
      'btnPinned1', 'btnPinned2', 'btnPinned3', 'btnPinned4', 'btnPinned5', 'btnPinned6', 'btnPinned7',
    ]);

    const issues = runLintRules(bundle)
      .filter(issue => issue.rule === 'version-pin-in-control-type');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ level: 'WARN', file: 'pinned.pa.yaml', control: 'btnPinned1' });
    expect(issues[0]).not.toHaveProperty('property');
    expect(issues[0].detail).toContain('7 control type(s) carry @version pins');
    expect(issues[0].detail).toContain('btnPinned1, btnPinned2, btnPinned3, btnPinned4, btnPinned5, …');
    expect(issues[0].detail).not.toContain('btnPinned6');
    expect(issues[0].controls).toEqual([
      'btnPinned1', 'btnPinned2', 'btnPinned3', 'btnPinned4', 'btnPinned5', 'btnPinned6', 'btnPinned7',
    ]);
    expect(LINT_RULES.find(rule => rule.id === 'version-pin-in-control-type'))
      .toMatchObject({ level: 'WARN', docRef: 'generator-rules.md' });
  });

  it('flags only positive literal TabIndex values and names the authored value', () => {
    const issues = a11yIssues(screen(
      control('lblPositive', 'Label', 'Text: ="Positive"\nWrap: =false\nTabIndex: =3'),
      control('lblZero', 'Label', 'Text: ="Zero"\nWrap: =false\nTabIndex: =0'),
      control('lblNegative', 'Label', 'Text: ="Negative"\nWrap: =false\nTabIndex: =-1'),
      control('lblFormula', 'Label', 'Text: ="Formula"\nWrap: =false\nTabIndex: =If(gblEdit, 0, -1)'),
      control('lblDecimal', 'Label', 'Text: ="Decimal"\nWrap: =false\nTabIndex: =1.5'),
    ));

    const positive = issues.filter(issue => issue.rule === 'a11y-tabindex-positive');
    expect(positive).toHaveLength(1);
    expect(positive[0]).toMatchObject({ level: 'WARN', control: 'lblPositive', property: 'TabIndex' });
    expect(positive[0]).not.toHaveProperty('controls');
    expect(positive[0].detail).toContain('TabIndex 3');
    expect(positive[0].fix).toContain('0 (focusable) or -1 (skipped)');
  });

  it('checks every duplicate TabIndex property and counts each literal opportunity', () => {
    const yaml = screen(control(
      'lblDuplicateTabIndex',
      'Label',
      'Text: ="Order"\nWrap: =false\nTabIndex: =0\nTabIndex: =3',
    ));
    const result = validateFiles([{ name: 'duplicate.pa.yaml', content: yaml }]);

    expect(result.issues.filter(issue => issue.rule === 'a11y-tabindex-positive')).toHaveLength(1);
    expect(result.issues.find(issue => issue.rule === 'a11y-tabindex-positive')?.detail)
      .toContain('TabIndex 3');
    expect(result.issues.filter(issue => issue.rule === 'duplicate-property')).toHaveLength(1);
    expect(result.issues.find(issue => issue.rule === 'duplicate-property')?.level).toBe('REFUSE');
    expect(result.opportunities()['a11y-tabindex-positive']).toBe(2);
  });

  it('skips TabIndex properties on component definitions and CanvasComponent instances', () => {
    const yaml = `ComponentDefinitions:
  cStepper:
    DefinitionType: CanvasComponent
    CustomProperties:
      TabIndex:
        PropertyKind: Input
        DataType: Number
        Default: =3
    Properties:
      TabIndex: =3
Screens:
  Main:
    Children:
      - cmpStepper:
          Control: CanvasComponent
          ComponentName: cStepper
          Properties:
            TabIndex: =3
`;
    const controls = walkPaYaml(yaml, 'components.pa.yaml');

    expect(runLintRules(controls).filter(issue => issue.rule === 'a11y-tabindex-positive')).toEqual([]);
    expect(getLintOpportunities(controls)['a11y-tabindex-positive']).toBe(0);
  });

  it('flags clickable classic controls that are unreachable and honors every focus exemption', () => {
    const issues = a11yIssues(screen(
      control('lblMissing', 'Label', 'Text: ="Open"\nWrap: =false\nOnSelect: =Set(gblOpen, true)'),
      control('imgNegative', 'Image', 'OnSelect: =Set(gblOpen, true)\nTabIndex: =-1\nAccessibleLabel: ="Open"'),
      control('imgFormula', 'Image', 'OnSelect: =Set(gblOpen, true)\nTabIndex: =gblTabIndex\nAccessibleLabel: ="Open"'),
      control('imgSelectParent', 'Image', 'OnSelect: =  Select ( Parent )'),
      control('imgSelectParentSemi', 'Image', 'OnSelect: =Select(Parent);'),
      control('lblFalse', 'Label', 'Text: ="Static"\nWrap: =false\nOnSelect: = false'),
      control('lblTrue', 'Label', 'Text: ="Static"\nWrap: =false\nOnSelect: = true'),
      control('lblEmpty', 'Label', 'Text: ="Static"\nWrap: =false\nOnSelect: ='),
      control('modernIcon', 'ModernIcon', 'OnSelect: =Set(gblOpen, true)\nAccessibleLabel: ="Open"'),
    ));

    expect(issues.filter(issue => issue.rule === 'a11y-interactive-not-focusable')
      .map(issue => issue.control)).toEqual(['lblMissing', 'imgNegative']);
  });

  it('flags interactive iconic controls without labels while exempting decoration, formulas, Label buttons, and Select(Parent)', () => {
    const issues = a11yIssues(screen(
      control('imgAction', 'Image', 'OnSelect: =Set(gblOpen, true)\nTabIndex: =0'),
      control('shapeBlank', 'Rectangle', 'OnSelect: =Set(gblOpen, true)\nTabIndex: =0\nAccessibleLabel: ="   "'),
      control('imgFormulaLabel', 'Image', 'OnSelect: =Set(gblOpen, true)\nTabIndex: =0\nAccessibleLabel: =If(gblEdit, "Edit", "Open")'),
      control('imgDecorative', 'Image', 'TabIndex: =-1\nAccessibleLabel: =""'),
      control('imgSelectParent', 'Image', 'OnSelect: =Select(Parent)'),
      control('imgSelectParentSemi', 'Image', 'OnSelect: =Select(Parent);'),
      control('imgTrue', 'Image', 'OnSelect: =true'),
      control('lblAction', 'Label', 'Text: ="Open"\nWrap: =false\nOnSelect: =Set(gblOpen, true)\nTabIndex: =0'),
    ));

    expect(issues.filter(issue => issue.rule === 'a11y-icon-button-no-label')
      .map(issue => issue.control)).toEqual(['imgAction', 'shapeBlank']);
  });

  it('aggregates catalog-gated unlabeled inputs once per file, including dump-sourced controls', () => {
    const result = validateFiles([
      {
        name: 'first.pa.yaml',
        content: screen(
          control('txtName', 'TextInput', 'AccessibleLabel:'),
          control('dateStart', 'DatePicker', 'AccessibleLabel: ="  "'),
          control('galOrders', 'Gallery', 'AccessibleLabel: =If(gblCompact, "Orders", "Order list")'),
          control('classicCheck', 'Classic/CheckBox', 'Default: =false'),
        ),
      },
      {
        name: 'second.pa.yaml',
        content: screen(control('modernCheck', 'ModernCheckbox', 'Default: =false')),
      },
    ]);

    const issues = result.issues.filter(issue => issue.rule === 'a11y-inputs-missing-accessiblelabel');
    expect(issues).toHaveLength(2);
    expect(issues[0]).toMatchObject({
      level: 'WARN', file: 'first.pa.yaml', control: 'txtName',
    });
    expect(issues[0]).not.toHaveProperty('property');
    expect(issues[0].detail).toContain('2 control(s)');
    expect(issues[0].detail).toContain('txtName, dateStart');
    expect(issues[0].controls).toEqual(['txtName', 'dateStart']);
    expect(issues[1].detail).toContain('modernCheck');
    expect(issues.some(issue => issue.detail.includes('classicCheck'))).toBe(false);
  });

  it('lists five prose names but carries all six controls at the aggregate boundary', () => {
    const yaml = screen(...Array.from({ length: 6 }, (_, index) =>
      control(`txt${index + 1}`, 'TextInput', 'AccessibleLabel:')));
    const issue = a11yIssues(yaml).find(candidate =>
      candidate.rule === 'a11y-inputs-missing-accessiblelabel');

    expect(issue?.detail).toContain('6 control(s)');
    expect(issue?.detail).toContain('txt1, txt2, txt3, txt4, txt5, …');
    expect(issue?.detail).not.toContain('txt6');
    expect(issue?.controls).toEqual(['txt1', 'txt2', 'txt3', 'txt4', 'txt5', 'txt6']);
  });

  it('keeps a realistic clean fixture free of every accessibility finding', () => {
    const clean = screen(
      control('btnSave', 'Button', 'OnSelect: =Set(gblSaved, true)'),
      control('imgDecoration', 'Image', 'AccessibleLabel: =""\nTabIndex: =-1'),
      control('txtCustomer', 'TextInput', 'AccessibleLabel: ="Customer name"'),
      control('lblAction', 'Label', 'Text: ="Open details"\nWrap: =false\nOnSelect: =Set(gblOpen, true)\nTabIndex: =0'),
      control('modernAction', 'ModernIcon', 'OnSelect: =Set(gblOpen, true)\nAccessibleLabel: ="Open details"'),
    );

    expect(a11yIssues(clean)).toEqual([]);
  });

  it('normalizes only non-empty version-pin bases and keeps a ghost type refusing', () => {
    const yaml = screen(
      control('ghost', '@1.0.0', ''),
      control('emptyPin', 'Button@', ''),
      control('textPin', 'Button@abc', ''),
      control('classicPin', 'Classic/TextInput@2.3.2', 'AccessibleLabel: ="Name"'),
      control('legacyImage', 'Image@2.2.3', 'OnSelect: =Set(gblOpen, true)\nTabIndex: =2'),
    );
    const parsed = [...controlNodes(walkPaYaml(yaml, 'legacy.pa.yaml'))];
    expect(parsed.find(item => item.name === 'ghost')).toMatchObject({
      type: '@1.0.0', authoredTypePinned: false, authoredTypeVersion: null,
    });
    expect(parsed.find(item => item.name === 'emptyPin')).toMatchObject({
      type: 'Button', authoredTypePinned: true, authoredTypeVersion: null,
    });
    expect(parsed.find(item => item.name === 'textPin')).toMatchObject({
      type: 'Button', authoredTypeVersion: 'abc',
    });
    expect(parsed.find(item => item.name === 'classicPin')).toMatchObject({
      type: 'Classic/TextInput', authoredTypeVersion: '2.3.2',
    });
    expect(parsed.find(item => item.name === 'legacyImage')).toMatchObject({
      type: 'Image', authoredTypeVersion: '2.2.3',
    });
    expect(a11yIssues(yaml).map(issue => issue.rule)).toEqual([
      'a11y-tabindex-positive',
      'a11y-icon-button-no-label',
    ]);

    const result = validateFiles([{ name: 'legacy.pa.yaml', content: yaml }]);
    expect(result.summary.controls_seen).toBe(5);
    expect(result.issues.filter(issue => issue.rule === 'unknown-control')).toHaveLength(1);
    expect(result.issues.find(issue => issue.rule === 'unknown-control')).toMatchObject({
      level: 'REFUSE', control: 'ghost', type: '@1.0.0',
    });
    expect(JSON.stringify(result.issues)).not.toContain('authoredTypePinned');
  });

  it('keeps pinned controls in duplicate-control-name detection', () => {
    const result = validateFiles([
      { name: 'first.pa.yaml', content: screen(control('btnSave', 'Button@1.0.0', 'OnSelect: =true')) },
      { name: 'second.pa.yaml', content: screen(control('btnSave', 'Button', 'OnSelect: =true')) },
    ]);

    expect(result.issues.filter(issue => issue.rule === 'duplicate-control-name')).toHaveLength(2);
    expect(result.issues.filter(issue => issue.rule === 'unknown-control')).toEqual([]);
  });

  it('uses only the three interpretable accessibility opportunity denominators', () => {
    const yaml = screen(
      control('lblAction', 'Label', 'Text: ="Open"\nWrap: =false\nOnSelect: =Set(gblOpen, true)\nTabIndex: =1'),
      control('imgAction', 'Image', 'OnSelect: =Set(gblOpen, true)\nTabIndex: =-1\nAccessibleLabel: ="Open"'),
      control('imgSelectParent', 'Image', 'OnSelect: =Select(Parent)\nTabIndex: =gblTabIndex'),
      control('modernAction', 'ModernIcon', 'OnSelect: =Set(gblOpen, true)'),
      control('txtName', 'TextInput', 'AccessibleLabel: ="Name"'),
      control('classicCheck', 'Classic/CheckBox', 'Default: =false'),
      control('modernCheck', 'ModernCheckbox', 'Default: =false'),
    );

    const opportunities = getLintOpportunities(walkPaYaml(yaml, 'screen.pa.yaml'));
    expect(opportunities).toMatchObject({
      'a11y-tabindex-positive': 2,
      'a11y-interactive-not-focusable': 2,
      'a11y-icon-button-no-label': 2,
    });
    expect(opportunities).not.toHaveProperty('a11y-inputs-missing-accessiblelabel');
  });

  it('never turns an accessibility-only finding into a REFUSE', () => {
    const result = validateFiles([{
      name: 'warn-only.pa.yaml',
      content: screen(control('lblOrder', 'Label', 'Text: ="Order"\nWrap: =false\nTabIndex: =4')),
    }]);
    const issues = result.issues.filter(issue => issue.rule?.startsWith('a11y-'));
    expect(issues).toHaveLength(1);
    expect(issues.every(issue => issue.level === 'WARN')).toBe(true);
    expect(result.summary.refuse).toBe(0);
  });

  it('bundles and serves accessibility-rules.md and advertises the family', () => {
    const listed = JSON.parse(listRuleDocuments.handler().content[0].text);
    expect(listed.documents).toContain('accessibility-rules');

    const fetched = getYamlRules.handler({ document: 'accessibility-rules' });
    expect(fetched.isError).not.toBe(true);
    expect(fetched.content[0].text).toContain('# Accessibility rules — Canvas Apps');
    expect(validateYaml.description).toContain('accessibility WARN family');
    expect(validateYaml.description).toContain('never REFUSEs');
  });
});
