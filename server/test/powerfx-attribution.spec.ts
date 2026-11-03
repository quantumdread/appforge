import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/generated/powerfx', () => ({
  POWERFX_FUNCTIONS: {
    Credited: { name: 'Credited', category: 'fixture', source_file: 'fixture/source.md',
      content: 'Syntax and fixture example.', sources: ['https://learn.microsoft.com/example/one', 'https://learn.microsoft.com/example/two'] },
    Uncredited: { name: 'Uncredited', category: 'fixture', source_file: 'fixture/local.md',
      content: 'Syntax and fixture example.' },
    Empty: { name: 'Empty', category: 'fixture', source_file: 'fixture/empty.md',
      content: 'Syntax and fixture example.', sources: [] },
  },
  POWERFX_CATEGORIES: { fixture: ['Credited', 'Uncredited', 'Empty'] },
}));

import { getPowerfxFunction, searchPowerfx } from '../src/tools/powerfx';

const credit = 'Adapted from Microsoft Learn (CC BY 4.0, https://creativecommons.org/licenses/by/4.0/): '
  + 'https://learn.microsoft.com/example/one, https://learn.microsoft.com/example/two. Changes were made.';

describe('served Power Fx attribution', () => {
  it('ends the full reference answer with exactly one credit line', () => {
    const text = getPowerfxFunction.handler({ function_name: 'Credited' }).content[0].text;
    expect(text.endsWith(credit)).toBe(true);
    expect(text.split('Adapted from Microsoft Learn')).toHaveLength(2);
    expect(getPowerfxFunction.handler({ function_name: 'Credited' }).content[0].text).toBe(text);
  });

  it('ends each snippet containing documentation with its credit exactly once', () => {
    const body = JSON.parse(searchPowerfx.handler({ query: 'fixture' }).content[0].text);
    const hit = body.matches.find((hit: any) => hit.name === 'Credited');
    expect(hit.snippet.endsWith(credit)).toBe(true);
    expect(hit.snippet.split('Adapted from Microsoft Learn')).toHaveLength(2);
    for (const hit of body.matches.filter((hit: any) => hit.name !== 'Credited')) {
      expect(hit.snippet).not.toContain('Adapted from Microsoft Learn');
    }
  });

  it.each(['Uncredited', 'Empty'])('does not invent a source for %s', function_name => {
    expect(getPowerfxFunction.handler({ function_name }).content[0].text).not.toContain('Adapted from Microsoft Learn');
  });

  it('does not attach a credit to a hit with no document snippet', () => {
    const hit = JSON.parse(searchPowerfx.handler({ query: 'Credited' }).content[0].text).matches[0];
    expect(hit.snippet).toBe('');
  });
});
