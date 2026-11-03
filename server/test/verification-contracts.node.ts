import { describe, expect, it } from 'vitest';
import { decodeClaimRef, sha256, stableId, validateVerificationClaim, validateVerificationClaimResult,
  parseVerificationDocument, validateVerificationDocument, VERIFICATION_SCHEMAS, VerificationContractError } from '../scripts/lib/verification-contracts.mjs';
import { normalizeVerificationQueue } from '../scripts/lib/verification-contracts.mjs';
import Ajv from 'ajv';
import { join, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

function claim() {
  return {
    claim_ref: 'augmentation:Gallery.OnSelect', claim_scope: 'compiler_accepts',
    claim_text: 'Gallery accepts OnSelect',
    falsifier: { description: 'Compile the probe', unfalsified_if: 'Accepted', falsified_if: 'Targeted rejection' },
    prerequisites: [{ id: 'local-ready', phase: 'local', description: 'Reviewed source', satisfied: true }],
    expected_compile_outcome: 'accept',
    target: { kind: 'augmentation-property', control: 'Gallery', property: 'OnSelect', property_type: 'Event', property_value: '=false' },
    reproduction: 'Compile the exact probe', local_lint_context: { datasources: {} }, ancestors: [],
    repro: { path: 'probe.pa.yaml', sha256: 'a'.repeat(64) },
  };
}

function compileResult() {
  return {
    outcome: 'verified', reason: 'Accepted by the compiler',
    evidence: {
      evidence_class: 'compile_canvas', claim_scope: 'compiler_accepts',
      environment: { product: 'Studio', version: 'test', tenant_alias: 'Synthetic' },
      reproduction: 'Compile the exact probe', falsifier_result: 'unfalsified',
      falsifier_observation: 'No targeted rejection',
      files: [{ id: 'input', path: 'probe.pa.yaml', sha256: 'a'.repeat(64) },
        { id: 'output', path: 'compile.json', sha256: 'b'.repeat(64) }],
      compiler: { tool: 'compile_canvas', invocation_ref: 'fixture-call', outcome: 'accepted',
        tested_claim_ref: 'augmentation:Gallery.OnSelect', input_sha256: 'a'.repeat(64),
        local_lint_context_sha256: 'c'.repeat(64), input_evidence_id: 'input', outcome_evidence_id: 'output', rejection_scope: null },
      runtime_test: null, completed_tenant_prerequisites: [], datasource_bindings: [],
    },
  };
}

function dismissal() {
  return { outcome: 'dismissed', reason: 'No reviewed recipe', evidence: {
    evidence_class: 'none', claim_scope: null, environment: null, reproduction: null,
    falsifier_result: 'not-run', falsifier_observation: 'No tenant test performed', files: [],
    compiler: null, runtime_test: null, completed_tenant_prerequisites: [], datasource_bindings: [],
  } };
}

function recipes() {
  const { repro: _repro, ...base } = claim();
  return { schema: 'verification-recipes/1', recipes: [{ ...base,
    queue_keys: ['warn:Gallery.OnSelect'], repro_yaml: 'Screens:\n  VerificationScreen: {}\n' }],
  queue_key_coverage: [{ key: 'warn:Gallery.OnSelect', complete: true, claim_refs: [base.claim_ref] }] };
}

function campaign() {
  const base = claim();
  const id = stableId('case', ['case/1', base.claim_ref]);
  const date = '2026-09-08';
  const digest = 'a'.repeat(64);
  const key = 'warn:Gallery.OnSelect';
  return { schema: 'verification-campaign/1',
    campaign_id: stableId('campaign', ['verification-campaign/1', date, digest, digest, digest]), date,
    source: { queue_file_sha256: digest, recipes_file_sha256: digest, analyzer_artifact_sha256: digest,
      catalog_version: '2026-08-30T08:00:00.000Z', extracted_at: '2026-08-30T08:00:00.000Z',
      rules_files: ['catalogs/control-augmentations.yml', 'catalogs/control-manifest.yml',
        'catalogs/control-properties.yml', 'disproofs.index.json', 'disproofs.md'].map(path => ({ path, sha256: digest })) },
    capture_scope: 'operator-export', captured_at: '2026-09-08T09:00:00Z',
    queue_key_coverage: [{ key, complete: false, claim_refs: [base.claim_ref, 'augmentation:Gallery.Width'] }],
    coverage: { selected_queue_rows: 1, generated_cases: 1, generated_queue_rows: 1,
      non_generated_queue_rows: 1, excluded_adjudicated_rows: 0, excluded_nonclaim_rows: 1 },
    rows: [{ ...base, kind: 'case', id, queue: [{ key, count: 4 }],
      repro: { path: id + '.pa.yaml', sha256: digest },
      local_gate: { summary: { pass: 1, warn: 1, refuse: 0, controls_seen: 1 }, rule_ids: ['gallery-missing-accessible-label'] }, status: 'pending' },
    { kind: 'queue', id: stableId('queue', ['queue-row/1', key]), queue: [{ key, count: 4 }],
      reason: 'Other claim lacks a reviewed repro', status: 'incomplete-prerequisites' }],
    excluded: [{ key: 'stats:validate', reason: 'non-claim-key' }],
  };
}

function editPlan() {
  return { schema: 'verification-edits/1', date: '2026-09-08', rules_root: resolve('fixture-rules'),
    analyzer_artifact: { path: resolve('analyzer.mjs'), sha256: 'a'.repeat(64) }, produced_by: 'Maintainer',
    evidence_base_dir: resolve('evidence'), repro_base_dir: resolve('repros'),
    requests: [{ id: 'gallery-onselect', claim: claim(), result: compileResult(), action: { kind: 'property', operation: 'add-or-promote' } }],
    decisions: [{ id: 'gallery-onselect', claim_ref: claim().claim_ref, status: 'eligible', reason: 'Reviewed compiler result' }],
    guards: campaign().source.rules_files.slice(1),
    files: [{ path: 'catalogs/control-augmentations.yml', before_sha256: sha256('before\n'), after_sha256: sha256('after\n'),
      before_base64: Buffer.from('before\n').toString('base64'), after_base64: Buffer.from('after\n').toString('base64') }],
  };
}

describe('closed verification documents', () => {
  it('validates bounded edit plans and exact byte hashes without applying or authorizing them', () => {
    const value = editPlan();
    expect(validateVerificationDocument(value, value.schema)).toBe(value);
    for (const invalid of [
      { ...value, rules_root: 'relative-rules' },
      { ...value, guards: value.guards.slice(1) },
      { ...value, decisions: [{ ...value.decisions[0], claim_ref: 'augmentation:Gallery.Width' }] },
      { ...value, files: [{ ...value.files[0], path: '../outside.md' }] },
      { ...value, files: [{ ...value.files[0], after_base64: 'YQ' }] },
      { ...value, files: [{ ...value.files[0], after_sha256: '0'.repeat(64) }] },
      { ...value, files: [{ ...value.files[0], after_base64: '//8=', after_sha256: sha256(Uint8Array.of(255, 255)) }] },
    ]) expect(() => validateVerificationDocument(invalid, value.schema)).toThrow(VerificationContractError);
  });
  it('shares claim and result checks with errata and binds each proposed change to its target', () => {
    const entry = { id: 'gallery-onselect', claim: claim(), result: compileResult(),
      proposed_change: { kind: 'additional-property', operation: 'add-or-promote' } };
    const value = { schema: 'appforge-errata/1', produced_by: 'Maintainer', captured_at: '2026-09-08T09:00:00Z', entries: [entry] };
    expect(validateVerificationDocument(value, value.schema)).toBe(value);
    for (const invalid of [
      { ...value, entries: [entry, entry] },
      { ...value, entries: [entry, { ...entry, id: 'duplicate-claim' }] },
      { ...value, entries: [{ ...entry, proposed_change: { kind: 'observation', observation_id: 'observation' } }] },
      { ...value, entries: [{ ...entry, result: { ...entry.result, evidenceVerified: true } }] },
    ]) expect(() => validateVerificationDocument(invalid, value.schema)).toThrow(VerificationContractError);
  });
  it('keeps partial campaign results bound to case IDs, declared repros and compiler inputs', () => {
    const ref = claim().claim_ref;
    const result = { ...compileResult(), case_id: stableId('case', ['case/1', ref]), claim_ref: ref, repro_sha256: 'a'.repeat(64) };
    const value = { schema: 'verification-results/1', campaign_id: campaign().campaign_id,
      campaign_sha256: 'd'.repeat(64), produced_by: 'Maintainer', captured_at: '2026-09-08T09:00:00.25Z', cases: [result] };
    expect(validateVerificationDocument(value, value.schema)).toBe(value);
    expect(validateVerificationDocument({ ...value, cases: [] }, value.schema).cases).toEqual([]);
    for (const invalid of [
      { ...value, captured_at: '2026-02-30T09:00:00Z' },
      { ...value, cases: [result, result] },
      { ...value, cases: [{ ...result, repro_sha256: 'f'.repeat(64) }] },
      { ...value, cases: [{ ...result, case_id: 'case-' + '0'.repeat(24) }] },
    ]) expect(() => validateVerificationDocument(invalid, value.schema)).toThrow(VerificationContractError);
  });
  it('binds campaign identities, counts and gates while retaining partially covered queue keys', () => {
    const value = campaign();
    expect(validateVerificationDocument(value, value.schema)).toBe(value);
    const invalid = [
      { ...value, campaign_id: 'campaign-' + '0'.repeat(24) },
      { ...value, coverage: { ...value.coverage, selected_queue_rows: 2 } },
      { ...value, source: { ...value.source, rules_files: value.source.rules_files.slice(1) } },
      { ...value, rows: [{ ...value.rows[0], status: 'local-gate-blocked' }, value.rows[1]] },
      { ...value, rows: [value.rows[0], { ...value.rows[1], claim_ref: 'rule:made-up' }] },
    ];
    invalid.forEach(candidate => expect(() => validateVerificationDocument(candidate, value.schema)).toThrow(VerificationContractError));
  });
  it('binds reviewed recipe coverage to exact claims and matching queue keys', () => {
    const value = recipes();
    expect(validateVerificationDocument(value, value.schema)).toBe(value);
    const unready = structuredClone(value);
    unready.recipes[0].prerequisites[0].satisfied = false;
    expect(validateVerificationDocument(unready, value.schema)).toBe(unready);
    for (const invalid of [
      { ...value, recipes: [...value.recipes, value.recipes[0]] },
      { ...value, queue_key_coverage: [{ ...value.queue_key_coverage[0], claim_refs: ['augmentation:Gallery.Width'] }] },
      { ...value, queue_key_coverage: [{ ...value.queue_key_coverage[0], key: 'warn:Gallery.Width' }] },
      { ...value, recipes: [{ ...value.recipes[0], target: { kind: 'observation', document: 'troubleshooting.md' } }] },
    ]) expect(() => validateVerificationDocument(invalid, value.schema)).toThrow(VerificationContractError);
  });
  it('normalizes legacy and current queue captures while excluding stats before record validation', () => {
    const exported = { schema: 'verification-queue-export/1', captured_at: '2026-09-08T09:00:00Z', entries: [
      { key: 'warn:Gallery.OnSelect', value: { count: 4, last_seen: '' } },
      { key: 'stats:validate', value: { arbitrary: ['private-data'] } },
    ] };
    expect(validateVerificationDocument(exported, exported.schema)).toBe(exported);
    const normalized = normalizeVerificationQueue(exported);
    expect(normalized).toEqual({
      capture_scope: 'operator-export', captured_at: '2026-09-08T09:00:00Z',
      entries: [{ key: 'warn:Gallery.OnSelect', count: 4, occurrences: 4, first_seen: null,
        last_seen: null, worker_version: null, catalog_version: null, near_miss: null, adjudication: null }],
      excluded: [{ key: 'stats:validate', reason: 'non-claim-key' }],
    });
    expect(normalizeVerificationQueue({ stats: {}, count: 1, prefix: '', include_adjudicated: false,
      entries: [{ key: 'warn:Gallery.OnSelect', count: 4, last_seen: '' }] }).entries).toEqual(normalized.entries);
    expect(normalizeVerificationQueue({ stats: null, entries: [], note: 'Binding is absent' }).entries).toEqual([]);
    for (const invalid of [
      { ...exported, entries: [...exported.entries, exported.entries[1]] },
      { ...exported, captured_at: '2026-02-30T00:00:00Z' },
      { ...exported, entries: [{ key: 'warn:Gallery.OnSelect', value: { count: -1 } }] },
      { ...exported, entries: [{ key: 'warn:Gallery.OnSelect', value: { count: 1, unexpected: true } }] },
    ]) expect(() => normalizeVerificationQueue(invalid)).toThrow(VerificationContractError);
  });
  it('shares the disproof index shape and rejects duplicate identities and invented fields', () => {
    const index = { schema: 'appforge-disproof-index/1', hash_algorithm: 'sha256', entries: [
      { id: 'old-property', match: { kind: 'exact', claim_ref: 'augmentation:DatePicker.DefaultDate' }, row_sha256: 'a'.repeat(64) },
      { id: 'toggle-family', match: { kind: 'property-prefix', control: 'Classic/Toggle', prefix: 'Rail' }, row_sha256: 'b'.repeat(64) },
    ] };
    expect(validateVerificationDocument(index, index.schema)).toBe(index);
    expect(parseVerificationDocument(JSON.stringify(index), index.schema)).toEqual(index);
    expect(new Ajv({ strict: false }).compile(VERIFICATION_SCHEMAS[index.schema])(index)).toBe(true);
    for (const invalid of [
      { ...index, extra: 'private text' },
      { ...index, entries: [...index.entries, index.entries[0]] },
      { ...index, entries: [index.entries[0], { ...index.entries[0], id: 'same-match' }] },
      { ...index, entries: [{ ...index.entries[1], match: { ...index.entries[1].match, prefix: 'Rail*' } }] },
    ]) expect(() => validateVerificationDocument(invalid, index.schema)).toThrow(VerificationContractError);
    expect(() => validateVerificationDocument(index, 'unknown/1')).toThrow(VerificationContractError);
    expect(() => parseVerificationDocument('{"private-name":', index.schema)).toThrow(VerificationContractError);
  });
});

describe('shared bare verification claims', () => {
  it('shares closed evidence shapes and permits an honest dismissal without tenant evidence', () => {
    const result = compileResult();
    expect(validateVerificationClaimResult(result)).toBe(result);
    expect(validateVerificationClaimResult(dismissal()).outcome).toBe('dismissed');
    for (const invalid of [
      { ...result, evidence: { ...result.evidence, evidence_class: 'studio-observation' } },
      { ...result, evidence: { ...result.evidence, compiler: null } },
      { ...result, evidence: { ...result.evidence, falsifier_result: 'falsified' } },
      { ...result, evidence: { ...result.evidence, files: [result.evidence.files[0]] } },
      { ...dismissal(), outcome: 'verified' },
    ]) expect(() => validateVerificationClaimResult(invalid)).toThrow(VerificationContractError);
  });
  it('validates the exact claim shape and target identity without promoting evidence', () => {
    const value = claim();
    expect(validateVerificationClaim(value)).toBe(value);
    for (const invalid of [
      { ...value, claim_scope: 'compile' },
      { ...value, target: { ...value.target, property: 'Width' } },
      { ...value, falsifier: { ...value.falsifier, verified: true } },
      { ...value, claim_ref: value.claim_ref + '\n' },
      { ...value, prerequisites: [...value.prerequisites, ...value.prerequisites] },
    ]) expect(() => validateVerificationClaim(invalid)).toThrow(VerificationContractError);
  });
});

describe('local verification claim identities', () => {
  it('hashes exact UTF-8 bytes and derives IDs from the supplied ordered array', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256(new TextEncoder().encode('abc'))).toBe(sha256('abc'));
    expect(stableId('case', [])).toBe('case-4f53cda18c2baa0c0354bb5f');
    expect(() => stableId('other' as 'case', [])).toThrow(VerificationContractError);
  });
  it('keeps property generations and local semantic rule claims exact', () => {
    expect(decodeClaimRef('augmentation:Classic/Toggle.Value')).toEqual({
      kind: 'augmentation-property', control: 'Classic/Toggle', property: 'Value',
    });
    expect(decodeClaimRef('dump-property:DatePicker.DefaultDate')).toEqual({
      kind: 'dump-property', control: 'DatePicker', property: 'DefaultDate',
    });
    expect(decodeClaimRef('variant:TextInput.SingleLine')).toEqual({
      kind: 'observed-variant', control: 'TextInput', variant: 'SingleLine',
    });
    expect(decodeClaimRef('rule:sharepoint-delegates-isblank')).toEqual({
      kind: 'rule', id: 'sharepoint-delegates-isblank',
    });
    for (const ref of ['augmentation:Classic/Toggle.Value*', 'dump_sourced:DatePicker',
      'variant:TextInput.*', 'rule:delegation:sql', ' augmentation:Text.Width', 'variant:TextInput.\n']) {
      expect(() => decodeClaimRef(ref)).toThrow(VerificationContractError);
    }
  });
});

describe('verification contract edge cases', () => {
  it('imports with no output or workspace writes and does not read catalog environment overrides', () => {
    const directory = mkdtempSync(join(tmpdir(), 'appforge-contract-import-'));
    try {
      const url = pathToFileURL(resolve(__dirname, '../scripts/lib/verification-contracts.mjs')).href;
      const result = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(url)});`], {
        cwd: directory, encoding: 'utf8', windowsHide: true,
        env: { ...process.env, APPFORGE_RULES_ROOT: join(directory, 'missing-catalog') },
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('');
      expect(readdirSync(directory)).toEqual([]);
    } finally {
      if (!resolve(directory).startsWith(resolve(tmpdir()) + sep + 'appforge-contract-import-')) throw new Error('Unexpected test directory');
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it.each(['runtime_observation', 'studio-export-2024-02-29', 'documented-consensus', 'unverified'])
    ('retains well-formed %s evidence without claiming promotion eligibility', evidence_class => {
      const value = compileResult();
      const candidate = { ...value, evidence: { ...value.evidence, evidence_class, compiler: null,
        ...(evidence_class === 'unverified' ? { environment: null, falsifier_result: 'not-run', files: [] } : {}),
        ...(evidence_class === 'documented-consensus' ? { environment: null } : {}),
      } };
      expect(validateVerificationClaimResult(candidate)).toBe(candidate);
    });

  it('requires the selected SQL context while allowing its compiler subclaim as separate evidence', () => {
    const value = { ...claim(), claim_ref: 'rule:delegation-sql-isblank', claim_scope: 'player_behaves',
      target: { kind: 'sql-isblank', control: 'Gallery', property: 'Items', datasource: 'VerificationRows', property_value: '=Filter(VerificationRows, IsBlank(Value))' },
      local_lint_context: { datasources: { VerificationRows: 'sql' } },
      prerequisites: [{ id: 'binding', phase: 'tenant', description: 'Bind the reviewed SQL table' }],
    };
    expect(validateVerificationClaim(value)).toBe(value);
    expect(() => validateVerificationClaim({ ...value, local_lint_context: { datasources: {} } })).toThrow(VerificationContractError);
    const evidence = compileResult();
    expect(validateVerificationClaimResult({ ...evidence, evidence: { ...evidence.evidence,
      compiler: { ...evidence.evidence.compiler, tested_claim_ref: value.claim_ref } } }).evidence.claim_scope).toBe('compiler_accepts');
  });

  it.each([
    ['a remote repro path', () => ({ ...claim(), repro: { ...claim().repro, path: 'https://example.invalid/probe.yaml' } })],
    ['extra tenant completion state', () => ({ ...claim(), prerequisites: [{ id: 'tenant', phase: 'tenant', description: 'Bind it', satisfied: true }] })],
    ['a noncontiguous ancestor', () => ({ ...claim(), ancestors: [{ name: 'ctlParent2', control: 'Form' }] })],
    ['a multiline target value', () => ({ ...claim(), target: { ...claim().target, property_value: '=false\n' } })],
  ])('rejects %s', (_label, value) => {
    expect(() => validateVerificationClaim(value())).toThrow(VerificationContractError);
  });

  it.each([
    ['a duplicate evidence ID', () => { const v = compileResult(); return { ...v, evidence: { ...v.evidence, files: [...v.evidence.files, v.evidence.files[0]] } }; }],
    ['an impossible export date', () => { const v = compileResult(); return { ...v, evidence: { ...v.evidence, evidence_class: 'studio-export-2026-02-29', compiler: null } }; }],
    ['an accepted rejection scope', () => { const v = compileResult(); return { ...v, evidence: { ...v.evidence, compiler: { ...v.evidence.compiler, rejection_scope: 'tested-claim' } } }; }],
    ['a dangling datasource evidence ID', () => { const v = compileResult(); return { ...v, evidence: { ...v.evidence, datasource_bindings: [{ authored_name: 'VerificationRows', connector: 'sql', evidence_id: 'missing' }] } }; }],
    ['a remote evidence path', () => { const v = compileResult(); return { ...v, evidence: { ...v.evidence, files: [{ ...v.evidence.files[0], path: 'file:///private/probe.yaml' }, v.evidence.files[1]] } }; }],
    ['a missing compiler input digest binding', () => { const v = compileResult(); return { ...v, evidence: { ...v.evidence, compiler: { ...v.evidence.compiler, input_sha256: 'f'.repeat(64) } } }; }],
  ])('rejects %s', (_label, value) => {
    expect(() => validateVerificationClaimResult(value())).toThrow(VerificationContractError);
  });

  it.each([
    ['count coercion', { count: '4' }], ['unsafe count', { count: Number.MAX_SAFE_INTEGER + 1 }],
    ['fractional count', { count: 1.5 }], ['invalid first date', { first_seen: '2026-02-30T00:00:00Z' }],
    ['invalid adjudication date', { adjudication: { outcome: 'verified', at: '2026-09-08T24:00:00Z', by: 'Maintainer' } }],
  ])('refuses malformed selected queue data: %s', (_label, record) => {
    expect(() => normalizeVerificationQueue({ schema: 'verification-queue-export/1', captured_at: '2026-09-08T09:00:00Z',
      entries: [{ key: 'warn:Gallery.OnSelect', value: record }] })).toThrow(VerificationContractError);
  });

  it('retains adjudicated rows and unknown metadata honestly without mutating a capture', () => {
    const input = { schema: 'verification-queue-export/1', captured_at: '2026-09-08T09:00:00.1Z', entries: [
      { key: 'warn:Gallery.OnSelect', value: { adjudication: { outcome: 'dismissed', at: '2026-09-08T09:00:00Z', by: 'Maintainer' } } },
      { key: 'lint:another-rule:Gallery', value: { count: 0, occurrences: 0, near_miss: false } },
    ] };
    const before = JSON.stringify(input);
    const output = normalizeVerificationQueue(input);
    expect(output.entries[0]).toMatchObject({ count: 0, occurrences: 0, first_seen: null, last_seen: null,
      adjudication: { outcome: 'dismissed', at: '2026-09-08T09:00:00Z', by: 'Maintainer' } });
    expect(output.entries[1]).toMatchObject({ count: 0, occurrences: 0, near_miss: false });
    expect(JSON.stringify(input)).toBe(before);
  });

  it('checks zero-file replay plans and does not accept unknown fields in any public document', () => {
    const empty = { ...editPlan(), requests: [], decisions: [], files: [], guards: campaign().source.rules_files };
    expect(validateVerificationDocument(empty, empty.schema)).toBe(empty);
    const values = [recipes(), campaign(), editPlan(),
      { schema: 'verification-results/1', campaign_id: campaign().campaign_id, campaign_sha256: 'd'.repeat(64),
        produced_by: 'Maintainer', captured_at: '2026-09-08T09:00:00Z', cases: [] },
      { schema: 'appforge-errata/1', produced_by: 'Maintainer', captured_at: '2026-09-08T09:00:00Z', entries: [] },
      { schema: 'verification-queue-export/1', captured_at: '2026-09-08T09:00:00Z', entries: [] },
      { schema: 'appforge-disproof-index/1', hash_algorithm: 'sha256', entries: [] }];
    for (const value of values) {
      expect(new Ajv({ strict: false }).compile(VERIFICATION_SCHEMAS[value.schema])(value)).toBe(true);
      expect(() => validateVerificationDocument({ ...value, evidenceVerified: true }, value.schema)).toThrow(VerificationContractError);
    }
  });

  it('keeps malformed-input diagnostics free of private values', () => {
    for (const call of [
      () => parseVerificationDocument('{"private-token":"SENSITIVE"', 'appforge-errata/1'),
      () => decodeClaimRef('private-token:SENSITIVE'),
      () => normalizeVerificationQueue({ stats: {}, count: 'SENSITIVE', prefix: null, include_adjudicated: false, entries: [] }),
    ]) {
      try { call(); throw new Error('Expected a contract error'); }
      catch (error) {
        expect(error).toBeInstanceOf(VerificationContractError);
        expect((error as Error).message).not.toMatch(/SENSITIVE|private-token/u);
      }
    }
  });
});
