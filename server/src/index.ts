/**
 * AppForge MCP — v2 worker entry point.
 *
 * Speaks the MCP JSON-RPC 2.0 protocol over HTTP POST at /mcp.
 * Bearer-token auth via the MCP_AUTH_TOKEN secret (fail-closed, timing-safe).
 *
 * TOOLS spans catalog, validation, templates, rules, PowerFx, and the
 * verification queue — extend the array as new tool groups land.
 */
import { CATALOG_VERSION, CATALOG_COUNTS, CATALOG_SOURCE } from './generated/catalog.js';
import { MAX_SURVEY_RESPONSE_BYTES } from './tools/survey.js';
import {
  SERVER_INFO,
  TOOLS,
  handleRequest,
  isSurveyCall,
  rpcError,
  serializeSurveyAppJsonRpcResponse,
  type JsonRpcRequest,
} from './lib/rpc.js';
import {
  handleSurveyEnvelopeRequest,
  resolveCaller,
  type SurveyTelemetryEnv,
} from './lib/survey-telemetry.js';

export {
  serializeSurveyAppJsonRpcResponse,
  type SerializedSurveyAppJsonRpcResponse,
} from './lib/rpc.js';
export { SurveyTelemetryCoordinator } from './durable/survey-telemetry-coordinator.js';

// Conservative semantic upper bound:
//   6*1,500,000 YAML + 2*65,536 file ids + 6*65,536 datasource keys
//   + 343,619 bytes for bounded values, request id, and JSON structure.
// Arbitrary padding and duplicate-key encodings are not admitted semantics.
export const MAX_SEMANTIC_SURVEY_REQUEST_BYTES = 9_867_907;
export const MAX_MCP_REQUEST_BYTES = 10 * 1_024 * 1_024;

type BoundedRequestBody =
  | { state: 'ok'; text: string }
  | { state: 'too-large' }
  | { state: 'invalid-utf8' };

async function readBoundedRequestBody(
  request: Request,
  maxBytes: number,
): Promise<BoundedRequestBody> {
  if (request.body === null) return { state: 'ok', text: '' };
  const reader = request.body.getReader();
  let total = 0;
  let bytes = new Uint8Array(Math.min(1_024, maxBytes));
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      const nextTotal = total + part.value.byteLength;
      if (nextTotal > maxBytes) {
        try { await reader.cancel(); } catch { /* the bounded result is authoritative */ }
        return { state: 'too-large' };
      }
      if (nextTotal > bytes.byteLength) {
        let capacity = Math.max(1, bytes.byteLength);
        while (capacity < nextTotal) capacity = Math.min(maxBytes, capacity * 2);
        const grown = new Uint8Array(capacity);
        grown.set(bytes.subarray(0, total));
        bytes = grown;
      }
      bytes.set(part.value, total);
      total = nextTotal;
    }
    const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false });
    return { state: 'ok', text: decoder.decode(bytes.subarray(0, total)) };
  } catch {
    return { state: 'invalid-utf8' };
  } finally {
    reader.releaseLock();
  }
}

/** One Workers Logs line per JSON-RPC call: who called what. No arguments are logged. */
function logCalls(caller: string, body: unknown): void {
  const calls = (Array.isArray(body) ? body : [body]).map((req: any) => ({
    method: typeof req?.method === 'string' ? req.method.slice(0, 64) : null,
    ...(req?.method === 'tools/call' && typeof req.params?.name === 'string'
      ? { tool: req.params.name.slice(0, 64) } : {}),
  }));
  console.log(JSON.stringify({ event: 'mcp-call', caller, calls }));
}

// ─── Worker fetch handler ─────────────────────────────────────────────────
export function createWorker(options: { maxSurveyResponseBytes?: number } = {}) {
  const maxSurveyResponseBytes = options.maxSurveyResponseBytes ?? MAX_SURVEY_RESPONSE_BYTES;
  return {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
      const url = new URL(request.url);

      // Health / discovery
      if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/healthz')) {
        return Response.json({
          server: SERVER_INFO,
          catalog: {
            version: CATALOG_VERSION,
            source: { cluster_category: (CATALOG_SOURCE as any).cluster_category ?? null, mcp: (CATALOG_SOURCE as any).mcp ?? null },
            counts: CATALOG_COUNTS,
          },
          tools: TOOLS.map(t => t.name),
          protocol: 'mcp/2024-11-05 over JSON-RPC 2.0 POST',
          endpoint: '/mcp',
        });
      }

      if (request.method === 'POST' && url.pathname === '/survey/envelope') {
        return handleSurveyEnvelopeRequest(request, env);
      }
      if (url.pathname === '/survey/envelope') {
        return new Response(JSON.stringify({ error: 'method-not-allowed' }), {
          status: 405,
          headers: {
            allow: 'POST',
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
          },
        });
      }

      // MCP endpoint
      if (request.method === 'POST' && url.pathname === '/mcp') {
        // Auth — fail closed, timing-safe
        const expected = (env as { MCP_AUTH_TOKEN?: string }).MCP_AUTH_TOKEN;
        if (!expected) return new Response('Server not configured (MCP_AUTH_TOKEN missing)', { status: 503 });
        const auth = request.headers.get('authorization') ?? '';
        const caller = auth.startsWith('Bearer ') ? resolveCaller(auth.slice(7), env as SurveyTelemetryEnv) : null;
        if (caller === null) {
          return new Response('Unauthorized', { status: 401 });
        }

        const intake = await readBoundedRequestBody(request, MAX_MCP_REQUEST_BYTES);
        if (intake.state === 'too-large') {
          return Response.json(rpcError(
            null,
            -32600,
            `Request too large: authenticated MCP bodies are limited to ${MAX_MCP_REQUEST_BYTES} bytes`,
          ), { status: 413 });
        }
        if (intake.state === 'invalid-utf8') {
          return Response.json(rpcError(null, -32700, 'Parse error: invalid JSON'), { status: 400 });
        }
        let body: JsonRpcRequest | JsonRpcRequest[];
        try {
          body = JSON.parse(intake.text);
        } catch {
          return Response.json(rpcError(null, -32700, 'Parse error: invalid JSON'), { status: 400 });
        }

        logCalls(caller, body);

        // Batch
        if (Array.isArray(body)) {
          // A response-bearing survey cannot truthfully cap a mixed JSON-RPC
          // array without rewriting legacy results. Reject the whole batch before
          // any handler runs. Survey notifications remain ordinary notifications.
          const responseBearingSurvey = body.find(r => isSurveyCall(r) && r.id !== undefined);
          if (responseBearingSurvey !== undefined) {
            return Response.json([rpcError(
              null,
              -32600,
              'survey_app is not supported in JSON-RPC batches',
            )]);
          }
          const responses = (await Promise.all(
            body.map(r => handleRequest(r, { env, ctx })),
          )).filter(r => r !== null);
          return responses.length ? Response.json(responses) : new Response(null, { status: 204 });
        }

        const response = await handleRequest(body, { env, ctx });
        if (response === null) return new Response(null, { status: 204 });
        if (isSurveyCall(body)) {
          const serialized = serializeSurveyAppJsonRpcResponse(
            response,
            maxSurveyResponseBytes,
          );
          return new Response(serialized.body, {
            headers: { 'content-type': 'application/json' },
          });
        }
        return Response.json(response);
      }

      return new Response('Not Found', { status: 404 });
    },
  } satisfies ExportedHandler<Env>;
}

export default createWorker();
