/**
 * Template tools — Phase 3.
 *
 *   list_templates(tag?) — browse the template library, optionally filter by tag
 *   get_template(id)    — fetch full YAML content + metadata
 */
import { TEMPLATES } from '../generated/content.js';

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

const json = (obj: unknown): ToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }],
});

const error = (msg: string): ToolResult => ({
  content: [{ type: 'text', text: msg }],
  isError: true,
});

export const listTemplates = {
  name: 'list_templates',
  description:
    "List Power Apps YAML templates available in AppForge. Each template is a reusable layout pattern (card grid, KPI row, sidebar nav, data table, etc.) you can paste into a screen or adapt to your data. Filter by tag to narrow.",
  inputSchema: {
    type: 'object' as const,
    properties: {
      tag: {
        type: 'string',
        description: "Optional tag filter, e.g. 'cards', 'navigation', 'gallery', 'table', 'kpi', 'dashboard'.",
      },
    },
  },
  handler: ({ tag }: { tag?: string }): ToolResult => {
    const all = Object.values(TEMPLATES as Record<string, any>);
    const filtered = tag
      ? all.filter(t => (t.tags ?? []).some((x: string) => x.toLowerCase() === tag.toLowerCase()))
      : all;
    return json({
      count: filtered.length,
      tag: tag ?? null,
      templates: filtered.map(t => ({
        id: t.id,
        tags: t.tags,
        description: t.description || null,
        use_when: t.use_when || null,
      })),
    });
  },
};

export const getTemplate = {
  name: 'get_template',
  description:
    "Get a Power Apps YAML template by id. Returns full YAML content + metadata (tags, description, use_when). Paste the YAML content into a screen's Children: list and adapt control names / data bindings.",
  inputSchema: {
    type: 'object' as const,
    properties: {
      template_id: {
        type: 'string',
        description: "Template id. Use list_templates to see options. e.g. 'card-template-1', 'kpi-cards', 'sidebar-collapsible', 'tab-bar', 'data-table'.",
      },
    },
    required: ['template_id'],
  },
  handler: ({ template_id }: { template_id: string }): ToolResult => {
    const t = (TEMPLATES as Record<string, any>)[template_id];
    if (!t) {
      const available = Object.keys(TEMPLATES).join(', ');
      return error(`Template '${template_id}' not found. Available: ${available}`);
    }
    return json({
      id: t.id,
      tags: t.tags,
      description: t.description || null,
      use_when: t.use_when || null,
      content: t.content,
    });
  },
};

export const TEMPLATE_TOOLS = [listTemplates, getTemplate];
