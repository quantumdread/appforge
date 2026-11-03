/** Conservative instance/member resolution shared by lint and survey intake. */
import { controlNodes, type AppBundle, type ControlNode, type ParsedProperty } from './model.js';
import { inspectFormulaStructure, plainIdentifier } from './formula-structure.js';
import { collectKnownSymbols, formulaNodes, isKnownSymbol, isInEnclosingBinding } from './formula-bindings.js';

export type ResolvedControlReference = {
  control: ControlNode;
  property: ParsedProperty;
  target: ControlNode;
  name: string;
  member: string;
  /** Offsets into property.value, suitable for source-preserving edits. */
  memberSpan: { start: number; end: number };
  referenceSpan: { start: number; end: number };
};

/** Each occurrence is retained; consumers decide whether to deduplicate findings. */
export function* resolvedControlReferences(bundle: AppBundle, options: {includeSelf?: boolean} = {}): Generator<ResolvedControlReference> {
  const owners = new Map<string, ControlNode | null>();
  for (const node of controlNodes(bundle)) {
    const key = node.name.toLowerCase();
    owners.set(key, owners.has(key) ? null : node);
  }
  const symbols = collectKnownSymbols(bundle);
  for (const control of formulaNodes(bundle)) for (const property of control.properties) {
    const structure = inspectFormulaStructure(property.value, true);
    if (!structure?.isFormula) continue;
    for (let index = 0; index < structure.tokens.length - 2; index++) {
      if (structure.tokens[index - 1]?.text === '.') continue; // chain head only
      const name = plainIdentifier(structure, { start: index, end: index + 1 });
      const self = options.includeSelf && structure.tokens[index].kind === 'identifier' && name?.toLowerCase() === 'self';
      if (!name || structure.tokens[index + 1].text !== '.' || (!self && isKnownSymbol(symbols, name))
        || isInEnclosingBinding(structure, { start: index, end: index + 3 }, name)) continue;
      const member = plainIdentifier(structure, { start: index + 2, end: index + 3 });
      const target = self ? control : owners.get(name.toLowerCase());
      if (!member || !target?.type || target.componentName || target.type === 'CanvasComponent') continue;
      yield { control, property, target, name, member,
        memberSpan: structure.tokens[index + 2].span,
        referenceSpan: { start: structure.tokens[index].span.start, end: structure.tokens[index + 2].span.end },
      };
    }
  }
}
