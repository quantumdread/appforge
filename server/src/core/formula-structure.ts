/** Complete lexical structure over original Power Fx text; no expression or evaluation model. */
import { tokenizeFormula, type FormulaToken } from './tokenizer.js';

export type TokenRange = { start: number; end: number };
export type FormulaCall = {
  name: string;
  nameIndex: number;
  endIndex: number;
  arguments: TokenRange[];
  parentCallIndex: number | null;
  unqualified: boolean;
};
export type FormulaStructure = {
  tokens: FormulaToken[];
  calls: FormulaCall[];
  statements: Array<{ range: TokenRange; directCallIndex: number | null }>;
  isFormula: boolean;
};

export function inspectFormulaStructure(value: string, allowBehaviorChains = false): FormulaStructure | null {
  const parsed = tokenizeFormula(value);
  if (parsed.parseConfidence !== 'complete') return null;
  const tokens = parsed.tokens.filter(token => token.kind !== 'comment');
  const byStart = new Map(tokens.map((token, index) => [token.span.start, index]));
  const byEnd = new Map(tokens.map((token, index) => [token.span.end, index + 1]));
  const calls: FormulaCall[] = parsed.calls.map(call => {
    const nameIndex = byStart.get(call.argSpan.start - 1)! - 1;
    return {
      name: call.fn.toLowerCase(), nameIndex,
      endIndex: byStart.get(call.argSpan.end)!, arguments: [],
      parentCallIndex: call.parentCallIndex,
      unqualified: tokens[nameIndex].kind === 'identifier' && tokens[nameIndex - 1]?.text !== '.',
    };
  });
  const byOpen = new Map(calls.map(call => [call.nameIndex + 1, call]));
  const stack: Array<{ call: FormulaCall | undefined; argumentStart: number }> = [];
  let callDepth = 0;
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.kind === 'delimiter') {
      if ('([{'.includes(token.text)) {
        const call = byOpen.get(index);
        stack.push({ call, argumentStart: index + 1 });
        if (call) callDepth++;
      } else {
        const frame = stack.pop()!;
        if (frame.call) {
          callDepth--;
          if (frame.argumentStart < index || frame.call.arguments.length > 0) {
            frame.call.arguments.push({ start: frame.argumentStart, end: index });
          }
        }
      }
    } else if (token.text === ',') {
      const frame = stack[stack.length - 1];
      if (frame?.call) {
        frame.call.arguments.push({ start: frame.argumentStart, end: index });
        frame.argumentStart = index + 1;
      }
    } else if (!allowBehaviorChains && token.text === ';' && (callDepth > 0 || tokens[index - 1]?.text === ';')) {
      return null;
    }
  }
  const byName = new Map(calls.map((call, index) => [call.nameIndex, index]));
  const statements: FormulaStructure['statements'] = [];
  for (const statement of parsed.topLevelStatements) {
    let start = byStart.get(statement.span.start)!;
    const end = byEnd.get(statement.span.end)!;
    if (start === 0 && tokens[start]?.text === '=') start++;
    if (start === end) continue;
    const callIndex = byName.get(start);
    const directCallIndex = callIndex !== undefined && calls[callIndex].endIndex === end - 1
      ? callIndex : null;
    statements.push({ range: { start, end }, directCallIndex });
  }
  return { tokens, calls, statements, isFormula: value.trimStart().startsWith('=') };
}

/** A whole plain/quoted name, never the head of a dotted or compound expression. */
export function plainIdentifier(structure: FormulaStructure, range: TokenRange): string | null {
  if (range.end - range.start !== 1) return null;
  const token = structure.tokens[range.start];
  if (token.kind === 'quoted-identifier') return token.text.slice(1, -1).replaceAll("''", "'");
  if (token.kind !== 'identifier' || /^(?:true|false|Blank)$/iu.test(token.text)) return null;
  return token.text;
}
