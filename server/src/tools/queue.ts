/**
 * get_verification_queue — Phase 6.
 * Surfaces gate counters and validation-run denominators that drive catalog and
 * rule verification (see knowledge/VERIFICATION-DOCTRINE.md verification doctrine).
 */
import { readValidationStats, readVerificationQueue } from '../lib/telemetry.js';

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };
const json = (obj: unknown): ToolResult => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] });

export const getVerificationQueue = {
  name: 'get_verification_queue',
  description:
    "Read the stats:validate health/denominator header and verification queue entries, sorted by runs affected. Useful prefixes: 'warn:' (unverified augmentations), 'lint:' (lint WARNs), and 'refuse:' (gate refusals). Adjudicated entries are closed cases and are excluded by default.",
  inputSchema: {
    type: 'object' as const,
    properties: {
      prefix: { type: 'string', description: "Optional key prefix filter, normally 'warn:', 'lint:', or 'refuse:'. Unprefixed listings include only those three families." },
      limit: { type: 'number', description: 'Max entries returned. Default 50, cap 200.', default: 50 },
      include_adjudicated: { type: 'boolean', description: 'Include closed/adjudicated entries. Default false.', default: false },
    },
  },
  handler: async ({ prefix, limit, include_adjudicated }: { prefix?: string; limit?: number; include_adjudicated?: boolean }, extra?: { env: Env; ctx: ExecutionContext }): Promise<ToolResult> => {
    if (!extra?.env?.VERIFICATION_QUEUE) {
      return json({ stats: null, entries: [], note: 'VERIFICATION_QUEUE KV binding not configured on this deployment.' });
    }
    const [stats, entries] = await Promise.all([
      readValidationStats(extra.env),
      readVerificationQueue(extra.env, { prefix, limit, includeAdjudicated: include_adjudicated }),
    ]);
    return json({ stats, count: entries.length, prefix: prefix ?? null, include_adjudicated: include_adjudicated ?? false, entries });
  },
};

export const QUEUE_TOOLS = [getVerificationQueue];
