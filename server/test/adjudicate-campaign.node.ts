import { verificationFixture } from './helpers/verification-fixture';
import { join, relative, resolve, sep } from 'node:path';
import { cp, mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { parseArgs, parseAdjudicationArgs, executeAdjudication as executeInstalledAdjudication } from '../scripts/adjudicate.mjs';
import { generateVerificationCampaign } from '../scripts/verification-campaign.mjs';

const MCP = resolve(__dirname, '..');
const { rules: RULES, artifact: ARTIFACT, script } = verificationFixture();
const executeAdjudication = (argv: string[], options = {}) => executeInstalledAdjudication(argv, { analyzerArtifactPath: ARTIFACT, env: { APPFORGE_MAINTAINER: 'Maintainer' }, ...options });
const HEIGHT = 'lint:partial-catalog-data:Circle.Height';
const WIDTH = 'lint:partial-catalog-data:Circle.Width';
const AUGMENTATION = 'warn:Gallery.WrapCount';
const SQL = 'lint:delegation-sql-isblank:Gallery.Items';
const NOW = '2026-09-08T10:00:00.000Z';
const directories: string[] = [];
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const dismissal = () => ({ outcome: 'dismissed', reason: 'This captured hypothesis is dismissed after operator review.', evidence: {
  evidence_class: 'none', claim_scope: null, environment: null, reproduction: null,
  falsifier_result: 'not-run', falsifier_observation: 'No tenant claim is asserted by this dismissal.',
  files: [], compiler: null, runtime_test: null, completed_tenant_prerequisites: [], datasource_bindings: [],
} });

async function fixture(kind: 'dump' | 'augmentation' | 'sql' = 'dump') {
  const directory = await mkdtemp(join(tmpdir(), 'appforge-adjudicate-campaign-'));
  directories.push(directory);
  const rulesRoot = join(directory, 'rules');
  await mkdir(join(rulesRoot, 'catalogs'), { recursive: true });
  for (const name of ['control-manifest.yml', 'control-properties.yml', 'control-augmentations.yml']) {
    await cp(join(RULES, 'catalogs', name), join(rulesRoot, 'catalogs', name));
  }
  const row = '| Synthetic historical claim | Existing fixture disproof |';
  await writeFile(join(rulesRoot, 'disproofs.md'), `# Fixture disproofs\n\n| Claim | Evidence |\n|---|---|\n${row}\n`);
  await writeFile(join(rulesRoot, 'disproofs.index.json'), JSON.stringify({ schema: 'appforge-disproof-index/1',
    hash_algorithm: 'sha256', entries: [{ id: 'fixture-disproof', match: { kind: 'exact', claim_ref: 'rule:fixture-history' }, row_sha256: hash(row) }] }));
  const recipes = JSON.parse(await readFile(resolve(MCP, '../docs/maintainers/verification/recipes/2026-09-08-queue-hypotheses.json'), 'utf8'));
  recipes.recipes = recipes.recipes.filter((row: {claim_ref: string}) => (kind === 'sql' ? ['rule:delegation-sql-isblank'] : ['dump-property:Circle.Height', 'dump-property:Circle.Width']).includes(row.claim_ref));
  recipes.queue_key_coverage = recipes.queue_key_coverage.filter((row: {key: string}) => (kind === 'sql' ? [SQL] : [HEIGHT, WIDTH]).includes(row.key));
  if (kind === 'augmentation') {
    recipes.recipes = [{ claim_ref: 'augmentation:Gallery.WrapCount', claim_scope: 'compiler_accepts',
      claim_text: 'The compiler accepts this exact Gallery.WrapCount assignment.',
      falsifier: { description: 'Compile this input.', unfalsified_if: 'Accepted.', falsified_if: 'The exact property is rejected.' },
      prerequisites: [{ id: 'isolated-app', phase: 'tenant', description: 'Use an isolated test app.' }],
      expected_compile_outcome: 'accept',
      target: { kind: 'augmentation-property', control: 'Gallery', property: 'WrapCount', property_type: 'Number', property_value: '=1' },
      reproduction: 'Compile the exact probe.', local_lint_context: { datasources: {} }, ancestors: [],
      queue_keys: [AUGMENTATION], repro_yaml: 'Screens:\n  VerificationScreen:\n    Children:\n      - ctlProbe:\n          Control: Gallery\n          Properties:\n            WrapCount: =1\n' }];
    recipes.queue_key_coverage = [{ key: AUGMENTATION, complete: true, claim_refs: ['augmentation:Gallery.WrapCount'] }];
  }
  const recipesPath = join(directory, 'recipes.json');
  await writeFile(recipesPath, JSON.stringify(recipes));
  const queue = { schema: 'verification-queue-export/1', captured_at: '2026-09-08T09:00:00.000Z', entries: [
    { key: HEIGHT, value: { count: 12, occurrences: 14, last_seen: '' } },
    { key: WIDTH, value: { count: 1 } },
    { key: 'stats:fixture', value: { private_fixture: 'PRIVATE_CAPTURE_TEXT' } },
  ] };
  if (kind === 'augmentation') queue.entries = [{ key: AUGMENTATION, value: { count: 12 } }];
  if (kind === 'sql') queue.entries = [{ key: SQL, value: { count: 12 } }];
  const queuePath = join(directory, 'queue.json');
  await writeFile(queuePath, JSON.stringify(queue));
  const campaignDir = join(directory, 'campaign');
  const { manifest } = await generateVerificationCampaign({ queuePath, recipesPath, outDir: campaignDir,
    date: '2026-09-08', rulesRoot, analyzerArtifactPath: ARTIFACT });
  const campaignPath = join(campaignDir, 'manifest.json');
  const resultsPath = join(directory, 'results.json');
  const selected = manifest.rows.find((row: {kind: string}) => row.kind === 'case');
  const results = { schema: 'verification-results/1', campaign_id: manifest.campaign_id,
    campaign_sha256: hash(await readFile(campaignPath)), produced_by: 'Fixture operator', captured_at: NOW,
    cases: [{ case_id: selected.id, claim_ref: selected.claim_ref, repro_sha256: selected.repro.sha256, ...dismissal() }] };
  await writeFile(resultsPath, JSON.stringify(results));
  const outDir = join(directory, 'review');
  const argv = ['--campaign', campaignPath, '--results', resultsPath, '--queue', queuePath, '--rules-root', rulesRoot, '--out', outDir];
  return { directory, rulesRoot, campaignPath, campaignDir, recipesPath, queuePath, resultsPath, outDir, argv, queue, results, manifest };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

async function compilerResult(paths: Fixture) {
  const row = paths.manifest.rows.find((row: {kind: string}) => row.kind === 'case');
  const outcome = '{"fixture":"accepted","private":"PRIVATE_COMPILER_TRANSCRIPT"}\n';
  await writeFile(join(paths.directory, 'private-compiler-output.json'), outcome);
  paths.results.produced_by = 'Maintainer';
  const result = { ...paths.results.cases[0], outcome: 'verified', reason: 'Exact synthetic compiler fixture accepted.', evidence: {
    evidence_class: 'compile_canvas', claim_scope: 'compiler_accepts',
    environment: { product: 'Synthetic Studio fixture', version: 'test', tenant_alias: 'Synthetic' },
    reproduction: 'Compile the unchanged probe.', falsifier_result: 'unfalsified', falsifier_observation: 'The exact input was accepted.',
    files: [{ id: 'input', path: relative(paths.directory, join(paths.campaignDir, row.repro.path)).replaceAll('\\', '/'), sha256: row.repro.sha256 },
      { id: 'output', path: 'private-compiler-output.json', sha256: hash(outcome) }],
    compiler: { tool: 'compile_canvas', invocation_ref: 'synthetic-test', outcome: 'accepted', tested_claim_ref: row.claim_ref,
      input_sha256: row.repro.sha256, local_lint_context_sha256: hash(JSON.stringify(row.local_lint_context)),
      input_evidence_id: 'input', outcome_evidence_id: 'output', rejection_scope: null },
    runtime_test: null, completed_tenant_prerequisites: row.prerequisites.filter((item: {phase: string}) => item.phase === 'tenant').map((item: {id: string}) => item.id).sort(),
    datasource_bindings: [],
  } };
  Object.assign(paths.results.cases[0], result);
  await writeFile(paths.resultsPath, JSON.stringify(paths.results));
  return result;
}

async function updateManifest(paths: Fixture) {
  await writeFile(paths.campaignPath, JSON.stringify(paths.manifest, null, 2) + '\n');
  paths.results.campaign_sha256 = hash(await readFile(paths.campaignPath));
  await writeFile(paths.resultsPath, JSON.stringify(paths.results));
}

async function completeDismissals(paths: Fixture) {
  paths.results.cases = paths.manifest.rows.filter((row: {kind: string}) => row.kind === 'case').map((row: {id: string; claim_ref: string; repro: {sha256: string}}) => ({
    case_id: row.id, claim_ref: row.claim_ref, repro_sha256: row.repro.sha256, ...dismissal(),
  }));
  await writeFile(paths.resultsPath, JSON.stringify(paths.results));
}

async function regenerate(paths: Fixture) {
  paths.campaignDir = join(paths.directory, 'campaign-revised');
  const result = await generateVerificationCampaign({ queuePath: paths.queuePath, recipesPath: paths.recipesPath,
    outDir: paths.campaignDir, rulesRoot: paths.rulesRoot, analyzerArtifactPath: ARTIFACT, date: '2026-09-08' });
  paths.manifest = result.manifest;
  paths.campaignPath = join(paths.campaignDir, 'manifest.json');
  paths.argv[paths.argv.indexOf('--campaign') + 1] = paths.campaignPath;
  paths.results.campaign_id = paths.manifest.campaign_id;
  paths.results.campaign_sha256 = hash(await readFile(paths.campaignPath));
  await completeDismissals(paths);
}

function stampArgs(paths: Fixture, outDir = join(paths.directory, 'remote-report')) {
  return ['--stamp-remote', '--campaign', paths.campaignPath, '--results', paths.resultsPath, '--queue', paths.queuePath,
    '--rules-root', paths.rulesRoot, '--edits', join(paths.outDir, 'edits.json'), '--out', outDir];
}

afterEach(async () => {
  for (const directory of directories.splice(0)) {
    if (!resolve(directory).startsWith(resolve(tmpdir()) + sep + 'appforge-adjudicate-campaign-')) throw new Error('Unexpected adjudication test directory');
    await rm(directory, { recursive: true, force: true });
  }
});

describe('campaign adjudication command dispatch', () => {
  it('selects a complete read-only campaign review separately from legacy stamping', () => {
    expect(parseAdjudicationArgs([
      '--campaign', 'campaign/manifest.json', '--results', 'results.json', '--queue', 'queue.json',
      '--rules-root', 'rules', '--out', 'review', '--acknowledge-maintainer-evidence',
    ])).toEqual({
      mode: 'review', campaignPath: resolve('campaign/manifest.json'), resultsPath: resolve('results.json'),
      queuePath: resolve('queue.json'), rulesRoot: resolve('rules'), outDir: resolve('review'),
      acknowledgeMaintainerEvidence: true,
    });
  });

  it('explains all command modes through the actual entrypoint without requiring inputs or credentials', () => {
    const result = spawnSync(process.execPath, [script('adjudicate.mjs'), '--help'],
      { cwd: tmpdir(), encoding: 'utf8', windowsHide: true });
    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
    expect(result.stdout).toContain('--stamp-remote');
    expect(result.stdout).toContain('it never applies files');
    expect(result.stdout).toContain('operator assertions, not authentication');
  });

  it('reviews a dismissal and partial results without changing catalog files or constructing a remote boundary', async () => {
    const paths = await fixture();
    const before = await readFile(join(paths.rulesRoot, 'catalogs/control-augmentations.yml'));
    let boundaries = 0;
    const result = await executeAdjudication(paths.argv, { now: () => NOW,
      createRemoteBoundary: () => { boundaries++; throw new Error('Remote boundary must remain unused.'); } });
    expect(result.mode).toBe('review');
    expect(boundaries).toBe(0);
    expect(await readFile(join(paths.rulesRoot, 'catalogs/control-augmentations.yml'))).toEqual(before);
    expect(JSON.parse(await readFile(paths.queuePath, 'utf8'))).toEqual(paths.queue);
    const plan = JSON.parse(await readFile(join(paths.outDir, 'edits.json'), 'utf8'));
    expect(plan).toMatchObject({ schema: 'verification-edits/1', produced_by: 'Fixture operator', requests: [], decisions: [], files: [] });
    expect(plan.guards).toHaveLength(5);
    const updated = JSON.parse(await readFile(join(paths.outDir, 'queue-snapshot.json'), 'utf8'));
    const expected = structuredClone(paths.queue);
    Object.assign(expected.entries[0].value, { adjudication: { outcome: 'dismissed', at: NOW, by: 'Fixture operator', count_at_stamp: 12 } });
    expect(updated).toEqual(expected);
    const ledger = await readFile(join(paths.outDir, 'RESULTS.md'), 'utf8');
    expect(ledger).toContain('derived from captured listing; proposed local stamps, not a live refresh or proof edits applied');
    expect(ledger).toContain('dump-property:Circle.Width');
    expect(ledger).toContain(paths.results.cases[0].case_id);
    expect(ledger).toContain('pending');
    expect(ledger).toContain('dismissed after operator review');
    expect(ledger).not.toContain('PRIVATE_CAPTURE_TEXT');
  });

  it('parses apply, full-context stamp, help and legacy modes with their exact attribution boundaries', () => {
    expect(parseAdjudicationArgs(['warn:X.Y', 'dismissed', '--by', 'Fixture']))
      .toEqual({ mode: 'legacy', key: 'warn:X.Y', outcome: 'dismissed', by: 'Fixture' });
    expect(parseAdjudicationArgs(['--help'])).toEqual({ mode: 'help' });
    expect(parseAdjudicationArgs(['--apply-local', 'edits.json', '--rules-root', 'rules']))
      .toEqual({ mode: 'apply', editsPath: resolve('edits.json'), rulesRoot: resolve('rules'), acknowledgeMaintainerEvidence: false });
    expect(parseAdjudicationArgs(['--stamp-remote', '--campaign', 'm', '--results', 'r', '--queue', 'q', '--rules-root', 'root', '--edits', 'e', '--out', 'o']))
      .toMatchObject({ mode: 'stamp', editsPath: resolve('e'), acknowledgeMaintainerEvidence: false });
  });

  it.each([
    [], ['--campaign', 'm'], ['--apply-local', 'e'],
    ['--apply-local', 'e', '--rules-root', 'r', '--out', 'o'],
    ['--stamp-remote', '--apply-local', 'e', '--rules-root', 'r'],
    ['--campaign', 'm', '--results', 'r', '--queue', 'q', '--rules-root', 'r', '--out', 'o', '--edits', 'e'],
    ['--stamp-remote', '--campaign', 'm', '--results', 'r', '--queue', 'q', '--rules-root', 'r', '--out', 'o'],
    ['--apply-local', 'e', '--rules-root', 'r', '--analyzer-artifact', 'untrusted.mjs'],
    ['--apply-local', 'e', '--rules-root', 'r', '--rules-root', 'again'],
    ['--apply-local', 'e', '--rules-root', 'r', '--acknowledge-maintainer-evidence', '--acknowledge-maintainer-evidence'],
    ['warn:X.Y', 'verified', '--campaign', 'm'],
  ])('rejects incomplete, mixed or unsupported dispatch before constructing a remote boundary %j', async (...args) => {
    let calls = 0;
    await expect(executeAdjudication(args, { createRemoteBoundary: () => { calls++; throw new Error('Unexpected remote construction'); } })).rejects.toThrow();
    expect(calls).toBe(0);
  });

  it.each(['campaign-hash', 'queue-hash', 'wrong-case', 'duplicate-result', 'repro-hash', 'source-guard', 'artifact-json-path'])
    ('refuses mismatched %s before creating a review package', async (fault) => {
      const paths = await fixture();
      if (fault === 'campaign-hash') paths.results.campaign_sha256 = '0'.repeat(64);
      else if (fault === 'queue-hash') await writeFile(paths.queuePath, JSON.stringify(paths.queue) + '\n');
      else if (fault === 'wrong-case') {
        paths.results.cases[0].claim_ref = 'augmentation:Gallery.WrapCount';
        paths.results.cases[0].case_id = 'case-' + hash('["case/1","augmentation:Gallery.WrapCount"]').slice(0, 24);
      } else if (fault === 'duplicate-result') paths.results.cases.push(paths.results.cases[0]);
      else if (fault === 'repro-hash') paths.results.cases[0].repro_sha256 = '0'.repeat(64);
      else if (fault === 'source-guard') {
        paths.manifest.source.rules_files[0].sha256 = '0'.repeat(64);
        await updateManifest(paths);
      } else Object.assign(paths.results, { analyzerArtifactPath: 'untrusted.mjs' });
      await writeFile(paths.resultsPath, JSON.stringify(paths.results));
      await expect(executeAdjudication(paths.argv)).rejects.toThrow();
      await expect(readFile(join(paths.outDir, 'edits.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    });

  it.each(['missing', 'false', 'mismatched'])('keeps a dismissed case aggregate open when reviewed coverage is %s', async (fault) => {
    const paths = await fixture();
    const assertion = paths.manifest.queue_key_coverage.find((entry: {key: string}) => entry.key === HEIGHT);
    if (fault === 'missing') paths.manifest.queue_key_coverage = paths.manifest.queue_key_coverage.filter((entry: {key: string}) => entry.key !== HEIGHT);
    else if (fault === 'false') assertion.complete = false;
    else assertion.claim_refs = [];
    await updateManifest(paths);
    await executeAdjudication(paths.argv);
    expect(JSON.parse(await readFile(join(paths.outDir, 'queue-snapshot.json'), 'utf8'))).toEqual(paths.queue);
  });

  it('proposes an exact compiler-backed property update only with maintainer acknowledgement and preserves raw evidence privately', async () => {
    const paths = await fixture('augmentation');
    await compilerResult(paths);
    const sourcePath = join(paths.rulesRoot, 'catalogs/control-augmentations.yml');
    const before = await readFile(sourcePath);
    await expect(executeAdjudication(paths.argv)).rejects.toMatchObject({ code: 'evidence-required' });
    for (const env of [{}, { APPFORGE_MAINTAINER: 'Another reviewer' }]) {
      await expect(executeAdjudication([...paths.argv, '--acknowledge-maintainer-evidence'], { env }))
        .rejects.toMatchObject({ code: 'evidence-required', message: expect.stringContaining('APPFORGE_MAINTAINER') });
      expect(await readFile(sourcePath)).toEqual(before);
    }
    const result = await executeAdjudication([...paths.argv, '--acknowledge-maintainer-evidence'], { now: () => NOW });
    expect(result.plan.files.map((file: {path: string}) => file.path)).toEqual(['catalogs/control-augmentations.yml']);
    expect(result.plan.requests[0]).toMatchObject({ claim: { claim_ref: 'augmentation:Gallery.WrapCount' }, action: { kind: 'property', operation: 'add-or-promote' } });
    expect(await readFile(sourcePath)).toEqual(before);
    const proposed = await readFile(join(paths.outDir, 'catalogs/control-augmentations.yml'), 'utf8');
    const propertyLine = proposed.split(/\r?\n/u).find(line => /^\s+WrapCount:/u.test(line));
    for (const field of ['type: Number', 'verified: true', 'verified_at: 2026-09-08', 'verified_by: compile_canvas']) expect(propertyLine).toContain(field);
    const snapshot = JSON.parse(await readFile(join(paths.outDir, 'queue-snapshot.json'), 'utf8'));
    expect(snapshot.entries[0].value.adjudication).toEqual({ outcome: 'verified', at: NOW, by: 'Maintainer', count_at_stamp: 12 });
    const ledger = await readFile(join(paths.outDir, 'RESULTS.md'), 'utf8');
    expect(ledger).toContain('not a live refresh or proof edits applied');
    expect(ledger).not.toContain('PRIVATE_COMPILER_TRANSCRIPT');
    expect(ledger).not.toContain('private-compiler-output.json');
  });

  it('keeps runtime-only property evidence as a proposal without a catalog replacement or queue stamp', async () => {
    const paths = await fixture('augmentation');
    const result = await compilerResult(paths);
    Object.assign(result.evidence, { evidence_class: 'runtime_observation', compiler: null });
    Object.assign(paths.results.cases[0], result);
    await writeFile(paths.resultsPath, JSON.stringify(paths.results));
    const reviewed = await executeAdjudication(paths.argv);
    expect(reviewed.plan.files).toEqual([]);
    expect(reviewed.decisions[0].status).toBe('review-required');
    expect(JSON.parse(await readFile(join(paths.outDir, 'queue-snapshot.json'), 'utf8'))).toEqual(paths.queue);
  });

  it('applies the reviewed property plan separately and verifies full context before any remote stamp', async () => {
    const paths = await fixture('augmentation');
    await compilerResult(paths);
    const reviewed = await executeAdjudication([...paths.argv, '--acknowledge-maintainer-evidence'], { now: () => NOW });
    const editsPath = join(paths.outDir, 'edits.json');
    const sourcePath = join(paths.rulesRoot, 'catalogs/control-augmentations.yml');
    const before = await readFile(sourcePath);
    const remoteOut = join(paths.directory, 'remote-report');
    const stampArgs = ['--stamp-remote', '--campaign', paths.campaignPath, '--results', paths.resultsPath,
      '--queue', paths.queuePath, '--rules-root', paths.rulesRoot, '--edits', editsPath, '--out', remoteOut,
      '--acknowledge-maintainer-evidence'];
    let constructions = 0;
    let gets = 0;
    const writes: Array<{ key: string; record: object }> = [];
    const live = { count: 17, occurrences: 21, future_field: { preserve: 'LIVE_PRIVATE_VALUE' } };
    const createRemoteBoundary = () => {
      constructions++;
      return { get: async () => { gets++; return live; }, put: async (key: string, record: object) => { writes.push({ key, record }); } };
    };
    await expect(executeAdjudication(stampArgs, { createRemoteBoundary, now: () => NOW })).rejects.toThrow();
    expect(await readFile(sourcePath)).toEqual(before);
    expect({ constructions, gets, writes }).toEqual({ constructions: 0, gets: 0, writes: [] });
    await expect(readFile(join(remoteOut, 'RESULTS.md'))).rejects.toMatchObject({ code: 'ENOENT' });
    const applied = await executeAdjudication(['--apply-local', editsPath, '--rules-root', paths.rulesRoot,
      '--acknowledge-maintainer-evidence'], { createRemoteBoundary });
    expect(applied).toMatchObject({ mode: 'apply', report: { status: 'complete', applied: ['catalogs/control-augmentations.yml'] } });
    expect(hash(await readFile(sourcePath))).toBe(reviewed.plan.files[0].after_sha256);
    expect(constructions).toBe(0);
    const stamped = await executeAdjudication(stampArgs, { createRemoteBoundary, now: () => NOW });
    expect(stamped).toMatchObject({ mode: 'stamp', report: { status: 'complete', completed: [AUGMENTATION], remaining: [] } });
    expect({ constructions, gets }).toEqual({ constructions: 1, gets: 1 });
    expect(writes).toEqual([{ key: AUGMENTATION, record: { ...live,
      adjudication: { outcome: 'verified', at: NOW, by: 'Maintainer', count_at_stamp: 17 } } }]);
    const remoteLedger = await readFile(join(remoteOut, 'REMOTE-STAMPS.md'), 'utf8');
    expect(remoteLedger).toContain('completed');
    expect(remoteLedger).not.toContain('LIVE_PRIVATE_VALUE');
  });

  it('skips an exact already-stamped live outcome/by/count despite a different timestamp', async () => {
    const paths = await fixture();
    await executeAdjudication(paths.argv, { now: () => NOW });
    let puts = 0;
    const live = { count: 17, adjudication: { outcome: 'dismissed', by: 'Fixture operator',
      count_at_stamp: 17, at: '2026-08-01T00:00:00.000Z' } };
    const result = await executeAdjudication(stampArgs(paths), { now: () => NOW,
      createRemoteBoundary: () => ({ get: async () => live, put: async () => { puts++; } }) });
    expect(puts).toBe(0);
    expect(result.report).toMatchObject({ status: 'complete', completed: [], already_stamped: [HEIGHT], failed: null, remaining: [] });
  });

  it.each(['changed-count', 'different-by', 'different-outcome', 'missing-record', 'malformed-count'])
    ('refuses %s observed remotely without writing a key', async (fault) => {
      const paths = await fixture();
      await executeAdjudication(paths.argv, { now: () => NOW });
      const live = { count: 17, adjudication: { outcome: 'dismissed', by: 'Fixture operator',
        count_at_stamp: 17, at: '2026-08-01T00:00:00.000Z' } };
      if (fault === 'changed-count') live.adjudication.count_at_stamp = 16;
      else if (fault === 'different-by') live.adjudication.by = 'Other operator';
      else if (fault === 'different-outcome') live.adjudication.outcome = 'verified';
      else if (fault === 'malformed-count') live.count = -1;
      let puts = 0;
      const attempt = executeAdjudication(stampArgs(paths), { now: () => NOW,
        createRemoteBoundary: () => ({ get: async () => fault === 'missing-record' ? null : live, put: async () => { puts++; } }) });
      await expect(attempt).rejects.toMatchObject({ report: { status: 'partial', completed: [], failed: HEIGHT, remaining: [] } });
      if (fault === 'changed-count') await expect(attempt).rejects.toThrow('already adjudicated with changed count');
      expect(puts).toBe(0);
    });

  it('records successful keys and the failed/remaining state durably when a later remote put fails', async () => {
    const paths = await fixture();
    await completeDismissals(paths);
    await executeAdjudication(paths.argv, { now: () => NOW });
    const completed: string[] = [];
    const attempt = executeAdjudication(stampArgs(paths), { now: () => NOW, createRemoteBoundary: () => ({
      get: async () => ({ count: 7 }),
      put: async (key: string) => { if (key === WIDTH) throw new Error('PRIVATE_REMOTE_FAILURE_DETAILS'); completed.push(key); },
    }) });
    await expect(attempt).rejects.toMatchObject({ report: { status: 'partial', completed: [HEIGHT], failed: WIDTH, remaining: [], phase: 'remote-put' } });
    await expect(attempt).rejects.not.toThrow('PRIVATE_REMOTE_FAILURE_DETAILS');
    expect(completed).toEqual([HEIGHT]);
    const ledger = await readFile(join(paths.directory, 'remote-report/REMOTE-STAMPS.md'), 'utf8');
    expect(ledger).toContain('completed:');
    expect(ledger).toContain('failed:');
    expect(ledger).toContain('remaining:');
    expect(ledger).not.toContain('PRIVATE_REMOTE_FAILURE_DETAILS');
  });

  it('retains the actual completed remote key in its failure report when local completion recording fails', async () => {
    const paths = await fixture();
    await completeDismissals(paths);
    await executeAdjudication(paths.argv, { now: () => NOW });
    let puts = 0;
    const attempt = executeAdjudication(stampArgs(paths), { now: () => NOW, createRemoteBoundary: () => ({
      get: async () => ({ count: 7 }), put: async () => {
        puts++;
        const log = join(paths.directory, 'remote-report/REMOTE-STAMPS.md');
        await unlink(log);
        await mkdir(log);
      },
    }) });
    await expect(attempt).rejects.toMatchObject({ report: { status: 'partial', completed: [HEIGHT],
      failed: null, remaining: [WIDTH], phase: 'completion-report' } });
    expect(puts).toBe(1);
  });

  it('rejects results/plan attribution drift before proposing a snapshot or constructing the remote boundary', async () => {
    const paths = await fixture();
    await executeAdjudication(paths.argv);
    const editsPath = join(paths.outDir, 'edits.json');
    const plan = JSON.parse(await readFile(editsPath, 'utf8'));
    plan.produced_by = 'Different operator';
    await writeFile(editsPath, JSON.stringify(plan));
    let constructed = 0;
    await expect(executeAdjudication(stampArgs(paths), { createRemoteBoundary: () => { constructed++; throw new Error('Unexpected boundary.'); } }))
      .rejects.toThrow('same attribution');
    expect(constructed).toBe(0);
    await expect(readFile(join(paths.directory, 'remote-report/queue-snapshot.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('validates an empty guarded plan without constructing a remote adapter when every case is still pending', async () => {
    const paths = await fixture();
    paths.results.cases = [];
    await writeFile(paths.resultsPath, JSON.stringify(paths.results));
    await executeAdjudication(paths.argv);
    let constructed = 0;
    const result = await executeAdjudication(stampArgs(paths), { createRemoteBoundary: () => { constructed++; throw new Error('Unexpected boundary.'); } });
    expect(result.report).toMatchObject({ status: 'complete', completed: [], already_stamped: [], failed: null, remaining: [] });
    expect(constructed).toBe(0);
  });

  it('preflights a fresh report directory before constructing a remote adapter', async () => {
    const paths = await fixture();
    await executeAdjudication(paths.argv);
    const before = await readFile(join(paths.outDir, 'RESULTS.md'));
    let constructed = 0;
    await expect(executeAdjudication(stampArgs(paths, paths.outDir), { createRemoteBoundary: () => { constructed++; throw new Error('Unexpected boundary.'); } })).rejects.toThrow();
    expect(constructed).toBe(0);
    expect(await readFile(join(paths.outDir, 'RESULTS.md'))).toEqual(before);
  });

  it('uses the legacy zero-count fallback while documenting the point-in-time intervening-write limitation', async () => {
    const paths = await fixture();
    await executeAdjudication(paths.argv);
    let stored: object = {};
    await executeAdjudication(stampArgs(paths), { now: () => NOW, createRemoteBoundary: () => ({
      get: async () => { const observed = structuredClone(stored); stored = { count: 1 }; return observed; },
      put: async (_key: string, record: object) => { stored = record; },
    }) });
    expect(stored).toEqual({ adjudication: { outcome: 'dismissed', at: NOW, by: 'Fixture operator', count_at_stamp: 0 } });
    expect(await readFile(join(paths.directory, 'remote-report/REMOTE-STAMPS.md'), 'utf8')).toContain('no compare-and-swap');
  });

  it('runs read-only review through the actual command from an unrelated directory without dumping private capture values', async () => {
    const paths = await fixture();
    const result = spawnSync(process.execPath, [script('adjudicate.mjs'), ...paths.argv],
      { cwd: tmpdir(), encoding: 'utf8', windowsHide: true });
    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
    expect(result.stdout).toContain('1 proposed queue stamps');
    expect(result.stdout).not.toContain('PRIVATE_CAPTURE_TEXT');
  });

  it('keeps non-generated overlap open even when a complete assertion and dismissed generated case are present', async () => {
    const paths = await fixture();
    paths.manifest.rows.splice(1, 0, { kind: 'queue', id: 'queue-' + hash(JSON.stringify(['queue-row/1', HEIGHT])).slice(0, 24),
      queue: [{ key: HEIGHT, count: 12 }], status: 'ambiguous', reason: 'An unreviewed part of this aggregate remains open.' });
    paths.manifest.coverage.non_generated_queue_rows = 1;
    await updateManifest(paths);
    await executeAdjudication(paths.argv);
    expect(JSON.parse(await readFile(join(paths.outDir, 'queue-snapshot.json'), 'utf8'))).toEqual(paths.queue);
  });

  it.each(['same-outcome', 'mixed-outcomes'])('joins every case for one aggregate key with %s', async (outcomes) => {
    const paths = await fixture('augmentation');
    const recipes = JSON.parse(await readFile(paths.recipesPath, 'utf8'));
    const fill = structuredClone(recipes.recipes[0]);
    fill.claim_ref = 'augmentation:Gallery.TemplateFill';
    Object.assign(fill.target, { property: 'TemplateFill', property_type: 'Color', property_value: '=RGBA(0,0,0,1)' });
    fill.repro_yaml = fill.repro_yaml.replace('WrapCount: =1', 'TemplateFill: =RGBA(0,0,0,1)');
    recipes.recipes.push(fill);
    recipes.queue_key_coverage[0].claim_refs = ['augmentation:Gallery.TemplateFill', 'augmentation:Gallery.WrapCount'];
    await writeFile(paths.recipesPath, JSON.stringify(recipes));
    await regenerate(paths);
    if (outcomes === 'mixed-outcomes') {
      const supplied = await compilerResult(paths);
      supplied.evidence.files[0].path = `campaign-revised/${paths.manifest.rows[0].repro.path}`;
      Object.assign(paths.results.cases[0], supplied);
      await writeFile(paths.resultsPath, JSON.stringify(paths.results));
    }
    const reviewed = await executeAdjudication([...paths.argv, '--acknowledge-maintainer-evidence'], { now: () => NOW });
    expect(reviewed.decisions.every((decision: {status: string}) => decision.status === 'settled')).toBe(true);
    expect(reviewed.keys[0].outcome).toBe(outcomes === 'same-outcome' ? 'dismissed' : null);
    expect(reviewed.plan.files).toHaveLength(outcomes === 'same-outcome' ? 0 : 1);
  });

  it.each(['compiler-subclaim', 'bounded-runtime'])('records the SQL %s while its aggregate coverage stays open', async (kind) => {
    const paths = await fixture('sql');
    const supplied = await compilerResult(paths);
    Object.assign(supplied.evidence, { datasource_bindings: [{ authored_name: 'VerificationRows', connector: 'sql', evidence_id: 'output' }] });
    if (kind === 'bounded-runtime') Object.assign(supplied.evidence, { evidence_class: 'runtime_observation', claim_scope: 'player_behaves', compiler: null,
      runtime_test: { kind: 'sql-isblank-delegation', connector: 'sql', nondelegation_limit: 500, controlled_rows: 501,
        qualifying_rows_beyond_limit: 1, expected_full_result: 'Both controlled qualifying row IDs.', observed_result: 'Only the row inside the client window.',
        monitor: { available: false, evidence_ids: [], note: 'Unavailable in this synthetic fixture.' } } });
    Object.assign(paths.results.cases[0], supplied);
    await writeFile(paths.resultsPath, JSON.stringify(paths.results));
    const reviewed = await executeAdjudication(paths.argv);
    expect(reviewed.decisions[0].status).toBe(kind === 'compiler-subclaim' ? 'compiler-subclaim-only' : 'settled');
    expect(reviewed.keys[0].outcome).toBeNull();
    expect(reviewed.plan.files).toEqual([]);
    expect(JSON.parse(await readFile(join(paths.outDir, 'queue-snapshot.json'), 'utf8'))).toEqual(paths.queue);
  });

  it('preserves the exact flattened tool-listing shape in the private derived queue snapshot', async () => {
    const paths = await fixture();
    const tool = { stats: { private: 'PRIVATE_TOOL_STATS' }, count: paths.queue.entries.length, prefix: '', include_adjudicated: false,
      entries: paths.queue.entries.map(entry => ({ key: entry.key, ...entry.value,
        count: entry.value.count ?? 0, last_seen: entry.value.last_seen ?? '' })) };
    await writeFile(paths.queuePath, JSON.stringify(tool));
    await regenerate(paths);
    paths.results.cases = paths.results.cases.slice(0, 1);
    await writeFile(paths.resultsPath, JSON.stringify(paths.results));
    await executeAdjudication(paths.argv, { now: () => NOW });
    const expected = structuredClone(tool);
    Object.assign(expected.entries[0], { adjudication: { outcome: 'dismissed', at: NOW, by: 'Fixture operator', count_at_stamp: 12 } });
    expect(JSON.parse(await readFile(join(paths.outDir, 'queue-snapshot.json'), 'utf8'))).toEqual(expected);
    expect(await readFile(join(paths.outDir, 'RESULTS.md'), 'utf8')).not.toContain('PRIVATE_TOOL_STATS');
  });

  it('binds an applied plan to the exact cumulative property requests before any remote action', async () => {
    const paths = await fixture('augmentation');
    await compilerResult(paths);
    await executeAdjudication([...paths.argv, '--acknowledge-maintainer-evidence']);
    await executeAdjudication(['--apply-local', join(paths.outDir, 'edits.json'), '--rules-root', paths.rulesRoot, '--acknowledge-maintainer-evidence']);
    const before = await readFile(join(paths.rulesRoot, 'catalogs/control-augmentations.yml'));
    paths.results.cases[0].reason = 'A changed cumulative result requires a new reviewed plan.';
    await writeFile(paths.resultsPath, JSON.stringify(paths.results));
    // Even a coherent digest companion cannot replace the underlying exact
    // request/evidence binding to the independently reconstructed T0 plan.
    const contextPath = join(paths.outDir, 'review-context.json');
    const context = JSON.parse(await readFile(contextPath, 'utf8'));
    context.results_sha256 = hash(await readFile(paths.resultsPath));
    await writeFile(contextPath, JSON.stringify(context));
    let constructed = 0;
    await expect(executeAdjudication([...stampArgs(paths), '--acknowledge-maintainer-evidence'], {
      createRemoteBoundary: () => { constructed++; throw new Error('Unexpected boundary'); },
    })).rejects.toThrow('requests, attribution');
    expect(constructed).toBe(0);
    expect(await readFile(join(paths.rulesRoot, 'catalogs/control-augmentations.yml'))).toEqual(before);
    await expect(readFile(join(paths.directory, 'remote-report/edits.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('keeps an otherwise compiler-eligible property blocked by an existing scoped disproof', async () => {
    const paths = await fixture('augmentation');
    const row = '| Gallery.WrapCount | Existing synthetic disproof |';
    await writeFile(join(paths.rulesRoot, 'disproofs.md'), `# Fixture disproofs\n\n| Claim | Evidence |\n|---|---|\n${row}\n`);
    await writeFile(join(paths.rulesRoot, 'disproofs.index.json'), JSON.stringify({ schema: 'appforge-disproof-index/1', hash_algorithm: 'sha256',
      entries: [{ id: 'fixture-conflict', match: { kind: 'exact', claim_ref: 'augmentation:Gallery.WrapCount' }, row_sha256: hash(row) }] }));
    await regenerate(paths);
    await compilerResult(paths);
    const result = await executeAdjudication([...paths.argv, '--acknowledge-maintainer-evidence']);
    expect(result.decisions[0].status).toBe('blocked');
    expect(result.plan.files).toEqual([]);
    expect(result.keys[0].outcome).toBeNull();
  });

  it('preserves a real pinned CLI refusal despite supplied normalized compiler acceptance', async () => {
    const paths = await fixture('augmentation');
    const recipes = JSON.parse(await readFile(paths.recipesPath, 'utf8'));
    recipes.recipes[0].repro_yaml += '            UnreviewedUnknownProperty: =1\n';
    await writeFile(paths.recipesPath, JSON.stringify(recipes));
    await regenerate(paths);
    await compilerResult(paths);
    const result = await executeAdjudication([...paths.argv, '--acknowledge-maintainer-evidence']);
    expect(result.decisions[0].status).toBe('blocked');
    expect(result.plan.files).toEqual([]);
    expect(result.keys[0].outcome).toBeNull();
  });

  it('keeps transport, setup and unrelated compiler failures pending without disproof replacements', async () => {
    const paths = await fixture('augmentation');
    const supplied = await compilerResult(paths);
    supplied.outcome = 'disproven';
    supplied.evidence.falsifier_result = 'falsified';
    for (const scope of ['transport', 'setup', 'unrelated']) {
      Object.assign(supplied.evidence.compiler, { outcome: scope === 'transport' ? 'transport-error' : 'rejected', rejection_scope: scope });
      Object.assign(paths.results.cases[0], supplied);
      await writeFile(paths.resultsPath, JSON.stringify(paths.results));
      const args = [...paths.argv, '--acknowledge-maintainer-evidence'];
      args[args.indexOf('--out') + 1] = join(paths.directory, `review-${scope}`);
      const result = await executeAdjudication(args);
      expect(result.decisions[0].status).toBe('pending');
      expect(result.plan.files).toEqual([]);
      expect(result.keys[0].outcome).toBeNull();
    }
  });

  it('proposes exact property removal and companion disproof files only for attributable rejection', async () => {
    const paths = await fixture('augmentation');
    const supplied = await compilerResult(paths);
    supplied.outcome = 'disproven';
    supplied.evidence.falsifier_result = 'falsified';
    Object.assign(supplied.evidence.compiler, { outcome: 'rejected', rejection_scope: 'tested-claim' });
    Object.assign(paths.results.cases[0], supplied);
    await writeFile(paths.resultsPath, JSON.stringify(paths.results));
    const result = await executeAdjudication([...paths.argv, '--acknowledge-maintainer-evidence'], { now: () => NOW });
    expect(result.plan.requests[0].action).toEqual({ kind: 'property', operation: 'remove' });
    expect(result.plan.files.map((file: {path: string}) => file.path)).toEqual(['catalogs/control-augmentations.yml', 'disproofs.index.json', 'disproofs.md']);
    expect(result.keys[0].outcome).toBe('disproven');
    expect(await readFile(join(paths.rulesRoot, 'catalogs/control-augmentations.yml'), 'utf8')).toMatch(/WrapCount:/u);
  });

  it('rejects new command-control tokens hidden in legacy attribution without changing the exported legacy parser', async () => {
    const controls = ['--campaign', '--results', '--queue', '--rules-root', '--out', '--edits', '--apply-local',
      '--stamp-remote', '--acknowledge-maintainer-evidence', '--help'];
    for (const flag of controls) {
      const args = ['warn:Fixture.Property', 'dismissed', '--by', flag];
      expect(parseArgs(args).by).toBe(flag);
      let constructions = 0;
      await expect(executeAdjudication(args, { createRemoteBoundary: () => {
        constructions++;
        return { get: async () => ({ count: 1 }), put: async () => {} };
      } })).rejects.toThrow();
      expect(constructions).toBe(0);
    }
  });

  it('binds a zero-file review to the exact cumulative queue-only results before remote stamping', async () => {
    const paths = await fixture();
    await executeAdjudication(paths.argv, { now: () => NOW });
    await completeDismissals(paths);
    let constructions = 0;
    await expect(executeAdjudication(stampArgs(paths), { now: () => NOW, createRemoteBoundary: () => {
      constructions++;
      return { get: async () => ({ count: 7 }), put: async () => {} };
    } })).rejects.toThrow();
    expect(constructions).toBe(0);
    await expect(readFile(join(paths.directory, 'remote-report/RESULTS.md'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('retains exact byte bindings in both review and remote report packages', async () => {
    const paths = await fixture();
    await executeAdjudication(paths.argv, { now: () => NOW });
    const stamped = await executeAdjudication(stampArgs(paths), { now: () => NOW, createRemoteBoundary: () => ({
      get: async () => ({ count: 7 }), put: async () => {},
    }) });
    expect(stamped.report.completed).toEqual([HEIGHT]);
    for (const directory of [paths.outDir, stamped.directory]) {
      expect(JSON.parse(await readFile(join(directory, 'review-context.json'), 'utf8'))).toEqual({
        schema: 'verification-review-context/1',
        campaign_sha256: hash(await readFile(paths.campaignPath)),
        results_sha256: hash(await readFile(paths.resultsPath)),
        queue_sha256: hash(await readFile(paths.queuePath)),
        edits_sha256: hash(await readFile(join(directory, 'edits.json'))),
      });
    }
  });

  it.each(['missing', 'extra-key', 'wrong-schema', 'campaign-hash', 'results-hash', 'queue-hash', 'edits-hash', 'results-byte-drift', 'edits-byte-drift'])
    ('refuses an incomplete or changed review companion before output or remote construction: %s', async (fault) => {
      const paths = await fixture();
      await executeAdjudication(paths.argv, { now: () => NOW });
      const companionPath = join(paths.outDir, 'review-context.json');
      const companion = JSON.parse(await readFile(companionPath, 'utf8'));
      if (fault === 'missing') await unlink(companionPath);
      else if (fault === 'results-byte-drift') await writeFile(paths.resultsPath, JSON.stringify(paths.results) + '\n');
      else if (fault === 'edits-byte-drift') {
        const editsPath = join(paths.outDir, 'edits.json');
        await writeFile(editsPath, Buffer.concat([await readFile(editsPath), Buffer.from('\n')]));
      } else {
        if (fault === 'extra-key') companion.authorized = true;
        else if (fault === 'wrong-schema') companion.schema = 'verification-review-context/2';
        else companion[fault.replace('-hash', '_sha256')] = '0'.repeat(64);
        await writeFile(companionPath, JSON.stringify(companion));
      }
      let constructions = 0;
      await expect(executeAdjudication(stampArgs(paths), { createRemoteBoundary: () => {
        constructions++;
        throw new Error('Unexpected remote construction');
      } })).rejects.toThrow(/review.context/iu);
      expect(constructions).toBe(0);
      await expect(readFile(join(paths.directory, 'remote-report/RESULTS.md'))).rejects.toMatchObject({ code: 'ENOENT' });
      if (fault === 'missing') {
        // Applying the shared plan is still a separate local operation; its
        // contract does not depend on this T2 full-context stamping companion.
        const applied = await executeAdjudication(['--apply-local', join(paths.outDir, 'edits.json'), '--rules-root', paths.rulesRoot]);
        expect(applied.report.status).toBe('complete');
      }
    });
});
