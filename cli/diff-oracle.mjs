#!/usr/bin/env node
/**
 * Golden-snapshot acceptance-corpus runner.
 *
 * Internal, version-controlled inputs are compared by corpus identity and
 * content hash. External delivery inputs are compared by content hash so a
 * repository rename or edit is reported as corpus churn rather than analyzer
 * drift. Verdict fields are fatal; detail/fix prose and line numbers are
 * recorded and reported without changing the gate result.
 */
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  basename,
  delimiter,
  dirname,
  extname,
  isAbsolute,
  relative,
  resolve,
} from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze, loadCatalog } from './dist/analyzer-core.mjs';
import { catalogFreshness } from './catalog-freshness.mjs';
import { resolveExternalGolden } from './lib/appforge-data-paths.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const IS_MAIN = Boolean(process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]));
const REPO_ROOT = resolve(HERE, '..');
const DEFAULT_MANIFEST = resolve(HERE, 'corpus', 'manifest.json');
const DEFAULT_INTERNAL_GOLDEN = resolve(HERE, 'corpus', 'golden-internal.json');
const DEFAULT_EXTERNAL_GOLDEN = resolveExternalGolden();
const DEFAULT_ADJUDICATIONS = resolve(HERE, 'corpus', 'adjudications.json');
const CURRENT_CORE_CLI = resolve(HERE, 'validate.mjs');
export const COMPARISON_FIELDS = [
  'level',
  'rule',
  'file',
  'control',
  'type',
  'property',
  'did_you_mean',
];
export const REPORTED_FIELDS = ['detail', 'fix', 'line'];
export const SUMMARY_FIELDS = ['pass', 'warn', 'refuse', 'controls_seen'];
const WINDOWS_COMMAND_BUDGET = 24_000;
const SHA256 = /^[0-9a-f]{64}$/u;
const DISCREPANCY_ID = /^[a-z][a-z0-9-]*:[0-9a-f]{24}$/u;

function usage() {
  return `usage: diff-oracle.mjs [--internal-only] [--write-golden] [--manifest <path>] [--golden-internal <path>] [--golden-external <path>] [--report <path>] [--adjudications <path>] [--json]

Runs the current core-backed CLI over the acceptance corpus and compares it to
golden snapshots (external data lives in the AppForge data directory). Internal
drift is fatal. For external inputs, the same content hash with different findings is fatal; unknown hashes are
input-changed and absent hashes are stale, both non-fatal. Exact committed
adjudications may cover intended fatal differences, and unused entries fail.

--write-golden regenerates the configured snapshots after the coverage
tripwire passes and prints a reviewable summary of the snapshot changes.`;
}

function optionValue(argv, index, name) {
  const arg = argv[index];
  const prefix = `${name}=`;
  if (arg.startsWith(prefix)) return { value: arg.slice(prefix.length), next: index };
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a path`);
  return { value, next: index + 1 };
}

export function parseArgs(argv) {
  const options = {
    internalOnly: false,
    writeGolden: false,
    json: false,
    manifest: DEFAULT_MANIFEST,
    internalGolden: DEFAULT_INTERNAL_GOLDEN,
    externalGolden: DEFAULT_EXTERNAL_GOLDEN,
    report: null,
    adjudications: DEFAULT_ADJUDICATIONS,
  };
  const pathOptions = new Map([
    ['--manifest', 'manifest'],
    ['--golden-internal', 'internalGolden'],
    ['--golden-external', 'externalGolden'],
    ['--report', 'report'],
    ['--adjudications', 'adjudications'],
  ]);

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--internal-only') { options.internalOnly = true; continue; }
    if (arg === '--write-golden') { options.writeGolden = true; continue; }
    if (arg === '--json') { options.json = true; continue; }
    if (arg === '--help' || arg === '-h') { console.log(usage()); process.exit(0); }
    const option = [...pathOptions.keys()].find(name => arg === name || arg.startsWith(`${name}=`));
    if (option) {
      const parsed = optionValue(argv, index, option);
      options[pathOptions.get(option)] = resolve(parsed.value);
      index = parsed.next;
      continue;
    }
    throw new Error(`unknown option: ${arg}`);
  }
  return options;
}

function readJson(path, label) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`${label} '${path}' is not valid JSON: ${error.message}`);
  }
  return parsed;
}

function readManifest(path) {
  const manifest = readJson(path, 'corpus manifest');
  if (manifest?.schema_version !== 1 || !Array.isArray(manifest.roots)
    || !Array.isArray(manifest.expected_rules) || manifest.expected_rules.length === 0) {
    throw new Error('corpus manifest must have schema_version 1, a roots array, and a non-empty expected_rules array');
  }
  if (manifest.expected_rules.some(rule => typeof rule !== 'string' || rule.length === 0)
    || new Set(manifest.expected_rules).size !== manifest.expected_rules.length) {
    throw new Error('corpus manifest expected_rules must contain unique non-empty strings');
  }
  return manifest;
}

function globToRegExp(glob) {
  const pattern = glob.replaceAll('\\', '/');
  let source = '^';
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index];
    if (char === '*' && pattern[index + 1] === '*') {
      if (pattern[index + 2] === '/') {
        source += '(?:.*/)?';
        index += 2;
      } else {
        source += '.*';
        index++;
      }
    } else if (char === '*') {
      source += '[^/]*';
    } else if (char === '?') {
      source += '[^/]';
    } else {
      source += char.replace(/[|\\{}()[\]^$+?.]/gu, '\\$&');
    }
  }
  return new RegExp(`${source}$`, 'u');
}

function filesBelow(rootPath) {
  const rootStat = statSync(rootPath);
  if (rootStat.isFile()) return [rootPath];
  if (!rootStat.isDirectory()) return [];
  const files = [];
  const visit = directory => {
    const entries = readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.push(path);
      // Symlinks are intentionally not followed: corpus membership is explicit.
    }
  };
  visit(rootPath);
  return files;
}

function configuredRoots(manifest, manifestPath, internalOnly) {
  const base = dirname(manifestPath);
  const roots = [];
  const skipped = [];
  for (const entry of manifest.roots) {
    if (!entry || typeof entry.id !== 'string' || !['internal', 'external'].includes(entry.scope)) {
      throw new Error('each corpus root needs an id and scope internal|external');
    }
    if (!Array.isArray(entry.include) || entry.include.length === 0) {
      throw new Error(`corpus root '${entry.id}' needs a non-empty include array`);
    }
    if (entry.analysis_mode !== undefined && entry.analysis_mode !== 'batch' && entry.analysis_mode !== 'isolated') {
      throw new Error(`root '${entry.id}' analysis_mode must be batch or isolated`);
    }
    if (entry.scope === 'internal') {
      if (typeof entry.path !== 'string') throw new Error(`internal root '${entry.id}' needs path`);
      roots.push({ ...entry, path: resolve(base, entry.path) });
      continue;
    }
    if (internalOnly) {
      skipped.push({ id: entry.id, reason: '--internal-only' });
      continue;
    }
    if (typeof entry.paths_from_env !== 'string') {
      throw new Error(`external root '${entry.id}' needs paths_from_env`);
    }
    const configured = (process.env[entry.paths_from_env] ?? '')
      .split(delimiter)
      .map(value => value.trim())
      .filter(Boolean);
    if (configured.length === 0) {
      if (entry.required) throw new Error(`required external root '${entry.id}' is not configured`);
      skipped.push({ id: entry.id, reason: `${entry.paths_from_env} is not set` });
      continue;
    }
    for (const [index, path] of configured.entries()) {
      if (!isAbsolute(path)) {
        throw new Error(`external root '${entry.id}' entry ${index + 1} must be absolute: ${path}`);
      }
      if (!existsSync(path)) {
        throw new Error(`configured external corpus root does not exist: ${path}`);
      }
      roots.push({
        ...entry,
        id: `${entry.id}-${index + 1}-${basename(path) || 'root'}`,
        manifest_id: entry.id,
        path: resolve(path),
      });
    }
  }
  return { roots, skipped };
}

function enumerateCorpus(manifest, manifestPath, internalOnly) {
  const excludedRoots = (manifest.excluded_roots ?? []).map(entry => {
    if (!entry || typeof entry.pattern !== 'string' || entry.pattern.length === 0) {
      throw new Error('each excluded_roots entry needs a non-empty structural pattern');
    }
    return { pattern: entry.pattern, matcher: globToRegExp(entry.pattern), reason: entry.reason };
  });
  const { roots, skipped } = configuredRoots(manifest, manifestPath, internalOnly);
  const seen = new Set();
  const files = [];
  // Scheduling metadata stays private so corpus report/snapshot shapes remain stable.
  const isolatedFiles = new Set();
  const rootReports = [];
  for (const root of roots) {
    const includes = root.include.map(globToRegExp);
    const rootFiles = [];
    const rootStat = statSync(root.path);
    for (const file of filesBelow(root.path)) {
      const relativePath = (rootStat.isFile() ? basename(file) : relative(root.path, file))
        .replaceAll('\\', '/');
      if (excludedRoots.some(excluded => excluded.matcher.test(relativePath))) continue;
      if (!includes.some(pattern => pattern.test(relativePath))) continue;
      const canonical = canonicalPath(file);
      if (seen.has(canonical)) continue;
      seen.add(canonical);
      const content = readFileSync(file);
      const record = {
        root_id: root.id,
        scope: root.scope,
        file: `${root.id}/${relativePath}`,
        path: resolve(file),
        bytes: content.byteLength,
        sha256: createHash('sha256').update(content).digest('hex'),
      };
      files.push(record);
      if (root.analysis_mode === 'isolated') isolatedFiles.add(record);
      rootFiles.push(record);
    }
    rootReports.push({ id: root.id, scope: root.scope, path: root.path, file_count: rootFiles.length });
  }
  if (files.length === 0) throw new Error('acceptance corpus matched zero files');
  return {
    files,
    isolatedFiles,
    roots: rootReports,
    skipped,
    excludedRoots: excludedRoots.map(({ matcher: _matcher, ...entry }) => entry),
  };
}

function cliFileChunks(script, files, fixedArgs) {
  const chunks = [];
  let chunk = [];
  let width = process.execPath.length + script.length
    + fixedArgs.reduce((total, arg) => total + arg.length + 3, 0) + 16;
  for (const file of files) {
    const addition = file.path.length + 3;
    if (chunk.length > 0 && width + addition > WINDOWS_COMMAND_BUDGET) {
      chunks.push(chunk);
      chunk = [];
      width = process.execPath.length + script.length
        + fixedArgs.reduce((total, arg) => total + arg.length + 3, 0) + 16;
    }
    chunk.push(file);
    width += addition;
  }
  if (chunk.length > 0) chunks.push(chunk);
  return chunks;
}

function runCli(label, files, datasources, isolatedFiles) {
  if (files.length === 0) {
    return { exitCodes: [], exitCode: 0, reports: [], tool: null, chunks: 0 };
  }
  const fixedArgs = ['--json', ...(datasources ? ['--datasources', datasources] : [])];
  // Ordinary roots retain one shared batch context (subject to the existing
  // command-width limit), even when an isolated root appears between them.
  const oracleFiles = files.filter(file => file.root_id === 'oracle-ms-templates');
  const chunks = cliFileChunks(CURRENT_CORE_CLI,
    files.filter(file => !isolatedFiles.has(file) && file.root_id !== 'oracle-ms-templates'), fixedArgs);
  // The first-party screens are one independent app, never part of the fixture app batch.
  chunks.push(...cliFileChunks(CURRENT_CORE_CLI, oracleFiles, fixedArgs));
  chunks.push(...files.filter(file => isolatedFiles.has(file)).map(file => [file]));
  const reports = [];
  const exitCodes = [];
  let tool = null;
  for (const [index, chunk] of chunks.entries()) {
    const result = spawnSync(
      process.execPath,
      [CURRENT_CORE_CLI, ...chunk.map(file => file.path), ...fixedArgs],
      { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 },
    );
    if (result.error) throw new Error(`${label} chunk ${index + 1} failed to start: ${result.error.message}`);
    if (result.status !== 0 && result.status !== 1) {
      throw new Error(`${label} chunk ${index + 1} exited ${String(result.status)}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
    }
    exitCodes.push(result.status);
    let parsed;
    try {
      parsed = JSON.parse(result.stdout);
    } catch (error) {
      throw new Error(`${label} emitted invalid JSON: ${error.message}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
    }
    const chunkReports = Array.isArray(parsed) ? parsed : parsed?.reports;
    if (!Array.isArray(chunkReports)) {
      throw new Error(`${label} JSON output must be an array or an object with a reports array`);
    }
    if (!Array.isArray(parsed) && parsed.tool !== undefined) tool = parsed.tool;
    reports.push(...chunkReports);
  }
  return {
    exitCodes,
    exitCode: exitCodes.some(code => code === 1) ? 1 : 0,
    reports,
    tool,
    chunks: chunks.length,
  };
}

function comparisonValue(value) {
  return value === undefined ? null : value;
}

function canonicalPath(path) {
  const absolute = resolve(path);
  return process.platform === 'win32' ? absolute.toLowerCase() : absolute;
}

function compareText(left, right) {
  return String(left ?? '').localeCompare(String(right ?? ''));
}

// Analyzer details name other files by the path they were given. Snapshots must not depend on where the
// repository or an external root is checked out, so every corpus path in reported text becomes its corpus id.
export function corpusPathReplacements(files, platform = process.platform) {
  const flags = platform === 'win32' ? 'giu' : 'gu';
  return [...files]
    .sort((left, right) => right.path.length - left.path.length)
    .map(file => {
      const variants = [...new Set([file.path, file.path.replaceAll('\\', '/')])];
      const escaped = variants.map(variant => variant.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'));
      return [new RegExp(escaped.join('|'), flags), file.file];
    });
}

export function portableReportedText(value, replacements) {
  if (typeof value !== 'string') return value;
  return replacements.reduce((text, [pattern, id]) => text.replace(pattern, id), value);
}

function normalizeIssue(issue, fileIdentity, replacements = []) {
  return Object.fromEntries([
    ...COMPARISON_FIELDS.map(field => [field, comparisonValue(field === 'file' ? fileIdentity : issue[field])]),
    ...REPORTED_FIELDS.map(field => [field, comparisonValue(portableReportedText(issue[field], replacements))]),
  ]);
}

function compareIssues(left, right) {
  for (const field of COMPARISON_FIELDS) {
    const compared = compareText(left[field], right[field]);
    if (compared !== 0) return compared;
  }
  for (const field of REPORTED_FIELDS) {
    const compared = compareText(left[field], right[field]);
    if (compared !== 0) return compared;
  }
  return 0;
}

function normalizedEntries(files, run, external) {
  const byPath = new Map(files.map(file => [canonicalPath(file.path), file]));
  const replacements = corpusPathReplacements(files);
  const reports = new Map();
  for (const report of run.reports) {
    const file = byPath.get(canonicalPath(report.file));
    if (!file) throw new Error(`current CLI emitted a report outside the requested corpus: '${report.file}'`);
    if (reports.has(file.file)) throw new Error(`current CLI emitted duplicate reports for '${file.file}'`);
    if (!Array.isArray(report.issues)) throw new Error(`CLI report for '${report.file}' has no issues array`);
    const fileIdentity = external ? `sha256:${file.sha256}` : file.file;
    const summary = Object.fromEntries(
      SUMMARY_FIELDS.map(field => [field, comparisonValue(report.summary?.[field])]),
    );
    reports.set(file.file, {
      file,
      issues: report.issues.map(issue => normalizeIssue(issue, fileIdentity, replacements)).sort(compareIssues),
      summary,
    });
  }
  const missing = files.filter(file => !reports.has(file.file));
  if (missing.length > 0) {
    throw new Error(`current CLI omitted ${missing.length} corpus report(s): ${missing.map(file => file.file).join(', ')}`);
  }
  return reports;
}

function createInternalSnapshot(files, run) {
  const entries = normalizedEntries(files, run, false);
  return {
    schema_version: 1,
    comparison_fields: COMPARISON_FIELDS,
    reported_fields: REPORTED_FIELDS,
    summary_fields: SUMMARY_FIELDS,
    run: {
      exit_code: run.exitCode,
      files: Object.fromEntries([...entries.values()].map(entry => [entry.file.file, {
        sha256: entry.file.sha256,
        issues: entry.issues,
        summary: entry.summary,
      }])),
    },
  };
}

function createExternalSnapshot(files, run) {
  const entries = normalizedEntries(files, run, true);
  const byHash = new Map();
  for (const entry of entries.values()) {
    const existing = byHash.get(entry.file.sha256);
    const output = { issues: entry.issues, summary: entry.summary };
    if (existing && canonicalJson(existing.output) !== canonicalJson(output)) {
      throw new Error(`identical external content hash '${entry.file.sha256}' produced different normalized findings`);
    }
    if (existing) existing.paths.push(entry.file.file);
    else byHash.set(entry.file.sha256, { output, paths: [entry.file.file] });
  }
  return {
    schema_version: 1,
    comparison_fields: COMPARISON_FIELDS,
    reported_fields: REPORTED_FIELDS,
    summary_fields: SUMMARY_FIELDS,
    files: Object.fromEntries([...byHash.entries()].map(([hash, entry]) => [hash, entry.output])),
    pathsByHash: Object.fromEntries([...byHash.entries()].map(([hash, entry]) => [hash, entry.paths])),
  };
}

function validateSummary(summary, label) {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
    throw new Error(`${label} summary must be an object`);
  }
  for (const field of SUMMARY_FIELDS) {
    if (!(field in summary) || (summary[field] !== null && !Number.isInteger(summary[field]))) {
      throw new Error(`${label} summary.${field} must be an integer or null`);
    }
  }
}

function validateIssues(issues, label) {
  if (!Array.isArray(issues)) throw new Error(`${label} issues must be an array`);
  for (const [index, issue] of issues.entries()) {
    if (!issue || typeof issue !== 'object' || Array.isArray(issue)) {
      throw new Error(`${label} issues[${index}] must be an object`);
    }
    for (const field of [...COMPARISON_FIELDS, ...REPORTED_FIELDS]) {
      if (!(field in issue)) throw new Error(`${label} issues[${index}] is missing '${field}'`);
    }
  }
}

function loadInternalGolden(path) {
  const golden = readJson(path, 'internal golden');
  if (golden?.schema_version !== 1 || golden.comparison_fields?.join('|') !== COMPARISON_FIELDS.join('|')
    || golden.reported_fields?.join('|') !== REPORTED_FIELDS.join('|')
    || golden.summary_fields?.join('|') !== SUMMARY_FIELDS.join('|')
    || !golden.run || ![0, 1].includes(golden.run.exit_code)
    || !golden.run.files || typeof golden.run.files !== 'object' || Array.isArray(golden.run.files)) {
    throw new Error('internal golden has an unsupported or malformed schema');
  }
  for (const [file, entry] of Object.entries(golden.run.files)) {
    if (!entry || typeof entry !== 'object' || !SHA256.test(entry.sha256)) {
      throw new Error(`internal golden '${file}' has an invalid content hash`);
    }
    validateIssues(entry.issues, `internal golden '${file}'`);
    validateSummary(entry.summary, `internal golden '${file}'`);
  }
  return golden;
}

function loadExternalGolden(path) {
  const golden = readJson(path, 'external golden');
  if (golden?.schema_version !== 1 || golden.comparison_fields?.join('|') !== COMPARISON_FIELDS.join('|')
    || golden.reported_fields?.join('|') !== REPORTED_FIELDS.join('|')
    || golden.summary_fields?.join('|') !== SUMMARY_FIELDS.join('|')
    || !golden.files || typeof golden.files !== 'object' || Array.isArray(golden.files)) {
    throw new Error('external golden has an unsupported or malformed schema');
  }
  for (const [hash, entry] of Object.entries(golden.files)) {
    if (!SHA256.test(hash) || !entry || typeof entry !== 'object') {
      throw new Error(`external golden contains an invalid content hash '${hash}'`);
    }
    validateIssues(entry.issues, `external golden '${hash}'`);
    validateSummary(entry.summary, `external golden '${hash}'`);
  }
  return golden;
}

function issueTuple(issue) {
  return Object.fromEntries(COMPARISON_FIELDS.map(field => [field, issue[field]]));
}

function issueKey(issue) {
  return JSON.stringify(COMPARISON_FIELDS.map(field => issue[field]));
}

function groupIssues(issues) {
  const groups = new Map();
  for (const issue of [...issues].sort(compareIssues)) {
    const key = issueKey(issue);
    const group = groups.get(key) ?? [];
    group.push(issue);
    groups.set(key, group);
  }
  return groups;
}

function compareIssueSets(expectedIssues, currentIssues, subject) {
  const expected = groupIssues(expectedIssues);
  const current = groupIssues(currentIssues);
  const keys = [...new Set([...expected.keys(), ...current.keys()])].sort(compareText);
  const discrepancies = [];
  const reportedDifferences = [];
  for (const key of keys) {
    const expectedGroup = expected.get(key) ?? [];
    const currentGroup = current.get(key) ?? [];
    const matched = Math.min(expectedGroup.length, currentGroup.length);
    for (let index = 0; index < matched; index++) {
      const fields = {};
      for (const field of REPORTED_FIELDS) {
        if (expectedGroup[index][field] !== currentGroup[index][field]) {
          fields[field] = { golden: expectedGroup[index][field], current: currentGroup[index][field] };
        }
      }
      if (Object.keys(fields).length > 0) {
        reportedDifferences.push({
          kind: 'reported-issue-drift',
          comparison: { subject, ...issueTuple(expectedGroup[index]), occurrence: index + 1 },
          differences: fields,
        });
      }
    }
    for (let index = matched; index < expectedGroup.length; index++) {
      discrepancies.push({
        kind: 'golden-only-issue',
        comparison: { subject, ...issueTuple(expectedGroup[index]), occurrence: index + 1 },
        golden: expectedGroup[index],
        current: null,
      });
    }
    for (let index = matched; index < currentGroup.length; index++) {
      discrepancies.push({
        kind: 'current-only-issue',
        comparison: { subject, ...issueTuple(currentGroup[index]), occurrence: index + 1 },
        golden: null,
        current: currentGroup[index],
      });
    }
  }
  return { discrepancies, reportedDifferences };
}

function compareEntry(expected, current, subject) {
  const discrepancies = [];
  if (SUMMARY_FIELDS.some(field => expected.summary[field] !== current.summary[field])) {
    discrepancies.push({
      kind: 'summary-mismatch',
      comparison: { subject, fields: SUMMARY_FIELDS },
      golden: expected.summary,
      current: current.summary,
    });
  }
  const issues = compareIssueSets(expected.issues, current.issues, subject);
  discrepancies.push(...issues.discrepancies);
  return { discrepancies, reportedDifferences: issues.reportedDifferences };
}

export function compareInternalGolden(golden, current) {
  const discrepancies = [];
  const reportedDifferences = [];
  if (golden.run.exit_code !== current.run.exit_code) {
    discrepancies.push({
      kind: 'exit-code-mismatch',
      comparison: { scope: 'internal' },
      golden: golden.run.exit_code,
      current: current.run.exit_code,
    });
  }
  const files = [...new Set([...Object.keys(golden.run.files), ...Object.keys(current.run.files)])]
    .sort(compareText);
  for (const file of files) {
    const expected = golden.run.files[file];
    const actual = current.run.files[file];
    if (!expected || !actual) {
      discrepancies.push({
        kind: expected ? 'internal-file-missing' : 'internal-file-added',
        comparison: { file },
        golden: expected ?? null,
        current: actual ?? null,
      });
      continue;
    }
    if (expected.sha256 !== actual.sha256) {
      discrepancies.push({
        kind: 'internal-content-hash-mismatch',
        comparison: { file },
        golden: expected.sha256,
        current: actual.sha256,
      });
    }
    const compared = compareEntry(expected, actual, file);
    discrepancies.push(...compared.discrepancies);
    reportedDifferences.push(...compared.reportedDifferences);
  }
  return { discrepancies, reportedDifferences };
}

export function compareExternalGolden(golden, current) {
  const discrepancies = [];
  const reportedDifferences = [];
  const inputChanged = [];
  const stale = [];
  for (const [hash, actual] of Object.entries(current.files)) {
    const expected = golden.files[hash];
    if (!expected) {
      inputChanged.push({
        classification: 'input-changed',
        file_hash: hash,
        files: current.pathsByHash?.[hash] ?? [],
      });
      continue;
    }
    const compared = compareEntry(expected, actual, `sha256:${hash}`);
    discrepancies.push(...compared.discrepancies);
    reportedDifferences.push(...compared.reportedDifferences);
  }
  for (const hash of Object.keys(golden.files)) {
    if (Object.hasOwn(current.files, hash)) continue;
    stale.push({ classification: 'stale', file_hash: hash });
  }
  return { discrepancies, reportedDifferences, inputChanged, stale };
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function detailHash(issue) {
  if (!issue || typeof issue.detail !== 'string') return null;
  return createHash('sha256').update(issue.detail).digest('hex');
}

/** Stable exact identity; issue-level identities explicitly pin detail cause. */
export function discrepancyIdentity(discrepancy) {
  const payload = {
    kind: discrepancy.kind,
    comparison: discrepancy.comparison,
    golden: discrepancy.golden,
    current: discrepancy.current,
    golden_detail_sha256: detailHash(discrepancy.golden),
    current_detail_sha256: detailHash(discrepancy.current),
  };
  const digest = createHash('sha256').update(canonicalJson(payload)).digest('hex').slice(0, 24);
  return `${discrepancy.kind}:${digest}`;
}

function validateReference(reference) {
  if (typeof reference !== 'string' || reference.includes('\\') || reference.includes('..')) return false;
  const [path, fragment, ...extra] = reference.split('#');
  if (extra.length > 0) return false;
  const isDesign = /^docs\/maintainers\/design\/[A-Za-z0-9._-]+\.md$/u.test(path);
  const isChangelog = path === 'CHANGELOG.md';
  if (!isDesign && !isChangelog) return false;
  if (isChangelog && !fragment) return false;
  const absolute = resolve(REPO_ROOT, path);
  if (!existsSync(absolute)) return false;
  if (!fragment) return true;
  const headings = readFileSync(absolute, 'utf8').replaceAll('\r\n', '\n')
    .split('\n')
    .flatMap(line => {
      const match = line.match(/^#{1,6}\s+(.+?)\s*$/u);
      return match ? [match[1]] : [];
    });
  return headings.some(heading => heading === fragment || heading.startsWith(`${fragment} `));
}

export function loadAdjudications(path) {
  const parsed = readJson(path, 'adjudications');
  if (parsed?.schema_version !== 1 || !parsed.adjudications
    || typeof parsed.adjudications !== 'object' || Array.isArray(parsed.adjudications)) {
    throw new Error('adjudications file must have schema_version 1 and an adjudications object');
  }
  for (const [identity, entry] of Object.entries(parsed.adjudications)) {
    if (!DISCREPANCY_ID.test(identity)) throw new Error(`invalid adjudication identity '${identity}'`);
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)
      || Object.keys(entry).some(key => !['reference', 'note'].includes(key))
      || typeof entry.note !== 'string' || entry.note.trim().length === 0) {
      throw new Error(`adjudication '${identity}' must be { reference, note } with a non-empty note`);
    }
    if (!validateReference(entry.reference)) {
      throw new Error(`adjudication '${identity}' has a malformed or missing design/CHANGELOG reference`);
    }
  }
  return parsed.adjudications;
}

export function applyAdjudications(discrepancies, adjudications = {}) {
  const seen = new Set();
  const covered = [];
  const uncovered = [];
  const annotated = discrepancies.map(discrepancy => {
    const identity = discrepancyIdentity(discrepancy);
    if (seen.has(identity)) throw new Error(`duplicate discrepancy identity '${identity}'`);
    seen.add(identity);
    const adjudication = adjudications[identity] ?? null;
    const result = {
      ...discrepancy,
      identity,
      classification: adjudication ? 'intended' : null,
      adjudication,
    };
    (adjudication ? covered : uncovered).push(result);
    return result;
  });
  return {
    discrepancies: annotated,
    covered,
    uncovered,
    unused: Object.keys(adjudications).filter(identity => !seen.has(identity)).sort(),
  };
}

export function goldenGatePassed(adjudicationResult, coverage, oracleCalibration = null) {
  return adjudicationResult.uncovered.length === 0
    && adjudicationResult.unused.length === 0
    && coverage.missing_expected_rules.length === 0
    && (oracleCalibration === null || oracleCalibration.gate_passed);
}

/** Strict occurrence count / control count; even multiple WARNs on one control count. No exemptions. */
export function oracleCalibrationResult(validation) {
  const controls = validation.summary.controls_seen;
  if (!Number.isInteger(controls) || controls <= 0) throw new Error('Microsoft oracle matched zero controls');
  const counts = new Map();
  for (const issue of validation.issues) {
    if (issue.level !== 'WARN') continue;
    if (typeof issue.rule !== 'string') throw new Error('Microsoft oracle WARN has no rule id');
    counts.set(issue.rule, (counts.get(issue.rule) ?? 0) + 1);
  }
  const rules = [...counts].sort(([a], [b]) => compareText(a, b))
    .map(([rule, count]) => ({ rule, count, share: count / controls }));
  const violations = rules.filter(entry => entry.share > 0.25);
  return { profile: 'worker', controls, max_share: 0.25, rules, violations,
    gate_passed: violations.length === 0 };
}

export function coverageResult(expectedRules, reports) {
  const counts = Object.fromEntries(expectedRules.map(rule => [rule, 0]));
  for (const report of reports) {
    for (const issue of report.issues) {
      if (typeof issue.rule === 'string' && Object.hasOwn(counts, issue.rule)) counts[issue.rule]++;
      if (typeof issue.detail === 'string' && Object.hasOwn(counts, issue.detail)) counts[issue.detail]++;
    }
  }
  return {
    expected_rules: expectedRules,
    rule_counts: counts,
    missing_expected_rules: expectedRules.filter(rule => counts[rule] === 0),
  };
}

function persistedExternalSnapshot(snapshot) {
  const { pathsByHash: _pathsByHash, ...persisted } = snapshot;
  return persisted;
}

function snapshotChangeSummary(previous, next, scope) {
  if (!previous) {
    const files = scope === 'internal' ? Object.keys(next.run.files).length : Object.keys(next.files).length;
    return { baseline: 'created', added: files, removed: 0, changed: 0, exit_code_changed: false };
  }
  const beforeFiles = scope === 'internal' ? previous.run.files : previous.files;
  const afterFiles = scope === 'internal' ? next.run.files : next.files;
  const beforeKeys = new Set(Object.keys(beforeFiles));
  const afterKeys = new Set(Object.keys(afterFiles));
  return {
    baseline: 'updated',
    added: [...afterKeys].filter(key => !beforeKeys.has(key)).length,
    removed: [...beforeKeys].filter(key => !afterKeys.has(key)).length,
    changed: [...afterKeys].filter(key => beforeKeys.has(key)
      && canonicalJson(beforeFiles[key]) !== canonicalJson(afterFiles[key])).length,
    exit_code_changed: scope === 'internal'
      ? previous.run.exit_code !== next.run.exit_code
      : false,
  };
}

function writeGolden(path, snapshot) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

function tableCell(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function renderMarkdown(report) {
  const lines = [
    '# AppForge analyzer golden-snapshot report',
    '',
    `Generated: ${report.generated_at}`,
    `Scope: ${report.scope}`,
    `Manifest: \`${report.manifest}\``,
    '',
    'Verdict equality uses `level + rule + file + control + type + property + did_you_mean`, summary tuples, internal content hashes, and the internal run exit code. Detail/fix prose and line numbers are reported but non-fatal.',
    '',
    '## Result',
    '',
    `- Corpus files: ${report.summary.files}`,
    `- Current issues: ${report.summary.current_issues}`,
    `- Fatal discrepancies: ${report.summary.discrepancies}`,
    `- Intended (adjudicated): ${report.summary.intended}`,
    `- Uncovered discrepancies: ${report.summary.uncovered_discrepancies}`,
    `- Unused adjudications: ${report.summary.unused_adjudications}`,
    `- Coverage misses: ${report.summary.coverage_misses}`,
    `- Oracle calibration: ${report.oracle_calibration === null ? 'not configured' : report.oracle_calibration.gate_passed ? 'PASS' : 'FAIL'}`,
    `- Reported detail/fix/line drifts: ${report.summary.reported_differences}`,
    `- External input-changed hashes: ${report.summary.input_changed}`,
    `- External stale hashes: ${report.summary.stale}`,
    `- Gate: ${report.gate_passed ? 'PASS' : 'FAIL'}`,
    '',
    '## Corpus roots',
    '',
    '| Root | Scope | Files | Path |',
    '|---|---:|---:|---|',
    ...report.corpus.roots.map(root => `| ${tableCell(root.id)} | ${root.scope} | ${root.file_count} | \`${tableCell(root.path)}\` |`),
  ];
  if (report.golden_write) {
    lines.push('', '## Golden regeneration diff', '', '```json', JSON.stringify(report.golden_write, null, 2), '```');
  }
  if (report.oracle_calibration) {
    lines.push('', '## Microsoft oracle WARN calibration', '',
      `Worker profile; ${report.oracle_calibration.controls} first-party controls; maximum 25% per rule. Counts are WARN occurrences; no exemptions.`,
      '', '| Rule | WARNs | Share |', '|---|---:|---:|',
      ...report.oracle_calibration.rules.map(entry => `| ${tableCell(entry.rule)} | ${entry.count} | ${(entry.share * 100).toFixed(2)}% |`));
    for (const entry of report.oracle_calibration.violations) {
      lines.push(`FAIL: ${entry.rule} fires ${entry.count} WARNs / ${report.oracle_calibration.controls} controls (${(entry.share * 100).toFixed(2)}% > 25%).`);
    }
  }
  if (report.corpus.skipped_roots.length > 0) {
    lines.push('', 'Skipped roots:', '');
    for (const skipped of report.corpus.skipped_roots) lines.push(`- ${skipped.id}: ${skipped.reason}`);
  }
  lines.push(
    '',
    '## Coverage tripwire',
    '',
    `Expected identifiers: ${report.coverage.expected_rules.length}`,
    `Missing identifiers: ${report.coverage.missing_expected_rules.length === 0 ? 'none' : report.coverage.missing_expected_rules.join(', ')}`,
    '',
    '| Identifier | Count |',
    '|---|---:|',
    ...Object.entries(report.coverage.rule_counts).map(([rule, count]) => `| \`${tableCell(rule)}\` | ${count} |`),
    '',
    '## Fatal discrepancies',
    '',
  );
  if (report.discrepancies.length === 0) lines.push('None.');
  else for (const discrepancy of report.discrepancies) {
    lines.push(
      `### ${discrepancy.id} — ${discrepancy.kind}`,
      '',
      `Identity: \`${discrepancy.identity}\``,
      `Classification: ${discrepancy.classification ?? 'uncovered'}`,
      '',
      '```json',
      JSON.stringify({
        comparison: discrepancy.comparison,
        golden: discrepancy.golden,
        current: discrepancy.current,
        adjudication: discrepancy.adjudication,
      }, null, 2),
      '```',
      '',
    );
  }
  lines.push('', '## External classifications', '', '### Input changed', '');
  lines.push(report.input_changed.length === 0 ? 'None.' : '```json');
  if (report.input_changed.length > 0) lines.push(JSON.stringify(report.input_changed, null, 2), '```');
  lines.push('', '### Stale', '');
  lines.push(report.stale.length === 0 ? 'None.' : '```json');
  if (report.stale.length > 0) lines.push(JSON.stringify(report.stale, null, 2), '```');
  lines.push('', '## Reported differences (non-fatal)', '');
  if (report.reported_differences.length === 0) lines.push('None.');
  else lines.push('```json', JSON.stringify(report.reported_differences, null, 2), '```');
  if (report.adjudications.unused_identities.length > 0) {
    lines.push('', '## Unused adjudications', '');
    for (const identity of report.adjudications.unused_identities) lines.push(`- \`${identity}\``);
  }
  return `${lines.join('\n')}\n`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const freshnessWarning = catalogFreshness(loadCatalog().extractedAt, new Date());
  if (freshnessWarning) console.error(freshnessWarning);
  const manifest = readManifest(options.manifest);
  const corpus = enumerateCorpus(manifest, options.manifest, options.internalOnly);
  const datasources = typeof manifest.datasources === 'string'
    ? resolve(dirname(options.manifest), manifest.datasources)
    : null;
  const internalFiles = corpus.files.filter(file => file.scope === 'internal');
  const externalFiles = corpus.files.filter(file => file.scope === 'external');
  if (internalFiles.length === 0) throw new Error('acceptance corpus matched zero internal files');
  const oracleFiles = internalFiles.filter(file => file.root_id === 'oracle-ms-templates');
  const hasOracle = manifest.roots.some(root => root.id === 'oracle-ms-templates');
  if (hasOracle && oracleFiles.length === 0) throw new Error('Microsoft oracle matched zero files');
  // Programmatic analyzer call uses the complete Worker rule profile. No survey publication or tenant I/O.
  const oracleCalibration = hasOracle ? oracleCalibrationResult(analyze(oracleFiles.map(file => ({
    name: file.file, content: readFileSync(file.path, 'utf8'),
  })), loadCatalog(), { lintProfile: 'worker', captureFileLines: false,
    detectDuplicateControlNames: false }).validation) : null;
  const internalRun = runCli('current core CLI (internal)', internalFiles, datasources, corpus.isolatedFiles);
  const externalRun = runCli('current core CLI (external)', externalFiles, datasources, corpus.isolatedFiles);
  const currentInternal = createInternalSnapshot(internalFiles, internalRun);
  const currentExternal = createExternalSnapshot(externalFiles, externalRun);
  const coverage = coverageResult(manifest.expected_rules, [...internalRun.reports, ...externalRun.reports]);
  const hasConfiguredExternal = corpus.roots.some(root => root.scope === 'external');
  let goldenWrite = null;
  let internalGolden;
  let externalGolden = null;

  if (options.writeGolden) {
    if (oracleCalibration && !oracleCalibration.gate_passed) {
      throw new Error(`refusing to write golden with Microsoft oracle calibration violations: ${oracleCalibration.violations
        .map(entry => `${entry.rule} ${(entry.share * 100).toFixed(2)}% > 25%`).join(', ')}`);
    }
    if (coverage.missing_expected_rules.length > 0) {
      throw new Error(`refusing to write golden with coverage misses: ${coverage.missing_expected_rules.join(', ')}`);
    }
    const oldInternal = existsSync(options.internalGolden) ? loadInternalGolden(options.internalGolden) : null;
    goldenWrite = {
      internal: snapshotChangeSummary(oldInternal, currentInternal, 'internal'),
      external: null,
    };
    writeGolden(options.internalGolden, currentInternal);
    internalGolden = currentInternal;
    if (!options.internalOnly && hasConfiguredExternal) {
      const persistedExternal = persistedExternalSnapshot(currentExternal);
      const oldExternal = existsSync(options.externalGolden) ? loadExternalGolden(options.externalGolden) : null;
      goldenWrite.external = snapshotChangeSummary(oldExternal, persistedExternal, 'external');
      writeGolden(options.externalGolden, persistedExternal);
      externalGolden = persistedExternal;
    }
    console.error(`golden snapshot diff: ${JSON.stringify(goldenWrite)}`);
  } else {
    internalGolden = loadInternalGolden(options.internalGolden);
    if (!options.internalOnly && existsSync(options.externalGolden)) {
      externalGolden = loadExternalGolden(options.externalGolden);
    } else if (!options.internalOnly && hasConfiguredExternal) {
      throw new Error(`external golden '${options.externalGolden}' does not exist; run --write-golden`);
    }
  }

  const internalComparison = compareInternalGolden(internalGolden, currentInternal);
  const externalComparison = externalGolden
    ? compareExternalGolden(externalGolden, currentExternal)
    : { discrepancies: [], reportedDifferences: [], inputChanged: [], stale: [] };
  const rawDiscrepancies = [...internalComparison.discrepancies, ...externalComparison.discrepancies];
  const identified = rawDiscrepancies.map((discrepancy, index) => ({
    id: `D${String(index + 1).padStart(3, '0')}`,
    ...discrepancy,
  }));
  const adjudicationMap = loadAdjudications(options.adjudications);
  const adjudicationResult = applyAdjudications(identified, adjudicationMap);
  const reportedDifferences = [
    ...internalComparison.reportedDifferences,
    ...externalComparison.reportedDifferences,
  ].map((difference, index) => ({ id: `R${String(index + 1).padStart(3, '0')}`, ...difference }));
  const gatePassed = goldenGatePassed(adjudicationResult, coverage, oracleCalibration);
  const report = {
    schema_version: 4,
    generated_at: new Date().toISOString(),
    scope: options.internalOnly ? 'internal-only' : 'internal plus configured external roots',
    manifest: options.manifest,
    comparison_fields: COMPARISON_FIELDS,
    reported_fields: REPORTED_FIELDS,
    summary_fields: SUMMARY_FIELDS,
    gate_passed: gatePassed,
    golden_write: goldenWrite,
    goldens: { internal: options.internalGolden, external: options.externalGolden },
    current_core: {
      path: CURRENT_CORE_CLI,
      tool: internalRun.tool ?? externalRun.tool,
      internal_exit_code: internalRun.exitCode,
      internal_chunks: internalRun.chunks,
      external_exit_code: externalFiles.length > 0 ? externalRun.exitCode : null,
      external_chunks: externalRun.chunks,
    },
    summary: {
      files: corpus.files.length,
      current_issues: [...internalRun.reports, ...externalRun.reports]
        .reduce((total, reportEntry) => total + reportEntry.issues.length, 0),
      discrepancies: adjudicationResult.discrepancies.length,
      intended: adjudicationResult.covered.length,
      uncovered_discrepancies: adjudicationResult.uncovered.length,
      unused_adjudications: adjudicationResult.unused.length,
      coverage_misses: coverage.missing_expected_rules.length,
      reported_differences: reportedDifferences.length,
      input_changed: externalComparison.inputChanged.length,
      stale: externalComparison.stale.length,
    },
    corpus: {
      roots: corpus.roots,
      skipped_roots: corpus.skipped,
      excluded_roots: corpus.excludedRoots,
      files: corpus.files,
    },
    coverage,
    oracle_calibration: oracleCalibration,
    discrepancies: adjudicationResult.discrepancies,
    reported_differences: reportedDifferences,
    input_changed: externalComparison.inputChanged,
    stale: externalComparison.stale,
    adjudications: {
      path: options.adjudications,
      entries: Object.keys(adjudicationMap).length,
      unused_identities: adjudicationResult.unused,
    },
  };
  const markdown = renderMarkdown(report);
  if (options.report) {
    mkdirSync(dirname(options.report), { recursive: true });
    writeFileSync(options.report, extname(options.report).toLowerCase() === '.json'
      ? `${JSON.stringify(report, null, 2)}\n`
      : markdown, 'utf8');
  }
  console.log(options.json ? JSON.stringify(report, null, 2) : markdown.trimEnd());
  process.exitCode = gatePassed ? 0 : 1;
}

if (IS_MAIN) {
  try {
    main();
  } catch (error) {
    console.error(`golden-snapshot-runner: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}
