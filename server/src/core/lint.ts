/**
 * Lint rules — machine checks for the documented gates in
 * knowledge/{generator-rules.md, validator-checklist.md,
 * accessibility-rules.md}.
 * REFUSE = compile/paste breaker; WARN = silent visual bug.
 * Rules are conservative: complex formulas are skipped, never guessed.
 */
import { declaredPropType, usesCommonVariantProperties, ownValue, type AnalyzerCatalogData } from './catalog.js';
import { inspectFormulaStructure, plainIdentifier } from './formula-structure.js';
import { collectKnownSymbols, formulaNodes, isKnownSymbol, isInEnclosingBinding } from './formula-bindings.js';
import {
  KNOWN_VARIABLE_PREFIXES,
  hasAuthoritativeBackend,
  isInMemoryReference,
  resolveDatasourceReference,
  type DatasourceMap,
  type DatasourceReference,
  type DatasourceType,
} from './datasource.js';
export { DATASOURCE_TYPES, KNOWN_VARIABLE_PREFIXES } from './datasource.js';
export type { DatasourceMap, DatasourceReference, DatasourceType } from './datasource.js';
import {
  APP_TYPE,
  COMPONENT_DEFINITION_TYPE,
  MAX_CONTROL_TREE_DEPTH,
  controlNodes,
  type AppBundle,
  type AppScreen,
  type ControlNode,
  type ParsedProperty,
} from './model.js';
import type { Issue } from './analyzer.js';
import { ruleMetadata } from './rule-metadata.js';
import { tokenizeFormula } from './tokenizer.js';
import { resolvedControlReferences } from './control-references.js';
import { NAVIGATION_APP_RULES } from './navigation-app-rules.js';
import { WRITE_FORM_RULES } from './write-form-rules.js';
import { FIELD_REPORT_RULES } from './field-report-rules.js';
import {
  boundSourceEvidence,
  colorLiteralEvidence,
  formulaIdentityEvidence,
  thresholdEvidence,
} from './evidence.js';

export type LintContext = {
  datasources?: DatasourceMap;
  /**
   * Exact authored bindings from export metadata (intake's `datasources`).
   * Typed, not `unknown`: the adapter that wires this (Plan 4) must validate
   * arbitrary export JSON down to this shape BEFORE the core boundary — the
   * core trusts every value here as a real DatasourceType.
   */
  exportDatasources?: Readonly<Record<string, DatasourceType>>;
  /**
   * Control names in an untouched copy of the app synced before this change
   * (`controlNamesOf(beforeFiles)`). When present, a control whose name is
   * not in it counts as added by this change (or renamed).
   */
  existingControls?: readonly string[];
};

/** Keep every lint resolver on the same explicit → export → convention ladder. */
const datasourceOptions = (context: LintContext) => ({
  datasources: context.datasources,
  exportMetadata: context.exportDatasources,
});

export type LayoutDirection = 'horizontal' | 'vertical';

/** Tree-aware context built for each bundle; user-supplied lint data cannot replace these helpers. */
export type RuleContext = LintContext & {
  parentOf(control: ControlNode): ControlNode | null;
  ancestorsOf(control: ControlNode): readonly ControlNode[];
  screenOf(control: ControlNode): AppScreen | null;
  layoutDirectionOf(container: ControlNode): LayoutDirection | null;
  isInsideGallery(control: ControlNode): boolean;
};

type CatalogAwareLintContext = RuleContext & { catalogData?: AnalyzerCatalogData };

const catalogOf = (context: LintContext): AnalyzerCatalogData => {
  const catalog = (context as CatalogAwareLintContext).catalogData;
  if (!catalog) throw new Error('analyzer catalog data was not injected');
  return catalog;
};

export type LintRule = {
  id: string;
  level: 'REFUSE' | 'WARN';
  docRef: string;
  check(bundle: AppBundle, context: RuleContext): Issue[];
};

const issue = (rule: LintRule, c: ControlNode, p: ParsedProperty | null, detail: string, fix?: string): Issue => ({
  level: rule.level, file: c.file, line: p?.line ?? c.line,
  control: c.name, type: c.type ?? 'unknown', ...(p ? { property: p.name } : {}),
  rule: rule.id, detail, ...(fix ? { fix } : {}),
});

// Standard Power Apps Color enum member names (Color.<Name>).
export const COLOR_NAMES: ReadonlySet<string> = new Set([
  'AliceBlue','AntiqueWhite','Aqua','Aquamarine','Azure','Beige','Bisque','Black','BlanchedAlmond','Blue',
  'BlueViolet','Brown','Burlywood','CadetBlue','Chartreuse','Chocolate','Coral','CornflowerBlue','Cornsilk',
  'Crimson','Cyan','DarkBlue','DarkCyan','DarkGoldenrod','DarkGray','DarkGreen','DarkGrey','DarkKhaki',
  'DarkMagenta','DarkOliveGreen','DarkOrange','DarkOrchid','DarkRed','DarkSalmon','DarkSeaGreen',
  'DarkSlateBlue','DarkSlateGray','DarkSlateGrey','DarkTurquoise','DarkViolet','DeepPink','DeepSkyBlue',
  'DimGray','DimGrey','DodgerBlue','Firebrick','FloralWhite','ForestGreen','Fuchsia','Gainsboro',
  'GhostWhite','Gold','Goldenrod','Gray','Green','GreenYellow','Grey','Honeydew','HotPink','IndianRed',
  'Indigo','Ivory','Khaki','Lavender','LavenderBlush','LawnGreen','LemonChiffon','LightBlue','LightCoral',
  'LightCyan','LightGoldenrodYellow','LightGray','LightGreen','LightGrey','LightPink','LightSalmon',
  'LightSeaGreen','LightSkyBlue','LightSlateGray','LightSlateGrey','LightSteelBlue','LightYellow','Lime',
  'LimeGreen','Linen','Magenta','Maroon','MediumAquamarine','MediumBlue','MediumOrchid','MediumPurple',
  'MediumSeaGreen','MediumSlateBlue','MediumSpringGreen','MediumTurquoise','MediumVioletRed','MidnightBlue',
  'MintCream','MistyRose','Moccasin','NavajoWhite','Navy','OldLace','Olive','OliveDrab','Orange','OrangeRed',
  'Orchid','PaleGoldenrod','PaleGreen','PaleTurquoise','PaleVioletRed','PapayaWhip','PeachPuff','Peru',
  'Pink','Plum','PowderBlue','Purple','Red','RosyBrown','RoyalBlue','SaddleBrown','Salmon','SandyBrown',
  'SeaGreen','SeaShell','Sienna','Silver','SkyBlue','SlateBlue','SlateGray','SlateGrey','Snow','SpringGreen',
  'SteelBlue','Tan','Teal','Thistle','Tomato','Transparent','Turquoise','Violet','Wheat','White','WhiteSmoke',
  'Yellow','YellowGreen',
]);

// ─── Did-you-mean (bounded edit distance) ─────────────────────────────────
/** Levenshtein distance, short-circuited to 3 once the gap can't be ≤2. */
function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => i);
  for (let j = 1; j <= b.length; j++) {
    let prev = dp[0]; dp[0] = j;
    for (let i = 1; i <= a.length; i++) {
      const tmp = dp[i];
      dp[i] = Math.min(dp[i] + 1, dp[i - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[a.length];
}

export type DidYouMeanDetails = {
  candidate: string;
  reason_code: 'case-mismatch' | 'edit-distance';
  edit_distance_bucket: '0' | '1' | '2';
};

/** Bounded correction plus the derivable reason/distance telemetry used by the survey envelope. */
export function didYouMeanDetails(
  name: string,
  candidates: Iterable<string>,
): DidYouMeanDetails | null {
  const lower = name.toLowerCase();
  let best: string | null = null;
  let bestD = 3;
  for (const c of candidates) {
    if (c === name) continue;
    if (c.toLowerCase() === lower) {
      return { candidate: c, reason_code: 'case-mismatch', edit_distance_bucket: '0' };
    }
    const d = editDistance(lower, c.toLowerCase());
    if (d < bestD) { bestD = d; best = c; }
  }
  if (best === null || bestD > 2) return null;
  return {
    candidate: best,
    reason_code: 'edit-distance',
    edit_distance_bucket: bestD === 1 ? '1' : '2',
  };
}

/** Best correction for a misspelled name: byte-compatible public projection of didYouMeanDetails. */
export function didYouMean(name: string, candidates: Iterable<string>): string | null {
  return didYouMeanDetails(name, candidates)?.candidate ?? null;
}

// ─── PA2108 invalid-property traps ────────────────────────────────────────
/**
 * (control, property) pairs that compile-fail with PA2108 — a property that
 * looks plausible but the control simply doesn't expose. Transcribed from
 * knowledge/validator-checklist.md §14. Control names are the bare
 * catalog type (no @version) to match ControlNode.type. The wrong-enum row
 * (Classic/TextInput `Mode: =TextInputMode.___`) is intentionally omitted: Mode
 * IS a valid property there, so it never reaches the property-not-in-catalog
 * path — it's an enum-value trap, covered by the enum-value-invalid rule.
 */
export const PA2108_TRAPS: ReadonlyArray<{ control: string; property: string; fix: string }> = [
  { control: 'TextInput', property: 'Default', fix: 'modern TextInput has no Default — bind Value instead, or switch to Classic/TextInput which supports Default' },
  { control: 'ComboBox', property: 'SearchField', fix: 'modern ComboBox has no SearchField — search is built-in; omit it, or use Classic/ComboBox' },
  { control: 'Radio', property: 'Default', fix: 'modern Radio has no Default — omit it, or switch to Classic/Radio' },
  { control: 'DatePicker', property: 'Default', fix: 'modern DatePicker has no Default — omit it, or switch to Classic/DatePicker (DefaultDate property)' },
  { control: 'Rectangle', property: 'RadiusTopLeft', fix: 'Rectangle has no per-corner radius — wrap in a GroupContainer with Fill+radius, or use uniform Radius' },
  { control: 'Rectangle', property: 'RadiusTopRight', fix: 'Rectangle has no per-corner radius — wrap in a GroupContainer with Fill+radius, or use uniform Radius' },
  { control: 'Rectangle', property: 'RadiusBottomLeft', fix: 'Rectangle has no per-corner radius — wrap in a GroupContainer with Fill+radius, or use uniform Radius' },
  { control: 'Rectangle', property: 'RadiusBottomRight', fix: 'Rectangle has no per-corner radius — wrap in a GroupContainer with Fill+radius, or use uniform Radius' },
  { control: 'Label', property: 'RadiusTopLeft', fix: 'Label has no per-corner radius — wrap in a GroupContainer with Fill+radius' },
  { control: 'Label', property: 'RadiusTopRight', fix: 'Label has no per-corner radius — wrap in a GroupContainer with Fill+radius' },
  { control: 'Label', property: 'RadiusBottomLeft', fix: 'Label has no per-corner radius — wrap in a GroupContainer with Fill+radius' },
  { control: 'Label', property: 'RadiusBottomRight', fix: 'Label has no per-corner radius — wrap in a GroupContainer with Fill+radius' },
  { control: 'Gallery', property: 'Default', fix: 'Gallery has no Default — use UpdateContext or Set for pre-selection, then read Gallery.Selected' },
];

// ─── REFUSE rules ─────────────────────────────────────────────────────────
const formulaMissingEquals: LintRule = {
  id: 'formula-missing-equals', level: 'REFUSE', docRef: 'generator-rules.md §2',
  check(bundle) {
    const controls = nodesOf(bundle);
    const out: Issue[] = [];
    for (const c of controls) for (const p of c.properties) {
      if (p.value && !p.value.startsWith('=')) {
        out.push(issue(this, c, p, `property value must start with '=' (got: ${p.value.slice(0, 40)})`, `prefix the value with '=' — every PA-YAML property is a Power Fx formula`));
      }
    }
    return out;
  },
};

const blockScalarRequired: LintRule = {
  id: 'block-scalar-required', level: 'REFUSE', docRef: 'generator-rules.md §2',
  check(bundle) {
    const out: Issue[] = [];
    for (const c of nodesOf(bundle)) for (const p of c.properties) {
      // Power Fx quotes do not quote YAML; YAML quotes and block scalars do.
      if (p.isBlockScalar || p.wasQuoted || !p.value.startsWith('=') || !p.value.includes(': ')) continue;
      out.push(issue(this, c, p,
        "inline formula contains ': ' (Power Fx string quotes do not quote YAML) — breaks YAML parsing",
        `use a block scalar: ${p.name}: |-  (newline)  ${p.value}`));
    }
    return out;
  },
};

const inlineFormulaPasteHygiene: LintRule = {
  id: 'inline-formula-paste-hygiene', level: 'WARN', docRef: 'generator-rules.md §2',
  check(bundle) {
    const out: Issue[] = [];
    for (const c of nodesOf(bundle)) for (const p of c.properties) {
      // The colon-space REFUSE takes precedence over this paste-only advice.
      if (p.isBlockScalar || p.wasQuoted || !p.value.startsWith('=') || p.value.includes(': ')) continue;
      const tokenized = tokenizeFormula(p.value);
      const strings = tokenized.tokens.filter(token => token.kind === 'string');
      const hazard = Array.from(p.value.matchAll(/[;{}]/g)).find(match =>
        tokenized.parseConfidence === 'partial'
        || !strings.some(token => token.span.start <= match.index && match.index < token.span.end));
      if (hazard) {
        out.push(issue(this, c, p,
          `Inline formula contains '${hazard[0]}' outside a string literal. This compiles and syncs as-is (Studio writes it this way); it only matters when pasting YAML through Studio's code view.`,
          `For paste, use a block scalar: ${p.name}: |-  (newline)  ${p.value}`));
      }
    }
    return out;
  },
};

const bareColorName: LintRule = {
  id: 'bare-color-name', level: 'REFUSE', docRef: 'generator-rules.md §2 (Color. prefix)',
  check(bundle, context) {
    const controls = nodesOf(bundle);
    const out: Issue[] = [];
    for (const c of controls) {
      if (!c.type) continue;
      for (const p of c.properties) {
        if (declaredPropType(catalogOf(context), c.type, c.variant, p.name) !== 'Color') continue;
        const m = p.value.match(/^=\s*([A-Za-z]+)\s*$/);
        if (m && COLOR_NAMES.has(m[1])) {
          out.push(issue(this, c, p, `bare color name '${m[1]}' — named colors need the Color. prefix`, `use =Color.${m[1]}`));
        }
      }
    }
    return out;
  },
};

const enumValueInvalid: LintRule = {
  id: 'enum-value-invalid', level: 'REFUSE', docRef: 'catalogs/control-properties.yml enums',
  check(bundle, context) {
    const controls = nodesOf(bundle);
    const out: Issue[] = [];
    for (const c of controls) {
      if (!c.type) continue;
      for (const p of c.properties) {
        const catalog = catalogOf(context);
        const t = declaredPropType(catalog, c.type, c.variant, p.name);
        if (!t?.startsWith('@enum:')) continue;
        const enumName = t.slice('@enum:'.length);
        const values = ownValue(catalog.enums, enumName);
        if (!values) continue;
        const m = p.value.match(/^=\s*([A-Za-z][A-Za-z0-9]*)\.([A-Za-z][A-Za-z0-9]*)\s*$/);
        // Only flag when the qualifier is this enum's own name — a bad member.
        // Any other qualifier (Parent, Self, ThisItem, a variable…) is a valid
        // reference that happens to share the property name; skip, never guess.
        if (m && m[1] === enumName && !values.includes(m[2])) {
          out.push(issue(this, c, p, `'${m[2]}' is not a member of enum ${enumName} (allowed: ${values.join(', ')})`));
        }
      }
    }
    return out;
  },
};

const duplicateProperty: LintRule = {
  id: 'duplicate-property', level: 'REFUSE', docRef: 'validator-checklist.md (valid YAML gate)',
  check(bundle) {
    const controls = nodesOf(bundle);
    const out: Issue[] = [];
    for (const c of controls) {
      const seen = new Map<string, number>();
      for (const p of c.properties) {
        if (seen.has(p.name)) out.push(issue(this, c, p, `duplicate property '${p.name}' (first at line ${seen.get(p.name)})`));
        else seen.set(p.name, p.line);
      }
    }
    return out;
  },
};

// ─── WARN rules ───────────────────────────────────────────────────────────
const has = (c: ControlNode, name: string) => c.properties.some(p => p.name === name);
const val = (c: ControlNode, name: string) => c.properties.find(p => p.name === name)?.value ?? null;

/** Stable depth-first view for rule implementations; callers can only pass an AppBundle. */
const nodesOf = (bundle: AppBundle): ControlNode[] => {
  return [...controlNodes(bundle)];
};

function literalLayoutDirection(container: ControlNode): LayoutDirection | null {
  if (container.type !== 'GroupContainer' || container.variant !== 'AutoLayout') return null;
  const direction = val(container, 'LayoutDirection')?.trim();
  if (direction === '=LayoutDirection.Horizontal') return 'horizontal';
  if (direction === '=LayoutDirection.Vertical') return 'vertical';
  return null;
}

export function treeContext(bundle: AppBundle, context: LintContext = {}): RuleContext {
  const parentOf = (control: ControlNode): ControlNode | null => control.parent;
  const ancestorsOf = (control: ControlNode): readonly ControlNode[] => {
    const ancestors: ControlNode[] = [];
    const visited = new WeakSet<ControlNode>();
    let depth = 0;
    for (let parent = parentOf(control);
      parent && depth < MAX_CONTROL_TREE_DEPTH && !visited.has(parent);
      parent = parentOf(parent), depth++) {
      visited.add(parent);
      ancestors.push(parent);
    }
    return ancestors;
  };
  return {
    // LintContext fields, including exportDatasources, carry into RuleContext
    // through this spread; datasource resolution needs no parallel plumbing.
    ...context,
    parentOf,
    ancestorsOf,
    screenOf: control => control.screen,
    layoutDirectionOf: literalLayoutDirection,
    isInsideGallery: control => ancestorsOf(control).some(ancestor => ancestor.type === 'Gallery'),
  };
}

const isAutoLayoutChild = (c: ControlNode, context: RuleContext) => {
  const parent = context.parentOf(c);
  return parent?.type === 'GroupContainer' && parent.variant === 'AutoLayout';
};

// ─── Accessibility lint data + helpers ──────────────────────────────────
// Twin of cli/validate.mjs until the analyzer-core
// collapse in v2.4.5. Membership is exact on the parsed bare control type.
export const CLASSIC_FOCUSABLE_VIA_TABINDEX: ReadonlySet<string> = new Set([
  'Label', 'Image', 'Classic/Icon', 'Hexagon', 'Octagon', 'Pentagon',
  'Rectangle', 'Circle', 'Star', 'Triangle', 'PartialCircle',
]);
export const ICONIC_CONTROLS: ReadonlySet<string> = new Set([
  'Image', 'Classic/Icon', 'ModernIcon', 'Hexagon', 'Octagon', 'Pentagon',
  'Rectangle', 'Circle', 'Star', 'Triangle', 'PartialCircle',
]);
export const INPUT_CONTROLS: ReadonlySet<string> = new Set([
  'TextInput', 'ModernTextInput', 'Classic/TextInput', 'NumberInput', 'ModernNumberInput',
  'ComboBox', 'ModernCombobox', 'Classic/ComboBox', 'DropDown', 'ModernDropdown',
  'Classic/DropDown', 'DatePicker', 'ModernDatePicker', 'Classic/DatePicker',
  'CheckBox', 'ModernCheckbox', 'Classic/CheckBox', 'Radio', 'ModernRadio',
  'Classic/Radio', 'Slider', 'ModernSlider', 'Classic/Slider', 'Toggle',
  'Classic/Toggle', 'Switch', 'ListBox', 'Rating', 'PenInput', 'SpinButton',
  'AddMedia', 'Lookup', 'Gallery',
]);

const LITERAL_INT = /^=\s*(-?\d+)\s*$/u;
const literalInt = (value: string): number | null => {
  const match = value.match(LITERAL_INT);
  return match ? Number(match[1]) : null;
};
const LITERAL_NUMBER = /^=\s*(-?(?:\d+(?:\.\d*)?|\.\d+))\s*$/u;
const literalNumber = (value: string | null): number | null => {
  const match = value?.match(LITERAL_NUMBER);
  return match ? Number(match[1]) : null;
};

export type LintProfile = 'worker' | 'cli';

export function nonTrivialOnSelect(value: string | null): boolean {
  if (value === null) return false;
  const match = value.match(/^=\s*([\s\S]*?)\s*$/u);
  if (!match || !match[1]) return false;
  const body = match[1].trim();
  return body.length > 0
    && !/^false$/iu.test(body)
    && !/^true$/iu.test(body)
    && !/^Select\s*\(\s*Parent\s*\)\s*;?$/iu.test(body);
}

export function hasAccessibleLabel(control: ControlNode): boolean {
  const property = control.properties.find(candidate => candidate.name === 'AccessibleLabel');
  if (!property || property.value.trim() === '') return false;
  return !/^=\s*"\s*"\s*$/u.test(property.value);
}

const versionPinInControlType: LintRule = {
  id: 'version-pin-in-control-type', level: 'WARN', docRef: 'generator-rules.md',
  check(bundle) {
    const pinned = nodesOf(bundle).filter(control => control.authoredTypePinned);
    if (!pinned.length) return [];
    const files = [...new Set(pinned.map(control => control.file))];
    const names = pinned.slice(0, 5).map(control => control.name).join(', ')
      + (pinned.length > 5 ? ', …' : '');
    // One analyzed bundle is one app; attach the aggregate to its first authored pin.
    return [{
      ...issue(this, pinned[0], null,
        `${pinned.length} control type(s) carry @version pins across ${files.length} file(s) — observed, not judged: a suffix alone establishes neither lag nor incompatibility; see the version-lag inventory for evidence-backed migrations. Pins are optional in authored YAML: the compile path strips them, so new code can use bare control types. Files: ${files.join(', ')}. Pinned: ${names}`),
      controls: pinned.map(control => control.name),
    }];
  },
};

/**
 * Superseded control types (catalog `superseded_by`, from the authoring
 * service's own notice: "Do not use CheckBox unless it's already present in
 * this app. Use the updated ModernCheckbox instead"). Existing uses stay valid,
 * so this is advice only: one WARN per app bundle, never REFUSE.
 */
const supersededControlType: LintRule = {
  id: 'superseded-control-type', level: 'WARN', docRef: 'modern-control-properties.md',
  check(bundle, context) {
    const replacement = new Map<string, string>();
    for (const entry of catalogOf(context).controls) {
      if (entry.superseded_by) replacement.set(entry.type, entry.superseded_by);
    }
    if (!replacement.size) return [];
    // With an earlier copy, controls added by this change are reported one by
    // one under new-control-superseded-type; this rule keeps the existing ones.
    const existing = context.existingControls ? new Set(context.existingControls) : null;
    const hits = nodesOf(bundle).filter(control => control.type && replacement.has(control.type)
      && (!existing || existing.has(control.name)));
    if (!hits.length) return [];
    const byType = new Map<string, number>();
    for (const control of hits) byType.set(control.type!, (byType.get(control.type!) ?? 0) + 1);
    const types = [...byType].sort(([a], [b]) => a.localeCompare(b))
      .map(([type, count]) => `${type} (${count}) → ${replacement.get(type)}`).join(', ');
    const names = hits.slice(0, 5).map(control => control.name).join(', ') + (hits.length > 5 ? ', …' : '');
    return [{
      ...issue(this, hits[0], null,
        `${hits.length} control(s) use types Microsoft has superseded: ${types}. Existing controls keep working; Microsoft recommends the Modern type for new controls. Controls: ${names}`,
        'use the Modern type for new controls; convert existing ones only when you are already changing them'),
      controls: hits.map(control => control.name),
    }];
  },
};

/**
 * A control added by this change (absent from the earlier copy passed as
 * `existingControls`) that uses a superseded type. Usually the type was copied
 * from neighbouring controls, or taken from the authoring service's "unless
 * it's already present in this app" notice. Silent without an earlier copy.
 */
const newControlSupersededType: LintRule = {
  id: 'new-control-superseded-type', level: 'WARN', docRef: 'generator-rules.md',
  check(bundle, context) {
    if (!context.existingControls) return [];
    const existing = new Set(context.existingControls);
    const replacement = new Map<string, string>();
    for (const entry of catalogOf(context).controls) {
      if (entry.superseded_by) replacement.set(entry.type, entry.superseded_by);
    }
    return nodesOf(bundle)
      .filter(control => control.type && replacement.has(control.type) && !existing.has(control.name))
      .map(control => issue(this, control, null,
        `${control.name} is new in this change (it is not in the earlier copy of the app) and uses ${control.type}, which Microsoft has superseded by ${replacement.get(control.type!)}. Other controls in the app using ${control.type} are no reason to copy it: new controls use the current type unless the user asked to match the existing ones. If ${control.name} was renamed rather than added, ignore this.`,
        `use ${replacement.get(control.type!)}; keep ${control.type} only when the user asked to match the existing controls`));
  },
};

const a11yTabIndexPositive: LintRule = {
  id: 'a11y-tabindex-positive', level: 'WARN', docRef: 'accessibility-rules.md',
  check(bundle) {
    const controls = nodesOf(bundle);
    const out: Issue[] = [];
    for (const control of controls) {
      if (control.type === 'CanvasComponent' || control.type === COMPONENT_DEFINITION_TYPE) continue;
      for (const property of control.properties) {
        if (property.name !== 'TabIndex') continue;
        const tabIndex = literalInt(property.value);
        if (tabIndex === null || tabIndex <= 0) continue;
        out.push(issue(this, control, property,
          `TabIndex ${tabIndex} is positive — custom tab indexes are retired (treated as 0) and break screen-reader order`,
          'use TabIndex 0 (focusable) or -1 (skipped); order comes from control/container structure'));
      }
    }
    return out;
  },
};

const a11yInteractiveNotFocusable: LintRule = {
  id: 'a11y-interactive-not-focusable', level: 'WARN', docRef: 'accessibility-rules.md',
  check(bundle) {
    const controls = nodesOf(bundle);
    const out: Issue[] = [];
    for (const control of controls) {
      if (!control.type || !CLASSIC_FOCUSABLE_VIA_TABINDEX.has(control.type)) continue;
      if (!nonTrivialOnSelect(val(control, 'OnSelect'))) continue;
      const property = control.properties.find(candidate => candidate.name === 'TabIndex');
      const tabIndex = property ? literalInt(property.value) : null;
      if (property && tabIndex === null) continue; // formula/reference: skip, never guess
      if (!property || (tabIndex !== null && tabIndex < 0)) {
        out.push(issue(this, control, property ?? null,
          'mouse users can click it, but keyboard users cannot reach it',
          'set TabIndex: =0 (and visible focus via FocusedBorderColor/FocusedBorderThickness), or use a Button'));
      }
    }
    return out;
  },
};

const a11yIconButtonNoLabel: LintRule = {
  id: 'a11y-icon-button-no-label', level: 'WARN', docRef: 'accessibility-rules.md',
  check(bundle) {
    const controls = nodesOf(bundle);
    const out: Issue[] = [];
    for (const control of controls) {
      if (!control.type || !ICONIC_CONTROLS.has(control.type)) continue;
      if (!nonTrivialOnSelect(val(control, 'OnSelect')) || hasAccessibleLabel(control)) continue;
      out.push(issue(this, control, null,
        `an empty or absent AccessibleLabel hides ${control.type} controls from screen readers — fatal for a button`,
        'set AccessibleLabel to the action ("Close dialog"), not the glyph'));
    }
    return out;
  },
};

const a11yInputsMissingAccessibleLabel: LintRule = {
  id: 'a11y-inputs-missing-accessiblelabel', level: 'WARN', docRef: 'accessibility-rules.md',
  check(bundle, context) {
    const controls = nodesOf(bundle);
    const missingByFile = new Map<string, ControlNode[]>();
    for (const control of controls) {
      if (!control.type || !INPUT_CONTROLS.has(control.type)) continue;
      if (declaredPropType(catalogOf(context), control.type, control.variant, 'AccessibleLabel') === null) continue;
      if (hasAccessibleLabel(control)) continue;
      const missing = missingByFile.get(control.file) ?? [];
      missing.push(control);
      missingByFile.set(control.file, missing);
    }

    const out: Issue[] = [];
    for (const missing of missingByFile.values()) {
      const names = missing.slice(0, 5).map(control => control.name).join(', ')
        + (missing.length > 5 ? ', …' : '');
      out.push({
        ...issue(this, missing[0], null,
          `${missing.length} control(s) lack AccessibleLabel — screen readers announce only the control type: ${names}`,
          'set AccessibleLabel on each input to what the screen reader should announce'),
        controls: missing.map(control => control.name),
      });
    }
    return out;
  },
};

// ─── Centralization lint data + helpers ───────────────────────────────────
// Exact-match thresholds are intentionally tunable after verification-queue
// data shows how these advisory rules behave on real apps.
export const DUPLICATE_FORMULA_MIN = 3;
export const REPEATED_COLOR_MIN = 5;
const GALLERY_DUPLICATE_FORMULA_MIN = 2;
const DUPLICATE_FORMULA_EXCLUDED_PROPERTIES = new Set([
  'X', 'Y', 'Width', 'Height', 'LayoutMinWidth', 'LayoutMinHeight', 'FillPortions',
]);
const EXCLUDED_COLOR_LITERALS = new Set([
  'RGBA(0,0,0,0)',
  'RGBA(255,255,255,1)',
]);

type PropertyOccurrence = { control: ControlNode; property: ParsedProperty };

const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim();
const normalizeFormula = (value: string): string => {
  const trimmed = value.trim();
  return normalizeWhitespace(trimmed.startsWith('=') ? trimmed.slice(1) : trimmed);
};

/**
 * Extract the authored identifier at the head of a bound expression without
 * assigning datasource meaning to it.
 */
function extractAuthoredSource(value: string): string | null {
  let expression = value.trim();
  if (expression.startsWith('=')) expression = expression.slice(1).trimStart();

  const wrapper = /^(?:SortByColumns|ShowColumns|AddColumns|LookUp|Filter|Search|FirstN|LastN|Sort|First|Last)\s*\(\s*/u;
  while (wrapper.test(expression)) expression = expression.replace(wrapper, '');

  const match = expression.match(/^'([\p{L}_][\p{L}\p{N}_ .-]*)'/u)
    ?? expression.match(/^([\p{L}_][\p{L}\p{N}_]*)/u);
  if (!match) return null;

  const name = match[1];
  const rawRemainder = expression.slice(match[0].length);
  if (/^[\p{L}\p{N}]/u.test(rawRemainder)) return null;

  const remainder = rawRemainder.trimStart();
  if (remainder.startsWith('.') || remainder.startsWith('(')) return null;
  return name;
}

/**
 * Compatibility helper returning only source-shaped identifiers. Explicit
 * input can override a conflicting naming convention.
 */
export function extractBoundSource(
  value: string,
  datasources?: DatasourceMap,
  exportDatasources?: Readonly<Record<string, DatasourceType>>,
): string | null {
  const name = extractAuthoredSource(value);
  if (!name) return null;
  const reference = resolveDatasourceReference(name, datasourceOptions({ datasources, exportDatasources }));
  if (reference.resolvedBy === 'naming-convention') return null;
  return name;
}

const batchHasAppFormulas = (controls: ControlNode[]): boolean => controls.some(control =>
  control.type === APP_TYPE && control.properties.some(property => property.name === 'Formulas'));
const otherLocations = (occurrences: PropertyOccurrence[]): string =>
  occurrences.slice(1, 4).map(({ control, property }) => `${control.file}:${property.line}`).join(', ');
const withOtherLocations = (count: number, occurrences: PropertyOccurrence[], suggestion: string): string =>
  `appears ${count}× — other locations: ${otherLocations(occurrences)} — ${suggestion}`;

const isDuplicateFormulaCandidate = (property: ParsedProperty, normalized: string): boolean => {
  if (!property.value.trim().startsWith('=')) return false;
  if (DUPLICATE_FORMULA_EXCLUDED_PROPERTIES.has(property.name)) return false;
  if (property.name === 'Visible' && (property.value === '=true' || property.value === '=false')) return false;
  if ((normalized.includes('Parent.') || normalized.includes('Self.')) && !normalized.includes('ThisItem.')) return false;
  if (normalized.length < 15) return false;
  if (!/(?:\(|&&|\|\||[&+\-*/<>!])/.test(normalized)) return false;
  return !/^[A-Za-z]+\.[A-Za-z0-9.]+$/.test(normalized);
};

const duplicateFormula: LintRule = {
  id: 'duplicate-formula', level: 'WARN', docRef: 'centralization-lint-design.md §Rules 1',
  check(bundle, context) {
    const controls = nodesOf(bundle);
    const groups = new Map<string, PropertyOccurrence[]>();
    for (const control of controls) {
      if (control.type === APP_TYPE) continue;
      for (const property of control.properties) {
        const normalized = normalizeFormula(property.value);
        if (!isDuplicateFormulaCandidate(property, normalized)) continue;
        const occurrences = groups.get(normalized) ?? [];
        occurrences.push({ control, property });
        groups.set(normalized, occurrences);
      }
    }

    const hasFormulas = batchHasAppFormulas(controls);
    const out: Issue[] = [];
    for (const [normalized, occurrences] of groups.entries()) {
      if (occurrences.length < DUPLICATE_FORMULA_MIN) continue;
      if (occurrences.every(({ control }) => context.isInsideGallery(control))) continue;
      const suggestion = hasFormulas
        ? 'add to your existing App.Formulas as a named formula or UDF'
        : 'centralize as a named formula or UDF in App.Formulas';
      const first = occurrences[0];
      const emitted = issue(this, first.control, first.property,
        withOtherLocations(occurrences.length, occurrences, suggestion));
      emitted.evidence = formulaIdentityEvidence(normalized, occurrences.length);
      out.push(emitted);
    }
    return out;
  },
};

const duplicateFormulaInGallery: LintRule = {
  id: 'duplicate-formula-in-gallery', level: 'WARN', docRef: 'centralization-lint-design.md §Rules 2',
  check(bundle, context) {
    const controls = nodesOf(bundle);
    const groups = new Map<string, PropertyOccurrence[]>();
    for (const control of controls) {
      if (control.type === APP_TYPE) continue;
      for (const property of control.properties) {
        const normalized = normalizeFormula(property.value);
        if (!isDuplicateFormulaCandidate(property, normalized)) continue;
        const occurrences = groups.get(normalized) ?? [];
        occurrences.push({ control, property });
        groups.set(normalized, occurrences);
      }
    }

    const hasFormulas = batchHasAppFormulas(controls);
    const out: Issue[] = [];
    for (const [normalized, occurrences] of groups.entries()) {
      if (occurrences.length < GALLERY_DUPLICATE_FORMULA_MIN) continue;
      if (!occurrences.every(({ control }) => context.isInsideGallery(control))) continue;
      const suggestion = hasFormulas
        ? 'add to your existing App.Formulas; components cannot live in gallery templates — a named formula/UDF is the only centralization mechanism here'
        : 'components cannot live in gallery templates — a named formula/UDF is the only centralization mechanism here';
      const first = occurrences[0];
      const emitted = issue(this, first.control, first.property,
        withOtherLocations(occurrences.length, occurrences, suggestion));
      emitted.evidence = formulaIdentityEvidence(normalized, occurrences.length);
      out.push(emitted);
    }
    return out;
  },
};

const repeatedColorLiteral: LintRule = {
  id: 'repeated-color-literal', level: 'WARN', docRef: 'centralization-lint-design.md §Rules 3',
  check(bundle) {
    const controls = nodesOf(bundle);
    const groups = new Map<string, PropertyOccurrence[]>();
    for (const control of controls) {
      if (control.type === APP_TYPE) continue;
      for (const property of control.properties) {
        for (const match of property.value.matchAll(/RGBA\s*\([^)]*\)/g)) {
          const normalized = normalizeWhitespace(match[0]);
          if (EXCLUDED_COLOR_LITERALS.has(normalized.replace(/\s/g, ''))) continue;
          const occurrences = groups.get(normalized) ?? [];
          occurrences.push({ control, property });
          groups.set(normalized, occurrences);
        }
      }
    }

    const hasFormulas = batchHasAppFormulas(controls);
    const out: Issue[] = [];
    for (const [literal, occurrences] of groups.entries()) {
      if (occurrences.length < REPEATED_COLOR_MIN) continue;
      const suggestion = hasFormulas
        ? 'add to your existing App.Formulas as a theme token (varTheme.X) or named formula'
        : 'define a theme token (varTheme.X) or named formula';
      const first = occurrences[0];
      const emitted = issue(this, first.control, first.property,
        withOtherLocations(occurrences.length, occurrences, suggestion));
      emitted.evidence = colorLiteralEvidence(literal);
      out.push(emitted);
    }
    return out;
  },
};

const heavyOnStart: LintRule = {
  id: 'heavy-onstart', level: 'WARN', docRef: 'centralization-lint-design.md §Rules 4',
  check(bundle) {
    const controls = nodesOf(bundle);
    const out: Issue[] = [];
    for (const control of controls) {
      if (control.type !== APP_TYPE) continue;
      for (const property of control.properties) {
        if (property.name !== 'OnStart') continue;
        const tokenized = tokenizeFormula(property.value);
        if (tokenized.parseConfidence === 'partial') continue;
        const strings = tokenized.tokens.filter(token => token.kind === 'string');
        // The tokenizer assumes invariant separators; locale-style chains are ambiguous.
        if (Array.from(property.value.matchAll(/;;/g)).some(match =>
          !strings.some(token => token.span.start <= match.index && match.index < token.span.end))) continue;
        const statements = tokenized.topLevelStatements.filter(statement =>
          property.value.slice(statement.span.start, statement.span.end).trim()).length;
        if (statements < 5) continue;
        out.push(issue(this, control, property,
          `OnStart contains ${statements} statements at the top level — statement-count heuristic: consider App.Formulas (named formulas) for declarative values and StartScreen for the initial screen; review side-effect initialization separately`));
      }
    }
    return out;
  },
};

// ─── Delegation lint ──────────────────────────────────────────────────────
// All WARN, all heuristic: regex over walker-captured property values, never a
// Power Fx parse. A plain source reference must NEVER warn — every rule needs a
// query CALL whose first argument resolves through extractBoundSource(), and any
// name the caller mapped `collection` is excluded from the whole family.
// Sources: knowledge/delegation-reference.md and
// knowledge/powerfx/best-practices/delegation-cheatsheet.md (authoritative source-specific table).
const ROW_LIMIT_NOTE = 'silently truncates at the data row limit (500 default, 10,000 max)';
/** Properties whose value binds a query to a control's data surface. */
const BOUND_DATA_PROPERTIES = new Set(['Items', 'Default', 'DefaultSelectedItems']);
const SHAREPOINT_PREDICATE_FUNCTIONS = ['Filter', 'LookUp'] as const;
const EXCEL_QUERY_FUNCTIONS = ['Filter', 'LookUp', 'Search', 'SortByColumns', 'Sort'] as const;

type SourceCall = { fn: string; datasource: DatasourceReference; args: string };
type DelegationCandidateGate = (call: SourceCall, property: ParsedProperty) => boolean;
type DelegationCandidateSite = {
  control: ControlNode;
  property: ParsedProperty;
  calls: SourceCall[];
};

/** Balanced argument text of the call whose '(' sits at openIndex; null when unbalanced (skip-when-unsure). */
function callArguments(value: string, openIndex: number): string | null {
  let depth = 0;
  let quote: string | null = null;
  for (let i = openIndex; i < value.length; i++) {
    const ch = value[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return value.slice(openIndex + 1, i);
    }
  }
  return null;
}

/**
 * Blank the spans that contain no executable Power Fx — double-quoted text
 * literals, line comments (double-slash to end of line) and block comments —
 * with same-length spaces, so every index into the original still lines up.
 *
 * Single-quoted spans are deliberately PRESERVED: they are identifiers, not
 * prose ('Anställda Lista' is a legitimate source name). Prose that merely
 * mentions a formula ("Use Search(Products, x) to search") or a comment that
 * happens to contain the word `in` must never produce a finding.
 */
export function blankInertSpans(text: string): string {
  const out = text.split('');
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') {                       // text literal ("" escapes reopen naturally)
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j++;
      for (let k = i + 1; k < j; k++) out[k] = ' ';
      i = j + 1;
    } else if (ch === "'") {                // quoted identifier — keep as-is
      let j = i + 1;
      while (j < text.length && text[j] !== "'") j++;
      i = j + 1;
    } else if (ch === '/' && text[i + 1] === '/') {
      let j = i;
      while (j < text.length && text[j] !== '\n') out[j++] = ' ';
      i = j;
    } else if (ch === '/' && text[i + 1] === '*') {
      let j = i;
      while (j < text.length && !(text[j] === '*' && text[j + 1] === '/')) {
        if (text[j] !== '\n') out[j] = ' ';
        j++;
      }
      for (let k = j; k < Math.min(j + 2, text.length); k++) out[k] = ' ';
      i = j + 2;
    } else {
      i++;
    }
  }
  return out.join('');
}

/**
 * Calls of `fns` in `value` whose first argument resolves to a bound datasource
 * name. The scan runs over the inert-span-blanked text, so a call named inside a
 * string literal or a comment is not a call.
 */
function findSourceCalls(value: string, fns: readonly string[], context: LintContext): SourceCall[] {
  const out: SourceCall[] = [];
  const scannable = blankInertSpans(value);
  // Longest-first alternation + a '(' lookahead keeps `SortByColumns(` from matching `Sort`.
  const pattern = new RegExp(String.raw`(?<![\p{L}\p{N}_.])(${fns.join('|')})\s*\(`, 'gu');
  for (const match of scannable.matchAll(pattern)) {
    const open = (match.index ?? 0) + match[0].length - 1;
    const args = callArguments(scannable, open);
    if (args === null) continue;
    const source = extractAuthoredSource(args);
    if (source) {
      out.push({
        fn: match[1],
        datasource: resolveDatasourceReference(source, datasourceOptions(context)),
        args,
      });
    }
  }
  return out;
}

/** Properties containing at least one call this delegation family examines. */
function delegationCandidateSites(
  controls: ControlNode[],
  fns: readonly string[],
  context: LintContext,
  candidate: DelegationCandidateGate,
): DelegationCandidateSite[] {
  const sites: DelegationCandidateSite[] = [];
  for (const control of controls) {
    for (const property of control.properties) {
      const calls = findSourceCalls(property.value, fns, context)
        .filter(call => candidate(call, property));
      if (calls.length) sites.push({ control, property, calls });
    }
  }
  return sites;
}

/** Text of the first (top-level) argument in a call's argument text. */
function firstArgument(args: string): string {
  let depth = 0;
  for (let i = 0; i < args.length; i++) {
    const ch = args[i];
    if (ch === "'") { while (++i < args.length && args[i] !== "'"); continue; }
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (ch === ',' && depth === 0) return args.slice(0, i);
  }
  return args;
}

/**
 * True when the query's source argument is itself a Filter(/Search( result — the
 * documented In-Out Pattern (delegation-reference.md §SharePoint Workarounds),
 * where a non-delegable outer predicate over an already-reduced set is the
 * recommendation, not a defect.
 */
const appliedToReducedSet = (args: string): boolean =>
  /(?<![\p{L}\p{N}_.])(?:Filter|Search)\s*\(/u.test(firstArgument(args));

/**
 * True when the query's source argument is itself a delegable query chain
 * (`Filter(`/`Sort(`/`SortByColumns(`/`Search(`). The server returns rows already
 * filtered and sorted, so taking the first/last N client-side yields the correct
 * top-N within the row limit — the standard top-N idiom, not a defect. The real
 * anti-pattern is FirstN applied straight to a raw bound source, where the N rows
 * are the first N of an arbitrary page.
 *
 * DELIBERATE UNDER-REACH: if the inner Sort is itself non-delegable (sorting on a
 * calculated expression) the truncation would matter and this stays silent. Regex
 * cannot tell the difference, and under-reaching is the required failure direction
 * — a false WARN on correct code erodes the gate.
 */
const appliedToQueryResult = (args: string): boolean =>
  /(?<![\p{L}\p{N}_.])(?:SortByColumns|Filter|Search|Sort)\s*\(/u.test(firstArgument(args));

/** Blank out text literals and quoted identifiers so predicate scans can't match inside them. */
const withoutLiterals = (text: string): string =>
  text.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/'(?:[^']|'')*'/g, "''");

const datasourceReference = (context: LintContext, source: string) =>
  resolveDatasourceReference(source, datasourceOptions(context));
const assumedBoundSourceNote = (reference: DatasourceReference): string =>
  reference.resolvedBy === 'unresolved'
    ? ` Identifier '${reference.authoredName}' matches none of the known variable prefixes (${KNOWN_VARIABLE_PREFIXES.join(', ')}) and is not declared in datasources, so it is assumed to be a bound source.`
    : '';

const directFirstNSourceCandidate: DelegationCandidateGate =
  (call, property) => BOUND_DATA_PROPERTIES.has(property.name)
    && !isInMemoryReference(call.datasource)
    && !appliedToQueryResult(call.args);
const nonCollectionSourceCandidate: DelegationCandidateGate =
  call => !isInMemoryReference(call.datasource);
const unmappedSourceCandidate: DelegationCandidateGate =
  call => call.datasource.resolvedBy === 'unresolved';
const mappedSourceCandidate = (type: DatasourceType): DelegationCandidateGate =>
  call => hasAuthoritativeBackend(call.datasource, type);
const sharepointTextCandidate: DelegationCandidateGate =
  call => hasAuthoritativeBackend(call.datasource, 'sharepoint')
    && !appliedToReducedSet(call.args);

/**
 * Emit at most one WARN per property for a rule: the first matching call wins.
 * `match` returns the human label of what fired, or null to keep scanning.
 */
function delegationIssues(
  rule: LintRule,
  controls: ControlNode[],
  fns: readonly string[],
  context: LintContext,
  candidate: DelegationCandidateGate,
  accepts: (call: SourceCall, property: ParsedProperty) => string | null,
  detail: (call: SourceCall, label: string) => string,
  fix: string,
): Issue[] {
  const out: Issue[] = [];
  for (const { control, property, calls } of delegationCandidateSites(controls, fns, context, candidate)) {
    for (const call of calls) {
      const label = accepts(call, property);
      if (label === null) continue;
      const emitted = issue(rule, control, property, detail(call, label), fix);
      emitted.evidence = boundSourceEvidence(call.datasource);
      out.push(emitted);
      break;
    }
  }
  return out;
}

const delegationFirstNOnSource: LintRule = {
  id: 'delegation-firstn-on-source', level: 'WARN',
  docRef: 'delegation-reference.md §Never Delegable (FirstN/Last/LastN)',
  check(bundle, context) {
    const controls = nodesOf(bundle);
    return delegationIssues(this, controls, ['FirstN', 'LastN', 'Last'], context,
      directFirstNSourceCandidate,
      call => call.fn,
      (call, label) => `${label}( over bound source '${call.datasource.authoredName}' is never delegable — the query ${ROW_LIMIT_NOTE}, so the "first/last N" are picked from that page only.${assumedBoundSourceNote(call.datasource)}`,
      'bind a delegable query (Filter/Sort with delegable predicates) directly, or reduce the source server-side before taking N rows');
  },
};

const datagridItemsSource = (control: ControlNode, context: LintContext) => {
  const items = control.properties.find(property => property.name === 'Items');
  const source = items ? extractAuthoredSource(items.value) : null;
  if (!items || !source) return null;
  const reference = datasourceReference(context, source);
  return isInMemoryReference(reference) ? null : { items, source, reference };
};

const datagridPaginationNone: LintRule = {
  id: 'datagrid-pagination-none', level: 'WARN',
  docRef: 'delegation-reference.md §Modern data grid paging',
  check(bundle, context) {
    const out: Issue[] = [];
    for (const control of nodesOf(bundle)) {
      if (control.type !== 'ModernDataGrid') continue;
      const bound = datagridItemsSource(control, context);
      if (!bound) continue;
      const pagination = control.properties.find(property => property.name === 'Pagination');
      if (pagination && !/(?:^|[.\s=])None\s*$/u.test(pagination.value.trim())) continue;
      out.push(issue(this, control, pagination ?? bound.items,
        `${control.name} shows '${bound.source}' with Pagination ${pagination ? 'None' : 'not set (None by default)'}: the grid loads at most the app's data row limit (500 by default, 2,000 at most) and never fetches more rows.${assumedBoundSourceNote(bound.reference)}`,
        'set Pagination to Auto (loads 100 rows at a time as the user scrolls, while Items is delegable) or Number (pages; PageSize 0 means 100)'));
    }
    return out;
  },
};

const datagridDelegateSearchUnused: LintRule = {
  id: 'datagrid-delegate-search-unused', level: 'WARN',
  docRef: 'delegation-reference.md §Modern data grid paging',
  check(bundle) {
    const out: Issue[] = [];
    for (const control of nodesOf(bundle)) {
      if (control.type !== 'ModernDataGrid') continue;
      const delegate = control.properties.find(property => property.name === 'DelegateSearch');
      if (!delegate || !/^=?\s*true\s*$/iu.test(delegate.value.trim())) continue;
      const items = control.properties.find(property => property.name === 'Items');
      if (items && /\bSearchText\b/u.test(withoutLiterals(items.value))) continue;
      out.push(issue(this, control, delegate,
        `${control.name} has DelegateSearch on, so the grid no longer filters by its own search box; Items has to do it with SearchText. Items never reads SearchText, so typing in the search box changes nothing.`,
        'filter Items by Self.SearchText with a function your source delegates (for SharePoint, StartsWith), or turn DelegateSearch off'));
    }
    return out;
  },
};

/** A name that holds in-memory rows: a known variable prefix, or mapped `collection`. */
const isInMemoryTarget = (context: LintContext, name: string): boolean =>
  isInMemoryReference(datasourceReference(context, name));

/** Write calls inside a ForAll body, with the first argument (the write target) of each. */
function writeCallTargets(args: string): Array<{ fn: string; target: string | null }> {
  const out: Array<{ fn: string; target: string | null }> = [];
  const pattern = /(?<![\p{L}\p{N}_.])(Patch|ClearCollect|Collect|Remove)\s*\(/gu;
  for (const match of args.matchAll(pattern)) {
    const open = (match.index ?? 0) + match[0].length - 1;
    const inner = callArguments(args, open);
    const head = inner === null
      ? null
      : firstArgument(inner).trim().match(/^(?:'([^']+)'|([\p{L}_][\p{L}\p{N}_]*))/u);
    out.push({ fn: match[1], target: head ? (head[1] ?? head[2]) : null });
  }
  return out;
}

const delegationForAllWrites: LintRule = {
  id: 'delegation-forall-writes', level: 'WARN',
  docRef: 'delegation-reference.md §Never Delegable (Collect/ClearCollect); best-practices/delegation-cheatsheet.md §Chunked Loading with ForAll',
  check(bundle, context) {
    const controls = nodesOf(bundle);
    return delegationIssues(this, controls, ['ForAll'], context,
      nonCollectionSourceCandidate,
      (call) => {
        const writes = writeCallTargets(call.args);
        // Every write lands in a collection ⇒ zero server round-trips, so the
        // N+1-writes claim would be false. (Collection shaping is the common,
        // correct ForAll shape; the remaining source-iteration truncation is a
        // separate finding, not this rule's message.)
        const serverWrite = writes.find(write => !write.target || !isInMemoryTarget(context, write.target));
        return serverWrite?.fn ?? null;
      },
      (call, label) => `ForAll( over bound source '${call.datasource.authoredName}' with ${label}( in the body — one server round-trip per row (N+1 writes), and the iteration itself ${ROW_LIMIT_NOTE}.${assumedBoundSourceNote(call.datasource)}`,
      'build the change table first and issue a single Patch(Source, table) / Collect(Source, table), or move the bulk write to Power Automate');
  },
};

const delegationSearchCaveat: LintRule = {
  id: 'delegation-search-caveat', level: 'WARN',
  docRef: 'powerfx/best-practices/delegation-cheatsheet.md §NON-Delegable (SharePoint) vs §Dataverse Delegation Reference',
  check(bundle, context) {
    const controls = nodesOf(bundle);
    // Fires per SOURCE, not per batch: a source the caller mapped is handled by
    // its source-specific rules, an unmapped one still deserves the caveat. A
    // partial map must not silence the family (v2.4 review Fix 4).
    return delegationIssues(this, controls, ['Search'], context,
      unmappedSourceCandidate,
      () => 'Search',
      (call) => `Search( on bound source '${call.datasource.authoredName}' — delegation depends on connector and column support; this checker has not established them. Search uses substring matching; supply \`datasources\` to sharpen this into a source-specific finding.${assumedBoundSourceNote(call.datasource)}`,
      'consider Filter(Source, StartsWith(Column, text)) only if prefix matching meets the request and the connector and column type support delegation; prefix and substring matching are not equivalent. StartsWith does not make Excel queries delegable');
  },
};

const delegationSharepointSearch: LintRule = {
  id: 'delegation-sharepoint-search', level: 'WARN',
  docRef: 'powerfx/best-practices/delegation-cheatsheet.md §NON-Delegable (SharePoint) — Search',
  check(bundle, context) {
    const controls = nodesOf(bundle);
    return delegationIssues(this, controls, ['Search'], context,
      mappedSourceCandidate('sharepoint'),
      () => 'Search',
      (call) => `Search( on SharePoint source '${call.datasource.authoredName}' — SharePoint does not support delegation of Search; this pattern flags a delegation concern, not proof of truncation in this formula`,
      'consider Filter(Source, StartsWith(Column, text)) only if prefix matching meets the request and the SharePoint column type supports delegation; prefix and substring matching are not equivalent');
  },
};

const delegationSharepointIn: LintRule = {
  id: 'delegation-sharepoint-in', level: 'WARN',
  docRef: 'powerfx/best-practices/delegation-cheatsheet.md §NON-Delegable (SharePoint) — in / exactin / Not / EndsWith',
  check(bundle, context) {
    const controls = nodesOf(bundle);
    const predicates: Array<[label: string, pattern: RegExp]> = [
      ['exactin', /(?<![\p{L}\p{N}_])exactin(?![\p{L}\p{N}_])/u],
      ['in', /(?<![\p{L}\p{N}_])in(?![\p{L}\p{N}_])/u],
      ['Not(', /(?<![\p{L}\p{N}_.])Not\s*\(/u],
      ['EndsWith(', /(?<![\p{L}\p{N}_.])EndsWith\s*\(/u],
      ['!', /!\s*(?=[\p{L}_(])/u],
    ];
    return delegationIssues(this, controls, SHAREPOINT_PREDICATE_FUNCTIONS, context,
      mappedSourceCandidate('sharepoint'),
      (call) => {
        const predicate = withoutLiterals(call.args);
        return predicates.find(([, pattern]) => pattern.test(predicate))?.[0] ?? null;
      },
      (call, label) => `'${label}' does not delegate to SharePoint — '${call.datasource.authoredName}' ${ROW_LIMIT_NOTE}`,
      "restructure the predicate: '=' against explicit values instead of in/exactin, '<>' instead of Not(...)/!, and redesign the data for EndsWith (never delegable on SharePoint)");
  },
};

const delegationSharepointIsBlank: LintRule = {
  id: 'delegation-sharepoint-isblank', level: 'WARN',
  docRef: 'powerfx/best-practices/delegation-cheatsheet.md §NON-Delegable (SharePoint) — IsBlank; §Fix 1',
  check(bundle, context) {
    const controls = nodesOf(bundle);
    const isBlank = /(?<![\p{L}\p{N}_.])IsBlank\s*\(/u;
    return delegationIssues(this, controls, SHAREPOINT_PREDICATE_FUNCTIONS, context,
      mappedSourceCandidate('sharepoint'),
      (call) => {
        return isBlank.test(withoutLiterals(call.args)) ? 'IsBlank(' : null;
      },
      (call) => `IsBlank( appears in a SharePoint predicate over '${call.datasource.authoredName}' — this checker has not established whether the tested value depends on each source row; row-dependent column tests need delegation review`,
      'if the tested value is a column, check column support and connector delegation support; = Blank() does not treat empty strings as blank, unlike IsBlank — no automatic replacement');
  },
};

/**
 * A text function applied to a COLUMN, in column position — the only shape that
 * costs delegation. Column position is the left operand of a comparison, or the
 * first argument of StartsWith/EndsWith. In value position (right operand, second
 * argument) the predicate still delegates: `Filter(L, StartsWith(Title,
 * Trim(SearchText)))` is delegable, and `SearchText` is a variable or named
 * formula, not a column.
 */
function textFunctionOnColumn(context: LintContext, args: string): string | null {
  const pattern = /(?<![\p{L}\p{N}_.])(Len|Left|Mid|Right|Lower|Upper|Trim)\s*\(/gu;
  for (const match of args.matchAll(pattern)) {
    const open = (match.index ?? 0) + match[0].length - 1;
    const inner = callArguments(args, open);
    if (inner === null) continue;
    // Column-shaped first argument: bare or 'quoted' identifier, never dotted
    // (txtSearch.Text is a control value) and never a known-prefix in-memory name.
    const head = firstArgument(inner).trim()
      .match(/^(?:'([\p{L}_][\p{L}\p{N}_ .-]*)'|([\p{L}_][\p{L}\p{N}_]*))$/u);
    if (!head) continue;
    const column = head[1] ?? head[2];
    if (isInMemoryTarget(context, column)) continue;

    const after = args.slice(open + inner.length + 2);
    const before = args.slice(0, match.index ?? 0);
    const inColumnPosition = /^\s*(?:<>|<=|>=|=|<|>)/.test(after)
      || /(?<![\p{L}\p{N}_.])(?:StartsWith|EndsWith)\s*\(\s*$/u.test(before);
    if (!inColumnPosition) continue;

    return `${match[1]}(${column})`;
  }
  return null;
}

const delegationSharepointTextFunctions: LintRule = {
  id: 'delegation-sharepoint-text-functions', level: 'WARN',
  docRef: 'powerfx/best-practices/delegation-cheatsheet.md §NON-Delegable (SharePoint) — Len/Left/Mid/Right/Lower/Upper/Trim',
  check(bundle, context) {
    const controls = nodesOf(bundle);
    return delegationIssues(this, controls, SHAREPOINT_PREDICATE_FUNCTIONS, context,
      sharepointTextCandidate,
      call => textFunctionOnColumn(context, call.args),
      (call, label) => `${label} in a SharePoint predicate does not delegate — '${call.datasource.authoredName}' ${ROW_LIMIT_NOTE}`,
      'keep the column bare in the predicate (delegable = / StartsWith) and apply text functions after retrieval');
  },
};

const delegationSharepointIdOperator: LintRule = {
  id: 'delegation-sharepoint-id-operator', level: 'WARN',
  docRef: 'powerfx/best-practices/delegation-cheatsheet.md §ID Column Quirk',
  check(bundle, context) {
    const controls = nodesOf(bundle);
    const idComparison = /(?<![\p{L}\p{N}_.])ID\s*(?:<>|>=|<=|<|>)/u;
    return delegationIssues(this, controls, SHAREPOINT_PREDICATE_FUNCTIONS, context,
      mappedSourceCandidate('sharepoint'),
      (call) => {
        return idComparison.test(withoutLiterals(call.args)) ? 'ID' : null;
      },
      (call) => `the SharePoint ID column delegates only '=' — a comparison operator on ID makes '${call.datasource.authoredName}' ${ROW_LIMIT_NOTE}`,
      'filter ID with = (single record), or filter on an indexed column instead');
  },
};

const delegationSqlIsBlank: LintRule = {
  id: 'delegation-sql-isblank', level: 'WARN',
  docRef: 'delegation-reference.md §SQL Server (IsBlank NOT delegable); best-practices/delegation-cheatsheet.md §Fix 1',
  check(bundle, context) {
    const controls = nodesOf(bundle);
    const isBlank = /(?<![\p{L}\p{N}_.])IsBlank\s*\(/u;
    return delegationIssues(this, controls, SHAREPOINT_PREDICATE_FUNCTIONS, context,
      mappedSourceCandidate('sql'),
      (call) => {
        return isBlank.test(withoutLiterals(call.args)) ? 'IsBlank(' : null;
      },
      // Caveat wording on purpose: delegation-reference.md records SQL Server
      // IsBlank as non-delegable but has that claim QUEUED for tenant
      // verification, so the rule must not assert it flatly.
      (call) => `IsBlank( appears in a SQL Server predicate over '${call.datasource.authoredName}' — this checker has not established whether the tested value depends on each source row. The catalog non-delegation claim is unverified and queued for tenant verification; see the verification queue`,
      'establish row dependence, column type and connector support before choosing a form; if the tested value is a column, check column support. Check blank/empty-string semantics: = Blank() does not treat empty strings as blank, unlike IsBlank — no automatic replacement or delegation assurance');
  },
};

const delegationExcelAny: LintRule = {
  id: 'delegation-excel-any', level: 'WARN',
  docRef: 'powerfx/best-practices/delegation-cheatsheet.md §Delegation by Data Source (Excel: None)',
  check(bundle, context) {
    const controls = nodesOf(bundle);
    return delegationIssues(this, controls, EXCEL_QUERY_FUNCTIONS, context,
      mappedSourceCandidate('excel'),
      call => call.fn,
      (call, label) => `${label}( on the Excel-backed source '${call.datasource.authoredName}' — Excel delegates nothing, so every query ${ROW_LIMIT_NOTE}`,
      'load the sheet once into a collection (ClearCollect) and query the collection, or move the data to Dataverse/SQL/SharePoint');
  },
};

// ─── Performance lint ─────────────────────────────────────────────────────
// All WARN, all heuristic: regex over walker-captured property values, never a
// Power Fx parse. Sources: knowledge/performance-rules.md and
// knowledge/gallery-patterns.md.
//
// Thresholds live here (same doctrine as the centralization minimums above) so
// verification-queue data can tune them.
/** Per-screen control count that WARNs. Documented degradation starts at 500 — warn early. Tunable. */
export const CONTROL_BUDGET_WARN = 300;
/** Collect/ClearCollect calls in App.OnStart before the missing-Concurrent WARN fires. Tunable. */
const ONSTART_COLLECT_MIN = 3;

/** Source queries that turn a gallery template into an N+1 request pattern. */
const GALLERY_QUERY_FUNCTIONS = ['LookUp', 'Filter'] as const;
/** Authoring pseudo-controls (App / ComponentDefinition roots) — never screen controls. */
const PSEUDO_CONTROL_TYPES: ReadonlySet<string> = new Set([APP_TYPE, COMPONENT_DEFINITION_TYPE]);
const isRealControl = (control: ControlNode): boolean =>
  control.type !== null && !PSEUDO_CONTROL_TYPES.has(control.type);

const perfLookupInGalleryTemplate: LintRule = {
  id: 'perf-lookup-in-gallery-template', level: 'WARN',
  docRef: 'performance-rules.md §Gallery Performance; gallery-patterns.md §Performance Best Practices',
  check(bundle, context) {
    const controls = nodesOf(bundle);
    const out: Issue[] = [];
    for (const control of controls) {
      // Strictly an ANCESTOR check: the gallery's own Items is where a source
      // query belongs, so the gallery control itself never fires here.
      if (!context.isInsideGallery(control)) continue;
      for (const property of control.properties) {
        for (const call of findSourceCalls(property.value, GALLERY_QUERY_FUNCTIONS, context)) {
          if (isInMemoryReference(call.datasource)) continue;      // in-memory: no per-row request
          const emitted = issue(this, control, property,
            `${call.fn}( on bound source '${call.datasource.authoredName}' inside a gallery template — the query re-runs once per rendered row (N+1 requests)`,
            "pre-join the data in the gallery's Items with AddColumns(...), or centralize the lookup as a UDF / named formula in App.Formulas");
          emitted.evidence = boundSourceEvidence(call.datasource);
          out.push(emitted);
          break;                                                    // one WARN per property
        }
      }
    }
    return out;
  },
};

const perfOnStartNoConcurrent: LintRule = {
  id: 'perf-onstart-no-concurrent', level: 'WARN',
  docRef: 'performance-rules.md §Data Loading (Use Concurrent for Parallel Loading); §OnStart Optimization',
  check(bundle) {
    const controls = nodesOf(bundle);
    const collect = /(?<![\p{L}\p{N}_.])(?:Clear)?Collect\s*\(/gu;
    const concurrent = /(?<![\p{L}\p{N}_.])Concurrent\s*\(/u;
    const out: Issue[] = [];
    for (const control of controls) {
      if (control.type !== APP_TYPE) continue;
      for (const property of control.properties) {
        if (property.name !== 'OnStart') continue;
        const loads = property.value.match(collect)?.length ?? 0;
        if (loads < ONSTART_COLLECT_MIN || concurrent.test(property.value)) continue;
        out.push(issue(this, control, property,
          `OnStart issues ${loads} Collect/ClearCollect calls with no Concurrent( — sequential loads make app start cost the sum of every request`,
          'wrap the independent loads in Concurrent(ClearCollect(...), ClearCollect(...), ...), or move them to App.Formulas named formulas that evaluate on demand'));
      }
    }
    return out;
  },
};

const perfCrossScreenReference: LintRule = {
  id: 'perf-cross-screen-reference', level: 'WARN',
  docRef: 'performance-rules.md §Performance Checklist (Screens — minimal cross-screen references)',
  check(bundle, context) {
    const controls = nodesOf(bundle);
    // Screen identity is the authored `Screens:` root retained by the walker. A
    // dotted reference only warns when its head resolves to a control owned by
    // another screen in this bundle; anything unresolvable (Parent/Self/ThisItem, a variable,
    // an enum, a connector, a screen root) is skipped rather than guessed. A name
    // declared in more than one file is ambiguous (already REFUSEd as a duplicate
    // control name) and resolves to nothing.
    //
    // The scan runs over blankInertSpans(), not withoutLiterals(): a `//` or `/* */`
    // comment naming another screen's control executes nothing, so it must not warn.
    // Single-quoted spans stay intact on purpose — control and screen names with
    // spaces are quoted identifiers, not prose.
    const owners = new Map<string, ControlNode | null>();
    for (const control of controls) {
      if (!isRealControl(control) || !context.screenOf(control)) continue;
      const owner = owners.get(control.name);
      if (owner === undefined) owners.set(control.name, control);
      else if (owner && context.screenOf(owner) !== context.screenOf(control)) owners.set(control.name, null);
    }

    const out: Issue[] = [];
    for (const control of controls) {
      const sourceScreen = context.screenOf(control);
      if (!isRealControl(control) || !sourceScreen) continue;
      for (const property of control.properties) {
        const reference = /(?<![\p{L}\p{N}_.])([\p{L}_][\p{L}\p{N}_]*)\s*\.\s*[\p{L}_]/gu;
        for (const match of blankInertSpans(property.value).matchAll(reference)) {
          const target = owners.get(match[1]);
          const targetScreen = target ? context.screenOf(target) : null;
          if (!target || !targetScreen || targetScreen === sourceScreen) continue;
          out.push(issue(this, control, property,
            `references '${target.name}', a control on another screen in this batch (${targetScreen.name}, ${target.file}:${target.line}) — cross-screen references stop each screen from loading independently`,
            'pass the value through a global variable (Set) or an App.Formulas named formula instead of reaching into another screen\'s control'));
          break;                                                    // one WARN per property
        }
      }
    }
    return out;
  },
};

const perfControlBudget: LintRule = {
  id: 'perf-control-budget', level: 'WARN',
  docRef: 'performance-rules.md §Control Optimization (Minimize Control Count)',
  check(bundle) {
    const out: Issue[] = [];
    for (const screen of bundle.screens) {
      const controls: ControlNode[] = [];
      const visited = new WeakSet<ControlNode>();
      const collect = (node: ControlNode, depth = 0): void => {
        if (depth > MAX_CONTROL_TREE_DEPTH || visited.has(node)) return;
        visited.add(node);
        if (isRealControl(node)) controls.push(node);
        node.children.forEach(child => collect(child, depth + 1));
      };
      screen.roots.forEach(root => collect(root));
      if (controls.length <= CONTROL_BUDGET_WARN) continue;
      const emitted = issue(this, controls[0], null,
        `screen '${screen.name}' walks ${controls.length} controls — over the ${CONTROL_BUDGET_WARN}-control warn budget (documented degradation starts around 500)`,
        'split the screen, or replace repeated control blocks with a Gallery over a data table / a reusable component');
      emitted.evidence = thresholdEvidence(CONTROL_BUDGET_WARN, controls.length);
      out.push(emitted);
    }
    return out;
  },
};

/** Width-dependent branch guards change the sizing mode; never evaluate branches independently. */
function conditionalOnWidth(value: string | null): boolean {
  const structure = value ? inspectFormulaStructure(value) : null;
  if (!structure?.isFormula) return false;
  for (const call of structure.calls) {
    if (!call.unqualified || !['if', 'switch'].includes(call.name)) continue;
    const guards = call.name === 'switch' ? call.arguments.slice(0, 1)
      : call.arguments.filter((_, index) => index % 2 === 0 && index < call.arguments.length - 1);
    for (const guard of guards) for (let index = guard.start; index < guard.end - 2; index++) {
      if (structure.tokens[index - 1]?.text === '.' || structure.tokens[index + 1].text !== '.') continue;
      const name = plainIdentifier(structure, { start: index, end: index + 1 });
      const member = plainIdentifier(structure, { start: index + 2, end: index + 3 });
      if (name && ['app', 'parent'].includes(name.toLowerCase()) && member?.toLowerCase() === 'width'
        && !isInEnclosingBinding({ ...structure, calls: structure.calls.filter(candidate => candidate.name === 'with') },
          { start: index, end: index + 3 }, name)) return true;
    }
  }
  return false;
}

const fillportionsWithFixedSize: LintRule = {
  id: 'fillportions-with-fixed-size', level: 'WARN', docRef: 'validator-checklist.md §17',
  check(bundle, context) {
    const controls = nodesOf(bundle);
    const out: Issue[] = [];
    for (const c of controls) {
      if (['FillPortions', 'Width', 'Height'].some(name => conditionalOnWidth(val(c, name)))) continue;
      const fillPortions = literalNumber(val(c, 'FillPortions'));
      if (fillPortions === null || fillPortions <= 0) continue;
      const parent = context.parentOf(c);
      if (!parent) continue;
      const direction = context.layoutDirectionOf(parent);
      if (!direction) continue;
      const fixedProperty = c.properties.find(property =>
        property.name === (direction === 'horizontal' ? 'Width' : 'Height'));
      if (!fixedProperty) continue;
      const fixedSize = literalNumber(fixedProperty.value);
      // A zero main-axis size is Microsoft's own idiom for "flex owns this size"
      // (five first-party template controls, 2026-10-06 oracle); it conflicts with nothing.
      if (fixedSize === null || fixedSize === 0) continue;
      const fillProperty = c.properties.find(property => property.name === 'FillPortions')!;
      out.push(issue(this, c, fillProperty,
        `FillPortions > 0 with static ${fixedProperty.name} on the parent's ${direction} main axis — FillPortions silently wins`,
        `remove the static ${fixedProperty.name}, or set FillPortions: =0`));
    }
    return out;
  },
};

// Runtime observation: migration findings item 13 (verified visually by the maintainer).
// Only direct children read this group's Parent.Width; descendants have other parents.
const layoutMaxWidthCollapsesChildren: LintRule = {
  id: 'layoutmaxwidth-collapses-children', level: 'WARN',
  docRef: 'validator-checklist.md §LayoutMaxWidth in manual groups',
  check(bundle, context) {
    const out: Issue[] = [];
    for (const c of nodesOf(bundle)) {
      if (c.type !== 'GroupContainer' || !isAutoLayoutChild(c, context)
        || c.variant === 'AutoLayout' || has(c, 'LayoutDirection')) continue;
      const mode = val(c, 'LayoutMode')?.replace(/[=\s"']/gu, '').toLowerCase();
      if (mode === 'auto' || mode === 'layoutmode.auto') continue;
      const cap = c.properties.find(property => property.name === 'LayoutMaxWidth');
      if (!cap) continue;
      const dependent = c.children.filter(child => child.properties.some(property => {
        if (property.name !== 'Width') return false;
        const structure = inspectFormulaStructure(property.value);
        if (!structure?.isFormula) return false;
        for (let index = 0; index < structure.tokens.length - 2; index++) {
          if (structure.tokens[index - 1]?.text === '.' || structure.tokens[index + 1].text !== '.') continue;
          const name = plainIdentifier(structure, { start: index, end: index + 1 });
          const member = plainIdentifier(structure, { start: index + 2, end: index + 3 });
          if (name?.toLowerCase() === 'parent' && member?.toLowerCase() === 'width'
            // Parent is a control keyword, not an implicit row field (e.g. in Max).
            && !isInEnclosingBinding({ ...structure, calls: structure.calls.filter(call => call.name === 'with') },
              { start: index, end: index + 3 }, name)) return true;
        }
        return false;
      }));
      if (!dependent.length) continue;
      out.push(issue(this, c, cap,
        `manual GroupContainer inside AutoLayout sets LayoutMaxWidth; this can collapse Parent.Width for direct children: ${dependent.map(child => child.name).join(', ')}`,
        'review the width cap and use AutoLayout for this group or remove LayoutMaxWidth if appropriate; verify child widths in Studio'));
    }
    return out;
  },
};

// Runtime observation, migration lesson 4: stretching was intended on two of seven screens.
// Ask for review only. GridLayout and unresolved layout modes are not manual layouts.
const manualGroupMayStretch: LintRule = {
  id: 'manual-group-may-stretch', level: 'WARN',
  docRef: 'validator-checklist.md §Manual group stretching',
  check(bundle, context) {
    const out: Issue[] = [];
    for (const c of nodesOf(bundle)) {
      const parent = context.parentOf(c);
      if (c.type !== 'GroupContainer' || !isAutoLayoutChild(c, context) || !parent
        || context.layoutDirectionOf(parent) !== 'vertical' || has(c, 'FillPortions')
        || has(c, 'LayoutDirection') || (c.variant !== null && c.variant !== 'ManualLayout')) continue;
      const mode = val(c, 'LayoutMode')?.replace(/[=\s"']/gu, '').toLowerCase();
      if (mode !== undefined && mode !== 'manual' && mode !== 'layoutmode.manual') continue;
      out.push(issue(this, c, null,
        `ManualLayout GroupContainer directly inside vertical AutoLayout has no explicit FillPortions (effective default 1) — is this group meant to stretch?`));
    }
    return out;
  },
};

const missingLayoutMin: LintRule = {
  id: 'missing-layout-min', level: 'WARN', docRef: 'validator-checklist.md §15 (defaults 250/100 overflow)',
  check(bundle, context) {
    const controls = nodesOf(bundle);
    const out: Issue[] = [];
    for (const c of controls) {
      if (!isAutoLayoutChild(c, context)) continue;
      const missing = ['LayoutMinWidth', 'LayoutMinHeight'].filter(n => !has(c, n));
      if (missing.length) out.push(issue(this, c, null, `AutoLayout child missing ${missing.join(' and ')} (defaults 250/100 cause silent overflow)`, `set ${missing.map(n => `${n}: =0`).join(' and ')}`));
    }
    return out;
  },
};

const missingAlignInContainer: LintRule = {
  id: 'missing-align-in-container', level: 'WARN', docRef: 'validator-checklist.md §18',
  check(bundle, context) {
    const controls = nodesOf(bundle);
    const out: Issue[] = [];
    for (const c of controls) {
      if (!isAutoLayoutChild(c, context) || has(c, 'AlignInContainer')) continue;
      const parent = context.parentOf(c)!;
      if (has(parent, 'LayoutAlignItems')) continue;
      out.push(issue(this, c, null, `AutoLayout child has no AlignInContainer and its parent '${parent.name}' has no LayoutAlignItems — is the inherited alignment intended?`, `review alignment at either level: parent LayoutAlignItems or child AlignInContainer`));
    }
    return out;
  },
};

const labelMissingWrap: LintRule = {
  id: 'label-missing-wrap', level: 'WARN', docRef: 'generator-rules.md §16 (Wrap defaults true)',
  check(bundle, context) {
    const controls = nodesOf(bundle);
    const out: Issue[] = [];
    for (const c of controls) {
      if (!c.type || !['Label', 'Text'].includes(c.type)) continue;
      if (declaredPropType(catalogOf(context), c.type, c.variant, 'Wrap') === null) continue; // control doesn't support Wrap
      if (!has(c, 'Wrap')) out.push(issue(this, c, null, `${c.type} without Wrap — defaults to true and wraps unexpectedly in narrow containers`, `set Wrap: =false for single-line labels`));
    }
    return out;
  },
};

const scrollChildFillportions: LintRule = {
  id: 'scroll-child-fillportions', level: 'WARN', docRef: 'validator-checklist.md §17 (scroll trap)',
  check(bundle, context) {
    const controls = nodesOf(bundle);
    const out: Issue[] = [];
    for (const c of controls) {
      const parent = context.parentOf(c);
      const parentOverflow = parent ? val(parent, 'LayoutOverflowY') : null;
      if (!parentOverflow?.includes('Scroll')) continue;
      const fp = val(c, 'FillPortions');
      if (fp !== null && fp.replace(/\s/g, '') !== '=0') {
        const p = c.properties.find(x => x.name === 'FillPortions')!;
        out.push(issue(this, c, p, `child of a scroll container with FillPortions != 0 — defeats scrolling`, `set FillPortions: =0 and an explicit Height`));
      }
    }
    return out;
  },
};

const longInlineFormula: LintRule = {
  id: 'long-inline-formula', level: 'WARN', docRef: 'generator-rules.md §2 (>120 chars)',
  check(bundle) {
    const controls = nodesOf(bundle);
    const out: Issue[] = [];
    for (const c of controls) for (const p of c.properties) {
      if (!p.isBlockScalar && p.value.length > 120) {
        out.push(issue(this, c, p, `inline formula is ${p.value.length} chars (>120)`, `use a |- block scalar`));
      }
    }
    return out;
  },
};


/** Check only complete lexical references to unique extractor-described instances. */
const unknownOutputReference: LintRule = {
  id: 'unknown-output-reference', level: 'WARN', docRef: 'validator-checklist.md §Output references',
  check(bundle, context) {
    const catalog = catalogOf(context);
    const extractorTypes = new Set(catalog.controls.filter(control => !control.source).map(control => control.type));
    const dumpTypes = new Set(catalog.dumpSourced);
    const out: Issue[] = [];
    let previousProperty: ParsedProperty | null = null;
    let emitted = new Set<string>();
    for (const { control, property, target, name, member } of resolvedControlReferences(bundle)) {
      if (property !== previousProperty) {
        previousProperty = property;
        emitted = new Set<string>();
      }
      if (!target.type || !extractorTypes.has(target.type) || dumpTypes.has(target.type)
        || ownValue(catalog.dumpSourcedControls, target.type) || ownValue(catalog.syntheticControls, target.type)) continue;
      const entry = ownValue(catalog.controlProperties, target.type);
      // No output list means this injected catalog has no authoritative read
      // surface. Never infer a complete list from a missing field.
      if (!entry?.output_properties) continue;
      const readable = new Set([
        ...Object.keys(entry.input_properties ?? {}), ...entry.output_properties,
        ...Object.keys(target.variant ? ownValue(entry.variant_input_properties, target.variant) ?? {} : {}),
        ...Object.keys(usesCommonVariantProperties(catalog, target.type, target.variant) ? entry.common_variant_properties ?? {} : {}),
        ...Object.keys(ownValue(catalog.augmentations, target.type)?.additional_input_properties ?? {}),
        ...(entry.parent_context ?? []).flatMap(parent => Object.keys(ownValue(catalog.parentContextProperties, parent) ?? {})),
      ]);
      if ([...readable].some(candidate => candidate.toLowerCase() === member.toLowerCase())) continue;
      const key = `${name.toLowerCase()}.${member.toLowerCase()}`;
      if (emitted.has(key)) continue;
      emitted.add(key);
      // Text -> Value is a semantic migration rename, not an edit-distance match.
      const suggestion = target.type === 'TextInput' && member.toLowerCase() === 'text' && readable.has('Value')
        ? 'Value' : didYouMean(member, readable);
      const finding = issue(this, control, property,
        `reference '${name}.${member}' resolves to '${target.name}' (${target.type}), whose catalog has no input or output property '${member}'${suggestion ? `; did you mean '${suggestion}'?` : ''}`,
        suggestion ? `review the reference and use ${name}.${suggestion} if intended` : `check the readable properties of ${target.type}`);
      if (suggestion) finding.did_you_mean = suggestion;
      out.push(finding);
    }
    return out;
  },
};

const CORE_LINT_RULES: LintRule[] = [
  formulaMissingEquals, blockScalarRequired, inlineFormulaPasteHygiene, bareColorName, enumValueInvalid, duplicateProperty,
  versionPinInControlType, supersededControlType, newControlSupersededType,
  a11yTabIndexPositive, a11yInteractiveNotFocusable, a11yIconButtonNoLabel, a11yInputsMissingAccessibleLabel,
  duplicateFormula, duplicateFormulaInGallery, repeatedColorLiteral, heavyOnStart,
  delegationFirstNOnSource, delegationForAllWrites, delegationSearchCaveat,
  delegationSharepointSearch, delegationSharepointIn, delegationSharepointIsBlank,
  delegationSharepointTextFunctions, delegationSharepointIdOperator,
  delegationSqlIsBlank, delegationExcelAny, datagridPaginationNone, datagridDelegateSearchUnused,
  perfLookupInGalleryTemplate, perfOnStartNoConcurrent, perfCrossScreenReference, perfControlBudget,
  fillportionsWithFixedSize, missingLayoutMin, missingAlignInContainer, labelMissingWrap, scrollChildFillportions, longInlineFormula,
  ...NAVIGATION_APP_RULES,
  ...WRITE_FORM_RULES,
  unknownOutputReference, layoutMaxWidthCollapsesChildren, manualGroupMayStretch, ...FIELD_REPORT_RULES,
];

export const CORE_LINT_RULE_IDS: readonly string[] = CORE_LINT_RULES.map(rule => rule.id);

// Fail fast at module load if a rule ships without registry metadata: the
// survey's severity/grouping contract is only total if this holds.
for (const id of CORE_LINT_RULE_IDS) {
  if (!ruleMetadata(id)) throw new Error(`rule '${id}' has no entry in core/rule-metadata.ts`);
}

/** Stable local-CLI rule profile locked by the acceptance corpus. */
export const CLI_RULE_IDS = [
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
  // v3.20: the compile gate runs this profile; these REFUSE rules were missing from it.
  'formula-missing-equals',
  'block-scalar-required',
  'enum-value-invalid',
  'bare-color-name',
] as const;
const CLI_RULE_ID_SET: ReadonlySet<string> = new Set(CLI_RULE_IDS);

/** Bind catalog data once without letting generated data leak into rule modules. */
export function bindLintRules(catalogData: AnalyzerCatalogData, profile: LintProfile = 'worker'): LintRule[] {
  const byId = new Map(CORE_LINT_RULES.map(rule => [rule.id, rule]));
  const selected = profile === 'cli'
    ? CLI_RULE_IDS.map(id => byId.get(id)!)
    : CORE_LINT_RULES;
  return selected.map(rule => ({
    ...rule,
    check(bundle, context) {
      return rule.check.call(this, bundle, { ...context, catalogData } as CatalogAwareLintContext);
    },
  }));
}

export function runLintRules(
  bundle: AppBundle,
  catalogData: AnalyzerCatalogData,
  context?: LintContext,
  rules: LintRule[] = bindLintRules(catalogData),
  outputBudget?: { observeIssue(issue: Readonly<Issue>): void },
): Issue[] {
  const controls = nodesOf(bundle);
  const real = controls.filter(c => c.type !== null);
  const ruleContext = treeContext(bundle, context);
  const produced: Issue[] = [];
  for (const rule of rules) {
    const ruleIssues = rule.check(bundle, ruleContext);
    for (const issue of ruleIssues) {
      if (issue.rule !== 'perf-onstart-no-concurrent') outputBudget?.observeIssue(issue);
      produced.push(issue);
    }
  }
  const issues = mergeOnStartIssues(produced);
  for (const issue of issues) {
    if (issue.rule === 'perf-onstart-no-concurrent') outputBudget?.observeIssue(issue);
  }
  return rules.every(rule => CLI_RULE_ID_SET.has(rule.id))
    ? orderLegacyCliBatchIssues(issues, real)
    : issues;
}

/** Preserve the established local-CLI cross-rule emission mechanics. */
function orderLegacyCliBatchIssues(issues: Issue[], controls: ControlNode[]): Issue[] {
  const controlOrder = new Map<string, number>();
  controls.forEach((control, index) => {
    const key = `${control.file}\u0000${control.name}\u0000${control.type ?? ''}`;
    if (!controlOrder.has(key)) controlOrder.set(key, index);
  });
  const siteOrder = (issue: Issue): number =>
    controlOrder.get(`${issue.file}\u0000${issue.control}\u0000${issue.type}`) ?? Number.MAX_SAFE_INTEGER;

  const formulaRules = new Set(['duplicate-formula', 'duplicate-formula-in-gallery']);
  const formulaIndexes = issues
    .map((issue, index) => formulaRules.has(issue.rule ?? '') ? index : -1)
    .filter(index => index >= 0);
  if (formulaIndexes.length > 1) {
    const ordered = formulaIndexes.map(index => issues[index])
      .sort((left, right) => siteOrder(left) - siteOrder(right) || left.line - right.line);
    formulaIndexes.forEach((index, orderedIndex) => { issues[index] = ordered[orderedIndex]; });
  }

  const a11yRules = new Set([
    'a11y-tabindex-positive',
    'a11y-interactive-not-focusable',
    'a11y-icon-button-no-label',
    'a11y-inputs-missing-accessiblelabel',
  ]);
  const a11yRank = new Map([
    ['a11y-tabindex-positive', 0],
    ['a11y-interactive-not-focusable', 1],
    ['a11y-icon-button-no-label', 2],
    ['a11y-inputs-missing-accessiblelabel', 3],
  ]);
  const a11yIndexes = issues
    .map((issue, index) => a11yRules.has(issue.rule ?? '') ? index : -1)
    .filter(index => index >= 0);
  if (a11yIndexes.length > 1) {
    const ordered = a11yIndexes.map(index => issues[index]).sort((left, right) => {
      const leftAggregate = left.rule === 'a11y-inputs-missing-accessiblelabel';
      const rightAggregate = right.rule === 'a11y-inputs-missing-accessiblelabel';
      if (leftAggregate !== rightAggregate) return leftAggregate ? 1 : -1;
      return siteOrder(left) - siteOrder(right)
        || (a11yRank.get(left.rule ?? '') ?? 0) - (a11yRank.get(right.rule ?? '') ?? 0);
    });
    a11yIndexes.forEach((index, orderedIndex) => { issues[index] = ordered[orderedIndex]; });
  }
  return issues;
}

const issueSite = (issue: Issue): string =>
  `${issue.file}\u0000${issue.control}\u0000${issue.property ?? ''}`;

/** Collapse the two App.OnStart heuristics into one finding for one defect. */
function mergeOnStartIssues(issues: Issue[]): Issue[] {
  const heavyBySite = new Map<string, Issue>();
  for (const issue of issues) {
    if (issue.rule === 'heavy-onstart') heavyBySite.set(issueSite(issue), issue);
  }

  const suppressed = new Set<Issue>();
  for (const issue of issues) {
    if (issue.rule !== 'perf-onstart-no-concurrent') continue;
    const heavy = heavyBySite.get(issueSite(issue));
    if (!heavy) continue;
    const loads = issue.detail.match(/OnStart issues (\d+) Collect\/ClearCollect calls/)?.[1] ?? 'multiple';
    heavy.detail = `${heavy.detail}; also loads ${loads} collections serially — consider Concurrent() for the independent loads, and named formulas / App.Formulas for the rest`;
    heavy.fix = 'use Concurrent() for independent collection loads, and move the remaining initialization to named formulas / App.Formulas';
    suppressed.add(issue);
  }
  return issues.filter(issue => !suppressed.has(issue));
}

/**
 * Natural opportunity denominators already exposed by the rule walkers. Rules
 * without a stable, meaningful "sites examined" unit are deliberately absent.
 */
export function getLintOpportunities(bundle: AppBundle, context: LintContext = {}): Record<string, number> {
  const controls = nodesOf(bundle);
  const real = controls.filter(control => control.type !== null);
  const opportunities: Record<string, number> = {
    'a11y-tabindex-positive': 0,
    'a11y-interactive-not-focusable': 0,
    'a11y-icon-button-no-label': 0,
    'duplicate-formula': 0,
    'repeated-color-literal': 0,
    'heavy-onstart': 0,
  };

  for (const control of real) {
    if (control.type !== 'CanvasComponent' && control.type !== COMPONENT_DEFINITION_TYPE) {
      for (const property of control.properties) {
        if (property.name === 'TabIndex' && literalInt(property.value) !== null) {
          opportunities['a11y-tabindex-positive']++;
        }
      }
    }
    if (control.type && CLASSIC_FOCUSABLE_VIA_TABINDEX.has(control.type)
      && nonTrivialOnSelect(val(control, 'OnSelect'))) {
      opportunities['a11y-interactive-not-focusable']++;
    }
    if (control.type && ICONIC_CONTROLS.has(control.type)
      && nonTrivialOnSelect(val(control, 'OnSelect'))) {
      opportunities['a11y-icon-button-no-label']++;
    }
    if (control.type === APP_TYPE) {
      opportunities['heavy-onstart'] += control.properties.filter(property => property.name === 'OnStart').length;
      continue;
    }
    for (const property of control.properties) {
      const normalized = normalizeFormula(property.value);
      if (isDuplicateFormulaCandidate(property, normalized)) {
        opportunities['duplicate-formula']++;
      }
      for (const match of property.value.matchAll(/RGBA\s*\([^)]*\)/g)) {
        const color = normalizeWhitespace(match[0]).replace(/\s/g, '');
        if (!EXCLUDED_COLOR_LITERALS.has(color)) opportunities['repeated-color-literal']++;
      }
    }
  }

  const delegationFamilies: ReadonlyArray<readonly [
    rule: string,
    functions: readonly string[],
    candidate: DelegationCandidateGate,
  ]> = [
    ['delegation-firstn-on-source', ['FirstN', 'LastN', 'Last'], directFirstNSourceCandidate],
    ['delegation-forall-writes', ['ForAll'], nonCollectionSourceCandidate],
    ['delegation-search-caveat', ['Search'], unmappedSourceCandidate],
    ['delegation-sharepoint-search', ['Search'], mappedSourceCandidate('sharepoint')],
    ['delegation-sharepoint-in', SHAREPOINT_PREDICATE_FUNCTIONS, mappedSourceCandidate('sharepoint')],
    ['delegation-sharepoint-isblank', SHAREPOINT_PREDICATE_FUNCTIONS, mappedSourceCandidate('sharepoint')],
    ['delegation-sharepoint-text-functions', SHAREPOINT_PREDICATE_FUNCTIONS, sharepointTextCandidate],
    ['delegation-sharepoint-id-operator', SHAREPOINT_PREDICATE_FUNCTIONS, mappedSourceCandidate('sharepoint')],
    ['delegation-sql-isblank', SHAREPOINT_PREDICATE_FUNCTIONS, mappedSourceCandidate('sql')],
    ['delegation-excel-any', EXCEL_QUERY_FUNCTIONS, mappedSourceCandidate('excel')],
  ];

  for (const [rule, functions, candidate] of delegationFamilies) {
    // A delegation rule emits at most once per property, so its denominator is
    // candidate properties, not the number of nested calls within those sites.
    opportunities[rule] = delegationCandidateSites(real, functions, context, candidate).length;
  }

  return opportunities;
}
