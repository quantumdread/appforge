import { verificationFixture } from './helpers/verification-fixture';
import { describe, expect, it } from 'vitest';
import { dirname, join, resolve } from 'node:path';
import { copyFile, cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ingestErrata, parseErrataArgs } from '../scripts/ingest-errata.mjs';
import { sha256 } from '../scripts/lib/verification-contracts.mjs';
import { parseAugmentations } from '../scripts/lib/augmentation-catalog.mjs';

const { rules, artifact, script } = verificationFixture();
const sourceFiles = ['catalogs/control-manifest.yml', 'catalogs/control-properties.yml', 'catalogs/control-augmentations.yml', 'disproofs.md', 'disproofs.index.json'];

async function fixture(full = false) {
  const directory = await mkdtemp(join(tmpdir(), 'verification-errata-'));
  const rulesRoot = join(directory, 'rules');
  if (full) await cp(rules, rulesRoot, { recursive: true });
  else for (const file of sourceFiles) {
    await mkdir(dirname(join(rulesRoot, file)), { recursive: true });
    await copyFile(join(rules, file), join(rulesRoot, file));
  }
  const claim = { claim_ref: 'augmentation:Gallery.WrapCount', claim_scope: 'compiler_accepts',
    claim_text: 'Hypothesis: Gallery accepts WrapCount.',
    falsifier: { description: 'Compile the exact reviewed probe.', unfalsified_if: 'Accepted.', falsified_if: 'Targeted rejection.' },
    prerequisites: [], expected_compile_outcome: 'accept',
    target: { kind: 'augmentation-property', control: 'Gallery', property: 'WrapCount', property_type: 'Number', property_value: '=1' },
    reproduction: 'Prepare a reviewed probe before tenant execution.', local_lint_context: { datasources: {} }, ancestors: [], repro: null };
  const result = { outcome: 'verified', reason: 'Submitted as a hypothesis, without a measured result.', evidence: {
    evidence_class: 'unverified', claim_scope: 'compiler_accepts', environment: null,
    reproduction: 'Prepare a reviewed probe before tenant execution.', falsifier_result: 'not-run',
    falsifier_observation: 'The falsifier has not been run.', files: [], compiler: null, runtime_test: null,
    completed_tenant_prerequisites: [], datasource_bindings: [] } };
  const errata = { schema: 'appforge-errata/1', produced_by: 'Synthetic author', captured_at: '2026-09-08T10:00:00Z',
    entries: [{ id: 'wrap-count-hypothesis', claim, result, proposed_change: { kind: 'additional-property', operation: 'add-or-promote' } }] };
  const errataPath = join(directory, 'errata.json');
  await writeFile(errataPath, JSON.stringify(errata));
  return { directory, rulesRoot, errataPath, maintainer: 'Maintainer', analyzerArtifactPath: artifact, outDir: join(directory, 'review') };
}

async function compilerFixture(context: Awaited<ReturnType<typeof fixture>>) {
  const errata = JSON.parse(await readFile(context.errataPath, 'utf8'));
  const entry = errata.entries[0];
  const yaml = 'Screens:\n  VerificationScreen:\n    Children:\n      - ctlParent1:\n          Control: Form\n          Children:\n            - ctlProbe:\n                Control: TypedDataCard\n                Variant: TextualEdit\n                Properties:\n                  Update: ="Probe"\n';
  const output = 'Synthetic private compiler outcome: accepted.\n';
  await writeFile(join(context.directory, 'probe.pa.yaml'), yaml);
  await writeFile(join(context.directory, 'private-outcome.txt'), output);
  errata.produced_by = 'Maintainer';
  entry.id = 'typed-card-update';
  Object.assign(entry.claim, { claim_ref: 'augmentation:TypedDataCard.Update',
    claim_text: 'Hypothesis: TypedDataCard accepts the exact Update assignment.',
    target: { kind: 'augmentation-property', control: 'TypedDataCard', property: 'Update', property_type: 'Text', property_value: '="Probe"' },
    ancestors: [{ name: 'ctlParent1', control: 'Form' }], repro: { path: 'probe.pa.yaml', sha256: sha256(yaml) } });
  entry.result.reason = 'Synthetic normalized compiler acceptance.';
  Object.assign(entry.result.evidence, { evidence_class: 'compile_canvas',
    environment: { product: 'Synthetic Studio', version: 'test', tenant_alias: 'Synthetic' },
    falsifier_result: 'unfalsified', falsifier_observation: 'The synthetic exact input was accepted.',
    files: [{ id: 'input', path: 'probe.pa.yaml', sha256: sha256(yaml) }, { id: 'output', path: 'private-outcome.txt', sha256: sha256(output) }],
    compiler: { tool: 'compile_canvas', invocation_ref: 'synthetic-call', outcome: 'accepted', tested_claim_ref: entry.claim.claim_ref,
      input_sha256: sha256(yaml), local_lint_context_sha256: sha256(JSON.stringify(entry.claim.local_lint_context)),
      input_evidence_id: 'input', outcome_evidence_id: 'output', rejection_scope: null } });
  await writeFile(context.errataPath, JSON.stringify(errata));
  return errata;
}

describe('local errata CLI boundary', () => {
  it('records a no-evidence dismissal without manufacturing a tenant result or replacement', async () => {
    const context = await fixture();
    try {
      const errata = JSON.parse(await readFile(context.errataPath, 'utf8'));
      Object.assign(errata.entries[0].result, { outcome: 'dismissed', reason: 'Withdrawn hypothesis; no tenant test.', evidence: {
        evidence_class: 'none', claim_scope: null, environment: null, reproduction: null,
        falsifier_result: 'not-run', falsifier_observation: 'No test was run.', files: [], compiler: null, runtime_test: null,
        completed_tenant_prerequisites: [], datasource_bindings: [],
      } });
      await writeFile(context.errataPath, JSON.stringify(errata));
      const reviewed = await ingestErrata(context);
      expect(reviewed.plan.decisions[0].status).toBe('dismissed');
      expect(reviewed.plan.files).toEqual([]);
    } finally { await rm(context.directory, { recursive: true, force: true }); }
  });

  it.each(['runtime_observation', 'studio-export-2026-09-08', 'documented-consensus'])('retains %s as a scoped observation and applies only its selected document', async evidenceClass => {
    const context = await fixture();
    try {
      const errata = await compilerFixture(context);
      errata.produced_by = 'Synthetic observer';
      const entry = errata.entries[0];
      Object.assign(entry.claim, { claim_ref: 'rule:synthetic-observation', claim_scope: 'player_behaves',
        claim_text: 'Synthetic observation\n## Not a new heading', target: { kind: 'observation', document: 'troubleshooting.md' },
        ancestors: [], repro: null, expected_compile_outcome: 'not-applicable' });
      Object.assign(entry.result.evidence, { evidence_class: evidenceClass, claim_scope: 'player_behaves', compiler: null,
        files: [entry.result.evidence.files[1]] });
      entry.proposed_change = { kind: 'observation', observation_id: 'synthetic-scope' };
      await writeFile(context.errataPath, JSON.stringify(errata));
      const doc = '# Synthetic troubleshooting\n\nExisting prose.\n';
      const documentPath = join(context.rulesRoot, 'troubleshooting.md');
      await writeFile(documentPath, doc);
      const reviewed = await ingestErrata(context);
      expect(reviewed.plan.files.map(file => file.path)).toEqual(['troubleshooting.md']);
      expect(await readFile(documentPath, 'utf8')).toBe(doc);
      const after = Buffer.from(reviewed.plan.files[0].after_base64, 'base64').toString('utf8');
      expect(after.startsWith(doc)).toBe(true);
      expect(after).toContain(`Evidence class: ${evidenceClass}`);
      expect(after).toContain('Scope: player_behaves');
      expect(after).toContain('Falsified if:');
      expect(after).not.toContain('\n## Not a new heading');
      expect(after).not.toContain('Synthetic private compiler outcome');
      expect(after).not.toContain('private-outcome.txt');
      await promisify(execFile)(process.execPath, [script('ingest-errata.mjs'), '--apply-local',
        join(context.outDir, 'edits.json'), '--rules-root', context.rulesRoot], { cwd: tmpdir(), env: { ...process.env, APPFORGE_MAINTAINER: 'Maintainer' } });
      expect(await readFile(documentPath, 'utf8')).toBe(after);
      const replay = await ingestErrata({ ...context, outDir: join(context.directory, 'second-review') });
      expect(replay.plan.files).toEqual([]);
    } finally { await rm(context.directory, { recursive: true, force: true }); }
  });

  it.each(['DatePicker', 'ModernDatePicker'])('keeps the historical disproof scoped to exact %s identity', async control => {
    const context = await fixture();
    try {
      const errata = JSON.parse(await readFile(context.errataPath, 'utf8'));
      Object.assign(errata.entries[0].claim, { claim_ref: `augmentation:${control}.DefaultDate`,
        target: { kind: 'augmentation-property', control, property: 'DefaultDate', property_type: 'Date', property_value: '=Today()' } });
      await writeFile(context.errataPath, JSON.stringify(errata));
      const reviewed = await ingestErrata(context);
      expect(reviewed.plan.decisions[0].status).toBe(control === 'DatePicker' ? 'blocked' : 'pending');
      expect(reviewed.plan.files).toEqual([]);
    } finally { await rm(context.directory, { recursive: true, force: true }); }
  });

  it.each(['source', 'evidence'])('refuses %s drift when applying the named reviewed plan', async kind => {
    const context = await fixture();
    try {
      await compilerFixture(context);
      await ingestErrata({ ...context, maintainer: 'Maintainer', acknowledgeMaintainerEvidence: true });
      const augPath = join(context.rulesRoot, 'catalogs/control-augmentations.yml');
      const before = await readFile(augPath, 'utf8');
      if (kind === 'source') await writeFile(augPath, before + '\n# changed after review\n');
      else await writeFile(join(context.directory, 'private-outcome.txt'), 'Different evidence.\n');
      await expect(promisify(execFile)(process.execPath, [script('ingest-errata.mjs'), '--apply-local',
        join(context.outDir, 'edits.json'), '--rules-root', context.rulesRoot, '--acknowledge-maintainer-evidence'], { cwd: tmpdir(), env: { ...process.env, APPFORGE_MAINTAINER: 'Maintainer' } }))
        .rejects.toMatchObject({ code: 1 });
      expect(await readFile(augPath, 'utf8')).toBe(kind === 'source' ? before + '\n# changed after review\n' : before);
    } finally { await rm(context.directory, { recursive: true, force: true }); }
  });

  it('runs review from another cwd and refuses an existing output without overwriting it', async () => {
    const context = await fixture();
    try {
      const args = [script('ingest-errata.mjs'), context.errataPath, '--rules-root', context.rulesRoot, '--out', context.outDir];
      const reviewed = await promisify(execFile)(process.execPath, args, { cwd: tmpdir(), env: { ...process.env, APPFORGE_MAINTAINER: 'Maintainer' } });
      expect(reviewed.stdout).toContain('1 reviewed decisions and 0 candidate replacement files');
      const before = await readFile(join(context.outDir, 'edits.json'));
      await expect(promisify(execFile)(process.execPath, args, { cwd: tmpdir(), env: { ...process.env, APPFORGE_MAINTAINER: 'Maintainer' } })).rejects.toMatchObject({ code: 1 });
      expect(await readFile(join(context.outDir, 'edits.json'))).toEqual(before);
    } finally { await rm(context.directory, { recursive: true, force: true }); }
  });

  it('ingests compiler evidence, then separately applies and replays the exact local plan through the CLI', async () => {
    const context = await fixture(true);
    try {
      await compilerFixture(context);
      const augPath = join(context.rulesRoot, 'catalogs/control-augmentations.yml');
      const before = await readFile(augPath);
      await expect(ingestErrata(context)).rejects.toMatchObject({ code: 'evidence-required' });
      const reviewed = await ingestErrata({ ...context, maintainer: 'Maintainer', acknowledgeMaintainerEvidence: true });
      expect(reviewed.plan.files.map(file => file.path)).toEqual(['catalogs/control-augmentations.yml']);
      expect(await readFile(augPath)).toEqual(before);
      const summary = await readFile(join(context.outDir, 'ERRATA.md'), 'utf8');
      expect(summary).not.toContain('Synthetic private compiler outcome');
      expect(summary).not.toContain('private-outcome.txt');
      const command = [script('ingest-errata.mjs'), '--apply-local', join(context.outDir, 'edits.json'),
        '--rules-root', context.rulesRoot, '--acknowledge-maintainer-evidence'];
      for (const maintainer of [undefined, 'Another reviewer']) {
        const env = { ...process.env };
        delete env.APPFORGE_MAINTAINER;
        if (maintainer !== undefined) env.APPFORGE_MAINTAINER = maintainer;
        await expect(promisify(execFile)(process.execPath, command, { cwd: tmpdir(), env }))
          .rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('APPFORGE_MAINTAINER') });
        expect(await readFile(augPath)).toEqual(before);
      }
      const applied = await promisify(execFile)(process.execPath, command, { cwd: tmpdir(), env: { ...process.env, APPFORGE_MAINTAINER: 'Maintainer' } });
      expect(JSON.parse(applied.stdout).applied).toEqual(['catalogs/control-augmentations.yml']);
      expect(parseAugmentations(await readFile(augPath, 'utf8')).controls.TypedDataCard.additional_input_properties.Update)
        .toMatchObject({ type: 'Text', verified: true, verified_at: '2026-09-08', verified_by: 'compile_canvas' });
      const replay = await promisify(execFile)(process.execPath, command, { cwd: tmpdir(), env: { ...process.env, APPFORGE_MAINTAINER: 'Maintainer' } });
      expect(JSON.parse(replay.stdout).already_applied).toEqual(['catalogs/control-augmentations.yml']);
      const generated = ['catalog.ts', 'content.ts', 'powerfx.ts'].map(name => resolve(__dirname, '../src/generated', name));
      const originals = await Promise.all(generated.map(path => readFile(path)));
      try {
        const built = await promisify(execFile)(process.execPath, [resolve(__dirname, '../scripts/build-catalog.mjs')], {
          cwd: tmpdir(), env: { ...process.env, APPFORGE_RULES_ROOT: context.rulesRoot },
        });
        expect(built.stderr).toContain('powerfx gate:');
        expect(await readFile(generated[0], 'utf8')).toContain('"verified_at": "2026-09-08"');
      } finally { await Promise.all(generated.map((path, index) => writeFile(path, originals[index]))); }
    } finally { await rm(context.directory, { recursive: true, force: true }); }
  });

  it.each(['duplicate-id', 'unknown-target', 'bad-type', 'path-escape', 'expired-evidence', 'extra-field'])('refuses %s before creating a package', async kind => {
    const context = await fixture();
    try {
      const errata = JSON.parse(await readFile(context.errataPath, 'utf8'));
      const entry = errata.entries[0];
      if (kind === 'duplicate-id') errata.entries.push(structuredClone(entry));
      if (kind === 'unknown-target') { entry.claim.claim_ref = 'augmentation:UnknownProbe.WrapCount'; entry.claim.target.control = 'UnknownProbe'; }
      if (kind === 'bad-type') entry.claim.target.property_type = 'InventedType';
      if (kind === 'path-escape') entry.claim.target = { kind: 'observation', document: '../outside.md' };
      if (kind === 'expired-evidence') entry.result.evidence.evidence_class = 'studio-observation';
      if (kind === 'extra-field') errata.analyzerArtifactPath = 'untrusted.mjs';
      await writeFile(context.errataPath, JSON.stringify(errata));
      await expect(ingestErrata(context)).rejects.toThrow();
      await expect(readFile(join(context.outDir, 'edits.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    } finally { await rm(context.directory, { recursive: true, force: true }); }
  });
  it('offers help without source files or a remote boundary', async () => {
    const { stdout, stderr } = await promisify(execFile)(process.execPath, [script('ingest-errata.mjs'), '--help'], { cwd: tmpdir(), env: { ...process.env, APPFORGE_MAINTAINER: 'Maintainer' } });
    expect(stdout).toContain('--apply-local');
    expect(stdout).toContain('operator assertion');
    expect(stderr).toBe('');
  });

  it('keeps apply distinct and rejects remote, artifact and mixed modes', () => {
    expect(parseErrataArgs(['--apply-local', 'edits.json', '--rules-root', 'rules', '--acknowledge-maintainer-evidence'])).toEqual({
      mode: 'apply', planPath: resolve('edits.json'), rulesRoot: resolve('rules'), acknowledgeMaintainerEvidence: true });
    expect(parseErrataArgs(['--help'])).toEqual({ mode: 'help' });
    for (const args of [[], ['claims.json'], ['--apply-local', 'edits.json', '--rules-root', 'rules', '--out', 'review'],
      ['claims.json', '--apply-local', 'edits.json', '--rules-root', 'rules'],
      ['claims.json', '--rules-root', 'rules', '--out', 'review', '--stamp-remote'],
      ['claims.json', '--rules-root', 'rules', '--out', 'review', '--analyzer-artifact', 'other.mjs'],
      ['claims.json', '--rules-root', 'rules', '--out', 'review', '--acknowledge-maintainer-evidence', '--acknowledge-maintainer-evidence'],
      ['claims.json', '--rules-root', 'rules', '--out', 'review', '--help'],
    ]) expect(() => parseErrataArgs(args)).toThrow();
  });
  it('writes a pending review proposal through the shared gate without changing source bytes', async () => {
    const context = await fixture();
    try {
      const before = await readFile(join(context.rulesRoot, 'catalogs/control-augmentations.yml'));
      await ingestErrata(context);
      const plan = JSON.parse(await readFile(join(context.outDir, 'edits.json'), 'utf8'));
      expect(plan.decisions).toEqual([expect.objectContaining({ id: 'wrap-count-hypothesis', status: 'pending' })]);
      expect(plan.files).toEqual([]);
      expect(await readFile(join(context.rulesRoot, 'catalogs/control-augmentations.yml'))).toEqual(before);
      expect(await readFile(join(context.outDir, 'ERRATA.md'), 'utf8')).toContain('pending');
    } finally { await rm(context.directory, { recursive: true, force: true }); }
  });
  it('selects review with explicit source and fresh package paths', () => {
    expect(parseErrataArgs(['claims.json', '--rules-root', 'rules', '--out', 'review'])).toEqual({
      mode: 'review', errataPath: resolve('claims.json'), rulesRoot: resolve('rules'), outDir: resolve('review'),
      acknowledgeMaintainerEvidence: false,
    });
  });
});
