import { modernize, modernizeSummary, type ModernizeOptions } from '../core/modernize.js';
import { ANALYZER_CATALOG_DATA } from '../lib/catalog-data.js';
import { normalizeSurveyFiles, surveyApp } from './survey.js';

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };
export const modernizeControlsTool = {
  name: 'modernize_controls',
  description: 'Convert a selected batch of classic controls to Modern* using the draft catalog map. Returns the complete file set, per-property/reference report, open items and analyzer self-check. Mechanical controls only by default. Read-only: no tenant access. Compile in a scratch app and visually check before trusting the result.',
  inputSchema: {
    type: 'object', additionalProperties: false,
    properties: {
      files: surveyApp.inputSchema.properties.files,
      types: { type: 'array', items: { type: 'string', minLength: 1 }, description: 'Classic source types to convert; omitted means all mapped types.' },
      controls: { type: 'array', items: { type: 'string', minLength: 1 }, description: 'Limit to these control instance names.' },
      include_review: { type: 'boolean', default: false, description: 'Convert review controls, preserving manual and behaviour properties as open items.' },
    },
    required: ['files'],
  },
  handler(value: unknown): ToolResult {
    try {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('arguments must be an object');
      const input = value as Record<string, unknown>;
      if (Object.keys(input).some(key => !['files', 'types', 'controls', 'include_review'].includes(key))) throw new Error('unsupported argument');
      const options: ModernizeOptions = {};
      for (const key of ['types', 'controls'] as const) {
        const list = input[key];
        if (list === undefined) continue;
        if (!Array.isArray(list) || list.some(item => typeof item !== 'string' || !item.trim())) throw new Error(`${key} must be an array of non-empty strings`);
        options[key] = list;
      }
      if (input.include_review !== undefined) {
        if (typeof input.include_review !== 'boolean') throw new Error('include_review must be a boolean');
        options.include_review = input.include_review;
      }
      const files = normalizeSurveyFiles(input.files);
      const result = modernize(files, ANALYZER_CATALOG_DATA, options);
      return { content: [{ type: 'text', text: JSON.stringify({ ...result, human_summary: modernizeSummary(result.report) }, null, 2) }] };
    } catch (cause) {
      return { isError: true, content: [{ type: 'text', text: `Modernization error: ${cause instanceof Error ? cause.message : String(cause)}` }] };
    }
  },
};
export const MODERNIZE_TOOLS = [modernizeControlsTool];
