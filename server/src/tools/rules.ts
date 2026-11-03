/**
 * Rules / reference tools — Phase 3.
 *
 *   get_yaml_rules(document, section?)  — generator-rules, validator-checklist, etc.
 *   get_sizing_reference(section?)      — sizing reference
 *   get_design_principles(section?)     — design principles
 *   check_limitation(element)           — searches canvas-apps-limitations
 *   list_rule_documents()               — discoverability for what get_yaml_rules accepts
 */
import { REFERENCE_DOCS } from '../generated/content.js';
import { extractSection, listSections, searchParagraphs } from '../lib/markdown.js';

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

const text = (s: string): ToolResult => ({ content: [{ type: 'text', text: s }] });
const json = (obj: unknown): ToolResult => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] });
const error = (msg: string): ToolResult => ({ content: [{ type: 'text', text: msg }], isError: true });

const DOCS = REFERENCE_DOCS as Record<string, string>;

function getOrError(name: string): string | ToolResult {
  const doc = DOCS[name];
  if (!doc) return error(`Document '${name}' not bundled. Available: ${Object.keys(DOCS).join(', ')}`);
  return doc;
}

function fetchSection(docName: string, section?: string): ToolResult {
  const docOrErr = getOrError(docName);
  if (typeof docOrErr !== 'string') return docOrErr;
  if (!section) return text(docOrErr);
  const slice = extractSection(docOrErr, section);
  if (slice === null) {
    const sections = listSections(docOrErr).map(s => `${'#'.repeat(s.level)} ${s.title}`).join('\n');
    return error(`Section matching '${section}' not found in ${docName}.md. Available sections:\n${sections}`);
  }
  return text(slice);
}

// ─── Tools ────────────────────────────────────────────────────────────────
export const listRuleDocuments = {
  name: 'list_rule_documents',
  description: 'List all bundled AppForge reference documents (rules, patterns, references, guides, and personas: prompts for a calling session to follow). Use to discover what get_yaml_rules accepts as `document`.',
  inputSchema: { type: 'object' as const, properties: {} },
  handler: (): ToolResult => json({
    count: Object.keys(DOCS).length,
    documents: Object.keys(DOCS).sort(),
  }),
};

export const getYamlRules = {
  name: 'get_yaml_rules',
  description: 'Get a Power Apps YAML reference document by name, optionally sliced to a specific section. Covers generator rules, validator checklist, layout/positioning rules, gallery/form patterns, component rules, navigation patterns, named formulas, performance, troubleshooting, modern control updates, and personas (prompts for a calling session to follow). Use list_rule_documents to discover available document names.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      document: { type: 'string', description: "Document name without extension, e.g. 'generator-rules', 'validator-checklist', 'gallery-patterns', 'screen-layout-rules', 'component-rules', 'persona-diagnostician'." },
      section: { type: 'string', description: "Optional heading (case-insensitive, fuzzy match). Omit for full document." },
    },
    required: ['document'],
  },
  handler: ({ document, section }: { document: string; section?: string }): ToolResult => fetchSection(document, section),
};

export const getSizingReference = {
  name: 'get_sizing_reference',
  description: 'Get CSS-calibrated sizing data for Power Apps controls: text sizes, button heights, checkbox sizes, gaps, padding, spacing scales for Classic and Modern controls.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      section: { type: 'string', description: "Optional section, e.g. 'text-sizes', 'buttons', 'inputs', 'spacing'. Omit for full reference." },
    },
  },
  handler: ({ section }: { section?: string }): ToolResult => fetchSection('sizing-reference', section),
};

export const getDesignPrinciples = {
  name: 'get_design_principles',
  description: 'Get AppForge design principles for Power Apps Canvas Apps: layout, spacing, typography, color, theming, hierarchy, density.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      section: { type: 'string', description: "Optional section. Omit for full principles." },
    },
  },
  handler: ({ section }: { section?: string }): ToolResult => fetchSection('design-principles', section),
};

export const checkLimitation = {
  name: 'check_limitation',
  description: 'Check if a design element has Power Apps Canvas limitations. Searches the limitations reference for the element name and returns matching paragraphs (workarounds, alternatives, or "no support" findings).',
  inputSchema: {
    type: 'object' as const,
    properties: {
      element: { type: 'string', description: "Design element to check, e.g. 'donut chart', 'sticky header', 'gradient text', 'animations'." },
    },
    required: ['element'],
  },
  handler: ({ element }: { element: string }): ToolResult => {
    const doc = DOCS['canvas-apps-limitations'];
    if (!doc) return error('canvas-apps-limitations.md is not bundled.');
    const matches = searchParagraphs(doc, element, 8);
    if (matches.length === 0) return json({ element, found: false, message: `No mention of '${element}' in canvas-apps-limitations.md. May or may not be supported — verify against a live Power Apps Studio.` });
    return json({ element, found: true, match_count: matches.length, paragraphs: matches });
  },
};

export const RULES_TOOLS = [listRuleDocuments, getYamlRules, getSizingReference, getDesignPrinciples, checkLimitation];
