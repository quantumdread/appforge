/**
 * Dependency-free Power Fx tokenizer and structural call index.
 *
 * This is deliberately NOT an AST: it does not model precedence, expressions,
 * types, or evaluation. It only records lexical tokens, balanced nesting, calls,
 * and top-level behavior statements using half-open UTF-16 source spans.
 *
 * Locale assumption (v2.4.5 P2): `;` is a statement separator and `,` is an
 * argument separator. The pending tenant-locale check may require a mode later;
 * this shadow implementation intentionally has no locale mode yet.
 *
 * Interpolated strings (`$"..."`) are recognized as opaque string tokens but
 * deliberately set `parseConfidence` to `partial`: interpolation-hole
 * tokenization is future work, so structural facts inside those holes are not
 * exposed as if the parse were complete.
 *
 * Shadow-mode safety contract: consumers MUST ignore structural facts when
 * `parseConfidence` is `partial`. No production verdict consumes this module in
 * v2.4.5.
 */

export type FormulaSpan = {
  start: number;
  end: number;
};

export type FormulaTokenKind =
  | 'identifier'
  | 'quoted-identifier'
  | 'string'
  | 'number'
  | 'operator'
  | 'comment'
  | 'delimiter'
  | 'separator'
  | 'unknown';

export type FormulaToken = {
  kind: FormulaTokenKind;
  text: string;
  span: FormulaSpan;
};

export type FormulaCall = {
  fn: string;
  /** Text between the call's parentheses, excluding `(` and `)`. */
  argSpan: FormulaSpan;
  /** Index of the nearest lexically enclosing call, or null at call depth zero. */
  parentCallIndex: number | null;
  /** Number of enclosing calls. Non-call delimiters do not increase call depth. */
  depth: number;
};

export type TopLevelStatement = {
  span: FormulaSpan;
};

export type FormulaTokenization = {
  tokens: FormulaToken[];
  calls: FormulaCall[];
  topLevelStatements: TopLevelStatement[];
  parseConfidence: 'complete' | 'partial';
  /** Specific lexical failures, independent of unsupported/opaque syntax. */
  unterminatedString?: true;
  unbalancedDelimiters?: true;
};

type DelimiterFrame = {
  open: '(' | '[' | '{';
  callIndex: number | null;
};

const IDENTIFIER_START = /^[\p{L}_]$/u;
const IDENTIFIER_CONTINUE = /^[\p{L}\p{M}\p{N}_]$/u;
const NUMBER = /^(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:[eE][+-]?\d+)?/u;
const MULTI_CHAR_OPERATORS = ['&&', '||', '<=', '>=', '<>', '!=', '==', ':=', '=>', '..'] as const;
const SINGLE_CHAR_OPERATORS = new Set('=+-*/^&%<>!.:@?$|\\');
const OPEN_DELIMITERS = new Set(['(', '[', '{']);
const CLOSE_DELIMITERS = new Set([')', ']', '}']);
const EXPECTED_OPEN: Record<string, DelimiterFrame['open']> = {
  ')': '(',
  ']': '[',
  '}': '{',
};

function codePointAt(text: string, index: number): string {
  const value = text.codePointAt(index);
  return value === undefined ? '' : String.fromCodePoint(value);
}

function quotedIdentifierValue(text: string): string {
  return text.slice(1, -1).replaceAll("''", "'");
}

function previousExecutableToken(tokens: FormulaToken[]): FormulaToken | null {
  for (let index = tokens.length - 1; index >= 0; index--) {
    if (tokens[index].kind !== 'comment') return tokens[index];
  }
  return null;
}

function enclosingCallIndex(stack: DelimiterFrame[]): number | null {
  for (let index = stack.length - 1; index >= 0; index--) {
    if (stack[index].callIndex !== null) return stack[index].callIndex;
  }
  return null;
}

function statementInSpan(
  tokens: FormulaToken[],
  start: number,
  end: number,
): TopLevelStatement | null {
  const executable = tokens.filter(token =>
    token.kind !== 'comment'
    && token.span.start >= start
    && token.span.end <= end);
  const meaningful = start === 0
    && executable[0]?.kind === 'operator'
    && executable[0].text === '='
    ? executable.slice(1)
    : executable;
  if (meaningful.length === 0) return null;
  return {
    span: {
      start: executable[0].span.start,
      end: executable[executable.length - 1].span.end,
    },
  };
}

/**
 * Find the end of an interpolated string without tokenizing its holes. Tracking
 * braces is only boundary detection: the whole construct remains one opaque
 * token and always downgrades confidence to partial.
 */
function interpolatedStringEnd(formula: string, start: number): { end: number; closed: boolean } {
  let index = start + 2;
  let holeDepth = 0;
  while (index < formula.length) {
    const char = formula[index];
    if (holeDepth === 0) {
      if (char === '"') {
        if (formula[index + 1] === '"') { index += 2; continue; }
        return { end: index + 1, closed: true };
      }
      if (char === '{') holeDepth = 1;
      index += codePointAt(formula, index).length;
      continue;
    }

    if (char === '"' || char === "'") {
      const quote = char;
      index++;
      while (index < formula.length) {
        if (formula[index] !== quote) {
          index += codePointAt(formula, index).length;
          continue;
        }
        if (formula[index + 1] === quote) { index += 2; continue; }
        index++;
        break;
      }
      continue;
    }
    if (char === '{') holeDepth++;
    else if (char === '}') holeDepth--;
    index += codePointAt(formula, index).length;
  }
  return { end: formula.length, closed: false };
}

/** Tokenize one Power Fx formula without attempting to parse an expression tree. */
export function tokenizeFormula(formula: string): FormulaTokenization {
  const tokens: FormulaToken[] = [];
  const calls: FormulaCall[] = [];
  const stack: DelimiterFrame[] = [];
  const rawStatementSpans: FormulaSpan[] = [];
  let statementStart = 0;
  let partial = false;
  let unterminatedString = false;
  let unbalancedDelimiters = false;
  let index = 0;

  const pushToken = (kind: FormulaTokenKind, start: number, end: number): void => {
    tokens.push({ kind, text: formula.slice(start, end), span: { start, end } });
  };

  while (index < formula.length) {
    const point = codePointAt(formula, index);
    if (/^\s$/u.test(point)) {
      index += point.length;
      continue;
    }

    if (formula[index] === '/' && formula[index + 1] === '/') {
      const start = index;
      index += 2;
      while (index < formula.length && formula[index] !== '\n' && formula[index] !== '\r') index++;
      pushToken('comment', start, index);
      continue;
    }

    if (formula[index] === '/' && formula[index + 1] === '*') {
      const start = index;
      index += 2;
      while (index < formula.length && !(formula[index] === '*' && formula[index + 1] === '/')) index++;
      if (index >= formula.length) {
        partial = true;
        pushToken('comment', start, formula.length);
        break;
      }
      index += 2;
      pushToken('comment', start, index);
      continue;
    }

    if (formula[index] === '$' && formula[index + 1] === '"') {
      const start = index;
      const boundary = interpolatedStringEnd(formula, start);
      index = boundary.end;
      if (!boundary.closed) unterminatedString = true;
      partial = true;
      pushToken('string', start, index);
      continue;
    }

    if (formula[index] === '"') {
      const start = index++;
      let closed = false;
      while (index < formula.length) {
        if (formula[index] !== '"') {
          index += codePointAt(formula, index).length;
          continue;
        }
        if (formula[index + 1] === '"') {
          index += 2;
          continue;
        }
        index++;
        closed = true;
        break;
      }
      if (!closed) { partial = true; unterminatedString = true; }
      pushToken('string', start, index);
      continue;
    }

    if (formula[index] === "'") {
      const start = index++;
      let closed = false;
      while (index < formula.length) {
        if (formula[index] !== "'") {
          index += codePointAt(formula, index).length;
          continue;
        }
        if (formula[index + 1] === "'") {
          index += 2;
          continue;
        }
        index++;
        closed = true;
        break;
      }
      if (!closed) partial = true;
      pushToken('quoted-identifier', start, index);
      continue;
    }

    if (IDENTIFIER_START.test(point)) {
      const start = index;
      index += point.length;
      while (index < formula.length) {
        const next = codePointAt(formula, index);
        if (!IDENTIFIER_CONTINUE.test(next)) break;
        index += next.length;
      }
      pushToken('identifier', start, index);
      continue;
    }

    if (/^\d$/u.test(point) || (point === '.' && /^\d$/u.test(codePointAt(formula, index + 1)))) {
      const match = formula.slice(index).match(NUMBER);
      if (match) {
        const start = index;
        index += match[0].length;
        pushToken('number', start, index);
        continue;
      }
    }

    if (OPEN_DELIMITERS.has(point)) {
      const start = index;
      const previous = point === '(' ? previousExecutableToken(tokens) : null;
      const isCall = point === '('
        && previous !== null
        && (previous.kind === 'identifier' || previous.kind === 'quoted-identifier');
      let callIndex: number | null = null;
      if (isCall && previous) {
        const parentCallIndex = enclosingCallIndex(stack);
        callIndex = calls.length;
        calls.push({
          fn: previous.kind === 'quoted-identifier'
            ? quotedIdentifierValue(previous.text)
            : previous.text,
          argSpan: { start: start + 1, end: formula.length },
          parentCallIndex,
          depth: parentCallIndex === null ? 0 : calls[parentCallIndex].depth + 1,
        });
      }
      stack.push({ open: point as DelimiterFrame['open'], callIndex });
      index += point.length;
      pushToken('delimiter', start, index);
      continue;
    }

    if (CLOSE_DELIMITERS.has(point)) {
      const start = index;
      const frame = stack[stack.length - 1];
      if (!frame || frame.open !== EXPECTED_OPEN[point]) {
        partial = true;
        unbalancedDelimiters = true;
      } else {
        stack.pop();
        if (frame.callIndex !== null) calls[frame.callIndex].argSpan.end = start;
      }
      index += point.length;
      pushToken('delimiter', start, index);
      continue;
    }

    if (point === ';' || point === ',') {
      const start = index;
      index += point.length;
      pushToken('separator', start, index);
      if (point === ';' && stack.length === 0) {
        rawStatementSpans.push({ start: statementStart, end: start });
        statementStart = index;
      }
      continue;
    }

    const multiOperator = MULTI_CHAR_OPERATORS.find(operator => formula.startsWith(operator, index));
    if (multiOperator) {
      const start = index;
      index += multiOperator.length;
      pushToken('operator', start, index);
      continue;
    }

    if (SINGLE_CHAR_OPERATORS.has(point)) {
      const start = index;
      index += point.length;
      pushToken('operator', start, index);
      continue;
    }

    const start = index;
    index += point.length;
    pushToken('unknown', start, index);
    partial = true;
  }

  if (stack.length > 0) { partial = true; unbalancedDelimiters = true; }
  rawStatementSpans.push({ start: statementStart, end: formula.length });
  const topLevelStatements = rawStatementSpans
    .map(span => statementInSpan(tokens, span.start, span.end))
    .filter((statement): statement is TopLevelStatement => statement !== null);

  return {
    tokens,
    calls,
    topLevelStatements,
    parseConfidence: partial ? 'partial' : 'complete',
    ...(unterminatedString ? { unterminatedString: true as const } : {}),
    ...(unbalancedDelimiters ? { unbalancedDelimiters: true as const } : {}),
  };
}
