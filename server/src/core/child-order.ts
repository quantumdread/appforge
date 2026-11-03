import { buildAppBundleWithDiagnostics } from './analyzer.js';
import { controlNodes, MAX_CONTROL_TREE_DEPTH, type ControlNode } from './model.js';

export class ChildOrderInputError extends Error {
  override name = 'ChildOrderInputError';
}

export type ChildOrderFile = { name: string; content: string };
export type ChildOrderStatus = 'same' | 'reordered' | 'membership-changed';
export type ChildOrderMove = { name: string; expected_position: number; actual_position: number };
export type ChildOrderContainer = {
  path: string;
  expected: string[];
  actual: string[];
  status: ChildOrderStatus;
  common: { expected: string[]; actual: string[] };
  moves: ChildOrderMove[];
  appended_at_end: boolean;
};
export type ChildOrderResult = {
  identical: boolean;
  summary: Record<ChildOrderStatus, number>;
  containers: ChildOrderContainer[];
  moved_between_containers: Array<{ name: string; expected_container: string; actual_container: string }>;
  type_changed: Array<{ name: string; container: string; expected_type: string; actual_type: string }>;
  editor_render_risk: null | {
    moved: string[];
    retyped: string[];
    descendants: string[];
    controls: string[];
    advice: string;
  };
};

const ADVICE = "Studio's editor has rendered controls that moved to a new parent, or changed type under the same name, and all their descendants as black boxes or not at all after a save and reload, while play mode was correct (field reports 2026-11-03; the type-change case observed once). Check play mode before treating it as a defect or rolling back. To avoid it, give every control in the rename set a new name before compiling, so the compile re-inserts them instead of moving them; rename_controls can apply a whole-name map, and reversing the map restores the original names.";
const segment = (name: string) => name.replaceAll('~', '~0').replaceAll('/', '~1');

/** Studio's `_EditorState.pa.yaml` (present in every sync_canvas folder) holds screen order, not controls. */
const EDITOR_STATE = '_EditorState.pa.yaml';
export const SCREEN_ORDER_PATH = '(screen order)';
const isEditorState = (name: string) => (name.split(/[\\/]/).pop() ?? name) === EDITOR_STATE;

function screensOrder(content: string): string[] {
  const lines = content.replace(/\r/g, '').split('\n');
  const start = lines.findIndex(line => /^\s*ScreensOrder:\s*$/.test(line));
  if (start === -1) return [];
  const names: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const item = line.match(/^\s*-\s+(.+?)\s*$/);
    if (!item) break;
    names.push(item[1].replace(/^(['"])(.*)\1$/, '$2'));
  }
  return names;
}

function inventory(allFiles: ChildOrderFile[], side: string) {
  if (!Array.isArray(allFiles)) throw new ChildOrderInputError(`${side}: files must be an array of { name, content }.`);
  const fileNames = new Set<string>();
  for (const file of allFiles) {
    if (!file || typeof file.name !== 'string' || typeof file.content !== 'string') {
      throw new ChildOrderInputError(`${side}: each file must be { name: string, content: string }.`);
    }
    if (fileNames.has(file.name)) throw new ChildOrderInputError(`${side}: duplicate file name '${file.name}'.`);
    fileNames.add(file.name);
  }
  const editorState = allFiles.find(file => isEditorState(file.name));
  const screenOrder = editorState ? screensOrder(editorState.content) : null;
  const files = allFiles.filter(file => !isEditorState(file.name));
  const { bundle, recognizedByFile, structuralErrorsByFile } = buildAppBundleWithDiagnostics(files);
  for (const file of files) {
    const recognized = recognizedByFile.get(file.name)!;
    const badLine = recognized.findIndex(value => !value);
    if (badLine !== -1) throw new ChildOrderInputError(`${side}: unable to parse PA-YAML structure in '${file.name}' at line ${badLine + 1}.`);
    const structuralLine = structuralErrorsByFile.get(file.name)?.[0];
    if (structuralLine !== undefined) throw new ChildOrderInputError(`${side}: unable to parse child structure in '${file.name}' at line ${structuralLine}.`);
  }
  for (const node of controlNodes(bundle)) {
    if (node.type === null) throw new ChildOrderInputError(`${side}: unable to parse control '${node.name}' in '${node.file}' at line ${node.line}: missing Control declaration.`);
  }
  const containers = new Map<string, string[]>();
  const locations = new Map<string, Array<{ path: string; parentIdentity: string; type: string }>>();
  const add = (path: string, children: ControlNode[]) => {
    if (containers.has(path)) throw new ChildOrderInputError(`${side}: ambiguous container path '${path}'.`);
    const names = children.map(child => child.name);
    if (new Set(names).size !== names.length) throw new ChildOrderInputError(`${side}: duplicate child name in '${path}'.`);
    containers.set(path, names);
  };
  const visit = (node: ControlNode, parentPath: string, parentIdentity: string, depth: number): void => {
    if (depth > MAX_CONTROL_TREE_DEPTH) throw new ChildOrderInputError(`${side}: control tree exceeds supported depth.`);
    const path = `${parentPath}/${segment(node.name)}`;
    const entries = locations.get(node.name) ?? [];
    entries.push({ path: parentPath, parentIdentity, type: node.type!.split('@')[0] });
    locations.set(node.name, entries);
    if (node.hasChildren || node.children.length > 0) add(path, node.children);
    for (const child of node.children) visit(child, path, `control:${node.name}`, depth + 1);
  };
  for (const screen of bundle.screens) {
    const path = segment(screen.name);
    add(path, screen.roots);
    for (const root of screen.roots) visit(root, path, `root:${path}`, 0);
  }
  for (const definition of bundle.componentDefs) {
    const path = `Components/${segment(definition.name)}`;
    add(path, definition.children);
    for (const child of definition.children) visit(child, path, `root:${path}`, 0);
  }
  return { containers, locations, screenOrder };
}

/** A longest common subsequence via increasing expected indices, O(n log n). */
function stationaryChildren(expected: string[], actual: string[]): Set<string> {
  const positions = new Map(expected.map((name, index) => [name, index]));
  const tails: number[] = [];
  const previous = new Array<number>(actual.length).fill(-1);
  for (let index = 0; index < actual.length; index++) {
    const position = positions.get(actual[index])!;
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (positions.get(actual[tails[middle]])! < position) low = middle + 1;
      else high = middle;
    }
    if (low > 0) previous[index] = tails[low - 1];
    tails[low] = index;
  }
  const stationary = new Set<string>();
  for (let index = tails.at(-1) ?? -1; index !== -1; index = previous[index]) stationary.add(actual[index]);
  return stationary;
}

/** Pure structural comparison; properties and catalog validation are outside its scope. */
export function compareChildOrder(expectedFiles: ChildOrderFile[], actualFiles: ChildOrderFile[]): ChildOrderResult {
  const expected = inventory(expectedFiles, 'expected');
  const actual = inventory(actualFiles, 'actual');
  // Screen order is compared only when both sides carry Studio's editor state.
  if (expected.screenOrder && actual.screenOrder) {
    expected.containers.set(SCREEN_ORDER_PATH, expected.screenOrder);
    actual.containers.set(SCREEN_ORDER_PATH, actual.screenOrder);
  }
  const paths = [...new Set([...expected.containers.keys(), ...actual.containers.keys()])].sort();
  const containers: ChildOrderContainer[] = paths.map(path => {
    const e = expected.containers.get(path) ?? [];
    const a = actual.containers.get(path) ?? [];
    const eNames = new Set(e);
    const aNames = new Set(a);
    const common = { expected: e.filter(name => aNames.has(name)), actual: a.filter(name => eNames.has(name)) };
    const membershipChanged = !expected.containers.has(path) || !actual.containers.has(path)
      || common.expected.length !== e.length || common.actual.length !== a.length;
    let stationary = stationaryChildren(common.expected, common.actual);
    // If a minimum move explanation is a suffix append, prefer that explanation.
    // Find the longest actual prefix that remains a subsequence of expected.
    const positions = new Map(common.expected.map((name, index) => [name, index]));
    let last = -1;
    let prefix = 0;
    for (const name of common.actual) {
      const position = positions.get(name)!;
      if (position <= last) break;
      last = position;
      prefix++;
    }
    const appended = !membershipChanged && prefix < a.length && prefix === stationary.size;
    if (appended) stationary = new Set(a.slice(0, prefix));
    const ePositions = new Map(e.map((name, index) => [name, index + 1]));
    const aPositions = new Map(a.map((name, index) => [name, index + 1]));
    const moves = common.expected.filter(name => !stationary.has(name)).map(name => ({
      name, expected_position: ePositions.get(name)!, actual_position: aPositions.get(name)!,
    }));
    return { path, expected: e, actual: a, status: membershipChanged ? 'membership-changed' : moves.length ? 'reordered' : 'same', common, moves, appended_at_end: appended };
  });
  const summary: Record<ChildOrderStatus, number> = { same: 0, reordered: 0, 'membership-changed': 0 };
  for (const container of containers) summary[container.status]++;
  const movedBetween: ChildOrderResult['moved_between_containers'] = [];
  const typeChanged: ChildOrderResult['type_changed'] = [];
  for (const name of [...expected.locations.keys()].sort()) {
    const e = expected.locations.get(name)!;
    const a = actual.locations.get(name);
    // Duplicate names cannot establish an identity. A moved subtree's descendants
    // retain their immediate parent and do not become additional move reports.
    if (e.length === 1 && a?.length === 1) {
      if (e[0].parentIdentity !== a[0].parentIdentity) {
        movedBetween.push({ name, expected_container: e[0].path, actual_container: a[0].path });
      }
      if (e[0].type !== a[0].type) {
        typeChanged.push({ name, container: a[0].path, expected_type: e[0].type, actual_type: a[0].type });
      }
    }
  }
  let editorRenderRisk: ChildOrderResult['editor_render_risk'] = null;
  if (movedBetween.length || typeChanged.length) {
    const moved = movedBetween.map(control => control.name);
    const retyped = typeChanged.map(control => control.name);
    const roots = new Set([...moved, ...retyped]);
    const selfPaths = [...roots].map(name => `${actual.locations.get(name)![0].path}/${segment(name)}`);
    const descendants = [...actual.locations.entries()]
      .filter(([name, locations]) => !roots.has(name) && locations.length === 1
        && selfPaths.some(path => locations[0].path === path || locations[0].path.startsWith(`${path}/`)))
      .map(([name]) => name).sort();
    editorRenderRisk = {
      moved, retyped, descendants,
      controls: [...new Set([...moved, ...retyped, ...descendants])].sort(),
      advice: ADVICE,
    };
  }
  return {
    identical: summary.same === containers.length,
    summary,
    containers,
    moved_between_containers: movedBetween,
    type_changed: typeChanged,
    editor_render_risk: editorRenderRisk,
  };
}

export function childOrderSummary(result: ChildOrderResult): string {
  return `Child order ${result.identical ? 'identical' : 'differs'}: ${result.summary.same} same, ${result.summary.reordered} reordered, ${result.summary['membership-changed']} membership-changed; ${result.moved_between_containers.length} moved between containers; ${result.type_changed.length} type changed.`
    + (result.editor_render_risk ? ` Editor render risk: ${result.editor_render_risk.controls.length} controls in the rename set.` : '');
}
