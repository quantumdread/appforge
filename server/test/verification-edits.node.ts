import { verificationFixture } from './helpers/verification-fixture';
import { afterEach, describe, expect, it } from 'vitest';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyVerificationEdits, planVerificationEdits, readVerificationSources, verifyAppliedVerificationEdits, writeVerificationPackage } from '../scripts/lib/verification-edits.mjs';
import { parseAugmentations } from '../scripts/lib/augmentation-catalog.mjs';

const { rules: RULES_ROOT, artifact: ARTIFACT } = verificationFixture();
const DISPROOF_COUNT = JSON.parse(readFileSync(join(RULES_ROOT, 'disproofs.index.json'), 'utf8')).entries.length;
const SOURCE_PATHS = [
  'catalogs/control-augmentations.yml', 'catalogs/control-manifest.yml',
  'catalogs/control-properties.yml', 'disproofs.index.json', 'disproofs.md',
];

const temporaryDirectories: string[] = [];
function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), 'appforge-verification-edits-'));
  temporaryDirectories.push(directory);
  return directory;
}
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function copiedRules() {
  const directory = temporaryDirectory();
  mkdirSync(join(directory, 'catalogs'));
  for (const path of SOURCE_PATHS) copyFileSync(join(RULES_ROOT, path), join(directory, path));
  return directory;
}

async function promotionFixture() {
  const rulesRoot = copiedRules();
  const directory = temporaryDirectory();
  const yaml = 'Screens:\n  VerificationScreen:\n    Children:\n      - ctlParent1:\n          Control: Form\n          Children:\n            - ctlProbe:\n                Control: TypedDataCard\n                Variant: TextualEdit\n                Properties:\n                  Update: ="probe"\n';
  const outcome = '{"fixture":"accepted"}\n';
  const digest = (value: string) => createHash('sha256').update(value).digest('hex');
  writeFileSync(join(directory, 'probe.pa.yaml'), yaml);
  writeFileSync(join(directory, 'outcome.json'), outcome);
  const claim = {
    claim_ref: 'augmentation:TypedDataCard.Update', claim_scope: 'compiler_accepts',
    claim_text: 'The compiler accepts the exact TypedDataCard.Update assignment.',
    falsifier: { description: 'Compile the isolated probe.', unfalsified_if: 'The exact input is accepted.', falsified_if: 'The exact property is rejected.' },
    prerequisites: [{ id: 'isolated-app', phase: 'tenant', description: 'Use an isolated synthetic test app.' }],
    expected_compile_outcome: 'accept',
    target: { kind: 'augmentation-property', control: 'TypedDataCard', property: 'Update', property_type: 'Text', property_value: '="probe"' },
    reproduction: 'Compile the exact reviewed probe.', local_lint_context: { datasources: {} },
    ancestors: [{ name: 'ctlParent1', control: 'Form' }], repro: { path: 'probe.pa.yaml', sha256: digest(yaml) },
  };
  const result = { outcome: 'verified', reason: 'Synthetic accepted compiler fixture.', evidence: {
    evidence_class: 'compile_canvas', claim_scope: 'compiler_accepts',
    environment: { product: 'Synthetic Studio fixture', version: 'test', tenant_alias: 'Synthetic' },
    reproduction: claim.reproduction, falsifier_result: 'unfalsified', falsifier_observation: 'The synthetic input was accepted.',
    files: [{ id: 'input', path: 'probe.pa.yaml', sha256: digest(yaml) }, { id: 'output', path: 'outcome.json', sha256: digest(outcome) }],
    compiler: { tool: 'compile_canvas', invocation_ref: 'synthetic-accepted', outcome: 'accepted', tested_claim_ref: claim.claim_ref,
      input_sha256: digest(yaml), local_lint_context_sha256: digest(JSON.stringify(claim.local_lint_context)),
      input_evidence_id: 'input', outcome_evidence_id: 'output', rejection_scope: null },
    runtime_test: null, completed_tenant_prerequisites: ['isolated-app'], datasource_bindings: [],
  } };
  const sources = await readVerificationSources({ rulesRoot, analyzerArtifactPath: ARTIFACT });
  return { rulesRoot, directory, sources, request: { id: 'promote-card-update', claim, result,
    action: { kind: 'property', operation: 'add-or-promote' } } };
}

async function plannedFixture(remove = false) {
  const fixture = await promotionFixture();
  if (remove) {
    fixture.request.action.operation = 'remove';
    fixture.request.result.outcome = 'disproven';
    fixture.request.result.evidence.falsifier_result = 'falsified';
    Object.assign(fixture.request.result.evidence.compiler, { outcome: 'rejected', rejection_scope: 'tested-claim' });
    const outcome = '{"fixture":"rejected"}\n';
    writeFileSync(join(fixture.directory, 'outcome.json'), outcome);
    fixture.request.result.evidence.files[1].sha256 = createHash('sha256').update(outcome).digest('hex');
  }
  const { plan } = await planVerificationEdits({ sources: fixture.sources, requests: [fixture.request], producedBy: 'Maintainer', date: '2026-09-08',
    evidenceBaseDir: fixture.directory, reproBaseDir: fixture.directory, maintainer: 'Maintainer', acknowledgeMaintainerEvidence: true });
  return { ...fixture, plan, options: { plan, rulesRoot: fixture.rulesRoot, analyzerArtifactPath: ARTIFACT, maintainer: 'Maintainer', acknowledgeMaintainerEvidence: true } };
}

async function widthFixture() {
  const fixture = await promotionFixture();
  const request = fixture.request;
  request.id = 'add-card-width';
  request.claim.claim_ref = 'augmentation:TypedDataCard.Width';
  request.claim.claim_text = 'The compiler accepts the exact TypedDataCard.Width assignment.';
  Object.assign(request.claim.target, { property: 'Width', property_type: 'Number', property_value: '=100' });
  const yaml = readFileSync(join(fixture.directory, 'probe.pa.yaml'), 'utf8').replace('Update: ="probe"', 'Width: =100');
  writeFileSync(join(fixture.directory, 'probe.pa.yaml'), yaml);
  const digest = createHash('sha256').update(yaml).digest('hex');
  request.claim.repro.sha256 = digest;
  request.result.evidence.files[0].sha256 = digest;
  Object.assign(request.result.evidence.compiler, { input_sha256: digest, tested_claim_ref: request.claim.claim_ref });
  return fixture;
}

async function observationFixture(document = '# Synthetic observations\n') {
  const fixture = await promotionFixture();
  writeFileSync(join(fixture.rulesRoot, 'troubleshooting.md'), document);
  const sources = await readVerificationSources({ rulesRoot: fixture.rulesRoot, analyzerArtifactPath: ARTIFACT, documents: ['troubleshooting.md'] });
  const request = { id: 'observe-example', action: { kind: 'observation', observation_id: 'scope-example' },
    claim: { ...fixture.request.claim, claim_ref: 'rule:synthetic-observation', target: { kind: 'observation', document: 'troubleshooting.md' },
      claim_scope: 'player_behaves', ancestors: [], repro: null, expected_compile_outcome: 'not-applicable' },
    result: { ...fixture.request.result, evidence: { ...fixture.request.result.evidence, claim_scope: 'player_behaves',
      evidence_class: 'runtime_observation', compiler: null, files: [fixture.request.result.evidence.files[1]] } } };
  return { ...fixture, sources, request, planning: { sources, requests: [request], producedBy: 'Synthetic reviewer', date: '2026-09-08',
    evidenceBaseDir: fixture.directory, reproBaseDir: fixture.directory, maintainer: 'Maintainer', acknowledgeMaintainerEvidence: false } };
}

describe('reviewed verification edit application', () => {
  it.each(['planning', 'apply', 'replay'])('rechecks evidence on a disproof-blocked request during mixed-plan %s', async mode => {
    const fixture = await promotionFixture();
    const blockedPath = join(fixture.directory, 'blocked-reference.txt');
    const blockedText = 'Synthetic blocked-claim reference.';
    writeFileSync(blockedPath, blockedText);
    const blocked = { id: 'blocked-datepicker', action: { kind: 'property', operation: 'add-or-promote' },
      claim: { ...fixture.request.claim, claim_ref: 'augmentation:DatePicker.DefaultDate',
        target: { kind: 'augmentation-property', control: 'DatePicker', property: 'DefaultDate', property_type: 'Date', property_value: '=Today()' }, ancestors: [], repro: null },
      result: { outcome: 'verified', reason: 'A synthetic unverified hypothesis remains blocked.', evidence: { ...fixture.request.result.evidence,
        evidence_class: 'unverified', environment: null, compiler: null, completed_tenant_prerequisites: [],
        files: [{ id: 'blocked-reference', path: 'blocked-reference.txt', sha256: createHash('sha256').update(blockedText).digest('hex') }],
        falsifier_result: 'not-run', falsifier_observation: 'No tenant test was run.' } } };
    const planning = { sources: fixture.sources, requests: [blocked, fixture.request], producedBy: 'Maintainer', date: '2026-09-08',
      evidenceBaseDir: fixture.directory, reproBaseDir: fixture.directory, maintainer: 'Maintainer', acknowledgeMaintainerEvidence: true };
    if (mode === 'planning') {
      writeFileSync(blockedPath, 'Changed blocked-claim reference.');
      await expect(planVerificationEdits(planning).then(() => 'unexpected success')).rejects.toMatchObject({ code: 'evidence-mismatch' });
      return;
    }
    const { plan } = await planVerificationEdits(planning);
    expect(plan.decisions.map(decision => decision.status)).toEqual(['blocked', 'eligible']);
    const options = { plan, rulesRoot: fixture.rulesRoot, analyzerArtifactPath: ARTIFACT, maintainer: 'Maintainer', acknowledgeMaintainerEvidence: true };
    if (mode === 'replay') await applyVerificationEdits(options);
    const before = readFileSync(join(fixture.rulesRoot, 'catalogs/control-augmentations.yml'));
    writeFileSync(blockedPath, 'Changed blocked-claim reference.');
    await expect(applyVerificationEdits(options).then(() => 'unexpected success')).rejects.toMatchObject({ code: 'evidence-mismatch' });
    if (mode === 'replay') await expect(verifyAppliedVerificationEdits(options).then(() => 'unexpected success')).rejects.toMatchObject({ code: 'evidence-mismatch' });
    expect(readFileSync(join(fixture.rulesRoot, 'catalogs/control-augmentations.yml'))).toEqual(before);
  });

  it.each(['replacement bytes', 'decision', 'guard drift', 'target drift', 'evidence drift', 'missing acknowledgement', 'different root'])(
    'refuses %s before the first local replacement', async variant => {
      const fixture = await plannedFixture();
      const options = { ...fixture.options, plan: structuredClone(fixture.plan) };
      const target = join(fixture.rulesRoot, 'catalogs/control-augmentations.yml');
      if (variant === 'replacement bytes') {
        const changed = Buffer.concat([Buffer.from(options.plan.files[0].after_base64, 'base64'), Buffer.from('\n# unreviewed replacement\n')]);
        options.plan.files[0].after_base64 = changed.toString('base64');
        options.plan.files[0].after_sha256 = createHash('sha256').update(changed).digest('hex');
      }
      if (variant === 'decision') options.plan.decisions[0].reason = 'An invented reason.';
      if (variant === 'guard drift') {
        const guard = join(fixture.rulesRoot, 'catalogs/control-manifest.yml');
        writeFileSync(guard, readFileSync(guard, 'utf8') + '\n# changed guard\n');
      }
      if (variant === 'target drift') writeFileSync(target, readFileSync(target, 'utf8') + '\n# changed target\n');
      if (variant === 'evidence drift') writeFileSync(join(fixture.directory, 'outcome.json'), 'changed evidence');
      if (variant === 'missing acknowledgement') options.acknowledgeMaintainerEvidence = false;
      if (variant === 'different root') options.rulesRoot = copiedRules();
      const before = readFileSync(target);
      await expect(applyVerificationEdits(options)).rejects.toMatchObject({ code: {
        'replacement bytes': 'invalid-plan', decision: 'invalid-plan', 'guard drift': 'source-drift', 'target drift': 'source-drift',
        'evidence drift': 'evidence-mismatch', 'missing acknowledgement': 'evidence-required', 'different root': 'source-drift',
      }[variant] });
      expect(readFileSync(target)).toEqual(before);
      expect(readdirSync(join(fixture.rulesRoot, 'catalogs')).some(name => name.endsWith('.tmp'))).toBe(false);
    },
  );

  it('does not import an executable path supplied only by a reviewed plan', async () => {
    const fixture = await plannedFixture();
    const marker = join(fixture.directory, 'executed.txt');
    const malicious = join(fixture.directory, 'untrusted-artifact.mjs');
    const script = `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'executed'); export const loadCatalog = () => ({});`;
    writeFileSync(malicious, script);
    fixture.plan.analyzer_artifact = { path: malicious, sha256: createHash('sha256').update(script).digest('hex') };
    await expect(applyVerificationEdits(fixture.options)).rejects.toMatchObject({ code: 'source-drift' });
    await expect(verifyAppliedVerificationEdits(fixture.options)).rejects.toMatchObject({ code: 'source-drift' });
    expect(existsSync(marker)).toBe(false);
  });

  it('requires all reviewed targets to be applied for read-only verification and rechecks evidence on replay', async () => {
    const fixture = await plannedFixture();
    await expect(verifyAppliedVerificationEdits(fixture.options).then(() => 'unexpected success')).rejects.toMatchObject({ code: 'source-drift' });
    await applyVerificationEdits(fixture.options);
    const target = join(fixture.rulesRoot, 'catalogs/control-augmentations.yml');
    const before = statSync(target, { bigint: true }).mtimeNs;
    writeFileSync(join(fixture.directory, 'outcome.json'), 'altered evidence after application');
    await expect(applyVerificationEdits(fixture.options)).rejects.toMatchObject({ code: 'evidence-mismatch' });
    await expect(verifyAppliedVerificationEdits(fixture.options)).rejects.toMatchObject({ code: 'evidence-mismatch' });
    expect(statSync(target, { bigint: true }).mtimeNs).toBe(before);
  });

  it.each([[], [0], [0, 1], [0, 1, 2], [1], [2]].map(indices => [indices]))('resumes a coordinated removal with target indices %j already applied', async indices => {
    const fixture = await plannedFixture(true);
    expect(fixture.plan.files).toHaveLength(3);
    for (const index of indices) {
      const file = fixture.plan.files[index];
      writeFileSync(join(fixture.rulesRoot, file.path), Buffer.from(file.after_base64, 'base64'));
    }
    const report = await applyVerificationEdits(fixture.options);
    expect(report).toEqual({ status: 'complete',
      applied: fixture.plan.files.filter((_file, index) => !indices.includes(index)).map(file => file.path),
      already_applied: fixture.plan.files.filter((_file, index) => indices.includes(index)).map(file => file.path), remaining: [] });
    expect((await verifyAppliedVerificationEdits(fixture.options)).sources.disproofIndex.entries).toHaveLength(DISPROOF_COUNT);
    expect(JSON.parse(readFileSync(join(fixture.rulesRoot, 'disproofs.index.json'), 'utf8')).entries).toHaveLength(DISPROOF_COUNT + 2);
  });

  it('reports a real later Windows replacement denial and resumes the exact partial state', async ({ skip }) => {
    if (process.platform !== 'win32') return skip();
    const fixture = await plannedFixture(true);
    const denied = join(fixture.rulesRoot, 'disproofs.index.json');
    chmodSync(denied, 0o444);
    try {
      await expect(applyVerificationEdits(fixture.options)).rejects.toMatchObject({ code: 'partial-apply', report: {
        status: 'partial', applied: ['catalogs/control-augmentations.yml'], already_applied: [], remaining: ['disproofs.index.json', 'disproofs.md'],
      } });
    } finally { chmodSync(denied, 0o666); }
    expect((await applyVerificationEdits(fixture.options))).toEqual({ status: 'complete', applied: ['disproofs.index.json', 'disproofs.md'],
      already_applied: ['catalogs/control-augmentations.yml'], remaining: [] });
    expect(readdirSync(fixture.rulesRoot).some(name => name.endsWith('.tmp'))).toBe(false);
  });

  it('refuses a replaced source directory junction during reviewed application', async ({ skip }) => {
    const fixture = await plannedFixture();
    const moved = join(temporaryDirectory(), 'catalogs');
    renameSync(join(fixture.rulesRoot, 'catalogs'), moved);
    try { symlinkSync(moved, join(fixture.rulesRoot, 'catalogs'), process.platform === 'win32' ? 'junction' : 'dir'); }
    catch (error) {
      if (['EPERM', 'EACCES', 'ENOTSUP'].includes((error as NodeJS.ErrnoException).code ?? '')) return skip();
      throw error;
    }
    await expect(applyVerificationEdits(fixture.options)).rejects.toMatchObject({ code: 'path-boundary' });
    expect(readFileSync(join(moved, 'control-augmentations.yml'))).toEqual(fixture.sources.files.get('catalogs/control-augmentations.yml').bytes);
  });

  it('applies only reconstructed reviewed bytes and verifies exact replay without rewriting', async () => {
    const fixture = await promotionFixture();
    const { plan } = await planVerificationEdits({ sources: fixture.sources, requests: [fixture.request], producedBy: 'Maintainer', date: '2026-09-08',
      evidenceBaseDir: fixture.directory, reproBaseDir: fixture.directory, maintainer: 'Maintainer', acknowledgeMaintainerEvidence: true });
    const options = { plan, rulesRoot: fixture.rulesRoot, analyzerArtifactPath: ARTIFACT, maintainer: 'Maintainer', acknowledgeMaintainerEvidence: true };
    expect(await applyVerificationEdits(options)).toEqual({ status: 'complete', applied: ['catalogs/control-augmentations.yml'], already_applied: [], remaining: [] });
    expect(readFileSync(join(fixture.rulesRoot, plan.files[0].path))).toEqual(Buffer.from(plan.files[0].after_base64, 'base64'));
    const verification = await verifyAppliedVerificationEdits(options);
    expect(verification.report).toEqual({ status: 'complete', applied: [], already_applied: ['catalogs/control-augmentations.yml'], remaining: [] });
    expect(verification.decisions).toEqual(plan.decisions);
    expect(verification.sources.files.get(plan.files[0].path).bytes).toEqual(Buffer.from(plan.files[0].before_base64, 'base64'));
    expect(await applyVerificationEdits(options)).toEqual(verification.report);
    expect(readdirSync(join(fixture.rulesRoot, 'catalogs')).sort()).toEqual(['control-augmentations.yml', 'control-manifest.yml', 'control-properties.yml']);
  });
});

describe('verification edit planning', () => {
  it.each(['add-or-promote', 'remove'].flatMap(operation => ['Width: Number # trailing comment', 'Width:'].map(record => [operation, record])))
    ('returns a typed refusal for a locator hit omitted by the historical parser during %s: %s', async (operation, record) => {
      const fixture = await widthFixture();
      const path = join(fixture.rulesRoot, 'catalogs/control-augmentations.yml');
      const text = readFileSync(path, 'utf8').replace(/^(      MaxLength: Number)$/mu, `$1\n      ${record}`);
      writeFileSync(path, text);
      // Width is a known analyzer property but not an existing overlay entry;
      // these ignored lines therefore still pass actual artifact compatibility.
      fixture.sources = await readVerificationSources({ rulesRoot: fixture.rulesRoot, analyzerArtifactPath: ARTIFACT });
      expect(fixture.sources.augmentations.controls.TypedDataCard.additional_input_properties.Width).toBeUndefined();
      fixture.request.action.operation = operation;
      if (operation === 'remove') {
        fixture.request.result.outcome = 'disproven';
        fixture.request.result.evidence.falsifier_result = 'falsified';
        Object.assign(fixture.request.result.evidence.compiler, { outcome: 'rejected', rejection_scope: 'tested-claim' });
        const outcome = '{"fixture":"rejected","property":"TypedDataCard.Width"}\n';
        writeFileSync(join(fixture.directory, 'outcome.json'), outcome);
        fixture.request.result.evidence.files[1].sha256 = createHash('sha256').update(outcome).digest('hex');
      }
      await expect(planVerificationEdits({ sources: fixture.sources, requests: [fixture.request], producedBy: 'Maintainer', date: '2026-09-08',
        evidenceBaseDir: fixture.directory, reproBaseDir: fixture.directory, maintainer: 'Maintainer', acknowledgeMaintainerEvidence: true }))
        .rejects.toMatchObject({ name: 'VerificationEditError', code: 'unsupported-shape' });
      expect(readFileSync(path, 'utf8')).toBe(text);
    });

  it.each(['Update: Text # trailing comment', 'Update:'])('detects source drift first when replacing an existing overlay with %s', async record => {
    const fixture = await promotionFixture();
    const path = join(fixture.rulesRoot, 'catalogs/control-augmentations.yml');
    writeFileSync(path, readFileSync(path, 'utf8').replace(/^      Update:.*$/mu, `      ${record}`));
    await expect(readVerificationSources({ rulesRoot: fixture.rulesRoot, analyzerArtifactPath: ARTIFACT }).then(() => 'unexpected success'))
      .rejects.toMatchObject({ name: 'VerificationEditError', code: 'source-drift' });
  });

  it('refuses a property addition that would separate a preceding record from its adjacent indented comment', async () => {
    const fixture = await widthFixture();
    const path = join(fixture.rulesRoot, 'catalogs/control-augmentations.yml');
    const text = readFileSync(path, 'utf8').replace(/^(      MaxLength: Number)$/mu, '$1\n      # describes the preceding MaxLength');
    writeFileSync(path, text);
    fixture.sources = await readVerificationSources({ rulesRoot: fixture.rulesRoot, analyzerArtifactPath: ARTIFACT });
    await expect(planVerificationEdits({ sources: fixture.sources, requests: [fixture.request], producedBy: 'Maintainer', date: '2026-09-08',
      evidenceBaseDir: fixture.directory, reproBaseDir: fixture.directory, maintainer: 'Maintainer', acknowledgeMaintainerEvidence: true }).then(() => 'unexpected success'))
      .rejects.toMatchObject({ code: 'unsupported-shape' });
    expect(readFileSync(path, 'utf8')).toBe(text);
  });

  it('inserts an observation outside a fenced example containing a Markdown section heading', async () => {
    const section = '# Notes\n\n## Verification observations\n\n```md\n## Example heading\n```\n\n';
    const later = '## Next\n\nPreserved next section.\n';
    const fixture = await observationFixture(section + later);
    const { plan } = await planVerificationEdits(fixture.planning);
    const after = Buffer.from(plan.files[0].after_base64, 'base64').toString('utf8');
    expect(after.startsWith(section)).toBe(true);
    expect(after.indexOf('### Observation scope-example')).toBeGreaterThan(after.indexOf('## Example heading'));
    expect(after.endsWith(later)).toBe(true);
  });

  it.each([['DatePicker', 'blocked'], ['ModernDatePicker', 'pending']])('keeps the historical DefaultDate disproof scoped to %s', async (control, status) => {
    const fixture = await promotionFixture();
    const request = { ...fixture.request, claim: { ...fixture.request.claim, claim_ref: `augmentation:${control}.DefaultDate`,
      target: { kind: 'augmentation-property', control, property: 'DefaultDate', property_type: 'Date', property_value: '=Today()' }, ancestors: [], repro: null },
      result: { outcome: 'verified', reason: 'Synthetic hypothesis only.', evidence: { ...fixture.request.result.evidence,
        evidence_class: 'unverified', environment: null, compiler: null, files: [], completed_tenant_prerequisites: [],
        falsifier_result: 'not-run', falsifier_observation: 'No tenant test was run.' } } };
    const { plan, decisions } = await planVerificationEdits({ sources: fixture.sources, requests: [request], producedBy: 'Maintainer', date: '2026-09-08',
      evidenceBaseDir: fixture.directory, reproBaseDir: fixture.directory, maintainer: 'Maintainer', acknowledgeMaintainerEvidence: false });
    expect(decisions[0].status).toBe(status);
    expect(plan.files).toEqual([]);
  });

  it('keeps an exact observation replay idempotent and refuses conflicting evidence under the same ID', async () => {
    const fixture = await observationFixture();
    const first = await planVerificationEdits(fixture.planning);
    const after = Buffer.from(first.plan.files[0].after_base64, 'base64');
    expect(await applyVerificationEdits({ plan: first.plan, rulesRoot: fixture.rulesRoot, analyzerArtifactPath: ARTIFACT, maintainer: 'Maintainer', acknowledgeMaintainerEvidence: false }))
      .toEqual({ status: 'complete', applied: ['troubleshooting.md'], already_applied: [], remaining: [] });
    fixture.planning.sources = await readVerificationSources({ rulesRoot: fixture.rulesRoot, analyzerArtifactPath: ARTIFACT, documents: ['troubleshooting.md'] });
    expect((await planVerificationEdits(fixture.planning)).plan.files).toEqual([]);
    fixture.request.result.reason = 'A different observation is being substituted.';
    await expect(planVerificationEdits(fixture.planning)).rejects.toMatchObject({ code: 'ambiguous-target' });
    expect(readFileSync(join(fixture.rulesRoot, 'troubleshooting.md'))).toEqual(after);
  });

  it.each([
    ['duplicate headings', '## Verification observations\n\n## Verification observations\n', 'ambiguous-target'],
    ['fenced heading', '```md\n## Verification observations\n```\n', 'unsupported-shape'],
    ['unclosed fence', '```md\nunfinished\n', 'unsupported-shape'],
  ])('refuses %s at the observation insertion boundary', async (_label, document, code) => {
    const fixture = await observationFixture(document);
    await expect(planVerificationEdits(fixture.planning)).rejects.toMatchObject({ code });
    expect(readFileSync(join(fixture.rulesRoot, 'troubleshooting.md'), 'utf8')).toBe(document);
  });

  it('refuses property removal when an immediately following indented comment has uncertain ownership', async () => {
    const fixture = await promotionFixture();
    const path = join(fixture.rulesRoot, 'catalogs/control-augmentations.yml');
    const text = readFileSync(path, 'utf8').replace(/^(      Update:.*)$/mu, '$1\n      # describes the preceding property');
    writeFileSync(path, text);
    fixture.sources = await readVerificationSources({ rulesRoot: fixture.rulesRoot, analyzerArtifactPath: ARTIFACT });
    fixture.request.action.operation = 'remove';
    fixture.request.result.outcome = 'disproven';
    fixture.request.result.evidence.falsifier_result = 'falsified';
    Object.assign(fixture.request.result.evidence.compiler, { outcome: 'rejected', rejection_scope: 'tested-claim' });
    await expect(planVerificationEdits({ sources: fixture.sources, requests: [fixture.request], producedBy: 'Maintainer', date: '2026-09-08',
      evidenceBaseDir: fixture.directory, reproBaseDir: fixture.directory, maintainer: 'Maintainer', acknowledgeMaintainerEvidence: true }).then(() => 'unexpected success'))
      .rejects.toMatchObject({ code: 'unsupported-shape' });
    expect(readFileSync(path, 'utf8')).toBe(text);
  });

  it('adds a compiler-backed known-type property inside an existing unique additional-property block', async () => {
    const fixture = await widthFixture();
    const request = fixture.request;
    const { plan, decisions } = await planVerificationEdits({ sources: fixture.sources, requests: [request], producedBy: 'Maintainer', date: '2026-09-08',
      evidenceBaseDir: fixture.directory, reproBaseDir: fixture.directory, maintainer: 'Maintainer', acknowledgeMaintainerEvidence: true });
    expect(decisions[0].status).toBe('eligible');
    expect(plan.files.map(file => file.path)).toEqual(['catalogs/control-augmentations.yml']);
    const after = Buffer.from(plan.files[0].after_base64, 'base64').toString('utf8');
    expect(parseAugmentations(after).controls.TypedDataCard.additional_input_properties.Width).toEqual({
      type: 'Number', verified: true, verified_at: '2026-09-08', verified_by: 'compile_canvas',
      claim_scope: null, environment: null, reproduction: null, falsifier: null,
    });
    expect(after.replace(/^      Width:.*\r?\n/mu, '')).toBe(fixture.sources.files.get('catalogs/control-augmentations.yml').bytes.toString('utf8'));
  });

  it('appends a structured scoped observation without rendering user text as Markdown structure', async () => {
    const fixture = await promotionFixture();
    const document = '# Synthetic troubleshooting\r\n\r\nExisting prose.\r\n';
    writeFileSync(join(fixture.rulesRoot, 'troubleshooting.md'), document);
    const sources = await readVerificationSources({ rulesRoot: fixture.rulesRoot, analyzerArtifactPath: ARTIFACT, documents: ['troubleshooting.md'] });
    const request = { id: 'observe-example', action: { kind: 'observation', observation_id: 'scope-example' },
      claim: { ...fixture.request.claim, claim_ref: 'rule:synthetic-observation', target: { kind: 'observation', document: 'troubleshooting.md' },
        claim_scope: 'player_behaves', claim_text: 'Observed value\n## Injected | heading', ancestors: [], repro: null, expected_compile_outcome: 'not-applicable' },
      result: { ...fixture.request.result, evidence: { ...fixture.request.result.evidence, claim_scope: 'player_behaves',
        evidence_class: 'runtime_observation', compiler: null, files: [fixture.request.result.evidence.files[1]] } } };
    const { plan, decisions } = await planVerificationEdits({ sources, requests: [request], producedBy: 'Synthetic reviewer', date: '2026-09-08',
      evidenceBaseDir: fixture.directory, reproBaseDir: fixture.directory, maintainer: 'Maintainer', acknowledgeMaintainerEvidence: false });
    expect(decisions[0].status).toBe('eligible');
    expect(plan.files.map(file => file.path)).toEqual(['troubleshooting.md']);
    const after = Buffer.from(plan.files[0].after_base64, 'base64').toString('utf8');
    expect(after.startsWith(document)).toBe(true);
    expect(after).toContain('## Verification observations\r\n');
    expect(after).toContain('### Observation scope-example\r\n');
    expect(after).toContain('Scope: player_behaves');
    expect(after).toContain('Evidence class: runtime_observation');
    expect(after).toContain('Environment: Synthetic Studio fixture; test; Synthetic');
    expect(after).toContain('Falsified if:');
    expect(after).not.toContain('\n## Injected');
    expect(after).not.toContain(fixture.directory);
    expect(after).not.toContain('{"fixture":');
    expect(readFileSync(join(fixture.rulesRoot, 'troubleshooting.md'), 'utf8')).toBe(document);
  });

  it('proposes exact property removal together with append-only disproof and index replacements', async () => {
    const fixture = await promotionFixture();
    const outcome = '{"fixture":"rejected","property":"TypedDataCard.Update"}\n';
    writeFileSync(join(fixture.directory, 'outcome.json'), outcome);
    const request = structuredClone(fixture.request);
    request.action.operation = 'remove';
    request.result.outcome = 'disproven';
    request.result.evidence.falsifier_result = 'falsified';
    request.result.evidence.compiler.outcome = 'rejected';
    Object.assign(request.result.evidence.compiler, { rejection_scope: 'tested-claim' });
    request.result.evidence.files[1].sha256 = createHash('sha256').update(outcome).digest('hex');
    const { plan, decisions } = await planVerificationEdits({ sources: fixture.sources, requests: [request], producedBy: 'Maintainer', date: '2026-09-08',
      evidenceBaseDir: fixture.directory, reproBaseDir: fixture.directory, maintainer: 'Maintainer', acknowledgeMaintainerEvidence: true });
    expect(decisions[0].status).toBe('eligible');
    expect(plan.files.map(file => file.path)).toEqual(['catalogs/control-augmentations.yml', 'disproofs.index.json', 'disproofs.md']);
    const proposed = new Map(plan.files.map(file => [file.path, Buffer.from(file.after_base64, 'base64').toString('utf8')]));
    expect(parseAugmentations(proposed.get('catalogs/control-augmentations.yml')).controls.TypedDataCard.additional_input_properties.Update).toBeUndefined();
    expect(proposed.get('disproofs.md').startsWith(readFileSync(join(fixture.rulesRoot, 'disproofs.md'), 'utf8'))).toBe(true);
    expect(JSON.parse(proposed.get('disproofs.index.json')).entries).toHaveLength(DISPROOF_COUNT + 2);
    expect(proposed.get('disproofs.md')).not.toContain(fixture.directory);
    expect(proposed.get('disproofs.md')).not.toContain('"fixture":');
    expect(readFileSync(join(fixture.rulesRoot, 'catalogs/control-augmentations.yml'))).toEqual(fixture.sources.files.get('catalogs/control-augmentations.yml').bytes);
  });

  it.each(['unknown control', 'wrong existing type', 'unknown proposed type'])(
    'refuses %s even for an unverified pending hypothesis', async variant => {
      const fixture = await promotionFixture();
      const request = { ...fixture.request, claim: { ...fixture.request.claim, target: { ...fixture.request.claim.target }, repro: null },
        result: { outcome: 'verified', reason: 'An unverified synthetic hypothesis.', evidence: { ...fixture.request.result.evidence,
          evidence_class: 'unverified', environment: null, compiler: null, files: [], completed_tenant_prerequisites: [],
          falsifier_result: 'not-run', falsifier_observation: 'No tenant test was run.' } } };
      if (variant === 'unknown control') {
        request.claim.target.control = 'UnknownProbe';
        request.claim.claim_ref = 'augmentation:UnknownProbe.Update';
      }
      if (variant === 'wrong existing type') request.claim.target.property_type = 'Number';
      if (variant === 'unknown proposed type') {
        request.claim.target.property = 'ProposedProperty';
        request.claim.claim_ref = 'augmentation:TypedDataCard.ProposedProperty';
        request.claim.target.property_type = 'InventedType';
      }
      await expect(planVerificationEdits({ sources: fixture.sources, requests: [request], producedBy: 'Maintainer', date: '2026-09-08',
        evidenceBaseDir: fixture.directory, reproBaseDir: fixture.directory, maintainer: 'Maintainer', acknowledgeMaintainerEvidence: false,
      }).then(() => 'unexpected success')).rejects.toMatchObject({ code: 'unsupported-shape' });
    },
  );

  it('proposes only the exact eligible property promotion and preserves every unrelated byte', async () => {
    const fixture = await promotionFixture();
    const path = 'catalogs/control-augmentations.yml';
    const before = readFileSync(join(fixture.rulesRoot, path), 'utf8');
    expect(parseAugmentations(before).controls.TypedDataCard.additional_input_properties.Update.verified).toBe(false);
    const { plan, decisions } = await planVerificationEdits({
      sources: fixture.sources, requests: [fixture.request], producedBy: 'Maintainer', date: '2026-09-08',
      evidenceBaseDir: fixture.directory, reproBaseDir: fixture.directory, maintainer: 'Maintainer', acknowledgeMaintainerEvidence: true,
    });
    expect(decisions).toEqual([{ id: fixture.request.id, claim_ref: fixture.request.claim.claim_ref,
      status: 'eligible', reason: expect.any(String) }]);
    expect(plan.files.map(file => file.path)).toEqual([path]);
    const replacement = plan.files[0];
    expect(Buffer.from(replacement.before_base64, 'base64').toString('utf8')).toBe(before);
    const after = Buffer.from(replacement.after_base64, 'base64').toString('utf8');
    expect(parseAugmentations(after).controls.TypedDataCard.additional_input_properties.Update).toEqual({
      ...parseAugmentations(before).controls.TypedDataCard.additional_input_properties.Update,
      verified: true, verified_at: '2026-09-08', verified_by: 'compile_canvas',
    });
    const originalLine = before.match(/^      Update:.*$/mu)?.[0];
    expect(originalLine).toBeTruthy();
    expect(after.replace(/^      Update:.*$/mu, originalLine!)).toBe(before);
    expect(readFileSync(join(fixture.rulesRoot, path), 'utf8')).toBe(before);
  });

  it.each(['duplicate property', 'duplicate section', 'duplicate control', 'inline comment', 'unsupported child'])(
    'refuses %s even when the historical parser yields the same catalog', async variant => {
      const fixture = await promotionFixture();
      const path = join(fixture.rulesRoot, 'catalogs/control-augmentations.yml');
      let text = readFileSync(path, 'utf8');
      const line = text.match(/^      Update:.*$/mu)![0];
      if (variant === 'duplicate property') text = text.replace(line, `${line}\n${line}`);
      if (variant === 'duplicate section') text = text.replace('    additional_input_properties:', '    additional_input_properties:\n    additional_input_properties:');
      if (variant === 'duplicate control') {
        const start = text.indexOf('  TypedDataCard:');
        const end = text.indexOf('  Gallery:', start);
        expect(start).toBeGreaterThan(0);
        expect(end).toBeGreaterThan(start);
        text = text.slice(0, start) + text.slice(start, end) + text.slice(start);
      }
      if (variant === 'inline comment') text = text.replace(line, '      Update: { type: Text, verified: false } # uncertain ownership');
      if (variant === 'unsupported child') text = text.replace(line, `${line}\n        ignored: true`);
      writeFileSync(path, text);
      fixture.sources = await readVerificationSources({ rulesRoot: fixture.rulesRoot, analyzerArtifactPath: ARTIFACT });
      await expect(planVerificationEdits({ sources: fixture.sources, requests: [fixture.request], producedBy: 'Maintainer', date: '2026-09-08',
        evidenceBaseDir: fixture.directory, reproBaseDir: fixture.directory, maintainer: 'Maintainer', acknowledgeMaintainerEvidence: true,
      })).rejects.toMatchObject({ code: variant.startsWith('duplicate') ? 'ambiguous-target' : 'unsupported-shape' });
      expect(readFileSync(path, 'utf8')).toBe(text);
    },
  );

  it.each(['source drift', 'wrong evidence hash', 'missing acknowledgement', 'duplicate request'])(
    'rechecks %s before producing any applicable property change', async variant => {
      const fixture = await promotionFixture();
      const path = join(fixture.rulesRoot, 'catalogs/control-augmentations.yml');
      if (variant === 'source drift') writeFileSync(path, readFileSync(path, 'utf8') + '\n# harmless text still changes the reviewed input hash\n');
      if (variant === 'wrong evidence hash') writeFileSync(join(fixture.directory, 'outcome.json'), 'changed synthetic evidence');
      const requests = variant === 'duplicate request' ? [fixture.request, fixture.request] : [fixture.request];
      const before = readFileSync(path);
      await expect(planVerificationEdits({ sources: fixture.sources, requests, producedBy: 'Maintainer', date: '2026-09-08',
        evidenceBaseDir: fixture.directory, reproBaseDir: fixture.directory, maintainer: 'Maintainer', acknowledgeMaintainerEvidence: variant !== 'missing acknowledgement',
      })).rejects.toMatchObject({ code: {
        'source drift': 'source-drift', 'wrong evidence hash': 'evidence-mismatch',
        'missing acknowledgement': 'evidence-required', 'duplicate request': 'invalid-plan',
      }[variant] });
      expect(readFileSync(path)).toEqual(before);
    },
  );
});

describe('verification source context', () => {
  it('pins actual copied rules and the matching bundled analyzer without changing sources', async () => {
    const rulesRoot = copiedRules();
    const sources = await readVerificationSources({ rulesRoot, analyzerArtifactPath: ARTIFACT });
    expect(sources.rulesRoot).toBe(realpathSync.native(rulesRoot));
    expect(sources.analyzerArtifactPath).toBe(realpathSync.native(ARTIFACT));
    expect(sources.analyzerArtifactSha256).toBe(createHash('sha256').update(readFileSync(ARTIFACT)).digest('hex'));
    expect(sources.catalog.controls).toHaveLength(12);
    expect(sources.augmentations.schemaVersion).toBe(7);
    expect(sources.disproofIndex.entries).toHaveLength(DISPROOF_COUNT);
    expect([...sources.files.keys()].sort()).toEqual(SOURCE_PATHS);
    for (const path of SOURCE_PATHS) {
      const bytes = readFileSync(join(rulesRoot, path));
      expect(sources.files.get(path).bytes).toEqual(bytes);
      expect(sources.files.get(path).sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
      expect(bytes).toEqual(readFileSync(join(RULES_ROOT, path)));
    }
  });

  it.each([
    ['extraction date', 'catalogs/control-manifest.yml', /^extracted_at: .+$/mu, 'extracted_at: 2026-09-08T00:00:00.000Z'],
    ['control metadata', 'catalogs/control-manifest.yml', 'family: Classic', 'family: Changed'],
    ['enum vocabulary', 'catalogs/control-properties.yml', '[Center, Justify, Left, Right]', '[Center, Justify, Left]'],
    ['property type', 'catalogs/control-properties.yml', 'AccessibleLabel: Text', 'AccessibleLabel: Number'],
    ['augmentation evidence', 'catalogs/control-augmentations.yml', /^      OnSelect:.*$/mu, '      OnSelect: { type: Event, verified: true, verified_at: 2026-05-11, verified_by: compile_canvas }'],
    ['version knowledge', 'catalogs/control-augmentations.yml', 'target_version: "1.0.0"', 'target_version: "1.0.1"'],
  ])('refuses %s drift even when source names and version strings otherwise match', async (_label, path, from, to) => {
    const rulesRoot = copiedRules();
    const target = join(rulesRoot, path as string);
    const before = readFileSync(target, 'utf8');
    const after = before.replace(from as string, to as string);
    expect(after).not.toBe(before);
    writeFileSync(target, after);
    await expect(readVerificationSources({ rulesRoot, analyzerArtifactPath: ARTIFACT }).then(() => 'unexpected success'))
      .rejects.toMatchObject({ code: 'source-drift' });
    expect(readFileSync(target, 'utf8')).toBe(after);
  });

  it('reports malformed historical catalog input as a typed edit-boundary refusal', async () => {
    const rulesRoot = copiedRules();
    const target = join(rulesRoot, 'catalogs/control-augmentations.yml');
    writeFileSync(target, readFileSync(target, 'utf8').replace('schema_version: 7', 'schema_version: 6'));
    await expect(readVerificationSources({ rulesRoot, analyzerArtifactPath: ARTIFACT }))
      .rejects.toMatchObject({ name: 'VerificationEditError', code: 'unsupported-shape' });
  });

  it('pins only explicitly selected supported observation documents', async () => {
    const rulesRoot = copiedRules();
    writeFileSync(join(rulesRoot, 'troubleshooting.md'), '# Synthetic observations\n');
    const sources = await readVerificationSources({ rulesRoot, analyzerArtifactPath: ARTIFACT, documents: ['troubleshooting.md'] });
    expect([...sources.files.keys()]).toContain('troubleshooting.md');
    expect([...sources.files.keys()]).not.toContain('powerfx-reference.md');
    await expect(readVerificationSources({ rulesRoot, analyzerArtifactPath: ARTIFACT, documents: ['../private.md'] }))
      .rejects.toMatchObject({ code: 'path-boundary' });
  });

  it('refuses invalid UTF-8 and stale companion index input', async () => {
    const rulesRoot = copiedRules();
    writeFileSync(join(rulesRoot, 'disproofs.md'), Buffer.from([0xff]));
    await expect(readVerificationSources({ rulesRoot, analyzerArtifactPath: ARTIFACT }))
      .rejects.toMatchObject({ code: 'unsupported-shape' });
    copyFileSync(join(RULES_ROOT, 'disproofs.md'), join(rulesRoot, 'disproofs.md'));
    const index = JSON.parse(readFileSync(join(rulesRoot, 'disproofs.index.json'), 'utf8'));
    index.entries[0].row_sha256 = '0'.repeat(64);
    writeFileSync(join(rulesRoot, 'disproofs.index.json'), JSON.stringify(index));
    await expect(readVerificationSources({ rulesRoot, analyzerArtifactPath: ARTIFACT }))
      .rejects.toMatchObject({ code: 'source-drift' });
  });

  it('refuses a rules subdirectory that traverses a Windows junction or symbolic link', async ({ skip }) => {
    const rulesRoot = copiedRules();
    const external = temporaryDirectory();
    const moved = join(external, 'catalogs');
    renameSync(join(rulesRoot, 'catalogs'), moved);
    try { symlinkSync(moved, join(rulesRoot, 'catalogs'), process.platform === 'win32' ? 'junction' : 'dir'); }
    catch (error) {
      if (['EPERM', 'EACCES', 'ENOTSUP'].includes((error as NodeJS.ErrnoException).code ?? '')) return skip();
      throw error;
    }
    await expect(readVerificationSources({ rulesRoot, analyzerArtifactPath: ARTIFACT }))
      .rejects.toMatchObject({ code: 'path-boundary' });
  });
});

describe('verification review packages', () => {
  it('exclusively writes the reviewed bytes into a new directory', async () => {
    const parent = temporaryDirectory();
    const destination = join(parent, 'campaign');
    writeFileSync(join(parent, 'keep.txt'), 'unrelated');
    const manifest = Buffer.from('{"status":"pending"}\n');
    const repro = Buffer.from('Screens:\n  VerificationScreen:\n    Children: []\n');

    expect(await writeVerificationPackage({ outDir: destination, files: [
      { path: 'manifest.json', bytes: manifest },
      { path: 'case-example.pa.yaml', bytes: repro },
    ] })).toEqual({ directory: destination, files: ['manifest.json', 'case-example.pa.yaml'] });
    expect(readFileSync(join(destination, 'manifest.json'))).toEqual(manifest);
    expect(readFileSync(join(destination, 'case-example.pa.yaml'))).toEqual(repro);
    expect(readFileSync(join(parent, 'keep.txt'), 'utf8')).toBe('unrelated');
    expect(readdirSync(parent).sort()).toEqual(['campaign', 'keep.txt']);
  });

  it.each([
    ['traversal', ['../escape.txt']],
    ['embedded traversal', ['child/../escape.txt']],
    ['absolute path', ['/escape.txt']],
    ['drive path', ['C:\\escape.txt']],
    ['backslash path', ['child\\escape.txt']],
    ['empty path', ['']],
    ['dot path', ['.']],
    ['reserved metadata', ['.git/config']],
    ['reserved internal path', ['.appforge-verification.lock']],
    ['hidden tool directory', ['.claude/settings.json']],
    ['hidden nested directory', ['rules/.cache/notes.md']],
    ['Windows device name', ['NUL.txt']],
    ['alternate data stream', ['manifest.json:secret']],
    ['trailing dot alias', ['manifest.json.']],
    ['duplicate', ['manifest.json', 'manifest.json']],
    ['file/directory collision', ['child', 'child/file.json']],
  ])('rejects %s before creating the review directory', async (_label, paths) => {
    const parent = temporaryDirectory();
    const destination = join(parent, 'campaign');
    await expect(writeVerificationPackage({ outDir: destination, files: paths.map(path => ({
      path, bytes: Buffer.from('reviewed'),
    })) })).rejects.toMatchObject({ code: 'path-boundary' });
    expect(existsSync(destination)).toBe(false);
    expect(readdirSync(parent)).toEqual([]);
  });

  it('refuses an existing output directory without overwriting files', async () => {
    const parent = temporaryDirectory();
    const destination = join(parent, 'campaign');
    mkdirSync(destination);
    writeFileSync(join(destination, 'manifest.json'), 'existing');
    await expect(writeVerificationPackage({ outDir: destination, files: [
      { path: 'manifest.json', bytes: Buffer.from('replacement') },
    ] })).rejects.toMatchObject({ code: 'path-boundary' });
    expect(readFileSync(join(destination, 'manifest.json'), 'utf8')).toBe('existing');
  });

  it('requires an existing directory parent and rejects symlink traversal', async ({ skip }) => {
    const parent = temporaryDirectory();
    await expect(writeVerificationPackage({ outDir: join(parent, 'missing', 'campaign'), files: [] }))
      .rejects.toMatchObject({ code: 'path-boundary' });
    const actual = join(parent, 'actual');
    const link = join(parent, 'link');
    mkdirSync(actual);
    try { symlinkSync(actual, link, process.platform === 'win32' ? 'junction' : 'dir'); }
    catch (error) {
      if (['EPERM', 'EACCES', 'ENOTSUP'].includes((error as NodeJS.ErrnoException).code ?? '')) return skip();
      throw error;
    }
    await expect(writeVerificationPackage({ outDir: join(link, 'campaign'), files: [] }))
      .rejects.toMatchObject({ code: 'path-boundary' });
    expect(readdirSync(actual)).toEqual([]);
  });

  it('creates bounded package subdirectories for reviewed proposal files', async () => {
    const destination = join(temporaryDirectory(), 'review');
    const bytes = Buffer.from('reviewed proposal\n');
    await writeVerificationPackage({ outDir: destination, files: [
      { path: 'proposed/catalogs/control-augmentations.yml', bytes },
    ] });
    expect(readFileSync(join(destination, 'proposed/catalogs/control-augmentations.yml'))).toEqual(bytes);
  });

  it('reports completed files when a later filesystem write fails', async () => {
    const destination = join(temporaryDirectory(), 'review');
    const impossibleName = `${'x'.repeat(300)}.json`;
    await expect(writeVerificationPackage({ outDir: destination, files: [
      { path: 'WORKLIST.md', bytes: Buffer.from('reviewable') },
      { path: impossibleName, bytes: Buffer.from('second') },
    ] })).rejects.toMatchObject({ code: 'partial-apply', report: {
      status: 'partial', applied: ['WORKLIST.md'], already_applied: [], remaining: [impossibleName],
    } });
    expect(readFileSync(join(destination, 'WORKLIST.md'), 'utf8')).toBe('reviewable');
  });

  it('lets only one concurrent creator write the package directory', async () => {
    const destination = join(temporaryDirectory(), 'review');
    const results = await Promise.allSettled(['first', 'second'].map(value => writeVerificationPackage({
      outDir: destination, files: [{ path: 'manifest.json', bytes: Buffer.from(value) }],
    })));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect(['first', 'second']).toContain(readFileSync(join(destination, 'manifest.json'), 'utf8'));
  });

  it('pins package paths and bytes before asynchronous filesystem work', async () => {
    const parent = temporaryDirectory();
    const destination = join(parent, 'review');
    const file = { path: 'manifest.json', bytes: Buffer.from('reviewed') };
    const pending = writeVerificationPackage({ outDir: destination, files: [file] });
    file.path = '../escape.txt';
    file.bytes.fill('x');
    await pending;
    expect(readFileSync(join(destination, 'manifest.json'), 'utf8')).toBe('reviewed');
    expect(existsSync(join(parent, 'escape.txt'))).toBe(false);
  });
});
