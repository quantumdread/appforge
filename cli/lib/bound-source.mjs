// Pure helpers live here because validate.mjs keeps its CLI shebang and cannot pass through Vite's pipeline.

/** Conservative datasource identifier extraction, mirrored by server/src/lib/lint.ts. */
// Keep in lockstep with server/src/lib/lint.ts until the analyzer-core collapse in
// v2.4.5.
export const KNOWN_VARIABLE_PREFIXES = Object.freeze(['col', 'var', 'gbl', 'loc']);
const KNOWN_VARIABLE_PREFIX = new RegExp(`^(?:${KNOWN_VARIABLE_PREFIXES.join('|')})(?:[A-Z0-9_]|$)`);

export function extractBoundSource(value) {
  let expression = value.trim();
  if (expression.startsWith('=')) expression = expression.slice(1).trimStart();

  const wrapper = /^(?:SortByColumns|ShowColumns|AddColumns|LookUp|Filter|Search|FirstN|LastN|Sort|First|Last)\s*\(\s*/u;
  while (wrapper.test(expression)) expression = expression.replace(wrapper, '');

  const match = expression.match(/^'([\p{L}_][\p{L}\p{N}_ .-]*)'/u)
    ?? expression.match(/^([\p{L}_][\p{L}\p{N}_]*)/u);
  if (!match) return null;

  const name = match[1];
  const rawRemainder = expression.slice(match[0].length);
  if (/^[\p{L}\p{N}]/u.test(rawRemainder)) return null;

  const remainder = rawRemainder.trimStart();
  if (remainder.startsWith('.') || remainder.startsWith('(') || KNOWN_VARIABLE_PREFIX.test(name)) return null;
  return name;
}
