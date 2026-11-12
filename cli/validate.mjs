#!/usr/bin/env node
/**
 * AppForge local analyzer adapter.
 *
 * Analyzer semantics and the generated catalog live in the version-stamped
 * single-file artifact. This file owns only arguments, filesystem I/O, finding
 * baselines, presentation, and process exit codes.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { resolve, join, basename, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
const IS_MAIN = Boolean(process.argv[1]
  && fileURLToPath(import.meta.url) === resolve(process.argv[1]));

// Only the analyzer artifact loads eagerly: the legacy validation path is the
// vendorable surface and must not be coupled to the survey modules. The survey
// and submit-envelope libraries load lazily inside their own dispatch handlers
// so a missing lib/ never takes down plain validation.
let core;
try {
  core = await import('./dist/analyzer-core.mjs');
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  if (IS_MAIN) {
    console.error(`validator infrastructure error: unable to load analyzer core artifact: ${detail}`);
    process.exit(3);
  }
  throw error;
}

const {
  ANALYZER_CORE_VERSION,
  APP_TYPE,
  CLASSIC_FOCUSABLE_VIA_TABINDEX,
  COMPONENT_DEFINITION_TYPE,
  CONTROL_BUDGET_WARN,
  DATASOURCE_TYPES,
  DUPLICATE_FORMULA_MIN,
  FINDING_FINGERPRINT_HEX_WIDTH,
  ICONIC_CONTROLS,
  INPUT_CONTROLS,
  KNOWN_VARIABLE_PREFIXES,
  REPEATED_COLOR_MIN,
  blankInertSpans,
  controlNamesOf,
  extractBoundSource,
  findingFingerprint,
  findingFingerprintIdentity,
  hasAccessibleLabel,
  loadCatalog,
  nonTrivialOnSelect,
  validateCliFiles,
  validateYaml,
  walkPaYaml,
  ANALYZER_CATALOG_ALLOWLIST,
  analyzeSurveyFiles,
  assertEmittableBaseline,
  assertEmittableReport,
  assertSurveyPreviousReport,
  assertValidEnvelope,
  assertValidReport,
  buildEnvelope,
  buildReport,
  decodeCanonicalEnvelope,
  normalizeSurveyDatasourceMap,
  parseAnalysisBaseline,
  renderTechnical,
  serializeEnvelope,
  validateAnalysisReport,
  validateEnvelope,
} = core;

export {
  ANALYZER_CORE_VERSION,
  APP_TYPE,
  CLASSIC_FOCUSABLE_VIA_TABINDEX,
  COMPONENT_DEFINITION_TYPE,
  CONTROL_BUDGET_WARN,
  DATASOURCE_TYPES,
  DUPLICATE_FORMULA_MIN,
  FINDING_FINGERPRINT_HEX_WIDTH,
  ICONIC_CONTROLS,
  INPUT_CONTROLS,
  KNOWN_VARIABLE_PREFIXES,
  REPEATED_COLOR_MIN,
  blankInertSpans,
  extractBoundSource,
  findingFingerprint,
  findingFingerprintIdentity,
  hasAccessibleLabel,
  loadCatalog,
  nonTrivialOnSelect,
  validateCliFiles,
  validateYaml,
  walkPaYaml,
};

const TOOL = { name: 'analyzer-core', version: ANALYZER_CORE_VERSION };
const fingerprintPattern = new RegExp(`^[0-9a-f]{${FINDING_FINGERPRINT_HEX_WIDTH}}$`, 'u');

const allowedDatasourceTypes = new Set(DATASOURCE_TYPES);

function datasourceMapError(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return 'datasources must be a JSON object mapping source names to backend types.';
  }
  for (const [name, type] of Object.entries(value)) {
    if (typeof type !== 'string' || !allowedDatasourceTypes.has(type)) {
      return `Invalid datasources value for '${name}': '${String(type)}'. Allowed values: ${DATASOURCE_TYPES.join(', ')}.`;
    }
  }
  return null;
}

function normalizeDatasourceMap(value) {
  const normalized = Object.create(null);
  for (const [name, type] of Object.entries(value)) normalized[name] = type;
  return normalized;
}

function* yamlFilesIn(target, explicit = true) {
  const st = statSync(target);
  if (st.isFile()) {
    if (explicit || target.endsWith('.pa.yaml')) yield target;
  } else if (st.isDirectory()) {
    for (const file of readdirSync(target)) yield* yamlFilesIn(join(target, file), false);
  }
}

function fingerprintIssue(issue, file) {
  return findingFingerprint({
    rule: issue.rule ?? '',
    file,
    control: issue.control,
    type: issue.type,
    property: issue.property,
    controls: issue.controls,
  });
}

function baselineFinding(issue, file) {
  const rule = issue.rule ?? '';
  return {
    fingerprint: findingFingerprint({
      rule,
      file,
      control: issue.control,
      type: issue.type,
      property: issue.property,
      controls: issue.controls,
    }),
    rule,
    file,
  };
}

function loadBaselineFile(path) {
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.findings)) {
    throw new Error('baseline must be a JSON object with a findings array');
  }
  for (const [index, finding] of parsed.findings.entries()) {
    if (!finding || typeof finding !== 'object'
      || typeof finding.fingerprint !== 'string'
      || !fingerprintPattern.test(finding.fingerprint)
      || (finding.rule !== undefined && typeof finding.rule !== 'string')
      || (finding.file !== undefined && typeof finding.file !== 'string')
      || (finding.note !== undefined && typeof finding.note !== 'string')) {
      throw new Error(`baseline finding ${index + 1} must contain a ${FINDING_FINGERPRINT_HEX_WIDTH}-character lowercase hexadecimal fingerprint; rule, file, and note are optional strings`);
    }
  }
  return parsed.findings;
}

function writeBaselineFile(path, reports, fingerprintFiles) {
  const findings = reports.flatMap(report => report.issues
    .filter(issue => issue.level === 'WARN')
    .map(issue => baselineFinding(issue, fingerprintFiles.get(report.file))));
  writeFileSync(path, `${JSON.stringify({
    generated_at: new Date().toISOString(),
    tool_version: ANALYZER_CORE_VERSION,
    findings,
  }, null, 2)}\n`, 'utf8');
  return findings.length;
}

function applyBaseline(reports, baselineFindings, fingerprintFiles) {
  const baselineFingerprints = new Set(baselineFindings.map(finding => finding.fingerprint));
  const matched = new Set();
  let acceptedCount = 0;

  for (const report of reports) {
    const accepted = [];
    const issues = [];
    for (const issue of report.issues) {
      const fingerprint = fingerprintIssue(issue, fingerprintFiles.get(report.file));
      if (issue.level === 'WARN' && baselineFingerprints.has(fingerprint)) {
        accepted.push({ ...issue, fingerprint });
        matched.add(fingerprint);
      } else {
        issues.push(issue);
      }
    }
    report.issues = issues;
    report.accepted = accepted;
    report.summary.warn -= accepted.length;
    report.summary.accepted = accepted.length;
    acceptedCount += accepted.length;
  }

  return {
    acceptedCount,
    staleBaselineEntries: baselineFindings.filter(finding => !matched.has(finding.fingerprint)),
  };
}

function renderText({ issues, accepted = [], summary }, file, baselineOutput = false) {
  const out = [`\n── ${file} ──`];
  const sections = [
    { level: 'REFUSE', label: 'REFUSE', marker: '✗', source: issues },
    { level: 'WARN', label: 'WARN', marker: '!', source: issues },
  ];
  if (baselineOutput) sections.push({ level: 'WARN', label: 'ACCEPTED', marker: '✓', source: accepted });
  for (const { level, label, marker, source } of sections) {
    const filtered = source.filter(issue => issue.level === level);
    if (!filtered.length) continue;
    out.push(`\n${marker} ${label} (${filtered.length})`);
    for (const issue of filtered) {
      const where = `${file}:${issue.line}`;
      const subject = issue.property
        ? `${issue.type}.${issue.property}`
        : issue.variant ? `${issue.type}@${issue.variant}` : issue.type;
      out.push(`  ${where}  ${issue.control}  ${subject}  → ${issue.detail}`);
    }
  }
  const acceptedText = baselineOutput ? `  accepted=${summary.accepted ?? 0}` : '';
  out.push(`\n  pass=${summary.pass}  warn=${summary.warn}${acceptedText}  refuse=${summary.refuse}  controls=${summary.controls_seen}`);
  return out.join('\n');
}

function optionValue(arg, name, index) {
  const equalsPrefix = `${name}=`;
  const value = arg.startsWith(equalsPrefix) ? arg.slice(equalsPrefix.length) : process.argv[index + 1];
  if (!value || value.startsWith('--')) {
    console.error(`${name} requires a JSON file path.`);
    process.exit(2);
  }
  return { value, consumedNext: arg === name };
}

function main() {
  let json = false;
  let showVersion = false;
  let datasourcesValue = null;
  let baselineValue = null;
  let writeBaselineValue = null;
  let beforeValue = null;
  const targets = [];

  for (let index = 2; index < process.argv.length; index++) {
    const arg = process.argv[index];
    if (arg === '--json') { json = true; continue; }
    if (arg === '--version') { showVersion = true; continue; }
    if (arg === '--datasources' || arg.startsWith('--datasources=')) {
      const parsed = optionValue(arg, '--datasources', index);
      if (datasourcesValue !== null) {
        console.error('--datasources may only be specified once.');
        process.exit(2);
      }
      datasourcesValue = parsed.value;
      if (parsed.consumedNext) index++;
      continue;
    }
    if (arg === '--baseline' || arg.startsWith('--baseline=')) {
      const parsed = optionValue(arg, '--baseline', index);
      if (baselineValue !== null) {
        console.error('--baseline may only be specified once.');
        process.exit(2);
      }
      baselineValue = parsed.value;
      if (parsed.consumedNext) index++;
      continue;
    }
    if (arg === '--write-baseline' || arg.startsWith('--write-baseline=')) {
      const parsed = optionValue(arg, '--write-baseline', index);
      if (writeBaselineValue !== null) {
        console.error('--write-baseline may only be specified once.');
        process.exit(2);
      }
      writeBaselineValue = parsed.value;
      if (parsed.consumedNext) index++;
      continue;
    }
    if (arg === '--before' || arg.startsWith('--before=')) {
      const equalsPrefix = '--before=';
      const value = arg.startsWith(equalsPrefix) ? arg.slice(equalsPrefix.length) : process.argv[index + 1];
      if (!value || value.startsWith('--')) {
        console.error('--before requires a folder or file path.');
        process.exit(2);
      }
      if (beforeValue !== null) {
        console.error('--before may only be specified once.');
        process.exit(2);
      }
      beforeValue = value;
      if (!arg.startsWith(equalsPrefix)) index++;
      continue;
    }
    if (arg.startsWith('--')) {
      console.error(`Unknown option: ${arg}`);
      process.exit(2);
    }
    targets.push(arg);
  }

  if (showVersion && targets.length === 0) {
    console.log(`AppForge analyzer core v${ANALYZER_CORE_VERSION}`);
    return;
  }
  if (!targets.length) {
    console.error('usage: validate.mjs <file-or-dir> [more-files...] [--json] [--datasources <json-file>] [--baseline <json-file> | --write-baseline <json-file>] [--before <folder>] [--version]');
    process.exit(2);
  }
  if (baselineValue !== null && writeBaselineValue !== null) {
    console.error('--baseline and --write-baseline cannot be used together.');
    process.exit(2);
  }

  const baselinePath = baselineValue === null ? null : resolve(baselineValue);
  const writeBaselinePath = writeBaselineValue === null ? null : resolve(writeBaselineValue);
  let datasources;
  if (datasourcesValue !== null) {
    try {
      const parsedDatasources = JSON.parse(readFileSync(resolve(datasourcesValue), 'utf8'));
      const mapError = datasourceMapError(parsedDatasources);
      if (mapError) throw new Error(mapError);
      datasources = normalizeDatasourceMap(parsedDatasources);
    } catch (error) {
      console.error(`Unable to load --datasources: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(2);
    }
  }

  let baselineFindings = null;
  if (baselinePath) {
    try {
      baselineFindings = loadBaselineFile(baselinePath);
    } catch (error) {
      console.error(`Unable to load --baseline: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(2);
    }
  }

  const fingerprintFiles = new Map();
  try {
    for (const targetValue of targets) {
      const target = resolve(targetValue);
      const targetStat = statSync(target);
      for (const file of yamlFilesIn(target)) {
        if (fingerprintFiles.has(file)) continue;
        const identity = targetStat.isFile() ? basename(file) : relative(target, file);
        fingerprintFiles.set(file, identity.replaceAll('\\', '/'));
      }
    }
  } catch (error) {
    console.error(`Unable to enumerate target: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  }

  const files = [...fingerprintFiles.keys()];
  if (writeBaselinePath && files.length === 0) {
    console.error('--write-baseline matched zero files; the baseline was not written.');
    process.exit(2);
  }

  let existingControls;
  if (beforeValue !== null) {
    try {
      const beforeFiles = [...yamlFilesIn(resolve(beforeValue))]
        .map(file => ({ name: file, content: readFileSync(file, 'utf8') }));
      if (!beforeFiles.length) throw new Error('no .pa.yaml files found');
      existingControls = controlNamesOf(beforeFiles);
    } catch (error) {
      console.error(`Unable to load --before: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(2);
    }
  }

  let allReports;
  try {
    allReports = validateCliFiles(
      files.map(file => ({ name: file, content: readFileSync(file, 'utf8') })),
      { datasources, ...(existingControls ? { existingControls } : {}) },
    );
  } catch (error) {
    console.error(`Unable to analyze target: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  }

  // evidence (survey-input metadata, spec 2026-08-28-v25 §2) is already
  // stripped upstream: toLegacyCliReports/toLegacyCliIssue in
  // src/core/compatibility.ts is the single choke point every legacy-report
  // path resolves through (validateCliFiles here, and validateYaml/
  // validateCliFiles re-exported below for programmatic callers), so
  // allReports never carries it.
  const totalRefuse = allReports.reduce((total, report) => total + report.summary.refuse, 0);
  if (writeBaselinePath) {
    try {
      const written = writeBaselineFile(writeBaselinePath, allReports, fingerprintFiles);
      if (totalRefuse > 0) {
        console.error(`Notice: wrote ${written} WARN finding(s) to the baseline; ${totalRefuse} REFUSE finding(s) were excluded and are never baselineable.`);
      }
    } catch (error) {
      console.error(`Unable to write --write-baseline: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(2);
    }
  }

  let acceptedCount = 0;
  let staleBaselineEntries = [];
  if (baselineFindings) {
    ({ acceptedCount, staleBaselineEntries } = applyBaseline(allReports, baselineFindings, fingerprintFiles));
  }
  const totalWarn = allReports.reduce((total, report) => total + report.summary.warn, 0);
  const baselineOutput = baselinePath !== null || writeBaselinePath !== null;

  if (json) {
    const output = baselinePath
      ? { tool: TOOL, reports: allReports, accepted_total: acceptedCount, stale_baseline_entries: staleBaselineEntries }
      : { tool: TOOL, reports: allReports };
    console.log(JSON.stringify(output, null, 2));
  } else {
    for (const report of allReports) console.log(renderText(report, report.file, baselineOutput));
    if (staleBaselineEntries.length) {
      console.log(`\n── stale baseline entries (${staleBaselineEntries.length}) ──`);
      for (const finding of staleBaselineEntries) {
        console.log(`  ${[finding.fingerprint, finding.rule, finding.file, finding.note].filter(Boolean).join('  ')}`);
      }
    }
    const acceptedText = baselineOutput ? ` accepted=${acceptedCount}` : '';
    console.log(`\n══ analyzer-core v${ANALYZER_CORE_VERSION} totals: refuse=${totalRefuse} warn=${totalWarn}${acceptedText} files=${allReports.length} ══`);
  }

  process.exit(totalRefuse > 0 ? 1 : 0);
}

function runChildOrderComparison() {
  const args = process.argv.slice(3);
  const json = args.includes('--json');
  const dirs = args.filter(arg => arg !== '--json');
  if (dirs.length !== 2 || dirs.some(arg => arg.startsWith('--'))
    || args.filter(arg => arg === '--json').length > 1) {
    console.error('usage: validate.mjs compare-order <expected-dir> <actual-dir> [--json]');
    process.exit(2);
  }
  if (typeof core.compareChildOrder !== 'function' || typeof core.childOrderSummary !== 'function') {
    console.error('compare-order infrastructure error: analyzer core artifact is missing child-order exports; rebuild it.');
    process.exit(3);
  }
  try {
    const bundles = dirs.map(dir => {
      const target = resolve(dir);
      if (!statSync(target).isDirectory()) {
        console.error(`compare-order usage error: expected a directory: ${dir}`);
        process.exit(2);
      }
      return [...yamlFilesIn(target)].sort().map(file => ({
        name: relative(target, file).replaceAll('\\', '/'),
        content: readFileSync(file, 'utf8'),
      }));
    });
    const result = core.compareChildOrder(...bundles);
    const human_summary = core.childOrderSummary(result);
    if (json) console.log(JSON.stringify({ ...result, human_summary }, null, 2));
    else {
      console.log(human_summary);
      for (const container of result.containers.filter(entry => entry.status !== 'same')) {
        console.log(`${container.path}: ${container.status}${container.appended_at_end ? ' (appended at end)' : ''}`);
        console.log(`  expected: ${container.expected.join(', ')}`);
        console.log(`  actual:   ${container.actual.join(', ')}`);
        for (const move of container.moves) console.log(`  ${move.name}: expected ${move.expected_position}, actual ${move.actual_position}`);
      }
      for (const move of result.moved_between_containers) console.log(`${move.name}: ${move.expected_container} -> ${move.actual_container}`);
      for (const change of result.type_changed) console.log(`${change.name}: type ${change.expected_type} -> ${change.actual_type}`);
      if (result.editor_render_risk) {
        const { controls, advice } = result.editor_render_risk;
        console.log(`Editor render risk (${controls.length} controls): ${advice}`);
        console.log(`  rename set: ${controls.join(', ')}`);
      }
    }
    process.exit(result.identical ? 0 : 1);
  } catch (cause) {
    const inputError = typeof core.ChildOrderInputError === 'function' && cause instanceof core.ChildOrderInputError;
    console.error(`compare-order ${inputError ? 'input' : 'infrastructure'} error: ${cause instanceof Error ? cause.message : String(cause)}`);
    process.exit(inputError ? 2 : 3);
  }
}

function surveyCore() {
  return {
    ANALYZER_CORE_VERSION,
    ANALYZER_CATALOG_ALLOWLIST,
    analyzeSurveyFiles,
    assertEmittableBaseline,
    assertEmittableReport,
    assertSurveyPreviousReport,
    assertValidEnvelope,
    assertValidReport,
    buildEnvelope,
    buildReport,
    decodeCanonicalEnvelope,
    normalizeSurveyDatasourceMap,
    parseAnalysisBaseline,
    renderTechnical,
    serializeEnvelope,
    validateAnalysisReport,
    validateEnvelope,
  };
}

async function loadSurveyModule(specifier, exportName) {
  try {
    const module = await import(specifier);
    const value = module[exportName];
    if (typeof value !== 'function') {
      throw new TypeError(`${specifier} does not export ${exportName}`);
    }
    return value;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`survey infrastructure error: unable to load survey modules: ${detail}`);
    process.exit(3);
  }
}

async function runPreparedSurvey() {
  const executeSurvey = await loadSurveyModule('./lib/survey-command.mjs', 'executeSurvey');
  const result = executeSurvey(process.argv.slice(3), { core: surveyCore() });
  if (!result.ok) {
    console.error(result.message);
    process.exit(result.exit_code);
  }
  process.stdout.write(result.stdout);
  process.exit(0);
}

async function runEnvelopeSubmission() {
  const executeEnvelopeSubmission = await loadSurveyModule(
    './lib/submit-envelope.mjs',
    'executeEnvelopeSubmission',
  );
  const value = await executeEnvelopeSubmission(process.argv.slice(3), {
    core: surveyCore(),
  });
  if (value.stdout) process.stdout.write(value.stdout);
  if (value.stderr) process.stderr.write(value.stderr);
  process.exit(value.exit_code);
}

if (IS_MAIN) {
  if (process.argv[2] === 'rename') {
    try {
      const { runRename } = await import('./lib/rename-command.mjs');
      process.exitCode = runRename(process.argv.slice(3), core);
    } catch (error) {
      console.error(`rename infrastructure error: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 3;
    }
  } else if (process.argv[2] === 'modernize') {
    try {
      const { runModernize } = await import('./lib/modernize-command.mjs');
      process.exitCode = runModernize(process.argv.slice(3), core);
    } catch (error) {
      console.error(`modernize infrastructure error: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 3;
    }
  } else if (process.argv[2] === 'compare-order') runChildOrderComparison();
  else if (process.argv[2] === 'survey') await runPreparedSurvey();
  else if (process.argv[2] === 'submit-envelope') await runEnvelopeSubmission();
  else main();
}
