import { verificationFixture } from './helpers/verification-fixture';
import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sha256 } from '../scripts/lib/verification-contracts.mjs';
import { evaluateVerificationEvidence } from '../scripts/lib/verification-evidence.mjs';

const { artifact } = verificationFixture();
const yaml = 'Screens:\n  VerificationScreen:\n    Children:\n      - ctlProbe:\n          Control: Gallery\n          Properties:\n            WrapCount: =1\n';

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'verification-evidence-'));
  await writeFile(join(directory, 'probe.pa.yaml'), yaml);
  const outcome = '{"fixture":"accepted"}\n';
  await writeFile(join(directory, 'outcome.json'), outcome);
  const claim = {
    claim_ref: 'augmentation:Gallery.WrapCount', claim_scope: 'compiler_accepts',
    claim_text: 'The compiler accepts this exact Gallery.WrapCount assignment.',
    falsifier: { description: 'Compile the exact probe.', unfalsified_if: 'Accepted.', falsified_if: 'The target property is rejected.' },
    prerequisites: [{ id: 'isolated-app', phase: 'tenant', description: 'Use an isolated test app.' }],
    expected_compile_outcome: 'accept',
    target: { kind: 'augmentation-property', control: 'Gallery', property: 'WrapCount', property_type: 'Number', property_value: '=1' },
    reproduction: 'Compile this exact probe.', local_lint_context: { datasources: {} }, ancestors: [],
    repro: { path: 'probe.pa.yaml', sha256: sha256(yaml) },
  };
  const result = { outcome: 'verified', reason: 'The targeted compiler input was accepted.', evidence: {
    evidence_class: 'compile_canvas', claim_scope: 'compiler_accepts',
    environment: { product: 'Synthetic Studio fixture', version: 'test', tenant_alias: 'Synthetic' },
    reproduction: 'Compile this exact probe.', falsifier_result: 'unfalsified', falsifier_observation: 'The fixture input was accepted.',
    files: [{ id: 'input', path: 'probe.pa.yaml', sha256: sha256(yaml) }, { id: 'output', path: 'outcome.json', sha256: sha256(outcome) }],
    compiler: { tool: 'compile_canvas', invocation_ref: 'synthetic-test', outcome: 'accepted', tested_claim_ref: claim.claim_ref,
      input_sha256: sha256(yaml), local_lint_context_sha256: sha256(JSON.stringify(claim.local_lint_context)),
      input_evidence_id: 'input', outcome_evidence_id: 'output', rejection_scope: null },
    runtime_test: null, completed_tenant_prerequisites: ['isolated-app'], datasource_bindings: [],
  } };
  return { directory, options: { claim, result, producedBy: 'Maintainer', reproBaseDir: directory, evidenceBaseDir: directory,
    maintainer: 'Maintainer', acknowledgeMaintainerEvidence: true, analyzerArtifactPath: artifact, analyzerArtifactSha256: sha256(await readFile(artifact)) } };
}

type FixtureOptions = Awaited<ReturnType<typeof fixture>>['options'];

async function replaceProbe(directory: string, options: FixtureOptions, text: string) {
  await writeFile(join(directory, 'probe.pa.yaml'), text);
  options.claim.repro.sha256 = sha256(text);
  options.result.evidence.files[0].sha256 = sha256(text);
  options.result.evidence.compiler.input_sha256 = sha256(text);
  options.result.evidence.compiler.tested_claim_ref = options.claim.claim_ref;
  options.result.evidence.compiler.local_lint_context_sha256 = sha256(JSON.stringify(options.claim.local_lint_context));
}

describe('one evidence gate for campaign results and errata', () => {
  it.each([undefined, '', ' \t '])('requires a configured maintainer for catalog changes (%j)', async maintainer => {
    const { directory, options } = await fixture();
    try {
      await expect(evaluateVerificationEvidence({ ...options, maintainer })).rejects.toMatchObject({
        code: 'evidence-required', message: expect.stringContaining('APPFORGE_MAINTAINER'),
      });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it('rejects produced_by that differs from the configured maintainer despite acknowledgement', async () => {
    const { directory, options } = await fixture();
    try {
      await expect(evaluateVerificationEvidence({ ...options, producedBy: 'Another reviewer' })).rejects.toMatchObject({
        code: 'evidence-required', message: expect.stringContaining('APPFORGE_MAINTAINER'),
      });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it('uses the configured name rather than a built-in marker', async () => {
    const { directory, options } = await fixture();
    try {
      await expect(evaluateVerificationEvidence({ ...options, producedBy: 'Project reviewer', maintainer: 'Project reviewer' }))
        .resolves.toMatchObject({ status: 'eligible', permission: 'promote-property' });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it.each(['studio-export-2026-09-08', 'documented-consensus'])('keeps %s property evidence as a review proposal', async evidenceClass => {
    const { directory, options } = await fixture();
    try {
      Object.assign(options.result.evidence, { evidence_class: evidenceClass, compiler: null });
      await expect(evaluateVerificationEvidence(options)).resolves.toMatchObject({ status: 'review-required' });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it('allows an honest no-evidence dismissal without a synthetic tenant environment', async () => {
    const { directory, options } = await fixture();
    try {
      Object.assign(options.result, { outcome: 'dismissed', evidence: { evidence_class: 'none', claim_scope: null,
        environment: null, reproduction: null, falsifier_result: 'not-run', falsifier_observation: 'No tenant test was performed.',
        files: [], compiler: null, runtime_test: null, completed_tenant_prerequisites: [], datasource_bindings: [] } });
      options.producedBy = 'Reviewer';
      options.acknowledgeMaintainerEvidence = false;
      await expect(evaluateVerificationEvidence(options)).resolves.toMatchObject({ status: 'eligible', permission: 'dismiss' });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it.each(['missing.json', '.', 'https://example.invalid/evidence', 'outcome.json:alternate'])('refuses non-regular/local evidence path %s', async path => {
    const { directory, options } = await fixture();
    try {
      options.result.evidence.files[1].path = path;
      await expect(evaluateVerificationEvidence(options)).rejects.toThrow();
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it('rejects a SQL runtime assertion attached to a different document claim', async () => {
    const { directory, options } = await fixture();
    try {
      Object.assign(options.claim, { claim_ref: 'rule:synthetic-observation', claim_scope: 'player_behaves',
        target: { kind: 'observation', document: 'troubleshooting.md' }, expected_compile_outcome: 'not-applicable', repro: null });
      Object.assign(options.result.evidence, { evidence_class: 'runtime_observation', claim_scope: 'player_behaves', compiler: null,
        runtime_test: { kind: 'sql-isblank-delegation', connector: 'sql', nondelegation_limit: 500, controlled_rows: 501,
          qualifying_rows_beyond_limit: 1, expected_full_result: 'Two rows.', observed_result: 'One row.',
          monitor: { available: false, evidence_ids: [], note: 'Unavailable in this fixture.' } } });
      await expect(evaluateVerificationEvidence(options)).rejects.toMatchObject({ code: 'evidence-mismatch' });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it('records a structured runtime document observation without promoting a catalog property', async () => {
    const { directory, options } = await fixture();
    try {
      Object.assign(options.claim, { claim_ref: 'rule:synthetic-observation', claim_scope: 'player_behaves',
        target: { kind: 'observation', document: 'troubleshooting.md' }, expected_compile_outcome: 'not-applicable', repro: null });
      Object.assign(options.result.evidence, { evidence_class: 'runtime_observation', claim_scope: 'player_behaves', compiler: null });
      await expect(evaluateVerificationEvidence(options)).resolves.toMatchObject({ status: 'eligible', permission: 'append-observation' });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it('leaves runtime-only property evidence and unverified hypotheses as review proposals', async () => {
    const { directory, options } = await fixture();
    try {
      options.claim.claim_scope = 'player_behaves';
      Object.assign(options.result.evidence, { evidence_class: 'runtime_observation', claim_scope: 'player_behaves', compiler: null });
      await expect(evaluateVerificationEvidence(options)).resolves.toMatchObject({ status: 'review-required' });
      Object.assign(options.result.evidence, { evidence_class: 'unverified', environment: null,
        falsifier_result: 'not-run', files: [], completed_tenant_prerequisites: [] });
      await expect(evaluateVerificationEvidence(options)).resolves.toMatchObject({ status: 'pending' });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it('keeps accepted dump-property compilation subject to the separate catalog-tier review', async () => {
    const { directory, options } = await fixture();
    try {
      Object.assign(options.claim, { claim_ref: 'dump-property:Circle.Height',
        target: { kind: 'dump-property', control: 'Circle', property: 'Height', property_value: '=64' } });
      await replaceProbe(directory, options, yaml.replace('Gallery', 'Circle').replace('WrapCount: =1', 'Height: =64'));
      await expect(evaluateVerificationEvidence(options)).resolves.toMatchObject({ status: 'review-required' });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it('separates SQL compiler acceptance from a controlled player falsifier result', async () => {
    const { directory, options } = await fixture();
    try {
      Object.assign(options.claim, { claim_ref: 'rule:delegation-sql-isblank', claim_scope: 'player_behaves',
        target: { kind: 'sql-isblank', control: 'Gallery', property: 'Items', datasource: 'VerificationRows', property_value: '=Filter(VerificationRows, IsBlank(ProbeText))' },
        local_lint_context: { datasources: { VerificationRows: 'sql' } } });
      Object.assign(options.result.evidence, { datasource_bindings: [{ authored_name: 'VerificationRows', connector: 'sql', evidence_id: 'output' }] });
      await replaceProbe(directory, options, yaml.replace('WrapCount: =1', 'Items: =Filter(VerificationRows, IsBlank(ProbeText))'));
      await expect(evaluateVerificationEvidence(options)).resolves.toMatchObject({ status: 'compiler-subclaim-only' });
      Object.assign(options.result.evidence, { evidence_class: 'runtime_observation', claim_scope: 'player_behaves', compiler: null,
        runtime_test: { kind: 'sql-isblank-delegation', connector: 'sql', nondelegation_limit: 500,
          controlled_rows: 501, qualifying_rows_beyond_limit: 1, expected_full_result: 'Two controlled qualifying rows.',
          observed_result: 'Only the qualifying row inside the window was returned.',
          monitor: { available: false, evidence_ids: [], note: 'Monitor was unavailable in this synthetic fixture.' } } });
      await expect(evaluateVerificationEvidence(options)).resolves.toMatchObject({ status: 'eligible', permission: 'record-runtime-claim' });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it.each<[string, (options: FixtureOptions) => void, string]>([
    ['missing acknowledgement', options => { options.acknowledgeMaintainerEvidence = false; }, 'evidence-required'],
    ['wrong operator marker', options => { options.producedBy = 'maintainer'; }, 'evidence-required'],
    ['missing prerequisite', options => { options.result.evidence.completed_tenant_prerequisites = []; }, 'evidence-mismatch'],
    ['wrong claim binding', options => { options.result.evidence.compiler.tested_claim_ref = 'augmentation:Gallery.OnSelect'; }, 'evidence-mismatch'],
    ['wrong lint context digest', options => { options.result.evidence.compiler.local_lint_context_sha256 = '0'.repeat(64); }, 'evidence-mismatch'],
    ['accepted compiler with disproven acceptance claim', options => { options.result.outcome = 'disproven'; options.result.evidence.falsifier_result = 'falsified'; }, 'evidence-mismatch'],
  ])('refuses %s', async (_label, change, code) => {
    const { directory, options } = await fixture();
    try {
      change(options);
      await expect(evaluateVerificationEvidence(options)).rejects.toMatchObject({ code });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it('permits only attributable compiler rejection to authorize exact property removal', async () => {
    const { directory, options } = await fixture();
    try {
      options.result.outcome = 'disproven';
      options.result.evidence.falsifier_result = 'falsified';
      options.result.evidence.compiler.outcome = 'rejected';
      Object.assign(options.result.evidence.compiler, { rejection_scope: 'tested-claim' });
      await expect(evaluateVerificationEvidence(options)).resolves.toMatchObject({ status: 'eligible', permission: 'remove-property' });
      for (const scope of ['setup', 'transport', 'unrelated']) {
        Object.assign(options.result.evidence.compiler, { rejection_scope: scope });
        await expect(evaluateVerificationEvidence(options)).resolves.toMatchObject({ status: 'pending' });
      }
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it('keeps a locally refused probe pending despite a normalized accepted compiler result', async () => {
    const { directory, options } = await fixture();
    try {
      await replaceProbe(directory, options, `${yaml}            UnreviewedUnknownProperty: =1\n`);
      await expect(evaluateVerificationEvidence(options)).resolves.toMatchObject({ status: 'pending' });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it('does not record a transport failure as an established document observation', async () => {
    const { directory, options } = await fixture();
    try {
      Object.assign(options.claim, { claim_ref: 'rule:synthetic-observation',
        target: { kind: 'observation', document: 'troubleshooting.md' } });
      options.result.outcome = 'disproven';
      options.result.evidence.falsifier_result = 'falsified';
      Object.assign(options.result.evidence.compiler, { tested_claim_ref: options.claim.claim_ref,
        outcome: 'transport-error', rejection_scope: 'transport' });
      await expect(evaluateVerificationEvidence(options)).resolves.toMatchObject({ status: 'pending' });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it('permits a matching accepted compiler result with explicit maintainer acknowledgement', async () => {
    const { directory, options } = await fixture();
    try {
      await expect(evaluateVerificationEvidence(options)).resolves.toMatchObject({ status: 'eligible', permission: 'promote-property' });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it('requires exact file hashes before evidence can authorize a property promotion', async () => {
    const { directory, options } = await fixture();
    try {
      await writeFile(join(directory, 'outcome.json'), 'changed bytes');
      await expect(evaluateVerificationEvidence(options)).rejects.toMatchObject({ code: 'evidence-mismatch' });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
