import { POWERFX_FUNCTION_NAMES } from './generated/powerfx.js';
import {
  AUGMENTATIONS,
  AUGMENTATION_SCHEMA_VERSION,
  CATALOG_VERSION,
  CONTROLS,
  CONTROL_PROPERTIES,
  DUMP_SOURCED,
  DUMP_SOURCED_CONTROL_METADATA,
  EVIDENCE_CLASSES,
  ENUMS,
  MODERNIZATION_MAP,
  MODERNIZATION_DEFERRED,
  PARENT_CONTEXT_PROPERTIES,
  SYNTHETIC_CONTROL_METADATA,
  VERSION_KNOWLEDGE,
} from './generated/catalog.js';
import type { AnalyzerCatalogData } from './core/catalog.js';
import { validateFiles as analyzeFiles } from './core/analyzer.js';
import { toLegacyCliReports } from './core/compatibility.js';
import type { LintContext } from './core/lint.js';

declare const __ANALYZER_CORE_VERSION__: string;

export const ANALYZER_CORE_VERSION = __ANALYZER_CORE_VERSION__;
export { compareChildOrder, childOrderSummary, ChildOrderInputError } from './core/child-order.js';
export { modernize, modernizeSummary, renderModernizeReport } from './core/modernize.js';
export { proposeNames, applyRenames, renameSummary, renderRenameReport, renderRenameProposals, RenameInputError } from './core/rename.js';
export {
  FINDING_FINGERPRINT_HEX_WIDTH,
  findingFingerprint,
  findingFingerprintIdentity,
} from './core/fingerprint.js';
export { tokenizeFormula } from './core/tokenizer.js';
export {
  hasAuthoritativeBackend,
  isInMemoryReference,
  resolveDatasourceFromExportMetadata,
  resolveDatasourceReference,
} from './core/datasource.js';
export type {
  DatasourceConfidence,
  DatasourceMap,
  DatasourceReference,
  DatasourceResolution,
  DatasourceType,
} from './core/datasource.js';
export type {
  FormulaCall,
  FormulaSpan,
  FormulaToken,
  FormulaTokenKind,
  FormulaTokenization,
  TopLevelStatement,
} from './core/tokenizer.js';
export { analyze } from './core/snapshot.js';
export type {
  AnalysisSnapshot,
  AnalyzeOptions,
  CatalogMetadata,
  SnapshotFile,
} from './core/snapshot.js';
export {
  ANALYZER_CATALOG_ALLOWLIST,
  SurveyDatasourceMapError,
  SurveyPreviousReportError,
  analyzeSurveyFiles,
  assertSurveyPreviousReport,
  normalizeSurveyDatasourceMap,
} from './lib/survey.js';
export {
  ReportBuildError,
  buildReport,
} from './core/survey/build-report.js';
export {
  EnvelopeBuildError,
  buildEnvelope,
  serializeEnvelope,
} from './core/survey/envelope.js';
export {
  assertValidEnvelope,
  decodeCanonicalEnvelope,
  validateEnvelope,
} from './core/survey/validate-envelope.js';
export {
  assertEmittableBaseline,
  parseAnalysisBaseline,
} from './core/survey/baseline-input.js';
export { assertEmittableReport } from './core/survey/emittable-report.js';
export {
  assertValidReport,
  validateAnalysisReport,
} from './core/survey/validate-report.js';
export { renderTechnical } from './core/survey/render-technical.js';

const CATALOG_DATA: AnalyzerCatalogData = {
  augmentationSchemaVersion: AUGMENTATION_SCHEMA_VERSION,
  catalogVersion: CATALOG_VERSION,
  extractedAt: CATALOG_VERSION,
  versionKnowledge: VERSION_KNOWLEDGE,
  modernization: MODERNIZATION_MAP,
  modernizationDeferred: MODERNIZATION_DEFERRED,
  evidenceClasses: EVIDENCE_CLASSES,
  controls: CONTROLS,
  controlProperties: CONTROL_PROPERTIES,
  augmentations: AUGMENTATIONS,
  dumpSourcedControls: DUMP_SOURCED_CONTROL_METADATA,
  syntheticControls: SYNTHETIC_CONTROL_METADATA,
  parentContextProperties: PARENT_CONTEXT_PROPERTIES,
  dumpSourced: DUMP_SOURCED,
  enums: ENUMS,
  functionNames: POWERFX_FUNCTION_NAMES,
};

export function validateCliFiles(
  files: Array<{ name: string; content: string }>,
  lintContext: LintContext = {},
) {
  return toLegacyCliReports(analyzeFiles(files, CATALOG_DATA, {
    lintContext,
    lintProfile: 'cli',
    detectDuplicateControlNames: false,
  }));
}

/** Compatibility exports for programmatic users of the old local module. */
export {
  APP_TYPE,
  COMPONENT_DEFINITION_TYPE,
  buildAppBundle,
  controlNodes,
  fileDerivedScreenName,
  walkPaYaml,
} from './core/analyzer.js';
export {
  CLASSIC_FOCUSABLE_VIA_TABINDEX,
  CONTROL_BUDGET_WARN,
  DATASOURCE_TYPES,
  DUPLICATE_FORMULA_MIN,
  ICONIC_CONTROLS,
  INPUT_CONTROLS,
  KNOWN_VARIABLE_PREFIXES,
  REPEATED_COLOR_MIN,
  blankInertSpans,
  extractBoundSource,
  hasAccessibleLabel,
  nonTrivialOnSelect,
} from './core/lint.js';

export function loadCatalog(): AnalyzerCatalogData {
  return CATALOG_DATA;
}

export function validateYaml(text: string, _catalog = CATALOG_DATA, lintContext: LintContext = {}) {
  const [report] = validateCliFiles([{ name: '(input)', content: text }], lintContext);
  return { issues: report.issues, summary: report.summary };
}
