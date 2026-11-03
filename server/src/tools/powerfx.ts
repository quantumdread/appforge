/**
 * PowerFx tools — Phase 4.
 *
 *   get_powerfx_function(name)         — full doc for one function
 *   search_powerfx(query, category?)   — keyword search across docs
 *   list_powerfx_categories()          — categories with function counts
 */
import { POWERFX_FUNCTIONS, POWERFX_CATEGORIES } from '../generated/powerfx.js';

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };
const text = (s: string): ToolResult => ({ content: [{ type: 'text', text: s }] });
const json = (obj: unknown): ToolResult => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] });
const error = (msg: string): ToolResult => ({ content: [{ type: 'text', text: msg }], isError: true });

type FunctionEntry = { name: string; category: string; source_file: string; content: string; sources?: readonly string[] };
const FUNCTIONS = POWERFX_FUNCTIONS as Record<string, FunctionEntry>;
const CATEGORIES = POWERFX_CATEGORIES as Record<string, readonly string[]>;

function attributedContent(content: string, sources?: readonly string[]): string {
  if (!sources?.length) return content;
  return `${content.trimEnd()}\n\nAdapted from Microsoft Learn (CC BY 4.0, https://creativecommons.org/licenses/by/4.0/): ${[...new Set(sources)].join(', ')}. Changes were made.`;
}

// Case-insensitive name index — function-name → entry-key map
const NAME_INDEX = new Map<string, string>();
for (const key of Object.keys(FUNCTIONS)) {
  NAME_INDEX.set(FUNCTIONS[key].name.toLowerCase(), key);
  NAME_INDEX.set(key.toLowerCase(), key); // also match by disambiguated key
}

export const getPowerfxFunction = {
  name: 'get_powerfx_function',
  description:
    "Get full reference documentation for a PowerFx function: syntax, parameters, return type, rules, delegation-safety, examples. Source: powerfx/<category>/*.md. Case-insensitive name match.",
  inputSchema: {
    type: 'object' as const,
    properties: {
      function_name: {
        type: 'string',
        description: "PowerFx function name, e.g. 'Filter', 'Patch', 'If', 'Navigate', 'Set', 'Collect'.",
      },
    },
    required: ['function_name'],
  },
  handler: ({ function_name }: { function_name: string }): ToolResult => {
    const key = NAME_INDEX.get(function_name.toLowerCase());
    const fn = key ? FUNCTIONS[key] : null;
    if (!fn) return error(`PowerFx function '${function_name}' not found. Use list_powerfx_categories or search_powerfx to discover available functions.`);
    return text(attributedContent(`# ${fn.name}\n\n_Category: ${fn.category} · Source: powerfx/${fn.source_file}_\n\n${fn.content}`, fn.sources));
  },
};

export const searchPowerfx = {
  name: 'search_powerfx',
  description:
    "Keyword search across PowerFx function names, content (syntax/rules/examples), and categories. Returns matching functions with name, category, and a snippet of the matching context.",
  inputSchema: {
    type: 'object' as const,
    properties: {
      query: { type: 'string', description: "Search term, e.g. 'sort table', 'delegation', 'format date', 'guid'." },
      category: { type: 'string', description: "Optional category filter, e.g. 'tables', 'text', 'datetime', 'logical', 'math', 'navigation', 'variables', 'ai'." },
      limit: { type: 'number', description: "Max results. Default 10.", default: 10 },
    },
    required: ['query'],
  },
  handler: ({ query, category, limit }: { query: string; category?: string; limit?: number }): ToolResult => {
    if (!query) return error("query parameter is required.");
    const q = query.toLowerCase();
    const cap = Math.max(1, Math.min(50, Number(limit) || 10));
    // Collect ALL matches with a relevance rank, then sort before slicing to the
    // cap. Rank tiers: 0 exact name · 1 name starts-with · 2 name contains ·
    // 3 category · 4 content-only. Insertion order breaks ties within a tier
    // (Array.prototype.sort is stable), so a search for a function name surfaces
    // that function first instead of six incidental content hits.
    type Ranked = { name: string; category: string; source_file: string; match_in: string[]; snippet: string; rank: number };
    const matches: Ranked[] = [];
    for (const key of Object.keys(FUNCTIONS)) {
      const fn = FUNCTIONS[key];
      if (category && fn.category !== category) continue;
      const nameL = fn.name.toLowerCase();
      const inName = nameL.includes(q);
      const inCat = fn.category.toLowerCase().includes(q);
      const inContent = fn.content.toLowerCase().includes(q);
      if (!inName && !inCat && !inContent) continue;
      const matchIn: string[] = [];
      if (inName) matchIn.push('name');
      if (inCat) matchIn.push('category');
      if (inContent) matchIn.push('content');
      const rank = nameL === q ? 0 : nameL.startsWith(q) ? 1 : inName ? 2 : inCat ? 3 : 4;
      // Snippet: 80 chars around first content hit
      let snippet = '';
      if (inContent) {
        const idx = fn.content.toLowerCase().indexOf(q);
        const start = Math.max(0, idx - 40);
        const end = Math.min(fn.content.length, idx + q.length + 60);
        snippet = (start > 0 ? '…' : '') + fn.content.slice(start, end).replace(/\s+/g, ' ').trim() + (end < fn.content.length ? '…' : '');
      }
      if (snippet) snippet = attributedContent(snippet, fn.sources);
      matches.push({ name: fn.name, category: fn.category, source_file: fn.source_file, match_in: matchIn, snippet, rank });
    }
    matches.sort((a, b) => a.rank - b.rank);
    const top = matches.slice(0, cap).map(({ rank, ...m }) => m);
    return json({ query, category: category ?? null, returned: top.length, matches: top });
  },
};

export const listPowerfxCategories = {
  name: 'list_powerfx_categories',
  description: 'List PowerFx categories with function counts and the function names in each. Useful for discovery and for narrowing search_powerfx with the `category` filter.',
  inputSchema: { type: 'object' as const, properties: {} },
  handler: (): ToolResult => {
    const summary = Object.entries(CATEGORIES).map(([cat, fns]) => ({
      category: cat,
      count: fns.length,
      functions: fns.map(k => FUNCTIONS[k].name),
    })).sort((a, b) => a.category.localeCompare(b.category));
    return json({
      total_functions: Object.keys(FUNCTIONS).length,
      total_categories: Object.keys(CATEGORIES).length,
      categories: summary,
    });
  },
};

export const POWERFX_TOOLS = [getPowerfxFunction, searchPowerfx, listPowerfxCategories];
