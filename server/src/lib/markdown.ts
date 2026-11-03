/**
 * Markdown helpers.
 *
 * `extractSection(content, sectionTitle)` slices the content from a heading
 * whose text matches `sectionTitle` (case-insensitive, fuzzy) up to but
 * excluding the next heading at the same or shallower level. Returns null
 * if no matching heading is found.
 *
 * `listSections(content)` returns the ordered list of heading texts at each
 * level so the caller can show available sections in error messages.
 */
export function listSections(content: string): Array<{ level: number; title: string }> {
  const out: Array<{ level: number; title: string }> = [];
  for (const ln of content.split('\n')) {
    const m = ln.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (m) out.push({ level: m[1].length, title: m[2] });
  }
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

export function extractSection(content: string, sectionTitle: string): string | null {
  const target = norm(sectionTitle);
  const lines = content.split('\n');

  let startIdx = -1;
  let startLevel = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s+(.+?)\s*$/);
    if (!m) continue;
    if (norm(m[2]).includes(target)) {
      startIdx = i;
      startLevel = m[1].length;
      break;
    }
  }
  if (startIdx === -1) return null;

  let endIdx = lines.length;
  for (let j = startIdx + 1; j < lines.length; j++) {
    const m = lines[j].match(/^(#{1,6})\s+/);
    if (m && m[1].length <= startLevel) {
      endIdx = j;
      break;
    }
  }

  return lines.slice(startIdx, endIdx).join('\n').trim();
}

/**
 * Search a document for case-insensitive matches of `needle`. Returns
 * matching paragraphs (separated by blank lines) for context.
 */
export function searchParagraphs(content: string, needle: string, maxResults: number = 5): string[] {
  const q = needle.toLowerCase();
  const paragraphs = content.split(/\n\s*\n/);
  const matches: string[] = [];
  for (const p of paragraphs) {
    if (p.toLowerCase().includes(q)) {
      matches.push(p.trim());
      if (matches.length >= maxResults) break;
    }
  }
  return matches;
}
