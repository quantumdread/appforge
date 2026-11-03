import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, expect, vi } from 'vitest';
import { reportIssueContract } from './helpers/report-issue-contract';

const MCP = resolve(__dirname, '..');
let dataDir: string;
beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'appforge-report-issue-'));
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected parent fetch'); }));
});
afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
  expect(globalThis.fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

reportIssueContract(async (args, repo) => {
  // Install the guard inside the actual stdio child, before the built server loads.
  const guard = 'globalThis.fetch = () => { process.stderr.write("UNEXPECTED_FETCH\\n"); throw new Error("Unexpected fetch"); };';
  const childEnv: NodeJS.ProcessEnv = { ...process.env, APPFORGE_DATA_DIR: dataDir };
  delete childEnv.APPFORGE_ISSUES_REPO;
  if (repo !== undefined) childEnv.APPFORGE_ISSUES_REPO = repo;
  const result = spawnSync(process.execPath, [
    '--import', `data:text/javascript,${encodeURIComponent(guard)}`,
    join(MCP, 'dist-local/appforge-mcp.mjs'),
  ], {
    cwd: MCP, env: childEnv, encoding: 'utf8', windowsHide: true, timeout: 15_000,
    maxBuffer: 4 * 1024 * 1024,
    input: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'report_issue', arguments: args } }) + '\n',
  });
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  expect(result.stderr).not.toContain('UNEXPECTED_FETCH');
  const lines = result.stdout.trim().split('\n');
  expect(lines).toHaveLength(1);
  return JSON.parse(lines[0]);
});
