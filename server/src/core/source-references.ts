/** Finding-independent, bounded lexical source candidates for survey inventories. */
import { controlNodes, type AppBundle } from './model.js';
import { inspectFormulaStructure, plainIdentifier, type FormulaCall, type FormulaStructure } from './formula-structure.js';
import {
  resolveDatasourceReference,
  type DatasourceMap,
  type DatasourceReference,
  type DatasourceType,
} from './datasource.js';

type SourceReferenceOptions = {
  datasources?: DatasourceMap;
  exportMetadata?: Readonly<Record<string, DatasourceType>>;
};

const SOURCE_CALLS = new Set([
  'filter', 'search', 'lookup', 'sort', 'sortbycolumns', 'first', 'firstn', 'last', 'lastn',
  'patch', 'collect', 'clearcollect', 'remove', 'removeif', 'showcolumns', 'addcolumns',
]);
const ROW_SCOPE_CALLS = new Set(['filter', 'lookup', 'sort', 'removeif', 'addcolumns']);

function firstArgumentName(
  call: FormulaCall,
  structure: FormulaStructure,
  byNameIndex: ReadonlyMap<number, FormulaCall>,
): string | null {
  // A wrapper chain is followed iteratively so authored nesting cannot grow our call stack.
  let current = call;
  while (true) {
    const argument = current.arguments[0];
    if (!argument) return null;
    const { start, end } = argument;
    const name = plainIdentifier(structure, argument);
    if (name !== null) return name;
    const wrapper = byNameIndex.get(start);
    if (!wrapper?.unqualified || !SOURCE_CALLS.has(wrapper.name) || wrapper.endIndex !== end - 1) {
      return null;
    }
    current = wrapper;
  }
}

function isInRowExpression(call: FormulaCall, calls: readonly FormulaCall[]): boolean {
  let parentIndex = call.parentCallIndex;
  while (parentIndex !== null) {
    const parent = calls[parentIndex];
    if (parent.unqualified && ROW_SCOPE_CALLS.has(parent.name)
      && call.nameIndex > (parent.arguments[0]?.end ?? parent.endIndex)) return true;
    parentIndex = parent.parentCallIndex;
  }
  return false;
}

/** Unsupported or partial expressions yield no name, not proof that no source exists. */
export function collectDatasourceReferences(
  bundle: AppBundle,
  options: SourceReferenceOptions = {},
): DatasourceReference[] {
  const names = new Set<string>();
  for (const node of controlNodes(bundle)) {
    for (const property of node.properties) {
      const structure = inspectFormulaStructure(property.value);
      if (!structure) continue;
      const { calls, tokens, statements } = structure;
      const scopePositions = [
        ...tokens.flatMap((token, index) => token.kind === 'identifier' && token.text.toLowerCase() === 'as' ? [index] : []),
        ...calls.filter(call => call.unqualified && (call.name === 'with' || call.name === 'forall'))
          .map(call => call.nameIndex),
      ];
      const scopedStatements = statements.filter(statement => scopePositions.some(position =>
        position >= statement.range.start && position < statement.range.end));
      if (scopedStatements.length === 0 && (property.name === 'Items' || property.name === 'DataSource')) {
        const name = plainIdentifier(structure, { start: tokens[0]?.text === '=' ? 1 : 0, end: tokens.length });
        if (name !== null) names.add(name);
      }
      // YAML quoting is already decoded by the walker. Formula-shaped Text
      // literals are not executable calls merely because they tokenize cleanly.
      if (!structure.isFormula) continue;
      const byNameIndex = new Map(calls.map(call => [call.nameIndex, call]));
      for (const call of calls) {
        if (!call.unqualified || !SOURCE_CALLS.has(call.name)) continue;
        const position = call.nameIndex;
        if (scopedStatements.some(statement => position >= statement.range.start && position < statement.range.end)
          || isInRowExpression(call, calls)) continue;
        const name = firstArgumentName(call, structure, byNameIndex);
        if (name !== null) names.add(name);
      }
    }
  }
  return [...names].sort().map(name => resolveDatasourceReference(name, options));
}
