import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, beforeEach, expect, vi } from 'vitest';
import worker from '../src/index';
import { reportIssueContract } from './helpers/report-issue-contract';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('report_issue must never call fetch'); }));
});
afterEach(() => {
  expect(globalThis.fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

reportIssueContract(async (args, repo) => {
  const ctx = createExecutionContext();
  const response = await worker.fetch(new Request('http://x/mcp', {
    method: 'POST',
    headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'report_issue', arguments: args } }),
  }) as any, { ...env, APPFORGE_ISSUES_REPO: repo } as any, ctx);
  await waitOnExecutionContext(ctx);
  expect(response.status).toBe(200);
  return response.json();
});
