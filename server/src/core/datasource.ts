/**
 * Provenance-bearing datasource resolution for the dependency-free core.
 *
 * A backend is semantic fact only when it came from explicit caller input or
 * (in a later release) export metadata. Naming conventions are deliberately
 * advisory: they may identify an in-memory-looking name, but they can never
 * unlock a SharePoint/SQL/Excel-specific rule.
 */
export const DATASOURCE_TYPES = [
  'dataverse',
  'sharepoint',
  'sql',
  'excel',
  'collection',
  'other',
] as const;
export type DatasourceType = typeof DATASOURCE_TYPES[number];
export type DatasourceMap = Record<string, DatasourceType>;

export const KNOWN_VARIABLE_PREFIXES = ['col', 'var', 'gbl', 'loc'] as const;
const KNOWN_VARIABLE_PREFIX = new RegExp(
  `^(?:${KNOWN_VARIABLE_PREFIXES.join('|')})(?:[A-Z0-9_]|$)`,
  'u',
);

export type DatasourceResolution =
  | 'explicit-input'
  | 'export-metadata'
  | 'naming-convention'
  | 'unresolved';
export type DatasourceConfidence = 'high' | 'medium' | 'low' | 'none';

export type DatasourceReference = {
  authoredName: string;
  backend?: DatasourceType;
  resolvedBy: DatasourceResolution;
  confidence: DatasourceConfidence;
};

const unresolvedReference = (authoredName: string): DatasourceReference => ({
  authoredName,
  resolvedBy: 'unresolved',
  confidence: 'none',
});

/** Resolve an exact authored binding from adapter-supplied export metadata. */
export function resolveDatasourceFromExportMetadata(
  authoredName: string,
  metadata?: Readonly<Record<string, DatasourceType>>,
): DatasourceReference {
  if (metadata && Object.hasOwn(metadata, authoredName)) {
    return {
      authoredName,
      backend: metadata[authoredName],
      resolvedBy: 'export-metadata',
      confidence: 'medium',
    };
  }
  return unresolvedReference(authoredName);
}

/** Resolve a source name in strict provenance order. */
export function resolveDatasourceReference(
  authoredName: string,
  options: {
    datasources?: DatasourceMap;
    exportMetadata?: Readonly<Record<string, DatasourceType>>;
  } = {},
): DatasourceReference {
  if (options.datasources && Object.hasOwn(options.datasources, authoredName)) {
    return {
      authoredName,
      backend: options.datasources[authoredName],
      resolvedBy: 'explicit-input',
      confidence: 'high',
    };
  }

  const exported = resolveDatasourceFromExportMetadata(authoredName, options.exportMetadata);
  if (exported.resolvedBy !== 'unresolved') return exported;

  if (KNOWN_VARIABLE_PREFIX.test(authoredName)) {
    return {
      authoredName,
      // `collection` is the existing analyzer's in-memory category. This is a
      // suggestion only; provenance-aware rule gates below keep it advisory.
      backend: 'collection',
      resolvedBy: 'naming-convention',
      confidence: 'low',
    };
  }
  return unresolvedReference(authoredName);
}

/** True only for provenance that may unlock a backend-specific rule. */
export function hasAuthoritativeBackend(
  reference: DatasourceReference,
  backend: DatasourceType,
): boolean {
  return reference.backend === backend
    && (reference.resolvedBy === 'explicit-input' || reference.resolvedBy === 'export-metadata');
}

/** Existing in-memory exclusion, now carrying explicit vs conventional provenance. */
export function isInMemoryReference(reference: DatasourceReference): boolean {
  return reference.backend === 'collection'
    && (reference.resolvedBy === 'explicit-input' || reference.resolvedBy === 'naming-convention');
}
