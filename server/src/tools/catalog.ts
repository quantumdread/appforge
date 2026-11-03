/**
 * Catalog tools — Phase 1 of the v2 MCP rewrite.
 *
 *   get_control_info   — merged view of one control (auto + augmentation + verification)
 *   list_controls      — filterable list of all 118 cataloged controls (112 extracted + 6 studio-dump)
 *   search_controls    — keyword search across name/properties/notes
 *   get_augmentation   — explicit augmentation surface (Gallery's verified additions, notes, etc.)
 *
 * Each tool returns content blocks following the MCP shape:
 *   { content: [{ type: 'text', text: '...' }], isError?: boolean }
 */
import {
  getMergedControl,
  listMergedControls,
  searchMergedControls,
  resolveEnum,
  type MergedControl,
} from '../lib/catalog.js';
import { AUGMENTATIONS } from '../generated/catalog.js';

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

const json = (obj: unknown): ToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }],
});

const error = (msg: string): ToolResult => ({
  content: [{ type: 'text', text: msg }],
  isError: true,
});

// ─── get_control_info ─────────────────────────────────────────────────────
export const getControlInfo = {
  name: 'get_control_info',
  description:
    'Get the merged catalog view for a single Power Apps control: auto-extracted properties (input, variant, output, parent-context), augmentation overlay (notes, legacy and runtime-observed variants, hand-curated additional input properties with verification status), and family / version.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      control_name: {
        type: 'string',
        description:
          "Control type as it appears in PA-YAML, e.g. 'Button', 'Classic/TextInput', 'Gallery', 'GroupContainer', 'ModernText'.",
      },
      include_enum_values: {
        type: 'boolean',
        description:
          'When true, expand @enum:X references in input_properties to their full value lists. Defaults false to keep the response compact.',
        default: false,
      },
    },
    required: ['control_name'],
  },
  handler: ({ control_name, include_enum_values }: { control_name: string; include_enum_values?: boolean }): ToolResult => {
    const merged = getMergedControl(control_name);
    if (!merged) return error(`Control type "${control_name}" not in catalog. Use list_controls to see what's available.`);
    if (!include_enum_values) return json(merged);

    // Expand enum refs
    const expand = (obj: Record<string, string>) =>
      Object.fromEntries(Object.entries(obj).map(([k, v]) => {
        const vals = typeof v === 'string' ? resolveEnum(v) : null;
        return [k, vals ? { type: 'Enum', enum: v.slice('@enum:'.length), values: vals } : v];
      }));

    const expanded: any = { ...merged };
    expanded.input_properties = expand(merged.input_properties);
    expanded.variant_input_properties = Object.fromEntries(
      Object.entries(merged.variant_input_properties).map(([v, p]) => [v, expand(p)])
    );
    return json(expanded);
  },
};

// ─── list_controls ────────────────────────────────────────────────────────
export const listControls = {
  name: 'list_controls',
  description:
    'List Power Apps controls in the catalog. Returns name, family, variants, and a one-line summary. Filterable by category. Controls advertised by list_controls but unreachable via describe_control (HTTP 500 from the document-server) are NOT in this list — see counts.controls_skipped on the catalog source for the forensic record.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      category: {
        type: 'string',
        enum: ['all', 'modern', 'classic', 'layout', 'input', 'display'],
        description: 'Filter set. Default: all (118 controls: 112 extracted + 6 studio-dump).',
        default: 'all',
      },
    },
  },
  handler: ({ category }: { category?: string }): ToolResult => {
    const cat = category ?? 'all';
    const list = listMergedControls(cat);
    const summary = list.map(c => ({
      type: c.type,
      family: c.family,
      variants: c.variants,
      input_property_count: Object.keys(c.input_properties).length,
      has_augmentation: c.notes.length > 0 || Object.keys(c.additional_input_properties).length > 0 || c.legacy_variants.length > 0 || c.current_variants.length > 0,
      ...(c.partial ? { source: c.source, partial: true } : {}),
    }));
    return json({ count: list.length, category: cat, controls: summary });
  },
};

// ─── search_controls ──────────────────────────────────────────────────────
export const searchControls = {
  name: 'search_controls',
  description:
    "Keyword search across control names, input/variant/additional property names, and augmentation notes. Returns matching controls with merged catalog data.",
  inputSchema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: "Search keyword, e.g. 'dropdown', 'icon', 'date', 'OnSelect'.",
      },
      limit: {
        type: 'number',
        description: 'Max results returned. Default 20.',
        default: 20,
      },
    },
    required: ['query'],
  },
  handler: ({ query, limit }: { query: string; limit?: number }): ToolResult => {
    if (!query || typeof query !== 'string') return error('query parameter is required (non-empty string).');
    const cap = Math.max(1, Math.min(100, Number(limit) || 20));
    const results = searchMergedControls(query).slice(0, cap);
    return json({
      query,
      returned: results.length,
      controls: results.map(c => ({
        type: c.type,
        family: c.family,
        variants: c.variants,
        matching_property_names: matchingProps(c, query),
        notes: c.notes,
      })),
    });
  },
};

// ─── get_augmentation ─────────────────────────────────────────────────────
export const getAugmentation = {
  name: 'get_augmentation',
  description:
    "Get the hand-curated augmentation layer for a single control: notes, legacy variants, runtime-observed variants, and additional input properties with verification status. Returns null if the control has no augmentation entry. Used to surface tribal knowledge the MCP's describe_control can't.",
  inputSchema: {
    type: 'object' as const,
    properties: {
      control_name: {
        type: 'string',
        description: "Control type, e.g. 'Gallery'.",
      },
    },
    required: ['control_name'],
  },
  handler: ({ control_name }: { control_name: string }): ToolResult => {
    const aug = (AUGMENTATIONS as Record<string, any>)[control_name];
    if (!aug) return json({ control: control_name, augmentation: null });
    return json({ control: control_name, augmentation: aug });
  },
};

// ─── helpers ──────────────────────────────────────────────────────────────
function matchingProps(c: MergedControl, query: string): string[] {
  const q = query.toLowerCase();
  const matches = new Set<string>();
  for (const p of Object.keys(c.input_properties)) if (p.toLowerCase().includes(q)) matches.add(p);
  for (const v of Object.values(c.variant_input_properties))
    for (const p of Object.keys(v)) if (p.toLowerCase().includes(q)) matches.add(p);
  for (const p of Object.keys(c.additional_input_properties)) if (p.toLowerCase().includes(q)) matches.add(p);
  return [...matches];
}

// ─── tool registry export ─────────────────────────────────────────────────
export const CATALOG_TOOLS = [getControlInfo, listControls, searchControls, getAugmentation];
