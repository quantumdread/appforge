/** Campaign orchestration: shared T0 modules own evidence and local edits. */
import { appendFile, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { parseVerificationDocument, normalizeVerificationQueue, sha256 } from './verification-contracts.mjs';
import { readVerificationSources, planVerificationEdits, writeVerificationPackage,
  applyVerificationEdits, verifyAppliedVerificationEdits } from './verification-edits.mjs';
import { evaluateVerificationEvidence } from './verification-evidence.mjs';
import { VerificationEditError } from './verification-errors.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const DEFAULT_ARTIFACT = resolve(REPO_ROOT, 'cli/dist/analyzer-core.mjs');
const LOCAL_SNAPSHOT_NOTE = 'derived from captured listing; proposed local stamps, not a live refresh or proof edits applied';
const lexical = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const mismatch = message => { throw new VerificationEditError('evidence-mismatch', message); };
const text = bytes => {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { mismatch('Campaign inputs must contain complete UTF-8 JSON.'); }
};
const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n', 'utf8');
const md = value => String(value).replace(/\\/gu, '\\\\').replace(/[\r\n]+/gu, ' / ').replace(/([`*_{}\[\]()#+.!|<>-])/gu, '\\$1');

function bindSources(manifest, sources) {
  const pins = [...sources.files].map(([path, file]) => ({ path, sha256: file.sha256 }))
    .sort((left, right) => lexical(left.path, right.path));
  if (manifest.source.analyzer_artifact_sha256 !== sources.analyzerArtifactSha256
    || manifest.source.catalog_version !== sources.catalog.catalogVersion
    || manifest.source.extracted_at !== sources.catalog.extractedAt
    || !isDeepStrictEqual(manifest.source.rules_files, pins)) {
    throw new VerificationEditError('source-drift', 'Campaign source guards differ from the selected catalog and analyzer.');
  }
}

function bindQueue(manifest, queue) {
  if (manifest.capture_scope !== queue.capture_scope || manifest.captured_at !== queue.captured_at) {
    mismatch('Campaign capture metadata differs from the supplied queue.');
  }
  const selected = new Map(queue.entries.filter(entry => entry.adjudication === null).map(entry => [entry.key, entry]));
  const represented = new Set();
  for (const row of manifest.rows) for (const entry of row.queue) {
    if (!selected.has(entry.key) || selected.get(entry.key).count !== entry.count) mismatch('Campaign queue keys or counts differ from the supplied capture.');
    represented.add(entry.key);
  }
  if (represented.size !== selected.size) mismatch('Campaign omits selected captured queue keys.');
  const excluded = [...queue.excluded, ...queue.entries.filter(entry => entry.adjudication !== null)
    .map(entry => ({ key: entry.key, reason: 'adjudicated', adjudication: entry.adjudication }))];
  const byKey = (left, right) => lexical(left.key, right.key);
  if (!isDeepStrictEqual([...manifest.excluded].sort(byKey), excluded.sort(byKey))) mismatch('Campaign exclusions differ from the supplied capture.');
}

async function readCampaignContext({ campaignPath, resultsPath, queuePath }) {
  const [campaignBytes, resultsBytes, queueBytes] = await Promise.all([readFile(campaignPath), readFile(resultsPath), readFile(queuePath)]);
  const manifest = parseVerificationDocument(text(campaignBytes), 'verification-campaign/1');
  const results = parseVerificationDocument(text(resultsBytes), 'verification-results/1');
  let queueValue;
  try { queueValue = JSON.parse(text(queueBytes)); }
  catch { mismatch('Queue capture must contain complete UTF-8 JSON.'); }
  const queue = normalizeVerificationQueue(queueValue);
  if (results.campaign_id !== manifest.campaign_id || results.campaign_sha256 !== sha256(campaignBytes)
    || manifest.source.queue_file_sha256 !== sha256(queueBytes)) mismatch('Results, campaign and captured queue hashes do not agree.');
  bindQueue(manifest, queue);
  const cases = manifest.rows.filter(row => row.kind === 'case');
  const caseById = new Map(cases.map(row => [row.id, row]));
  for (const result of results.cases) {
    const row = caseById.get(result.case_id);
    if (!row || result.claim_ref !== row.claim_ref || result.repro_sha256 !== row.repro.sha256) {
      mismatch('Every result must bind one generated campaign case and its exact repro.');
    }
  }
  return { manifest, results, queue, queueValue, cases,
    hashes: { campaign_sha256: sha256(campaignBytes), results_sha256: sha256(resultsBytes), queue_sha256: sha256(queueBytes) },
    reproBaseDir: dirname(resolve(campaignPath)), evidenceBaseDir: dirname(resolve(resultsPath)) };
}

async function evaluateCases(context, sources, maintainer, acknowledgeMaintainerEvidence) {
  const results = new Map(context.results.cases.map(result => [result.case_id, result]));
  const decisions = [];
  const requests = [];
  for (const row of context.cases) {
    const supplied = results.get(row.id);
    const decision = { case_id: row.id, claim_ref: row.claim_ref, status: 'pending', outcome: null, reason: 'No result supplied; this campaign case remains pending.' };
    decisions.push(decision);
    if (!supplied) continue;
    const { kind: _kind, id: _id, queue: _queue, local_gate: _gate, status: _status, ...claim } = row;
    const { case_id: _caseId, claim_ref: _claimRef, repro_sha256: _reproHash, ...result } = supplied;
    const evaluated = await evaluateVerificationEvidence({ claim, result, producedBy: context.results.produced_by,
      reproBaseDir: context.reproBaseDir, evidenceBaseDir: context.evidenceBaseDir, maintainer, acknowledgeMaintainerEvidence,
      analyzerArtifactPath: sources.analyzerArtifactPath, analyzerArtifactSha256: sources.analyzerArtifactSha256 });
    if (row.status === 'local-gate-blocked') {
      Object.assign(decision, { status: 'blocked', reason: 'The reviewed case is blocked by its pinned local gate; regenerate and review it before resolution.' });
      continue;
    }
    if (evaluated.status !== 'eligible') {
      Object.assign(decision, { status: evaluated.status, reason: evaluated.reason });
      continue;
    }
    Object.assign(decision, { status: 'settled', outcome: result.outcome, reason: evaluated.reason });
    if (evaluated.permission === 'promote-property' || evaluated.permission === 'remove-property') {
      requests.push({ id: row.id, claim, result, action: { kind: 'property',
        operation: evaluated.permission === 'remove-property' ? 'remove' : 'add-or-promote' } });
    }
  }
  return { decisions, requests };
}

function mergeEditDecisions(decisions, edits) {
  const byId = new Map(decisions.map(decision => [decision.case_id, decision]));
  for (const edit of edits) {
    if (edit.status !== 'eligible') {
      Object.assign(byId.get(edit.id), { status: edit.status, outcome: null, reason: edit.reason });
    }
  }
}

function keyDecisions(context, decisions) {
  const states = new Map(decisions.map(decision => [decision.case_id, decision]));
  const assertions = new Map(context.manifest.queue_key_coverage.map(assertion => [assertion.key, assertion]));
  const nongenerated = new Set(context.manifest.rows.filter(row => row.kind === 'queue').map(row => row.queue[0].key));
  return context.queue.entries.filter(entry => entry.adjudication === null).sort((left, right) => lexical(left.key, right.key)).map(entry => {
    const rows = context.cases.filter(row => row.queue.some(item => item.key === entry.key));
    const refs = rows.map(row => row.claim_ref).sort(lexical);
    const assertion = assertions.get(entry.key);
    const complete = assertion?.complete === true && refs.length > 0
      && isDeepStrictEqual(assertion.claim_refs, refs) && !nongenerated.has(entry.key);
    const settled = complete && rows.every(row => states.get(row.id).status === 'settled');
    const outcomes = new Set(rows.map(row => states.get(row.id).outcome));
    const outcome = settled && outcomes.size === 1 ? states.get(rows[0].id).outcome : null;
    return { key: entry.key, count: entry.count, outcome, status: outcome ? 'proposed' : 'open', reason: outcome
      ? 'Complete reviewed key coverage has one common settled outcome.'
      : 'Incomplete coverage, pending or non-generated cases, or mixed outcomes leave this aggregate key open.' };
  });
}

function localSnapshot(context, keys, at, producedBy) {
  const value = structuredClone(context.queueValue);
  const byKey = new Map(keys.filter(key => key.outcome !== null).map(key => [key.key, key]));
  for (const entry of value.entries) {
    const proposed = byKey.get(entry.key);
    if (!proposed) continue;
    const record = value.schema === 'verification-queue-export/1' ? entry.value : entry;
    record.adjudication = { outcome: proposed.outcome, at, by: producedBy, count_at_stamp: proposed.count };
  }
  return value;
}

function ledger(context, decisions, keys, plan) {
  const lines = ['# Campaign result review', '', `Campaign: ${context.manifest.campaign_id}`, '', LOCAL_SNAPSHOT_NOTE + '.',
    '', 'This is a local review package. Catalog replacements require the separate apply command; remote stamping is separately authorized.',
    'Results are cumulative. Collect the intended compiler batch before applying; later results after catalog changes require a rebuilt and reviewed campaign.',
    'Configured maintainer attribution and acknowledgement are operator assertions, not authentication. Private raw evidence is retained outside this Markdown ledger.',
    '', `Proposed replacement files: ${plan.files.length}.`, '', '## Case decisions', ''];
  const suppliedResults = new Map(context.results.cases.map(result => [result.case_id, result]));
  for (const decision of decisions) {
    const supplied = suppliedResults.get(decision.case_id);
    const operatorReason = supplied ? `Operator reported ${supplied.outcome}: ${md(supplied.reason)} ` : '';
    lines.push(`- ${decision.case_id}; ${decision.claim_ref}: ${decision.status}; outcome: ${decision.outcome ?? 'unresolved'}. ${operatorReason}Gate: ${md(decision.reason)}`);
  }
  lines.push('', '## Aggregate queue keys', '');
  for (const key of keys) lines.push(`- ${md(key.key)}: ${key.status}; outcome: ${key.outcome ?? 'unresolved'}. ${md(key.reason)}`);
  lines.push('', '## Non-generated rows', '');
  for (const row of context.manifest.rows.filter(row => row.kind === 'queue')) lines.push(`- ${md(row.queue[0].key)}: ${row.status}. ${md(row.reason)}`);
  return lines.join('\n') + '\n';
}

async function writeReview({ context, decisions, keys, plan, outDir, at, remote = false }) {
  const snapshot = localSnapshot(context, keys, at, plan.produced_by);
  normalizeVerificationQueue(snapshot);
  const editsBytes = jsonBytes(plan);
  const files = [
    { path: 'edits.json', bytes: editsBytes },
    { path: 'review-context.json', bytes: jsonBytes({ schema: 'verification-review-context/1', ...context.hashes, edits_sha256: sha256(editsBytes) }) },
    ...plan.files.map(file => ({ path: file.path, bytes: Buffer.from(file.after_base64, 'base64') })),
    { path: 'RESULTS.md', bytes: Buffer.from(ledger(context, decisions, keys, plan), 'utf8') },
    { path: 'queue-snapshot.json', bytes: jsonBytes(snapshot) },
  ];
  if (remote) files.push({ path: 'REMOTE-STAMPS.md', bytes: Buffer.from([
    '# Remote stamp completion', '', 'Point-in-time KV get/put; no compare-and-swap or rollback guarantee.',
    'This report records remote attempts. The separate queue snapshot remains a proposal derived from the captured listing.',
    '', ...keys.filter(key => key.outcome !== null).map(key => `- pending: ${md(key.key)}`), '',
  ].join('\n'), 'utf8') });
  const written = await writeVerificationPackage({ outDir, files });
  return { ...written, decisions, keys, plan };
}

export async function reviewCampaign(options, { analyzerArtifactPath = DEFAULT_ARTIFACT, now = () => new Date().toISOString() } = {}) {
  const context = await readCampaignContext(options);
  const sources = await readVerificationSources({ rulesRoot: options.rulesRoot, analyzerArtifactPath });
  bindSources(context.manifest, sources);
  const { decisions, requests } = await evaluateCases(context, sources, options.maintainer, options.acknowledgeMaintainerEvidence);
  const { plan, decisions: edits } = await planVerificationEdits({ sources, requests, producedBy: context.results.produced_by,
    date: context.results.captured_at.slice(0, 10), evidenceBaseDir: context.evidenceBaseDir,
    reproBaseDir: context.reproBaseDir, maintainer: options.maintainer, acknowledgeMaintainerEvidence: options.acknowledgeMaintainerEvidence });
  if (context.results.produced_by !== plan.produced_by) mismatch('Results and reviewed plan must have exactly the same attribution.');
  mergeEditDecisions(decisions, edits);
  const keys = keyDecisions(context, decisions);
  return writeReview({ context, decisions, keys, plan, outDir: options.outDir, at: now() });
}

const readPlan = async path => {
  const bytes = await readFile(path);
  return { plan: parseVerificationDocument(text(bytes), 'verification-edits/1'), bytes };
};

export async function applyCampaignEdits(options, { analyzerArtifactPath = DEFAULT_ARTIFACT } = {}) {
  const { plan } = await readPlan(options.editsPath);
  return { report: await applyVerificationEdits({ plan, rulesRoot: options.rulesRoot, analyzerArtifactPath,
    maintainer: options.maintainer, acknowledgeMaintainerEvidence: options.acknowledgeMaintainerEvidence }) };
}

function bindReviewedPlan(context, plan, requests) {
  const pathIdentity = path => process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path);
  if (plan.produced_by !== context.results.produced_by || plan.date !== context.results.captured_at.slice(0, 10)
    || pathIdentity(plan.evidence_base_dir) !== pathIdentity(context.evidenceBaseDir)
    || pathIdentity(plan.repro_base_dir) !== pathIdentity(context.reproBaseDir)
    || !isDeepStrictEqual(plan.requests, requests)) {
    mismatch('The reviewed plan requests, attribution, date and evidence directories must bind these cumulative results and campaign.');
  }
}

function normalizedLive(key, live, at) {
  if (!live || typeof live !== 'object' || Array.isArray(live)) throw new Error('Missing or malformed live record.');
  // Preserve every unrelated live field; validate only the fields used to stamp
  // through the existing closed record contract, with its legacy count fallback.
  const relevant = {};
  if (Object.hasOwn(live, 'count')) relevant.count = live.count;
  if (Object.hasOwn(live, 'adjudication')) relevant.adjudication = live.adjudication;
  return normalizeVerificationQueue({ schema: 'verification-queue-export/1', captured_at: at,
    entries: [{ key, value: relevant }] }).entries[0];
}

async function bindReviewContext(context, editsPath, editsBytes) {
  let value;
  try { value = JSON.parse(text(await readFile(join(dirname(resolve(editsPath)), 'review-context.json')))); }
  catch { mismatch('Stamp mode requires the complete sibling review-context.json from the reviewed package.'); }
  const expected = { schema: 'verification-review-context/1', ...context.hashes, edits_sha256: sha256(editsBytes) };
  if (!isDeepStrictEqual(value, expected)) {
    mismatch('The closed review context must bind the exact reviewed campaign, cumulative results, queue and edits bytes.');
  }
}

export async function stampCampaign(options, { analyzerArtifactPath = DEFAULT_ARTIFACT,
  now = () => new Date().toISOString(), createRemoteBoundary } = {}) {
  const context = await readCampaignContext(options);
  const { plan, bytes: editsBytes } = await readPlan(options.editsPath);
  if (context.results.produced_by !== plan.produced_by) mismatch('Results and reviewed plan must have exactly the same attribution.');
  await bindReviewContext(context, options.editsPath, editsBytes);
  // Stamp mode never calls applyVerificationEdits. T0 reconstructs the before
  // state and requires every current replacement to match its reviewed after hash.
  const verified = await verifyAppliedVerificationEdits({ plan, rulesRoot: options.rulesRoot, analyzerArtifactPath,
    maintainer: options.maintainer, acknowledgeMaintainerEvidence: options.acknowledgeMaintainerEvidence });
  bindSources(context.manifest, verified.sources);
  const { decisions, requests } = await evaluateCases(context, verified.sources, options.maintainer, options.acknowledgeMaintainerEvidence);
  bindReviewedPlan(context, plan, requests);
  mergeEditDecisions(decisions, verified.decisions);
  const keys = keyDecisions(context, decisions);
  const written = await writeReview({ context, decisions, keys, plan, outDir: options.outDir, at: now(), remote: true });
  const candidates = keys.filter(key => key.outcome !== null);
  const report = { status: 'partial', completed: [], already_stamped: [], failed: null, remaining: candidates.map(key => key.key) };
  const recordProgress = line => appendFile(join(written.directory, 'REMOTE-STAMPS.md'), line + '\n', { flag: 'a' });
  let phase = 'boundary-construction';
  let failureReason = 'the remote boundary could not be constructed';
  try {
    const boundary = candidates.length ? createRemoteBoundary() : null;
    for (const candidate of candidates) {
      report.remaining.shift();
      report.failed = candidate.key;
      phase = 'remote-get';
      failureReason = 'the live record could not be read';
      const live = await boundary.get(candidate.key);
      phase = 'live-record-check';
      failureReason = 'the live record is missing or malformed';
      const at = now();
      const normalized = normalizedLive(candidate.key, live, at);
      const existing = normalized.adjudication;
      let status;
      if (existing !== null) {
        phase = 'adjudication-check';
        if (existing.outcome !== candidate.outcome || existing.by !== plan.produced_by) {
          failureReason = 'a conflicting live adjudication requires operator review';
          throw new Error(failureReason);
        }
        if (existing.count_at_stamp !== normalized.count) {
          failureReason = 'the key is already adjudicated with changed count and requires fresh operator review';
          throw new Error(failureReason);
        }
        report.already_stamped.push(candidate.key);
        status = 'already-stamped';
      } else {
        phase = 'remote-put';
        failureReason = 'the live replacement could not be written';
        await boundary.put(candidate.key, { ...live, adjudication: { outcome: candidate.outcome,
          at, by: plan.produced_by, count_at_stamp: normalized.count } });
        report.completed.push(candidate.key);
        status = 'completed';
      }
      report.failed = null;
      phase = 'completion-report';
      failureReason = 'local completion reporting failed after the recorded remote outcome';
      await recordProgress(`- ${status}: ${md(candidate.key)}; outcome: ${candidate.outcome}; count_at_stamp: ${normalized.count}.`);
    }
    phase = 'completion-report';
    failureReason = 'local completion reporting failed after the recorded remote outcomes';
    await recordProgress(`\nComplete: ${report.completed.length} written, ${report.already_stamped.length} already stamped, 0 remaining.`);
    report.status = 'complete';
  } catch {
    let completionRecorded = true;
    try {
      await recordProgress(`\nStopped: ${md(failureReason)}.\n- completed: ${report.completed.map(md).join('; ') || 'none'}\n- already-stamped: ${report.already_stamped.map(md).join('; ') || 'none'}\n- failed: ${report.failed === null ? 'none' : md(report.failed)}\n- remaining: ${report.remaining.map(md).join('; ') || 'none'}`);
    } catch {
      // The returned/CLI error report still retains every observed remote result.
      completionRecorded = false;
    }
    const error = new Error(`Campaign remote stamping stopped: ${failureReason}. Inspect the completion state before retrying.`);
    error.report = { ...report, phase, completion_recorded: completionRecorded };
    throw error;
  }
  return { ...written, report };
}
