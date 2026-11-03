/** Shared classifier for new local verification evidence. */
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { sha256, validateVerificationClaim, validateVerificationClaimResult } from './verification-contracts.mjs';
import { VerificationEditError } from './verification-errors.mjs';
import { inspectVerificationRepro } from './verification-repro.mjs';

const mismatch = message => { throw new VerificationEditError('evidence-mismatch', message); };

async function checkedFile(file, baseDir) {
  // Native local files only; reject devices, UNC/network paths, URLs and ADS.
  if (/^[\\/]{2}/u.test(file.path) || /:/u.test(file.path.replace(/^[A-Za-z]:[\\/]/u, ''))) {
    mismatch('Evidence references must name regular local files.');
  }
  try {
    const path = resolve(baseDir, file.path);
    if (!(await stat(path)).isFile()) mismatch('Evidence references must name regular local files.');
    const bytes = await readFile(path);
    if (sha256(bytes) !== file.sha256) mismatch('Evidence file bytes differ from the declared digest.');
    return bytes;
  } catch (error) {
    if (error instanceof VerificationEditError) throw error;
    mismatch('An evidence file could not be read as a regular local file.');
  }
}

export async function evaluateVerificationEvidence({ claim, result, producedBy, reproBaseDir, evidenceBaseDir,
  maintainer, acknowledgeMaintainerEvidence, analyzerArtifactPath, analyzerArtifactSha256 }) {
  validateVerificationClaim(claim);
  validateVerificationClaimResult(result);
  claim = structuredClone(claim);
  result = structuredClone(result);
  const evidence = result.evidence;
  for (const file of evidence.files) await checkedFile(file, evidenceBaseDir);
  const pending = reason => ({ status: 'pending', reason });
  const eligible = (permission, reason) => ({ status: 'eligible', permission, reason });
  if (evidence.evidence_class === 'none') return eligible('dismiss', 'Dismissed without a tenant evidence assertion.');
  if (claim.target.kind !== 'sql-isblank' && (evidence.runtime_test !== null || evidence.datasource_bindings.length)) {
    mismatch('SQL runtime tests and binding assertions belong only to the reviewed SQL claim.');
  }
  const sqlCompilerSubclaim = claim.target.kind === 'sql-isblank' && evidence.evidence_class === 'compile_canvas'
    && evidence.claim_scope === 'compiler_accepts';
  if (evidence.claim_scope !== claim.claim_scope && !sqlCompilerSubclaim) mismatch('Evidence scope differs from the reviewed claim.');
  const measured = ['compile_canvas', 'runtime_observation'].includes(evidence.evidence_class);
  if (measured) {
    const required = claim.prerequisites.filter(item => item.phase === 'tenant').map(item => item.id).sort();
    if (JSON.stringify(required) !== JSON.stringify(evidence.completed_tenant_prerequisites)) {
      mismatch('Measured evidence must complete exactly the reviewed tenant prerequisites.');
    }
    if (claim.target.kind === 'sql-isblank') {
      if (evidence.datasource_bindings.length !== 1) mismatch('SQL evidence requires the reviewed datasource binding.');
    } else if (evidence.datasource_bindings.length) mismatch('This claim declares no SQL datasource binding.');
  }
  if (evidence.compiler !== null) {
    if (!claim.repro || evidence.compiler.input_sha256 !== claim.repro.sha256 ||
        evidence.compiler.tested_claim_ref !== claim.claim_ref ||
        evidence.compiler.local_lint_context_sha256 !== sha256(JSON.stringify(claim.local_lint_context))) {
      mismatch('Compiler evidence does not bind the exact reviewed input, claim and local context.');
    }
    if (claim.expected_compile_outcome === 'accept' && evidence.claim_scope === 'compiler_accepts' &&
        ((evidence.compiler.outcome === 'accepted' && evidence.falsifier_result === 'falsified') ||
         (evidence.compiler.outcome === 'rejected' && evidence.compiler.rejection_scope === 'tested-claim' &&
          evidence.falsifier_result === 'unfalsified'))) {
      mismatch('Compiler outcome contradicts the declared acceptance falsifier result.');
    }
  }
  let localGate;
  if (measured && claim.target.kind !== 'observation') {
    if (!claim.repro) throw new VerificationEditError('evidence-required', 'Measured claim evidence requires a reviewed repro.');
    const bytes = await checkedFile(claim.repro, reproBaseDir);
    let yaml;
    try { yaml = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { mismatch('Reviewed repro must contain valid UTF-8 text.'); }
    localGate = await inspectVerificationRepro({ claim, yaml, analyzerArtifactPath, analyzerArtifactSha256 });
  } else if (claim.repro) await checkedFile(claim.repro, reproBaseDir);
  if (result.outcome === 'dismissed') return eligible('dismiss', 'Dismissed with the supplied evidence retained for review.');
  if (claim.prerequisites.some(item => item.phase === 'local' && !item.satisfied)) return pending('Reviewed local prerequisites are incomplete.');
  if (localGate?.summary.refuse > 0) return pending('The reviewed repro is blocked by the pinned local analyzer.');
  if (evidence.falsifier_result === 'not-run') return pending('The reviewed falsifier has not been run.');
  if (evidence.compiler && (evidence.compiler.outcome === 'transport-error' ||
      (evidence.compiler.outcome === 'rejected' && evidence.compiler.rejection_scope !== 'tested-claim'))) {
    return pending('Transport, setup and unrelated compiler failures do not establish the tested claim.');
  }
  if (sqlCompilerSubclaim) {
    if (evidence.compiler.outcome === 'accepted' && evidence.falsifier_result === 'unfalsified') {
      return { status: 'compiler-subclaim-only', reason: 'Compiler acceptance does not settle the SQL player/delegation claim.' };
    }
    return pending('This compiler result cannot settle the SQL player/delegation claim.');
  }
  if (claim.target.kind === 'sql-isblank' && evidence.evidence_class === 'runtime_observation') {
    const runtime = evidence.runtime_test;
    if (!runtime || runtime.controlled_rows <= runtime.nondelegation_limit ||
        runtime.qualifying_rows_beyond_limit > runtime.controlled_rows - runtime.nondelegation_limit) {
      return pending('SQL runtime evidence requires a controlled fixture beyond its measured nondelegation window.');
    }
    return eligible('record-runtime-claim', 'The controlled SQL runtime falsifier is recorded for this bounded claim.');
  }
  if (['dump-property', 'observed-variant'].includes(claim.target.kind)) {
    return { status: 'review-required', reason: 'This evidence requires the separate explicit catalog-tier decision.' };
  }
  if (claim.target.kind === 'observation') {
    return eligible('append-observation', 'Record this structured scoped observation with its original evidence class and falsifier.');
  }
  if (claim.target.kind === 'augmentation-property' && evidence.evidence_class === 'compile_canvas'
      && evidence.claim_scope === 'compiler_accepts') {
    const compiler = evidence.compiler;
    let permission;
    if (compiler.outcome === 'accepted' && result.outcome === 'verified' && evidence.falsifier_result === 'unfalsified'
        && claim.expected_compile_outcome === 'accept') permission = 'promote-property';
    if (compiler.outcome === 'rejected' && compiler.rejection_scope === 'tested-claim'
        && result.outcome === 'disproven' && evidence.falsifier_result === 'falsified'
        && claim.expected_compile_outcome === 'accept') permission = 'remove-property';
    if (permission) {
      if (typeof maintainer !== 'string' || !maintainer.trim()
          || producedBy !== maintainer || acknowledgeMaintainerEvidence !== true) {
        throw new VerificationEditError('evidence-required', 'Catalog changes require evidence produced by the configured maintainer (APPFORGE_MAINTAINER) and explicit acknowledgement.');
      }
      return eligible(permission, 'The exact compiler evidence meets the property gate; source and disproof checks still apply.');
    }
  }
  if (evidence.evidence_class !== 'compile_canvas') {
    return { status: 'review-required', reason: 'This evidence can support a documented proposal, but cannot promote or remove a property.' };
  }
  return pending('This evidence does not authorize an applicable property change.');
}
