import { describe, expect, it } from 'vitest';
import { compareChildOrder, childOrderSummary } from '../src/core/child-order.js';

const ADVICE = "Studio's editor has rendered controls that moved to a new parent, or changed type under the same name, and all their descendants as black boxes or not at all after a save and reload, while play mode was correct (field reports 2026-11-03; the type-change case observed once). Check play mode before treating it as a defect or rolling back. To avoid it, give every control in the rename set a new name before compiling, so the compile re-inserts them instead of moving them; rename_controls can apply a whole-name map, and reversing the map restores the original names.";

const screen = (names: string[]) => [{
  name: 'Screens/Home.pa.yaml',
  content: `Screens:\n  Home:\n    Children:\n${names.map(name => `      - ${name}:\n          Control: Label\n`).join('')}`,
}];
const groups = (left: string[], right: string[]) => [{
  name: 'Home.pa.yaml', content: `Screens:\n  Home:\n    Children:\n${[['Left', left], ['Right', right]].map(([name, children]) =>
    `      - ${name}:\n          Control: GroupContainer\n          Children:\n${(children as string[]).map(child => `            - ${child}:\n                Control: Label\n`).join('')}`).join('')}`,
}];

describe('child order comparison', () => {
  it('compares identical screen child lists', () => {
    expect(compareChildOrder(screen(['A', 'B']), screen(['A', 'B']))).toMatchObject({
      identical: true,
      summary: { same: 1, reordered: 0, 'membership-changed': 0 },
      containers: [{ path: 'Home', expected: ['A', 'B'], actual: ['A', 'B'], status: 'same' }],
      moved_between_containers: [],
      type_changed: [],
      editor_render_risk: null,
    });
  });
  it('describes one moved child with one-based expected and actual positions', () => {
    expect(compareChildOrder(screen(['A', 'B', 'C']), screen(['B', 'A', 'C'])).containers[0]).toMatchObject({
      status: 'reordered', moves: [{ name: 'B', expected_position: 2, actual_position: 1 }],
      appended_at_end: false,
    });
  });
  it('recognizes inserted controls appended to the end after Studio saves', () => {
    const result = compareChildOrder(screen(['A', 'New1', 'B', 'New2', 'C']), screen(['A', 'B', 'C', 'New1', 'New2']));
    expect(result.identical).toBe(false);
    expect(result.containers[0]).toMatchObject({
      status: 'reordered', appended_at_end: true,
      moves: [
        { name: 'New1', expected_position: 2, actual_position: 4 },
        { name: 'New2', expected_position: 4, actual_position: 5 },
      ],
    });
  });
  it('reports added and removed children and the order of common members', () => {
    const result = compareChildOrder(screen(['A', 'Old', 'B']), screen(['B', 'New', 'A']));
    expect(result.summary).toEqual({ same: 0, reordered: 0, 'membership-changed': 1 });
    expect(result.containers[0]).toMatchObject({
      status: 'membership-changed', common: { expected: ['A', 'B'], actual: ['B', 'A'] },
      appended_at_end: false,
    });
  });
  it('reports a control moved between containers once with both paths', () => {
    expect(compareChildOrder(groups(['A', 'B'], ['C']), groups(['A'], ['B', 'C']))).toMatchObject({
      identical: false, summary: { same: 1, reordered: 0, 'membership-changed': 2 },
      moved_between_containers: [{ name: 'B', expected_container: 'Home/Left', actual_container: 'Home/Right' }],
    });
  });
  it('keeps explicit empty control containers in the union', () => {
    const expected = groups([], []);
    expect(compareChildOrder(expected, expected).containers.map(container => container.path)).toEqual(['Home', 'Home/Left', 'Home/Right']);
    const removed = [{ name: 'Home.pa.yaml', content: 'Screens:\n  Home:\n    Children: []\n' }];
    expect(compareChildOrder(expected, removed).containers).toContainEqual(expect.objectContaining({
      path: 'Home/Left', expected: [], actual: [], status: 'membership-changed',
    }));
  });
  it('lists a moved control and its child in the sorted editor rename set', () => {
    const withChild = (left: string[], right: string[]) => groups(left, right).map(file => ({
      ...file, content: file.content.replace('Control: Label\n', 'Control: GroupContainer\n                Children:\n                  - Leaf:\n                      Control: Label\n'),
    }));
    const result = compareChildOrder(withChild(['Nested'], []), withChild([], ['Nested']));
    expect(result.moved_between_containers).toEqual([
      { name: 'Nested', expected_container: 'Home/Left', actual_container: 'Home/Right' },
    ]);
    expect(result.type_changed).toEqual([]);
    expect(result.editor_render_risk).toEqual({
      moved: ['Nested'], retyped: [], descendants: ['Leaf'], controls: ['Leaf', 'Nested'], advice: ADVICE,
    });
  });
  it('reports a type change in place without changing order identity', () => {
    const expected = screen(['A']).map(file => ({ ...file, content: file.content.replace('Label', 'ModernText') }));
    const actual = screen(['A']).map(file => ({ ...file, content: file.content.replace('Label', 'ModernButton') }));
    const result = compareChildOrder(expected, actual);
    expect(result.identical).toBe(true);
    expect(result.type_changed).toEqual([
      { name: 'A', container: 'Home', expected_type: 'ModernText', actual_type: 'ModernButton' },
    ]);
    expect(result.editor_render_risk).toEqual({
      moved: [], retyped: ['A'], descendants: [], controls: ['A'], advice: ADVICE,
    });
  });
  it('ignores version suffixes when comparing control types', () => {
    const expected = screen(['A']).map(file => ({ ...file, content: file.content.replace('Label', 'Label@2.5.1') }));
    expect(compareChildOrder(expected, screen(['A']))).toMatchObject({
      identical: true, type_changed: [], editor_render_risk: null,
    });
  });
  it('uses encoded actual paths and de-duplicates overlapping moved and retyped subtrees', () => {
    const expected = [{ name: 'Home.pa.yaml', content: `Screens:
  Home:
    Children:
      - Z/~Root:
          Control: GroupContainer
          Children:
            - B:
                Control: GroupContainer
                Children:
                  - A:
                      Control: Label
      - Z/~RootExtra:
          Control: GroupContainer
          Children:
            - Outside:
                Control: Label
` }];
    const actual = expected.map(file => ({
      ...file, content: file.content.replace('  Home:', '  Other:')
        .replaceAll('Control: GroupContainer', 'Control: Gallery'),
    }));
    const result = compareChildOrder(expected, actual);
    expect(result.type_changed).toEqual([
      { name: 'B', container: 'Other/Z~1~0Root', expected_type: 'GroupContainer', actual_type: 'Gallery' },
      { name: 'Z/~Root', container: 'Other', expected_type: 'GroupContainer', actual_type: 'Gallery' },
      { name: 'Z/~RootExtra', container: 'Other', expected_type: 'GroupContainer', actual_type: 'Gallery' },
    ]);
    expect(result.editor_render_risk).toEqual({
      moved: ['Z/~Root', 'Z/~RootExtra'], retyped: ['B', 'Z/~Root', 'Z/~RootExtra'],
      descendants: ['A', 'Outside'], controls: ['A', 'B', 'Outside', 'Z/~Root', 'Z/~RootExtra'], advice: ADVICE,
    });
  });
  it.each(['expected', 'actual'])('requires a unique name on the %s side to report a type change', side => {
    const unique = groups(['A'], []);
    const duplicate = groups(['A'], ['A']).map(file => ({ ...file, content: file.content.replaceAll('Label', 'ModernButton') }));
    const result = side === 'expected' ? compareChildOrder(duplicate, unique) : compareChildOrder(unique, duplicate);
    expect(result.type_changed).toEqual([]);
    expect(result.editor_render_risk).toBeNull();
  });
  it('leaves editor render risk null for an order-only change', () => {
    expect(compareChildOrder(screen(['A', 'B']), screen(['B', 'A']))).toMatchObject({
      identical: false, type_changed: [], editor_render_risk: null,
    });
  });
  it('summarizes the exact order, type and editor risk counts', () => {
    expect(childOrderSummary(compareChildOrder(screen(['A', 'B']), screen(['A', 'B'])))).toBe(
      'Child order identical: 1 same, 0 reordered, 0 membership-changed; 0 moved between containers; 0 type changed.',
    );
    expect(childOrderSummary(compareChildOrder(groups(['A'], []), groups([], ['A'])))).toBe(
      'Child order differs: 1 same, 0 reordered, 2 membership-changed; 1 moved between containers; 0 type changed. Editor render risk: 1 controls in the rename set.',
    );
  });
  it('covers gallery templates, forms and component definition child containers', () => {
    const files = [{ name: 'Components/cStepBar.pa.yaml', content:
      'ComponentDefinitions:\n  cStepBar:\n    Children:\n      - Gallery1:\n          Control: Gallery\n          Children:\n            - Form1:\n                Control: Form\n                Children:\n                  - Title:\n                      Control: Label\n' }];
    const result = compareChildOrder(files, files);
    expect(result.identical).toBe(true);
    expect(result.containers.map(container => container.path)).toEqual([
      'Components/cStepBar', 'Components/cStepBar/Gallery1', 'Components/cStepBar/Gallery1/Form1',
    ]);
  });
  it('ignores canonical-form noise, reordered property keys and pruned defaults', () => {
    const expected = [{ name: 'Screen1.pa.yaml', content:
      'Screens:\n  Screen1:\n    Properties:\n      Fill: =Color.White\n    Children:\n      - A:\n          Control: Label\n          Properties:\n            Width: =100\n            Text: ="hi"\n            Visible: =true\n      - B:\n          Control: Label\n' }];
    const actual = [{ name: 'different-path.pa.yaml', content: expected[0].content.replace('      Fill: =Color.White\n', '').replace('            Width: =100\n            Text: ="hi"\n            Visible: =true\n', '            Text: ="hi"\n            Width: =100\n') }];
    expect(compareChildOrder(expected, actual).identical).toBe(true);
  });
  it('returns a clear error for unparseable input', () => {
    expect(() => compareChildOrder(screen(['A']), [{ name: 'bad.pa.yaml', content: '[not YAML\n' }])).toThrow(/actual: unable to parse PA-YAML structure.*bad.pa.yaml.*line 1/);
  });
  it.each([
    'Screens:\n  Home:\n    Children:\n      - Bad: [broken\n',
    'Screens:\n  Home:\n    Children: [bad\n',
  ])('does not silently accept malformed child structure: %s', content => {
    expect(() => compareChildOrder([{ name: 'bad.pa.yaml', content }], [])).toThrow(/unable to parse/);
  });
  it('is deterministic across file order and does not mutate inputs', () => {
    const files = [...screen(['A', 'B']), { name: 'empty.pa.yaml', content: 'Screens:\n  Empty:\n    Children: []\n' }];
    const before = JSON.stringify(files);
    const result = compareChildOrder(files, [...files].reverse());
    expect(result.identical).toBe(true);
    expect(result.containers.map(container => container.path)).toEqual(['Empty', 'Home']);
    expect(JSON.stringify(files)).toBe(before);
  });
  it('does not report descendants as moving when their whole container moves', () => {
    const expected = groups(['Nested'], []).map(file => ({ ...file, content: file.content.replace('Control: Label\n', 'Control: GroupContainer\n                Children:\n                  - Leaf:\n                      Control: Label\n') }));
    const actual = groups([], ['Nested']).map(file => ({ ...file, content: file.content.replace('Control: Label\n', 'Control: GroupContainer\n                Children:\n                  - Leaf:\n                      Control: Label\n') }));
    expect(compareChildOrder(expected, actual).moved_between_containers).toEqual([
      { name: 'Nested', expected_container: 'Home/Left', actual_container: 'Home/Right' },
    ]);
  });
  it('rejects duplicate child names rather than inventing move identities', () => {
    expect(() => compareChildOrder(screen(['A', 'A']), screen(['A']))).toThrow(/duplicate child name/);
  });
  it('accepts app-only and empty bundles without inventing containers', () => {
    expect(compareChildOrder([{ name: 'App.pa.yaml', content: 'App:\n  Properties:\n    OnStart: =false\n' }], []).identical).toBe(true);
  });
  // Every sync_canvas folder carries Studio's _EditorState.pa.yaml; it is screen order, not controls.
  const editorState = (screens: string[]) => ({
    name: '_EditorState.pa.yaml', content: `EditorState:\n  ScreensOrder:\n${screens.map(s => `    - ${s}`).join('\n')}\n`,
  });
  it('reads _EditorState.pa.yaml as screen order instead of rejecting a synced folder', () => {
    const same = compareChildOrder([...screen(['A']), editorState(['Home', 'Other'])], [...screen(['A']), editorState(['Home', 'Other'])]);
    expect(same.identical).toBe(true);
    const swapped = compareChildOrder([...screen(['A']), editorState(['Home', 'Other'])], [...screen(['A']), editorState(['Other', 'Home'])]);
    expect(swapped.identical).toBe(false);
    expect(swapped.containers.find(container => container.path === '(screen order)')).toMatchObject({ status: 'reordered' });
  });
  it('compares screen order only when both sides carry editor state', () => {
    const result = compareChildOrder([...screen(['A']), editorState(['Home'])], screen(['A']));
    expect(result.identical).toBe(true);
    expect(result.containers.some(container => container.path === '(screen order)')).toBe(false);
  });
});
