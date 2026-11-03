import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src/index';
import { WORKER_VERSION } from '../src/lib/release';

const rpc = (body: unknown, token: string | null = 'test-token') =>
  new Request('http://x/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

const EXPECTED_TOOLS = [
  'get_control_info',
  'list_controls',
  'search_controls',
  'get_augmentation',
  'validate_yaml',
  'compare_child_order',
  'modernize_controls',
  'rename_controls',
  'list_templates',
  'get_template',
  'list_rule_documents',
  'get_yaml_rules',
  'get_sizing_reference',
  'get_design_principles',
  'check_limitation',
  'get_powerfx_function',
  'search_powerfx',
  'list_powerfx_categories',
  'get_verification_queue',
  'survey_app',
  'report_issue',
];

describe('worker endpoints', () => {
  it('health omits tenant identifiers', async () => {
    const res = await SELF.fetch('http://x/');
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(body).not.toContain('environment_id');
    expect(body).not.toContain('app_id');
    const parsed = JSON.parse(body);
    expect(parsed.server.version).toBe(WORKER_VERSION);
    expect(parsed.tools).toEqual(EXPECTED_TOOLS);
  });

  it('rejects wrong token with 401', async () => {
    const res = await SELF.fetch(rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, 'wrong'));
    expect(res.status).toBe(401);
  });

  it('fails closed with 503 when MCP_AUTH_TOKEN is not configured', async () => {
    const ctx = createExecutionContext();
    const bare = { ...env, MCP_AUTH_TOKEN: undefined } as any;
    const res = await worker.fetch(rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, null) as any, bare, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(503);
  });

  it('lists exactly 21 tools and omits the pruned agent-prompt surface', async () => {
    const res = await SELF.fetch(rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }));
    const body: any = await res.json();
    expect(body.result.tools).toHaveLength(21);
    const names = body.result.tools.map((tool: any) => tool.name);
    expect(names).toEqual(EXPECTED_TOOLS);
    expect(names).not.toContain('list_agents');
    expect(names).not.toContain('get_agent_instructions');
  });

  it('initialize returns generated instructions without stale phase text', async () => {
    const res = await SELF.fetch(rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }));
    const body: any = await res.json();
    expect(body.result.serverInfo.version).toBe(WORKER_VERSION);
    expect(body.result.instructions).toContain('21 tools');
    expect(body.result.instructions).not.toContain('Phase 1: catalog only');
  });

  it('treats any id-less request as a notification (204)', async () => {
    const res = await SELF.fetch(rpc({ jsonrpc: '2.0', method: 'tools/list' }));
    expect(res.status).toBe(204);
  });

  it('returns -32601 for unknown tool and -32700 for bad JSON', async () => {
    const res = await SELF.fetch(rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'nope' } }));
    const body: any = await res.json();
    expect(body.error.code).toBe(-32601);
    const bad = await SELF.fetch(new Request('http://x/mcp', { method: 'POST', headers: { authorization: 'Bearer test-token' }, body: '{oops' }));
    expect((await bad.json() as any).error.code).toBe(-32700);
  });

  it('tools/call works end-to-end for one tool per group', async () => {
    for (const [name, args] of [
      ['list_controls', {}], ['validate_yaml', { files: [{ name: 'a.pa.yaml', content: '- b:\n    Control: Button\n    Properties:\n      Text: ="hi"\n' }] }],
      ['compare_child_order', { expected: [{ name: 'Home.pa.yaml', content: 'Screens:\n  Home:\n    Children: []\n' }], actual: [{ name: 'Home.pa.yaml', content: 'Screens:\n  Home:\n    Children: []\n' }] }],
      ['modernize_controls', { files: [{ name: 'Home.pa.yaml', content: 'Screens:\n  Home:\n    Children:\n      - greeting:\n          Control: Label\n' }] }],
      ['rename_controls', { mode: 'propose', files: [{ name: 'Home.pa.yaml', content: 'Screens:\n  Home:\n    Children: []\n' }] }],
      ['list_templates', {}], ['list_rule_documents', {}], ['list_powerfx_categories', {}], ['get_verification_queue', {}],
    ] as const) {
      const res = await SELF.fetch(rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }));
      const body: any = await res.json();
      expect(body.error, `${name} errored`).toBeUndefined();
      expect(body.result.content[0].type).toBe('text');
    }
  });
});
