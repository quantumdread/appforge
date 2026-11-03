import { compareChildOrder, childOrderSummary, type ChildOrderFile } from '../core/child-order.js';
import { MAX_HOSTED_CONTROLS, countControlDeclarations } from '../lib/hosted-limits.js';

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };
const error = (text: string): ToolResult => ({ content: [{ type: 'text', text }], isError: true });
const filesSchema = {
  type: 'array', minItems: 1,
  items: {
    type: 'object',
    properties: { name: { type: 'string' }, content: { type: 'string' } },
    required: ['name', 'content'],
  },
};

export const compareChildOrderTool = {
  name: 'compare_child_order',
  description: "Compare child order between two complete sets of app files. After a compile and Studio save, pass the intended source as expected and a fresh sync as actual: reports per-container order, membership changes and moves between containers. Before a push, pass a fresh sync as expected and the folder you are about to compile as actual: controls that move to a new parent or change type under the same name, with their descendants, are listed in editor_render_risk with advice (Studio's editor can show them black after reload while play mode is correct). Ignores property values; read-only, with no tenant access.",
  inputSchema: {
    type: 'object',
    properties: { expected: filesSchema, actual: filesSchema },
    required: ['expected', 'actual'],
  },
  handler: (input: { expected: ChildOrderFile[]; actual: ChildOrderFile[] }): ToolResult => {
    if (!input || typeof input !== 'object') return error('expected and actual are required arrays of {name, content}.');
    for (const side of ['expected', 'actual'] as const) {
      const files = input[side];
      if (!Array.isArray(files) || files.length === 0) return error(`${side} must be a non-empty array of {name, content} entries.`);
      if (files.some(file => !file || typeof file.name !== 'string' || typeof file.content !== 'string')) {
        return error(`${side}: each file entry must be { name: string, content: string }.`);
      }
    }
    // The same total content-length and declaration limits as validate_yaml,
    // applied to the entire request (both bundles combined).
    const files = [...input.expected, ...input.actual];
    const total = files.reduce((n, file) => n + file.content.length, 0);
    if (total > 1_500_000) return error('Input too large: exceeds the 1.5 MB cap across expected and actual. Compare fewer screens, or use node cli/validate.mjs compare-order <expected-dir> <actual-dir>.');
    const controls = countControlDeclarations(files);
    if (controls > MAX_HOSTED_CONTROLS) return error(`Input too large for the hosted service: ${controls} controls exceeds the ${MAX_HOSTED_CONTROLS}-control cap per request. Use the local compare-order CLI.`);
    try {
      const result = compareChildOrder(input.expected, input.actual);
      return { content: [{ type: 'text', text: JSON.stringify({ ...result, human_summary: childOrderSummary(result) }, null, 2) }] };
    } catch (cause) {
      return error(`Child-order comparison error: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  },
};

export const CHILD_ORDER_TOOLS = [compareChildOrderTool];
