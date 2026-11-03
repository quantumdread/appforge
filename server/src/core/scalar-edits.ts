import type { ParsedProperty } from './model.js';

/** Locate a parsed scalar back in its original line(s), without serializing it.
 * Offsets follow the existing walker's decoded/trimmed formula representation. */
export function scalarSource(property: ParsedProperty, lines: string[]) {
  const points: Array<{ line: number; start: number; end: number }> = [];
  let value = '', quote = '';
  const add = (text: string, line: number, start: number) => {
    for (let i = 0; i < text.length; i++) { value += text[i]; points.push({ line, start: start + i, end: start + i + 1 }); }
  };
  const index = property.line - 1;
  if (property.isBlockScalar) {
    const indent = lines[index].match(/^ */u)![0].length;
    for (let i = index + 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      if (line.match(/^ */u)![0].length <= indent) break;
      if (value) { value += '\n'; points.push({ line: i, start: 0, end: 0 }); }
      add(line.trim(), i, line.length - line.trimStart().length);
    }
  } else {
    const line = lines[index];
    const prefix = line.match(/^\s*\w+:\s*/u)![0].length;
    if (!property.wasQuoted) add(property.value, index, prefix);
    else {
      quote = line[prefix];
      let i = prefix + 1;
      while (i < line.length) {
        const start = i;
        let ch = line[i++];
        if (ch === quote) {
          if (quote === "'" && line[i] === "'") i++;
          else break;
        } else if (quote === '"' && ch === '\\' && line[i] === '"') { ch = '"'; i++; }
        value += ch; points.push({ line: index, start, end: i });
      }
    }
  }
  return value === property.value ? { points, quote } : null;
}
export function replaceScalarSpan(lines: string[], property: ParsedProperty, start: number, end: number, replacement: string, source = scalarSource(property, lines)): boolean {
  const first = source?.points[start], last = source?.points[end - 1];
  if (!source || !first || !last || first.line !== last.line) return false;
  const encoded = source.quote === "'" ? replacement.replaceAll("'", "''")
    : source.quote === '"' ? replacement.replaceAll('"', '\\"') : replacement;
  const line = lines[first.line];
  lines[first.line] = line.slice(0, first.start) + encoded + line.slice(last.end);
  return true;
}

