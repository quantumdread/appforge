/** Shared analyzer model with no dependency on the walker or rules. */

/** Pseudo-control type stamped on a ComponentDefinition root (not a real Studio control). */
export const COMPONENT_DEFINITION_TYPE = '__ComponentDefinition';

/** Pseudo-control type stamped on a top-level App block (not a real Studio control). */
export const APP_TYPE = '__App';

/** Defensive ceiling for malformed/fuzzed control graphs. Authored trees are far shallower. */
export const MAX_CONTROL_TREE_DEPTH = 256;

export type ParsedProperty = {
  name: string;
  line: number;
  value: string;
  isBlockScalar: boolean;
  wasQuoted: boolean;
  /** YAML comment stripped from a plain scalar, starting at the hash. */
  inlineComment?: string;
};

/** A CustomProperty declared on a component ComponentDefinition. */
export type ParsedCustomProperty = {
  name: string;
  line: number;
  fields: Record<string, string>;
};

export type AppScreen = {
  /** Authored `Screens:` key, or the documented file-derived fallback. */
  name: string;
  file: string;
  /** Authored Screens heading; absent for file-derived identities. */
  line?: number;
  /** Direct authored Properties; absent when unsupported or not captured. */
  properties?: ParsedProperty[];
  roots: ControlNode[];
};

/** One node in a screen or component-definition control tree. */
export type ControlNode = {
  file: string;
  line: number;
  indent: number;
  name: string;
  type: string | null;
  /** True when the authored Control value carried a stripped @version suffix. */
  authoredTypePinned: boolean;
  /** The stripped version string without '@' (e.g. '1.0.0'), else null. */
  authoredTypeVersion: string | null;
  variant: string | null;
  /** For a `Control: CanvasComponent` instance, the `ComponentName:` sibling value (else null). */
  componentName: string | null;
  parent: ControlNode | null;
  children: ControlNode[];
  /** Whether the source explicitly declares a Children section, including an empty one. */
  hasChildren?: boolean;
  /** Null for App and ComponentDefinition pseudo-trees. */
  screen: AppScreen | null;
  properties: ParsedProperty[];
  /** Only set on `__ComponentDefinition` pseudo-controls. */
  customProperties?: ParsedCustomProperty[];
  /** Only set on the `__App` pseudo-control. */
  appFormulaNames?: string[];
};

/**
 * The analyzer's sole rule input. The adapter may analyze multiple independent
 * PA-YAML targets in one batch, so `app` retains each encountered App root.
 */
export type AppBundle = {
  app: ControlNode[];
  screens: AppScreen[];
  componentDefs: ControlNode[];
};

// Batch input order is execution compatibility metadata, not a second public
// model shape. Keep it outside AppBundle so rules cannot regress to accepting a
// caller-supplied flat list while deterministic legacy emission remains possible.
const NODE_ORDER = new WeakMap<object, readonly ControlNode[]>();

export function rememberControlNodeOrder(bundle: AppBundle, nodes: readonly ControlNode[]): void {
  NODE_ORDER.set(bundle, nodes);
}

type ReadonlyControlTreeNode<TNode> = {
  readonly children: readonly TNode[];
};

/** Structural bundle view accepted by readonly survey snapshots. */
export type ReadonlyControlBundle<TNode extends ReadonlyControlTreeNode<TNode>> = {
  readonly app: readonly TNode[];
  readonly screens: readonly { readonly roots: readonly TNode[] }[];
  readonly componentDefs: readonly TNode[];
};

/** Depth-first tree traversal in adapter input order. */
export function controlNodes(bundle: AppBundle): ControlNode[];
export function controlNodes<TNode extends ReadonlyControlTreeNode<TNode>>(
  bundle: ReadonlyControlBundle<TNode>,
): readonly TNode[];
export function controlNodes<TNode extends ReadonlyControlTreeNode<TNode>>(
  bundle: ReadonlyControlBundle<TNode>,
): TNode[] {
  const remembered = NODE_ORDER.get(bundle) as readonly TNode[] | undefined;
  if (remembered) return [...remembered];

  const nodes: TNode[] = [];
  const visited = new WeakSet<TNode>();
  const descend = (root: TNode, depth: number): void => {
    if (depth > MAX_CONTROL_TREE_DEPTH || visited.has(root)) return;
    visited.add(root);
    nodes.push(root);
    for (const child of root.children) descend(child, depth + 1);
  };
  for (const definition of bundle.componentDefs) descend(definition, 0);
  nodes.push(...bundle.app);
  for (const screen of bundle.screens) for (const root of screen.roots) descend(root, 0);
  return nodes;
}
