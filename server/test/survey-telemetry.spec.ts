import {
  createExecutionContext,
  env,
  runInDurableObject,
  SELF,
  waitOnExecutionContext,
} from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import worker, { SurveyTelemetryCoordinator } from '../src/index';
import { sha256 } from '../src/core/sha256';
import type { SurveyEnvelopeV1 } from '../src/core/survey/envelope-types';
import { serializeEnvelope } from '../src/core/survey/envelope';
import { CanonicalEnvelopeError } from '../src/core/survey/validate-envelope';
import { ANALYZER_CATALOG_ALLOWLIST } from '../src/lib/survey';
import {
  handleSurveyEnvelopeRequest,
  scheduleSurveyTelemetry,
  SurveyTelemetryInputError,
  SURVEY_TELEMETRY_OBJECT_NAME,
  metricsForSurveyEnvelope,
} from '../src/lib/survey-telemetry';
import { initializeSurveyTelemetryStorage } from '../src/durable/survey-telemetry-coordinator';

const TOKEN = 'test-token';
const ID_A = '30000000-0000-4000-8000-000000000001';
const ID_B = '30000000-0000-4000-8000-000000000002';
const ID_C = '30000000-0000-4000-8000-000000000003';
const EXPECTED_MAX_SURVEY_ENVELOPE_BYTES = 262_144;
const EXPECTED_MAX_SURVEY_METRIC_COUNT = 209_715_200;

function envelope(id = ID_A, analyzer = '2.4.10-test'): SurveyEnvelopeV1 {
  return {
    envelope_schema: 'survey-envelope/1',
    privacy_schema: 'survey-minimization/1',
    id,
    manifest: {
      included_field_kinds: [
        'rule_counts',
        'opportunity_denominators',
        'delta_rule_counts',
        'extractor_control_types',
        'versions',
        'source_kind',
        'coarse_size_buckets',
        'near_miss_buckets',
      ],
    },
    versions: {
      analyzer,
      catalog: '2026-08-30T08:00:00.000Z',
    },
    source_kind: 'directory',
    size_buckets: {
      files: '2-5',
      controls: '26-100',
      findings: '1-10',
    },
    rule_counts: [{ rule_id: 'label-missing-wrap', count: 2 }],
    opportunity_denominators: [{ rule_id: 'label-missing-wrap', count: 7 }],
    delta_rule_counts: [{ rule_id: 'label-missing-wrap', resolved: 1, persisted: 0 }],
    extractor_control_types: ['Text'],
    near_miss_buckets: [
      {
        rule_id: 'unknown-control',
        reason_code: 'case-mismatch',
        edit_distance_bucket: '0',
        known_candidate: 'Text',
        count: 3,
      },
      {
        rule_id: 'unknown-property',
        control_type: 'Text',
        reason_code: 'edit-distance',
        edit_distance_bucket: '1',
        known_candidate: 'Wrap',
        count: 4,
      },
    ],
  };
}

function bytes(value = envelope()): Uint8Array {
  return new TextEncoder().encode(serializeEnvelope(value, ANALYZER_CATALOG_ALLOWLIST));
}

function namespace(): any {
  return (env as any).SURVEY_TELEMETRY;
}

function stub(): any {
  const binding = namespace();
  return binding.get(binding.idFromName(SURVEY_TELEMETRY_OBJECT_NAME));
}

function request(body: BodyInit | null, init: RequestInit = {}): Request {
  return new Request('http://example.test/survey/envelope', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${TOKEN}`,
      'content-type': 'application/json; charset=utf-8',
      ...init.headers,
    },
    body,
    ...init,
  });
}

async function json(response: Response): Promise<unknown> {
  expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
  return response.json();
}

describe('survey telemetry metric allowlist', () => {
  it('maps every permitted envelope field to collision-safe survey keys and nothing else', () => {
    expect(metricsForSurveyEnvelope(envelope())).toEqual([
      ['stats:survey', 1],
      ['survey:cohort:v1:catalog:2026-08-30T08%3A00%3A00.000Z:runs', 1],
      ['survey:cohort:v1:catalog:2026-08-30T08%3A00%3A00.000Z:rule:label-missing-wrap', 2],
      ['survey:rule:label-missing-wrap', 2],
      ['survey:opportunity:label-missing-wrap', 7],
      ['survey:delta-resolved:label-missing-wrap', 1],
      ['survey:delta-persisted:label-missing-wrap', 0],
      ['survey:extractor-type:Text', 1],
      ['survey:near-miss:unknown-control:case-mismatch:0:control=:candidate=Text', 3],
      ['survey:near-miss:unknown-property:edit-distance:1:control=Text:candidate=Wrap', 4],
      // Version keys carry only the leading major.minor; the catalog version is
      // an extraction timestamp with no major.minor prefix and stays whole.
      ['survey:version:analyzer:2.4', 1],
      ['survey:version:catalog:2026-08-30T08%3A00%3A00.000Z', 1],
      ['survey:source-kind:directory', 1],
      ['survey:size:files:2-5', 1],
      ['survey:size:controls:26-100', 1],
      ['survey:size:findings:1-10', 1],
    ]);
  });

  it('schedules the shared RPC synchronously and reports a known-missing binding', async () => {
    const canonical = bytes();
    expect(scheduleSurveyTelemetry({ MCP_AUTH_TOKEN: TOKEN }, canonical)).toBeNull();
    const rpcResult = { acknowledged: true, duplicate: false } as const;
    const rpcPromise = Promise.resolve(rpcResult);
    const calls: unknown[][] = [];
    const scheduled = scheduleSurveyTelemetry({
      SURVEY_TELEMETRY: {
        idFromName(name) {
          calls.push(['idFromName', name]);
          return 'object-id';
        },
        get(id) {
          calls.push(['get', id]);
          return {
            submit(submittedBytes, digest) {
              calls.push(['submit', submittedBytes, digest]);
              return rpcPromise;
            },
          };
        },
      },
    }, canonical);
    expect(scheduled?.digest).toBe(sha256(canonical));
    expect(scheduled?.promise).toBe(rpcPromise);
    await expect(scheduled!.promise).resolves.toEqual(rpcResult);
    expect(calls).toEqual([
      ['idFromName', SURVEY_TELEMETRY_OBJECT_NAME],
      ['get', 'object-id'],
      ['submit', canonical, sha256(canonical)],
    ]);
  });
});

describe('SurveyTelemetryCoordinator', () => {
  it('initializes empty versioned SQLite tables', async () => {
    await runInDurableObject(stub(), async (instance, state) => {
      expect(instance).toBeInstanceOf(SurveyTelemetryCoordinator);
      const tables = state.storage.sql.exec<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'survey_%' ORDER BY name",
      ).toArray();
      expect(tables).toEqual([
        { name: 'survey_aggregates' },
        { name: 'survey_runs' },
      ]);
      expect(state.storage.kv.get('survey:schema-version')).toBe(1);
      expect(state.storage.sql.exec('SELECT * FROM survey_runs').toArray()).toEqual([]);
      expect(state.storage.sql.exec('SELECT * FROM survey_aggregates').toArray()).toEqual([]);
      expect(await state.storage.getAlarm()).toBeNull();
    });
  });

  it('fails closed when storage carries a future schema marker', async () => {
    await runInDurableObject(stub(), async (_instance, state) => {
      state.storage.kv.put('survey:schema-version', 2);
      expect(() => initializeSurveyTelemetryStorage(state.storage)).toThrow(
        'Unsupported survey telemetry schema version',
      );
    });
  });

  it('stores only the run tombstone and allowlisted aggregate rows', async () => {
    const canonical = bytes();
    const digest = sha256(canonical);
    expect(await stub().submit(canonical, digest)).toEqual({
      acknowledged: true,
      duplicate: false,
    });

    await runInDurableObject(stub(), async (_instance, state) => {
      expect(state.storage.sql.exec(
        'SELECT id, digest FROM survey_runs',
      ).toArray()).toEqual([{ id: ID_A, digest }]);
      expect(state.storage.sql.exec(
        'SELECT metric_key, count FROM survey_aggregates ORDER BY metric_key',
      ).toArray()).toEqual(metricsForSurveyEnvelope(envelope()).map(([metric_key, count]) => ({
        metric_key,
        count,
      })).sort((left, right) => left.metric_key.localeCompare(right.metric_key)));
    });
  });

  it('serializes concurrent replay and increments a run exactly once', async () => {
    const canonical = bytes();
    const digest = sha256(canonical);
    const results = await Promise.all(Array.from({ length: 12 }, () => (
      stub().submit(canonical, digest)
    )));
    expect(results.filter(result => !result.duplicate)).toHaveLength(1);
    expect(results.filter(result => result.duplicate)).toHaveLength(11);
    await runInDurableObject(stub(), async (_instance, state) => {
      expect(state.storage.sql.exec(
        "SELECT count FROM survey_aggregates WHERE metric_key = 'stats:survey'",
      ).one()).toEqual({ count: 1 });
      expect(state.storage.sql.exec('SELECT COUNT(*) AS count FROM survey_runs').one())
        .toEqual({ count: 1 });
      expect(state.storage.sql.exec(
        "SELECT metric_key, count FROM survey_aggregates WHERE metric_key LIKE 'survey:cohort:%' ORDER BY metric_key",
      ).toArray()).toEqual([
        { metric_key: 'survey:cohort:v1:catalog:2026-08-30T08%3A00%3A00.000Z:rule:label-missing-wrap', count: 2 },
        { metric_key: 'survey:cohort:v1:catalog:2026-08-30T08%3A00%3A00.000Z:runs', count: 1 },
      ]);
    });
  });

  it('conflicts on the same id with changed bytes and does not make digest globally unique', async () => {
    const first = bytes(envelope(ID_A));
    const second = bytes(envelope(ID_B));
    expect(await stub().submit(first, sha256(first))).toEqual({
      acknowledged: true,
      duplicate: false,
    });
    const conflict = envelope(ID_A, '2.4.10-other');
    conflict.versions.catalog = '2026-08-31T08:00:00.000Z';
    const changed = bytes(conflict);
    expect(await stub().submit(changed, sha256(changed)))
      .toEqual({ acknowledged: false, conflict: true });
    const sharedDigest = sha256(second);
    await runInDurableObject(stub(), async (_instance, state) => {
      state.storage.sql.exec(
        'INSERT INTO survey_runs(id, digest, created_at) VALUES (?, ?, ?)',
        ID_C,
        sharedDigest,
        1,
      );
    });
    expect(await stub().submit(second, sharedDigest)).toEqual({
      acknowledged: true,
      duplicate: false,
    });
    await runInDurableObject(stub(), async (_instance, state) => {
      expect(state.storage.sql.exec('SELECT COUNT(*) AS count FROM survey_runs').one())
        .toEqual({ count: 3 });
      expect(state.storage.sql.exec(
        "SELECT count FROM survey_aggregates WHERE metric_key = 'stats:survey'",
      ).one()).toEqual({ count: 2 });
      expect(state.storage.sql.exec(
        "SELECT metric_key, count FROM survey_aggregates WHERE metric_key LIKE 'survey:cohort:%' ORDER BY metric_key",
      ).toArray()).toEqual([
        { metric_key: 'survey:cohort:v1:catalog:2026-08-30T08%3A00%3A00.000Z:rule:label-missing-wrap', count: 4 },
        { metric_key: 'survey:cohort:v1:catalog:2026-08-30T08%3A00%3A00.000Z:runs', count: 2 },
      ]);
    });
  });

  it('keeps whole catalog cohorts separate and counts zero-finding submissions', async () => {
    const first = envelope(ID_A);
    const second = envelope(ID_B);
    second.versions.catalog = '2026-08-30T08:00:00.001Z';
    second.rule_counts = [{ rule_id: 'unknown-control', count: 5 }];
    const empty = envelope(ID_C);
    empty.versions.catalog = second.versions.catalog;
    empty.rule_counts = [];
    empty.size_buckets.findings = '0';
    for (const value of [first, second, empty]) {
      const canonical = bytes(value);
      expect(await stub().submit(canonical, sha256(canonical))).toEqual({ acknowledged: true, duplicate: false });
    }
    await runInDurableObject(stub(), async (_instance, state) => {
      expect(state.storage.sql.exec(
        "SELECT metric_key, count FROM survey_aggregates WHERE metric_key LIKE 'survey:cohort:%' ORDER BY metric_key",
      ).toArray()).toEqual([
        { metric_key: 'survey:cohort:v1:catalog:2026-08-30T08%3A00%3A00.000Z:rule:label-missing-wrap', count: 2 },
        { metric_key: 'survey:cohort:v1:catalog:2026-08-30T08%3A00%3A00.000Z:runs', count: 1 },
        { metric_key: 'survey:cohort:v1:catalog:2026-08-30T08%3A00%3A00.001Z:rule:unknown-control', count: 5 },
        { metric_key: 'survey:cohort:v1:catalog:2026-08-30T08%3A00%3A00.001Z:runs', count: 2 },
      ]);
      expect(state.storage.sql.exec(
        "SELECT metric_key, count FROM survey_aggregates WHERE metric_key = 'stats:survey' OR metric_key LIKE 'survey:rule:%' ORDER BY metric_key",
      ).toArray()).toEqual([
        { metric_key: 'stats:survey', count: 3 },
        { metric_key: 'survey:rule:label-missing-wrap', count: 2 },
        { metric_key: 'survey:rule:unknown-control', count: 5 },
      ]);
    });
  });

  it('rejects a caller-supplied digest that does not match the exact bytes', async () => {
    const canonical = bytes();
    await runInDurableObject(stub(), async (instance: SurveyTelemetryCoordinator, state) => {
      await expect(instance.submit(canonical, 'a'.repeat(64))).rejects.toThrow();
      expect(state.storage.sql.exec('SELECT * FROM survey_runs').toArray()).toEqual([]);
    });
  });

  it('rolls back the tombstone and every counter when an aggregate write fails', async () => {
    expect(metricsForSurveyEnvelope(envelope()).at(-1)?.[0])
      .toBe('survey:size:findings:1-10');
    await runInDurableObject(stub(), async (instance: SurveyTelemetryCoordinator, state) => {
      state.storage.sql.exec(`
        CREATE TRIGGER reject_survey_aggregate
        BEFORE INSERT ON survey_aggregates
        WHEN NEW.metric_key = 'survey:size:findings:1-10'
          AND (SELECT COUNT(*) FROM survey_runs) = 1
          AND (SELECT COUNT(*) FROM survey_aggregates) > 0
        BEGIN
          SELECT RAISE(ABORT, 'injected aggregate failure');
        END
      `);
      const canonical = bytes();
      await expect(instance.submit(canonical, sha256(canonical))).rejects.toThrow();
      expect(state.storage.sql.exec('SELECT * FROM survey_runs').toArray()).toEqual([]);
      expect(state.storage.sql.exec('SELECT * FROM survey_aggregates').toArray()).toEqual([]);
    });
  });

  it('accepts two bounded runs without poisoning a shared aggregate', async () => {
    const firstEnvelope = envelope(ID_A);
    firstEnvelope.rule_counts[0].count = EXPECTED_MAX_SURVEY_METRIC_COUNT;
    const first = bytes(firstEnvelope);
    const secondEnvelope = envelope(ID_B);
    secondEnvelope.rule_counts[0].count = 1;
    const second = bytes(secondEnvelope);
    expect(await stub().submit(first, sha256(first))).toEqual({
      acknowledged: true,
      duplicate: false,
    });
    expect(await stub().submit(second, sha256(second))).toEqual({
      acknowledged: true,
      duplicate: false,
    });
    await runInDurableObject(stub(), async (_instance, state) => {
      expect(state.storage.sql.exec(
        "SELECT count FROM survey_aggregates WHERE metric_key = 'survey:rule:label-missing-wrap'",
      ).one()).toEqual({ count: EXPECTED_MAX_SURVEY_METRIC_COUNT + 1 });
    });
  });

  it('rolls back a run when an accumulated SQLite integer would overflow', async () => {
    await runInDurableObject(stub(), async (instance: SurveyTelemetryCoordinator, state) => {
      state.storage.sql.exec(`
        INSERT INTO survey_aggregates(metric_key, count)
        VALUES ('stats:survey', 9223372036854775807)
      `);
      const canonical = bytes();
      await expect(instance.submit(canonical, sha256(canonical))).rejects.toThrow();
      expect(state.storage.sql.exec('SELECT * FROM survey_runs').toArray()).toEqual([]);
      expect(state.storage.sql.exec(`
        SELECT CAST(count AS TEXT) AS count
        FROM survey_aggregates
        WHERE metric_key = 'stats:survey'
      `).one()).toEqual({ count: '9223372036854775807' });
      expect(state.storage.sql.exec('SELECT COUNT(*) AS count FROM survey_aggregates').one())
        .toEqual({ count: 1 });
    });
  });

  it('rolls back old counters and tombstones when a joint cohort counter overflows', async () => {
    await runInDurableObject(stub(), async (instance: SurveyTelemetryCoordinator, state) => {
      state.storage.sql.exec(`
        INSERT INTO survey_aggregates(metric_key, count)
        VALUES ('survey:cohort:v1:catalog:2026-08-30T08%3A00%3A00.000Z:rule:label-missing-wrap', 9223372036854775807)
      `);
      const canonical = bytes();
      await expect(instance.submit(canonical, sha256(canonical))).rejects.toThrow();
      expect(state.storage.sql.exec('SELECT * FROM survey_runs').toArray()).toEqual([]);
      expect(state.storage.sql.exec('SELECT metric_key, CAST(count AS TEXT) AS count FROM survey_aggregates').toArray())
        .toEqual([{
          metric_key: 'survey:cohort:v1:catalog:2026-08-30T08%3A00%3A00.000Z:rule:label-missing-wrap',
          count: '9223372036854775807',
        }]);
    });
  });
});

describe('POST /survey/envelope', () => {
  it('hashes and acknowledges the exact canonical bytes, then returns a duplicate replay', async () => {
    const canonical = bytes();
    const first = await SELF.fetch(request(canonical));
    expect(first.status).toBe(200);
    expect(await json(first)).toEqual({ acknowledged: true, duplicate: false });
    const replay = await SELF.fetch(request(canonical));
    expect(replay.status).toBe(200);
    expect(await json(replay)).toEqual({ acknowledged: true, duplicate: true });
    await runInDurableObject(stub(), async (_instance, state) => {
      expect(state.storage.sql.exec('SELECT digest FROM survey_runs WHERE id = ?', ID_A).one())
        .toEqual({ digest: sha256(canonical) });
    });
  });

  it('never reads or writes validation telemetry KV', async () => {
    const sentinel = '{"customer":"poison","runs":17}';
    await env.VERIFICATION_QUEUE.put('stats:validate', sentinel);
    const response = await SELF.fetch(request(bytes()));
    expect(response.status).toBe(200);
    expect(await env.VERIFICATION_QUEUE.get('stats:validate')).toBe(sentinel);
    const surveyKeys = await env.VERIFICATION_QUEUE.list({ prefix: 'survey:' });
    expect(surveyKeys.keys).toEqual([]);
  });

  it('returns a stable 405 for other methods on the known endpoint', async () => {
    const response = await SELF.fetch('http://example.test/survey/envelope');
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
    expect(await json(response)).toEqual({ error: 'method-not-allowed' });
  });

  it('keeps health unauthenticated and fails closed for missing or wrong auth', async () => {
    expect((await SELF.fetch('http://example.test/')).status).toBe(200);
    const wrong = await SELF.fetch(request(bytes(), {
      headers: {
        authorization: 'Bearer wrong-token',
        'content-type': 'application/json',
      },
    }));
    expect(wrong.status).toBe(401);
    expect(await json(wrong)).toEqual({ error: 'unauthorized' });

    const ctx = createExecutionContext();
    const missing = await worker.fetch(request(bytes()), {
      ...(env as any),
      MCP_AUTH_TOKEN: undefined,
    }, ctx);
    expect(missing.status).toBe(503);
    expect(await json(missing)).toEqual({ error: 'server-not-configured' });
    await waitOnExecutionContext(ctx);
  });

  it('returns 503 without consuming a body when the coordinator binding is absent', async () => {
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(bytes());
        controller.close();
      },
    });
    const ctx = createExecutionContext();
    const bare = { ...(env as any), SURVEY_TELEMETRY: undefined };
    const unconsumed = request(body);
    const response = await worker.fetch(unconsumed, bare, ctx);
    expect(response.status).toBe(503);
    expect(await json(response)).toEqual({ error: 'server-not-configured' });
    expect(unconsumed.bodyUsed).toBe(false);
    expect(pulls).toBeLessThanOrEqual(1);
    await waitOnExecutionContext(ctx);
  });

  it.each([
    ['application/json', 200],
    ['Application/JSON; Charset="utf-8"', 200],
    ['text/plain', 415],
    ['application/json; profile=customer', 415],
  ])('handles media type %s with status %i', async (contentType, status) => {
    const response = await SELF.fetch(request(bytes(), {
      headers: {
        authorization: `Bearer ${TOKEN}`,
        'content-type': contentType,
      },
    }));
    expect(response.status).toBe(status);
    if (status === 415) {
      expect(await json(response)).toEqual({ error: 'unsupported-media-type' });
    }
  });

  it('rejects invalid and noncanonical envelopes before coordinator mutation', async () => {
    const canonical = new TextDecoder().decode(bytes());
    const noncanonical = new TextEncoder().encode(canonical.replace(/\n$/, ''));
    const invalid = new TextEncoder().encode(canonical.replace(
      '"source_kind": "directory"',
      '"source_kind": "customer-secret"',
    ));
    for (const body of [noncanonical, invalid]) {
      const response = await SELF.fetch(request(body));
      expect(response.status).toBe(400);
      expect(await json(response)).toEqual({ error: 'invalid-envelope' });
    }
    await runInDurableObject(stub(), async (_instance, state) => {
      expect(state.storage.sql.exec('SELECT * FROM survey_runs').toArray()).toEqual([]);
    });
  });

  it.each([
    ['producer bound', '209715201'],
    ['unsafe integer', '9007199254740992'],
  ])('rejects a canonical %s count before coordinator mutation', async (_label, count) => {
    const canonical = new TextDecoder().decode(bytes());
    const unsafe = new TextEncoder().encode(canonical.replace(
      '"count": 2',
      `"count": ${count}`,
    ));
    const response = await SELF.fetch(request(unsafe));
    expect(response.status).toBe(400);
    expect(await json(response)).toEqual({ error: 'invalid-envelope' });
  });

  it('buffers at most the configured cap plus one byte for a chunked oversized body', async () => {
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array(64 * 1024));
      },
      cancel() {},
    });
    const response = await SELF.fetch(request(body));
    expect(response.status).toBe(413);
    expect(await json(response)).toEqual({ error: 'payload-too-large' });
    expect(pulls).toBeLessThanOrEqual(
      Math.ceil((EXPECTED_MAX_SURVEY_ENVELOPE_BYTES + 1) / (64 * 1024)) + 1,
    );
  });

  it('keeps 413 after best-effort cancellation rejects', async () => {
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(64 * 1024));
      },
      cancel() {
        throw new Error('cleanup failure');
      },
    });
    const response = await handleSurveyEnvelopeRequest(request(body), env as any);
    expect(response.status).toBe(413);
    expect(await json(response)).toEqual({ error: 'payload-too-large' });
  });

  it('enforces the literal byte boundary through HTTP, scheduling, and direct RPC', async () => {
    const exact = new Uint8Array(EXPECTED_MAX_SURVEY_ENVELOPE_BYTES);
    const oversized = new Uint8Array(EXPECTED_MAX_SURVEY_ENVELOPE_BYTES + 1);

    const exactResponse = await SELF.fetch(request(exact));
    expect(exactResponse.status).toBe(400);
    expect(await json(exactResponse)).toEqual({ error: 'invalid-envelope' });
    const oversizedResponse = await SELF.fetch(request(oversized));
    expect(oversizedResponse.status).toBe(413);
    expect(await json(oversizedResponse)).toEqual({ error: 'payload-too-large' });

    expect(() => scheduleSurveyTelemetry(env as any, exact)).toThrow(SurveyTelemetryInputError);
    expect(() => scheduleSurveyTelemetry(env as any, oversized)).toThrow(RangeError);
    await runInDurableObject(stub(), async (instance: SurveyTelemetryCoordinator) => {
      await expect(instance.submit(exact, sha256(exact))).rejects.toThrow(CanonicalEnvelopeError);
      await expect(instance.submit(oversized, sha256(oversized))).rejects.toThrow(TypeError);
    });
  });

  it('does not trust a lying small Content-Length on an oversized stream', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(EXPECTED_MAX_SURVEY_ENVELOPE_BYTES + 1));
        controller.close();
      },
    });
    const response = await SELF.fetch(request(body, {
      headers: {
        authorization: `Bearer ${TOKEN}`,
        'content-type': 'application/json',
        'content-length': '1',
      },
    }));
    expect(response.status).toBe(413);
    expect(await json(response)).toEqual({ error: 'payload-too-large' });
  });

  it('returns 409 for a canonical same-id mutation and 503 on storage failure', async () => {
    const first = bytes();
    expect((await SELF.fetch(request(first))).status).toBe(200);
    const conflict = await SELF.fetch(request(bytes(envelope(ID_A, '2.4.10-other'))));
    expect(conflict.status).toBe(409);
    expect(await json(conflict)).toEqual({ error: 'envelope-conflict' });

    await runInDurableObject(stub(), async (_instance, state) => {
      state.storage.sql.exec(`
        CREATE TRIGGER reject_next_survey_run
        BEFORE INSERT ON survey_runs
        BEGIN
          SELECT RAISE(ABORT, 'injected storage failure');
        END
      `);
    });
    const unavailable = await SELF.fetch(request(bytes(envelope(ID_B))));
    expect(unavailable.status).toBe(503);
    expect(await json(unavailable)).toEqual({ error: 'telemetry-unavailable' });
  });
});
