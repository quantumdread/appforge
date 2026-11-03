import { describe, it, expect } from 'vitest';
import { controlNodes, validateFiles, walkPaYaml } from '../src/lib/validator';
import { C_DEMO_WIZARD as C_DEMO_WIZARD_RAW } from './fixtures/cDemoWizard';

// These are raw multi-line template literals, so their newlines follow the
// checked-out line endings (this repo has core.autocrlf=true → CRLF working copy).
// The string-surgery below uses LF ('\n') escapes, so normalise to LF up front to
// keep the .replace() anchors reliable regardless of checkout. validateFiles
// strips \r internally anyway, so this doesn't change validation semantics.
const LF = (s: string) => s.replace(/\r\n/g, '\n');
const C_DEMO_WIZARD = LF(C_DEMO_WIZARD_RAW);

const INSTANCE = LF(`- cDemoWizard_1:
    Control: CanvasComponent
    ComponentName: cDemoWizard
    Properties:
      ActiveStep: =1
      X: =0
      Y: =92
      Width: =Parent.Width
      Height: =44
      OnStepSelect: =Notify("tapped")
`);

describe('component validation', () => {
  it('acceptance: the synthetic component file passes (no REFUSE)', () => {
    const r = validateFiles([{ name: 'Components/cDemoWizard.pa.yaml', content: C_DEMO_WIZARD }]);
    expect(r.summary.refuse).toBe(0);
  });

  it('CanvasComponent instance with definition in batch: custom props PASS', () => {
    const r = validateFiles([
      { name: 'Components/cDemoWizard.pa.yaml', content: C_DEMO_WIZARD },
      { name: 'Screen1.pa.yaml', content: INSTANCE },
    ]);
    expect(r.summary.refuse).toBe(0);
    expect(r.issues.filter(i => i.control === 'cDemoWizard_1' && i.level === 'WARN')).toHaveLength(0);
  });

  it('instance without definition in batch: custom props WARN, standard props PASS', () => {
    const r = validateFiles([{ name: 'Screen1.pa.yaml', content: INSTANCE }]);
    expect(r.summary.refuse).toBe(0);
    expect(r.issues.some(i => i.rule === 'component-custom-property' && i.property === 'ActiveStep')).toBe(true);
    // X/Y/Width/Height are standard synthetic input properties → no WARN on them.
    expect(r.issues.some(i => i.control === 'cDemoWizard_1' && i.property === 'X')).toBe(false);
  });

  it('accepts host-layout properties on instances while preserving custom and definition checks', () => {
    const yaml = `ComponentDefinitions:
  cHostLayout:
    DefinitionType: CanvasComponent
    CustomProperties:
      DeclaredInput:
        PropertyKind: Input
        DataType: Number
        Default: =0
    Properties:
      AlignInContainer: =AlignInContainer.Stretch
Screens:
  Main:
    Children:
      - cmpHostLayout:
          Control: CanvasComponent
          ComponentName: cHostLayout
          Properties:
            AlignInContainer: =AlignInContainer.Stretch
            FillPortions: =1
            LayoutMinHeight: =40
            LayoutMinWidth: =80
            UndeclaredInput: =1
`;
    const r = validateFiles([{ name: 'host-layout.pa.yaml', content: yaml }]);
    const customWarnings = r.issues.filter(issue => issue.rule === 'component-custom-property');

    expect(customWarnings.map(issue => issue.property)).toEqual(['UndeclaredInput']);
    expect(r.issues).toContainEqual(expect.objectContaining({
      control: 'cHostLayout',
      property: 'AlignInContainer',
      rule: 'component-root-property',
      level: 'WARN',
    }));
    expect(r.summary.refuse).toBe(0);
  });

  it('accepts declared custom properties named AlignInContainer and FillPortions', () => {
    const yaml = `ComponentDefinitions:
  cNamedLikeHostProps:
    DefinitionType: CanvasComponent
    CustomProperties:
      AlignInContainer:
        PropertyKind: Input
        DataType: Text
        Default: ="Stretch"
      FillPortions:
        PropertyKind: Input
        DataType: Number
        Default: =1
    Properties:
      AlignInContainer: =cNamedLikeHostProps.AlignInContainer
      FillPortions: =cNamedLikeHostProps.FillPortions
Screens:
  Main:
    Children:
      - cmpNamedLikeHostProps:
          Control: CanvasComponent
          ComponentName: cNamedLikeHostProps
          Properties:
            AlignInContainer: ="Stretch"
            FillPortions: =1
`;
    const r = validateFiles([{ name: 'named-like-host-props.pa.yaml', content: yaml }]);

    expect(r.summary.refuse).toBe(0);
    expect(r.issues.filter(issue =>
      ['component-root-property', 'component-custom-property'].includes(issue.rule ?? ''))).toEqual([]);
  });

  it('CanvasComponent without ComponentName REFUSEs', () => {
    const stripped = INSTANCE.replace('    ComponentName: cDemoWizard\n', '');
    expect(stripped).not.toBe(INSTANCE); // guard: the ComponentName line really was removed
    const r = validateFiles([{ name: 's.pa.yaml', content: stripped }]);
    expect(r.issues.some(i => i.rule === 'component-name-required' && i.level === 'REFUSE')).toBe(true);
  });

  it('server-materialized InputFunction WARNs without REFUSE', () => {
    const synced = C_DEMO_WIZARD.replace(
      '      ActiveStep:\n        PropertyKind: Input',
      '      ActiveStep:\n        PropertyKind: InputFunction',
    );
    expect(synced).not.toBe(C_DEMO_WIZARD);

    const r = validateFiles([{ name: 'c.pa.yaml', content: synced }]);
    expect(r.summary.refuse).toBe(0);
    expect(r.issues).toContainEqual(expect.objectContaining({
      level: 'WARN',
      property: 'ActiveStep',
      rule: 'materialized-property-kind',
      detail: 'server-materialized PropertyKind (sync_canvas emits Input as InputFunction on round-trip); authored source should use Input/Output/Event',
    }));
  });

  it('uses a distinct refusal id when an Event omits ReturnType', () => {
    const missingReturnType = C_DEMO_WIZARD.replace('        ReturnType: None\n', '');
    expect(missingReturnType).not.toBe(C_DEMO_WIZARD);

    const issue = validateFiles([{ name: 'c.pa.yaml', content: missingReturnType }]).issues
      .find(candidate => candidate.property === 'OnStepSelect' && candidate.level === 'REFUSE');
    expect(issue).toMatchObject({ rule: 'event-return-type-required' });
  });

  it('Output with Default REFUSEs; bad PropertyKind REFUSEs; children validate against catalog', () => {
    // Adapted string-surgery (the brief grants this): the brief's example turned
    // SelectedStep into both Banana AND gave it a Default, which can only fire one
    // rule. Instead: ActiveStep → invalid kind (custom-property-kind), and
    // SelectedStep stays Output but gains a Default (output-property-default).
    // Per-step guards: prove EACH replace anchor actually fired, not just that
    // the string changed somewhere.
    const step1 = C_DEMO_WIZARD
      .replace('      ActiveStep:\n        PropertyKind: Input', '      ActiveStep:\n        PropertyKind: Banana');
    expect(step1).not.toBe(C_DEMO_WIZARD);
    const bad = step1
      .replace('        DataType: Number\n      OnStepSelect:', '        DataType: Number\n        Default: =0\n      OnStepSelect:');
    expect(bad).not.toBe(step1);
    const r = validateFiles([{ name: 'c.pa.yaml', content: bad }]);
    expect(r.issues.some(i => i.rule === 'custom-property-kind')).toBe(true);
    expect(r.issues.some(i => i.rule === 'output-property-default')).toBe(true);

    const junkChild = C_DEMO_WIZARD.replace('Control: Rectangle', 'Control: NotARealControl');
    expect(junkChild).not.toBe(C_DEMO_WIZARD);
    expect(validateFiles([{ name: 'c.pa.yaml', content: junkChild }]).issues.some(i => i.detail === 'control-type-not-in-manifest')).toBe(true);
  });

  it('definition-child control issues cite the true file line (line offset applied)', () => {
    // recActive (Control: Rectangle) lives deep inside the definition's Children.
    // A REFUSE on it must be anchored to its real position in the FILE, not to the
    // sliced child-text's local line 1. Regression guard for the missing lineOffset.
    const junkChild = C_DEMO_WIZARD.replace('Control: Rectangle', 'Control: NotARealControl');
    expect(junkChild).not.toBe(C_DEMO_WIZARD);

    const r = validateFiles([{ name: 'c.pa.yaml', content: junkChild }]);
    const issue = r.issues.find(i => i.detail === 'control-type-not-in-manifest');
    expect(issue).toBeDefined();

    // The walker anchors a control's line to its `- <name>:` declaration line.
    // Compute that line straight from the content — no magic number.
    const fileLines = junkChild.split('\n');
    const declLine = fileLines.findIndex(l => /^\s*- recActive:\s*$/.test(l)) + 1;
    expect(declLine).toBeGreaterThan(50); // it really is deep in the file

    // Consistency: the issue's cited line == the main walker's parsed control line
    // == the true `- recActive:` declaration line in the file.
    const parsed = [...controlNodes(walkPaYaml(junkChild, 'c.pa.yaml'))];
    const rect = parsed.find(c => c.name === 'recActive');
    expect(rect).toBeDefined();
    expect(rect!.line).toBe(declLine);
    expect(issue!.line).toBe(declLine);
  });
});


describe('Input custom property default compiler evidence', () => {
  const definition = (kind: string, defaultField: string) => validateFiles([{
    name: 'component.pa.yaml',
    content: `ComponentDefinitions:
  cProbe:
    DefinitionType: CanvasComponent
    CustomProperties:
      Probe:
        PropertyKind: ${kind}
        DataType: Color
        ReturnType: None
${defaultField}
`,
  }]);
  it.each(['=', '""', '', '   =   ', '"   "', "''", '" = "'])('refuses an Input with present empty Default %j', value => {
    const result = definition('Input', `        Default: ${value}`);
    expect(result.issues).toContainEqual(expect.objectContaining({
      level: 'REFUSE', rule: 'input-property-empty-default', property: 'Probe',
      detail: expect.stringContaining("Custom input property of kind 'Input' requires a non-empty 'Default' formula."),
      fix: expect.stringContaining('=RGBA(0, 0, 0, 1)'),
    }));
    expect(result.summary.refuse).toBe(1);
  });
  it.each(['=RGBA(0, 0, 0, 1)', '=Blank()', '=false', '=0', '=""'])('accepts non-empty Input formula %s', value => {
    expect(definition('Input', `        Default: ${value}`).issues).toEqual([]);
  });
  it('does not refuse a missing Input Default', () => {
    expect(definition('Input', '').issues).toEqual([]);
  });
  it('preserves Output default refusal and Event behavior', () => {
    const output = definition('Output', '        Default: =');
    expect(output.issues.map(issue => issue.rule)).toEqual(['output-property-default']);
    expect(definition('Event', '        Default: =').issues).toEqual([]);
    expect(definition('Event', '').issues.map(issue => issue.rule)).toEqual(['event-default-recommended']);
  });
});
