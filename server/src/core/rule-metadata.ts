/**
 * The single declaration of rule identity for consumers outside the rule
 * implementations. `lint.ts` asserts coverage against it; the renovation survey
 * imports it INSTEAD of importing rules, which is what makes the survey's seam
 * enforceable (spec 2026-08-28-v25 §2).
 *
 * Severity is the base class only. The survey downgrades to UNCERTAINTY at
 * report time when a finding's evidence is convention-guessed or partial
 * (`uncertaintyDowngrade`), per spec §5 — never here.
 */

export type SeverityClass =
  | 'BLOCK' | 'CORRECTNESS_RISK' | 'PERFORMANCE_RISK' | 'MAINTAINABILITY' | 'UNCERTAINTY';

/** Declared root-cause grouping key (spec §6). `none` groups alone — no heuristics. */
export type GroupingKey = 'none' | 'bound-source' | 'formula-identity' | 'color-literal' | 'file';

export type RemedyKind = 'deterministic' | 'human-value' | 'prose' | 'none';

export type RuleMetadata = {
  id: string;
  family: string;
  baseSeverity: SeverityClass;
  /** True when the finding's truth depends on datasource provenance or parse confidence. */
  uncertaintyDowngrade: boolean;
  groupingKey: GroupingKey;
  /** Declared remediation shape; descriptor availability is derived separately. */
  remedyKind: RemedyKind;
  /** Key into the v2.5.1 client-copy catalog. Equal to the id by construction. */
  clientCopyKey: string;
};

type Row = [
  family: string,
  severity: SeverityClass,
  downgrade: boolean,
  grouping: GroupingKey,
  remedy: RemedyKind,
];

/** Rule ids emitted by the analyzer itself (not by a LintRule). */
export const ANALYZER_RULE_IDS = [
  'unknown-control', 'unknown-variant', 'unknown-property', 'pa2108-trap', 'duplicate-control-name',
  'custom-property-kind', 'custom-property-datatype', 'event-return-type-required',
  'event-default-recommended', 'output-property-default', 'input-property-empty-default', 'component-name-required',
  'component-root-property', 'component-custom-property', 'materialized-property-kind',
  'partial-catalog-data', 'unverified-augmentation', 'variant-unspecified-property',
] as const;

const ROWS: Record<string, Row> = {
  'yaml-comment-truncates-formula': ['syntax', 'BLOCK', false, 'none', 'prose'],
  'yaml-inline-comment-after-formula': ['syntax', 'CORRECTNESS_RISK', false, 'none', 'prose'],
  'component-input-called-as-function': ['component', 'BLOCK', false, 'none', 'prose'],
  'addcolumns-string-column-name': ['syntax', 'BLOCK', false, 'none', 'prose'],
  'sortbycolumns-on-added-column': ['formula', 'CORRECTNESS_RISK', false, 'none', 'prose'],
  'select-parent-in-gallery': ['behaviour', 'CORRECTNESS_RISK', false, 'none', 'prose'],
  'modern-text-height-below-size': ['layout', 'CORRECTNESS_RISK', false, 'none', 'prose'],
  'index-literal-position': ['formula', 'CORRECTNESS_RISK', false, 'none', 'prose'],
  'filter-constant-or-column': ['delegation', 'CORRECTNESS_RISK', false, 'none', 'prose'],
  // ── gate refusals ────────────────────────────────────────────────────────
  'formula-missing-equals':        ['syntax', 'BLOCK', false, 'none', 'prose'],
  'block-scalar-required':         ['syntax', 'BLOCK', false, 'none', 'prose'],
  'bare-color-name':               ['syntax', 'BLOCK', false, 'none', 'prose'],
  'enum-value-invalid':            ['catalog', 'BLOCK', false, 'none', 'none'],
  'duplicate-property':            ['syntax', 'BLOCK', false, 'none', 'none'],
  'unknown-control':               ['catalog', 'BLOCK', false, 'none', 'none'],
  'unknown-variant':               ['catalog', 'BLOCK', false, 'none', 'none'],
  // remedyKind 'deterministic' reflects the common case (a single did_you_mean
  // rename); when no near-miss exists there is no machine remedy — Plan 5's
  // builder must gate on nearMiss before emitting an edit for this rule.
  'unknown-property':              ['catalog', 'BLOCK', false, 'none', 'deterministic'],
  'pa2108-trap':                   ['catalog', 'BLOCK', false, 'none', 'prose'],
  'duplicate-control-name':        ['structure', 'BLOCK', false, 'none', 'none'],
  'custom-property-kind':          ['component', 'BLOCK', false, 'none', 'prose'],
  'event-return-type-required':    ['component', 'BLOCK', false, 'none', 'prose'],
  'output-property-default':       ['component', 'BLOCK', false, 'none', 'prose'],
  'input-property-empty-default': ['component', 'BLOCK', false, 'none', 'prose'],
  'component-name-required':       ['component', 'BLOCK', false, 'none', 'prose'],
  'unknown-output-reference': ['catalog', 'CORRECTNESS_RISK', false, 'none', 'prose'],
  'layoutmaxwidth-collapses-children': ['layout', 'CORRECTNESS_RISK', false, 'none', 'prose'],
  // ── correctness risk ────────────────────────────────────────────────────
  'delegation-firstn-on-source':          ['delegation', 'CORRECTNESS_RISK', true, 'bound-source', 'prose'],
  'delegation-forall-writes':             ['delegation', 'CORRECTNESS_RISK', true, 'bound-source', 'prose'],
  'delegation-forall-truncation':         ['delegation', 'CORRECTNESS_RISK', true, 'bound-source', 'prose'],
  'write-followed-by-unconditional-navigation': ['write-error', 'CORRECTNESS_RISK', false, 'none', 'prose'],
  'submitform-navigation-not-in-onsuccess': ['write-error', 'CORRECTNESS_RISK', false, 'none', 'prose'],
  'form-without-failure-path':            ['write-error', 'CORRECTNESS_RISK', false, 'none', 'prose'],
  'success-notification-not-gated':       ['write-error', 'CORRECTNESS_RISK', false, 'none', 'prose'],
  'navigate-to-unknown-screen':           ['navigation', 'CORRECTNESS_RISK', false, 'none', 'prose'],
  'delegation-search-caveat':             ['delegation', 'CORRECTNESS_RISK', true, 'bound-source', 'prose'],
  'delegation-sharepoint-search':         ['delegation', 'CORRECTNESS_RISK', true, 'bound-source', 'prose'],
  'delegation-sharepoint-in':             ['delegation', 'CORRECTNESS_RISK', true, 'bound-source', 'prose'],
  'delegation-sharepoint-isblank':        ['delegation', 'CORRECTNESS_RISK', true, 'bound-source', 'prose'],
  'delegation-sharepoint-text-functions': ['delegation', 'CORRECTNESS_RISK', true, 'bound-source', 'prose'],
  'delegation-sharepoint-id-operator':    ['delegation', 'CORRECTNESS_RISK', true, 'bound-source', 'prose'],
  'delegation-sql-isblank':               ['delegation', 'CORRECTNESS_RISK', true, 'bound-source', 'prose'],
  'delegation-excel-any':                 ['delegation', 'CORRECTNESS_RISK', true, 'bound-source', 'prose'],
  // 'human-value' is deliberate, per spec §7: "AccessibleLabel and TabIndex
  // descriptors are mode: 'needs-human-value' ... focus decisions are human
  // judgment" — the =0 in the fix prose is a suggestion, not a safe default
  // for every control. Adjudicated in the Plan 3 Task 4 review; do not
  // reclassify as deterministic without amending §7.
  'a11y-interactive-not-focusable':       ['accessibility', 'CORRECTNESS_RISK', false, 'none', 'human-value'],
  'a11y-icon-button-no-label':            ['accessibility', 'CORRECTNESS_RISK', false, 'none', 'human-value'],
  // ── performance risk ────────────────────────────────────────────────────
  'perf-lookup-in-gallery-template': ['performance', 'PERFORMANCE_RISK', true, 'bound-source', 'prose'],
  'perf-onstart-no-concurrent':      ['performance', 'PERFORMANCE_RISK', false, 'none', 'prose'],
  'perf-cross-screen-reference':     ['performance', 'PERFORMANCE_RISK', false, 'none', 'prose'],
  'perf-control-budget':             ['performance', 'PERFORMANCE_RISK', false, 'none', 'prose'],
  'heavy-onstart':                   ['performance', 'PERFORMANCE_RISK', false, 'none', 'prose'],
  // ── maintainability ─────────────────────────────────────────────────────
  'duplicate-formula':            ['centralization', 'MAINTAINABILITY', false, 'formula-identity', 'prose'],
  'duplicate-formula-in-gallery': ['centralization', 'MAINTAINABILITY', false, 'formula-identity', 'prose'],
  'repeated-color-literal':       ['centralization', 'MAINTAINABILITY', false, 'color-literal', 'prose'],
  'version-pin-in-control-type':  ['versioning', 'MAINTAINABILITY', false, 'file', 'deterministic'],
  'a11y-tabindex-positive':       ['accessibility', 'MAINTAINABILITY', false, 'none', 'human-value'],
  'a11y-inputs-missing-accessiblelabel': ['accessibility', 'MAINTAINABILITY', false, 'file', 'human-value'],
  'fillportions-with-fixed-size': ['layout', 'MAINTAINABILITY', false, 'none', 'prose'],
  'missing-layout-min':           ['layout', 'MAINTAINABILITY', false, 'none', 'prose'],
  'missing-align-in-container':   ['layout', 'MAINTAINABILITY', false, 'none', 'prose'],
  'manual-group-may-stretch':     ['layout', 'MAINTAINABILITY', false, 'none', 'none'],
  'label-missing-wrap':           ['layout', 'MAINTAINABILITY', false, 'none', 'prose'],
  'scroll-child-fillportions':    ['layout', 'MAINTAINABILITY', false, 'none', 'prose'],
  'inline-formula-paste-hygiene': ['syntax', 'MAINTAINABILITY', false, 'none', 'prose'],
  'long-inline-formula':          ['style', 'MAINTAINABILITY', false, 'none', 'prose'],
  'app-onerror-missing':          ['error-reporting', 'MAINTAINABILITY', false, 'none', 'prose'],
  'unreachable-screen':           ['navigation', 'MAINTAINABILITY', false, 'none', 'prose'],
  'custom-property-datatype':     ['component', 'MAINTAINABILITY', false, 'none', 'prose'],
  'event-default-recommended':    ['component', 'MAINTAINABILITY', false, 'none', 'prose'],
  'component-root-property':      ['component', 'MAINTAINABILITY', false, 'none', 'none'],
  'component-custom-property':    ['component', 'MAINTAINABILITY', false, 'none', 'prose'],
  'materialized-property-kind':   ['component', 'MAINTAINABILITY', false, 'none', 'prose'],
  // ── uncertainty ─────────────────────────────────────────────────────────
  'partial-catalog-data':         ['catalog', 'UNCERTAINTY', false, 'none', 'none'],
  'variant-unspecified-property': ['catalog', 'UNCERTAINTY', false, 'none', 'human-value'],
  'unverified-augmentation':      ['catalog', 'UNCERTAINTY', false, 'none', 'prose'],
};

export const RULE_METADATA: Readonly<Record<string, RuleMetadata>> = Object.freeze(
  Object.fromEntries(Object.entries(ROWS).map(([
    id,
    [family, baseSeverity, uncertaintyDowngrade, groupingKey, remedyKind],
  ]) => [
    id,
    {
      id,
      family,
      baseSeverity,
      uncertaintyDowngrade,
      groupingKey,
      remedyKind,
      clientCopyKey: id,
    } satisfies RuleMetadata,
  ])),
);

export const ALL_RULE_IDS: readonly string[] = Object.keys(RULE_METADATA);

export function ruleMetadata(id: string): RuleMetadata | null {
  return Object.hasOwn(RULE_METADATA, id) ? RULE_METADATA[id] : null;
}
