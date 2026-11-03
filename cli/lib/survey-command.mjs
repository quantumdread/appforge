import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { IntakeError, resolveIntake as resolveIntakeDefault } from './intake.mjs';
import { prepareDatasourceSkeleton, writeDatasourceSkeleton } from './datasource-skeleton.mjs';
import {
  createAnalysisBaseline,
  resolveSurveyReportDirectory,
  SurveyOutputError,
  writeSurveyArtifacts,
} from './survey-output.mjs';

const VALUE_FLAGS = new Map([
  ['--app', 'app'],
  ['--profile', 'profile'],
  ['--datasources', 'datasources'],
  ['--baseline', 'baseline'],
  ['--suppressions', 'suppressions'],
  ['--previous', 'previous'],
  ['--report', 'report'],
  ['--emit-datasources-skeleton', 'emit_datasources_skeleton'],
]);
const BOOLEAN_FLAGS = new Map([
  ['--write-baseline', 'write_baseline'],
  ['--json', 'json'],
]);
const REQUIRED_CORE_FUNCTIONS = [
  'analyzeSurveyFiles',
  'normalizeSurveyDatasourceMap',
  'buildReport',
  'assertSurveyPreviousReport',
  'assertValidReport',
  'buildEnvelope',
  'serializeEnvelope',
  'assertValidEnvelope',
  'decodeCanonicalEnvelope',
  'validateEnvelope',
  'assertEmittableBaseline',
  'parseAnalysisBaseline',
  'assertEmittableReport',
  'validateAnalysisReport',
  'renderTechnical',
];

function failure(message, exitCode = 2) {
  return { ok: false, exit_code: exitCode, message };
}

export function parseSurveyArgs(argv) {
  const value = {
    target: null,
    app: null,
    profile: 'shared',
    datasources: null,
    baseline: null,
    write_baseline: false,
    suppressions: null,
    previous: null,
    report: null,
    json: false,
    emit_datasources_skeleton: null,
  };
  const seen = new Set();

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const valueField = VALUE_FLAGS.get(argument);
    if (valueField) {
      if (seen.has(argument)) return failure(`${argument} may only be specified once`);
      const flagValue = argv[index + 1];
      if (typeof flagValue !== 'string' || !flagValue || flagValue.startsWith('--')) {
        return failure(`${argument} requires a value`);
      }
      if (valueField === 'profile' && flagValue !== 'shared' && flagValue !== 'existing-export') {
        return failure('--profile must be shared or existing-export');
      }
      seen.add(argument);
      value[valueField] = flagValue;
      index += 1;
      continue;
    }
    const booleanField = BOOLEAN_FLAGS.get(argument);
    if (booleanField) {
      if (seen.has(argument)) return failure(`${argument} may only be specified once`);
      seen.add(argument);
      value[booleanField] = true;
      continue;
    }
    if (argument.startsWith('--')) return failure(`unknown survey option: ${argument}`);
    if (argument.length === 0) return failure('survey target must not be empty');
    if (value.target !== null) return failure('survey accepts exactly one target');
    value.target = argument;
  }

  if (value.target === null) return failure('survey requires exactly one target');
  return { ok: true, value };
}

function noAppSource(target) {
  return failure(
    `no app source found at ${target}; accepted forms: an unpacked .pa.yaml directory, a .msapp archive, or a solution zip`,
  );
}

function readJsonOption(pathValue, flag, dependencies) {
  if (pathValue === null) return { ok: true, value: undefined };
  const path = dependencies.resolvePath(dependencies.cwd, pathValue);
  try {
    return { ok: true, value: JSON.parse(dependencies.readText(path)) };
  } catch {
    return failure(`unable to load ${flag}: expected a readable JSON file`);
  }
}

function solutionConnections(intake, limitations) {
  if (intake.source_kind !== 'solution') {
    return { state: 'unavailable', rows: [] };
  }
  if (intake.connections.length > 0) {
    return { state: 'available', rows: intake.connections.map(row => ({ ...row })) };
  }
  const unavailable = limitations.some(row => row.source === 'customizations');
  return unavailable ? { state: 'unavailable', rows: [] } : { state: 'empty', rows: [] };
}

function classifyPreparationError(error) {
  if (error instanceof IntakeError) return error.code === 'usage' ? 2 : 3;
  const code = error && typeof error === 'object' ? error.code : undefined;
  if ([
    'invalid-baseline',
    'invalid-previous-report',
    'delta-comparison-refused',
  ].includes(code)) return 2;
  return 3;
}

function errorMessage(error, fallback) {
  return error instanceof Error && error.message.length > 0 ? error.message : fallback;
}

function hasRequiredCore(core) {
  return core
    && typeof core.ANALYZER_CORE_VERSION === 'string'
    && core.ANALYZER_CATALOG_ALLOWLIST
    && REQUIRED_CORE_FUNCTIONS.every(name => typeof core[name] === 'function');
}

export function prepareSurvey(argv, overrides = {}) {
  const parsed = parseSurveyArgs(argv);
  if (!parsed.ok) return parsed;
  const dependencies = {
    core: overrides.core,
    cwd: overrides.cwd ?? process.cwd(),
    resolvePath: overrides.resolvePath ?? resolve,
    readText: overrides.readText ?? (path => readFileSync(path, 'utf8')),
    resolveIntake: overrides.resolveIntake ?? resolveIntakeDefault,
    now: overrides.now ?? (() => new Date().toISOString()),
    newReportId: overrides.newReportId ?? randomUUID,
  };
  if (!hasRequiredCore(dependencies.core)) {
    return failure('survey infrastructure error: analyzer core artifact lacks survey entrypoints', 3);
  }

  const options = parsed.value;
  const target = dependencies.resolvePath(dependencies.cwd, options.target);
  const jsonOptions = [
    ['datasources', options.datasources, '--datasources'],
    ['baseline', options.baseline, '--baseline'],
    ['suppressions', options.suppressions, '--suppressions'],
    ['previous', options.previous, '--previous'],
  ].map(([name, path, flag]) => [name, readJsonOption(path, flag, dependencies)]);
  const failedJson = jsonOptions.find(([, result]) => !result.ok);
  if (failedJson) return failedJson[1];
  const loaded = Object.fromEntries(jsonOptions.map(([name, result]) => [name, result.value]));

  let explicitDatasources;
  try {
    explicitDatasources = loaded.datasources === undefined
      ? undefined
      : dependencies.core.normalizeSurveyDatasourceMap(loaded.datasources, 'datasources');
  } catch (error) {
    return failure(`unable to load --datasources: ${errorMessage(error, 'invalid datasource map')}`);
  }

  if (loaded.previous !== undefined) {
    try {
      dependencies.core.assertSurveyPreviousReport(loaded.previous);
    } catch (error) {
      return failure(`unable to load --previous: ${errorMessage(error, 'invalid previous report')}`);
    }
  }

  let intake;
  try {
    intake = dependencies.resolveIntake(target, {
      ...(options.app === null ? {} : { appName: options.app }),
    });
  } catch (error) {
    if (error instanceof IntakeError && error.reason === 'no-app-source') {
      return noAppSource(target);
    }
    return failure(
      `unable to resolve survey intake: ${errorMessage(error, 'intake failed')}`,
      classifyPreparationError(error),
    );
  }
  if (options.app !== null && intake.source_kind !== 'solution') {
    return failure('--app is valid only for solution intake');
  }

  let exportDatasources;
  let snapshot;
  try {
    exportDatasources = dependencies.core.normalizeSurveyDatasourceMap(
      intake.datasources,
      'intake export datasources',
    );
    const surveyedAt = dependencies.now();
    snapshot = dependencies.core.analyzeSurveyFiles(
      intake.files.map(file => ({ name: file.id, content: file.content })),
      {
        ...(explicitDatasources === undefined ? {} : { datasources: explicitDatasources }),
        exportDatasources,
        now: () => Date.parse(surveyedAt),
      },
    );
    if (snapshot.coverage.files.every(file => file.recognizedRoots === 0)) {
      return noAppSource(target);
    }

    const limitations = intake.source_kind === 'solution'
      ? intake.limitations.filter(row => row.source !== 'connections')
      : intake.limitations.map(row => ({ ...row }));
    const reportDraft = dependencies.core.buildReport(snapshot, {
      app_name: { ...intake.app_name },
      source_kind: intake.source_kind,
      fingerprint_basis: intake.fingerprint_basis,
      files: intake.files.map(file => ({ id: file.id, sha256: file.sha256 })),
      limitations,
      connections: solutionConnections(intake, limitations),
      ...(explicitDatasources === undefined ? {} : { explicit_datasources: explicitDatasources }),
      export_datasources: exportDatasources,
    }, {
      now: surveyedAt,
      report_id: dependencies.newReportId(),
      analyzer_version: dependencies.core.ANALYZER_CORE_VERSION,
      policy: { profile_id: options.profile },
      ...(loaded.baseline === undefined ? {} : { baseline: loaded.baseline }),
      ...(loaded.suppressions === undefined ? {} : { suppressions: loaded.suppressions }),
      ...(loaded.previous === undefined ? {} : { previous: loaded.previous }),
    });
    dependencies.core.assertValidReport(reportDraft);

    return {
      ok: true,
      exit_code: 0,
      target,
      report_value: options.report,
      emit_datasources_skeleton: options.emit_datasources_skeleton,
      input_json_paths: [options.datasources, options.baseline, options.suppressions, options.previous]
        .filter(value => value !== null)
        .map(value => dependencies.resolvePath(dependencies.cwd, value)),
      write_baseline: options.write_baseline,
      json: options.json,
      intake,
      snapshot,
      report_draft: reportDraft,
      previous: loaded.previous,
      catalog_allowlist: dependencies.core.ANALYZER_CATALOG_ALLOWLIST,
    };
  } catch (error) {
    return failure(
      `unable to prepare survey: ${errorMessage(error, 'analysis failed')}`,
      classifyPreparationError(error),
    );
  }
}

export function executeSurvey(argv, overrides = {}) {
  const prepared = prepareSurvey(argv, overrides);
  if (!prepared.ok) return prepared;
  const core = overrides.core;
  const cwd = overrides.cwd ?? process.cwd();
  const newEnvelopeId = overrides.newEnvelopeId ?? randomUUID;
  const resolveReportDirectory = overrides.resolveReportDirectory
    ?? resolveSurveyReportDirectory;
  const writeArtifacts = overrides.writeArtifacts ?? writeSurveyArtifacts;

  try {
    const reportDir = resolveReportDirectory({
      target: prepared.target,
      reportValue: prepared.report_value,
      cwd,
    });
    const skeleton = prepared.emit_datasources_skeleton === null
      ? null
      : prepareDatasourceSkeleton({
        value: prepared.emit_datasources_skeleton,
        cwd,
        references: prepared.snapshot.datasourceReferences,
        target: prepared.target,
        reportDir,
        inputJsonPaths: prepared.input_json_paths,
      }, overrides.skeletonOverrides);
    const envelopeId = newEnvelopeId();
    const envelopePath = join(reportDir, `envelope-${envelopeId}.json`);
    const report = structuredClone(prepared.report_draft);
    report.envelope = {
      id: envelopeId,
      path: envelopePath,
      submission: { state: 'not_requested' },
    };
    const envelope = core.buildEnvelope(prepared.snapshot, report, {
      id: envelopeId,
      ...(prepared.previous === undefined ? {} : { previous: prepared.previous }),
      catalog_allowlist: prepared.catalog_allowlist,
    });
    core.assertValidEnvelope(envelope, prepared.catalog_allowlist);
    core.assertValidReport(report);
    core.assertEmittableReport(report, { surface: 'cli', envelope });
    const baseline = prepared.write_baseline
      ? createAnalysisBaseline(report, report.identity.surveyed_at)
      : undefined;
    if (baseline !== undefined) core.assertEmittableBaseline(baseline);

    const output = writeArtifacts({
      target: prepared.target,
      reportDir,
      report,
      snapshot: prepared.snapshot,
      envelope,
      ...(baseline === undefined ? {} : { baseline }),
      catalogAllowlist: prepared.catalog_allowlist,
      core,
    }, overrides.outputOverrides);
    if (skeleton !== null) writeDatasourceSkeleton(skeleton, overrides.skeletonOverrides);
    const stdout = prepared.json
      ? output.reportBytes
      : `${output.markdownBytes}\nArtifacts: ${output.reportDir}\n`;
    return {
      ok: true,
      exit_code: 0,
      report,
      envelope,
      output,
      stdout,
    };
  } catch (error) {
    const exitCode = error instanceof SurveyOutputError ? error.exit_code : 3;
    return failure(
      `unable to emit survey artifacts: ${errorMessage(error, 'output failed')}`,
      exitCode,
    );
  }
}
