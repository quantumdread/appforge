/**
 * Dependency-free analyzer core.
 *
 * No Worker APIs, Node APIs, generated catalog imports, or I/O belong here.
 * Catalog data and execution-surface compatibility options are injected into
 * every call.
 */
import { assertValidAugmentationCatalog, usesCommonVariantProperties, ownValue, type AnalyzerCatalogData } from './catalog.js';
export { declaredPropType } from './catalog.js';
import {
  APP_TYPE,
  COMPONENT_DEFINITION_TYPE,
  MAX_CONTROL_TREE_DEPTH,
  controlNodes,
  rememberControlNodeOrder,
  type AppBundle,
  type AppScreen,
  type ControlNode,
  type ParsedCustomProperty,
  type ParsedProperty,
} from './model.js';
export { APP_TYPE, COMPONENT_DEFINITION_TYPE, MAX_CONTROL_TREE_DEPTH } from './model.js';
export { controlNodes } from './model.js';
export type {
  AppBundle,
  AppScreen,
  ControlNode,
  ParsedCustomProperty,
  ParsedProperty,
} from './model.js';
import {
  bindLintRules,
  getLintOpportunities,
  runLintRules,
  treeContext,
  didYouMeanDetails,
  PA2108_TRAPS,
  type LintContext,
  type LintProfile,
  type LintRule,
} from './lint.js';
import type { IssueEvidence } from './evidence.js';

// Cross-generation property names (catalog scan 2026-11-03): every Modern* control takes Size and
// Color, while the older bare Button/TextInput take FontSize/FontColor and Text takes Size/FontColor.
// A hint is given only when the control's own catalog entry has the alias (field report F3).
const PROPERTY_NAME_ALIASES: Readonly<Record<string, string>> = { FontSize: 'Size', Size: 'FontSize', FontColor: 'Color', Color: 'FontColor' };

// Controls recovered from a Studio export carry only a LOWER BOUND of properties
// (Studio emits non-default props only). Unknown props/variants on them WARN
// rather than REFUSE — the usage feeds the verification queue.
const partialCatalogDetail = (type: string, subject: string) =>
  `${type} has partial catalog data (source: studio dump — Studio only emits non-default properties); ${subject} is unrecorded, not necessarily invalid. Usage feeds the verification queue.`;

// The same lower-bound doctrine at VARIANT granularity. `observed_variants:`
// names variant vocabulary current Studio ACCEPTS but no longer EMITS, so no
// fresh export can ever evidence it. Refusing it on a real, compiling app is the
// cardinal gate failure, so it WARNs under the same rule id and the control's
// properties are still validated normally against its extracted table.
const observedVariantDetail = (type: string, variant: string) =>
  `${type} variant '${variant}' is runtime-observed vocabulary (accepted by Studio, no longer emitted; evidence class runtime_observation) — usage feeds the verification queue.`;

// ─── Component (CanvasComponent + ComponentDefinition) validation constants ──
// Authored PropertyKind values for a component CustomProperty. The server may
// materialize these into function/action kinds when sync_canvas round-trips a file.
const CUSTOM_PROPERTY_KINDS = new Set(['Input', 'Output', 'Event']);
const MATERIALIZED_PROPERTY_KINDS = new Set(['InputFunction', 'OutputFunction', 'Action']);

// Known-legal DataType values for Input/Output custom properties, per the spec
// brief. JUDGMENT (documented in errata-t1-report.md): this list is provably
// INCOMPLETE — the Studio "Data type" dropdown also offers "Video or audio",
// which the brief omits — so an unrecognised DataType is a WARN
// ('custom-property-datatype'), never a REFUSE. Refusing a plausible-but-
// unrecorded value on a real, compiling component is the cardinal gate failure
// (same doctrine as dump-sourced partial catalogs).
const CUSTOM_PROPERTY_DATATYPES = new Set([
  'Text', 'Number', 'Boolean', 'Color', 'Date and time', 'Screen', 'Record',
  'Table', 'Image', 'Currency',
]);

// The fixed frame of a CanvasComponent INSTANCE. Everything else on an instance
// is an app-defined custom property (PASS if declared in the batch, else WARN).
// Sourced from the folded synthetic catalog entry so the two stay in lockstep.
const componentFrameProps = (catalogData: AnalyzerCatalogData): Set<string> =>
  new Set(Object.keys(ownValue(catalogData.controlProperties, 'CanvasComponent')?.input_properties ?? {}));

// Host-container properties belong to the component instance's placement in its
// parent, not to the component's app-defined custom-property surface. Reuse the
// generated catalog bundles directly so this stays aligned with ordinary child
// control validation.
const componentHostProps = (catalogData: AnalyzerCatalogData): Set<string> => {
  const properties = new Set<string>();
  for (const bundle of Object.values(catalogData.parentContextProperties)) {
    for (const property of Object.keys(bundle)) properties.add(property);
  }
  return properties;
};

// The definition-root Properties allow-list (item 4 of the brief). The component
// root surface is not fully cataloged, so unknowns WARN, not REFUSE. Declared
// CustomProperty names are added per-definition (Outputs carry their value here).
const COMPONENT_ROOT_PROPS = new Set([
  'Height', 'Width', 'Fill', 'X', 'Y', 'Visible', 'ContentLanguage', 'ChildTabPriority',
]);

export type IssueLevel = 'PASS' | 'WARN' | 'REFUSE';

export type Issue = {
  level: IssueLevel;
  file: string;
  line: number;
  control: string;
  type: string;
  property?: string;
  variant?: string;
  /** Complete offender list for per-file aggregate rules. */
  controls?: string[];
  detail: string;
  rule?: string;
  fix?: string;
  did_you_mean?: string;
  /** True when did_you_mean found a candidate for this refusal. */
  nearMiss?: boolean;
  /** Bounded derivation for Plan 4 envelope aggregation; stripped from legacy surfaces. */
  nearMissTelemetry?: {
    candidate: string;
    reason_code: 'case-mismatch' | 'edit-distance';
    edit_distance_bucket: '0' | '1' | '2';
  };
  /** Rule-declared structured facts (survey input). Stripped at both adapter boundaries. */
  evidence?: IssueEvidence;
};

export type FileSummary = {
  file: string;
  pass: number;
  warn: number;
  refuse: number;
  controls_seen: number;
};

export type GateDecision = 'CLEAR' | 'PROCEED_WITH_WARNINGS' | 'BLOCK';

export type CoverageTier =
  | 'extractor_verified' | 'augmentation_verified'
  | 'dump_sourced_lower_bound' | 'component_defined' | 'unknown';

export type FileRecognition = {
  file: string;
  recognizedRoots: number;
  unrecognizedLines: number;
  unrecognizedSpans: readonly (readonly [number, number])[];
};

export type AnalysisCoverage = {
  /**
   * Classified property occurrences by trust tier — NOT catalog inventory.
   * Excludes unrecognized control types, unknown variants, and App-level properties.
   */
  tiers: Record<CoverageTier, number>;
  files: FileRecognition[];
};

export type ValidationResult = {
  summary: { pass: number; warn: number; refuse: number; controls_seen: number; files: number };
  /** The gate's own verdict. Consumers copy it; nothing outside the analyzer computes it. */
  gateDecision: GateDecision;
  per_file: FileSummary[];
  issues: Issue[];
  /**
   * Internal AnalysisSnapshot graph. ControlNode.parent back-pointers make it cyclic,
   * so JSON.stringify on a ValidationResult throws; adapters must select fields explicitly.
   */
  bundle: AppBundle;
  /** Internal AnalysisSnapshot counters; not part of any adapter response. */
  coverage: AnalysisCoverage;
  /** Telemetry-only denominator work; intentionally lazy and never serialized. */
  opportunities: () => Record<string, number>;
};

export type AnalyzerOptions = {
  lintContext?: LintContext;
  /** A bound rule list lets an adapter preserve its independently tested surface. */
  lintRules?: LintRule[];
  lintProfile?: LintProfile;
  /** Worker=true; the local CLI preserves its established collision policy. */
  detectDuplicateControlNames?: boolean;
  /** Optional adapter-owned lower-bound guard; absent on legacy/CLI paths. */
  outputBudget?: {
    observeIssue(issue: Readonly<Issue>): void;
    observeUnrecognizedSpan?(start: number, end: number): void;
  };
};

type Frame = { ctrl: ControlNode; inProperties: boolean; propsHeaderIndent: number; propsIndent: number };

/**
 * Parse a plain/quoted YAML scalar the way YAML itself would:
 *   - If the value is wholly wrapped in matching single/double quotes, unwrap ONE
 *     level of quotes (collapsing YAML's `''` → `'` and `\"` → `"` escapes) and
 *     report wasQuoted:true. Anything after the closing quote (an inline comment)
 *     is discarded.
 *   - Otherwise it's a plain scalar: a ` #` (whitespace-then-hash) starts an inline
 *     comment which YAML terminates the scalar at, so strip from there onward.
 * This keeps the walker's captured value equal to the parsed YAML value, so the
 * lint rules (formula-missing-equals, block-scalar-required, long-inline-formula)
 * don't false-REFUSE on the surrounding quote or a trailing comment.
 */
function parseScalarValue(s: string): { value: string; wasQuoted: boolean; inlineComment?: string } {
  if (!s) return { value: '', wasQuoted: false };
  const q = s[0];
  if (q === "'" || q === '"') {
    let i = 1;
    for (; i < s.length; i++) {
      const ch = s[i];
      if (q === "'") {
        if (ch === "'") {
          if (s[i + 1] === "'") { i++; continue; } // '' → escaped single quote
          break; // closing quote
        }
      } else {
        if (ch === '\\') { i++; continue; } // skip escaped char (e.g. \")
        if (ch === '"') break; // closing quote
      }
    }
    if (i < s.length) {
      const inner = s.slice(1, i);
      const value = q === "'" ? inner.replace(/''/g, "'") : inner.replace(/\\"/g, '"');
      return { value, wasQuoted: true };
    }
    // Unterminated quote — fall through and treat as a plain scalar.
  }
  const idx = s.search(/\s#/); // inline comment start (space-then-hash)
  const body = idx === -1 ? s : s.slice(0, idx);
  return { value: body.trim(), wasQuoted: false, ...(idx === -1 ? {} : { inlineComment: s.slice(idx + 1) }) };
}

const indentOf = (ln: string): number => (ln.match(/^(\s*)/)?.[1].length) ?? 0;

/**
 * A control's sequence-item key line: `- <name>:` with nothing but an optional
 * comment after it.
 *
 * The name is ANY YAML mapping key, not just `\w+`. Studio names generated
 * controls after the source column, so real exports carry keys with spaces
 * (`Ordered On_DataCard1`, quoted or not), dots and hyphens. A key the walker
 * cannot read here does not open a frame, and every line of that control's
 * subtree — `Control:`, `Variant:` and its whole `Properties:` block — is then
 * attributed to the nearest recognised ANCESTOR, manufacturing phantom
 * `duplicate-property` REFUSEs against the ancestor's genuine properties and
 * mis-hosting every other per-property rule. That cascade (D2, 2026-08-31
 * brownfield survey) is the cardinal gate failure, so this pattern is
 * deliberately permissive: a key we read too broadly costs one misnamed control,
 * a key we fail to read costs an ancestor's entire property map.
 *
 * `.+?` with the `$` anchor still binds to the LAST colon on the line, so a
 * quoted key containing a colon stays intact, and `Items: =Foo` (a property, not
 * a key) does not match at all.
 *
 * KNOWN RESIDUAL (pre-existing, finding D5 in the 2026-08-31 discovery report):
 * this pattern is checked on every line, so a native-YAML list-of-records under
 * a property (`- Key:` with nested lines) opens a phantom control frame. Real
 * compile-path property values are Power Fx scalars, never nested YAML, so the
 * shape does not occur in held real exports — revisit if that ever changes.
 */
const CONTROL_KEY = /^(\s*)-\s+(.+?):\s*(?:#.*)?$/;

// ─── PA-YAML walker ───────────────────────────────────────────────────────
type LineRange = { start: number; end: number };
type ScreenRegion = { screen: AppScreen; start: number; end: number };
type ScreenRegions = { regions: ScreenRegion[]; ranges: LineRange[] };

/** Visit a possibly malformed graph once, without unbounded recursion. */
function visitControlTree(root: ControlNode, visit: (node: ControlNode) => void): void {
  const visited = new WeakSet<ControlNode>();
  const pending: Array<{ node: ControlNode; depth: number }> = [{ node: root, depth: 0 }];
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (current.depth > MAX_CONTROL_TREE_DEPTH || visited.has(current.node)) continue;
    visited.add(current.node);
    visit(current.node);
    for (let index = current.node.children.length - 1; index >= 0; index--) {
      pending.push({ node: current.node.children[index], depth: current.depth + 1 });
    }
  }
}

/** Unwrap the small subset of YAML key quoting used by authored screen/control names. */
function unquoteKey(raw: string): string {
  const key = raw.trim();
  if (key.startsWith("'") && key.endsWith("'")) return key.slice(1, -1).replace(/''/g, "'");
  if (key.startsWith('"') && key.endsWith('"')) return key.slice(1, -1).replace(/\\"/g, '"');
  return key;
}

/** Locate every authored screen subtree and its enclosing top-level `Screens:` block. */
function screenRegions(lines: string[], fileName: string, lineOffset: number): ScreenRegions {
  const regions: ScreenRegion[] = [];
  const ranges: LineRange[] = [];
  for (let header = 0; header < lines.length; header++) {
    if (!/^Screens:\s*$/.test(lines[header])) continue;
    let blockEnd = header + 1;
    for (; blockEnd < lines.length; blockEnd++) {
      const line = lines[blockEnd];
      if (!line.trim() || /^\s*#/.test(line)) continue;
      if (indentOf(line) === 0) break;
    }
    ranges.push({ start: header, end: blockEnd });

    const headings: Array<{ name: string; start: number }> = [];
    for (let index = header + 1; index < blockEnd; index++) {
      const line = lines[index];
      if (indentOf(line) !== 2 || /^\s*-/.test(line)) continue;
      const match = line.match(/^\s{2}(.+?):\s*$/);
      if (match) headings.push({ name: unquoteKey(match[1]), start: index });
    }
    headings.forEach((heading, index) => {
      const end = headings[index + 1]?.start ?? blockEnd;
      const screen: AppScreen = {
        name: heading.name, file: fileName, line: heading.start + 1 + lineOffset,
        properties: parseScreenProperties(lines, heading.start, end, lineOffset), roots: [],
      };
      regions.push({ screen, start: heading.start, end });
    });
    header = blockEnd - 1;
  }
  return { regions, ranges };
}

/** Capture direct screen properties without registering a new catalog control. */
function parseScreenProperties(
  lines: string[], start: number, end: number, lineOffset: number,
): ParsedProperty[] | undefined {
  const properties: ParsedProperty[] = [];
  let headerSeen = false;
  let inProperties = false;
  let inChildren = false;
  let propertyIndent = -1;
  let blockScalar: { prop: ParsedProperty; keyIndent: number } | null = null;
  for (let index = start + 1; index < end; index++) {
    const line = lines[index];
    const indent = indentOf(line);
    if (blockScalar) {
      if (!line.trim()) continue;
      if (indent > blockScalar.keyIndent) {
        blockScalar.prop.value += (blockScalar.prop.value ? '\n' : '') + line.trim();
        continue;
      }
      blockScalar = null;
    }
    if (!line.trim() || /^\s*#/.test(line)) continue;
    if (indent <= 4) {
      inProperties = false;
      inChildren = false;
    }
    if (inChildren) continue;
    if (indent === 4 && /^\s*Children:/.test(line)) {
      inChildren = true;
      continue;
    }
    // Unsupported direct-section indentation is unknown; nested control properties are not screen sections.
    if (!inProperties && indent !== 4) return undefined;
    // Quoted headers are outside this bounded capture, not evidence of no behavior.
    if (indent === 4 && /^\s*(?:"Properties"|'Properties')\s*:/.test(line)) return undefined;
    if (indent === 4 && /^\s*Properties:/.test(line)) {
      if (headerSeen) return undefined;
      headerSeen = true;
      if (/^\s*Properties:\s*\{\s*\}\s*$/.test(line)) continue;
      if (!/^\s*Properties:\s*$/.test(line)) return undefined;
      inProperties = true;
      continue;
    }
    if (!inProperties) continue;
    if (propertyIndent === -1) propertyIndent = indent;
    if (indent !== propertyIndent) return undefined;
    const match = line.match(/^\s*(\w+):\s*(.*)$/);
    if (!match) return undefined;
    const raw = match[2].trim();
    const isBlockScalar = /^[|>][+-]?$/.test(raw);
    const scalar = isBlockScalar ? { value: '', wasQuoted: false } : parseScalarValue(raw);
    const prop: ParsedProperty = {
      name: match[1], line: index + 1 + lineOffset, value: scalar.value,
      isBlockScalar, wasQuoted: scalar.wasQuoted, ...('inlineComment' in scalar ? { inlineComment: scalar.inlineComment } : {}),
    };
    properties.push(prop);
    if (isBlockScalar) blockScalar = { prop, keyIndent: indent };
  }
  return properties;
}

/** Find the exclusive end of a headerless root control's YAML subtree. */
function fallbackRootEnd(lines: string[], start: number, rootIndent: number): number {
  let end = start + 1;
  for (; end < lines.length; end++) {
    const line = lines[end];
    if (!line.trim() || /^\s*#/.test(line)) continue;
    if (indentOf(line) <= rootIndent) break;
  }
  return end;
}

function markRecognizedRange(recognized: boolean[], range: LineRange): void {
  for (let index = range.start; index < range.end; index++) recognized[index] = true;
}

/**
 * Derive the fallback name used only when a file has controls but no authored
 * `Screens:` roots. This stays dependency-free by handling both path separators
 * directly: `Screens/Home.pa.yaml` becomes `Home`.
 */
export function fileDerivedScreenName(fileName: string): string {
  const base = fileName.replaceAll('\\', '/').split('/').pop() || fileName;
  return base.replace(/\.pa\.ya?ml$/iu, '').replace(/\.ya?ml$/iu, '') || base;
}

/**
 * Parse one PA-YAML document into its App, screen, and component-definition
 * trees. The returned AppBundle replaces the former flat ParsedControl[] API.
 *
 * @param lineOffset Number of file lines that precede `text`; used internally
 *   when a ComponentDefinition child subtree is parsed in isolation.
 */
function walkPaYamlWithDiagnostics(
  text: string,
  fileName: string,
  lineOffset = 0,
): { bundle: AppBundle; recognized: boolean[]; structuralErrors: number[] } {
  const lines = text.replace(/\r/g, '').split('\n');
  const structuralErrors: number[] = [];
  const screenScan = screenRegions(lines, fileName, lineOffset);
  const regions = screenScan.regions;
  const recognized = lines.map(line => !line.trim() || /^\s*#/.test(line));
  screenScan.ranges.forEach(range => markRecognizedRange(recognized, range));
  const componentDefs: ControlNode[] = [];
  const app: ControlNode[] = [];
  const fallbackRoots: ControlNode[] = [];
  const fallbackRanges: LineRange[] = [];
  const documentControlOrder: ControlNode[] = [];
  const stack: Frame[] = [];
  let blockScalar: { prop: ParsedProperty; keyIndent: number } | null = null;

  // ─── ComponentDefinitions pass ─────────────────────────────────────────
  // A top-level `ComponentDefinitions:` block (the server-canonical shape of a
  // Components/<cName>.pa.yaml file) is not a Screens tree: each definition root
  // is a bare `<cName>:` key (no `- `) carrying CustomProperties + a root
  // Properties block + Children. We parse those into `__ComponentDefinition`
  // pseudo-controls here, walk their Children through the normal walker, and mark
  // the block's lines consumed so the main loop below skips them.
  const consumed = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    if (!/^ComponentDefinitions:\s*$/.test(lines[i])) continue;
    consumed.add(i);
    let j = i + 1;
    for (; j < lines.length; j++) {
      const l = lines[j];
      if (!l.trim() || /^\s*#/.test(l)) { consumed.add(j); continue; }
      if (indentOf(l) === 0) break; // dedent to column 0 ends the block
      consumed.add(j);
    }
    parseDefinitionsBlock(lines, i + 1, j, fileName, componentDefs, lineOffset, structuralErrors);
    i = j - 1;
  }

  // ─── App pass ──────────────────────────────────────────────────────────
  // App is another top-level authoring construct rather than a catalog
  // control. Model it as a pseudo-control so downstream lint can inspect its
  // properties without teaching the normal control-tree parser a second shape.
  // Both headings are real: `App:` (compile path) and the `App As App:` variant
  // documented in app-object-reference.md.
  for (let i = 0; i < lines.length; i++) {
    if (consumed.has(i) || !APP_HEADING.test(lines[i])) continue;
    consumed.add(i);
    let j = i + 1;
    for (; j < lines.length; j++) {
      const l = lines[j];
      if (!l.trim() || /^\s*#/.test(l)) { consumed.add(j); continue; }
      if (indentOf(l) === 0) break;
      consumed.add(j);
    }
    app.push(parseAppBlock(lines, i, j, fileName, lineOffset));
    i = j - 1;
  }
  consumed.forEach(index => { recognized[index] = true; });

  for (let i = 0; i < lines.length; i++) {
    if (consumed.has(i)) continue;
    const ln = lines[i];

    // Block-scalar continuation: any deeper-indented (or blank) line belongs to the scalar.
    if (blockScalar) {
      if (!ln.trim()) continue;
      const ind = (ln.match(/^(\s*)/)?.[1].length) ?? 0;
      if (ind > blockScalar.keyIndent) {
        blockScalar.prop.value += (blockScalar.prop.value ? '\n' : '') + ln.trim();
        continue;
      }
      blockScalar = null; // dedent — fall through to normal processing
    }

    if (!ln.trim() || /^\s*#/.test(ln)) continue;
    const indent = (ln.match(/^(\s*)/)?.[1].length) ?? 0;
    let m: RegExpMatchArray | null;

    while (stack.length && indent <= stack[stack.length - 1].ctrl.indent) stack.pop();

    // Retain malformed child structure for structural consumers. Validation's
    // existing recognition/verdict policy remains unchanged.
    if ((/^\s*Children:/.test(ln) && !/^\s*Children:\s*(?:\[\])?\s*$/.test(ln))
      || (/^\s*-\s/.test(ln) && !CONTROL_KEY.test(ln) && !stack.at(-1)?.inProperties)) {
      structuralErrors.push(i + 1 + lineOffset);
    }
    if ((m = ln.match(CONTROL_KEY))) {
      const parentFrame = stack.length ? stack[stack.length - 1] : null;
      const region = regions.find(candidate => i > candidate.start && i < candidate.end);
      const screen = parentFrame?.ctrl.screen ?? region?.screen ?? null;
      const ctrl: ControlNode = {
        file: fileName, line: i + 1 + lineOffset, indent, name: unquoteKey(m[2]),
        type: null, authoredTypePinned: false, authoredTypeVersion: null, variant: null, componentName: null,
        parent: parentFrame ? parentFrame.ctrl : null, children: [], screen,
        properties: [],
      };
      documentControlOrder.push(ctrl);
      stack.push({ ctrl, inProperties: false, propsHeaderIndent: -1, propsIndent: -1 });
      if (parentFrame) parentFrame.ctrl.children.push(ctrl);
      else if (screen) screen.roots.push(ctrl);
      else {
        fallbackRoots.push(ctrl);
        fallbackRanges.push({ start: i, end: fallbackRootEnd(lines, i, indent) });
      }
      continue;
    }

    const top = stack.length ? stack[stack.length - 1] : null;
    if (top && indent > top.ctrl.indent) {
      if ((m = ln.match(/^\s*Control:\s*(\S+)/))) {
        // The current authoring schema emits bare types. Normalize legacy
        // Type@version inputs to that same parsed representation so rule-set
        // membership and catalog lookup remain exact on bare control names.
        const authoredType = m[1];
        const bareType = authoredType.replace(/@[^@\s]*$/u, '');
        top.ctrl.authoredTypePinned = bareType.length > 0 && bareType !== authoredType;
        top.ctrl.authoredTypeVersion = top.ctrl.authoredTypePinned
          ? authoredType.slice(bareType.length + 1) || null
          : null;
        top.ctrl.type = top.ctrl.authoredTypePinned ? bareType : authoredType;
        continue;
      }
      if ((m = ln.match(/^\s*Variant:\s*(\S+)/))) { top.ctrl.variant = m[1]; continue; }
      if ((m = ln.match(/^\s*ComponentName:\s*(\S+)/))) { top.ctrl.componentName = m[1]; continue; }
      if (/^\s*Properties:\s*$/.test(ln)) { top.inProperties = true; top.propsHeaderIndent = indent; top.propsIndent = -1; continue; }
      if (/^\s*Children:\s*(?:\[\])?\s*$/.test(ln)) { top.ctrl.hasChildren = true; top.inProperties = false; continue; }

      if (top.inProperties && indent > top.propsHeaderIndent) {
        if (top.propsIndent === -1) top.propsIndent = indent; // learn indent from first property
        if (indent === top.propsIndent && (m = ln.match(/^\s*(\w+):\s*(.*)$/))) {
          const raw = m[2].trim();
          const isBlock = /^[|>][+-]?$/.test(raw);
          const scalar = isBlock ? { value: '', wasQuoted: false } : parseScalarValue(raw);
          const prop: ParsedProperty = { name: m[1], line: i + 1 + lineOffset, value: scalar.value, isBlockScalar: isBlock, wasQuoted: scalar.wasQuoted, ...('inlineComment' in scalar ? { inlineComment: scalar.inlineComment } : {}) };
          top.ctrl.properties.push(prop);
          if (isBlock) blockScalar = { prop, keyIndent: indent };
          continue;
        }
      }
    }
  }
  const screens = regions.map(region => region.screen);
  if (fallbackRoots.length > 0) {
    const fallback: AppScreen = { name: fileDerivedScreenName(fileName), file: fileName, roots: fallbackRoots };
    fallbackRoots.forEach(root => visitControlTree(root, node => { node.screen = fallback; }));
    screens.push(fallback);
  }
  const bundle = { app, screens, componentDefs };
  const nonScreenTrees: AppBundle = { app, screens: [], componentDefs };
  rememberControlNodeOrder(bundle, [...controlNodes(nonScreenTrees), ...documentControlOrder]);
  fallbackRanges.forEach(range => markRecognizedRange(recognized, range));
  return { bundle, recognized, structuralErrors };
}

export function walkPaYaml(text: string, fileName: string, lineOffset = 0): AppBundle {
  return walkPaYamlWithDiagnostics(text, fileName, lineOffset).bundle;
}

/** Top-level App heading: `App:` (compile path) or the documented `App As App:` variant. */
const APP_HEADING = /^App(?:\s+As\s+App)?:\s*$/;

/** Extract declaration heads from the semicolon-separated App.Formulas value. */
function extractAppFormulaNames(value: string): string[] {
  const names: string[] = [];
  const declaration = /(?:^|;)\s*=?\s*([A-Za-z_]\w*)\s*(?=\(|=)/g;
  for (const match of value.matchAll(declaration)) names.push(match[1]);
  return [...new Set(names)];
}

/**
 * Parse the properties of one top-level App block (lines [header,end)).
 *
 * TWO real shapes, both accepted (verified against a production App.pa.yaml):
 *   App:                     App:
 *     OnStart: =…              Properties:
 *                                OnStart: =…
 * The nested `Properties:` form is what the compile path emits, so treating only
 * the flat form as valid made heavy-onstart / perf-onstart-no-concurrent /
 * appFormulaNames dead on every real app.
 */
function parseAppBlock(
  lines: string[],
  header: number,
  end: number,
  fileName: string,
  lineOffset: number,
): ControlNode {
  const app: ControlNode = {
    file: fileName, line: header + 1 + lineOffset, indent: 0, name: 'App',
    type: APP_TYPE, authoredTypePinned: false, authoredTypeVersion: null, variant: null, componentName: null, parent: null,
    children: [], screen: null, properties: [], appFormulaNames: [],
  };

  let blockScalar: { prop: ParsedProperty; keyIndent: number } | null = null;
  let propsIndent = -1;               // learned from the first key under a `Properties:` header
  for (let i = header + 1; i < end; i++) {
    const ln = lines[i];
    if (blockScalar) {
      if (!ln.trim()) continue;
      if (indentOf(ln) > blockScalar.keyIndent) {
        blockScalar.prop.value += (blockScalar.prop.value ? '\n' : '') + ln.trim();
        continue;
      }
      blockScalar = null;
    }

    if (!ln.trim() || /^\s*#/.test(ln)) continue;
    const indent = indentOf(ln);
    if (indent === 2 && /^\s*Properties:\s*$/.test(ln)) { propsIndent = -2; continue; } // -2: awaiting first nested key
    if (propsIndent === -2 && indent > 2) propsIndent = indent;
    const isProperty = indent === 2 || (propsIndent > 2 && indent === propsIndent);
    const m = isProperty ? ln.match(/^\s*(\w+):\s*(.*)$/) : null;
    if (!m) continue;

    const raw = m[2].trim();
    const isBlock = /^[|>][+-]?$/.test(raw);
    const scalar = isBlock ? { value: '', wasQuoted: false } : parseScalarValue(raw);
    const prop: ParsedProperty = {
      name: m[1], line: i + 1 + lineOffset, value: scalar.value,
      isBlockScalar: isBlock, wasQuoted: scalar.wasQuoted, ...('inlineComment' in scalar ? { inlineComment: scalar.inlineComment } : {}),
    };
    app.properties.push(prop);
    if (isBlock) blockScalar = { prop, keyIndent: indent };
  }

  const formulas = app.properties.find(p => p.name === 'Formulas');
  app.appFormulaNames = formulas ? extractAppFormulaNames(formulas.value) : [];
  return app;
}

// ─── ComponentDefinitions parsing ──────────────────────────────────────────
/** Parse each `<cName>:` definition in a ComponentDefinitions block (lines [start,end)). */
function parseDefinitionsBlock(
  lines: string[],
  start: number,
  end: number,
  fileName: string,
  out: ControlNode[],
  lineOffset: number,
  structuralErrors: number[],
): void {
  let i = start;
  while (i < end) {
    const ln = lines[i];
    if (!ln.trim() || /^\s*#/.test(ln)) { i++; continue; }
    const m = ln.match(/^(\s*)([A-Za-z_]\w*):\s*$/);
    if (m && m[1].length === 2) {
      const defIndent = 2;
      const def: ControlNode = {
        file: fileName, line: i + 1 + lineOffset, indent: defIndent, name: m[2],
        type: COMPONENT_DEFINITION_TYPE, authoredTypePinned: false, authoredTypeVersion: null, variant: null, componentName: null,
        parent: null, children: [], screen: null, properties: [], customProperties: [],
      };
      out.push(def);
      // Definition body extends until the next line at indent <= 2.
      let j = i + 1;
      for (; j < end; j++) {
        const l = lines[j];
        if (!l.trim() || /^\s*#/.test(l)) continue;
        if (indentOf(l) <= defIndent) break;
      }
      parseDefinitionBody(lines, i + 1, j, def, fileName, lineOffset, structuralErrors);
      i = j;
      continue;
    }
    i++;
  }
}

/**
 * Parse one definition body (lines [start,end)): its CustomProperties, root
 * Properties, and Children. Children are walked through the normal walkPaYaml
 * (they are ordinary controls validated against the real catalog).
 */
function parseDefinitionBody(
  lines: string[],
  start: number,
  end: number,
  def: ControlNode,
  fileName: string,
  lineOffset: number,
  structuralErrors: number[],
): void {
  let section: 'custom' | 'props' | null = null;
  let curCustom: ParsedCustomProperty | null = null;
  let blockScalar: { prop: ParsedProperty; keyIndent: number } | null = null;

  let i = start;
  while (i < end) {
    const ln = lines[i];

    // Root Properties block-scalar continuation.
    if (blockScalar) {
      if (!ln.trim()) { i++; continue; }
      if (indentOf(ln) > blockScalar.keyIndent) {
        blockScalar.prop.value += (blockScalar.prop.value ? '\n' : '') + ln.trim();
        i++; continue;
      }
      blockScalar = null;
    }

    if (!ln.trim() || /^\s*#/.test(ln)) { i++; continue; }
    const indent = indentOf(ln);
    let m: RegExpMatchArray | null;

    // Section headers live at the definition-body indent (4).
    if (indent === 4) {
      if (/^\s*CustomProperties:\s*$/.test(ln)) { section = 'custom'; curCustom = null; i++; continue; }
      if (/^\s*Properties:\s*$/.test(ln)) { section = 'props'; i++; continue; }
      if (/^\s*Children:\s*(?:\[\])?\s*$/.test(ln)) {
        def.hasChildren = true;
        // Capture the Children subtree (indent > 4) and walk it normally.
        let k = i + 1;
        for (; k < end; k++) {
          const l = lines[k];
          if (!l.trim() || /^\s*#/.test(l)) continue;
          if (indentOf(l) <= 4) break;
        }
        const childText = lines.slice(i + 1, k).join('\n');
        // childText starts at file line (i+1)+1, so its local line 1 sits `i+1`
        // file lines in — thread that as the offset for true line citations.
        const childResult = walkPaYamlWithDiagnostics(childText, fileName, i + 1 + lineOffset);
        const childBundle = childResult.bundle;
        structuralErrors.push(...childResult.structuralErrors);
        for (const childScreen of childBundle.screens) for (const root of childScreen.roots) {
          root.parent = def;
          visitControlTree(root, node => { node.screen = null; });
          def.children.push(root);
        }
        section = null; i = k; continue;
      }
      // DefinitionType / AccessAppScope and any other scalar — not validated here.
      section = null; i++; continue;
    }

    if (section === 'custom') {
      if (indent === 6 && (m = ln.match(/^\s*(\w+):\s*$/))) {
        curCustom = { name: m[1], line: i + 1 + lineOffset, fields: Object.create(null) };
        def.customProperties!.push(curCustom);
        i++; continue;
      }
      if (indent === 8 && curCustom && (m = ln.match(/^\s*(\w+):\s*(.*)$/))) {
        curCustom.fields[m[1]] = m[2].trim();
        i++; continue;
      }
    }

    if (section === 'props') {
      if (indent === 6 && (m = ln.match(/^\s*(\w+):\s*(.*)$/))) {
        const raw = m[2].trim();
        const isBlock = /^[|>][+-]?$/.test(raw);
        const scalar = isBlock ? { value: '', wasQuoted: false } : parseScalarValue(raw);
        const prop: ParsedProperty = { name: m[1], line: i + 1 + lineOffset, value: scalar.value, isBlockScalar: isBlock, wasQuoted: scalar.wasQuoted, ...('inlineComment' in scalar ? { inlineComment: scalar.inlineComment } : {}) };
        def.properties.push(prop);
        if (isBlock) blockScalar = { prop, keyIndent: indent };
        i++; continue;
      }
    }

    i++;
  }
}

// ─── Component validation ──────────────────────────────────────────────────
/** A component definition seen in the batch: its name → declared custom property names. */
type ComponentDefIndex = Map<string, Set<string>>;

/**
 * Validate a `__ComponentDefinition` pseudo-control: the CustomProperties matrix
 * (PropertyKind / DataType / ReturnType / Output-no-Default) and the definition
 * root Properties allow-list. Pushes issues and updates the file summary.
 */
function validateComponentDefinition(
  c: ControlNode,
  issues: Issue[],
  fs: FileSummary,
  coverageTiers: Record<CoverageTier, number>,
): void {
  const declaredNames = new Set<string>();
  for (const cp of c.customProperties ?? []) {
    declaredNames.add(cp.name);
    const kind = cp.fields['PropertyKind'];

    if (kind && MATERIALIZED_PROPERTY_KINDS.has(kind)) {
      issues.push({
        level: 'WARN', file: c.file, line: cp.line, control: c.name, type: c.type ?? COMPONENT_DEFINITION_TYPE,
        property: cp.name, rule: 'materialized-property-kind',
        detail: 'server-materialized PropertyKind (sync_canvas emits Input as InputFunction on round-trip); authored source should use Input/Output/Event',
      });
      fs.warn++;
      continue;
    }

    if (!kind || !CUSTOM_PROPERTY_KINDS.has(kind)) {
      issues.push({
        level: 'REFUSE', file: c.file, line: cp.line, control: c.name, type: c.type ?? COMPONENT_DEFINITION_TYPE,
        property: cp.name, rule: 'custom-property-kind',
        detail: `custom property '${cp.name}' has PropertyKind '${kind ?? '(missing)'}' — must be one of Input, Output, Event.`,
      });
      fs.refuse++;
      continue; // kind is unknown; the kind-specific checks below don't apply
    }

    if (kind === 'Input' || kind === 'Output') {
      const dt = cp.fields['DataType'];
      if (dt && !CUSTOM_PROPERTY_DATATYPES.has(dt)) {
        issues.push({
          level: 'WARN', file: c.file, line: cp.line, control: c.name, type: c.type ?? COMPONENT_DEFINITION_TYPE,
          property: cp.name, rule: 'custom-property-datatype',
          detail: `custom property '${cp.name}' DataType '${dt}' is not in the known-legal set (${[...CUSTOM_PROPERTY_DATATYPES].join(', ')}, plus "Video or audio"). Not necessarily invalid — the legal set is not fully cataloged; verify against compile_canvas.`,
        });
        fs.warn++;
      }
    }

    if (kind === 'Input' && 'Default' in cp.fields) {
      const defaultValue = parseScalarValue(cp.fields['Default']).value.trim();
      if (defaultValue === '' || defaultValue === '=') {
        issues.push({
          level: 'REFUSE', file: c.file, line: cp.line, control: c.name, type: c.type ?? COMPONENT_DEFINITION_TYPE,
          property: cp.name, rule: 'input-property-empty-default',
          detail: "Microsoft's validator: Custom input property of kind 'Input' requires a non-empty 'Default' formula.",
          fix: `give ${cp.name} a non-empty Default, e.g. =RGBA(0, 0, 0, 1) for a Color`,
        });
        fs.refuse++;
      }
    }

    if (kind === 'Output' && 'Default' in cp.fields) {
      issues.push({
        level: 'REFUSE', file: c.file, line: cp.line, control: c.name, type: c.type ?? COMPONENT_DEFINITION_TYPE,
        property: cp.name, rule: 'output-property-default',
        detail: `Output custom property '${cp.name}' must NOT have a Default — an Output's value is set in the definition's Properties: block (e.g. ${cp.name}: =...), not as a custom-property Default.`,
        fix: `remove Default from ${cp.name}; set its value under the definition's Properties: block instead`,
      });
      fs.refuse++;
    }

    if (kind === 'Event') {
      if (!cp.fields['ReturnType']) {
        issues.push({
          level: 'REFUSE', file: c.file, line: cp.line, control: c.name, type: c.type ?? COMPONENT_DEFINITION_TYPE,
          property: cp.name, rule: 'event-return-type-required',
          detail: `Event custom property '${cp.name}' requires a ReturnType (e.g. ReturnType: None).`,
        });
        fs.refuse++;
      }
      if (!('Default' in cp.fields)) {
        issues.push({
          level: 'WARN', file: c.file, line: cp.line, control: c.name, type: c.type ?? COMPONENT_DEFINITION_TYPE,
          property: cp.name, rule: 'event-default-recommended',
          detail: `Event custom property '${cp.name}' should carry Default: =false (the server materializes it; absence can round-trip inconsistently).`,
        });
        fs.warn++;
      }
    }
  }

  // Definition root Properties allow-list: base frame + declared custom prop names.
  const allowedRoot = new Set<string>([...COMPONENT_ROOT_PROPS, ...declaredNames]);
  for (const p of c.properties) {
    if (allowedRoot.has(p.name)) { fs.pass++; coverageTiers.component_defined++; continue; }
    issues.push({
      level: 'WARN', file: c.file, line: p.line, control: c.name, type: c.type ?? COMPONENT_DEFINITION_TYPE,
      property: p.name, rule: 'component-root-property',
      detail: `'${p.name}' is not a cataloged component-root property and not a declared CustomProperty — the root surface is not fully cataloged.`,
    });
    coverageTiers.unknown++;
    fs.warn++;
  }
}

/**
 * Validate a `Control: CanvasComponent` instance: the required ComponentName
 * sibling, then each property (fixed frame → PASS; declared custom prop when the
 * definition is in the batch → PASS; anything else → WARN 'component-custom-property').
 */
function validateComponentInstance(
  c: ControlNode,
  defs: ComponentDefIndex,
  catalogData: AnalyzerCatalogData,
  issues: Issue[],
  fs: FileSummary,
  coverageTiers: Record<CoverageTier, number>,
): void {
  if (!c.componentName) {
    issues.push({
      level: 'REFUSE', file: c.file, line: c.line, control: c.name, type: c.type ?? 'CanvasComponent',
      rule: 'component-name-required',
      detail: `CanvasComponent instance '${c.name}' has no ComponentName sibling — a bare 'Control: CanvasComponent' is invalid; add 'ComponentName: <cName>'.`,
      fix: `add a ComponentName: line naming the component definition this instance renders`,
    });
    fs.refuse++;
    return;
  }

  const frame = componentFrameProps(catalogData);
  const host = componentHostProps(catalogData);
  const declared = defs.get(c.componentName) ?? null;

  for (const p of c.properties) {
    if (frame.has(p.name)) { fs.pass++; coverageTiers.extractor_verified++; continue; }
    if (host.has(p.name)) { fs.pass++; coverageTiers.extractor_verified++; continue; }
    if (declared && declared.has(p.name)) { fs.pass++; coverageTiers.component_defined++; continue; }
    const detail = declared
      ? `'${p.name}' is not declared on component '${c.componentName}' — check spelling (custom properties are app-defined).`
      : `'${p.name}' is an app-defined custom property; the definition for '${c.componentName}' is not in this batch, so it can't be checked. Include Components/${c.componentName}.pa.yaml to validate custom-property names.`;
    issues.push({
      level: 'WARN', file: c.file, line: p.line, control: c.name, type: c.type ?? 'CanvasComponent',
      property: p.name, rule: 'component-custom-property', detail,
    });
    coverageTiers.unknown++;
    fs.warn++;
  }
}

type AppBundleDiagnostics = { bundle: AppBundle; recognizedByFile: Map<string, boolean[]>; structuralErrorsByFile: Map<string, number[]> };

/** Construct the one batch-level bundle and per-file walker diagnostics. */
export function buildAppBundleWithDiagnostics(files: Array<{ name: string; content: string }>): AppBundleDiagnostics {
  const bundle: AppBundle = { app: [], screens: [], componentDefs: [] };
  const recognizedByFile = new Map<string, boolean[]>();
  const structuralErrorsByFile = new Map<string, number[]>();
  const ordered: ControlNode[] = [];
  for (const file of files) {
    const { bundle: document, recognized, structuralErrors } = walkPaYamlWithDiagnostics(file.content, file.name);
    structuralErrorsByFile.set(file.name, structuralErrors);
    recognizedByFile.set(file.name, recognized);
    ordered.push(...controlNodes(document));
    bundle.app.push(...document.app);
    bundle.screens.push(...document.screens);
    bundle.componentDefs.push(...document.componentDefs);
  }
  rememberControlNodeOrder(bundle, ordered);
  return { bundle, recognizedByFile, structuralErrorsByFile };
}

export function buildAppBundle(files: Array<{ name: string; content: string }>): AppBundle {
  return buildAppBundleWithDiagnostics(files).bundle;
}

/** Every control name in a set of PA-YAML files: the `existingControls` lint context for an earlier copy of the app. */
export function controlNamesOf(files: Array<{ name: string; content: string }>): string[] {
  return [...controlNodes(buildAppBundle(files))].map(control => control.name);
}

function unrecognizedSpans(
  recognized: boolean[],
  observer?: (start: number, end: number) => void,
): readonly (readonly [number, number])[] {
  const spans: Array<readonly [number, number]> = [];
  const retain = (start: number, end: number) => {
    observer?.(start, end);
    spans.push(Object.freeze([start, end] as [number, number]));
  };
  let start: number | null = null;
  for (let index = 0; index < recognized.length; index++) {
    if (!recognized[index] && start === null) start = index + 1;
    if (recognized[index] && start !== null) {
      retain(start, index);
      start = null;
    }
  }
  if (start !== null) retain(start, recognized.length);
  return Object.freeze(spans);
}

// ─── Validation ───────────────────────────────────────────────────────────
export function validateFiles(
  files: Array<{ name: string; content: string }>,
  catalogData: AnalyzerCatalogData,
  options: AnalyzerOptions = {},
): ValidationResult {
  assertValidAugmentationCatalog(catalogData);
  const { bundle, recognizedByFile } = buildAppBundleWithDiagnostics(files);
  const coverageFiles: FileRecognition[] = files.map(file => {
    const observeSpan = options.outputBudget?.observeUnrecognizedSpan;
    const spans = unrecognizedSpans(
      recognizedByFile.get(file.name)!,
      observeSpan === undefined
        ? undefined
        : (start, end) => observeSpan.call(options.outputBudget, start, end),
    );
    return {
      file: file.name,
      recognizedRoots:
        bundle.screens.reduce(
          (count, screen) => count + screen.roots.filter(root => root.file === file.name).length,
          0,
        )
        + bundle.app.filter(root => root.file === file.name).length
        + bundle.componentDefs.filter(root => root.file === file.name).length,
      unrecognizedLines: spans.reduce((count, [start, end]) => count + end - start + 1, 0),
      unrecognizedSpans: spans,
    };
  });
  const allControls = [...controlNodes(bundle)];

  // Index component definitions seen anywhere in the batch (name → custom prop names).
  const componentDefs: ComponentDefIndex = new Map();
  for (const c of allControls) {
    if (c.type !== COMPONENT_DEFINITION_TYPE) continue;
    componentDefs.set(c.name, new Set((c.customProperties ?? []).map(cp => cp.name)));
  }

  const collectedIssues: Issue[] = [];
  const issues: Issue[] = options.outputBudget === undefined
    ? collectedIssues
    : new Proxy(collectedIssues, {
        get(target, property, receiver) {
          if (property !== 'push') return Reflect.get(target, property, receiver);
          return (...values: Issue[]) => {
            for (const issue of values) options.outputBudget!.observeIssue(issue);
            return target.push(...values);
          };
        },
      });
  const coverageTiers: Record<CoverageTier, number> = {
    extractor_verified: 0, augmentation_verified: 0,
    dump_sourced_lower_bound: 0, component_defined: 0, unknown: 0,
  };
  const perFile = new Map<string, FileSummary>();
  for (const f of files) perFile.set(f.name, { file: f.name, pass: 0, warn: 0, refuse: 0, controls_seen: 0 });
  const configuredLintRules = options.lintRules ?? bindLintRules(catalogData, options.lintProfile);
  const inlineDuplicateRule = options.lintProfile === 'cli'
    ? configuredLintRules.find(rule => rule.id === 'duplicate-property')
    : undefined;

  // ─── Cross-file collision check (the gap that let the holiday build leak) ─
  const nameToOwners = new Map<string, ControlNode[]>();
  for (const c of allControls) {
    if (!c.type || c.type === APP_TYPE) continue; // not a real control (Screen-level node or App pseudo-control)
    if (!nameToOwners.has(c.name)) nameToOwners.set(c.name, []);
    nameToOwners.get(c.name)!.push(c);
  }
  if (options.detectDuplicateControlNames ?? true) {
    for (const [name, owners] of nameToOwners) {
      if (owners.length <= 1) continue;
      const ownerList = owners.map(owner => owner.file + ':' + owner.line).join(', ');
      const detail = "duplicate-control-name: '" + name + "' is declared in "
        + owners.length + ' places (' + ownerList
        + '). PA-YAML requires globally unique control names across all screens.';
      for (const o of owners) {
        issues.push({
          level: 'REFUSE',
          rule: 'duplicate-control-name',
          file: o.file,
          line: o.line,
          control: name,
          type: o.type ?? 'unknown',
          detail,
        });
        perFile.get(o.file)!.refuse++;
      }
    }
  }

  // ─── Per-control validation ──────────────────────────────────────────────
  const manifestMap = new Map<string, { type: string; variants: string[] }>();
  for (const c of catalogData.controls) {
    manifestMap.set(c.type, { type: c.type, variants: [...c.variants] });
  }

  for (const c of allControls) {
    const fs = perFile.get(c.file)!;
    if (!c.type) continue;
    if (c.type === APP_TYPE) continue;
    fs.controls_seen++;

    // Component pseudo-controls and instances are validated by their own rules,
    // not the generic manifest/property path.
    if (c.type === COMPONENT_DEFINITION_TYPE) {
      validateComponentDefinition(c, issues, fs, coverageTiers);
      continue;
    }
    if (c.type === 'CanvasComponent') {
      validateComponentInstance(c, componentDefs, catalogData, issues, fs, coverageTiers);
      continue;
    }

    // Frozen CLI compatibility: duplicate keys were classified control-major,
    // immediately before that control's manifest/property checks. Keep the rule
    // implementation single-sourced while preserving its historical position.
    if (inlineDuplicateRule) {
      const screen: AppScreen = {
        ...(c.screen ?? {}),
        name: c.screen?.name ?? fileDerivedScreenName(c.file),
        file: c.file,
        roots: [],
      };
      const isolated: ControlNode = { ...c, parent: null, children: [], screen };
      screen.roots.push(isolated);
      const oneControlBundle: AppBundle = { app: [], screens: [screen], componentDefs: [] };
      const duplicateIssues = inlineDuplicateRule.check(
        oneControlBundle,
        treeContext(oneControlBundle, options.lintContext),
      );
      issues.push(...duplicateIssues);
      for (const duplicateIssue of duplicateIssues) {
        if (duplicateIssue.level === 'REFUSE') fs.refuse++;
        else fs.warn++;
      }
    }

    const manifestEntry = manifestMap.get(c.type);
    const propsEntry = ownValue(catalogData.controlProperties, c.type);
    const augEntry = ownValue(catalogData.augmentations, c.type);

    if (!manifestEntry) {
      const suggestion = didYouMeanDetails(c.type, manifestMap.keys());
      issues.push({
        level: 'REFUSE', file: c.file, line: c.line, control: c.name, type: c.type,
        detail: 'control-type-not-in-manifest', rule: 'unknown-control',
        did_you_mean: suggestion?.candidate,
        nearMiss: suggestion !== null,
        nearMissTelemetry: suggestion ?? undefined,
      });
      fs.refuse++;
      continue;
    }

    const isDumpSourced = catalogData.dumpSourced.includes(c.type);

    if (c.variant) {
      const known = new Set([...manifestEntry.variants, ...(augEntry?.legacy_variants ?? []),
        ...(augEntry?.current_variants ?? []).map(entry => entry.name)]);
      if (!known.has(c.variant)) {
        if (isDumpSourced) {
          // Partial catalog — unknown variant WARNs, don't REFUSE, and still
          // validate the properties (they live on the flat input list).
          issues.push({
            level: 'WARN', file: c.file, line: c.line, control: c.name, type: c.type,
            variant: c.variant, rule: 'partial-catalog-data',
            detail: partialCatalogDetail(c.type, `variant ${c.variant}`),
          });
          fs.warn++;
        } else if ((augEntry?.observed_variants?.variants ?? []).includes(c.variant)) {
          // Accepted-but-no-longer-emitted variant vocabulary: WARN under the
          // same rule id as the dump-sourced lower bound, and fall through so
          // the control's properties are still validated normally.
          issues.push({
            level: 'WARN', file: c.file, line: c.line, control: c.name, type: c.type,
            variant: c.variant, rule: 'partial-catalog-data',
            detail: observedVariantDetail(c.type, c.variant),
          });
          fs.warn++;
        } else {
          issues.push({
            level: 'REFUSE', file: c.file, line: c.line, control: c.name, type: c.type,
            variant: c.variant, detail: 'variant-not-in-catalog', rule: 'unknown-variant',
          });
          fs.refuse++;
          continue;
        }
      }
    }

    const allowed = new Set<string>(Object.keys(propsEntry?.input_properties ?? {}));
    const useCommonProperties = usesCommonVariantProperties(catalogData, c.type, c.variant);
    if (useCommonProperties) {
      for (const p of Object.keys(propsEntry?.common_variant_properties ?? {})) allowed.add(p);
    }
    const variantProperties = c.variant ? ownValue(propsEntry?.variant_input_properties, c.variant) : undefined;
    for (const p of Object.keys(variantProperties ?? {})) allowed.add(p);
    for (const bundle of (propsEntry?.parent_context ?? []) as string[]) {
      const bundleProps = ownValue(catalogData.parentContextProperties, bundle);
      if (bundleProps) for (const p of Object.keys(bundleProps)) allowed.add(p);
    }

    const augAdditions: Record<string, { type: string; verified: boolean }> = augEntry?.additional_input_properties ?? {};

    for (const prop of c.properties) {
      if (['Children', 'Properties'].includes(prop.name)) continue;

      if (allowed.has(prop.name)) {
        fs.pass++;
        if (isDumpSourced) coverageTiers.dump_sourced_lower_bound++;
        else coverageTiers.extractor_verified++;
        continue;
      }
      const acceptingVariants = useCommonProperties ? ownValue(propsEntry?.variant_property_variants, prop.name) : undefined;
      if (acceptingVariants?.length) {
        issues.push({
          level: 'WARN', file: c.file, line: prop.line, control: c.name, type: c.type, property: prop.name,
          rule: 'variant-unspecified-property',
          detail: `${c.type}.${prop.name} is declared by variants ${acceptingVariants.join(', ')}; ${c.variant ? `authored variant ${c.variant} carries no platform scoping` : 'no Variant is authored'}.`,
          fix: 'declare Variant: with a variant that accepts this property',
        });
        fs.warn++;
        coverageTiers.unknown++;
        continue;
      }
      const aug = ownValue(augAdditions, prop.name);
      if (aug?.verified) {
        fs.pass++;
        coverageTiers.augmentation_verified++;
        continue;
      }
      if (aug) {
        issues.push({
          level: 'WARN', file: c.file, line: prop.line, control: c.name, type: c.type, property: prop.name,
          rule: 'unverified-augmentation',
          detail: `unverified-augmentation: ${c.type}.${prop.name} (type ${aug.type}) is in control-augmentations.yml with verified:false. Confirm against compile_canvas and promote to verified:true, or remove if rejected.`,
        });
        fs.warn++;
        coverageTiers.unknown++;
        continue;
      }
      if (isDumpSourced) {
        // Unknown property on a partial-catalog control: WARN, never REFUSE.
        issues.push({
          level: 'WARN', file: c.file, line: prop.line, control: c.name, type: c.type, property: prop.name,
          rule: 'partial-catalog-data', detail: partialCatalogDetail(c.type, prop.name),
        });
        fs.warn++;
        coverageTiers.dump_sourced_lower_bound++;
        continue;
      }
      coverageTiers.unknown++;
      const trap = PA2108_TRAPS.find(t => t.control === c.type && t.property === prop.name);
      if (trap) {
        issues.push({
          level: 'REFUSE', file: c.file, line: prop.line, control: c.name, type: c.type, property: prop.name,
          detail: trap.fix, rule: 'pa2108-trap', fix: trap.fix,
        });
      } else {
        const candidates = [...allowed, ...Object.keys(augAdditions)];
        const alias = Object.hasOwn(PROPERTY_NAME_ALIASES, prop.name) ? PROPERTY_NAME_ALIASES[prop.name] : undefined;
        const aliasAllowed = alias !== undefined && candidates.includes(alias);
        const suggestion = didYouMeanDetails(prop.name, candidates);
        const mappedCounterpart = Object.entries(catalogData.modernization ?? {})
          .find(([, pair]) => pair.target === c.type)?.[0];
        const counterpart = mappedCounterpart ?? (manifestMap.has(`Classic/${c.type}`) ? `Classic/${c.type}` : undefined);
        const counterpartHasProperty = counterpart !== undefined
          && ownValue(ownValue(catalogData.controlProperties, counterpart)?.input_properties, prop.name) !== undefined;
        issues.push({
          level: 'REFUSE', file: c.file, line: prop.line, control: c.name, type: c.type, property: prop.name,
          detail: 'property-not-in-catalog', rule: 'unknown-property',
          ...(aliasAllowed ? { fix: `${c.type} names this property ${alias}, not ${prop.name}; use ${alias}` }
            : counterpartHasProperty ? { fix: `${counterpart} has ${prop.name}; use ${counterpart} if this control needs it` } : {}),
          did_you_mean: suggestion?.candidate,
          nearMiss: suggestion !== null,
          nearMissTelemetry: suggestion ?? undefined,
        });
      }
      fs.refuse++;
    }
  }

  // ─── Lint rules (generator-rules / validator-checklist automation) ───────
  const lintContext = options.lintContext;
  const lintRules = inlineDuplicateRule
    ? configuredLintRules.filter(rule => rule !== inlineDuplicateRule)
    : configuredLintRules;
  const lintIssues = runLintRules(
    bundle,
    catalogData,
    lintContext,
    lintRules,
    options.outputBudget,
  );
  for (const li of lintIssues) {
    collectedIssues.push(li);
    const fs = perFile.get(li.file);
    if (fs) { if (li.level === 'REFUSE') fs.refuse++; else if (li.level === 'WARN') fs.warn++; }
  }

  const perFileArr = [...perFile.values()];
  const summary = {
    pass: perFileArr.reduce((a, f) => a + f.pass, 0),
    warn: perFileArr.reduce((a, f) => a + f.warn, 0),
    refuse: perFileArr.reduce((a, f) => a + f.refuse, 0),
    controls_seen: perFileArr.reduce((a, f) => a + f.controls_seen, 0),
    files: files.length,
  };
  return {
    summary,
    gateDecision: summary.refuse > 0 ? 'BLOCK' : (summary.warn > 0 ? 'PROCEED_WITH_WARNINGS' : 'CLEAR'),
    per_file: perFileArr,
    issues: collectedIssues,
    bundle,
    coverage: { tiers: coverageTiers, files: coverageFiles },
    opportunities: () => getLintOpportunities(bundle, lintContext),
  };
}
