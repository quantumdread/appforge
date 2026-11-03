#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MCP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = resolve(MCP_ROOT, '..');
const DEFAULT_RULES_ROOT = resolve(REPO_ROOT, 'knowledge');
const DEFAULT_ANALYZER_ARTIFACT = resolve(REPO_ROOT, 'cli/dist/analyzer-core.mjs');
const USAGE = 'node scripts/verification-campaign.mjs --queue <file> --recipes <file> --out <new-directory> [--date YYYY-MM-DD] [--rules-root <directory>]';
const GATE_PROFILE_NOTE = 'The local gate uses the pinned CLI artifact profile and does not replace delivery-tenant validation or compile_canvas.';
const compareLexically = (left, right) => left < right ? -1 : left > right ? 1 : 0;

export function parseCampaignArgs(args) {
  if (args.length === 1 && args[0] === '--help') return { help: true };
  const names = new Map([
    ['--queue', 'queuePath'], ['--recipes', 'recipesPath'], ['--out', 'outDir'],
    ['--date', 'date'], ['--rules-root', 'rulesRoot'],
  ]);
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    const name = names.get(args[index]);
    const value = args[index + 1];
    if (!name || Object.hasOwn(values, name) || !value || value.startsWith('--')) {
      throw new TypeError(`Invalid campaign arguments. Usage: ${USAGE}`);
    }
    values[name] = name === 'date' ? value : resolve(value);
  }
  if (!values.queuePath || !values.recipesPath || !values.outDir) {
    throw new TypeError(`Missing campaign inputs. Usage: ${USAGE}`);
  }
  return { ...values, rulesRoot: values.rulesRoot ?? DEFAULT_RULES_ROOT };
}

function selectedDate(date, now) {
  const value = date ?? now().toISOString().slice(0, 10);
  const parsed = typeof value === 'string' ? new Date(`${value}T00:00:00.000Z`) : null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)
    || !Number.isFinite(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new TypeError('Campaign date must be a calendar-valid YYYY-MM-DD');
  }
  return value;
}

function utf8(bytes, label) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new TypeError(`${label} must contain valid UTF-8 text`);
  }
}

function unmappedReason(key) {
  if (/^lint:partial-catalog-data:[A-Za-z][A-Za-z0-9_/]*$/u.test(key)) {
    return { status: 'ambiguous', reason: 'The control-only partial-catalog key does not identify a reviewed property or variant; aggregate key remains open.' };
  }
  if (key.startsWith('refuse:unknown-control:') || key.startsWith('refuse:block-scalar-required:')) {
    return { status: 'unsupported', reason: 'This unknown-control or YAML block-scalar refusal has no supported catalog campaign recipe; no control or claim is inferred.' };
  }
  return { status: 'needs-recipe', reason: 'No reviewed recipe explicitly maps this queue key; aggregate key remains open.' };
}

function worklist(manifest) {
  const cases = manifest.rows.filter(row => row.kind === 'case');
  const gaps = manifest.rows.filter(row => row.kind === 'queue');
  const lines = [
    `# Verification campaign ${manifest.date}`,
    '',
    `Campaign: ${manifest.campaign_id}`,
    `Capture scope: ${manifest.capture_scope}; captured at: ${manifest.captured_at ?? 'unknown'}.`,
    `Catalog: ${manifest.source.catalog_version}; extracted at: ${manifest.source.extracted_at}.`,
    '',
    'This is a pending local review package. Stored key counts express queue priority; they are not unique apps, users or a deduplicated run total across keys. A tool listing or operator export does not establish a complete queue snapshot.',
    `Selected keys: ${manifest.coverage.selected_queue_rows}; generated cases: ${cases.length}; keys with cases: ${manifest.coverage.generated_queue_rows}; keys with non-generated rows: ${manifest.coverage.non_generated_queue_rows}. These key sets can overlap when reviewed coverage is incomplete.`,
    `Excluded adjudicated keys: ${manifest.coverage.excluded_adjudicated_rows}; excluded non-claim keys: ${manifest.coverage.excluded_nonclaim_rows}.`,
    '',
    cases.length ? 'No case has tenant evidence yet.' : 'No generated claim coverage. An empty or all-excluded campaign does not establish successful claim coverage.',
    '',
    '## Tenant execution and evidence',
    '',
    'The maintainer must use an authorized tenant session and an isolated test app. Complete and record every tenant prerequisite before compile_canvas or runtime testing. Keep actual bindings and raw input/outcome transcripts in private evidence files, outside this package.',
    GATE_PROFILE_NOTE,
    'Use the exact generated repro and pinned local lint context. If setup needs any repro, ancestor, property or authored-binding change, regenerate and review the case and its hashes before collecting evidence. A local-gate-blocked case must be corrected through review; do not bypass a REFUSE.',
    'Compilation tests the declared compiler subclaim only. SQL delegation needs its full runtime falsifier: actual SQL binding and environment, configured limit, controlled rows including qualifying rows beyond the measured window, expected full result, observed result and available delegation/Monitor evidence. Compile acceptance or disappearance of a warning cannot establish delegation.',
    'Coverage is a reviewed operator assertion, not authenticated authorship. When coverage is missing, false or mismatched, or a non-generated row remains, the aggregate key remains open even if an individual case settles. Mixed outcomes also leave a shared aggregate key open.',
    'Results are cumulative for this campaign; retain settled cases unchanged in later result files. Collect the intended compiler batch before applying changes. Applying a partial catalog package changes source guards: later results then require a rebuilt, regenerated and reviewed campaign. Preserve earlier packages and pending results; do not carry evidence across changed campaign identities silently.',
    'This generator neither changes the catalog nor stamps a queue. Later catalog-mutating review/apply packages require explicit acknowledgement that the configured maintainer supplied the evidence; a produced_by string is not authentication. Dump/observed-variant results remain per-claim controller decisions. Remote stamping is a separate, explicitly authorized operation.',
    '',
    '## Generated cases',
  ];
  for (const row of cases) {
    lines.push('', `### ${row.claim_ref}`, '',
      `Case: ${row.id}; status: ${row.status}; scope: ${row.claim_scope}.`,
      `Queue: ${row.queue.map(entry => `${entry.key} (${entry.count})`).join('; ')}.`,
      `Repro: [${row.repro.path}](${row.repro.path}); SHA-256: ${row.repro.sha256}.`,
      `Expected compile outcome: ${row.expected_compile_outcome}. Local gate: ${row.local_gate.summary.pass} PASS, ${row.local_gate.summary.warn} WARN, ${row.local_gate.summary.refuse} REFUSE; rules: ${row.local_gate.rule_ids.join(', ') || 'none'}.`,
      `Local lint context: ${JSON.stringify(row.local_lint_context)}.`,
      '', row.claim_text, '', row.reproduction, '',
      `Falsifier: ${row.falsifier.description}`,
      `Unfalsified if: ${row.falsifier.unfalsified_if}`,
      `Falsified if: ${row.falsifier.falsified_if}`, '', 'Prerequisites:', '');
    for (const prerequisite of row.prerequisites) {
      lines.push(`- ${prerequisite.phase === 'tenant' ? '[ ]' : '[x]'} ${prerequisite.id} (${prerequisite.phase}): ${prerequisite.description}`);
    }
  }
  lines.push('', '## Non-generated queue rows', '');
  if (!gaps.length) lines.push('None. This does not settle the generated cases.');
  for (const row of gaps) lines.push(`- ${row.queue[0].key} (${row.queue[0].count}); ${row.status}: ${row.reason}`);
  lines.push('', '## Reviewed key coverage', '');
  for (const assertion of manifest.queue_key_coverage) {
    lines.push(`- ${assertion.key}: ${assertion.complete ? 'declared complete' : 'incomplete; aggregate key remains open'}; claims: ${assertion.claim_refs.join(', ') || 'none'}.`);
  }
  return `${lines.join('\n')}\n`;
}

/** Explicit trusted caller options select executable artifact code, never input JSON. */
export async function generateVerificationCampaign({
  queuePath, recipesPath, outDir, date,
  rulesRoot = DEFAULT_RULES_ROOT, analyzerArtifactPath = DEFAULT_ANALYZER_ARTIFACT,
  now = () => new Date(),
}) {
  const campaignDate = selectedDate(date, now);
  const { parseVerificationDocument, validateVerificationDocument, normalizeVerificationQueue, sha256, stableId } =
    await import('./lib/verification-contracts.mjs');
  const { readVerificationSources, writeVerificationPackage } = await import('./lib/verification-edits.mjs');
  const { inspectVerificationRepro } = await import('./lib/verification-repro.mjs');
  const [queueBytes, recipesBytes, sources] = await Promise.all([
    readFile(queuePath), readFile(recipesPath),
    readVerificationSources({ rulesRoot, analyzerArtifactPath }),
  ]);
  let queueValue;
  try {
    queueValue = JSON.parse(utf8(queueBytes, 'Queue capture'));
  } catch {
    throw new TypeError('Queue capture must contain complete valid UTF-8 JSON');
  }
  const queue = normalizeVerificationQueue(queueValue);
  const reviewed = parseVerificationDocument(utf8(recipesBytes, 'Recipes'), 'verification-recipes/1');
  const selected = queue.entries.filter(entry => entry.adjudication === null);
  const selectedByKey = new Map(selected.map(entry => [entry.key, entry]));
  const excluded = [
    ...queue.excluded,
    ...queue.entries.filter(entry => entry.adjudication !== null)
      .map(entry => ({ key: entry.key, reason: 'adjudicated', adjudication: entry.adjudication })),
  ].sort((left, right) => compareLexically(left.key, right.key));
  const coverage = reviewed.queue_key_coverage.filter(entry => selectedByKey.has(entry.key))
    .sort((left, right) => compareLexically(left.key, right.key));
  const coverageByKey = new Map(coverage.map(entry => [entry.key, entry]));
  const mappedRecipes = new Map(selected.map(entry => [entry.key, []]));
  const blockedRecipes = new Map();
  const cases = [];
  const identities = new Map();
  const identity = (prefix, parts) => {
    const id = stableId(prefix, parts);
    const text = JSON.stringify(parts);
    if (identities.has(id) && identities.get(id) !== text) throw new Error('Distinct campaign identities collided');
    identities.set(id, text);
    return id;
  };
  for (const recipe of reviewed.recipes) {
    const keys = recipe.queue_keys.filter(key => selectedByKey.has(key)).sort(compareLexically);
    if (!keys.length) continue;
    for (const key of keys) mappedRecipes.get(key).push(recipe.claim_ref);
    let unavailable = null;
    if (recipe.prerequisites.some(entry => entry.phase === 'local' && !entry.satisfied)) {
      unavailable = { status: 'incomplete-prerequisites', reason: 'A mapped recipe has an unsatisfied local prerequisite; aggregate key remains open.' };
    } else if (recipe.target.kind === 'augmentation-property') {
      const overlay = sources.augmentations.controls[recipe.target.control]?.additional_input_properties?.[recipe.target.property];
      if (!overlay || overlay.type !== recipe.target.property_type) {
        unavailable = { status: 'unsupported', reason: 'The reviewed augmentation target is absent or its type differs from the selected existing overlay; no property is invented.' };
      }
    }
    if (unavailable) {
      for (const key of keys) if (!blockedRecipes.has(key)) blockedRecipes.set(key, unavailable);
      continue;
    }
    const { queue_keys: _queueKeys, repro_yaml: yaml, ...claim } = recipe;
    const id = identity('case', ['case/1', claim.claim_ref]);
    const repro = { path: `${id}.pa.yaml`, sha256: sha256(yaml) };
    const localGate = await inspectVerificationRepro({
      claim: { ...claim, repro }, yaml,
      analyzerArtifactPath: sources.analyzerArtifactPath,
      analyzerArtifactSha256: sources.analyzerArtifactSha256,
    });
    cases.push({
      ...claim, kind: 'case', id,
      queue: keys.map(key => ({ key, count: selectedByKey.get(key).count })),
      repro, local_gate: localGate,
      status: localGate.summary.refuse > 0 ? 'local-gate-blocked' : 'pending',
    });
  }
  const gaps = [];
  for (const entry of selected) {
    const generatedClaims = cases.filter(row => row.queue.some(item => item.key === entry.key))
      .map(row => row.claim_ref).sort(compareLexically);
    const assertion = coverageByKey.get(entry.key);
    let gap = blockedRecipes.get(entry.key);
    if (!gap && mappedRecipes.get(entry.key).length === 0) gap = unmappedReason(entry.key);
    if (!gap && (!assertion?.complete || JSON.stringify(assertion.claim_refs) !== JSON.stringify(generatedClaims))) {
      gap = { status: 'ambiguous', reason: 'Complete key-to-claim coverage is missing, false or differs from generated cases; aggregate key remains open.' };
    }
    if (gap) gaps.push({ kind: 'queue', id: identity('queue', ['queue-row/1', entry.key]),
      queue: [{ key: entry.key, count: entry.count }], ...gap });
  }
  const queueHash = sha256(queueBytes);
  const recipesHash = sha256(recipesBytes);
  const rows = [...cases, ...gaps].sort((left, right) => (
    Math.max(...right.queue.map(entry => entry.count)) - Math.max(...left.queue.map(entry => entry.count))
    || compareLexically(left.kind === 'case' ? left.claim_ref : left.queue[0].key,
      right.kind === 'case' ? right.claim_ref : right.queue[0].key)
  ));
  const manifest = {
    schema: 'verification-campaign/1',
    campaign_id: identity('campaign', ['verification-campaign/1', campaignDate, queueHash, recipesHash, sources.analyzerArtifactSha256]),
    date: campaignDate,
    source: {
      queue_file_sha256: queueHash, recipes_file_sha256: recipesHash,
      analyzer_artifact_sha256: sources.analyzerArtifactSha256,
      catalog_version: sources.catalog.catalogVersion, extracted_at: sources.catalog.extractedAt,
      rules_files: [...sources.files].sort(([left], [right]) => compareLexically(left, right))
        .map(([path, file]) => ({ path, sha256: file.sha256 })),
    },
    capture_scope: queue.capture_scope, captured_at: queue.captured_at,
    queue_key_coverage: coverage,
    coverage: {
      selected_queue_rows: selected.length, generated_cases: cases.length,
      generated_queue_rows: new Set(cases.flatMap(row => row.queue.map(entry => entry.key))).size,
      non_generated_queue_rows: gaps.length,
      excluded_adjudicated_rows: excluded.filter(entry => entry.reason === 'adjudicated').length,
      excluded_nonclaim_rows: queue.excluded.length,
    },
    rows, excluded,
  };
  validateVerificationDocument(manifest, 'verification-campaign/1');
  const yamlByClaim = new Map(reviewed.recipes.map(recipe => [recipe.claim_ref, recipe.repro_yaml]));
  const encoder = new TextEncoder();
  const files = [
    { path: 'manifest.json', bytes: encoder.encode(`${JSON.stringify(manifest, null, 2)}\n`) },
    ...rows.filter(row => row.kind === 'case').map(row => ({ path: row.repro.path, bytes: encoder.encode(yamlByClaim.get(row.claim_ref)) })),
    { path: 'WORKLIST.md', bytes: encoder.encode(worklist(manifest)) },
  ];
  const written = await writeVerificationPackage({ outDir, files });
  return { manifest, ...written };
}

async function main(args) {
  try {
    const options = parseCampaignArgs(args);
    if (options.help) {
      process.stdout.write(`Usage: ${USAGE}\nCreates a fresh local review package; no tenant or queue writes.\n${GATE_PROFILE_NOTE}\n`);
      return 0;
    }
    const result = await generateVerificationCampaign(options);
    process.stdout.write(`Wrote ${result.manifest.coverage.generated_cases} generated cases and ${result.manifest.coverage.non_generated_queue_rows} non-generated queue rows.\n`);
    if (!result.manifest.coverage.generated_cases) process.stdout.write('No generated claim coverage.\n');
    process.stdout.write(`Review ${resolve(options.outDir, 'WORKLIST.md')} before any tenant execution.\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`Campaign generation failed: ${error.message}\n`);
    if (error.report) process.stderr.write(`Partial package state: ${JSON.stringify(error.report)}\n`);
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.exitCode = await main(process.argv.slice(2));
}
