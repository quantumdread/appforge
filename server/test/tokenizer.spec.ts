import { describe, expect, it } from 'vitest';
import { tokenizeFormula } from '../src/core/tokenizer';

const statementText = (formula: string) => {
  const result = tokenizeFormula(formula);
  return result.topLevelStatements.map(statement => formula.slice(statement.span.start, statement.span.end));
};

describe('Power Fx tokenizer', () => {
  it('returns an empty, complete index for an empty formula', () => {
    expect(tokenizeFormula('')).toEqual({
      tokens: [],
      calls: [],
      topLevelStatements: [],
      parseConfidence: 'complete',
    });
    expect(tokenizeFormula('= // no expression').topLevelStatements).toEqual([]);
  });

  it('records Unicode identifiers, calls, argument spans, parents, and depths', () => {
    const formula = '=Filter(Anställda, LookUp(Avdelningar, Id = Anställda.Id))';
    const result = tokenizeFormula(formula);

    expect(result.parseConfidence).toBe('complete');
    expect(result.tokens.filter(token => token.kind === 'identifier').map(token => token.text))
      .toEqual(['Filter', 'Anställda', 'LookUp', 'Avdelningar', 'Id', 'Anställda', 'Id']);
    expect(result.calls).toEqual([
      {
        fn: 'Filter',
        argSpan: { start: formula.indexOf('(') + 1, end: formula.length - 1 },
        parentCallIndex: null,
        depth: 0,
      },
      {
        fn: 'LookUp',
        argSpan: {
          start: formula.indexOf('(', formula.indexOf('LookUp')) + 1,
          end: formula.indexOf(')', formula.indexOf('LookUp')),
        },
        parentCallIndex: 0,
        depth: 1,
      },
    ]);
    expect(statementText(formula)).toEqual([formula]);
  });

  it('keeps doubled double quotes inside one opaque string token', () => {
    const formula = '=Notify("He said ""Filter(Fake)""; still text"); Navigate(Home)';
    const result = tokenizeFormula(formula);

    expect(result.parseConfidence).toBe('complete');
    expect(result.calls.map(call => call.fn)).toEqual(['Notify', 'Navigate']);
    expect(result.tokens.filter(token => token.kind === 'string').map(token => token.text))
      .toEqual(['"He said ""Filter(Fake)""; still text"']);
    expect(statementText(formula)).toEqual([
      '=Notify("He said ""Filter(Fake)""; still text")',
      'Navigate(Home)',
    ]);
  });

  it.each([
    '=$"Hello {User().FullName}"',
    '=$"{ThisItem.TotalCompleted} Tasks | {Text(ThisItem.TotalCompleted/ThisItem.Total * 100,"##")}%"',
  ])('recognizes interpolated string syntax as one opaque partial token: %s', formula => {
    const result = tokenizeFormula(formula);

    expect(result.parseConfidence).toBe('partial');
    expect(result.tokens.filter(token => token.kind === 'string')).toEqual([
      { kind: 'string', text: formula.slice(1), span: { start: 1, end: formula.length } },
    ]);
    expect(result.calls).toEqual([]);
  });

  it('keeps doubled single quotes and function-shaped text opaque in quoted identifiers', () => {
    const formula = "=Filter('Måndag Vecka', 'Manager''s Choice' = 'First (Choice)')";
    const result = tokenizeFormula(formula);

    expect(result.parseConfidence).toBe('complete');
    expect(result.calls.map(call => call.fn)).toEqual(['Filter']);
    expect(result.tokens.filter(token => token.kind === 'quoted-identifier').map(token => token.text))
      .toEqual(["'Måndag Vecka'", "'Manager''s Choice'", "'First (Choice)'"]);
  });

  it('detects a quoted Unicode call name without scanning inside the identifier', () => {
    const formula = "='Måndag Vecka'('First (Choice)')";
    const result = tokenizeFormula(formula);

    expect(result.parseConfidence).toBe('complete');
    expect(result.calls).toEqual([{
      fn: 'Måndag Vecka',
      argSpan: { start: formula.indexOf('(') + 1, end: formula.length - 1 },
      parentCallIndex: null,
      depth: 0,
    }]);
  });

  it('ignores nested quote and call shapes inside line and block comments', () => {
    const formula = [
      '=Filter(Source, true) /* "unterminated-looking; Fake(" and \'quoted\' */;',
      '// "Fake(" and Nested(Call())',
      'Navigate(Home)',
    ].join('\n');
    const result = tokenizeFormula(formula);

    expect(result.parseConfidence).toBe('complete');
    expect(result.calls.map(call => call.fn)).toEqual(['Filter', 'Navigate']);
    expect(result.tokens.filter(token => token.kind === 'comment')).toHaveLength(2);
    expect(statementText(formula)).toEqual(['=Filter(Source, true)', 'Navigate(Home)']);
  });

  it('does not split semicolons inside nested calls, records, tables, strings, or comments', () => {
    const formula = '=If(ok, With({x: [1; 2]}, Notify("a;b"))); Set(done, true)';
    const result = tokenizeFormula(formula);

    expect(result.parseConfidence).toBe('complete');
    expect(statementText(formula)).toEqual([
      '=If(ok, With({x: [1; 2]}, Notify("a;b")))',
      'Set(done, true)',
    ]);
    expect(result.calls.map(call => ({ fn: call.fn, parent: call.parentCallIndex, depth: call.depth })))
      .toEqual([
        { fn: 'If', parent: null, depth: 0 },
        { fn: 'With', parent: 0, depth: 1 },
        { fn: 'Notify', parent: 1, depth: 2 },
        { fn: 'Set', parent: null, depth: 0 },
      ]);
  });

  it.each([
    ['unterminated double-quoted string', '=Notify("never closes)', 'string'],
    ['unterminated single-quoted identifier', "=Filter('Måndag Vecka, true)", 'quoted-identifier'],
    ['unterminated block comment', '=Set(x, 1) /* never closes', 'comment'],
  ])('marks %s partial', (_label, formula, finalKind) => {
    const result = tokenizeFormula(formula);
    expect(result.parseConfidence).toBe('partial');
    expect(result.tokens.at(-1)?.kind).toBe(finalKind);
  });

  it.each([
    '=If(ok, Notify("x")',
    '=If(ok, [1; 2})',
    '=Set(x, 1))',
  ])('marks unbalanced or mismatched delimiters partial: %s', formula => {
    expect(tokenizeFormula(formula).parseConfidence).toBe('partial');
  });

  it('marks unrecognized constructs partial and preserves them as unknown tokens', () => {
    const result = tokenizeFormula('=Set(x, 1)\u0000');
    expect(result.parseConfidence).toBe('partial');
    expect(result.tokens.at(-1)).toMatchObject({ kind: 'unknown', text: '\u0000' });
  });

  it('handles deep nesting without losing the parent chain', () => {
    const depth = 128;
    let formula = '=Leaf(Value)';
    for (let index = depth - 1; index >= 0; index--) formula = `=F${index}(${formula.slice(1)})`;
    const result = tokenizeFormula(formula);

    expect(result.parseConfidence).toBe('complete');
    expect(result.calls).toHaveLength(depth + 1);
    expect(result.calls[0]).toMatchObject({ fn: 'F0', parentCallIndex: null, depth: 0 });
    expect(result.calls.at(-1)).toMatchObject({ fn: 'Leaf', parentCallIndex: depth - 1, depth });
    for (let index = 1; index < result.calls.length; index++) {
      expect(result.calls[index].parentCallIndex).toBe(index - 1);
      expect(result.calls[index].depth).toBe(index);
    }
  });
});
