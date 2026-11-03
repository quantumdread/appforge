/** Conservative name/scope exclusions shared by the new structural WARN rules. */
import { controlNodes, type AppBundle, type ControlNode } from './model.js';
import { inspectFormulaStructure, plainIdentifier, type FormulaStructure, type TokenRange } from './formula-structure.js';

export function formulaNodes(bundle: AppBundle): ControlNode[] {
  return [
    ...controlNodes(bundle),
    ...bundle.screens.flatMap((screen): ControlNode[] => screen.properties === undefined ? [] : [{
      file: screen.file, line: screen.line ?? 1, indent: 2, name: screen.name, type: 'Screen',
      authoredTypePinned: false, authoredTypeVersion: null, variant: null, componentName: null,
      parent: null, children: [], screen, properties: screen.properties,
    }]),
  ];
}

const ROW_SCOPE_CALLS = new Set([
  'filter', 'lookup', 'sort', 'removeif', 'addcolumns',
  'average', 'max', 'min', 'stdevp', 'sum', 'varp', 'distinct', 'concat', 'countif', 'updateif',
]);
const RESERVED_LOCAL_SYMBOLS = new Set(['parent', 'self', 'thisitem', 'thisrecord']);

/** Pass the whole inspected call range so it is not treated as its own enclosing scope. */
export function isInEnclosingBinding(structure: FormulaStructure, range: TokenRange, name?: string): boolean {
  if (name !== undefined) {
    const canonical = name.toLowerCase();
    for (const call of structure.calls) {
      if (!call.unqualified || !call.arguments.slice(1).some(argument =>
        argument.start <= range.start && argument.end >= range.end)) continue;
      if (call.name === 'with') {
        const record = call.arguments[0];
        // An opaque record can introduce any name: retain the conservative skip.
        if (!record || structure.tokens[record.start]?.text !== '{') return true;
        if (literalRecordKeys(structure, record).some(key => key.toLowerCase() === canonical)) return true;
      } else if (call.name === 'forall' || ROW_SCOPE_CALLS.has(call.name)) {
        // Implicit row fields require datasource types to resolve reliably.
        return true;
      }
    }
    // As aliases apply inside their enclosing call, not across the whole statement.
    for (const call of structure.calls) {
      if (!(call.nameIndex < range.start && call.endIndex >= range.end)) continue;
      for (const argument of call.arguments) for (let index = argument.start; index < argument.end - 1; index++) {
        if (structure.tokens[index].kind === 'identifier' && structure.tokens[index].text.toLowerCase() === 'as'
          && plainIdentifier(structure, { start: index + 1, end: index + 2 })?.toLowerCase() === canonical) return true;
      }
    }
    return false;
  }
  if (structure.calls.some(call => call.unqualified && (call.name === 'with' || call.name === 'forall')
    && call.nameIndex < range.start && call.endIndex >= range.end)) return true;
  if (structure.calls.some(call => call.unqualified && ROW_SCOPE_CALLS.has(call.name)
    && call.arguments.slice(1).some(argument => argument.start <= range.start && argument.end >= range.end))) return true;
  const statement = structure.statements.find(row => row.range.start <= range.start && row.range.end >= range.end);
  return statement !== undefined && structure.tokens.some((token, index) =>
    index >= statement.range.start && index < statement.range.end
    && (index < range.start || index >= range.end)
    && token.kind === 'identifier' && token.text.toLowerCase() === 'as');
}

function literalRecordKeys(structure: FormulaStructure, range: TokenRange | undefined): string[] {
  if (!range || structure.tokens[range.start]?.text !== '{' || structure.tokens[range.end - 1]?.text !== '}') return [];
  const names: string[] = [];
  let depth = 0;
  let fieldStart = range.start + 1;
  for (let index = fieldStart; index < range.end; index++) {
    const token = structure.tokens[index];
    if ((index === range.end - 1 || token.text === ',') && depth === 0) {
      if (fieldStart === index && names.length === 0) return [];
      const name = plainIdentifier(structure, { start: fieldStart, end: fieldStart + 1 });
      if (name === null || structure.tokens[fieldStart + 1]?.text !== ':' || fieldStart + 2 >= index) return [];
      names.push(name);
      fieldStart = index + 1;
    } else if (token.kind === 'delimiter') {
      if ('([{'.includes(token.text)) depth++;
      else {
        if (depth === 0) return []; // The literal record ended before the whole argument did.
        depth--;
      }
    }
  }
  return names;
}

/** Lowercase names permit conservative Power Fx symbol collision checks without changing exact datasource maps. */
export function collectKnownSymbols(bundle: AppBundle): ReadonlySet<string> {
  const names = new Set<string>();
  for (const node of formulaNodes(bundle)) {
    for (const name of node.appFormulaNames ?? []) names.add(name.toLowerCase());
    for (const property of node.properties) {
      const structure = inspectFormulaStructure(property.value);
      if (!structure?.isFormula) continue;
      for (const call of structure.calls) {
        if (!call.unqualified) continue;
        if (call.name === 'set' || call.name === 'clear' || call.name === 'clearcollect') {
          const name = call.arguments[0] && plainIdentifier(structure, call.arguments[0]);
          if (name) names.add(name.toLowerCase());
        } else if (call.name === 'updatecontext' || call.name === 'navigate') {
          for (const name of literalRecordKeys(structure, call.arguments[call.name === 'navigate' ? 2 : 0])) {
            names.add(name.toLowerCase());
          }
        }
      }
    }
  }
  return names;
}

export function isKnownSymbol(symbols: ReadonlySet<string>, name: string): boolean {
  const canonical = name.toLowerCase();
  return RESERVED_LOCAL_SYMBOLS.has(canonical) || symbols.has(canonical);
}
