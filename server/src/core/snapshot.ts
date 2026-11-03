/**
 * The analyzer's canonical entry point (spec 2026-08-28-v25 §2).
 *
 * Composition only: no semantics live here. Every survey adapter calls this so
 * the gate section of a report is the gate's own output rather than a
 * recomputation. File hashing is deliberately absent — the adapter owns intake
 * metadata, which keeps the core free of crypto and of I/O.
 */
import {
  validateFiles,
  type AnalysisCoverage,
  type AnalyzerOptions,
  type ValidationResult,
} from './analyzer.js';
import type { AnalyzerCatalogData } from './catalog.js';
import type { AppBundle } from './model.js';
import type { DatasourceReference } from './datasource.js';
import { collectDatasourceReferences } from './source-references.js';
import { resolvedControlReferences } from './control-references.js';

export type SnapshotFile = { id: string; lines: readonly string[] };

export type CatalogMetadata = {
  catalogVersion: string;
  extractedAt: string;
  /** Whole days between extraction and `now`; the survey's staleness input. */
  stalenessDays: number;
  versionKnowledge: AnalyzerCatalogData['versionKnowledge'];
  modernization?: AnalyzerCatalogData['modernization'];
  modernizationDeferred?: AnalyzerCatalogData['modernizationDeferred'];
  classicTypes?: readonly string[];
  evidenceClasses: AnalyzerCatalogData['evidenceClasses'];
};

export type AnalysisSnapshot = {
  validation: ValidationResult;
  bundle: AppBundle;
  datasourceReferences: DatasourceReference[];
  controlReferences?: Array<{ sourceType: string; member: string }>;
  files: SnapshotFile[];
  coverage: AnalysisCoverage;
  catalogMetadata: CatalogMetadata;
};

export type AnalyzeOptions = AnalyzerOptions & {
  /** Injected clock so reports and goldens are deterministic in tests. */
  now?: () => number;
  /** Survey adapters only need file ids; CLI/default callers retain line capture. */
  captureFileLines?: boolean;
};

const MS_PER_DAY = 86_400_000;

export function analyze(
  files: Array<{ name: string; content: string }>,
  catalogData: AnalyzerCatalogData,
  options: AnalyzeOptions = {},
): AnalysisSnapshot {
  const validation = validateFiles(files, catalogData, options);
  const now = (options.now ?? Date.now)();
  const extracted = Date.parse(catalogData.extractedAt);

  return {
    validation,
    bundle: validation.bundle,
    datasourceReferences: collectDatasourceReferences(validation.bundle, {
      datasources: options.lintContext?.datasources,
      exportMetadata: options.lintContext?.exportDatasources,
    }),
    controlReferences: [...resolvedControlReferences(validation.bundle)].map(reference => ({
      sourceType: reference.target.type!, member: reference.member,
    })),
    files: files.map(file => ({
      id: file.name,
      lines: options.captureFileLines === false ? [] : file.content.split(/\r?\n/),
    })),
    coverage: validation.coverage,
    catalogMetadata: {
      catalogVersion: catalogData.catalogVersion,
      extractedAt: catalogData.extractedAt,
      stalenessDays: Math.max(0, Math.floor((now - extracted) / MS_PER_DAY)),
      versionKnowledge: catalogData.versionKnowledge,
      modernization: catalogData.modernization,
      modernizationDeferred: catalogData.modernizationDeferred,
      classicTypes: catalogData.controls.filter(control => control.family === 'Classic').map(control => control.type),
      evidenceClasses: catalogData.evidenceClasses,
    },
  };
}
