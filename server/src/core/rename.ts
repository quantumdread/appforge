/** Source-preserving renaming; no I/O or tenant access. */
import { buildAppBundle, validateFiles, type Issue } from './analyzer.js';
import type { AnalyzerCatalogData } from './catalog.js';
import { collectKnownSymbols, formulaNodes, isInEnclosingBinding, isKnownSymbol } from './formula-bindings.js';
import { controlNodes, type ControlNode, type AppBundle, type ParsedProperty } from './model.js';
import { inspectFormulaStructure, plainIdentifier, type FormulaStructure } from './formula-structure.js';
import { tokenizeFormula } from './tokenizer.js';
import { scalarSource, replaceScalarSpan } from './scalar-edits.js';

export type RenameFile = { name: string; content: string };
export type RenameOptions = { screen_prefix?: boolean | 'auto'; abbreviations?: Record<string, string> };
type Evidence = { source: string; value: string };
type Proposal = { file: string; old: string; new: string; evidence: Evidence[]; confidence: 'high' | 'medium' | 'low'; apply_in: 'compile' | 'studio' };
const baseType = (type: string) => type.replace(/^Classic\//i, '').replace(/^Modern/i, '').toLowerCase();
const prefixes: Record<string, string> = {
  label: 'lbl', text: 'lbl', textinput: 'txt', button: 'btn', icon: 'ico', image: 'img', gallery: 'gal',
  form: 'frm', formviewer: 'frm', editform: 'frm', displayform: 'frm', combobox: 'cmb', dropdown: 'dd',
  checkbox: 'chk', toggle: 'tgl', switch: 'tgl', radio: 'rdo', datepicker: 'dte', slider: 'sld',
  tablist: 'tab', container: 'con', group: 'con', groupcontainer: 'con', rectangle: 'rec', shape: 'rec',
  circle: 'rec', htmltext: 'htm', table: 'tbl', datatable: 'tbl', canvascomponent: 'cmp', component: 'cmp', screen: 'scr',
};
const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/u;
const generic = (name: string, catalog: AnalyzerCatalogData, type: string) => {
  const stem = name.replace(/[_ ]?\d+$/u, '').toLowerCase();
  return stem !== name.toLowerCase() && [type, ...Object.keys(prefixes), ...catalog.controls.map(c => c.type)]
    .some(t => baseType(t) === baseType(stem));
};
const entities = (files: RenameFile[]) => formulaNodes(buildAppBundle(files)).filter(n => n.type !== '__App' && (n.type !== 'Screen' || n.screen?.line !== undefined));
/** Reuse the App property parser for custom-property field scalars, retaining
 * original line numbers. This enriches only the transform's private bundle. */
function renameBundle(files: RenameFile[]): AppBundle {
  const bundle = buildAppBundle(files);
  for (const node of bundle.componentDefs) {
    const source = files.find(f => f.name === node.file)!.content.split('\n');
    for (const custom of node.customProperties ?? []) {
      const fragment = source.map(() => '');
      fragment[0] = 'App:'; fragment[1] = '  Properties:';
      for (let i = custom.line; i < source.length; i++) {
        if (source[i].trim() && source[i].match(/^ */u)![0].length <= 6) break;
        fragment[i] = source[i];
      }
      const parsed = buildAppBundle([{ name: node.file, content: fragment.join('\n') }]);
      node.properties.push(...(parsed.app[0]?.properties ?? []));
    }
  }
  return bundle;
}
const pascal = (text: string) => text.normalize('NFKD').replace(/\p{M}/gu, '').replace(/ß/g, 'ss').replace(/[øØ]/g, 'o').replace(/[łŁ]/g, 'l')
  .replace(/([a-z])([A-Z])/g, '$1 $2').split(/[^A-Za-z0-9]+/u).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join('');
const TITLE_NAME = /title|header|heading|rubrik/iu;
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
function scopeName(node: ControlNode): string {
  let root = node;
  while (root.parent) root = root.parent;
  return node.screen?.name ?? root.screen?.name ?? root.name;
}

function screenMeaning(screen: ControlNode, nodes: readonly ControlNode[]) {
  const name = screen.name;
  for (const node of nodes) {
    if (node === screen || scopeName(node) !== name) continue;
    if (!TITLE_NAME.test(node.name) && !(node.parent && TITLE_NAME.test(node.parent.name))) continue;
    const found = meaning(node);
    if (found && found.evidence[0]?.source === 'Text') {
      return { ...found, confidence: 'medium' as const, evidence: [{ source: 'screen title ' + node.name, value: found.text }] };
    }
  }
  const navigates = new RegExp(`\\bNavigate\\(\\s*'?${escapeRegExp(name)}'?\\s*[,)]`, 'u');
  for (const node of nodes) {
    if (node === screen || scopeName(node) === name) continue;
    if (!node.properties.some(property => /^On/u.test(property.name) && navigates.test(property.value))) continue;
    const found = meaning(node);
    if (found) return { ...found, confidence: 'medium' as const, evidence: [{ source: 'navigation from ' + node.name, value: found.text }] };
  }
  return null;
}

function meaning(node: ControlNode): { evidence: Evidence[]; confidence: Proposal['confidence']; text: string } | null {
  for (const key of ['Text', 'HintText', 'Placeholder', 'InputTextPlaceholder', 'AccessibleLabel']) {
    const value = node.properties.find(p => p.name === key)?.value;
    if (value && /^="(?:[^"]|"")+"$/u.test(value)) {
      const text = value.slice(2, -1).replaceAll('""', '"');
      if (pascal(text)) return { text, evidence: [{ source: key, value: text }], confidence: 'high' };
    }
  }
  for (const key of ['Items', 'DataSource']) {
    const value = node.properties.find(p => p.name === key)?.value;
    const structure = value ? inspectFormulaStructure(value, true) : null;
    if (!structure?.isFormula) continue;
    const name = plainIdentifier(structure, { start: 1, end: structure.tokens.length });
    if (name && !/^(Parent|Self|ThisItem|ThisRecord)$/iu.test(name)) return { text: name, evidence: [{ source: key, value: name }], confidence: 'high' };
    // Follow only the source argument through a known query wrapper chain.
    // Predicate/look-up arguments can mention unrelated sources and are not
    // evidence for what this control displays.
    const queries = new Set(['filter', 'search', 'sort', 'sortbycolumns', 'firstn', 'lastn', 'showcolumns', 'dropcolumns', 'addcolumns', 'renamecolumns', 'distinct']);
    let range = { start: 1, end: structure.tokens.length };
    for (let depth = 0; depth < structure.calls.length; depth++) {
      const call = structure.calls.find(c => c.nameIndex === range.start && c.endIndex + 1 === range.end && c.unqualified && queries.has(c.name));
      if (!call?.arguments[0]) break;
      range = call.arguments[0];
      const source = plainIdentifier(structure, range);
      if (source && !/^(Parent|Self|ThisItem|ThisRecord)$/iu.test(source)) return { text: source, evidence: [{ source: key + ' query source', value: source }], confidence: 'medium' };
    }
  }
  return null;
}

export function proposeNames(files: RenameFile[], catalog: AnalyzerCatalogData, options: RenameOptions = {}) {
  const proposals: Proposal[] = [];
  const no_meaning: Array<{ file: string; control: string; reason: string }> = [];
  const nodes = entities(files);
  const isGeneric = (n: ControlNode) => generic(n.name, catalog, n.componentName ?? n.type ?? '');
  const folds: Array<{ old: string; before: string; after: string }> = [];
  const fallback_prefixes: Record<string, string> = {};
  const nonGeneric = nodes.filter(n => !isGeneric(n));
  const votes = new Map<string, Map<string, number>>();
  let patterned = 0;
  for (const node of nonGeneric) {
    const match = node.name.match(/^([a-z]{1,8}_?)[A-Z]/u);
    const type = prefixes[baseType(node.type ?? '')] ?? baseType(node.type ?? '');
    const snake = node.name.match(/^([a-z]+_)[a-z]/u);
    const suffixes = [node.type?.replace(/^Classic\//u, '').replace(/^Modern/u, ''), type[0]?.toUpperCase() + type.slice(1)].filter((s): s is string => !!s);
    const suffix = suffixes.find(s => node.name.endsWith(s) && node.name.length > s.length);
    const style = match ? 'prefix:' + match[1] : snake ? 'snake:' + snake[1] : suffix ? 'suffix:' + suffix : null;
    if (!style) continue;
    patterned++;
    const group = votes.get(type) ?? new Map<string, number>();
    group.set(style, (group.get(style) ?? 0) + 1); votes.set(type, group);
  }
  const retained = patterned > nonGeneric.length / 2;
  const conventionPatterns: Record<string, string> = {};
  const nameFor = (node: ControlNode, meaningText: string) => {
    const type = baseType(node.type === '__ComponentDefinition' ? 'CanvasComponent' : node.type ?? 'control');
    let prefix = prefixes[type];
    if (!prefix) { prefix = type.replace(/[^a-z]/g, '').slice(0, 3) || 'ctl'; fallback_prefixes[node.type ?? 'unknown'] = prefix; }
    const group = votes.get(prefix);
    if (retained && group) {
      const [winner, count] = [...group].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
      if (count > [...group.values()].reduce((a, b) => a + b, 0) / 2) {
        conventionPatterns[prefix] = winner;
        const [kind, affix] = winner.split(':');
        if (kind === 'snake') return affix + meaningText.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
        if (kind === 'suffix') return meaningText + affix;
        prefix = affix;
      }
    }
    return prefix + meaningText;
  };
  const scopes = [...new Set(nodes.map(n => {
    let root = n; while (root.parent) root = root.parent;
    return n.screen?.name ?? root.name;
  }))];
  const abbreviations: Record<string, string> = Object.create(null);
  const usedAbbreviations = new Set<string>();
  for (const scope of scopes) {
    const override = options.abbreviations?.[scope];
    const stem = override ?? (pascal(scope.replace(/^(scr|cmp|con)(?=[A-Z])/u, '')).slice(0, 3).toLowerCase() || 'app');
    if (!/^[a-z][a-z0-9]*$/u.test(stem)) throw new Error('Abbreviations must be lowercase identifiers.');
    if (override && usedAbbreviations.has(stem)) throw new Error('Abbreviations must be unique.');
    let candidate = stem, suffix = 2;
    while (usedAbbreviations.has(candidate)) candidate = stem + suffix++;
    abbreviations[scope] = candidate; usedAbbreviations.add(candidate);
  }
  const occupied = occupiedSymbols(renameBundle(files), catalog);
  for (const n of nodes) occupied.add(n.name.toLowerCase());
  let collisions = 0;
  const unprefixed = new Set<string>();
  for (const node of nodes) {
    if (!isGeneric(node)) continue;
    let found = meaning(node);
    if (!found && node.parent) {
      const context = meaning(node.parent);
      if (context) found = { ...context, confidence: 'low', evidence: context.evidence.map(e => ({ ...e, source: 'parent ' + e.source })) };
      else if (!isGeneric(node.parent)) {
        const text = node.parent.name.replace(/^[a-z]+(?=[A-Z])/u, '');
        found = { text, evidence: [{ source: 'parent', value: node.parent.name }], confidence: 'low' };
      }
    }
    // A screen is named only by something that names it: a title text, or the label of a control on
    // another screen that navigates here. An arbitrary child's text is not evidence (it proposed
    // scrCountATap from a probe icon's AccessibleLabel in a real app, 2026-10-07).
    if (!found && node.type === 'Screen') found = screenMeaning(node, nodes);
    if (!found || !pascal(found.text)) { no_meaning.push({ file: node.file, control: node.name, reason: 'No meaningful source representable as an ASCII identifier.' }); continue; }
    const meaningText = pascal(found.text);
    if (/[^\x00-\x7F]/u.test(found.text)) folds.push({ old: node.name, before: found.text, after: meaningText });
    let name = nameFor(node, meaningText);
    if (occupied.has(name.toLowerCase()) || unprefixed.has(name.toLowerCase())) collisions++;
    unprefixed.add(name.toLowerCase());
    if (options.screen_prefix === true && node.type !== 'Screen') {
      let root = node; while (root.parent) root = root.parent;
      name = abbreviations[node.screen?.name ?? root.name] + name[0].toUpperCase() + name.slice(1);
    }
    let unique = name, suffix = 2;
    while (occupied.has(unique.toLowerCase())) unique = name + suffix++;
    occupied.add(unique.toLowerCase());
    proposals.push({ file: node.file, old: node.name, new: unique, evidence: found.evidence, confidence: found.confidence, apply_in: node.type === 'Screen' ? 'studio' : 'compile' });
  }
  const count = nodes.filter(n => n.type !== 'Screen').length;
  return { proposals, no_meaning, folds, fallback_prefixes, abbreviations,
    convention: { retained, patterns: conventionPatterns, reason: retained ? 'Most non-generic names follow an existing naming convention; retained majority patterns by type.' : 'Using default type prefix plus PascalCase meaning.' },
    prefix_suggestion: { suggested: options.screen_prefix === 'auto' && (count >= 100 || collisions > 0), applied: options.screen_prefix === true, reason: `${count} controls; ${collisions} name collisions without screen prefixes. Auto only suggests; it never applies prefixes.` },
    summary: { generic_names: proposals.length + no_meaning.length, proposals: proposals.length, no_meaning: no_meaning.length } };
}

export class RenameInputError extends Error {
  override name = 'RenameInputError';
  constructor(public collisions: string[]) { super(collisions.join('\n')); }
}
type Reference = { owner: ControlNode; property: ParsedProperty; target: ControlNode; start: number; end: number; index: number };
// App.Formulas contains declarations without the usual leading '='. Add a
// virtual marker for lexical inspection only, then restore original spans.
function formulaStructure(property: ParsedProperty) {
  const offset = property.name === 'Formulas' && !property.value.startsWith('=') ? 1 : 0;
  const structure = inspectFormulaStructure((offset ? '=' : '') + property.value, true);
  if (structure && offset) for (const token of structure.tokens) token.span = { start: token.span.start - offset, end: token.span.end - offset };
  return structure;
}
function isUdfParameter(property: ParsedProperty, structure: FormulaStructure, index: number, name: string): boolean {
  if (property.name !== 'Formulas') return false;
  const statement = structure.statements.find(s => s.range.start <= index && s.range.end > index);
  if (!statement) return false;
  const declaration = structure.calls.find(c => c.nameIndex === statement.range.start && structure.tokens[c.endIndex + 1]?.text === ':');
  return !!declaration?.arguments.some(arg => structure.tokens[arg.start + 1]?.text === ':' && plainIdentifier(structure, { start: arg.start, end: arg.start + 1 })?.toLowerCase() === name.toLowerCase());
}
function inBinding(structure: FormulaStructure, index: number, name: string): boolean {
  // The source expression precedes its As declaration and is evaluated in the
  // outer scope. Keep the shared conservative scope rules for all other sites.
  const calls = structure.calls.map(call => {
    const first = call.arguments[0];
    return first && first.start <= index && first.end > index
      ? { ...call, arguments: [{ ...first, end: index }, ...call.arguments.slice(1)] } : call;
  });
  return isInEnclosingBinding({ ...structure, calls }, { start: index, end: index + 1 }, name);
}
/** Preserve the existing explicit-local rules; implicit row fields remain uncertain. */
function explicitLocal(structure: FormulaStructure, index: number, name: string): boolean {
  return structure.calls.some(call => call.nameIndex < index && call.endIndex > index && call.arguments.some((arg, a) => {
    if (call.name === 'with' && a === 0 && call.arguments[1]?.start <= index) {
      for (let j = arg.start; j < arg.end; j++) if (structure.tokens[j + 1]?.text === ':'
        && plainIdentifier(structure, { start: j, end: j + 1 })?.toLowerCase() === name.toLowerCase()) return true;
    }
    for (let j = arg.start; j < arg.end - 1; j++) if (structure.tokens[j].text.toLowerCase() === 'as'
      && plainIdentifier(structure, { start: j + 1, end: j + 2 })?.toLowerCase() === name.toLowerCase()) return true;
    return false;
  }));
}
function references(bundle: AppBundle) {
  const nodes = formulaNodes(bundle).filter(n => n.type !== '__App');
  const names = new Map<string, ControlNode | null>();
  for (const node of nodes) { const key = node.name.toLowerCase(); names.set(key, names.has(key) ? null : node); }
  const symbols = collectKnownSymbols(bundle);
  const result: Reference[] = [];
  for (const owner of formulaNodes(bundle)) for (const property of owner.properties) {
    const structure = formulaStructure(property);
    if (!structure?.isFormula) continue;
    for (let index = 0; index < structure.tokens.length; index++) {
      const name = plainIdentifier(structure, { start: index, end: index + 1 });
      const target = name && names.get(name.toLowerCase());
      if (!target || !name || isKnownSymbol(symbols, name)) continue;
      const prev = structure.tokens[index - 1]?.text.toLowerCase(), next = structure.tokens[index + 1]?.text;
      if (prev === '.' || prev === 'as' || next === ':' || next === '(') continue;
      if (property.name === 'Formulas' && next === '=' && (prev === ';' || index === 1)) continue;
      if (prev !== '@' && (isUdfParameter(property, structure, index, name)
        || (inBinding(structure, index, name) && explicitLocal(structure, index, name)))) continue;
      const token = structure.tokens[index];
      result.push({ owner, property, target, start: token.span.start, end: token.span.end, index });
    }
  }
  return result;
}

function occupiedSymbols(bundle: AppBundle, catalog: AnalyzerCatalogData): Set<string> {
  const names = new Set(collectKnownSymbols(bundle));
  const controls = new Set(formulaNodes(bundle).map(n => n.name.toLowerCase()));
  for (const name of [...Object.keys(catalog.enums), ...(catalog.functionNames ?? []),
    'App', 'Color', 'Parent', 'Self', 'ThisItem', 'ThisRecord', 'true', 'false', 'As', 'in', 'exactin', 'And', 'Or', 'Not',
    'If', 'With', 'Set', 'UpdateContext', 'Collect', 'ClearCollect', 'Navigate', 'Back', 'Reset', 'Select', 'SetFocus', 'RGBA', 'Blank']) names.add(name.toLowerCase());
  const sourceCalls = new Set(['filter', 'lookup', 'search', 'sort', 'sortbycolumns', 'first', 'last', 'firstn', 'lastn', 'index', 'forall', 'sum', 'average', 'min', 'max', 'countrows', 'countif', 'distinct', 'showcolumns', 'dropcolumns', 'addcolumns', 'renamecolumns', 'groupby', 'ungroup', 'patch', 'defaults', 'refresh', 'remove', 'removeif', 'update', 'updateif', 'collect', 'clearcollect', 'clear']);
  for (const owner of formulaNodes(bundle)) for (const property of owner.properties) {
    const structure = formulaStructure(property);
    if (!structure?.isFormula) continue;
    const add = (range: { start: number; end: number } | undefined) => { const name = range && plainIdentifier(structure, range); if (name) names.add(name.toLowerCase()); };
    if (['Items', 'DataSource'].includes(property.name)) add({ start: 1, end: structure.tokens.length });
    // Unbound identifiers can be sources/records absent from the catalog,
    // including conditional Items sources. Never capture an existing read.
    for (let i = 0; i < structure.tokens.length; i++) {
      const name = plainIdentifier(structure, { start: i, end: i + 1 });
      if (name && !controls.has(name.toLowerCase()) && structure.tokens[i - 1]?.text !== '.' && structure.tokens[i - 1]?.text.toLowerCase() !== 'as' && structure.tokens[i + 1]?.text !== ':'
        && !isUdfParameter(property, structure, i, name) && !inBinding(structure, i, name)) names.add(name.toLowerCase());
    }
    for (const call of structure.calls) if (call.unqualified) {
      names.add(call.name);
      if (sourceCalls.has(call.name) || call.name === 'set') add(call.arguments[0]);
      if (call.name === 'updatecontext' || call.name === 'navigate') {
        const range = call.arguments[call.name === 'navigate' ? 2 : 0];
        if (range) for (let i = range.start; i < range.end; i++) if (structure.tokens[i + 1]?.text === ':') add({ start: i, end: i + 1 });
      }
    }
  }
  return names;
}

function unsafeReferences(bundle: AppBundle, map: Map<string, string>, files: RenameFile[]) {
  const problems: string[] = [];
  const warnings: Array<{ file: string; line: number; identifier: string; reason: string }> = [];
  const names = new Map<string, number>();
  for (const node of formulaNodes(bundle).filter(node => node.type !== '__App')) names.set(node.name.toLowerCase(), (names.get(node.name.toLowerCase()) ?? 0) + 1);
  const lines = new Map(files.map(file => [file.name, file.content.split('\n')]));
  const affected = new Set([...map.keys(), ...[...map.values()].map(n => n.toLowerCase())]);
  for (const owner of formulaNodes(bundle)) for (const property of owner.properties) {
    const structure = formulaStructure(property);
    if (!structure) {
      const parsed = tokenizeFormula(property.value);
      const relevant = parsed.tokens.some(t => t.kind === 'identifier' ? affected.has(t.text.toLowerCase())
        : t.kind === 'quoted-identifier' ? affected.has(t.text.slice(1, -1).replaceAll("''", "'").toLowerCase())
        : t.kind === 'string' && t.text.startsWith('$') && [...affected].some(n => t.text.toLowerCase().includes(n)));
      if (relevant) problems.push(`${owner.file}:${property.line}: incomplete formula reference cannot be rewritten safely.`);
      continue;
    }
    for (let i = 0; i < structure.tokens.length; i++) {
      const name = plainIdentifier(structure, { start: i, end: i + 1 });
      if (!name || !map.has(name.toLowerCase()) || ['.', '@'].includes(structure.tokens[i - 1]?.text) || [':', '('].includes(structure.tokens[i + 1]?.text) || structure.tokens[i - 1]?.text.toLowerCase() === 'as') continue;
      if (isUdfParameter(property, structure, i, name)) continue;
      if (!inBinding(structure, i, name)) continue;
      if (explicitLocal(structure, i, name)) continue;
      if (names.get(name.toLowerCase()) === 1) {
        const source = scalarSource(property, lines.get(owner.file)!);
        const line = (source?.points[structure.tokens[i].span.start]?.line ?? property.line - 1) + 1;
        warnings.push({ file: owner.file, line, identifier: name, reason: 'row field with the same name would shadow this control' });
      } else problems.push(`${owner.file}:${property.line}: ambiguous row scope reference ${name}.`);
    }
  }
  return { problems, warnings };
}

export function applyRenames(files: RenameFile[], catalog: AnalyzerCatalogData, renames: Record<string, string>) {
  if (!renames || typeof renames !== 'object' || Array.isArray(renames)) throw new RenameInputError(['renames must be an explicit object map.']);
  if (new Set(files.map(f => f.name)).size !== files.length) throw new RenameInputError(['Duplicate file names.']);
  const input = validateFiles(files, catalog);
  const inputBundle = renameBundle(files);
  const nodes = entities(files);
  const map = new Map<string, string>();
  const collisions: string[] = [];
  for (const [old, name] of Object.entries(renames)) {
    if (typeof name !== 'string' || !identifier.test(name)) { collisions.push(`${old}: invalid new identifier ${String(name)}.`); continue; }
    const matches = nodes.filter(n => n.name.toLowerCase() === old.toLowerCase());
    if (matches.length !== 1) collisions.push(`${old}: ${matches.length ? 'ambiguous' : 'unknown'} declaration.`);
    // Field test 2026-10-07: a screen rename pushed through compile_canvas left Studio grey and was lost on
    // reload, while control renames in a separate compile survived. Screens are renamed in Studio.
    if (matches.length === 1 && matches[0].type === 'Screen' && matches[0].name !== name) {
      collisions.push(`${old}: screen renames are not applied here; rename the screen in Studio (a screen rename through compile_canvas broke the Studio session and was lost).`);
    }
    if (map.has(old.toLowerCase())) collisions.push(`${old}: repeated case-insensitive map key.`);
    if (matches.length === 1 && matches[0].name === name) continue;
    map.set(old.toLowerCase(), name);
  }
  const known = occupiedSymbols(inputBundle, catalog);
  for (const [old, name] of map) {
    if (isKnownSymbol(known, name)) collisions.push(`${old} -> ${name}: variable, collection, data source, named formula, enum or function collision.`);
    if (isKnownSymbol(known, old)) collisions.push(`${old}: source also names a variable, source or reserved symbol.`);
    if (nodes.some(n => n.name.toLowerCase() !== old && (map.get(n.name.toLowerCase()) ?? n.name).toLowerCase() === name.toLowerCase())) collisions.push(`${old} -> ${name}: control, screen or component collision.`);
  }
  const unsafe = unsafeReferences(inputBundle, map, files);
  collisions.push(...unsafe.problems);
  if (collisions.length) throw new RenameInputError(collisions);
  const lines = new Map(files.map(f => [f.name, f.content.split('\n')]));
  const beforeRefs = references(inputBundle);
  const rewrites: Array<{ file: string; line: number; old: string; new: string }> = [];
  const possible_dynamic_references: Array<{ file: string; line: number; old: string; literal: string }> = [];
  const sources = new Map<ParsedProperty, ReturnType<typeof scalarSource>>();
  for (const ref of beforeRefs) if (!sources.has(ref.property)) sources.set(ref.property, scalarSource(ref.property, lines.get(ref.owner.file)!));
  for (const ref of [...beforeRefs].reverse()) {
    const name = map.get(ref.target.name.toLowerCase());
    if (!name) continue;
    const token = ref.property.value.slice(ref.start, ref.end);
    const replacement = token.startsWith("'") ? "'" + name + "'" : name;
    if (!replaceScalarSpan(lines.get(ref.owner.file)!, ref.property, ref.start, ref.end, replacement, sources.get(ref.property))) throw new RenameInputError([`${ref.owner.file}:${ref.property.line}: reference has no safe source span.`]);
    rewrites.push({ file: ref.owner.file, line: ref.property.line, old: token, new: replacement });
  }
  for (const owner of formulaNodes(inputBundle)) for (const property of owner.properties) {
    for (const token of tokenizeFormula(property.value).tokens) if (token.kind === 'string') {
      for (const old of Object.keys(renames)) if (token.text.toLowerCase().includes(old.toLowerCase())) possible_dynamic_references.push({ file: owner.file, line: property.line, old, literal: token.text });
    }
  }
  for (const node of nodes) {
    const name = map.get(node.name.toLowerCase());
    if (!name) continue;
    const source = lines.get(node.file)!;
    const match = source[node.line - 1].match(/^(\s*(?:-\s+)?)(?:'((?:[^']|'')*)'|"([^"]*)"|([^:]+))(:[^\n]*)$/u);
    if (!match) throw new RenameInputError([`${node.file}:${node.line}: declaration has no safe source span.`]);
    source[node.line - 1] = match[1] + (match[2] !== undefined ? "'" + name + "'" : match[3] !== undefined ? '"' + name + '"' : name) + match[5];
  }
  for (const node of controlNodes(input.bundle)) if (node.componentName) {
    const name = map.get(node.componentName.toLowerCase());
    if (!name) continue;
    const source = lines.get(node.file)!;
    for (let i = node.line; i < source.length; i++) {
      if (source[i].trim() && source[i].match(/^ */u)![0].length <= node.indent) break;
      const match = source[i].match(/^(\s*ComponentName:\s*)(['"]?)([^'"#\r]+?)\2(\s*(?:#.*)?\r?)$/u);
      if (match) { source[i] = match[1] + match[2] + name + match[2] + match[4]; break; }
    }
  }
  for (const file of files) if (/(?:^|[/\\])_EditorState\.pa\.yaml$/u.test(file.name)) {
    const source = lines.get(file.name)!;
    let active = false;
    for (let i = 0; i < source.length; i++) {
      if (/^\s*ScreensOrder:\s*$/u.test(source[i])) { active = true; continue; }
      if (!active) continue;
      const match = source[i].match(/^(\s*-\s+)(['"]?)([^'"\r\n]+?)\2(\s*(?:#.*)?\r?)$/u);
      if (!match) { if (source[i].trim()) active = false; continue; }
      const name = map.get(match[3].toLowerCase());
      if (name) source[i] = match[1] + match[2] + name + match[2] + match[4];
    }
  }
  const outputFiles = files.map(f => ({ name: f.name, content: lines.get(f.name)!.join('\n') }));
  const output = validateFiles(outputFiles, catalog);
  const renamed = (name: string) => map.get(name.toLowerCase()) ?? name;
  const shape = (bundle: AppBundle, convert: (s: string) => string) => JSON.stringify({
    screens: bundle.screens.map(s => [s.file, convert(s.name), s.roots.map(n => convert(n.name))]),
    nodes: controlNodes(bundle).map(n => [n.file, n.line, convert(n.name), n.type, n.componentName && convert(n.componentName), n.parent && convert(n.parent.name), n.children.map(c => convert(c.name))]),
  });
  const structure_preserved = shape(input.bundle, renamed) === shape(output.bundle, n => n);
  const afterRefs = references(renameBundle(outputFiles));
  const referenceIdentity = (ref: Reference) => JSON.stringify([ref.owner.file, ref.property.line, ref.index, ref.target.file, ref.target.line]);
  const surviving = new Set(afterRefs.map(referenceIdentity));
  const unresolved_references = beforeRefs.filter(ref => !surviving.has(referenceIdentity(ref)));
  const refusalIdentity = (issue: Issue, convert: (s: string) => string) => JSON.stringify([issue.file, issue.control && convert(issue.control), issue.property, issue.rule, issue.line]);
  const prior = new Map<string, number>();
  for (const issue of input.issues.filter(i => i.level === 'REFUSE')) { const key = refusalIdentity(issue, renamed); prior.set(key, (prior.get(key) ?? 0) + 1); }
  const new_refusals = output.issues.filter(i => i.level === 'REFUSE').filter(i => { const key = refusalIdentity(i, n => n), count = prior.get(key) ?? 0; prior.set(key, count - 1); return count < 1; });
  const self_check = { input: { gate_decision: input.gateDecision, summary: input.summary }, output: { gate_decision: output.gateDecision, summary: output.summary }, structure_preserved,
    new_refusals, unresolved_references: unresolved_references.map(r => ({ file: r.owner.file, line: r.property.line, target: r.target.name })),
    regression: !structure_preserved || new_refusals.length > 0 || unresolved_references.length > 0 };
  if (self_check.regression) throw new RenameInputError(['Rename self-check failed: ' + JSON.stringify(self_check)]);
  return { files: outputFiles, report: { renames, rewrites, warnings: unsafe.warnings, possible_dynamic_references, self_check,
    summary: { renamed: map.size, reference_rewrites: rewrites.length, possible_dynamic_references: possible_dynamic_references.length } } };
}

export type RenameReport = ReturnType<typeof applyRenames>['report'];
export function renameSummary(report: RenameReport): string {
  return `Rename: ${report.summary.renamed} renamed, ${report.summary.reference_rewrites} reference rewrites, ${report.summary.possible_dynamic_references} possible dynamic references; gate ${report.self_check.output.gate_decision}.`;
}
export function renderRenameReport(report: RenameReport): string {
  return ['# Rename report', '', renameSummary(report), '', 'Local self-check only. Compile the complete output only on the owner\'s word, then sync, compare order and types, and reload Studio (never resume).', '', '```json', JSON.stringify(report, null, 2), '```', ''].join('\n');
}
export function renderRenameProposals(result: ReturnType<typeof proposeNames>): string {
  return [`Rename proposals: ${result.summary.generic_names} generic names, ${result.summary.proposals} proposals, ${result.summary.no_meaning} without meaning.`, result.convention.reason,
    result.prefix_suggestion.reason, ...result.proposals.map(p => `${p.old} -> ${p.new} (${p.confidence})${p.apply_in === 'studio' ? ' [rename this screen in Studio]' : ''}: ${p.evidence.map(e => e.source + '=' + JSON.stringify(e.value)).join('; ')}`),
    ...result.no_meaning.map(p => `${p.control}: ${p.reason}`), ...result.folds.map(f => `ASCII fold ${f.old}: ${f.before} -> ${f.after}`), ''].join('\n');
}
