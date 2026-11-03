/** Closed, local verification contracts. Importing this module performs no I/O. */
import { createHash } from 'node:crypto';
import { isAbsolute } from 'node:path';
import Ajv from 'ajv';
import { CLAIM_SCOPES } from './augmentation-catalog.mjs';

export class VerificationContractError extends Error {
  constructor(code, path, message) {
    super(`${path}: ${message}`);
    this.name = 'VerificationContractError';
    this.code = code;
    this.path = path;
  }
}

const CONTROL = '[A-Za-z][A-Za-z0-9_/]*';
const PROPERTY = '[A-Za-z_][A-Za-z0-9_]*';
const ID = '[a-z0-9][a-z0-9-]{0,79}';
const propertyRef = new RegExp(`^(augmentation|dump-property):(${CONTROL})\\.(${PROPERTY})$`, 'u');
const variantRef = new RegExp(`^variant:(${CONTROL})\\.([^:\\r\\n\\u0000*]+)$`, 'u');
const ruleRef = new RegExp(`^rule:(${ID})$`, 'u');

export function decodeClaimRef(value) {
  if (typeof value === 'string' && !/[\r\n\u0000]/u.test(value)) {
    const property = propertyRef.exec(value);
    if (property) return {
      kind: property[1] === 'augmentation' ? 'augmentation-property' : 'dump-property',
      control: property[2], property: property[3],
    };
    const variant = variantRef.exec(value);
    if (variant && /\S/u.test(variant[2])) {
      return { kind: 'observed-variant', control: variant[1], variant: variant[2] };
    }
    const rule = ruleRef.exec(value);
    if (rule) return { kind: 'rule', id: rule[1] };
  }
  throw new VerificationContractError('invalid-reference', '/claim_ref', 'Expected an exact local claim reference');
}

export function sha256(bytes) {
  if (typeof bytes !== 'string' && !(bytes instanceof Uint8Array)) {
    throw new VerificationContractError('invalid-document', '/hash', 'Expected text or bytes');
  }
  return createHash('sha256').update(bytes).digest('hex');
}

export function stableId(prefix, parts) {
  if (!['campaign', 'case', 'queue'].includes(prefix) || !Array.isArray(parts)) {
    throw new VerificationContractError('invalid-document', '/id', 'Expected an ID prefix and ordered array');
  }
  return `${prefix}-${sha256(JSON.stringify(parts)).slice(0, 24)}`;
}

const fail = (path, message) => { throw new VerificationContractError('invalid-document', path, message); };
const object = (properties, required = Object.keys(properties)) => ({
  type: 'object', properties, required, additionalProperties: false,
});
const array = (items, extra = {}) => ({ type: 'array', items, ...extra });
const nullable = schema => ({ anyOf: [schema, { type: 'null' }] });
const literal = value => ({ const: value });
const choice = (...values) => ({ type: 'string', enum: values });
const text = { type: 'string', pattern: '\\S' };
const line = { ...text, not: { pattern: '[\\r\\n\\u0000]' } };
const id = { ...line, pattern: `^${ID}$` };
const hash = { type: 'string', pattern: '^[a-f0-9]{64}$', minLength: 64, maxLength: 64 };
const counter = { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
const scope = choice(...CLAIM_SCOPES);
const claimRef = { ...line, anyOf: [
  { pattern: propertyRef.source }, { pattern: variantRef.source }, { pattern: ruleRef.source },
] };
const control = { ...line, pattern: `^${CONTROL}$` };
const property = { ...line, pattern: `^${PROPERTY}$` };
const falsifier = object({ description: text, unfalsified_if: text, falsified_if: text });
const prerequisite = { oneOf: [
  object({ id, phase: literal('local'), description: text, satisfied: { type: 'boolean' } }),
  object({ id, phase: literal('tenant'), description: text }),
] };
const lintContext = object({ datasources: { oneOf: [object({}), object({ VerificationRows: literal('sql') })] } });
const target = { oneOf: [
  object({ kind: literal('augmentation-property'), control, property, property_type: line, property_value: line }),
  object({ kind: literal('dump-property'), control, property, property_value: line }),
  object({ kind: literal('observed-variant'), control, variant: line }),
  object({ kind: literal('sql-isblank'), control: literal('Gallery'), property: literal('Items'),
    datasource: literal('VerificationRows'), property_value: line }),
  object({ kind: literal('observation'), document: choice('troubleshooting.md', 'powerfx-reference.md') }),
] };
const repro = object({ path: line, sha256: hash });
const claimFields = {
  claim_ref: claimRef, claim_scope: scope, claim_text: text, falsifier,
  prerequisites: array(prerequisite), expected_compile_outcome: choice('accept', 'reject', 'not-applicable'),
  target, reproduction: text, local_lint_context: lintContext,
  ancestors: array(object({ name: { ...line, pattern: '^ctlParent[1-9][0-9]*$' }, control })),
  repro: nullable(repro),
};
const claimSchema = object(claimFields);
const validators = new Map();
let ajv;

// Bare-object callers have the same JSON domain as documents. Reject getters,
// non-JSON values and cycles without inspecting their values in an error message.
function jsonValue(value, path = '', ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (typeof value !== 'object' || ancestors.has(value)) fail(path, 'Expected JSON data');
  if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    fail(path, 'Expected a plain JSON object');
  }
  ancestors.add(value);
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
    if (!('value' in descriptor)) fail(path, 'Expected JSON data properties');
    jsonValue(descriptor.value, path, ancestors);
  }
  ancestors.delete(value);
}

function checkShape(value, schema, path = '') {
  jsonValue(value, path);
  if (!validators.has(schema)) {
    ajv ??= new Ajv({ strict: false, ownProperties: true });
    validators.set(schema, ajv.compile(schema));
  }
  const validate = validators.get(schema);
  if (!validate(value)) {
    fail(path + (validate.errors[0]?.instancePath ?? ''), 'Value does not match the closed verification shape');
  }
}

function unique(values, path, sorted = false) {
  if (new Set(values).size !== values.length) fail(path, 'Duplicate identities are not permitted');
  if (sorted && values.some((value, index) => index > 0 && values[index - 1] > value)) {
    fail(path, 'Expected exact ordinal order');
  }
}

function localPath(value, path) {
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(value) && !/^[A-Za-z]:[\\/]/u.test(value)) {
    fail(path, 'Expected a local file path, not a URL');
  }
}

function claimSemantics(value, path = '') {
  const decoded = decodeClaimRef(value.claim_ref);
  const target = value.target;
  if (target.kind === 'sql-isblank') {
    if (value.claim_ref !== 'rule:delegation-sql-isblank' || value.claim_scope !== 'player_behaves'
      || value.expected_compile_outcome !== 'accept'
      || value.local_lint_context.datasources.VerificationRows !== 'sql') {
      fail(path + '/target', 'SQL claims require the selected rule, scope and local datasource context');
    }
  } else {
    if (Object.keys(value.local_lint_context.datasources).length) {
      fail(path + '/local_lint_context', 'Only the selected SQL claim carries a local datasource map');
    }
    if (target.kind !== 'observation'
      && (decoded.kind !== target.kind || decoded.control !== target.control
        || (decoded.kind === 'observed-variant' ? decoded.variant !== target.variant : decoded.property !== target.property))) {
      fail(path + '/target', 'Target must agree exactly with the claim reference');
    }
  }
  unique(value.prerequisites.map(item => item.id), path + '/prerequisites');
  value.ancestors.forEach((ancestor, index) => {
    if (ancestor.name !== `ctlParent${index + 1}`) fail(path + '/ancestors', 'Ancestors must use the reviewed contiguous names');
  });
  if (value.repro != null) localPath(value.repro.path, path + '/repro/path');
}

export function validateVerificationClaim(value) {
  checkShape(value, claimSchema);
  claimSemantics(value);
  return value;
}

const positive = { ...counter, minimum: 1 };
const date = { ...line, pattern: '^\\d{4}-\\d{2}-\\d{2}$' };
const timestamp = { ...line, pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,3})?Z$' };
const environment = object({ product: line, version: line, tenant_alias: line });
const evidenceFile = object({ id, path: line, sha256: hash });
const compiler = object({
  tool: literal('compile_canvas'), invocation_ref: line,
  outcome: choice('accepted', 'rejected', 'transport-error'), tested_claim_ref: claimRef,
  input_sha256: hash, local_lint_context_sha256: hash, input_evidence_id: id, outcome_evidence_id: id,
  rejection_scope: nullable(choice('tested-claim', 'unrelated', 'setup', 'transport')),
});
const runtimeTest = object({
  kind: literal('sql-isblank-delegation'), connector: literal('sql'),
  nondelegation_limit: positive, controlled_rows: positive, qualifying_rows_beyond_limit: positive,
  expected_full_result: text, observed_result: text,
  monitor: object({ available: { type: 'boolean' }, evidence_ids: array(id), note: text }),
});
const evidenceFields = {
  claim_scope: nullable(scope), environment: nullable(environment), reproduction: nullable(text),
  falsifier_result: choice('unfalsified', 'falsified', 'not-run'), falsifier_observation: text,
  files: array(evidenceFile), compiler: { type: 'null' }, runtime_test: { type: 'null' },
  completed_tenant_prerequisites: array(id),
  datasource_bindings: array(object({ authored_name: literal('VerificationRows'), connector: literal('sql'), evidence_id: id })),
};
const measuredEvidence = { claim_scope: scope, environment, reproduction: text, files: array(evidenceFile, { minItems: 1 }) };
const evidenceSchema = { oneOf: [
  object({ ...evidenceFields, ...measuredEvidence, evidence_class: literal('compile_canvas'), compiler }),
  object({ ...evidenceFields, ...measuredEvidence, evidence_class: literal('runtime_observation'), runtime_test: nullable(runtimeTest) }),
  object({ ...evidenceFields, ...measuredEvidence, evidence_class: { ...line, pattern: '^studio-export-\\d{4}-\\d{2}-\\d{2}$' } }),
  object({ ...evidenceFields, ...measuredEvidence, evidence_class: literal('documented-consensus'), environment: nullable(environment) }),
  object({ ...evidenceFields, evidence_class: literal('unverified'), claim_scope: scope, reproduction: text,
    environment: { type: 'null' }, falsifier_result: literal('not-run') }),
  object({ ...evidenceFields, evidence_class: literal('none'), claim_scope: { type: 'null' },
    environment: { type: 'null' }, reproduction: { type: 'null' }, falsifier_result: literal('not-run'),
    files: array(evidenceFile, { maxItems: 0 }), completed_tenant_prerequisites: array(id, { maxItems: 0 }),
    datasource_bindings: array(evidenceFields.datasource_bindings.items, { maxItems: 0 }) }),
] };
const resultFields = { outcome: choice('verified', 'disproven', 'dismissed'), reason: text, evidence: evidenceSchema };
const resultSchema = object(resultFields);

function calendarDate(value, path) {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    fail(path, 'Expected a real calendar date');
  }
}

function utcTimestamp(value, path) {
  const parsed = new Date(value);
  const normalized = value.replace(/(?:\.(\d{1,3}))?Z$/u, (_match, fraction) => `.${(fraction ?? '').padEnd(3, '0')}Z`);
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString() !== normalized) fail(path, 'Expected a real UTC timestamp');
}

function resultSemantics(value, path = '') {
  const evidence = value.evidence;
  const evidencePath = path + '/evidence';
  if ((value.outcome === 'verified' && evidence.falsifier_result === 'falsified')
    || (value.outcome === 'disproven' && evidence.falsifier_result === 'unfalsified')
    || (value.outcome !== 'dismissed' && evidence.evidence_class === 'none')) {
    fail(evidencePath, 'Result outcome contradicts its evidence');
  }
  if (evidence.evidence_class.startsWith('studio-export-')) {
    calendarDate(evidence.evidence_class.slice('studio-export-'.length), evidencePath + '/evidence_class');
  }
  unique(evidence.files.map(file => file.id), evidencePath + '/files');
  unique(evidence.completed_tenant_prerequisites, evidencePath + '/completed_tenant_prerequisites', true);
  unique(evidence.datasource_bindings.map(binding => binding.authored_name), evidencePath + '/datasource_bindings');
  const files = new Map(evidence.files.map(file => [file.id, file]));
  evidence.files.forEach((file, index) => localPath(file.path, `${evidencePath}/files/${index}/path`));
  const requireFile = (id, path) => {
    if (!files.has(id)) fail(path, 'Evidence reference must name a declared file');
  };
  evidence.datasource_bindings.forEach(binding => requireFile(binding.evidence_id, evidencePath + '/datasource_bindings'));
  if (evidence.compiler !== null) {
    const compiler = evidence.compiler;
    decodeClaimRef(compiler.tested_claim_ref);
    requireFile(compiler.input_evidence_id, evidencePath + '/compiler/input_evidence_id');
    requireFile(compiler.outcome_evidence_id, evidencePath + '/compiler/outcome_evidence_id');
    if (compiler.input_sha256 !== files.get(compiler.input_evidence_id).sha256) {
      fail(evidencePath + '/compiler/input_sha256', 'Compiler input and declared evidence digest differ');
    }
    if (compiler.outcome === 'accepted' && compiler.rejection_scope !== null) {
      fail(evidencePath + '/compiler/rejection_scope', 'Accepted compilation has no rejection scope');
    }
  }
  if (evidence.runtime_test !== null) {
    const monitor = evidence.runtime_test.monitor;
    unique(monitor.evidence_ids, evidencePath + '/runtime_test/monitor/evidence_ids');
    monitor.evidence_ids.forEach(id => requireFile(id, evidencePath + '/runtime_test/monitor/evidence_ids'));
    if (monitor.available !== (monitor.evidence_ids.length > 0)) {
      fail(evidencePath + '/runtime_test/monitor', 'Monitor availability and evidence references must agree');
    }
  }
}

export function validateVerificationClaimResult(value) {
  checkShape(value, resultSchema);
  resultSemantics(value);
  return value;
}

const disproofIndexSchema = object({
  schema: literal('appforge-disproof-index/1'), hash_algorithm: literal('sha256'),
  entries: array(object({ id, row_sha256: hash, match: { oneOf: [
    object({ kind: literal('exact'), claim_ref: claimRef }),
    object({ kind: literal('property-prefix'), control, prefix: property }),
  ] } })),
});
const adjudication = object({ outcome: choice('verified', 'disproven', 'dismissed'), at: timestamp,
  by: line, count_at_stamp: counter }, ['outcome', 'at', 'by']);
const storedRecordFields = { count: counter, occurrences: counter, first_seen: timestamp,
  last_seen: { anyOf: [timestamp, literal('')] }, worker_version: line, catalog_version: line,
  near_miss: { type: 'boolean' }, adjudication };
const storedRecord = object(storedRecordFields, []);
const flattenedRecord = object(storedRecordFields, ['count', 'last_seen']);
const selectedKey = key => /^(?:warn|lint|refuse):/u.test(key);
const exportEntry = { ...object({ key: line, value: {} }), allOf: [{
  if: { properties: { key: { pattern: '^(warn|lint|refuse):' } } },
  then: { properties: { value: storedRecord } },
}] };
const queueExportSchema = object({ schema: literal('verification-queue-export/1'), captured_at: timestamp, entries: array(exportEntry) });
const toolQueueSchema = object({ stats: {}, count: counter, prefix: nullable({ type: 'string' }),
  include_adjudicated: { type: 'boolean' }, entries: array({ ...object({ key: line }), additionalProperties: true }) });
const unboundQueueSchema = object({ stats: { type: 'null' }, entries: array({}, { maxItems: 0 }), note: line });

function normalizeQueue(value) {
  let exported = false;
  let entries;
  if (value?.schema === 'verification-queue-export/1') {
    checkShape(value, queueExportSchema);
    utcTimestamp(value.captured_at, '/captured_at');
    exported = true;
    entries = value.entries;
  } else if (value !== null && typeof value === 'object' && Object.hasOwn(value, 'note')) {
    checkShape(value, unboundQueueSchema);
    entries = value.entries;
  } else {
    checkShape(value, toolQueueSchema);
    if (value.count !== value.entries.length) fail('/count', 'Queue count must equal the returned entry count');
    entries = value.entries;
  }
  unique(entries.map(entry => entry.key), '/entries');
  const normalized = { capture_scope: exported ? 'operator-export' : 'tool-listing',
    captured_at: exported ? value.captured_at : null, entries: [], excluded: [] };
  entries.forEach((entry, index) => {
    if (!selectedKey(entry.key)) {
      normalized.excluded.push({ key: entry.key, reason: 'non-claim-key' });
      return;
    }
    const { key, ...flattened } = entry;
    const record = exported ? entry.value : flattened;
    const path = `/entries/${index}`;
    checkShape(record, exported ? storedRecord : flattenedRecord, path);
    if (record.first_seen !== undefined) utcTimestamp(record.first_seen, path + '/first_seen');
    if (record.last_seen !== undefined && record.last_seen !== '') utcTimestamp(record.last_seen, path + '/last_seen');
    if (record.adjudication !== undefined) utcTimestamp(record.adjudication.at, path + '/adjudication/at');
    normalized.entries.push({ key, count: record.count ?? 0, occurrences: record.occurrences ?? record.count ?? 0,
      first_seen: record.first_seen ?? null, last_seen: record.last_seen || null,
      worker_version: record.worker_version ?? null, catalog_version: record.catalog_version ?? null,
      near_miss: record.near_miss ?? null, adjudication: record.adjudication ?? null });
  });
  return normalized;
}

export function normalizeVerificationQueue(value) {
  try {
    return normalizeQueue(value);
  } catch (error) {
    if (error instanceof VerificationContractError) {
      throw new VerificationContractError('invalid-queue', error.path, 'Invalid verification queue capture');
    }
    throw error;
  }
}

const queueCoverage = object({ key: line, complete: { type: 'boolean' }, claim_refs: array(claimRef) });
const { repro: _recipeRepro, ...recipeClaimFields } = claimFields;
const campaignTarget = { oneOf: target.oneOf.slice(0, 4) };
const recipeSchema = object({ ...recipeClaimFields, target: campaignTarget, queue_keys: array(line, { minItems: 1 }), repro_yaml: text });
const recipesSchema = object({ schema: literal('verification-recipes/1'), recipes: array(recipeSchema), queue_key_coverage: array(queueCoverage) });

function coverageSemantics(coverage) {
  unique(coverage.map(row => row.key), '/queue_key_coverage');
  coverage.forEach((row, index) => {
    unique(row.claim_refs, `/queue_key_coverage/${index}/claim_refs`, true);
    row.claim_refs.forEach(decodeClaimRef);
  });
}

function recipesSemantics(value) {
  unique(value.recipes.map(recipe => recipe.claim_ref), '/recipes');
  value.recipes.forEach((recipe, index) => {
    claimSemantics(recipe, `/recipes/${index}`);
    unique(recipe.queue_keys, `/recipes/${index}/queue_keys`);
  });
  coverageSemantics(value.queue_key_coverage);
  const recipes = new Map(value.recipes.map(recipe => [recipe.claim_ref, recipe]));
  value.queue_key_coverage.forEach((coverage, index) => {
    if (coverage.claim_refs.some(ref => !recipes.get(ref)?.queue_keys.includes(coverage.key))) {
      fail(`/queue_key_coverage/${index}`, 'Coverage must reference reviewed recipes mapped to this key');
    }
  });
}

const writePaths = ['catalogs/control-augmentations.yml', 'disproofs.md', 'disproofs.index.json', 'troubleshooting.md', 'powerfx-reference.md'];
const sourcePaths = ['catalogs/control-augmentations.yml', 'catalogs/control-manifest.yml', 'catalogs/control-properties.yml', 'disproofs.index.json', 'disproofs.md'];
const readPaths = [...new Set([...writePaths, ...sourcePaths])];
const digestId = prefix => ({ ...line, pattern: `^${prefix}-[a-f0-9]{24}$` });
const queueCount = object({ key: line, count: counter });
const sourcePin = object({ path: choice(...readPaths), sha256: hash });
const gateSummary = object({ pass: counter, warn: counter, refuse: counter, controls_seen: counter });
const generatedCase = object({ ...claimFields, target: campaignTarget, kind: literal('case'), id: digestId('case'),
  queue: array(queueCount, { minItems: 1 }), repro,
  local_gate: object({ summary: gateSummary, rule_ids: array(line) }), status: choice('pending', 'local-gate-blocked') });
const nonGeneratedRow = object({ kind: literal('queue'), id: digestId('queue'), queue: array(queueCount, { minItems: 1, maxItems: 1 }),
  reason: text, status: choice('needs-recipe', 'ambiguous', 'unsupported', 'incomplete-prerequisites') });
const campaignSchema = object({
  schema: literal('verification-campaign/1'), campaign_id: digestId('campaign'), date,
  source: object({ queue_file_sha256: hash, recipes_file_sha256: hash, analyzer_artifact_sha256: hash,
    catalog_version: line, extracted_at: line, rules_files: array(sourcePin) }),
  capture_scope: choice('tool-listing', 'operator-export'), captured_at: nullable(timestamp),
  queue_key_coverage: array(queueCoverage),
  coverage: object({ selected_queue_rows: counter, generated_cases: counter, generated_queue_rows: counter,
    non_generated_queue_rows: counter, excluded_adjudicated_rows: counter, excluded_nonclaim_rows: counter }),
  rows: array({ oneOf: [generatedCase, nonGeneratedRow] }),
  excluded: array({ oneOf: [object({ key: line, reason: literal('non-claim-key') }),
    object({ key: line, reason: literal('adjudicated'), adjudication })] }),
});

function assertId(actual, prefix, parts, path) {
  if (actual !== stableId(prefix, parts)) fail(path, 'ID does not match the declared identity');
}

function campaignSemantics(value) {
  calendarDate(value.date, '/date');
  if (value.captured_at !== null) utcTimestamp(value.captured_at, '/captured_at');
  assertId(value.campaign_id, 'campaign', ['verification-campaign/1', value.date,
    value.source.queue_file_sha256, value.source.recipes_file_sha256, value.source.analyzer_artifact_sha256], '/campaign_id');
  const pins = value.source.rules_files.map(pin => pin.path);
  unique(pins, '/source/rules_files', true);
  if (pins.length !== sourcePaths.length || pins.some((path, index) => path !== sourcePaths[index])) {
    fail('/source/rules_files', 'Campaigns must pin all five catalog and disproof sources');
  }
  unique(value.rows.map(row => row.id), '/rows');
  const cases = value.rows.filter(row => row.kind === 'case');
  unique(cases.map(row => row.claim_ref), '/rows');
  const selected = new Map();
  const generatedKeys = new Set();
  const nonGeneratedKeys = new Set();
  let previous;
  value.rows.forEach((row, index) => {
    const path = `/rows/${index}`;
    unique(row.queue.map(entry => entry.key), path + '/queue');
    let count = 0;
    row.queue.forEach(entry => {
      if (!selectedKey(entry.key)) fail(path + '/queue', 'Campaign rows require selected claim keys');
      if (selected.has(entry.key) && selected.get(entry.key) !== entry.count) {
        fail(path + '/queue', 'A captured queue key has conflicting counts');
      }
      selected.set(entry.key, entry.count);
      count = Math.max(count, entry.count);
      (row.kind === 'case' ? generatedKeys : nonGeneratedKeys).add(entry.key);
    });
    if (row.kind === 'case') {
      claimSemantics(row, path);
      assertId(row.id, 'case', ['case/1', row.claim_ref], path + '/id');
      if (row.repro.path !== `${row.id}.pa.yaml`) fail(path + '/repro/path', 'Repro filename must match the case identity');
      if (row.prerequisites.some(item => item.phase === 'local' && !item.satisfied)) {
        fail(path + '/prerequisites', 'Generated cases require satisfied local prerequisites');
      }
      unique(row.local_gate.rule_ids, path + '/local_gate/rule_ids', true);
      if (row.status !== (row.local_gate.summary.refuse > 0 ? 'local-gate-blocked' : 'pending')) {
        fail(path + '/status', 'Generated status must match the actual local refusal count');
      }
    } else assertId(row.id, 'queue', ['queue-row/1', row.queue[0].key], path + '/id');
    const key = row.kind === 'case' ? row.claim_ref : row.queue[0].key;
    if (previous && (previous.count < count || (previous.count === count && previous.key > key))) {
      fail('/rows', 'Campaign rows must follow descending queue count and exact identity order');
    }
    previous = { count, key };
  });
  unique(value.excluded.map(row => row.key), '/excluded');
  value.excluded.forEach((row, index) => {
    if (selected.has(row.key) || selectedKey(row.key) !== (row.reason === 'adjudicated')) {
      fail(`/excluded/${index}`, 'Exclusions must be disjoint and match their key family');
    }
    if (row.reason === 'adjudicated') utcTimestamp(row.adjudication.at, `/excluded/${index}/adjudication/at`);
  });
  coverageSemantics(value.queue_key_coverage);
  if (value.queue_key_coverage.some(row => !selected.has(row.key))) {
    fail('/queue_key_coverage', 'Coverage assertions must describe selected queue keys');
  }
  const coverage = { selected_queue_rows: selected.size, generated_cases: cases.length,
    generated_queue_rows: generatedKeys.size, non_generated_queue_rows: nonGeneratedKeys.size,
    excluded_adjudicated_rows: value.excluded.filter(row => row.reason === 'adjudicated').length,
    excluded_nonclaim_rows: value.excluded.filter(row => row.reason === 'non-claim-key').length };
  if (Object.keys(coverage).some(key => coverage[key] !== value.coverage[key])) {
    fail('/coverage', 'Coverage counts must equal the manifest case and key sets');
  }
}

const caseResult = object({ ...resultFields, case_id: digestId('case'), claim_ref: claimRef, repro_sha256: hash });
const resultsSchema = object({ schema: literal('verification-results/1'), campaign_id: digestId('campaign'),
  campaign_sha256: hash, produced_by: line, captured_at: timestamp, cases: array(caseResult) });

function resultsSemantics(value) {
  utcTimestamp(value.captured_at, '/captured_at');
  unique(value.cases.map(row => row.case_id), '/cases');
  unique(value.cases.map(row => row.claim_ref), '/cases');
  value.cases.forEach((row, index) => {
    const path = `/cases/${index}`;
    decodeClaimRef(row.claim_ref);
    assertId(row.case_id, 'case', ['case/1', row.claim_ref], path + '/case_id');
    resultSemantics(row, path);
    if (row.evidence.compiler !== null && (row.evidence.compiler.input_sha256 !== row.repro_sha256
      || row.evidence.compiler.tested_claim_ref !== row.claim_ref)) {
      fail(path + '/evidence/compiler', 'Compiler input and claim must agree with this result case');
    }
  });
}

const observationChange = object({ kind: literal('observation'), observation_id: id });
const errataSchema = object({ schema: literal('appforge-errata/1'), produced_by: line, captured_at: timestamp,
  entries: array(object({ id, claim: claimSchema, result: resultSchema, proposed_change: { oneOf: [
    object({ kind: literal('additional-property'), operation: literal('add-or-promote') }), observationChange,
  ] } })) });

function changeTarget(claim, change, path) {
  if ((change.kind === 'observation' && claim.target.kind !== 'observation')
    || (change.kind !== 'observation' && claim.target.kind !== 'augmentation-property')) {
    fail(path, 'Proposed change must match the claim target kind');
  }
}

function errataSemantics(value) {
  utcTimestamp(value.captured_at, '/captured_at');
  unique(value.entries.map(entry => entry.id), '/entries');
  unique(value.entries.map(entry => entry.claim.claim_ref), '/entries');
  value.entries.forEach((entry, index) => {
    const path = `/entries/${index}`;
    claimSemantics(entry.claim, path + '/claim');
    resultSemantics(entry.result, path + '/result');
    changeTarget(entry.claim, entry.proposed_change, path + '/proposed_change');
  });
}

const editRequest = object({ id, claim: claimSchema, result: resultSchema, action: { oneOf: [
  object({ kind: literal('property'), operation: choice('add-or-promote', 'remove') }), observationChange,
] } });
const editDecision = object({ id, claim_ref: claimRef,
  status: choice('eligible', 'pending', 'blocked', 'review-required', 'dismissed'), reason: text });
const editFile = object({ path: choice(...writePaths), before_sha256: hash, after_sha256: hash,
  before_base64: { type: 'string' }, after_base64: { type: 'string' } });
const editsSchema = object({ schema: literal('verification-edits/1'), date, rules_root: line,
  analyzer_artifact: object({ path: line, sha256: hash }), produced_by: line,
  evidence_base_dir: line, repro_base_dir: line, requests: array(editRequest), decisions: array(editDecision),
  guards: array(sourcePin), files: array(editFile) });

function exactTextBytes(encoded, digest, path) {
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.toString('base64') !== encoded || sha256(bytes) !== digest) {
    fail(path, 'Expected canonical base64 matching the declared SHA-256 digest');
  }
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    fail(path, 'Proposed source bytes must be valid UTF-8');
  }
}

function editsSemantics(value) {
  calendarDate(value.date, '/date');
  for (const field of ['rules_root', 'evidence_base_dir', 'repro_base_dir']) {
    if (!isAbsolute(value[field])) fail('/' + field, 'Expected an absolute native directory path');
  }
  localPath(value.analyzer_artifact.path, '/analyzer_artifact/path');
  unique(value.requests.map(request => request.id), '/requests');
  unique(value.requests.map(request => request.claim.claim_ref), '/requests');
  unique(value.decisions.map(decision => decision.id), '/decisions');
  const requests = new Map(value.requests.map(request => [request.id, request]));
  if (value.decisions.length !== value.requests.length
    || value.decisions.some(decision => requests.get(decision.id)?.claim.claim_ref !== decision.claim_ref)) {
    fail('/decisions', 'Every request requires exactly one decision with its exact claim identity');
  }
  value.requests.forEach((request, index) => {
    const path = `/requests/${index}`;
    claimSemantics(request.claim, path + '/claim');
    resultSemantics(request.result, path + '/result');
    changeTarget(request.claim, request.action, path + '/action');
  });
  const files = value.files.map(file => file.path);
  const guards = value.guards.map(guard => guard.path);
  unique(files, '/files', true);
  unique(guards, '/guards', true);
  if (files.some(path => guards.includes(path))) fail('/guards', 'Edited files have before/after hashes instead of an unchanged guard');
  if (sourcePaths.some(path => !files.includes(path) && !guards.includes(path))) {
    fail('/guards', 'Every catalog and disproof source must be pinned by a guard or planned replacement');
  }
  value.files.forEach((file, index) => {
    exactTextBytes(file.before_base64, file.before_sha256, `/files/${index}/before_base64`);
    exactTextBytes(file.after_base64, file.after_sha256, `/files/${index}/after_base64`);
  });
}

const documentSchema = schema => ({ $schema: 'http://json-schema.org/draft-07/schema#', ...schema });
export const VERIFICATION_SCHEMAS = Object.freeze({
  'appforge-disproof-index/1': documentSchema(disproofIndexSchema),
  'verification-queue-export/1': documentSchema(queueExportSchema),
  'verification-recipes/1': documentSchema(recipesSchema),
  'verification-campaign/1': documentSchema(campaignSchema),
  'verification-results/1': documentSchema(resultsSchema),
  'appforge-errata/1': documentSchema(errataSchema),
  'verification-edits/1': documentSchema(editsSchema),
});

function expectedDocument(expectedSchema) {
  if (typeof expectedSchema !== 'string' || !Object.hasOwn(VERIFICATION_SCHEMAS, expectedSchema)) {
    fail('/schema', 'Unsupported verification document schema');
  }
  return VERIFICATION_SCHEMAS[expectedSchema];
}

export function parseVerificationDocument(source, expectedSchema) {
  expectedDocument(expectedSchema);
  let value;
  try {
    if (typeof source !== 'string') throw new TypeError();
    value = JSON.parse(source);
  } catch {
    throw new VerificationContractError('invalid-json', '', 'Expected complete JSON text');
  }
  return validateVerificationDocument(value, expectedSchema);
}

export function validateVerificationDocument(value, expectedSchema) {
  checkShape(value, expectedDocument(expectedSchema));
  if (expectedSchema === 'verification-queue-export/1') normalizeQueue(value);
  if (expectedSchema === 'verification-recipes/1') recipesSemantics(value);
  if (expectedSchema === 'verification-campaign/1') campaignSemantics(value);
  if (expectedSchema === 'verification-results/1') resultsSemantics(value);
  if (expectedSchema === 'appforge-errata/1') errataSemantics(value);
  if (expectedSchema === 'verification-edits/1') editsSemantics(value);
  if (expectedSchema === 'appforge-disproof-index/1') {
    unique(value.entries.map(entry => entry.id), '/entries');
    unique(value.entries.map(entry => entry.match.kind === 'exact'
      ? `exact:${entry.match.claim_ref}`
      : `property-prefix:${entry.match.control}:${entry.match.prefix}`), '/entries');
    value.entries.forEach(entry => {
      if (entry.match.kind === 'exact') decodeClaimRef(entry.match.claim_ref);
    });
  }
  return value;
}
