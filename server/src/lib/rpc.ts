/** Shared MCP JSON-RPC dispatcher for the Worker and local stdio server. */
import { CATALOG_TOOLS } from '../tools/catalog.js';
import { VALIDATOR_TOOLS } from '../tools/validator.js';
import { RENAME_TOOLS } from '../tools/rename.js';
import { MODERNIZE_TOOLS } from '../tools/modernize.js';
import { CHILD_ORDER_TOOLS } from '../tools/child-order.js';
import { TEMPLATE_TOOLS } from '../tools/templates.js';
import { RULES_TOOLS } from '../tools/rules.js';
import { POWERFX_TOOLS } from '../tools/powerfx.js';
import { QUEUE_TOOLS } from '../tools/queue.js';
import {
  MAX_SURVEY_REQUEST_ID_BYTES,
  MAX_SURVEY_RESPONSE_BYTES,
  SURVEY_TOOLS,
  countJsonUtf8Bytes,
  countUtf8StringBytes,
} from '../tools/survey.js';
import { CATALOG_VERSION, CATALOG_COUNTS, DUMP_SOURCED } from '../generated/catalog.js';
import { WORKER_VERSION } from './release.js';
import { REPORT_ISSUE_TOOLS } from '../tools/report-issue.js';

export const SERVER_INFO = {
  name: 'appforge',
  version: WORKER_VERSION,
};

export const TOOLS = [
  ...CATALOG_TOOLS,
  ...VALIDATOR_TOOLS,
  ...CHILD_ORDER_TOOLS,
  ...MODERNIZE_TOOLS,
  ...RENAME_TOOLS,
  ...TEMPLATE_TOOLS,
  ...RULES_TOOLS,
  ...POWERFX_TOOLS,
  ...QUEUE_TOOLS,
  ...SURVEY_TOOLS,
  ...REPORT_ISSUE_TOOLS,
];

// ─── Generated server instructions ────────────────────────────────────────
const CATALOG_AGE_DAYS = Math.floor((Date.now() - Date.parse(CATALOG_VERSION)) / 86_400_000);
const STALENESS = CATALOG_AGE_DAYS > 45
  ? ` WARNING: catalog is ${CATALOG_AGE_DAYS} days old — re-extract via cli/extractor.mjs after Power Apps monthly releases.`
  : '';
export const INSTRUCTIONS =
  `AppForge MCP v${SERVER_INFO.version} — ${TOOLS.length} tools across catalog, validation, child-order comparison, modernization, renaming, templates, rules, PowerFx, survey, issue reporting and the verification queue. ` +
  `Catalog extracted ${CATALOG_VERSION} (${CATALOG_COUNTS.controls_in_this_file ?? 'N'} extracted + ${DUMP_SOURCED.length} studio-dump-sourced controls).${STALENESS} ` +
  `Gate order: run validate_yaml before compile_canvas — refuse>0 means fix and retry, never bypass. After inserting controls, save in Studio, sync and run compare_child_order; recompile while reordered.`;

// ─── JSON-RPC types ───────────────────────────────────────────────────────
export type JsonRpcRequest = { jsonrpc: '2.0'; id?: string | number | null; method: string; params?: any };
export type JsonRpcResponse = { jsonrpc: '2.0'; id: string | number | null; result?: any; error?: { code: number; message: string; data?: any } };

const encodedBytes = (value: string): number => countUtf8StringBytes(value);

export const rpcError = (id: any, code: number, message: string, data?: any): JsonRpcResponse => ({
  jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data ? { data } : {}) },
});

export const rpcResult = (id: any, result: any): JsonRpcResponse => ({
  jsonrpc: '2.0', id: id ?? null, result,
});

export const surveyToolError = (message: string) => ({
  content: [{ type: 'text' as const, text: message }],
  isError: true,
});

export const isSurveyCall = (req: JsonRpcRequest): boolean =>
  req?.method === 'tools/call' && req.params?.name === 'survey_app';

export const isValidJsonRpcId = (id: unknown): id is string | number | null =>
  id === null || typeof id === 'string'
  || (typeof id === 'number' && Number.isFinite(id));

export function encodedRequestIdBytes(id: unknown): number {
  return countJsonUtf8Bytes(id, MAX_SURVEY_REQUEST_ID_BYTES + 1);
}

export type SerializedSurveyAppJsonRpcResponse = {
  body: string;
  bytes: number;
  replaced: boolean;
};

/** Serialize the actual survey JSON-RPC wire once, then replace rather than truncate above cap. */
export function serializeSurveyAppJsonRpcResponse(
  response: JsonRpcResponse,
  maxBytes = MAX_SURVEY_RESPONSE_BYTES,
): SerializedSurveyAppJsonRpcResponse {
  const body = JSON.stringify(response);
  const bytes = encodedBytes(body);
  if (bytes <= maxBytes) return { body, bytes, replaced: false };

  const replacement = rpcResult(
    response.id,
    surveyToolError(`survey infrastructure error: response exceeds ${maxBytes} bytes`),
  );
  const replacementBody = JSON.stringify(replacement);
  const replacementBytes = encodedBytes(replacementBody);
  if (replacementBytes > maxBytes) {
    throw new RangeError('configured survey response limit cannot encode its bounded error');
  }
  return { body: replacementBody, bytes: replacementBytes, replaced: true };
}

// ─── Method handlers ──────────────────────────────────────────────────────
export async function handleRequest(req: JsonRpcRequest, extra: { env: Env; ctx: ExecutionContext }): Promise<JsonRpcResponse | null> {
  if (isSurveyCall(req) && req.id !== undefined && !isValidJsonRpcId(req.id)) {
    return rpcError(
      null,
      -32600,
      'Invalid Request: survey_app id must be a string, finite number, or null',
    );
  }
  // Notifications: any id-less request → no response
  if (req.id === undefined) return null;

  if (req.method === 'initialize') {
    return rpcResult(req.id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: { listChanged: false } },
      serverInfo: SERVER_INFO,
      instructions: INSTRUCTIONS,
    });
  }

  if (req.method === 'tools/list') {
    return rpcResult(req.id, {
      tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
    });
  }

  if (req.method === 'tools/call') {
    const name = req.params?.name;
    const args = req.params?.arguments ?? {};
    const tool = TOOLS.find(t => t.name === name);
    if (!tool) return rpcError(req.id, -32601, `Unknown tool: ${name}`);
    if (name === 'survey_app'
      && encodedRequestIdBytes(req.id) > MAX_SURVEY_REQUEST_ID_BYTES) {
      return rpcResult(null, surveyToolError(
        `survey input error: request id exceeds ${MAX_SURVEY_REQUEST_ID_BYTES} encoded bytes`,
      ));
    }
    try {
      const result = await (tool.handler as any)(args, extra);
      return rpcResult(req.id, result);
    } catch (e: any) {
      return rpcError(req.id, -32000, `Tool ${name} failed: ${e?.message ?? String(e)}`);
    }
  }

  return rpcError(req.id, -32601, `Method not found: ${req.method}`);
}

