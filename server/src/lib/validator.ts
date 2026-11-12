/** Worker compatibility shim over the dependency-free analyzer core. */
export {
  APP_TYPE,
  buildAppBundle,
  controlNamesOf,
  COMPONENT_DEFINITION_TYPE,
  MAX_CONTROL_TREE_DEPTH,
  controlNodes,
  fileDerivedScreenName,
  walkPaYaml,
} from '../core/analyzer.js';
export type {
  AppBundle,
  AppScreen,
  AnalyzerOptions,
  ControlNode,
  FileSummary,
  Issue,
  IssueLevel,
  ParsedCustomProperty,
  ParsedProperty,
  ValidationResult,
} from '../core/analyzer.js';
export { analyze } from '../core/snapshot.js';
export type {
  AnalysisSnapshot,
  AnalyzeOptions,
  CatalogMetadata,
  SnapshotFile,
} from '../core/snapshot.js';

import {
  declaredPropType as declaredCorePropType,
  validateFiles as validateCoreFiles,
} from '../core/analyzer.js';
import type { LintContext } from '../core/lint.js';
import { ANALYZER_CATALOG_DATA } from './catalog-data.js';
import { LINT_RULES } from './lint.js';

export function declaredPropType(controlType: string, variant: string | null, prop: string): string | null {
  return declaredCorePropType(ANALYZER_CATALOG_DATA, controlType, variant, prop);
}

export function validateFiles(files: Array<{ name: string; content: string }>, lintContext?: LintContext) {
  return validateCoreFiles(files, ANALYZER_CATALOG_DATA, {
    lintContext,
    lintRules: LINT_RULES,
    detectDuplicateControlNames: true,
  });
}
