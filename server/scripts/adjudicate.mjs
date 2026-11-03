#!/usr/bin/env node
/**
 * Hand-stamp one verification-queue record.
 *
 * Usage: node scripts/adjudicate.mjs <key> <verified|disproven|dismissed>
 *        [--by <name>]
 */
import { execFile as execFileCallback } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const execFile = promisify(execFileCallback);
const OUTCOMES = new Set(['verified', 'disproven', 'dismissed']);
const MCP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const WRANGLER_JS_PATH = resolve(MCP_ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

export function parseArgs(argv) {
  const [key, outcome, ...rest] = argv;
  if (!key || !outcome) {
    throw new Error('usage: adjudicate.mjs <key> <verified|disproven|dismissed> [--by <name>]');
  }
  if (!OUTCOMES.has(outcome)) {
    throw new Error(`invalid outcome '${outcome}'; expected verified, disproven, or dismissed`);
  }

  let by = 'manual';
  if (rest.length) {
    if (rest.length !== 2 || rest[0] !== '--by' || !rest[1]) {
      throw new Error('optional attribution must be exactly two tokens: --by <name>');
    }
    by = rest[1];
  }
  return { key, outcome, by };
}

export const ADJUDICATION_HELP = [
  'Usage:',
  '  adjudicate.mjs <key> <verified|disproven|dismissed> [--by <name>]',
  '  adjudicate.mjs --campaign <manifest> --results <results> --queue <capture> --rules-root <root> --out <new-directory> [--acknowledge-maintainer-evidence]',
  '  adjudicate.mjs --apply-local <edits.json> --rules-root <root> [--acknowledge-maintainer-evidence]',
  '  adjudicate.mjs --stamp-remote --campaign <manifest> --results <results> --queue <capture> --rules-root <root> --edits <reviewed-edits.json> --out <new-directory> [--acknowledge-maintainer-evidence]',
  '',
  'Review creates a fresh local package. Apply and remote stamping are separate commands.',
  'Stamp mode verifies prior application through the read-only shared verifier; it never applies files.',
  'Stamp mode requires sibling review-context.json binding the exact reviewed campaign, results, queue and edits bytes.',
  'Remote stamping requires per-instance authorization and full campaign/results/queue context.',
  'Remote KV get/put is point-in-time and best effort; use a quiescent write window when strict preservation is required.',
  'Results are cumulative. Collect the intended compiler batch before applying; later results after catalog changes require a rebuilt and reviewed campaign.',
  'The configured maintainer marker (APPFORGE_MAINTAINER) and acknowledgement are operator assertions, not authentication.',
].join('\n') + '\n';

export function parseAdjudicationArgs(argv) {
  if (argv.length === 1 && argv[0] === '--help') return { mode: 'help' };
  const paths = new Map([
    ['--campaign', 'campaignPath'], ['--results', 'resultsPath'], ['--queue', 'queuePath'],
    ['--rules-root', 'rulesRoot'], ['--out', 'outDir'], ['--edits', 'editsPath'], ['--apply-local', 'applyPath'],
  ]);
  if (argv[0] && !argv[0].startsWith('--')) {
    if (argv.some(token => paths.has(token) || ['--stamp-remote', '--acknowledge-maintainer-evidence', '--help'].includes(token))) {
      throw new TypeError('Campaign control flags cannot be mixed with legacy positional input or attribution.');
    }
    return { mode: 'legacy', ...parseArgs(argv) };
  }
  const seen = new Set();
  const options = {};
  let stamp = false;
  let acknowledgeMaintainerEvidence = false;
  const invalid = () => { throw new TypeError(`Invalid or incomplete adjudication mode. ${ADJUDICATION_HELP}`); };
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    if (seen.has(flag)) invalid();
    seen.add(flag);
    if (flag === '--stamp-remote') { stamp = true; continue; }
    if (flag === '--acknowledge-maintainer-evidence') { acknowledgeMaintainerEvidence = true; continue; }
    const name = paths.get(flag);
    const value = argv[++index];
    if (!name || !value || value.startsWith('--')) invalid();
    options[name] = resolve(value);
  }
  if (options.applyPath) {
    if (stamp || !options.rulesRoot || Object.keys(options).length !== 2) invalid();
    return { mode: 'apply', editsPath: options.applyPath, rulesRoot: options.rulesRoot, acknowledgeMaintainerEvidence };
  }
  if (!options.campaignPath || !options.resultsPath || !options.queuePath || !options.rulesRoot || !options.outDir) invalid();
  if (stamp !== Boolean(options.editsPath)) invalid();
  return { mode: stamp ? 'stamp' : 'review', ...options, acknowledgeMaintainerEvidence };
}

export function createWranglerRunner({
  cwd = MCP_ROOT,
  run = execFile,
  wranglerJsPath = WRANGLER_JS_PATH,
} = {}) {
  if (!existsSync(wranglerJsPath)) {
    throw new Error(`Wrangler CLI not found at ${wranglerJsPath}; run npm install in ${MCP_ROOT}`);
  }
  return (args) => run(
    process.execPath,
    [wranglerJsPath, ...args],
    { cwd, encoding: 'utf8' },
  );
}

const missingValueOutput = (value) =>
  /\bvalue\s+not\s+found\b|\b(?:key|value)\b[^\r\n]*(?:not\s+found|does\s+not\s+exist)|(?:not\s+found|does\s+not\s+exist)[^\r\n]*\b(?:key|value)\b|\/values\/[^\r\n]*\b404\s*:\s*not\s+found\b/i
    .test(String(value ?? ''));

const rejectionOutput = (error) => [error?.stdout, error?.stderr, error?.message]
  .filter(value => value !== undefined && value !== null)
  .map(String)
  .join('\n');

export function createWranglerBoundary(options = {}) {
  const runWrangler = createWranglerRunner(options);
  const base = ['kv', 'key'];
  return {
    async get(key) {
      let stdout;
      try {
        ({ stdout } = await runWrangler([
          ...base, 'get', key, '--binding', 'VERIFICATION_QUEUE', '--remote', '--text',
        ]));
      } catch (error) {
        if (missingValueOutput(rejectionOutput(error))) return null;
        throw error;
      }
      const text = stdout.trim();
      // Local Wrangler releases may report this as a successful text response;
      // remote missing keys take the rejection path above.
      if (!text || /^Value not found$/i.test(text)) return null;
      return JSON.parse(text);
    },
    async put(key, record) {
      const tempDir = mkdtempSync(join(tmpdir(), 'adjudicate-'));
      const recordPath = join(tempDir, 'record.json');
      try {
        writeFileSync(recordPath, JSON.stringify(record), 'utf8');
        await runWrangler([
          ...base, 'put', key, '--path', recordPath,
          '--binding', 'VERIFICATION_QUEUE', '--remote',
        ]);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    },
  };
}

export async function adjudicateRecord({ key, outcome, by = 'manual' }, boundary, now = () => new Date().toISOString()) {
  if (!key) throw new Error('a verification-queue key is required');
  if (!OUTCOMES.has(outcome)) throw new Error(`invalid outcome '${outcome}'`);
  const before = await boundary.get(key);
  if (!before || typeof before !== 'object') throw new Error(`verification-queue key not found: ${key}`);
  const after = {
    ...before,
    adjudication: {
      outcome,
      at: now(),
      by,
      count_at_stamp: before.count ?? 0,
    },
  };
  await boundary.put(key, after);
  return { before, after };
}

export async function executeAdjudication(argv, options = {}) {
  const parsed = parseAdjudicationArgs(argv);
  if (parsed.mode === 'help') return { mode: 'help', help: ADJUDICATION_HELP };
  if (parsed.mode === 'legacy') {
    const boundary = (options.createRemoteBoundary ?? createWranglerBoundary)();
    return { mode: 'legacy', result: await adjudicateRecord(parsed, boundary, options.now) };
  }
  parsed.maintainer = (options.env ?? process.env).APPFORGE_MAINTAINER;
  if (parsed.mode === 'review') {
    const { reviewCampaign } = await import('./lib/adjudicate-campaign.mjs');
    return { mode: 'review', ...await reviewCampaign(parsed, options) };
  }
  if (parsed.mode === 'apply') {
    const { applyCampaignEdits } = await import('./lib/adjudicate-campaign.mjs');
    return { mode: 'apply', ...await applyCampaignEdits(parsed, options) };
  }
  const { stampCampaign } = await import('./lib/adjudicate-campaign.mjs');
  return { mode: 'stamp', ...await stampCampaign(parsed, {
    ...options, createRemoteBoundary: options.createRemoteBoundary ?? createWranglerBoundary,
  }) };
}

async function main() {
  const result = await executeAdjudication(process.argv.slice(2));
  if (result.mode === 'help') process.stdout.write(result.help);
  else if (result.mode === 'legacy') process.stdout.write(`${JSON.stringify(result.result, null, 2)}\n`);
  else if (result.mode === 'apply') process.stdout.write(`Local application ${result.report.status}: ${result.report.applied.length} applied, ${result.report.already_applied.length} already applied.\n`);
  else if (result.mode === 'stamp') process.stdout.write(`Remote stamping ${result.report.status}: ${result.report.completed.length} written, ${result.report.already_stamped.length} already stamped.\nReview ${resolve(result.directory, 'REMOTE-STAMPS.md')}.\n`);
  else process.stdout.write(`Wrote ${result.plan.files.length} proposed replacements; ${result.keys.filter(key => key.outcome !== null).length} proposed queue stamps.\nReview ${resolve(result.directory, 'RESULTS.md')}.\n`);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    if (error.report) process.stderr.write(`Completion state: ${JSON.stringify(error.report)}\n`);
    process.exitCode = 1;
  });
}
