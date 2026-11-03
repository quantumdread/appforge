import { describe, expect, it } from 'vitest';
import { WORKER_VERSION } from '../../src/lib/release';

export type InvokeIssue = (args: unknown, repo?: string) => Promise<any>;
export const issueInput = {
  kind: 'other', title: 'Neutral report', summary: 'A small example.',
  rule_id: 'example-rule', control_type: 'ModernButton', tool_name: 'validate_yaml',
  expected: 'Accepted', actual: 'A finding', repro_yaml: 'Screens:\n  Example:\n    Children: []',
  evidence_class: 'inferred',
};
export const issueUrl = (response: any): URL => {
  expect(response.error).toBeUndefined();
  expect(response.result.isError).not.toBe(true);
  return new URL(response.result.content[0].text.split('\n').find((line: string) => line.startsWith('https://')));
};

export function reportIssueContract(invoke: InvokeIssue) {
  describe('report_issue contract', () => {
    it.each([
      ['false-refuse', 'false-finding'], ['false-warn', 'false-finding'],
      ['catalog-gap', 'catalog-gap'], ['tool-behaviour', 'tool-behaviour'],
      ['doc-error', 'doc-error'], ['other', 'other'],
    ])('maps %s to %s and preserves the report fields', async (kind, form) => {
      const response = await invoke({ ...issueInput, kind });
      const url = issueUrl(response);
      expect(url.origin + url.pathname).toBe('https://github.com/quantumdread/appforge/issues/new');
      expect(url.searchParams.get('template')).toBe(`${form}.yml`);
      expect(url.searchParams.get('appforge_version')).toBe(WORKER_VERSION);
      for (const [id, value] of Object.entries({ ...issueInput, kind })) {
        expect(url.searchParams.get(id)).toBe(value);
        expect(response.result.content[0].text).toContain(`### ${id}\n`);
      }
      expect(response.result.content[0].text).toContain('Before submitting, remove:\n'
        + '- customer, company and person names\n- tenant, environment and app ids\n'
        + '- internal URLs\n- real data values\n- screen or control names that identify a customer app\n\n'
        + 'Replace them with neutral names and keep the repro minimal.');
    });

    it('encodes ampersands, hashes, newlines and non-ASCII in every supplied value', async () => {
      const value = '& #\nåäö 😀';
      const args = Object.fromEntries(Object.keys(issueInput).map(id => [id,
        ['kind', 'evidence_class'].includes(id) ? issueInput[id as keyof typeof issueInput] : value]));
      const response = await invoke(args);
      const url = issueUrl(response);
      for (const id of ['title', 'summary', 'rule_id', 'control_type', 'tool_name', 'expected', 'actual', 'repro_yaml']) {
        expect(url.searchParams.get(id)).toBe(value);
        expect(url.href).toContain(`${id}=${encodeURIComponent(value)}`);
      }
      expect(url.hash).toBe('');
    });

    it('truncates the longest field first below 7,500 while keeping the full Markdown', async () => {
      const summary = 'å😀&\n'.repeat(4000);
      const response = await invoke({ ...issueInput, summary });
      const url = issueUrl(response);
      expect(url.href.length).toBeLessThan(7500);
      expect(url.href.length).toBeGreaterThan(7400);
      expect(url.searchParams.get('summary')).toMatch(/\[truncated: paste the rest into the issue\]$/);
      expect(url.searchParams.get('repro_yaml')).toBe(issueInput.repro_yaml);
      expect(response.result.content[0].text).toContain(summary);
      expect(url.searchParams.get('summary')).not.toContain('�');
    });

    it('fits when several fields need truncation and marks every shortened field', async () => {
      const large = 'ö😀'.repeat(3000);
      const args = { ...issueInput, summary: large, expected: large, actual: large, repro_yaml: large };
      const url = issueUrl(await invoke(args));
      expect(url.href.length).toBeLessThan(7500);
      for (const id of ['summary', 'expected', 'actual', 'repro_yaml']) {
        expect(url.searchParams.get(id)).toMatch(/\[truncated: paste the rest into the issue\]$/);
      }
    });

    it.each([
      { kind: 'invalid' }, { kind: null }, { title: '' }, { title: ' ' },
      { title: 'x'.repeat(121) }, { title: 42 }, { summary: undefined },
      { evidence_class: 'guess' }, { repro_yaml: 1 },
    ])('rejects invalid input with an MCP error: %j', async patch => {
      const response = await invoke({ ...issueInput, ...patch });
      expect(response.error?.code === -32000 || response.result?.isError === true).toBe(true);
    });

    it('accepts a title at the 120-character boundary', async () => {
      const title = 'x'.repeat(120);
      expect(issueUrl(await invoke({ ...issueInput, title })).searchParams.get('title')).toBe(title);
    });

    it('honours the repository override', async () => {
      const response = await invoke(issueInput, 'example-owner/example.repo');
      expect(issueUrl(response).pathname).toBe('/example-owner/example.repo/issues/new');
      expect(response.result.content[0].text).not.toContain('Warning:');
    });

    it.each(['bad/repo?query=yes', '../repo', 'owner/..', '', 'https://github.com/owner/repo'])
      ('falls back with a warning for malformed override %j', async repo => {
        const response = await invoke(issueInput, repo);
        expect(issueUrl(response).pathname).toBe('/quantumdread/appforge/issues/new');
        expect(response.result.content[0].text).toMatch(/^Warning: invalid APPFORGE_ISSUES_REPO; using quantumdread\/appforge\./);
      });
  });
}
