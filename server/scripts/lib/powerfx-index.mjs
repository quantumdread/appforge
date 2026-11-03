import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Prefer explicit source sections/footers; use only the first inline link otherwise. */
export function extractLearnSources(content) {
  const urls = text => [...text.matchAll(/https?:\/\/learn\.microsoft\.com\/[^\s<>"\])]+/gi)]
    .map(match => match[0].replace(/[.,;:]+$/, ''));
  const sections = [];
  let active = false;
  let depth = 0;
  let fenced = false;
  for (const line of content.split(/\r?\n/)) {
    if (/^\s*(`{3,}|~{3,})/.test(line)) { fenced = !fenced; continue; }
    if (fenced) continue;
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if (heading) {
      if (active && heading[1].length <= depth) active = false;
      if (/^(?:Sources?|References)\b/i.test(heading[2])) {
        active = true;
        depth = heading[1].length;
      }
    } else if (/^\s*(?:\*\*)?(?:Sources?(?: URLs?)?|References)(?:\*\*)?\s*:(?:\*\*)?/i.test(line)) {
      active = true;
      depth = 6;
    }
    if (active) sections.push(line);
  }
  const preferred = urls(sections.join('\n'));
  return [...new Set(preferred.length ? preferred : urls(content).slice(0, 1))];
}

export const FN_IDENTIFIER = /^[A-Z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*)?$/;
const FN_TYPE_SUFFIX = /\s+(Functions?|Operators?|Statement|Keywords?|Signals?)$/i;
const META_HEADING = /^(Best Practices?|Common Pitfalls?|Examples?|Rules?|Notes?|Performance|Summary|Overview|Sources?|Syntax|Parameters?|Return Types?|Return Values?|Troubleshooting|Comparisons?|Delegation|Related|Prerequisites|Behaviou?r|Limitations?|Limits|Combining|Alternatives|Disambiguation|Glossary|Chaining|Description|Arithmetic|Logical|Structural|Membership|String|Setup Instructions?|Table of Contents|Function Overview|UTC)$/i;

function stripTypeSuffix(s) {
  let prev, out = s.trim();
  do { prev = out; out = out.replace(FN_TYPE_SUFFIX, '').trim(); } while (out !== prev);
  return out;
}

// Zero or more function names from one heading. [] for section/prose headings.
function namesFromHeading(heading) {
  let s = heading.trim();
  s = s.replace(/\s*\(.*$/, '').trim();          // drop trailing "(qualifier…)"
  s = s.split(/\s+[-–—]\s+/)[0].trim();          // keep text before " - description"
  const parts = s.split(/\s*,\s*|\s+and\s+|\s+&\s+/i).map(stripTypeSuffix).filter(Boolean);
  if (!parts.length) return [];
  if (parts.every(p => FN_IDENTIFIER.test(p) && !META_HEADING.test(p))) return parts;
  return [];
}

function namesFromH1(h1) {
  // Drop a leading grouping label, e.g. "Variable Functions: Set and UpdateContext".
  const s = h1.replace(/^.*?\b(?:Functions?|Operators?)\s*:\s*/i, '');
  return namesFromHeading(s);
}

// Parse a file into flat { name, content } pairs (H2 sections, else H1 fallback).
export function extractFunctions(content) {
  const lines = content.split('\n');
  let h1 = null;
  const sections = [];   // { names, start }
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    if (h1 === null) {
      const hm = lines[i].match(/^#\s+(.+?)\s*$/);   // first true H1 (# ), not ##
      if (hm) h1 = hm[1];
    }
    const m = lines[i].match(/^##\s+(.+?)\s*$/);
    if (m) {
      if (cur) sections.push({ names: cur.names, content: lines.slice(cur.start, i).join('\n').trim() });
      const names = namesFromHeading(m[1]);
      cur = names.length ? { names, start: i } : null;
    }
  }
  if (cur) sections.push({ names: cur.names, content: lines.slice(cur.start).join('\n').trim() });

  if (sections.length) return sections.flatMap(s => s.names.map(name => ({ name, content: s.content })));
  // H1 fallback: no usable H2 headings — index the whole file under H1 name(s).
  if (h1) { const whole = content.trim(); return namesFromH1(h1).map(name => ({ name, content: whole })); }
  return [];
}

export function buildPowerFxIndex(root, skipDirs = new Set(['best-practices']), skipFiles = new Set(['INDEX.md', 'MASTER-FUNCTION-LIST.md', 'VERIFICATION-REPORT.md'])) {
  const functions = {};   // name → { name, category, source_file, content }
  const categories = {};  // category → [name, ...]
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const cat = entry.name;
    if (skipDirs.has(cat)) continue;
    for (const f of readdirSync(join(root, cat))) {
      if (!f.endsWith('.md') || skipFiles.has(f)) continue;
      const filePath = `${cat}/${f}`;
      const content = readFileSync(join(root, cat, f), 'utf8');
      const sources = extractLearnSources(content);
      for (const fn of extractFunctions(content)) {
        // Disambiguate if same name appears in multiple files — append category
        const key = functions[fn.name] ? `${fn.name} (${cat})` : fn.name;
        functions[key] = { name: fn.name, category: cat, source_file: filePath, content: fn.content, ...(sources.length ? { sources } : {}) };
        (categories[cat] ||= []).push(key);
      }
    }
  }
  // Sort each category's function list
  for (const cat of Object.keys(categories)) categories[cat].sort();
  return { functions, categories };
}

