console.log = console.info = console.debug = console.error.bind(console);

import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import {
  handleRequest,
  isSurveyCall,
  rpcError,
  serializeSurveyAppJsonRpcResponse,
  type JsonRpcRequest,
} from '../lib/rpc.js';
import { FileKV } from './file-kv.js';

const dataDir = process.env.APPFORGE_DATA_DIR ?? (process.platform === 'win32'
  ? join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'AppForge')
  : join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), 'appforge'));
const env = {
  VERIFICATION_QUEUE: new FileKV(join(dataDir, 'kv')) as unknown as KVNamespace,
  APPFORGE_ISSUES_REPO: process.env.APPFORGE_ISSUES_REPO,
};
const ctx = {
  waitUntil(p: Promise<unknown>) { Promise.resolve(p).catch(() => {}); },
  passThroughOnException() {},
};

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of lines) {
  if (line.trim() === '') continue;
  let msg: unknown;
  try {
    msg = JSON.parse(line);
  } catch {
    process.stdout.write(`${JSON.stringify(rpcError(null, -32700, 'Parse error: invalid JSON'))}\n`);
    continue;
  }
  if (Array.isArray(msg)) {
    process.stdout.write(`${JSON.stringify(rpcError(null, -32600, 'Invalid Request: batches are not supported over stdio'))}\n`);
    continue;
  }
  if (msg === null || typeof msg !== 'object') {
    process.stdout.write(`${JSON.stringify(rpcError(null, -32600, 'Invalid Request: expected an object'))}\n`);
    continue;
  }
  // The local shims intentionally omit Worker-only bindings and context fields.
  const request = msg as JsonRpcRequest;
  const response = await handleRequest(request, { env: env as unknown as Env, ctx: ctx as ExecutionContext });
  if (response === null) continue;
  const body = isSurveyCall(request)
    ? serializeSurveyAppJsonRpcResponse(response).body
    : JSON.stringify(response);
  process.stdout.write(`${body}\n`);
}
