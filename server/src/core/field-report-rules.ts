/** Compiler and runtime hazards bounded by the 2026-10-06 field-rule job. */
import type { Issue } from './analyzer.js';
import type { LintRule } from './lint.js';
import { collectKnownSymbols, formulaNodes, isKnownSymbol, isInEnclosingBinding } from './formula-bindings.js';
import { inspectFormulaStructure, plainIdentifier, type FormulaStructure, type TokenRange } from './formula-structure.js';
import { tokenizeFormula } from './tokenizer.js';
import { controlNodes, type ControlNode, type ParsedProperty } from './model.js';
import { resolveDatasourceReference } from './datasource.js';

const finding = (rule: LintRule, control: ControlNode, property: ParsedProperty, detail: string, fix: string): Issue => ({
  level: rule.level, rule: rule.id, file: control.file, line: property.line,
  control: control.name, type: control.type ?? 'unknown', property: property.name, detail, fix,
});

function commentRule(truncates: boolean): LintRule {
  return {
    id: truncates ? 'yaml-comment-truncates-formula' : 'yaml-inline-comment-after-formula',
    level: truncates ? 'REFUSE' : 'WARN', docRef: 'validator-checklist.md §Field-report formula hazards',
    check(bundle) {
      const out: Issue[] = [];
      for (const control of formulaNodes(bundle)) for (const property of control.properties) {
        if (!property.inlineComment || property.wasQuoted || property.isBlockScalar || !property.value.startsWith('=')) continue;
        const parsed = tokenizeFormula(property.value);
        const incomplete = !!(parsed.unterminatedString || parsed.unbalancedDelimiters);
        if (truncates ? !incomplete : incomplete) continue;
        if (!truncates && parsed.parseConfidence !== 'complete') {
          // Closed interpolation is opaque to call rules, but it still forms a
          // complete scalar. Replace only those string spans and check the rest.
          const transparent = parsed.tokens.reduceRight((value, token) =>
            token.kind === 'string' && token.text.startsWith('$"')
              ? value.slice(0, token.span.start) + '""' + value.slice(token.span.end) : value, property.value);
          if (tokenizeFormula(transparent).parseConfidence !== 'complete') continue;
        }
        out.push(finding(this, control, property,
          truncates ? `YAML treats ' #' as a comment, so the formula is cut at '#': '${property.value}'`
            : 'The text after # is a YAML comment and is not part of the formula.',
          `quote the value or use a |- block scalar for ${property.name}`));
      }
      return out;
    },
  };
}

const componentInputCalledAsFunction: LintRule = {
  id: 'component-input-called-as-function', level: 'REFUSE',
  docRef: 'validator-checklist.md §Field-report formula hazards',
  check(bundle, context) {
    const out: Issue[] = [];
    const owners = new Map<string, ControlNode | null>();
    for (const node of controlNodes(bundle)) {
      const key = node.name.toLowerCase();
      owners.set(key, owners.has(key) ? null : node);
    }
    const definitions = new Map<string, ControlNode | null>();
    for (const node of bundle.componentDefs) {
      const key = node.name.toLowerCase();
      definitions.set(key, definitions.has(key) ? null : node);
    }
    const symbols = collectKnownSymbols(bundle);
    for (const control of formulaNodes(bundle)) {
      const definition = [control, ...context.ancestorsOf(control)].find(node => node.type === '__ComponentDefinition');
      for (const property of control.properties) {
        const structure = inspectFormulaStructure(property.value, true);
        if (!structure?.isFormula) continue;
        for (const call of structure.calls) {
          const index = call.nameIndex;
          if (structure.tokens[index - 1]?.text !== '.' || structure.tokens[index - 3]?.text === '.') continue;
          const owner = plainIdentifier(structure, {start: index - 2, end: index - 1});
          const member = plainIdentifier(structure, {start: index, end: index + 1});
          if (!owner || !member
            || isInEnclosingBinding(structure, {start: index - 2, end: call.endIndex + 1}, owner)) continue;
          const instance = definition ? null : owners.get(owner.toLowerCase());
          const target = definition ?? (instance?.type === 'CanvasComponent' && instance.componentName
            && !isKnownSymbol(symbols, owner) ? definitions.get(instance.componentName.toLowerCase()) : null);
          if (!target || (definition && owner.toLowerCase() !== definition.name.toLowerCase())) continue;
          const values = new Map((target.customProperties ?? [])
            .filter(custom => (custom.fields.PropertyKind === 'Input' || custom.fields.PropertyKind === 'Output')
              && !Object.hasOwn(custom.fields, 'Parameters'))
            .map(custom => [custom.name.toLowerCase(), custom.name]));
          const declared = values.get(member.toLowerCase());
          if (!declared) continue;
          const name = definition?.name ?? instance!.name;
          out.push(finding(this, control, property,
            `\`${name}.${declared}()\` calls an \`Input\`/\`Output\` property as a function; \`compile_canvas\` rejects this ('unknown or unsupported function in namespace').`
              + (definition ? '' : ` read it without parentheses: \`${name}.${declared}\`.`),
            `read it without parentheses: \`${name}.${declared}\``));
          break;
        }
      }
    }
    return out;
  },
};

const addColumnsStringColumnName: LintRule = {
  id: 'addcolumns-string-column-name', level: 'REFUSE',
  docRef: 'validator-checklist.md §Field-report formula hazards',
  check(bundle) {
    const out: Issue[] = [];
    for (const control of formulaNodes(bundle)) for (const property of control.properties) {
      const structure = inspectFormulaStructure(property.value, true);
      if (!structure?.isFormula) continue;
      if (!structure.calls.some(call => call.unqualified && call.name === 'addcolumns'
        && call.arguments.some((argument, index) => index % 2 === 1 && argument.end - argument.start === 1
          && structure.tokens[argument.start].kind === 'string'))) continue;
      out.push(finding(this, control, property,
        "Expected identifier name. The function 'AddColumns' has some invalid arguments: a new column name is a string literal.",
        "use an identifier for the new column name: Name, or 'Display Name' with single quotes"));
    }
    return out;
  },
};

function columnName(structure: FormulaStructure, range: TokenRange): string | null {
  const identifier = plainIdentifier(structure, range);
  if (identifier !== null) return identifier;
  if (range.end - range.start !== 1) return null;
  const token = structure.tokens[range.start];
  // Interpolated strings are opaque and rejected by inspectFormulaStructure.
  return token.kind === 'string' ? token.text.slice(1, -1).replaceAll('""', '"') : null;
}

const sortByColumnsOnAddedColumn: LintRule = {
  id: 'sortbycolumns-on-added-column', level: 'WARN',
  docRef: 'validator-checklist.md §Field-report formula hazards',
  check(bundle) {
    const out: Issue[] = [];
    for (const control of formulaNodes(bundle)) for (const property of control.properties) {
      const structure = inspectFormulaStructure(property.value, true);
      if (!structure?.isFormula) continue;
      for (const sort of structure.calls) {
        if (!sort.unqualified || sort.name !== 'sortbycolumns' || sort.arguments.length < 2) continue;
        const source = sort.arguments[0];
        const add = structure.calls.find(call => call.unqualified && call.name === 'addcolumns'
          && call.nameIndex === source.start && call.endIndex + 1 === source.end);
        if (!add) continue;
        const added = new Set(add.arguments.flatMap((argument, index) => {
          const name = index % 2 === 1 ? columnName(structure, argument) : null;
          return name === null ? [] : [name.toLowerCase()];
        }));
        const name = sort.arguments.flatMap((argument, index) => {
          const name = index % 2 === 1 ? columnName(structure, argument) : null;
          return name !== null && added.has(name.toLowerCase()) ? [name] : [];
        })[0];
        if (name === undefined) continue;
        out.push(finding(this, control, property,
          `SortByColumns sorts '${name}', which its directly enclosed AddColumns adds; this pattern failed compilation on a Dataverse-backed Items formula. Generality across sources is unproven.`,
          'sort the source first, then add: AddColumns(Sort(src, col, SortOrder.Ascending), newCol, col)'));
        break;
      }
    }
    return out;
  },
};

const selectParentInGallery: LintRule = {
  id: 'select-parent-in-gallery', level: 'WARN',
  docRef: 'validator-checklist.md §Field-report formula hazards',
  check(bundle, context) {
    const out: Issue[] = [];
    for (const control of formulaNodes(bundle)) {
      const ancestors = context.ancestorsOf(control);
      const inComponent = ancestors.some(ancestor => ancestor.type === '__ComponentDefinition');
      if (context.parentOf(control)?.type === 'Gallery' && !inComponent) continue;
      if (!ancestors.some(ancestor => ancestor.type === 'Gallery')) continue;
      for (const property of control.properties) {
        if (!/^On/iu.test(property.name)) continue;
        const structure = inspectFormulaStructure(property.value, true);
        if (!structure?.isFormula || !structure.calls.some(call => call.unqualified && call.name === 'select'
          && call.arguments.length === 1 && plainIdentifier(structure, call.arguments[0])?.toLowerCase() === 'parent'
          && !isInEnclosingBinding(structure, {start: call.nameIndex, end: call.endIndex + 1}, 'Parent'))) continue;
        out.push(finding(this, control, property,
          inComponent
            ? 'Select(Parent) inside a gallery in a component definition produced a runtime error even for a direct gallery child after a clean compile.'
            : 'Select(Parent) from a control nested inside a container or group in a gallery template compiled cleanly but produced a runtime error when tapped in the field report.',
          inComponent ? "put the action on the gallery's OnSelect or the control's own OnSelect"
            : "repeat the row's OnSelect logic or call a UDF"));
      }
    }
    return out;
  },
};

function ungroup(structure: FormulaStructure, range: TokenRange): TokenRange {
  let { start, end } = range;
  while (structure.tokens[start]?.text === '(' && structure.tokens[end - 1]?.text === ')') {
    let depth = 0, closesAtEnd = true;
    for (let i = start; i < end - 1; i++) {
      if (structure.tokens[i].text === '(') depth++;
      if (structure.tokens[i].text === ')' && --depth === 0) { closesAtEnd = false; break; }
    }
    if (!closesAtEnd) break;
    start++; end--;
  }
  return {start, end};
}

function topLevelParts(structure: FormulaStructure, range: TokenRange, operators: readonly string[]): TokenRange[] {
  const parts: TokenRange[] = [];
  let depth = 0, start = range.start;
  for (let i = start; i < range.end; i++) {
    const token = structure.tokens[i];
    if (token.kind === 'delimiter') {
      if ('([{'.includes(token.text)) depth++;
      else depth--;
    } else if (depth === 0 && operators.includes(token.text.toLowerCase())
      && !(['or', 'and'].includes(token.text.toLowerCase()) && structure.tokens[i + 1]?.text === '(')) {
      parts.push({start, end: i}); start = i + 1;
    }
  }
  return parts.length ? [...parts, {start, end: range.end}] : [];
}

function nonColumn(structure: FormulaStructure, range: TokenRange, symbols: ReadonlySet<string>): boolean {
  const atom = ungroup(structure, range);
  const token = structure.tokens[atom.start];
  if (!token) return false;
  if (atom.end - atom.start === 1) {
    if (token.kind === 'string' || token.kind === 'number' || /^(true|false)$/iu.test(token.text)) return true;
    const name = plainIdentifier(structure, atom);
    return name !== null && (/^(?:var|gbl|loc)(?:[A-Z0-9_]|$)/u.test(name) || symbols.has(name.toLowerCase()));
  }
  return atom.end - atom.start === 2 && /^[+-]$/u.test(token.text)
    && structure.tokens[atom.start + 1].kind === 'number';
}

function constantEquality(structure: FormulaStructure, range: TokenRange, symbols: ReadonlySet<string>): boolean {
  const parts = topLevelParts(structure, ungroup(structure, range), ['=']);
  return parts.length === 2 && parts.every(part => nonColumn(structure, part, symbols));
}

function constantDisjunction(structure: FormulaStructure, range: TokenRange, symbols: ReadonlySet<string>): boolean {
  const expression = ungroup(structure, range);
  const disjunction = topLevelParts(structure, expression, ['||', 'or']);
  if (disjunction.length) return disjunction.some(part => constantEquality(structure, part, symbols)
    || constantDisjunction(structure, part, symbols));
  const conjunction = topLevelParts(structure, expression, ['&&', 'and']);
  if (conjunction.length) return conjunction.some(part => constantDisjunction(structure, part, symbols));
  const call = structure.calls.find(call => call.unqualified && call.nameIndex === expression.start
    && call.endIndex + 1 === expression.end && (call.name === 'or' || call.name === 'and'));
  return !!call && call.arguments.some(part => (call.name === 'or' && constantEquality(structure, part, symbols))
    || constantDisjunction(structure, part, symbols));
}

function sourceName(structure: FormulaStructure, range: TokenRange): string | null {
  let source = ungroup(structure, range);
  if (source.end - source.start === 3 && structure.tokens[source.start + 1].text.toLowerCase() === 'as') {
    source = {start: source.start, end: source.start + 1};
  }
  const name = plainIdentifier(structure, source);
  if (name) return name;
  const wrapper = structure.calls.find(call => call.unqualified && call.nameIndex === source.start
    && call.endIndex + 1 === source.end && call.arguments.length > 0
    && ['filter', 'sort', 'sortbycolumns', 'search', 'showcolumns', 'dropcolumns', 'renamecolumns', 'addcolumns'].includes(call.name));
  return wrapper ? sourceName(structure, wrapper.arguments[0]) : null;
}

const filterConstantOrColumn: LintRule = {
  id: 'filter-constant-or-column', level: 'WARN', docRef: 'troubleshooting.md',
  check(bundle, context) {
    const out: Issue[] = [];
    const symbols = collectKnownSymbols(bundle);
    for (const control of formulaNodes(bundle)) for (const property of control.properties) {
      const structure = inspectFormulaStructure(property.value, true);
      if (!structure?.isFormula) continue;
      if (!structure.calls.some(call => {
        if (!call.unqualified || call.name !== 'filter' || call.arguments.length < 2) return false;
        const name = sourceName(structure, call.arguments[0]);
        if (!name || resolveDatasourceReference(name, {
          datasources: context.datasources, exportMetadata: context.exportDatasources,
        }).backend === 'collection') return false;
        return call.arguments.slice(1).some(predicate => constantDisjunction(structure, predicate, symbols));
      })) continue;
      out.push(finding(this, control, property,
        "A constant-or-variable equality in a non-collection Filter disjunction can fail at runtime: \"The left side of the 'Equal' operator must be a property of the entity\".",
        'branch outside the Filter: If(varX = "all", Src, Filter(Src, Col = varX))'));
    }
    return out;
  },
};

function numericLiteral(structure: FormulaStructure, range: TokenRange): number | null {
  const atom = ungroup(structure, range);
  const text = structure.tokens.slice(atom.start, atom.end).map(token => token.text).join('');
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/u.test(text) && Number.isFinite(Number(text)) ? Number(text) : null;
}

function literalRows(structure: FormulaStructure, range: TokenRange): number | null {
  const table = ungroup(structure, range);
  const call = structure.calls.find(call => call.unqualified && call.name === 'table'
    && call.nameIndex === table.start && call.endIndex + 1 === table.end);
  if (call && call.arguments.every(row => structure.tokens[row.start]?.text === '{'
    && structure.tokens[row.end - 1]?.text === '}')) return call.arguments.length;
  if (structure.tokens[table.start]?.text !== '[' || structure.tokens[table.end - 1]?.text !== ']') return null;
  let depth = 0;
  for (let i = table.start; i < table.end - 1; i++) {
    const token = structure.tokens[i];
    if (token.kind !== 'delimiter') continue;
    if ('([{'.includes(token.text)) depth++;
    else if (--depth === 0) return null;
  }
  const inner = {start: table.start + 1, end: table.end - 1};
  return inner.start === inner.end ? 0 : topLevelParts(structure, inner, [',']).length || 1;
}

const indexLiteralPosition: LintRule = {
  id: 'index-literal-position', level: 'WARN', docRef: 'troubleshooting.md',
  check(bundle) {
    const out: Issue[] = [];
    for (const control of formulaNodes(bundle)) for (const property of control.properties) {
      const structure = inspectFormulaStructure(property.value, true);
      if (!structure?.isFormula || !structure.calls.some(call => {
        if (!call.unqualified || call.name !== 'index' || call.arguments.length !== 2) return false;
        const position = numericLiteral(structure, call.arguments[1]);
        if (position === null || position < 2) return false;
        const rows = literalRows(structure, call.arguments[0]);
        return rows === null || rows < position;
      })) continue;
      out.push(finding(this, control, property,
        'A literal Index position can exceed a short table; hidden controls still evaluate formulas even when Visible is false, causing a runtime error.',
        'use First(t) or Last(FirstN(t, n)) to avoid an out-of-range error on short tables'));
    }
    return out;
  },
};

const modernTextHeightBelowSize: LintRule = {
  id: 'modern-text-height-below-size', level: 'WARN', docRef: 'sizing-reference.md',
  check(bundle, context) {
    const out: Issue[] = [];
    for (const control of controlNodes(bundle)) {
      if (control.type !== 'ModernText' && control.type !== 'Text') continue;
      const prop = (name: string) => control.properties.find(property => property.name === name);
      if (/^=?\s*true$/iu.test(prop('AutoHeight')?.value.trim() ?? '')) continue;
      const literal = (name: string, fallback: number | null = null): number | null => {
        const property = prop(name);
        if (!property) return fallback;
        const structure = inspectFormulaStructure(property.value);
        const range = structure?.statements[0]?.range;
        return structure && range && structure.statements.length === 1 ? numericLiteral(structure, range) : null;
      };
      const height = literal('Height'), size = literal('Size');
      const top = literal('PaddingTop', 0), bottom = literal('PaddingBottom', 0);
      // Authored Height is not proof of rendered height on the vertical flex
      // axis. Missing/dynamic FillPortions leaves that unknown; do not guess a
      // default. The Microsoft oracle's seven apparent hits have this shape.
      const parent = context.parentOf(control);
      if (parent && context.layoutDirectionOf(parent) === 'vertical' && literal('FillPortions') !== 0) continue;
      if (height === null || size === null || top === null || bottom === null || height >= 1.5 * size + top + bottom) continue;
      out.push(finding(this, control, prop('Height')!,
        'A scrollbar can appear inside modern text when Height is below 1.5 × Size plus vertical padding; two independent runtime reports observed this.',
        'set Height to at least 1.5 × Size + PaddingTop + PaddingBottom for one line, or enable AutoHeight'));
    }
    return out;
  },
};

/** A plain or dotted reference (`varTotal`, `ThisItem.Count`, `lblX.Text`) starting at `start`; never a call. */
function referenceAt(structure: FormulaStructure, start: number): { key: string; end: number } | null {
  const tokens = structure.tokens;
  const first = tokens[start];
  if (!first || (first.kind !== 'identifier' && first.kind !== 'quoted-identifier')) return null;
  if (tokens[start - 1]?.text === '.') return null;
  if (/^(?:true|false|Blank)$/iu.test(first.text)) return null;
  const parts = [first.text];
  let end = start + 1;
  while (tokens[end]?.text === '.' && (tokens[end + 1]?.kind === 'identifier' || tokens[end + 1]?.kind === 'quoted-identifier')) {
    parts.push(tokens[end + 1].text);
    end += 2;
  }
  if (tokens[end]?.text === '(') return null;
  return { key: parts.join('.').toLowerCase(), end };
}

const isZero = (text: string | undefined) => text !== undefined && /^0+(?:\.0+)?$/u.test(text);
const BLANK_AWARE = new Set(['iferror', 'isblank', 'isblankorerror', 'coalesce', 'iserror']);

const zeroGuardMissesBlank: LintRule = {
  id: 'zero-guard-misses-blank', level: 'WARN', docRef: 'troubleshooting.md',
  check(bundle) {
    const out: Issue[] = [];
    for (const control of formulaNodes(bundle)) for (const property of control.properties) {
      const structure = inspectFormulaStructure(property.value, true);
      if (!structure?.isFormula) continue;
      if (structure.calls.some(call => BLANK_AWARE.has(call.name))) continue;
      const tokens = structure.tokens;
      const divisors = new Set<string>();
      const zeroCompared = new Set<string>();
      for (let index = 0; index < tokens.length; index++) {
        const ref = referenceAt(structure, index);
        if (!ref) continue;
        if (tokens[index - 1]?.text === '/') divisors.add(ref.key);
        const op = tokens[ref.end]?.text;
        if ((op === '=' || op === '<>') && isZero(tokens[ref.end + 1]?.text) && tokens[ref.end + 2]?.text !== '.') zeroCompared.add(ref.key);
        const before = tokens[index - 1]?.text;
        if ((before === '=' || before === '<>') && isZero(tokens[index - 2]?.text)) zeroCompared.add(ref.key);
      }
      const guarded = [...divisors].filter(key => zeroCompared.has(key));
      if (!guarded.length) continue;
      out.push(finding(this, control, property,
        `Division by ${guarded.join(', ')} is guarded with "= 0" or "<> 0" only. A blank value is not equal to 0, but division treats it as 0, so the guard lets it through and the formula fails with division by zero (for example before data has loaded; Studio evaluates formulas early).`,
        'guard with Coalesce(x, 0) = 0, IsBlank(x) || x = 0, or x > 0, or wrap the division in IfError'));
    }
    return out;
  },
};

const modernTextWidthBelowText: LintRule = {
  id: 'modern-text-width-below-text', level: 'WARN', docRef: 'sizing-reference.md',
  check(bundle, context) {
    const out: Issue[] = [];
    for (const control of controlNodes(bundle)) {
      if (control.type !== 'ModernText' && control.type !== 'Text') continue;
      const prop = (name: string) => control.properties.find(property => property.name === name);
      if (/^=?\s*true$/iu.test(prop('AutoHeight')?.value.trim() ?? '')) continue;
      const single = (name: string) => {
        const property = prop(name);
        if (!property) return null;
        const structure = inspectFormulaStructure(property.value);
        const range = structure?.statements[0]?.range;
        return structure && range && structure.statements.length === 1 ? { structure, range } : null;
      };
      const literal = (name: string, fallback: number | null = null): number | null => {
        if (!prop(name)) return fallback;
        const found = single(name);
        return found ? numericLiteral(found.structure, found.range) : null;
      };
      const text = single('Text');
      if (!text || text.range.end - text.range.start !== 1) continue;
      const token = text.structure.tokens[text.range.start];
      if (token.kind !== 'string') continue;
      const characters = [...token.text.slice(1, -1).replaceAll('""', '"')].length;
      // Width is owned by the layout inside auto-layout containers unless a
      // horizontal parent fixes it with FillPortions 0; stay silent there.
      const parent = context.parentOf(control);
      const direction = parent ? context.layoutDirectionOf(parent) : null;
      if (parent?.type === 'GroupContainer' && parent.variant === 'AutoLayout' && direction === null) continue;
      if (direction === 'vertical' || (direction === 'horizontal' && literal('FillPortions') !== 0)) continue;
      const width = literal('Width'), height = literal('Height'), size = literal('Size');
      const left = literal('PaddingLeft', 0), right = literal('PaddingRight', 0);
      const top = literal('PaddingTop', 0), bottom = literal('PaddingBottom', 0);
      if (width === null || height === null || size === null || left === null || right === null || top === null || bottom === null) continue;
      const estimated = Math.ceil(characters * size * 0.5);
      if (estimated <= width - left - right) continue;
      if (height >= 3 * size + top + bottom) continue;
      out.push(finding(this, control, prop('Width')!,
        `The text needs about ${estimated}px at Size ${size} but Width leaves ${width - left - right}px, so it wraps to a second line that Height does not fit; modern text then shows a scrollbar. Estimate: 0.5 × Size per character.`,
        'widen the control (about 0.5 × Size per character plus padding), reduce Size, or enable AutoHeight'));
    }
    return out;
  },
};

export const FIELD_REPORT_RULES: LintRule[] = [
  commentRule(true), commentRule(false), componentInputCalledAsFunction,
  addColumnsStringColumnName, sortByColumnsOnAddedColumn, selectParentInGallery,
  filterConstantOrColumn, indexLiteralPosition, modernTextHeightBelowSize,
  zeroGuardMissesBlank, modernTextWidthBelowText,
];
