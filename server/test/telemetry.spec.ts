import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  readValidationStats,
  readVerificationQueue,
  recordValidationTelemetry,
} from '../src/lib/telemetry';
import { WORKER_VERSION } from '../src/lib/release';
import { CATALOG_VERSION } from '../src/generated/catalog';
import { validateFiles, type Issue } from '../src/lib/validator';
import { getVerificationQueue } from '../src/tools/queue';
import { validateYaml } from '../src/tools/validator';

const warn = (type: string, property: string, rule?: string): Issue => ({
  level: 'WARN', file: 'a.pa.yaml', line: 1, control: 'x', type, property,
  detail: 'test', ...(rule ? { rule } : {}),
});

const record = async (input: Parameters<typeof recordValidationTelemetry>[2]) => {
  const ctx = createExecutionContext();
  recordValidationTelemetry(env, ctx, input);
  await waitOnExecutionContext(ctx);
};

const recordWith = async (kv: unknown, input: Parameters<typeof recordValidationTelemetry>[2]) => {
  const pending: Promise<unknown>[] = [];
  const ctx = {
    waitUntil(promise: Promise<unknown>) { pending.push(promise); },
  } as ExecutionContext;
  recordValidationTelemetry({ VERIFICATION_QUEUE: kv } as Env, ctx, input);
  await Promise.all(pending);
};

beforeEach(async () => {
  const listed = await env.VERIFICATION_QUEUE.list({ limit: 1000 });
  await Promise.all(listed.keys.map(key => env.VERIFICATION_QUEUE.delete(key.name)));
});

describe('gate telemetry v2', () => {
  it('deduplicates count by run while retaining raw occurrences and release metadata', async () => {
    await record({
      files: 1,
      issues: [
        warn('Gallery', 'WrapCount'),
        warn('Gallery', 'WrapCount'),
        warn('Label', 'Wrap', 'label-missing-wrap'),
      ],
    });

    const queue = await readVerificationQueue(env);
    expect(queue.find(entry => entry.key === 'warn:Gallery.WrapCount')).toMatchObject({
      count: 1,
      occurrences: 2,
      worker_version: WORKER_VERSION,
      catalog_version: CATALOG_VERSION,
    });
    expect(queue.find(entry => entry.key === 'warn:Gallery.WrapCount')?.first_seen).toBeTruthy();
    expect(queue.find(entry => entry.key === 'lint:label-missing-wrap:Label.Wrap')).toMatchObject({
      count: 1,
      occurrences: 1,
    });
  });

  it('upgrades a v1 record without inventing first_seen', async () => {
    const oldSeen = '2026-07-01T00:00:00.000Z';
    await env.VERIFICATION_QUEUE.put('warn:Gallery.WrapCount', JSON.stringify({ count: 5, last_seen: oldSeen }));

    await record({ files: 1, issues: [warn('Gallery', 'WrapCount'), warn('Gallery', 'WrapCount')] });

    const upgraded = (await readVerificationQueue(env, { prefix: 'warn:' }))[0];
    expect(upgraded).toMatchObject({
      key: 'warn:Gallery.WrapCount',
      count: 6,
      occurrences: 7,
      worker_version: WORKER_VERSION,
      catalog_version: CATALOG_VERSION,
    });
    expect(upgraded).not.toHaveProperty('first_seen');
  });

  it('stores near_miss only for refusal paths that ran did-you-mean', async () => {
    const result = validateFiles([{
      name: 'unknown.pa.yaml',
      content: `Screens:\n  Main:\n    Children:\n      - typo:\n          Control: Labl\n      - stale:\n          Control: Zzzzzzzz\n`,
    }]);
    const typo = result.issues.find(issue => issue.type === 'Labl');
    const stale = result.issues.find(issue => issue.type === 'Zzzzzzzz');
    expect(typo).toMatchObject({ rule: 'unknown-control', did_you_mean: 'Label', nearMiss: true });
    expect(stale).toMatchObject({ rule: 'unknown-control', nearMiss: false });

    const nonDidYouMean: Issue = {
      level: 'REFUSE', file: 'bad.pa.yaml', line: 1, control: 'x', type: 'Gallery',
      detail: 'bad variant', rule: 'unknown-variant',
    };
    await record({ files: 2, issues: [...result.issues, nonDidYouMean] });

    const queue = await readVerificationQueue(env, { prefix: 'refuse:' });
    expect(queue.find(entry => entry.key === 'refuse:unknown-control:Labl')?.near_miss).toBe(true);
    expect(queue.find(entry => entry.key === 'refuse:unknown-control:Zzzzzzzz')?.near_miss).toBe(false);
    expect(queue.find(entry => entry.key === 'refuse:unknown-variant:Gallery')).not.toHaveProperty('near_miss');
  });

  it('accumulates natural opportunity denominators inside stats:validate', async () => {
    await record({
      files: 2,
      issues: [],
      opportunities: () => ({ 'duplicate-formula': 6, 'heavy-onstart': 1, inactive: 0 }),
    });
    await record({
      files: 1,
      issues: [
        warn('Label', 'Wrap', 'label-missing-wrap'),
        {
          level: 'REFUSE', file: 'bad.pa.yaml', line: 1, control: 'x', type: 'Labl',
          detail: 'unknown', rule: 'unknown-control', nearMiss: true,
        },
      ],
      opportunities: () => ({ 'duplicate-formula': 4 }),
    });

    expect(await readValidationStats(env)).toMatchObject({
      runs: 2,
      files: 3,
      clear_runs: 1,
      warn_runs: 1,
      refuse_runs: 1,
      warn_issues: 1,
      refuse_issues: 1,
      opportunities: {
        'duplicate-formula': 10,
        'heavy-onstart': 1,
      },
      worker_version: WORKER_VERSION,
      catalog_version: CATALOG_VERSION,
    });
    expect((await readValidationStats(env))?.opportunities).not.toHaveProperty('inactive');
    expect((await env.VERIFICATION_QUEUE.list({ prefix: 'opp:' })).keys).toHaveLength(0);
  });

  it('does not evaluate denominator work when the KV binding is absent', () => {
    let evaluations = 0;
    let scheduled = 0;
    const ctx = {
      waitUntil() { scheduled++; },
    } as unknown as ExecutionContext;

    recordValidationTelemetry({} as Env, ctx, {
      files: 1,
      issues: [],
      opportunities: () => { evaluations++; return {}; },
    });

    expect(evaluations).toBe(0);
    expect(scheduled).toBe(0);
  });

  it('uses exactly one stats get and one stats put for a CLEAR run', async () => {
    const operations: string[] = [];
    const kv = {
      get: async (key: string) => { operations.push(`get:${key}`); return null; },
      put: async (key: string) => { operations.push(`put:${key}`); },
    };

    await recordWith(kv, { files: 1, issues: [], opportunities: () => ({ inactive: 0 }) });

    expect(operations).toEqual(['get:stats:validate', 'put:stats:validate']);
  });

  it('isolates every issue key so one KV failure does not drop the others', async () => {
    const puts: string[] = [];
    const kv = {
      get: async (key: string) => {
        if (key === 'warn:Broken.Bad') throw new Error('transient read failure');
        return null;
      },
      put: async (key: string) => { puts.push(key); },
    };

    await recordWith(kv, {
      files: 1,
      issues: [warn('Broken', 'Bad'), warn('Gallery', 'WrapCount')],
    });

    expect(puts).toContain('warn:Gallery.WrapCount');
    expect(puts).toContain('stats:validate');
    expect(puts).not.toContain('warn:Broken.Bad');
  });

  it('returns stats as a header and hides adjudicated entries by default', async () => {
    await record({ files: 1, issues: [warn('Gallery', 'TemplateFill')] });
    await env.VERIFICATION_QUEUE.put('warn:Timer.AutoPause', JSON.stringify({
      count: 7,
      occurrences: 7,
      last_seen: '2026-08-11T00:00:00.000Z',
      adjudication: {
        outcome: 'verified', at: '2026-08-11T01:00:00.000Z', by: 'Maintainer', count_at_stamp: 7,
      },
    }));
    await record({ files: 1, issues: [warn('Timer', 'AutoPause')] });

    const ctx = createExecutionContext();
    const defaultResult = await getVerificationQueue.handler({ prefix: 'warn:' }, { env, ctx });
    const defaultBody = JSON.parse(defaultResult.content[0].text);
    expect(defaultBody.stats).toMatchObject({ runs: 2, warn_runs: 2, opportunities: {} });
    expect(defaultBody.entries.map((entry: any) => entry.key)).not.toContain('warn:Timer.AutoPause');

    const closedResult = await getVerificationQueue.handler(
      { prefix: 'warn:', include_adjudicated: true },
      { env, ctx },
    );
    const closedBody = JSON.parse(closedResult.content[0].text);
    expect(closedBody.entries.find((entry: any) => entry.key === 'warn:Timer.AutoPause'))
      .toMatchObject({
        count: 8,
        occurrences: 8,
        adjudication: { outcome: 'verified', by: 'Maintainer', count_at_stamp: 7 },
      });
  });

  it('allow-lists queue families by default while honoring an explicit prefix', async () => {
    await env.VERIFICATION_QUEUE.put('warn:Gallery.WrapCount', JSON.stringify({ count: 1, last_seen: 'now' }));
    await env.VERIFICATION_QUEUE.put('opp:legacy-rule', JSON.stringify({ count: 99, last_seen: 'now' }));
    await env.VERIFICATION_QUEUE.put('future:internal', JSON.stringify({ count: 100, last_seen: 'now' }));

    expect((await readVerificationQueue(env)).map(entry => entry.key))
      .toEqual(['warn:Gallery.WrapCount']);
    expect((await readVerificationQueue(env, { prefix: 'future:' })).map(entry => entry.key))
      .toEqual(['future:internal']);
  });

  it('keeps control-level lint keys free of a trailing dot', async () => {
    const issue: Issue = {
      level: 'WARN', file: 'a.pa.yaml', line: 1, control: 'lblX', type: 'Label',
      detail: 'no Wrap', rule: 'label-missing-wrap',
    };
    await record({ files: 1, issues: [issue] });

    const queue = await readVerificationQueue(env);
    expect(queue.find(entry => entry.key === 'lint:label-missing-wrap:Label')?.count).toBe(1);
    expect(queue.some(entry => entry.key.endsWith('.'))).toBe(false);
  });

  it('computes delegation denominators per property with rule-identical gates', () => {
    const content = `Screens:\n  Main:\n    Children:\n      - gal:\n          Control: Gallery\n          Properties:\n            Items: =FirstN(Accounts, 5) & LastN(Accounts, 5) & Filter(Accounts, Name in ["A"]) & LookUp(Accounts, ID > 1)\n            Text: =FirstN(Accounts, 5)\n            Fill: =RGBA(0,0,0,0) & RGBA(255, 255, 255, 1) & RGBA(1, 2, 3, 1)\n`;

    const withoutMap = validateFiles([{ name: 'screen.pa.yaml', content }]).opportunities();
    expect(withoutMap['delegation-firstn-on-source']).toBe(1);
    for (const rule of [
      'delegation-sharepoint-search',
      'delegation-sharepoint-in',
      'delegation-sharepoint-isblank',
      'delegation-sharepoint-text-functions',
      'delegation-sharepoint-id-operator',
    ]) expect(withoutMap[rule]).toBe(0);

    const mapped = validateFiles(
      [{ name: 'screen.pa.yaml', content }],
      { datasources: { Accounts: 'sharepoint' } },
    ).opportunities();
    expect(mapped['delegation-firstn-on-source']).toBe(1);
    expect(mapped['delegation-sharepoint-in']).toBe(1);
    expect(mapped['delegation-sharepoint-isblank']).toBe(1);
    expect(mapped['delegation-sharepoint-id-operator']).toBe(1);
    expect(mapped['repeated-color-literal']).toBe(1);
    expect(mapped).not.toHaveProperty('duplicate-formula-in-gallery');
  });

  it('keeps the lazy opportunity thunk and nearMiss out of validate_yaml JSON', () => {
    const raw = validateFiles([{
      name: 'unknown.pa.yaml',
      content: `Screens:\n  Main:\n    Children:\n      - typo:\n          Control: Labl\n`,
    }]);
    expect(raw.opportunities).toBeTypeOf('function');

    const response = validateYaml.handler({
      files: [{ name: 'unknown.pa.yaml', content: `Screens:\n  Main:\n    Children:\n      - typo:\n          Control: Labl\n` }],
    });
    expect(response.content[0].text).not.toContain('nearMiss');
    expect(response.content[0].text).not.toContain('nearMissTelemetry');
    expect(response.content[0].text).not.toContain('opportunities');
    expect(JSON.parse(response.content[0].text).issues.refuse[0])
      .toMatchObject({ rule: 'unknown-control', did_you_mean: 'Label' });
  });

  it('records only heavy-onstart when the merged OnStart rules both match', async () => {
    const ctx = createExecutionContext();
    await validateYaml.handler({
      files: [{
        name: 'App.pa.yaml',
        content: `App:\n  OnError: =false\n  OnStart: |-\n    =ClearCollect(colA, A); ClearCollect(colB, B); Collect(colC, C); Set(gblReady, true); Set(gblMode, "ready")\n`,
      }],
    }, { env, ctx });
    await waitOnExecutionContext(ctx);

    const lintEntries = await readVerificationQueue(env, { prefix: 'lint:' });
    expect(lintEntries.map(entry => entry.key)).toEqual(['lint:heavy-onstart:__App.OnStart']);
    expect((await readValidationStats(env))?.opportunities['heavy-onstart']).toBe(1);
  });

  it('keeps the documented warn: prefix for unverified-augmentation', async () => {
    await record({
      files: 1,
      issues: [{
        level: 'WARN', file: 'a.pa.yaml', line: 3, control: 'gal', type: 'Gallery',
        property: 'WrapCount', rule: 'unverified-augmentation', detail: 'x',
      }],
    });

    const keys = (await env.VERIFICATION_QUEUE.list({})).keys.map(k => k.name);
    expect(keys).toContain('warn:Gallery.WrapCount');
    expect(keys.some(k => k.startsWith('lint:unverified-augmentation'))).toBe(false);
  });
});
