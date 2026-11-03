import { existsSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  adjudicateRecord,
  createWranglerBoundary,
  createWranglerRunner,
  parseArgs,
  WRANGLER_JS_PATH,
} from '../scripts/adjudicate.mjs';

describe('adjudication script', () => {
  it('read-modify-writes a record with the count observed at stamp time', async () => {
    const before = {
      count: 4,
      occurrences: 9,
      last_seen: '2026-08-10T00:00:00.000Z',
      worker_version: '2.4.1',
    };
    const writes: Array<{ key: string; record: any }> = [];
    const boundary = {
      get: async (key: string) => key === 'refuse:unknown-control:Buton' ? before : null,
      put: async (key: string, record: any) => { writes.push({ key, record }); },
    };

    const result = await adjudicateRecord({
      key: 'refuse:unknown-control:Buton',
      outcome: 'dismissed',
      by: 'catalog noise: reviewed by the maintainer',
    }, boundary, () => '2026-08-11T12:00:00.000Z');

    expect(result.before).toEqual(before);
    expect(result.after).toEqual({
      ...before,
      adjudication: {
        outcome: 'dismissed',
        at: '2026-08-11T12:00:00.000Z',
        by: 'catalog noise: reviewed by the maintainer',
        count_at_stamp: 4,
      },
    });
    expect(writes).toEqual([{ key: 'refuse:unknown-control:Buton', record: result.after }]);
  });

  it('spawns Wrangler through Node and sends put data via a temporary file', async () => {
    const calls: Array<{
      executable: string;
      args: string[];
      recordText?: string;
      recordPath?: string;
    }> = [];
    const run = async (executable: string, args: string[]) => {
      const call = { executable, args } as typeof calls[number];
      calls.push(call);
      if (args.includes('get')) return { stdout: '{"count":1}', stderr: '' };
      const pathIndex = args.indexOf('--path');
      call.recordPath = args[pathIndex + 1];
      call.recordText = readFileSync(call.recordPath, 'utf8');
      return { stdout: '', stderr: '' };
    };
    const boundary = createWranglerBoundary({ cwd: 'C:/tmp/mcp', run });

    expect(await boundary.get('warn:Gallery.WrapCount')).toEqual({ count: 1 });
    await boundary.put('warn:Gallery.WrapCount', { count: 2 });

    expect(calls[0]).toMatchObject({
      executable: process.execPath,
      args: [
        WRANGLER_JS_PATH, 'kv', 'key', 'get', 'warn:Gallery.WrapCount',
        '--binding', 'VERIFICATION_QUEUE', '--remote', '--text',
      ],
    });
    expect(calls[1].executable).toBe(process.execPath);
    expect(calls[1].args.slice(0, 5)).toEqual([
      WRANGLER_JS_PATH, 'kv', 'key', 'put', 'warn:Gallery.WrapCount',
    ]);
    expect(calls[1].args.slice(-3)).toEqual([
      '--binding', 'VERIFICATION_QUEUE', '--remote',
    ]);
    expect(calls[1].recordText).toBe('{"count":2}');
    expect(calls[1].args).not.toContain('{"count":2}');
    expect(existsSync(dirname(calls[1].recordPath!))).toBe(false);
  });

  it('translates Wrangler missing-value failures to a null boundary result', async () => {
    const missing = Object.assign(new Error('wrangler failed'), {
      stdout: '',
      stderr: 'Value not found',
    });
    const boundary = createWranglerBoundary({ run: async () => { throw missing; } });

    await expect(boundary.get('warn:missing')).resolves.toBeNull();
    await expect(adjudicateRecord(
      { key: 'warn:missing', outcome: 'verified' },
      boundary,
    )).rejects.toThrow('verification-queue key not found: warn:missing');
  });

  it('runs the installed Wrangler JavaScript entrypoint through the production spawn helper', async () => {
    const { stdout } = await createWranglerRunner()(['--version']);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('parses the exact two-token attribution form and rejects invalid input', () => {
    expect(parseArgs(['lint:heavy-onstart:__App.OnStart', 'verified', '--by', 'Maintainer']))
      .toEqual({ key: 'lint:heavy-onstart:__App.OnStart', outcome: 'verified', by: 'Maintainer' });
    expect(() => parseArgs(['warn:X.Y', 'verified', '--by']))
      .toThrow('exactly two tokens: --by <name>');
    expect(() => parseArgs(['warn:X.Y', 'maybe'])).toThrow('invalid outcome');
  });
});
