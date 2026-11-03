import { WORKER_VERSION } from '../lib/release.js';

export const ISSUE_KINDS = ['false-refuse', 'false-warn', 'catalog-gap', 'tool-behaviour', 'doc-error', 'other'] as const;
export const EVIDENCE_CLASSES = ['compile_canvas', 'studio_observation', 'visual', 'inferred'] as const;
export const ISSUE_FORMS = {
  'false-refuse': 'false-finding',
  'false-warn': 'false-finding',
  'catalog-gap': 'catalog-gap',
  'tool-behaviour': 'tool-behaviour',
  'doc-error': 'doc-error',
  other: 'other',
} as const;
const OPTIONAL_FIELDS = ['rule_id', 'control_type', 'tool_name', 'expected', 'actual', 'repro_yaml'] as const;
export const DEFAULT_ISSUES_REPO = 'quantumdread/appforge';
export const MAX_ISSUE_URL_LENGTH = 7_499;
export const TRUNCATION_MARKER = '[truncated: paste the rest into the issue]';
export const CONTAINMENT_REMINDER = `Before submitting, remove:
- customer, company and person names
- tenant, environment and app ids
- internal URLs
- real data values
- screen or control names that identify a customer app

Replace them with neutral names and keep the repro minimal.`;

type ReportIssueEnv = { APPFORGE_ISSUES_REPO?: unknown };
type Field = { id: string; value: string };

function issueUrl(repo: string, fields: Field[]): string {
  return `https://github.com/${repo}/issues/new?` + fields
    .map(({ id, value }) => `${id}=${encodeURIComponent(value)}`).join('&');
}

/** Shorten encoded values, preserving Unicode code points and the full hand-filed body. */
function boundedUrl(repo: string, original: Field[]): string {
  const fields = original.map(field => ({ ...field }));
  let url = issueUrl(repo, fields);
  while (url.length > MAX_ISSUE_URL_LENGTH) {
    const longest = fields.filter(field => !['template', 'kind', 'appforge_version', 'evidence_class'].includes(field.id))
      .sort((a, b) => encodeURIComponent(b.value).length - encodeURIComponent(a.value).length)
      .find(field => encodeURIComponent(field.value).length > encodeURIComponent(TRUNCATION_MARKER).length);
    if (!longest) throw new Error('Issue URL cannot fit within its limit');
    const budget = Math.max(encodeURIComponent(TRUNCATION_MARKER).length,
      encodeURIComponent(longest.value).length - (url.length - MAX_ISSUE_URL_LENGTH));
    const points = Array.from(longest.value);
    let low = 0;
    let high = longest.id === 'title'
      ? Math.min(points.length, 120 - Array.from(TRUNCATION_MARKER).length) : points.length;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      const candidate = points.slice(0, mid).join('') + TRUNCATION_MARKER;
      if (encodeURIComponent(candidate).length <= budget) low = mid;
      else high = mid - 1;
    }
    longest.value = points.slice(0, low).join('') + TRUNCATION_MARKER;
    url = issueUrl(repo, fields);
  }
  return url;
}

function markdownField({ id, value }: Field): string {
  // A longer fence keeps supplied YAML or Markdown from ending the preview block.
  const runs = value.match(/`+/g) ?? [];
  const fence = '`'.repeat(runs.reduce((length, run) => Math.max(length, run.length + 1), 3));
  return `### ${id}\n\n${fence}${id === 'repro_yaml' ? 'yaml' : 'text'}\n${value}\n${fence}`;
}

export const reportIssue = {
  name: 'report_issue',
  description: 'Prepare a public AppForge bug report as a prefilled GitHub issue URL and Markdown. Makes no network requests. Review and remove identifying data before submitting.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      kind: { type: 'string', enum: ISSUE_KINDS },
      title: { type: 'string', minLength: 1, maxLength: 120 },
      summary: { type: 'string' },
      ...Object.fromEntries(OPTIONAL_FIELDS.map(id => [id, { type: 'string' }])),
      evidence_class: { type: 'string', enum: EVIDENCE_CLASSES },
    },
    required: ['kind', 'title', 'summary'],
    additionalProperties: false,
  },
  handler(args: unknown, extra?: { env?: ReportIssueEnv }) {
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Expected an issue fields object');
    const input = args as Record<string, unknown>;
    if (!ISSUE_KINDS.includes(input.kind as any)) throw new Error('Invalid kind');
    if (typeof input.title !== 'string' || !input.title.trim() || Array.from(input.title).length > 120) {
      throw new Error('title must contain 1–120 characters');
    }
    if (typeof input.summary !== 'string') throw new Error('summary is required and must be a string');
    const allowed = new Set(['kind', 'title', 'summary', ...OPTIONAL_FIELDS, 'evidence_class']);
    for (const [id, value] of Object.entries(input)) {
      if (!allowed.has(id)) throw new Error(`Unsupported issue field: ${id}`);
      if (typeof value !== 'string') throw new Error(`${id} must be a string`);
      // encodeURIComponent rejects lone UTF-16 surrogates; return a clear MCP error.
      if (!value.isWellFormed()) throw new Error(`${id} must contain valid Unicode`);
    }
    if (input.evidence_class !== undefined && !EVIDENCE_CLASSES.includes(input.evidence_class as any)) {
      throw new Error('Invalid evidence_class');
    }
    const kind = input.kind as typeof ISSUE_KINDS[number];
    const override = extra?.env?.APPFORGE_ISSUES_REPO;
    const validRepo = typeof override === 'string'
      && /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9_.-]{1,100}$/.test(override)
      && !['.', '..'].includes(override.split('/')[1]);
    const repo = validRepo ? override as string : DEFAULT_ISSUES_REPO;
    const warning = override !== undefined && !validRepo
      ? `Warning: invalid APPFORGE_ISSUES_REPO; using ${DEFAULT_ISSUES_REPO}.\n\n` : '';
    const bodyFields: Field[] = [
      { id: 'kind', value: kind },
      { id: 'appforge_version', value: WORKER_VERSION },
      { id: 'summary', value: input.summary },
      ...[...OPTIONAL_FIELDS, 'evidence_class'].filter(id => input[id] !== undefined)
        .map(id => ({ id, value: input[id] as string })),
    ];
    const urlFields = [
      { id: 'template', value: `${ISSUE_FORMS[kind]}.yml` },
      { id: 'title', value: input.title },
      ...bodyFields,
    ];
    return { content: [{ type: 'text' as const, text:
      `${warning}${boundedUrl(repo, urlFields)}\n\n${CONTAINMENT_REMINDER}\n\n`
      + `Markdown body (full fields; URL fields may be shortened):\n\n`
      + [{ id: 'title', value: input.title }, ...bodyFields].map(markdownField).join('\n\n'),
    }] };
  },
};

export const REPORT_ISSUE_TOOLS = [reportIssue];
