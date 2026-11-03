import { DATASOURCE_TYPES, type DatasourceMap, type DatasourceType } from '../core/datasource.js';
import type { AnalyzerOptions } from '../core/analyzer.js';
import { RULE_METADATA } from '../core/rule-metadata.js';
import { analyze, type AnalysisSnapshot } from '../core/snapshot.js';
import type { AnalysisReportV1 } from '../core/survey/report-types.js';
import { assertValidReport } from '../core/survey/validate-report.js';
import {
  CONTROLS,
  CONTROL_PROPERTIES,
  DUMP_SOURCED,
  PARENT_CONTEXT_PROPERTIES,
  SYNTHETIC,
} from '../generated/catalog.js';
import { ANALYZER_CATALOG_DATA } from './catalog-data.js';

export class SurveyDatasourceMapError extends Error {
  readonly code = 'invalid-datasources';

  constructor(message: string) {
    super(message);
    this.name = 'SurveyDatasourceMapError';
  }
}

export class SurveyPreviousReportError extends Error {
  readonly code = 'invalid-previous-report';

  constructor(message: string) {
    super(message);
    this.name = 'SurveyPreviousReportError';
  }
}

const allowedDatasourceTypes = new Set<string>(DATASOURCE_TYPES);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function normalizeSurveyDatasourceMap(
  value: unknown,
  label = 'datasources',
): DatasourceMap {
  if (!isRecord(value)) {
    throw new SurveyDatasourceMapError(
      `${label} must be a JSON object mapping source names to backend types`,
    );
  }
  const normalized = Object.create(null) as DatasourceMap;
  for (const name of Object.keys(value)) {
    const backend = value[name];
    if (typeof backend !== 'string' || !allowedDatasourceTypes.has(backend)) {
      throw new SurveyDatasourceMapError(
        `${label} values must be one of the declared datasource backend types`,
      );
    }
    normalized[name] = backend as DatasourceType;
  }
  return normalized;
}

type GeneratedPropertyEntry = {
  input_properties?: Readonly<Record<string, string>>;
  variant_input_properties?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  parent_context?: readonly string[];
};

function extractorProperties(controlType: string): readonly string[] {
  const entry = (CONTROL_PROPERTIES as Readonly<Record<string, GeneratedPropertyEntry>>)[controlType];
  const properties = new Set(Object.keys(entry?.input_properties ?? {}));
  for (const variant of Object.values(entry?.variant_input_properties ?? {})) {
    Object.keys(variant).forEach(property => properties.add(property));
  }
  for (const bundle of entry?.parent_context ?? []) {
    const parentProperties = (
      PARENT_CONTEXT_PROPERTIES as Readonly<Record<string, Readonly<Record<string, string>>>>
    )[bundle];
    Object.keys(parentProperties ?? {}).forEach(property => properties.add(property));
  }
  return Object.freeze([...properties].sort());
}

const excludedControlTypes = new Set<string>([...DUMP_SOURCED, ...SYNTHETIC]);
const extractorControlTypes = CONTROLS
  .map(control => control.type)
  .filter(type => !excludedControlTypes.has(type))
  .sort();
const propertiesByControlType = Object.create(null) as Record<string, readonly string[]>;
for (const type of extractorControlTypes) propertiesByControlType[type] = extractorProperties(type);

export const ANALYZER_CATALOG_ALLOWLIST = Object.freeze({
  extractor_control_types: Object.freeze(extractorControlTypes),
  properties_by_control_type: Object.freeze(propertiesByControlType),
});

export type AnalyzeSurveyOptions = {
  datasources?: unknown;
  exportDatasources?: unknown;
  now?: () => number;
  outputBudget?: AnalyzerOptions['outputBudget'];
};

export function analyzeSurveyFiles(
  files: Array<{ name: string; content: string }>,
  options: AnalyzeSurveyOptions = {},
): AnalysisSnapshot {
  const datasources = options.datasources === undefined
    ? undefined
    : normalizeSurveyDatasourceMap(options.datasources, 'datasources');
  const exportDatasources = options.exportDatasources === undefined
    ? undefined
    : normalizeSurveyDatasourceMap(options.exportDatasources, 'export datasources');
  return analyze(files, ANALYZER_CATALOG_DATA, {
    lintProfile: 'worker',
    detectDuplicateControlNames: true,
    ...(options.outputBudget === undefined
      ? {}
      : { captureFileLines: false, outputBudget: options.outputBudget }),
    lintContext: {
      ...(datasources === undefined ? {} : { datasources }),
      ...(exportDatasources === undefined ? {} : { exportDatasources }),
    },
    ...(options.now === undefined ? {} : { now: options.now }),
  });
}

export function assertSurveyPreviousReport(
  value: unknown,
): asserts value is AnalysisReportV1 {
  try {
    assertValidReport(value);
  } catch {
    throw new SurveyPreviousReportError('previous report does not match analysis-report/1');
  }
  if (value.findings.some(finding => !Object.hasOwn(RULE_METADATA, finding.rule))) {
    throw new SurveyPreviousReportError('previous report contains an undeclared rule id');
  }
}
