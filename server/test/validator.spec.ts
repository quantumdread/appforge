import { describe, it, expect } from 'vitest';
import { controlNodes, validateFiles, walkPaYaml } from '../src/lib/validator';
import { treeContext } from '../src/lib/lint';

const nodes = (yaml: string, file: string) => [...controlNodes(walkPaYaml(yaml, file))];

const SCREEN = `Screens:
  MainScreen:
    Children:
      - grpRoot:
          Control: GroupContainer
          Variant: AutoLayout
          Properties:
            Fill: =Color.White
            LayoutOverflowY: =LayoutOverflow.Scroll
          Children:
            - lblTitle:
                Control: Label
                Properties:
                  Text: |-
                    ="Owner: " & varName
                  Wrap: =false
`;

describe('walkPaYaml', () => {
  it('captures inline property values', () => {
    const controls = nodes(SCREEN, 'a.pa.yaml');
    const grp = controls.find(c => c.name === 'grpRoot')!;
    const fill = grp.properties.find(p => p.name === 'Fill')!;
    expect(fill.value).toBe('=Color.White');
    expect(fill.isBlockScalar).toBe(false);
  });

  it('unwraps block scalar values', () => {
    const controls = nodes(SCREEN, 'a.pa.yaml');
    const lbl = controls.find(c => c.name === 'lblTitle')!;
    const text = lbl.properties.find(p => p.name === 'Text')!;
    expect(text.isBlockScalar).toBe(true);
    expect(text.value).toBe('="Owner: " & varName');
  });

  it('links parent control references', () => {
    const bundle = walkPaYaml(SCREEN, 'a.pa.yaml');
    const controls = [...controlNodes(bundle)];
    const context = treeContext(bundle);
    const grp = controls.find(c => c.name === 'grpRoot')!;
    const lbl = controls.find(c => c.name === 'lblTitle')!;
    expect(context.parentOf(lbl)).toBe(grp);
    expect(context.ancestorsOf(lbl)).toEqual([grp]);
    expect(grp.children).toEqual([lbl]);
    expect(context.screenOf(lbl)).toBe(bundle.screens[0]);
    expect(bundle.screens[0]).toMatchObject({ name: 'MainScreen', file: 'a.pa.yaml', roots: [grp] });
    expect(context.layoutDirectionOf(grp)).toBeNull();
  });

  it('retains every authored Screens root and uses file-derived naming only as a fallback', () => {
    const multi = walkPaYaml(`Screens:
  FirstScreen:
    Children:
      - firstRoot:
          Control: Label
  'Second Screen':
    Children:
      - secondRoot:
          Control: Label
`, 'Combined.pa.yaml');
    expect(multi.screens.map(screen => screen.name)).toEqual(['FirstScreen', 'Second Screen']);
    expect(multi.screens.map(screen => screen.roots[0].name)).toEqual(['firstRoot', 'secondRoot']);

    const fallback = walkPaYaml(`- root:
    Control: Label
`, 'C:\\Apps\\FallbackScreen.pa.yaml');
    expect(fallback.screens).toHaveLength(1);
    expect(fallback.screens[0]).toMatchObject({ name: 'FallbackScreen', file: 'C:\\Apps\\FallbackScreen.pa.yaml' });
    expect(fallback.screens[0].roots[0].screen).toBe(fallback.screens[0]);
  });

  it.each([
    ['before', `- orphanGhost:
    Control: ReviewerGhostControl
- orphanImage:
    Control: Image
    Properties:
      OnSelect: =Set(gblOpen, true)
      TabIndex: =2
Screens:
  Main:
    Children:
      - screenLabel:
          Control: Label
          Properties:
            Text: ="Visible"
            Wrap: =false
`, ['orphanGhost', 'orphanImage', 'screenLabel']],
    ['after', `Screens:
  Main:
    Children:
      - screenLabel:
          Control: Label
          Properties:
            Text: ="Visible"
            Wrap: =false
- orphanGhost:
    Control: ReviewerGhostControl
- orphanImage:
    Control: Image
    Properties:
      OnSelect: =Set(gblOpen, true)
      TabIndex: =2
`, ['screenLabel', 'orphanGhost', 'orphanImage']],
  ])('attaches orphan roots %s Screens to the fallback screen without hiding them', (_position, yaml, expectedOrder) => {
    const file = 'Mixed.pa.yaml';
    const bundle = walkPaYaml(yaml, file);
    const fallback = bundle.screens.find(screen => screen.name === 'Mixed');
    expect(fallback?.roots.map(root => root.name)).toEqual(['orphanGhost', 'orphanImage']);
    expect(fallback?.roots.every(root => root.screen === fallback)).toBe(true);
    expect([...controlNodes(bundle)].map(control => control.name)).toEqual(expectedOrder);

    const result = validateFiles([{ name: file, content: yaml }]);
    expect(result.summary.controls_seen).toBe(3);
    expect(result.issues).toContainEqual(expect.objectContaining({
      level: 'REFUSE', rule: 'unknown-control', control: 'orphanGhost', type: 'ReviewerGhostControl',
    }));
    expect(result.issues).toContainEqual(expect.objectContaining({
      level: 'WARN', rule: 'a11y-tabindex-positive', control: 'orphanImage',
    }));
    expect(result.issues).toContainEqual(expect.objectContaining({
      level: 'WARN', rule: 'a11y-icon-button-no-label', control: 'orphanImage',
    }));
  });

  it('exposes literal AutoLayout direction and real gallery ancestry through rule context', () => {
    const bundle = walkPaYaml(`Screens:
  Main:
    Children:
      - galRows:
          Control: Gallery
          Children:
            - row:
                Control: GroupContainer
                Variant: AutoLayout
                Properties:
                  LayoutDirection: =LayoutDirection.Horizontal
                Children:
                  - lbl:
                      Control: Label
`, 'tree.pa.yaml');
    const controls = [...controlNodes(bundle)];
    const row = controls.find(control => control.name === 'row')!;
    const label = controls.find(control => control.name === 'lbl')!;
    const context = treeContext(bundle);

    expect(context.layoutDirectionOf(row)).toBe('horizontal');
    expect(context.isInsideGallery(label)).toBe(true);
    expect(context.ancestorsOf(label).map(control => control.name)).toEqual(['row', 'galRows']);
  });

  it('validates properties declared AFTER a Children block', () => {
    const yaml = `Screens:
  S:
    Children:
      - grpA:
          Control: GroupContainer
          Children:
            - lblB:
                Control: Label
                Properties:
                  Text: ="hi"
          Properties:
            Fill: =Color.White
`;
    const controls = nodes(yaml, 'b.pa.yaml');
    const grp = controls.find(c => c.name === 'grpA')!;
    expect(grp.properties.map(p => p.name)).toContain('Fill');
  });

  it('unwraps a YAML-quoted formula and sets wasQuoted (mirrors validator-test-fixture Items lines)', () => {
    const yaml = `- galX:
    Control: Gallery
    Properties:
      Items: '=Table({n: 1})'
`;
    const items = nodes(yaml, 'q.pa.yaml')[0].properties.find(p => p.name === 'Items')!;
    expect(items.value).toBe('=Table({n: 1})');
    expect(items.wasQuoted).toBe(true);
    expect(items.isBlockScalar).toBe(false);
  });

  it('unwraps a double-quoted value collapsing \\" escapes (mirrors screen-table-template Image line)', () => {
    const yaml = `- imgX:
    Control: Image
    Properties:
      Image: "=\\"data:image/svg+xml\\" & x"
`;
    const img = nodes(yaml, 'q.pa.yaml')[0].properties.find(p => p.name === 'Image')!;
    expect(img.value).toBe('="data:image/svg+xml" & x');
    expect(img.wasQuoted).toBe(true);
  });

  it('strips an inline comment on a plain scalar, leaving the parsed value', () => {
    const yaml = `- galY:
    Control: Gallery
    Properties:
      WrapCount: =3   # note with colon: yes
`;
    const wc = nodes(yaml, 'c.pa.yaml')[0].properties.find(p => p.name === 'WrapCount')!;
    expect(wc.value).toBe('=3');
    expect(wc.wasQuoted).toBe(false);
  });

  it('handles 4-space property indentation', () => {
    const yaml = `- btnGo:
    Control: Button
    Properties:
        Text: ="Go"
        OnSelect: =Notify("hi")
`;
    const controls = nodes(yaml, 'c.pa.yaml');
    const btn = controls.find(c => c.name === 'btnGo')!;
    expect(btn.properties.map(p => p.name)).toEqual(['Text', 'OnSelect']);
  });
});

describe('authored control version capture', () => {
  const YAML = `Screens:
  Main:
    Children:
      - btnPinned:
          Control: ModernButton@1.0.0
          Properties:
            Text: ="ok"
      - btnBare:
          Control: ModernButton
          Properties:
            Text: ="ok"
      - inpClassic:
          Control: Classic/TextInput@2.3.2
          Properties:
            Default: =""
`;

  it('preserves the stripped version while the type stays bare', () => {
    const byName = new Map(nodes(YAML, 'a.pa.yaml').map(n => [n.name, n]));
    expect(byName.get('btnPinned')?.type).toBe('ModernButton');
    expect(byName.get('btnPinned')?.authoredTypePinned).toBe(true);
    expect(byName.get('btnPinned')?.authoredTypeVersion).toBe('1.0.0');

    expect(byName.get('btnBare')?.authoredTypePinned).toBe(false);
    expect(byName.get('btnBare')?.authoredTypeVersion).toBeNull();

    expect(byName.get('inpClassic')?.type).toBe('Classic/TextInput');
    expect(byName.get('inpClassic')?.authoredTypeVersion).toBe('2.3.2');
  });
});
