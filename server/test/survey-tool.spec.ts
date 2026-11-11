import { createExecutionContext, env, SELF, waitOnExecutionContext } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import {
  MAX_SURVEY_DATASOURCE_KEYS_BYTES,
  MAX_SURVEY_DATASOURCE_KEY_BYTES,
  MAX_SURVEY_DATASOURCES,
  MAX_SURVEY_FILE_NAMES_BYTES,
  MAX_SURVEY_FILE_NAME_BYTES,
  MAX_SURVEY_FILES,
  MAX_SURVEY_REQUEST_ID_BYTES,
  MAX_SURVEY_RESPONSE_BYTES,
  MAX_SURVEY_YAML_CODE_UNITS,
  countJsonUtf8Bytes,
  countUtf8StringBytes,
  createDistinctSurveyIds,
  createSurveyApp,
  surveyApp,
  type SurveyToolResult,
} from '../src/tools/survey';
import {
  createWorker,
  serializeSurveyAppJsonRpcResponse,
} from '../src/index';
import { CATALOG_VERSION } from '../src/generated/catalog';
import { sha256 } from '../src/core/sha256';
import { assertEmittableReport } from '../src/core/survey/emittable-report';
import { buildReport } from '../src/core/survey/build-report';
import {
  MIN_EMITTED_FINDING_BYTES,
  SurveyOutputBudget,
} from '../src/core/survey/output-budget';
import { renderTechnical } from '../src/core/survey/render-technical';
import { assertValidEnvelope } from '../src/core/survey/validate-envelope';
import { assertValidReport } from '../src/core/survey/validate-report';
import { ANALYZER_CATALOG_ALLOWLIST, analyzeSurveyFiles } from '../src/lib/survey';

const encoder = new TextEncoder();
const byteLength = (value: string): number => encoder.encode(value).byteLength;

const VALID_FILE = {
  name: 'Src/Main.pa.yaml',
  content: `- Main:
    Control: Screen
    Children:
      - Action:
          Control: Button
          Properties:
            Text: ="ok"
`,
};

const parseToolResult = (value: any): SurveyToolResult =>
  JSON.parse(value.content[0].text) as SurveyToolResult;

const EXISTING_EXPORT_FILE = {
  name: 'Screens/ExistingExport.pa.yaml',
  content: 'Screens:\n  Main:\n    Children:\n      - Action:\n          Control: Button\n          Properties:\n            Text: ="existing-export"\n            OnSelect: =Set(gblReady, true);Back()\n',
};

const call = async (
  args: unknown,
  extra: { env: any; ctx: any } = { env: {}, ctx: { waitUntil() {} } },
): Promise<any> => surveyApp.handler(args as any, extra as any);

const collisionFiles = (count: number, longNames: boolean) =>
  Array.from({ length: count }, (_, index) => {
    const shortName = 'Src/C' + String(index).padStart(3, '0') + '.pa.yaml';
    const prefix = 'Src/' + String(index).padStart(3, '0') + '-';
    return {
      name: longNames ? prefix + 'n'.repeat(128 - prefix.length) : shortName,
      content:
        '- Main:\n'
        + '    Control: Screen\n'
        + '    Children:\n'
        + '      - SharedCollision:\n'
        + '          Control: Button\n',
    };
  });

const rpc = (body: unknown) => new Request('http://x/mcp', {
  method: 'POST',
  headers: {
    authorization: 'Bearer test-token',
    'content-type': 'application/json',
  },
  body: JSON.stringify(body),
});

const streamedRpc = (
  chunks: readonly Uint8Array[],
  headers: Record<string, string> = {},
) => new Request('http://x/mcp', {
  method: 'POST',
  headers: {
    authorization: 'Bearer test-token',
    'content-type': 'application/json',
    ...headers,
  },
  body: new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  }),
} as RequestInit);

describe('survey_app input boundary', () => {
  it('bounds the authenticated byte stream before UTF-8 decode or JSON parsing', async () => {
    const module = await import('../src/index') as typeof import('../src/index') & {
      MAX_MCP_REQUEST_BYTES?: number;
      MAX_SEMANTIC_SURVEY_REQUEST_BYTES?: number;
    };
    expect(module.MAX_MCP_REQUEST_BYTES).toBe(10_485_760);
    expect(module.MAX_SEMANTIC_SURVEY_REQUEST_BYTES).toBe(9_867_907);
    expect(
      6 * 1_500_000 + 2 * 65_536 + 6 * 65_536 + 343_619,
    ).toBe(9_867_907);

    const chunk = new Uint8Array(65_536).fill(0x20);
    const chunks = Array.from({ length: 160 }, () => chunk);
    chunks.push(Uint8Array.of(0x20));
    let touched = 0;
    const workerEnv = {
      MCP_AUTH_TOKEN: 'test-token',
      VERIFICATION_QUEUE: new Proxy({}, {
        get() { touched++; throw new Error('validation KV must stay isolated'); },
      }),
      SURVEY_TELEMETRY: new Proxy({}, {
        get() { touched++; throw new Error('survey telemetry must stay isolated'); },
      }),
    } as any;
    for (const headers of [
      {},
      { 'content-length': '2' },
      { 'content-length': '10485761' },
    ]) {
      const response = await createWorker().fetch(
        streamedRpc(chunks, headers) as any,
        workerEnv,
        { waitUntil() { touched++; } } as any,
      );
      expect(response.status).toBe(413);
      expect(await response.text()).toBe(
        '{"jsonrpc":"2.0","id":null,"error":{"code":-32600,"message":"Request too large: authenticated MCP bodies are limited to 10485760 bytes"}}',
      );
    }

    const valid = encoder.encode(JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'tools/list',
    }));
    const exactPadding = new Uint8Array(10_485_760 - valid.byteLength).fill(0x20);
    const exact = await createWorker().fetch(
      streamedRpc(
        [valid, exactPadding],
        { 'content-length': '10485760' },
      ) as any,
      workerEnv,
      { waitUntil() { touched++; } } as any,
    );
    expect(exact.status).toBe(200);
    expect((await exact.json() as any).result.tools).toHaveLength(21);
    expect(touched).toBe(0);
  });

  it('accepts a harmless request split into one-byte stream chunks', async () => {
    const bytes = encoder.encode(JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'tools/list',
    }));
    const response = await createWorker().fetch(streamedRpc(
      [...bytes].map(byte => Uint8Array.of(byte)),
    ) as any, {
      MCP_AUTH_TOKEN: 'test-token',
    } as any, { waitUntil() {} } as any);
    expect(response.status).toBe(200);
    expect((await response.json() as any).result.tools).toHaveLength(21);
  });

  it('keeps a literal worst-escaping semantically maximal survey request below 10 MiB', () => {
    const fillToAggregate = (
      count: number,
      totalBytes: number,
      maxBytes: number,
      prefix: (index: number) => string,
      filler: string,
    ): string[] => {
      const values = Array.from({ length: count }, (_, index) => prefix(index));
      let remaining = totalBytes - values.reduce((sum, value) => sum + byteLength(value), 0);
      for (let index = 0; index < values.length && remaining > 0; index++) {
        const available = maxBytes - byteLength(values[index]);
        const added = Math.min(available, remaining);
        values[index] += filler.repeat(added);
        remaining -= added;
      }
      expect(remaining).toBe(0);
      return values;
    };
    const names = fillToAggregate(512, 65_536, 1_024, index => `Src/${index}-`, '"');
    const datasourceKeys = fillToAggregate(512, 65_536, 1_024, index => `${index}-`, '\u0000');
    const files = names.map((name, index) => ({
      name,
      content: index === 0 ? '\u0000'.repeat(1_500_000) : '',
    }));
    const datasources = Object.fromEntries(datasourceKeys.map(key => [key, 'sql']));
    const id = '\u0000'.repeat(170) + 'aa';
    const request = {
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: { name: 'survey_app', arguments: { files, datasources, submit_envelope: false } },
    };

    expect(files).toHaveLength(512);
    expect(files.reduce((sum, file) => sum + file.content.length, 0)).toBe(1_500_000);
    expect(names.reduce((sum, name) => sum + byteLength(name), 0)).toBe(65_536);
    expect(datasourceKeys.reduce((sum, key) => sum + byteLength(key), 0)).toBe(65_536);
    expect(byteLength(JSON.stringify(id))).toBe(1_024);
    expect(byteLength(JSON.stringify(request))).toBe(9_529_184);
    expect(9_529_184).toBeLessThanOrEqual(9_867_907);
    expect(9_529_184).toBeLessThan(10_485_760);
  });

  it('fatal-decodes authenticated MCP bytes before parsing without side effects', async () => {
    let touched = 0;
    const response = await createWorker().fetch(streamedRpc([
      Uint8Array.of(0x7b, 0x22, 0xc3, 0x28, 0x22, 0x7d),
    ]) as any, {
      MCP_AUTH_TOKEN: 'test-token',
      VERIFICATION_QUEUE: new Proxy({}, {
        get() { touched++; throw new Error('validation KV must stay isolated'); },
      }),
      SURVEY_TELEMETRY: new Proxy({}, {
        get() { touched++; throw new Error('survey telemetry must stay isolated'); },
      }),
    } as any, { waitUntil() { touched++; } } as any);

    expect(response.status).toBe(400);
    expect(await response.text()).toBe(
      '{"jsonrpc":"2.0","id":null,"error":{"code":-32700,"message":"Parse error: invalid JSON"}}',
    );
    expect(touched).toBe(0);
  });

  it('pins every public input/transport limit as a contract literal', () => {
    expect(MAX_SURVEY_FILES).toBe(512);
    expect(MAX_SURVEY_YAML_CODE_UNITS).toBe(1_500_000);
    expect(MAX_SURVEY_FILE_NAME_BYTES).toBe(1_024);
    expect(MAX_SURVEY_FILE_NAMES_BYTES).toBe(65_536);
    expect(MAX_SURVEY_DATASOURCES).toBe(512);
    expect(MAX_SURVEY_DATASOURCE_KEY_BYTES).toBe(1_024);
    expect(MAX_SURVEY_DATASOURCE_KEYS_BYTES).toBe(65_536);
    expect(MAX_SURVEY_REQUEST_ID_BYTES).toBe(1_024);
    expect(MAX_SURVEY_RESPONSE_BYTES).toBe(8_388_608);
  });

  it('publishes a recursively closed schema with the declared cardinality bounds', () => {
    expect(surveyApp.inputSchema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['files'],
      properties: {
        files: {
          type: 'array',
          minItems: 1,
          maxItems: MAX_SURVEY_FILES,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['name', 'content'],
          },
        },
        datasources: {
          type: 'object',
          maxProperties: MAX_SURVEY_DATASOURCES,
        },
        submit_envelope: { type: 'boolean', default: false },
        profile: { type: 'string', enum: ['shared', 'existing-export'], default: 'shared' },
      },
    });
  });

  it.each([
    { profile: null }, { profile: false }, { profile: 1 }, { profile: {} }, { profile: [] },
    { profile: '' }, { profile: 'default' }, { profile: 'unknown' },
    { profile: 'EXISTING-EXPORT' }, { profile: ' existing-export ' },
  ])('rejects invalid profile $profile through the runtime boundary', async ({ profile }) => {
    expect(await call({ files: [VALID_FILE], profile })).toEqual({
      content: [{ type: 'text', text: 'survey input error: profile must be shared or existing-export' }],
      isError: true,
    });
  });

  it('accepts a 512-file zero-content flood while rejecting file 513', async () => {
    expect(await call({ files: [] })).toEqual({
      content: [{
        type: 'text',
        text: 'survey input error: files must contain between 1 and 512 entries',
      }],
      isError: true,
    });
    const files = Array.from({ length: MAX_SURVEY_FILES }, (_, index) => ({
      name: `Src/Empty-${index}.pa.yaml`,
      content: '',
    }));
    const accepted = await call({ files });
    expect(accepted.isError).toBeUndefined();
    expect(parseToolResult(accepted).report.identity.files).toHaveLength(MAX_SURVEY_FILES);

    const rejected = await call({ files: [...files, { name: 'Src/one-too-many.pa.yaml', content: '' }] });
    expect(rejected).toEqual({
      content: [{ type: 'text', text: `survey input error: files must contain between 1 and ${MAX_SURVEY_FILES} entries` }],
      isError: true,
    });
  });

  it('pins exact aggregate file-name UTF-8 bytes and rejects one over', async () => {
    const names = Array.from({ length: 512 }, (_, index) => {
      const prefix = 'Src/' + String(index).padStart(3, '0') + '-';
      return prefix + 'n'.repeat(128 - prefix.length);
    });
    expect(names.reduce((sum, name) => sum + byteLength(name), 0)).toBe(65_536);
    const exact = await call({ files: names.map(name => ({ name, content: '' })) });
    expect(exact.isError).toBeUndefined();

    const oneOver = [...names];
    oneOver[0] = oneOver[0] + 'x';
    const rejected = await call({
      files: oneOver.map(name => ({ name, content: '' })),
    });
    expect(rejected.content[0].text).toBe(
      'survey input error: file names exceed 65536 aggregate UTF-8 bytes',
    );
  });

  it('counts YAML in JavaScript code units, including four-byte Unicode', async () => {
    const exact = await call({
      files: [{ name: 'Src/Unicode.pa.yaml', content: '😀'.repeat(MAX_SURVEY_YAML_CODE_UNITS / 2) }],
    });
    expect(exact.isError).toBeUndefined();

    const over = await call({
      files: [{ name: 'Src/Unicode.pa.yaml', content: `${'😀'.repeat(MAX_SURVEY_YAML_CODE_UNITS / 2)}x` }],
    });
    expect(over.isError).toBe(true);
    expect(over.content[0].text).toBe(
      `survey input error: YAML exceeds ${MAX_SURVEY_YAML_CODE_UNITS} JavaScript code units`,
    );
  });

  it('sums the 1,500,000-code-unit cap across files rather than per file', async () => {
    const left = 'a'.repeat(750_000);
    const right = 'b'.repeat(750_000);
    const exact = await call({
      files: [
        { name: 'Src/Left.pa.yaml', content: left },
        { name: 'Src/Right.pa.yaml', content: right },
      ],
    });
    expect(exact.isError).toBeUndefined();
    const over = await call({
      files: [
        { name: 'Src/Left.pa.yaml', content: left },
        { name: 'Src/Right.pa.yaml', content: right + 'x' },
      ],
    });
    expect(over.content[0].text).toBe(
      'survey input error: YAML exceeds 1500000 JavaScript code units',
    );
  });

  it('uses UTF-8 bytes for exact per-name and per-datasource-key limits', async () => {
    const exactName = 'Src/' + '😀'.repeat(255);
    expect(byteLength(exactName)).toBe(1_024);
    expect((await call({ files: [{ name: exactName, content: '' }] })).isError).toBeUndefined();
    expect((await call({
      files: [{ name: exactName + 'x', content: '' }],
    })).content[0].text).toBe(
      'survey input error: a file name exceeds 1024 UTF-8 bytes',
    );

    const exactKey = '😀'.repeat(256);
    expect(byteLength(exactKey)).toBe(1_024);
    expect((await call({
      files: [VALID_FILE], datasources: { [exactKey]: 'sql' },
    })).isError).toBeUndefined();
    expect((await call({
      files: [VALID_FILE], datasources: { [exactKey + 'x']: 'sql' },
    })).content[0].text).toBe(
      'survey input error: a datasource key exceeds 1024 UTF-8 bytes',
    );
  });

  it('rejects unsafe, colliding, oversized, and control-bearing file ids', async () => {
    const cases = [
      [{ name: '', content: '' }],
      [{ name: '/absolute.pa.yaml', content: '' }],
      [{ name: 'C:/absolute.pa.yaml', content: '' }],
      [{ name: 'Src/../escape.pa.yaml', content: '' }],
      [{ name: 'Src\\..\\escape.pa.yaml', content: '' }],
      [{ name: '\\absolute.pa.yaml', content: '' }],
      [{ name: 'C:\\absolute.pa.yaml', content: '' }],
      [{ name: '\\\\server\\share\\absolute.pa.yaml', content: '' }],
      [{ name: '.', content: '' }],
      [{ name: './', content: '' }],
      // Case collision only AFTER canonicalization must still be refused.
      [{ name: 'Src\\One.pa.yaml', content: '' }, { name: 'src/./one.pa.yaml', content: '' }],
      [{ name: 'Src/bad\u0000.pa.yaml', content: '' }],
      [{ name: `${'n'.repeat(MAX_SURVEY_FILE_NAME_BYTES + 1)}`, content: '' }],
      [{ name: 'Src/One.pa.yaml', content: '' }, { name: 'src/one.pa.yaml', content: '' }],
    ];
    for (const files of cases) {
      const result = await call({ files });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/^survey input error:/u);
    }
  });

  it('canonicalizes portable-fixable file ids instead of refusing them', async () => {
    const result = await call({
      files: [{ name: 'Src\\Screens\\Home.pa.yaml', content: VALID_FILE.content }],
    });
    expect(result.isError).toBeUndefined();
    expect(parseToolResult(result).report.identity.files.map(file => file.id))
      .toEqual(['Src/Screens/Home.pa.yaml']);

    // Every equivalent spelling reaches the same canonical id, and the id the
    // report carries is the canonical one, not the caller's spelling.
    for (const name of [
      'Src/Screens/Home.pa.yaml',
      'Src\\Screens/Home.pa.yaml',
      'Src/./Screens//Home.pa.yaml',
      './Src\\Screens\\Home.pa.yaml',
    ]) {
      const equivalent = await call({ files: [{ name, content: VALID_FILE.content }] });
      expect(equivalent.isError).toBeUndefined();
      expect(parseToolResult(equivalent).report.identity.files.map(file => file.id))
        .toEqual(['Src/Screens/Home.pa.yaml']);
    }
  });

  it('returns a bounded tool result when normalization throws unexpectedly', async () => {
    const pathological = {
      get files(): unknown {
        throw new TypeError('injected normalization failure');
      },
    };
    const result = await call(pathological);
    expect(result.isError).toBe(true);
    expect(result.content[0].text)
      .toBe('survey infrastructure error: survey could not be completed');
    expect(JSON.stringify(result)).not.toContain('injected normalization failure');
  });

  it('rejects every forbidden root/file key and bounded datasource metadata violation', async () => {
    for (const args of [
      { files: [VALID_FILE], previous: {} },
      { files: [VALID_FILE], baseline: {} },
      { files: [VALID_FILE], policy: {} },
      { files: [VALID_FILE], suppression: {} },
      { files: [VALID_FILE], suppressions: [] },
      { files: [{ ...VALID_FILE, policy: {} }] },
      { files: [VALID_FILE], submit_envelope: 'yes' },
      { files: [VALID_FILE], datasources: Array.from({ length: MAX_SURVEY_DATASOURCES }) },
      {
        files: [VALID_FILE],
        datasources: Object.fromEntries(Array.from(
          { length: MAX_SURVEY_DATASOURCES + 1 },
          (_, index) => [`source-${index}`, 'sql'],
        )),
      },
      { files: [VALID_FILE], datasources: { ['d'.repeat(MAX_SURVEY_DATASOURCE_KEY_BYTES + 1)]: 'sql' } },
      { files: [VALID_FILE], datasources: { source: 'invented' } },
    ]) {
      const result = await call(args);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/^survey input error:/u);
    }
  });

  it('pins exact aggregate datasource-key bytes and rejects one over', async () => {
    const keys = Array.from({ length: 512 }, (_, index) => {
      const prefix = 'source-' + String(index).padStart(3, '0') + '-';
      return prefix + 'd'.repeat(128 - prefix.length);
    });
    expect(keys.reduce((sum, key) => sum + byteLength(key), 0)).toBe(65_536);
    const exactMap = Object.fromEntries(keys.map(key => [key, 'sql']));
    const exact = await call({ files: [VALID_FILE], datasources: exactMap });
    expect(exact.isError).toBeUndefined();

    const oneOver = { ...exactMap };
    const first = keys[0];
    delete oneOver[first];
    oneOver[first + 'x'] = 'sql';
    const rejected = await call({ files: [VALID_FILE], datasources: oneOver });
    expect(rejected.content[0].text).toBe(
      'survey input error: datasource keys exceed 65536 aggregate UTF-8 bytes',
    );
  });

  it('preserves own reserved-looking datasource names and ignores inherited keys', async () => {
    const datasources = Object.create({ inherited_customer_name: 'sql' });
    Object.defineProperty(datasources, '__proto__', {
      value: 'sharepoint', enumerable: true, configurable: true,
    });
    Object.defineProperty(datasources, 'constructor', {
      value: 'excel', enumerable: true, configurable: true,
    });
    const payload = parseToolResult(await call({ files: [VALID_FILE], datasources }));
    expect(payload.report.inventories.datasources).toEqual({
      state: 'available',
      rows: [
        {
          name: '__proto__',
          backend: 'sharepoint',
          resolved_by: 'explicit-input',
          confidence: 'high',
        },
        {
          name: 'constructor',
          backend: 'excel',
          resolved_by: 'explicit-input',
          confidence: 'high',
        },
      ],
    });
  });
});

describe('survey_app composition and consent', () => {
  it('uses the explicitly selected existing-export profile', async () => {
    const result = await call({
      files: [EXISTING_EXPORT_FILE],
      profile: 'existing-export',
    });
    expect(result.isError).toBeUndefined();
    const payload = parseToolResult(result);
    expect(payload.report.policy.profile_id).toBe('existing-export');
    expect(payload.report.findings.filter(finding => finding.rule === 'inline-formula-paste-hygiene'))
      .toMatchObject([{ level: 'WARN' }]);
  });

  it('defaults to shared despite export-like names and preserves explicit shared findings', async () => {
    const implicit = parseToolResult(await call({ files: [EXISTING_EXPORT_FILE] }));
    const shared = parseToolResult(await call({ files: [EXISTING_EXPORT_FILE], profile: 'shared' }));
    const existing = parseToolResult(await call({ files: [EXISTING_EXPORT_FILE], profile: 'existing-export' }));

    expect(implicit.report.policy.profile_id).toBe('shared');
    expect(shared.report.policy.profile_id).toBe('shared');
    expect(implicit.report.findings.filter(finding => finding.rule === 'inline-formula-paste-hygiene'))
      .toMatchObject([{ level: 'WARN' }]);
    expect(shared.report.findings).toEqual(implicit.report.findings);
    expect(shared.report.gate).toEqual(implicit.report.gate);
    expect(existing.report.findings.map(finding => finding.fingerprint))
      .toEqual(implicit.report.findings.map(finding => finding.fingerprint));
    for (const field of ['rule_counts', 'opportunity_denominators', 'size_buckets', 'near_miss_buckets'] as const) {
      expect(existing.envelope[field]).toEqual(implicit.envelope[field]);
    }
  });

  it('retries the envelope UUID until it differs from the report UUID', () => {
    const values = [
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
    ];
    let calls = 0;
    expect(createDistinctSurveyIds(() => values[calls++])).toEqual({
      reportId: values[0],
      envelopeId: values[2],
    });
    expect(calls).toBe(3);
  });

  it('returns one full MCP payload with inline identity and two distinct matching UUIDs', async () => {
    const result = await call({ files: [VALID_FILE], datasources: { Orders: 'sql' } });
    expect(result.isError).toBeUndefined();
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    const payload = parseToolResult(result);
    expect(payload.report.identity).toMatchObject({
      source_kind: 'inline',
      fingerprint_basis: 'caller-supplied',
      app_name: { value: null, resolved_by: 'unresolved' },
    });
    expect(payload.report.identity.files[0]).toEqual({
      id: VALID_FILE.name,
      sha256: sha256(VALID_FILE.content),
    });
    expect(payload.report.inventories.connections).toEqual({ state: 'unavailable' });
    expect(payload.report.coverage.limitations).toEqual([
      {
        kind: 'metadata-absent',
        source: 'datasources',
        detail: 'Inline MCP intake carries no datasource export metadata',
      },
      {
        kind: 'metadata-absent',
        source: 'connections',
        detail: 'Inline MCP intake carries no connection export metadata',
      },
    ]);
    expect(payload.report.envelope).toEqual({
      id: payload.envelope.id,
      path: null,
      submission: { state: 'not_requested' },
    });
    expect(payload.report.report_id).not.toBe(payload.envelope.id);
    expect(payload.technical_markdown).toContain(payload.report.report_id);

    const fresh = analyzeSurveyFiles([VALID_FILE], {
      datasources: { Orders: 'sql' },
      now: () => Date.parse(payload.report.identity.surveyed_at),
    });
    expect(payload.report.gate).toEqual({
      summary: fresh.validation.summary,
      per_file: fresh.validation.per_file,
      gate_decision: fresh.validation.gateDecision,
    });
    expect(payload.technical_markdown).toBe(renderTechnical(payload.report));
    expect(() => assertValidReport(payload.report)).not.toThrow();
    expect(() => assertValidEnvelope(
      payload.envelope,
      ANALYZER_CATALOG_ALLOWLIST,
    )).not.toThrow();
    expect(() => assertEmittableReport(payload.report, {
      surface: 'mcp',
      envelope: payload.envelope,
    })).not.toThrow();
  });

  it('hashes Swedish and four-byte Unicode content as independent UTF-8 bytes', async () => {
    const content = '- Svenska:\n    Control: Screen\n    Note: ="räksmörgås 😀"\n';
    const result = parseToolResult(await call({
      files: [{ name: 'Src/Unicode.pa.yaml', content }],
    }));
    const digest = [...new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content)),
    )].map(byte => byte.toString(16).padStart(2, '0')).join('');
    expect(result.report.identity.files).toEqual([{
      id: 'Src/Unicode.pa.yaml',
      sha256: digest,
    }]);
  });

  it('skips line-heavy snapshot copies only for budgeted MCP analysis', () => {
    const files = [{
      name: 'Src/Many-Lines.pa.yaml',
      content: 'unrecognized\n'.repeat(50_000),
    }];
    const now = () => Date.parse('2026-08-30T12:00:00.000Z');
    const defaultSnapshot = analyzeSurveyFiles(files, { now });
    expect(defaultSnapshot.files[0].lines).toHaveLength(50_001);

    const budgetedSnapshot = analyzeSurveyFiles(files, {
      now,
      outputBudget: new SurveyOutputBudget(MAX_SURVEY_RESPONSE_BYTES),
    });
    expect(budgetedSnapshot.files[0].id).toBe('Src/Many-Lines.pa.yaml');
    expect(budgetedSnapshot.files[0].lines).toHaveLength(0);
    expect(budgetedSnapshot.coverage.files[0].unrecognizedLines).toBe(50_000);
  });

  it('shares frozen coverage spans and preserves their Markdown bytes', () => {
    const file = {
      name: 'Src/Spans.pa.yaml',
      content: 'x\n\nx\n\n',
    };
    const snapshot = analyzeSurveyFiles([file], {
      now: () => Date.parse('2026-08-30T12:00:00.000Z'),
      outputBudget: new SurveyOutputBudget(MAX_SURVEY_RESPONSE_BYTES),
    });
    const report = buildReport(snapshot, {
      app_name: { value: null, resolved_by: 'unresolved' },
      source_kind: 'inline',
      fingerprint_basis: 'caller-supplied',
      files: [{ id: file.name, sha256: sha256(file.content) }],
      limitations: [],
      connections: { state: 'unavailable', rows: [] },
    }, {
      now: '2026-08-30T12:00:00.000Z',
      report_id: '00000000-0000-4000-8000-000000000001',
      analyzer_version: 'test',
    });
    const limitation = report.coverage.limitations.find(entry =>
      entry.kind === 'unrecognized-content');
    expect(limitation?.kind).toBe('unrecognized-content');
    if (limitation?.kind !== 'unrecognized-content') throw new Error('missing span limitation');
    expect(limitation.lines).toBe(snapshot.coverage.files[0].unrecognizedSpans);
    expect(Object.isFrozen(limitation.lines)).toBe(true);
    expect(limitation.lines.every(span => Object.isFrozen(span))).toBe(true);
    expect(renderTechnical(report).split('\n').find(line =>
      line.startsWith('- Unrecognized content in '))).toBe(
      '- Unrecognized content in Src/Spans.pa.yaml: lines 1-1, 3-3.',
    );
  });

  it('runs the MCP emitted-report gate before returning', async () => {
    const uuids = [
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
    ];
    let index = 0;
    const gatedTool = createSurveyApp({
      now: () => new Date('2026-08-30T12:00:00.000Z'),
      randomUuid: () => uuids[index++],
      beforeGates(report) {
        report.report_id = 'not-a-uuid';
      },
    });
    const result = await gatedTool.handler(
      { files: [VALID_FILE] },
      { env: {} as any, ctx: { waitUntil() {} } as any },
    );
    expect(result).toEqual({
      content: [{
        type: 'text',
        text: 'survey infrastructure error: survey could not be completed',
      }],
      isError: true,
    });
  });

  it('does not inspect telemetry bindings when consent is false', async () => {
    const result = await call({ files: [VALID_FILE], submit_envelope: false }, {
      env: {
        SURVEY_TELEMETRY: {
          idFromName() { throw new Error('must not be called'); },
        },
        VERIFICATION_QUEUE: {
          get() { throw new Error('must not read validation telemetry'); },
          put() { throw new Error('must not write validation telemetry'); },
        },
      },
      ctx: { waitUntil() { throw new Error('must not be called'); } },
    });
    expect(parseToolResult(result).report.envelope.submission).toEqual({ state: 'not_requested' });
  });

  it('schedules exactly one canonical envelope and observes it through waitUntil', async () => {
    const submissions: Array<{ bytes: Uint8Array; digest: string }> = [];
    const waited: Promise<unknown>[] = [];
    const result = await call({ files: [VALID_FILE], submit_envelope: true }, {
      env: {
        VERIFICATION_QUEUE: new Proxy({}, {
          get() { throw new Error('validation KV must stay isolated'); },
        }),
        SURVEY_TELEMETRY: {
          idFromName: (name: string) => name,
          get: () => ({
            submit(bytes: Uint8Array, digest: string) {
              submissions.push({ bytes: bytes.slice(), digest });
              return Promise.resolve({ acknowledged: true, duplicate: false });
            },
          }),
        },
      },
      ctx: { waitUntil(promise: Promise<unknown>) { waited.push(promise); } },
    });
    const payload = parseToolResult(result);
    expect(payload.report.envelope.submission).toEqual({ state: 'pending' });
    expect(submissions).toHaveLength(1);
    expect(waited).toHaveLength(1);
    const submittedText = new TextDecoder().decode(submissions[0].bytes);
    expect(submittedText).toBe(JSON.stringify(payload.envelope, null, 2) + '\n');
    const independentDigest = [...new Uint8Array(
      await crypto.subtle.digest('SHA-256', submissions[0].bytes),
    )].map(byte => byte.toString(16).padStart(2, '0')).join('');
    expect(submissions[0].digest).toBe(independentDigest);
    await expect(waited[0]).resolves.toBeUndefined();
  });

  it('keeps async rejection nonfatal and reports known missing/synchronous scheduling failures', async () => {
    const waited: Promise<unknown>[] = [];
    const rejected = await call({ files: [VALID_FILE], submit_envelope: true }, {
      env: {
        SURVEY_TELEMETRY: {
          idFromName: (name: string) => name,
          get: () => ({ submit: () => Promise.reject(new Error('offline')) }),
        },
      },
      ctx: { waitUntil(promise: Promise<unknown>) { waited.push(promise); } },
    });
    expect(parseToolResult(rejected).report.envelope.submission).toEqual({ state: 'pending' });
    await expect(waited[0]).resolves.toBeUndefined();

    let missingWaits = 0;
    const missing = parseToolResult(await call(
      { files: [VALID_FILE], submit_envelope: true },
      { env: {}, ctx: { waitUntil() { missingWaits++; } } },
    ));
    expect(missing.report.envelope.submission).toMatchObject({
      state: 'failed',
      error_code: 'telemetry-not-configured',
    });
    expect(Number.isFinite(Date.parse(missing.report.envelope.submission.attempted_at!))).toBe(true);
    expect(missingWaits).toBe(0);

    const secret = 'not-for-output';
    const syncFaults = [
      {
        env: { SURVEY_TELEMETRY: { idFromName() { throw new Error(secret); } } },
        ctx: { waitUntil() {} },
      },
      {
        env: {
          SURVEY_TELEMETRY: {
            idFromName: (name: string) => name,
            get() { throw new Error(secret); },
          },
        },
        ctx: { waitUntil() {} },
      },
      {
        env: {
          SURVEY_TELEMETRY: {
            idFromName: (name: string) => name,
            get: () => ({ submit() { throw new Error(secret); } }),
          },
        },
        ctx: { waitUntil() {} },
      },
      {
        env: {
          SURVEY_TELEMETRY: {
            idFromName: (name: string) => name,
            get: () => ({ submit: () => Promise.resolve({ acknowledged: true, duplicate: false }) }),
          },
        },
        ctx: { waitUntil() { throw new Error(secret); } },
      },
    ];
    for (const extra of syncFaults) {
      const raw = await call({ files: [VALID_FILE], submit_envelope: true }, extra);
      const synchronous = parseToolResult(raw);
      expect(synchronous.report.envelope.submission).toMatchObject({
        state: 'failed',
        error_code: 'telemetry-scheduling-failed',
      });
      expect(JSON.stringify(raw)).not.toContain(secret);
    }
  });

  it('checks the execution context before dispatching, never reporting a live RPC as failed', async () => {
    const submissions: string[] = [];
    const raw = await call({ files: [VALID_FILE], submit_envelope: true }, {
      env: {
        SURVEY_TELEMETRY: {
          idFromName: (name: string) => name,
          get: () => ({
            submit(_bytes: Uint8Array, digest: string) {
              submissions.push(digest);
              return Promise.resolve({ acknowledged: true, duplicate: false });
            },
          }),
        },
      },
      ctx: undefined,
    });

    expect(parseToolResult(raw).report.envelope.submission).toMatchObject({
      state: 'failed',
      error_code: 'telemetry-scheduling-failed',
    });
    expect(submissions).toEqual([]);
  });
});

describe('survey_app final JSON-RPC response bound', () => {
  it('counts compact JSON and raw UTF-8 without allocating encoded copies', () => {
    const values = [
      null,
      true,
      false,
      0,
      -0,
      12.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      'quote" slash\\ controls\u0000\b\t\n\f\r',
      'svenska åäö',
      'emoji 😀',
      '\ud800 lone \udc00',
      ['å', '😀', 7, null],
      { z: 'quote"', a: ['\u0001', '\ud800', -4.25] },
    ];
    for (const value of values) {
      const json = JSON.stringify(value);
      expect(countJsonUtf8Bytes(value)).toBe(byteLength(json));
      expect(countUtf8StringBytes(json)).toBe(byteLength(json));
    }
    const large = { rows: Array.from({ length: 1_000 }, () => '😀"') };
    expect(countJsonUtf8Bytes(large, 257)).toBe(257);
    expect(countUtf8StringBytes(JSON.stringify(large), 257)).toBe(257);
  });

  it('derives the 393-byte finding lower bound from every mandatory key', () => {
    const emptyFindingSkeleton = {
      level: 'WARN',
      rule: '',
      file: '',
      line: 0,
      control: '',
      type: '',
      variant: '',
      property: '',
      detail: '',
      fix: '',
      did_you_mean: '',
      controls: [],
      near_miss: true,
      origin: 'analyzer',
      fingerprint: '',
      severity: 'BLOCK',
      confidence: 'low',
      confidence_basis: '',
      claim_ref: '',
      group_id: '',
      baseline_status: 'new',
      adjudication: '',
      members_changed: true,
      edits: [],
      campaign_ref: '',
      queue_refs: [],
    };
    const mandatoryKeys = [
      'level', 'rule', 'file', 'line', 'control', 'type', 'variant',
      'property', 'detail', 'fix', 'did_you_mean', 'controls', 'near_miss',
      'origin', 'fingerprint', 'severity', 'confidence', 'confidence_basis',
      'claim_ref', 'group_id', 'baseline_status', 'adjudication',
      'members_changed', 'edits', 'campaign_ref', 'queue_refs',
    ];
    expect(Object.keys(emptyFindingSkeleton).sort()).toEqual([...mandatoryKeys].sort());
    const skeletonBytes = byteLength(JSON.stringify(emptyFindingSkeleton));
    expect(skeletonBytes).toBe(401);
    expect(MIN_EMITTED_FINDING_BYTES).toBe(393);
    expect(skeletonBytes).toBeGreaterThanOrEqual(MIN_EMITTED_FINDING_BYTES);
  });

  it('does not count analyzer PASS observations as emitted findings', () => {
    const budget = new SurveyOutputBudget(393);
    expect(() => budget.observeIssue({ level: 'PASS' } as any)).not.toThrow();
    expect(() => budget.observeReportInput(0)).not.toThrow();
    expect(() => budget.observeIssue({ level: 'WARN' } as any))
      .toThrow('survey output lower bound reached its response budget');
  });

  it('stops alternating unrecognized spans before retaining the saturating pair', async () => {
    let saturated: unknown;
    let renders = 0;
    let telemetry = 0;
    const guarded = createSurveyApp({
      componentPreflightBytes: 41,
      onOutputBudgetSaturated(value) { saturated = value; },
      render(report) {
        renders++;
        return renderTechnical(report);
      },
    });
    const result = await guarded.handler({
      files: [{
        name: 'Src/Alternating.pa.yaml',
        content: 'x\n\n'.repeat(100),
      }],
      submit_envelope: true,
    }, {
      env: {
        SURVEY_TELEMETRY: new Proxy({}, {
          get() { telemetry++; throw new Error('must not schedule'); },
        }),
      } as any,
      ctx: { waitUntil() { telemetry++; } } as any,
    });

    expect(result.content[0].text).toBe(
      'survey infrastructure error: response exceeds 41 bytes',
    );
    expect(result.isError).toBe(true);
    expect(saturated).toEqual({
      stage: 'analyzer',
      finding_candidates: 0,
      unrecognized_spans: 6,
      lower_bound_bytes: 41,
    });
    // Observation happens before retention, so only five span tuples exist.
    expect({ renders, telemetry }).toEqual({ renders: 0, telemetry: 0 });
  });

  it('bounds the maximal alternating-span input at the production cap', async () => {
    const content = 'x\n\n'.repeat(500_000);
    let saturated: any;
    let renders = 0;
    let telemetry = 0;
    const guarded = createSurveyApp({
      onOutputBudgetSaturated(value) { saturated = value; },
      render(report) {
        renders++;
        return renderTechnical(report);
      },
    });
    const result = await guarded.handler({
      files: [{ name: 'Src/Max-Spans.pa.yaml', content }],
      submit_envelope: true,
    }, {
      env: {
        SURVEY_TELEMETRY: new Proxy({}, {
          get() { telemetry++; throw new Error('must not schedule'); },
        }),
      } as any,
      ctx: { waitUntil() { telemetry++; } } as any,
    });

    expect(content.length).toBe(1_500_000);
    expect(result.content[0].text).toBe(
      'survey infrastructure error: response exceeds 8388608 bytes',
    );
    expect(result.isError).toBe(true);
    expect(saturated).toEqual({
      stage: 'analyzer',
      finding_candidates: 0,
      unrecognized_spans: 307_530,
      lower_bound_bytes: 8_388_608,
    });
    expect({ renders, telemetry }).toEqual({ renders: 0, telemetry: 0 });
  });

  it('rejects expansion-heavy reports before render or telemetry allocation', async () => {
    for (const [files, expectedCount] of [
      [collisionFiles(128, true), 128],
      [collisionFiles(512, false), 512],
    ] as const) {
      let renders = 0;
      let telemetryCalls = 0;
      let waits = 0;
      const guarded = createSurveyApp({
        render(report) {
          renders++;
          return renderTechnical(report);
        },
      });
      const result = await guarded.handler({
        files,
        submit_envelope: true,
      }, {
        env: {
          SURVEY_TELEMETRY: {
            idFromName() { telemetryCalls++; return 'id'; },
            get() {
              telemetryCalls++;
              return {
                submit() {
                  telemetryCalls++;
                  return Promise.resolve({ acknowledged: true, duplicate: false });
                },
              };
            },
          },
        } as any,
        ctx: { waitUntil() { waits++; } } as any,
      });
      expect(files).toHaveLength(expectedCount);
      expect(result).toEqual({
        content: [{
          type: 'text',
          text: 'survey infrastructure error: response exceeds 8388608 bytes',
        }],
        isError: true,
      });
      expect({ renders, telemetryCalls, waits }).toEqual({
        renders: 0,
        telemetryCalls: 0,
        waits: 0,
      });
    }
  });

  it('saturates a sound analyzer output lower bound before dense findings accumulate', async () => {
    const children = Array.from({ length: 100 }, (_, index) =>
      '      - Dense' + index + ':\n'
      + '          Control: Button\n'
      + '          Properties:\n'
      + '            BogusAlpha: =1\n'
      + '            BogusBeta: =2\n'
      + '            BogusGamma: =3\n'
      + '            BogusDelta: =4\n').join('');
    let saturated: unknown;
    let renders = 0;
    let telemetry = 0;
    const dense = createSurveyApp({
      componentPreflightBytes: 393 * 200 + 1,
      onOutputBudgetSaturated(value: unknown) { saturated = value; },
      render(report) {
        renders++;
        return renderTechnical(report);
      },
    } as any);
    const result = await dense.handler({
      files: [{
        name: 'Src/Dense.pa.yaml',
        content: '- Main:\n    Control: Screen\n    Children:\n' + children,
      }],
      submit_envelope: true,
    }, {
      env: {
        SURVEY_TELEMETRY: new Proxy({}, {
          get() { telemetry++; throw new Error('must not schedule'); },
        }),
      } as any,
      ctx: { waitUntil() { telemetry++; } } as any,
    });

    expect(result).toEqual({
      content: [{
        type: 'text',
        text: 'survey infrastructure error: response exceeds 78601 bytes',
      }],
      isError: true,
    });
    expect(saturated).toEqual({
      stage: 'analyzer',
      finding_candidates: 201,
      lower_bound_bytes: 78_601,
    });
    expect({ renders, telemetry }).toEqual({ renders: 0, telemetry: 0 });
  });

  it('applies the same optional lower-bound guard at shared report composition', () => {
    const snapshot = analyzeSurveyFiles([VALID_FILE], {
      now: () => Date.parse('2026-08-30T12:00:00.000Z'),
    });
    const input = {
      app_name: { value: null, resolved_by: 'unresolved' as const },
      source_kind: 'inline' as const,
      fingerprint_basis: 'caller-supplied',
      files: [{ id: VALID_FILE.name, sha256: sha256(VALID_FILE.content) }],
      limitations: [],
      connections: { state: 'unavailable' as const, rows: [] },
    };
    const options = {
      now: '2026-08-30T12:00:00.000Z',
      report_id: '00000000-0000-4000-8000-000000000001',
      analyzer_version: 'test',
    };
    let saturated: unknown;
    const budget = new SurveyOutputBudget(393, value => { saturated = value; });
    expect(() => buildReport(snapshot, input, options, budget))
      .toThrow('survey output lower bound reached its response budget');
    expect(saturated).toEqual({
      stage: 'report',
      finding_candidates: 1,
      lower_bound_bytes: 393,
    });

    snapshot.validation.issues.unshift({
      ...snapshot.validation.issues[0],
      level: 'PASS',
    });
    expect(() => buildReport(
      snapshot,
      input,
      options,
      new SurveyOutputBudget(393 * 2),
    )).not.toThrow();
  });

  it('stops a semantically maximal dense input at the 21,346th finding candidate', async () => {
    // Bounded by the hosted control cap (src/lib/hosted-limits.ts): the densest
    // admitted input is 5,000 controls (screen included), each with five unknown properties.
    const children = Array.from({ length: 4_999 }, (_, index) =>
      '      - Dense' + index + ':\n'
      + '          Control: Button\n'
      + '          Properties:\n'
      + '            BogusAlpha: =1\n'
      + '            BogusBeta: =2\n'
      + '            BogusGamma: =3\n'
      + '            BogusDelta: =4\n'
      + '            BogusEpsilon: =5\n').join('');
    const content = '- Main:\n    Control: Screen\n    Children:\n' + children;
    let saturated: unknown;
    let renders = 0;
    let telemetry = 0;
    const dense = createSurveyApp({
      onOutputBudgetSaturated(value) { saturated = value; },
      render(report) {
        renders++;
        return renderTechnical(report);
      },
    });
    const result = await dense.handler({
      files: [{ name: 'Src/Max-Density.pa.yaml', content }],
      submit_envelope: true,
    }, {
      env: {
        SURVEY_TELEMETRY: new Proxy({}, {
          get() { telemetry++; throw new Error('must not schedule'); },
        }),
      } as any,
      ctx: { waitUntil() { telemetry++; } } as any,
    });

    expect(content.length).toBeLessThanOrEqual(1_500_000);
    expect(result.content[0].text).toBe(
      'survey infrastructure error: response exceeds 8388608 bytes',
    );
    expect(result.isError).toBe(true);
    expect(saturated).toEqual({
      stage: 'analyzer',
      finding_candidates: 21_346,
      lower_bound_bytes: 8_388_608,
    });
    expect({ renders, telemetry }).toEqual({ renders: 0, telemetry: 0 });
  });

  it('renders an ordinary report exactly once', async () => {
    let renders = 0;
    const ordinary = createSurveyApp({
      render(report) {
        renders++;
        return renderTechnical(report);
      },
    });
    const result = await ordinary.handler(
      { files: [VALID_FILE] },
      { env: {} as any, ctx: { waitUntil() {} } as any },
    );
    expect(result.isError).toBeUndefined();
    expect(renders).toBe(1);
  });

  it('streams technical Markdown to an exact byte cap without truncation', async () => {
    const payload = parseToolResult(await call({ files: [VALID_FILE] }));
    const module = await import('../src/core/survey/render-technical') as
      typeof import('../src/core/survey/render-technical') & {
        renderTechnicalWithinBytes?: (
          report: SurveyToolResult['report'],
          maxBytes: number,
        ) => string | null;
      };
    expect(module.renderTechnicalWithinBytes).toBeTypeOf('function');
    const exactBytes = byteLength(payload.technical_markdown);
    expect(module.renderTechnicalWithinBytes!(payload.report, exactBytes))
      .toBe(payload.technical_markdown);
    expect(module.renderTechnicalWithinBytes!(payload.report, exactBytes - 1)).toBeNull();
  });

  it('measures encoded bytes: exact cap passes and one byte over becomes bounded isError', () => {
    const response = {
      jsonrpc: '2.0' as const,
      id: 'å',
      result: {
        content: [{ type: 'text' as const, text: `quotes: "${'😀'.repeat(1024)}"` }],
      },
    };
    const exactBytes = byteLength(JSON.stringify(response));
    const exact = serializeSurveyAppJsonRpcResponse(response, exactBytes);
    expect(exact.replaced).toBe(false);
    expect(exact.bytes).toBe(exactBytes);

    const over = serializeSurveyAppJsonRpcResponse(response, exactBytes - 1);
    expect(over.replaced).toBe(true);
    expect(over.bytes).toBe(byteLength(over.body));
    expect(over.bytes).toBeLessThanOrEqual(exactBytes - 1);
    expect(JSON.parse(over.body).result).toEqual({
      content: [{ type: 'text', text: `survey infrastructure error: response exceeds ${exactBytes - 1} bytes` }],
      isError: true,
    });
  });

  it('uses the production cap and bounds the replacement itself', () => {
    const response = {
      jsonrpc: '2.0' as const,
      id: 7,
      result: { content: [{ type: 'text' as const, text: 'x'.repeat(8_388_608) }] },
    };
    const bounded = serializeSurveyAppJsonRpcResponse(response);
    expect(bounded.replaced).toBe(true);
    expect(bounded.bytes).toBeLessThanOrEqual(8_388_608);
    expect(JSON.parse(bounded.body).result.isError).toBe(true);
  });

  it('measures the replacement and does not replace it a second time', () => {
    const original = {
      jsonrpc: '2.0' as const,
      id: 2,
      result: { content: [{ type: 'text' as const, text: 'x'.repeat(4096) }] },
    };
    const first = serializeSurveyAppJsonRpcResponse(original, 1_024);
    expect(first.replaced).toBe(true);
    const second = serializeSurveyAppJsonRpcResponse(JSON.parse(first.body), 1_024);
    expect(second).toEqual({ ...first, replaced: false });
  });

  it('bounds escaped/four-byte encoded request ids at exact 1024 bytes', async () => {
    const exactId = '😀'.repeat(255) + '"';
    expect(byteLength(JSON.stringify(exactId))).toBe(1_024);
    const exact = await SELF.fetch(rpc({
      jsonrpc: '2.0',
      id: exactId,
      method: 'tools/call',
      params: { name: 'survey_app', arguments: { files: [VALID_FILE] } },
    }));
    expect((await exact.json() as any).result.isError).toBeUndefined();

    const overId = exactId + 'x';
    expect(byteLength(JSON.stringify(overId))).toBe(1_025);
    const res = await SELF.fetch(rpc({
      jsonrpc: '2.0',
      id: overId,
      method: 'tools/call',
      params: { name: 'survey_app', arguments: { files: [VALID_FILE] } },
    }));
    const body: any = await res.json();
    expect(body.id).toBeNull();
    expect(body.result).toEqual({
      content: [{
        type: 'text',
        text: `survey input error: request id exceeds ${MAX_SURVEY_REQUEST_ID_BYTES} encoded bytes`,
      }],
      isError: true,
    });
  });

  it('rejects non-JSON-RPC survey ids before handler or telemetry work', async () => {
    const requests = [
      JSON.stringify({
        jsonrpc: '2.0', id: {}, method: 'tools/call',
        params: { name: 'survey_app', arguments: { files: [VALID_FILE], submit_envelope: true } },
      }),
      JSON.stringify({
        jsonrpc: '2.0', id: [], method: 'tools/call',
        params: { name: 'survey_app', arguments: { files: [VALID_FILE], submit_envelope: true } },
      }),
      JSON.stringify({
        jsonrpc: '2.0', id: false, method: 'tools/call',
        params: { name: 'survey_app', arguments: { files: [VALID_FILE], submit_envelope: true } },
      }),
      '{"jsonrpc":"2.0","id":1e400,"method":"tools/call","params":{"name":"survey_app","arguments":{"files":[{"name":"Src/Main.pa.yaml","content":""}],"submit_envelope":true}}}',
    ];
    for (const requestBody of requests) {
      let touched = 0;
      const response = await createWorker().fetch(new Request('http://x/mcp', {
        method: 'POST',
        headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
        body: requestBody,
      }) as any, {
        MCP_AUTH_TOKEN: 'test-token',
        VERIFICATION_QUEUE: new Proxy({}, {
          get() { touched++; throw new Error('validation KV must stay isolated'); },
        }),
        SURVEY_TELEMETRY: new Proxy({}, {
          get() { touched++; throw new Error('survey telemetry must stay isolated'); },
        }),
      } as any, { waitUntil() { touched++; } } as any);
      const parsed = JSON.parse(await response.text());
      expect(parsed.id).toBeNull();
      expect(parsed.error).toEqual({
        code: -32600,
        message: 'Invalid Request: survey_app id must be a string, finite number, or null',
      });
      expect(touched).toBe(0);
    }
  });

  it('returns a successful singleton including explicit null id', async () => {
    const single = await SELF.fetch(rpc({
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'survey_app', arguments: { files: [VALID_FILE] } },
    }));
    const singleText = await single.text();
    expect(byteLength(singleText)).toBeLessThanOrEqual(MAX_SURVEY_RESPONSE_BYTES);
    expect(JSON.parse(singleText).result.isError).toBeUndefined();

    const nullId = await SELF.fetch(rpc({
      jsonrpc: '2.0', id: null, method: 'tools/call',
      params: { name: 'survey_app', arguments: { files: [VALID_FILE] } },
    }));
    const nullBody: any = await nullId.json();
    expect(nullBody.id).toBeNull();
    expect(nullBody.result.isError).toBeUndefined();
  });

  it('rejects a response-bearing batch survey before any handler side effect', async () => {
    let touched = 0;
    const localWorker = createWorker();
    const response = await localWorker.fetch(rpc([
      {
        jsonrpc: '2.0', id: 2, method: 'tools/call',
        params: { name: 'get_verification_queue', arguments: {} },
      },
      {
        jsonrpc: '2.0', id: 'x'.repeat(1_025), method: 'tools/call',
        params: { name: 'survey_app', arguments: { files: [VALID_FILE], submit_envelope: true } },
      },
    ]) as any, {
      MCP_AUTH_TOKEN: 'test-token',
      VERIFICATION_QUEUE: {
        get() { touched++; throw new Error('must not run'); },
        list() { touched++; throw new Error('must not run'); },
      },
      SURVEY_TELEMETRY: {
        idFromName() { touched++; return 'id'; },
        get() { touched++; return { submit() { touched++; return Promise.resolve({ acknowledged: true }); } }; },
      },
    } as any, { waitUntil() { touched++; } } as any);
    const responseText = await response.text();
    expect(responseText).toBe(
      '[{"jsonrpc":"2.0","id":null,"error":{"code":-32600,"message":"survey_app is not supported in JSON-RPC batches"}}]',
    );
    const body: any[] = JSON.parse(responseText);
    expect(body).toEqual([{
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32600,
        message: 'survey_app is not supported in JSON-RPC batches',
      },
    }]);
    expect(touched).toBe(0);
  });

  it('rejects a one-element response-bearing survey batch as a whole', async () => {
    const response = await createWorker().fetch(rpc([{
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'survey_app', arguments: { files: [VALID_FILE] } },
    }]) as any, { MCP_AUTH_TOKEN: 'test-token' } as any, { waitUntil() {} } as any);
    expect(await response.text()).toBe(
      '[{"jsonrpc":"2.0","id":null,"error":{"code":-32600,"message":"survey_app is not supported in JSON-RPC batches"}}]',
    );
  });

  it('drops batch survey notifications without side effects and preserves legacy-only work', async () => {
    let telemetryTouched = 0;
    const localWorker = createWorker();
    const response = await localWorker.fetch(rpc([
      {
        jsonrpc: '2.0', method: 'tools/call',
        params: { name: 'survey_app', arguments: { files: [VALID_FILE], submit_envelope: true } },
      },
      {
        jsonrpc: '2.0', id: 3, method: 'tools/call',
        params: { name: 'list_controls', arguments: {} },
      },
    ]) as any, {
      MCP_AUTH_TOKEN: 'test-token',
      SURVEY_TELEMETRY: {
        idFromName() { telemetryTouched++; return 'id'; },
      },
    } as any, { waitUntil() { telemetryTouched++; } } as any);
    const body: any[] = await response.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe(3);
    expect(body[0].result.content[0].type).toBe('text');
    expect(telemetryTouched).toBe(0);
  });

  it('keeps an all-notification survey batch response-free', async () => {
    let touched = 0;
    const response = await createWorker().fetch(rpc([{
      jsonrpc: '2.0', method: 'tools/call',
      params: { name: 'survey_app', arguments: { files: [VALID_FILE], submit_envelope: true } },
    }]) as any, {
      MCP_AUTH_TOKEN: 'test-token',
      SURVEY_TELEMETRY: { idFromName() { touched++; return 'id'; } },
    } as any, { waitUntil() { touched++; } } as any);
    expect(response.status).toBe(204);
    expect(touched).toBe(0);
  });

  it('measures actual /mcp bytes at an injected cap and pins schedule-before-cap order', async () => {
    let submissions = 0;
    const waited: Promise<unknown>[] = [];
    const response = await createWorker({ maxSurveyResponseBytes: 1_024 }).fetch(rpc({
      jsonrpc: '2.0', id: 17, method: 'tools/call',
      params: { name: 'survey_app', arguments: { files: [VALID_FILE], submit_envelope: true } },
    }) as any, {
      MCP_AUTH_TOKEN: 'test-token',
      SURVEY_TELEMETRY: {
        idFromName: (name: string) => name,
        get: () => ({
          submit() {
            submissions++;
            return Promise.resolve({ acknowledged: true, duplicate: false });
          },
        }),
      },
    } as any, {
      waitUntil(promise: Promise<unknown>) { waited.push(promise); },
    } as any);
    const exactBody = await response.text();
    expect(byteLength(exactBody)).toBeLessThanOrEqual(1_024);
    expect(JSON.parse(exactBody).result).toEqual({
      content: [{
        type: 'text',
        text: 'survey infrastructure error: response exceeds 1024 bytes',
      }],
      isError: true,
    });
    expect(submissions).toBe(1);
    expect(waited).toHaveLength(1);
    await expect(waited[0]).resolves.toBeUndefined();
  });

  it('passes at the exact actual /mcp byte cap and replaces at cap minus one', async () => {
    const body = {
      jsonrpc: '2.0', id: 18, method: 'tools/call',
      params: { name: 'survey_app', arguments: { files: [VALID_FILE] } },
    };
    const invoke = async (maxSurveyResponseBytes?: number) => {
      const worker = maxSurveyResponseBytes === undefined
        ? createWorker()
        : createWorker({ maxSurveyResponseBytes });
      return worker.fetch(
        rpc(body) as any,
        { MCP_AUTH_TOKEN: 'test-token' } as any,
        { waitUntil() {} } as any,
      );
    };
    const baselineText = await (await invoke()).text();
    const exactBytes = byteLength(baselineText);
    const exactText = await (await invoke(exactBytes)).text();
    expect(byteLength(exactText)).toBe(exactBytes);
    expect((JSON.parse(exactText) as any).result.isError).toBeUndefined();

    const overText = await (await invoke(exactBytes - 1)).text();
    expect(byteLength(overText)).toBeLessThanOrEqual(exactBytes - 1);
    expect((JSON.parse(overText) as any).result).toEqual({
      content: [{
        type: 'text',
        text: 'survey infrastructure error: response exceeds ' + (exactBytes - 1) + ' bytes',
      }],
      isError: true,
    });
  });
});

describe('survey_app telemetry execution context', () => {
  it('settles the real Worker execution context for a consented request', async () => {
    const ctx = createExecutionContext();
    const bare = { ...(env as any), SURVEY_TELEMETRY: undefined };
    const response = await (await import('../src/index')).default.fetch(
      rpc({
        jsonrpc: '2.0', id: 9, method: 'tools/call',
        params: { name: 'survey_app', arguments: { files: [VALID_FILE], submit_envelope: true } },
      }) as any,
      bare,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect((await response.json() as any).result.isError).toBeUndefined();
  });
});

describe('survey_app representative response measurements', () => {
  const screen = (children: string): string =>
    '- Main:\n'
    + '    Control: Screen\n'
    + '    Children:\n'
    + children;
  const child = (name: string, type: string, properties = ''): string =>
    '      - ' + name + ':\n'
    + '          Control: ' + type + '\n'
    + (properties === '' ? '' : '          Properties:\n' + properties);

  it('records bounded component sizes without claiming a synthetic worst case', async () => {
    const invalidProperties = [
      '            BogusAlpha: =1\n',
      '            BogusBeta: =2\n',
      '            BogusGamma: =3\n',
      '            BogusDelta: =4\n',
    ].join('');
    const highIssueFiles = [{
      name: 'Src/High-Issue.pa.yaml',
      content: screen(Array.from(
        { length: 500 },
        (_, index) => child('Bad' + index, 'Button', invalidProperties),
      ).join('')),
    }];

    const detailFiles = collisionFiles(128, true);

    const aggregateFiles = [{
      name: 'Src/Aggregate.pa.yaml',
      content: screen(Array.from(
        { length: 1_000 },
        (_, index) => child('Input' + index, 'TextInput'),
      ).join('')),
    }];

    const datasourceKeys = Array.from({ length: 512 }, (_, index) => {
      const prefix = 'source-' + String(index).padStart(3, '0') + '-';
      return prefix + 'd'.repeat(128 - prefix.length);
    });
    const inventoryDatasources = Object.fromEntries(
      datasourceKeys.map(key => [key, 'sql']),
    );

    const nearMissFiles = [{
      name: 'Src/Near-Miss.pa.yaml',
      content: screen(Array.from(
        { length: 1_000 },
        (_, index) => child('Near' + index, 'Buton'),
      ).join('')),
    }];

    const scenarios = [
      { name: 'high_issue_density', files: highIssueFiles },
      { name: 'long_names_detail_expansion', files: detailFiles },
      { name: 'aggregate_membership', files: aggregateFiles },
      { name: 'inventories', files: [VALID_FILE], datasources: inventoryDatasources },
      { name: 'near_misses', files: nearMissFiles },
      {
        name: 'four_byte_unicode',
        files: [{
          name: 'Src/Unicode-Max.pa.yaml',
          content: '😀'.repeat(750_000),
        }],
      },
    ];
    // Hermetic measurement: `staleness_days` and `surveyed_at` are derived from
    // the wall clock, so an uninjected clock silently changes report and
    // Markdown byte counts as the catalog ages. Pin the clock, and record the
    // catalog version the numbers were measured against.
    const MEASUREMENT_NOW = new Date('2026-08-30T08:00:00.000Z');
    const measurementTool = createSurveyApp({
      componentPreflightBytes: 64 * 1_024 * 1_024,
      now: () => MEASUREMENT_NOW,
    });
    const measurements = [];
    for (const scenario of scenarios) {
      const args = {
        files: scenario.files,
        ...('datasources' in scenario ? { datasources: scenario.datasources } : {}),
      };
      const raw = await measurementTool.handler(
        args,
        { env: {} as any, ctx: { waitUntil() {} } as any },
      );
      expect(raw.isError).toBeUndefined();
      const payload = parseToolResult(raw);
      const codeUnits = scenario.files.reduce((sum, file) => sum + file.content.length, 0);
      const inputBytes = scenario.files.reduce((sum, file) => sum + byteLength(file.content), 0);
      const metadataBytes = scenario.files.reduce((sum, file) => sum + byteLength(file.name), 0)
        + ('datasources' in scenario
          ? Object.keys(scenario.datasources as Record<string, string>)
            .reduce((sum, key) => sum + byteLength(key), 0)
          : 0);
      const reportBytes = byteLength(JSON.stringify(payload.report));
      const markdownBytes = byteLength(payload.technical_markdown);
      const envelopeBytes = byteLength(JSON.stringify(payload.envelope, null, 2) + '\n');
      const innerTextBytes = byteLength(raw.content[0].text);
      const finalBytes = byteLength(JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        result: raw,
      }));
      measurements.push({
        measurement_schema: 'task8-v1',
        name: scenario.name,
        catalog_version: payload.report.identity.catalog.version,
        code_units: codeUnits,
        input_bytes: inputBytes,
        metadata_bytes: metadataBytes,
        controls: payload.report.gate.summary.controls_seen,
        findings: payload.report.findings.length,
        report_bytes: reportBytes,
        markdown_bytes: markdownBytes,
        envelope_bytes: envelopeBytes,
        inner_text_bytes: innerTextBytes,
        final_jsonrpc_bytes: finalBytes,
      });
    }
    expect(measurements).toEqual([
      {
        measurement_schema: 'task8-v1',
        name: 'high_issue_density',
        catalog_version: CATALOG_VERSION,
        code_units: 85_432,
        input_bytes: 85_432,
        metadata_bytes: 22,
        controls: 501,
        findings: 2_002,
        report_bytes: 2_896_849,
        markdown_bytes: 1_352_677,
        envelope_bytes: 2_163,
        inner_text_bytes: 5_841_235,
        final_jsonrpc_bytes: 6_432_800,
      },
      {
        measurement_schema: 'task8-v1',
        name: 'long_names_detail_expansion',
        catalog_version: CATALOG_VERSION,
        code_units: 11_904,
        input_bytes: 11_904,
        metadata_bytes: 16_384,
        controls: 256,
        findings: 384,
        report_bytes: 18_105_617,
        markdown_bytes: 9_097_700,
        envelope_bytes: 2_105,
        inner_text_bytes: 27_539_206,
        final_jsonrpc_bytes: 27_659_930,
      },
      {
        measurement_schema: 'task8-v1',
        name: 'aggregate_membership',
        catalog_version: CATALOG_VERSION,
        code_units: 46_932,
        input_bytes: 46_932,
        metadata_bytes: 21,
        controls: 1_001,
        findings: 3,
        report_bytes: 19_322,
        markdown_bytes: 15_049,
        envelope_bytes: 2_182,
        inner_text_bytes: 51_901,
        final_jsonrpc_bytes: 56_762,
      },
      {
        measurement_schema: 'task8-v1',
        name: 'inventories',
        catalog_version: CATALOG_VERSION,
        code_units: 130,
        input_bytes: 130,
        metadata_bytes: 65_552,
        controls: 2,
        findings: 1,
        report_bytes: 110_739,
        markdown_bytes: 103_992,
        envelope_bytes: 2_023,
        inner_text_bytes: 260_774,
        final_jsonrpc_bytes: 274_377,
      },
      {
        measurement_schema: 'task8-v1',
        name: 'near_misses',
        catalog_version: CATALOG_VERSION,
        code_units: 41_932,
        input_bytes: 41_932,
        metadata_bytes: 21,
        controls: 1_001,
        findings: 1_002,
        report_bytes: 1_475_326,
        markdown_bytes: 756_240,
        envelope_bytes: 2_259,
        inner_text_bytes: 3_032_064,
        final_jsonrpc_bytes: 3_330_572,
      },
      {
        measurement_schema: 'task8-v1',
        name: 'four_byte_unicode',
        catalog_version: CATALOG_VERSION,
        code_units: 1_500_000,
        input_bytes: 3_000_000,
        metadata_bytes: 23,
        controls: 0,
        findings: 0,
        report_bytes: 2_485,
        markdown_bytes: 2_392,
        envelope_bytes: 1_933,
        inner_text_bytes: 8_497,
        final_jsonrpc_bytes: 9_387,
      },
    ]);

    const capped = await createWorker().fetch(rpc({
      jsonrpc: '2.0', id: 19, method: 'tools/call',
      params: { name: 'survey_app', arguments: { files: detailFiles } },
    }) as any, {
      MCP_AUTH_TOKEN: 'test-token',
    } as any, { waitUntil() {} } as any);
    const cappedText = await capped.text();
    expect(byteLength(cappedText)).toBeLessThanOrEqual(8_388_608);
    expect((JSON.parse(cappedText) as any).result).toEqual({
      content: [{
        type: 'text',
        text: 'survey infrastructure error: response exceeds 8388608 bytes',
      }],
      isError: true,
    });
  });
});
