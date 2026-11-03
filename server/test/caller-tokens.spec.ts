import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index';
import { PRIMARY_CALLER, resolveCaller } from '../src/lib/survey-telemetry';

const COLLEAGUE_TOKEN = 'n'.repeat(40);
const USERS = JSON.stringify({ colleague: COLLEAGUE_TOKEN });

const call = async (token: string | null, extraEnv: Record<string, unknown> = {}) => {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request('http://x/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_controls', arguments: {} } }),
  }) as any, { ...env, ...extraEnv } as any, ctx);
  await waitOnExecutionContext(ctx);
  return res;
};

describe('named caller tokens', () => {
  afterEach(() => vi.restoreAllMocks());

  it('resolves the primary token and named extra tokens to their labels', () => {
    const e = { MCP_AUTH_TOKEN: 'test-token', MCP_USER_TOKENS: USERS };
    expect(resolveCaller('test-token', e)).toBe(PRIMARY_CALLER);
    expect(resolveCaller(COLLEAGUE_TOKEN, e)).toBe('colleague');
    expect(resolveCaller('wrong', e)).toBeNull();
  });

  it('admits no extra caller from a malformed, short-token or badly labelled secret', () => {
    for (const bad of ['not json', '[]', JSON.stringify({ colleague: 'short' }),
      JSON.stringify({ 'Bad Label': COLLEAGUE_TOKEN }), JSON.stringify({ [PRIMARY_CALLER]: COLLEAGUE_TOKEN })]) {
      const e = { MCP_AUTH_TOKEN: 'test-token', MCP_USER_TOKENS: bad };
      expect(resolveCaller(COLLEAGUE_TOKEN, e)).toBeNull();
      expect(resolveCaller('test-token', e)).toBe(PRIMARY_CALLER);
    }
  });

  it('serves a named caller on /mcp and logs caller and tool without arguments', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = await call(COLLEAGUE_TOKEN, { MCP_USER_TOKENS: USERS });
    expect(res.status).toBe(200);
    const lines = log.mock.calls.map(args => String(args[0])).filter(l => l.includes('mcp-call'));
    expect(lines.map(l => JSON.parse(l))).toEqual([
      { event: 'mcp-call', caller: 'colleague', calls: [{ method: 'tools/call', tool: 'list_controls' }] },
    ]);
  });

  it('keeps the primary token working and rejects unknown tokens with 401', async () => {
    expect((await call('test-token', { MCP_USER_TOKENS: USERS })).status).toBe(200);
    expect((await call('x'.repeat(40), { MCP_USER_TOKENS: USERS })).status).toBe(401);
    expect((await call(COLLEAGUE_TOKEN)).status).toBe(401);
  });

  it('accepts a named caller on /survey/envelope auth', async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request('http://x/survey/envelope', {
      method: 'POST',
      headers: { authorization: `Bearer ${COLLEAGUE_TOKEN}`, 'content-type': 'text/plain' },
      body: '{}',
    }) as any, { ...env, MCP_USER_TOKENS: USERS } as any, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(415); // past auth; the media type check comes next
  });
});
