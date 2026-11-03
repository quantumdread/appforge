import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface, type Interface } from 'node:readline';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOOLS, type JsonRpcResponse } from '../src/lib/rpc';
import { WORKER_VERSION } from '../src/lib/release';

const MCP = resolve(__dirname, '..');
const request = (id: string | number, method: string, params?: unknown) => ({
  jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }),
});
const toolCall = (id: string | number, name: string, args: unknown = {}) =>
  request(id, 'tools/call', { name, arguments: args });
const buttonFile = {
  name: 'Home.pa.yaml',
  content: `Screens:
  Home:
    Children:
      - Action:
          Control: ModernButton
          Properties:
            FontSize: =14
`,
};

describe('local MCP stdio server (built artifact)', () => {
  let dataDir: string;
  let child: ChildProcessWithoutNullStreams;
  let stdout: Interface;
  let lines: string[];
  let stderr: string;
  let closed: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'appforge-local-server-'));
    lines = [];
    stderr = '';
    // The release sequence builds this file before running the Node pool.
    child = spawn(process.execPath, [join(MCP, 'dist-local/appforge-mcp.mjs')], {
      cwd: MCP,
      env: { ...process.env, APPFORGE_DATA_DIR: dataDir },
      stdio: 'pipe',
      windowsHide: true,
    });
    stdout = createInterface({ input: child.stdout, crlfDelay: Infinity });
    stdout.on('line', line => lines.push(line));
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => { stderr += error.message; });
    closed = new Promise(resolveClose => {
      child.once('close', (code, signal) => resolveClose({ code, signal }));
    });
  });

  afterEach(async () => {
    child.stdin.end();
    const timer = setTimeout(() => child.kill(), 2000);
    try {
      await closed;
    } finally {
      clearTimeout(timer);
      stdout.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  const send = (msg: unknown) => child.stdin.write(`${JSON.stringify(msg)}\n`);
  const nextLine = async (timeout = 5000): Promise<string> => {
    await vi.waitFor(() => expect(lines.length, stderr).toBeGreaterThan(0), { timeout, interval: 10 });
    return lines.shift()!;
  };
  const nextResponse = async (timeout = 5000): Promise<JsonRpcResponse> => JSON.parse(await nextLine(timeout));
  const toolResult = (response: JsonRpcResponse) => {
    expect(response.error).toBeUndefined();
    expect(response.result.isError).not.toBe(true);
    return JSON.parse(response.result.content[0].text);
  };

  it('initializes with the shared server identity and release version', async () => {
    send(request(1, 'initialize'));
    const response = await nextResponse();
    expect(response.id).toBe(1);
    expect(response.result.serverInfo).toEqual({ name: 'appforge', version: WORKER_VERSION });
  });

  it('lists the same 21 tools in dispatcher order', async () => {
    send(request(2, 'tools/list'));
    const response = await nextResponse();
    expect(response.result.tools).toHaveLength(21);
    expect(response.result.tools.map((tool: { name: string }) => tool.name)).toEqual(TOOLS.map(tool => tool.name));
  });

  it('returns the ModernButton refusal and persists verification queue entries', async () => {
    send(toolCall(3, 'validate_yaml', { files: [buttonFile] }));
    const result = toolResult(await nextResponse());
    expect(result.issues.refuse).toHaveLength(1);
    expect(result.issues.refuse[0]).toMatchObject({
      level: 'REFUSE',
      fix: 'ModernButton names this property Size, not FontSize; use Size',
    });

    let entries: unknown[] = [];
    const deadline = Date.now() + 5000;
    do {
      send(toolCall(4, 'get_verification_queue'));
      entries = toolResult(await nextResponse(Math.max(1, deadline - Date.now()))).entries;
      if (entries.length > 0) break;
      await new Promise(resolvePoll => setTimeout(resolvePoll, Math.min(25, Math.max(0, deadline - Date.now()))));
    } while (Date.now() < deadline);
    expect(entries.length).toBeGreaterThan(0);
    expect(readdirSync(join(dataDir, 'kv')).some(file => file.endsWith('.json'))).toBe(true);
  });

  it('emits nothing for a notification and returns exact parse and batch errors', async () => {
    child.stdin.write('\n   \n');
    send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    send({ jsonrpc: '2.0', method: 'tools/list' });
    child.stdin.write('{invalid JSON\n');
    send([request(1, 'initialize')]);
    child.stdin.end();
    expect(await closed, stderr).toEqual({ code: 0, signal: null });
    expect(lines).toEqual([
      '{"jsonrpc":"2.0","id":null,"error":{"code":-32700,"message":"Parse error: invalid JSON"}}',
      '{"jsonrpc":"2.0","id":null,"error":{"code":-32600,"message":"Invalid Request: batches are not supported over stdio"}}',
    ]);
  });

  it('returns editor_render_risk for a moved control', async () => {
    const expected = [{
      name: 'Home.pa.yaml',
      content: 'Screens:\n  Home:\n    Children:\n      - A:\n          Control: Label\n',
    }];
    const actual = expected.map(file => ({ ...file, content: file.content.replace('  Home:', '  Other:') }));
    send(toolCall(6, 'compare_child_order', { expected, actual }));
    const result = toolResult(await nextResponse());
    expect(result.editor_render_risk).not.toBeNull();
    expect(result.editor_render_risk.moved).toEqual(['A']);
  });

  it('finishes three back-to-back requests in arrival order before exiting on EOF', async () => {
    // An asynchronous queue read must finish before the synchronous initialize/list results.
    child.stdin.end([
      toolCall('queue', 'get_verification_queue'),
      request('initialize', 'initialize'),
      request('list', 'tools/list'),
    ].map(msg => JSON.stringify(msg)).join('\n') + '\n');
    expect(await closed, stderr).toEqual({ code: 0, signal: null });
    expect(lines.map(line => JSON.parse(line).id)).toEqual(['queue', 'initialize', 'list']);
  });
});
