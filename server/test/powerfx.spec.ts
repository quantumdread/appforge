import { describe, it, expect } from 'vitest';
import { getPowerfxFunction, searchPowerfx } from '../src/tools/powerfx';
import { POWERFX_FUNCTIONS } from '../src/generated/powerfx';

// Function-identifier shape: single token + optional one dotted segment.
const FN_IDENTIFIER = /^[A-Z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*)?$/;

describe('powerfx index - H1-named functions are captured', () => {
  for (const name of ['Patch', 'Set', 'ForAll']) {
    it(`get_powerfx_function('${name.toLowerCase()}') returns the ${name} doc, not an error`, () => {
      const r = getPowerfxFunction.handler({ function_name: name.toLowerCase() });
      expect(r.isError).toBeFalsy();
      const body = r.content[0].text;
      expect(body).toContain(name);
      expect(body).toContain('Syntax');
    });
  }
});

describe('powerfx search - ranked by name', () => {
  it("search 'patch' ranks the exact-name match Patch first", () => {
    const r = searchPowerfx.handler({ query: 'patch' });
    const body = JSON.parse(r.content[0].text);
    expect(body.matches.length).toBeGreaterThan(0);
    expect(body.matches[0].name).toBe('Patch');
  });

  it('keeps the response shape (name, category, source_file, match_in, snippet)', () => {
    const r = searchPowerfx.handler({ query: 'delegation' });
    const body = JSON.parse(r.content[0].text);
    expect(body.matches.length).toBeGreaterThan(0);
    for (const m of body.matches) {
      expect(Object.keys(m).sort()).toEqual(
        ['category', 'match_in', 'name', 'snippet', 'source_file'],
      );
    }
  });
});

describe('powerfx index - no junk section headings', () => {
  it('every indexed function name is a clean identifier (no spaces / prose)', () => {
    const bad = Object.values(POWERFX_FUNCTIONS)
      .map((f) => (f as { name: string }).name)
      .filter((n) => !FN_IDENTIFIER.test(n));
    expect(bad).toEqual([]);
  });
});
