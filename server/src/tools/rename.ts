import { applyRenames, proposeNames, RenameInputError, type RenameOptions } from '../core/rename.js';
import { ANALYZER_CATALOG_DATA } from '../lib/catalog-data.js';
import { normalizeSurveyFiles, surveyApp } from './survey.js';

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };
export const renameControlsTool = {
  name: 'rename_controls',
  description: 'Propose meaningful names for generic controls/screens, or apply an explicit owner-edited rename map to the complete file set. Preserves strings and local bindings, reports possible dynamic references, rejects collisions and self-check failures. Screen prefixes are optional; auto only suggests. Read-only toward tenants. Abbreviations can be overridden when proposing, or by editing the explicit map.',
  inputSchema: {
    type: 'object', additionalProperties: false,
    properties: {
      files: surveyApp.inputSchema.properties.files,
      mode: { type: 'string', enum: ['propose', 'apply'] },
      renames: { type: 'object', additionalProperties: { type: 'string' }, description: 'Explicit old-name to new-name map; required in apply mode.' },
      screen_prefix: { anyOf: [{ type: 'boolean' }, { type: 'string', enum: ['auto'] }], default: false },
      abbreviations: { type: 'object', additionalProperties: { type: 'string' }, description: 'Optional screen/component abbreviation overrides for proposals.' },
    }, required: ['files', 'mode'],
  },
  handler(value: unknown): ToolResult {
    try {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('arguments must be an object');
      const input = value as Record<string, unknown>;
      if (Object.keys(input).some(k => !['files', 'mode', 'renames', 'screen_prefix', 'abbreviations'].includes(k))) throw new Error('unsupported argument');
      if (input.mode !== 'propose' && input.mode !== 'apply') throw new Error('mode must be propose or apply');
      if (input.screen_prefix !== undefined && typeof input.screen_prefix !== 'boolean' && input.screen_prefix !== 'auto') throw new Error('screen_prefix must be boolean or auto');
      const record = (value: unknown): value is Record<string, string> => !!value && typeof value === 'object' && !Array.isArray(value) && Object.values(value).every(v => typeof v === 'string');
      if (input.mode === 'apply' && !record(input.renames)) throw new Error('apply requires an explicit renames object');
      if (input.mode === 'propose' && input.renames !== undefined) throw new Error('renames is only supported in apply mode');
      if (input.abbreviations !== undefined && !record(input.abbreviations)) throw new Error('abbreviations must be a string map');
      if (input.mode === 'apply' && (input.screen_prefix !== undefined || input.abbreviations !== undefined)) throw new Error('apply uses only the explicit map; prefix options belong to propose');
      const files = normalizeSurveyFiles(input.files);
      const result = input.mode === 'propose'
        ? proposeNames(files, ANALYZER_CATALOG_DATA, { screen_prefix: input.screen_prefix, abbreviations: input.abbreviations } as RenameOptions)
        : applyRenames(files, ANALYZER_CATALOG_DATA, input.renames as Record<string, string>);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (cause) {
      return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: cause instanceof Error ? cause.message : String(cause), ...(cause instanceof RenameInputError ? { collisions: cause.collisions } : {}) }) }] };
    }
  },
};
export const RENAME_TOOLS = [renameControlsTool];
