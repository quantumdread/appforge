/** Worker compatibility shim over the dependency-free analyzer core. */
export * from '../core/lint.js';

import {
  bindLintRules,
  runLintRules as runCoreLintRules,
  type LintContext,
  type LintRule,
} from '../core/lint.js';
import type { AppBundle } from '../core/analyzer.js';
import { ANALYZER_CATALOG_DATA } from './catalog-data.js';

/** Mutable for the existing adapter tests that inject a probe rule. */
export const LINT_RULES: LintRule[] = bindLintRules(ANALYZER_CATALOG_DATA, 'worker');

export function runLintRules(bundle: AppBundle, context?: LintContext) {
  return runCoreLintRules(bundle, ANALYZER_CATALOG_DATA, context, LINT_RULES);
}
