import { verificationFixture } from './helpers/verification-fixture';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseCampaignArgs, generateVerificationCampaign } from '../scripts/verification-campaign.mjs';

const MCP = resolve(__dirname, '..');
const { rules: RULES, artifact: ARTIFACT, script } = verificationFixture();
const REVIEWED_RECIPES = resolve(MCP, '../docs/maintainers/verification/recipes/2026-09-08-queue-hypotheses.json');
const temporaryDirectories: string[] = [];
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const KEY_HEIGHT = 'lint:partial-catalog-data:Circle.Height';
const KEY_SQL = 'lint:delegation-sql-isblank:Gallery.Items';
const augmentationRecipe = {
  claim_ref: 'augmentation:Gallery.WrapCount', claim_scope: 'compiler_accepts',
  claim_text: 'Gallery accepts the reviewed numeric WrapCount assignment.',
  falsifier: { description: 'Compile the exact input.', unfalsified_if: 'The input is accepted.', falsified_if: 'The exact property is rejected.' },
  prerequisites: [], expected_compile_outcome: 'accept',
  target: { kind: 'augmentation-property', control: 'Gallery', property: 'WrapCount', property_type: 'Number', property_value: '=1' },
  reproduction: 'Compile the unchanged synthetic probe.', local_lint_context: { datasources: {} }, ancestors: [],
  queue_keys: ['warn:Gallery.WrapCount'],
  repro_yaml: 'Screens:\n  VerificationScreen:\n    Children:\n      - ctlProbe:\n          Control: Gallery\n          Properties:\n            WrapCount: =1\n',
};

async function selectRecipe(paths: { queuePath: string; recipesPath: string }, recipe: typeof augmentationRecipe | object) {
  const entry = { ...augmentationRecipe, ...recipe };
  await writeFile(paths.queuePath, JSON.stringify({ schema: 'verification-queue-export/1',
    captured_at: '2026-09-08T09:00:00.000Z', entries: entry.queue_keys.map(key => ({ key, value: { count: 3 } })) }));
  await writeFile(paths.recipesPath, JSON.stringify({ schema: 'verification-recipes/1', recipes: [entry],
    queue_key_coverage: entry.queue_keys.map(key => ({ key, complete: true, claim_refs: [entry.claim_ref] })) }));
}

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'appforge-verification-campaign-'));
  temporaryDirectories.push(directory);
  const rulesRoot = join(directory, 'rules');
  await mkdir(rulesRoot);
  await mkdir(join(rulesRoot, 'catalogs'));
  for (const name of ['control-manifest.yml', 'control-properties.yml', 'control-augmentations.yml']) {
    await cp(join(RULES, 'catalogs', name), join(rulesRoot, 'catalogs', name));
  }
  const disproofRow = '| Synthetic historical claim | Existing fixture disproof |';
  await writeFile(join(rulesRoot, 'disproofs.md'), `# Fixture disproofs\n\n| Claim | Evidence |\n|---|---|\n${disproofRow}\n`);
  await writeFile(join(rulesRoot, 'disproofs.index.json'), JSON.stringify({
    schema: 'appforge-disproof-index/1', hash_algorithm: 'sha256',
    entries: [{ id: 'fixture-historical-disproof', match: { kind: 'exact', claim_ref: 'rule:fixture-historical-claim' }, row_sha256: hash(disproofRow) }],
  }));
  const queuePath = join(directory, 'queue.json');
  const recipesPath = join(directory, 'recipes.json');
  await cp(REVIEWED_RECIPES, recipesPath);
  await writeFile(queuePath, JSON.stringify({
    schema: 'verification-queue-export/1', captured_at: '2026-09-08T09:00:00.000Z',
    entries: [
      { key: KEY_HEIGHT, value: { count: 12 } },
      { key: 'lint:partial-catalog-data:Classic/Icon', value: { count: 4 } },
      { key: KEY_SQL, value: { count: 1 } },
      { key: 'lint:partial-catalog-data:Classic/Icon.SomeUnknownProp', value: { count: 1 } },
      { key: 'stats:fixture', value: { private_fixture_text: 'must not appear in campaign' } },
    ],
  }));
  return { directory, queuePath, recipesPath, rulesRoot, analyzerArtifactPath: ARTIFACT, date: '2026-09-08', outDir: join(directory, 'campaign') };
}

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0)) {
    if (!resolve(directory).startsWith(resolve(tmpdir()) + sep + 'appforge-verification-campaign-')) {
      throw new Error('Unexpected campaign test directory');
    }
    await rm(directory, { recursive: true, force: true });
  }
});

describe('verification campaign command', () => {
  it('accepts only explicit local queue, recipes, destination, date and rules-root options', () => {
    expect(parseCampaignArgs([
      '--queue', 'queue.json', '--recipes', 'recipes.json', '--out', 'campaign',
      '--date', '2026-09-08', '--rules-root', 'rules',
    ])).toEqual({
      queuePath: resolve('queue.json'), recipesPath: resolve('recipes.json'),
      outDir: resolve('campaign'), date: '2026-09-08', rulesRoot: resolve('rules'),
    });
  });

  it.each([
    [], ['--queue', 'queue.json'],
    ['--queue', 'q', '--recipes', 'r', '--out'],
    ['--queue', 'q', '--recipes', 'r', '--out', 'o', '--queue', 'again'],
    ['--queue', 'q', '--recipes', 'r', '--out', 'o', '--analyzer-artifact', 'untrusted.mjs'],
    ['--queue', 'q', '--recipes', 'r', '--out', 'o', '--apply-local'],
    ['--queue', 'q', '--recipes', 'r', '--out', 'o', '--stamp-remote'],
    ['--queue', '--recipes', 'r', '--out', 'o'],
  ])('rejects unsupported, duplicate or incomplete arguments %j', (...args) => {
    expect(() => parseCampaignArgs(args)).toThrow(/Usage:/);
  });

  it('defaults to the installed rules root while leaving the UTC date to generation', () => {
    expect(parseCampaignArgs(['--queue', 'q', '--recipes', 'r', '--out', 'o'])).toEqual({
      queuePath: resolve('q'), recipesPath: resolve('r'), outDir: resolve('o'),
      rulesRoot: resolve(__dirname, '../../knowledge'),
    });
    expect(parseCampaignArgs(['--help'])).toEqual({ help: true });
  });

  it('writes actual synthetic cases while retaining incomplete and missing key coverage', async () => {
    const paths = await fixture();
    await generateVerificationCampaign(paths);
    const manifestText = await readFile(join(paths.outDir, 'manifest.json'), 'utf8');
    const manifest = JSON.parse(manifestText);
    expect(manifest).toMatchObject({
      schema: 'verification-campaign/1', date: '2026-09-08', capture_scope: 'operator-export',
      captured_at: '2026-09-08T09:00:00.000Z',
      coverage: { selected_queue_rows: 4, generated_cases: 2, generated_queue_rows: 2,
        non_generated_queue_rows: 3, excluded_adjudicated_rows: 0, excluded_nonclaim_rows: 1 },
      excluded: [{ key: 'stats:fixture', reason: 'non-claim-key' }],
    });
    const cases = manifest.rows.filter((row: { kind: string }) => row.kind === 'case');
    expect(cases.map((row: { claim_ref: string }) => row.claim_ref))
      .toEqual(['dump-property:Circle.Height', 'rule:delegation-sql-isblank']);
    expect(cases.every((row: { status: string }) => row.status === 'pending')).toBe(true);
    expect(cases[0].local_gate.rule_ids).toContain('partial-catalog-data');
    expect(cases[1].local_gate.rule_ids).toContain('delegation-sql-isblank');
    expect(cases[1].local_lint_context).toEqual({ datasources: { VerificationRows: 'sql' } });
    const gaps = manifest.rows.filter((row: { kind: string }) => row.kind === 'queue');
    expect(gaps.map((row: { queue: Array<{key: string}>; status: string }) => [row.queue[0].key, row.status])).toEqual([
      ['lint:partial-catalog-data:Classic/Icon', 'ambiguous'],
      [KEY_SQL, 'ambiguous'],
      ['lint:partial-catalog-data:Classic/Icon.SomeUnknownProp', 'needs-recipe'],
    ]);
    expect(gaps.every((row: object) => !Object.hasOwn(row, 'claim_ref') && !Object.hasOwn(row, 'repro'))).toBe(true);
    expect(manifest.queue_key_coverage.find((row: {key: string}) => row.key === KEY_SQL))
      .toEqual({ key: KEY_SQL, complete: false, claim_refs: ['rule:delegation-sql-isblank'] });
    expect(manifest.source.analyzer_artifact_sha256).toBe(hash(await readFile(ARTIFACT)));
    expect(manifest.source.queue_file_sha256).toBe(hash(await readFile(paths.queuePath)));
    expect(manifest.source.recipes_file_sha256).toBe(hash(await readFile(paths.recipesPath)));
    expect(manifest.source.rules_files).toHaveLength(5);
    for (const row of cases) {
      const yaml = await readFile(join(paths.outDir, row.repro.path), 'utf8');
      expect(hash(yaml)).toBe(row.repro.sha256);
      expect(yaml).toContain('VerificationScreen:');
      expect(yaml).toContain('- ctlProbe:');
      expect(yaml).not.toMatch(/Control:.*@/);
    }
    const worklist = await readFile(join(paths.outDir, 'WORKLIST.md'), 'utf8');
    expect(worklist).toContain('compile_canvas');
    expect(worklist).toContain('pinned CLI artifact profile');
    expect(worklist).toContain('does not replace delivery-tenant validation');
    expect(worklist).toContain('aggregate key remains open');
    expect(manifestText + worklist).not.toContain('must not appear in campaign');
    expect(manifestText + worklist).not.toContain('verified: true');
  });

  it('deduplicates an exact claim across keys and emits identical bytes for repeated inputs/date', async () => {
    const paths = await fixture();
    const queue = JSON.parse(await readFile(paths.queuePath, 'utf8'));
    queue.entries.push({ key: 'warn:Circle.Height', value: { count: 20 } });
    await writeFile(paths.queuePath, JSON.stringify(queue));
    const recipes = JSON.parse(await readFile(paths.recipesPath, 'utf8'));
    recipes.recipes.find((row: {claim_ref: string}) => row.claim_ref === 'dump-property:Circle.Height').queue_keys.push('warn:Circle.Height');
    recipes.queue_key_coverage.push({ key: 'warn:Circle.Height', complete: true, claim_refs: ['dump-property:Circle.Height'] });
    await writeFile(paths.recipesPath, JSON.stringify(recipes));
    const first = await generateVerificationCampaign(paths);
    const secondOut = join(paths.directory, 'repeat');
    await generateVerificationCampaign({ ...paths, outDir: secondOut });
    const names = (await readdir(paths.outDir)).sort();
    expect((await readdir(secondOut)).sort()).toEqual(names);
    for (const name of names) expect(await readFile(join(secondOut, name))).toEqual(await readFile(join(paths.outDir, name)));
    const row = first.manifest.rows[0];
    expect(row.claim_ref).toBe('dump-property:Circle.Height');
    expect(row.queue).toEqual([{ key: KEY_HEIGHT, count: 12 }, { key: 'warn:Circle.Height', count: 20 }]);
    expect(row.id).toBe('case-' + hash('["case/1","dump-property:Circle.Height"]').slice(0, 24));
    expect(first.manifest.campaign_id).toBe('campaign-' + hash(JSON.stringify([
      'verification-campaign/1', '2026-09-08', hash(await readFile(paths.queuePath)),
      hash(await readFile(paths.recipesPath)), hash(await readFile(ARTIFACT)),
    ])).slice(0, 24));
    expect(first.manifest.coverage.generated_cases).toBe(2);
    expect(first.manifest.coverage.generated_queue_rows).toBe(3);
  });

  it('preserves an incomplete local prerequisite as a queue row with its assertion intact', async () => {
    const paths = await fixture();
    const queue = JSON.parse(await readFile(paths.queuePath, 'utf8'));
    queue.entries = queue.entries.filter((entry: {key: string}) => entry.key === KEY_HEIGHT);
    await writeFile(paths.queuePath, JSON.stringify(queue));
    const recipes = JSON.parse(await readFile(paths.recipesPath, 'utf8'));
    recipes.recipes[0].prerequisites[0].satisfied = false;
    await writeFile(paths.recipesPath, JSON.stringify(recipes));
    const { manifest } = await generateVerificationCampaign(paths);
    expect(manifest.rows).toEqual([{
      kind: 'queue', id: 'queue-' + hash(JSON.stringify(['queue-row/1', KEY_HEIGHT])).slice(0, 24),
      queue: [{ key: KEY_HEIGHT, count: 12 }], status: 'incomplete-prerequisites',
      reason: 'A mapped recipe has an unsatisfied local prerequisite; aggregate key remains open.',
    }]);
    expect(manifest.queue_key_coverage).toEqual([{ key: KEY_HEIGHT, complete: true, claim_refs: ['dump-property:Circle.Height'] }]);
    expect(manifest.coverage.generated_cases).toBe(0);
    expect(await readFile(join(paths.outDir, 'WORKLIST.md'), 'utf8')).toContain('No generated claim coverage');
  });

  it('reports an all-excluded actual tool listing without claiming coverage or inventing a timestamp', async () => {
    const paths = await fixture();
    await writeFile(paths.queuePath, JSON.stringify({
      stats: { opaque_fixture: 'must remain private' }, count: 2, prefix: null, include_adjudicated: true,
      entries: [
        { key: KEY_HEIGHT, count: 12, last_seen: '', adjudication: { outcome: 'dismissed', by: 'Fixture', at: '2026-09-08T09:00:00.000Z', count_at_stamp: 12 } },
        { key: 'stats:fixture', count: 0, last_seen: '' },
      ],
    }));
    const { manifest } = await generateVerificationCampaign(paths);
    expect(manifest.capture_scope).toBe('tool-listing');
    expect(manifest.captured_at).toBeNull();
    expect(manifest.rows).toEqual([]);
    expect(manifest.queue_key_coverage).toEqual([]);
    expect(manifest.coverage).toEqual({ selected_queue_rows: 0, generated_cases: 0, generated_queue_rows: 0,
      non_generated_queue_rows: 0, excluded_adjudicated_rows: 1, excluded_nonclaim_rows: 1 });
    const text = await readFile(join(paths.outDir, 'WORKLIST.md'), 'utf8');
    expect(text).toContain('No generated claim coverage');
    expect(JSON.stringify(manifest) + text).not.toContain('must remain private');
  });

  it('uses an injected UTC day and rejects impossible explicit dates before any package is written', async () => {
    const paths = await fixture();
    const { manifest } = await generateVerificationCampaign({ ...paths, date: undefined,
      now: () => new Date('2026-09-08T23:30:00-02:00') });
    expect(manifest.date).toBe('2026-09-09');
    const invalidOut = join(paths.directory, 'invalid-date');
    await expect(generateVerificationCampaign({ ...paths, outDir: invalidOut, date: '2026-02-30' })).rejects.toThrow('calendar-valid');
    await expect(stat(invalidOut)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('refuses an existing output directory without overwriting its completed manifest', async () => {
    const paths = await fixture();
    await generateVerificationCampaign(paths);
    const before = await readFile(join(paths.outDir, 'manifest.json'));
    await expect(generateVerificationCampaign(paths)).rejects.toThrow();
    expect(await readFile(join(paths.outDir, 'manifest.json'))).toEqual(before);
  });

  it('generates an existing augmentation and an observed variant with its minimum ancestor chain', async () => {
    const paths = await fixture();
    await selectRecipe(paths, augmentationRecipe);
    const first = await generateVerificationCampaign(paths);
    expect(first.manifest.rows).toHaveLength(1);
    expect(first.manifest.rows[0]).toMatchObject({ kind: 'case', claim_ref: 'augmentation:Gallery.WrapCount',
      status: 'pending', local_gate: { summary: { controls_seen: 1, refuse: 0 } } });
    const nestedYaml = 'Screens:\n  VerificationScreen:\n    Children:\n      - ctlParent1:\n          Control: Form\n          Children:\n            - ctlProbe:\n                Control: TypedDataCard\n                Variant: TextualEdit\n';
    await selectRecipe(paths, { ...augmentationRecipe, claim_ref: 'variant:TypedDataCard.TextualEdit',
      target: { kind: 'observed-variant', control: 'TypedDataCard', variant: 'TextualEdit' },
      ancestors: [{ name: 'ctlParent1', control: 'Form' }], queue_keys: ['warn:TypedDataCard.TextualEdit'], repro_yaml: nestedYaml });
    const second = await generateVerificationCampaign({ ...paths, outDir: join(paths.directory, 'variant') });
    expect(second.manifest.rows).toHaveLength(1);
    expect(second.manifest.rows[0]).toMatchObject({ kind: 'case', claim_ref: 'variant:TypedDataCard.TextualEdit',
      ancestors: [{ name: 'ctlParent1', control: 'Form' }], status: 'pending', local_gate: { summary: { controls_seen: 2, refuse: 0 } } });
    expect(await readFile(join(paths.directory, 'variant', second.manifest.rows[0].repro.path), 'utf8')).toBe(nestedYaml);
  });

  it('retains an actual CLI-profile REFUSE as a blocked generated case without bypass instructions', async () => {
    const paths = await fixture();
    await selectRecipe(paths, { ...augmentationRecipe,
      repro_yaml: `${augmentationRecipe.repro_yaml}            UnreviewedUnknownProperty: =1\n` });
    const { manifest } = await generateVerificationCampaign(paths);
    expect(manifest.rows).toHaveLength(1);
    expect(manifest.rows[0].status).toBe('local-gate-blocked');
    expect(manifest.rows[0].local_gate.summary.refuse).toBeGreaterThan(0);
    expect(await readFile(join(paths.outDir, 'WORKLIST.md'), 'utf8')).toContain('do not bypass a REFUSE');
  });

  it.each(['absent', 'wrong-type'])('keeps an %s existing augmentation target unsupported without inventing it', async (fault) => {
    const paths = await fixture();
    const recipe = structuredClone(augmentationRecipe);
    if (fault === 'absent') {
      recipe.claim_ref = 'augmentation:Gallery.UnreviewedUnknownProperty';
      recipe.target.property = 'UnreviewedUnknownProperty';
      recipe.repro_yaml = recipe.repro_yaml.replace('WrapCount:', 'UnreviewedUnknownProperty:');
    } else recipe.target.property_type = 'Text';
    await selectRecipe(paths, recipe);
    const { manifest } = await generateVerificationCampaign(paths);
    expect(manifest.rows).toMatchObject([{ kind: 'queue', status: 'unsupported' }]);
    expect(manifest.coverage.generated_cases).toBe(0);
    expect((await readdir(paths.outDir)).sort()).toEqual(['WORKLIST.md', 'manifest.json']);
  });

  it.each(['missing', 'mismatched'])('retains an open queue row when complete coverage is %s', async (fault) => {
    const paths = await fixture();
    await selectRecipe(paths, augmentationRecipe);
    const document = JSON.parse(await readFile(paths.recipesPath, 'utf8'));
    if (fault === 'missing') document.queue_key_coverage = [];
    else document.queue_key_coverage[0].claim_refs = [];
    await writeFile(paths.recipesPath, JSON.stringify(document));
    const { manifest } = await generateVerificationCampaign(paths);
    expect(manifest.rows.filter((row: {kind: string}) => row.kind === 'case')).toHaveLength(1);
    expect(manifest.rows.filter((row: {kind: string}) => row.kind === 'queue')).toMatchObject([{ status: 'ambiguous' }]);
  });

  it('runs all six reviewed hypotheses through the actual CLI from an unrelated working directory', async () => {
    const paths = await fixture();
    const recipes = JSON.parse(await readFile(paths.recipesPath, 'utf8'));
    await writeFile(paths.queuePath, JSON.stringify({ schema: 'verification-queue-export/1',
      captured_at: '2026-09-08T09:00:00.000Z', entries: recipes.recipes.map((recipe: {queue_keys: string[]}) => ({
        key: recipe.queue_keys[0], value: { count: 1 },
      })) }));
    const command = script('verification-campaign.mjs');
    const run = spawnSync(process.execPath, [command, '--queue', paths.queuePath, '--recipes', paths.recipesPath,
      '--out', paths.outDir, '--rules-root', paths.rulesRoot, '--date', paths.date], { cwd: paths.directory, encoding: 'utf8' });
    expect({ status: run.status, stderr: run.stderr }).toEqual({ status: 0, stderr: '' });
    expect(run.stdout).toContain('Wrote 6 generated cases and 1 non-generated queue rows.');
    const manifest = JSON.parse(await readFile(join(paths.outDir, 'manifest.json'), 'utf8'));
    expect(manifest.rows.filter((row: {kind: string}) => row.kind === 'case').every((row: {status: string}) => row.status === 'pending')).toBe(true);
    const help = spawnSync(process.execPath, [command, '--help'], { cwd: paths.directory, encoding: 'utf8' });
    expect(help.status).toBe(0);
    expect(help.stdout).toContain('pinned CLI artifact profile');
    const invalid = spawnSync(process.execPath, [command, '--stamp-remote'], { cwd: paths.directory, encoding: 'utf8' });
    expect(invalid.status).toBe(1);
    expect(invalid.stderr).toContain('Usage:');
  });

  it.each(['wrong-target', 'duplicate-queue-key', 'source-drift', 'json-artifact-path'])('rejects %s before output', async (fault) => {
    const paths = await fixture();
    if (fault === 'wrong-target' || fault === 'json-artifact-path') {
      const recipes = JSON.parse(await readFile(paths.recipesPath, 'utf8'));
      if (fault === 'wrong-target') recipes.recipes[0].repro_yaml = recipes.recipes[0].repro_yaml.replace('Control: Circle', 'Control: Triangle');
      else recipes.analyzerArtifactPath = 'untrusted-code.mjs';
      await writeFile(paths.recipesPath, JSON.stringify(recipes));
    } else if (fault === 'duplicate-queue-key') {
      const queue = JSON.parse(await readFile(paths.queuePath, 'utf8'));
      queue.entries.push(queue.entries[0]);
      await writeFile(paths.queuePath, JSON.stringify(queue));
    } else {
      const path = join(paths.rulesRoot, 'catalogs/control-properties.yml');
      const before = await readFile(path, 'utf8');
      await writeFile(path, before.replace('AccessibleLabel: Text', 'AccessibleLabel: Number'));
    }
    await expect(generateVerificationCampaign(paths)).rejects.toThrow();
    await expect(stat(paths.outDir)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
