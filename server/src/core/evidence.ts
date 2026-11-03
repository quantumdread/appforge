/**
 * Structured, rule-declared evidence attached to an issue at emission time.
 *
 * The renovation survey groups root causes and derives confidence from these
 * facts. It exists so no consumer ever parses `detail` prose, and it is
 * deliberately a separate module from `lint.ts` so a consumer can import the
 * types without importing rule implementations (spec 2026-08-28-v25 §2).
 */
import type { DatasourceReference } from './datasource.js';

export type BoundSourceEvidence = {
  kind: 'bound-source';
  authoredName: string;
  backend: DatasourceReference['backend'] | undefined;
  resolvedBy: DatasourceReference['resolvedBy'];
  confidence: DatasourceReference['confidence'];
};

export type FormulaIdentityEvidence = {
  kind: 'formula-identity';
  /** Normalized formula identity — equal for findings that share a formula. */
  identity: string;
  occurrences: number;
};

export type ThresholdEvidence = {
  kind: 'threshold';
  appliedThreshold: number;
  observed: number;
};

export type ColorLiteralEvidence = {
  kind: 'color-literal';
  literal: string;
};

export type IssueEvidence =
  | BoundSourceEvidence
  | FormulaIdentityEvidence
  | ThresholdEvidence
  | ColorLiteralEvidence;

export const boundSourceEvidence = (ref: DatasourceReference): BoundSourceEvidence => ({
  kind: 'bound-source',
  authoredName: ref.authoredName,
  backend: ref.backend,
  resolvedBy: ref.resolvedBy,
  confidence: ref.confidence,
});

export const formulaIdentityEvidence = (identity: string, occurrences: number): FormulaIdentityEvidence =>
  ({ kind: 'formula-identity', identity, occurrences });

export const thresholdEvidence = (appliedThreshold: number, observed: number): ThresholdEvidence =>
  ({ kind: 'threshold', appliedThreshold, observed });

export const colorLiteralEvidence = (literal: string): ColorLiteralEvidence =>
  ({ kind: 'color-literal', literal });
