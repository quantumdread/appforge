#!/usr/bin/env node
/** Local errata review and bounded application; no remote queue mode. */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseVerificationDocument } from './lib/verification-contracts.mjs';
import { VerificationEditError } from './lib/verification-errors.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_ARTIFACT = resolve(REPO_ROOT, 'cli/dist/analyzer-core.mjs');

const USAGE = 'ingest-errata.mjs <errata.json> --rules-root <root> --out <new-directory> [--acknowledge-maintainer-evidence]\n'
  + 'ingest-errata.mjs --apply-local <edits.json> --rules-root <root> [--acknowledge-maintainer-evidence]';

export function parseErrataArgs(args) {
  if (args.length === 1 && args[0] === '--help') return { mode: 'help' };
  const values = { acknowledgeMaintainerEvidence: false };
  const seen = new Set();
  let mode = 'review';
  let index = 0;
  if (args[0] && !args[0].startsWith('-')) {
    values.errataPath = resolve(args[0]);
    index++;
  }
  const options = new Map([['--rules-root', 'rulesRoot'], ['--out', 'outDir'], ['--apply-local', 'planPath']]);
  const invalid = () => { throw new TypeError(`Invalid errata arguments. Usage: ${USAGE}`); };
  while (index < args.length) {
    const flag = args[index++];
    if (seen.has(flag)) invalid();
    seen.add(flag);
    if (flag === '--acknowledge-maintainer-evidence') {
      values.acknowledgeMaintainerEvidence = true;
      continue;
    }
    const key = options.get(flag);
    const value = args[index++];
    if (!key || !value?.trim() || value.startsWith('-')) invalid();
    values[key] = resolve(value);
    if (key === 'planPath') mode = 'apply';
  }
  if (!values.rulesRoot || (mode === 'review' && (!values.errataPath || !values.outDir)) ||
      (mode === 'apply' && (values.errataPath || values.outDir))) invalid();
  return { mode, ...values };
}

const markdownText = value => value.replace(/[\\`*_{}\[\]()#+.!|<>-]/gu, character => `\\${character}`).replace(/\r?\n/gu, ' ');

function errataSummary(plan) {
  const lines = ['# Errata review', '',
    'This local review package contains proposals. Source files have not been changed by ingestion.',
    'Catalog changes require measured compiler evidence, the configured maintainer marker (APPFORGE_MAINTAINER) and explicit acknowledgement. The marker is an operator assertion, not authentication.',
    'Runtime observations and Studio exports retain their evidence class; they do not establish compiler acceptance of a property.',
    'Apply the named reviewed edits.json separately. Replays require the pinned source and artifact state; never edit a plan to bypass source drift.', '',
    '## Decisions', ''];
  for (const decision of plan.decisions) lines.push(`- ${markdownText(decision.id)}; ${markdownText(decision.claim_ref)}; ${decision.status}: ${markdownText(decision.reason)}`);
  lines.push('', `Applicable replacement files: ${plan.files.length}.`,
    'Pending and blocked entries do not become catalog replacements. No tenant result or remote queue stamp is created by this command.', '');
  return lines.join('\n');
}

export async function ingestErrata({ errataPath, rulesRoot, outDir, maintainer, acknowledgeMaintainerEvidence = false,
  analyzerArtifactPath = DEFAULT_ARTIFACT }) {
  const bytes = await readFile(errataPath);
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new VerificationEditError('unsupported-shape', 'Errata must contain valid UTF-8 JSON.'); }
  const errata = parseVerificationDocument(text, 'appforge-errata/1');
  const { readVerificationSources, planVerificationEdits, writeVerificationPackage } = await import('./lib/verification-edits.mjs');
  const documents = [...new Set(errata.entries.filter(entry => entry.claim.target.kind === 'observation')
    .map(entry => entry.claim.target.document))].sort();
  const sources = await readVerificationSources({ rulesRoot, analyzerArtifactPath, documents });
  const known = new Set(sources.catalog.controls.map(control => control.type));
  if (errata.entries.some(entry => entry.claim.target.kind !== 'observation' && !known.has(entry.claim.target.control))) {
    throw new VerificationEditError('unsupported-shape', 'Errata property targets must name an exact known control.');
  }
  const requests = errata.entries.map(entry => ({ id: entry.id, claim: entry.claim, result: entry.result,
    action: entry.proposed_change.kind === 'additional-property'
      ? { kind: 'property', operation: entry.proposed_change.operation }
      : { kind: 'observation', observation_id: entry.proposed_change.observation_id } }));
  const { plan } = await planVerificationEdits({ sources, requests, producedBy: errata.produced_by,
    date: errata.captured_at.slice(0, 10), evidenceBaseDir: dirname(resolve(errataPath)), reproBaseDir: dirname(resolve(errataPath)),
    maintainer, acknowledgeMaintainerEvidence });
  const written = await writeVerificationPackage({ outDir, files: [
    { path: 'edits.json', bytes: Buffer.from(`${JSON.stringify(plan, null, 2)}\n`, 'utf8') },
    { path: 'ERRATA.md', bytes: Buffer.from(errataSummary(plan), 'utf8') },
    ...plan.files.map(file => ({ path: file.path, bytes: Buffer.from(file.after_base64, 'base64') })),
  ] });
  return { ...written, plan };
}

async function main(args) {
  try {
    const options = { ...parseErrataArgs(args), maintainer: process.env.APPFORGE_MAINTAINER };
    if (options.mode === 'help') {
      process.stdout.write(`${USAGE}\nCreates local review packages or applies a named reviewed plan. No remote queue mode.\n`
        + 'The configured maintainer marker (APPFORGE_MAINTAINER) and acknowledgement are an operator assertion, not authentication.\n');
    } else if (options.mode === 'apply') {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(await readFile(options.planPath));
      const plan = parseVerificationDocument(text, 'verification-edits/1');
      const { applyVerificationEdits } = await import('./lib/verification-edits.mjs');
      const report = await applyVerificationEdits({ plan, rulesRoot: options.rulesRoot,
        analyzerArtifactPath: DEFAULT_ARTIFACT, maintainer: options.maintainer, acknowledgeMaintainerEvidence: options.acknowledgeMaintainerEvidence });
      process.stdout.write(`${JSON.stringify(report)}\n`);
    } else {
      const result = await ingestErrata(options);
      process.stdout.write(`Wrote ${result.plan.decisions.length} reviewed decisions and ${result.plan.files.length} candidate replacement files.\n`
        + `Review ${resolve(result.directory, 'ERRATA.md')}.\n`);
    }
    return 0;
  } catch (error) {
    process.stderr.write(`Errata command failed: ${error.message}\n`);
    if (error.report) process.stderr.write(`Partial local state: ${JSON.stringify(error.report)}\n`);
    return 1;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = await main(process.argv.slice(2));
}
