/**
 * Gate telemetry — the verification queue and validation health denominators.
 *
 * Every WARN and REFUSE a real validation hits is a prioritisation signal.
 * Counters live in the VERIFICATION_QUEUE KV namespace. Writes are intentionally
 * best-effort and every error is swallowed so telemetry can never fail a
 * validation. The caller always schedules the work with waitUntil().
 *
 * `stats:validate` is one KV key. Its read-modify-write updates have accepted
 * last-write-wins races under concurrent load, and Workers KV permits roughly
 * one write per second to a given key. These health counters are therefore
 * approximate at current traffic; sharding is a roadmap follow-up.
 */
import { CATALOG_VERSION } from '../generated/catalog.js';
import { WORKER_VERSION } from './release.js';
import type { Issue } from './validator.js';

export type AdjudicationOutcome = 'verified' | 'disproven' | 'dismissed';
export type Adjudication = {
  outcome: AdjudicationOutcome;
  at: string;
  by: string;
  count_at_stamp?: number;
};

type StoredIssueRecord = {
  count?: number;
  occurrences?: number;
  first_seen?: string;
  last_seen?: string;
  worker_version?: string;
  catalog_version?: string;
  near_miss?: boolean;
  adjudication?: Adjudication;
};

export type VerificationQueueEntry = {
  key: string;
  count: number;
  occurrences?: number;
  first_seen?: string;
  last_seen: string;
  worker_version?: string;
  catalog_version?: string;
  near_miss?: boolean;
  adjudication?: Adjudication;
};

export type ValidationStats = {
  runs: number;
  files: number;
  clear_runs: number;
  warn_runs: number;
  refuse_runs: number;
  warn_issues: number;
  refuse_issues: number;
  opportunities: Record<string, number>;
  since: string;
  last_seen: string;
  worker_version: string;
  catalog_version: string;
};

export type ValidationTelemetryInput = {
  files: number;
  issues: Issue[];
  /** Telemetry-only work: evaluated inside waitUntil, and only when KV exists. */
  opportunities?: () => Record<string, number>;
};

type IssueIncrement = { occurrences: number; nearMiss?: boolean };

const keyFor = (issue: Issue): string => {
  // Control-level rules have no property — emit `<Type>` with no trailing dot.
  const suffix = issue.property ? `${issue.type}.${issue.property}` : issue.type;
  if (issue.level === 'REFUSE') return `refuse:${issue.rule ?? 'unclassified-refusal'}:${suffix}`;
  // The unverified-augmentation family keeps its documented `warn:` prefix even
  // though it now carries a rule id (v2.4.7): get_verification_queue's contract
  // names `warn:` as the augmentation-verification queue.
  if (issue.rule === 'unverified-augmentation') return `warn:${suffix}`;
  return issue.rule ? `lint:${issue.rule}:${suffix}` : `warn:${suffix}`;
};

const issueIncrements = (issues: Issue[]): Map<string, IssueIncrement> => {
  const increments = new Map<string, IssueIncrement>();
  for (const issue of issues) {
    if (issue.level !== 'WARN' && issue.level !== 'REFUSE') continue;
    const key = keyFor(issue);
    const current = increments.get(key) ?? { occurrences: 0 };
    current.occurrences++;
    // Stored as the most-recent observed did-you-mean result, not as history.
    if (issue.level === 'REFUSE' && typeof issue.nearMiss === 'boolean') {
      current.nearMiss = issue.nearMiss;
    }
    increments.set(key, current);
  }
  return increments;
};

async function writeIssueRecords(
  kv: KVNamespace,
  increments: Map<string, IssueIncrement>,
  now: string,
): Promise<void> {
  // Isolate every key's get+put pair: one transient failure must not drop the
  // remaining issue records from the same validation run.
  await Promise.allSettled([...increments].map(async ([key, increment]) => {
    const current = await kv.get<StoredIssueRecord>(key, 'json');
    const { near_miss: _previousNearMiss, ...preserved } = current ?? {};
    const next: StoredIssueRecord = {
      ...preserved,
      // count is runs affected: the per-run map guarantees exactly one bump.
      count: (current?.count ?? 0) + 1,
      // A v1 record used count as its raw counter; use that as the upgrade default.
      occurrences: (current?.occurrences ?? current?.count ?? 0) + increment.occurrences,
      // An upgraded v1 record is not genuinely new and has no trustworthy first_seen.
      ...(current
        ? (current.first_seen === undefined ? {} : { first_seen: current.first_seen })
        : { first_seen: now }),
      last_seen: now,
      worker_version: WORKER_VERSION,
      catalog_version: CATALOG_VERSION,
      ...(increment.nearMiss === undefined ? {} : { near_miss: increment.nearMiss }),
    };
    await kv.put(key, JSON.stringify(next));
  }));
}

async function writeStats(
  kv: KVNamespace,
  input: ValidationTelemetryInput,
  opportunities: Readonly<Record<string, number>>,
  now: string,
): Promise<void> {
  const current = await kv.get<Partial<ValidationStats>>('stats:validate', 'json');
  const cumulativeOpportunities = { ...(current?.opportunities ?? {}) };
  for (const [rule, amount] of Object.entries(opportunities)) {
    if (!Number.isFinite(amount) || amount <= 0) continue;
    cumulativeOpportunities[rule] = (cumulativeOpportunities[rule] ?? 0) + amount;
  }

  const warnIssues = input.issues.filter(issue => issue.level === 'WARN').length;
  const refuseIssues = input.issues.filter(issue => issue.level === 'REFUSE').length;
  const next: ValidationStats = {
    runs: (current?.runs ?? 0) + 1,
    files: (current?.files ?? 0) + input.files,
    clear_runs: (current?.clear_runs ?? 0) + (warnIssues === 0 && refuseIssues === 0 ? 1 : 0),
    warn_runs: (current?.warn_runs ?? 0) + (warnIssues > 0 ? 1 : 0),
    refuse_runs: (current?.refuse_runs ?? 0) + (refuseIssues > 0 ? 1 : 0),
    warn_issues: (current?.warn_issues ?? 0) + warnIssues,
    refuse_issues: (current?.refuse_issues ?? 0) + refuseIssues,
    opportunities: cumulativeOpportunities,
    since: current?.since ?? now,
    last_seen: now,
    worker_version: WORKER_VERSION,
    catalog_version: CATALOG_VERSION,
  };
  await kv.put('stats:validate', JSON.stringify(next));
}

/** Record one complete validation run, including CLEAR runs and opportunities. */
export function recordValidationTelemetry(
  env: Env,
  ctx: ExecutionContext,
  input: ValidationTelemetryInput,
): void {
  const kv = env.VERIFICATION_QUEUE;
  if (!kv) return;

  ctx.waitUntil((async () => {
    try {
      const now = new Date().toISOString();
      const increments = issueIncrements(input.issues);
      const opportunities = input.opportunities?.() ?? {};
      // Issue keys and the aggregate use disjoint keys. Attempt both even when
      // one family fails; writeIssueRecords adds isolation within its family.
      await Promise.allSettled([
        writeIssueRecords(kv, increments, now),
        writeStats(kv, input, opportunities, now),
      ]);
    } catch { /* never fail a validation over telemetry */ }
  })());
}

export async function readValidationStats(env: Env): Promise<ValidationStats | null> {
  const kv = env.VERIFICATION_QUEUE;
  if (!kv) return null;
  const stats = await kv.get<ValidationStats>('stats:validate', 'json');
  return stats ? { ...stats, opportunities: stats.opportunities ?? {} } : null;
}

const DEFAULT_QUEUE_PREFIXES = ['warn:', 'lint:', 'refuse:'] as const;

export async function readVerificationQueue(
  env: Env,
  opts: { prefix?: string; limit?: number; includeAdjudicated?: boolean } = {},
): Promise<VerificationQueueEntry[]> {
  const kv = env.VERIFICATION_QUEUE;
  if (!kv) return [];
  const limit = Math.max(1, Math.min(200, opts.limit ?? 50));
  const list = await kv.list({ prefix: opts.prefix, limit: 1000 });
  const entries = await Promise.all(list.keys
    .filter(key => opts.prefix !== undefined
      || DEFAULT_QUEUE_PREFIXES.some(prefix => key.name.startsWith(prefix)))
    .map(async key => {
      const value = await kv.get<StoredIssueRecord>(key.name, 'json');
      if (!value || (!opts.includeAdjudicated && value.adjudication)) return null;
      const entry: VerificationQueueEntry = {
        key: key.name,
        count: value.count ?? 0,
        occurrences: value.occurrences ?? value.count ?? 0,
        last_seen: value.last_seen ?? '',
      };
      if (value.first_seen !== undefined) entry.first_seen = value.first_seen;
      if (value.worker_version !== undefined) entry.worker_version = value.worker_version;
      if (value.catalog_version !== undefined) entry.catalog_version = value.catalog_version;
      if (value.near_miss !== undefined) entry.near_miss = value.near_miss;
      if (value.adjudication !== undefined) entry.adjudication = value.adjudication;
      return entry;
    }));
  return entries
    .filter((entry): entry is VerificationQueueEntry => entry !== null)
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, limit);
}
